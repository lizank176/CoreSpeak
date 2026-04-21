from __future__ import annotations

from datetime import datetime
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.models import ExerciseType


class RegisterRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    ui_language: str = Field(default="es", min_length=2, max_length=12)
    native_language: str = Field(min_length=2, max_length=12)
    target_languages: list[str] = Field(min_length=1)
    current_levels: dict[str, str] = Field(default_factory=dict)
    interests: list[str] = Field(default_factory=list)
    occupation: str | None = Field(default=None, max_length=120)
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


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in_minutes: int


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
    is_premium: bool
    expiry_date: datetime | None
    streak_days: int
    xp_total: int
    consent_timestamp: datetime


class ProfileSetupRequest(BaseModel):
    ui_language: str = Field(default="es", min_length=2, max_length=12)
    native_language: str = Field(min_length=2, max_length=12)
    target_languages: list[str] = Field(min_length=1)
    current_levels: dict[str, str] = Field(default_factory=dict)
    interests: list[str] = Field(default_factory=list)
    occupation: str | None = Field(default=None, max_length=120)


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

