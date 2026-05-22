"""
Migra datos de data/corespeak.db (SQLite) a MySQL local (Docker puerto 3307).

Uso:
  .\\venv\\Scripts\\python.exe scripts\\migrate_sqlite_to_mysql.py

Requisito: docker compose up -d mysql
"""
from __future__ import annotations

import json
import sqlite3
import sys
from pathlib import Path

import pymysql
from pymysql.cursors import DictCursor

ROOT = Path(__file__).resolve().parents[1]
SQLITE_PATH = ROOT / "data" / "corespeak.db"
MYSQL = {
    "host": "127.0.0.1",
    "port": 3307,
    "user": "corespeak",
    "password": "corespeak",
    "database": "corespeak",
    "charset": "utf8mb4",
}

# Orden por dependencias de claves foráneas
TABLES = [
    "users",
    "language_courses",
    "course_levels",
    "lessons",
    "lesson_exercises",
    "enrollments",
    "lesson_attempts",
    "daily_challenges",
    "billing_records",
    "stripe_webhook_events",
    "agenda_words",
    "web_push_subscriptions",
]


def create_schema() -> None:
    import os

    os.environ["USE_SQLITE"] = "false"
    os.environ["DATABASE_URL"] = (
        "mysql+pymysql://corespeak:corespeak@127.0.0.1:3307/corespeak"
    )
    # Recargar settings del proyecto
    from sqlmodel import SQLModel

    from app import models  # noqa: F401
    from app.db import (
        ensure_user_interested_in_premium_column,
        ensure_user_subscription_status_column,
        ensure_user_ui_language_column,
        engine,
    )

    SQLModel.metadata.create_all(engine)
    ensure_user_subscription_status_column()
    ensure_user_ui_language_column()
    ensure_user_interested_in_premium_column()
    print("Esquema MySQL creado/actualizado.")


def sqlite_tables(conn: sqlite3.Connection) -> set[str]:
    rows = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    ).fetchall()
    return {r[0] for r in rows}


def migrate() -> None:
    if not SQLITE_PATH.is_file():
        print(f"No existe {SQLITE_PATH}", file=sys.stderr)
        sys.exit(1)

    create_schema()

    src = sqlite3.connect(SQLITE_PATH)
    src.row_factory = sqlite3.Row
    present = sqlite_tables(src)

    dst = pymysql.connect(**MYSQL, cursorclass=DictCursor)
    try:
        with dst.cursor() as cur:
            cur.execute("SHOW TABLES")
            mysql_tables = {list(r.values())[0] for r in cur.fetchall()}

            cur.execute("SET FOREIGN_KEY_CHECKS = 0")
            for table in TABLES:
                if table not in present:
                    print(f"  (omitida en SQLite: {table})")
                    continue
                if table not in mysql_tables:
                    print(f"  (omitida en MySQL: {table})")
                    continue
                cur.execute(f"TRUNCATE TABLE `{table}`")
            dst.commit()

            total = 0
            for table in TABLES:
                if table not in present or table not in mysql_tables:
                    continue
                rows = src.execute(f"SELECT * FROM [{table}]").fetchall()
                if not rows:
                    print(f"  {table}: 0 filas")
                    continue
                cols = rows[0].keys()
                col_list = ", ".join(f"`{c}`" for c in cols)
                placeholders = ", ".join(["%s"] * len(cols))
                sql = f"INSERT INTO `{table}` ({col_list}) VALUES ({placeholders})"
                values = []
                for row in rows:
                    values.append(tuple(row[c] for c in cols))
                cur.executemany(sql, values)
                dst.commit()
                print(f"  {table}: {len(rows)} filas")
                total += len(rows)

                cur.execute(
                    f"SELECT COALESCE(MAX(id), 0) AS m FROM `{table}`"
                )
                max_id = cur.fetchone()["m"]
                if max_id:
                    cur.execute(
                        f"ALTER TABLE `{table}` AUTO_INCREMENT = {int(max_id) + 1}"
                    )
                    dst.commit()

            cur.execute("SET FOREIGN_KEY_CHECKS = 1")
            dst.commit()
        print(f"\nMigración completada: {total} filas copiadas.")
    finally:
        src.close()
        dst.close()


if __name__ == "__main__":
    print(f"Origen: {SQLITE_PATH}")
    print(f"Destino: MySQL {MYSQL['host']}:{MYSQL['port']}/{MYSQL['database']}\n")
    migrate()
