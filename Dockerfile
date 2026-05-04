# Imagen lista para planes gratuitos tipo Render/Fly Railway (usa $PORT si existe).
# Dominio gratis: suele ser el subdominio del hosting (ej. xxx.onrender.com).
# BD gratis sin tarjeta: USE_SQLITE=true (datos se pueden PERDER si el disco es efímero;
# si necesitas datos estables gratis, Neon/Supabase Postgres + DATABASE_URL postgres).

FROM python:3.12-slim-bookworm

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH=/app

# Compilación de bcrypt/cryptography desde wheel o fuente (evita fallo "status 1" en Render).
RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc g++ libffi-dev libssl-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --upgrade pip setuptools wheel \
    && pip install --no-cache-dir -r requirements.txt

COPY main.py .
COPY app ./app
COPY frontend ./frontend
COPY templates ./templates
COPY infra ./infra

# Exec form avoids Docker JSONArgsRecommended warning; PORT lo inyecta Render/Fly.
CMD ["sh", "-c", "exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
