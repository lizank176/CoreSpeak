from __future__ import annotations

import hashlib
import json
import logging
import os
import re
from datetime import datetime
from typing import Any

import httpx

from app.cefr import normalize_cefr_level
from app.challenge_text import looks_like_ai_rubric
from app.interest_catalog import english_for_ai_prompt, learner_topics_meaningful
from app.constants import SCORE_DAILY_STRONG_SEMANTIC

logger = logging.getLogger(__name__)


class GroqSettings:
    api_key: str = os.environ.get("GROQ_API_KEY", "")
    model: str = "llama-3.3-70b-versatile"
    url: str = "https://api.groq.com/openai/v1/chat/completions"


def _groq_request(system_prompt: str, user_prompt: str, temperature: float = 0.7) -> str:
    headers = {"Authorization": f"Bearer {GroqSettings.api_key}", "Content-Type": "application/json"}
    payload = {
        "model": GroqSettings.model,
        "temperature": temperature,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "response_format": {"type": "json_object"},
    }
    with httpx.Client(timeout=45) as client:
        resp = client.post(GroqSettings.url, headers=headers, json=payload)
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]


def _interest_line(interests: object) -> str:
    """Temas solo en inglés canónico (catálogo) para prompts y escenario modelo."""
    return english_for_ai_prompt(interests)


# Solo señales inequívocamente no inglesas (evitar falsos positivos con palabras válidas tipo "music").
_SPANGLISH_LEAK_RE = re.compile(r"videojuegos|\bcelebridad\b|\bmúsica\b|¿|¡", re.I)


def _looks_like_non_english_leak(text: str) -> bool:
    """Scenario / modelo en inglés: bloquear spanglish claro sin castigar inglés válido."""
    return bool(_SPANGLISH_LEAK_RE.search(text or ""))


def _solution_word_cap(level_code: str) -> int:
    lv = normalize_cefr_level(level_code)
    if lv == "A1":
        return 12
    if lv == "A2":
        return 17
    return 20


def _weave_topics_into_fallback(
    scenario: str,
    task_prompt: str,
    interests_readable: str,
    es_hint: bool,
    *,
    level_code: str = "B1",
) -> tuple[str, str]:
    """Temas en intereses: nivel bajo = español muy simple y sin mezclar listas largas en inglés en el escenario."""
    if not learner_topics_meaningful(interests_readable):
        return scenario, task_prompt
    lv = normalize_cefr_level(level_code)
    first = interests_readable.split(",")[0].strip()

    if lv == "A1":
        scenario2 = scenario
        if es_hint:
            extra = (
                "\n\n(Opcional nivel A1 — fácil.) En UNA de tus tres frases en inglés, di algo muy simple sobre lo "
                "que te gusta, por ejemplo: \"I love movies\", \"I love music\", \"I love dogs\". Usa pocas palabras."
            )
        else:
            extra = (
                "\n\n(Optional A1) In ONE of three English phrases, mention a hobby you love using very basic words "
                "(e.g. movies, pets, trips)."
            )
        return scenario2, task_prompt + extra

    if lv == "A2":
        scenario2 = scenario + " You quietly think about hobbies you enjoy, but stay with easy English words only."
        if es_hint:
            extra = (
                "\n\nComo mínimo en una frase fácil, conecta tu inglés con **un** interés que elegiste en tu perfil "
                "(no hace falta listar temas)."
            )
        else:
            extra = (
                "\n\nIn at least one easy phrase, touch ONE profile interest without listing them; keep wording basic."
            )
        return scenario2, task_prompt + extra

    scenario2 = scenario + (
        f' Something that matters to you here: you want the moment to echo "{first}" in a natural way.'
    )
    if es_hint:
        extra = (
            "\n\nRecuerda: en **alguna** de tus frases en inglés conecta con uno de tus intereses del perfil "
            "(no hace falta nombrarlos todos; con una mención natural basta)."
        )
    else:
        extra = (
            "\n\nRemember: weave at least one natural nod to ONE of your profile interests—you do not "
            "need to cite every hobby."
        )
    return scenario2, task_prompt + extra


def _ensure_period(s: str) -> str:
    s = " ".join((s or "").split()).strip()
    if not s:
        return s
    return s if s[-1] in ".!?" else s + "."


def _cap_solution_words(text: str, max_words: int = 20) -> str:
    text = " ".join((text or "").split()).strip()
    if not text:
        return text
    words = text.split()
    if len(words) > max_words:
        text = " ".join(words[:max_words]).rstrip(",;:\"'")
    return _ensure_period(text)


