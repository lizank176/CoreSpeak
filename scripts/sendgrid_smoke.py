#!/usr/bin/env python3
"""
Prueba directa contra la API REST de SendGrid usando el .env del proyecto.
Comprueba clave API y remitente sin pasar por CoreSpeak.

  python scripts/sendgrid_smoke.py destinatario@ejemplo.com

Si falla con 403, revisa Sender Authentication en SendGrid (el MAIL_FROM debe estar verificado).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

# Raíz del repo (directorio padre de scripts/)
_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

import httpx  # noqa: E402

from app.config import settings  # noqa: E402


def main() -> int:
    to = (sys.argv[1] if len(sys.argv) > 1 else "").strip()
    if not to or "@" not in to:
        print("Uso: python scripts/sendgrid_smoke.py TU_EMAIL_DESTINO", file=sys.stderr)
        return 2

    key = (settings.sendgrid_api_key or "").strip()
    frm = (settings.mail_from_email or "").strip()
    name = (settings.mail_from_name or "CoreSpeak").strip()

    print("sendgrid_api_key:", "OK (starts SG.)" if key.startswith("SG.") else ("MISSING/" + repr(key[:12])))
    print("mail_from_email:", frm or "(vacío)")
    print("Probando envío de prueba a:", to)

    if not key or not frm:
        print("ERROR: SENDGRID_API_KEY y MAIL_FROM_EMAIL deben estar en .env")
        return 1

    body = "<p>Este es un correo de prueba de CoreSpeak / SendGrid. Si llegó, tu clave y remitente están bien configurados.</p>"
    payload = {
        "personalizations": [{"to": [{"email": to}]}],
        "from": {"email": frm, "name": name},
        "subject": "Prueba SendGrid CoreSpeak",
        "content": [{"type": "text/html", "value": body}],
    }

    try:
        r = httpx.post(
            "https://api.sendgrid.com/v3/mail/send",
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json=payload,
            timeout=20.0,
        )
        print("HTTP", r.status_code)
        mid = r.headers.get("X-Message-Id") or r.headers.get("x-message-id") or "(n/a)"
        print("X-Message-Id:", mid)
        if r.text.strip():
            try:
                print(json.dumps(json.loads(r.text), ensure_ascii=False, indent=2))
            except json.JSONDecodeError:
                print(r.text[:1200])
        if r.status_code in (200, 202):
            print("SendGrid indicó OK. Revisa la bandeja y spam.")
            return 0
        print("SendGrid rechazó el envío. Arriba el cuerpo de error.")
        return 1
    except Exception as e:
        print("Error HTTP:", e)
        return 1


if __name__ == "__main__":
    sys.exit(main())
