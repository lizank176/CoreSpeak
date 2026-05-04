"""Compatibilidad de fechas: según dialecto/tipo SQL el ORM puede devolver `date` o `datetime`."""

from __future__ import annotations

from datetime import date, datetime


def calendar_day_from_db(value: datetime | date) -> date:
    if isinstance(value, datetime):
        return value.date()
    return value
