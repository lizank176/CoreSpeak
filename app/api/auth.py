"""Autenticación y perfil de usuario.

Incluye registro/login, perfil actual y recuperación de contraseña.
"""

from __future__ import annotations

import logging
from datetime import datetime
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, status

from sqlmodel import Session, select

from app.db import get_session

logger = logging.getLogger(__name__)
from app.dependencies import get_current_user
from app.config import settings
from app.constants import PRIMARY_COURSE_CODE
from app.cefr import normalize_cefr_level
from app.models import AppUser, ChallengeStatus, DailyChallenge
from app.schemas import (
    ForgotPasswordRequest,
    LoginRequest,
    ProfileSetupRequest,
    RegisterRequest,
    ResetPasswordRequest,
    TokenResponse,
    UserProfileResponse,
)
from app.security import (
    create_access_token,
    create_password_reset_token,
    decode_password_reset_token,
    hash_password,
    verify_password,
)
from app.services.password_reset_mail import send_password_reset_email
from app.services.enrollment_service import sync_user_enrollments
from app.interest_catalog import coerce_interests_list
from app.user_languages import merge_premium_language_codes

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _completed_challenges_count(session: Session, user_id: int) -> int:
    return len(
        session.exec(
            select(DailyChallenge).where(
                DailyChallenge.user_id == user_id,
                DailyChallenge.status == ChallengeStatus.COMPLETED,
            )
        ).all()
    )


def _resolve_user_english_level(user: AppUser) -> str:
    """Obtiene nivel CEFR principal (inglés) desde JSON de niveles del usuario."""
    raw_levels = user.current_levels_json if isinstance(user.current_levels_json, dict) else {}
    code = raw_levels.get(PRIMARY_COURSE_CODE) or raw_levels.get("en")
    if not code and raw_levels:
        fv = next(iter(raw_levels.values()), None)
        code = str(fv).strip() if fv is not None else None
    return normalize_cefr_level(str(code) if code else "A1")


def _completed_challenges_count_for_level(session: Session, user_id: int, level_code: str) -> int:
    return len(
        session.exec(
            select(DailyChallenge).where(
                DailyChallenge.user_id == user_id,
                DailyChallenge.status == ChallengeStatus.COMPLETED,
                DailyChallenge.level_code == normalize_cefr_level(level_code),
            )
        ).all()
    )