def _stable_index(key: str, modulo: int) -> int:
    if modulo <= 0:
        return 0
    h = hashlib.sha256(key.encode("utf-8")).hexdigest()
    return int(h[:12], 16) % modulo


def _daily_entropy_seed(variety_key: str) -> str:
    """
    Añade ordinal de calendario a la semilla estable para evitar colisiones módulo pequeños
    entre días distintos con la misma clave parcial (p. ej. usuario + fecha ISO).
    """
    raw = variety_key.strip() or "default"
    if ":" not in raw:
        return raw
    uid, tail = raw.split(":", 1)
    iso = tail.strip()[:10]
    try:
        d = datetime.strptime(iso, "%Y-%m-%d").date()
        return f"{uid}:{d.isoformat()}:ordinal{d.toordinal()}"
    except ValueError:
        return raw


# Micro-temas distintos: el modelo debe anclarse a uno cada día (más variedad que un prompt genérico).
_DAY_THEMES: tuple[str, ...] = (
    "public transport delay: polite small talk and asking for alternatives",
    "hostel front desk: check-out time, luggage room, noisy room",
    "bakery queue: ask what's fresh, allergens, paying by card",
    "coworking space: Wi-Fi issue, reserving a printer, breakout room etiquette",
    "rainy outdoor market: bargain politely, compliment a vendor, weigh produce",
    "airport gate change: confirm departure time and nearest café",
    "flatmate chat: chores schedule, borrowing kitchen items, respectful noise limits",
    "climbing gym reception: beginner route ask, chalk policy, waiver question",
    "community language exchange table: introducing yourself without bookshop clichés",
    "dog park small talk with another owner: leash rules, vets nearby",
    "pharmacy: describe mild symptoms politely, dosing questions as allowed",
    "bike rental kiosk: helmets, deposits, recommending a scenic loop",
    "music festival campsite: neighbours' volume, swapping set times politely",
    "late-night takeaway: substitutions, allergens, thanking staff",
    "library makerspace/help desk (not bookstore): reserving tools, silent zones",
)


