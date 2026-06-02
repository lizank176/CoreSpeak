"""Endpoints de cursos, catálogo de lecciones y progreso de usuario.

Este módulo concentra:
- Catálogo público autenticado (`/api/catalog/...`)
- Endpoints legacy de cursos (`/api/courses/...`)
- Métricas de progreso usadas por dashboard y curso/lección.
"""

from __future__ import annotations

import json
import re
from datetime import date, datetime
from typing import Any
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session, select

from app.cefr import CEFR_SEQUENCE, normalize_cefr_level
from app.config import settings
from app.constants import PRIMARY_COURSE_CODE
from app.interest_catalog import interest_options_public_payload
from app.db import get_session
from app.dependencies import get_current_user, require_premium_or_grace
from app.models import AppUser, CourseLevel, Enrollment, LanguageCourse, Lesson, LessonAttempt, LessonExerciseCompletion, UserRole
from app.schemas import (
    DeleteAccountResponse,
    DisplayNamePatchRequest,
    EnglishLevelPatchRequest,
    ExtraLanguagesRequest,
    LessonExerciseResultResponse,
    LessonExerciseSubmitRequest,
    LearningActivityResponse,
    OnboardingSaveRequest,
)
from app.security import create_password_reset_token
from app.services.enrollment_service import sync_user_enrollments
from app.services.exercise_validation import validate_catalog_block_answer
from app.services.user_account_service import delete_user_account
from app.services.progress_service import award_xp, update_daily_streak

router = APIRouter(prefix="/api/courses", tags=["courses"])
catalog_router = APIRouter(prefix="/api/catalog", tags=["catalog"])
users_router = APIRouter(prefix="/api/users", tags=["users"])

XP_PER_LESSON_EXERCISE = 10


@catalog_router.get("/interest-options")
def catalog_interest_options() -> list[dict[str, Any]]:
    """Intereses multicheck para el perfil: etiquetas i18n y frases EN estándar para la IA."""
    return interest_options_public_payload()


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


_YOUTUBE_ID_RE = re.compile(
    r"(?:youtube\.com/(?:watch\?v=|embed/|shorts/)|youtu\.be/)([a-zA-Z0-9_-]{11})",
    re.IGNORECASE,
)
_VIMEO_ID_RE = re.compile(r"vimeo\.com/(?:video/)?(\d+)", re.IGNORECASE)


def _lesson_media_display_fields(lesson: Lesson) -> dict[str, Any]:
    out: dict[str, Any] = {
        "youtube_url": None,
        "youtube_embed_url": None,
        "extra_videos": [],
    }
    video = (lesson.video_url or "").strip()
    if not video:
        return out
    yt = _YOUTUBE_ID_RE.search(video)
    if yt:
        out["youtube_url"] = video
        out["youtube_embed_url"] = f"https://www.youtube.com/embed/{yt.group(1)}"
        return out
    vm = _VIMEO_ID_RE.search(video)
    if vm:
        out["extra_videos"].append(
            {
                "url": video,
                "embed_url": f"https://player.vimeo.com/video/{vm.group(1)}",
                "kind": "vimeo",
                "caption": None,
            }
        )
        return out
    if video.lower().endswith((".mp4", ".webm", ".ogg", ".mov")):
        out["extra_videos"].append({"url": video, "kind": "mp4", "caption": None})
    return out


def _lesson_transcript(lesson: Lesson) -> str | None:
    content = lesson.content_json if isinstance(lesson.content_json, dict) else {}
    media = content.get("media") if isinstance(content.get("media"), dict) else {}
    raw = media.get("transcript") or content.get("transcript") or content.get("youtube_transcript")
    if raw is None:
        return None
    text = str(raw).strip()
    return text or None


def _extract_correct_answers(correct_answer: Any, options_json: dict[str, Any]) -> list[str]:
    configured = options_json.get("correct_answers")
    if isinstance(configured, list):
        return [str(x).strip() for x in configured if str(x).strip()]
    raw = str(correct_answer or "").strip()
    if not raw:
        return []
    return [part.strip() for part in raw.split("||") if part.strip()]


