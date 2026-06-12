# 本地预览用的极简静态服务器（避开 sandbox 下 os.getcwd() 受限的问题）
import http.server
import os
import socketserver

ROOT = os.path.dirname(os.path.abspath(__file__))


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)


socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("127.0.0.1", 8765), Handler) as httpd:
    print("serving prototype at http://127.0.0.1:8765")
    httpd.serve_forever()
