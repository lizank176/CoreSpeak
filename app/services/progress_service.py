"""XP y racha compartidos entre retos diarios y ejercicios de lección."""

from __future__ import annotations

from datetime import datetime, timedelta

from app.date_utils import calendar_day_from_db
from app.models import AppUser

SCORE_STREAK_OK = 0.60


def apply_xp_and_streak(
    user: AppUser,
    *,
    xp_amount: int,
    activity_score: float,
    count_streak: bool = True,
) -> tuple[int, str | None]:
    """
    Suma XP si activity_score >= SCORE_STREAK_OK.
    Actualiza racha solo cuando count_streak es True y la actividad es suficientemente buena.
    Devuelve (xp_otorgado, mensaje_racha).
    """
    now = datetime.utcnow()
    today = now.date()
    streak_message: str | None = None
    score = max(0.0, min(1.0, float(activity_score)))
    xp_earned = int(xp_amount) if score >= SCORE_STREAK_OK else 0

    if count_streak and score >= SCORE_STREAK_OK:
        if user.last_active_at is None:
            user.streak_days = 1
        else:
            last_day = calendar_day_from_db(user.last_active_at)
            if last_day == today:
                user.streak_days = max(1, user.streak_days)
            elif last_day == today - timedelta(days=1):
                user.streak_days += 1
            else:
                user.streak_days = 1
        streak_message = f"Racha activa: {user.streak_days} día(s) consecutivos."
        user.last_active_at = now
    elif score >= SCORE_STREAK_OK:
        user.last_active_at = now

    if xp_earned > 0:
        user.xp_total = int(user.xp_total or 0) + xp_earned
    user.updated_at = now
    return xp_earned, streak_message
