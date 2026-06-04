"""Almacenamiento local de imágenes y audio subidos desde el panel admin."""

from __future__ import annotations

import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile, status

_ROOT = Path(__file__).resolve().parents[2]
UPLOAD_DIR = _ROOT / "data" / "uploads"

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
AUDIO_EXTENSIONS = {".mp3", ".wav", ".ogg", ".m4a", ".aac", ".webm"}
IMAGE_MAX_BYTES = 5 * 1024 * 1024
AUDIO_MAX_BYTES = 15 * 1024 * 1024

MIME_TO_EXT: dict[str, str] = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "audio/mpeg": ".mp3",
    "audio/mp3": ".mp3",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/ogg": ".ogg",
    "audio/webm": ".webm",
    "audio/mp4": ".m4a",
    "audio/aac": ".aac",
}


def ensure_upload_dir() -> Path:
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    return UPLOAD_DIR


def _safe_ext(filename: str | None, content_type: str | None, allowed: set[str]) -> str:
    ext = ""
    if filename:
        ext = Path(filename).suffix.lower()
    if ext in allowed:
        return ext
    if content_type:
        mapped = MIME_TO_EXT.get(content_type.split(";", 1)[0].strip().lower())
        if mapped and mapped in allowed:
            return mapped
    return ""


async def save_lesson_media(file: UploadFile, kind: str) -> str:
    """Guarda un archivo y devuelve la ruta pública `/media/uploads/...`."""
    kind_norm = (kind or "").strip().lower()
    if kind_norm == "image":
        allowed = IMAGE_EXTENSIONS
        max_bytes = IMAGE_MAX_BYTES
    elif kind_norm == "audio":
        allowed = AUDIO_EXTENSIONS
        max_bytes = AUDIO_MAX_BYTES
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tipo no válido (image o audio).")

    ext = _safe_ext(file.filename, file.content_type, allowed)
    if not ext:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Formato no permitido. Imagen: jpg, png, gif, webp. Audio: mp3, wav, ogg, m4a.",
        )

    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Archivo vacío.")
    if len(raw) > max_bytes:
        limit_mb = max_bytes // (1024 * 1024)
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Archivo demasiado grande (máximo {limit_mb} MB).",
        )

    dest_dir = ensure_upload_dir()
    name = f"{kind_norm}_{uuid.uuid4().hex}{ext}"
    dest = dest_dir / name
    dest.write_bytes(raw)

    return f"/media/uploads/{name}"
