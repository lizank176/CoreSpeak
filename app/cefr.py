"""Normalización de niveles CEFR para inglés y retos."""

from __future__ import annotations

ALLOWED_CEFR_EN: frozenset[str] = frozenset({"A1", "A2", "B1", "B2", "C1", "C2"})


def normalize_cefr_level(raw: str | None) -> str:
    s = (raw or "").strip().upper()
    if s in ALLOWED_CEFR_EN:
        return s
    return "A1"
