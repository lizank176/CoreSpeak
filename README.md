# CoreSpeak

CoreSpeak es una plataforma de aprendizaje de idiomas (estilo Duolingo) con backend en FastAPI, frontend web en HTML/CSS/JS y base de datos MySQL.

Este README documenta el estado actual del proyecto.

## Estado actual del proyecto

### Funcionalidades implementadas

- Registro e inicio de sesión con JWT.
- Hash de contraseñas con PBKDF2 (`passlib`).
- Flujo postregistro con formulario de perfil (`profile_setup`) para personalización:
  - Idioma de interfaz.
  - Idioma nativo.
  - Idioma objetivo.
  - Intereses.
  - Ocupación.
- Dashboard con:
  - Bloque premium.
  - Racha y XP.
  - Mis cursos (según selección del usuario).
  - Otros cursos (catálogo base).
- Catálogo base activo de idiomas:
  - Inglés (`en`)
  - Ucraniano (`uk`)
  - Francés (`fr`)
  - Español (`es`)
- Relación usuario-idioma mediante `enrollments`, sincronizada automáticamente.
- Control freemium:
  - Usuario no premium: solo cursos seleccionados.
  - Usuario premium: acceso a todos los cursos.
  - Bloqueo en backend de acceso directo por URL a cursos/lecciones no permitidos.
- Reto diario con IA (Groq + fallback local).
- Validación semántica de respuestas.
- Gamificación:
  - XP por reto.
  - Racha por días consecutivos.
  - Si falla un ejercicio, la racha se reinicia y se devuelve un mensaje triste.
- Módulo de administración:
  - Estadísticas.
  - Árbol curso > nivel > lecciones.
  - Creación de lecciones/ejercicios.
- Pagos con Stripe real:
  - Checkout.
  - Webhooks verificados por firma.
  - Idempotencia de eventos (`stripe_webhook_events`).
  - Estado de suscripción y portal.
- Seguridad reforzada:
  - API protegida por JWT por defecto (excepto auth, health y webhook Stripe).
  - CORS habilitado.
  - Registro de consentimiento (`consent_timestamp`).
- UI:
  - Ojo para mostrar/ocultar contraseña y confirmar contraseña.
  - Botón premium movido al dashboard.
  - Chat flotante global eliminado por completo.
  - Idioma de interfaz alemán eliminado.

## Arquitectura y stack

- **Backend:** FastAPI, SQLModel, Pydantic.
- **Base de datos:** MySQL 8 (Docker Compose).
- **Frontend:** HTML + Bootstrap + JavaScript vanilla, servido en `/ui`.
- **IA:** Groq API (`app/services/ai/groq_service.py`) con fallback local.
- **Autenticación:** JWT (`python-jose`) + `passlib` PBKDF2.
- **Pagos:** Stripe SDK + webhooks.

## Estructura principal

- `app/web.py`: creación de la app FastAPI, middlewares, routers y endpoints base.
- `app/models.py`: modelos SQLModel.
- `app/db.py`: engine, sesiones, init/migraciones ligeras y seeds.
- `app/security.py`: hashing y verificación JWT/password.
- `app/dependencies.py`: dependencias de auth/roles.
- `app/api/auth.py`: registro, login, perfil y profile setup.
- `app/api/challenges.py`: reto diario, envío de respuesta, racha/xp.
- `app/api/courses.py`: catálogo/cursos/lecciones y restricciones freemium.
- `app/api/billing.py`: pricing, checkout, portal, webhooks e historial.
- `app/api/admin.py`: endpoints administrativos.
- `frontend/`: pantallas web y `app.js`.
- `infra/mysql/init.sql`: inicialización de MySQL.
- `docker-compose.yml`: servicio MySQL local.

## Modelo de datos (resumen)

Tablas principales:

- `users`
- `language_courses`
- `course_levels`
- `lessons`
- `lesson_exercises`
- `enrollments`
- `lesson_attempts`
- `daily_challenges`
- `billing_records`
- `stripe_webhook_events`

Campos importantes operativos:

- `users.is_premium`
- `users.subscription_status`
- `users.subscription_id`
- `users.customer_id`
- `users.expiry_date`
- `users.premium_grace_until`
- `users.ui_language`
- `users.target_languages_json`
- `users.current_levels_json`
- `users.interests_json`
- `users.consent_timestamp`
- `users.streak_days`
- `users.xp_total`

## Seguridad aplicada actualmente

- Bloqueo de API sin token JWT.
- Validación de firma Stripe en webhooks.
- Idempotencia de eventos Stripe.
- No se guardan contraseñas en texto plano.
- Hash de contraseña con salt (PBKDF2).
- Restricción de rutas premium en backend (no solo en UI).

## Endpoints relevantes

### Salud
- `GET /`
- `GET /api/health`

### Auth
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/profile-setup`

### Cursos y catálogo
- `GET /api/catalog/courses`
- `GET /api/catalog/courses/{course_id}/lessons`
- `GET /api/catalog/lessons/{lesson_id}`
- `GET /api/users/me/profile`
- `GET /api/users/{user_id}/progress`

### Retos
- `GET /api/challenges/daily`
- `POST /api/challenges/{challenge_id}/submit`

### Billing / premium
- `GET /api/billing/pricing`
- `GET /api/billing/subscription-status`
- `POST /api/billing/checkout`
- `POST /api/billing/portal`
- `POST /api/billing/webhooks/stripe`
- `GET /api/billing/history`

### Admin
- `GET /api/admin/dashboard`
- `GET /api/admin/course-tree`
- `POST /api/admin/lessons`

## Cómo ejecutar en local

1. Crear/activar entorno virtual e instalar dependencias:

```powershell
.\venv\Scripts\python.exe -m pip install -r requirements.txt
```

2. Levantar MySQL:

```powershell
docker compose up -d mysql
```

3. Configurar `.env`:

- `DATABASE_URL` (ejemplo actual: puerto `3307`).
- `JWT_SECRET_KEY`.
- `GROQ_API_KEY` (opcional; existe fallback local).
- Stripe:
  - `STRIPE_SECRET_KEY`
  - `STRIPE_WEBHOOK_SECRET`
  - `STRIPE_PRICE_ID_MONTHLY`
  - `STRIPE_SUCCESS_URL` (opcional)
  - `STRIPE_CANCEL_URL` (opcional)

4. Levantar API:

```powershell
.\venv\Scripts\python.exe -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

5. Abrir frontend:

- `http://127.0.0.1:8000/ui/inicio_session.html`
- `http://127.0.0.1:8000/ui/dashboard.html`
- `http://127.0.0.1:8000/pricing`

## Pruebas recomendadas (smoke test)

- Registro -> profile setup -> login -> dashboard.
- Verificar cursos en "Mis cursos" según selección de usuario.
- Verificar bloqueo de cursos no elegidos para usuario basic.
- Subir a premium y verificar acceso a todos los cursos.
- Completar reto diario y comprobar:
  - XP.
  - Racha.
  - Reinicio de racha al fallo.
- Ejecutar checkout Stripe de prueba y validar webhook.

## Pendientes / mejoras sugeridas

- Migrar autenticación frontend de `localStorage` a cookie HttpOnly para blindaje total de rutas UI.
- Agregar tests automatizados (unitarios + integración).
- Crear migraciones formales (Alembic) en lugar de ajustes ligeros en startup.
- Internacionalización avanzada en backend y mensajes de API.
