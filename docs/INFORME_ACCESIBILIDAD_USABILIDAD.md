# Informe de accesibilidad y usabilidad — CoreSpeak

> **Entrega en PDF:** [`INFORME_ACCESIBILIDAD_USABILIDAD.pdf`](INFORME_ACCESIBILIDAD_USABILIDAD.pdf)  
> Regenerar: `.\venv\Scripts\python.exe scripts\generate_informe_pdf.py`

**Proyecto:** CoreSpeak (FastAPI + frontend HTML/JS)  
**Fecha:** mayo 2026  
**Alcance:** páginas principales en `frontend/` (login, registro, dashboard, cursos, agenda, configuración, precios)

---

## Resumen ejecutivo / Executive summary

**ES:** Se auditaron las pantallas clave según los cuatro principios WCAG (perceptible, operable, comprensible, robusto). Se documentaron 12 problemas concretos y se implementaron **7 mejoras de accesibilidad** y **6 de usabilidad** en código compartido (`a11y.css`, `a11y.js`) y en formularios/navegación.

**EN:** Key UI flows were audited against WCAG’s four principles. Twelve concrete issues were recorded; **seven accessibility** and **six usability** improvements were implemented via shared assets and HTML/JS updates.

---

## 1. Evaluación por principios WCAG

### 1.1 Perceptible / Perceivable

| Criterio | Estado antes | Estado después |
|----------|--------------|----------------|
| Texto alternativo en imágenes | Banderas con `alt=""` o `alt="Flag"` | `alt` descriptivo dinámico (“Bandera de Inglés”) |
| Contraste | `text-muted` Bootstrap a veces &lt; 4.5:1 | Ajuste global a `#5c6370` en `a11y.css` |
| No solo color | Errores solo en rojo | Prefijo “Error:” + `aria-invalid` en campos |
| Multimedia | Vídeos en lecciones (admin) | Sin cambio; lector debe usar título de lección |

### 1.2 Operable / Operable

| Criterio | Estado antes | Estado después |
|----------|--------------|----------------|
| Teclado | Botones `type="button"` fuera de envío por Enter | Formularios con `type="submit"` |
| Orden de tabulación | Skip link ausente | “Saltar al contenido” → `#main-content` |
| Foco visible | `outline: none` en config/agenda | `:focus-visible` global 3px `#7c3aed` |
| Formularios | Labels sin `for` | `for`/`id` enlazados |

### 1.3 Comprensible / Understandable

| Criterio | Estado antes | Estado después |
|----------|--------------|----------------|
| Etiquetas | Genéricas o desconectadas | Labels + `fieldset`/`legend` en registro |
| Errores | Bloque global único | Mensaje global + error por campo (`aria-describedby`) |
| Navegación | “Volver” con `href="#"` | Enlace a `inicio_session.html` |

### 1.4 Robusto / Robust

| Criterio | Estado antes | Estado después |
|----------|--------------|----------------|
| HTML semántico | Pocos `<main>`, `lang="en"` en dashboard | `<main>`, `lang="es"` coherente |
| Labels / fieldset | Parcial | Registro y perfil con `fieldset` |
| ARIA | Parcial | `aria-label` en nav, tarjetas, progreso, modal agenda |

---

## 2. Problemas detectados (12)

Cada fila incluye captura sugerida (sube PNG a `docs/a11y-screenshots/`).

### Problema 1 — Labels sin asociar al control

| | |
|--|--|
| **Principio** | Robusto / Comprensible |
| **Por qué es un problema** | Sin `for`/`id`, el lector de pantalla no anuncia el nombre del campo al enfocar el input; aumenta errores de rellenado. |
| **Evidencia** | `inicio_session.html`, `registrarse.html` (labels sin `for`) |
| **Mejora** | `for="login-email"` etc. + `aria-describedby` hacia errores |
| **Captura** | Antes: — / Después: `![Registro labels](a11y-screenshots/despues/05-register-fieldset.png)` |

**EN:** Labels were not programmatically tied to inputs; screen readers could not announce field names reliably.

---

### Problema 2 — Envío del formulario no activable con Enter

| | |
|--|--|
| **Principio** | Operable |
| **Por qué** | `type="button"` + `click` rompe la convención de formularios HTML y dificulta teclado y AT. |
| **Mejora** | `type="submit"` + listener `submit` en `#login-form`, `#register-form`, etc. |

**EN:** Submit buttons did not use native form submission; Enter key did not submit.

---

### Problema 3 — Botón dentro de enlace (tarjetas de curso)

| | |
|--|--|
| **Principio** | Operable / Robusto |
| **Por qué** | HTML inválido; foco y anuncio duplicado (“enlace” + “botón”); Tab impredecible. |
| **Evidencia** | `createCourseCard()` en `app.js`: `<a><button>` |
| **Mejora** | Un solo `<a class="course-card-link" aria-label="…">` con `<span aria-hidden>` visual |
| **Captura** | `![Tarjeta curso](a11y-screenshots/despues/06-course-card-link.png)` |

