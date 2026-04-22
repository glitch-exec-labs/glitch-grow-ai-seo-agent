#!/usr/bin/env python3
"""
inject_datalayer — adds the Shopify dataLayer push for ecommerce
events into each brand's theme.liquid.

Emits on product pages so GTM/GA4 can read:
  - view_item       (this pass)
  - add_to_cart     (later — needs JS listener wiring)
  - purchase        (later — requires Shopify Pixel / order page access)

Uses the same pattern as install_gtm.py:
  - resolve token from multi-store-theme-manager DB
  - scope check
  - back up before PUT
  - idempotent: skip if our marker is present
  - verify-with-retry (Shopify's asset cache has a 2–5 s lag)

Usage:
    inject_datalayer.py                 # all 4 brands
    inject_datalayer.py --slug storico
    inject_datalayer.py --dry-run
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import sys
import time
from pathlib import Path

import asyncpg
import httpx
from dotenv import load_dotenv

API_VERSION = "2024-10"
BRAND_SLUGS = ["classicoo", "urban", "trendsetters", "storico"]

MARKER = "<!-- glitch-grow-seo: ecommerce dataLayer pushes -->"

# Shopify emits prices in the storefront locale. Using
# `money_without_currency` + replace(",",".") normalises to a float
# GA4 can consume. `product.selected_or_first_available_variant.price`
# returns cents in the Admin API but money filters in Liquid already
# render the currency amount, so just strip formatting.
DATALAYER_BLOCK = """
    {{% comment %}} {marker} {{% endcomment %}}
    <script>
      (function() {{
        var dl = window.dataLayer = window.dataLayer || [];
        {{%- if template contains 'product' and product -%}}
        var price = {{{{ product.selected_or_first_available_variant.price | money_without_currency | json }}}};
        dl.push({{
          event: 'view_item',
          ecommerce: {{
            currency: {{{{ shop.currency | json }}}},
            value: parseFloat(String(price).replace(/,/g,'')),
            items: [{{
              item_id:       {{{{ product.id | json }}}},
              item_name:     {{{{ product.title | json }}}},
              item_brand:    {{{{ product.vendor | json }}}},
              item_category: {{{{ product.type | json }}}},
              price:         parseFloat(String(price).replace(/,/g,''))
            }}]
          }}
        }});
        {{%- elsif template contains 'collection' and collection -%}}
        dl.push({{
          event: 'view_item_list',
          ecommerce: {{
            item_list_id:   {{{{ collection.handle | json }}}},
            item_list_name: {{{{ collection.title | json }}}}
          }}
        }});
        {{%- endif -%}}
      }})();
    </script>
"""


def _read_theme_manager_dsn() -> str:
    with open("/home/support/multi-store-theme-manager/.env") as f:
        for line in f:
            if line.startswith("DATABASE_URL="):
                dsn = line.split("=", 1)[1].strip().strip('"')
                return dsn.split("?")[0]
    raise RuntimeError("DATABASE_URL not found")


async def get_token(conn: asyncpg.Connection, shop: str) -> tuple[str, str]:
    row = await conn.fetchrow(
        'SELECT "accessToken" AS t, scope FROM "Session" WHERE shop=$1 LIMIT 1', shop,
    )
    if not row:
        raise RuntimeError(f"no Session row for {shop}")
    return row["t"], row["scope"] or ""


async def rest(
    client: httpx.AsyncClient, shop: str, token: str,
    path: str, method: str = "GET", body: dict | None = None,
) -> dict:
    url = f"https://{shop}/admin/api/{API_VERSION}/{path}"
    headers = {"X-Shopify-Access-Token": token, "Content-Type": "application/json"}
    r = await client.request(method, url, headers=headers, json=body, timeout=30.0)
    if r.status_code >= 400:
        raise RuntimeError(f"{method} {path} → {r.status_code} {r.text[:500]}")
    return r.json()


async def install_one(
    client: httpx.AsyncClient, slug: str, shop: str, token: str, scope_csv: str,
    dry_run: bool,
) -> dict:
    result: dict = {"slug": slug, "shop": shop}
    if "write_themes" not in scope_csv:
        result["status"] = "skipped"; result["reason"] = "no_write_themes"; return result

    themes = (await rest(client, shop, token, "themes.json"))["themes"]
    main = next((t for t in themes if t["role"] == "main"), None)
    if not main:
        result["status"] = "skipped"; result["reason"] = "no_main_theme"; return result

    src = (await rest(
        client, shop, token,
        f"themes/{main['id']}/assets.json?asset[key]=layout/theme.liquid",
    ))["asset"]["value"]

    if MARKER in src:
        result["status"] = "already_installed"; return result

    # Insert right before the closing </head> so our GTM head block
    # (installed by install_gtm.py) has already initialised dataLayer.
    m = re.search(r"</head\s*>", src, flags=re.IGNORECASE)
    if not m:
        result["status"] = "skipped"; result["reason"] = "no_closing_head"; return result

    block = DATALAYER_BLOCK.format(marker=MARKER)
    new_src = src[: m.start()] + block + src[m.start() :]

    if dry_run:
        result["status"] = "dry_run"; return result

    Path(f"/tmp/theme_{shop}_datalayer_{int(time.time())}.bak.liquid").write_text(src)
    await rest(
        client, shop, token, f"themes/{main['id']}/assets.json", method="PUT",
        body={"asset": {"key": "layout/theme.liquid", "value": new_src}},
    )
    # verify-with-retry
    for attempt in range(1, 6):
        await asyncio.sleep(2)
        v = (await rest(
            client, shop, token,
            f"themes/{main['id']}/assets.json?asset[key]=layout/theme.liquid",
        ))["asset"]["value"]
        if MARKER in v:
            result["status"] = "installed"; result["attempt"] = attempt; return result
    result["status"] = "cache_lag_retry_later"; return result


async def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--slug")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    load_dotenv("/home/support/glitch-grow-ads-agent/.env")
    stores = {s["slug"]: s for s in json.loads(os.environ["STORES_JSON"])}
    slugs = [args.slug] if args.slug else BRAND_SLUGS

    dsn = _read_theme_manager_dsn()
    conn = await asyncpg.connect(dsn)
    try:
        async with httpx.AsyncClient() as client:
            for slug in slugs:
                shop = stores[slug]["shop_domain"]
                token, scope = await get_token(conn, shop)
                r = await install_one(client, slug, shop, token, scope, args.dry_run)
                tick = {"installed":"✓","already_installed":"•","dry_run":"·",
                        "cache_lag_retry_later":"⚠","skipped":"✗"}.get(r["status"],"?")
                extras = ""
                if r.get("attempt"): extras = f" attempt={r['attempt']}"
                if r.get("reason"):  extras += f" reason={r['reason']}"
                print(f"  {tick}  {slug:<14} {shop:<28} {r['status']}{extras}")
    finally:
        await conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
