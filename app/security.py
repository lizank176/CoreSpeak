from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.config import settings

PASSWORD_RESET_JWT_PURPOSE = "password_reset"

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, password_hash: str) -> bool:
    return pwd_context.verify(plain_password, password_hash)


def create_access_token(subject: str, extra_claims: dict[str, Any] | None = None) -> str:
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=settings.jwt_access_token_minutes)
    payload: dict[str, Any] = {"sub": subject, "iat": int(now.timestamp()), "exp": int(expire.timestamp())}
    if extra_claims:
        payload.update(extra_claims)
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict[str, Any]:
    try:
        return jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except JWTError as exc:  # pragma: no cover
        raise ValueError("invalid_token") from exc


PASSWORD_RESET_PURPOSE = "password_reset"


def create_password_reset_token(email: str) -> str:
    norm = str(email).lower().strip()
    minutes = max(5, min(60, int(settings.password_reset_expire_minutes or 15)))
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=minutes)
    payload: dict[str, Any] = {
        "sub": norm,
        "purpose": PASSWORD_RESET_PURPOSE,
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_password_reset_token(token: str) -> dict[str, Any]:
    """Solo JWT emitidos por create_password_reset_token (purpose=password_reset)."""
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except JWTError as exc:
        raise ValueError("invalid_token") from exc
    if payload.get("purpose") != PASSWORD_RESET_PURPOSE:
        raise ValueError("wrong_token_type")
    sub = str(payload.get("sub") or "").strip().lower()
    if not sub:
        raise ValueError("missing_sub")
    return payload