**EN:** Nested interactive elements broke keyboard and screen reader semantics.

---

### Problema 4 — Enlaces del dashboard sin nombre accesible

| | |
|--|--|
| **Principio** | Perceptible / Operable |
| **Por qué** | `<a><div>…</div></a>` sin texto enlazado; NVDA lee “enlace” sin destino claro. |
| **Mejora** | `dashboard-stat-link` + `aria-label="Reto diario: completa tu desafío de hoy"` |

**EN:** Stat cards were links wrapping unnamed content.

---

### Problema 5 — Foco no visible (`outline: none`)

| | |
|--|--|
| **Principio** | Operable |
| **Por qué** | Usuarios de teclado no ven dónde están; incumple WCAG 2.4.7 Focus Visible. |
| **Evidencia** | `config.css`, `agenda.css` |
| **Mejora** | `:focus-visible` en `a11y.css`; eliminado `outline: none` sin reemplazo |
| **Captura** | `![Foco login](a11y-screenshots/despues/01-login-focus.png)` |

**EN:** Focus indicators were removed without an alternative.

---

### Problema 6 — Idioma de documento incorrecto

| | |
|--|--|
| **Principio** | Robusto |
| **Por qué** | `lang="en"` con UI en español hace que el sintetizador pronuncie mal. |
| **Mejora** | `lang="es"` en `dashboard.html`, `course.html`, etc. |

**EN:** Document language did not match UI copy.

---

### Problema 7 — “Cerrar sesión” como enlace vacío

| | |
|--|--|
| **Principio** | Operable |
| **Por qué** | `<a href="#">` confunde (navegación vs acción) y puede activar scroll. |
| **Mejora** | `<button type="button" class="corespeak-logout">` + delegación en `a11y.js` / `app.js` |

**EN:** Logout was a fake link instead of a button.

---

### Problema 8 — Banderas sin texto alternativo útil

| | |
|--|--|
| **Principio** | Perceptible |
| **Por qué** | `alt=""` oculta información; `alt="Flag"` no es descriptivo. |
| **Mejora** | `alt="Bandera de {idioma}"` en JS y `course.html` |

**EN:** Flag images lacked meaningful alternative text.

---

### Problema 9 — Errores no asociados al campo

| | |
|--|--|
| **Principio** | Comprensible |
| **Por qué** | Solo alerta global; el usuario no sabe qué campo corregir. |
| **Mejora** | `CoreSpeakA11y.setFieldError`, `aria-invalid`, `aria-describedby` |
| **Captura** | `![Error campo](a11y-screenshots/despues/02-login-error-field.png)` |

**EN:** Validation messages were not tied to specific fields.

---

### Problema 10 — Sin skip link ni landmark principal

| | |
|--|--|
| **Principio** | Operable |
| **Por qué** | Repite Tab por toda la cabecera en cada página. |
| **Mejora** | `.skip-link` + `<main id="main-content">` |
| **Captura** | `![Skip link](a11y-screenshots/despues/03-dashboard-skip.png)` |

**EN:** No bypass mechanism for repeated navigation.

---

### Problema 11 — Barra de progreso sin estado ARIA

| | |
|--|--|
| **Principio** | Perceptible |
| **Por qué** | `role="progressbar"` sin `aria-valuenow` no comunica porcentaje. |
| **Mejora** | Atributos en tarjetas curso y página `course.html` |

**EN:** Progress bars were not exposed to assistive tech.

---

### Problema 12 — Enlace “Volver” roto en registro

| | |
|--|--|
| **Principio** | Comprensible / Usabilidad |
| **Por qué** | `href="#"` no devuelve al login; rompe expectativa. |
| **Mejora** | `href="inicio_session.html"` |

**EN:** Back control on signup did not navigate anywhere useful.

---

## 3. Pruebas con lector de pantalla

**Herramienta recomendada:** Narrator (Windows) o NVDA + Firefox/Chrome.

### 3.1 Página principal (dashboard)

| Qué probar | Lee bien (después) | Aún mejorable |
|------------|-------------------|---------------|
| Skip link | “Saltar al contenido” al primer Tab | — |
| Nav | “Principal”, “Hazte Premium”, “Cerrar sesión” como botón | Iconos decorativos ocultos con `aria-hidden` |
| Tarjetas | “Reto diario: completa tu desafío de hoy” | Racha no es enlace (correcto; solo región) |
| Cursos dinámicos | `aria-label` con idioma y nivel | Progreso 0% hasta cargar datos reales |

**EN:** Dashboard landmarks and named links work; streak card is informational only.

### 3.2 Formulario de login

| Qué probar | Lee bien | Problema previo |
|------------|----------|-----------------|
| Campos | “Correo electrónico”, “Contraseña” | Label no asociado |
| Error | “Error: …” + mensaje bajo el campo | Solo alerta superior |
| Botón | “Iniciar sesión” / “Iniciando sesión…” con `aria-busy` | — |

