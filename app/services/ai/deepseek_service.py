from __future__ import annotations

from datetime import datetime


def build_daily_challenge(
    user_name: str,
    level_code: str,
    interests: list[str],
    target_language: str,
    native_language: str,
) -> dict[str, str]:
    """
    Placeholder local until DeepSeek integration keys are configured.
    Keep response in JSON-compatible format expected by API.
    """
    interest_text = interests[0] if interests else "situaciones cotidianas"
    return {
        "scenario": f"Hoy ({datetime.utcnow().date()}) estas en una tienda de tecnologia.",
        "task_prompt": (
            f"Pregunta en {target_language} por el precio de la camara mas cara y negocia una oferta. "
            f"Nivel objetivo: {level_code}. Contexto de interes: {interest_text}."
        ),
        "expected_solution": (
            f"Debe expresar una pregunta clara en {target_language}, incluir precio y una frase de negociacion. "
            f"Puede apoyarse en {native_language} solo para entender instrucciones."
        ),
    }


def semantic_validate_answer(user_answer: str, expected_solution: str) -> tuple[bool, float, str]:
    """
    Basic semantic approximation; swap with DeepSeek call later.
    """
    answer = user_answer.lower().strip()
    expected = expected_solution.lower().strip()
    overlap = sum(1 for w in expected.split()[:12] if w in answer)
    score = min(1.0, overlap / 6.0)
    is_ok = score >= 0.6
    if is_ok:
        feedback = "Buen trabajo. Cumples la intencion comunicativa del reto."
    else:
        feedback = "Falta precision gramatical o semantica. Intenta incluir pregunta, precio y negociacion."
    return is_ok, round(score, 2), feedback

