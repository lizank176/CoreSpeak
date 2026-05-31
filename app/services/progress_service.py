"""XP y racha compartidos entre retos diarios y ejercicios de lección."""

from __future__ import annotations

from datetime import datetime, timedelta

from app.date_utils import calendar_day_from_db
from app.models import AppUser

SCORE_STREAK_OK = 0.60


def update_daily_streak(user: AppUser) -> str:
    """
    Marca actividad de aprendizaje hoy y actualiza la racha.
    Independiente del XP ganado (hacer un ejercicio basta).
    """
    now = datetime.utcnow()
    today = now.date()
    if user.last_active_at is None:
        user.streak_days = 1
    else:
        last_day = calendar_day_from_db(user.last_active_at)
        if last_day == today:
            user.streak_days = max(1, int(user.streak_days or 0))
        elif last_day == today - timedelta(days=1):
            user.streak_days = int(user.streak_days or 0) + 1
        else:
            user.streak_days = 1
    user.last_active_at = now
    user.updated_at = now
    return f"Racha activa: {user.streak_days} día(s) consecutivos."


def award_xp(user: AppUser, amount: int) -> int:
    xp = max(0, int(amount))
    if xp <= 0:
        return 0
    user.xp_total = int(user.xp_total or 0) + xp
    user.updated_at = datetime.utcnow()
    return xp


def apply_xp_and_streak(
    user: AppUser,
    *,
    xp_amount: int,
    activity_score: float,
    count_streak: bool = True,
) -> tuple[int, str | None]:
    """
    XP según puntuación; racha al registrar actividad (independiente del XP).
    """
    score = max(0.0, min(1.0, float(activity_score)))
    xp_earned = award_xp(user, int(xp_amount)) if score >= SCORE_STREAK_OK else 0
    streak_message: str | None = update_daily_streak(user) if count_streak else None
    return xp_earned, streak_message
