from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.db import get_session
from app.dependencies import require_admin
from app.models import AppUser, CourseLevel, LanguageCourse, Lesson, LessonExercise
from app.schemas import CreateLessonRequest

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/dashboard")
def dashboard_stats(
    _: AppUser = Depends(require_admin),
    session: Session = Depends(get_session),
) -> dict:
    users = session.exec(select(AppUser)).all()
    lessons = session.exec(select(Lesson)).all()
    courses = session.exec(select(LanguageCourse)).all()
    return {
        "users_total": len(users),
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
    courses = session.exec(select(LanguageCourse)).all()
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


@router.post("/lessons")
def create_lesson(
    payload: CreateLessonRequest,
    admin: AppUser = Depends(require_admin),
    session: Session = Depends(get_session),
) -> dict:
    level = session.exec(select(CourseLevel).where(CourseLevel.id == payload.level_id)).first()
    if not level:
        raise HTTPException(status_code=404, detail="Nivel no encontrado")

    for exercise in payload.exercises:
        if exercise.exercise_type.value in {"multiple_choice", "fill_in_the_blank"} and not exercise.correct_answer:
            raise HTTPException(status_code=400, detail="Ejercicio requiere opcion/respuesta correcta")
        if exercise.exercise_type.value == "media_comprehension" and not exercise.model_answer:
            raise HTTPException(status_code=400, detail="Comprension requiere respuesta modelo")

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

    for idx, item in enumerate(payload.exercises, start=1):
        session.add(
            LessonExercise(
                lesson_id=lesson.id,
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

    return {
        "lesson_id": lesson.id,
        "message": "Leccion guardada",
        "json_payload_saved": lesson.content_json,
    }

