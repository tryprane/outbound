"""
website_scraper.py  -- FIXED & HARDENED
=========================================
See inline comments marked FIX #N for each root-cause fix.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import random
import re
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Optional
from urllib.parse import urljoin, urlparse

logger = logging.getLogger(__name__)

_DEBUG_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'debug-screenshots')
_USER_DATA_DIR = os.path.join(Path.home(), '.outreachos-browser-profile')

_CF_IFRAME_PATTERN = re.compile(r"challenges\.cloudflare\.com/cdn-cgi/challenge-platform/.*")

_CONTACT_KEYWORDS = re.compile(
    r"(contact|reach|get.?in.?touch|connect|about|team|support)",
    re.IGNORECASE,
)

_FALLBACK_SLUGS = [
    "/contact",
    "/contact-us",
    "/contact-us.html",
    "/contact.html",
    "/customer-service/contact-us",
    "/about",
    "/about-us",
    "/reach-us",
    "/get-in-touch",
    "/connect",
    "/team",
    "/support",
    "/help",
]

_BOT_BLOCK_MARKERS = [
    'Verify you are human',
    'Just a moment...',
    'challenges.cloudflare.com',
    'Enable JavaScript and cookies to continue',
    'Access denied',
    'Ray ID',
]

_playwright = None
_context = None
_browser_page = None
_BROWSER_EXECUTOR = ThreadPoolExecutor(max_workers=1, thread_name_prefix="patchright")


def _ensure_dirs():
    os.makedirs(_DEBUG_DIR, exist_ok=True)
    os.makedirs(_USER_DATA_DIR, exist_ok=True)


def _start_browser(headless: bool = True):
    global _playwright, _context, _browser_page
    _ensure_dirs()
    if _browser_page is not None:
        return _browser_page
    logger.info("Launching persistent Patchright browser (headless=%s)...", headless)
    from patchright.sync_api import sync_playwright as _sync_playwright
    _playwright = _sync_playwright().start()
    _context = _playwright.chromium.launch_persistent_context(
        user_data_dir=_USER_DATA_DIR,
        headless=headless,
        channel='chrome',
        viewport={'width': 1366, 'height': 768},
        args=['--disable-blink-features=AutomationControlled', '--no-sandbox'],
        ignore_default_args=['--enable-automation'],
    )
    _browser_page = _context.pages[0] if _context.pages else _context.new_page()
    _browser_page.add_init_script(
        "Object.defineProperty(navigator, 'webdriver', { get: () => undefined });"
    )
    logger.info("Browser ready.")
    return _browser_page


def _close_browser():
    def _do_close():
        global _playwright, _context, _browser_page
        try:
            if _context: _context.close()
            if _playwright: _playwright.stop()
        except Exception:
            pass
        _playwright = _context = _browser_page = None
    future = _BROWSER_EXECUTOR.submit(_do_close)
    try:
        future.result(timeout=15)
    except Exception:
        pass


def _solve_turnstile(page, max_attempts: int = 7) -> bool:
    page_text = page.content()
    if not any(m in page_text for m in _BOT_BLOCK_MARKERS):
        return True
    logger.info("Cloudflare Turnstile detected -- solving...")
    for attempt in range(1, max_attempts + 1):
        page_text = page.content()
        if not any(m in page_text for m in _BOT_BLOCK_MARKERS):
            logger.info("Turnstile passed (attempt %d)", attempt)
            return True
        cf_iframe = page.frame(url=_CF_IFRAME_PATTERN)
        if cf_iframe is not None:
            try:
                frame_el = cf_iframe.frame_element()
                if frame_el.is_visible():
                    box = frame_el.bounding_box()
                    if box:
                        page.mouse.move(box['x']+box['width']*0.5, box['y']+box['height']*0.5, steps=random.randint(8,20))
                        page.wait_for_timeout(random.randint(300,700))
                        page.mouse.click(box['x']+random.randint(22,32), box['y']+random.randint(22,30), delay=random.randint(80,220))
                        page.wait_for_timeout(random.randint(3000,5000))
                        continue
            except Exception as e:
                logger.debug("Turnstile iframe click error: %s", e)
        try:
            checkbox = page.locator('input[type="checkbox"]').first
            if checkbox.is_visible(timeout=2000):
                box = checkbox.bounding_box()
                if box:
                    page.mouse.click(box['x']+random.randint(2,max(3,int(box['width'])-2)), box['y']+random.randint(2,max(3,int(box['height'])-2)), delay=random.randint(80,200))
                    page.wait_for_timeout(random.randint(3000,5000))
                    continue
        except Exception:
            pass
        for sel in ['#cf-turnstile','[class*="turnstile"]']:
            try:
                el = page.locator(sel).first
                if el.is_visible(timeout=1000):
                    box = el.bounding_box()
                    if box:
                        page.mouse.click(box['x']+random.randint(20,30), box['y']+random.randint(20,28), delay=random.randint(80,200))
                        page.wait_for_timeout(random.randint(3000,5000))
                        break
            except Exception:
                continue
        page.wait_for_timeout(random.randint(2000,4000))
    page_text = page.content()
    solved = not any(m in page_text for m in _BOT_BLOCK_MARKERS)
    if not solved:
        logger.warning("Turnstile may still be present after %d attempts", max_attempts)
    return solved


def _fetch_with_httpx(url: str) -> Optional[tuple[str, str]]:
    try:
        import httpx
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
        }
        resp = httpx.get(url, headers=headers, follow_redirects=True, timeout=20)
        if resp.status_code in range(200, 400):
            html = resp.text
            if not any(m in html for m in _BOT_BLOCK_MARKERS):
                logger.debug("[httpx] OK: %s (status=%d)", url, resp.status_code)
                return html, _html_to_text(html)
            logger.debug("[httpx] Bot-block detected for %s", url)
        else:
            logger.debug("[httpx] Bad status %d for %s", resp.status_code, url)
    except Exception as exc:
        logger.debug("[httpx] Failed for %s: %s", url, exc)
    return None


def _fetch_with_browser(url: str, headless: bool = True) -> Optional[tuple[str, str]]:
    try:
        page = _start_browser(headless=headless)
        logger.debug("[browser] Navigating: %s", url)
        try:
            page.goto(url, wait_until='domcontentloaded', timeout=60000)
            page.wait_for_timeout(3000)
        except Exception as e:
            logger.debug("[browser] Navigation warning: %s", e)
        _solve_turnstile(page)
        try:
            page.wait_for_load_state('networkidle', timeout=15000)
        except Exception:
            pass
        page.wait_for_timeout(2000)
        html = page.content()
        try:
            text = page.inner_text("body")
        except Exception:
            text = _html_to_text(html)
        # FIX #4: guard against empty / stub responses
        if html and len(html) > 500 and not any(m in html for m in _BOT_BLOCK_MARKERS):
            logger.debug("[browser] OK: %s (%d chars)", url, len(html))
            return html, text
        logger.debug("[browser] Still bot-blocked or empty for %s (len=%d)", url, len(html) if html else 0)
    except Exception as exc:
        logger.debug("[browser] Failed for %s: %s", url, exc)
    return None


def _fetch_page_html(url: str, headless: bool = True) -> Optional[tuple[str, str]]:
    res = _fetch_with_httpx(url)
    if res is not None:
        return res
    logger.debug("httpx failed -- falling back to browser for: %s", url)
    future = _BROWSER_EXECUTOR.submit(_fetch_with_browser, url, headless)
    try:
        return future.result(timeout=120)
    except Exception as exc:
        logger.debug("[browser] Executor error for %s: %s", url, exc)
        return None


async def _async_fetch(url: str, headless: bool = True) -> Optional[tuple[str, str]]:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _fetch_page_html, url, headless)


# ═══════════════════════════════════════════════════════════════════
# FIX #3  --  Broadened mailto extractor
# ═══════════════════════════════════════════════════════════════════
# Old: r"href=[\"']mailto:([^\"'?]+)[\"']"    <- case sensitive, quotes required
# New: handles uppercase HREF/MAILTO, unquoted hrefs, trims query strings
_MAILTO_RE = re.compile(
    r'href\s*=\s*["\']?\s*mailto:\s*([^\s"\'?><]+)',
    re.IGNORECASE,
)

def _extract_mailtos(html: str) -> list[str]:
    results = []
    for m in _MAILTO_RE.finditer(html):
        email = m.group(1).strip().lower().rstrip('/')
        if '@' in email:
            results.append(email)
    return results


def _decode_cf_email(encoded: str) -> str:
    try:
        key = int(encoded[:2], 16)
        return "".join(chr(int(encoded[i:i+2], 16) ^ key) for i in range(2, len(encoded), 2))
    except Exception:
        return ""

def _extract_cf_emails(html: str) -> list[str]:
    emails: list[str] = []
    for encoded in re.findall(r'data-cfemail=["\']([a-f0-9]+)["\']', html, re.IGNORECASE):
        decoded = _decode_cf_email(encoded)
        if decoded and "@" in decoded:
            emails.append(decoded.strip().lower())
    seen: set[str] = set()
    result: list[str] = []
    for e in emails:
        if e not in seen:
            seen.add(e)
            result.append(e)
    return result


def _html_to_text(html: str) -> str:
    # Preserve JSON-LD blocks (stripped later by _extract_jsonld)
    cleaned = re.sub(r'<script(?![^>]*application/ld\+json)[^>]*>.*?</script>', '', html, flags=re.DOTALL|re.IGNORECASE)
    cleaned = re.sub(r'<style[^>]*>.*?</style>', '', cleaned, flags=re.DOTALL|re.IGNORECASE)
    return re.sub(r'<[^>]+>', ' ', cleaned)


# ═══════════════════════════════════════════════════════════════════
# FIX #6  --  JSON-LD / Schema.org structured data
# ═══════════════════════════════════════════════════════════════════
def _extract_jsonld(html: str) -> tuple[list[str], list[str]]:
    """Parse JSON-LD blocks and return (phones, emails)."""
    phones: list[str] = []
    emails: list[str] = []
    for raw_json in re.findall(
        r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
        html, flags=re.DOTALL|re.IGNORECASE,
    ):
        try:
            data = json.loads(raw_json.strip())
        except Exception:
            continue
        nodes = data if isinstance(data, list) else [data]
        def _walk(obj):
            if isinstance(obj, dict):
                for k, v in obj.items():
                    kl = k.lower()
                    if kl in ('telephone', 'phone', 'faxnumber'):
                        if isinstance(v, str) and v.strip():
                            phones.append(v.strip())
                    elif kl == 'email':
                        if isinstance(v, str) and v.strip():
                            emails.append(v.strip().lower())
                    elif kl == 'contactpoint':
                        for item in (v if isinstance(v, list) else [v]):
                            _walk(item)
                    else:
                        _walk(v)
            elif isinstance(obj, list):
                for item in obj:
                    _walk(item)
        for node in nodes:
            _walk(node)
    return phones, emails


# ═══════════════════════════════════════════════════════════════════
# FIX #7  --  Meta tag contact extraction
# ═══════════════════════════════════════════════════════════════════
def _extract_meta_contact(html: str) -> tuple[list[str], list[str]]:
    """Extract phone/email from <meta> tags (og:phone_number etc). Returns (phones, emails)."""
    phones: list[str] = []
    emails: list[str] = []
    # name/property before content
    for m in re.finditer(
        r'<meta\s+(?:[^>]*?\s+)?(?:property|name)\s*=\s*["\']([^"\']+)["\'][^>]*content\s*=\s*["\']([^"\']+)["\']',
        html, re.IGNORECASE,
    ):
        prop, content = m.group(1).lower(), m.group(2).strip()
        if any(k in prop for k in ('phone','tel','mobile')):
            phones.append(content)
        elif 'email' in prop:
            emails.append(content.lower())
    # content before name/property
    for m in re.finditer(
        r'<meta\s+(?:[^>]*?\s+)?content\s*=\s*["\']([^"\']+)["\'][^>]*(?:property|name)\s*=\s*["\']([^"\']+)["\']',
        html, re.IGNORECASE,
    ):
        content, prop = m.group(1).strip(), m.group(2).lower()
        if any(k in prop for k in ('phone','tel','mobile')):
            phones.append(content)
        elif 'email' in prop:
            emails.append(content.lower())
    return phones, emails


# ═══════════════════════════════════════════════════════════════════
# FIX #8  --  NANP bare format (800-843-3269, (800) 843-3269, etc.)
# ═══════════════════════════════════════════════════════════════════
_NANP_BARE_RE = re.compile(
    r'(?<!\d)'
    r'(?:'
    r'\((\d{3})\)[\s\-.](\d{3})[\s\-.](\d{4})'   # (NXX) NXX-XXXX
    r'|(\d{3})[\-.](\d{3})[\-.](\d{4})'            # NXX-NXX-XXXX or NXX.NXX.XXXX
    r'|(\d{3})\s(\d{3})\s(\d{4})'                  # NXX NXX XXXX (space-separated)
    r')'
    r'(?!\d)',
    re.MULTILINE,
)

def _extract_nanp_bare(text: str) -> list[str]:
    results = []
    seen: set[str] = set()
    for m in _NANP_BARE_RE.finditer(text):
        groups = [g for g in m.groups() if g is not None]
        if len(groups) >= 3:
            e164 = f"+1{groups[0]}{groups[1]}{groups[2]}"
            if e164 not in seen:
                seen.add(e164)
                results.append(e164)
    return results


def _is_same_origin(href: str, base_url: str) -> bool:
    try:
        ph = urlparse(href)
        pb = urlparse(base_url)
        if not ph.netloc:
            return True
        return ph.netloc == pb.netloc
    except Exception:
        return False


def _find_contact_links(html: str, base_url: str) -> list[str]:
    found: list[str] = []
    seen: set[str] = set()
    for href, text in re.findall(
        r'<a[^>]+href=["\']([^"\']+)["\'][^>]*>(.*?)</a>',
        html, flags=re.IGNORECASE|re.DOTALL,
    ):
        href = href.strip()
        text = re.sub(r'<[^>]+>', '', text).strip()
        if not href or href.startswith(('mailto:','tel:','javascript:','#')):
            continue
        abs_url = urljoin(base_url, href)
        if not _is_same_origin(abs_url, base_url) or abs_url in seen:
            continue
        path = urlparse(abs_url).path
        if _CONTACT_KEYWORDS.search(path) or _CONTACT_KEYWORDS.search(text):
            found.append(abs_url)
            seen.add(abs_url)
    return found


def _campaign_regions(campaign_type: str, regions: list[str] | None) -> list[str] | None:
    if regions is not None:
        return regions
    if campaign_type == "indian":
        return ["south_asia"]
    return None


# ── Main scrape function ──────────────────────────────────────────────────────

async def scrape_website(
    url: str,
    campaign_type: str = "indian",
    regions: list[str] | None = None,
    extract: list[str] | None = None,
    follow_contact_page: bool = True,
    headless: bool = True,
) -> dict:
    if extract is None:
        extract = ["email", "phone"]

    if not url.startswith(("http://", "https://")):
        url = "https://" + url

    parsed = urlparse(url)
    base_url = f"{parsed.scheme}://{parsed.netloc}"

    from scrapers.email_extractor import _is_valid, best_email
    from scrapers.phone_extractor import extract_all_phones, phones_as_dicts, PhoneResult

    pages_checked: list[str] = []
    all_text = ""
    all_html = ""
    all_mailtos: list[str] = []
    all_cf_emails: list[str] = []
    jsonld_phones: list[str] = []
    jsonld_emails: list[str] = []
    meta_phones: list[str] = []
    meta_emails: list[str] = []

    def _process_page_data(html: str, text: str, page_url: str) -> None:
        nonlocal all_text, all_html
        all_text += " " + text
        all_html += " " + html
        all_mailtos.extend(_extract_mailtos(html))
        all_cf_emails.extend(_extract_cf_emails(html))
        jld_p, jld_e = _extract_jsonld(html)
        jsonld_phones.extend(jld_p)
        jsonld_emails.extend(jld_e)
        if jld_p or jld_e:
            logger.debug("[JSON-LD] %s -> phones=%s emails=%s", page_url, jld_p, jld_e)
        mt_p, mt_e = _extract_meta_contact(html)
        meta_phones.extend(mt_p)
        meta_emails.extend(mt_e)
        if mt_p or mt_e:
            logger.debug("[Meta] %s -> phones=%s emails=%s", page_url, mt_p, mt_e)

    logger.info("[Scraper] Fetching homepage: %s", url)
    fetch_result = await _async_fetch(url, headless)

    if fetch_result:
        homepage_html, homepage_text = fetch_result
        pages_checked.append(url)
        _process_page_data(homepage_html, homepage_text, url)

        contact_urls: list[str] = []
        if follow_contact_page:
            contact_urls = _find_contact_links(homepage_html, base_url)
            if not contact_urls:
                contact_urls = [urljoin(base_url, slug) for slug in _FALLBACK_SLUGS]
                logger.debug("[Scraper] No contact links in HTML (JS nav?), using %d fallback slugs", len(contact_urls))
            # FIX #5: de-dup + higher cap
            contact_urls = [u for u in contact_urls if u not in pages_checked]
            contact_urls = contact_urls[:5]

        for contact_url in contact_urls:
            cp_result = await _async_fetch(contact_url, headless)
            if cp_result is None:
                continue
            pages_checked.append(contact_url)
            _process_page_data(cp_result[0], cp_result[1], contact_url)
    else:
        logger.warning("[Scraper] Could not fetch homepage: %s", url)

    result: dict = {
        "email": None,
        "phone": None,
        "all_phones": [],
        "pages_checked": pages_checked,
    }

    if "email" in extract:
        # P1: JSON-LD (explicit, structured, most reliable)
        for e in jsonld_emails:
            if _is_valid(e):
                result["email"] = e
                logger.debug("[Scraper] Email <- JSON-LD: %s", e)
                break
        # P2: mailto: hrefs from rendered HTML
        if not result["email"]:
            for m in all_mailtos:
                m_clean = m.strip().lower()
                if _is_valid(m_clean):
                    result["email"] = m_clean
                    logger.debug("[Scraper] Email <- mailto link: %s", m_clean)
                    break
        # P3: Cloudflare-obfuscated emails
        if not result["email"]:
            for m in all_cf_emails:
                if _is_valid(m):
                    result["email"] = m
                    logger.debug("[Scraper] Email <- CF decode: %s", m)
                    break
        # P4: meta tags
        if not result["email"]:
            for e in meta_emails:
                if _is_valid(e):
                    result["email"] = e
                    logger.debug("[Scraper] Email <- meta tag: %s", e)
                    break
        # P5: plain-text regex (last resort)
        if not result["email"]:
            result["email"] = best_email(all_text)
            if result["email"]:
                logger.debug("[Scraper] Email <- text regex: %s", result["email"])

    if "phone" in extract:
        phone_regions = _campaign_regions(campaign_type, regions)
        phone_results = extract_all_phones(all_text, html=all_html, regions=phone_regions)
        seen_e164 = {r.e164 for r in phone_results}

        # Inject JSON-LD phones (score=200, beats everything)
        for raw_phone in jsonld_phones:
            digits = re.sub(r'\D', '', raw_phone)
            e164c = raw_phone if raw_phone.startswith('+') else f"+{digits}"
            if e164c not in seen_e164:
                phone_results.insert(0, PhoneResult(raw=raw_phone, e164=e164c, country="Unknown", dial_code="", subscriber=digits, source="jsonld", score=200))
                seen_e164.add(e164c)
                logger.debug("[Scraper] Phone <- JSON-LD: %s", e164c)

        # Inject meta-tag phones (score=80)
        for raw_phone in meta_phones:
            digits = re.sub(r'\D', '', raw_phone)
            e164c = raw_phone if raw_phone.startswith('+') else f"+{digits}"
            if e164c not in seen_e164:
                phone_results.append(PhoneResult(raw=raw_phone, e164=e164c, country="Unknown", dial_code="", subscriber=digits, source="meta_tag", score=80))
                seen_e164.add(e164c)

        # FIX #8: NANP bare fallback (score=50) -- catches "800-843-3269" with no +1 prefix
        for e164 in _extract_nanp_bare(all_text):
            if e164 not in seen_e164:
                phone_results.append(PhoneResult(raw=e164, e164=e164, country="USA/Canada", dial_code="+1", subscriber=e164[2:], source="nanp_bare", score=50))
                seen_e164.add(e164)
                logger.debug("[Scraper] Phone <- NANP bare: %s", e164)

        phone_results.sort(key=lambda r: -r.score)
        result["all_phones"] = phones_as_dicts(phone_results)
        result["phone"] = phone_results[0].e164 if phone_results else None

    logger.info(
        "[Scraper] Done: %s -> email=%s phone=%s all_phones=%d pages_checked=%s",
        url, result["email"], result["phone"], len(result["all_phones"]), pages_checked,
    )
    return result
