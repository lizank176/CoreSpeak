# Documentación de API

Este documento resume los endpoints principales que usa el frontend.

## Salud

- `GET /api/health`
  - Verifica estado de API.

## Auth (`/api/auth`)

- `POST /register`
  - Crea usuario y devuelve token.
- `POST /login`
  - Autenticación por email/password.
- `GET /me`
  - Perfil completo del usuario autenticado.
- `POST /profile-setup`
  - Configuración inicial de perfil (idioma UI, nivel, intereses).
- `POST /forgot-password`
  - Solicita email con token de reseteo.
- `POST /reset-password`
  - Actualiza contraseña con token válido.

## Catálogo y cursos

### Catálogo (`/api/catalog`)

- `GET /interest-options`
  - Opciones de intereses para onboarding/perfil.
- `GET /courses`
  - Lista de cursos publicados accesibles para el usuario.
  - Incluye progreso resumido:
    - `lessons_completed`
    - `lessons_total`
    - `exercises_completed`
    - `exercises_total`
    - `progress_percent`
- `GET /courses/{course_id}/lessons`
  - Lecciones del curso con accesibilidad y progreso por lección.
- `GET /lessons/{lesson_id}`
  - Detalle de lección + bloques de ejercicios + vecinos (prev/next).
- `POST /lessons/{lesson_id}/exercises/submit`
  - Envía respuesta de un ejercicio del catálogo.
  - Devuelve corrección, XP, racha y estado de repetición.

### Cursos legacy (`/api/courses`)

- `GET /lessons`
- `GET /lessons/{lesson_id}`
- Endpoints de compatibilidad histórica del proyecto.

## Retos (`/api/challenges`)

- `GET /daily`
  - Devuelve reto del día; si no existe, lo genera.
- `GET /history`
  - Historial de retos para sidebar.
- `POST /premium/generate`
  - Genera reto adicional (premium).
- `GET /{challenge_id}/detail`
  - Carga reto concreto (incluye editable/solo lectura).
- `POST /{challenge_id}/submit`
  - Primera entrega de respuesta de reto.
- `POST /{challenge_id}/resubmit`
  - Reenvío premium de reto ya completado.

## Tutor IA (`/api/chat`)

- `POST /api/chat/tutor`
  - Respuesta contextual del tutor premium.
  - Usa contexto de reto y mensajes recientes.

## Billing (`/api/billing`)

- `GET /pricing`
- `GET /subscription-status`
- `POST /checkout`
- `POST /portal`
- `POST /webhooks/stripe`
- `GET /history`

## Admin (`/api/admin`)

Incluye endpoints de gestión y mantenimiento interno:

- dashboard admin
- árbol curso/nivel/lecciones
- CRUD de lecciones y estructuras relacionadas

---

## Errores frecuentes

- `401 Unauthorized`
  - Token ausente o inválido.
- `402 Payment Required`
  - Recurso premium o no accesible por plan.
- `404 Not Found`
  - Curso/lección/reto inexistente o no pertenece al usuario.
- `422 Unprocessable Entity`
  - Payload inválido o índice de ejercicio fuera de rango.
