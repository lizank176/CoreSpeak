"""Validación de respuestas de ejercicios (misma lógica que frontend/app.js)."""

from __future__ import annotations

import json
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


def _validate_quiz_multi_block(
    block: dict[str, Any],
    *,
    answer: str | None,
    selected: list[str] | None,
) -> bool:
    preguntas = block.get("preguntas")
    if not isinstance(preguntas, list) or len(preguntas) < 2:
        return False
    responses: dict[str, Any] = {}
    if answer:
        try:
            parsed = json.loads(answer)
            if isinstance(parsed, dict):
                responses = parsed
        except json.JSONDecodeError:
            return False
    if not responses and selected:
        return False
    for idx, sub in enumerate(preguntas):
        if not isinstance(sub, dict):
            return False
        key = str(idx)
        raw = responses.get(key)
        sub_selected: list[str] | None = None
        sub_answer: str | None = None
        if isinstance(raw, list):
            sub_selected = [str(x).strip() for x in raw if str(x).strip()]
        elif raw is not None:
            sub_answer = str(raw).strip()
        if not sub_answer and not sub_selected:
            return False
        if not validate_catalog_block_answer(sub, answer=sub_answer, selected=sub_selected):
            return False
    return True


def validate_catalog_block_answer(
    block: dict[str, Any],
    *,
    answer: str | None,
    selected: list[str] | None,
) -> bool:
    block_type = str(block.get("type") or "").strip().lower()
    if block_type == "quiz_multi":
        return _validate_quiz_multi_block(block, answer=answer, selected=selected)

    valid = collect_valid_answers(block)
    if not valid:
        return False
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