def _offline_fallback_bundle(
    variety_key: str,
    native_language: str,
    *,
    interests_readable: str = "modern life",
    level_code: str = "B1",
) -> dict[str, str]:
    """Retos locales si Groq falla: variante distinta cada día; A1 usa plantillas extra simples."""
    nl = native_language.strip().lower()
    es_hint = nl in ("es", "es-es") or nl.startswith("es")
    lv = normalize_cefr_level(level_code)
    mw = _solution_word_cap(lv)

    tp_other_default = (
        "In English only: three very short starter sentences (total ~12 words). "
        f"Pattern: greeting + one easy question + thank you. (Your first language may be {native_language}.)"
    )

    # A1: mismas 12 situaciones que el pack estándar pero con inglés y consignas mínimas.
    variants_a1: tuple[tuple[str, str, str, str], ...] = (
        (
            "You wait at the station. The train is late. Many people stand near you.",
            "Nivel A1. En inglés escribe 3 frases MUY cortas (4-7 palabras cada una). "
            "1) Di Hello o Hi. 2) Pregunta: Is the train late? 3) Di Thank you.",
            tp_other_default,
            "Hello. Is the train late? Thank you.",
        ),
        (
            "You are at the hotel desk. You are tired. The worker smiles at you.",
            "Nivel A1. En inglés, 3 frases cortas: Hello. What time is checkout? Can I leave my bag here?",
            tp_other_default,
            "Hello. What time is checkout? Can I leave my bag here?",
        ),
        (
            "It is rainy. You see cakes in a small shop. A person works there.",
            "Nivel A1. En inglés: It looks good. What is the price? Can I pay with card?",
            tp_other_default,
            "It looks good. What is the price? Can I pay with card?",
        ),
        (
            "Two people talk at the office printer. You need to print. You wait.",
            "Nivel A1. En inglés: Hello. Can I print now? Thank you.",
            tp_other_default,
            "Hello. Can I print now? Thank you.",
        ),
        (
            "You are at the chemist shop. Your head hurts a little. You need help.",
            "Nivel A1. En inglés: Hello. My head hurts. Can you help me? Thank you.",
            tp_other_default,
            "Hello. My head hurts. Can you help me? Thank you.",
        ),
        (
            "You want a bike. There are helmets on a wall. A person is at the desk.",
            "Nivel A1. En inglés: Hello. Can I rent a helmet? How much is it? Thank you.",
            tp_other_default,
            "Hello. Can I rent a helmet? How much is it? Thank you.",
        ),
        (
            "You sit with a new class friend. You want to practice English. You feel shy.",
            "Nivel A1. En inglés: Hi, I am Alex. Nice to meet you. I want to practice English.",
            tp_other_default,
            "Hi, I am Alex. Nice to meet you. I want to practice English.",
        ),
        (
            "You are at the park. A person has a dog. The sun is low.",
            "Nivel A1. En inglés: Hello. Your dog is nice. Thank you.",
            tp_other_default,
            "Hello. Your dog is nice. Thank you.",
        ),
        (
            "You are at the airport. You see many screens. You need your gate number.",
            "Nivel A1. En inglés: Excuse me. What is my gate? Thank you.",
            tp_other_default,
            "Excuse me. What is my gate? Thank you.",
        ),
        (
            "Your phone shows a message about dishes. Your flatmate is not happy. You want to help.",
            "Nivel A1. En inglés 3 frases cortas: Sorry. I can wash the dishes today. Is that OK?",
            tp_other_default,
            "Sorry. I can wash the dishes today. Is that OK?",
        ),
        (
            "It is evening. There is a small stand with shirts. You see a name on paper.",
            "Nivel A1. En inglés: Hello. What size is this? Can I pay with card? Thank you.",
            tp_other_default,
            "Hello. What size is this? Can I pay with card? Thank you.",
        ),
        (
            "You are at a sports wall place. It is your first day. You forgot socks.",
            "Nivel A1. En inglés: Hello. It is my first time here. Can I buy socks?",
            tp_other_default,
            "Hello. It is my first time here. Can I buy socks?",
        ),
    )

    variants_std: tuple[tuple[str, str, str, str], ...] = (
        (
            "Your train leaves in twenty minutes but the board just flipped to 'delayed'. The platform is crowded "
            "and you are not sure if you should wait or reroute.",
            "En inglés, escribe tres frases: saluda brevemente, pregunta con educación cuánto puede durar el retraso "
            "y pide una alternativa práctica.",
            "In English, write three sentences: a short greeting, politely ask how long the delay might be, "
            f"and request a practical alternative. Explain the instructions clearly in {native_language} if helpful.",
            "Hi — do you know how long this delay might last? Could you suggest the fastest alternative route, please?",
        ),
        (
            "You arrive at your hostel tired. The hallway smells like cleaning products and someone's playing "
            "quiet guitar two doors down.",
            "En inglés, escribe tres frases para recepción: saludo, dos preguntas (hora de salida y consigna de maletas), "
            "y un comentario positivo pero breve sobre el ambiente.",
            "In English, write three sentences to reception: greeting, two questions about check-out time and luggage "
            f"storage, and one brief positive remark about atmosphere. Explain in {native_language} if needed.",
            "Hi! What time is check-out tomorrow? Could I leave my bag behind the desk until evening? Love the mellow vibe.",
        ),
        (
            "It's drizzling at an outdoor stall row. You've never tried the local pastries and the cashier looks busy.",
            "En inglés, escribe tres frases: felicitar/comentar lo que ves, preguntar qué lleva un pastel que recomiendas "
            "y confirmar cómo pagan (efectivo o tarjeta).",
            "In English: three sentences—compliment what you notice, ask what is inside a pastry you recommend, "
            f"confirm card vs cash. Use {native_language} for instructions if clearer.",
            "These look incredible. What's inside the almond swirl? Sorry, do you take contactless card only today?",
        ),
        (
            "Coworking space is humming. Two people are debating who booked the printer, and both sound tense.",
            "En inglés, escribe tres frases: entrate con saludo cortés, pide turno o norma sobre la impresora, "
            "y propón un compromiso simple.",
            "In English: three sentences—polite entry, ask about printer rules or booking, propose a fair compromise.",
            "Hi folks — what's the etiquette for printer time here? Shall we rotate ten minutes each? Works for everyone?",
        ),
        (
            "At the pharmacy counter there's a slight language barrier ahead of you. You need something for a mild headache.",
            "En inglés, escribe tres frases: explica el malestar con cortesía, pregunta qué opción recomiendan sin receta "
            "y despídete.",
            "In English: three sentences describe a mild symptom politely, ask which simple medicine they "
            "suggest without prescription, goodbye.",
            "Hello — mild headache today. What's the OTC option you'd recommend here? Thanks so much.",
        ),
        (
            "Bike rental shack by the marina. You've never ridden locally and helmets look different from home.",
            "En inglés, escribe tres frases: solicita casco y tamaño si aplica, confirma fianza o documento, "
            "pide recomendación de ruta corta y segura.",
            "In English: three sentences covering helmet/size, deposit or ID requirement, safe short scenic loop suggestion.",
            "Could I rent a helmet in medium? What's the deposit? Any quiet 30-minute coastal loop you'd suggest?",
        ),
        (
            "Community language-exchange night. You've just sat down beside someone new.",
            "En inglés, escribe tres frases: preséntate, di por qué estás ahí esta noche en una línea, "
            "y haz una invitación suave para seguir conversando después.",
            "In English: three sentences—introduction, why you're there tonight briefly, polite invite to chat more later.",
            "I'm Elena, here to practice English casually. Wanted real conversation, not textbooks. Shall we swap numbers later?",
        ),
        (
            "Dog park dusk. Owners are joking about leash rules after a clumsy leash tangle incident.",
            "En inglés, escribe tres frases: mensaje divertido/light sin ofender, pregunta regla práctica sobre correa, "
            "agradecimiento breve.",
            "In English: light humor without offense, genuine question about leash policy, brief thanks.",
            "That was choreography! Should leads stay clipped at the picnic tables here? Cheers for the tip.",
        ),
        (
            "Airport monitors flicker wrong gate rumours. Hunger hits and caffeine would help.",
            "En inglés, escribe tres frases para personal de información: confirmar puerta si es posible, "
            "donde encuentras agua gratuita/barato, y tiempo de seguridad esperado.",
            "In English: three sentences—confirm gate politely, cheapest water/snack cue, approximate security cue.",
            "Is gate C18 still confirmed? Where's refillable water cheapest? Typical security queue time tonight?",
        ),
        (
            "Shared flat WhatsApp pings: dishes noise last night annoyed someone subtly.",
            "En inglés, escribe un mensaje en inglés (3 frases cortas, tono respetuoso): reconocimiento, compromiso práctico, "
            "una pregunta para acordar regla futura.",
            "In English: write a three-short-sentence roommate message that's respectful acknowledgment, tangible fix proposal, asks for mutual rule.",
            "Sorry dishes were noisy. I'll wash dishes by 21:30. Does a midnight quiet-hours rule suit you?",
        ),
        (
            "Outdoor night market stall for festival merch—the band names are scribbled oddly on tags.",
            "En inglés, escribe tres frases claras sobre el texto del nombre, la talla o stock, y cómo pagar.",
            "In English: three sentences politely about the name tag, sizing/stock, and payment mode.",
            "Is this hoodie the same band spelled with the extra letter? Have you got a medium? Can I pay with card?",
        ),
        (
            "Climbing gym first visit—you're embarrassed about forgetting socks rental fees.",
            "En inglés, escribe tres frases en recepción: saludo, pregunta básicos de día de prueba/reglas rápidas, "
            "pide ayuda específica (calcetines/arriendo equipamiento).",
            "In English: three sentences greeting, ask quick first-trial safety basics, socks/rentals specific ask.",
            "Hi, first climb here ever. Mandatory auto-belay intro first? Socks rental still available?",
        ),
    )

    variants = variants_a1 if lv == "A1" else variants_std
    sk = _daily_entropy_seed(variety_key)
    idx = _stable_index(f"{sk}:offline", len(variants))
    scenario, tp_es, tp_other, solution = variants[idx]
    tp0 = tp_es if es_hint else tp_other
    scenario2, tp2 = _weave_topics_into_fallback(
        scenario, tp0, interests_readable, es_hint, level_code=lv
    )
    return {
        "scenario": scenario2,
        "task_prompt": tp2,
        "expected_solution": _cap_solution_words(solution, mw),
    }


