from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from sqlmodel import JSON, Column, Field, SQLModel


class UserRole(str, Enum):
    USER = "user"
    ADMIN = "admin"


class ExerciseType(str, Enum):
    MULTIPLE_CHOICE = "multiple_choice"
    FILL_IN_THE_BLANK = "fill_in_the_blank"
    MEDIA_COMPREHENSION = "media_comprehension"


class ChallengeStatus(str, Enum):
    PENDING = "pending"
    COMPLETED = "completed"
    EXPIRED = "expired"


class PaymentProvider(str, Enum):
    STRIPE = "stripe"


class AppUser(SQLModel, table=True):
    __tablename__ = "users"

    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(index=True, unique=True, max_length=255)
    full_name: str = Field(max_length=120)
    password_hash: str = Field(max_length=255)

    ui_language: str = Field(max_length=12, default="es")
    native_language: str = Field(max_length=12, default="es")
    target_languages_json: dict = Field(default_factory=dict, sa_column=Column(JSON))
    current_levels_json: dict = Field(default_factory=dict, sa_column=Column(JSON))
    interests_json: list = Field(default_factory=list, sa_column=Column(JSON))
    occupation: Optional[str] = Field(default=None, max_length=120)

    is_premium: bool = Field(default=False, index=True)
    subscription_id: Optional[str] = Field(default=None, max_length=255, index=True)
    subscription_status: str = Field(default="inactive", max_length=40, index=True)
    customer_id: Optional[str] = Field(default=None, max_length=255, index=True)
    expiry_date: Optional[datetime] = Field(default=None)
    premium_grace_until: Optional[datetime] = Field(default=None)

    xp_total: int = Field(default=0)
    streak_days: int = Field(default=0)
    last_active_at: Optional[datetime] = Field(default=None)

    consent_timestamp: datetime = Field(default_factory=datetime.utcnow)
    role: UserRole = Field(default=UserRole.USER, max_length=24)

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class LanguageCourse(SQLModel, table=True):
    __tablename__ = "language_courses"

    id: Optional[int] = Field(default=None, primary_key=True)
    language_code: str = Field(index=True, max_length=10)
    language_name: str = Field(max_length=60)
    description: Optional[str] = Field(default=None, max_length=400)
    is_active: bool = Field(default=True, index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class CourseLevel(SQLModel, table=True):
    __tablename__ = "course_levels"

    id: Optional[int] = Field(default=None, primary_key=True)
    course_id: int = Field(foreign_key="language_courses.id", index=True)
    level_code: str = Field(max_length=4, index=True)  # A1..C1
    title: str = Field(max_length=120)
    description: Optional[str] = Field(default=None, max_length=300)
    position: int = Field(default=1)


class Lesson(SQLModel, table=True):
    __tablename__ = "lessons"

    id: Optional[int] = Field(default=None, primary_key=True)
    course_id: int = Field(foreign_key="language_courses.id", index=True)
    level_id: int = Field(foreign_key="course_levels.id", index=True)

    title: str = Field(max_length=200)
    description: Optional[str] = Field(default=None, max_length=1000)
    is_premium: bool = Field(default=False, index=True)
    is_published: bool = Field(default=False, index=True)

    video_url: Optional[str] = Field(default=None, max_length=400)
    image_url: Optional[str] = Field(default=None, max_length=400)
    audio_url: Optional[str] = Field(default=None, max_length=400)

    content_json: dict = Field(default_factory=dict, sa_column=Column(JSON))
    created_by_admin_id: Optional[int] = Field(default=None, foreign_key="users.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class LessonExercise(SQLModel, table=True):
    __tablename__ = "lesson_exercises"

    id: Optional[int] = Field(default=None, primary_key=True)
    lesson_id: int = Field(foreign_key="lessons.id", index=True)
    exercise_type: ExerciseType = Field(max_length=40, index=True)
    prompt: str = Field(max_length=1500)

    # Multiple choice options, metadata or extra instructions.
    options_json: dict = Field(default_factory=dict, sa_column=Column(JSON))

    # Exact answer for fill-the-blank or selected option key.
    correct_answer: Optional[str] = Field(default=None, max_length=1000)

    # Semantic reference answer for open comprehension.
    model_answer: Optional[str] = Field(default=None, max_length=2000)
    position: int = Field(default=1)
    points: int = Field(default=10)


class Enrollment(SQLModel, table=True):
    __tablename__ = "enrollments"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    course_id: int = Field(foreign_key="language_courses.id", index=True)
    is_primary_course: bool = Field(default=False)
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class LessonAttempt(SQLModel, table=True):
    __tablename__ = "lesson_attempts"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    lesson_id: int = Field(foreign_key="lessons.id", index=True)
    score: int = Field(default=0)
    errors_json: list = Field(default_factory=list, sa_column=Column(JSON))
    completed_at: datetime = Field(default_factory=datetime.utcnow, index=True)


class DailyChallenge(SQLModel, table=True):
    __tablename__ = "daily_challenges"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)

    challenge_date: datetime = Field(default_factory=datetime.utcnow, index=True)
    language_code: str = Field(max_length=10, index=True)
    level_code: str = Field(max_length=4, index=True)
    interest_context: Optional[str] = Field(default=None, max_length=180)

    scenario: str = Field(max_length=1000)
    task_prompt: str = Field(max_length=1000)
    expected_solution: str = Field(max_length=2000)

    user_answer: Optional[str] = Field(default=None, max_length=2500)
    semantic_score: Optional[float] = Field(default=None)
    corrective_feedback: Optional[str] = Field(default=None, max_length=2000)
    grammar_error_key: Optional[str] = Field(default=None, max_length=120)

    time_limit_seconds: int = Field(default=300)
    xp_awarded: int = Field(default=20)
    status: ChallengeStatus = Field(default=ChallengeStatus.PENDING, max_length=24)
    source_model: str = Field(default="deepseek-chat", max_length=60)

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class BillingRecord(SQLModel, table=True):
    __tablename__ = "billing_records"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    provider: PaymentProvider = Field(max_length=24)
    subscription_id: Optional[str] = Field(default=None, max_length=255, index=True)
    customer_id: Optional[str] = Field(default=None, max_length=255, index=True)

    amount_cents: int = Field(default=0)
    currency: str = Field(default="EUR", max_length=8)
    status: str = Field(default="pending", max_length=40, index=True)
    paid_at: Optional[datetime] = Field(default=None)
    expires_at: Optional[datetime] = Field(default=None)

    raw_payload_json: dict = Field(default_factory=dict, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=datetime.utcnow)


class StripeWebhookEvent(SQLModel, table=True):
    __tablename__ = "stripe_webhook_events"

    id: Optional[int] = Field(default=None, primary_key=True)
    event_id: str = Field(index=True, unique=True, max_length=255)
    event_type: str = Field(max_length=80, index=True)
    processed_at: datetime = Field(default_factory=datetime.utcnow, index=True)

