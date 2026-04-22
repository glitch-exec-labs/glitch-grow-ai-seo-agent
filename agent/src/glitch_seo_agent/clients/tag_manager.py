"""
Google Tag Manager API v2 wrapper.

The SA needs `Publish` role on each GTM container (or at minimum `Read`
for audit). Grant at account level or per-container in Tag Manager
Admin → User management.

v1 scope: list accounts/containers/workspaces/tags + audit what's
published vs. what's in the live workspace. Create/publish paths
land once the auditor tells us what's missing.
"""
from __future__ import annotations

import time
from functools import lru_cache
from typing import Any

from googleapiclient.discovery import Resource, build
from googleapiclient.errors import HttpError

from .auth import credentials

# GTM's per-user quota is 25 queries / 100 s. Sleep between API calls
# to stay comfortably under that; the audit still finishes in a minute.
_THROTTLE_S = 3.0
_last_call_at = 0.0


def _throttle() -> None:
    global _last_call_at
    gap = time.time() - _last_call_at
    if gap < _THROTTLE_S:
        time.sleep(_THROTTLE_S - gap)
    _last_call_at = time.time()


@lru_cache(maxsize=1)
def client() -> Resource:
    """Singleton build() — avoids rediscovering the API every call."""
    return build("tagmanager", "v2", credentials=_creds(), cache_discovery=False)


def _creds():
    # Explicit construction so we don't need to add to the SCOPES dict
    # until we decide what's exposed.
    from google.oauth2 import service_account

    from ..config import settings

    return service_account.Credentials.from_service_account_file(
        str(settings().google_sa_path),
        scopes=[
            "https://www.googleapis.com/auth/tagmanager.readonly",
            "https://www.googleapis.com/auth/tagmanager.edit.containers",
            # create_version lives under a separate scope from edit.containers
            "https://www.googleapis.com/auth/tagmanager.edit.containerversions",
            "https://www.googleapis.com/auth/tagmanager.publish",
        ],
    )


# ── Read-side helpers ─────────────────────────────────────────────

@lru_cache(maxsize=1)
def list_accounts() -> tuple[dict[str, Any], ...]:
    _throttle()
    try:
        resp = client().accounts().list().execute()
        return tuple(resp.get("account") or [])
    except HttpError as e:
        raise TagManagerError(f"accounts.list: {e}") from e


@lru_cache(maxsize=32)
def list_containers(account_path: str) -> tuple[dict[str, Any], ...]:
    _throttle()
    try:
        resp = client().accounts().containers().list(parent=account_path).execute()
        return tuple(resp.get("container") or [])
    except HttpError as e:
        raise TagManagerError(f"containers.list: {e}") from e


def list_workspaces(container_path: str) -> list[dict[str, Any]]:
    _throttle()
    resp = client().accounts().containers().workspaces().list(parent=container_path).execute()
    return list(resp.get("workspace") or [])


def list_tags(workspace_path: str) -> list[dict[str, Any]]:
    _throttle()
    resp = (
        client().accounts().containers().workspaces().tags().list(parent=workspace_path).execute()
    )
    return list(resp.get("tag") or [])


def list_triggers(workspace_path: str) -> list[dict[str, Any]]:
    _throttle()
    resp = (
        client()
        .accounts().containers().workspaces().triggers().list(parent=workspace_path).execute()
    )
    return list(resp.get("trigger") or [])


def list_variables(workspace_path: str) -> list[dict[str, Any]]:
    _throttle()
    resp = (
        client()
        .accounts().containers().workspaces().variables().list(parent=workspace_path).execute()
    )
    return list(resp.get("variable") or [])


def get_live_version(container_path: str) -> dict[str, Any] | None:
    """Currently published version; None if nothing ever published."""
    _throttle()
    try:
        resp = (
            client().accounts().containers().version_headers()
            .latest(parent=container_path).execute()
        )
        return resp
    except HttpError as e:
        if e.resp.status == 404:
            return None
        raise


@lru_cache(maxsize=16)
def find_container_by_public_id(public_id: str) -> tuple[dict, dict] | None:
    """Resolve "GTM-XXXX" → (account, container). Results cached per id
    so subsequent audits don't re-scan all accounts."""
    for acc in list_accounts():
        try:
            for cont in list_containers(acc["path"]):
                if cont.get("publicId") == public_id:
                    return acc, cont
        except TagManagerError:
            continue
    return None


# ── Write-side (workspace edits + publishing) ────────────────────

def default_workspace_path(container_path: str) -> str:
    """GTM containers start with a 'Default Workspace' per user —
    we use whatever exists first for admin-automated changes."""
    ws = list_workspaces(container_path)
    if not ws:
        raise TagManagerError("no workspaces on container")
    # Prefer one literally named 'Default Workspace'
    for w in ws:
        if w.get("name") == "Default Workspace":
            return w["path"]
    return ws[0]["path"]


def create_tag(workspace_path: str, tag_body: dict) -> dict:
    return (
        client()
        .accounts().containers().workspaces().tags()
        .create(parent=workspace_path, body=tag_body).execute()
    )


def create_trigger(workspace_path: str, body: dict) -> dict:
    return (
        client()
        .accounts().containers().workspaces().triggers()
        .create(parent=workspace_path, body=body).execute()
    )


def create_variable(workspace_path: str, body: dict) -> dict:
    return (
        client()
        .accounts().containers().workspaces().variables()
        .create(parent=workspace_path, body=body).execute()
    )


def create_version_and_publish(
    workspace_path: str, name: str, notes: str = ""
) -> dict[str, Any]:
    """Builds a version from the workspace and publishes it live."""
    version = (
        client().accounts().containers().workspaces()
        .create_version(path=workspace_path, body={"name": name, "notes": notes})
        .execute()
    )
    container_version = version.get("containerVersion") or {}
    if not container_version.get("path"):
        return {"error": "no_version_created", "raw": version}
    published = (
        client().accounts().containers().versions()
        .publish(path=container_version["path"]).execute()
    )
    return published


class TagManagerError(RuntimeError):
    pass