def _too_similar_to_recent(scenario: str, recent: list[str] | None) -> bool:
    if not recent:
        return False
    s_norm = " ".join((scenario or "").lower().split())
    if len(s_norm) < 28:
        return False
    head = s_norm[:110]
    for r in recent:
        r_norm = " ".join((r or "").lower().split())
        if not r_norm:
            continue
        if s_norm == r_norm or (len(r_norm) >= 40 and head == r_norm[:110]):
            return True
    return False


def _scenario_exclusion_block(recent: list[str] | None) -> str:
    if not recent:
        return "(Aún no hay historial para este estudiante — elige una situación nueva y muy concreta.)"
    lines: list[str] = []
    for i, raw in enumerate(recent[:14], start=1):
        s = " ".join(str(raw).split()).strip()
        if not s:
            continue
        lines.append(f"{i}. {s[:220]}")
    if not lines:
        return "(Aún no hay historial — situación nueva y concreta.)"
    return "\n".join(lines)


def _post_process_challenge(
    data: dict[str, str],
    fallback: dict[str, str],
    *,
    max_solution_words: int = 20,
) -> dict[str, str]:
    s = (data.get("scenario") or "").strip()
    p = (data.get("task_prompt") or "").strip()
    e = (data.get("expected_solution") or "").strip()
    if looks_like_ai_rubric(s):
        s = fallback["scenario"]
    if looks_like_ai_rubric(p):
        p = fallback["task_prompt"]
    if looks_like_ai_rubric(e):
        e = fallback["expected_solution"]
    e = _cap_solution_words(e, max_solution_words)
    if not s:
        s = fallback["scenario"]
    if not p:
        p = fallback["task_prompt"]
    if not e:
        e = fallback["expected_solution"]
    return {"scenario": s, "task_prompt": p, "expected_solution": e}


