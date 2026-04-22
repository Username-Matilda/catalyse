"""
Build script: copies static/ → dist/ and injects content-hash query params into HTML files.

Replaces references like:
  styles.css       → styles.css?v=abc12345
  app.js           → app.js?v=def67890

Run via `make build` before deploying, or automatically via Railway buildCommand.
"""

import hashlib
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).parent
SRC = ROOT / "static"
DIST = ROOT / "dist"

ASSETS = {
    "styles.css": SRC / "styles.css",
    "app.js": SRC / "app.js",
}


def file_hash(path: Path) -> str:
    return hashlib.md5(path.read_bytes()).hexdigest()[:8]


def rewrite_html(html_path: Path, hashes: dict[str, str]) -> None:
    content = html_path.read_text()
    for filename, digest in hashes.items():
        content = re.sub(
            rf'{re.escape(filename)}(\?v=[^"\']*)?',
            f"{filename}?v={digest}",
            content,
        )
    html_path.write_text(content)


if __name__ == "__main__":
    # Rebuild dist/ from scratch
    if DIST.exists():
        shutil.rmtree(DIST)
    shutil.copytree(SRC, DIST)
    print(f"Copied {SRC} → {DIST}")

    hashes = {name: file_hash(path) for name, path in ASSETS.items()}
    for name, digest in hashes.items():
        print(f"  {name}: {digest}")

    html_files = list(DIST.rglob("*.html"))
    for html_file in html_files:
        rewrite_html(html_file, hashes)

    print(f"Done — {len(html_files)} HTML files updated.")
