"""Planes mostrados en la API de facturación y en la página Jinja /pricing."""

from __future__ import annotations


def billing_pricing_payload() -> dict[str, dict]:
    return {
        "free_plan": {
            "name": "Gratis",
            "price_eur_month": 0,
            "features": [
                "1 idioma activo",
                "2 lecciones por día",
                "Retos básicos",
            ],
        },
        "premium_plan": {
            "name": "Premium",
            "price_eur_month": 5,
            "features": [
                "Idiomas ilimitados",
                "Feedback IA detallado",
                "Retos avanzados y contenido exclusivo",
                "Historial de facturación",
            ],
        },
    }