def _extract_json_object_text(content: str) -> str:
    """Extrae un objeto JSON aunque el modelo añada markdown/prefijos."""
    text = (content or "").strip()
    if not text:
        return text
    fenced = re.search(r"```(?:json)?\s*(\{[\s\S]*\})\s*```", text, re.IGNORECASE)
    if fenced:
        return fenced.group(1).strip()
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        return text[start : end + 1].strip()
    return text


def _soft_clean_english_fields(scenario: str, expected_solution: str) -> tuple[str, str]:
    """Limpieza mínima para evitar fallback por ruido puntual de puntuación."""
    clean_scenario = (scenario or "").replace("¿", "").replace("¡", "").strip()
    clean_expected = (expected_solution or "").replace("¿", "").replace("¡", "").strip()
    return clean_scenario, clean_expected


def build_daily_challenge(
    user_name: str,
    level_code: str,
    interests: object,
    target_language: str = "English",
    native_language: str = "es",
    *,
    recent_scenarios: list[str] | None = None,
    variety_key: str = "",
) -> dict[str, str]:
    """Genera el reto diario (Groq) con degradación segura a fallback local.

    Objetivo: siempre devolver un bundle usable para UI aunque la llamada externa
    falle, venga malformada o repita demasiado escenarios recientes.
    """
    lvl = normalize_cefr_level(level_code)
    interest_text = _interest_line(interests)
    mw_cap = _solution_word_cap(lvl)
    simple_band = lvl in ("A1", "A2")

    # Semilla estable por usuario/día para mantener variedad y reproducibilidad.
    vk = variety_key.strip() or f"{user_name}:{lvl}:{interest_text}"
    seed = _daily_entropy_seed(vk)
    theme_pick = _DAY_THEMES[_stable_index(f"{seed}:theme", len(_DAY_THEMES))]
    exclusions = _scenario_exclusion_block(recent_scenarios)

    system_prompt = (
        "You are a creative English teacher (ESL). Build a ~5-minute speaking/writing mini-challenge that feels "
        "human — not technical. Return ONLY valid JSON with three string fields. Write like a colleague planning "
        "an exercise, NOT like a syllabus or a developer. Never put bullet lists of grammar, vocab tables, tags, JSON "
        "fragments or rubrics inside any value — only fluent prose the student will read."
    )

    immersion = (
        f'Keys "scenario" and "expected_solution" must be plain English only (natural speech). '
        f'Key "task_prompt" must be entirely in instructional language keyed by locale ({native_language}); '
        "describe what to produce in English without dumping raw English comma-lists of topic tags — refer vaguely to "
        "the interests they chose in their profile (no English tag dump)."
    )

    difficulty_line = (
        "Keep English **very simple** (short clauses, everyday words)." if simple_band else
        "English can be richer but still conversational, not textbook metalanguage."
    )

    story_style_note = ""
    if simple_band:
        story_style_note = " Prefer short sentences and present tense."

    user_prompt = f"""
Teacher brief — create ONE challenge JSON for learner **{user_name}** at CEFR **{lvl}**.
They practice **{target_language}**. Mood / setting seed (bend the story gently around this): "{theme_pick}".
Internal topic hints for you (never paste this wholesale into task_prompt): {interest_text}.

{difficulty_line}
{immersion}

Avoid repeating setups that feel like earlier attempts for this learner:
{exclusions}

Return JSON object with keys exactly:

1. "scenario" — Exactly **3** sentences in English. A vivid mini-story related to everyday life AND those topic hints above.{story_style_note}

2. "task_prompt" — Instructions in **{native_language}** telling the student what **English** lines to compose. Friendly, concise, actionable (e.g. greet + ask prices). No jargon about pedagogy frameworks.

3. "expected_solution" — One plausible model reply in English the learner might aim for (synonyms okay). Whole sentences, sounding human — **maximum {mw_cap} words**. No appendix notes.

Respond with JSON only."""

    # Se prepara antes del request para poder cortar rápido en cualquier error.
    fallback = _offline_fallback_bundle(
        vk, native_language, interests_readable=interest_text, level_code=lvl
    )

    if not GroqSettings.api_key:
        return fallback

    try:
        content = _groq_request(system_prompt, user_prompt, temperature=0.85)
        parsed = json.loads(_extract_json_object_text(content))
        if not isinstance(parsed, dict):
            logger.warning("daily_challenge fallback: groq returned non-dict payload")
            return fallback
        raw = {
            "scenario": str(parsed.get("scenario") or "").strip(),
            "task_prompt": str(parsed.get("task_prompt") or "").strip(),
            "expected_solution": str(parsed.get("expected_solution") or "").strip(),
        }
        # Sanitiza JSON de IA y rellena campos vacíos/raros con fallback.
        outcome = _post_process_challenge(raw, fallback, max_solution_words=mw_cap)
        if _too_similar_to_recent(outcome["scenario"], recent_scenarios):
            # Si se parece demasiado a retos previos, forzamos variante local distinta.
            logger.info("daily_challenge fallback: scenario too similar to recent")
            return _offline_fallback_bundle(
                f"{vk}:dup-recovery",
                native_language,
                interests_readable=interest_text,
                level_code=lvl,
            )
        scenario_clean, expected_clean = _soft_clean_english_fields(
            outcome["scenario"],
            outcome.get("expected_solution") or "",
        )
        if scenario_clean != outcome["scenario"] or expected_clean != (outcome.get("expected_solution") or ""):
            outcome["scenario"] = scenario_clean
            outcome["expected_solution"] = expected_clean
        if _looks_like_non_english_leak(outcome["scenario"]) or _looks_like_non_english_leak(outcome["expected_solution"]):
            # Evita contaminación de idioma en campos que deben ser 100% inglés.
            logger.info("daily_challenge fallback: non-english leak detected after cleanup")
            return _offline_fallback_bundle(
                f"{vk}:lang-leak",
                native_language,
                interests_readable=interest_text,
                level_code=lvl,
            )
        return outcome
    except Exception as e:
        logger.exception("daily_challenge fallback: generation failed, using offline bundle (%s)", e)
        return fallback


