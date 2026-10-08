"""Start the local workbench and open it after the server is listening."""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
import webbrowser

from werkzeug.serving import make_server

from medorchestrate.app import app


URL = "http://127.0.0.1:8000/"


def existing_workbench() -> bool:
    try:
        with urllib.request.urlopen(URL + "api/status", timeout=1) as response:
            return json.load(response).get("project") == "MedOrchestrate"
    except (OSError, ValueError, urllib.error.URLError):
        return False


def main() -> int:
    if existing_workbench():
        print(f"MedOrchestrate is already running at {URL}")
        if os.environ.get("MEDORCHESTRATE_NO_BROWSER") != "1":
            webbrowser.open(URL)
        return 0
    try:
        server = make_server("127.0.0.1", 8000, app)
    except OSError as error:
        print(f"Cannot start MedOrchestrate on port 8000: {error}", file=sys.stderr)
        return 1
    print(f"MedOrchestrate is ready at {URL}")
    print("Keep this window open while using the workbench. Press Ctrl+C to stop.")
    if os.environ.get("MEDORCHESTRATE_NO_BROWSER") != "1":
        webbrowser.open(URL)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nMedOrchestrate stopped.")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
