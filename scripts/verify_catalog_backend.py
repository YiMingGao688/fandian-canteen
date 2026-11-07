"""Validate real menu SQL in a disposable database; never seed or write campus_ordering."""
import hashlib
import json
import os
import re
import subprocess
import sys
import uuid
from pathlib import Path
from datetime import datetime

ROOT = Path(__file__).resolve().parents[1]
LOCAL = ROOT / '.local'
state = json.loads((LOCAL / 'state.json').read_text(encoding='utf-8'))
alias = Path(state['ascii_alias'])
if alias.resolve() != LOCAL.resolve():
    raise RuntimeError('Unexpected local runtime alias')
defaults = alias / 'mysql-admin.cnf'
settings = defaults.read_text(encoding='utf-8')
if 'host=127.0.0.1' not in settings or 'port=13316' not in settings:
    raise RuntimeError('Refusing a non-workspace database instance')
database = 'fandian_catalog_test_' + datetime.now().strftime('%Y%m%d_') + uuid.uuid4().hex[:8]
assert re.fullmatch(r'fandian_catalog_test_[a-z0-9_]+', database)
mysql = [r'D:\soft\mysql\bin\mysql.exe', '--defaults-extra-file=' + str(defaults), '--batch', '--skip-column-names']


def query(sql, db=None):
    result = subprocess.run(mysql + ([db] if db else []), input=sql.encode('utf-8'), capture_output=True)
    if result.returncode:
        raise RuntimeError(result.stderr.decode('utf-8', errors='replace'))
    return result.stdout.decode('utf-8', errors='replace').strip()


def escape_property(value):
    return str(value).replace('\\', '\\\\').encode('ascii', 'backslashreplace').decode('ascii')


# Record the real menu before/after; no fixture SQL is ever sent to this database.
fingerprint_sql = "SELECT d.id,d.name,d.category_id,d.price,d.image,d.status,x.window_id,x.stock,x.calories,x.tags FROM dish d JOIN campus_dish x ON x.dish_id=d.id ORDER BY d.id;"
before = hashlib.sha256(query(fingerprint_sql, 'campus_ordering').encode()).hexdigest()
created = False
result_code = 1
try:
    query('CREATE DATABASE `' + database + '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;')
    created = True
    schema = (ROOT / 'database/schema.sql').read_text(encoding='utf-8') + '\n' + (ROOT / 'database/campus.sql').read_text(encoding='utf-8')
    query(schema, database)
    media = LOCAL / (database + '_media')
    config = LOCAL / (database + '.properties')
    properties = {
        'db.url': 'jdbc:mysql://127.0.0.1:13316/' + database + '?useUnicode=true&characterEncoding=utf8&serverTimezone=Asia/Shanghai&allowPublicKeyRetrieval=true&useSSL=false',
        'db.username': 'root', 'db.password': state['root_password'], 'images.path': media.as_posix(),
    }
    config.write_text('\n'.join(key + '=' + escape_property(value) for key, value in properties.items()), encoding='ascii')
    env = dict(os.environ); env['JAVA_HOME'] = r'D:\jdk17'
    command = [r'D:\apache-maven-3.9.12\bin\mvn.cmd', '-B', '-ntp', '-pl', 'sky-server', '-am',
               '-Dtest=CampusMenuIntegrationTest,CampusImageServiceTest,CampusOperationsIntegrationTest', '-Dsurefire.failIfNoSpecifiedTests=false',
               '-Dcampus.test.config=' + str(config), 'package' if '--package' in sys.argv else 'test']
    log = LOCAL / 'verify-catalog-backend.log'
    print('Testing real MyBatis SQL, transactions and images in isolated database:', database, flush=True)
    with log.open('wb') as output:
        result_code = subprocess.run(command, cwd=ROOT / 'backend', env=env, stdout=output, stderr=subprocess.STDOUT).returncode
    lines = log.read_text(encoding='utf-8', errors='replace').splitlines()
    for line in lines:
        if re.search(r'Tests run:|BUILD SUCCESS|BUILD FAILURE|\[ERROR\]', line):
            print(line.encode('ascii', 'backslashreplace').decode('ascii'))
    print('Maven exit code:', result_code, flush=True)
finally:
    if created:
        assert re.fullmatch(r'fandian_catalog_test_[a-z0-9_]+', database)
        query('DROP DATABASE `' + database + '`;')
        print('Disposable database removed.', flush=True)
    after = hashlib.sha256(query(fingerprint_sql, 'campus_ordering').encode()).hexdigest()
    if before != after:
        raise RuntimeError('Live menu changed during validation; inspect concurrent changes')
    print('Existing business menu fingerprint unchanged.', flush=True)
raise SystemExit(result_code)
