from __future__ import annotations

from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select

from app.db import get_session
from app.dependencies import get_current_user, require_premium_or_grace
from app.models import AppUser, CourseLevel, Enrollment, LanguageCourse, Lesson, LessonAttempt, UserRole

router = APIRouter(prefix="/api/courses", tags=["courses"])
catalog_router = APIRouter(prefix="/api/catalog", tags=["catalog"])
users_router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("/lessons")
def list_lessons(user: AppUser = Depends(get_current_user), session: Session = Depends(get_session)) -> list[dict]:
    lessons = session.exec(select(Lesson).where(Lesson.is_published == True)).all()  # noqa: E712
    if user.is_premium:
        return [_to_lesson_dict(l) for l in lessons]
    return [_to_lesson_dict(l) for l in lessons if not l.is_premium]


@router.get("/lessons/{lesson_id}")
def lesson_detail(lesson_id: int, user: AppUser = Depends(get_current_user), session: Session = Depends(get_session)) -> dict:
    lesson = session.get(Lesson, lesson_id)
    if not lesson:
        raise HTTPException(status_code=404, detail="Leccion no encontrada")
    if lesson.is_premium and not user.is_premium:
        raise HTTPException(status_code=402, detail="Leccion avanzada disponible para Premium")
    if not user.is_premium:
        # Basic: max 2 lessons/day.
        today = date.today()
        attempts = session.exec(select(LessonAttempt).where(LessonAttempt.user_id == user.id)).all()
        today_count = sum(1 for a in attempts if a.completed_at.date() == today)
        if today_count >= 2:
            raise HTTPException(status_code=402, detail="Plan basic limitado a 2 lecciones al dia")

        # Basic: one active target language.
        enrollments = session.exec(select(Enrollment).where(Enrollment.user_id == user.id, Enrollment.is_active == True)).all()  # noqa: E712
        if len({e.course_id for e in enrollments}) > 1:
            raise HTTPException(status_code=402, detail="Plan basic permite un solo idioma activo")

    return _to_lesson_dict(lesson)


@router.get("/premium-feedback")
def premium_feedback_example(_: AppUser = Depends(require_premium_or_grace)) -> dict:
    return {
        "feedback_level": "detailed",
        "message": "Este endpoint representa feedback profundo habilitado para premium o periodo de gracia.",
    }


def _to_lesson_dict(lesson: Lesson) -> dict:
    return {
        "id": lesson.id,
        "title": lesson.title,
        "description": lesson.description,
        "premium": lesson.is_premium,
        "media": {"video_url": lesson.video_url, "image_url": lesson.image_url, "audio_url": lesson.audio_url},
        "content": lesson.content_json,
    }


@users_router.get("/me/profile")
def me_profile(user: AppUser = Depends(get_current_user)) -> dict[str, Any]:
    return {
        "id": user.id,
        "nombre": user.full_name,
        "email": user.email,
        "idioma_ui": user.ui_language,
        "idioma_nativo": user.native_language,
        "idiomas_objetivo": user.target_languages_json.get("languages", []),
        "intereses": user.interests_json,
        "ocupacion": user.occupation,
        "is_premium": user.is_premium,
        "is_admin": user.role == UserRole.ADMIN,
    }


@users_router.get("/{user_id}/progress")
def user_progress(
    user_id: int,
    user: AppUser = Depends(get_current_user),
) -> dict[str, Any]:
    if user.id != user_id and user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Sin permiso para ver este progreso")
    return {
        "user_id": user.id,
        "nombre": user.full_name,
        "racha_actual": user.streak_days,
        "total_xp": user.xp_total,
    }


def _lesson_accessible_for_user(lesson: Lesson, user: AppUser) -> bool:
    return user.is_premium or not lesson.is_premium


@catalog_router.get("/courses")
def catalog_courses(
    lang: str | None = Query(default=None),
    user: AppUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[dict[str, Any]]:
    chosen_codes = {
        str(code).strip().lower()
        for code in user.target_languages_json.get("languages", [])
        if str(code).strip()
    }
    courses_query = select(LanguageCourse).where(LanguageCourse.is_active == True)  # noqa: E712
    if lang:
        courses_query = courses_query.where(LanguageCourse.language_code == lang.lower().strip())
    courses = session.exec(courses_query).all()
    output: list[dict[str, Any]] = []
    for course in courses:
        if not course.id:
            continue
        lessons = session.exec(select(Lesson).where(Lesson.course_id == course.id, Lesson.is_published == True)).all()  # noqa: E712
        level = session.exec(
            select(CourseLevel)
            .where(CourseLevel.course_id == course.id)
            .order_by(CourseLevel.position.asc())
        ).first()
        has_premium = any(lesson.is_premium for lesson in lessons)
        output.append(
            {
                "id": course.id,
                "lang_code": course.language_code,
                "title": course.language_name,
                "cefr_level": level.level_code if level else "A1",
                "lesson_count": len(lessons),
                "is_premium": has_premium,
                "accessible": user.is_premium or course.language_code.lower() in chosen_codes,
            }
        )
    return output


@catalog_router.get("/courses/{course_id}/lessons")
def catalog_course_lessons(
    course_id: int,
    user: AppUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[dict[str, Any]]:
    course = session.get(LanguageCourse, course_id)
    if not course or not course.is_active:
        raise HTTPException(status_code=404, detail="Curso no encontrado")
    chosen_codes = {
        str(code).strip().lower()
        for code in user.target_languages_json.get("languages", [])
        if str(code).strip()
    }
    if not user.is_premium and course.language_code.lower() not in chosen_codes:
        raise HTTPException(status_code=402, detail="Curso disponible para usuarios Premium")

    lessons = session.exec(
        select(Lesson)
        .where(Lesson.course_id == course_id, Lesson.is_published == True)  # noqa: E712
        .order_by(Lesson.id.asc())
    ).all()
    rows: list[dict[str, Any]] = []
    for lesson in lessons:
        rows.append(
            {
                "id": lesson.id,
                "title": lesson.title,
                "description": lesson.description,
                "accessible": _lesson_accessible_for_user(lesson, user),
                "is_premium": lesson.is_premium,
            }
        )
    return rows


@catalog_router.get("/lessons/{lesson_id}")
def catalog_lesson_detail(
    lesson_id: int,
    user: AppUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    lesson = session.get(Lesson, lesson_id)
    if not lesson:
        raise HTTPException(status_code=404, detail="Leccion no encontrada")
    course = session.get(LanguageCourse, lesson.course_id)
    chosen_codes = {
        str(code).strip().lower()
        for code in user.target_languages_json.get("languages", [])
        if str(code).strip()
    }
    if course and not user.is_premium and course.language_code.lower() not in chosen_codes:
        raise HTTPException(status_code=402, detail="Curso disponible para usuarios Premium")
    accessible = _lesson_accessible_for_user(lesson, user)
    return {
        "id": lesson.id,
        "title": lesson.title,
        "description": lesson.description,
        "accessible": accessible,
        "cover_image_path": lesson.image_url,
        "media_gallery": [],
        "video_url": lesson.video_url,
        "audio_url": lesson.audio_url,
        "content": lesson.content_json,
        "exercises": lesson.content_json.get("exercises", []),
    }

