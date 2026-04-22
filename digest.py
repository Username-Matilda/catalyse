"""
Injects content-hash query params into HTML files for cache busting.

Replaces references like:
  styles.css            → styles.css?v=abc12345
  styles.css?v=old      → styles.css?v=abc12345
  app.js                → app.js?v=def67890
  app.js?v=old          → app.js?v=def67890

Run before deploying, or via `make digest`.
"""

import hashlib
import re
from pathlib import Path

ROOT = Path(__file__).parent
STATIC = ROOT / "static"

ASSETS = {
    "styles.css": STATIC / "styles.css",
    "app.js": STATIC / "app.js",
}


def file_hash(path: Path) -> str:
    md5 = hashlib.md5(path.read_bytes()).hexdigest()
    return md5[:8]


def rewrite_html(html_path: Path, hashes: dict[str, str]) -> bool:
    content = html_path.read_text()
    original = content
    for filename, digest in hashes.items():
        escaped = re.escape(filename)
        content = re.sub(
            rf'{escaped}(\?v=[^"\']*)?',
            f"{filename}?v={digest}",
            content,
        )
    if content != original:
        html_path.write_text(content)
        return True
    return False


if __name__ == "__main__":
    hashes = {name: file_hash(path) for name, path in ASSETS.items()}
    for name, digest in hashes.items():
        print(f"  {name}: {digest}")

    html_files = list(STATIC.rglob("*.html"))
    updated = 0
    for html_file in html_files:
        if rewrite_html(html_file, hashes):
            updated += 1
            print(f"  updated {html_file.relative_to(ROOT)}")

    print(f"Done — {updated}/{len(html_files)} files updated.")
