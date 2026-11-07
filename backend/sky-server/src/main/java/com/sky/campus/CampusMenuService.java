package com.sky.campus;

import com.sky.campus.CampusModels.*;
import com.sky.context.BaseContext;
import com.sky.entity.Dish;
import com.sky.exception.BaseException;
import com.sky.mapper.CampusMapper;
import com.sky.mapper.DishMapper;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Objects;
import java.util.stream.Collectors;

import static com.sky.campus.CampusCatalogService.require;
import static com.sky.campus.CampusCatalogService.text;

/** 菜品维护闭环：复用原 DishMapper 和数据库结构，补齐校园窗口权限及库存关联。 */
@Service
public class CampusMenuService {
    private final CampusMapper mapper;
    private final DishMapper dishes;
    private final CampusCatalogService catalog;
    private final CampusImageService images;
    private final CampusAuthService auth;

    public CampusMenuService(CampusMapper mapper, DishMapper dishes, CampusCatalogService catalog, CampusImageService images, CampusAuthService auth) {
        this.mapper = mapper; this.dishes = dishes; this.catalog = catalog; this.images = images; this.auth = auth;
    }

    /**
     * 读取编辑器选项；窗口账号只能看到绑定窗口及启用分类，管理员可维护全校分类。
     * @return 当前身份可用的窗口、菜品分类及分类引用数量
     * @throws BaseException 身份不具备窗口或管理员权限
     */
    public MenuOptions options() {
        Long scope = catalog.staffWindow();
        MenuOptions options = new MenuOptions();
        options.setWindows(mapper.windows().stream().filter(window -> scope == null || scope.equals(window.getId())).collect(Collectors.toList()));
        options.setCategories(mapper.menuCategories().stream().filter(category -> scope == null || Integer.valueOf(1).equals(category.getStatus())).collect(Collectors.toList()));
        return options;
    }

    /**
     * 按主键顺序锁定并批量上下架菜品，先校验全部归属，再在同一事务写入。
     * 任一菜品失效或越权时整体回滚；只修改状态，保留锁内最新价格和库存。
     * @param ids 一至五十个不重复菜品主键
     * @param status 0 下架，1 在售
     * @throws BaseException 数量、状态非法或任一菜品不属于当前窗口
     */
    @Transactional
    public void batchStatus(java.util.List<Long> ids,Integer status){
        require(ids!=null&&!ids.isEmpty()&&ids.size()<=50,"每次请选择 1 至 50 道菜品");
        require(ids.stream().allMatch(id->id!=null&&id>0)&&ids.stream().distinct().count()==ids.size(),"菜品主键无效或重复");
        require(status!=null&&(status==0||status==1),"请选择正确的上下架状态");
        java.util.List<Long> sorted=ids.stream().sorted().collect(Collectors.toList());
        sorted.forEach(this::ownedLocked);
        for(Long id:sorted){DishChange change=new DishChange();change.setId(id);change.setStatus(status);catalog.changeDish(change);}
    }

    /**
     * 新增菜品，验证窗口、分类、图片与字段，原菜品及校园库存关联在同一事务内落库。
     * 沿用原表全局唯一菜名，数据库唯一索引兜底并发重名；提交成功后才清理菜单缓存。
     * @param request 菜品完整资料，库存必填，未指定上架状态时默认下架
     * @return 新增菜品及数据库生成的主键，供管理列表立即定位
     * @throws BaseException 字段非法、窗口越权、分类停用、图片无效或菜名重复
     */
    @Transactional
    public DishView create(DishSave request) {
        validate(request, null);
        require(request.getStock() != null, "请填写初始可售库存");
        Dish dish = entity(request);
        try { dishes.insert(dish); }
        catch (DuplicateKeyException ex) { throw new BaseException("这个菜品名称已存在，请换一个名称"); }
        mapper.insertCampusDish(dish.getId(), request);
        catalog.invalidateMenu(request.getCategoryId());
        return mapper.dish(dish.getId());
    }

