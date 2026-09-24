"""Fetches Open Graph metadata for a pasted link, so a card can show a
thumbnail of the destination site instead of a bare URL.

SECURITY NOTE — this is the one place in the app where the SERVER fetches a
URL that a user supplied. That is a server-side request forgery (SSRF) risk:
without checks, someone could paste http://169.254.169.254/ (cloud metadata),
http://localhost:8000/api/... or an address inside the host's private network
and use this server as a proxy to read things it can reach and they can't.

The defenses, in order:
  1. Only http/https. No file://, ftp://, gopher://, data:.
  2. Every resolved IP must be a globally routable address (not private,
     loopback, link-local, carrier-grade NAT, reserved or multicast) — and
     the check runs again on each redirect hop, because a public hostname
     is free to redirect to 127.0.0.1.
  2b. The address the socket ACTUALLY connected to is checked again before
     a single byte of the request is sent. Resolving the name, approving
     the answer and then letting the HTTP library resolve it a second time
     is a classic hole (DNS rebinding): a hostile DNS server answers with a
     public address for the check and 127.0.0.1 for the connection. Checking
     the connected peer closes it. No proxy from the environment is used,
     so the peer really is the destination.
  3. Redirects are followed manually, capped, and re-validated each time.
  4. Hard timeout, and the response body is read up to a byte cap only —
     a malicious server can't stream gigabytes into memory.
  5. Only text/html is parsed; anything else is discarded.

No third-party HTTP client is used, so this adds no dependency to install.
"""

import html
import http.client
import ipaddress
import re
import socket
import urllib.error
import urllib.parse
import urllib.request

FETCH_TIMEOUT = 9              # seconds per hop
MAX_REDIRECTS = 3
MAX_BYTES = 512 * 1024         # only the <head> is needed; 512KB is plenty
# A great many sites 403 or serve a stripped page to an obviously-robotic
# User-Agent, which is why the first version of this came back with no image
# for perfectly ordinary links. This is a real browser UA with the bot's
# identity appended, so the site still knows what we are.
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36 PortfolioLinkPreview/1.1"
)


class UnsafeUrl(Exception):
    """Raised when a URL points somewhere the server must not fetch."""


def _assert_public_host(hostname: str):
    """Resolves the hostname and rejects it if ANY address it maps to is
    private/loopback/link-local/reserved. All addresses are checked, not just
    the first, so a hostname resolving to both a public and a private IP
    can't slip through."""
    if not hostname:
        raise UnsafeUrl("No hostname")
    try:
        infos = socket.getaddrinfo(hostname, None)
    except socket.gaierror as exc:
        raise UnsafeUrl(f"Couldn't resolve {hostname}") from exc

    for info in infos:
        if not _is_public_ip(info[4][0]):
            raise UnsafeUrl(f"{hostname} resolves to a non-public address")


def _is_public_ip(address: str) -> bool:
    """True only for a globally routable unicast address.

    `is_global` rather than a list of private ranges: it also excludes the
    carrier-grade NAT block (100.64.0.0/10), benchmarking and documentation
    ranges, which a hand-kept list forgets. An IPv4 address written in IPv6
    form (::ffff:127.0.0.1) is unwrapped first, because older Pythons judge
    the wrapper and not the address inside it."""
    try:
        ip = ipaddress.ip_address(str(address).split("%", 1)[0])
    except ValueError:
        return False
    if ip.version == 6 and ip.ipv4_mapped is not None:
        ip = ip.ipv4_mapped
    return ip.is_global and not ip.is_multicast


def _assert_peer_public(sock):
    """Refuse the connection if it landed somewhere non-public (see 2b)."""
    try:
        peer = sock.getpeername()[0]
    except OSError as exc:
        raise UnsafeUrl("Couldn't reach that link") from exc
    if not _is_public_ip(peer):
        try:
            sock.close()
        finally:
            raise UnsafeUrl("That link points at a non-public address")


class _CheckedHTTPConnection(http.client.HTTPConnection):
    def connect(self):
        super().connect()
        _assert_peer_public(self.sock)


class _CheckedHTTPSConnection(http.client.HTTPSConnection):
    def connect(self):
        super().connect()
        _assert_peer_public(self.sock)


class _CheckedHTTPHandler(urllib.request.HTTPHandler):
    def http_open(self, req):
        return self.do_open(_CheckedHTTPConnection, req)


class _CheckedHTTPSHandler(urllib.request.HTTPSHandler):
    def https_open(self, req):
        return self.do_open(_CheckedHTTPSConnection, req, context=self._context)


def _validate(url: str) -> str:
    parts = urllib.parse.urlsplit(url)
    if parts.scheme not in ("http", "https"):
        raise UnsafeUrl("Only http and https links can be previewed")
    _assert_public_host(parts.hostname or "")
    return url


