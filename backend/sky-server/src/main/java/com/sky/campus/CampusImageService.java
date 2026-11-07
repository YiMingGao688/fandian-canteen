package com.sky.campus;

import com.sky.exception.BaseException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Iterator;
import java.util.UUID;

/** 校园菜品图片存储；不依赖原演示 OSS 密钥，统一重新编码成不可执行的 JPEG。 */
@Service
public class CampusImageService {
    private static final String PREFIX = "/campus/public/dish-images/";
    private final Path directory;

    public CampusImageService(@Value("${campus.media-directory:.local/uploads/dishes}") String directory) {
        this.directory = Paths.get(directory).toAbsolutePath().normalize();
    }

    /**
     * 校验上传文件真实格式及像素数，将图片缩至最长边 1600 像素后保存为随机命名 JPEG。
     * 不信任扩展名、MIME 或原文件名；先读取尺寸再解码，避免小文件产生过大内存占用。
     * @param file 浏览器压缩后的 JPEG/PNG，最大 900 KiB，低于当前默认 multipart 请求限制
     * @return 学生端和管理端都可访问的同源资源地址
     * @throws BaseException 文件为空、过大、格式不支持、尺寸越界或存储失败
     */
    public String upload(MultipartFile file) {
        CampusCatalogService.require(file != null && !file.isEmpty(), "请选择菜品图片");
        CampusCatalogService.require(file.getSize() <= 900 * 1024, "图片过大，请重新选择或压缩后上传");
        try (InputStream input = file.getInputStream(); ImageInputStream stream = ImageIO.createImageInputStream(input)) {
            CampusCatalogService.require(stream != null, "无法读取这张图片");
            Iterator<ImageReader> readers = ImageIO.getImageReaders(stream);
            CampusCatalogService.require(readers.hasNext(), "请上传有效的 JPG 或 PNG 图片");
            ImageReader reader = readers.next();
            try {
                String format = reader.getFormatName();
                CampusCatalogService.require("JPEG".equalsIgnoreCase(format) || "PNG".equalsIgnoreCase(format), "请上传 JPG 或 PNG 图片");
                reader.setInput(stream, true, true);
                int width = reader.getWidth(0), height = reader.getHeight(0);
                CampusCatalogService.require(width > 0 && height > 0 && width <= 6000 && height <= 6000 && (long) width * height <= 16000000, "图片尺寸过大，请缩小后上传");
                BufferedImage image = reader.read(0);
                double scale = Math.min(1, 1600d / Math.max(width, height));
                BufferedImage normalized = new BufferedImage(Math.max(1, (int) (width * scale)), Math.max(1, (int) (height * scale)), BufferedImage.TYPE_INT_RGB);
                Graphics2D graphics = normalized.createGraphics();
                try {
                    graphics.setColor(Color.WHITE); graphics.fillRect(0, 0, normalized.getWidth(), normalized.getHeight());
                    graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
                    graphics.drawImage(image, 0, 0, normalized.getWidth(), normalized.getHeight(), null);
                } finally { graphics.dispose(); }
                Files.createDirectories(directory);
                String name = UUID.randomUUID().toString().replace("-", "") + ".jpg";
                Path target = directory.resolve(name);
                try {
                    if (!ImageIO.write(normalized, "jpg", target.toFile())) throw new IOException("JPEG encoder unavailable");
                } catch (IOException ex) {
                    Files.deleteIfExists(target); throw ex;
                }
                return PREFIX + name;
            } finally { reader.dispose(); }
        } catch (IOException ex) { throw new BaseException("图片上传失败，请重新选择图片后重试"); }
    }

    /**
     * 检查新增或更换的图片确由本服务保存；仅接受固定前缀和随机文件名。
     * @param url 图片上传接口返回的地址
     * @return 地址合法且本地文件存在时为 true
     */
    public boolean contains(String url) {
        return url != null && url.startsWith(PREFIX) && resource(url.substring(PREFIX.length())) != null;
    }

    /**
     * 获取公开菜品图片，拒绝目录穿越、任意扩展名及不存在的文件。
     * @param name 32 位十六进制随机名称与 .jpg 后缀
     * @return 可读资源；文件名不合法或文件不存在时返回 null，控制器转为 404
     */
    public Resource resource(String name) {
        if (name == null || !name.matches("[a-f0-9]{32}\\.jpg")) return null;
        Path file = directory.resolve(name).normalize();
        if (!file.startsWith(directory) || !Files.isRegularFile(file)) return null;
        return new FileSystemResource(file);
    }
}
