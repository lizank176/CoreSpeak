from __future__ import annotations

import logging
import os
from collections.abc import Generator
from pathlib import Path
from urllib.parse import urlparse

from sqlalchemy import inspect as sa_inspect, text
from sqlmodel import Session, SQLModel, create_engine, select

from app.config import effective_database_url, settings
from app.models import CourseLevel, LanguageCourse

logger = logging.getLogger(__name__)

_ROOT = Path(__file__).resolve().parents[1]
_LOCAL_MYSQL_DEFAULT = "mysql+pymysql://corespeak:corespeak@localhost:3306/corespeak"


def _normalize_database_url(raw: str) -> str:
    u = raw.strip()
    if u.startswith("postgres://"):
        return "postgresql+psycopg2://" + u[len("postgres://") :]
    # Render/Neon suelen dar postgresql:// sin driver SQLAlchemy
    if u.startswith("postgresql://") and "+" not in u.split("://", 1)[0]:
        return "postgresql+psycopg2://" + u[len("postgresql://") :]
    return u


def _is_managed_database_url(url: str) -> bool:
    """Postgres remoto o MySQL no local (p. ej. Render PostgreSQL enlazado)."""
    if not url:
        return False
    u = _normalize_database_url(url)
    if u.startswith(("postgresql+psycopg2://", "postgresql+psycopg://")):
        return True
    if u.startswith("mysql+pymysql://"):
        parsed = urlparse(u.replace("mysql+pymysql", "mysql", 1))
        host = (parsed.hostname or "").lower()
        return host not in ("", "localhost", "127.0.0.1")
    return False


def _resolved_database_url() -> str:
    raw = effective_database_url((settings.database_url or "").strip())
    url = _normalize_database_url(raw)

    # DATABASE_URL explícita (p. ej. Postgres de Render) gana sobre SQLite efímero.
    if _is_managed_database_url(url):
        parsed = urlparse(url.replace("mysql+pymysql", "mysql", 1))
        host = parsed.hostname or "?"
        user = parsed.username or "?"
        db = (parsed.path or "").lstrip("/") or "?"
        source = "MYSQL_SERVICE_URI" if os.environ.get("MYSQL_SERVICE_URI", "").strip() else (
            "MYSQL_HOST/USER/PASSWORD"
            if os.environ.get("MYSQL_HOST", "").strip() and os.environ.get("MYSQL_USER", "").strip()
            else "DATABASE_URL"
        )
        logger.info(
            "MySQL remoto (%s): host=%s user=%s database=%s password_len=%s",
            source,
            host,
            user,
            db,
            len(parsed.password or ""),
        )
        if os.environ.get("RENDER") and source == "DATABASE_URL" and "aivencloud.com" in (host or ""):
            logger.error(
                "RENDER+Aiven: borra DATABASE_URL y usa MYSQL_SERVICE_URI (copiar URI del panel Aiven) "
                "o MYSQL_HOST + MYSQL_USER + MYSQL_PASSWORD + MYSQL_SSL_CA_CONTENT.",
            )
        return url

    if settings.use_sqlite:
        root = Path(__file__).resolve().parents[1]
        db_path = root / "data" / "corespeak.db"
        db_path.parent.mkdir(parents=True, exist_ok=True)
        sqlite_url = f"sqlite:///{db_path.as_posix()}"
        if os.environ.get("RENDER"):
            db_host = urlparse(_normalize_database_url(raw)).hostname if raw else None
            logger.error(
                "RENDER está usando SQLite (datos efímeros). Para Aiven MySQL configura en el dashboard: "
                "USE_SQLITE=false, DATABASE_URL=mysql+pymysql://...@HOST.aivencloud.com:PUERTO/defaultdb "
                "y MYSQL_SSL_CA_CONTENT=(contenido de ca.pem). "
                "Ahora USE_SQLITE=%s y DATABASE_URL host=%s",
                settings.use_sqlite,
                db_host or "(no definido o localhost)",
            )
        else:
            logger.info("SQLite local: %s", db_path)
        return sqlite_url

    if url == _LOCAL_MYSQL_DEFAULT or not url:
        logger.warning(
            "Sin USE_SQLITE ni DATABASE_URL remota: usando MySQL por defecto (%s). "
            "En producción probablemente no haya servidor MySQL local.",
            "localhost",
        )

    return url or raw


