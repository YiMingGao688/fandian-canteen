package com.sky.campus;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sky.aspect.AutoFillAspect;
import com.sky.campus.CampusModels.*;
import com.sky.context.BaseContext;
import com.sky.exception.BaseException;
import com.sky.handler.GlobalExceptionHandler;
import com.sky.mapper.CampusMapper;
import com.sky.mapper.DishMapper;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.mybatis.spring.SqlSessionFactoryBean;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.context.annotation.*;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.transaction.support.TransactionTemplate;

import javax.imageio.ImageIO;
import javax.sql.DataSource;
import java.awt.image.BufferedImage;
import java.io.*;
import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Properties;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.mockito.AdditionalAnswers.delegatesTo;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** 使用独立临时 MySQL 库验证真实 MyBatis SQL、事务、审计切面及控制器，不连接业务库。 */
@EnabledIfSystemProperty(named="campus.test.config", matches=".+")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class CampusMenuIntegrationTest {
    private AnnotationConfigApplicationContext context;
    private CampusMenuService menu;
    private CampusCatalogService catalog;
    private CampusImageService images;
    private CampusAuthService auth;
    private RedisTemplate redis;
    private JdbcTemplate db;
    private MockMvc mvc;
    private String image;
    private final ObjectMapper json = new ObjectMapper();

    @BeforeAll void open() throws Exception {
        context = new AnnotationConfigApplicationContext(Config.class);
        menu = context.getBean(CampusMenuService.class); catalog = context.getBean(CampusCatalogService.class);
        images = context.getBean(CampusImageService.class); auth = context.getBean(CampusAuthService.class);
        redis = context.getBean(RedisTemplate.class); db = new JdbcTemplate(context.getBean(DataSource.class));
        // Spring 7 的 standalone 默认转换器优先 Jackson 3，不识别 Jackson 2 注解注册的严格数值校验
        // （CampusNumberDeserializer）；显式注入与应用 WebMvcConfiguration 一致的 Jackson 2 转换器，
        // 保持“小数写入整数字段直接拒绝”的对外契约。findAndRegisterModules 对齐旧默认转换器的 jsr310 注册。
        org.springframework.http.converter.json.MappingJackson2HttpMessageConverter appJson =
                new org.springframework.http.converter.json.MappingJackson2HttpMessageConverter();
        appJson.setObjectMapper(json.findAndRegisterModules());
        mvc = MockMvcBuilders.standaloneSetup(context.getBean(CampusMenuController.class))
                // 保留默认转换器能力（图片 Resource、byte[]、String），仅把 Jackson 2 置于首位。
                .setMessageConverters(appJson,
                        new org.springframework.http.converter.ByteArrayHttpMessageConverter(),
                        new org.springframework.http.converter.StringHttpMessageConverter(java.nio.charset.StandardCharsets.UTF_8),
                        new org.springframework.http.converter.ResourceHttpMessageConverter())
                .setControllerAdvice(new GlobalExceptionHandler()).build();
        ByteArrayOutputStream bytes = new ByteArrayOutputStream(); ImageIO.write(new BufferedImage(40, 40, BufferedImage.TYPE_INT_RGB), "png", bytes);
        image = images.upload(new MockMultipartFile("file", "test.png", "image/png", bytes.toByteArray()));
    }

    @AfterAll void close() { if (context != null) context.close(); BaseContext.removeCurrentId(); }

    @BeforeEach void fixtures() {
        // runner 只创建空结构；测试只能在命名受限的临时库中执行这些清理语句。
        for (String table : new String[]{"shopping_cart","campus_favorite","order_detail","setmeal_dish","campus_dish","dish_flavor","dish","setmeal","category","campus_window"}) db.update("delete from " + table);
        db.update("insert into campus_window(id,canteen_name,name,location,description,capacity,opening_hours) values(101,'测试食堂','测试窗口甲','测试位置','测试',12,'午餐'),(102,'测试食堂','测试窗口乙','测试位置','测试',12,'午餐')");
        db.update("insert into category(id,type,name,sort,status) values(11,1,'测试主食',1,1),(12,1,'停用分类',2,0),(13,2,'测试套餐',3,1)");
        Config.failLink.set(false); clearInvocations(redis); role("ADMIN", null);
    }

    private void role(String role, Long window) {
        Account account = new Account(); account.setUserId(9001L); account.setRole(role); account.setWindowId(window); account.setEnabled(1);
        when(auth.current()).thenReturn(account); BaseContext.setCurrentId(9001L);
    }

    private DishSave request() {
        DishSave request = new DishSave(); request.setName("测试香菇鸡饭"); request.setWindowId(101L); request.setCategoryId(11L);
        request.setPrice(new BigDecimal("15.80")); request.setStock(32); request.setImage(image); request.setDescription("现做测试菜品"); request.setTags("少油,清淡");
        return request;
    }

    @Test void createThroughControllerIsVisibleToMenuAndAudited() throws Exception {
        String result = mvc.perform(post("/campus/staff/menu").contentType("application/json").content(json.writeValueAsBytes(request())))
                .andExpect(status().isOk()).andExpect(jsonPath("$.code").value(1)).andExpect(jsonPath("$.data.status").value(0))
                .andExpect(jsonPath("$.data.stock").value(32)).andReturn().getResponse().getContentAsString();
        long id = json.readTree(result).path("data").path("id").asLong(); assertTrue(id > 0);
        assertTrue(catalog.menu(null).stream().anyMatch(d -> d.getId() == id));
        assertEquals(9001L, db.queryForObject("select create_user from dish where id=?", Long.class, id));
        assertNotNull(db.queryForObject("select create_time from dish where id=?", java.sql.Timestamp.class, id));
        verify(redis).delete(CampusCatalogService.MENU_KEY);
    }

    @Test void staffScopeIsForcedAndCrossWindowDenied() {
        role("STAFF", 101L); DishSave own = request(); own.setWindowId(null);
        assertEquals(101L, menu.create(own).getWindowId());
        DishSave other = request(); other.setName("其他测试菜品"); other.setWindowId(102L);
        assertThrows(BaseException.class, () -> menu.create(other)); assertEquals(1, db.queryForObject("select count(*) from dish", Integer.class));
        assertEquals(1, menu.options().getWindows().size());
        assertTrue(menu.options().getCategories().stream().allMatch(c -> c.getStatus() == 1));
    }

    @Test void duplicateNameReturnsBusinessErrorWithoutOrphan() throws Exception {
        menu.create(request());
        mvc.perform(post("/campus/staff/menu").contentType("application/json").content(json.writeValueAsBytes(request())))
                .andExpect(jsonPath("$.code").value(0)).andExpect(jsonPath("$.msg").value(org.hamcrest.Matchers.containsString("已存在")));
        assertEquals(1, db.queryForObject("select count(*) from campus_dish", Integer.class));
    }

    @Test void invalidFieldsCannotWrite() {
        for (String value : new String[]{"0", "-1", "1000", "1.001"}) { DishSave invalid=request(); invalid.setPrice(new BigDecimal(value)); assertThrows(BaseException.class, () -> menu.create(invalid)); }
        for (Integer value : new Integer[]{null, -1, 10001}) { DishSave invalid=request(); invalid.setStock(value); assertThrows(BaseException.class, () -> menu.create(invalid)); }
        DishSave noImage=request(); noImage.setImage("https://example.com/fake.jpg"); assertThrows(BaseException.class, () -> menu.create(noImage));
        DishSave longName=request(); longName.setName("菜".repeat(33)); assertThrows(BaseException.class, () -> menu.create(longName));
        DishSave status=request(); status.setStatus(2); assertThrows(BaseException.class, () -> menu.create(status));
        assertEquals(0, db.queryForObject("select count(*) from dish", Integer.class));
    }

    @Test void fractionalIntegerFieldsAreRejectedBeforeWriting() throws Exception {
        for (String field : new String[]{"stock", "status", "calories", "windowId", "categoryId"}) {
            com.fasterxml.jackson.databind.node.ObjectNode input=json.valueToTree(request()); input.put(field,1.9);
            mvc.perform(post("/campus/staff/menu").contentType("application/json").content(json.writeValueAsBytes(input)))
                    .andExpect(jsonPath("$.code").value(0)).andExpect(jsonPath("$.msg").value(org.hamcrest.Matchers.containsString("整数")));
        }
        assertEquals(0, db.queryForObject("select count(*) from dish",Integer.class));
    }

    @Test void missingDisabledAndSetmealCategoryAreRejected() {
        for (long category : new long[]{12,13,999}) { DishSave invalid=request(); invalid.setCategoryId(category); assertThrows(BaseException.class, () -> menu.create(invalid)); }
        DishSave missing=request(); missing.setWindowId(999L); assertThrows(BaseException.class, () -> menu.create(missing));
    }

    @Test void extensionInsertFailureRollsBackOriginalDishAndCache() {
        Config.failLink.set(true);
        assertThrows(DataIntegrityViolationException.class, () -> menu.create(request()));
        assertEquals(0, db.queryForObject("select count(*) from dish", Integer.class));
        assertEquals(0, db.queryForObject("select count(*) from campus_dish", Integer.class)); verify(redis, never()).delete(anyString());
    }

    @Test void cacheInvalidationWaitsForCommit() {
        TransactionTemplate transaction = new TransactionTemplate(context.getBean(DataSourceTransactionManager.class));
        transaction.execute(status -> { menu.create(request()); verify(redis, never()).delete(anyString()); return null; });
        verify(redis).delete(CampusCatalogService.MENU_KEY);
    }

    @Test void editWithoutStockPreservesConcurrentDecrementAndAllowsOriginalImage() {
        DishView created=menu.create(request()); db.update("update campus_dish set stock=stock-3 where dish_id=?", created.getId());
        db.update("update dish set image='/images/noodles.jpg' where id=?", created.getId());
        DishSave change=request(); change.setName("改名后的测试菜品"); change.setStock(null); change.setImage("/images/noodles.jpg");
        DishView updated=menu.update(created.getId(), change);
        assertEquals(29, updated.getStock()); assertEquals(change.getName(), updated.getName());
        change.setStock(7); assertEquals(7, menu.update(created.getId(), change).getStock());
    }

    @Test void cannotMoveOrEditAnotherWindowDish() {
        DishView created=menu.create(request()); DishSave changed=request(); changed.setWindowId(102L);
        assertThrows(BaseException.class, () -> menu.update(created.getId(), changed));
        role("STAFF",102L); assertThrows(BaseException.class, () -> menu.update(created.getId(), request()));
        assertThrows(BaseException.class, () -> menu.delete(created.getId()));
    }

    @Test void statusOnlyUpdateKeepsLatestStockAndPrice() {
        DishView created=menu.create(request()); db.update("update campus_dish set stock=17 where dish_id=?",created.getId());
        DishChange change=new DishChange(); change.setId(created.getId()); change.setStatus(1); catalog.changeDish(change);
        DishView latest=context.getBean(CampusMapper.class).dish(created.getId()); assertEquals(17,latest.getStock()); assertEquals(0,new BigDecimal("15.80").compareTo(latest.getPrice()));
    }

    @Test void deleteProtectsOnSaleAndOrderReferences() {
        DishSave input=request(); input.setStatus(1); DishView created=menu.create(input);
        assertThrows(BaseException.class, () -> menu.delete(created.getId()));
        db.update("update dish set status=0 where id=?",created.getId()); db.update("insert into order_detail(name,dish_id,order_id,number,amount) values('测试',?,1,1,15.8)",created.getId());
        assertThrows(BaseException.class, () -> menu.delete(created.getId())); assertNotNull(context.getBean(CampusMapper.class).dish(created.getId()));
    }

    @Test void deleteUnreferencedDishRemovesAuxiliaryRows() {
        DishView created=menu.create(request());
        db.update("insert into campus_favorite(user_id,dish_id) values(9001,?)",created.getId());
        db.update("insert into shopping_cart(name,user_id,dish_id,number,amount) values('测试',9001,?,1,15.8)",created.getId());
        menu.delete(created.getId());
        assertNull(context.getBean(CampusMapper.class).dish(created.getId()));
        assertEquals(0,db.queryForObject("select count(*) from campus_favorite",Integer.class)); assertEquals(0,db.queryForObject("select count(*) from shopping_cart",Integer.class));
    }

    @Test void categoryLifecycleUsesRealKeysAndReferences() {
        MenuCategory category=new MenuCategory(); category.setName("新建测试分类"); category.setSort(5);
        MenuCategory created=menu.saveCategory(null,category); assertNotNull(created.getId());
        created.setName("更新测试分类"); created.setStatus(0); assertEquals(0,menu.saveCategory(created.getId(),created).getStatus());
        menu.deleteCategory(created.getId()); assertEquals(2,menu.options().getCategories().size());
        menu.create(request()); assertThrows(BaseException.class, () -> menu.deleteCategory(11L));
    }

    @Test void categoryPermissionsDuplicateAndSetmealProtection() {
        MenuCategory category=new MenuCategory(); category.setName("测试套餐");
        assertThrows(BaseException.class, () -> menu.saveCategory(null,category));
        assertThrows(BaseException.class, () -> menu.deleteCategory(13L));
        role("STAFF",101L); category.setName("窗口不许建共享分类");
        assertThrows(BaseException.class, () -> menu.saveCategory(null,category)); assertThrows(BaseException.class, () -> menu.deleteCategory(11L));
    }

    @Test void inactiveOriginalCategoryMayBeKeptButNotAssignedToNewDish() {
        DishView created=menu.create(request()); db.update("update category set status=0 where id=11");
        DishSave changed=request(); changed.setStock(null); assertNotNull(menu.update(created.getId(),changed));
        changed.setName("新的测试菜品"); changed.setStock(20); assertThrows(BaseException.class, () -> menu.create(changed));
    }

    @Test void uploadedImageIsPublicJpegAndTraversalIsUnavailable() throws Exception {
        mvc.perform(get(image)).andExpect(status().isOk()).andExpect(content().contentType("image/jpeg")).andExpect(header().string("X-Content-Type-Options","nosniff"));
        mvc.perform(get("/campus/public/dish-images/not-a-file.jpg")).andExpect(status().isNotFound());
        assertNull(images.resource("../../application.yml")); assertFalse(images.contains("/campus/public/dish-images/missing.jpg"));
    }

    @Configuration @EnableTransactionManagement @EnableAspectJAutoProxy
    static class Config {
        static final AtomicBoolean failLink = new AtomicBoolean();
        @Bean Properties settings() throws IOException {
            Properties settings=new Properties(); try (InputStream input=Files.newInputStream(Path.of(System.getProperty("campus.test.config")))) { settings.load(input); }
            if (!settings.getProperty("db.url","").matches("jdbc:mysql://127\\.0\\.0\\.1:133(16|17)/fandian_catalog_test_[a-z0-9_]+\\?.*")) throw new IllegalStateException("Refusing non-test database");
            return settings;
        }
        @Bean DataSource dataSource(Properties settings) { return new DriverManagerDataSource(settings.getProperty("db.url"),settings.getProperty("db.username"),settings.getProperty("db.password")); }
        @Bean DataSourceTransactionManager transactions(DataSource dataSource) { return new DataSourceTransactionManager(dataSource); }
        @Bean SqlSessionFactoryBean sqlSessionFactory(DataSource dataSource) throws IOException {
            SqlSessionFactoryBean factory=new SqlSessionFactoryBean(); factory.setDataSource(dataSource); factory.setTypeAliasesPackage("com.sky.entity,com.sky.dto,com.sky.vo");
            org.apache.ibatis.session.Configuration settings=new org.apache.ibatis.session.Configuration(); settings.setMapUnderscoreToCamelCase(true); factory.setConfiguration(settings);
            PathMatchingResourcePatternResolver resolver=new PathMatchingResourcePatternResolver();
            factory.setMapperLocations(resolver.getResource("classpath:mapper/CampusMapper.xml"),resolver.getResource("classpath:mapper/DishMapper.xml")); return factory;
        }
        @Bean SqlSessionTemplate sqlSession(SqlSessionFactoryBean factory) throws Exception { return new SqlSessionTemplate(factory.getObject()); }
        @Bean CampusMapper campusMapper(SqlSessionTemplate session) {
            CampusMapper original=session.getMapper(CampusMapper.class), wrapper=mock(CampusMapper.class,delegatesTo(original));
            doAnswer(call -> { if (failLink.get()) throw new DataIntegrityViolationException("test injected link failure"); original.insertCampusDish(call.getArgument(0),call.getArgument(1)); return null; }).when(wrapper).insertCampusDish(anyLong(),any());
            return wrapper;
        }
        @Bean DishMapper dishMapper(SqlSessionTemplate session) { return session.getMapper(DishMapper.class); }
        @Bean AutoFillAspect audit() { return new AutoFillAspect(); }
        @Bean CampusAuthService auth() { return mock(CampusAuthService.class); }
        @Bean RedisTemplate redisTemplate() { RedisTemplate redis=mock(RedisTemplate.class); when(redis.opsForValue()).thenReturn(mock(ValueOperations.class)); return redis; }
        @Bean CampusImageService images(Properties settings) { return new CampusImageService(settings.getProperty("images.path")); }
        @Bean CampusCatalogService catalog(CampusMapper mapper, RedisTemplate redis, CampusAuthService auth) { return new CampusCatalogService(mapper,redis,auth); }
        @Bean CampusMenuService menu(CampusMapper mapper,DishMapper dishes,CampusCatalogService catalog,CampusImageService images,CampusAuthService auth) { return new CampusMenuService(mapper,dishes,catalog,images,auth); }
        @Bean CampusMenuController controller(CampusMenuService menu,CampusImageService images) { return new CampusMenuController(menu,images); }
    }
}
