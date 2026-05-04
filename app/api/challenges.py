from __future__ import annotations

from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.cefr import normalize_cefr_level
from app.challenge_text import (
    coerce_reference_for_eval,
    hint_for_student,
    looks_like_ai_rubric,
    looks_like_stale_daily_task_prompt,
)
from app.constants import PRIMARY_COURSE_CODE, SCORE_DAILY_STRONG_SEMANTIC
from app.date_utils import calendar_day_from_db
from app.db import get_session
from app.dependencies import get_current_user
from app.models import AppUser, ChallengeStatus, DailyChallenge
from app.schemas import ChallengeResponse, ChallengeResultResponse, ChallengeSubmitRequest
from app.interest_catalog import coerce_interests_list, first_interest_context_for_challenge_row
from app.services.ai.groq_service import build_daily_challenge, semantic_validate_answer

router = APIRouter(prefix="/api/challenges", tags=["challenges"])

XP_MAX_DAILY = 100
SCORE_STREAK_OK = 0.60
SCORE_STREAK_RESET = 0.28
XP_PARTICIPATION_SHARE = 0.10

# Plantilla antigua (fallback fijo) — al detectarla, se regenera el reto del día.
_LEGACY_BOOKSTORE_FALLBACK_PREFIX = "You're sitting in a quiet corner of your favorite bookstore"


def _xp_from_semantic_score(max_xp: int, score: float) -> int:
    s = max(0.0, min(1.0, float(score)))
    if s < 0.02:
        return 0
    proportional = int(round(max_xp * s))
    floor = max(1, int(round(max_xp * XP_PARTICIPATION_SHARE)))
    return min(int(max_xp), max(floor, proportional))