def _apply_beginner_score_floor(answer: str, score: float, level_code: str) -> float:
    """Impide reinicios de racha brutales por errores típicos de A1/A2 cuando el intento es reconocible."""
    lv = normalize_cefr_level(level_code)
    t = answer.strip()
    if not t:
        return score
    words_ct = len(t.split())
    if lv == "A1" and words_ct >= 5 and score < 0.30:
        return 0.30
    if lv == "A2" and words_ct >= 6 and score < 0.27:
        return 0.27
    return score


def _eval_feedback_language_short(native_language: str) -> str:
    return (native_language or "es").strip().lower().split("-")[0] or "es"


def _localized_eval_fallback_message(native_language: str, *, error: bool) -> str:
    lc = _eval_feedback_language_short(native_language)
    if error:
        blobs = {
            "es": (
                "No pudimos conectar con el tutor automático en este momento. Tu respuesta sí se ha guardado. "
                "Mientras tanto, revisa la consigna y la **pista**, y compara frase a frase."
            ),
            "en": (
                "We couldn't reach the automated tutor right now — your answer was saved. "
                "Compare your sentences with the scenario hint in the meantime."
            ),
            "fr": "Impossible d'obtenir une correction automatique pour l'instant.",
            "uk": "Зараз автоматичний викладач недоступний.",
        }
        return blobs.get(lc, blobs["es"])
    blobs = {
        "es": (
            "Revisa la consigna: suele pedir **varias frases cortas**. Compara con la pista y corrige palabra por palabra."
        ),
        "en": "Check the task: it often asks for multiple short sentences. Align with the hint.",
    }
    return blobs.get(lc, blobs["es"])


