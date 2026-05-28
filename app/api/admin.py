from __future__ import annotations

from datetime import datetime
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select

from app.config import settings
from app.db import get_session
from app.dependencies import require_admin
from app.models import (
    AgendaWord,
    AppUser,
    BillingRecord,
    CourseLevel,
    DailyChallenge,
    Enrollment,
    LanguageCourse,
    Lesson,
    LessonAttempt,
    LessonExercise,
    UserRole,
)
from app.security import create_password_reset_token
from app.schemas import CreateLessonRequest

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/dashboard")
def dashboard_stats(
    _: AppUser = Depends(require_admin),
    session: Session = Depends(get_session),
) -> dict:
    users = session.exec(select(AppUser)).all()
    lessons = session.exec(select(Lesson)).all()
    courses = session.exec(
        select(LanguageCourse).where(LanguageCourse.is_active == True, LanguageCourse.language_code != "de")  # noqa: E712
    ).all()
    return {
        "users_total": sum(1 for u in users if u.is_active),
        "users_premium": sum(1 for u in users if u.is_premium),
        "lessons_total": len(lessons),
        "courses_total": len(courses),
        "top_languages": [c.language_name for c in courses[:5]],
    }


@router.get("/course-tree")
def course_tree(
    _: AppUser = Depends(require_admin),
    session: Session = Depends(get_session),
) -> list[dict]:
    courses = session.exec(
        select(LanguageCourse).where(LanguageCourse.is_active == True, LanguageCourse.language_code != "de")  # noqa: E712
    ).all()
    levels = session.exec(select(CourseLevel)).all()
    lessons = session.exec(select(Lesson)).all()

    result: list[dict] = []
    for course in courses:
        level_nodes = []
        for lvl in [l for l in levels if l.course_id == course.id]:
            lesson_nodes = [
                {"id": lesson.id, "title": lesson.title, "premium": lesson.is_premium, "published": lesson.is_published}
                for lesson in lessons
                if lesson.level_id == lvl.id
            ]
            level_nodes.append({"id": lvl.id, "code": lvl.level_code, "title": lvl.title, "lessons": lesson_nodes})
        result.append({"id": course.id, "code": course.language_code, "name": course.language_name, "levels": level_nodes})
    return result


@router.get("/users")
def list_users(
    q: str = Query(default="", max_length=120),
    _: AppUser = Depends(require_admin),
    session: Session = Depends(get_session),
) -> dict:
    users = session.exec(select(AppUser)).all()
    term = q.strip().lower()
    if term:
        users = [
            user for user in users
            if term in (user.email or "").lower() or term in (user.full_name or "").lower()
        ]
    users.sort(key=lambda user: ((user.created_at or datetime.min), user.id or 0), reverse=True)
    return {
        "items": [_serialize_user(user) for user in users],
        "total": len(users),
        "query": term,
    }


@router.post("/users/{user_id}/password-reset-link")
def generate_user_password_reset_link(
    user_id: int,
    admin: AppUser = Depends(require_admin),
    session: Session = Depends(get_session),
) -> dict:
    user = _get_user_or_404(user_id, session)
    token = create_password_reset_token(user.email)
    base = settings.app_base_url.rstrip("/")
    reset_url = f"{base}/ui/restablecer_contrasena.html?token={quote(token, safe='')}"
    return {
        "user_id": user.id,
        "email": user.email,
        "reset_url": reset_url,
        "message": f"Enlace de restablecimiento generado para {user.email}.",
        "generated_by_admin_id": admin.id,
    }


@router.patch("/users/{user_id}/status")
def update_user_status(
    user_id: int,
    active: bool,
    admin: AppUser = Depends(require_admin),
    session: Session = Depends(get_session),
) -> dict:
    user = _get_user_or_404(user_id, session)
    _ensure_admin_user_can_be_modified(admin, user, session, becoming_inactive=not active)
    user.is_active = active
    user.updated_at = datetime.utcnow()
    session.add(user)
    session.commit()
    session.refresh(user)
    return {
        "user_id": user.id,
        "is_active": user.is_active,
        "message": "Cuenta activada." if active else "Cuenta desactivada.",
    }


