# CoreSpeak

CoreSpeak es una plataforma de aprendizaje de idiomas (estilo Duolingo) con backend en FastAPI, frontend web en HTML/CSS/JS y base de datos MySQL.

Este README documenta el estado actual del proyecto hasta este momento.

## Estado actual del proyecto

### Funcionalidades implementadas

- Registro e inicio de sesion con JWT.
- Hash de contrasenas con PBKDF2 (passlib).
- Flujo post-registro con formulario de perfil (`profile_setup`) para personalizacion:
  - Idioma de interfaz.
  - Idioma nativo.
  - Idioma objetivo.
  - Intereses.
  - Ocupacion.
- Dashboard con:
  - Bloque premium.
  - Racha y XP.
  - Mis cursos (segun seleccion del usuario).
  - Otros cursos (catalogo base).
- Catalogo base activo de idiomas:
  - Ingles (`en`)
  - Ucraniano (`uk`)
  - Frances (`fr`)
  - Espanol (`es`)
- Relacion usuario-idioma via `enrollments` sincronizada automaticamente.
- Control freemium:
  - Usuario no premium: solo cursos seleccionados.
  - Usuario premium: acceso a todos los cursos.
  - En backend se bloquea acceso directo por URL a cursos/lecciones no permitidos.
- Reto diario con IA (Groq + fallback local).
- Validacion semantica de respuestas.
- Gamificacion:
  - XP por reto.
  - Racha por dias consecutivos.
  - Si falla un ejercicio, la racha se reinicia y se devuelve mensaje triste.
- Modulo de administracion:
  - Estadisticas.
  - Arbol curso > nivel > lecciones.
  - Creacion de lecciones/ejercicios.
- Pagos con Stripe real:
  - Checkout.
  - Webhooks verificados por firma.
  - Idempotencia de eventos (`stripe_webhook_events`).
  - Estado de suscripcion y portal.
- Seguridad reforzada:
  - API protegida por JWT por defecto (excepto auth, health y webhook Stripe).
  - CORS habilitado.
  - Registro de consentimiento (`consent_timestamp`).
- UI:
  - Ojo de mostrar/ocultar en contrasena y confirmar contrasena.
  - Boton premium movido al dashboard.
  - Chat flotante global eliminado por completo.
  - Idioma de interfaz aleman eliminado.

## Arquitectura y stack

- **Backend:** FastAPI, SQLModel, Pydantic.
- **DB:** MySQL 8 (Docker Compose).
- **Frontend:** HTML + Bootstrap + JavaScript vanilla, servido en `/ui`.
- **IA:** Groq API (`app/services/ai/groq_service.py`) con fallback local.
- **Auth:** JWT (`python-jose`) + passlib PBKDF2.
- **Pagos:** Stripe SDK + webhooks.

## Estructura principal

- `app/web.py`: creacion de app FastAPI, middlewares, routers y endpoints base.
- `app/models.py`: modelos SQLModel.
- `app/db.py`: engine, sesiones, init/migraciones ligeras y seeds.
- `app/security.py`: hashing/verificacion JWT/password.
- `app/dependencies.py`: dependencias de auth/roles.
- `app/api/auth.py`: registro, login, perfil, profile setup.
- `app/api/challenges.py`: reto diario, envio de respuesta, racha/xp.
- `app/api/courses.py`: catalogo/cursos/lecciones y restricciones freemium.
- `app/api/billing.py`: pricing, checkout, portal, webhooks, historial.
- `app/api/admin.py`: endpoints administrativos.
- `frontend/`: pantallas web y `app.js`.
- `infra/mysql/init.sql`: inicializacion de MySQL.
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

Campos importantes ya operativos:

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
- Validacion de firma Stripe en webhooks.
- Idempotencia de eventos Stripe.
- No se guardan contrasenas en texto plano.
- Hash de contrasena con salt (PBKDF2).
- Restriccion de rutas premium por backend (no solo UI).

## Endpoints relevantes

### Salud
- `GET /`
- `GET /api/health`

### Auth
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/profile-setup`

### Cursos y catalogo
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

## Como ejecutar en local

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
- `GROQ_API_KEY` (opcional, hay fallback local).
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
- Verificar cursos en "Mis cursos" segun seleccion de usuario.
- Verificar bloqueo de cursos no elegidos para basic.
- Subir a premium y verificar acceso a todos los cursos.
- Completar reto diario y comprobar:
  - XP.
  - Racha.
  - Reinicio de racha al fallo.
- Ejecutar checkout Stripe de prueba y validar webhook.

## Pendientes / mejoras sugeridas

- Migrar autenticacion frontend de localStorage a cookie HttpOnly para blindaje total de rutas UI.
- Agregar tests automatizados (unitarios + integracion).
- Crear migraciones formales (Alembic) en lugar de ajustes ligeros en startup.
- Internacionalizacion avanzada en backend y mensajes de API.
