"""Static server for dist/ that actually sends charset=utf-8 (python's default doesn't)."""
import functools, http.server, os, socketserver

ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dist")


class H(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      ".html": "text/html; charset=utf-8",
                      ".css": "text/css; charset=utf-8",
                      ".js": "text/javascript; charset=utf-8"}


socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("127.0.0.1", 8765), functools.partial(H, directory=ROOT)) as s:
    print("serving", ROOT, "on http://127.0.0.1:8765")
    s.serve_forever()
