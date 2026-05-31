from __future__ import annotations

from datetime import datetime
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.cefr import normalize_cefr_level
from app.interest_catalog import coerce_interests_list
from app.models import ExerciseType


class RegisterRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    accepted_terms: bool = True

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, value: str) -> str:
        has_digit = any(ch.isdigit() for ch in value)
        has_symbol = any(not ch.isalnum() for ch in value)
        if not (has_digit and has_symbol):
            raise ValueError("Password debe incluir al menos un numero y un simbolo")
        return value


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=20, max_length=4096)
    password: str = Field(min_length=8, max_length=128)

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, value: str) -> str:
        has_digit = any(ch.isdigit() for ch in value)
        has_symbol = any(not ch.isalnum() for ch in value)
        if not (has_digit and has_symbol):
            raise ValueError("Password debe incluir al menos un numero y un simbolo")
        return value


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in_minutes: int
    user_id: int | None = None


class UserProfileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    full_name: str
    email: EmailStr
    ui_language: str
    native_language: str
    target_languages_json: dict
    current_levels_json: dict
    interests_json: list
    occupation: str | None
    interested_in_premium: bool
    is_premium: bool
    role: str = "user"
    expiry_date: datetime | None
    streak_days: int
    xp_total: int
    completed_challenges: int = 0
    completed_challenges_current_level: int = 0
    consent_timestamp: datetime


class ProfileSetupRequest(BaseModel):
    ui_language: str = Field(default="es", min_length=2, max_length=12)
    interests: list[str] = Field(default_factory=list, max_length=10)
    interested_in_premium: bool = False
    # Nivel de inglés (CEFR) — se guarda en current_levels_json["en"] y define el reto diario.
    english_level: str = Field(default="A1", max_length=4)

    @field_validator("interests", mode="before")
    @classmethod
    def _normalize_interests_ids(cls, v: object) -> list[str]:
        if v is None:
            return []
        if isinstance(v, str):
            return coerce_interests_list([v])
        if isinstance(v, list):
            return coerce_interests_list(v)
        return coerce_interests_list([str(v)])

    @field_validator("english_level", mode="before")
    @classmethod
    def _validate_english_level(cls, v: object) -> str:
        return normalize_cefr_level(str(v) if v is not None else "A1")


class OnboardingSaveRequest(BaseModel):
    """Test inicial opcional: curso principal siempre inglés."""

    ocupacion: str | None = Field(default=None, max_length=120)
    niveles_actuales: dict[str, str] = Field(default_factory=dict)


class ExtraLanguagesRequest(BaseModel):
    language_codes: list[str] = Field(default_factory=list)


class DisplayNamePatchRequest(BaseModel):
    """Nombre y apellido en UI; se unen en un solo full_name en BD."""

    first_name: str = Field(default="", max_length=80)
    last_name: str = Field(default="", max_length=80)


class EnglishLevelPatchRequest(BaseModel):
    """Nivel MCER/CEFR del curso principal (inglés); afecta al generador del reto diario."""

    english_level: str = Field(default="A1", max_length=4)

    @field_validator("english_level", mode="before")
    @classmethod
    def _validate_english_level(cls, v: object) -> str:
        return normalize_cefr_level(str(v) if v is not None else "A1")


class LessonExerciseInput(BaseModel):
    exercise_type: ExerciseType
    prompt: str = Field(min_length=3, max_length=1500)
    options_json: dict = Field(default_factory=dict)
    correct_answer: str | None = None
    model_answer: str | None = None
    points: int = 10

    @field_validator("correct_answer")
    @classmethod
    def require_correct_answer(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            raise ValueError("correct_answer no puede ir vacio")
        return value


class CreateLessonRequest(BaseModel):
    course_id: int
    level_id: int
    title: str = Field(min_length=3, max_length=200)
    description: str | None = Field(default=None, max_length=1000)
    is_premium: bool = False
    is_published: bool = False
    video_url: str | None = Field(default=None, max_length=400)
    image_url: str | None = Field(default=None, max_length=400)
    audio_url: str | None = Field(default=None, max_length=400)
    video_transcript: str | None = Field(default=None, max_length=12000)
    exercises: list[LessonExerciseInput] = Field(default_factory=list)


class ChallengeResponse(BaseModel):
    id: int
    scenario: str
    task_prompt: str
    expected_solution_hint: str
    time_limit_seconds: int = 300


class ChallengeSubmitRequest(BaseModel):
    answer: str = Field(min_length=1, max_length=2500)


class ChallengeResultResponse(BaseModel):
    is_correct_semantically: bool
    semantic_score: float
    corrective_feedback: str
    xp_awarded: int
    streak_days: int
    streak_message: str | None = None
    # Enviar true si el reto ya estaba calificado: no se suma XP; evita toasts "correcto +0 XP".
    repeat_submission: bool = False


class LessonExerciseSubmitRequest(BaseModel):
    exercise_index: int = Field(ge=0, le=500)
    answer: str | None = Field(default=None, max_length=2000)
    selected: list[str] = Field(default_factory=list, max_length=20)


class LessonExerciseResultResponse(BaseModel):
    is_correct: bool
    xp_awarded: int
    xp_total: int
    streak_days: int
    streak_message: str | None = None
    repeat_submission: bool = False
    feedback: str


class LearningActivityResponse(BaseModel):
    streak_days: int
    xp_total: int
    streak_message: str


class TutorChatMessage(BaseModel):
    role: str = Field(min_length=1, max_length=20)
    content: str = Field(min_length=1, max_length=4000)


class TutorChatRequest(BaseModel):
    lang: str = Field(default="en", min_length=2, max_length=12)
    level: str = Field(default="B1", min_length=2, max_length=4)
    user_message: str = Field(min_length=1, max_length=3000)
    topic: str | None = Field(default=None, max_length=2500)
    history: list[TutorChatMessage] = Field(default_factory=list, max_length=16)

    @field_validator("level")
    @classmethod
    def normalize_level(cls, value: str) -> str:
        return normalize_cefr_level(value)


class TutorChatResponse(BaseModel):
    chat_response: str
    translation_hint: str | None = None
    explanation: str | None = None
    next_micro_challenge: str | None = None
    corrections: list[str] = Field(default_factory=list)
    new_vocabulary: list[str] = Field(default_factory=list)


class CheckoutRequest(BaseModel):
    provider: str = "stripe"


class CheckoutResponse(BaseModel):
    checkout_url: str
    provider: str
    message: str


class PortalResponse(BaseModel):
    portal_url: str
    message: str


class PricingResponse(BaseModel):
    free_plan: dict
    premium_plan: dict


class SubscriptionStatusResponse(BaseModel):
    is_premium: bool
    subscription_status: str
    subscription_id: str | None
    customer_id: str | None
    expiry_date: datetime | None
    premium_grace_until: datetime | None
    cancel_at_period_end: bool = False


class CancelSubscriptionResponse(BaseModel):
    message: str
    cancel_at_period_end: bool = True
    access_until: datetime | None = None
    subscription_status: str


class DeleteAccountResponse(BaseModel):
    message: str

