package com.sky.campus;

import com.sky.campus.CampusModels.*;
import com.sky.result.Result;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.concurrent.TimeUnit;

/** 校园菜品维护接口；继续使用校园 JWT/Shiro 身份及原 Result 协议，不借用旧员工令牌。 */
@RestController
@RequestMapping("/campus")
public class CampusMenuController {
    private final CampusMenuService menu;
    private final CampusImageService images;

    public CampusMenuController(CampusMenuService menu, CampusImageService images) { this.menu = menu; this.images = images; }

    /** 返回当前管理范围可用的窗口及菜品分类，避免前端自行推断分类主键。 */
    @GetMapping("/staff/menu/options") public Result<MenuOptions> options() { return Result.success(menu.options()); }

    /** 同一事务内创建原菜品与校园库存关联，返回实际数据库记录。 */
    @PostMapping("/staff/menu") public Result<DishView> create(@RequestBody DishSave request) { return Result.success(menu.create(request)); }

    /** 完整编辑菜品资料；原 PUT /staff/menu 仍保留用于单独调整库存或上下架。 */
    @PutMapping("/staff/menu/{id}") public Result<DishView> update(@PathVariable Long id, @RequestBody DishSave request) { return Result.success(menu.update(id, request)); }

    /** 仅删除当前权限内已下架且没有订单、套餐引用的菜品。 */
    @DeleteMapping("/staff/menu/{id}") public Result<Void> delete(@PathVariable Long id) { menu.delete(id); return Result.success(); }

    /** 全校共享分类仅允许管理员新增，不影响原套餐分类。 */
    @PostMapping("/staff/menu/categories") public Result<MenuCategory> createCategory(@RequestBody MenuCategory request) { return Result.success(menu.saveCategory(null, request)); }

    /** 管理员维护分类名称、排序与启停状态，校验在 Service 中执行。 */
    @PutMapping("/staff/menu/categories/{id}") public Result<MenuCategory> updateCategory(@PathVariable Long id, @RequestBody MenuCategory request) { return Result.success(menu.saveCategory(id, request)); }

    /** 无菜品、套餐引用的分类才允许删除。 */
    @DeleteMapping("/staff/menu/categories/{id}") public Result<Void> deleteCategory(@PathVariable Long id) { menu.deleteCategory(id); return Result.success(); }

    /** 管理身份上传菜品照片，服务端重新解码编码；不接收原文件名作为存储路径。 */
    @PostMapping(value="/staff/menu/image", consumes=MediaType.MULTIPART_FORM_DATA_VALUE)
    public Result<ImageUpload> upload(@RequestParam("file") MultipartFile file) {
        ImageUpload result = new ImageUpload(); result.setUrl(images.upload(file)); return Result.success(result);
    }

    /** 公开读取固定随机命名的 JPEG，便于学生端和小程序通过同一地址显示菜品图片。 */
    @GetMapping("/public/dish-images/{name}")
    public ResponseEntity<Resource> image(@PathVariable String name) {
        Resource resource = images.resource(name);
        if (resource == null) return ResponseEntity.notFound().build();
        return ResponseEntity.ok().contentType(MediaType.IMAGE_JPEG).header("X-Content-Type-Options", "nosniff")
                .cacheControl(CacheControl.maxAge(1, TimeUnit.DAYS).cachePublic()).body(resource);
    }

    /** 禁止库存等数字的小数被 Jackson 静默截断；格式错误统一回到表单中显示。 */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public Result<Void> invalidBody() { return Result.error("提交数据格式不正确；库存、能量、排序和状态须为整数"); }
}
