"""
Entity extraction — Natural Language API on a small set of URLs.

Default targets: home + top 2 pages from GSC (or overridden via
site.nlp_targets). We strip HTML before sending to NLP to keep the
content-billed characters to just readable text.
"""
from __future__ import annotations

import re
from collections.abc import Iterable
from typing import Any

import httpx

from ..clients.natural_language import analyze_entities
from ..sources import SiteRecord

DEFAULT_N = 3
MAX_CHARS_PER_PAGE = 20_000  # Natural Language bills per 1000 chars.
USER_AGENT = "GlitchSEO-Agent/1.0"

# Entity types that are SEO-useful. NLP returns lots of NUMBER / DATE /
# PRICE / PHONE_NUMBER entities that float to the top on marketing
# pages (metrics, pricing callouts) and crowd out the actual brand /
# product / location signal we want.
SEMANTIC_TYPES: frozenset[str] = frozenset({
    "PERSON",
    "ORGANIZATION",
    "LOCATION",
    "EVENT",
    "WORK_OF_ART",
    "CONSUMER_GOOD",
    "OTHER",
})


async def pull(site: SiteRecord, *, fallback_urls: Iterable[str] = ()) -> dict[str, Any]:
    urls = _resolve_urls(site, fallback_urls)
    if not urls:
        return {"error": "no_urls", "pages": []}

    pages: list[dict[str, Any]] = []
    async with httpx.AsyncClient(
        headers={"User-Agent": USER_AGENT},
        timeout=httpx.Timeout(15.0, connect=5.0),
        follow_redirects=True,
    ) as http:
        for url in urls[:DEFAULT_N]:
            try:
                res = await http.get(url)
                res.raise_for_status()
            except httpx.HTTPError as e:
                pages.append({"url": url, "error": str(e)})
                continue

            text = _strip_html(res.text)[:MAX_CHARS_PER_PAGE]
            if not text.strip():
                pages.append({"url": url, "error": "empty_body"})
                continue

            try:
                nlp = analyze_entities(text)
            except Exception as e:  # google-cloud-language raises grpc errors
                pages.append({"url": url, "error": f"nlp_failed: {e}"})
                continue

            # Filter BEFORE truncating. NLP tends to list NUMBER/DATE
            # entities first on long responses; a naive [:50] slice
            # discards the useful ORGANIZATION/PERSON tail.
            filtered = [
                e for e in (nlp.get("entities") or [])
                if e.get("type") in SEMANTIC_TYPES and e.get("name")
            ]
            pages.append(
                {
                    "url": url,
                    "language": nlp.get("language_code"),
                    "entities": filtered[:50],
                }
            )

    all_names = [
        e["name"]
        for p in pages
        for e in p.get("entities") or []
    ]
    top = _top_n(all_names, n=15)

    return {"pages": pages, "top_entities": top}


# Strip <script> and <style> blocks (including their contents) BEFORE
# stripping tags — otherwise NLP ingests inlined JSON-LD, Astro island
# state, and CSS, all of which are numeric-heavy and crowd out real
# entities.
_SCRIPT_OR_STYLE = re.compile(
    r"<(script|style|noscript)\b[^>]*>.*?</\1>",
    re.IGNORECASE | re.DOTALL,
)
_HTML_COMMENT = re.compile(r"<!--.*?-->", re.DOTALL)
_HTML_TAG = re.compile(r"<[^>]+>")
_WS = re.compile(r"\s+")


def _strip_html(s: str) -> str:
    s = _SCRIPT_OR_STYLE.sub(" ", s)
    s = _HTML_COMMENT.sub(" ", s)
    s = _HTML_TAG.sub(" ", s)
    return _WS.sub(" ", s).strip()


def _resolve_urls(site: SiteRecord, fallback_urls: Iterable[str]) -> list[str]:
    if site.nlp_targets:
        return [u for u in site.nlp_targets if u]
    base = site.base_url.rstrip("/")
    out = [base]  # always include home
    for u in fallback_urls:
        if u and u not in out:
            out.append(u)
        if len(out) >= DEFAULT_N:
            break
    return out


def _top_n(names: list[str], *, n: int) -> list[dict[str, Any]]:
    counts: dict[str, int] = {}
    for name in names:
        counts[name] = counts.get(name, 0) + 1
    ranked = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))[:n]
    return [{"name": k, "count": v} for k, v in ranked]
