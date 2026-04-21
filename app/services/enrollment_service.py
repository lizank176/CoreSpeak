from __future__ import annotations

from sqlmodel import Session, select

from app.models import AppUser, Enrollment, LanguageCourse


def sync_user_enrollments(session: Session, user: AppUser) -> None:
    requested_codes = [
        str(code).strip().lower()
        for code in user.target_languages_json.get("languages", [])
        if str(code).strip()
    ]
    if not requested_codes:
        return

    courses = session.exec(select(LanguageCourse).where(LanguageCourse.is_active == True)).all()  # noqa: E712
    code_to_course = {course.language_code.lower(): course for course in courses}
    selected_course_ids: list[int] = []
    for code in requested_codes:
        course = code_to_course.get(code)
        if course and course.id:
            selected_course_ids.append(course.id)

    if not selected_course_ids:
        return

    # Plan basic: solo un idioma activo; premium: todos los seleccionados.
    if not user.is_premium:
        selected_course_ids = selected_course_ids[:1]

    enrollments = session.exec(select(Enrollment).where(Enrollment.user_id == user.id)).all()
    existing_by_course = {en.course_id: en for en in enrollments}

    for idx, course_id in enumerate(selected_course_ids):
        existing = existing_by_course.get(course_id)
        if existing:
            existing.is_active = True
            existing.is_primary_course = idx == 0
            session.add(existing)
        else:
            session.add(
                Enrollment(
                    user_id=user.id or 0,
                    course_id=course_id,
                    is_primary_course=idx == 0,
                    is_active=True,
                )
            )

    selected_set = set(selected_course_ids)
    for enrollment in enrollments:
        if enrollment.course_id not in selected_set:
            enrollment.is_active = False
            enrollment.is_primary_course = False
            session.add(enrollment)

