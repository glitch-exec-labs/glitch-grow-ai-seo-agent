#!/usr/bin/env python3
"""
install_gtm_ga4 — wires a GA4 Configuration tag in each brand's GTM
container's default workspace and publishes a new live version.

For each brand:
  1. Resolve GTM container by public id (GTM-XXXX).
  2. Ensure a Page View trigger exists (create if missing).
  3. Ensure a Google Tag (type "googtag") exists with the correct GA4
     measurement id (create if missing; update if present but wrong).
  4. Create a new container version and publish it.

Idempotent: re-running skips rows that already match. Quota-safe: the
underlying client already throttles to stay under 25 queries / 100 s.

Usage:
    install_gtm_ga4.py                       # all 4 brands
    install_gtm_ga4.py --gtm GTM-PR3RFMCX    # one
    install_gtm_ga4.py --dry-run             # plan only
"""
from __future__ import annotations

import argparse
import sys
from typing import Any

from glitch_seo_agent.clients.tag_manager import (
    client,
    create_tag,
    create_trigger,
    create_version_and_publish,
    default_workspace_path,
    find_container_by_public_id,
    list_tags,
    list_triggers,
    _throttle,
)

# Brand → (GTM id, GA4 measurement id) — single source of truth.
BRAND_WIRING: dict[str, dict[str, str]] = {
    "classicoo":    {"gtm": "GTM-PFVB9BMC", "ga4": "G-BEK1YDY3L8", "domain": "classicoo.in"},
    "urban":        {"gtm": "GTM-5SSC7Q4P", "ga4": "G-DHE6Y81594", "domain": "urban-classics-store.com"},
    "trendsetters": {"gtm": "GTM-NXMT88BB", "ga4": "G-PZHVCKFJMV", "domain": "trendsetters-store.com"},
    "storico":      {"gtm": "GTM-PR3RFMCX", "ga4": "G-V2956LEFLD", "domain": "storico.in"},
}

TRIGGER_NAME = "All Pages"
TAG_NAME = "GA4 Configuration"
VERSION_NAME = "GA4 bootstrap (install_gtm_ga4.py)"


def ensure_trigger(workspace_path: str) -> str:
    """Return the id of an All-Pages pageview trigger, creating if absent."""
    for t in list_triggers(workspace_path):
        if t.get("type") == "pageview" and t.get("name") == TRIGGER_NAME:
            return t["triggerId"]
    trig = create_trigger(workspace_path, {"name": TRIGGER_NAME, "type": "pageview"})
    return trig["triggerId"]


def ensure_ga4_tag(workspace_path: str, ga4_id: str, trigger_id: str) -> dict[str, Any]:
    """
    Ensure a Google Tag (type "googtag") exists with the right tagId.

    Returns a dict describing what we did: {action, tag}.
    action ∈ {"created", "updated", "already_correct"}.
    """
    existing = None
    for t in list_tags(workspace_path):
        if t.get("type") == "googtag":
            existing = t
            break

    if existing:
        params = existing.get("parameter") or []
        current_id = next(
            (p.get("value") for p in params if p.get("key") == "tagId"),
            None,
        )
        if current_id == ga4_id and trigger_id in (existing.get("firingTriggerId") or []):
            return {"action": "already_correct", "tag": existing}
        # update not implemented in this pass; the tag exists but isn't
        # right — surface for manual fix rather than clobber.
        return {"action": "conflict_existing_googtag", "tag": existing}

    body = {
        "name": TAG_NAME,
        "type": "googtag",
        "parameter": [{"key": "tagId", "type": "template", "value": ga4_id}],
        "firingTriggerId": [trigger_id],
    }
    created = create_tag(workspace_path, body)
    return {"action": "created", "tag": created}


def run_one(slug: str, gtm_id: str, ga4_id: str, dry_run: bool) -> dict[str, Any]:
    out: dict[str, Any] = {"slug": slug, "gtm": gtm_id, "ga4": ga4_id}
    hit = find_container_by_public_id(gtm_id)
    if not hit:
        out["status"] = "container_not_visible"
        return out
    _, cont = hit
    ws = default_workspace_path(cont["path"])
    out["workspace"] = ws

    if dry_run:
        out["status"] = "dry_run"
        return out

    trigger_id = ensure_trigger(ws)
    out["trigger_id"] = trigger_id

    tag_action = ensure_ga4_tag(ws, ga4_id, trigger_id)
    out["tag_action"] = tag_action["action"]

    # Publish a new container version, always — if nothing changed,
    # GTM returns no-op gracefully; keeps the live version pointer fresh.
    pub = create_version_and_publish(ws, name=VERSION_NAME, notes=f"Brand: {slug}; GA4: {ga4_id}")
    if "error" in pub:
        out["publish"] = pub
        out["status"] = "publish_error"
    else:
        v = pub.get("containerVersion") or {}
        out["published_version"] = v.get("name")
        out["published_path"] = v.get("path")
        out["status"] = "ok"
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--gtm")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    targets = [
        (slug, cfg["gtm"], cfg["ga4"])
        for slug, cfg in BRAND_WIRING.items()
        if not args.gtm or cfg["gtm"] == args.gtm
    ]
    if not targets:
        print("no targets match")
        return 1

    # Warm the account/container list cache once before the per-brand loop
    # so we don't thrash the per-minute quota.
    _throttle()
    client()

    for slug, gtm_id, ga4_id in targets:
        try:
            r = run_one(slug, gtm_id, ga4_id, args.dry_run)
        except Exception as e:
            r = {"slug": slug, "gtm": gtm_id, "ga4": ga4_id, "status": "exception", "error": str(e)[:300]}
        emoji = {"ok": "✓", "dry_run": "·", "already_correct": "•"}.get(r.get("status", ""), "⚠")
        extra = []
        if r.get("tag_action"):
            extra.append(f"tag={r['tag_action']}")
        if r.get("published_version"):
            extra.append(f"published={r['published_version']}")
        if r.get("error"):
            extra.append(f"error={r['error'][:120]}")
        print(f"  {emoji}  {slug:<14} {gtm_id:<16} → {ga4_id:<15} {r['status']}  {' '.join(extra)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
