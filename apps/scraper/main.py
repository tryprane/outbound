"""
main.py — OutreachOS Python Scraper Microservice
FastAPI app exposing scraping endpoints consumed by the Next.js worker.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Literal, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, AliasChoices, field_validator

from scrapers.website_scraper import scrape_website

# ── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="OutreachOS Scraper",
    description="Microservice for scraping agency website emails and phone numbers",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://web:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Schemas ───────────────────────────────────────────────────────────────────
class ScrapeRequest(BaseModel):
    url: str
    campaign_type: Literal["indian", "international"] = Field(
        default="indian",
        validation_alias=AliasChoices("campaign_type", "type"),
    )
    extract: list[Literal["email", "phone"]] = Field(default_factory=lambda: ["email", "phone"])

    @field_validator("url")
    @classmethod
    def clean_url(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("URL cannot be empty")
        # Add https:// if missing scheme
        if not v.startswith(("http://", "https://")):
            v = "https://" + v
        return v


class ScrapeResponse(BaseModel):
    url: str
    email: Optional[str] = None
    phone: Optional[str] = None
    pages_checked: list[str] = []
    success: bool = True
    error: Optional[str] = None


class BulkScrapeRequest(BaseModel):
    urls: list[str]
    campaign_type: Literal["indian", "international"] = Field(
        default="indian",
        validation_alias=AliasChoices("campaign_type", "type"),
    )
    extract: list[Literal["email", "phone"]] = Field(default_factory=lambda: ["email", "phone"])
    concurrency: int = 5  # max parallel scrape tasks


class BulkScrapeResponse(BaseModel):
    results: list[ScrapeResponse]
    total: int
    succeeded: int
    failed: int


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health() -> dict:
    """Health check endpoint — used by Docker and Next.js proxy."""
    return {"status": "ok", "service": "outreachos-scraper"}


@app.post("/scrape/website", response_model=ScrapeResponse)
async def scrape_single(body: ScrapeRequest) -> ScrapeResponse:
    """
    Scrape a single website URL for email and/or phone number.

    - Fetches homepage + contact/about pages
    - Prioritises mailto: links for email
    - Applies Indian or International phone regex
    """
    logger.info(f"Scraping: {body.url} | type={body.campaign_type} | extract={body.extract}")
    try:
        result = await scrape_website(
            url=body.url,
            campaign_type=body.campaign_type,
            extract=list(body.extract),
        )
        return ScrapeResponse(
            url=body.url,
            email=result.get("email"),
            phone=result.get("phone"),
            pages_checked=result.get("pages_checked", []),
            success=True,
        )
    except Exception as exc:
        logger.error(f"Scrape failed for {body.url}: {exc}")
        return ScrapeResponse(
            url=body.url,
            success=False,
            error=str(exc),
        )


@app.post("/scrape/bulk", response_model=BulkScrapeResponse)
async def scrape_bulk(body: BulkScrapeRequest) -> BulkScrapeResponse:
    """
    Scrape multiple URLs concurrently with a configurable concurrency cap.
    Used by the BullMQ scrapeProcessor to batch scrape campaign rows.
    """
    semaphore = asyncio.Semaphore(min(body.concurrency, 10))

    async def _scrape_one(url: str) -> ScrapeResponse:
        async with semaphore:
            try:
                result = await scrape_website(
                    url=url,
                    campaign_type=body.campaign_type,
                    extract=list(body.extract),
                )
                return ScrapeResponse(
                    url=url,
                    email=result.get("email"),
                    phone=result.get("phone"),
                    pages_checked=result.get("pages_checked", []),
                    success=True,
                )
            except Exception as exc:
                return ScrapeResponse(url=url, success=False, error=str(exc))

    tasks = [_scrape_one(u) for u in body.urls]
    results = await asyncio.gather(*tasks)

    succeeded = sum(1 for r in results if r.success and (r.email or r.phone))
    failed = sum(1 for r in results if not r.success)

    return BulkScrapeResponse(
        results=list(results),
        total=len(results),
        succeeded=succeeded,
        failed=failed,
    )


@app.post("/extract/email")
async def extract_email_only(body: dict) -> dict:
    """
    Quick endpoint: extract email from raw text (no scraping).
    Useful for testing the email extractor directly.
    """
    from scrapers.email_extractor import extract_emails
    text = body.get("text", "")
    emails = extract_emails(text)
    return {"emails": emails, "best": emails[0] if emails else None}


@app.post("/extract/phone")
async def extract_phone_only(body: dict) -> dict:
    """
    Quick endpoint: extract phones from raw text (no scraping).
    """
    from scrapers.phone_extractor import extract_indian_phones, extract_intl_phones
    text = body.get("text", "")
    campaign_type = body.get("campaign_type", "indian")
    if campaign_type == "indian":
        phones = extract_indian_phones(text)
    else:
        phones = extract_intl_phones(text)
    return {"phones": phones, "best": phones[0] if phones else None}
