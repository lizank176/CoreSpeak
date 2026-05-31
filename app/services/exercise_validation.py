"""Validación de respuestas de ejercicios (misma lógica que frontend/app.js)."""

from __future__ import annotations

import re
import unicodedata
from typing import Any


def clean_answer_text(text: Any) -> str:
    if text is None:
        return ""
    raw = str(text).lower().strip()
    raw = re.sub(r'[.,/#!$%^&*;:{}=\-_`~()\'"]', "", raw)
    normalized = unicodedata.normalize("NFD", raw)
    return "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")


def collect_valid_answers(block: dict[str, Any]) -> list[str]:
    configured = block.get("respuestas_validas")
    if isinstance(configured, list):
        return [str(x).strip() for x in configured if str(x).strip()]
    for key in ("respuesta_correcta", "answer", "expected_answer", "correcta"):
        val = block.get(key)
        if val is not None and str(val).strip():
            return [str(val).strip()]
    return []


def answer_matches_valid(user_input: str, valid_list: list[str]) -> bool:
    cleaned_user = clean_answer_text(user_input)
    if not cleaned_user:
        return False
    return any(clean_answer_text(item) == cleaned_user for item in valid_list)


def answer_list_matches_valid(user_inputs: list[str], valid_list: list[str]) -> bool:
    cleaned_user = sorted(clean_answer_text(x) for x in user_inputs if clean_answer_text(x))
    cleaned_valid = sorted(clean_answer_text(x) for x in valid_list if clean_answer_text(x))
    return bool(cleaned_user) and len(cleaned_user) == len(cleaned_valid) and cleaned_user == cleaned_valid


def validate_catalog_block_answer(
    block: dict[str, Any],
    *,
    answer: str | None,
    selected: list[str] | None,
) -> bool:
    valid = collect_valid_answers(block)
    if not valid:
        return False
    block_type = str(block.get("type") or "").strip().lower()
    selection_mode = str(block.get("selection_mode") or "").strip().lower()
    is_single = selection_mode == "single_choice" or block_type in {"quiz", "test"} and selection_mode != "multiple_choice"

    if selected:
        opts = [str(x).strip() for x in selected if str(x).strip()]
        if not opts:
            return False
        if is_single:
            return answer_matches_valid(opts[0], valid)
        return answer_list_matches_valid(opts, valid)

    text = (answer or "").strip()
    if not text:
        return False
    return answer_matches_valid(text, valid)
