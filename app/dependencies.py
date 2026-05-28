from __future__ import annotations

from datetime import datetime, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlmodel import Session, select

from app.db import get_session
from app.models import AppUser, UserRole
from app.security import decode_access_token

security = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    session: Session = Depends(get_session),
) -> AppUser:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing auth token")
    raw = (credentials.credentials or "").strip()
    if not raw:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing auth token")
    try:
        payload = decode_access_token(raw)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sesion no valida. Vuelve a iniciar sesion.",
        ) from exc

    user: AppUser | None = None
    uid = payload.get("uid")
    if uid is not None:
        try:
            user = session.exec(select(AppUser).where(AppUser.id == int(uid))).first()
        except (TypeError, ValueError):
            user = None
    if user is None:
        # Tokens antiguos u otros clientes: solo llevaban `sub` (email)
        sub = str(payload.get("sub") or "").strip().lower()
        if not sub:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
        user = session.exec(select(AppUser).where(AppUser.email == sub)).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tu cuenta está desactivada. Contacta con administración.",
        )
    return user


def require_admin(user: AppUser = Depends(get_current_user)) -> AppUser:
    if user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return user


def require_premium_or_grace(user: AppUser = Depends(get_current_user)) -> AppUser:
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    if user.is_premium:
        return user
    if user.premium_grace_until and user.premium_grace_until > now:
        return user
    raise HTTPException(
        status_code=status.HTTP_402_PAYMENT_REQUIRED,
        detail="Contenido premium. Suscribete para acceso completo.",
    )

