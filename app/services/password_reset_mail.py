from __future__ import annotations

import json
import logging
from html import escape

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


def send_password_reset_email(to_email: str, reset_url: str) -> None:
    """
    Envía el correo vía SendGrid si SENDGRID_API_KEY y MAIL_FROM_EMAIL están en .env;
    si no, el enlace aparece solo en logs (servidor).
    SendGrid debe tener el remitente verificado (Sender Authentication).
    """
    safe_url = reset_url.strip()
    api_key = (settings.sendgrid_api_key or "").strip()
    from_email = (settings.mail_from_email or "").strip()
    from_name = (settings.mail_from_name or "CoreSpeak").strip() or "CoreSpeak"

    if not api_key and not from_email:
        logger.warning(
            "[password-reset] Correo NO enviado: define SENDGRID_API_KEY y MAIL_FROM_EMAIL "
            "(verificado en SendGrid). Reinicia uvicorn tras editar .env. "
            "Enlace para %s: %s",
            to_email,
            safe_url,
        )
        return
    if not api_key or not from_email:
        logger.warning(
            "[password-reset] Falta SENDGRID_API_KEY o MAIL_FROM_EMAIL (.env raíz proyecto). "
            "Enlace para %s: %s",
            to_email,
            safe_url,
        )
        return

    plain = (
        "Has solicitado restablecer tu contraseña en CoreSpeak.\n\n"
        f"Abre este enlace (caduca en unos minutos):\n{safe_url}\n\n"
        "Si no lo pediste tú, ignora este mensaje."
    )

    body_html = (
        "<p>Hola,</p>"
        "<p>Has solicitado restablecer tu contraseña en CoreSpeak. "
        "Pulsa el enlace (caduca pronto):</p>"
        f'<p><a href="{escape(safe_url)}">Restablecer contraseña</a></p>'
        "<p>Si no has sido tú, ignora este mensaje.</p>"
    )

    payload = {
        "personalizations": [{"to": [{"email": str(to_email).strip()}]}],
        "from": {"email": from_email, "name": from_name},
        "subject": "Restablecer contraseña · CoreSpeak",
        "content": [
            {"type": "text/plain", "value": plain},
            {"type": "text/html", "value": body_html},
        ],
    }

    try:
        r = httpx.post(
            "https://api.sendgrid.com/v3/mail/send",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json=payload,
            timeout=20.0,
        )
        if r.status_code in (200, 202):
            mid = r.headers.get("X-Message-Id") or r.headers.get("x-message-id") or "(sin id)"
            # WARNING para que siempre salga en consola aunque INFO esté oculto.
            logger.warning(
                "[password-reset] SendGrid aceptó el envío a destinatario '%s' (HTTP %s, X-Message-Id=%s). "
                "Si no ves el mensaje: carpeta spam, bloqueos del proveedor, y en SendGrid: Activity.",
                to_email,
                r.status_code,
                mid,
            )
            return
        detail = _sendgrid_error_body(r)
        if r.status_code == 401:
            logger.error(
                "[password-reset] SendGrid 401: la API key en .env (SENDGRID_API_KEY) está mal, caducada o revocada. "
                "En SendGrid crea una clave nueva: Settings → API Keys → Create API Key (permiso Mail Send). "
                "Pega SG.... en .env y reinicia uvicorn. Detalle: %s",
                detail,
            )
        else:
            logger.error(
                "[password-reset] SendGrid rechazó el correo (HTTP %s). "
                "Revisa SENDGRID_API_KEY, MAIL_FROM_EMAIL verificado en Sender Authentication. Detalle: %s",
                r.status_code,
                detail,
            )
    except Exception:
        logger.exception(
            "[password-reset] Error de red con SendGrid. Enlace manual para %s: %s",
            to_email,
            safe_url,
        )


def _sendgrid_error_body(r: httpx.Response) -> str:
    txt = r.text.strip()[:2000]
    try:
        return json.dumps(json.loads(txt), ensure_ascii=False)
    except (json.JSONDecodeError, ValueError):
        return txt or "(vacío)"
