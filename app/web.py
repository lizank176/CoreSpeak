from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from app.api.admin import router as admin_router
from app.api.auth import router as auth_router
from app.api.billing import router as billing_router
from app.api.challenges import router as challenge_router
from app.api.courses import catalog_router, router as courses_router, users_router
from app.config import settings
from app.db import init_db
from app.security import decode_access_token


def create_app() -> FastAPI:
    app = FastAPI(title=settings.app_name, version="0.1.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.on_event("startup")
    def on_startup() -> None:
        init_db()

    # Seguridad: por defecto, toda la API requiere JWT.
    # Excepciones: auth (login/registro), health y webhook Stripe (Stripe no envía JWT).
    PUBLIC_API_PREFIXES = (
        "/api/auth/",
    )
    PUBLIC_API_PATHS = {
        "/api/health",
        "/api/billing/webhooks/stripe",
    }

    @app.middleware("http")
    async def require_auth_for_api(request: Request, call_next):
        path = request.url.path or ""
        if path.startswith("/api/"):
            if path in PUBLIC_API_PATHS or any(path.startswith(p) for p in PUBLIC_API_PREFIXES):
                return await call_next(request)

            auth = request.headers.get("authorization") or ""
            if not auth.lower().startswith("bearer "):
                return JSONResponse(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    content={"detail": "Missing auth token"},
                )
            token = auth.split(" ", 1)[1].strip()
            try:
                payload = decode_access_token(token)
                if payload.get("uid") is None:
                    raise ValueError("Invalid token payload")
            except Exception:
                return JSONResponse(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    content={"detail": "Invalid token"},
                )

        return await call_next(request)

    @app.get("/")
    def healthcheck() -> dict[str, str]:
        return {"status": "ok", "service": "core-speak-backend", "env": settings.app_env}

    @app.get("/api/health")
    def api_health() -> dict[str, str]:
        return {"status": "ok", "api": "ready"}

    project_root = Path(__file__).resolve().parents[1]
    templates = Jinja2Templates(directory=str(project_root / "templates"))
    frontend_dir = project_root / "frontend"
    app.include_router(auth_router)
    app.include_router(admin_router)
    app.include_router(challenge_router)
    app.include_router(billing_router)
    app.include_router(courses_router)
    app.include_router(catalog_router)
    app.include_router(users_router)

    @app.get("/pricing")
    def pricing_page(request: Request):
        return templates.TemplateResponse(
            request=request,
            name="pricing.html",
            context={
                "free_plan": {"name": "Gratis", "price_eur_month": 0, "features": ["1 idioma", "2 lecciones/dia"]},
                "premium_plan": {
                    "name": "Premium",
                    "price_eur_month": 5,
                    "features": ["Ilimitado", "Feedback detallado IA", "Retos avanzados"],
                },
            },
        )

    if frontend_dir.exists():
        app.mount("/ui", StaticFiles(directory=str(frontend_dir)), name="ui")

    return app


app = create_app()