@router.post("/register", response_model=TokenResponse)
def register(payload: RegisterRequest, session: Session = Depends(get_session)) -> TokenResponse:
    """Crea usuario nuevo y devuelve JWT de sesión inicial."""
    email_norm = payload.email.lower().strip()
    existing = session.exec(select(AppUser).where(AppUser.email == email_norm)).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Este correo ya está registrado. Inicia sesión o usa otro email.",
        )
    if not payload.accepted_terms:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Debes aceptar terminos y privacidad")

    user = AppUser(
        email=email_norm,
        full_name=payload.full_name.strip(),
        password_hash=hash_password(payload.password),
        ui_language="es",
        native_language="es",
        target_languages_json={"languages": [PRIMARY_COURSE_CODE]},
        current_levels_json={PRIMARY_COURSE_CODE: "A1"},
        interests_json=[],
        occupation=None,
        interested_in_premium=False,
        consent_timestamp=datetime.utcnow(),
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    sync_user_enrollments(session, user)
    session.commit()

    token = create_access_token(subject=user.email, extra_claims={"uid": user.id})
    return TokenResponse(
        access_token=token,
        expires_in_minutes=settings.jwt_access_token_minutes,
        user_id=user.id,
    )


@router.post("/forgot-password")
def forgot_password(payload: ForgotPasswordRequest, session: Session = Depends(get_session)) -> dict[str, str]:
    """Genera y envía enlace de reset (respuesta neutra para no filtrar existencia)."""
    email_norm = str(payload.email).lower().strip()
    user = session.exec(select(AppUser).where(AppUser.email == email_norm)).first()
    if user:
        token = create_password_reset_token(email_norm)
        base = settings.app_base_url.rstrip("/")
        reset_url = f"{base}/ui/restablecer_contrasena.html?token={quote(token, safe='')}"
        # MAIL_FROM_* es solo el remitente en SendGrid; el destinatario es este email (tu cuenta).
        logger.warning("[password-reset] Cuenta encontrada; llamando SendGrid para destinatario %s", email_norm)
        send_password_reset_email(email_norm, reset_url)
    else:
        logger.warning(
            "[password-reset] Email no registrado en la base de datos — no se llama a SendGrid. "
            "En el formulario usa el mismo correo con el que te registraste.",
        )
    return {"message": "Si el correo existe, recibirás un enlace para restablecer la contraseña."}


@router.post("/reset-password")
def reset_password(payload: ResetPasswordRequest, session: Session = Depends(get_session)) -> dict[str, str]:
    """Aplica nueva contraseña validando token temporal de recuperación."""
    try:
        claims = decode_password_reset_token(payload.token.strip())
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El enlace no es válido o ha caducado. Solicita uno nuevo desde «Olvidé mi contraseña».",
        )
    email_norm = str(claims.get("sub") or "").lower().strip()
    user = session.exec(select(AppUser).where(AppUser.email == email_norm)).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El enlace no es válido o ha caducado. Solicita uno nuevo desde «Olvidé mi contraseña».",
        )
    user.password_hash = hash_password(payload.password)
    user.updated_at = datetime.utcnow()
    session.add(user)
    session.commit()
    return {"message": "Contraseña actualizada. Ya puedes iniciar sesión."}


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, session: Session = Depends(get_session)) -> TokenResponse:
    """Autentica credenciales y devuelve JWT."""
    user = session.exec(select(AppUser).where(AppUser.email == str(payload.email).lower().strip())).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciales invalidas")
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tu cuenta está desactivada. Contacta con administración.",
        )
    token = create_access_token(subject=user.email, extra_claims={"uid": user.id})
    return TokenResponse(
        access_token=token,
        expires_in_minutes=settings.jwt_access_token_minutes,
        user_id=user.id,
    )


@router.get("/me", response_model=UserProfileResponse)
def me(user: AppUser = Depends(get_current_user), session: Session = Depends(get_session)) -> UserProfileResponse:
    """Devuelve perfil actual enriquecido con progreso de retos."""
    data = UserProfileResponse.model_validate(user).model_dump()
    data["interests_json"] = coerce_interests_list(data.get("interests_json"))
    data["completed_challenges"] = _completed_challenges_count(session, int(user.id or 0))
    data["completed_challenges_current_level"] = _completed_challenges_count_for_level(
        session,
        int(user.id or 0),
        _resolve_user_english_level(user),
    )
    return UserProfileResponse.model_validate(data)


@router.post("/profile-setup", response_model=UserProfileResponse)
def profile_setup(
    payload: ProfileSetupRequest,
    session: Session = Depends(get_session),
    user: AppUser = Depends(get_current_user),
) -> UserProfileResponse:
    """Guarda configuración inicial de perfil y sincroniza enrollments."""
    user.ui_language = payload.ui_language
    user.native_language = payload.ui_language
    if user.is_premium:
        user.target_languages_json = {"languages": merge_premium_language_codes(user.target_languages_json)}
    else:
        user.target_languages_json = {"languages": [PRIMARY_COURSE_CODE]}

    en_level = normalize_cefr_level(payload.english_level)
    levels = dict(user.current_levels_json or {})
    levels[PRIMARY_COURSE_CODE] = en_level
    user.current_levels_json = levels

    user.interests_json = payload.interests
    user.interested_in_premium = payload.interested_in_premium
    user.occupation = None
    user.updated_at = datetime.utcnow()
    session.add(user)
    sync_user_enrollments(session, user)
    session.commit()
    session.refresh(user)
    data = UserProfileResponse.model_validate(user).model_dump()
    data["interests_json"] = coerce_interests_list(data.get("interests_json"))
    data["completed_challenges"] = _completed_challenges_count(session, int(user.id or 0))
    data["completed_challenges_current_level"] = _completed_challenges_count_for_level(
        session,
        int(user.id or 0),
        _resolve_user_english_level(user),
    )
    return UserProfileResponse.model_validate(data)

