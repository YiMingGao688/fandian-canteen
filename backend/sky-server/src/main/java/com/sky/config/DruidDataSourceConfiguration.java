package com.sky.config;

import com.alibaba.druid.pool.DruidDataSource;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Druid 连接池装配。
 *
 * <p>Spring Boot 4 将 JDBC 自动配置拆分到 {@code org.springframework.boot.jdbc.autoconfigure} 包，
 * 而 Druid 的 {@code druid-spring-boot-3-starter} 仍通过 @EnableConfigurationProperties 引用 Boot 3 的
 * {@code org.springframework.boot.autoconfigure.jdbc.DataSourceProperties}，在 Boot 4 下会直接导致启动失败。
 * 因此改为依赖 druid 核心，在此显式装配数据源，继续复用既有 {@code spring.datasource.druid.*} 配置
 * （url / username / password / driver-class-name / initial-size / max-active / min-idle），
 * 连接池类型与参数不变；Boot 的 DataSourceAutoConfiguration 因已有 DataSource bean 自动退避。
 */
@Configuration
public class DruidDataSourceConfiguration {

    @Bean(initMethod = "init", destroyMethod = "close")
    @ConfigurationProperties(prefix = "spring.datasource.druid")
    public DruidDataSource dataSource() {
        return new DruidDataSource();
    }
}
