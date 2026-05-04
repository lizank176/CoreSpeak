"""Entrypoint para ejecutar la API con Uvicorn."""

import logging
import sys

# Evita que uvicorn deje los loggers `app.*` sin ver (solo WARNING).
_bc_kw: dict = {
    "level": logging.INFO,
    "format": "%(levelname)s %(name)s: %(message)s",
}
if sys.version_info >= (3, 10):
    _bc_kw["force"] = True  # reconfigura aunque uvicorn haya inicializado handlers
logging.basicConfig(**_bc_kw)

from app.web import app

__all__ = ["app"]