### 3.3 Botones y enlaces

- **Correcto:** toggle contraseña con `aria-label` dinámico (mostrar/ocultar).
- **Corregido:** logout como `button`, no “enlace sin URL”.
- **Corregido:** tarjeta curso = un solo destino interactivo.

### 3.4 Navegación solo teclado

- **Antes:** foco invisible en inputs de configuración/agenda; botón dentro de enlace en cursos.
- **Después:** anillo morado `:focus-visible`; Tab ordenado form → CTA; Escape cierra modal agenda.

---

## 4. Usabilidad

### 4.1 Cinco heurísticas de Nielsen

1. **Visibilidad del estado** — `aria-busy` y texto “Iniciando sesión…” / “Creando cuenta…” en envíos.
2. **Coincidencia sistema–mundo real** — Errores en español claro (“nombre@dominio.com”).
3. **Control y libertad** — Volver al login; Escape y foco restaurado en modal agenda.
4. **Consistencia** — Misma barra nav, `lang="es"`, patrones `main` + skip en todas las vistas autenticadas.
5. **Prevención de errores** — Validación cliente antes de `fetch`; `required`, `type="email"`, `minlength`.

**EN:** Nielsen heuristics addressed via feedback, copy, escape hatches, consistency, and client-side validation.

### 4.2 Ley de Fitts

Botones táctiles mínimos **44×44 px** en menú móvil, toggles de contraseña y CTA premium (`a11y.css`). Reduce errores de puntero en móvil.

**EN:** Larger hit targets shorten movement time to frequent controls.

### 4.3 Ley de Hick

En `profile_setup`, la rejilla de intereses ya limita a `MAX_PROFILE_INTERESTS` opciones — reduce decisiones simultáneas. Se añadió `<fieldset><legend>Centros de interés</legend>` para agrupar cognitivamente.

**EN:** Capped interest choices and field grouping reduce decision complexity.

### 4.4 Buenas prácticas en formularios

- Agrupación: datos personales y contraseña en `<fieldset>`.
- Un mensaje de error por campo + resumen accesible.
- Hint de contraseña visible (`register-password-hint`).

---

## 5. Cambios implementados

### 5.1 Accesibilidad (7+)

| # | Cambio | Archivos |
|---|--------|----------|
| A1 | Capa `a11y.css` / `a11y.js` | `frontend/a11y.css`, `frontend/a11y.js` |
| A2 | Skip link + `<main id="main-content">` | login, registro, dashboard, config, agenda, pricing, course, profile |
| A3 | Labels + errores por campo | HTML auth + `setLoginFormError` / `setRegisterFormError` |
| A4 | Tarjetas curso: enlace único + progreso ARIA | `app.js` `createCourseCard` |
| A5 | Dashboard: enlaces con `aria-label`, logout `button` | `dashboard.html` + páginas nav |
| A6 | Modal agenda: trap foco + Escape | `app.js` `initAgendaPage` |
| A7 | Foco visible global; contraste `text-muted` | `a11y.css`, `config.css`, `agenda.css`, `styles.css` |

### 5.2 Usabilidad (6)

| # | Cambio |
|---|--------|
| U1 | Volver registro → `inicio_session.html` |
| U2 | Estados de carga en login/registro |
| U3 | Validación inline antes de API |
| U4 | Títulos `<h1>` / `<title>` coherentes |
| U5 | Mensajes de error accionables |
| U6 | Prefijo “Error:” (no solo color rojo) |

### 5.3 Antes / después (capturas)

Sube imágenes según [a11y-screenshots/README.md](a11y-screenshots/README.md).

| Escena | Antes (placeholder) | Después (placeholder) |
|--------|---------------------|------------------------|
| Foco login | `antes/01-login-focus.png` | `despues/01-login-focus.png` |
| Error por campo | `antes/02-login-error-field.png` | `despues/02-login-error-field.png` |
| Skip dashboard | `antes/03-dashboard-skip.png` | `despues/03-dashboard-skip.png` |

---

## 6. Checklist de verificación manual

- [ ] Tab desde skip link hasta formulario sin quedar atrapado
- [ ] Enter envía login y registro
- [ ] Narrator anuncia nombre de tarjetas de curso
- [ ] Modal agenda: Tab cicla dentro; Escape cierra y devuelve foco
- [ ] Contraste texto gris sobre blanco aceptable (inspección DevTools)
- [ ] Logout funciona desde desktop y menú móvil

---

## 7. Referencias técnicas

- [WCAG 2.2](https://www.w3.org/TR/WCAG22/)
- [WAI-ARIA Authoring Practices — Dialog modal](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
- Archivos del proyecto: `frontend/a11y.css`, `frontend/a11y.js`, `frontend/app.js`

---

*Documento generado como entrega académica del módulo de accesibilidad y usabilidad. Las capturas PNG las completa el equipo en `docs/a11y-screenshots/`.*
