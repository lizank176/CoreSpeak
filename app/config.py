from __future__ import annotations

from pathlib import Path

from dotenv import load_dotenv
from pydantic_settings import BaseSettings, SettingsConfigDict

# Ruta fija al .env del proyecto; override=True evita que variables del SO/sesión
# silencien USE_SQLITE y DATABASE_URL al desarrollar sin MySQL.
_ROOT = Path(__file__).resolve().parents[1]
_ENV_FILE = _ROOT / ".env"
load_dotenv(_ENV_FILE, override=True)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=_ENV_FILE, env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Core Speak API"
    app_env: str = "development"
    app_debug: bool = True
    app_base_url: str = "http://127.0.0.1:8000"

    # Si es true, se ignora MySQL y se usa un SQLite en ./data/corespeak.db (dev sin Docker).
    use_sqlite: bool = False

    database_url: str = "mysql+pymysql://corespeak:corespeak@localhost:3306/corespeak"

    jwt_secret_key: str = "change-me"
    jwt_algorithm: str = "HS256"
    jwt_access_token_minutes: int = 60
    password_reset_expire_minutes: int = 15

    # Recuperación de contraseña vía SendGrid (opcional). Sin clave/remitente, solo log con el enlace (dev).
    sendgrid_api_key: str | None = None
    mail_from_email: str = ""
    mail_from_name: str = "CoreSpeak"

    groq_api_key: str | None = None
    groq_base_url: str = "https://api.groq.com/openai/v1"
    groq_model: str = "llama-3.3-70b-versatile"

    stripe_secret_key: str | None = None
    stripe_webhook_secret: str | None = None
    stripe_price_id_monthly: str | None = None
    stripe_success_url: str | None = None
    stripe_cancel_url: str | None = None


settings = Settings()