def _inject_correction_hints(
    feedback: str,
    user_answer: str,
    expected_solution: str,
    native_language: str,
    *,
    weak_score: bool,
) -> str:
    """
    Asegura correcciones concretas incluso si el modelo devolvió un feedback vago.
    Cubre errores muy frecuentes (cart/card) y aviso de pocas frases cuando aplica.
    """
    base = (feedback or "").strip()
    ua = (user_answer or "").strip()
    if not ua:
        return base or _localized_eval_fallback_message(native_language, error=False)

    lc = _eval_feedback_language_short(native_language)
    additions: list[str] = []
    ulo = ua.lower()

    if re.search(r"\bcart\b", ulo) and not re.search(r"\bcards?\b", ulo):
        if lc == "es":
            additions.append(
                'Corrección: "**cart**" significa carrito de compra. Para **tarjeta** debes escribir "**card**" '
                '(por ejemplo: «Can I pay **with a card**?»).'
            )
        elif lc == "uk":
            additions.append('Виправлення: "cart" ≠ "card" (банківська картка): Can I pay with a card?')
        else:
            additions.append('Correction: use "**card**" for paying (bank card), not "**cart**". Example: "Can I pay with a card?"')

    rough_sents = [s for s in re.split(r"(?<=[.!?])\s+", ua) if s.strip()]
    if weak_score and len(rough_sents) < 2:
        exp_sents = len([s for s in re.split(r"(?<=[.!?])\s+", (expected_solution or "").strip()) if s.strip()])
        if exp_sents >= 3:
            if lc == "es":
                additions.append(
                    "Según la consigna, hacen falta **varias frases** (separadas por punto o signo de interrogación), "
                    "no solo una oración larga."
                )
            else:
                additions.append("The task expects **several separate short sentences**, not a single long line.")

    if not additions:
        return base

    sep = "\n\n" if base else ""
    banner = "Corrección:" if lc == "es" else "Correction notes:"
    combined = f"{base}{sep}{banner}\n" + "\n".join(additions)
    return combined.strip()


def semantic_validate_answer(
    user_answer: str,
    expected_solution: str,
    native_language: str = "es",
    **ctx: Any,
) -> tuple[bool, float, str]:
    """Evalúa semánticamente una respuesta de reto y devuelve (fuerte, score, feedback)."""
    nl = (native_language or "es").strip() or "es"
    nl_short = _eval_feedback_language_short(nl)
    task_prompt = str(ctx.get("task_prompt") or "").strip()
    scenario = str(ctx.get("scenario") or "").strip()
    lvl_band = normalize_cefr_level(str(ctx.get("level_code") or "B1"))

    fairness_note = ""
    if lvl_band == "A1":
        fairness_note = (
            "\nPRIMARY BEGINNER: messy but understandable English aligned with the task should usually score ~0.38–0.55. "
            "Reserve totals below ~0.28 only for nonsense, blanks, or wrong language entirely. CARD/CART typo = partial "
            "credit.\n"
        )
    elif lvl_band == "A2":
        fairness_note = (
            "\nA2 fairness: imperfect structure OK if meaning matches the scenario instructions — avoid ultra-low totals.\n"
        )

    system_prompt = (
        "You are a helpful English tutor. Judge the student's production against the task and the spirit of the scenario. "
        'Return ONLY valid JSON object with numeric "score" (0–1) and single string "feedback". '
        f'Everything inside "feedback" must be readable for a learner whose UI locale is roughly "{nl_short}". '
        "No syllabus dumps, bullet rubrics inside JSON keys, nor meta talk about grading algorithms.\n"
        f"{fairness_note}"
        "If grammar slips exist, cite them succinctly inside feedback with WRONG→RIGHT micro examples where helpful. "
        "Never leave feedback empty.\n"
        "Use {\"score\": number, \"feedback\": string} only."
    )

    user_prompt = f"""
LEVEL: {lvl_band}

SCENARIO (context only):
{scenario}

TASK learners saw:
{task_prompt}

REFERENCE_MODEL (synonyms reordering OK — not quoting exam):
"{expected_solution}"

STUDENT_ANSWER:
"{user_answer.strip()}"

Brief flow: compare meaning → note concrete English mistakes → end with motivating next step written for locale {nl_short}.
"""

    try:
        content = _groq_request(system_prompt, user_prompt, temperature=0.0)
        data = json.loads(content)
        score_raw = float(data.get("score", 0))
        score = max(0.0, min(1.0, score_raw))
        # Piso de score para A1/A2: evita castigos extremos por errores menores.
        score = _apply_beginner_score_floor(user_answer.strip(), score, lvl_band)
        feedback_raw = str(data.get("feedback") or "").strip()
        if not feedback_raw:
            feedback_raw = _localized_eval_fallback_message(nl, error=False)
        weak = score < SCORE_DAILY_STRONG_SEMANTIC
        # Post-procesa feedback para añadir correcciones concretas de alto valor.
        feedback = _inject_correction_hints(
            feedback_raw,
            user_answer.strip(),
            expected_solution,
            nl,
            weak_score=weak,
        )
        is_strong = score >= SCORE_DAILY_STRONG_SEMANTIC
        return is_strong, score, feedback
    except Exception:
        fb = _localized_eval_fallback_message(nl, error=True)
        fb = _inject_correction_hints(
            fb,
            user_answer.strip(),
            expected_solution,
            nl,
            weak_score=True,
        )
        return False, 0.0, fb