@router.get("/daily", response_model=ChallengeResponse)
def get_daily_challenge(
    user: AppUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> ChallengeResponse:
    today = date.today()
    rows = session.exec(select(DailyChallenge).where(DailyChallenge.user_id == user.id)).all()
    challenge_today: DailyChallenge | None = None
    for ch in rows:
        if calendar_day_from_db(ch.challenge_date) == today:
            challenge_today = ch
            break

    # Fila vieja corrupta en BD → borrar y generar de nuevo
    if challenge_today is not None and looks_like_ai_rubric(challenge_today.expected_solution or ""):
        session.delete(challenge_today)
        session.commit()
        challenge_today = None

    if challenge_today is not None and (
        challenge_today.scenario or ""
    ).strip().startswith(_LEGACY_BOOKSTORE_FALLBACK_PREFIX):
        session.delete(challenge_today)
        session.commit()
        challenge_today = None

    # Consigna antigua / redundante guardada antes de mejorar texto (lista larga de temas EN, "plausible", etc.)
    if challenge_today is not None and looks_like_stale_daily_task_prompt(challenge_today.task_prompt or ""):
        session.delete(challenge_today)
        session.commit()
        challenge_today = None

    if challenge_today is not None:
        return ChallengeResponse(
            id=int(challenge_today.id or 0),
            scenario=challenge_today.scenario,
            task_prompt=challenge_today.task_prompt,
            expected_solution_hint=hint_for_student(challenge_today.expected_solution or ""),
        )

    prev = session.exec(
        select(DailyChallenge)
        .where(DailyChallenge.user_id == user.id)
        .order_by(DailyChallenge.challenge_date.desc())
        .limit(20)
    ).all()
    recent_scenarios = [(r.scenario or "").strip() for r in prev if (r.scenario or "").strip()]

    raw_levels = user.current_levels_json if isinstance(user.current_levels_json, dict) else {}
    level_code = raw_levels.get(PRIMARY_COURSE_CODE) or raw_levels.get("en")
    if not level_code and raw_levels:
        fv = next(iter(raw_levels.values()), None)
        level_code = str(fv).strip() if fv is not None else None
    level_code = normalize_cefr_level(str(level_code) if level_code else "A1")

    interest_ids = coerce_interests_list(user.interests_json)
    generated = build_daily_challenge(
        user_name=user.full_name,
        level_code=level_code,
        interests=interest_ids,
        target_language="English",
        native_language=user.native_language,
        recent_scenarios=recent_scenarios,
        variety_key=f"{int(user.id or 0)}:{today.isoformat()}",
    )
    expected_ref = coerce_reference_for_eval(generated["expected_solution"])

    challenge = DailyChallenge(
        user_id=int(user.id or 0),
        challenge_date=datetime.utcnow(),
        language_code="en",
        level_code=level_code,
        interest_context=first_interest_context_for_challenge_row(interest_ids),
        scenario=generated["scenario"],
        task_prompt=generated["task_prompt"],
        expected_solution=expected_ref,
        xp_awarded=XP_MAX_DAILY,
        status=ChallengeStatus.PENDING,
    )
    session.add(challenge)
    session.commit()
    session.refresh(challenge)
    return ChallengeResponse(
        id=int(challenge.id or 0),
        scenario=challenge.scenario,
        task_prompt=challenge.task_prompt,
        expected_solution_hint=hint_for_student(challenge.expected_solution or ""),
    )


@router.post("/{challenge_id}/submit", response_model=ChallengeResultResponse)
def submit_answer(
    challenge_id: int,
    payload: ChallengeSubmitRequest,
    user: AppUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> ChallengeResultResponse:
    challenge = session.exec(
        select(DailyChallenge).where(DailyChallenge.id == challenge_id, DailyChallenge.user_id == user.id)
    ).first()
    if not challenge:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reto no encontrado.")

    if challenge.status == ChallengeStatus.COMPLETED:
        return ChallengeResultResponse(
            is_correct_semantically=bool(
                challenge.semantic_score and challenge.semantic_score >= SCORE_DAILY_STRONG_SEMANTIC
            ),
            semantic_score=float(challenge.semantic_score or 0.0),
            corrective_feedback=str(challenge.corrective_feedback or ""),
            xp_awarded=0,
            streak_days=user.streak_days,
            streak_message=None,
            repeat_submission=True,
        )

    is_strong, score, feedback = semantic_validate_answer(
        user_answer=payload.answer.strip(),
        expected_solution=challenge.expected_solution or "",
        native_language=user.native_language or "es",
        task_prompt=challenge.task_prompt,
        scenario=challenge.scenario,
        level_code=challenge.level_code or normalize_cefr_level(None),
    )

    xp_earned = _xp_from_semantic_score(challenge.xp_awarded or XP_MAX_DAILY, score)
    challenge.user_answer = payload.answer.strip()
    challenge.semantic_score = score
    challenge.corrective_feedback = feedback
    challenge.status = ChallengeStatus.COMPLETED
    challenge.updated_at = datetime.utcnow()
    session.add(challenge)

    now = datetime.utcnow()
    today = now.date()
    streak_message: str | None = None
    if score >= SCORE_STREAK_OK:
        if user.last_active_at is None:
            user.streak_days = 1
        else:
            last_day = calendar_day_from_db(user.last_active_at)
            if last_day == today:
                user.streak_days = max(1, user.streak_days)
            elif last_day == (today - timedelta(days=1)):
                user.streak_days += 1
            else:
                user.streak_days = 1
        streak_message = f"Racha activa: {user.streak_days} día(s) consecutivos."
    elif score < SCORE_STREAK_RESET:
        user.streak_days = 0
        streak_message = "La racha se reinicia. ¡Mañana lo intentamos de nuevo!"
    elif xp_earned > 0:
        streak_message = (
            f"Has ganado {xp_earned} XP. Con una respuesta más completa puedes obtener hasta "
            f"{challenge.xp_awarded or XP_MAX_DAILY} XP y sumar día de racha."
        )

    user.xp_total += xp_earned
    user.last_active_at = now
    session.add(user)
    session.commit()
    session.refresh(user)

    feedback_text = feedback
    if streak_message:
        feedback_text = f"{feedback}\n\n{streak_message}" if feedback else streak_message

    return ChallengeResultResponse(
        is_correct_semantically=is_strong,
        semantic_score=score,
        corrective_feedback=feedback_text,
        xp_awarded=xp_earned,
        streak_days=user.streak_days,
        streak_message=streak_message,
        repeat_submission=False,
    )
