"""Utilidades de texto para retos: pista legible, referencia de evaluación coherente."""

from __future__ import annotations

import re


def looks_like_ai_rubric(text: str) -> bool:
    """Detecta salidas tipo diccionario / rúbrica que la IA debe sustituir (no deben llegar al alumno)."""
    t = (text or "").strip()
    if not t:
        return True
    if t[0] in "[{":
        return True
    low = t.lower()
    if "sentence_structures" in low:
        return True
    if t.lstrip().startswith("{") or t.lstrip().startswith("["):
        if any(k in low for k in ("vocabulary", "grammar", "structures")):
            return True
    if re.search(r"['\"]grammar['\"]?\s*:", t, re.I):
        return True
    if re.search(r"['\"]vocabulary['\"]?\s*:", t, re.I):
        return True
    return False


def looks_like_stale_daily_task_prompt(text: str) -> bool:
    """
    Detecta consignas de retos guardadas con redacciones antiguas del generador para forzar regeneración.
    También sirve después de mejorar UX (menos párrafos repetidos).
    """
    low = (text or "").lower()
    needles = (
        "mención plausible",
        "aclaración amable sobre el cartel",
        "aclaración amable sobre el cartel/confusión",
        "**al menos una mención plausible**",
    )
    return any(n in low for n in needles)


def hint_for_student(expected_solution_ref: str, max_len: int = 280) -> str:
    """Pista segura para la UI; si la referencia es basura técnica, devuelve guía genérica."""
    if looks_like_ai_rubric(expected_solution_ref):
        return "Escribe una respuesta corta en inglés que cumpla la tarea de arriba. No tiene que repetir ejemplo palabra por palabra."
    return hint_truncate_at_word(expected_solution_ref, max_len)


def hint_truncate_at_word(text: str, max_len: int = 300) -> str:
    """
    Pista en UI: nunca a mitad de palabra. Si hace falta, corta en el último espacio y añade …
    """
    t = (text or "").strip()
    if len(t) <= max_len:
        return t
    head = t[:max_len]
    if " " in head:
        head = head.rsplit(" ", 1)[0]
    return head.rstrip(" ,;:") + "…"


def coerce_reference_for_eval(text: str) -> str:
    """
    La IA a veces deja 'expected_solution' a medias. Para evaluar, quita un final mutilado
    que confunde al comparador; prioriza oraciones con cierre, si no, corta a la última palabra completa.
    """
    t = (text or "").strip()
    if not t:
        return t
    if t[-1] in ".!?":
        return t
    # Última oración con puntuación de cierre
    best = -1
    for i, ch in enumerate(t):
        if ch in ".!?" and (i + 1 >= len(t) or t[i + 1] in " \n\t\"'"):
            if i + 1 > 15:
                best = i
    if best != -1:
        return t[: best + 1].strip()
    if " " in t and len(t) > 20:
        return t.rsplit(" ", 1)[0].rstrip(" ,;:") + "…"
    return t
