"""Reglas de idiomas de aprendizaje: foco en inglés; Premium puede añadir más códigos."""

from __future__ import annotations

from app.constants import PRIMARY_COURSE_CODE


def merge_premium_language_codes(tj: dict) -> list[str]:
    out: list[str] = [PRIMARY_COURSE_CODE]
    seen: set[str] = {PRIMARY_COURSE_CODE}
    for c in (tj or {}).get("languages", []):
        cl = str(c).strip().lower()
        if not cl or cl in seen:
            continue
        seen.add(cl)
        out.append(cl)
    return out
