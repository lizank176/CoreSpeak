from __future__ import annotations

from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.cefr import next_cefr_level, normalize_cefr_level
from app.challenge_text import (
    coerce_reference_for_eval,
    hint_for_student,
    looks_like_ai_rubric,
    looks_like_stale_daily_task_prompt,
)
from app.constants import PRIMARY_COURSE_CODE, SCORE_DAILY_STRONG_SEMANTIC
from app.date_utils import calendar_day_from_db
from app.db import get_session
from app.dependencies import get_current_user, require_premium_or_grace
from app.models import AppUser, ChallengeStatus, DailyChallenge
from app.schemas import (
    ChallengeDetailResponse,
    ChallengeHistoryItem,
    ChallengeHistoryResponse,
    ChallengeResponse,
    ChallengeResultResponse,
    ChallengeSubmitRequest,
)
from app.interest_catalog import coerce_interests_list, first_interest_context_for_challenge_row
from app.services.ai.groq_service import build_daily_challenge, semantic_validate_answer
from app.services.progress_service import award_xp, update_daily_streak

router = APIRouter(prefix="/api/challenges", tags=["challenges"])

XP_MAX_DAILY = 100
SCORE_STREAK_OK = 0.60
XP_PARTICIPATION_SHARE = 0.10
CEFR_LEVEL_UP_EVERY_COMPLETED = 2

# Plantilla antigua (fallback fijo) — al detectarla, se regenera el reto del día.
_LEGACY_BOOKSTORE_FALLBACK_PREFIX = "You're sitting in a quiet corner of your favorite bookstore"


def _resolve_user_level(user: AppUser) -> str:
    raw_levels = user.current_levels_json if isinstance(user.current_levels_json, dict) else {}
    level_code = raw_levels.get(PRIMARY_COURSE_CODE) or raw_levels.get("en")
    if not level_code and raw_levels:
        fv = next(iter(raw_levels.values()), None)
        level_code = str(fv).strip() if fv is not None else None
    return normalize_cefr_level(str(level_code) if level_code else "A1")


