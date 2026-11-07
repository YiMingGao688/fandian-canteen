package com.sky.campus;

import com.sky.exception.BaseException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.web.MockMultipartFile;
import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.nio.file.Path;
import static org.junit.jupiter.api.Assertions.*;

/** 独立临时目录测试图片真实解码、重新编码、大小及文件路径边界。 */
class CampusImageServiceTest {
    @TempDir Path directory;

    @Test void normalizesAndResizesRealImage() throws Exception {
        ByteArrayOutputStream bytes=new ByteArrayOutputStream(); ImageIO.write(new BufferedImage(2000,1000,BufferedImage.TYPE_INT_ARGB),"png",bytes);
        CampusImageService service=new CampusImageService(directory.toString());
        String url=service.upload(new MockMultipartFile("file","../../unsafe.png","image/png",bytes.toByteArray()));
        assertTrue(service.contains(url)); BufferedImage stored=ImageIO.read(service.resource(url.substring(url.lastIndexOf('/')+1)).getInputStream());
        assertEquals(1600,stored.getWidth()); assertEquals(800,stored.getHeight()); assertFalse(stored.getColorModel().hasAlpha());
    }

    @Test void rejectsDisguisedNonImageEmptyAndOversizedFiles() {
        CampusImageService service=new CampusImageService(directory.toString());
        assertThrows(BaseException.class,()->service.upload(new MockMultipartFile("file","dish.jpg","image/jpeg","<script>bad</script>".getBytes())));
        assertThrows(BaseException.class,()->service.upload(new MockMultipartFile("file",new byte[0])));
        assertThrows(BaseException.class,()->service.upload(new MockMultipartFile("file",new byte[901*1024])));
        assertNull(service.resource("../secret.jpg")); assertNull(service.resource("file.svg")); assertFalse(service.contains("https://example.com/a.jpg"));
    }
}
