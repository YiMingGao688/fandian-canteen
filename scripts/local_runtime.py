"""Run a workspace-owned MySQL/Redis and campus app; never use the existing MySQL service/data."""
import argparse
import base64
import hashlib
import json
import os
import secrets
import socket
import subprocess
import time
import tempfile
from pathlib import Path
from seed_data import seed_sql

ROOT = Path(__file__).resolve().parents[1]
LOCAL = ROOT / '.local'
MYSQL_HOME = Path(r'D:\soft\mysql')
REDIS = Path(r'D:\redis\Redis-x64-3.0.504\redis-server.exe')
JAVA = Path(r'D:\jdk17\bin\java.exe')
NODE = Path(r'D:\node\node.exe')
STATE = LOCAL / 'state.json'
RUNNING = LOCAL / 'runtime.json'
LOCAL.mkdir(exist_ok=True)
assert LOCAL.resolve().is_relative_to(ROOT.resolve())

state = json.loads(STATE.read_text(encoding='utf-8')) if STATE.exists() else {
    'db_password': secrets.token_urlsafe(24), 'root_password': secrets.token_urlsafe(24),
    'redis_password': secrets.token_urlsafe(24), 'jwt_secret': secrets.token_urlsafe(48),
    'legacy_admin_secret': secrets.token_urlsafe(48), 'legacy_user_secret': secrets.token_urlsafe(48),
    'initialized': False,
}
STATE.write_text(json.dumps(state, indent=2), encoding='utf-8')
running = json.loads(RUNNING.read_text(encoding='utf-8')) if RUNNING.exists() else {}
ALIAS = Path(state.get('ascii_alias', str(Path(tempfile.gettempdir()) / ('hexu-campus-' + hashlib.sha256(str(ROOT).encode()).hexdigest()[:12]))))
if ALIAS.exists():
    if ALIAS.resolve() != LOCAL.resolve():
        raise RuntimeError('ASCII alias belongs to a different directory; refusing to reuse it')
else:
    # MySQL Windows 版无法可靠解析本机中文 datadir；目录联接只提供 ASCII 入口，实际数据仍在工作区。
    target = str(LOCAL).replace("'", "''")
    alias_text = str(ALIAS).replace("'", "''")
    subprocess.run(['powershell.exe', '-NoProfile', '-Command', f"New-Item -ItemType Junction -Path '{alias_text}' -Target '{target}' | Out-Null"], check=True)
state['ascii_alias'] = str(ALIAS)
STATE.write_text(json.dumps(state, indent=2), encoding='utf-8')

def port_open(port):
    try:
        with socket.create_connection(('127.0.0.1', port), timeout=.5):
            return True
    except OSError:
        return False

def local_payment_value(name, environment_name):
    """从启动环境或 Git 忽略的本机文件读取支付宝参数，避免密钥经过聊天或提交到仓库。"""
    value = os.environ.get(environment_name, '')
    local_file = LOCAL / name
    if not value and local_file.exists():
        value = local_file.read_text(encoding='utf-8').strip()
    return value

def owned_process(pid):
    # 复用进程前核对其命令行包含本工作区；仅凭 PID 不能判断归属。
    command = f"$p=Get-CimInstance Win32_Process -Filter 'ProcessId={int(pid)}'; if($p){{[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($p.CommandLine))}}"
    p = subprocess.run(['powershell.exe', '-NoProfile', '-Command', command], capture_output=True)
    try:
        value = base64.b64decode(p.stdout.strip()).decode('utf-8').replace('\\', '/').lower()
    except Exception:
        return False
    return any(str(path).replace('\\', '/').lower() in value for path in (ROOT, ALIAS))

def listener_pid(port):
    command = f"Get-NetTCPConnection -State Listen -LocalPort {int(port)} -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess"
    p = subprocess.run(['powershell.exe', '-NoProfile', '-Command', command], capture_output=True)
    return int(p.stdout.strip()) if p.stdout.strip() else None

