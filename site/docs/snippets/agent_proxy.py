# Your server's one route for the page, with nothing but the standard
# library: each AG-UI run goes on to MorphScreen with your key, and the
# events stream straight back. The key never reaches the browser, and the
# server, not the page, picks the model.
import json
import os
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

API = os.environ.get("MORPHSCREEN_API", "https://api.morphscreen.com/v1")
MODEL = os.environ.get("MODEL", "deepseek/deepseek-v4.1-flash")


class Agent(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/api/agent":
            self.send_error(404)
            return
        run = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        run["forwardedProps"] = {**run.get("forwardedProps", {}), "model": MODEL}
        req = urllib.request.Request(
            f"{API}/ui",
            data=json.dumps(run).encode(),
            headers={"Content-Type": "application/json", "X-MorphScreen-Key": os.environ.get("MORPHSCREEN_KEY", "")},
            method="POST",
        )
        try:
            upstream = urllib.request.urlopen(req)
        except urllib.error.HTTPError as e:
            upstream = e
        with upstream:
            self.send_response(upstream.status)
            self.send_header("Content-Type", upstream.headers.get("Content-Type", "text/event-stream"))
            self.end_headers()
            while chunk := upstream.read1(4096):
                self.wfile.write(chunk)
                self.wfile.flush()


ThreadingHTTPServer(("127.0.0.1", int(os.environ.get("PORT", "3000"))), Agent).serve_forever()
