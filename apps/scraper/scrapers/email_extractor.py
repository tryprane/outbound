"""
email_extractor.py
Extracts email addresses from raw webpage text using regex.
Handles common obfuscation patterns like (at), [dot] etc.

FIXES vs original:
  - _clean_raw_email() strips mailto: scheme and ?query params before
    validation, so "mailto:foo@bar.com?subject=Hi" parses correctly.
  - _is_valid() calls _clean_raw_email() first so it works regardless of
    whether the caller pre-cleaned the input or not.
  - NOTE: The extractor logic itself was correct in the original. The real
    failure was upstream in website_scraper.py — JS-rendered contact data
    was never extracted so this function was fed empty/useless text.
    See website_scraper.py for the primary fixes.
"""

import re
from typing import Optional


# Standard email regex
_EMAIL_RE = re.compile(
    r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}",
    re.IGNORECASE,
)

# Obfuscated patterns: "name [at] domain [dot] com"
_OBFUSCATED_RE = re.compile(
    r"([a-zA-Z0-9._%+\-]+)\s*(?:\[at\]|\(at\)|@\s*)\s*"
    r"([a-zA-Z0-9.\-]+)\s*(?:\[dot\]|\(dot\)|\.\s*)\s*"
    r"([a-zA-Z]{2,})",
    re.IGNORECASE,
)

# Domains to exclude (no-reply, system addresses)
_EXCLUDED_DOMAINS = {
    "example.com", "sentry.io", "w3.org",
    "schema.org", "google.com", "facebook.com",
    "twitter.com", "instagram.com", "linkedin.com",
    "amazonaws.com", "cloudflare.com",
}

# Prefixes to exclude
_EXCLUDED_PREFIXES = {
    "noreply", "no-reply", "donotreply", "do-not-reply",
    "mailer-daemon", "postmaster", "bounce", "support_noreply",
}


def _clean_raw_email(raw: str) -> str:
    """
    FIX: Strip mailto: scheme and query params from a raw email string.

    Handles cases where href values ("mailto:foo@bar.com?subject=Hi")
    are passed directly rather than pre-cleaned by the caller.
    """
    s = raw.strip()
    s = re.sub(r'^mailto:\s*', '', s, flags=re.IGNORECASE)
    s = s.split('?')[0].strip()
    return s.lower()


def _is_valid(email: str) -> bool:
    email = _clean_raw_email(email)
    local, _, domain = email.partition("@")
    if not local or not domain:
        return False
    local_lower = local.lower().replace("-", "").replace("_", "")
    if local_lower in _EXCLUDED_PREFIXES:
        return False
    domain_lower = domain.lower()
    if any(domain_lower.endswith(bad) for bad in _EXCLUDED_DOMAINS):
        return False
    # Skip if local part looks like a file extension
    if re.match(r".*\.(png|jpg|gif|svg|css|js|woff|ttf)$", local_lower):
        return False
    return True


def extract_emails(text: str) -> list[str]:
    """
    Extract valid email addresses from raw text.
    Deduplicates and filters noisy system addresses.
    Returns a list ranked by likely importance (shortest domain wins).
    """
    found: set[str] = set()

    # Standard matches
    for match in _EMAIL_RE.findall(text):
        email = _clean_raw_email(match)
        if _is_valid(email):
            found.add(email)

    # Obfuscated matches
    for m in _OBFUSCATED_RE.finditer(text):
        email = _clean_raw_email(f"{m.group(1)}@{m.group(2)}.{m.group(3)}")
        if _is_valid(email):
            found.add(email)

    # Sort: prefer shorter domains (more likely to be the company's own domain)
    return sorted(found, key=lambda e: len(e.split("@")[1]))


def best_email(text: str) -> Optional[str]:
    """Returns the single best email address found in the text."""
    emails = extract_emails(text)
    return emails[0] if emails else None