def start(name, port, args, cwd=ROOT):
    if port_open(port):
        pid = listener_pid(port)
        if not pid or not owned_process(pid):
            raise RuntimeError(f'Port {port} belongs to another process; no changes made')
        running[name] = {'pid': pid, 'port': port}
        RUNNING.write_text(json.dumps(running, indent=2), encoding='utf-8')
        print(f'{name}: existing workspace process on {port}', flush=True)
        return
    log = LOCAL / f'{name}.log'
    stream = log.open('ab')
    process = subprocess.Popen([str(a) for a in args], cwd=cwd, stdout=stream, stderr=subprocess.STDOUT,
                               creationflags=subprocess.CREATE_NO_WINDOW | subprocess.CREATE_NEW_PROCESS_GROUP)
    running[name] = {'pid': process.pid, 'port': port}
    RUNNING.write_text(json.dumps(running, indent=2), encoding='utf-8')
    for _ in range(100):
        if port_open(port):
            print(f'{name}: listening on 127.0.0.1:{port}', flush=True)
            return
        if process.poll() is not None:
            raise RuntimeError(f'{name} stopped; inspect {log}')
        time.sleep(.5)
    raise RuntimeError(f'{name} startup timeout; inspect {log}')

def admin_config(password):
    path = LOCAL / 'mysql-admin.cnf'
    path.write_text('[client]\nuser=root\npassword=' + password + '\nhost=127.0.0.1\nport=13316\nprotocol=TCP\ndefault-character-set=utf8mb4\n', encoding='utf-8')
    return ALIAS / path.name

def mysql(sql, database=None, allow_error=False):
    args = [str(MYSQL_HOME / 'bin/mysql.exe'), '--defaults-extra-file=' + str(ALIAS / 'mysql-admin.cnf'), '--batch', '--skip-column-names']
    if database:
        args.append(database)
    result = subprocess.run(args, input=sql.encode('utf-8'), capture_output=True)
    if result.returncode and not allow_error:
        # 不输出可能带有密码的 SQL 请求，只展示 MySQL 自身诊断。
        raise RuntimeError(result.stderr.decode('utf-8', errors='replace'))
    return result

