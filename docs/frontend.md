# Frontend (HTML + app.js)

## Estructura

- `dashboard.html`: panel principal con métricas y tarjetas de cursos.
- `course.html`: vista de curso y lista de lecciones.
- `lesson.html`: detalle de lección, media y ejercicios.
- `index.html`: chat de reto diario.
- `admin*.html`: paneles de administración.
- `app.js`: lógica compartida para la mayoría de páginas.

## Patrón general de ejecución

`app.js` detecta la página por presencia de elementos del DOM y activa la lógica correspondiente:

- Si existe `#stat-streak` → carga dashboard.
- Si existe `#course-lessons-list` → carga página de curso.
- Si existe `#lesson-skills-list` → carga lección.
- Si existe `#practice-question` → carga práctica IA.

## Dashboard

Funciones clave:

- `loadMyProgress()`
  - Trae XP/racha y refresca cabecera.
- `loadDashboardCourses()`
  - Trae catálogo real de cursos (`/api/catalog/courses`)
  - Renderiza tarjetas en “Mis cursos” y “Otros cursos”.
- `renderDashboardCatalogCourseCard(course)`
  - Pinta barra y texto de progreso según payload de API.
  - Ajusta CTA según estado: comenzar / continuar / repasar.

## Página de curso

`loadDynamicCoursePage()`:

- Carga cursos del idioma solicitado.
- Trae lecciones por curso accesible.
- Calcula progreso agregado por nivel CEFR.
- Renderiza tarjetas agrupadas por nivel.

## Página de lección

`loadLessonPage()`:

- Carga detalle de lección.
- Renderiza media (YouTube, extra videos, transcripción).
- Renderiza ejercicios con `corespeakRenderCatalogExercises(...)`.

`corespeakRenderCatalogExercises(...)`:

- Muestra un ejercicio por vez.
- Navegación lateral por flechas.
- Si llegas al final, permite salto a lección siguiente (si existe).
- Envía respuestas a `/api/catalog/lessons/{id}/exercises/submit`.

## Cache-busting

Las páginas HTML usan query de versión en assets (`app.js?v=...`, `dashboard.css?v=...`) para forzar actualización cuando cambia lógica visual importante.

## Recomendación de mantenimiento

- Mantener funciones UI puras separadas de llamadas API.
- Reutilizar `apiUrl(...)` y helpers comunes para headers/auth.
- Al añadir nuevas pantallas, seguir patrón de detección por ID único.
