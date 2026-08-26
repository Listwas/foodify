"""Stock photo lookup for recipes that don't come with one.

AI-generated recipes have no image, so we search Openverse — openly licensed
images, no API key, no signup, which keeps this inside the "nothing paid" rule.
Results are always presented as *a photo of a similar dish*, never as a photo
of the actual recipe, and the CC attribution travels with them.
"""
import requests

API = "https://api.openverse.org/v1/images/"
UA = "foodify/0.1 (personal meal planner)"
PER_PAGE = 8


def _license_label(code: str, version: str) -> str:
    """'by' + '2.0' -> 'CC BY 2.0'; 'cc0' is already prefixed, so don't double it."""
    code = (code or "").strip().upper()
    if not code:
        return ""
    prefix = "" if code.startswith("CC") else "CC "
    return f"{prefix}{code} {version or ''}".strip()


def _clean(item: dict) -> dict | None:
    url = item.get("url")
    if not url:
        return None
    return {
        "url": url,
        "thumbnail": item.get("thumbnail") or url,
        "title": (item.get("title") or "").strip()[:200],
        "creator": (item.get("creator") or "").strip()[:120],
        "license": _license_label(item.get("license") or "", item.get("license_version") or ""),
        "attribution": (item.get("attribution") or "").strip()[:400],
        "source_url": item.get("foreign_landing_url") or "",
    }


def search(query: str, page: int = 1) -> list[dict]:
    """Photos of a dish. Returns [] rather than raising — a missing photo is a
    cosmetic problem and must never fail the request that wanted one."""
    query = (query or "").strip()
    if not query:
        return []
    try:
        response = requests.get(
            API,
            params={
                "q": query,
                "page": max(1, page),
                "page_size": PER_PAGE,
                # photos of food, not diagrams or clip art
                "category": "photograph",
                "mature": "false",
            },
            headers={"User-Agent": UA},
            timeout=12,
        )
        if response.status_code != 200:  # includes the anonymous rate limit
            return []
        results = response.json().get("results") or []
    except Exception:  # noqa: BLE001 - network/parse issues degrade to "no photo"
        return []

    return [c for c in (_clean(r) for r in results) if c]