def _catalog_blocks_from_content(content: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not isinstance(content, dict):
        return []
    exercises = content.get("exercises")
    if not isinstance(exercises, list):
        return []
    blocks: list[dict[str, Any]] = []
    for item in exercises:
        if not isinstance(item, dict):
            continue
        ex_type = str(item.get("exercise_type") or "").strip().lower()
        prompt = str(item.get("prompt") or "").strip()
        options_json = item.get("options_json") if isinstance(item.get("options_json"), dict) else {}
        correct_answer = item.get("correct_answer")

        if ex_type in {"multiple_choice", "single_choice"}:
            options = options_json.get("options")
            if not isinstance(options, list):
                options = []
            valid_options = [str(op).strip() for op in options if str(op).strip()]
            correct_answers = _extract_correct_answers(correct_answer, options_json)
            block = {
                "type": "quiz",
                "pregunta": prompt,
                "opciones": valid_options,
                "respuestas_validas": correct_answers,
                "respuesta_correcta": correct_answers[0] if correct_answers else None,
                "selection_mode": "single_choice"
                if str(options_json.get("mode") or "").strip().lower() == "single_choice"
                else "multiple_choice",
            }
            blocks.append(block)
            continue

        if ex_type == "fill_in_the_blank":
            sentence = str(options_json.get("sentence") or prompt).strip()
            hidden_word = str(options_json.get("hidden_word") or "").strip()
            answers = [str(correct_answer).strip()] if correct_answer else []
            block = {
                "type": "fill_blank",
                "pregunta": sentence or prompt,
                "hidden_word": hidden_word,
                "respuestas_validas": answers,
                "respuesta_correcta": answers[0] if answers else None,
            }
            blocks.append(block)
            continue

        if prompt:
            options = options_json.get("options")
            if not isinstance(options, list):
                options = []
            valid_options = [str(op).strip() for op in options if str(op).strip()]
            correct_answers = _extract_correct_answers(correct_answer, options_json)
            blocks.append(
                {
                    "type": "quiz",
                    "pregunta": prompt,
                    "opciones": valid_options,
                    "respuestas_validas": correct_answers,
                    "respuesta_correcta": correct_answers[0] if correct_answers else None,
                    "selection_mode": "single_choice",
                }
            )

    if blocks:
        return blocks

    legacy = content.get("blocks")
    if isinstance(legacy, list):
        return [b for b in legacy if isinstance(b, dict)]
    return []


def _exercise_points(content: dict[str, Any] | None, exercise_index: int) -> int:
    if not isinstance(content, dict):
        return XP_PER_LESSON_EXERCISE
    exercises = content.get("exercises")
    if not isinstance(exercises, list) or exercise_index >= len(exercises):
        return XP_PER_LESSON_EXERCISE
    item = exercises[exercise_index]
    if not isinstance(item, dict):
        return XP_PER_LESSON_EXERCISE
    raw = item.get("points")
    try:
        return max(1, int(raw))
    except (TypeError, ValueError):
        return XP_PER_LESSON_EXERCISE


def _lesson_blocks_for_user(lesson: Lesson) -> list[dict[str, Any]]:
    return _catalog_blocks_from_content(lesson.content_json if isinstance(lesson.content_json, dict) else {})


def _commit_user_streak(user: AppUser, session: Session) -> str:
    streak_message = update_daily_streak(user)
    session.add(user)
    session.commit()
    session.refresh(user)
    return streak_message


def _safe_prior_completion(
    session: Session,
    user_id: int,
    lesson_id: int,
    exercise_index: int,
) -> LessonExerciseCompletion | None:
    try:
        return session.exec(
            select(LessonExerciseCompletion).where(
                LessonExerciseCompletion.user_id == user_id,
                LessonExerciseCompletion.lesson_id == lesson_id,
                LessonExerciseCompletion.exercise_index == exercise_index,
            )
        ).first()
    except Exception:
        session.rollback()
        return None


@users_router.post("/me/activity", response_model=LearningActivityResponse)
def record_learning_activity(
    user: AppUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> LearningActivityResponse:
    """Marca actividad de aprendizaje hoy (actualiza racha). Independiente del XP."""
    streak_message = _commit_user_streak(user, session)
    return LearningActivityResponse(
        streak_days=int(user.streak_days or 0),
        xp_total=int(user.xp_total or 0),
        streak_message=streak_message,
    )


@catalog_router.post("/lessons/{lesson_id}/exercises/submit", response_model=LessonExerciseResultResponse)
def submit_lesson_exercise(
    lesson_id: int,
    payload: LessonExerciseSubmitRequest,
    user: AppUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> LessonExerciseResultResponse:
    lesson = session.get(Lesson, lesson_id)
    if not lesson:
        raise HTTPException(status_code=404, detail="Leccion no encontrada")
    if lesson.is_premium and not user.is_premium:
        raise HTTPException(status_code=402, detail="Leccion avanzada disponible para Premium")
    if not _lesson_accessible_for_user(lesson, user):
        raise HTTPException(status_code=402, detail="Leccion no disponible en tu plan")

    course = session.get(LanguageCourse, lesson.course_id)
    chosen_codes = {
        str(code).strip().lower()
        for code in user.target_languages_json.get("languages", [])
        if str(code).strip()
    }
    if course and not user.is_premium and course.language_code.lower() not in chosen_codes:
        raise HTTPException(status_code=402, detail="Curso disponible para usuarios Premium")

    blocks = _lesson_blocks_for_user(lesson)
    idx = int(payload.exercise_index)
    if idx < 0 or idx >= len(blocks):
        raise HTTPException(status_code=422, detail="Indice de ejercicio invalido")

    block = blocks[idx]
    is_correct = validate_catalog_block_answer(
        block,
        answer=payload.answer,
        selected=payload.selected,
    )

    has_answer = bool((payload.answer or "").strip()) or bool(payload.selected)
    if not has_answer:
        raise HTTPException(status_code=422, detail="Indica una respuesta antes de comprobar.")

    streak_message = _commit_user_streak(user, session)

    prior = _safe_prior_completion(session, int(user.id or 0), lesson_id, idx)

    if prior and prior.xp_awarded > 0:
        feedback = "Correcto" if is_correct else "Incorrecto"
        if is_correct:
            feedback = "Ya habias completado este ejercicio. No se suma XP extra."
        else:
            feedback = f"{feedback} {streak_message}"
        return LessonExerciseResultResponse(
            is_correct=is_correct,
            xp_awarded=0,
            xp_total=int(user.xp_total or 0),
            streak_days=int(user.streak_days or 0),
            streak_message=streak_message,
            repeat_submission=True,
            feedback=feedback,
        )

    xp_awarded = 0
    if is_correct:
        points = _exercise_points(lesson.content_json if isinstance(lesson.content_json, dict) else {}, idx)
        xp_awarded = award_xp(user, points)
        session.add(user)
        session.commit()
        session.refresh(user)
        try:
            session.add(
                LessonExerciseCompletion(
                    user_id=int(user.id or 0),
                    lesson_id=lesson_id,
                    exercise_index=idx,
                    xp_awarded=xp_awarded,
                )
            )
            session.flush()

            completed_indices = {
                row.exercise_index
                for row in session.exec(
                    select(LessonExerciseCompletion).where(
                        LessonExerciseCompletion.user_id == user.id,
                        LessonExerciseCompletion.lesson_id == lesson_id,
                    )
                ).all()
            }
            if len(completed_indices) >= len(blocks) and blocks:
                existing_attempt = session.exec(
                    select(LessonAttempt).where(
                        LessonAttempt.user_id == user.id,
                        LessonAttempt.lesson_id == lesson_id,
                    )
                ).first()
                if not existing_attempt:
                    session.add(
                        LessonAttempt(
                            user_id=int(user.id or 0),
                            lesson_id=lesson_id,
                            score=len(blocks),
                        )
                    )
            session.commit()
            session.refresh(user)
        except Exception:
            session.rollback()

    if is_correct:
        feedback = f"Correcto. +{xp_awarded} XP. {streak_message}"
    else:
        feedback = f"Incorrecto. Intentalo de nuevo. {streak_message}"

    return LessonExerciseResultResponse(
        is_correct=is_correct,
        xp_awarded=xp_awarded,
        xp_total=int(user.xp_total or 0),
        streak_days=int(user.streak_days or 0),
        streak_message=streak_message,
        repeat_submission=False,
        feedback=feedback,
    )


@users_router.patch("/me/display-name")
def patch_display_name(
    payload: DisplayNamePatchRequest,
    user: AppUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict[str, str]:
    fn = (payload.first_name or "").strip()
    ln = (payload.last_name or "").strip()
    combined = " ".join(p for p in (fn, ln) if p)
    if len(combined) < 2:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Indica nombre y/o apellido (al menos 2 caracteres en total).",
        )
    if len(combined) > 120:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Nombre demasiado largo.")
    user.full_name = combined
    user.updated_at = datetime.utcnow()
    session.add(user)
    session.commit()
    session.refresh(user)
    return {"nombre": user.full_name or combined}


@users_router.patch("/me/english-level")
def patch_english_level(
    payload: EnglishLevelPatchRequest,
    user: AppUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict[str, str]:
    levels = dict(user.current_levels_json or {})
    en_level = normalize_cefr_level(payload.english_level)
    levels[PRIMARY_COURSE_CODE] = en_level
    user.current_levels_json = levels
    user.updated_at = datetime.utcnow()
    session.add(user)
    session.commit()
    session.refresh(user)
    return {"english_level": en_level}


@users_router.get("/me/profile")
def me_profile(user: AppUser = Depends(get_current_user)) -> dict[str, Any]:
    raw_levels = user.current_levels_json if isinstance(user.current_levels_json, dict) else {}
    code = raw_levels.get(PRIMARY_COURSE_CODE) or raw_levels.get("en")
    if not code and raw_levels:
        fv = next(iter(raw_levels.values()), None)
        code = str(fv).strip() if fv is not None else None
    english_level = normalize_cefr_level(str(code) if code else "A1")

    tg = user.target_languages_json if isinstance(user.target_languages_json, dict) else {}
    intereses = user.interests_json if isinstance(user.interests_json, list) else []

    return {
        "id": user.id,
        "nombre": user.full_name,
        "email": user.email,
        "idioma_ui": user.ui_language,
        "idioma_nativo": user.native_language,
        "idiomas_objetivo": tg.get("languages", []),
        "intereses": intereses,
        "ocupacion": user.occupation,
        "interesado_premium": user.interested_in_premium,
        "is_premium": user.is_premium,
        "is_admin": user.role == UserRole.ADMIN,
        "curso_principal": PRIMARY_COURSE_CODE,
        "english_level": english_level,
    }


@users_router.post("/me/password-reset-link")
def create_self_password_reset_link(user: AppUser = Depends(get_current_user)) -> dict[str, str | int]:
    token = create_password_reset_token(user.email)
    base = settings.app_base_url.rstrip("/")
    reset_url = f"{base}/ui/restablecer_contrasena.html?token={quote(token, safe='')}"
    return {
        "user_id": user.id,
        "email": user.email,
        "reset_url": reset_url,
        "message": "Enlace de cambio de contraseña generado.",
    }


@users_router.post("/me/onboarding")
def save_onboarding(
    payload: OnboardingSaveRequest,
    user: AppUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict[str, str]:
    user.occupation = (payload.ocupacion or "").strip() or None
    clj = dict(user.current_levels_json or {})
    na = payload.niveles_actuales or {}
    lvl = na.get(PRIMARY_COURSE_CODE)
    if lvl and str(lvl).strip():
        clj[PRIMARY_COURSE_CODE] = normalize_cefr_level(str(lvl))
    if PRIMARY_COURSE_CODE not in clj:
        clj[PRIMARY_COURSE_CODE] = "A1"
    user.current_levels_json = clj
    if not user.is_premium:
        user.target_languages_json = {"languages": [PRIMARY_COURSE_CODE]}
    user.updated_at = datetime.utcnow()
    session.add(user)
    sync_user_enrollments(session, user)
    session.commit()
    return {"status": "ok"}


@users_router.post("/me/extra-languages")
def set_extra_languages(
    payload: ExtraLanguagesRequest,
    user: AppUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict[str, list[str]]:
    if not user.is_premium:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo los suscriptores Premium pueden añadir mas idiomas de aprendizaje.",
        )
    valid = {
        c.language_code.lower()
        for c in session.exec(select(LanguageCourse).where(LanguageCourse.is_active == True)).all()  # noqa: E712
        if c.language_code
    }
    if PRIMARY_COURSE_CODE not in valid:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Falta el curso base de ingles en el catalogo"
        )
    out: list[str] = [PRIMARY_COURSE_CODE]
    seen: set[str] = {PRIMARY_COURSE_CODE}
    for c in payload.language_codes or []:
        cl = str(c).strip().lower()
        if not cl or cl in seen or cl not in valid:
            continue
        seen.add(cl)
        out.append(cl)
    user.target_languages_json = {"languages": out}
    user.updated_at = datetime.utcnow()
    session.add(user)
    sync_user_enrollments(session, user)
    session.commit()
    return {"languages": out}


@users_router.get("/me/progress")
def my_progress(user: AppUser = Depends(get_current_user)) -> dict[str, Any]:
    return {
        "user_id": user.id,
        "nombre": user.full_name,
        "racha_actual": int(user.streak_days or 0),
        "total_xp": int(user.xp_total or 0),
    }


@users_router.delete("/me/account", response_model=DeleteAccountResponse)
def delete_my_account(
    user: AppUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> DeleteAccountResponse:
    if user.role == UserRole.ADMIN:
        other_admins = session.exec(
            select(AppUser).where(AppUser.role == UserRole.ADMIN, AppUser.id != user.id, AppUser.is_active == True)
        ).all()
        if not other_admins:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No puedes eliminar la única cuenta de administrador activa.",
            )
    delete_user_account(session, user)
    return DeleteAccountResponse(message="Tu cuenta ha sido eliminada.")


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


def _user_cefr_level(user: AppUser, lang_code: str | None = None) -> str:
    raw_levels = user.current_levels_json if isinstance(user.current_levels_json, dict) else {}
    code = raw_levels.get(PRIMARY_COURSE_CODE) or raw_levels.get("en")
    if lang_code:
        alt = raw_levels.get(lang_code.lower().strip())
        if alt:
            code = alt
    return normalize_cefr_level(str(code) if code else "A1")


def _cefr_index(level_code: str) -> int:
    level = normalize_cefr_level(level_code)
    try:
        return CEFR_SEQUENCE.index(level)
    except ValueError:
        return 0


def _lesson_sort_key(level_code: str, user_level: str, lesson_id: int, title: str) -> tuple[int, int, str, int]:
    ul = normalize_cefr_level(user_level)
    lc = normalize_cefr_level(level_code)
    tier = 0 if lc == ul else 1
    return (tier, _cefr_index(lc), (title or "").lower(), lesson_id or 0)


def _course_level_progress(
    lessons: list[Lesson],
    levels_by_id: dict[int, CourseLevel],
    user_level: str,
    completed_lesson_ids: set[int],
    exercise_counts: dict[int, int] | None = None,
) -> dict[str, Any]:
    """Calcula progreso de curso para dashboard priorizando avance por ejercicios.

    Si existen datos de ejercicios completados, el porcentaje se calcula sobre
    ejercicios; si no, cae al progreso por lecciones completadas.
    """
    # El dashboard prioriza el nivel CEFR actual del usuario dentro del curso.
    scoped = [
        lesson
        for lesson in lessons
        if normalize_cefr_level(
            (levels_by_id.get(lesson.level_id).level_code if levels_by_id.get(lesson.level_id) else "A1")
        )
        == normalize_cefr_level(user_level)
    ]
    if not scoped:
        scoped = list(lessons)
    total = len(scoped)
    done = sum(1 for lesson in scoped if lesson.id and int(lesson.id) in completed_lesson_ids)
    exercises_total = 0
    exercises_completed = 0
    counts = exercise_counts or {}
    for lesson in scoped:
        if not lesson.id:
            continue
        block_count = len(_lesson_blocks_for_user(lesson))
        exercises_total += block_count
        completed_for_lesson = counts.get(int(lesson.id), 0)
        exercises_completed += min(completed_for_lesson, block_count) if block_count else 0
    if exercises_total > 0:
        percent = round((exercises_completed / exercises_total) * 100)
    else:
        percent = round((done / total) * 100) if total > 0 else 0
    return {
        "lessons_completed": done,
        "lessons_total": total,
        "exercises_completed": exercises_completed,
        "exercises_total": exercises_total,
        "progress_percent": percent,
    }


@catalog_router.get("/courses")
def catalog_courses(
    lang: str | None = Query(default=None),
    user: AppUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[dict[str, Any]]:
    """Listado de cursos con métricas de progreso agregadas por usuario."""
    chosen_codes = {
        str(code).strip().lower()
        for code in user.target_languages_json.get("languages", [])
        if str(code).strip()
    }
    courses_query = select(LanguageCourse).where(LanguageCourse.is_active == True)  # noqa: E712
    if lang:
        courses_query = courses_query.where(LanguageCourse.language_code == lang.lower().strip())
    courses = session.exec(courses_query).all()
    course_ids = [course.id for course in courses if course.id]
    levels_by_course: dict[int, dict[int, CourseLevel]] = {}
    lessons_by_course: dict[int, list[Lesson]] = {}
    all_lesson_ids: list[int] = []
    if course_ids:
        for course_id in course_ids:
            levels_by_course[course_id] = {
                lvl.id: lvl
                for lvl in session.exec(
                    select(CourseLevel).where(CourseLevel.course_id == course_id)
                ).all()
            }
            lessons = session.exec(
                select(Lesson).where(Lesson.course_id == course_id, Lesson.is_published == True)  # noqa: E712
            ).all()
            lessons_by_course[course_id] = lessons
            all_lesson_ids.extend(int(lesson.id) for lesson in lessons if lesson.id)

    completed_lesson_ids: set[int] = set()
    exercise_counts: dict[int, int] = {}
    if all_lesson_ids:
        # Dos vistas de avance:
        # - attempts => lección completada
        # - completions => ejercicios completados
        attempts = session.exec(
            select(LessonAttempt).where(
                LessonAttempt.user_id == user.id,
                LessonAttempt.lesson_id.in_(all_lesson_ids),
            )
        ).all()
        completed_lesson_ids = {int(a.lesson_id) for a in attempts if a.lesson_id is not None}
        completions = session.exec(
            select(LessonExerciseCompletion).where(
                LessonExerciseCompletion.user_id == user.id,
                LessonExerciseCompletion.lesson_id.in_(all_lesson_ids),
            )
        ).all()
        for row in completions:
            if row.lesson_id is None:
                continue
            lid = int(row.lesson_id)
            exercise_counts[lid] = exercise_counts.get(lid, 0) + 1

    output: list[dict[str, Any]] = []
    for course in courses:
        if not course.id:
            continue
        lessons = lessons_by_course.get(int(course.id), [])
        user_level = _user_cefr_level(user, course.language_code)
        has_premium = any(lesson.is_premium for lesson in lessons)
        progress = _course_level_progress(
            lessons,
            levels_by_course.get(int(course.id), {}),
            user_level,
            completed_lesson_ids,
            exercise_counts,
        )
        output.append(
            {
                "id": course.id,
                "lang_code": course.language_code,
                "title": course.language_name,
                "cefr_level": user_level,
                "user_cefr_level": user_level,
                "lesson_count": len(lessons),
                "lessons_completed": progress["lessons_completed"],
                "lessons_total": progress["lessons_total"],
                "exercises_completed": progress["exercises_completed"],
                "exercises_total": progress["exercises_total"],
                "progress_percent": progress["progress_percent"],
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

    user_level = _user_cefr_level(user, course.language_code)
    levels_by_id = {
        lvl.id: lvl
        for lvl in session.exec(select(CourseLevel).where(CourseLevel.course_id == course_id)).all()
    }
    lessons = session.exec(
        select(Lesson).where(Lesson.course_id == course_id, Lesson.is_published == True)  # noqa: E712
    ).all()
    lesson_ids = [lesson.id for lesson in lessons if lesson.id]
    completed_lesson_ids: set[int] = set()
    exercise_counts: dict[int, int] = {}
    if lesson_ids:
        attempts = session.exec(
            select(LessonAttempt).where(
                LessonAttempt.user_id == user.id,
                LessonAttempt.lesson_id.in_(lesson_ids),
            )
        ).all()
        completed_lesson_ids = {int(a.lesson_id) for a in attempts if a.lesson_id is not None}
        completions = session.exec(
            select(LessonExerciseCompletion).where(
                LessonExerciseCompletion.user_id == user.id,
                LessonExerciseCompletion.lesson_id.in_(lesson_ids),
            )
        ).all()
        for row in completions:
            if row.lesson_id is None:
                continue
            lid = int(row.lesson_id)
            exercise_counts[lid] = exercise_counts.get(lid, 0) + 1

    rows: list[dict[str, Any]] = []
    for lesson in lessons:
        level = levels_by_id.get(lesson.level_id)
        level_code = normalize_cefr_level(level.level_code if level else "A1")
        exercises_total = len(_lesson_blocks_for_user(lesson))
        exercises_completed = exercise_counts.get(int(lesson.id or 0), 0)
        rows.append(
            {
                "id": lesson.id,
                "title": lesson.title,
                "description": lesson.description,
                "accessible": _lesson_accessible_for_user(lesson, user),
                "is_premium": lesson.is_premium,
                "cefr_level": level_code,
                "is_completed": int(lesson.id or 0) in completed_lesson_ids,
                "exercises_completed": exercises_completed,
                "exercises_total": exercises_total,
                "cover_image_path": lesson.image_url,
            }
        )
    rows.sort(
        key=lambda row: _lesson_sort_key(
            str(row.get("cefr_level") or "A1"),
            user_level,
            int(row.get("id") or 0),
            str(row.get("title") or ""),
        )
    )
    return rows


def _lesson_neighbors_in_course(
    session: Session,
    lesson: Lesson,
    user: AppUser,
) -> dict[str, Any]:
    course_id = lesson.course_id
    if not course_id or not lesson.id:
        return {
            "course_id": course_id,
            "prev_lesson": None,
            "next_lesson": None,
            "lesson_position": None,
            "lessons_in_course": 0,
        }
    course = session.get(LanguageCourse, course_id)
    user_level = _user_cefr_level(user, course.language_code if course else "")
    levels_by_id = {
        lvl.id: lvl
        for lvl in session.exec(select(CourseLevel).where(CourseLevel.course_id == course_id)).all()
    }
    lessons = session.exec(
        select(Lesson).where(Lesson.course_id == course_id, Lesson.is_published == True)  # noqa: E712
    ).all()
    ordered: list[tuple[int, str]] = []
    for item in lessons:
        if not item.id:
            continue
        level = levels_by_id.get(item.level_id)
        level_code = normalize_cefr_level(level.level_code if level else "A1")
        sort_key = _lesson_sort_key(level_code, user_level, int(item.id), str(item.title or ""))
        ordered.append((sort_key, int(item.id), level_code))
    ordered.sort(key=lambda row: row[0])
    sequence = [(lesson_id, level_code) for _, lesson_id, level_code in ordered]
    lesson_ids = [lesson_id for lesson_id, _ in sequence]
    try:
        idx = lesson_ids.index(int(lesson.id))
    except ValueError:
        idx = -1

    def neighbor(offset: int) -> dict[str, Any] | None:
        pos = idx + offset
        if pos < 0 or pos >= len(sequence):
            return None
        lesson_id, level_code = sequence[pos]
        return {"id": lesson_id, "cefr_level": level_code}

    return {
        "course_id": course_id,
        "prev_lesson": neighbor(-1),
        "next_lesson": neighbor(1),
        "lesson_position": idx + 1 if idx >= 0 else None,
        "lessons_in_course": len(sequence),
    }


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
    blocks = _catalog_blocks_from_content(lesson.content_json)
    media = _lesson_media_display_fields(lesson)
    neighbors = _lesson_neighbors_in_course(session, lesson, user)
    return {
        "id": lesson.id,
        "title": lesson.title,
        "description": lesson.description,
        "accessible": accessible,
        "course_id": neighbors.get("course_id"),
        "prev_lesson": neighbors.get("prev_lesson"),
        "next_lesson": neighbors.get("next_lesson"),
        "lesson_position": neighbors.get("lesson_position"),
        "lessons_in_course": neighbors.get("lessons_in_course"),
        "cover_image_path": lesson.image_url,
        "media_gallery": [],
        "video_url": lesson.video_url,
        "youtube_url": media.get("youtube_url"),
        "youtube_embed_url": media.get("youtube_embed_url"),
        "extra_videos": media.get("extra_videos") or [],
        "audio_url": lesson.audio_url,
        "youtube_transcript": _lesson_transcript(lesson),
        "content": lesson.content_json,
        "exercises": lesson.content_json.get("exercises", []),
        "exercises_json": json.dumps({"blocks": blocks}, ensure_ascii=False),
    }

