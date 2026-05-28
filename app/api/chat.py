from __future__ import annotations

from fastapi import APIRouter, Depends

from app.cefr import normalize_cefr_level
from app.constants import PRIMARY_COURSE_CODE
from app.dependencies import require_premium_or_grace
from app.models import AppUser
from app.schemas import TutorChatRequest, TutorChatResponse
from app.services.ai.groq_service import build_premium_tutor_reply

router = APIRouter(prefix="/api/chat", tags=["chat"])


def _preferred_level(user: AppUser, requested_level: str | None) -> str:
    if requested_level:
        return normalize_cefr_level(requested_level)
    raw_levels = user.current_levels_json if isinstance(user.current_levels_json, dict) else {}
    level_code = raw_levels.get(PRIMARY_COURSE_CODE) or raw_levels.get("en")
    if level_code:
        return normalize_cefr_level(str(level_code))
    return "A1"


@router.post("/tutor", response_model=TutorChatResponse)
def tutor_chat(
    payload: TutorChatRequest,
    user: AppUser = Depends(require_premium_or_grace),
) -> TutorChatResponse:
    reply = build_premium_tutor_reply(
        payload.user_message,
        native_language=user.native_language or "es",
        ui_language=user.ui_language or user.native_language or "es",
        target_language=payload.lang or "en",
        level_code=_preferred_level(user, payload.level),
        topic=payload.topic,
        history=[{"role": item.role, "content": item.content} for item in payload.history],
    )
    return TutorChatResponse(**reply)
