"""
Renders all email templates as plain markdown and prints them to stdout.
Run with:

    python preview_emails_plaintext.py

Or pipe to a pager:

    python preview_emails_plaintext.py | less
"""

import os
import re
from html.parser import HTMLParser

os.environ.setdefault("APP_URL", "http://localhost:8000")

from preview_emails import PREVIEWS


class _HtmlToMarkdown(HTMLParser):
    """Minimal HTML → Markdown converter sufficient for the email templates."""

    _BLOCK_TAGS = {"div", "p", "ul", "ol", "blockquote"}
    _SKIP_TAGS  = {"head", "style", "script"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self._out: list[str] = []
        self._skip_depth = 0
        self._href: str | None = None
        self._link_text: list[str] = []
        self._collecting_link = False

    def handle_starttag(self, tag, attrs):
        if tag in self._SKIP_TAGS:
            self._skip_depth += 1
            return
        if self._skip_depth:
            return

        attrs = dict(attrs)

        if tag in ("h1", "h2", "h3"):
            hashes = "#" * int(tag[1])
            self._out.append(f"\n\n{hashes} ")
        elif tag == "div" and "footer" in attrs.get("class", ""):
            self._out.append("\n\n___\n\n")
        elif tag in self._BLOCK_TAGS:
            self._out.append("\n\n")
        elif tag == "br":
            self._out.append("\n")
        elif tag == "li":
            self._out.append("\n- ")
        elif tag in ("strong", "b"):
            self._out.append("**")
        elif tag in ("em", "i"):
            self._out.append("_")
        elif tag == "a":
            self._href = attrs.get("href", "")
            self._collecting_link = True
            self._link_text = []

    def handle_endtag(self, tag):
        if tag in self._SKIP_TAGS:
            self._skip_depth -= 1
            return
        if self._skip_depth:
            return

        if tag in ("h1", "h2", "h3"):
            self._out.append("\n")
        elif tag in self._BLOCK_TAGS:
            self._out.append("\n")
        elif tag in ("strong", "b"):
            self._out.append("**")
        elif tag in ("em", "i"):
            self._out.append("_")
        elif tag == "a":
            text = "".join(self._link_text).strip()
            href = self._href or ""
            # Don't duplicate when the text IS the URL
            if text and text != href:
                self._out.append(f"{text} ({href})")
            else:
                self._out.append(href)
            self._collecting_link = False
            self._href = None
            self._link_text = []

    def handle_data(self, data):
        if self._skip_depth:
            return
        if self._collecting_link:
            self._link_text.append(data)
        else:
            self._out.append(data)

    def markdown(self) -> str:
        text = "".join(self._out)
        text = re.sub(r" +", " ", text)                        # collapse spaces
        text = re.sub(r"[ \t]+\n", "\n", text)                 # strip trailing whitespace on lines
        text = re.sub(r"\n[ \t]+\n", "\n\n", text)             # blank lines with only spaces → empty
        text = re.sub(r"\n{3,}", "\n\n", text)                 # max one blank line
        return text.strip()


def html_to_markdown(html: str) -> str:
    parser = _HtmlToMarkdown()
    parser.feed(html)
    return parser.markdown()


def main():
    for i, preview in enumerate(PREVIEWS):
        subject, html = preview["compose"]()
        body = html_to_markdown(html)

        if i > 0:
            print("\n")
        print(f"> {preview['label']}")
        print(f"**Subject:** {subject}\n")
        print(body)


if __name__ == "__main__":
    main()
