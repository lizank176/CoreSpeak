from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.db import get_session
from app.dependencies import get_current_user
from app.config import settings
from app.models import AppUser
from app.schemas import LoginRequest, ProfileSetupRequest, RegisterRequest, TokenResponse, UserProfileResponse
from app.security import create_access_token, hash_password, verify_password
from app.services.enrollment_service import sync_user_enrollments

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse)
def register(payload: RegisterRequest, session: Session = Depends(get_session)) -> TokenResponse:
    existing = session.exec(select(AppUser).where(AppUser.email == payload.email)).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email ya registrado")
    if not payload.accepted_terms:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Debes aceptar terminos y privacidad")

    user = AppUser(
        email=payload.email.lower(),
        full_name=payload.full_name.strip(),
        password_hash=hash_password(payload.password),
        ui_language=payload.ui_language,
        native_language=payload.native_language,
        target_languages_json={"languages": payload.target_languages},
        current_levels_json=payload.current_levels,
        interests_json=payload.interests,
        occupation=payload.occupation,
        consent_timestamp=datetime.utcnow(),
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    sync_user_enrollments(session, user)
    session.commit()

    token = create_access_token(subject=user.email, extra_claims={"uid": user.id})
    return TokenResponse(access_token=token, expires_in_minutes=settings.jwt_access_token_minutes)


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, session: Session = Depends(get_session)) -> TokenResponse:
    user = session.exec(select(AppUser).where(AppUser.email == payload.email.lower())).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciales invalidas")
    token = create_access_token(subject=user.email, extra_claims={"uid": user.id})
    return TokenResponse(access_token=token, expires_in_minutes=settings.jwt_access_token_minutes)


@router.get("/me", response_model=UserProfileResponse)
def me(user: AppUser = Depends(get_current_user)) -> UserProfileResponse:
    return UserProfileResponse.model_validate(user)


@router.post("/profile-setup", response_model=UserProfileResponse)
def profile_setup(
    payload: ProfileSetupRequest,
    session: Session = Depends(get_session),
    user: AppUser = Depends(get_current_user),
) -> UserProfileResponse:
    user.ui_language = payload.ui_language
    user.native_language = payload.native_language
    user.target_languages_json = {"languages": payload.target_languages}
    user.current_levels_json = payload.current_levels
    user.interests_json = payload.interests
    user.occupation = payload.occupation
    user.updated_at = datetime.utcnow()
    session.add(user)
    sync_user_enrollments(session, user)
    session.commit()
    session.refresh(user)
    return UserProfileResponse.model_validate(user)

