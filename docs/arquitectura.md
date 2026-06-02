# Arquitectura de CoreSpeak

## Visión general

CoreSpeak es una aplicación web de aprendizaje de idiomas con:

- **Backend** en FastAPI (`app/`)
- **Frontend** en HTML/CSS/JS vanilla (`frontend/`)
- **Persistencia** en MySQL (o SQLite en modo local)
- **IA** para generación/corrección de retos mediante Groq con fallback local

La app se sirve desde el mismo backend:

- API en `/api/...`
- UI estática en `/ui/...`

## Capas principales

### Backend

- `app/web.py`
  - Crea la app FastAPI
  - Aplica middleware de autenticación global para `/api/*`
  - Registra routers de módulos (`auth`, `courses`, `challenges`, `billing`, etc.)
  - Monta frontend en `/ui`
- `app/api/*.py`
  - Endpoints por dominio funcional
- `app/services/*.py`
  - Lógica de negocio reutilizable (progreso, validación, email, IA)
- `app/models.py`
  - Modelo relacional con SQLModel
- `app/schemas.py`
  - Contratos de entrada/salida (Pydantic)

### Frontend

- `frontend/*.html`
  - Una página por pantalla (dashboard, curso, lección, reto diario, admin)
- `frontend/app.js`
  - Lógica principal compartida (auth, fetch API, render dinámico, i18n UI)

## Flujo de autenticación

1. Usuario hace login/registro en `/api/auth/...`.
2. Backend emite JWT.
3. Frontend guarda token y lo envía en `Authorization: Bearer ...`.
4. Middleware de `app/web.py` valida token para casi toda la API.

## Módulos de dominio

- **Auth**: registro, login, perfil, recuperación de contraseña.
- **Cursos/Lecciones**:
  - catálogo por idioma
  - restricciones freemium
  - envío de ejercicios de lección y progreso
- **Retos diarios**:
  - generación de reto
  - evaluación semántica
  - racha, XP y progresión de nivel CEFR
- **Billing**:
  - checkout Stripe
  - webhooks firmados
  - estado de suscripción
- **Admin**:
  - gestión de lecciones/estructura de cursos

## Integración IA (Groq)

- Archivo central: `app/services/ai/groq_service.py`
- Dos usos:
  1. `build_daily_challenge` para generar reto del día.
  2. `semantic_validate_answer` para corregir respuesta del usuario.
- Si Groq falla o no hay clave, se usa fallback local determinístico.

## Datos y progreso

Conceptos persistidos relevantes:

- `DailyChallenge`: reto diario por usuario
- `LessonExerciseCompletion`: ejercicios de lección completados
- `LessonAttempt`: lección completada (resumen)
- `users.streak_days`, `users.xp_total`, `users.current_levels_json`

## Convenciones del proyecto

- Seguridad aplicada en backend, no solo en frontend.
- Validaciones de acceso premium en endpoints sensibles.
- UI con cache-busting (`?v=...`) al cambiar JS/CSS crítico.
