"""仅用于本地查看独立设计原型，不启动业务后端或暴露局域网。"""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

if __name__ == '__main__':
    root = Path(__file__).resolve().parent
    handler = partial(SimpleHTTPRequestHandler, directory=str(root))
    server = ThreadingHTTPServer(('127.0.0.1', 15180), handler)
    print('Design gallery: http://127.0.0.1:15180', flush=True)
    server.serve_forever()
