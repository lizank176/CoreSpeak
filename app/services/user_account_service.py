"""Eliminación de cuenta y cancelación de suscripción Stripe."""

from __future__ import annotations

import logging

import stripe
from sqlmodel import Session, select

from app.config import settings
from app.models import (
    AgendaWord,
    AppUser,
    BillingRecord,
    DailyChallenge,
    Enrollment,
    Lesson,
    LessonAttempt,
    LessonExerciseCompletion,
)

logger = logging.getLogger(__name__)


def cancel_stripe_subscription(user: AppUser, *, at_period_end: bool = True) -> None:
    if not user.subscription_id or not settings.stripe_secret_key:
        return
    stripe.api_key = settings.stripe_secret_key
    try:
        if at_period_end:
            stripe.Subscription.modify(user.subscription_id, cancel_at_period_end=True)
        else:
            stripe.Subscription.delete(user.subscription_id)
    except stripe.error.InvalidRequestError as exc:
        logger.warning("Stripe subscription cancel skipped for user %s: %s", user.id, exc)
    except Exception as exc:
        logger.warning("Stripe subscription cancel failed for user %s: %s", user.id, exc)


def delete_user_account(session: Session, user: AppUser) -> None:
    cancel_stripe_subscription(user, at_period_end=False)
    uid = int(user.id or 0)

    for lesson in session.exec(select(Lesson).where(Lesson.created_by_admin_id == uid)).all():
        lesson.created_by_admin_id = None
        session.add(lesson)

    for row in session.exec(select(Enrollment).where(Enrollment.user_id == uid)).all():
        session.delete(row)
    for row in session.exec(select(LessonAttempt).where(LessonAttempt.user_id == uid)).all():
        session.delete(row)
    for row in session.exec(
        select(LessonExerciseCompletion).where(LessonExerciseCompletion.user_id == uid)
    ).all():
        session.delete(row)
    for row in session.exec(select(DailyChallenge).where(DailyChallenge.user_id == uid)).all():
        session.delete(row)
    for row in session.exec(select(BillingRecord).where(BillingRecord.user_id == uid)).all():
        session.delete(row)
    for row in session.exec(select(AgendaWord).where(AgendaWord.user_id == uid)).all():
        session.delete(row)

    session.delete(user)
    session.commit()
