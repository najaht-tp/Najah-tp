# Dev server for the portfolio: like `python3 -m http.server`, but tells the browser never to cache,
# so a reload always picks up the latest src/ files.
import http.server, socketserver, sys
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()
port = int(sys.argv[1]) if len(sys.argv) > 1 else 5179
socketserver.TCPServer.allow_reuse_address = True
with socketserver.ThreadingTCPServer(('', port), H) as s:
    print(f'Serving on http://127.0.0.1:{port}  (no-cache)'); s.serve_forever()
