"""Stop only processes whose command lines belong to this workspace."""
import subprocess
import sys
import time
from local_runtime import running, listener_pid, owned_process, port_open, mysql, RUNNING
import json

names = ['backend'] if '--backend-only' in sys.argv else ['web', 'backend', 'redis', 'mysql']
for name in names:
    record = running.get(name)
    if not record or not port_open(record['port']):
        continue
    pid = listener_pid(record['port'])
    if not pid or not owned_process(pid):
        raise RuntimeError('Refusing to stop a process not owned by this workspace: ' + name)
    if name == 'mysql':
        mysql('SHUTDOWN;')
    elif name == 'redis':
        import socket
        from local_runtime import state
        password = state['redis_password'].encode()
        with socket.create_connection(('127.0.0.1', record['port']), timeout=5) as connection:
            connection.sendall(b'*2\r\n$4\r\nAUTH\r\n$' + str(len(password)).encode() + b'\r\n' + password + b'\r\n')
            connection.recv(1024)
            connection.sendall(b'*2\r\n$8\r\nSHUTDOWN\r\n$4\r\nSAVE\r\n')
    else:
        subprocess.run(['taskkill.exe', '/PID', str(pid), '/T', '/F'], check=True, capture_output=True)
    for _ in range(40):
        if not port_open(record['port']): break
        time.sleep(.25)
    running.pop(name, None)
    print('Stopped workspace service:', name, flush=True)
RUNNING.write_text(json.dumps(running, indent=2), encoding='utf-8')