def _default_aiven_ca_path() -> Path | None:
    candidate = _ROOT / "infra" / "aiven" / "ca.pem"
    return candidate if candidate.is_file() else None


def _resolve_mysql_ca_path() -> Path | None:
    """Ruta al CA de Aiven: archivo local, MYSQL_SSL_CA o PEM en MYSQL_SSL_CA_CONTENT (Render)."""
    content = (os.environ.get("MYSQL_SSL_CA_CONTENT") or "").strip()
    if content:
        if "\\n" in content and "-----BEGIN" in content:
            content = content.replace("\\n", "\n")
        cache = Path(os.environ.get("MYSQL_SSL_CA_CACHE", "/tmp/aiven-ca.pem"))
        cache.parent.mkdir(parents=True, exist_ok=True)
        cache.write_text(content if content.endswith("\n") else content + "\n", encoding="utf-8")
        return cache

    ca_raw = (settings.mysql_ssl_ca or os.environ.get("MYSQL_SSL_CA") or "").strip()
    if ca_raw:
        p = Path(ca_raw)
        if not p.is_absolute():
            p = _ROOT / p
        return p if p.is_file() else None
    return _default_aiven_ca_path()


def _mysql_connect_args(url: str) -> dict:
    parsed = urlparse(url.replace("mysql+pymysql", "mysql", 1))
    host = (parsed.hostname or "").lower()
    if host in ("", "localhost", "127.0.0.1"):
        return {}

    ca_path = _resolve_mysql_ca_path()
    if not ca_path or not ca_path.is_file():
        if "aivencloud.com" in host:
            logger.warning(
                "MySQL remoto Aiven sin certificado CA. Define MYSQL_SSL_CA, MYSQL_SSL_CA_CONTENT "
                "(Render) o infra/aiven/ca.pem en la imagen.",
            )
        return {}

    logger.info("MySQL SSL: usando CA %s", ca_path)
    return {"ssl": {"ca": str(ca_path.resolve())}}


_db_url = _resolved_database_url()
_is_sqlite = _db_url.startswith("sqlite")
_connect_args = {"check_same_thread": False} if _is_sqlite else _mysql_connect_args(_db_url)
engine = create_engine(
    _db_url,
    echo=False,
    pool_pre_ping=True,
    connect_args=_connect_args,
)


def init_db() -> None:
    # Importa modelos para registrar metadatos antes de create_all.
    from app import models  # noqa: F401

    SQLModel.metadata.create_all(engine)
    ensure_user_is_active_column()
    ensure_user_subscription_status_column()
    ensure_user_ui_language_column()
    ensure_user_interested_in_premium_column()
    ensure_lesson_exercise_completions_table()
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


def ensure_user_is_active_column() -> None:
    try:
        inspector = sa_inspect(engine)
        if "users" not in inspector.get_table_names():
            return
        cols = {c.get("name") for c in inspector.get_columns("users")}
        if "is_active" in cols:
            return
        is_sql = engine.dialect.name == "sqlite"
        with engine.connect() as conn:
            if is_sql:
                conn.execute(text("ALTER TABLE users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1"))
            else:
                conn.execute(text("ALTER TABLE users ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1"))
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


def ensure_lesson_exercise_completions_table() -> None:
    """Crea la tabla de completions si el despliegue ya tenía BD antes del modelo nuevo."""
    try:
        inspector = sa_inspect(engine)
        if "lesson_exercise_completions" in inspector.get_table_names():
            return
        from app import models  # noqa: F401

        SQLModel.metadata.create_all(engine)
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