    /**
     * 编辑菜品全部展示信息，先锁定库存行并检查归属，窗口不可迁移，历史订单价格快照不变。
     * 未提交 stock 时保留最新库存；仅修改名称或图片不会把编辑器打开后已售出的份数补回。
     * @param id 当前权限内菜品主键
     * @param request 更新后的资料；库存为空表示不调整库存
     * @return 数据库更新后的菜品快照
     * @throws BaseException 菜品不存在、窗口越权、字段非法或名称重复
     */
    @Transactional
    public DishView update(Long id, DishSave request) {
        DishView previous = ownedLocked(id);
        validate(request, previous);
        Dish dish = entity(request); dish.setId(id);
        try { dishes.update(dish); }
        catch (DuplicateKeyException ex) { throw new BaseException("这个菜品名称已存在，请换一个名称"); }
        mapper.updateCampusDish(id, request);
        catalog.invalidateMenu(previous.getCategoryId(), request.getCategoryId());
        return mapper.dish(id);
    }

    /**
     * 删除未被订单或套餐引用的已下架菜品，同时清理购物车、收藏和原口味记录。
     * 订单已引用的菜品保留用于核销、取消归还库存及报表追溯，使用下架停止销售。
     * @param id 当前账号可维护的菜品主键
     * @throws BaseException 菜品越权、仍在售或被历史订单/套餐引用
     */
    @Transactional
    public void delete(Long id) {
        DishView dish = ownedLocked(id);
        require(Integer.valueOf(0).equals(dish.getStatus()), "请先下架菜品，再执行删除");
        require(mapper.dishReferences(id) == 0, "菜品已有订单或套餐引用，请保留下架记录");
        mapper.deleteDishCart(id); mapper.deleteDishFavorites(id); mapper.deleteDishFlavors(id);
        mapper.deleteCampusDish(id); dishes.deleteById(id);
        catalog.invalidateMenu(dish.getCategoryId());
    }

    /**
     * 新增或编辑全校共享的菜品分类；只有 ADMIN 可操作，不允许改变分类类型。
     * 停用分类只阻止新增及换入，不改变已经上架的菜品；原表唯一索引防止并发重名。
     * @param id 编辑的分类主键；新增时为空
     * @param request 名称、排序及启用状态，不接受前端提供的引用数量
     * @return 写入后的分类资料与引用数量
     * @throws BaseException 非管理员、分类不存在、重名或字段超限
     */
    @Transactional
    public MenuCategory saveCategory(Long id, MenuCategory request) {
        requireAdmin();
        require(request != null, "请填写分类信息");
        if (id != null) require(mapper.lockMenuCategory(id) != null, "菜品分类不存在");
        request.setId(id); request.setName(text(request.getName(), 32, "分类名称应为 1 至 32 字"));
        if (request.getSort() == null) request.setSort(0);
        if (request.getStatus() == null) request.setStatus(1);
        require(request.getSort() >= 0 && request.getSort() <= 999, "排序应为 0 至 999 的整数");
        require(request.getStatus() == 0 || request.getStatus() == 1, "请选择正确的分类状态");
        require(mapper.categoryNameExists(request.getName(), id) == 0, "这个分类名称已存在");
        try {
            if (id == null) mapper.insertMenuCategory(request, BaseContext.getCurrentId());
            else mapper.updateMenuCategory(request, BaseContext.getCurrentId());
        } catch (DuplicateKeyException ex) { throw new BaseException("这个分类名称已存在"); }
        catalog.invalidateMenu(request.getId());
        return mapper.menuCategories().stream().filter(category -> category.getId().equals(request.getId())).findFirst().orElse(request);
    }

    /**
     * 删除无菜品、套餐引用的菜品分类，锁定分类以与新增菜品串行执行。
     * @param id 需要移除的 type=1 分类主键
     * @throws BaseException 非管理员、分类不存在或分类仍被引用
     */
    @Transactional
    public void deleteCategory(Long id) {
        requireAdmin();
        require(id != null && mapper.lockMenuCategory(id) != null, "菜品分类不存在");
        require(mapper.categoryReferences(id) == 0, "分类下还有菜品或套餐，请先调整分类");
        mapper.deleteMenuCategory(id); catalog.invalidateMenu(id);
    }

