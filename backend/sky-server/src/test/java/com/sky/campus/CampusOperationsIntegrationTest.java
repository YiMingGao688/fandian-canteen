package com.sky.campus;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sky.aspect.AutoFillAspect;
import com.sky.campus.CampusModels.*;
import com.sky.campus.CampusOperationsModels.*;
import com.sky.context.BaseContext;
import com.sky.entity.OrderDetail;
import com.sky.exception.BaseException;
import com.sky.handler.GlobalExceptionHandler;
import com.sky.mapper.*;
import com.sky.result.PageResult;
import com.sky.service.AlipayGatewayService;
import com.sky.service.ShoppingCartService;
import org.apache.shiro.authc.AuthenticationException;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.mybatis.spring.SqlSessionFactoryBean;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.context.annotation.*;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.annotation.EnableTransactionManagement;

import javax.sql.DataSource;
import java.io.InputStream;
import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.*;
import java.util.concurrent.*;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** 四项运营能力的真实 SQL、事务和校园身份联调，仅允许 verify_catalog_backend.py 的临时库。 */
@EnabledIfSystemProperty(named="campus.test.config",matches=".+")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class CampusOperationsIntegrationTest {
    private AnnotationConfigApplicationContext context;
    private JdbcTemplate db;
    private CampusOperationsService operations;
    private CampusOrderQueryService queries;
    private CampusOrderService orders;
    private CampusCatalogService catalog;
    private CampusAuthService auth;
    private CampusRealm realm;
    private AlipayGatewayService gateway;
    private MockMvc mvc;
    private String passwordHash;
    private final ObjectMapper json=new ObjectMapper().findAndRegisterModules();
    private final LocalDate tomorrow=LocalDate.now(CampusCatalogService.ZONE).plusDays(1);

    @BeforeAll void open() throws Exception {
        context=new AnnotationConfigApplicationContext(Config.class);db=new JdbcTemplate(context.getBean(DataSource.class));
        operations=context.getBean(CampusOperationsService.class);queries=context.getBean(CampusOrderQueryService.class);orders=context.getBean(CampusOrderService.class);
        catalog=context.getBean(CampusCatalogService.class);auth=context.getBean(CampusAuthService.class);realm=context.getBean(CampusRealm.class);gateway=context.getBean(AlipayGatewayService.class);
        mvc=MockMvcBuilders.standaloneSetup(context.getBean(CampusOperationsController.class)).addInterceptors(new CampusAuthInterceptor(realm)).setControllerAdvice(new GlobalExceptionHandler()).build();
        passwordHash=CampusPassword.hash("Initial@2026");
    }
    @AfterAll void close(){if(context!=null)context.close();BaseContext.removeCurrentId();}
    @BeforeEach void seed(){
        clear();reset(gateway);
        db.update("insert into campus_window(id,canteen_name,name,location,description,capacity,opening_hours,enabled) values(101,'测试食堂','测试甲窗','东侧','测试',12,'07:00-09:00 / 11:00-13:20 / 17:00-19:20',1),(102,'测试食堂','测试乙窗','西侧','测试',12,'07:00-09:00 / 11:00-13:20 / 17:00-19:20',1)");
        String[] names={"admin_test","staff_test","admin_backup","screen_test","20269999","staff_other"};String[] roles={"ADMIN","STAFF","ADMIN","SCREEN","STUDENT","STAFF"};
        for(int i=0;i<names.length;i++){
            long id=i+1;db.update("insert into user(id,openid,name,create_time) values(?,?,?,now())",id,"campus:"+names[i],"测试人员"+id);
            Long bound=null;if(i==1)bound=101L;else if(i==5)bound=102L;
            db.update("insert into campus_account(user_id,username,password_hash,display_name,role,window_id,enabled) values(?,?,?,?,?,?,1)",id,names[i],passwordHash,"测试人员"+id,roles[i],bound);
        }
        db.update("insert into category(id,type,name,sort,status) values(11,1,'测试菜类',1,1)");
        db.update("insert into dish(id,name,category_id,price,image,status) values(301,'测试原菜',11,7.9,'/images/rice.jpg',1)");
        db.update("insert into campus_dish(dish_id,window_id,stock,calories,tags) values(301,101,20,500,'测试')");
        db.update("insert into campus_slot(id,window_id,service_date,start_time,end_time,capacity,reserved) values(201,101,?,'11:00','11:20',12,1),(202,102,?,'11:00','11:20',12,1)",tomorrow,tomorrow);
        as(1);
    }
    @AfterEach void finish(){clear();BaseContext.removeCurrentId();}

    /** 清理顺序遵守原外键；测试连接在 Config 中强制限制为独立临时库。 */
    private void clear(){for(String table:new String[]{"campus_review","campus_feedback","campus_favorite","campus_order","order_detail","orders","shopping_cart","dish_flavor","setmeal_dish","setmeal","campus_dish","dish","category","campus_slot","campus_account","user","campus_window"})db.update("delete from "+table);}
    private void as(long id){BaseContext.setCurrentId(id);}
    private AccountSave account(){AccountSave input=new AccountSave();input.setUsername("staff_new");input.setDisplayName("新建工作人员");input.setRole("STAFF");input.setWindowId(101L);input.setEnabled(1);input.setPassword("NewStaff@2026");return input;}
    private AccountSave existing(long id){Account item=context.getBean(CampusMapper.class).accountByUser(id);AccountSave input=new AccountSave();input.setUsername(item.getUsername());input.setDisplayName(item.getDisplayName());input.setRole(item.getRole());input.setWindowId(item.getWindowId());input.setEnabled(item.getEnabled());return input;}
    private WindowSave window(){WindowSave input=new WindowSave();input.setCanteenName("测试食堂");input.setName("新增测试窗");input.setLocation("南侧");input.setDescription("清淡口味");input.setCapacity(15);input.setOpeningHours("11:00-13:00 / 17:00-19:00");input.setEnabled(0);return input;}
    private OrderQuery query(){OrderQuery query=new OrderQuery();query.setState("all");return query;}
    private LoginResult login(String username,String password){LoginRequest request=new LoginRequest();request.setUsername(username);request.setPassword(password);return auth.login(request);}

    /** 写入真实原订单、校园关联和价格快照；测试中不调用演示业务库或支付平台。 */
    private void order(long id,int status,int method,long windowId){
        int paid=status==1?0:1;long slot=windowId==101?201:202;
        String digits=String.format("%08d",id);StringBuilder code=new StringBuilder();for(char c:digits.toCharArray())code.append("ABCDEFGHJK".charAt(c-'0'));
        db.update("insert into orders(id,number,status,user_id,address_book_id,order_time,pay_method,pay_status,amount) values(?,?,?,5,0,now(),?,?,15.8)",id,"HISTORY"+id,status,method,paid);
        db.update("insert into campus_order(order_id,user_id,window_id,slot_id,request_id,pickup_code,demo) values(?,5,?,?,?,?,0)",id,windowId,slot,"request-for-test-"+id,paid==1?code.toString():null);
        db.update("insert into order_detail(order_id,dish_id,name,number,amount,image) values(?,301,?,2,7.9,'/images/rice.jpg')",id,"旧菜单菜品"+id);
    }

    @Test void accountsArePagedAndNeverExposePasswords() throws Exception {
        AccountQuery query=new AccountQuery();query.setPageSize(2);PageResult result=operations.accounts(query);
        assertEquals(5,result.getTotal());assertEquals(2,result.getRecords().size());assertFalse(json.writeValueAsString(result).contains(passwordHash));assertFalse(json.writeValueAsString(result).contains("passwordHash"));
        query.setRole("STAFF");query.setKeyword("乙窗");assertEquals(1,operations.accounts(query).getTotal());
    }
    @Test void creatingStaffUsesBothTablesRealHashAndInitialState(){
        AccountSave input=account();input.setEnabled(0);Account created=operations.saveAccount(null,input);
        assertNotNull(created.getUserId());assertNull(created.getPasswordHash());assertEquals(0,db.queryForObject("select enabled from campus_account where user_id=?",Integer.class,created.getUserId()));
        String hash=db.queryForObject("select password_hash from campus_account where user_id=?",String.class,created.getUserId());assertTrue(CampusPassword.matches(input.getPassword(),hash));assertNotEquals(input.getPassword(),hash);
        assertThrows(BaseException.class,()->login(input.getUsername(),input.getPassword()));
        operations.accountStatus(created.getUserId(),1);assertNotNull(login(input.getUsername(),input.getPassword()).getToken());
    }
    @Test void duplicateDoesNotLeaveAnOrphanUser(){operations.saveAccount(null,account());int before=db.queryForObject("select count(*) from user",Integer.class);assertThrows(BaseException.class,()->operations.saveAccount(null,account()));assertEquals(before,db.queryForObject("select count(*) from user",Integer.class));}
    @Test void accountValidationAndStudentIdsAreProtected(){
        AccountSave input=account();input.setRole("STUDENT");assertThrows(BaseException.class,()->operations.saveAccount(null,input));input.setRole("STAFF");input.setWindowId(null);assertThrows(BaseException.class,()->operations.saveAccount(null,input));
        input.setWindowId(999L);assertThrows(BaseException.class,()->operations.saveAccount(null,input));input.setWindowId(101L);assertThrows(BaseException.class,()->operations.saveAccount(5L,input));
        AccountSave change=existing(2);change.setUsername("renamed_staff");assertThrows(BaseException.class,()->operations.saveAccount(2L,change));
    }
    @Test void currentAdministratorCannotDisableOrDemoteItself(){
        assertThrows(BaseException.class,()->operations.accountStatus(1L,0));AccountSave input=existing(1);input.setRole("SCREEN");assertThrows(BaseException.class,()->operations.saveAccount(1L,input));
        assertEquals("ADMIN",db.queryForObject("select role from campus_account where user_id=1",String.class));assertEquals(1,db.queryForObject("select enabled from campus_account where user_id=1",Integer.class));
    }
    @Test void statusOnlyChangeKeepsNewWindowAndDisplayName(){
        db.update("update campus_account set window_id=102,display_name='并发更新后' where user_id=2");operations.accountStatus(2L,0);
        Account latest=context.getBean(CampusMapper.class).accountByUser(2L);assertEquals(102L,latest.getWindowId());assertEquals("并发更新后",latest.getDisplayName());assertEquals(0,latest.getEnabled());
    }
    @Test void concurrentAdministratorsCannotDisableEveryAdministrator() throws Exception {
        ExecutorService pool=Executors.newFixedThreadPool(2);CountDownLatch start=new CountDownLatch(1);
        try{
            Future<Boolean> left=pool.submit(()->{as(1);try{start.await();operations.accountStatus(3L,0);return true;}catch(BaseException ex){return false;}finally{BaseContext.removeCurrentId();}});
            Future<Boolean> right=pool.submit(()->{as(3);try{start.await();operations.accountStatus(1L,0);return true;}catch(BaseException ex){return false;}finally{BaseContext.removeCurrentId();}});
            start.countDown();boolean a=left.get(10,TimeUnit.SECONDS),b=right.get(10,TimeUnit.SECONDS);assertNotEquals(a,b);
        }finally{pool.shutdownNow();}
        assertEquals(1,db.queryForObject("select count(*) from campus_account where role='ADMIN' and enabled=1",Integer.class));
    }
    @Test void passwordResetRevokesOldTokenAndNewPasswordWorks(){
        LoginResult before=login("staff_test","Initial@2026");assertNotNull(realm.getAuthenticationInfo(new CampusRealm.CampusToken(before.getToken())));
        PasswordReset reset=new PasswordReset();reset.setPassword("Changed@2026");operations.resetPassword(2L,reset);
        assertThrows(AuthenticationException.class,()->realm.getAuthenticationInfo(new CampusRealm.CampusToken(before.getToken())));assertThrows(BaseException.class,()->login("staff_test","Initial@2026"));
        assertNotNull(realm.getAuthenticationInfo(new CampusRealm.CampusToken(login("staff_test","Changed@2026").getToken())));
    }
    @Test void disabledAccountTokenImmediatelyFails(){
        String token=login("staff_test","Initial@2026").getToken();operations.accountStatus(2L,0);assertThrows(AuthenticationException.class,()->realm.getAuthenticationInfo(new CampusRealm.CampusToken(token)));
    }
    @Test void changedRoleOrWindowRevokesPreviousScopeToken(){
        String original=login("staff_test","Initial@2026").getToken();AccountSave change=existing(2);change.setWindowId(102L);operations.saveAccount(2L,change);
        assertThrows(AuthenticationException.class,()->realm.getAuthenticationInfo(new CampusRealm.CampusToken(original)));
        String rebound=login("staff_test","Initial@2026").getToken();Account principal=(Account)realm.getAuthenticationInfo(new CampusRealm.CampusToken(rebound)).getPrincipals().getPrimaryPrincipal();assertEquals(102L,principal.getWindowId());
        change.setRole("SCREEN");change.setWindowId(null);operations.saveAccount(2L,change);assertThrows(AuthenticationException.class,()->realm.getAuthenticationInfo(new CampusRealm.CampusToken(rebound)));
    }
    @Test void staffCannotManageAccountsOrOtherWindows(){
        as(2);assertThrows(BaseException.class,()->operations.accounts(new AccountQuery()));assertThrows(BaseException.class,()->operations.saveAccount(null,account()));assertThrows(BaseException.class,()->operations.accountStatus(6L,0));
        assertEquals(1,operations.windows().size());assertThrows(BaseException.class,()->operations.saveWindow(null,window()));assertThrows(BaseException.class,()->operations.saveWindow(102L,window()));assertThrows(BaseException.class,()->operations.windowStatus(102L,0));
    }
    @Test void newWindowKeyAndFieldsPersist(){
        Window created=operations.saveWindow(null,window());assertNotNull(created.getId());assertEquals(0,created.getEnabled());assertEquals(15,created.getCapacity());assertEquals(3,operations.windows().size());
        operations.windowStatus(created.getId(),1);assertEquals(1,context.getBean(CampusMapper.class).window(created.getId()).getEnabled());
    }
    @Test void hoursValidationRejectsOverlapsAndOvernight(){
        for(String hours:new String[]{"午餐","25:00-26:00","11:00-11:10","23:00-01:00","11:00-12:00 / 11:30-13:00"}){WindowSave input=window();input.setOpeningHours(hours);assertThrows(BaseException.class,()->operations.saveWindow(null,input));}
        WindowSave invalid=window();invalid.setCapacity(0);assertThrows(BaseException.class,()->operations.saveWindow(null,invalid));
        assertEquals(2,db.queryForObject("select count(*) from campus_window",Integer.class));
    }
    @Test void staffMayEditOwnWindowButCannotMoveItsCanteen(){
        as(2);WindowSave input=window();input.setName("工作人员修改后");assertEquals(input.getName(),operations.saveWindow(101L,input).getName());
        input.setCanteenName("其他食堂");assertThrows(BaseException.class,()->operations.saveWindow(101L,input));
    }
    @Test void configuredHoursControlPublishedSlotsAndStaleSlotsAreExcluded(){
        List<Slot> before=catalog.slots(101L,tomorrow);assertTrue(before.stream().anyMatch(slot->slot.getStartTime().equals("11:00")));
        WindowSave input=window();input.setOpeningHours("10:10-11:10");input.setEnabled(1);input.setCapacity(20);Window current=operations.saveWindow(101L,input);
        List<Slot> after=catalog.slots(101L,tomorrow);assertEquals(List.of("10:10","10:30","10:50"),after.stream().map(Slot::getStartTime).collect(Collectors.toList()));assertTrue(after.stream().allMatch(slot->slot.getCapacity()==20));
        Slot old=context.getBean(CampusMapper.class).lockSlot(201L);assertFalse(catalog.withinHours(current,old));assertNotNull(old);
    }
    @Test void capacityKeepsAlreadyPublishedSlots(){
        WindowSave input=window();input.setEnabled(1);input.setCapacity(30);operations.saveWindow(101L,input);
        assertEquals(12,db.queryForObject("select capacity from campus_slot where id=201",Integer.class));
        assertTrue(catalog.slots(101L,tomorrow).stream().anyMatch(slot->slot.getCapacity()==30));
    }
    @Test void pausedWindowRejectsNewSlotsButExistingOrderCanComplete(){
        order(501,2,1,101);operations.windowStatus(101L,0);assertThrows(BaseException.class,()->catalog.slots(101L,tomorrow));
        assertEquals(3,orders.advance(501L,false).getStatus());assertEquals(4,orders.advance(501L,true).getStatus());
        String code=db.queryForObject("select pickup_code from campus_order where order_id=501",String.class);assertEquals(5,orders.pickup(code).getStatus());
    }
    @Test void fullHistoryOlderThanHundredRowsIsSearchableAndPaged(){
        db.update("update campus_slot set capacity=200,reserved=137 where id=201");for(int i=0;i<137;i++)order(1000+i,5,1,101);
        PageResult first=queries.page(query());assertEquals(137,first.getTotal());assertEquals(6,first.getRecords().size());
        OrderQuery last=query();last.setPage(23);PageResult end=queries.page(last);assertEquals(5,end.getRecords().size());assertTrue(end.getRecords().stream().anyMatch(row->((OrderView)row).getId()==1000));
        OrderQuery old=query();old.setKeyword("旧菜单菜品1000");PageResult found=queries.page(old);assertEquals(1,found.getTotal());assertEquals(2,((OrderView)found.getRecords().get(0)).getItems().get(0).getNumber());
    }
    @Test void dateStatusAndWindowFiltersUseServerScope(){
        order(501,2,1,101);order(502,5,1,102);OrderQuery active=query();active.setState("active");assertEquals(1,queries.page(active).getTotal());
        OrderQuery future=query();future.setFromDate(tomorrow.plusDays(1).toString());assertEquals(0,queries.page(future).getTotal());
        as(2);assertEquals(1,queries.page(query()).getTotal());OrderQuery other=query();other.setWindowId(102L);assertThrows(BaseException.class,()->queries.page(other));
    }
    @Test void malformedAndWildcardQueriesAreBoundAndValidated(){
        order(501,2,1,101);OrderQuery wildcard=query();wildcard.setKeyword("%");assertEquals(0,queries.page(wildcard).getTotal());
        OrderQuery injection=query();injection.setKeyword("' or 1=1 --");assertEquals(0,queries.page(injection).getTotal());
        OrderQuery invalid=query();invalid.setFromDate("2026-02-30");assertThrows(BaseException.class,()->queries.page(invalid));
        OrderQuery reversed=query();reversed.setFromDate("2026-11-07");reversed.setToDate("2026-11-06");assertThrows(BaseException.class,()->queries.page(reversed));
        OrderQuery tooLarge=query();tooLarge.setPageSize(51);assertThrows(BaseException.class,()->queries.page(tooLarge));
    }
    @Test void demoCancellationRestoresStockAndSlotExactlyOnce(){
        order(501,3,1,101);OrderView cancelled=orders.terminate(501L,"cancel","设备维护");assertEquals(6,cancelled.getStatus());assertEquals(2,cancelled.getPayStatus());assertTrue(cancelled.getCancelReason().contains("设备维护"));
        orders.terminate(501L,"cancel","设备维护");assertEquals(22,db.queryForObject("select stock from campus_dish where dish_id=301",Integer.class));assertEquals(0,db.queryForObject("select reserved from campus_slot where id=201",Integer.class));verify(gateway,never()).refund(anyString(),any(),anyString());
    }
    @Test void unpaidCancellationDoesNotInventARefund(){order(501,1,1,101);assertEquals(0,orders.terminate(501L,"cancel","学生未到").getPayStatus());verify(gateway,never()).refund(anyString(),any(),anyString());}
    @Test void rejectionStoresReasonAndCallsSandboxRefundOnce(){
        order(501,2,2,101);assertEquals(6,orders.terminate(501L,"reject","食材售罄").getStatus());orders.terminate(501L,"reject","食材售罄");
        verify(gateway,times(1)).refund(eq("HISTORY501"),eq(new BigDecimal("15.80")),contains("食材售罄"));assertEquals("食材售罄",db.queryForObject("select rejection_reason from orders where id=501",String.class));
    }
    @Test void failedSandboxRefundKeepsOrderStockAndReservation(){
        order(501,2,2,101);doThrow(new BaseException("沙箱退款暂时不可用")).when(gateway).refund(anyString(),any(),anyString());assertThrows(BaseException.class,()->orders.terminate(501L,"cancel","食材不足"));
        assertEquals(2,db.queryForObject("select status from orders where id=501",Integer.class));assertEquals(20,db.queryForObject("select stock from campus_dish where dish_id=301",Integer.class));assertEquals(1,db.queryForObject("select reserved from campus_slot where id=201",Integer.class));
    }
    @Test void invalidReasonStateAndOutOfScopeCannotMutateOrder(){
        order(501,5,1,101);assertThrows(BaseException.class,()->orders.terminate(501L,"cancel","取餐后取消"));
        order(502,3,1,101);assertThrows(BaseException.class,()->orders.terminate(502L,"reject","已接单后拒绝"));assertThrows(BaseException.class,()->orders.terminate(502L,"cancel","  "));
        as(6);assertThrows(BaseException.class,()->orders.terminate(502L,"cancel","越权请求"));assertEquals(3,db.queryForObject("select status from orders where id=502",Integer.class));
    }
    @Test void concurrentCancellationCannotDoubleRefundOrRelease() throws Exception {
        order(501,2,2,101);ExecutorService pool=Executors.newFixedThreadPool(2);CountDownLatch start=new CountDownLatch(1);
        try{
            Callable<Integer> task=()->{as(1);try{start.await();return orders.terminate(501L,"cancel","窗口异常").getStatus();}finally{BaseContext.removeCurrentId();}};
            Future<Integer> left=pool.submit(task),right=pool.submit(task);start.countDown();assertEquals(6,left.get(10,TimeUnit.SECONDS));assertEquals(6,right.get(10,TimeUnit.SECONDS));
        }finally{pool.shutdownNow();}
        assertEquals(22,db.queryForObject("select stock from campus_dish where dish_id=301",Integer.class));assertEquals(0,db.queryForObject("select reserved from campus_slot where id=201",Integer.class));verify(gateway,times(1)).refund(anyString(),any(),anyString());
    }
    @Test void realCampusInterceptorRejectsStudentAndScreenOnOperations() throws Exception {
        for(String name:List.of("20269999","screen_test")){String token=login(name,"Initial@2026").getToken();mvc.perform(get("/campus/staff/accounts").header("Authorization","Bearer "+token)).andExpect(status().isForbidden());}
        String token=login("staff_test","Initial@2026").getToken();mvc.perform(get("/campus/staff/accounts").header("Authorization","Bearer "+token)).andExpect(jsonPath("$.code").value(0));
    }
    @Test void httpQueryAndStrictInputUseUnifiedResults() throws Exception {
        order(501,2,1,101);String token=login("admin_test","Initial@2026").getToken();
        mvc.perform(get("/campus/staff/orders/page").header("Authorization","Bearer "+token).param("state","all")).andExpect(jsonPath("$.code").value(1)).andExpect(jsonPath("$.data.total").value(1)).andExpect(jsonPath("$.data.records[0].items[0].name").value("旧菜单菜品501"));
        mvc.perform(get("/campus/staff/orders/page").header("Authorization","Bearer "+token).param("page","1.5")).andExpect(jsonPath("$.code").value(0));
        mvc.perform(put("/campus/staff/settings/windows/101/status").header("Authorization","Bearer "+token).contentType("application/json").content("{\"enabled\":0.5}")).andExpect(jsonPath("$.code").value(0));
        assertEquals(1,db.queryForObject("select enabled from campus_window where id=101",Integer.class));
    }

    @Test void reportAndExcelCoverAllHistoryAndZeroDays() throws Exception {
        for(int i=0;i<137;i++)order(1000+i,5,1,101);
        CampusReportService reports=context.getBean(CampusReportService.class);
        Map<String,Object> result=reports.report(tomorrow.toString(),tomorrow.plusDays(1).toString(),null);
        Map<String,Object> summary=(Map<String,Object>)result.get("summary");assertEquals(137L,summary.get("orders"));assertEquals(0,new BigDecimal("2164.60").compareTo((BigDecimal)summary.get("revenue")));
        assertEquals(2,((List<?>)result.get("daily")).size());
        java.io.ByteArrayOutputStream bytes=new java.io.ByteArrayOutputStream();reports.excel(tomorrow.toString(),tomorrow.toString(),null,bytes);
        try(org.apache.poi.xssf.usermodel.XSSFWorkbook book=new org.apache.poi.xssf.usermodel.XSSFWorkbook(new java.io.ByteArrayInputStream(bytes.toByteArray()))){assertEquals(138,book.getSheet("全部订单明细").getPhysicalNumberOfRows());assertEquals(3,book.getSheet("每日经营").getPhysicalNumberOfRows());}
    }
    @Test void reportRejectsExcessiveDatesAndOtherWindow(){
        CampusReportService reports=context.getBean(CampusReportService.class);
        assertThrows(BaseException.class,()->reports.report("2026-01-01","2028-01-01",null));as(2);
        assertThrows(BaseException.class,()->reports.report(tomorrow.toString(),tomorrow.toString(),102L));
    }
    @Test void batchStatusPreservesStockAndRejectsMixedScopeAtomically(){
        CampusMenuService menu=context.getBean(CampusMenuService.class);
        db.update("insert into dish(id,name,category_id,price,status) values(302,'其他窗口菜',11,10,1)");db.update("insert into campus_dish(dish_id,window_id,stock) values(302,102,40)");
        as(2);assertThrows(BaseException.class,()->menu.batchStatus(List.of(301L,302L),0));assertEquals(1,db.queryForObject("select status from dish where id=301",Integer.class));
        menu.batchStatus(List.of(301L),0);assertEquals(0,db.queryForObject("select status from dish where id=301",Integer.class));assertEquals(20,db.queryForObject("select stock from campus_dish where dish_id=301",Integer.class));
        assertThrows(BaseException.class,()->menu.batchStatus(List.of(301L,301L),1));
    }

    @Configuration @EnableTransactionManagement @EnableAspectJAutoProxy
    static class Config {
        static final String SECRET="local-test-only-jwt-secret-for-operations-2026";
        @Bean Properties settings() throws Exception{Properties settings=new Properties();try(InputStream input=Files.newInputStream(Path.of(System.getProperty("campus.test.config")))){settings.load(input);}if(!settings.getProperty("db.url","").matches("jdbc:mysql://127\\.0\\.0\\.1:13316/fandian_catalog_test_[a-z0-9_]+\\?.*"))throw new IllegalStateException("Refusing non-test database");return settings;}
        @Bean DataSource dataSource(Properties settings){return new DriverManagerDataSource(settings.getProperty("db.url"),settings.getProperty("db.username"),settings.getProperty("db.password"));}
        @Bean DataSourceTransactionManager transactions(DataSource source){return new DataSourceTransactionManager(source);}
        @Bean SqlSessionFactoryBean sqlSessionFactory(DataSource source)throws Exception{
            SqlSessionFactoryBean factory=new SqlSessionFactoryBean();factory.setDataSource(source);factory.setTypeAliasesPackage("com.sky.entity,com.sky.dto,com.sky.vo");org.apache.ibatis.session.Configuration config=new org.apache.ibatis.session.Configuration();config.setMapUnderscoreToCamelCase(true);factory.setConfiguration(config);
            PathMatchingResourcePatternResolver resolver=new PathMatchingResourcePatternResolver();factory.setMapperLocations(resolver.getResources("classpath:mapper/*.xml"));return factory;
        }
        @Bean SqlSessionTemplate session(SqlSessionFactoryBean factory)throws Exception{return new SqlSessionTemplate(factory.getObject());}
        @Bean CampusMapper mapper(SqlSessionTemplate session){return session.getMapper(CampusMapper.class);}
        @Bean CampusOperationsMapper operationsMapper(SqlSessionTemplate session){return session.getMapper(CampusOperationsMapper.class);}
        @Bean OrderMapper ordersMapper(SqlSessionTemplate session){return session.getMapper(OrderMapper.class);}
        @Bean OrderDetailMapper detailMapper(SqlSessionTemplate session){return session.getMapper(OrderDetailMapper.class);}
        @Bean AutoFillAspect audit(){return new AutoFillAspect();}
        @Bean CampusAuthService auth(CampusMapper mapper){return new CampusAuthService(mapper,SECRET);}
        @Bean CampusRealm realm(CampusMapper mapper){return new CampusRealm(mapper,SECRET);}
        @Bean RedisTemplate redisTemplate(){RedisTemplate redis=mock(RedisTemplate.class);when(redis.opsForValue()).thenReturn(mock(ValueOperations.class));return redis;}
        @Bean CampusCatalogService catalog(CampusMapper mapper,RedisTemplate redis,CampusAuthService auth){return new CampusCatalogService(mapper,redis,auth);}
        @Bean CampusOperationsService operations(CampusMapper mapper,CampusOperationsMapper operations,CampusAuthService auth,CampusCatalogService catalog){return new CampusOperationsService(mapper,operations,auth,catalog);}
        @Bean CampusOrderQueryService queries(CampusOperationsMapper mapper,CampusCatalogService catalog){return new CampusOrderQueryService(mapper,catalog);}
        @Bean AlipayGatewayService gateway(){return mock(AlipayGatewayService.class);}
        @Bean CampusOrderService orders(CampusMapper mapper,OrderMapper orders,OrderDetailMapper details,CampusAuthService auth,CampusCatalogService catalog,AlipayGatewayService gateway,RedisTemplate redis){return new CampusOrderService(mapper,orders,details,mock(ShoppingCartService.class),auth,catalog,gateway,redis,"demo");}
        @Bean DishMapper dishMapper(SqlSessionTemplate session){return session.getMapper(DishMapper.class);}
        @Bean CampusImageService images(Properties settings){return new CampusImageService(settings.getProperty("images.path"));}
        @Bean CampusMenuService menu(CampusMapper mapper,DishMapper dishes,CampusCatalogService catalog,CampusImageService images,CampusAuthService auth){return new CampusMenuService(mapper,dishes,catalog,images,auth);}
        @Bean CampusReportService reports(CampusOrderQueryService queries){return new CampusReportService(queries);}
        @Bean CampusOperationsController controller(CampusOperationsService operations,CampusOrderQueryService queries,CampusOrderService orders){return new CampusOperationsController(operations,queries,orders);}
    }
}
