from __future__ import annotations

from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.db import get_session
from app.dependencies import get_current_user
from app.models import AppUser, ChallengeStatus, DailyChallenge
from app.schemas import ChallengeResponse, ChallengeResultResponse, ChallengeSubmitRequest
from app.services.ai.groq_service import build_daily_challenge, semantic_validate_answer

router = APIRouter(prefix="/api/challenges", tags=["challenges"])


@router.get("/daily", response_model=ChallengeResponse)
def get_daily_challenge(
    user: AppUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> ChallengeResponse:
    today = date.today()
    existing = session.exec(select(DailyChallenge).where(DailyChallenge.user_id == user.id)).all()
    for challenge in existing:
        if challenge.challenge_date.date() == today:
            return ChallengeResponse(
                id=challenge.id or 0,
                scenario=challenge.scenario,
                task_prompt=challenge.task_prompt,
                expected_solution_hint=challenge.expected_solution[:220],
            )

    target_languages = user.target_languages_json.get("languages", ["en"])
    level_code = user.current_levels_json.get(target_languages[0], "A1")
    generated = build_daily_challenge(
        user_name=user.full_name,
        level_code=level_code,
        interests=user.interests_json,
        target_language=target_languages[0],
        native_language=user.native_language,
    )
    challenge = DailyChallenge(
        user_id=user.id or 0,
        challenge_date=datetime.utcnow(),
        language_code=target_languages[0],
        level_code=level_code,
        interest_context=(user.interests_json[0] if user.interests_json else None),
        scenario=generated["scenario"],
        task_prompt=generated["task_prompt"],
        expected_solution=generated["expected_solution"],
    )
    session.add(challenge)
    session.commit()
    session.refresh(challenge)
    return ChallengeResponse(
        id=challenge.id or 0,
        scenario=challenge.scenario,
        task_prompt=challenge.task_prompt,
        expected_solution_hint=challenge.expected_solution[:220],
    )


@router.post("/{challenge_id}/submit", response_model=ChallengeResultResponse)
def submit_challenge_answer(
    challenge_id: int,
    payload: ChallengeSubmitRequest,
    user: AppUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> ChallengeResultResponse:
    challenge = session.exec(
        select(DailyChallenge).where(DailyChallenge.id == challenge_id, DailyChallenge.user_id == user.id)
    ).first()
    if not challenge:
        raise HTTPException(status_code=404, detail="Reto no encontrado")
    if challenge.status == ChallengeStatus.COMPLETED:
        return ChallengeResultResponse(
            is_correct_semantically=bool(challenge.semantic_score and challenge.semantic_score >= 0.6),
            semantic_score=challenge.semantic_score or 0,
            corrective_feedback=challenge.corrective_feedback or "",
            xp_awarded=0,
            streak_days=user.streak_days,
            streak_message=None,
        )

    is_ok, score, feedback = semantic_validate_answer(payload.answer, challenge.expected_solution)
    challenge.user_answer = payload.answer
    challenge.semantic_score = score
    challenge.corrective_feedback = feedback
    challenge.status = ChallengeStatus.COMPLETED
    challenge.updated_at = datetime.utcnow()
    session.add(challenge)

    # Gamificacion: XP + racha por dias consecutivos y ruptura por fallo.
    now = datetime.utcnow()
    user.xp_total += challenge.xp_awarded if is_ok else max(5, challenge.xp_awarded // 4)
    streak_message: str | None = None
    if is_ok:
        today = now.date()
        if user.last_active_at is None:
            user.streak_days = 1
        else:
            last_day = user.last_active_at.date()
            if last_day == today:
                # Ya conto hoy: mantiene racha.
                user.streak_days = max(1, user.streak_days)
            elif last_day == (today - timedelta(days=1)):
                user.streak_days += 1
            else:
                user.streak_days = 1
        streak_message = f"Racha activa: {user.streak_days} dia(s) consecutivo(s)."
    else:
        user.streak_days = 0
        streak_message = "Oh no... perdiste el ejercicio y la racha se reinicio. Manana la recuperamos."
    user.last_active_at = now
    session.add(user)
    session.commit()
    session.refresh(user)

    feedback_text = feedback
    if streak_message:
        feedback_text = f"{feedback}\n\n{streak_message}" if feedback else streak_message

    return ChallengeResultResponse(
        is_correct_semantically=is_ok,
        semantic_score=score,
        corrective_feedback=feedback_text,
        xp_awarded=(challenge.xp_awarded if is_ok else max(5, challenge.xp_awarded // 4)),
        streak_days=user.streak_days,
        streak_message=streak_message,
    )

