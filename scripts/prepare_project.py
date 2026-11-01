"""Prepare the isolated campus schema and safe local configuration without touching existing databases."""
from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
resources = root / 'backend/sky-server/src/main/resources'
config = '''server:
  address: 127.0.0.1
  port: 18088
  tomcat:
    threads:
      max: 256
spring:
  profiles:
    active: local
  main:
    allow-circular-references: true
  mvc:
    pathmatch:
      matching-strategy: ant_path_matcher
  datasource:
    druid:
      driver-class-name: com.mysql.cj.jdbc.Driver
      initial-size: 2
      max-active: 24
      min-idle: 2
  redis:
    host: 127.0.0.1
    port: 16379
    database: 0
    timeout: 3000ms
mybatis:
  mapper-locations: classpath:mapper/*.xml
  type-aliases-package: com.sky.entity
  configuration:
    map-underscore-to-camel-case: true
logging:
  level:
    com.sky.mapper: info
campus:
  payment-mode: demo
  legacy-jobs-enabled: false
sky:
  jwt:
    admin-ttl: 7200000
    admin-token-name: token
    user-ttl: 7200000
    user-token-name: authentication
  alioss:
    endpoint: ''
    access-key-id: ''
    access-key-secret: ''
    bucket-name: ''
  wechat:
    appid: ''
    secret: ''
    mchid: ''
    mchSerialNo: ''
    privateKeyFilePath: ''
    apiV3Key: ''
    weChatPayCertFilePath: ''
    notifyUrl: ''
    refundNotifyUrl: ''
  shop:
    address: '校园食堂预约取餐窗口'
  baidu:
    ak: ''
'''
(resources / 'application.yml').write_text(config, encoding='utf-8')
(resources / 'application-dev.yml').write_text('# 上游示例云端配置不用于校园工程；本地配置由 scripts/local_runtime.py 在 .local 生成。\n', encoding='utf-8')

# 只提取上游 CREATE TABLE，保留原业务表结构；不执行 DROP 或上游演示 INSERT。
source = (root / 'database/upstream-sky.sql').read_text(encoding='utf-8')
tables = re.findall(r'CREATE TABLE\s+`[^`]+`\s*\([\s\S]*?\) ENGINE=[^;]+;', source)
assert len(tables) == 11, f'Unexpected original schema count: {len(tables)}'
schema = '\n\n'.join(tables)
schema = schema.replace('COLLATE utf8_bin', 'COLLATE utf8mb4_unicode_ci').replace('COLLATE=utf8_bin', 'COLLATE=utf8mb4_unicode_ci').replace('CHARSET=utf8mb3', 'CHARSET=utf8mb4')
schema = re.sub(r' AUTO_INCREMENT=\d+', '', schema)
(root / 'database/schema.sql').write_text('-- 原项目业务表结构，剔除 DROP 和旧演示数据，统一支持 utf8mb4。\n' + schema + '\n', encoding='utf-8')
print('Prepared safe source configuration and', len(tables), 'original business tables')