def prepare_infrastructure():
    data = ALIAS / 'mysql'
    if not (data / 'mysql').exists():
        if data.exists() and any(data.iterdir()):
            raise RuntimeError('Partially initialized private data directory; inspect it before retrying')
        data.mkdir(exist_ok=True)
        args = [str(MYSQL_HOME / 'bin/mysqld.exe'), '--no-defaults', '--initialize-insecure', '--basedir=' + str(MYSQL_HOME), '--datadir=' + str(data)]
        with (LOCAL / 'mysql-initialize.log').open('wb') as stream:
            subprocess.run(args, stdout=stream, stderr=subprocess.STDOUT, check=True)
    start('mysql', 13316, [MYSQL_HOME / 'bin/mysqld.exe', '--no-defaults', '--basedir=' + str(MYSQL_HOME), '--datadir=' + str(data), '--port=13316', '--bind-address=127.0.0.1', '--mysqlx=0', '--console', '--character-set-server=utf8mb4', '--collation-server=utf8mb4_unicode_ci'])
    admin_config(state['root_password'] if state['initialized'] else '')
    if mysql('SELECT 1;', allow_error=True).returncode:
        admin_config(state['root_password'])
        mysql('SELECT 1;')
    if not state['initialized']:
        count = mysql("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='campus_ordering';").stdout.decode().strip()
        if count != '0':
            raise RuntimeError('Private campus database already contains tables; refusing to overwrite records')
        pwd = state['db_password']
        mysql("CREATE DATABASE IF NOT EXISTS campus_ordering CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;\n"
              f"CREATE USER IF NOT EXISTS 'campus'@'127.0.0.1' IDENTIFIED BY '{pwd}';\n"
              f"CREATE USER IF NOT EXISTS 'campus'@'localhost' IDENTIFIED BY '{pwd}';\n"
              "GRANT ALL ON campus_ordering.* TO 'campus'@'127.0.0.1';\nGRANT ALL ON campus_ordering.* TO 'campus'@'localhost';")
        schema = (ROOT / 'database/schema.sql').read_text(encoding='utf-8') + '\n' + (ROOT / 'database/campus.sql').read_text(encoding='utf-8') + '\n' + seed_sql()
        (LOCAL / 'initialization.sql').write_text(schema, encoding='utf-8')
        mysql(schema, 'campus_ordering')
        mysql(f"ALTER USER 'root'@'localhost' IDENTIFIED BY '{state['root_password']}';")
        state['initialized'] = True
        STATE.write_text(json.dumps(state, indent=2), encoding='utf-8')
        admin_config(state['root_password'])
        print('Initialized independent campus database with synthetic demo records', flush=True)
    redis_dir = LOCAL / 'redis'
    redis_dir.mkdir(exist_ok=True)
    config = 'bind 127.0.0.1\nport 16379\nrequirepass ' + state['redis_password'] + '\ndir "' + (ALIAS / 'redis').as_posix() + '"\nappendonly yes\n'
    (LOCAL / 'redis.conf').write_text(config, encoding='utf-8')
    start('redis', 16379, [REDIS, ALIAS / 'redis.conf'])
    # 支付密钥由启动 PowerShell 会话临时注入，只序列化到 .local 私有配置，不写入源码或启动日志。
    app_id = local_payment_value('alipay-app-id.txt', 'CAMPUS_ALIPAY_APP_ID')
    private_key = local_payment_value('alipay-app-private-key.txt', 'CAMPUS_ALIPAY_PRIVATE_KEY')
    public_key = local_payment_value('alipay-public-key.txt', 'CAMPUS_ALIPAY_PUBLIC_KEY')
    notify_url = local_payment_value('alipay-notify-url.txt', 'CAMPUS_ALIPAY_NOTIFY_URL')
    return_url = local_payment_value('alipay-return-url.txt', 'CAMPUS_ALIPAY_RETURN_URL')
    payment_ready = all((app_id, private_key, public_key, notify_url, return_url))
    payment_mode = os.environ.get('CAMPUS_PAYMENT_MODE', 'alipay-sandbox' if payment_ready else 'demo')
    local_config = f'''spring:
  datasource:
    druid:
      url: jdbc:mysql://127.0.0.1:13316/campus_ordering?useUnicode=true&characterEncoding=utf8&serverTimezone=Asia/Shanghai&allowPublicKeyRetrieval=true&useSSL=false
      username: campus
      password: '{state['db_password']}'
  redis:
    password: '{state['redis_password']}'
campus:
  payment-mode: {json.dumps(payment_mode)}
  jwt-secret: '{state['jwt_secret']}'
  alipay:
    app-id: {json.dumps(app_id)}
    private-key: {json.dumps(private_key)}
    public-key: {json.dumps(public_key)}
    gateway-url: {json.dumps(os.environ.get('CAMPUS_ALIPAY_GATEWAY_URL', 'https://openapi.alipaydev.com/gateway.do'))}
    notify-url: {json.dumps(notify_url)}
    return-url: {json.dumps(return_url)}
sky:
  jwt:
    admin-secret-key: '{state['legacy_admin_secret']}'
    user-secret-key: '{state['legacy_user_secret']}'
'''
    (LOCAL / 'application-local.yml').write_text(local_config, encoding='utf-8')

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--infra-only', action='store_true')
    args = parser.parse_args()
    prepare_infrastructure()
    if args.infra_only:
        return
    jar = ROOT / 'backend/sky-server/target/sky-server-1.0-SNAPSHOT.jar'
    if not jar.exists():
        raise RuntimeError('Build backend first: python scripts/build_backend.py')
    # 显式指定端口：宿主的 SERVER_PORT / SERVER__PORT 会被 Spring Boot 宽松绑定解析为 server.port，
    # 覆盖配置文件并让启动脚本检测的端口与实际监听端口不一致。命令行参数优先级更高。
    start('backend', 18088, [JAVA, '-Dfile.encoding=UTF-8', '-Duser.timezone=Asia/Shanghai', '-jar', jar,
                             '--spring.config.additional-location=file:' + (LOCAL / 'application-local.yml').as_posix(),
                             '--server.port=18088'])
    start('web', 15173, [NODE, ROOT / 'web/node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '15173', '--strictPort'], ROOT / 'web')
    print('Student mini program: import miniprogram/ in WeChat DevTools (API: http://127.0.0.1:15173/campus)\nAdministration: http://127.0.0.1:15173/#/admin\nOperations screen: http://127.0.0.1:15173/#/screen', flush=True)

if __name__ == '__main__':
    main()