    /** 校验共享分类管理权限；窗口人员不允许修改其他窗口同样使用的分类。 */
    private void requireAdmin() { require("ADMIN".equals(auth.current().getRole()), "只有全校管理员可以维护菜品分类"); }

    /** 锁定库存后查询真实菜品与归属，缓存中的旧状态不参与写入权限判断。 */
    private DishView ownedLocked(Long id) {
        require(id != null, "请选择菜品"); mapper.lockDish(id);
        DishView dish = mapper.dish(id);
        require(dish != null && catalog.managesWindow(dish.getWindowId()), "当前账号不能维护这个窗口的菜品");
        return dish;
    }

    /**
     * 按原表字段长度、唯一约束和校园库存规则校验完整资料；编辑原停用分类时允许保持不变。
     * 新增及换图必须引用上传成功的图片，编辑保留原图时兼容既有静态资源地址。
     */
    private void validate(DishSave request, DishView previous) {
        require(request != null, "请填写菜品信息");
        request.setName(text(request.getName(), 32, "菜品名称应为 1 至 32 字"));
        Long scope = catalog.staffWindow();
        if (scope != null) {
            require(request.getWindowId() == null || scope.equals(request.getWindowId()), "只能为自己的窗口维护菜品");
            request.setWindowId(scope);
        }
        require(request.getWindowId() != null && mapper.window(request.getWindowId()) != null, "请选择所属食堂窗口");
        if (previous != null) require(Objects.equals(previous.getWindowId(), request.getWindowId()), "编辑菜品不能更换所属窗口");
        MenuCategory category = request.getCategoryId() == null ? null : mapper.lockMenuCategory(request.getCategoryId());
        require(category != null, "请选择有效的菜品分类");
        require(Integer.valueOf(1).equals(category.getStatus()) || previous != null && Objects.equals(previous.getCategoryId(), category.getId()), "这个分类已停用，请选择启用中的分类");
        require(mapper.dishNameExists(request.getName(), previous == null ? null : previous.getId()) == 0, "这个菜品名称已存在，请换一个名称");
        require(request.getPrice() != null && request.getPrice().signum() > 0 && request.getPrice().compareTo(new java.math.BigDecimal("999")) <= 0 && request.getPrice().scale() <= 2, "价格应大于 0 且不超过 999 元，最多两位小数");
        require(request.getStock() == null || request.getStock() >= 0 && request.getStock() <= 10000, "库存应为 0 至 10000 份");
        if (request.getStatus() == null) request.setStatus(0);
        require(request.getStatus() == 0 || request.getStatus() == 1, "请选择正确的上下架状态");
        if (request.getCalories() == null) request.setCalories(0);
        require(request.getCalories() >= 0 && request.getCalories() <= 5000, "每份能量应为 0 至 5000 千卡");
        request.setDescription(optionalText(request.getDescription(), 255, "菜品介绍最多 255 字"));
        request.setTags(optionalText(request.getTags(), 100, "展示标签最多 100 字"));
        boolean unchanged = previous != null && Objects.equals(previous.getImage(), request.getImage()) && request.getImage() != null;
        require(unchanged || images.contains(request.getImage()), "请先上传一张菜品图片");
    }

    /** 规范化可选展示文本，同时按数据库列长度限制，允许用户清空简介或标签。 */
    private String optionalText(String value, int limit, String message) {
        String result = value == null ? "" : value.trim(); require(result.length() <= limit, message); return result;
    }

    /** 转换到原 Dish 实体；创建/更新人和时间继续由原项目 AutoFill 切面填写。 */
    private Dish entity(DishSave request) {
        return Dish.builder().name(request.getName()).categoryId(request.getCategoryId()).price(request.getPrice())
                .image(request.getImage()).description(request.getDescription()).status(request.getStatus()).build();
    }
}
