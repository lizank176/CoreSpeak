# Retos diarios y Groq

## Qué hace Groq en CoreSpeak

Groq participa en dos momentos distintos:

1. **Generación del reto**:
   - `build_daily_challenge(...)`
2. **Corrección semántica**:
   - `semantic_validate_answer(...)`

No solo corrige: también crea contenido de reto.

## Flujo de generación

Endpoint:

- `GET /api/challenges/daily`

Lógica:

1. Busca si ya existe reto de hoy para el usuario.
2. Si existe, devuelve ese reto (persistido en BD).
3. Si no existe, genera uno y lo guarda.

Persistencia:

- Tabla/modelo `DailyChallenge`.
- Por eso en UI puedes “ver retos ya hechos”.

## Inputs usados para generar

- Nivel CEFR actual del usuario.
- Idioma objetivo.
- Idioma nativo/UI.
- Intereses seleccionados.
- Escenarios recientes (evitar repetición).
- `variety_key` (semilla estable para variedad diaria).

## Fallback cuando Groq falla

Si no hay `GROQ_API_KEY` o falla la llamada:

- Se usa `_offline_fallback_bundle(...)`.
- Genera retos locales válidos, con variaciones por día/nivel.

Esto evita caída funcional del módulo de retos.

## Flujo de corrección

Endpoint:

- `POST /api/challenges/{challenge_id}/submit`

Lógica:

1. Evalúa respuesta contra:
   - `task_prompt`
   - `scenario`
   - `expected_solution`
2. Groq devuelve:
   - `score` de 0.0 a 1.0
   - `feedback`
3. Backend traduce score a:
   - XP ganada
   - actualización de racha
   - estado del reto (COMPLETED)

## Reglas de robustez

- Ajustes de justicia para A1/A2 (evitar puntajes demasiado punitivos por errores menores).
- Inyección de correcciones concretas en feedback (ej. `cart` vs `card`).
- Si falla corrección IA:
  - se devuelve mensaje fallback local en idioma del usuario.

## Premium

- `POST /api/challenges/premium/generate`
  - genera retos extra fuera del reto diario único.
- `POST /api/challenges/{id}/resubmit`
  - permite reevaluar retos completados sin otorgar progreso adicional.
