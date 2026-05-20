# Capturas de accesibilidad — CoreSpeak

Coloca aquí las capturas **antes** y **después** de las mejoras para el informe `INFORME_ACCESIBILIDAD_USABILIDAD.md`.

## Cómo capturar (Windows)

1. Levanta la API: `uvicorn main:app --reload --port 8000`
2. Abre `http://127.0.0.1:8000/ui/inicio_session.html` o `dashboard.html`
3. **Teclado:** pulsa `Tab` varias veces para mostrar el foco visible
4. **Lector de pantalla (opcional):** Narrator (`Win + Ctrl + Enter`) o NVDA
5. Captura con `Win + Shift + S` o Herramienta Recortes

## Carpetas

| Carpeta | Contenido |
|---------|-----------|
| `antes/` | Estado previo (si conservas copia antigua) o capturas que documenten el problema |
| `despues/` | Estado tras los cambios implementados |

## Nombres sugeridos

| Archivo | Qué mostrar |
|---------|-------------|
| `01-login-focus.png` | Login: foco visible en campo o botón |
| `02-login-error-field.png` | Error asociado al campo email |
| `03-dashboard-skip.png` | Skip link visible al recibir foco |
| `04-dashboard-stat-link.png` | Tarjeta Reto diario con foco en enlace |
| `05-register-fieldset.png` | Registro con fieldset y leyendas |
| `06-course-card-link.png` | Tarjeta de curso (un solo enlace, sin botón anidado) |
| `07-agenda-modal-focus.png` | Modal nueva palabra con foco atrapado |
| `08-config-focus.png` | Configuración: foco en input |

## En el informe

Referencia con rutas relativas desde `docs/`:

```markdown
![Foco login después](a11y-screenshots/despues/01-login-focus.png)
```

Si el archivo aún no existe, el informe muestra el placeholder textual hasta que subas la imagen.
