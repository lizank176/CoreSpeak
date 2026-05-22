"""Prueba DATABASE_URL del .env (local Docker o Aiven)."""
from __future__ import annotations

import sys

from sqlalchemy import text

from app.db import _db_url, engine


def main() -> None:
    print("URL (sin contraseña visible):", _db_url.split("@")[-1] if "@" in _db_url else _db_url)
    try:
        with engine.connect() as conn:
            version = conn.execute(text("SELECT VERSION()")).scalar()
            users = conn.execute(text("SELECT COUNT(*) FROM users")).scalar()
        print("OK — MySQL conectado.")
        print("  VERSION:", version)
        print("  users:", users)
    except Exception as exc:
        print("ERROR:", exc, file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