@router.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    admin: AppUser = Depends(require_admin),
    session: Session = Depends(get_session),
) -> dict:
    user = _get_user_or_404(user_id, session)
    _ensure_admin_user_can_be_modified(admin, user, session, becoming_inactive=True)

    for lesson in session.exec(select(Lesson).where(Lesson.created_by_admin_id == user.id)).all():
        lesson.created_by_admin_id = None
        session.add(lesson)
    for row in session.exec(select(Enrollment).where(Enrollment.user_id == user.id)).all():
        session.delete(row)
    for row in session.exec(select(LessonAttempt).where(LessonAttempt.user_id == user.id)).all():
        session.delete(row)
    for row in session.exec(select(DailyChallenge).where(DailyChallenge.user_id == user.id)).all():
        session.delete(row)
    for row in session.exec(select(BillingRecord).where(BillingRecord.user_id == user.id)).all():
        session.delete(row)
    for row in session.exec(select(AgendaWord).where(AgendaWord.user_id == user.id)).all():
        session.delete(row)
    session.delete(user)
    session.commit()
    return {"user_id": user_id, "message": "Usuario eliminado."}


@router.post("/lessons")
def create_lesson(
    payload: CreateLessonRequest,
    admin: AppUser = Depends(require_admin),
    session: Session = Depends(get_session),
) -> dict:
    _validate_lesson_payload(payload, session)
    lesson = Lesson(
        course_id=payload.course_id,
        level_id=payload.level_id,
        title=payload.title,
        description=payload.description,
        is_premium=payload.is_premium,
        is_published=payload.is_published,
        video_url=payload.video_url,
        image_url=payload.image_url,
        audio_url=payload.audio_url,
        content_json={
            "title": payload.title,
            "description": payload.description,
            "media": {
                "video_url": payload.video_url,
                "image_url": payload.image_url,
                "audio_url": payload.audio_url,
            },
            "exercises": [item.model_dump() for item in payload.exercises],
        },
        created_by_admin_id=admin.id,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    session.add(lesson)
    session.commit()
    session.refresh(lesson)
    _replace_lesson_exercises(session, lesson.id, payload)
    return {
        "lesson_id": lesson.id,
        "message": "Leccion guardada",
        "json_payload_saved": lesson.content_json,
    }


@router.get("/lessons/{lesson_id}")
def admin_lesson_detail(
    lesson_id: int,
    _: AppUser = Depends(require_admin),
    session: Session = Depends(get_session),
) -> dict:
    lesson = session.get(Lesson, lesson_id)
    if not lesson:
        raise HTTPException(status_code=404, detail="Lección no encontrada")
    exercises = session.exec(
        select(LessonExercise).where(LessonExercise.lesson_id == lesson_id).order_by(LessonExercise.position)
    ).all()
    return {
        "id": lesson.id,
        "course_id": lesson.course_id,
        "level_id": lesson.level_id,
        "title": lesson.title,
        "description": lesson.description,
        "is_premium": lesson.is_premium,
        "is_published": lesson.is_published,
        "video_url": lesson.video_url,
        "image_url": lesson.image_url,
        "audio_url": lesson.audio_url,
        "exercises": [_serialize_lesson_exercise(item) for item in exercises],
    }


@router.patch("/lessons/{lesson_id}")
def update_lesson(
    lesson_id: int,
    payload: CreateLessonRequest,
    _: AppUser = Depends(require_admin),
    session: Session = Depends(get_session),
) -> dict:
    lesson = session.get(Lesson, lesson_id)
    if not lesson:
        raise HTTPException(status_code=404, detail="Lección no encontrada")
    _validate_lesson_payload(payload, session)
    lesson.course_id = payload.course_id
    lesson.level_id = payload.level_id
    lesson.title = payload.title
    lesson.description = payload.description
    lesson.is_premium = payload.is_premium
    lesson.is_published = payload.is_published
    lesson.video_url = payload.video_url
    lesson.image_url = payload.image_url
    lesson.audio_url = payload.audio_url
    lesson.content_json = {
        "title": payload.title,
        "description": payload.description,
        "media": {
            "video_url": payload.video_url,
            "image_url": payload.image_url,
            "audio_url": payload.audio_url,
        },
        "exercises": [item.model_dump() for item in payload.exercises],
    }
    lesson.updated_at = datetime.utcnow()
    session.add(lesson)
    session.commit()
    session.refresh(lesson)
    _replace_lesson_exercises(session, lesson.id, payload)
    return {
        "lesson_id": lesson.id,
        "message": "Lección actualizada",
        "json_payload_saved": lesson.content_json,
    }


@router.delete("/lessons/{lesson_id}")
def delete_lesson(
    lesson_id: int,
    _: AppUser = Depends(require_admin),
    session: Session = Depends(get_session),
) -> dict:
    lesson = session.get(Lesson, lesson_id)
    if not lesson:
        raise HTTPException(status_code=404, detail="Lección no encontrada")

    for exercise in session.exec(select(LessonExercise).where(LessonExercise.lesson_id == lesson_id)).all():
        session.delete(exercise)
    for attempt in session.exec(select(LessonAttempt).where(LessonAttempt.lesson_id == lesson_id)).all():
        session.delete(attempt)
    session.delete(lesson)
    session.commit()
    return {"lesson_id": lesson_id, "message": "Lección eliminada"}


def _get_user_or_404(user_id: int, session: Session) -> AppUser:
    user = session.get(AppUser, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return user


def _ensure_admin_user_can_be_modified(
    acting_admin: AppUser,
    target_user: AppUser,
    session: Session,
    *,
    becoming_inactive: bool,
) -> None:
    if acting_admin.id == target_user.id:
        raise HTTPException(status_code=400, detail="No puedes modificar tu propia cuenta desde esta pantalla")
    if target_user.role == UserRole.ADMIN and target_user.is_active and becoming_inactive:
        active_admins = session.exec(
            select(AppUser).where(AppUser.role == UserRole.ADMIN, AppUser.is_active == True)  # noqa: E712
        ).all()
        if len(active_admins) <= 1:
            raise HTTPException(status_code=400, detail="Debe existir al menos un administrador activo")


def _serialize_user(user: AppUser) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "role": user.role.value if isinstance(user.role, UserRole) else str(user.role),
        "is_active": bool(user.is_active),
        "is_premium": bool(user.is_premium),
        "subscription_status": user.subscription_status or "inactive",
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "updated_at": user.updated_at.isoformat() if user.updated_at else None,
        "last_active_at": user.last_active_at.isoformat() if user.last_active_at else None,
    }


def _validate_lesson_payload(payload: CreateLessonRequest, session: Session) -> None:
    level = session.exec(select(CourseLevel).where(CourseLevel.id == payload.level_id)).first()
    if not level:
        raise HTTPException(status_code=404, detail="Nivel no encontrado")

    for exercise in payload.exercises:
        if exercise.exercise_type.value in {"multiple_choice", "fill_in_the_blank"} and not exercise.correct_answer:
            raise HTTPException(status_code=400, detail="Ejercicio requiere opcion/respuesta correcta")
        if exercise.exercise_type.value == "media_comprehension" and not exercise.model_answer:
            raise HTTPException(status_code=400, detail="Comprension requiere respuesta modelo")


def _replace_lesson_exercises(session: Session, lesson_id: int, payload: CreateLessonRequest) -> None:
    for existing in session.exec(select(LessonExercise).where(LessonExercise.lesson_id == lesson_id)).all():
        session.delete(existing)
    session.commit()
    for idx, item in enumerate(payload.exercises, start=1):
        session.add(
            LessonExercise(
                lesson_id=lesson_id,
                exercise_type=item.exercise_type,
                prompt=item.prompt,
                options_json=item.options_json,
                correct_answer=item.correct_answer,
                model_answer=item.model_answer,
                position=idx,
                points=item.points,
            )
        )
    session.commit()

def _serialize_lesson_exercise(item: LessonExercise) -> dict:
    return {
        "exercise_type": item.exercise_type.value,
        "prompt": item.prompt,
        "options_json": item.options_json,
        "correct_answer": item.correct_answer,
        "model_answer": item.model_answer,
        "points": item.points,
    }

