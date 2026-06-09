#!/usr/bin/env python3
"""
Local dev server for PlayParty.
Injects COOP/COEP headers required by Godot 4 HTML5/WASM exports.

Run:  python3 serve.py
Open: http://localhost:8000/batzyboy/
"""

import functools
import http.server
import mimetypes
import os

PORT = 8000
SERVE_DIR = os.path.dirname(os.path.abspath(__file__))

mimetypes.add_type("application/wasm", ".wasm")
mimetypes.add_type("application/octet-stream", ".pck")


class CORPHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        super().end_headers()


if __name__ == "__main__":
    handler = functools.partial(CORPHandler, directory=SERVE_DIR)
    with http.server.HTTPServer(("", PORT), handler) as httpd:
        print(f"Serving {SERVE_DIR}")
        print(f"")
        print(f"  Portal:  http://localhost:{PORT}/")
        print(f"  Game:    http://localhost:{PORT}/batzyboy/")
        print(f"")
        print(f"Press Ctrl+C to stop.")
        httpd.serve_forever()
