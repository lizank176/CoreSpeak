from __future__ import annotations

from collections.abc import Generator
from pathlib import Path

from sqlalchemy import inspect as sa_inspect, text
from sqlmodel import Session, SQLModel, create_engine, select

from app.config import settings
from app.models import CourseLevel, LanguageCourse


def _resolved_database_url() -> str:
    if settings.use_sqlite:
        root = Path(__file__).resolve().parents[1]
        db_path = root / "data" / "corespeak.db"
        db_path.parent.mkdir(parents=True, exist_ok=True)
        return f"sqlite:///{db_path.as_posix()}"
    return settings.database_url


_db_url = _resolved_database_url()
_is_sqlite = _db_url.startswith("sqlite")
engine = create_engine(
    _db_url,
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
    ensure_user_interested_in_premium_column()
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


def ensure_user_interested_in_premium_column() -> None:
    try:
        inspector = sa_inspect(engine)
        if "users" not in inspector.get_table_names():
            return
        cols = {c.get("name") for c in inspector.get_columns("users")}
        if "interested_in_premium" in cols:
            return
        is_sql = engine.dialect.name == "sqlite"
        with engine.connect() as conn:
            if is_sql:
                conn.execute(text("ALTER TABLE users ADD COLUMN interested_in_premium INTEGER NOT NULL DEFAULT 0"))
            else:
                conn.execute(text("ALTER TABLE users ADD COLUMN interested_in_premium TINYINT(1) NOT NULL DEFAULT 0"))
            conn.commit()
    except Exception:
        pass


def seed_default_courses() -> None:
    default_courses = [
        ("en", "Inglés"),
        ("uk", "Ucraniano"),
        ("fr", "Francés"),
        ("es", "Español"),
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

