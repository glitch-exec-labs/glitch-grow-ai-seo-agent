#!/usr/bin/env python3
"""
audit_gtm — read-only snapshot of each brand's GTM container.

Per brand: default workspace, tags, triggers, variables, live version
status. Surfaces what's missing vs. a sane e-commerce baseline so the
operator can decide what to create / publish.

Usage:
    audit_gtm.py                 # all 4 brand containers
    audit_gtm.py --gtm GTM-XXX   # just one
    audit_gtm.py --json          # machine-readable
"""
from __future__ import annotations

import argparse
import json as json_mod
import sys
from typing import Any

from glitch_seo_agent.clients.tag_manager import (
    default_workspace_path,
    find_container_by_public_id,
    get_live_version,
    list_tags,
    list_triggers,
    list_variables,
)

# Brand GTM container ids — matches install_gtm.py
BRAND_GTM_IDS = {
    "classicoo": "GTM-PFVB9BMC",
    "urban": "GTM-5SSC7Q4P",
    "trendsetters": "GTM-NXMT88BB",
    "storico": "GTM-PR3RFMCX",
}


def audit_one(public_id: str) -> dict[str, Any]:
    result: dict[str, Any] = {"public_id": public_id}
    hit = find_container_by_public_id(public_id)
    if not hit:
        result["error"] = "container_not_visible_to_sa"
        return result
    acc, cont = hit
    result["account"] = acc.get("name")
    result["container_name"] = cont.get("name")
    result["container_path"] = cont.get("path")

    try:
        ws = default_workspace_path(cont["path"])
    except Exception as e:
        result["error"] = f"workspace: {e}"
        return result
    result["workspace"] = ws

    live = get_live_version(cont["path"])
    result["live_version"] = (
        {
            "name": live.get("name"),
            "versionId": live.get("containerVersionId"),
            "numTags": live.get("numTags", 0),
            "numTriggers": live.get("numTriggers", 0),
            "numVariables": live.get("numVariables", 0),
        }
        if live
        else None
    )

    tags = list_tags(ws)
    triggers = list_triggers(ws)
    variables = list_variables(ws)

    result["counts"] = {
        "tags": len(tags),
        "triggers": len(triggers),
        "variables": len(variables),
    }
    result["tags"] = [
        {
            "name": t.get("name"),
            "type": t.get("type"),
            "firingTriggerId": t.get("firingTriggerId"),
            "paused": bool(t.get("paused")),
        }
        for t in tags
    ]

    # Baseline checks: does this container have a GA4 config or Google Tag?
    has_ga4_config = any(t.get("type") in ("gaawc", "googtag") for t in tags)
    has_any_firing_tag = any(
        not t.get("paused") and (t.get("firingTriggerId") or [])
        for t in tags
    )

    result["baseline"] = {
        "has_ga4_or_google_tag": has_ga4_config,
        "has_firing_tag": has_any_firing_tag,
        "verdict": "ok" if (has_ga4_config and has_any_firing_tag and live) else "needs_setup",
    }
    return result


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--gtm", help="A single GTM-XXXX id to audit")
    ap.add_argument("--json", action="store_true", help="JSON output")
    args = ap.parse_args()

    targets = [args.gtm] if args.gtm else list(BRAND_GTM_IDS.values())

    results = []
    for gtm_id in targets:
        try:
            results.append(audit_one(gtm_id))
        except Exception as e:
            results.append({"public_id": gtm_id, "error": str(e)})

    if args.json:
        print(json_mod.dumps(results, indent=2))
        return 0

    for r in results:
        print(f"── {r['public_id']}  ({r.get('container_name','?')}) ─" + "─" * 30)
        if "error" in r:
            print(f"   ERROR: {r['error']}")
            continue
        lv = r.get("live_version")
        if lv:
            print(f"   live_version: {lv['name']} (tags={lv['numTags']} triggers={lv['numTriggers']} vars={lv['numVariables']})")
        else:
            print("   live_version: none — container has NEVER been published")
        c = r["counts"]
        print(f"   workspace counts: tags={c['tags']} triggers={c['triggers']} variables={c['variables']}")
        if r["tags"]:
            print("   tags in default workspace:")
            for t in r["tags"]:
                paused = " [paused]" if t["paused"] else ""
                print(f"     • {t['name']:<30}  type={t['type']}  trig={t['firingTriggerId']}{paused}")
        b = r["baseline"]
        v = b["verdict"]
        print(f"   baseline verdict: {'✓' if v == 'ok' else '⚠'} {v}  (GA4/google tag={b['has_ga4_or_google_tag']}, firing tag={b['has_firing_tag']})")

    return 0


if __name__ == "__main__":
    sys.exit(main())
