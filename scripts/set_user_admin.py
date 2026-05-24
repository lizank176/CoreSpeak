"""
Promueve un usuario existente a administrador (role=admin).

Uso:
  .\\venv\\Scripts\\python.exe scripts\\set_user_admin.py TU_EMAIL
  .\\venv\\Scripts\\python.exe scripts\\set_user_admin.py TU_EMAIL --sqlite

Por defecto usa la misma BD que la API (.env). --sqlite fuerza data/corespeak.db.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    if len(sys.argv) < 2:
        print("Uso: python scripts/set_user_admin.py email@ejemplo.com [--sqlite]", file=sys.stderr)
        sys.exit(1)

    email = sys.argv[1].strip().lower()
    use_sqlite_file = "--sqlite" in sys.argv[2:]

    if use_sqlite_file:
        os.environ["USE_SQLITE"] = "true"
        os.environ.pop("DATABASE_URL", None)
        os.environ.pop("MYSQL_HOST", None)
        os.environ.pop("MYSQL_SERVICE_URI", None)

    sys.path.insert(0, str(ROOT))
    from sqlmodel import Session, create_engine, select

    from app.models import AppUser, UserRole

    if use_sqlite_file:
        db_path = ROOT / "data" / "corespeak.db"
        engine = create_engine(f"sqlite:///{db_path.as_posix()}", connect_args={"check_same_thread": False})
    else:
        from app.db import engine  # noqa: WPS433
    with Session(engine) as session:
        user = session.exec(select(AppUser).where(AppUser.email == email)).first()
        if not user:
            print(f"No hay usuario con email {email!r}")
            sys.exit(1)
        if user.role == UserRole.ADMIN:
            print(f"Ya es admin: {user.email} (id={user.id}) — sin cambios.")
            return
        existing_admin = session.exec(
            select(AppUser).where(AppUser.role == UserRole.ADMIN)
        ).first()
        if existing_admin:
            print(
                f"Ya hay un admin ({existing_admin.email}). "
                f"No se modifica a {email!r}."
            )
            sys.exit(1)
        user.role = UserRole.ADMIN
        session.add(user)
        session.commit()
        session.refresh(user)
        print(f"OK: {user.email} (id={user.id}) -> role={user.role!r}")
        print("Cierra sesión en el navegador e inicia sesión de nuevo para ver Admin.")


if __name__ == "__main__":
    main()
