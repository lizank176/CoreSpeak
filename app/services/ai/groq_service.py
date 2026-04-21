from __future__ import annotations

import json
from datetime import datetime
from typing import Any

import httpx

from app.config import settings


def _fallback_challenge(level_code: str, interests: list[str], target_language: str, native_language: str) -> dict[str, str]:
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


def _groq_chat(system_prompt: str, user_prompt: str, temperature: float = 0.2) -> str:
    if not settings.groq_api_key:
        raise ValueError("missing_groq_api_key")
    url = f"{settings.groq_base_url.rstrip('/')}/chat/completions"
    payload: dict[str, Any] = {
        "model": settings.groq_model,
        "temperature": temperature,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    }
    headers = {"Authorization": f"Bearer {settings.groq_api_key}", "Content-Type": "application/json"}
    with httpx.Client(timeout=30) as client:
        resp = client.post(url, headers=headers, json=payload)
        resp.raise_for_status()
        data = resp.json()
    return data["choices"][0]["message"]["content"]


def build_daily_challenge(
    user_name: str,
    level_code: str,
    interests: list[str],
    target_language: str,
    native_language: str,
) -> dict[str, str]:
    interest_text = ", ".join(interests[:3]) if interests else "situaciones cotidianas"
    system_prompt = (
        "Eres un generador de retos de idiomas. Devuelve SOLO JSON valido con claves: "
        "scenario, task_prompt, expected_solution."
    )
    user_prompt = (
        "Genera un reto de 5 minutos para aprendizaje de idiomas.\n"
        f"Usuario: {user_name}\n"
        f"Nivel: {level_code}\n"
        f"Intereses: {interest_text}\n"
        f"Idioma objetivo: {target_language}\n"
        f"Idioma nativo de soporte: {native_language}\n"
    )
    try:
        content = _groq_chat(system_prompt=system_prompt, user_prompt=user_prompt)
        parsed = json.loads(content)
        if all(k in parsed for k in ("scenario", "task_prompt", "expected_solution")):
            return {
                "scenario": str(parsed["scenario"])[:1000],
                "task_prompt": str(parsed["task_prompt"])[:1000],
                "expected_solution": str(parsed["expected_solution"])[:2000],
            }
    except Exception:
        pass
    return _fallback_challenge(level_code, interests, target_language, native_language)


def semantic_validate_answer(user_answer: str, expected_solution: str) -> tuple[bool, float, str]:
    system_prompt = (
        "Evalua semanticamente una respuesta de estudiante comparada con solucion esperada. "
        "Devuelve SOLO JSON con: is_correct (boolean), score (0-1), feedback (string)."
    )
    user_prompt = f"Solucion esperada:\n{expected_solution}\n\nRespuesta del usuario:\n{user_answer}"
    try:
        content = _groq_chat(system_prompt=system_prompt, user_prompt=user_prompt, temperature=0.0)
        parsed = json.loads(content)
        is_ok = bool(parsed.get("is_correct", False))
        score = float(parsed.get("score", 0))
        feedback = str(parsed.get("feedback", ""))
        return is_ok, max(0.0, min(1.0, round(score, 2))), feedback[:2000]
    except Exception:
        answer = user_answer.lower().strip()
        expected = expected_solution.lower().strip()
        overlap = sum(1 for w in expected.split()[:12] if w in answer)
        score = min(1.0, overlap / 6.0)
        is_ok = score >= 0.6
        feedback = (
            "Buen trabajo. Cumples la intencion comunicativa del reto."
            if is_ok
            else "Falta precision gramatical o semantica. Intenta incluir pregunta, precio y negociacion."
        )
        return is_ok, round(score, 2), feedback