def _fetch(url: str) -> tuple[str, str]:
    """Returns (final_url, html_text). Redirects are followed by hand so each
    hop can be re-validated — urllib would otherwise follow a redirect into a
    private address without asking."""
    current = _validate(url)

    for _ in range(MAX_REDIRECTS + 1):
        request = urllib.request.Request(
            current,
            headers={
                "User-Agent": USER_AGENT,
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
            },
        )
        # No redirect handler: a 3xx comes back as an HTTPError we inspect.
        # No proxy either (ProxyHandler({})), and connection classes that
        # check the address they actually reached before anything is sent.
        opener = urllib.request.build_opener(
            urllib.request.ProxyHandler({}),
            _CheckedHTTPHandler,
            _CheckedHTTPSHandler,
            _NoRedirect,
        )
        try:
            with opener.open(request, timeout=FETCH_TIMEOUT) as response:
                content_type = (response.headers.get("Content-Type") or "").lower()
                if "html" not in content_type:
                    raise UnsafeUrl("That link isn't an HTML page")
                raw = response.read(MAX_BYTES)
                charset = response.headers.get_content_charset() or "utf-8"
                return current, raw.decode(charset, errors="replace")
        except urllib.error.HTTPError as exc:
            if exc.code in (301, 302, 303, 307, 308):
                location = exc.headers.get("Location")
                if not location:
                    raise UnsafeUrl("Redirect without a destination")
                current = _validate(urllib.parse.urljoin(current, location))
                continue
            raise UnsafeUrl(f"Site returned {exc.code}") from exc
        except (urllib.error.URLError, socket.timeout, OSError) as exc:
            raise UnsafeUrl("Couldn't reach that link") from exc

    raise UnsafeUrl("Too many redirects")


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: ARG002 - urllib's signature
        return None   # surfaces as HTTPError so _fetch can re-validate the hop


_META_RE = re.compile(r"<meta\s+[^>]*>", re.I)
_ATTR_RE = re.compile(r'([a-zA-Z:\-]+)\s*=\s*"([^"]*)"|([a-zA-Z:\-]+)\s*=\s*\'([^\']*)\'')
_TITLE_RE = re.compile(r"<title[^>]*>(.*?)</title>", re.I | re.S)
_LINK_RE = re.compile(r"<link\b[^>]*>", re.I)

# Ordered worst-to-best; a later find wins. og:image is still preferred over
# all of these — these are the fallbacks for sites that never adopted Open
# Graph (python.org among them), so the card shows *something* real from the
# site instead of an empty grey box.
_ICON_RANK = {
    "icon": 1,
    "shortcut icon": 1,
    "apple-touch-icon-precomposed": 2,
    "apple-touch-icon": 3,
    "image_src": 4,
    "thumbnail": 4,
}


def _link_image(page: str) -> str:
    """Best <link rel="..."> image on the page: a share thumbnail if the site
    offers one, otherwise the largest touch icon, otherwise the favicon."""
    best, best_rank, best_size = "", 0, 0
    for tag in _LINK_RE.findall(page[:MAX_BYTES]):
        attrs = {}
        for m in _ATTR_RE.finditer(tag):
            key = (m.group(1) or m.group(3) or "").lower()
            attrs[key] = m.group(2) if m.group(2) is not None else (m.group(4) or "")
        rel = (attrs.get("rel") or "").strip().lower()
        href = (attrs.get("href") or "").strip()
        rank = _ICON_RANK.get(rel, 0)
        if not href or not rank:
            continue
        # "180x180" -> 180, so the biggest touch icon wins over a 16px favicon.
        size = 0
        sizes = (attrs.get("sizes") or "").lower()
        match = re.match(r"(\d+)\s*[x\u00d7]\s*(\d+)", sizes)
        if match:
            size = int(match.group(1))
        if (rank, size) > (best_rank, best_size):
            best, best_rank, best_size = href, rank, size
    return best


def _meta_map(page: str) -> dict:
    """Pulls <meta> name/property → content pairs out of the page.

    A regex rather than a parser: this only needs a handful of well-known
    tags from the <head>, and it avoids adding BeautifulSoup as a dependency
    for one small job.
    """
    found = {}
    for tag in _META_RE.findall(page[:MAX_BYTES]):
        attrs = {}
        for m in _ATTR_RE.finditer(tag):
            key = (m.group(1) or m.group(3) or "").lower()
            value = m.group(2) if m.group(2) is not None else (m.group(4) or "")
            attrs[key] = value
        key = (attrs.get("property") or attrs.get("name") or "").lower()
        if key and "content" in attrs and key not in found:
            found[key] = attrs["content"]
    return found


def _clean(text: str, limit: int) -> str:
    text = html.unescape(text or "").strip()
    text = re.sub(r"\s+", " ", text)
    return text[:limit]


def fetch_preview(url: str) -> dict:
    """Returns {ok, title, description, image, site_name}. Never raises —
    a link that can't be read comes back ok=False so the caller can cache
    the failure and stop retrying it on every page view."""
    try:
        final_url, page = _fetch(url)
    except UnsafeUrl:
        return {"ok": False, "title": "", "description": "", "image": "", "site_name": ""}
    except Exception:
        return {"ok": False, "title": "", "description": "", "image": "", "site_name": ""}

    meta = _meta_map(page)

    title = meta.get("og:title") or meta.get("twitter:title") or ""
    if not title:
        match = _TITLE_RE.search(page)
        title = match.group(1) if match else ""

    description = (
        meta.get("og:description")
        or meta.get("twitter:description")
        or meta.get("description")
        or ""
    )
    image = (
        meta.get("og:image")
        or meta.get("twitter:image")
        or meta.get("twitter:image:src")
        or meta.get("og:image:url")
        or meta.get("image")
        or _link_image(page)
    )
    if image:
        # Relative image paths are common; make them absolute against the
        # page they came from, and drop anything that isn't http(s).
        image = urllib.parse.urljoin(final_url, image.strip())
        if urllib.parse.urlsplit(image).scheme not in ("http", "https"):
            image = ""

    if not image:
        # Every site has one of these even when it declares nothing at all.
        parts = urllib.parse.urlsplit(final_url)
        if parts.scheme in ("http", "https") and parts.hostname:
            image = f"{parts.scheme}://{parts.netloc}/favicon.ico"

    site_name = meta.get("og:site_name") or urllib.parse.urlsplit(final_url).hostname or ""

    return {
        "ok": True,
        "title": _clean(title, 300),
        "description": _clean(description, 600),
        "image": image[:1000],
        "site_name": _clean(site_name, 200),
    }
