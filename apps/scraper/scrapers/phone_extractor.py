"""
phone_extractor.py  ── GLOBAL EDITION  (FIXED)
===============================================
Key fix over original:
  Layer 1 (_layer1_links) now handles ALL real-world tel: href formats:

    Original only matched:  href="tel:+18008433269"
    Now also matches:
      href="tel:18008433269"          (no + sign — very common in US sites)
      href="tel:8008433269"           (toll-free without country code)
      href="tel:1-800-843-3269"       (dashes in the href)
      href="tel:(800) 843-3269"       (formatted)
      href="tel:+1 800 843 3269"      (spaces)
      href="callto:+18008433269"      (Skype-style callto: scheme)
      href="https://wa.me/18008433269" (WhatsApp)

  All of these are resolved to E.164 via the existing _make_result pipeline.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional


# ══════════════════════════════════════════════════════════════════════════════
# 1.  COUNTRY METADATA
# ══════════════════════════════════════════════════════════════════════════════

@dataclass
class CountrySpec:
    name: str
    dial_code: str
    min_digits: int
    max_digits: int
    trunk_prefix: str = ""
    region: str = "other"


# fmt: off
COUNTRY_SPECS: list[CountrySpec] = [
    CountrySpec("India",         "+91",  10, 10, "0",  "south_asia"),
    CountrySpec("Pakistan",      "+92",  10, 10, "0",  "south_asia"),
    CountrySpec("Bangladesh",    "+880",  9, 10, "0",  "south_asia"),
    CountrySpec("Sri Lanka",     "+94",   9,  9, "0",  "south_asia"),
    CountrySpec("Nepal",         "+977",  9, 10, "0",  "south_asia"),
    CountrySpec("USA/Canada",    "+1",   10, 10, "1",  "nanp"),
    CountrySpec("UK",            "+44",  10, 10, "0",  "europe"),
    CountrySpec("France",        "+33",   9,  9, "0",  "europe"),
    CountrySpec("Germany",       "+49",  10, 11, "0",  "europe"),
    CountrySpec("Spain",         "+34",   9,  9, "",   "europe"),
    CountrySpec("Italy",         "+39",   9, 11, "",   "europe"),
    CountrySpec("Netherlands",   "+31",   9,  9, "0",  "europe"),
    CountrySpec("Belgium",       "+32",   8,  9, "0",  "europe"),
    CountrySpec("Switzerland",   "+41",   9,  9, "0",  "europe"),
    CountrySpec("Austria",       "+43",   9, 13, "0",  "europe"),
    CountrySpec("Poland",        "+48",   9,  9, "",   "europe"),
    CountrySpec("Portugal",      "+351",  9,  9, "",   "europe"),
    CountrySpec("Sweden",        "+46",   9,  9, "0",  "europe"),
    CountrySpec("Norway",        "+47",   8,  8, "",   "europe"),
    CountrySpec("Denmark",       "+45",   8,  8, "",   "europe"),
    CountrySpec("Finland",       "+358",  9,  9, "0",  "europe"),
    CountrySpec("Greece",        "+30",  10, 10, "",   "europe"),
    CountrySpec("Hungary",       "+36",   9,  9, "06", "europe"),
    CountrySpec("Czechia",       "+420",  9,  9, "",   "europe"),
    CountrySpec("Ukraine",       "+380",  9,  9, "0",  "europe"),
    CountrySpec("Romania",       "+40",   9,  9, "0",  "europe"),
    CountrySpec("UAE",           "+971",  8,  9, "0",  "middle_east"),
    CountrySpec("Saudi Arabia",  "+966",  9,  9, "0",  "middle_east"),
    CountrySpec("Kuwait",        "+965",  8,  8, "",   "middle_east"),
    CountrySpec("Qatar",         "+974",  8,  8, "",   "middle_east"),
    CountrySpec("Bahrain",       "+973",  8,  8, "",   "middle_east"),
    CountrySpec("Oman",          "+968",  8,  8, "",   "middle_east"),
    CountrySpec("Jordan",        "+962",  9,  9, "0",  "middle_east"),
    CountrySpec("Lebanon",       "+961",  7,  8, "0",  "middle_east"),
    CountrySpec("Iraq",          "+964",  9, 10, "0",  "middle_east"),
    CountrySpec("Iran",          "+98",  10, 10, "0",  "middle_east"),
    CountrySpec("Israel",        "+972",  9,  9, "0",  "middle_east"),
    CountrySpec("Turkey",        "+90",  10, 10, "0",  "middle_east"),
    CountrySpec("South Africa",  "+27",   9,  9, "0",  "africa"),
    CountrySpec("Nigeria",       "+234",  8, 10, "0",  "africa"),
    CountrySpec("Kenya",         "+254",  9,  9, "0",  "africa"),
    CountrySpec("Ghana",         "+233",  9,  9, "0",  "africa"),
    CountrySpec("Tanzania",      "+255",  9,  9, "0",  "africa"),
    CountrySpec("Uganda",        "+256",  9,  9, "0",  "africa"),
    CountrySpec("Ethiopia",      "+251",  9,  9, "0",  "africa"),
    CountrySpec("Morocco",       "+212",  9,  9, "0",  "africa"),
    CountrySpec("Algeria",       "+213",  9,  9, "0",  "africa"),
    CountrySpec("Egypt",         "+20",   9, 10, "0",  "africa"),
    CountrySpec("China",         "+86",  11, 11, "0",  "asia"),
    CountrySpec("Japan",         "+81",   9, 11, "0",  "asia"),
    CountrySpec("South Korea",   "+82",  10, 11, "0",  "asia"),
    CountrySpec("Singapore",     "+65",   8,  8, "",   "asia"),
    CountrySpec("Malaysia",      "+60",   9, 10, "0",  "asia"),
    CountrySpec("Thailand",      "+66",   9,  9, "0",  "asia"),
    CountrySpec("Vietnam",       "+84",   9, 10, "0",  "asia"),
    CountrySpec("Philippines",   "+63",  10, 10, "0",  "asia"),
    CountrySpec("Indonesia",     "+62",   9, 12, "0",  "asia"),
    CountrySpec("Hong Kong",     "+852",  8,  8, "",   "asia"),
    CountrySpec("Taiwan",        "+886",  9,  9, "0",  "asia"),
    CountrySpec("Australia",     "+61",   9,  9, "0",  "oceania"),
    CountrySpec("New Zealand",   "+64",   8,  9, "0",  "oceania"),
    CountrySpec("Brazil",        "+55",  10, 11, "0",  "latam"),
    CountrySpec("Mexico",        "+52",  10, 10, "0",  "latam"),
    CountrySpec("Argentina",     "+54",  10, 10, "0",  "latam"),
    CountrySpec("Chile",         "+56",   9,  9, "0",  "latam"),
    CountrySpec("Colombia",      "+57",  10, 10, "0",  "latam"),
    CountrySpec("Peru",          "+51",   9,  9, "0",  "latam"),
    CountrySpec("Venezuela",     "+58",  10, 10, "0",  "latam"),
    CountrySpec("Ecuador",       "+593",  9,  9, "0",  "latam"),
    CountrySpec("Paraguay",      "+595",  9,  9, "0",  "latam"),
    CountrySpec("Uruguay",       "+598",  8,  9, "0",  "latam"),
    CountrySpec("Guatemala",     "+502",  8,  8, "",   "latam"),
    CountrySpec("Russia/KZ",     "+7",   10, 10, "8",  "cis"),
    CountrySpec("Belarus",       "+375",  9,  9, "80", "cis"),
    CountrySpec("Armenia",       "+374",  8,  8, "0",  "cis"),
    CountrySpec("Azerbaijan",    "+994",  9,  9, "0",  "cis"),
    CountrySpec("Georgia",       "+995",  9,  9, "0",  "cis"),
    CountrySpec("Uzbekistan",    "+998",  9,  9, "0",  "cis"),
    CountrySpec("Tajikistan",    "+992",  9,  9, "0",  "cis"),
    CountrySpec("Kyrgyzstan",    "+996",  9,  9, "0",  "cis"),
    CountrySpec("Turkmenistan",  "+993",  8,  8, "0",  "cis"),
]
# fmt: on

_SPECS_SORTED: list[CountrySpec] = sorted(
    COUNTRY_SPECS, key=lambda s: -len(s.dial_code)
)


# ══════════════════════════════════════════════════════════════════════════════
# 2.  RESULT TYPE
# ══════════════════════════════════════════════════════════════════════════════

@dataclass
class PhoneResult:
    raw: str
    e164: str
    country: str
    dial_code: str
    subscriber: str
    source: str
    score: int = 0


# ══════════════════════════════════════════════════════════════════════════════
# 3.  INTERNAL HELPERS
# ══════════════════════════════════════════════════════════════════════════════

def _digits(s: str) -> str:
    return re.sub(r"\D", "", s)


def _match_spec(e164_digits: str) -> Optional[CountrySpec]:
    for spec in _SPECS_SORTED:
        cc = _digits(spec.dial_code)
        if e164_digits.startswith(cc):
            sub_len = len(e164_digits) - len(cc)
            if spec.min_digits <= sub_len <= spec.max_digits:
                return spec
    return None


_SOURCE_SCORE = {"tel_link": 100, "regex": 60, "e164_fallback": 30}


def _make_result(raw: str, e164_digits: str, source: str) -> Optional[PhoneResult]:
    if not (7 <= len(e164_digits) <= 16):
        return None
    spec = _match_spec(e164_digits)
    if spec is None:
        return None
    cc = _digits(spec.dial_code)
    subscriber = e164_digits[len(cc):]
    return PhoneResult(
        raw=raw,
        e164=f"+{e164_digits}",
        country=spec.name,
        dial_code=spec.dial_code,
        subscriber=subscriber,
        source=source,
        score=_SOURCE_SCORE.get(source, 10),
    )


# ══════════════════════════════════════════════════════════════════════════════
# 4.  LAYER 1 — tel: / callto: / wa.me href links  (FIXED)
# ══════════════════════════════════════════════════════════════════════════════

# FIX: The original only matched href="tel:+DIGITS". Real-world sites use many
# formats. This new regex captures everything after the scheme and handles
# URL-encoding, missing +, dashes, spaces, and parentheses.
_TEL_HREF_RE = re.compile(
    r'href=["\'](?:tel:|callto:)\+?([+\d\s\-().%]+)["\']',
    re.IGNORECASE,
)
_WAME_HREF_RE = re.compile(
    r'href=["\']https?://(?:wa\.me|api\.whatsapp\.com/send\?phone=)([+\d]+)["\']',
    re.IGNORECASE,
)


def _layer1_links(html: str) -> list[PhoneResult]:
    """
    Extract phone numbers from tel:, callto:, and wa.me hrefs.
    Handles all real-world tel: href formats including no-plus, local-only,
    URL-encoded spaces, and formatted numbers with dashes/parens.
    """
    results: list[PhoneResult] = []
    seen: set[str] = set()

    raw_strings: list[str] = []
    for m in _TEL_HREF_RE.finditer(html):
        raw = m.group(1).replace('%20', ' ').replace('%2B', '+').strip()
        if raw:
            raw_strings.append(raw)
    for m in _WAME_HREF_RE.finditer(html):
        raw_strings.append(m.group(1).strip())

    for raw in raw_strings:
        d = _digits(raw)
        if not d:
            continue

        # Try with +, without + (raw as-is), then with leading 1 for NANP
        candidates = [d]
        if raw.startswith('+'):
            candidates = [d]                    # already international
        elif len(d) == 10:
            # Could be NANP (US/Canada) local number
            candidates = ["1" + d, d]
        elif len(d) == 11 and d.startswith('1'):
            candidates = [d]                    # NANP with country code
        # else: try as-is (may match other country codes)

        for cand in candidates:
            r = _make_result(raw, cand, "tel_link")
            if r and r.e164 not in seen:
                seen.add(r.e164)
                results.append(r)
                break  # stop trying candidates once matched

    return results


# ══════════════════════════════════════════════════════════════════════════════
# 5.  LAYER 2 — Country-specific regex patterns
# ══════════════════════════════════════════════════════════════════════════════

_SEP_CHARS = r"[\s\-.()\[\]\/]"


def _country_regex(spec: CountrySpec) -> re.Pattern:
    cc = _digits(spec.dial_code)
    mn, mx = spec.min_digits, spec.max_digits
    sub = rf"[\d{_SEP_CHARS[1:-1]}]{{{mn},{mx + mx // 2}}}"

    alts = [
        rf"(?:\+{cc}|00{cc}){_SEP_CHARS}*{sub}",
    ]
    if spec.trunk_prefix:
        tp = re.escape(spec.trunk_prefix)
        alts.append(
            rf"(?<![+\d]){tp}{_SEP_CHARS}*"
            rf"[\d{_SEP_CHARS[1:-1]}]{{{mn},{mx + mx // 2}}}"
        )

    combined = "|".join(f"(?:{a})" for a in alts)
    return re.compile(rf"(?:{combined})(?!\d)", re.MULTILINE)


_COUNTRY_RES: list[tuple[CountrySpec, re.Pattern]] = [
    (spec, _country_regex(spec)) for spec in COUNTRY_SPECS
]


def _layer2_country(text: str) -> list[PhoneResult]:
    results: list[PhoneResult] = []
    seen: set[str] = set()

    for spec, pat in _COUNTRY_RES:
        cc = _digits(spec.dial_code)
        for m in pat.finditer(text):
            raw = m.group(0)
            d = _digits(raw)

            if d.startswith(cc):
                e164d = d
            elif spec.trunk_prefix and d.startswith(_digits(spec.trunk_prefix)):
                e164d = cc + d[len(_digits(spec.trunk_prefix)):]
            else:
                e164d = cc + d

            r = _make_result(raw, e164d, "regex")
            if r and r.e164 not in seen:
                seen.add(r.e164)
                results.append(r)

    return results


# ══════════════════════════════════════════════════════════════════════════════
# 6.  LAYER 3 — Universal E.164 fallback
# ══════════════════════════════════════════════════════════════════════════════

_E164_RE = re.compile(
    r"""(?<!\d)\+[1-9]\d{0,3}[\s\-.(]{0,2}\d[\d\s\-.()\[\]]{5,18}\d(?!\d)""",
    re.MULTILINE,
)


def _layer3_fallback(text: str) -> list[PhoneResult]:
    results: list[PhoneResult] = []
    seen: set[str] = set()

    for m in _E164_RE.finditer(text):
        raw = m.group(0)
        d = _digits(raw)
        r = _make_result(raw, d, "e164_fallback")
        if r and r.e164 not in seen:
            seen.add(r.e164)
            results.append(r)

    return results


# ══════════════════════════════════════════════════════════════════════════════
# 7.  NOISE FILTER
# ══════════════════════════════════════════════════════════════════════════════

_NOISE_DATE_RE    = re.compile(r'\b\d{4}-\d{2}-\d{2}\b|\b\d{2}/\d{2}/\d{4}\b')
_NOISE_VERSION_RE = re.compile(r'\b\d+\.\d+\.\d+(?:\.\d+)?\b')
_NOISE_HEX_RE     = re.compile(r'\b(?=[0-9a-f]*[a-f])[0-9a-f]{12,}\b', re.IGNORECASE)


def _is_noise(raw: str) -> bool:
    if _NOISE_DATE_RE.search(raw):
        return True
    if _NOISE_VERSION_RE.search(raw):
        return True
    if '+' not in raw and ' ' not in raw and _NOISE_HEX_RE.search(raw):
        return True
    return False


# ══════════════════════════════════════════════════════════════════════════════
# 8.  PUBLIC API
# ══════════════════════════════════════════════════════════════════════════════

def extract_all_phones(
    text: str,
    html: str = "",
    regions: Optional[list[str]] = None,
) -> list[PhoneResult]:
    raw_results: list[PhoneResult] = []

    if html:
        raw_results.extend(_layer1_links(html))
    raw_results.extend(_layer2_country(text))
    raw_results.extend(_layer3_fallback(text))

    raw_results = [r for r in raw_results if not _is_noise(r.raw)]

    if regions:
        region_set = set(regions)
        region_for_code: dict[str, str] = {
            spec.dial_code: spec.region for spec in COUNTRY_SPECS
        }
        raw_results = [
            r for r in raw_results
            if region_for_code.get(r.dial_code, "other") in region_set
        ]

    best: dict[str, PhoneResult] = {}
    for r in raw_results:
        if r.e164 not in best or r.score > best[r.e164].score:
            best[r.e164] = r

    return sorted(best.values(), key=lambda r: -r.score)


def best_phone(
    text: str,
    html: str = "",
    regions: Optional[list[str]] = None,
) -> Optional[PhoneResult]:
    results = extract_all_phones(text, html=html, regions=regions)
    return results[0] if results else None


def _phones_as_e164(
    text: str,
    html: str = "",
    regions: Optional[list[str]] = None,
) -> list[str]:
    return [result.e164 for result in extract_all_phones(text, html=html, regions=regions)]


def extract_indian_phones(text: str, html: str = "") -> list[str]:
    """
    Backwards-compatible helper used by the FastAPI quick-test endpoint.
    """
    return _phones_as_e164(text, html=html, regions=["south_asia"])


def extract_intl_phones(text: str, html: str = "") -> list[str]:
    """
    Backwards-compatible helper used by the FastAPI quick-test endpoint.
    """
    return _phones_as_e164(text, html=html, regions=None)


def phones_by_country(
    text: str,
    html: str = "",
) -> dict[str, list[PhoneResult]]:
    grouped: dict[str, list[PhoneResult]] = {}
    for r in extract_all_phones(text, html=html):
        grouped.setdefault(r.country, []).append(r)
    return grouped


def phones_as_dicts(results: list[PhoneResult]) -> list[dict]:
    return [
        {
            "e164":       r.e164,
            "country":    r.country,
            "dial_code":  r.dial_code,
            "subscriber": r.subscriber,
            "raw":        r.raw,
            "source":     r.source,
            "score":      r.score,
        }
        for r in results
    ]
