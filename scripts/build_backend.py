"""Build with a process-local JDK selection; never change machine environment settings."""
import os
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parents[1]
local = root / '.local'
local.mkdir(exist_ok=True)
env = dict(os.environ)
env['JAVA_HOME'] = r'D:\jdk17'
command = [r'D:\apache-maven-3.9.12\bin\mvn.cmd', '-B', '-ntp', '-DskipTests', 'package']
log = local / 'build-backend.log'
print('Building backend; full log:', log, flush=True)
with log.open('w', encoding='utf-8') as stream:
    result = subprocess.run(command, cwd=root / 'backend', env=env, stdout=stream, stderr=subprocess.STDOUT)
print('Maven exit code:', result.returncode, flush=True)
if result.returncode:
    print('\n'.join(log.read_text(encoding='utf-8', errors='replace').splitlines()[-65:]))
raise SystemExit(result.returncode)