def _build_and_store_challenge(session: Session, user: AppUser, *, variety_key: str) -> ChallengeResponse:
    prev = session.exec(
        select(DailyChallenge)
        .where(DailyChallenge.user_id == user.id)
        .order_by(DailyChallenge.challenge_date.desc())
        .limit(20)
    ).all()
    recent_scenarios = [(r.scenario or "").strip() for r in prev if (r.scenario or "").strip()]

    level_code = _resolve_user_level(user)
    interest_ids = coerce_interests_list(user.interests_json)
    generated = build_daily_challenge(
        user_name=user.full_name,
        level_code=level_code,
        interests=interest_ids,
        target_language="English",
        native_language=user.native_language,
        recent_scenarios=recent_scenarios,
        variety_key=variety_key,
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


def _completed_challenges_at_level(session: Session, user_id: int, level_code: str) -> int:
    return len(
        session.exec(
            select(DailyChallenge).where(
                DailyChallenge.user_id == user_id,
                DailyChallenge.status == ChallengeStatus.COMPLETED,
                DailyChallenge.level_code == normalize_cefr_level(level_code),
            )
        ).all()
    )


def _maybe_promote_user_level(session: Session, user: AppUser, level_code: str) -> str | None:
    current_level = _resolve_user_level(user)
    current_level = normalize_cefr_level(current_level)
    level_code = normalize_cefr_level(level_code)
    if level_code != current_level:
        return None
    next_level = next_cefr_level(current_level)
    if next_level == current_level:
        return None
    completed_at_level = _completed_challenges_at_level(session, int(user.id or 0), current_level)
    if completed_at_level < CEFR_LEVEL_UP_EVERY_COMPLETED:
        return None
    levels = dict(user.current_levels_json or {})
    levels[PRIMARY_COURSE_CODE] = next_level
    user.current_levels_json = levels
    user.updated_at = datetime.utcnow()
    session.add(user)
    return next_level


def _xp_from_semantic_score(max_xp: int, score: float) -> int:
    s = max(0.0, min(1.0, float(score)))
    if s < 0.02:
        return 0
    proportional = int(round(max_xp * s))
    floor = max(1, int(round(max_xp * XP_PARTICIPATION_SHARE)))
    return min(int(max_xp), max(floor, proportional))


def _challenge_title(ch: DailyChallenge) -> str:
    scenario = (ch.scenario or "").strip().replace("\n", " ")
    if scenario:
        return scenario[:72] + ("…" if len(scenario) > 72 else "")
    task = (ch.task_prompt or "").strip().replace("\n", " ")
    if task:
        return task[:72] + ("…" if len(task) > 72 else "")
    return f"Reto {normalize_cefr_level(ch.level_code or 'A1')}"


def _get_owned_challenge(session: Session, user_id: int, challenge_id: int) -> DailyChallenge:
    challenge = session.exec(
        select(DailyChallenge).where(DailyChallenge.id == challenge_id, DailyChallenge.user_id == user_id)
    ).first()
    if not challenge:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reto no encontrado.")
    return challenge


def _challenge_is_today(ch: DailyChallenge) -> bool:
    return calendar_day_from_db(ch.challenge_date) == date.today()


def _can_edit_challenge(user: AppUser, ch: DailyChallenge) -> bool:
    if not user.is_premium:
        return False
    if ch.status == ChallengeStatus.COMPLETED:
        return True
    return _challenge_is_today(ch)


def _challenge_detail_response(user: AppUser, ch: DailyChallenge) -> ChallengeDetailResponse:
    is_today = _challenge_is_today(ch)
    is_completed = ch.status == ChallengeStatus.COMPLETED
    is_premium = bool(user.is_premium)

    if is_completed:
        can_edit = is_premium
        read_only = not is_premium
    elif is_today:
        can_edit = True
        read_only = False
    else:
        can_edit = False
        read_only = True

    return ChallengeDetailResponse(
        id=int(ch.id or 0),
        scenario=ch.scenario,
        task_prompt=ch.task_prompt,
        expected_solution_hint=hint_for_student(ch.expected_solution or ""),
        user_answer=ch.user_answer,
        corrective_feedback=ch.corrective_feedback,
        semantic_score=float(ch.semantic_score) if ch.semantic_score is not None else None,
        status=str(ch.status.value if hasattr(ch.status, "value") else ch.status),
        level_code=normalize_cefr_level(ch.level_code or "A1"),
        challenge_date=ch.challenge_date,
        is_today=is_today,
        read_only=read_only,
        can_edit=can_edit,
    )


def _grade_and_store_challenge(
    session: Session,
    user: AppUser,
    challenge: DailyChallenge,
    answer: str,
    *,
    award_progress: bool,
) -> ChallengeResultResponse:
    is_strong, score, feedback = semantic_validate_answer(
        user_answer=answer.strip(),
        expected_solution=challenge.expected_solution or "",
        native_language=user.native_language or "es",
        task_prompt=challenge.task_prompt,
        scenario=challenge.scenario,
        level_code=challenge.level_code or normalize_cefr_level(None),
    )

    xp_earned = 0
    streak_message: str | None = None
    level_up_message: str | None = None

    if award_progress:
        xp_earned = _xp_from_semantic_score(challenge.xp_awarded or XP_MAX_DAILY, score)
        streak_message = update_daily_streak(user)
        award_xp(user, xp_earned)
        if score < SCORE_STREAK_OK and xp_earned > 0:
            streak_message = (
                f"{streak_message} Has ganado {xp_earned} XP. "
                f"Con una respuesta más completa puedes obtener hasta "
                f"{challenge.xp_awarded or XP_MAX_DAILY} XP."
            )
        promoted_to = _maybe_promote_user_level(
            session, user, challenge.level_code or normalize_cefr_level(None)
        )
        if promoted_to:
            level_up_message = f"Has subido al nivel {promoted_to}. El siguiente reto será más avanzado."

    challenge.user_answer = answer.strip()
    challenge.semantic_score = score
    challenge.corrective_feedback = feedback
    challenge.status = ChallengeStatus.COMPLETED
    challenge.updated_at = datetime.utcnow()
    session.add(challenge)
    session.add(user)
    session.commit()
    session.refresh(user)

    feedback_text = feedback
    if streak_message:
        feedback_text = f"{feedback}\n\n{streak_message}" if feedback else streak_message
    if level_up_message:
        feedback_text = f"{feedback_text}\n\n{level_up_message}" if feedback_text else level_up_message

    return ChallengeResultResponse(
        is_correct_semantically=is_strong,
        semantic_score=score,
        corrective_feedback=feedback_text,
        xp_awarded=xp_earned,
        streak_days=user.streak_days,
        streak_message=streak_message,
        repeat_submission=not award_progress,
    )


@router.get("/daily", response_model=ChallengeResponse)
def get_daily_challenge(
    user: AppUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> ChallengeResponse:
    today = date.today()
    rows = session.exec(
        select(DailyChallenge)
        .where(DailyChallenge.user_id == user.id)
        .order_by(DailyChallenge.challenge_date.desc())
    ).all()
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
    return _build_and_store_challenge(
        session,
        user,
        variety_key=f"{int(user.id or 0)}:{today.isoformat()}",
    )


@router.get("/history", response_model=ChallengeHistoryResponse)
def list_challenge_history(
    user: AppUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> ChallengeHistoryResponse:
    today = date.today()
    rows = session.exec(
        select(DailyChallenge)
        .where(DailyChallenge.user_id == user.id)
        .order_by(DailyChallenge.challenge_date.desc())
        .limit(60)
    ).all()
    items: list[ChallengeHistoryItem] = []
    for ch in rows:
        is_today = calendar_day_from_db(ch.challenge_date) == today
        if ch.status != ChallengeStatus.COMPLETED and not is_today:
            continue
        items.append(
            ChallengeHistoryItem(
                id=int(ch.id or 0),
                title=_challenge_title(ch),
                challenge_date=ch.challenge_date,
                level_code=normalize_cefr_level(ch.level_code or "A1"),
                status=str(ch.status.value if hasattr(ch.status, "value") else ch.status),
                is_today=is_today,
                user_answer=ch.user_answer,
                semantic_score=float(ch.semantic_score) if ch.semantic_score is not None else None,
                can_edit=_can_edit_challenge(user, ch) if ch.status == ChallengeStatus.COMPLETED else is_today,
            )
        )
    return ChallengeHistoryResponse(items=items, is_premium=bool(user.is_premium))


@router.post("/premium/generate", response_model=ChallengeResponse)
def generate_premium_challenge(
    user: AppUser = Depends(require_premium_or_grace),
    session: Session = Depends(get_session),
) -> ChallengeResponse:
    return _build_and_store_challenge(
        session,
        user,
        variety_key=f"{int(user.id or 0)}:{datetime.utcnow().isoformat(timespec='microseconds')}:premium",
    )


@router.get("/{challenge_id}/detail", response_model=ChallengeDetailResponse)
def get_challenge_detail(
    challenge_id: int,
    user: AppUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> ChallengeDetailResponse:
    challenge = _get_owned_challenge(session, int(user.id or 0), challenge_id)
    return _challenge_detail_response(user, challenge)


@router.post("/{challenge_id}/submit", response_model=ChallengeResultResponse)
def submit_answer(
    challenge_id: int,
    payload: ChallengeSubmitRequest,
    user: AppUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> ChallengeResultResponse:
    challenge = _get_owned_challenge(session, int(user.id or 0), challenge_id)

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

    return _grade_and_store_challenge(
        session,
        user,
        challenge,
        payload.answer.strip(),
        award_progress=True,
    )


@router.post("/{challenge_id}/resubmit", response_model=ChallengeResultResponse)
def resubmit_answer(
    challenge_id: int,
    payload: ChallengeSubmitRequest,
    user: AppUser = Depends(require_premium_or_grace),
    session: Session = Depends(get_session),
) -> ChallengeResultResponse:
    challenge = _get_owned_challenge(session, int(user.id or 0), challenge_id)
    if challenge.status != ChallengeStatus.COMPLETED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Solo puedes editar retos que ya completaste.",
        )
    result = _grade_and_store_challenge(
        session,
        user,
        challenge,
        payload.answer.strip(),
        award_progress=False,
    )
    prefix = "Respuesta actualizada (Premium).\n\n"
    result.corrective_feedback = prefix + (result.corrective_feedback or "")
    result.repeat_submission = False
    return result