def _language_name_for_tutor(code: str) -> str:
    lc = (code or "en").strip().lower()
    names = {
        "en": "English",
        "es": "Spanish",
        "fr": "French",
        "de": "German",
        "uk": "Ukrainian",
    }
    return names.get(lc, lc.upper() or "English")


def _localized_tutor_fallback(ui_language: str, target_language: str) -> dict[str, Any]:
    lc = (ui_language or "es").strip().lower().split("-")[0] or "es"
    target_name = _language_name_for_tutor(target_language)
    if lc == "en":
        return {
            "chat_response": (
                f"I'm your CoreSpeak Premium tutor. I can help with grammar, vocabulary, pronunciation tips, "
                f"and short examples in {target_name}. Ask me a specific doubt and I'll explain it clearly."
            ),
            "translation_hint": None,
            "next_micro_challenge": "Write one short sentence using the structure you want to practice.",
            "corrections": [],
            "new_vocabulary": [],
        }
    return {
        "chat_response": (
            f"Soy tu tutor Premium de CoreSpeak. Puedo ayudarte con gramática, vocabulario, pronunciación y ejemplos "
            f"breves en {target_name}. Escríbeme una duda concreta y te la explico paso a paso."
        ),
        "translation_hint": None,
        "next_micro_challenge": "Escribe una frase corta usando la estructura que quieres practicar.",
        "corrections": [],
        "new_vocabulary": [],
    }


def build_premium_tutor_reply(
    user_message: str,
    *,
    native_language: str = "es",
    ui_language: str = "es",
    target_language: str = "en",
    level_code: str = "B1",
    topic: str | None = None,
    history: list[dict[str, str]] | None = None,
) -> dict[str, Any]:
    cleaned_history: list[dict[str, str]] = []
    for item in history or []:
        role = str(item.get("role") or "").strip().lower()
        content = str(item.get("content") or "").strip()
        if role not in {"user", "assistant"} or not content:
            continue
        cleaned_history.append({"role": role, "content": content[:900]})
    cleaned_history = cleaned_history[-8:]

    ui_short = (ui_language or native_language or "es").strip().lower().split("-")[0] or "es"
    lvl = normalize_cefr_level(level_code)
    target_name = _language_name_for_tutor(target_language)
    history_block = "\n".join(
        f"{item['role'].upper()}: {item['content']}" for item in cleaned_history
    ) or "(empty)"

    system_prompt = (
        "You are CoreSpeak Premium Tutor, a concise and supportive language coach. "
        f"The learner is studying {target_name} at CEFR {lvl}. "
        f"Use language roughly aligned with locale '{ui_short}' for explanations when helpful, "
        f"but always include examples in {target_name}. "
        "Answer the exact doubt first, then give one practical example, and only then suggest a tiny next step if useful. "
        "Keep answers focused, short, and free of filler. Avoid markdown tables. "
        'Return ONLY valid JSON with keys "chat_response", "translation_hint", "next_micro_challenge", '
        '"corrections", and "new_vocabulary". '
        '"translation_hint" and "next_micro_challenge" may be null. '
        '"corrections" and "new_vocabulary" must be arrays of short strings.'
    )
    user_prompt = f"""
TARGET_LANGUAGE: {target_name}
LEVEL: {lvl}
TOPIC: {topic or "general doubts"}
NATIVE_LANGUAGE: {native_language or "es"}
UI_LANGUAGE: {ui_language or native_language or "es"}

RECENT_HISTORY:
{history_block}

LATEST_USER_MESSAGE:
{user_message.strip()}

Write a reply that helps the learner understand and continue practicing immediately.
"""
    fallback = _localized_tutor_fallback(ui_short, target_language)
    try:
        content = _groq_request(system_prompt, user_prompt, temperature=0.4)
        data = json.loads(content)
        chat_response = str(data.get("chat_response") or "").strip()
        if not chat_response:
            return fallback
        translation_hint_raw = data.get("translation_hint")
        next_micro_raw = data.get("next_micro_challenge")
        corrections_raw = data.get("corrections")
        vocab_raw = data.get("new_vocabulary")
        return {
            "chat_response": chat_response,
            "translation_hint": str(translation_hint_raw).strip() if translation_hint_raw else None,
            "next_micro_challenge": str(next_micro_raw).strip() if next_micro_raw else None,
            "corrections": [str(x).strip() for x in corrections_raw if str(x).strip()]
            if isinstance(corrections_raw, list)
            else [],
            "new_vocabulary": [str(x).strip() for x in vocab_raw if str(x).strip()]
            if isinstance(vocab_raw, list)
            else [],
        }
    except Exception:
        return fallback
