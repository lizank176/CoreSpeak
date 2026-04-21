from __future__ import annotations

from collections.abc import Generator

from sqlalchemy import inspect as sa_inspect, text
from sqlmodel import Session, SQLModel, create_engine, select

from app.config import settings
from app.models import CourseLevel, LanguageCourse

_is_sqlite = settings.database_url.startswith("sqlite")
engine = create_engine(
    settings.database_url,
    echo=False,
    pool_pre_ping=True,
    connect_args={"check_same_thread": False} if _is_sqlite else {},
)


def init_db() -> None:
    # Importa modelos para registrar metadatos antes de create_all.
    from app import models  # noqa: F401

    SQLModel.metadata.create_all(engine)
    ensure_user_subscription_status_column()
    ensure_user_ui_language_column()
    seed_default_courses()
    seed_default_levels()


def get_session() -> Generator[Session, None, None]:
    session = Session(engine)
    try:
        yield session
    finally:
        session.close()


def ensure_user_subscription_status_column() -> None:
    try:
        inspector = sa_inspect(engine)
        if "users" not in inspector.get_table_names():
            return
        cols = {c.get("name") for c in inspector.get_columns("users")}
        if "subscription_status" in cols:
            return
        with engine.connect() as conn:
            conn.execute(text("ALTER TABLE users ADD COLUMN subscription_status VARCHAR(40) DEFAULT 'inactive'"))
            conn.commit()
    except Exception:
        pass


def ensure_user_ui_language_column() -> None:
    try:
        inspector = sa_inspect(engine)
        if "users" not in inspector.get_table_names():
            return
        cols = {c.get("name") for c in inspector.get_columns("users")}
        if "ui_language" in cols:
            return
        with engine.connect() as conn:
            conn.execute(text("ALTER TABLE users ADD COLUMN ui_language VARCHAR(12) DEFAULT 'es'"))
            conn.commit()
    except Exception:
        pass


def seed_default_courses() -> None:
    default_courses = [
        ("en", "Ingles"),
        ("uk", "Ucraniano"),
        ("fr", "Frances"),
        ("es", "Espanol"),
    ]
    with Session(engine) as session:
        existing_courses = session.exec(select(LanguageCourse)).all()
        by_code = {course.language_code: course for course in existing_courses}
        allowed_codes = {code for code, _ in default_courses}

        # Mantiene activos solo los cursos base definidos.
        for course in existing_courses:
            course.is_active = course.language_code in allowed_codes
            session.add(course)

        for code, name in default_courses:
            course = by_code.get(code)
            if course:
                course.language_name = name
                course.is_active = True
                session.add(course)
            else:
                session.add(LanguageCourse(language_code=code, language_name=name, is_active=True))
        session.commit()


def seed_default_levels() -> None:
    level_codes = ["A1", "A2", "B1", "B2", "C1"]
    with Session(engine) as session:
        courses = session.exec(select(LanguageCourse).where(LanguageCourse.is_active == True)).all()  # noqa: E712
        for course in courses:
            existing = session.exec(select(CourseLevel).where(CourseLevel.course_id == course.id)).all()
            existing_codes = {row.level_code for row in existing}
            for position, code in enumerate(level_codes, start=1):
                if code in existing_codes:
                    continue
                session.add(
                    CourseLevel(
                        course_id=course.id or 0,
                        level_code=code,
                        title=f"{course.language_name} {code}",
                        description=f"Nivel {code} de {course.language_name}",
                        position=position,
                    )
                )
        session.commit()

