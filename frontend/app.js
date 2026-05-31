/* CoreSpeak frontend JS (MVP) */

const TOKEN_KEY = "corespeak_token";
const USER_ID_KEY = "corespeak_user_id";
const UI_LANG_STORAGE_KEY = "corespeak_ui_lang";

function getStoredToken() {
  return (localStorage.getItem(TOKEN_KEY) || "").trim();
}

function setStoredToken(raw) {
  const t = String(raw == null ? "" : raw).trim();
  if (t) {
    localStorage.setItem(TOKEN_KEY, t);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

/**
 * Origen del backend (vacío = mismo host que la página).
 * Si la UI está en otro puerto (Live Server, etc.), se usa :8000 en localhost.
 * Opcional: define window.CORESPEAK_API_ORIGIN = "http://127.0.0.1:8000" antes de cargar app.js
 */
function getApiOrigin() {
  try {
    if (typeof window !== "undefined" && window.CORESPEAK_API_ORIGIN != null && String(window.CORESPEAK_API_ORIGIN).trim() !== "") {
      return String(window.CORESPEAK_API_ORIGIN).replace(/\/$/, "");
    }
    const loc = window.location;
    const host = loc.hostname;
    const port = loc.port;
    // file:// o host vacío: las rutas relativas /api/... no apuntan a uvicorn.
    if (loc.protocol === "file:" || host === "") {
      return "http://127.0.0.1:8000";
    }
    const isLocal = host === "localhost" || host === "127.0.0.1";
    if (isLocal && port && port !== "8000") {
      return loc.protocol + "//" + host + ":8000";
    }
  } catch (e) {
    /* ignore */
  }
  return "";
}

function apiUrl(path) {
  if (!path.startsWith("/")) path = "/" + path;
  const o = getApiOrigin();
  return o ? o + path : path;
}

/** Rutas /static/... cuando la API está en otro origen */
function staticUrl(path) {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const o = getApiOrigin();
  return o ? o + path : path;
}

function apiHeaders() {
  const token = getStoredToken();
  if (!token) {
    return null;
  }
  return {
    Authorization: "Bearer " + token,
    "Content-Type": "application/json",
  };
}

/** Idioma de interfaz del perfil (es, en, fr, uk). */
function normalizeUiLang(raw) {
  const s = String(raw || "es")
    .toLowerCase()
    .trim()
    .slice(0, 2);
  if (s === "ua") return "uk";
  if (["es", "en", "fr", "uk"].includes(s)) return s;
  return "es";
}

async function getEffectiveUiLang(auth) {
  const stored = localStorage.getItem(UI_LANG_STORAGE_KEY);
  if (stored) return normalizeUiLang(stored);
  if (auth && auth.token) {
    try {
      const res = await fetch(apiUrl("/api/users/me/profile"), {
        headers: { Authorization: "Bearer " + auth.token },
      });
      if (res.ok) {
        const p = await res.json().catch(() => ({}));
        return normalizeUiLang(p.idioma_ui);
      }
    } catch (e) {
      /* ignore */
    }
  }
  return "es";
}

function getCurrentUiLangSync() {
  const stored = localStorage.getItem(UI_LANG_STORAGE_KEY);
  if (stored) return normalizeUiLang(stored);
  if (typeof window !== "undefined" && window.__corespeak_ui_lang) {
    return normalizeUiLang(window.__corespeak_ui_lang);
  }
  return "es";
}

function i18nGet(pack, path) {
  if (!pack || !path) return null;
  const parts = String(path).split(".");
  let cur = pack;
  for (let i = 0; i < parts.length; i++) {
    if (cur == null || typeof cur !== "object") return null;
    cur = cur[parts[i]];
  }
  return cur;
}

function applyPageI18n(lang) {
  const pack = getUiPack(lang);
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (!key) return;
    const val = i18nGet(pack, key);
    if (val == null) return;
    if (typeof val === "function") return;
    if (typeof val === "object") return;
    if (key.endsWith("Html")) {
      el.innerHTML = String(val);
      return;
    }
    el.textContent = String(val);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key = el.getAttribute("data-i18n-placeholder");
    if (!key || !(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
    const val = i18nGet(pack, key);
    if (val == null || typeof val === "object") return;
    el.placeholder = String(val);
  });
}

function getUiLangOptions() {
  return [
    { v: "es", t: "Español" },
    { v: "en", t: "English" },
    { v: "fr", t: "Français" },
    { v: "uk", t: "Українська" },
  ];
}

function uiLangLabel(value) {
  const v = normalizeUiLang(value);
  const found = getUiLangOptions().find((o) => o.v === v);
  return found ? found.t : "Español";
}

function langSelectOptionsHtml() {
  const opts = getUiLangOptions();
  return opts.map((o) => '<option value="' + o.v + '">' + o.t + "</option>").join("");
}

function injectLanguageSelectors(currentLang) {
  const applySelectVisual = (sel) => {
    if (!sel) return;
    sel.style.minWidth = "8.15rem";
    sel.style.height = "2.1rem";
    sel.style.borderRadius = "8px";
    sel.style.border = "1px solid #d6d8dd";
    sel.style.backgroundColor = "#ffffff";
    sel.style.color = "#1f2937";
    sel.style.fontWeight = "400";
    sel.style.padding = "0.2rem 1.9rem 0.2rem 0.65rem";
    sel.style.appearance = "none";
    sel.style.webkitAppearance = "none";
    sel.style.mozAppearance = "none";
    sel.style.backgroundImage =
      "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 14 14'%3E%3Cpath d='M3 5.25 7 9l4-3.75' fill='none' stroke='%234b5563' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")";
    sel.style.backgroundRepeat = "no-repeat";
    sel.style.backgroundPosition = "right 0.62rem center";
    sel.style.backgroundSize = "14px 14px";
    sel.style.boxShadow = "none";
    if (!sel.dataset.corespeakFocusBound) {
      sel.addEventListener("focus", () => {
        sel.style.borderColor = "#b08ce8";
        sel.style.boxShadow = "0 0 0 0.14rem rgba(168,85,247,0.14)";
      });
      sel.addEventListener("blur", () => {
        sel.style.borderColor = "#d6d8dd";
        sel.style.boxShadow = "none";
      });
      sel.dataset.corespeakFocusBound = "1";
    }
  };

  const styleLabelShell = (label) => {
    if (!label) return;
    label.style.background = "#f5f6f8";
    label.style.border = "1px solid #d7dae0";
    label.style.borderRadius = "8px";
    label.style.padding = "0.34rem 0.46rem";
    label.style.boxShadow = "0 1px 3px rgba(15, 23, 42, 0.08)";
    label.style.backdropFilter = "none";
  };

  const styleLabelText = (sp) => {
    if (!sp) return;
    sp.style.fontWeight = "500";
    sp.style.color = "#4b5563";
  };

  const mkSelect = () => {
    const sel = document.createElement("select");
    sel.className = "form-select form-select-sm corespeak-ui-lang-select";
    sel.setAttribute("aria-label", "Interface language");
    sel.innerHTML = langSelectOptionsHtml();
    sel.value = normalizeUiLang(currentLang);
    applySelectVisual(sel);
    return sel;
  };

  document.querySelectorAll("ul.dashboard-nav-list").forEach((ul) => {
    if (ul.querySelector(".corespeak-ui-lang-select")) return;
    const li = document.createElement("li");
    li.className =
      "dashboard-nav-item align-self-center me-2 me-md-3 d-none d-lg-flex align-items-center";
    const label = document.createElement("label");
    label.className = "dashboard-nav-link mb-0 d-flex align-items-center gap-2";
    const sp = document.createElement("span");
    sp.className = "d-none d-lg-inline text-muted small";
    sp.setAttribute("data-i18n", "nav.uiLang");
    styleLabelText(sp);
    label.appendChild(sp);
    label.appendChild(mkSelect());
    li.appendChild(label);
    ul.insertBefore(li, ul.firstChild);
  });

  const nav = document.querySelector("nav.dashboard-nav");
  if (nav && !document.querySelector(".corespeak-ui-lang-select")) {
    const wrap = document.createElement("div");
    wrap.className = "ms-auto d-none d-lg-flex align-items-center pe-2 pe-md-3";
    const label = document.createElement("label");
    label.className = "d-flex align-items-center gap-2 mb-0 small";
    const sp = document.createElement("span");
    sp.className = "text-muted d-none d-sm-inline";
    sp.setAttribute("data-i18n", "nav.uiLang");
    styleLabelText(sp);
    label.appendChild(sp);
    label.appendChild(mkSelect());
    wrap.appendChild(label);
    nav.appendChild(wrap);
  }

  if (!document.querySelector(".corespeak-ui-lang-select") && document.body) {
    const bar = document.createElement("div");
    bar.className = "position-fixed top-0 end-0 p-2 p-md-3 d-none d-lg-block";
    bar.style.zIndex = "1080";

    const dd = document.createElement("div");
    dd.className = "corespeak-ui-lang-dropdown";
    dd.style.width = "170px";
    dd.style.color = "#f9fafb";
    dd.style.fontSize = "0.96rem";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "corespeak-ui-lang-dd-btn";
    btn.setAttribute("aria-haspopup", "listbox");
    btn.setAttribute("aria-expanded", "false");
    btn.style.width = "100%";
    btn.style.display = "flex";
    btn.style.alignItems = "center";
    btn.style.justifyContent = "space-between";
    btn.style.gap = "0.55rem";
    btn.style.padding = "0.62rem 0.74rem";
    btn.style.borderRadius = "10px";
    btn.style.border = "1.5px solid rgba(245, 247, 250, 0.95)";
    btn.style.background =
      "linear-gradient(90deg, rgba(184, 172, 214, 0.93) 0%, rgba(169, 190, 215, 0.93) 100%)";
    btn.style.color = "#f9fafb";
    btn.style.fontWeight = "600";
    btn.style.lineHeight = "1.2";
    btn.style.boxShadow = "0 5px 14px rgba(15, 23, 42, 0.16)";
    btn.style.backdropFilter = "blur(0.5px)";

    const left = document.createElement("span");
    left.style.display = "inline-flex";
    left.style.alignItems = "center";
    left.style.gap = "0.55rem";
    left.style.lineHeight = "1.2";

    const icon = document.createElement("span");
    icon.textContent = "◉";
    icon.style.fontSize = "0.74rem";
    icon.style.opacity = "0.95";

    const current = document.createElement("span");
    current.className = "corespeak-ui-lang-current";
    current.textContent = uiLangLabel(currentLang);

    left.appendChild(icon);
    left.appendChild(current);

    const caret = document.createElement("span");
    caret.innerHTML =
      "<svg width='13' height='13' viewBox='0 0 14 14' fill='none' xmlns='http://www.w3.org/2000/svg' aria-hidden='true'><path d='M3 5.25L7 9L11 5.25' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/></svg>";
    caret.style.display = "inline-flex";
    caret.style.alignItems = "center";
    caret.style.justifyContent = "center";
    caret.style.width = "14px";
    caret.style.height = "14px";
    caret.style.opacity = "0.96";

    btn.appendChild(left);
    btn.appendChild(caret);

    const panel = document.createElement("div");
    panel.className = "corespeak-ui-lang-dd-panel";
    panel.hidden = true;
    panel.style.marginTop = "0.55rem";
    panel.style.padding = "0.58rem 0.72rem";
    panel.style.borderRadius = "10px";
    panel.style.border = "1.5px solid rgba(245, 247, 250, 0.95)";
    panel.style.background =
      "linear-gradient(180deg, rgba(176, 182, 201, 0.96) 0%, rgba(159, 172, 194, 0.96) 100%)";
    panel.style.boxShadow = "0 7px 20px rgba(15, 23, 42, 0.22)";
    panel.style.maxHeight = "270px";
    panel.style.overflowY = "auto";

    const radioName = "corespeak-ui-lang-radio-" + Date.now();
    getUiLangOptions().forEach((opt) => {
      const row = document.createElement("label");
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.gap = "0.62rem";
      row.style.padding = "0.3rem 0";
      row.style.cursor = "pointer";
      row.style.fontWeight = "600";
      row.style.color = "#f8fafc";

      const rd = document.createElement("input");
      rd.type = "radio";
      rd.name = radioName;
      rd.value = opt.v;
      rd.setAttribute("data-lang-value", opt.v);
      rd.style.accentColor = "#8b5cf6";
      rd.checked = normalizeUiLang(currentLang) === opt.v;
      rd.addEventListener("change", () => {
        if (!rd.checked) return;
        void applyUiLanguageSelection(opt.v, null);
        panel.hidden = true;
        btn.setAttribute("aria-expanded", "false");
      });

      const tx = document.createElement("span");
      tx.textContent = opt.t;

      row.appendChild(rd);
      row.appendChild(tx);
      panel.appendChild(row);
    });

    btn.addEventListener("click", () => {
      const open = panel.hidden;
      panel.hidden = !open;
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    });

    document.addEventListener("click", (ev) => {
      if (!dd.contains(ev.target)) {
        panel.hidden = true;
        btn.setAttribute("aria-expanded", "false");
      }
    });

    dd.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape") {
        panel.hidden = true;
        btn.setAttribute("aria-expanded", "false");
        btn.focus();
      }
    });

    dd.appendChild(btn);
    dd.appendChild(panel);
    bar.appendChild(dd);
    document.body.appendChild(bar);
  }

  document.querySelectorAll(".corespeak-ui-lang-select").forEach((sel) => {
    sel.value = normalizeUiLang(currentLang);
    applySelectVisual(sel);
    sel.removeEventListener("change", corespeakLangSelectChange);
    sel.addEventListener("change", corespeakLangSelectChange);
  });
}

async function applyUiLanguageSelection(value, sourceSel) {
  const v = normalizeUiLang(value);
  localStorage.setItem(UI_LANG_STORAGE_KEY, v);
  window.__corespeak_ui_lang = v;
  document.documentElement.lang = v;
  applyPageI18n(v);

  const regUi = document.getElementById("register-idioma-ui");
  if (regUi) regUi.value = v;

  document.querySelectorAll(".corespeak-ui-lang-select").forEach((s) => {
    if (s !== sourceSel) s.value = v;
  });

  document.querySelectorAll(".corespeak-ui-lang-dropdown").forEach((dd) => {
    const current = dd.querySelector(".corespeak-ui-lang-current");
    if (current) current.textContent = uiLangLabel(v);
    dd.querySelectorAll("input[data-lang-value]").forEach((rd) => {
      rd.checked = normalizeUiLang(rd.value) === v;
    });
  });

  const h = apiHeaders();
  if (h) {
    try {
      await fetch(apiUrl("/api/users/me/ui-lang"), {
        method: "PATCH",
        headers: { ...h, "Content-Type": "application/json" },
        body: JSON.stringify({ idioma_ui: v }),
      });
    } catch (e) {
      /* offline */
    }
  }

  if (document.getElementById("stat-streak") && document.getElementById("courses-mis-row")) {
    void loadMyProgress();
    void loadDashboardCourses();
  }
  if (document.getElementById("lesson-skills-list")) void loadLessonPage();
  if (document.getElementById("course-lessons-list") && document.getElementById("course-title")) void loadDynamicCoursePage();
  if (document.getElementById("practice-question") || document.getElementById("chat-container")) void loadPracticeExercise();
  if (document.getElementById("agenda-tbody")) void renderAgendaTable();
}

async function corespeakLangSelectChange(ev) {
  const sel = ev.target;
  if (!sel || !sel.classList.contains("corespeak-ui-lang-select")) return;
  await applyUiLanguageSelection(sel.value, sel);
}

async function initCoreSpeakUiLanguage() {
  const token = getStoredToken();
  const userId = localStorage.getItem(USER_ID_KEY);
  const auth =
    token && isValidStoredUserId(userId) ? { token, userId } : null;
  const lang = await getEffectiveUiLang(auth);
  window.__corespeak_ui_lang = lang;
  document.documentElement.lang = lang;
  injectLanguageSelectors(lang);
  applyPageI18n(lang);
}

/**
 * Textos de lección y curso según idioma que habla el usuario (idioma_ui).
 * Las descripciones de habilidades van en ese idioma; el contenido pedagógico del API sigue en el idioma que estudia.
 */
function uiLessonCoursePack(uiLang) {
  const L = normalizeUiLang(uiLang);
  const T = {
    es: {
      back: "Volver",
      start: "Empezar",
      locked: "Bloqueado",
      lessonTitle: (n) => "Lección " + n,
      topicPrefix: "Tema",
      loadingCourse: "Cargando curso...",
      courseErrorTitle: "No se pudo cargar el curso",
      lessonsHeading: "Lecciones",
      availableCount: (n) => String(n) + " disponibles",
      progressCompleted: (done, total, level) =>
        String(done) + " de " + String(total) + " lecciones completadas · MCER " + level,
      tipTitle: "Consejo",
      tipBody: "El contenido y los ejercicios los publica el equipo desde el panel de administración.",
      catalogEmpty:
        "Todavía no hay cursos publicados para este idioma. Un administrador puede crearlos en Admin → Cursos y lecciones.",
      catalogCoursePremium: "Este curso es solo para usuarios Premium.",
      lessonSelectFromCourse: "Abre una lección desde la página del curso (enlace «Empezar»).",
      lessonLoadError: "No se pudo cargar la lección.",
      lessonNoExercises: "Esta lección aún no tiene ejercicios en el catálogo.",
      catalogCourseNoLessons: "Este curso aún no tiene lecciones publicadas.",
      premiumShort: "Premium",
      transcriptTitle: "Transcripción (listening)",
      transcriptEmpty:
        "No hay transcripción para este vídeo. Un admin puede añadirla en Admin → Lesson Builder, campo «Transcripción del vídeo».",
      exerciseCheck: "Comprobar",
      exerciseCorrect: "Correcto",
      exerciseWrong: "Incorrecto",
      exerciseNeedAnswer: "Escribe o elige una respuesta.",
      exerciseNoValidConfig: "(Sin respuestas configuradas en el catálogo)",
      exercisesHeading: "Ejercicios",
      courseErrorNetwork:
        "No se pudo conectar con el servidor. Abre la app desde la misma URL que la API (por ejemplo http://127.0.0.1:8000/ui/course.html) y comprueba que el backend está en marcha.",
      courseErrorFallback: (code) =>
        "Error " + code + ". Reinicia el servidor con uvicorn main:app desde la carpeta del proyecto.",
      skills: {
        listening: { title: "Comprensión auditiva", desc: "Audio y comprensión" },
        writing: { title: "Escritura", desc: "Escribe sobre el tema de la lección" },
        speaking: { title: "Expresión oral", desc: "Respuesta oral o escrita" },
        reading: { title: "Comprensión lectora", desc: "Lectura y comprensión del tema" },
        grammar: { title: "Gramática", desc: "Formas y reglas alineadas al tema" },
        conversacion: { title: "Conversación", desc: "Diálogo guiado sobre el tema" },
      },
    },
    en: {
      back: "Back",
      start: "Start",
      locked: "Locked",
      lessonTitle: (n) => "Lesson " + n,
      topicPrefix: "Topic",
      loadingCourse: "Loading course...",
      courseErrorTitle: "Could not load course",
      lessonsHeading: "Lessons",
      availableCount: (n) => String(n) + " available",
      progressCompleted: (done, total, level) =>
        String(done) + " of " + String(total) + " lessons completed · CEFR " + level,
      tipTitle: "Tip",
      tipBody: "Lessons and exercises are published by admins from the admin panel.",
      catalogEmpty:
        "No published courses for this language yet. An admin can add them under Admin → Courses and lessons.",
      catalogCoursePremium: "This course is for Premium users only.",
      lessonSelectFromCourse: "Open a lesson from the course page (Start button).",
      lessonLoadError: "Could not load the lesson.",
      lessonNoExercises: "This lesson has no exercises in the catalog yet.",
      catalogCourseNoLessons: "This course has no lessons yet.",
      premiumShort: "Premium",
      transcriptTitle: "Transcript (listening)",
      transcriptEmpty:
        "No transcript for this video. An admin can add it in Admin → Lesson Builder, field «Video transcript».",
      exerciseCheck: "Check",
      exerciseCorrect: "Correct",
      exerciseWrong: "Incorrect",
      exerciseNeedAnswer: "Type or select an answer.",
      exerciseNoValidConfig: "(No correct answers configured)",
      exercisesHeading: "Exercises",
      courseErrorNetwork:
        "Could not reach the server. Open the app from the same URL as the API (e.g. http://127.0.0.1:8000/ui/course.html) and make sure the backend is running.",
      courseErrorFallback: (code) =>
        "Error " + code + ". Restart the server with uvicorn main:app from the project folder.",
      skills: {
        listening: { title: "Listening", desc: "Audio and comprehension" },
        writing: { title: "Writing", desc: "Write about the lesson theme" },
        speaking: { title: "Speaking", desc: "Oral or written response" },
        reading: { title: "Reading", desc: "Read and understand the theme" },
        grammar: { title: "Grammar", desc: "Forms and rules for the theme" },
        conversacion: { title: "Conversation", desc: "Guided dialogue on the theme" },
      },
    },
    fr: {
      back: "Retour",
      start: "Commencer",
      locked: "Verrouillé",
      lessonTitle: (n) => "Leçon " + n,
      topicPrefix: "Sujet",
      loadingCourse: "Chargement du cours...",
      courseErrorTitle: "Impossible de charger le cours",
      lessonsHeading: "Leçons",
      availableCount: (n) => String(n) + " disponibles",
      progressCompleted: (done, total, level) =>
        String(done) + " sur " + String(total) + " leçons terminées · CECRL " + level,
      tipTitle: "Conseil",
      tipBody: "Le contenu et les exercices sont publiés par l’équipe depuis l’administration.",
      catalogEmpty:
        "Aucun cours publié pour cette langue. Un administrateur peut les créer dans Admin → Cours et leçons.",
      catalogCoursePremium: "Ce cours est réservé aux utilisateurs Premium.",
      lessonSelectFromCourse: "Ouvrez une leçon depuis la page du cours (bouton Commencer).",
      lessonLoadError: "Impossible de charger la leçon.",
      lessonNoExercises: "Cette leçon n’a pas encore d’exercices dans le catalogue.",
      catalogCourseNoLessons: "Ce cours n’a pas encore de leçons.",
      premiumShort: "Premium",
      transcriptTitle: "Transcription (compréhension orale)",
      transcriptEmpty:
        "Pas de transcription pour cette vidéo. Un admin peut l’ajouter dans Admin → Lesson Builder.",
      exerciseCheck: "Vérifier",
      exerciseCorrect: "Correct",
      exerciseWrong: "Incorrect",
      exerciseNeedAnswer: "Saisissez ou choisissez une réponse.",
      exerciseNoValidConfig: "(Pas de réponses configurées)",
      exercisesHeading: "Exercices",
      courseErrorNetwork:
        "Impossible de joindre le serveur. Ouvrez l’app depuis la même URL que l’API et vérifiez que le backend tourne.",
      courseErrorFallback: (code) =>
        "Erreur " + code + ". Redémarrez le serveur (uvicorn main:app) depuis le dossier du projet.",
      skills: {
        listening: { title: "Compréhension orale", desc: "Audio et compréhension" },
        writing: { title: "Écriture", desc: "Écrire sur le thème de la leçon" },
        speaking: { title: "Expression orale", desc: "Réponse orale ou écrite" },
        reading: { title: "Compréhension écrite", desc: "Lecture du thème" },
        grammar: { title: "Grammaire", desc: "Formes et règles du thème" },
        conversacion: { title: "Conversation", desc: "Dialogue guidé sur le thème" },
      },
    },
    de: {
      back: "Zurück",
      start: "Starten",
      locked: "Gesperrt",
      lessonTitle: (n) => "Lektion " + n,
      topicPrefix: "Thema",
      loadingCourse: "Kurs wird geladen...",
      courseErrorTitle: "Kurs konnte nicht geladen werden",
      lessonsHeading: "Lektionen",
      availableCount: (n) => String(n) + " verfügbar",
      progressCompleted: (done, total, level) =>
        String(done) + " von " + String(total) + " Lektionen abgeschlossen · GER " + level,
      tipTitle: "Tipp",
      tipBody: "Inhalte und Übungen veröffentlicht das Team im Admin-Bereich.",
      catalogEmpty:
        "Noch keine veröffentlichten Kurse für diese Sprache. Ein Admin kann sie unter Admin → Kurse und Lektionen anlegen.",
      catalogCoursePremium: "Dieser Kurs ist nur für Premium-Nutzer.",
      lessonSelectFromCourse: "Öffnen Sie eine Lektion von der Kursseite (Start).",
      lessonLoadError: "Lektion konnte nicht geladen werden.",
      lessonNoExercises: "Diese Lektion hat noch keine Übungen im Katalog.",
      catalogCourseNoLessons: "Dieser Kurs hat noch keine Lektionen.",
      premiumShort: "Premium",
      transcriptTitle: "Transkript (Hörverstehen)",
      transcriptEmpty:
        "Kein Transkript für dieses Video. Ein Admin kann es unter Admin → Lesson Builder hinzufügen.",
      exerciseCheck: "Prüfen",
      exerciseCorrect: "Richtig",
      exerciseWrong: "Falsch",
      exerciseNeedAnswer: "Antwort eingeben oder wählen.",
      exerciseNoValidConfig: "(Keine Musterlösung hinterlegt)",
      exercisesHeading: "Übungen",
      courseErrorNetwork:
        "Server nicht erreichbar. Öffne die App über dieselbe URL wie die API und prüfe, ob das Backend läuft.",
      courseErrorFallback: (code) =>
        "Fehler " + code + ". Starte den Server im Projektordner neu (uvicorn main:app).",
      skills: {
        listening: { title: "Hörverstehen", desc: "Audio und Verstehen" },
        writing: { title: "Schreiben", desc: "Schreiben zum Lektionsthema" },
        speaking: { title: "Sprechen", desc: "Mündlich oder schriftlich antworten" },
        reading: { title: "Leseverstehen", desc: "Lesen und Thema verstehen" },
        grammar: { title: "Grammatik", desc: "Formen und Regeln zum Thema" },
        conversacion: { title: "Gespräch", desc: "Geführtes Gespräch zum Thema" },
      },
    },
    uk: {
      back: "Назад",
      start: "Почати",
      locked: "Заблоковано",
      lessonTitle: (n) => "Урок " + n,
      topicPrefix: "Тема",
      loadingCourse: "Завантаження курсу...",
      courseErrorTitle: "Не вдалося завантажити курс",
      lessonsHeading: "Уроки",
      availableCount: (n) => String(n) + " доступно",
      progressCompleted: (done, total, level) =>
        String(done) + " з " + String(total) + " уроків завершено · MCER " + level,
      tipTitle: "Порада",
      tipBody: "Зміст і вправи публікує команда в панелі адміністратора.",
      catalogEmpty:
        "Поки немає опублікованих курсів для цієї мови. Адміністратор може додати їх: Admin → Курси й уроки.",
      catalogCoursePremium: "Цей курс лише для користувачів Premium.",
      lessonSelectFromCourse: "Відкрийте урок зі сторінки курсу (кнопка «Почати»).",
      lessonLoadError: "Не вдалося завантажити урок.",
      lessonNoExercises: "У цього урока ще немає вправ у каталозі.",
      catalogCourseNoLessons: "У цього курсу ще немає уроків.",
      premiumShort: "Premium",
      transcriptTitle: "Транскрипт (аудіювання)",
      transcriptEmpty:
        "Немає транскрипту для цього відео. Адміністратор може додати його в Admin → Lesson Builder.",
      exerciseCheck: "Перевірити",
      exerciseCorrect: "Вірно",
      exerciseWrong: "Невірно",
      exerciseNeedAnswer: "Введіть або оберіть відповідь.",
      exerciseNoValidConfig: "(Відповіді не налаштовані)",
      exercisesHeading: "Вправи",
      courseErrorNetwork:
        "Не вдалося зв’язатися з сервером. Відкрийте застосунок з тієї ж адреси, що й API, і перевірте, чи запущений бекенд.",
      courseErrorFallback: (code) =>
        "Помилка " + code + ". Перезапустіть сервер (uvicorn main:app) у папці проєкту.",
      skills: {
        listening: { title: "Аудіювання", desc: "Аудіо та розуміння" },
        writing: { title: "Письмо", desc: "Пишіть на тему уроку" },
        speaking: { title: "Говоріння", desc: "Усна або письмова відповідь" },
        reading: { title: "Читання", desc: "Читання та розуміння теми" },
        grammar: { title: "Граматика", desc: "Форми й правила теми" },
        conversacion: { title: "Розмова", desc: "Керований діалог на тему" },
      },
    },
  };
  return T[L] || T.es;
}

/** Textos de navegación y páginas (data-i18n) por idioma de interfaz. */
const CORESPEAK_PAGE_I18N = {
  es: {
    nav: {
      uiLang: "Idioma",
      settings: "Configuración",
      logout: "Cerrar sesión",
      premiumCta: "Hazte Premium",
      premiumHint: "Idiomas · IA · contenido exclusivo",
    },
    dashboard: {
      greetingHi: "¡Hola,",
      userFallback: "Usuario",
      journey: "Continúa tu viaje de aprendizaje",
      dailyTitle: "Reto diario",
      dailySub: "Completa tu desafío hoy",
      streakTitle: "Racha",
      streakDays: "{n} días consecutivos",
      xpTitle: "Puntos",
      xpTotal: "{n} XP acumulados",
      agendaTitle: "Agenda",
      agendaSub: "Palabras y significados",
      myCourses: "Mis cursos",
      otherCourses: "Otros cursos",
      courseSubtitle: "Comenzar curso",
      courseBtn: "Comenzar",
      profileLoadError: "No se pudo cargar tu perfil. Recarga la página.",
      misSub1: "Cursos publicados en los idiomas que marcaste en el test inicial.",
      misSub2: "No hay idiomas objetivo en tu perfil, o aún no hay cursos publicados en esos idiomas.",
      misSub3: "Configura tus idiomas objetivo para verlos aquí.",
      misHintHtml:
        'Ve a <a href="configuracion.html">configuración</a>, marca los idiomas que quieres aprender y guarda: aparecerán solo aquí, en Mis cursos.',
      misNoPublished:
        "Todavía no hay cursos publicados en tus idiomas. En Admin, crea el curso y deja marcado «Publicado».",
      otrosIntroA: "Cursos en otros idiomas. Los creados en administración aparecen aquí cuando están publicados.",
      otrosIntroB:
        "Todos los cursos publicados. Marca idiomas en el test inicial para ver algunos arriba en «Mis cursos».",
      catalogFetchError: "No se pudo cargar el catálogo de cursos. Recarga o vuelve a iniciar sesión.",
      courseLessonsOne: "1 lección",
      courseLessonsMany: "{n} lecciones",
    },
    retos: {
      back: "Volver",
      dailyBadge: "Reto diario",
      todayTitle: "Tu reto de hoy",
      todayLead: "Completa estos desafíos para mantener tu racha de aprendizaje",
      dailyWelcome: "¡Hola, {name}! Aquí tienes tu reto del día.",
      answerLabel: "Tu respuesta",
      challengeLabel: "CoreSpeak",
      feedbackLabel: "CoreSpeak",
      youLabel: "Tú",
      typeLabel: "Tipo:",
      answerHint: "Escribe tu respuesta y pulsa comprobar",
      checkBtn: "Comprobar respuesta",
      loading: "Cargando...",
      statXp: "XP",
      statStreak: "Racha",
      statLast: "Última correcta",
      statAccuracy: "Precisión",
      progressDemo: "Pregunta 1 de 3",
      answerPh: "Escribe tu respuesta",
      convPh: "Escribe tu respuesta como en un chat…",
    },
    practice: {
      backDash: "Volver",
      title: "Práctica con IA",
      skillPrefix: "Habilidad:",
      audioListening: "Audio (listening)",
      loading: "Cargando...",
      send: "Enviar respuesta",
      generateAnother: "Generar otro",
      grammarSelectPrompt: "Elige…",
      grammarLineA: "A:",
      grammarLineB: "B:",
      grammarIncomplete: "Completa todos los huecos antes de enviar.",
    },
    agenda: {
      backPanel: "Volver al panel",
      pill: "✦ Tu bitácora lingüística",
      title: "Agenda de vocabulario",
      lead: "Guarda palabra y significado en tu agenda para repasar vocabulario cuando quieras.",
      newEntry: "+ Nueva palabra",
      thWord: "Palabra",
      thMeaning: "Significado",
      thActions: "Acciones",
      loadingTbl: "Cargando tu agenda…",
      modalTitle: "Nueva palabra",
      modalLead: "Escribe la palabra que quieres guardar; el significado puedes completarlo ahora o después en la tabla.",
      wordLbl: "Palabra",
      meaningLbl: "Significado",
      optional: "(opcional)",
      wordPh: "Ej.: resilience, bonjour…",
      meanPh: "Traducción, definición o nota",
      addBtn: "Añadir a la agenda",
      cancelBtn: "Cancelar",
      emptyHtml:
        "Tu agenda está vacía. Pulsa <strong>Nueva palabra</strong> y empieza a coleccionar palabras.",
      rowWordPh: "Palabra o expresión",
      rowMeanPh: "Traducción o definición",
      deleteRowTitle: "Eliminar fila",
      confirmDelete: "¿Eliminar esta palabra de la agenda?",
    },
    login: {
      title: "Iniciar sesión",
      lead: "Ingresa a tu cuenta para continuar aprendiendo",
      email: "Correo electrónico",
      password: "Contraseña",
      submit: "Iniciar sesión",
      forgot: "¿Olvidaste tu contraseña?",
      noAccount: "¿No tienes cuenta?",
      register: "Regístrate aquí",
      phEmail: "tu@email.com",
    },
    register: {
      title: "Crear cuenta",
      lead: "Únete a CoreSpeak y comienza tu viaje de aprendizaje",
      name: "Nombre",
      surname: "Apellido",
      birth: "Fecha de nacimiento",
      email: "Correo electrónico",
      password: "Contraseña",
      confirm: "Confirmar contraseña",
      uiLangLbl: "Idioma de la interfaz",
      uiLangHelp: "Menús y textos de la app en el idioma que prefieres.",
      submit: "Crear cuenta",
      terms: "Al registrarte, aceptas nuestros términos de servicio y política de privacidad",
      hasAccount: "¿Ya tienes cuenta?",
      loginLink: "Inicia sesión aquí",
      back: "Volver",
    },
    onboarding: {
      title: "Test inicial rápido",
      lead: "Así personalizamos tus cursos en el dashboard y los ejercicios con IA.",
      occQ: "¿A qué te dedicas?",
      occPh: "Ej.: estudiante de medicina, diseñadora UX, enfermero…",
      langsQ: "¿Qué idiomas quieres aprender?",
      langsHint: "Marca uno o varios. Solo esos aparecerán en Mis cursos.",
      levelHint: "Solo se muestran los idiomas que marcaste arriba. Marco CEFR.",
      levelSection: "Nivel actual por idioma",
      levelOptional: "(opcional)",
      save: "Guardar y continuar",
      langEn: "Inglés",
      langEs: "Español",
      langFr: "Francés",
      langDe: "Alemán",
      langUk: "Ucraniano",
    },
    config: {
      title: "Configuración",
      lead: "Administra tu perfil y preferencias",
      back: "Volver",
      personalTitle: "Información personal",
      personalSub: "Actualiza tus datos personales",
      name: "Nombre",
      surname: "Apellido",
      email: "Correo electrónico",
      birth: "Fecha de nacimiento",
    },
  },
  en: {
    nav: {
      uiLang: "Language",
      settings: "Settings",
      logout: "Log out",
      premiumCta: "Go Premium",
      premiumHint: "Languages · AI · full access",
    },
    dashboard: {
      greetingHi: "Hello,",
      userFallback: "User",
      journey: "Continue your learning journey",
      dailyTitle: "Daily challenge",
      dailySub: "Complete your challenge today",
      streakTitle: "Streak",
      streakDays: "{n} days in a row",
      xpTitle: "Points",
      xpTotal: "{n} XP earned",
      agendaTitle: "Notebook",
      agendaSub: "Words and meanings",
      myCourses: "My courses",
      otherCourses: "Other courses",
      courseSubtitle: "Start course",
      courseBtn: "Start",
      profileLoadError: "Could not load your profile. Reload the page.",
      misSub1: "Only the languages you want to learn (initial test).",
      misSub2: "No target languages in your profile. Complete or update the test to fill this section.",
      misSub3: "Set your target languages to show them here.",
      misHintHtml:
        'Go to <a href="configuracion.html">settings</a>, pick the languages you want to learn and save — they will appear here under My courses.',
      misNoPublished:
        "No published courses in your languages yet. In Admin, create the course and keep it published.",
      otrosIntroA: "Courses in other languages. Admin-created courses show here when published.",
      otrosIntroB:
        "All published courses. Set your languages in onboarding to see some under My courses.",
      catalogFetchError: "Could not load the course catalog. Reload or sign in again.",
      courseLessonsOne: "1 lesson",
      courseLessonsMany: "{n} lessons",
    },
    retos: {
      back: "Back",
      dailyBadge: "Daily challenge",
      todayTitle: "Your challenge today",
      todayLead: "Complete these challenges to keep your learning streak",
      dailyWelcome: "Hi, {name}! Here’s your challenge for today.",
      answerLabel: "Your answer",
      challengeLabel: "CoreSpeak",
      feedbackLabel: "CoreSpeak",
      youLabel: "You",
      typeLabel: "Type:",
      answerHint: "Write your answer and tap check",
      checkBtn: "Check answer",
      loading: "Loading...",
      statXp: "XP",
      statStreak: "Streak",
      statLast: "Last correct",
      statAccuracy: "Accuracy",
      progressDemo: "Question 1 of 3",
      answerPh: "Write your answer",
      convPh: "Type your reply like in a chat…",
    },
    practice: {
      backDash: "Back",
      title: "Practice with AI",
      skillPrefix: "Skill:",
      audioListening: "Audio (listening)",
      loading: "Loading...",
      send: "Send answer",
      generateAnother: "Generate another",
      grammarSelectPrompt: "Choose…",
      grammarLineA: "A:",
      grammarLineB: "B:",
      grammarIncomplete: "Fill every gap before submitting.",
    },
    agenda: {
      backPanel: "Back to dashboard",
      pill: "✦ Your language log",
      title: "Vocabulary notebook",
      lead: "Save word and meaning to review vocabulary whenever you want.",
      newEntry: "+ New word",
      thWord: "Word",
      thMeaning: "Meaning",
      thActions: "Actions",
      loadingTbl: "Loading your notebook…",
      modalTitle: "New word",
      modalLead: "Type the word to save; you can add the meaning now or later in the table.",
      wordLbl: "Word",
      meaningLbl: "Meaning",
      optional: "(optional)",
      wordPh: "e.g. resilience, bonjour…",
      meanPh: "Translation, definition or note",
      addBtn: "Add to notebook",
      cancelBtn: "Cancel",
      emptyHtml:
        "Your notebook is empty. Tap <strong>New word</strong> and start collecting words.",
      rowWordPh: "Word or phrase",
      rowMeanPh: "Translation or definition",
      deleteRowTitle: "Delete row",
      confirmDelete: "Delete this word from your notebook?",
    },
    login: {
      title: "Log in",
      lead: "Sign in to keep learning",
      email: "Email",
      password: "Password",
      submit: "Log in",
      forgot: "Forgot your password?",
      noAccount: "No account yet?",
      register: "Register here",
      phEmail: "you@email.com",
    },
    register: {
      title: "Create account",
      lead: "Join CoreSpeak and start learning",
      name: "First name",
      surname: "Last name",
      birth: "Date of birth",
      email: "Email",
      password: "Password",
      confirm: "Confirm password",
      uiLangLbl: "Interface language",
      uiLangHelp: "App menus and texts in your preferred language.",
      submit: "Create account",
      terms: "By signing up you accept our terms of service and privacy policy",
      hasAccount: "Already have an account?",
      loginLink: "Log in here",
      back: "Back",
    },
    onboarding: {
      title: "Quick initial test",
      lead: "We use this to personalize courses on your dashboard and AI exercises.",
      occQ: "What do you do?",
      occPh: "e.g. medical student, UX designer, nurse…",
      langsQ: "Which languages do you want to learn?",
      langsHint: "Pick one or more. Only those will show under My courses.",
      levelHint: "Only languages you checked above. CEFR scale.",
      levelSection: "Current level per language",
      levelOptional: "(optional)",
      save: "Save and continue",
      langEn: "English",
      langEs: "Spanish",
      langFr: "French",
      langDe: "German",
      langUk: "Ukrainian",
    },
    config: {
      title: "Settings",
      lead: "Manage your profile and preferences",
      back: "Back",
      personalTitle: "Personal information",
      personalSub: "Update your personal details",
      name: "First name",
      surname: "Last name",
      email: "Email",
      birth: "Date of birth",
    },
  },
  fr: {
    nav: {
      uiLang: "Langue",
      settings: "Réglages",
      logout: "Déconnexion",
      premiumCta: "Passez au Premium",
      premiumHint: "Langues · IA · contenu exclusif",
    },
    dashboard: {
      greetingHi: "Bonjour,",
      userFallback: "Utilisateur",
      journey: "Poursuivez votre apprentissage",
      dailyTitle: "Défi du jour",
      dailySub: "Complétez votre défi aujourd’hui",
      streakTitle: "Série",
      streakDays: "{n} jours d’affilée",
      xpTitle: "Points",
      xpTotal: "{n} XP cumulés",
      agendaTitle: "Agenda",
      agendaSub: "Mots et sens",
      myCourses: "Mes cours",
      otherCourses: "Autres cours",
      courseSubtitle: "Commencer le cours",
      courseBtn: "Commencer",
      profileLoadError: "Impossible de charger le profil. Rechargez la page.",
      misSub1: "Uniquement les langues que vous voulez apprendre (test initial).",
      misSub2: "Aucune langue cible dans votre profil. Complétez le test.",
      misSub3: "Configurez vos langues cibles pour les voir ici.",
      misHintHtml:
        'Allez dans <a href="configuracion.html">les paramètres</a>, choisissez vos langues et enregistrez.',
      misNoPublished:
        "Aucun cours publié pour vos langues. Dans Admin, créez le cours et laissez « Publié » coché.",
      otrosIntroA: "Cours dans d’autres langues. Les cours créés en admin apparaissent ici s’ils sont publiés.",
      otrosIntroB: "Tous les cours publiés. Le test initial place certains cours dans « Mes cours ».",
      catalogFetchError: "Impossible de charger le catalogue. Rechargez ou reconnectez-vous.",
      courseLessonsOne: "1 leçon",
      courseLessonsMany: "{n} leçons",
    },
    retos: {
      back: "Retour",
      dailyBadge: "Défi du jour",
      todayTitle: "Votre défi du jour",
      todayLead: "Complétez les défis pour garder votre série",
      dailyWelcome: "Salut, {name} ! Voici ton défi du jour.",
      answerLabel: "Ta réponse",
      challengeLabel: "CoreSpeak",
      feedbackLabel: "CoreSpeak",
      youLabel: "Toi",
      typeLabel: "Type :",
      answerHint: "Écrivez votre réponse puis vérifiez",
      checkBtn: "Vérifier la réponse",
      loading: "Chargement...",
      statXp: "XP",
      statStreak: "Série",
      statLast: "Dernière bonne",
      statAccuracy: "Précision",
      progressDemo: "Question 1 sur 3",
      answerPh: "Écrivez votre réponse",
      convPh: "Écrivez votre réponse comme dans un chat…",
    },
    practice: {
      backDash: "Retour",
      title: "Pratique avec l’IA",
      skillPrefix: "Compétence :",
      audioListening: "Audio (compréhension orale)",
      loading: "Chargement...",
      send: "Envoyer la réponse",
      generateAnother: "Générer un autre",
      grammarSelectPrompt: "Choisis…",
      grammarLineA: "A :",
      grammarLineB: "B :",
      grammarIncomplete: "Remplis tous les trous avant d’envoyer.",
    },
    agenda: {
      backPanel: "Retour au tableau de bord",
      pill: "✦ Votre carnet de langue",
      title: "Carnet de vocabulaire",
      lead: "Enregistrez mot et sens pour réviser quand vous voulez.",
      newEntry: "+ Nouveau mot",
      thWord: "Mot",
      thMeaning: "Sens",
      thActions: "Actions",
      loadingTbl: "Chargement…",
      modalTitle: "Nouveau mot",
      modalLead: "Saisissez le mot ; le sens peut attendre.",
      wordLbl: "Mot",
      meaningLbl: "Sens",
      optional: "(facultatif)",
      wordPh: "ex. resilience, bonjour…",
      meanPh: "Traduction ou note",
      addBtn: "Ajouter",
      cancelBtn: "Annuler",
      emptyHtml:
        "Votre carnet est vide. Appuyez sur <strong>Nouveau mot</strong> pour commencer.",
      rowWordPh: "Mot ou expression",
      rowMeanPh: "Traduction ou définition",
      deleteRowTitle: "Supprimer la ligne",
      confirmDelete: "Supprimer ce mot ?",
    },
    login: {
      title: "Connexion",
      lead: "Connectez-vous pour continuer",
      email: "E-mail",
      password: "Mot de passe",
      submit: "Se connecter",
      forgot: "Mot de passe oublié ?",
      noAccount: "Pas encore de compte ?",
      register: "Inscrivez-vous",
      phEmail: "vous@email.com",
    },
    register: {
      title: "Créer un compte",
      lead: "Rejoignez CoreSpeak",
      name: "Prénom",
      surname: "Nom",
      birth: "Date de naissance",
      email: "E-mail",
      password: "Mot de passe",
      confirm: "Confirmer",
      uiLangLbl: "Langue de l’interface",
      uiLangHelp: "Menus et textes dans la langue choisie.",
      submit: "Créer le compte",
      terms: "En vous inscrivant vous acceptez les conditions.",
      hasAccount: "Déjà un compte ?",
      loginLink: "Connectez-vous",
      back: "Retour",
    },
    onboarding: {
      title: "Test initial rapide",
      lead: "Personnalisation des cours et exercices IA.",
      occQ: "Que faites-vous ?",
      occPh: "ex. étudiant en médecine…",
      langsQ: "Quelles langues voulez-vous apprendre ?",
      langsHint: "Cochez une ou plusieurs langues.",
      levelHint: "Uniquement les langues cochées ci-dessus. Cadre CECRL.",
      levelSection: "Niveau actuel par langue",
      levelOptional: "(facultatif)",
      save: "Enregistrer",
      langEn: "Anglais",
      langEs: "Espagnol",
      langFr: "Français",
      langDe: "Allemand",
      langUk: "Ukrainien",
    },
    config: {
      title: "Réglages",
      lead: "Profil et préférences",
      back: "Retour",
      personalTitle: "Informations personnelles",
      personalSub: "Mettez à jour vos données",
      name: "Prénom",
      surname: "Nom",
      email: "E-mail",
      birth: "Date de naissance",
    },
  },
  de: {
    nav: {
      uiLang: "Sprache",
      settings: "Einstellungen",
      logout: "Abmelden",
      premiumCta: "Premium werden",
      premiumHint: "Sprachen · KI · Exklusivinhalt",
    },
    dashboard: {
      greetingHi: "Hallo,",
      userFallback: "Nutzer",
      journey: "Mach weiter mit deinem Lernen",
      dailyTitle: "Tageschallenge",
      dailySub: "Schließe heute deine Aufgabe ab",
      streakTitle: "Serie",
      streakDays: "{n} Tage in Folge",
      xpTitle: "Punkte",
      xpTotal: "{n} XP gesamt",
      agendaTitle: "Notizbuch",
      agendaSub: "Wörter und Bedeutungen",
      myCourses: "Meine Kurse",
      otherCourses: "Weitere Kurse",
      courseSubtitle: "Kurs starten",
      courseBtn: "Starten",
      profileLoadError: "Profil konnte nicht geladen werden. Seite neu laden.",
      misSub1: "Nur die Sprachen, die du lernen willst (Ersttest).",
      misSub2: "Keine Zielsprachen im Profil. Bitte Test ausfüllen.",
      misSub3: "Zielsprachen einstellen, um sie hier zu sehen.",
      misHintHtml: 'Gehe zu <a href="configuracion.html">Einstellungen</a>, Sprachen wählen und speichern.',
      misNoPublished:
        "Noch keine veröffentlichten Kurse für deine Sprachen. In Admin Kurs anlegen und « Veröffentlicht » aktivieren.",
      otrosIntroA: "Kurse in anderen Sprachen. Im Admin erstellte Kurse erscheinen hier, wenn veröffentlicht.",
      otrosIntroB: "Alle veröffentlichten Kurse. Der Einstiegstest sortiert welche unter « Meine Kurse ».",
      catalogFetchError: "Katalog konnte nicht geladen werden. Neu laden oder erneut anmelden.",
      courseLessonsOne: "1 Lektion",
      courseLessonsMany: "{n} Lektionen",
    },
    retos: {
      back: "Zurück",
      dailyBadge: "Tageschallenge",
      todayTitle: "Deine Challenge heute",
      todayLead: "Aufgaben lösen, um deine Serie zu halten",
      dailyWelcome: "Hallo, {name}! Hier ist deine Challenge für heute.",
      answerLabel: "Deine Antwort",
      challengeLabel: "CoreSpeak",
      feedbackLabel: "CoreSpeak",
      youLabel: "Du",
      typeLabel: "Typ:",
      answerHint: "Antwort schreiben und prüfen",
      checkBtn: "Antwort prüfen",
      loading: "Lädt...",
      statXp: "XP",
      statStreak: "Serie",
      statLast: "Zuletzt richtig",
      statAccuracy: "Genauigkeit",
      progressDemo: "Frage 1 von 3",
      answerPh: "Schreiben Sie Ihre Antwort",
      convPh: "Antwort wie im Chat schreiben…",
    },
    practice: {
      backDash: "Zurück",
      title: "Üben mit KI",
      skillPrefix: "Fertigkeit:",
      audioListening: "Audio (Hörverstehen)",
      loading: "Lädt...",
      send: "Antwort senden",
      generateAnother: "Neue Aufgabe",
      grammarSelectPrompt: "Wählen…",
      grammarLineA: "A:",
      grammarLineB: "B:",
      grammarIncomplete: "Fülle alle Lücken aus, bevor du sendest.",
    },
    agenda: {
      backPanel: "Zurück zum Dashboard",
      pill: "✦ Dein Sprachenlogbuch",
      title: "Vokabelnotizbuch",
      lead: "Speichere Wort und Bedeutung in deinem Notizbuch, um Vokabeln jederzeit zu wiederholen.",
      newEntry: "+ Neues Wort",
      thWord: "Wort",
      thMeaning: "Bedeutung",
      thActions: "Aktionen",
      loadingTbl: "Notizbuch wird geladen…",
      modalTitle: "Neues Wort",
      modalLead: "Wort eingeben; Bedeutung kann später folgen.",
      wordLbl: "Wort",
      meaningLbl: "Bedeutung",
      optional: "(optional)",
      wordPh: "z. B. resilience, bonjour…",
      meanPh: "Übersetzung oder Notiz",
      addBtn: "Zum Notizbuch hinzufügen",
      cancelBtn: "Abbrechen",
      emptyHtml:
        "Dein Notizbuch ist leer. Tippe auf <strong>Neues Wort</strong>, um Vokabeln zu sammeln.",
      rowWordPh: "Wort oder Ausdruck",
      rowMeanPh: "Übersetzung oder Definition",
      deleteRowTitle: "Zeile löschen",
      confirmDelete: "Dieses Wort aus dem Notizbuch löschen?",
    },
    login: {
      title: "Anmelden",
      lead: "Melde dich an, um weiterzulernen",
      email: "E-Mail",
      password: "Passwort",
      submit: "Anmelden",
      forgot: "Passwort vergessen?",
      noAccount: "Noch kein Konto?",
      register: "Hier registrieren",
      phEmail: "du@email.com",
    },
    register: {
      title: "Konto erstellen",
      lead: "CoreSpeak beitreten",
      name: "Vorname",
      surname: "Nachname",
      birth: "Geburtsdatum",
      email: "E-Mail",
      password: "Passwort",
      confirm: "Bestätigen",
      uiLangLbl: "Oberflächensprache",
      uiLangHelp: "Menüs und Texte in deiner Sprache.",
      submit: "Konto erstellen",
      terms: "Mit der Registrierung akzeptierst du die Bedingungen.",
      hasAccount: "Schon ein Konto?",
      loginLink: "Hier anmelden",
      back: "Zurück",
    },
    onboarding: {
      title: "Schnelltest",
      lead: "Personalisierung von Kursen und KI-Übungen.",
      occQ: "Was machst du beruflich?",
      occPh: "z. B. Medizinstudent…",
      langsQ: "Welche Sprachen willst du lernen?",
      langsHint: "Eine oder mehrere auswählen.",
      levelHint: "Nur oben angehakte Sprachen. GER-Rahmen.",
      levelSection: "Aktuelles Niveau pro Sprache",
      levelOptional: "(optional)",
      save: "Speichern",
      langEn: "Englisch",
      langEs: "Spanisch",
      langFr: "Französisch",
      langDe: "Deutsch",
      langUk: "Ukrainisch",
    },
    config: {
      title: "Einstellungen",
      lead: "Profil und Einstellungen",
      back: "Zurück",
      personalTitle: "Persönliche Daten",
      personalSub: "Daten aktualisieren",
      name: "Vorname",
      surname: "Nachname",
      email: "E-Mail",
      birth: "Geburtsdatum",
    },
  },
  uk: {
    nav: {
      uiLang: "Мова",
      settings: "Налаштування",
      logout: "Вийти",
      premiumCta: "Стань Premium",
      premiumHint: "Мови · ШІ · ексклюзив",
    },
    dashboard: {
      greetingHi: "Привіт,",
      userFallback: "Користувач",
      journey: "Продовжуй навчання",
      dailyTitle: "Щоденний виклик",
      dailySub: "Виконай завдання сьогодні",
      streakTitle: "Серія",
      streakDays: "{n} днів поспіль",
      xpTitle: "Бали",
      xpTotal: "{n} XP загалом",
      agendaTitle: "Щоденник",
      agendaSub: "Слова та значення",
      myCourses: "Мої курси",
      otherCourses: "Інші курси",
      courseSubtitle: "Почати курс",
      courseBtn: "Почати",
      profileLoadError: "Не вдалося завантажити профіль. Перезавантажте сторінку.",
      misSub1: "Лише мови, які хочете вивчати (початковий тест).",
      misSub2: "Немає цільових мов у профілі. Пройдіть тест.",
      misSub3: "Налаштуйте цільові мови, щоб бачити їх тут.",
      misHintHtml: 'Перейдіть у <a href="configuracion.html">налаштування</a>, оберіть мови й збережіть.',
      misNoPublished:
        "Поки немає опублікованих курсів для ваших мов. У Admin створіть курс і залиште «Опубліковано».",
      otrosIntroA: "Курси іншими мовами. Створені в адмінці з’являються тут, якщо опубліковані.",
      otrosIntroB: "Усі опубліковані курси. Початковий тест визначає, які показувати в «Мої курси».",
      catalogFetchError: "Не вдалося завантажити каталог. Перезавантажте сторінку або увійдіть знову.",
      courseLessonsOne: "1 урок",
      courseLessonsMany: "{n} уроків",
    },
    retos: {
      back: "Назад",
      dailyBadge: "Щоденний виклик",
      todayTitle: "Твій виклик сьогодні",
      todayLead: "Виконуйте завдання, щоб тримати серію",
      dailyWelcome: "Привіт, {name}! Ось твій виклик на сьогодні.",
      answerLabel: "Твоя відповідь",
      challengeLabel: "CoreSpeak",
      feedbackLabel: "CoreSpeak",
      youLabel: "Ти",
      typeLabel: "Тип:",
      answerHint: "Напишіть відповідь і натисніть перевірити",
      checkBtn: "Перевірити відповідь",
      loading: "Завантаження...",
      statXp: "XP",
      statStreak: "Серія",
      statLast: "Остання вірна",
      statAccuracy: "Точність",
      progressDemo: "Питання 1 з 3",
      answerPh: "Напишіть відповідь",
      convPh: "Напишіть відповідь, як у чаті…",
    },
    practice: {
      backDash: "Назад",
      title: "Практика з ШІ",
      skillPrefix: "Навичка:",
      audioListening: "Аудіо (аудіювання)",
      loading: "Завантаження...",
      send: "Надіслати відповідь",
      generateAnother: "Інше завдання",
      grammarSelectPrompt: "Обери…",
      grammarLineA: "A:",
      grammarLineB: "B:",
      grammarIncomplete: "Заповни всі пропуски перед надсиланням.",
    },
    agenda: {
      backPanel: "Назад до панелі",
      pill: "✦ Ваш мовний щоденник",
      title: "Щоденник лексики",
      lead: "Зберігайте слово й значення в щоденнику, щоб повторювати лексику коли завгодно.",
      newEntry: "+ Нове слово",
      thWord: "Слово",
      thMeaning: "Значення",
      thActions: "Дії",
      loadingTbl: "Завантаження щоденника…",
      modalTitle: "Нове слово",
      modalLead: "Введіть слово; значення можна додати пізніше.",
      wordLbl: "Слово",
      meaningLbl: "Значення",
      optional: "(необов’язково)",
      wordPh: "напр. resilience, bonjour…",
      meanPh: "Переклад або нотатка",
      addBtn: "Додати до щоденника",
      cancelBtn: "Скасувати",
      emptyHtml:
        "Ваш щоденник порожній. Натисніть <strong>Нове слово</strong>, щоб зібрати слова.",
      rowWordPh: "Слово або вираз",
      rowMeanPh: "Переклад або визначення",
      deleteRowTitle: "Видалити рядок",
      confirmDelete: "Видалити це слово з щоденника?",
    },
    login: {
      title: "Увійти",
      lead: "Увійдіть, щоб продовжити навчання",
      email: "Електронна пошта",
      password: "Пароль",
      submit: "Увійти",
      forgot: "Забули пароль?",
      noAccount: "Немає облікового запису?",
      register: "Зареєструватися",
      phEmail: "ви@email.com",
    },
    register: {
      title: "Створити обліковий запис",
      lead: "Приєднуйтесь до CoreSpeak",
      name: "Ім’я",
      surname: "Прізвище",
      birth: "Дата народження",
      email: "Пошта",
      password: "Пароль",
      confirm: "Підтвердіть пароль",
      uiLangLbl: "Мова інтерфейсу",
      uiLangHelp: "Меню й тексти обраною мовою.",
      submit: "Створити обліковий запис",
      terms: "Реєструючись, ви приймаєте умови.",
      hasAccount: "Вже є обліковий запис?",
      loginLink: "Увійти",
      back: "Назад",
    },
    onboarding: {
      title: "Швидкий початковий тест",
      lead: "Персоналізація курсів і вправ зі ШІ.",
      occQ: "Чим ви займаєтесь?",
      occPh: "напр. студент-медик…",
      langsQ: "Які мови хочете вивчати?",
      langsHint: "Оберіть одну або кілька.",
      levelHint: "Лише мови, які позначили вище. Шкала MCER.",
      levelSection: "Поточний рівень за мовою",
      levelOptional: "(необов’язково)",
      save: "Зберегти",
      langEn: "Англійська",
      langEs: "Іспанська",
      langFr: "Французька",
      langDe: "Німецька",
      langUk: "Українська",
    },
    config: {
      title: "Налаштування",
      lead: "Профіль і параметри",
      back: "Назад",
      personalTitle: "Особисті дані",
      personalSub: "Оновіть дані",
      name: "Ім’я",
      surname: "Прізвище",
      email: "Пошта",
      birth: "Дата народження",
    },
  },
};

function getUiPack(lang) {
  const L = normalizeUiLang(lang);
  const page = CORESPEAK_PAGE_I18N[L] || CORESPEAK_PAGE_I18N.es;
  return { ...uiLessonCoursePack(L), ...page };
}

function isValidStoredUserId(userId) {
  return typeof userId === "string" && /^\d+$/.test(userId);
}

function clearAuthStorage() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_ID_KEY);
}

/** Cierra sesión en el cliente y va al login (sin token, no re-dispara el auto-redirect al panel). */
function logout() {
  clearAuthStorage();
  window.location.replace("inicio_session.html");
}

if (typeof CoreSpeakA11y !== "undefined") {
  CoreSpeakA11y.initLogoutButtons(logout);
} else {
  document.addEventListener("click", (e) => {
    const el = e.target.closest(".corespeak-logout");
    if (!el) return;
    e.preventDefault();
    logout();
  });
}

function requireAuth() {
  const token = getStoredToken();
  const userId = localStorage.getItem(USER_ID_KEY);
  if (!token || !isValidStoredUserId(userId)) {
    clearAuthStorage();
    window.location.href = "inicio_session.html";
    return null;
  }
  return { token, userId };
}

/** Si ya hay sesión guardada, no mostrar de nuevo el login (volver al panel). */
async function redirectIfAlreadyLoggedIn() {
  const token = getStoredToken();
  const userId = localStorage.getItem(USER_ID_KEY);
  if (!token || !isValidStoredUserId(userId)) {
    return;
  }

  const res = await fetch(apiUrl("/api/users/me/profile"), {
    headers: { Authorization: "Bearer " + token },
  });
  if (res.status === 401) {
    clearAuthStorage();
    return;
  }
  if (res.ok) {
    window.location.replace("dashboard.html");
    return;
  }
  // API mínima sin /me/profile (p. ej. algunos despliegues): token + id numérico → panel.
  window.location.replace("dashboard.html");
}

/** Texto legible desde respuestas de error de FastAPI (detail string | lista de validación). */
function formatApiErrorDetail(data) {
  const d = data && data.detail;
  if (d == null) return "";
  if (typeof d === "string") return d;
  if (Array.isArray(d)) {
    return d
      .map((x) => (typeof x === "object" && x != null ? x.msg || x.message || JSON.stringify(x) : String(x)))
      .filter(Boolean)
      .join(" ");
  }
  if (typeof d === "object" && d.msg) return String(d.msg);
  return "";
}

function setAlertMessage(el, message, variant, fallbackToWindowAlert) {
  const text = String(message || "").trim();
  if (!el) {
    if (text && fallbackToWindowAlert) window.alert(text);
    return;
  }
  if (!text) {
    el.textContent = "";
    el.classList.add("d-none");
    return;
  }
  const tone =
    variant === "ok"
      ? "alert-success"
      : variant === "info"
        ? "alert-info"
        : variant === "warn"
          ? "alert-warning"
          : "alert-danger";
  const margin = el.classList.contains("mb-4") ? "mb-4" : "mb-3";
  el.textContent = text;
  el.className = "alert py-2 px-3 small " + margin + " " + tone;
  el.classList.remove("d-none");
}

function setLoginFormMessage(message, variant, fieldErrors) {
  const a11y = typeof CoreSpeakA11y !== "undefined" ? CoreSpeakA11y : null;
  const pairs = [
    ["login-email", "login-email-error"],
    ["login-password", "login-password-error"],
  ];
  if (a11y) a11y.clearFieldErrors(pairs);
  if (fieldErrors && a11y) {
    Object.keys(fieldErrors).forEach((inputId) => {
      const errId = inputId + "-error";
      a11y.setFieldError(inputId, errId, fieldErrors[inputId]);
    });
  }
  const el = document.getElementById("login-error");
  setAlertMessage(el, message, variant || "err", true);
}

function setLoginFormError(message, fieldErrors) {
  setLoginFormMessage(message, "err", fieldErrors);
}

function setRegisterFormMessage(message, variant, fieldErrors) {
  const a11y = typeof CoreSpeakA11y !== "undefined" ? CoreSpeakA11y : null;
  const pairs = [
    ["register-nombre", "register-nombre-error"],
    ["register-email", "register-email-error"],
    ["register-password", "register-password-error"],
    ["register-password-confirm", "register-password-confirm-error"],
    ["register-consent", "register-consent-error"],
  ];
  if (a11y) a11y.clearFieldErrors(pairs);
  if (fieldErrors && a11y) {
    Object.keys(fieldErrors).forEach((inputId) => {
      const errId = inputId + "-error";
      a11y.setFieldError(inputId, errId, fieldErrors[inputId]);
    });
  }
  const el = document.getElementById("register-error");
  setAlertMessage(el, message, variant || "err", true);
}

function setRegisterFormError(message, fieldErrors) {
  setRegisterFormMessage(message, "err", fieldErrors);
}

function isValidEmailFormat(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

function validateLoginClientSide() {
  const email = document.getElementById("login-email")?.value?.trim() || "";
  const password = document.getElementById("login-password")?.value || "";
  const fieldErrors = {};
  if (!email) {
    fieldErrors["login-email"] = "Introduce tu correo electrónico.";
  } else if (!isValidEmailFormat(email)) {
    fieldErrors["login-email"] = "Introduce un correo con formato nombre@dominio.com.";
  }
  if (!password) {
    fieldErrors["login-password"] = "Introduce tu contraseña.";
  }
  if (Object.keys(fieldErrors).length) {
    setLoginFormError("Revisa los campos marcados.", fieldErrors);
    const firstId = Object.keys(fieldErrors)[0];
    document.getElementById(firstId)?.focus();
    return false;
  }
  setLoginFormError("");
  return true;
}

function validateRegisterClientSide() {
  const nombre = document.getElementById("register-nombre")?.value?.trim() || "";
  const email = document.getElementById("register-email")?.value?.trim() || "";
  const password = document.getElementById("register-password")?.value || "";
  const passwordConfirm = document.getElementById("register-password-confirm")?.value || "";
  const consentAccepted = !!document.getElementById("register-consent")?.checked;
  const fieldErrors = {};

  if (!nombre) fieldErrors["register-nombre"] = "El nombre es obligatorio.";
  if (!email) {
    fieldErrors["register-email"] = "Introduce tu correo electrónico.";
  } else if (!isValidEmailFormat(email)) {
    fieldErrors["register-email"] = "Introduce un correo con formato nombre@dominio.com.";
  }
  if (!password) {
    fieldErrors["register-password"] = "Introduce una contraseña.";
  } else if (!/(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}/.test(password)) {
    fieldErrors["register-password"] =
      "Mínimo 8 caracteres, con al menos una letra, un número y un símbolo.";
  }
  if (password !== passwordConfirm) {
    fieldErrors["register-password-confirm"] = "Las contraseñas no coinciden.";
  }
  if (!consentAccepted) {
    fieldErrors["register-consent"] = "Debes aceptar los términos y la política de privacidad.";
  }

  if (Object.keys(fieldErrors).length) {
    setRegisterFormError("Revisa los campos marcados.", fieldErrors);
    document.getElementById(Object.keys(fieldErrors)[0])?.focus();
    return false;
  }
  setRegisterFormError("");
  return true;
}

/** user_id desde JSON (número, string, etc.); null si no es un entero >= 1. */
function coerceUserId(v) {
  if (v == null) return null;
  const n =
    typeof v === "number" && Number.isFinite(v)
      ? Math.trunc(v)
      : parseInt(String(v).trim(), 10);
  if (!Number.isFinite(n) || n < 1) return null;
  return n;
}

async function login() {
  if (!validateLoginClientSide()) return;

  const email = document.getElementById("login-email")?.value?.trim() || "";
  const password = document.getElementById("login-password")?.value || "";
  const btn = document.getElementById("login-btn");
  const a11y = typeof CoreSpeakA11y !== "undefined" ? CoreSpeakA11y : null;
  const defaultLabel = btn?.textContent?.trim() || "Iniciar sesión";
  if (a11y) a11y.setBusy(btn, true, "Iniciando sesión…", defaultLabel);
  setLoginFormMessage("Comprobando tus datos. Te llevaremos a tu panel en unos segundos…", "info");

  let res;
  try {
    res = await fetch(apiUrl("/api/auth/login"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
  } catch (e) {
    console.warn("login: red", e);
    if (a11y) a11y.setBusy(btn, false, "", defaultLabel);
    setLoginFormError("No se pudo conectar. Comprueba tu red e inténtalo de nuevo.");
    return;
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const fromApi = formatApiErrorDetail(data);
    if (res.status === 401) {
      setLoginFormError(fromApi || "Correo o contraseña incorrectos.");
    } else if (res.status === 422) {
      setLoginFormError(fromApi || "Revisa el correo y la contraseña.");
    } else {
      console.warn("login: HTTP", res.status, data);
      setLoginFormError(fromApi || "No se pudo iniciar sesión. Inténtalo más tarde.");
    }
    if (a11y) a11y.setBusy(btn, false, "", defaultLabel);
    return;
  }

  const data = await res.json();
  if (data.access_token == null || String(data.access_token).trim() === "") {
    console.warn("login: respuesta sin token");
    if (a11y) a11y.setBusy(btn, false, "", defaultLabel);
    setLoginFormError("Respuesta del servidor incompleta. Inténtalo de nuevo.");
    return;
  }

  let uid = coerceUserId(data.user_id);
  if (uid == null) {
    const authHeader = { Authorization: "Bearer " + data.access_token };
    const fallbacks = ["/api/auth/me", "/api/users/me/profile"];
    for (let i = 0; i < fallbacks.length; i++) {
      try {
        const pr = await fetch(apiUrl(fallbacks[i]), { headers: authHeader });
        if (pr.ok) {
          const body = await pr.json();
          uid = coerceUserId(body.user_id ?? body.id);
          if (uid != null) break;
        }
      } catch (e) {
        console.warn("login: fallback " + fallbacks[i], e);
      }
    }
  }

  if (uid == null) {
    console.warn("login: no se pudo obtener user_id", data);
    if (a11y) a11y.setBusy(btn, false, "", defaultLabel);
    setLoginFormError("No se pudo identificar tu usuario. Inténtalo de nuevo.");
    return;
  }

  setLoginFormError("");
  setStoredToken(data.access_token);
  localStorage.setItem(USER_ID_KEY, String(uid));
  if (a11y) a11y.setBusy(btn, false, "", defaultLabel);
  setLoginFormMessage("Sesión iniciada correctamente. Entrando al panel…", "ok");
  setTimeout(function () {
    window.location.href = "dashboard.html";
  }, 350);
}

async function register() {
  if (!validateRegisterClientSide()) return;

  const nombre = document.getElementById("register-nombre")?.value?.trim() || "";
  const apellido = document.getElementById("register-apellido")?.value?.trim() || "";
  const email = document.getElementById("register-email")?.value?.trim() || "";
  const password = document.getElementById("register-password")?.value || "";
  const consentAccepted = !!document.getElementById("register-consent")?.checked;
  const btn = document.getElementById("register-btn");
  const a11y = typeof CoreSpeakA11y !== "undefined" ? CoreSpeakA11y : null;
  const defaultLabel = btn?.textContent?.trim() || "Crear cuenta";
  if (a11y) a11y.setBusy(btn, true, "Creando cuenta…", defaultLabel);
  setRegisterFormMessage("Estamos creando tu cuenta. Después podrás personalizar tu perfil.", "info");

  let res;
  try {
    res = await fetch(apiUrl("/api/auth/register"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        full_name: [nombre, apellido].filter(Boolean).join(" "),
        email,
        password,
        accepted_terms: consentAccepted,
      }),
    });
  } catch (e) {
    console.warn("register: red", e);
    if (a11y) a11y.setBusy(btn, false, "", defaultLabel);
    setRegisterFormError("No se pudo conectar. Comprueba tu red e inténtalo de nuevo.");
    return;
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    if (a11y) a11y.setBusy(btn, false, "", defaultLabel);
    if (res.status === 409) {
      setRegisterFormError(
        formatApiErrorDetail(data) ||
          "Este correo ya está registrado. Inicia sesión o usa otro email.",
        { "register-email": "Este correo ya está en uso." }
      );
    } else {
      setRegisterFormError(formatApiErrorDetail(data) || data.detail || "Error al crear la cuenta");
    }
    return;
  }

  const data = await res.json().catch(() => ({}));
  if (!data.access_token) {
    if (a11y) a11y.setBusy(btn, false, "", defaultLabel);
    setRegisterFormError("Cuenta creada, pero no se pudo iniciar la sesión.");
    return;
  }

  setStoredToken(data.access_token);
  if (data.user_id != null) {
    localStorage.setItem(USER_ID_KEY, String(data.user_id));
  }
  try {
    const meRes = await fetch(apiUrl("/api/auth/me"), {
      headers: { Authorization: "Bearer " + getStoredToken() },
    });
    if (meRes.ok) {
      const me = await meRes.json().catch(() => ({}));
      if (me && me.id != null) {
        localStorage.setItem(USER_ID_KEY, String(me.id));
      }
      if (me && me.ui_language) {
        localStorage.setItem(UI_LANG_STORAGE_KEY, normalizeUiLang(me.ui_language));
      }
    }
  } catch (e) {
    console.warn("register: me lookup error", e);
  }

  setRegisterFormMessage("Cuenta creada correctamente. Vamos a preparar tu perfil…", "ok");
  if (a11y) a11y.setBusy(btn, false, "", defaultLabel);
  setTimeout(function () {
    window.location.href = "profile_setup.html";
  }, 400);
}

function setInlineAuthAlert(el, message, variant) {
  setAlertMessage(el, message, variant === "err" ? "err" : variant || "info", false);
}

async function submitForgotPassword() {
  const msgEl = document.getElementById("forgot-msg");
  const email = document.getElementById("forgot-email")?.value?.trim() || "";
  const btn = document.getElementById("forgot-submit-btn");
  if (!email) {
    setInlineAuthAlert(msgEl, "Escribe tu correo.", "err");
    return;
  }
  if (btn) btn.disabled = true;
  setInlineAuthAlert(msgEl, "Estamos enviando el enlace de recuperación…", "info");
  try {
    const res = await fetch(apiUrl("/api/auth/forgot-password"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setInlineAuthAlert(
        msgEl,
        formatApiErrorDetail(data) || data.detail || "No se pudo enviar la solicitud.",
        "err"
      );
    } else {
      setInlineAuthAlert(
        msgEl,
        "Solicitud enviada. Si el correo existe, recibirás un enlace para restablecer la contraseña. Revisa también spam o promociones.",
        "ok"
      );
    }
  } catch (e) {
    setInlineAuthAlert(msgEl, "No se pudo enviar la solicitud por un problema de red.", "err");
  } finally {
    if (btn) btn.disabled = false;
  }
}

function initResetPasswordTokenFromUrl() {
  const hidden = document.getElementById("reset-token");
  if (!hidden) return;
  const params = new URLSearchParams(window.location.search);
  const token = (params.get("token") || "").trim();
  hidden.value = token;
  const msgEl = document.getElementById("reset-msg");
  const submitBtn = document.getElementById("reset-submit-btn");
  if (!token) {
    setInlineAuthAlert(
      msgEl,
      "Falta el enlace de recuperación. Abre el enlace del correo o solicita uno nuevo.",
      "err"
    );
    if (submitBtn) submitBtn.disabled = true;
  }
}

async function submitResetPassword() {
  const msgEl = document.getElementById("reset-msg");
  const token =
    (document.getElementById("reset-token") && document.getElementById("reset-token").value.trim()) ||
    new URLSearchParams(window.location.search).get("token")?.trim() ||
    "";
  const p1 = document.getElementById("reset-password")?.value || "";
  const p2 = document.getElementById("reset-password2")?.value || "";
  const btn = document.getElementById("reset-submit-btn");

  if (!token) {
    setInlineAuthAlert(msgEl, "Enlace no válido. Solicita un correo nuevo.", "err");
    return;
  }
  if (p1 !== p2) {
    setInlineAuthAlert(msgEl, "Las contraseñas no coinciden.", "err");
    return;
  }
  if (!/(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}/.test(p1)) {
    setInlineAuthAlert(
      msgEl,
      "La contraseña debe tener mínimo 8 caracteres, al menos un número y un símbolo.",
      "err"
    );
    return;
  }
  if (btn) btn.disabled = true;
  setInlineAuthAlert(msgEl, "Guardando tu nueva contraseña…", "info");
  try {
    const res = await fetch(apiUrl("/api/auth/reset-password"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password: p1 }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setInlineAuthAlert(
        msgEl,
        formatApiErrorDetail(data) || data.detail || "No se pudo cambiar la contraseña.",
        "err"
      );
      if (btn) btn.disabled = false;
    } else {
      setInlineAuthAlert(
        msgEl,
        data.message || "Contraseña actualizada correctamente. Te llevamos al inicio de sesión…",
        "ok"
      );
      setTimeout(function () {
        window.location.href = "inicio_session.html";
      }, 1800);
    }
  } catch (e) {
    setInlineAuthAlert(msgEl, "Error de red.", "err");
    if (btn) btn.disabled = false;
  }
}

function setProfileSetupError(message, kind) {
  const el = document.getElementById("profile-setup-error");
  if (!el) return;
  const text = String(message || "").trim();
  if (!text) {
    el.classList.add("d-none");
    el.textContent = "";
    return;
  }
  const tone = kind === "ok" ? "alert-success" : kind === "info" ? "alert-info" : "alert-danger";
  el.textContent = text;
  el.className = "alert py-2 px-3 small mb-3 " + tone;
  el.classList.remove("d-none");
}

const CEFR_LEVELS = new Set(["A1", "A2", "B1", "B2", "C1", "C2"]);
const PROFILE_LEVEL_QUIZ = [
  {
    id: "q1",
    prompt: "1. Choose the correct sentence:",
    options: ["She live in Madrid.", "She lives in Madrid.", "She living in Madrid."],
    correctIndex: 1,
  },
  {
    id: "q2",
    prompt: "2. Complete the sentence: Yesterday we ___ to the cinema.",
    options: ["go", "went", "gone"],
    correctIndex: 1,
  },
  {
    id: "q3",
    prompt: "3. Complete the sentence: If I have time tonight, I __ you.",
    options: ["will call", "called", "would called"],
    correctIndex: 0,
  },
  {
    id: "q4",
    prompt: "4. Complete the sentence: By the time I arrived, they ___ dinner.",
    options: ["finished", "had finished", "have finished"],
    correctIndex: 1,
  },
  {
    id: "q5",
    prompt: "5. Choose the best meaning: Hardly had the meeting started when the fire alarm went off.",
    options: [
      "The meeting had not started yet when the alarm rang.",
      "The meeting started long after the alarm rang.",
      "The meeting had just started when the alarm rang.",
    ],
    correctIndex: 2,
  },
];

const MAX_PROFILE_INTERESTS = 10;
let profileInterestCatalog = [];

function getProfileInterestUiLang() {
  return normalizeUiLang(document.getElementById("setup-idioma-ui")?.value || "es");
}

function getSelectedInterestIds() {
  return Array.from(document.querySelectorAll("input.setup-interest-cb:checked"))
    .map((cb) => String(cb.value || "").trim())
    .filter(Boolean);
}

function interestOptionLabel(opt, langCode) {
  if (!opt) return "";
  const lc = String(langCode || "es").trim().toLowerCase();
  const short = lc.split("-")[0];
  const lbls = opt.labels && typeof opt.labels === "object" ? opt.labels : {};
  return (
    lbls[lc] ||
    lbls[short] ||
    lbls.es ||
    lbls.en ||
    (typeof opt.en === "string" && opt.en) ||
    opt.id ||
    ""
  );
}

function renderSetupInterestGrid(catalog, selectedIds) {
  const grid = document.getElementById("setup-interests-grid");
  const msg = document.getElementById("setup-interests-msg");
  if (!grid) return;

  grid.innerHTML = "";
  const uiLang = getProfileInterestUiLang();
  const sel = new Set((selectedIds || []).map(String));

  const list = Array.isArray(catalog) ? catalog : [];
  list.forEach((opt) => {
    if (!opt || !opt.id) return;
    const col = document.createElement("div");
    col.className = "col-12 col-sm-6";
    const wrap = document.createElement("div");
    wrap.className = "form-check";
    const inp = document.createElement("input");
    inp.type = "checkbox";
    inp.className = "form-check-input setup-interest-cb";
    inp.value = String(opt.id);
    inp.id = "setup-int-" + String(opt.id).replace(/[^\w.-]/g, "_");
    inp.checked = sel.has(String(opt.id));
    const lab = document.createElement("label");
    lab.className = "form-check-label small";
    lab.setAttribute("for", inp.id);
    lab.textContent = interestOptionLabel(opt, uiLang);

    inp.addEventListener("change", function () {
      enforceProfileInterestCap(this);
    });

    wrap.appendChild(inp);
    wrap.appendChild(lab);
    col.appendChild(wrap);
    grid.appendChild(col);
  });

  enforceProfileInterestCap(null);
}

function enforceProfileInterestCap(elChanged) {
  const msg = document.getElementById("setup-interests-msg");
  const picked = Array.from(document.querySelectorAll("input.setup-interest-cb:checked"));
  if (
    picked.length > MAX_PROFILE_INTERESTS &&
    elChanged &&
    elChanged.checked
  ) {
    elChanged.checked = false;
  }
  const n = document.querySelectorAll("input.setup-interest-cb:checked").length;
  if (msg) {
    msg.textContent =
      n >= MAX_PROFILE_INTERESTS
        ? "Has alcanzado el máximo (" + MAX_PROFILE_INTERESTS + ")."
        : "Marca hasta " + MAX_PROFILE_INTERESTS + " temas · " + n + " elegidos";
  }
}

function normalizeCefrLevelInput(raw) {
  const u = String(raw || "A1")
    .trim()
    .toUpperCase();
  return CEFR_LEVELS.has(u) ? u : "A1";
}

function renderProfileLevelQuiz() {
  const wrap = document.getElementById("setup-level-quiz");
  if (!wrap) return;
  wrap.innerHTML = "";
  PROFILE_LEVEL_QUIZ.forEach(function (question) {
    const fieldset = document.createElement("fieldset");
    fieldset.className = "border rounded-3 p-3 bg-white";

    const legend = document.createElement("legend");
    legend.className = "float-none w-auto px-1 mb-2 fs-6 fw-semibold";
    legend.textContent = question.prompt;
    fieldset.appendChild(legend);

    question.options.forEach(function (option, idx) {
      const row = document.createElement("div");
      row.className = "form-check mb-2";
      const input = document.createElement("input");
      input.type = "radio";
      input.className = "form-check-input setup-level-quiz-option";
      input.name = question.id;
      input.id = question.id + "-" + idx;
      input.value = String(idx);

      const label = document.createElement("label");
      label.className = "form-check-label";
      label.setAttribute("for", input.id);
      label.textContent = option;

      row.appendChild(input);
      row.appendChild(label);
      fieldset.appendChild(row);
    });

    wrap.appendChild(fieldset);
  });
}

function getProfileQuizSuggestedLevel() {
  let score = 0;
  for (let i = 0; i < PROFILE_LEVEL_QUIZ.length; i++) {
    const question = PROFILE_LEVEL_QUIZ[i];
    const selected = document.querySelector('input[name="' + question.id + '"]:checked');
    if (!selected) {
      return { error: "Responde todas las preguntas del mini test para calcular tu nivel." };
    }
    if (Number(selected.value) === Number(question.correctIndex)) {
      score += 1;
    }
  }

  if (score <= 1) return { score, level: "A1" };
  if (score === 2) return { score, level: "A2" };
  if (score === 3) return { score, level: "B1" };
  if (score === 4) return { score, level: "B2" };
  return { score, level: "C1" };
}

function initProfileLevelQuiz() {
  const wrap = document.getElementById("setup-level-quiz");
  const btn = document.getElementById("setup-level-quiz-btn");
  const msg = document.getElementById("setup-level-quiz-msg");
  const levelSel = document.getElementById("setup-english-level");
  if (!wrap || !btn || !levelSel) return;

  renderProfileLevelQuiz();

  function showMsg(text, kind) {
    if (!msg) return;
    setAlertMessage(msg, text, kind === "err" ? "err" : kind === "ok" ? "ok" : "info", false);
  }

  btn.addEventListener("click", function () {
    const result = getProfileQuizSuggestedLevel();
    if (result.error) {
      showMsg(result.error, "err");
      return;
    }
    levelSel.value = result.level;
    showMsg(
      "Nivel recomendado: " +
        result.level +
        ". Hemos actualizado el selector para que la IA genere ejercicios acordes a tu nivel.",
      "ok"
    );
  });
}

/** Rellena el formulario de perfil con datos de /api/auth/me si el usuario vuelve a esta página. */
async function initProfileSetupForm() {
  const levelSel = document.getElementById("setup-english-level");
  const uiSel = document.getElementById("setup-idioma-ui");
  const grid = document.getElementById("setup-interests-grid");
  const wantPrem = document.getElementById("setup-wants-premium");
  if (uiSel) uiSel.value = getCurrentUiLangSync();

  profileInterestCatalog = [];
  try {
    const catRes = await fetch(apiUrl("/api/catalog/interest-options"));
    if (catRes.ok) profileInterestCatalog = await catRes.json();
  } catch (_) {
    /* catálogo vacío si falla la red */
  }

  const auth = requireAuth();
  if (!auth) return;
  let interestIds = [];
  try {
    const res = await fetch(apiUrl("/api/auth/me"), {
      headers: { Authorization: "Bearer " + auth.token },
    });
    if (res.ok) {
      const me = await res.json();
      if (uiSel && me.ui_language) uiSel.value = normalizeUiLang(me.ui_language);
      if (me.ui_language) localStorage.setItem(UI_LANG_STORAGE_KEY, normalizeUiLang(me.ui_language));
      const levels = me.current_levels_json && typeof me.current_levels_json === "object" ? me.current_levels_json : {};
      const en = levels.en || levels.EN;
      if (levelSel) levelSel.value = normalizeCefrLevelInput(en);
      if (Array.isArray(me.interests_json)) {
        interestIds = me.interests_json.map((x) => String(x)).filter(Boolean);
      }
      if (wantPrem) wantPrem.checked = !!me.interested_in_premium;
    }
  } catch (e) {
    console.warn("initProfileSetupForm", e);
  }

  if (grid) renderSetupInterestGrid(profileInterestCatalog, interestIds);

  if (uiSel && !uiSel.dataset.corespeakInterestLangBound) {
    uiSel.dataset.corespeakInterestLangBound = "1";
    uiSel.addEventListener("change", function () {
      renderSetupInterestGrid(profileInterestCatalog, getSelectedInterestIds());
    });
  }
}

async function saveProfileSetup() {
  setProfileSetupError("");
  const auth = requireAuth();
  if (!auth) {
    window.location.href = "inicio_session.html";
    return;
  }

  const uiLanguage = normalizeUiLang(document.getElementById("setup-idioma-ui")?.value || "es");
  const englishLevel = normalizeCefrLevelInput(document.getElementById("setup-english-level")?.value);
  const wantsPremium = !!document.getElementById("setup-wants-premium")?.checked;
  const interests = getSelectedInterestIds().slice(0, MAX_PROFILE_INTERESTS);
  const btn = document.getElementById("profile-setup-btn");
  if (btn) btn.disabled = true;
  setProfileSetupError("Guardando tu perfil y preferencias…", "info");

  try {
    const res = await fetch(apiUrl("/api/auth/profile-setup"), {
      method: "POST",
      headers: { Authorization: "Bearer " + auth.token, "Content-Type": "application/json" },
      body: JSON.stringify({
        ui_language: uiLanguage,
        english_level: englishLevel,
        interests,
        interested_in_premium: wantsPremium,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401) {
        setProfileSetupError(
          "No hemos podido guardar. Recarga la página o inicia sesión con tu correo y contraseña e inténtalo otra vez."
        );
        return;
      }
      setProfileSetupError(formatApiErrorDetail(data) || data.detail || "No se pudo guardar tu perfil");
      return;
    }
    localStorage.setItem(UI_LANG_STORAGE_KEY, uiLanguage);
    if (wantsPremium) {
      setProfileSetupError("Perfil guardado. Ahora te llevamos a los planes Premium…", "ok");
      setTimeout(function () {
        window.location.href = "pricing.html";
      }, 400);
      return;
    }
    setProfileSetupError("Perfil guardado correctamente. Entrando al panel…", "ok");
    setTimeout(function () {
      window.location.href = "dashboard.html";
    }, 400);
  } catch (e) {
    setProfileSetupError("No se pudo guardar tu perfil. Revisa tu conexión e inténtalo de nuevo.");
  } finally {
    if (btn) btn.disabled = false;
  }
}

function initPasswordVisibilityToggles() {
  const loginToggle = document.getElementById("toggle-login-password");
  const loginPassword = document.getElementById("login-password");
  if (loginToggle && loginPassword) {
    const loginIcon = loginToggle.querySelector(".password-eye-icon");
    loginToggle.addEventListener("click", function () {
      const isHidden = loginPassword.type === "password";
      loginPassword.type = isHidden ? "text" : "password";
      loginToggle.setAttribute("aria-label", isHidden ? "Ocultar contraseña" : "Mostrar contraseña");
      loginToggle.setAttribute("title", isHidden ? "Ocultar contraseña" : "Mostrar contraseña");
      if (loginIcon) loginIcon.src = isHidden ? "img/eye-open.svg" : "img/eye-closed.svg";
    });
  }

  const registerToggle = document.getElementById("toggle-register-password");
  const registerPassword = document.getElementById("register-password");
  if (registerToggle && registerPassword) {
    const registerIcon = registerToggle.querySelector(".password-eye-icon");
    registerToggle.addEventListener("click", function () {
      const isHidden = registerPassword.type === "password";
      registerPassword.type = isHidden ? "text" : "password";
      registerToggle.setAttribute(
        "aria-label",
        isHidden ? "Ocultar contraseña" : "Mostrar contraseña"
      );
      registerToggle.setAttribute("title", isHidden ? "Ocultar contraseña" : "Mostrar contraseña");
      if (registerIcon) registerIcon.src = isHidden ? "img/eye-open.svg" : "img/eye-closed.svg";
    });
  }

  const registerConfirmToggle = document.getElementById("toggle-register-password-confirm");
  const registerPasswordConfirm = document.getElementById("register-password-confirm");
  if (registerConfirmToggle && registerPasswordConfirm) {
    const registerConfirmIcon = registerConfirmToggle.querySelector(".password-eye-icon");
    registerConfirmToggle.addEventListener("click", function () {
      const isHidden = registerPasswordConfirm.type === "password";
      registerPasswordConfirm.type = isHidden ? "text" : "password";
      registerConfirmToggle.setAttribute(
        "aria-label",
        isHidden ? "Ocultar confirmación de contraseña" : "Mostrar confirmación de contraseña"
      );
      registerConfirmToggle.setAttribute(
        "title",
        isHidden ? "Ocultar confirmación de contraseña" : "Mostrar confirmación de contraseña"
      );
      if (registerConfirmIcon) registerConfirmIcon.src = isHidden ? "img/eye-open.svg" : "img/eye-closed.svg";
    });
  }
}

async function startPremiumCheckoutGeneric(msgEl, btn) {
  if (msgEl) {
    msgEl.classList.add("d-none");
    msgEl.textContent = "";
  }
  const headers = apiHeaders();
  if (!headers) {
    if (msgEl) {
      msgEl.textContent = "Inicia sesión para continuar con el pago Premium.";
      msgEl.classList.remove("d-none");
    } else {
      alert("Inicia sesión para continuar con el pago Premium.");
    }
    return;
  }
  if (btn) btn.disabled = true;
  try {
    const payload = { provider: "stripe" };
    const res = await fetch(apiUrl("/api/billing/checkout"), {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.checkout_url) throw new Error(data.detail || "No se pudo iniciar Stripe Checkout");
    window.location.href = data.checkout_url;
  } catch (err) {
    const msg = (err && err.message) || "Error iniciando la pasarela de pago.";
    if (msgEl) {
      msgEl.textContent = msg;
      msgEl.classList.remove("d-none");
    } else {
      alert(msg);
    }
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function initDashboardPremiumCta() {
  const cta = document.getElementById("dashboard-premium-cta");
  const btn = document.getElementById("dashboard-premium-btn");
  const navBtn = document.getElementById("dashboard-nav-premium-btn");
  const msg = document.getElementById("dashboard-premium-msg");
  if (!cta || !btn) return;

  const auth = requireAuth();
  if (!auth) return;

  let isPremium = false;
  try {
    const res = await fetch(apiUrl("/api/auth/me"), {
      headers: { Authorization: "Bearer " + auth.token },
    });
    if (res.ok) {
      const me = await res.json().catch(() => ({}));
      isPremium = me.is_premium === true;
    }
  } catch (e) {
    console.warn("dashboard premium cta profile error", e);
  }

  const navPremiumLi = navBtn ? navBtn.closest("li") : null;

  if (isPremium) {
    cta.classList.add("d-none");
    if (navBtn) navBtn.classList.add("d-none");
    if (navPremiumLi) navPremiumLi.classList.add("d-none");
    return;
  }

  cta.classList.remove("d-none");
  if (navPremiumLi) navPremiumLi.classList.remove("d-none");
  if (navBtn) {
    navBtn.classList.remove("d-none");
    navBtn.addEventListener("click", function () {
      void startPremiumCheckoutGeneric(msg, btn);
    });
  }
  btn.addEventListener("click", function () {
    void startPremiumCheckoutGeneric(msg, btn);
  });
}

function _coerceCount(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : null;
}

/** Muestra enlaces Admin solo si el usuario tiene rol administrador. */
function applyAdminNavVisibility(isAdmin) {
  const adminNav = document.getElementById("admin-nav-wrap");
  if (adminNav) {
    if (isAdmin) {
      adminNav.classList.remove("d-none");
      adminNav.classList.add("d-lg-block");
    } else {
      adminNav.classList.add("d-none");
      adminNav.classList.remove("d-lg-block");
    }
  }
  const adminMobileLi = document.getElementById("admin-nav-mobile-li");
  if (adminMobileLi) {
    adminMobileLi.classList.toggle("d-none", !isAdmin);
  }
}

async function loadMyProgress() {
  const auth = requireAuth();
  if (!auth) return;

  const headers = { Authorization: "Bearer " + auth.token };
  let displayName = "";

  let profile = null;
  const profileRes = await fetch(apiUrl("/api/users/me/profile"), { headers });
  if (profileRes.ok) {
    profile = await profileRes.json().catch(() => null);
    const n = profile && profile.nombre != null ? String(profile.nombre).trim() : "";
    if (n) displayName = n;
  }
  let meAuth = null;
  const meResEarly = await fetch(apiUrl("/api/auth/me"), { headers });
  if (meResEarly.ok) {
    meAuth = await meResEarly.json().catch(() => null);
  }
  const isAdmin =
    !!(profile && profile.is_admin) ||
    String(meAuth?.role || "").toLowerCase() === "admin";
  applyAdminNavVisibility(isAdmin);

  const res = await fetch(apiUrl("/api/users/" + auth.userId + "/progress"), { headers });
  let p = null;
  if (res.ok) {
    p = await res.json().catch(() => null);
    if (p && p.nombre) {
      const fromProgress = String(p.nombre).trim();
      if (fromProgress && !displayName) displayName = fromProgress;
    }
  }

  if (!meAuth) {
    const meRes = await fetch(apiUrl("/api/auth/me"), { headers });
    if (meRes.ok) {
      meAuth = await meRes.json().catch(() => null);
    }
  }
  if (meAuth && meAuth.full_name != null) {
    const fn = String(meAuth.full_name).trim();
    if (fn && !displayName) displayName = fn;
  }

  const u = getUiPack(getCurrentUiLangSync());
  const nameEl = document.getElementById("user-name");
  if (nameEl) nameEl.textContent = displayName || (u.dashboard && u.dashboard.userFallback) || "Usuario";

  const streakFromProgress = p != null ? _coerceCount(p.racha_actual) : null;
  const streakFromMe = meAuth != null ? _coerceCount(meAuth.streak_days) : null;
  const streakNum = streakFromProgress != null ? streakFromProgress : streakFromMe != null ? streakFromMe : 0;

  const xpFromProgress = p != null ? _coerceCount(p.total_xp) : null;
  const xpFromMe = meAuth != null ? _coerceCount(meAuth.xp_total) : null;
  const xpNum = xpFromProgress != null ? xpFromProgress : xpFromMe != null ? xpFromMe : 0;

  const streakEl = document.getElementById("stat-streak");
  if (streakEl) {
    const tpl = (u.dashboard && u.dashboard.streakDays) || "{n} días consecutivos";
    streakEl.textContent = tpl.replace("{n}", String(streakNum));
  }
  const xpEl = document.getElementById("stat-xp");
  if (xpEl) {
    const tpl = (u.dashboard && u.dashboard.xpTotal) || "{n} XP acumulados";
    xpEl.textContent = tpl.replace("{n}", String(xpNum));
  }
}

/** Nombre del idioma de estudio según el idioma de interfaz (mismas cadenas que onboarding.lang*). */
const COURSE_LANG_TO_ONBOARDING_KEY = {
  en: "langEn",
  es: "langEs",
  fr: "langFr",
  de: "langDe",
  uk: "langUk",
};

function getCourseLanguageDisplayName(langCode) {
  const code = String(langCode || "").toLowerCase().trim();
  const key = COURSE_LANG_TO_ONBOARDING_KEY[code];
  const ob = getUiPack(getCurrentUiLangSync()).onboarding || {};
  if (key && ob[key] != null) return String(ob[key]);
  return code ? code.toUpperCase() : "?";
}

/** Bandera (flagcdn) por código de idioma del curso; si no hay mapeo, se usa el propio código. */
const DASHBOARD_FLAG_BY_LANG = {
  en: "gb",
  es: "es",
  fr: "fr",
  de: "de",
  uk: "ua",
  it: "it",
  pt: "pt",
  pl: "pl",
  ru: "ru",
  zh: "cn",
  ja: "jp",
  ko: "kr",
  nl: "nl",
  sv: "se",
  da: "dk",
  el: "gr",
  ar: "sa",
  hi: "in",
};

function flagCodeForCourseLang(lang) {
  const c = String(lang || "")
    .toLowerCase()
    .trim();
  if (!c) return "gb";
  return DASHBOARD_FLAG_BY_LANG[c] || c;
}

function renderDashboardCatalogCourseCard(course) {
  const u = getUiPack(getCurrentUiLangSync());
  const d = u.dashboard || {};
  const lcCourse = uiLessonCoursePack(getCurrentUiLangSync());
  const btnLabel = (d.courseBtn) || "Comenzar";
  const lang = String(course.lang_code || "")
    .toLowerCase()
    .trim();
  const flag = flagCodeForCourseLang(lang);
  const langLabel = getCourseLanguageDisplayName(lang);
  const titleText = (course.title || "").trim() || langLabel;
  const nLessons = typeof course.lesson_count === "number" ? course.lesson_count : 0;
  const lessonsLine =
    nLessons === 1
      ? d.courseLessonsOne || "1 lección"
      : (d.courseLessonsMany || "{n} lecciones").replace("{n}", String(nLessons));
  const cefr = (course.cefr_level || "").toString().toUpperCase().trim();
  const subLine = [cefr, lessonsLine].filter(Boolean).join(" · ");

  const col = document.createElement("div");
  col.className = "col-md-6 col-lg-4";
  const card = document.createElement("div");
  card.className = "course-card" + (course.accessible ? "" : " opacity-75");

  const top = document.createElement("div");
  const flagWrap = document.createElement("div");
  flagWrap.className = "flag-img-wrapper";
  const img = document.createElement("img");
  img.src = "https://flagcdn.com/w160/" + flag + ".png";
  img.alt = "Bandera de " + langLabel;
  flagWrap.appendChild(img);
  if (typeof CoreSpeakA11y !== "undefined" && typeof CoreSpeakA11y.enhanceImage === "function") {
    CoreSpeakA11y.enhanceImage(img);
  }
  const titleEl = document.createElement("div");
  titleEl.className = "course-title";
  titleEl.textContent = titleText;
  const subLang = document.createElement("div");
  subLang.className = "course-subtitle";
  subLang.textContent = langLabel;
  const subMeta = document.createElement("div");
  subMeta.className = "small text-secondary mt-1";
  subMeta.textContent = subLine;
  top.appendChild(flagWrap);
  top.appendChild(titleEl);
  top.appendChild(subLang);
  top.appendChild(subMeta);

  const bot = document.createElement("div");
  const progBg = document.createElement("div");
  progBg.className = "progress-bg";
  progBg.setAttribute("role", "progressbar");
  progBg.setAttribute("aria-valuemin", "0");
  progBg.setAttribute("aria-valuemax", "100");
  progBg.setAttribute("aria-valuenow", "0");
  progBg.setAttribute("aria-label", "Progreso del curso de " + langLabel);
  const progFill = document.createElement("div");
  progFill.className = "progress-fill";
  progFill.style.width = "0%";
  progBg.appendChild(progFill);

  const linkLabel =
    (course.accessible ? btnLabel : lcCourse.premiumShort || "Premium") +
    ": " +
    titleText +
    (subLine ? ", " + subLine : "");

  const a = document.createElement("a");
  a.href = "course.html?lang=" + encodeURIComponent(lang);
  a.className = "course-card-link";
  a.setAttribute("aria-label", linkLabel);
  const btnSpan = document.createElement("span");
  btnSpan.className = "btn btn-gradient";
  btnSpan.setAttribute("aria-hidden", "true");
  btnSpan.textContent = course.accessible ? btnLabel : lcCourse.premiumShort || "Premium";
  bot.appendChild(progBg);
  bot.appendChild(btnSpan);

  card.appendChild(top);
  card.appendChild(bot);
  a.appendChild(card);
  col.appendChild(a);
  return col;
}

async function loadDashboardCourses() {
  const auth = requireAuth();
  if (!auth) return;

  const u = getUiPack(getCurrentUiLangSync());
  const d = u.dashboard || {};

  const misRow = document.getElementById("courses-mis-row");
  const otrosRow = document.getElementById("courses-otros-row");
  const otrosSection = document.getElementById("courses-otros-section");
  const misSub = document.getElementById("courses-mis-subtitle");
  if (!misRow || !otrosRow) return;

  let me = null;
  try {
    const meRes = await fetch(apiUrl("/api/auth/me"), {
      headers: apiHeaders() || { Authorization: "Bearer " + auth.token },
    });
    if (meRes.ok) me = await meRes.json().catch(() => null);
  } catch (e) {
    console.warn("loadDashboardCourses /api/auth/me", e);
  }
  if (!me) {
    misRow.innerHTML =
      '<div class="col-12"><p class="text-muted">' +
      (d.profileLoadError || "No se pudo cargar tu perfil. Recarga la página.") +
      "</p></div>";
    return;
  }

  const chosen = new Set(
    ((me.target_languages_json && me.target_languages_json.languages) || [])
      .map((x) => String(x).toLowerCase().trim())
      .filter(Boolean)
  );
  const isPremium = me.is_premium === true;
  const list = [
    {
      id: 1,
      lang_code: "uk",
      title: "Ucraniano",
      cefr_level: "A1",
      lesson_count: 0,
      accessible: isPremium || chosen.has("uk"),
    },
    {
      id: 2,
      lang_code: "en",
      title: "Inglés",
      cefr_level: "A1",
      lesson_count: 0,
      accessible: isPremium || chosen.has("en"),
    },
    {
      id: 3,
      lang_code: "fr",
      title: "Francés",
      cefr_level: "A1",
      lesson_count: 0,
      accessible: isPremium || chosen.has("fr"),
    },
    {
      id: 4,
      lang_code: "es",
      title: "Español",
      cefr_level: "A1",
      lesson_count: 0,
      accessible: isPremium || chosen.has("es"),
    },
  ];
  const misCourses = list.filter(function (c) {
    return c && chosen.has(String(c.lang_code || "").toLowerCase().trim());
  });
  const otrosCourses = list.filter(function (c) {
    return c && !chosen.has(String(c.lang_code || "").toLowerCase().trim());
  });

  if (misSub) {
    if (chosen.size === 0) {
      misSub.textContent = d.misSub2 || "";
    } else {
      misSub.textContent = d.misSub1 || "";
    }
  }

  misRow.innerHTML = "";
  if (misCourses.length === 0) {
    const hint = document.createElement("div");
    hint.className = "col-12";
    const p = document.createElement("p");
    p.className = "text-muted mb-0";
    if (chosen.size === 0) {
      p.innerHTML = d.misHintHtml || "";
    } else {
      p.textContent = d.misNoPublished || "";
    }
    hint.appendChild(p);
    misRow.appendChild(hint);
  } else {
    misCourses.forEach(function (c) {
      misRow.appendChild(renderDashboardCatalogCourseCard(c));
    });
  }

  const otrosIntro = document.getElementById("courses-otros-intro");
  otrosRow.innerHTML = "";
  if (otrosCourses.length === 0) {
    if (otrosSection) otrosSection.style.display = "none";
  } else {
    if (otrosSection) otrosSection.style.display = "";
    if (otrosIntro) {
      otrosIntro.textContent =
        misCourses.length > 0 ? d.otrosIntroA || "" : d.otrosIntroB || "";
    }
    otrosCourses.forEach(function (c) {
      otrosRow.appendChild(renderDashboardCatalogCourseCard(c));
    });
  }
}

function initOnboardingPanel() {
  if (!document.querySelector(".onb-lang")) {
    return;
  }
  const cards = document.querySelectorAll(".onb-lang-card");
  const sync = () => {
    document.querySelectorAll(".onb-level-row").forEach((row) => {
      const code = row.getAttribute("data-lang");
      const cb = document.querySelector('.onb-lang[value="' + code + '"]');
      const show = cb && cb.checked;
      row.classList.toggle("d-none", !show);
      if (!show) {
        const sel = row.querySelector("select");
        if (sel) sel.value = "";
      }
    });
    cards.forEach((label) => {
      const innerCb = label.querySelector(".onb-lang");
      label.classList.toggle("onb-lang-card--selected", !!(innerCb && innerCb.checked));
    });
  };
  document.querySelectorAll(".onb-lang").forEach((cb) => {
    cb.addEventListener("change", sync);
  });
  sync();
}

let _configDisplayNameOriginal = { first: "", last: "" };

function _splitDisplayName(full) {
  const s = String(full || "").trim();
  if (!s) return { first: "", last: "" };
  const parts = s.split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

async function initConfigPersonalName() {
  const form = document.getElementById("config-personal-form");
  const firstEl = document.getElementById("config-first-name");
  const lastEl = document.getElementById("config-last-name");
  const msg = document.getElementById("config-personal-msg");
  const cancelBtn = document.getElementById("config-personal-cancel");
  if (!form || !firstEl || !lastEl) return;

  const auth = requireAuth();
  if (!auth) return;

  function showMsg(text, kind) {
    if (!msg) return;
    msg.textContent = text || "";
    msg.className =
      "alert py-2 px-3 small " +
      (kind === "ok" ? "alert-success" : kind === "err" ? "alert-danger" : "alert-info");
    msg.classList.toggle("d-none", !text);
  }

  function applyFields(first, last) {
    firstEl.value = first;
    lastEl.value = last;
    _configDisplayNameOriginal = { first, last };
  }

  try {
    const res = await fetch(apiUrl("/api/users/me/profile"), {
      headers: { Authorization: "Bearer " + auth.token },
    });
    if (!res.ok) {
      showMsg("No se pudieron cargar tus datos. Recarga la página.", "err");
      return;
    }
    const p = await res.json();
    const sp = _splitDisplayName(p.nombre);
    applyFields(sp.first, sp.last);
  } catch (e) {
    console.warn("initConfigPersonalName", e);
    showMsg("Error de red al cargar el perfil.", "err");
    return;
  }

  if (cancelBtn) {
    cancelBtn.addEventListener("click", function () {
      applyFields(_configDisplayNameOriginal.first, _configDisplayNameOriginal.last);
      showMsg("Cambios descartados. Se han restaurado tus datos anteriores.", "info");
    });
  }

  form.addEventListener("submit", async function (ev) {
    ev.preventDefault();
    const fn = firstEl.value.trim();
    const ln = lastEl.value.trim();
    const combined = [fn, ln].filter(Boolean).join(" ");
    if (combined.length < 2) {
      showMsg("Escribe al menos tu nombre o apellidos (mínimo 2 caracteres en total).", "err");
      return;
    }
    showMsg("Guardando tu nombre…", "info");
    const auth2 = requireAuth();
    if (!auth2) return;
    const saveBtn = document.getElementById("config-personal-save");
    if (saveBtn) saveBtn.disabled = true;
    try {
      const res2 = await fetch(apiUrl("/api/users/me/display-name"), {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + auth2.token,
        },
        body: JSON.stringify({ first_name: fn, last_name: ln }),
      });
      const data = await res2.json().catch(function () {
        return {};
      });
      if (!res2.ok) {
        showMsg(formatApiErrorDetail(data) || data.detail || "No se pudo guardar", "err");
        return;
      }
      const sp2 = _splitDisplayName(data.nombre);
      applyFields(sp2.first, sp2.last);
      showMsg("Nombre actualizado correctamente.", "ok");
      if (typeof applyPageI18n === "function") {
        applyPageI18n(getCurrentUiLangSync());
      }
    } catch (e) {
      showMsg("No se pudo conectar con el servidor.", "err");
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  });
}

async function initConfigEnglishLevel() {
  const sel = document.getElementById("config-english-level");
  const msg = document.getElementById("config-difficulty-msg");
  if (!sel) return;
  const token = getStoredToken();
  if (!token) return;

  function showMsg(text, kind) {
    if (!msg) return;
    msg.textContent = text || "";
    msg.className =
      "alert py-2 px-3 small " +
      (kind === "ok" ? "alert-success" : kind === "err" ? "alert-danger" : "alert-info");
    msg.classList.toggle("d-none", !text);
  }

  try {
    const res = await fetch(apiUrl("/api/users/me/profile"), {
      headers: { Authorization: "Bearer " + token },
    });
    let raw = "A1";
    if (res.ok) {
      const p = await res.json();
      raw = p && p.english_level ? p.english_level : "A1";
    } else if (res.status === 401) {
      showMsg("Sesión caducada. Vuelve a iniciar sesión.", "err");
      return;
    } else {
      const res2 = await fetch(apiUrl("/api/auth/me"), {
        headers: { Authorization: "Bearer " + token },
      });
      if (!res2.ok) {
        showMsg("No se pudo cargar tu nivel MCER.", "err");
        return;
      }
      const me = await res2.json();
      const lv = me.current_levels_json && typeof me.current_levels_json === "object" ? me.current_levels_json : {};
      raw = lv.en || lv.EN || "A1";
    }
    sel.value = normalizeCefrLevelInput(raw);
  } catch (e) {
    console.warn("initConfigEnglishLevel load", e);
    showMsg("Error de red al cargar el nivel.", "err");
    return;
  }

  let busy = false;
  sel.addEventListener("change", async function () {
    if (busy) return;
    busy = true;
    const level = normalizeCefrLevelInput(sel.value);
    showMsg("Guardando tu nivel MCER…", "info");
    try {
      const res2 = await fetch(apiUrl("/api/users/me/english-level"), {
        method: "PATCH",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ english_level: level }),
      });
      const data = await res2.json().catch(function () {
        return {};
      });
      if (!res2.ok) {
        showMsg(formatApiErrorDetail(data) || data.detail || "No se pudo guardar el nivel.", "err");
      } else {
        showMsg(
          "Nivel guardado. El reto de hoy no cambia; el siguiente reto se generará con este MCER.",
          "ok"
        );
      }
    } catch (e) {
      showMsg("No se pudo conectar con el servidor.", "err");
    } finally {
      busy = false;
    }
  });
}

async function initConfigExtraLanguages() {
  const card = document.getElementById("config-premium-languages-card");
  const saveBtn = document.getElementById("config-extra-langs-save");
  if (!card || !saveBtn) {
    return;
  }
  const msg = document.getElementById("config-extra-lang-msg");
  const auth = requireAuth();
  if (!auth) {
    return;
  }
  try {
    const res = await fetch(apiUrl("/api/auth/me"), { headers: { Authorization: "Bearer " + auth.token } });
    if (!res.ok) {
      return;
    }
    const me = await res.json();
    if (!me || !me.is_premium) {
      return;
    }
    card.classList.remove("d-none");
    const list = (me.target_languages_json && me.target_languages_json.languages) || [];
    document.querySelectorAll(".config-extra-lang-cb").forEach(function (cb) {
      cb.checked = list.indexOf(cb.value) >= 0;
    });
  } catch (e) {
    console.warn("initConfigExtraLanguages", e);
  }

  saveBtn.addEventListener("click", async function () {
    if (msg) {
      msg.className = "alert py-2 px-3 small d-none";
      msg.textContent = "";
    }
    const auth2 = requireAuth();
    if (!auth2) {
      if (msg) {
        msg.className = "alert alert-warning py-2 px-3 small";
        msg.textContent = "Inicia sesión de nuevo.";
        msg.classList.remove("d-none");
      }
      return;
    }
    const extra = Array.from(document.querySelectorAll(".config-extra-lang-cb:checked")).map((c) => c.value);
    if (msg) {
      msg.className = "alert alert-info py-2 px-3 small";
      msg.textContent = "Guardando tus idiomas disponibles…";
      msg.classList.remove("d-none");
    }
    const res2 = await fetch(apiUrl("/api/users/me/extra-languages"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + auth2.token,
      },
      body: JSON.stringify({ language_codes: extra }),
    });
    const data = await res2.json().catch(function () {
      return {};
    });
    if (!res2.ok) {
      if (msg) {
        msg.className = "alert alert-danger py-2 px-3 small";
        msg.textContent = formatApiErrorDetail(data) || data.detail || "No se pudo guardar";
        msg.classList.remove("d-none");
      }
      return;
    }
    if (msg) {
      msg.className = "alert alert-success py-2 px-3 small";
      msg.textContent = "Idiomas actualizados correctamente.";
      msg.classList.remove("d-none");
    }
  });
}

function initConfigPasswordChange() {
  const btn = document.getElementById("config-change-password-btn");
  const msg = document.getElementById("config-account-msg");
  if (!btn) return;

  function showMsg(text, kind) {
    if (!msg) return;
    setAlertMessage(msg, text, kind === "err" ? "err" : kind === "ok" ? "ok" : "info", false);
  }

  btn.addEventListener("click", async function () {
    const auth = requireAuth();
    if (!auth) return;
    btn.disabled = true;
    showMsg("Preparando la página para cambiar tu contraseña…", "info");
    try {
      const res = await fetch(apiUrl("/api/users/me/password-reset-link"), {
        method: "POST",
        headers: {
          Authorization: "Bearer " + auth.token,
        },
      });
      const data = await res.json().catch(function () {
        return {};
      });
      if (!res.ok) {
        showMsg(
          formatApiErrorDetail(data) || data.detail || "No se pudo abrir la página para cambiar la contraseña.",
          "err"
        );
        btn.disabled = false;
        return;
      }
      showMsg("Redirigiéndote a la página de cambio de contraseña…", "ok");
      window.location.href = String(data.reset_url || "restablecer_contrasena.html");
    } catch (e) {
      showMsg("No se pudo conectar con el servidor.", "err");
      btn.disabled = false;
    }
  });
}

function setOnboardingMessage(message, kind) {
  const el = document.getElementById("onboarding-msg");
  if (!el) return;
  const text = String(message || "").trim();
  if (!text) {
    el.textContent = "";
    el.classList.add("d-none");
    return;
  }
  el.textContent = text;
  el.className =
    "alert py-2 px-3 small mb-3 " +
    (kind === "ok" ? "alert-success" : kind === "info" ? "alert-info" : "alert-danger");
  el.classList.remove("d-none");
}

async function saveOnboarding() {
  const auth = requireAuth();
  if (!auth) {
    setOnboardingMessage("Tu sesión ha caducado. Inicia sesión otra vez para guardar tu configuración.", "err");
    return;
  }

  const ocupacion = document.getElementById("onb-ocupacion")?.value?.trim() || "";
  const niveles_actuales = {};
  const enLvl = document.getElementById("lvl-en")?.value;
  if (enLvl) {
    niveles_actuales.en = enLvl;
  }
  const btn = document.getElementById("onboarding-save-btn");
  if (btn) btn.disabled = true;
  setOnboardingMessage("Guardando tu configuración inicial…", "info");

  try {
    const res = await fetch(apiUrl("/api/users/me/onboarding"), {
      method: "POST",
      headers: apiHeaders() || { "Content-Type": "application/json" },
      body: JSON.stringify({ ocupacion, niveles_actuales }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setOnboardingMessage(
        formatApiErrorDetail(data) || data.detail || "No se pudo guardar tu configuración inicial.",
        "err"
      );
      return;
    }
    setOnboardingMessage("Datos guardados. Entrando al panel…", "ok");
    setTimeout(function () {
      window.location.href = "dashboard.html";
    }, 400);
  } catch (e) {
    setOnboardingMessage("No se pudo conectar con el servidor. Inténtalo de nuevo.", "err");
  } finally {
    if (btn) btn.disabled = false;
  }
}

function renderGrammarDialogueExercise(container, ui) {
  const pack = getUiPack(getCurrentUiLangSync());
  const pr = pack.practice || {};
  const ph = pr.grammarSelectPrompt || "—";
  const la = pr.grammarLineA || "A:";
  const lb = pr.grammarLineB || "B:";

  container.innerHTML = "";

  const title = document.createElement("h4");
  title.className = "text-primary fw-semibold mb-2";
  title.textContent = ui.topic_title || "";

  const exLab = document.createElement("h5");
  exLab.className = "text-primary mb-2 fs-6";
  exLab.textContent = ui.exercise_label || "";

  const inst = document.createElement("div");
  inst.className = "alert alert-secondary border-0 mb-4 small";
  inst.textContent = ui.instruction || "";

  const ol = document.createElement("ol");
  ol.className = "ps-3 grammar-dialogue-list mb-0";

  let gapIdx = 0;
  (ui.items || []).forEach((it) => {
    const li = document.createElement("li");
    li.className = "mb-4 grammar-dialogue-item";

    const rowA = document.createElement("div");
    rowA.className = "mb-2 text-start";
    rowA.appendChild(document.createTextNode(la + " " + (it.a_before || "")));
    const selA = document.createElement("select");
    selA.className = "form-select form-select-sm d-inline-block align-middle grammar-gap-select mx-1";
    selA.setAttribute("data-grammar-gap", String(gapIdx++));
    const o0a = document.createElement("option");
    o0a.value = "";
    o0a.textContent = ph;
    selA.appendChild(o0a);
    (it.gap_a_options || []).forEach((opt) => {
      const o = document.createElement("option");
      o.value = String(opt);
      o.textContent = String(opt);
      selA.appendChild(o);
    });
    rowA.appendChild(selA);
    rowA.appendChild(document.createTextNode(it.a_after || ""));

    const rowB = document.createElement("div");
    rowB.className = "text-start";
    rowB.appendChild(document.createTextNode(lb + " " + (it.b_before || "")));
    const selB = document.createElement("select");
    selB.className = "form-select form-select-sm d-inline-block align-middle grammar-gap-select mx-1";
    selB.setAttribute("data-grammar-gap", String(gapIdx++));
    const o0b = document.createElement("option");
    o0b.value = "";
    o0b.textContent = ph;
    selB.appendChild(o0b);
    (it.gap_b_options || []).forEach((opt) => {
      const o = document.createElement("option");
      o.value = String(opt);
      o.textContent = String(opt);
      selB.appendChild(o);
    });
    rowB.appendChild(selB);
    rowB.appendChild(document.createTextNode(it.b_after || ""));

    li.appendChild(rowA);
    li.appendChild(rowB);
    ol.appendChild(li);
  });

  container.appendChild(title);
  container.appendChild(exLab);
  container.appendChild(inst);
  container.appendChild(ol);
}

function renderGrammarPack(container, ui) {
  if (!ui.sections || !Array.isArray(ui.sections)) {
    renderGrammarDialogueExercise(container, ui);
    return;
  }

  const gPack = getUiPack(getCurrentUiLangSync());
  const pr = gPack.practice || {};
  const ph = pr.grammarSelectPrompt || "—";
  const la = pr.grammarLineA || "A:";
  const lb = pr.grammarLineB || "B:";

  container.innerHTML = "";
  let gapIdx = 0;

  function addSelect(opts) {
    const sel = document.createElement("select");
    sel.className = "form-select form-select-sm d-inline-block align-middle grammar-gap-select mx-1";
    sel.setAttribute("data-grammar-gap", String(gapIdx++));
    const o0 = document.createElement("option");
    o0.value = "";
    o0.textContent = ph;
    sel.appendChild(o0);
    (opts || []).forEach((opt) => {
      const o = document.createElement("option");
      o.value = String(opt);
      o.textContent = String(opt);
      sel.appendChild(o);
    });
    return sel;
  }

  const topicEl = document.createElement("h4");
  topicEl.className = "text-primary fw-semibold mb-3";
  topicEl.textContent = ui.topic_title || "";
  container.appendChild(topicEl);

  ui.sections.forEach((sec, si) => {
    if (si > 0) {
      const hr = document.createElement("hr");
      hr.className = "my-4";
      container.appendChild(hr);
    }
    const st = document.createElement("h5");
    st.className = "text-primary mb-2 fs-6";
    st.textContent = sec.title || "";
    container.appendChild(st);
    const inst = document.createElement("div");
    inst.className = "alert alert-secondary border-0 mb-3 small";
    inst.textContent = sec.instruction || "";
    container.appendChild(inst);
    if (sec.example) {
      const ex = document.createElement("div");
      ex.className = "small text-muted mb-3 fst-italic";
      ex.textContent = sec.example;
      container.appendChild(ex);
    }

    if (sec.style === "paired_ab") {
      const ol = document.createElement("ol");
      ol.className = "ps-3 grammar-dialogue-list mb-0";
      (sec.items || []).forEach((it) => {
        const li = document.createElement("li");
        li.className = "mb-4 grammar-dialogue-item";
        const rowA = document.createElement("div");
        rowA.className = "mb-2 text-start";
        rowA.appendChild(document.createTextNode(la + " " + (it.a_before || "")));
        rowA.appendChild(addSelect(it.gap_a_options));
        rowA.appendChild(document.createTextNode(it.a_after || ""));
        const rowB = document.createElement("div");
        rowB.className = "text-start";
        rowB.appendChild(document.createTextNode(lb + " " + (it.b_before || "")));
        rowB.appendChild(addSelect(it.gap_b_options));
        rowB.appendChild(document.createTextNode(it.b_after || ""));
        li.appendChild(rowA);
        li.appendChild(rowB);
        ol.appendChild(li);
      });
      container.appendChild(ol);
    } else if (sec.style === "gap_lines") {
      const ol = document.createElement("ol");
      ol.className = "ps-3 grammar-gap-lines mb-0";
      (sec.lines || []).forEach((line) => {
        const li = document.createElement("li");
        li.className = "mb-3 text-start";
        const segs = line.segments || [];
        const gaps = line.gaps || [];
        for (let i = 0; i < gaps.length; i++) {
          li.appendChild(document.createTextNode(segs[i] || ""));
          li.appendChild(addSelect((gaps[i] && gaps[i].options) || []));
        }
        li.appendChild(document.createTextNode(segs[segs.length - 1] || ""));
        ol.appendChild(li);
      });
      container.appendChild(ol);
    } else if (sec.style === "conversation") {
      const wrap = document.createElement("div");
      wrap.className = "grammar-conversation text-start";
      (sec.lines || []).forEach((line) => {
        const row = document.createElement("div");
        row.className = "mb-3";
        const sp = document.createElement("strong");
        sp.textContent = (line.speaker || "") + ": ";
        row.appendChild(sp);
        const segs = line.segments || [];
        const gaps = line.gaps || [];
        for (let i = 0; i < gaps.length; i++) {
          row.appendChild(document.createTextNode(segs[i] || ""));
          row.appendChild(addSelect((gaps[i] && gaps[i].options) || []));
        }
        row.appendChild(document.createTextNode(segs[segs.length - 1] || ""));
        wrap.appendChild(row);
      });
      container.appendChild(wrap);
    }
  });
}

async function loadPracticeExercise(skillOverride) {
  const auth = requireAuth();
  if (!auth) return;

  const params = new URLSearchParams(window.location.search);
  const skill = (skillOverride || params.get("skill") || "reading").toLowerCase().trim();
  const lang = (params.get("lang") || "en").toLowerCase().trim();
  const topic = (params.get("topic") || "").trim();
  const level = (params.get("level") || "").trim().toUpperCase() || undefined;

  const skillEl = document.getElementById("practice-skill");
  if (skillEl) skillEl.textContent = skill || "-";

  // Conversacion ahora es chat multi-turno via /api/chat/tutor, no un ejercicio "practice".
  if (skill === "conversacion") {
    const chatSettings = document.getElementById("chat-settings");
    if (chatSettings) chatSettings.style.display = "block";
    const langSel = document.getElementById("chat-lang");
    if (langSel && lang) langSel.value = lang;

    initTutorChat();
    return;
  } else {
    const chatSettings = document.getElementById("chat-settings");
    if (chatSettings) chatSettings.style.display = "none";
  }

  const genBody = { skill, lang, topic, ui_lang: getCurrentUiLangSync() };
  if (level) genBody.level = level;

  const res = await fetch(apiUrl("/api/practice/generate"), {
    method: "POST",
    headers: apiHeaders() || { "Content-Type": "application/json" },
    body: JSON.stringify(genBody),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    alert(data.detail || "No se pudo generar el ejercicio");
    return;
  }

  const ex = await res.json();
  let displayPregunta = ex.pregunta || "";
  if (ex.tipo !== "grammar_dialogue" && displayPregunta.includes("::")) {
    const parts = displayPregunta.split("::", 1);
    if (parts.length === 2) {
      displayPregunta = parts[1];
    }
  }
  if (ex.tipo !== "grammar_dialogue") {
    ex.pregunta = displayPregunta;
  }
  window.__corespeak_practice = ex;

  const chatWrap = document.getElementById("practice-chat-wrap");
  const qEl = document.getElementById("practice-question");
  if (ex && ex.tipo === "conversacion") {
    if (chatWrap) chatWrap.style.display = "block";
    if (qEl) qEl.style.display = "none";
    renderConversationChat(ex.pregunta || "", null, null);
  } else if (ex && ex.tipo === "grammar_dialogue" && ex.grammar_ui) {
    if (chatWrap) chatWrap.style.display = "none";
    if (qEl) qEl.style.display = "none";
  } else if (ex && ex.tipo === "grammar_dialogue") {
    if (chatWrap) chatWrap.style.display = "none";
    if (qEl) {
      qEl.style.display = "block";
      qEl.textContent = "";
      qEl.style.whiteSpace = "normal";
    }
  } else {
    if (chatWrap) chatWrap.style.display = "none";
    if (qEl) {
      qEl.style.display = "block";
      qEl.textContent = ex.pregunta || "";
      qEl.style.whiteSpace = "pre-line";
    }
  }

  const audioWrap = document.getElementById("practice-audio-wrap");
  const audioEl = document.getElementById("practice-audio");
  if (audioWrap && audioEl) {
    if (ex.tipo === "grammar_dialogue") {
      audioWrap.style.display = "none";
      audioEl.src = "";
    } else if (ex.audio_url) {
      audioWrap.style.display = "block";
      audioEl.src = ex.audio_url;
      audioEl.load();
    } else {
      audioWrap.style.display = "none";
      audioEl.src = "";
    }
  }

  const answerWrap = document.getElementById("answer-wrap");
  if (answerWrap) {
    answerWrap.innerHTML = "";
    if (ex.tipo === "grammar_dialogue" && ex.grammar_ui) {
      renderGrammarPack(answerWrap, ex.grammar_ui);
    } else if (ex.tipo === "grammar_dialogue") {
      const err = document.createElement("p");
      err.className = "text-danger mb-0";
      err.textContent = "No se pudo cargar el ejercicio estructurado. Pulsa «Generar otro».";
      answerWrap.appendChild(err);
    } else {
      const inputEl = document.createElement("textarea");
      inputEl.id = "practice-answer-input";
      inputEl.className = "form-control";
      inputEl.rows = 3;
      inputEl.placeholder = "Escribe tu mensaje...";
      answerWrap.appendChild(inputEl);
    }
  }

  const feedbackEl = document.getElementById("feedback-box");
  if (feedbackEl) feedbackEl.textContent = "";

  const submitBtn = document.getElementById("submit-practice-btn");
  if (submitBtn) submitBtn.disabled = false;
}

function clearNode(el) {
  while (el && el.firstChild) el.removeChild(el.firstChild);
}

function addChatRow(container, { speaker, text, placeholder }) {
  const row = document.createElement("div");
  row.className = "chat-row " + (speaker === "user" ? "user" : "ai");

  const bubble = document.createElement("div");
  bubble.className = "chat-bubble " + (placeholder ? "placeholder" : "") + (speaker === "user" ? " user" : " ai");
  bubble.textContent = text;

  row.appendChild(bubble);
  container.appendChild(row);
  return bubble;
}

function renderConversationChat(questionText, userAnswer, idealAnswer) {
  const chatContainer = document.getElementById("chat-container");
  if (!chatContainer) return;
  clearNode(chatContainer);

  // Mensaje inicial de IA
  if (questionText) {
    addChatRow(chatContainer, { speaker: "ai", text: questionText, placeholder: false });
  }

  // Respuesta del usuario
  if (userAnswer) {
    addChatRow(chatContainer, { speaker: "user", text: userAnswer, placeholder: false });
  }

  // Correccion / sugerencia de IA
  if (idealAnswer) {
    addChatRow(chatContainer, {
      speaker: "ai",
      text: "Sugerencia: " + idealAnswer,
      placeholder: false,
    });
  }
}

function getTutorSettings() {
  const langSel = document.getElementById("chat-lang");
  const levelSel = document.getElementById("chat-level");
  const params = new URLSearchParams(window.location.search);
  const langParam = (params.get("lang") || "").trim();
  const topicParam = (params.get("topic") || "").trim();
  const levelParam = (params.get("level") || "").trim().toUpperCase();
  const level = (levelSel && levelSel.value) || levelParam || "B1";
  return {
    lang: (langSel && langSel.value) ? langSel.value : (langParam || "en"),
    level,
    topic: topicParam,
  };
}

async function initTutorChat() {
  const chatWrap = document.getElementById("practice-chat-wrap");
  const qEl = document.getElementById("practice-question");
  if (chatWrap) chatWrap.style.display = "block";
  if (qEl) qEl.style.display = "none";

  // Resetea historial
  window.__tutor_history = [];
  clearNode(document.getElementById("chat-container"));

  // Saludo inicial de la IA
  const settings = getTutorSettings();
  const hello = await callTutorChat("Hi", settings);
  if (hello) {
    renderTutorChatMessage({ role: "assistant", content: hello.chat_response });
    renderTutorMeta(hello);
  }
}

function renderTutorChatMessage(msg) {
  const chatContainer = document.getElementById("chat-container");
  if (!chatContainer) return;
  addChatRow(chatContainer, {
    speaker: msg.role === "user" ? "user" : "ai",
    text: msg.content,
    placeholder: false,
  });
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

function renderTutorMeta(resp) {
  const feedbackEl = document.getElementById("feedback-box");
  if (!feedbackEl) return;

  const parts = [];
  if (resp.translation_hint) {
    parts.push("💬 Pista (tu idioma): " + resp.translation_hint);
  }
  if (resp.pedagogical_feedback) {
    const pf = resp.pedagogical_feedback;
    if (pf.correction) parts.push("✅ Corrección: " + pf.correction);
    if (pf.explanation) parts.push("📖 " + pf.explanation);
    if (pf.reference_book) parts.push("📚 Referencia: " + pf.reference_book);
  }
  if (resp.gamification) {
    const g = resp.gamification;
    parts.push("⭐ +" + String(g.xp_earned || 0) + " XP");
    if (g.new_vocabulary && g.new_vocabulary.length) {
      parts.push("📚 Vocabulario nuevo: " + g.new_vocabulary.join(", "));
    }
    if (g.milestone_reached) parts.push("🏆 " + g.milestone_reached);
  }
  if (resp.next_micro_challenge) {
    parts.push("⚡ Micro-reto: " + resp.next_micro_challenge);
  }
  if (resp.corrections && resp.corrections.length) {
    parts.push("💡 Notas:\n- " + resp.corrections.join("\n- "));
  }
  if (resp.explanation && !resp.pedagogical_feedback) {
    parts.push(resp.explanation);
  }
  if (resp.new_vocabulary && resp.new_vocabulary.length && !resp.gamification) {
    parts.push("📚 Vocabulario:\n- " + resp.new_vocabulary.join("\n- "));
  }
  feedbackEl.textContent = parts.join("\n\n");
  feedbackEl.style.whiteSpace = "pre-line";
}

async function callTutorChat(userMessage, { lang, level, topic }) {
  const auth = requireAuth();
  if (!auth) return null;

  const history = window.__tutor_history || [];
  const body = {
    lang,
    level,
    user_message: userMessage,
    history,
  };
  if (topic) body.topic = topic;
  const res = await fetch(apiUrl("/api/chat/tutor"), {
    method: "POST",
    headers: apiHeaders() || { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    let msg = "No se pudo hablar con el tutor";
    const d = data.detail;
    if (typeof d === "string") msg = d;
    else if (Array.isArray(d) && d.length)
      msg = d
        .map(function (x) {
          return x && x.msg ? x.msg : String(x);
        })
        .join("\n");
    alert(msg);
    return null;
  }

  const data = await res.json();
  // Actualiza historial
  history.push({ role: "user", content: userMessage });
  history.push({ role: "assistant", content: data.chat_response });
  window.__tutor_history = history;

  return data;
}

async function submitPracticeAnswer() {
  const auth = requireAuth();
  if (!auth) return;

  // Si es conversacion, usa el tutor chat.
  const params = new URLSearchParams(window.location.search);
  const skill = (params.get("skill") || "").toLowerCase().trim();
  if (skill === "conversacion") {
    const answer = document.getElementById("practice-answer-input")?.value || "";
    if (!answer.trim()) return;

    const settings = getTutorSettings();
    renderTutorChatMessage({ role: "user", content: answer });

    const resp = await callTutorChat(answer, settings);
    if (resp) {
      renderTutorChatMessage({ role: "assistant", content: resp.chat_response });
      renderTutorMeta(resp);
    }
    document.getElementById("practice-answer-input").value = "";
    return;
  }

  const ex = window.__corespeak_practice;
  if (!ex || !ex.id) {
    alert("Primero genera un ejercicio");
    return;
  }

  let answer = "";
  if (ex.tipo === "grammar_dialogue") {
    const gaps = document.querySelectorAll("[data-grammar-gap]");
    const pr = getUiPack(getCurrentUiLangSync()).practice || {};
    const answers = [];
    gaps.forEach((el) => answers.push((el.value || "").trim()));
    if (!gaps.length || answers.some((x) => !x)) {
      alert(pr.grammarIncomplete || "Fill every gap.");
      return;
    }
    answer = JSON.stringify({ answers });
  } else {
    answer = document.getElementById("practice-answer-input")?.value || "";
    if (!answer.trim()) return;
  }

  const submitBtn = document.getElementById("submit-practice-btn");
  if (submitBtn) submitBtn.disabled = true;

  const res = await fetch(apiUrl("/api/practice/" + ex.id + "/submit"), {
    method: "POST",
    headers: apiHeaders() || { "Content-Type": "application/json" },
    body: JSON.stringify({ answer }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    alert(data.detail || "Error al enviar");
    if (submitBtn) submitBtn.disabled = false;
    return;
  }

  const feedbackEl = document.getElementById("feedback-box");
  if (feedbackEl) {
    feedbackEl.textContent = data.feedback || "";
  }

  // Si es conversacion, renderiza el chat mostrando tu respuesta y la sugerencia.
  if (window.__corespeak_practice && window.__corespeak_practice.tipo === "conversacion") {
    renderConversationChat(
      window.__corespeak_practice.pregunta || "",
      answer,
      window.__corespeak_practice.expected_answer || ""
    );
  }

  if (submitBtn) submitBtn.disabled = false;
}

// Router simple por pagina
document.addEventListener("DOMContentLoaded", async () => {
  await initCoreSpeakUiLanguage();
  initPasswordVisibilityToggles();

  if (document.getElementById("login-form")) {
    void redirectIfAlreadyLoggedIn();
    document.getElementById("login-form").addEventListener("submit", (ev) => {
      ev.preventDefault();
      void login();
    });
  }
  if (document.getElementById("forgot-form")) {
    document.getElementById("forgot-form").addEventListener("submit", (ev) => {
      ev.preventDefault();
      void submitForgotPassword();
    });
  }
  if (document.getElementById("reset-form")) {
    initResetPasswordTokenFromUrl();
    document.getElementById("reset-form").addEventListener("submit", (ev) => {
      ev.preventDefault();
      void submitResetPassword();
    });
  }
  if (document.getElementById("register-form")) {
    document.getElementById("register-form").addEventListener("submit", (ev) => {
      ev.preventDefault();
      void register();
    });
  }
  if (document.getElementById("profile-setup-form")) {
    initProfileLevelQuiz();
    void initProfileSetupForm();
    document.getElementById("profile-setup-form").addEventListener("submit", (ev) => {
      ev.preventDefault();
      void saveProfileSetup();
    });
  }
  if (document.getElementById("admin-nav-wrap")) {
    applyAdminNavVisibility(false);
  }
  // Detecta automaticamente la pagina dashboard si existen elementos de estadisticas.
  if (document.getElementById("stat-streak")) {
    void loadMyProgress();
    loadDashboardCourses();
    initDashboardPremiumCta();
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") void loadMyProgress();
    });
    window.addEventListener("pageshow", function (ev) {
      if (ev.persisted) void loadMyProgress();
    });
  }

  // Si es practice.html, carga automaticamente y conecta botones.
  if (document.getElementById("practice-question")) {
    const prParams = new URLSearchParams(window.location.search);
    const urlLevel = prParams.get("level");
    const levelSelInit = document.getElementById("chat-level");
    if (urlLevel && levelSelInit) {
      const u = urlLevel.trim().toUpperCase();
      if (Array.from(levelSelInit.options).some((o) => o.value === u)) {
        levelSelInit.value = u;
      }
    }
    loadPracticeExercise();
    const submitBtn = document.getElementById("submit-practice-btn");
    if (submitBtn) submitBtn.addEventListener("click", submitPracticeAnswer);
    const genBtn = document.getElementById("generate-practice-btn");
    if (genBtn) genBtn.addEventListener("click", () => loadPracticeExercise());

    const langSel = document.getElementById("chat-lang");
    const levelSel = document.getElementById("chat-level");
    if (langSel) langSel.addEventListener("change", () => loadPracticeExercise());
    if (levelSel) levelSel.addEventListener("change", () => loadPracticeExercise());
  }

  // Si es course.html, carga el catálogo editorial (/api/catalog) por idioma.
  if (document.getElementById("course-lessons-list")) {
    loadDynamicCoursePage();
  }

  // Si es lesson.html, carga apartados por lección.
  if (document.getElementById("lesson-skills-list")) {
    void loadLessonPage();
  }

  // Si es onboarding.html
  if (document.getElementById("onboarding-save-btn")) {
    initOnboardingPanel();
    document.getElementById("onboarding-save-btn").addEventListener("click", saveOnboarding);
  }
  if (document.getElementById("config-personal-form")) {
    void initConfigPersonalName();
  }
  if (document.getElementById("config-english-level")) {
    void initConfigEnglishLevel();
  }
  if (document.getElementById("config-extra-langs-save")) {
    void initConfigExtraLanguages();
  }
  if (document.getElementById("config-change-password-btn")) {
    initConfigPasswordChange();
  }

  if (document.getElementById("agenda-tbody")) {
    initAgendaPage().catch((err) => console.error("initAgendaPage", err));
  }
});

/** Evita que un render en curso borre filas mientras carga la API. */
let agendaRenderGeneration = 0;

function setAgendaStatus(message, kind) {
  const el = document.getElementById("agenda-status-msg");
  if (!el) {
    if (message && kind === "err") window.alert(message);
    return;
  }
  const text = String(message || "").trim();
  if (!text) {
    el.textContent = "";
    el.classList.add("d-none");
    return;
  }
  el.textContent = text;
  el.className =
    "alert py-2 px-3 small mb-3 " +
    (kind === "ok" ? "alert-success" : kind === "info" ? "alert-info" : "alert-danger");
  el.classList.remove("d-none");
}

async function loadAgendaWords() {
  const headers = apiHeaders();
  if (!headers) return [];
  try {
    const res = await fetch(apiUrl("/api/agenda/words"), { headers });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.warn("loadAgendaWords HTTP", res.status, data);
      return { error: formatApiErrorDetail(data) || "No se pudo cargar la agenda" };
    }
    const data = await res.json().catch(() => []);
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.warn("loadAgendaWords", e);
    return { error: "No se pudo contactar con el servidor. Comprueba que la API esté en marcha." };
  }
}

async function saveAgendaRow(id, word, meaning) {
  const auth = requireAuth();
  if (!auth) return false;
  const res = await fetch(apiUrl("/api/agenda/words/" + id), {
    method: "PATCH",
    headers: {
      Authorization: "Bearer " + auth.token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ word, meaning }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    setAgendaStatus(data.detail || "No se pudieron guardar los cambios en la agenda.", "err");
    return false;
  }
  setAgendaStatus("Cambios guardados en tu agenda.", "ok");
  return true;
}

async function createAgendaWord(word, meaning) {
  const auth = requireAuth();
  if (!auth) return null;
  const w = (word || "").trim();
  const m = (meaning || "").trim();
  try {
    const res = await fetch(apiUrl("/api/agenda/words"), {
      method: "POST",
      headers: {
        Authorization: "Bearer " + auth.token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ word: w, meaning: m }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setAgendaStatus(data.detail || "No se pudo añadir la palabra a la agenda.", "err");
      return null;
    }
    return res.json();
  } catch (e) {
    setAgendaStatus(
      "No se pudo contactar con el servidor. Abre la app desde la misma URL que la API y comprueba que el backend esté en marcha.",
      "err"
    );
    return null;
  }
}

async function deleteAgendaWord(id) {
  const auth = requireAuth();
  if (!auth) return false;
  const res = await fetch(apiUrl("/api/agenda/words/" + id), {
    method: "DELETE",
    headers: { Authorization: "Bearer " + auth.token },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    setAgendaStatus(data.detail || "No se pudo eliminar la palabra de la agenda.", "err");
    return false;
  }
  return true;
}

function buildAgendaRowTr(item) {
  const ag = getUiPack(getCurrentUiLangSync()).agenda || {};

  const tr = document.createElement("tr");
  tr.dataset.id = String(item.id);

  const tdWord = document.createElement("td");
  tdWord.className = "agenda-col-word";
  const inpWord = document.createElement("input");
  inpWord.type = "text";
  inpWord.className = "agenda-cell-input agenda-cell-word";
  inpWord.placeholder = ag.rowWordPh || "";
  inpWord.value = item.word || "";
  tdWord.appendChild(inpWord);

  const tdMean = document.createElement("td");
  tdMean.className = "agenda-col-meaning";
  const inpMean = document.createElement("textarea");
  inpMean.rows = 2;
  inpMean.className = "agenda-cell-input agenda-cell-meaning";
  inpMean.placeholder = ag.rowMeanPh || "";
  inpMean.value = item.meaning || "";
  tdMean.appendChild(inpMean);

  const tdAct = document.createElement("td");
  tdAct.className = "text-end agenda-col-actions";
  const btnDel = document.createElement("button");
  btnDel.type = "button";
  btnDel.className = "agenda-btn-icon agenda-btn-delete";
  btnDel.title = ag.deleteRowTitle || "";
  btnDel.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0z"/><path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4zM2.5 3h11V2h-11z"/></svg>';
  tdAct.appendChild(btnDel);

  tr.appendChild(tdWord);
  tr.appendChild(tdMean);
  tr.appendChild(tdAct);

  const id = item.id;

  async function persistAgendaRowEdits() {
    await saveAgendaRow(id, inpWord.value.trim(), inpMean.value.trim());
  }
  inpWord.addEventListener("blur", () => void persistAgendaRowEdits());
  inpMean.addEventListener("blur", () => void persistAgendaRowEdits());

  btnDel.addEventListener("click", async () => {
    if (!confirm(ag.confirmDelete || "")) return;
    const ok = await deleteAgendaWord(id);
    if (ok) {
      tr.remove();
      setAgendaStatus("Palabra eliminada de tu agenda.", "ok");
    }
  });

  return tr;
}

async function renderAgendaTable() {
  const tbody = document.getElementById("agenda-tbody");
  if (!tbody) return;

  const gen = ++agendaRenderGeneration;
  const loaded = await loadAgendaWords();
  if (gen !== agendaRenderGeneration) {
    return;
  }

  const loading = document.getElementById("agenda-loading-row");
  if (loading) loading.remove();

  tbody.innerHTML = "";

  if (loaded && loaded.error) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 3;
    td.className = "text-center text-muted py-5";
    td.textContent = loaded.error;
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  const words = Array.isArray(loaded) ? loaded : [];

  if (words.length === 0) {
    const ag = getUiPack(getCurrentUiLangSync()).agenda || {};
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 3;
    td.className = "text-center text-muted py-5";
    td.innerHTML = ag.emptyHtml || "";
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  words.forEach((w) => tbody.appendChild(buildAgendaRowTr(w)));
}

async function initAgendaPage() {
  const auth = requireAuth();
  if (!auth) return;

  const addBtn = document.getElementById("agenda-add-row");
  const newWordModal = document.getElementById("agenda-new-word-modal");
  const newWordCard = document.getElementById("agenda-new-word-card");
  const newWordInput = document.getElementById("agenda-new-word-input");
  const newMeaningInput = document.getElementById("agenda-new-meaning-input");
  const newWordSave = document.getElementById("agenda-new-word-save");
  const newWordCancel = document.getElementById("agenda-new-word-cancel");
  let releaseAgendaModalFocus = null;
  let agendaModalTrigger = null;

  function closeAgendaNewWordModal() {
    if (newWordModal) newWordModal.classList.add("d-none");
    if (newWordSave) newWordSave.disabled = false;
    if (typeof releaseAgendaModalFocus === "function") {
      releaseAgendaModalFocus();
      releaseAgendaModalFocus = null;
    }
  }

  function openAgendaNewWordModal() {
    if (!newWordModal || !newWordInput) return;
    agendaModalTrigger = document.activeElement;
    newWordInput.value = "";
    if (newMeaningInput) newMeaningInput.value = "";
    newWordModal.classList.remove("d-none");
    if (typeof CoreSpeakA11y !== "undefined" && newWordCard) {
      if (typeof releaseAgendaModalFocus === "function") releaseAgendaModalFocus();
      releaseAgendaModalFocus = CoreSpeakA11y.trapFocus(newWordCard, {
        returnFocusTo: agendaModalTrigger,
        onEscape: () => closeAgendaNewWordModal(),
      });
    }
    setTimeout(() => newWordInput.focus(), 50);
  }

  async function submitAgendaNewWord() {
    if (!newWordSave || !newWordInput) return;
    if (newWordSave.disabled) return;
    const w = newWordInput.value.trim();
    const m = (newMeaningInput && newMeaningInput.value.trim()) || "";
    if (!w && !m) {
      setAgendaStatus("Escribe al menos la palabra o el significado antes de guardar.", "err");
      newWordInput.focus();
      return;
    }
    newWordSave.disabled = true;
    setAgendaStatus("Guardando la nueva palabra en tu agenda…", "info");
    let created;
    try {
      created = await createAgendaWord(w, m);
    } finally {
      newWordSave.disabled = false;
    }
    if (!created) {
      return;
    }
    const newId = created.id;
    if (newId == null || newId === "") {
      setAgendaStatus("La palabra se creó, pero falta su identificador. Recarga la página.", "err");
      return;
    }
    closeAgendaNewWordModal();

    const tbody = document.getElementById("agenda-tbody");
    if (tbody) {
      agendaRenderGeneration += 1;
      const emptyCell = tbody.querySelector("td[colspan='3']");
      if (emptyCell && emptyCell.closest("tr")) {
        emptyCell.closest("tr").remove();
      }
      const dup = tbody.querySelector('tr[data-id="' + String(newId) + '"]');
      if (!dup) {
        tbody.appendChild(buildAgendaRowTr(created));
      }
      const focusEl = tbody.querySelector('tr[data-id="' + String(newId) + '"] .agenda-cell-meaning');
      if (focusEl) focusEl.focus();
    }

    await renderAgendaTable();
    setAgendaStatus("Palabra añadida correctamente. Ya puedes completar o editar el significado.", "ok");
    const rowAfter = document.querySelector('#agenda-tbody tr[data-id="' + String(newId) + '"]');
    const inpAfter = rowAfter && rowAfter.querySelector(".agenda-cell-meaning");
    if (inpAfter) inpAfter.focus();
  }

  if (addBtn) {
    addBtn.addEventListener("click", () => openAgendaNewWordModal());
  }
  if (newWordSave) {
    newWordSave.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      void submitAgendaNewWord();
    });
  }
  if (newWordCancel) {
    newWordCancel.addEventListener("click", () => closeAgendaNewWordModal());
  }
  if (newWordCard) {
    newWordCard.addEventListener("click", (ev) => ev.stopPropagation());
  }
  if (newWordModal) {
    newWordModal.addEventListener("click", (ev) => {
      if (ev.target === newWordModal) closeAgendaNewWordModal();
    });
  }
  if (newWordInput) {
    newWordInput.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        void submitAgendaNewWord();
      }
    });
  }

  void renderAgendaTable();
}

function corespeakYoutubeVideoId(url) {
  if (!url || typeof url !== "string") return null;
  const u = url.trim();
  const m = u.match(/(?:v=|youtu\.be\/|shorts\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

/**
 * URL lista para <iframe src>. Prioriza la del API; si no, convierte watch?v= → embed/
 * (y youtu.be / shorts vía ID).
 */
function corespeakYoutubeIframeSrc(originalUrl, embedUrlFromApi) {
  const fromApi = embedUrlFromApi != null ? String(embedUrlFromApi).trim() : "";
  if (fromApi) {
    if (fromApi.startsWith("http://")) return fromApi.replace("http://", "https://");
    return fromApi;
  }
  if (!originalUrl || typeof originalUrl !== "string") return null;
  let u = originalUrl.trim();
  if (u.includes("watch?v=")) {
    let embed = u.replace("watch?v=", "embed/");
    embed = embed.split("&")[0].split("#")[0];
    if (embed.startsWith("http://")) embed = embed.replace("http://", "https://");
    return embed;
  }
  const id = corespeakYoutubeVideoId(u);
  return id ? "https://www.youtube.com/embed/" + id : null;
}

/** Ruta bajo /static/ o URL absoluta → URL lista para img/video src */
function corespeakLessonMediaSrc(pathOrUrl) {
  if (pathOrUrl == null || pathOrUrl === "") return "";
  const s = String(pathOrUrl).trim();
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  return staticUrl("/static/" + s.replace(/^\/+/, ""));
}

function corespeakExtraVideoIframeSrc(url, embedUrlFromApi, kind) {
  const fromApi = embedUrlFromApi != null ? String(embedUrlFromApi).trim() : "";
  if (fromApi) {
    return fromApi.startsWith("http://") ? fromApi.replace("http://", "https://") : fromApi;
  }
  const k = (kind || "").toLowerCase();
  if (k === "youtube") return corespeakYoutubeIframeSrc(url, null);
  const m = String(url || "").match(/vimeo\.com\/(?:video\/)?(\d+)/i);
  if (m) return "https://player.vimeo.com/video/" + m[1];
  return null;
}

function corespeakLimpiarTexto(texto) {
  if (texto == null) return "";
  return String(texto)
    .toLowerCase()
    .trim()
    .replace(/[.,/#!$%^&*;:{}=\-_`~()'"]/g, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function corespeakCollectValidAnswers(b) {
  if (!b || typeof b !== "object") return [];
  if (Array.isArray(b.respuestas_validas)) {
    return b.respuestas_validas.map(function (x) {
      return String(x).trim();
    }).filter(Boolean);
  }
  const one =
    b.respuesta_correcta != null
      ? b.respuesta_correcta
      : b.answer != null
        ? b.answer
        : b.expected_answer != null
          ? b.expected_answer
          : b.correcta != null
            ? b.correcta
            : null;
  if (one != null && String(one).trim()) return [String(one).trim()];
  return [];
}

function corespeakAnswerMatchesValid(userInput, validList) {
  const cleanedUser = corespeakLimpiarTexto(userInput);
  if (!cleanedUser) return false;
  for (let i = 0; i < validList.length; i++) {
    if (corespeakLimpiarTexto(validList[i]) === cleanedUser) return true;
  }
  return false;
}

function corespeakAnswerListMatchesValid(userInputs, validList) {
  const cleanedUser = (Array.isArray(userInputs) ? userInputs : [])
    .map(function (x) { return corespeakLimpiarTexto(x); })
    .filter(Boolean)
    .sort();
  const cleanedValid = (Array.isArray(validList) ? validList : [])
    .map(function (x) { return corespeakLimpiarTexto(x); })
    .filter(Boolean)
    .sort();
  if (cleanedUser.length === 0 || cleanedUser.length !== cleanedValid.length) return false;
  for (let i = 0; i < cleanedUser.length; i++) {
    if (cleanedUser[i] !== cleanedValid[i]) return false;
  }
  return true;
}

function corespeakExerciseQuestionText(b) {
  if (!b || typeof b !== "object") return "";
  return String(
    b.pregunta != null
      ? b.pregunta
      : b.prompt != null
        ? b.prompt
        : b.question != null
          ? b.question
          : b.text != null
            ? b.text
            : b.instruction != null
              ? b.instruction
              : b.source != null
                ? b.source
                : ""
  );
}

/** Ruta bajo /static/ o URL para imagen opcional de un bloque de ejercicio del catálogo */
function corespeakExerciseBlockImagePath(b) {
  if (!b || typeof b !== "object") return "";
  const p = b.image != null ? b.image : b.image_path != null ? b.image_path : "";
  return String(p || "").trim();
}

function corespeakRenderCatalogExercises(container, exercisesJson, lc) {
  let data = {};
  try {
    data = JSON.parse(exercisesJson || "{}");
  } catch (e) {
    const pre = document.createElement("pre");
    pre.className = "small text-danger";
    pre.textContent = "JSON inválido en ejercicios.";
    container.appendChild(pre);
    return;
  }
  if (data && data.locked) {
    const p = document.createElement("p");
    p.className = "text-muted";
    p.textContent = data.message || lc.catalogCoursePremium || "";
    container.appendChild(p);
    return;
  }
  const blocks = data && Array.isArray(data.blocks) ? data.blocks : [];
  if (blocks.length === 0) {
    const p = document.createElement("p");
    p.className = "text-muted";
    p.textContent = lc.lessonNoExercises || "";
    container.appendChild(p);
    return;
  }

  const heading = document.createElement("h5");
  heading.className = "mt-4 mb-3";
  heading.textContent = lc.exercisesHeading || "Ejercicios";
  container.appendChild(heading);

  blocks.forEach(function (b, idx) {
    const type = (b && b.type) ? String(b.type) : "bloque";
    const valid = corespeakCollectValidAnswers(b);
    const qText = corespeakExerciseQuestionText(b);
    const opciones = Array.isArray(b.opciones) ? b.opciones : Array.isArray(b.options) ? b.options : null;
    const isSingleChoice = String(b && b.selection_mode || "").toLowerCase() === "single_choice";

    const card = document.createElement("div");
    card.className = "card mb-3 border shadow-sm";
    const body = document.createElement("div");
    body.className = "card-body";

    const exImgPath = corespeakExerciseBlockImagePath(b);
    if (exImgPath) {
      const imgWrap = document.createElement("div");
      imgWrap.className = "text-center mb-3";
      const img = document.createElement("img");
      img.src = corespeakLessonMediaSrc(exImgPath);
      img.alt = qText
        ? "Ilustración del ejercicio: " + qText
        : "Ilustración del ejercicio";
      img.className = "lesson-exercise-photo";
      img.width = 120;
      img.height = 120;
      img.loading = "lazy";
      imgWrap.appendChild(img);
      body.appendChild(imgWrap);
    }

    const titleRow = document.createElement("h6");
    titleRow.className = "card-title text-primary";
    const meta = [];
    if (b && b.cefr) meta.push(String(b.cefr));
    if (b && b.topic) meta.push(String(b.topic));
    titleRow.textContent = type + (meta.length ? " · " + meta.join(" · ") : "");
    body.appendChild(titleRow);

    if (type === "flashcards" || type === "flashcard") {
      const term = (b && (b.term || b.frente || b.palabra)) || "";
      const def = (b && (b.definition || b.reverso || b.significado)) || "";
      const p1 = document.createElement("p");
      p1.className = "fw-bold mb-1";
      p1.textContent = term || qText || "—";
      body.appendChild(p1);
      const p2 = document.createElement("p");
      p2.className = "text-muted small mb-0";
      p2.textContent = def || "";
      body.appendChild(p2);
      card.appendChild(body);
      container.appendChild(card);
      return;
    }

    if (qText) {
      const pq = document.createElement("p");
      pq.className = "card-text mb-3";
      pq.textContent = qText;
      body.appendChild(pq);
    }

    const uid = "ex-" + idx + "-" + Math.random().toString(36).slice(2, 9);
    let inputEl = null;
    const choices = [];

    if (opciones && opciones.length > 0 && (type === "quiz" || type === "test" || type === "multiple_choice")) {
      const wrap = document.createElement("div");
      wrap.className = "d-flex flex-column gap-2";
      opciones.forEach(function (opt, j) {
        const labelText = typeof opt === "object" && opt != null ? opt.texto || opt.text || opt.label : String(opt);
        const id = uid + "-o" + j;
        const row = document.createElement("div");
        row.className = "form-check";
        const choice = document.createElement("input");
        choice.type = isSingleChoice ? "radio" : "checkbox";
        choice.className = "form-check-input";
        if (isSingleChoice) choice.name = uid + "-mc";
        choice.id = id;
        choice.value = String(labelText);
        choices.push(choice);
        const lab = document.createElement("label");
        lab.className = "form-check-label";
        lab.setAttribute("for", id);
        lab.textContent = String(labelText);
        row.appendChild(choice);
        row.appendChild(lab);
        wrap.appendChild(row);
      });
      body.appendChild(wrap);
    } else {
      inputEl = document.createElement("input");
      inputEl.type = "text";
      inputEl.className = "form-control mb-2";
      inputEl.setAttribute("autocomplete", "off");
      inputEl.id = uid + "-inp";
      inputEl.setAttribute("aria-label", "Respuesta");
      body.appendChild(inputEl);
    }

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-primary btn-sm";
    btn.textContent = lc.exerciseCheck || "Comprobar";

    const feedback = document.createElement("div");
    feedback.className = "small mt-2 fw-semibold";
    feedback.style.minHeight = "1.25rem";

    btn.addEventListener("click", function () {
      let userVal = "";
      let userVals = [];
      if (inputEl) userVal = (inputEl.value || "").trim();
      else {
        userVals = choices.filter(function (x) { return x.checked; }).map(function (x) { return x.value; });
        userVal = userVals[0] || "";
      }
      if (!userVal) {
        feedback.className = "small mt-2 text-warning";
        feedback.textContent = lc.exerciseNeedAnswer || "";
        return;
      }
      if (valid.length === 0) {
        feedback.className = "small mt-2 text-muted";
        feedback.textContent = lc.exerciseNoValidConfig || "";
        return;
      }
      const ok = inputEl
        ? corespeakAnswerMatchesValid(userVal, valid)
        : isSingleChoice
          ? corespeakAnswerMatchesValid(userVal, valid)
          : corespeakAnswerListMatchesValid(userVals, valid);
      feedback.className = "small mt-2 fw-semibold " + (ok ? "text-success" : "text-danger");
      feedback.textContent = ok ? lc.exerciseCorrect || "OK" : lc.exerciseWrong || "—";
    });

    body.appendChild(btn);
    body.appendChild(feedback);
    card.appendChild(body);
    container.appendChild(card);
  });
}

async function loadDynamicCoursePage() {
  const auth = requireAuth();
  if (!auth) return;

  const uiLang = await getEffectiveUiLang(auth);
  const lc = uiLessonCoursePack(uiLang);
  document.documentElement.lang = uiLang;

  const backLbl = document.getElementById("course-back-label");
  if (backLbl) backLbl.textContent = lc.back;
  const tipTitleEl = document.getElementById("course-tip-title");
  if (tipTitleEl) tipTitleEl.textContent = lc.tipTitle;
  const tipBodyEl = document.getElementById("course-tip-body");
  if (tipBodyEl) tipBodyEl.textContent = lc.tipBody;
  const lessonsHeadEl = document.getElementById("course-lessons-heading");
  if (lessonsHeadEl) lessonsHeadEl.textContent = lc.lessonsHeading;

  const titleLoading = document.getElementById("course-title");
  if (titleLoading) titleLoading.textContent = lc.loadingCourse;

  const params = new URLSearchParams(window.location.search);
  const lang = (params.get("lang") || "en").toLowerCase().trim();

  const setCourseError = (message) => {
    const titleEl = document.getElementById("course-title");
    if (titleEl) titleEl.textContent = lc.courseErrorTitle;
    const listEl = document.getElementById("course-lessons-list");
    if (listEl) {
      listEl.innerHTML = "";
      const p = document.createElement("p");
      p.className = "text-danger mb-0";
      p.textContent = message;
      listEl.appendChild(p);
    }
  };

  const FLAG_BY_LANG = { en: "gb", es: "es", fr: "fr", de: "de", uk: "ua" };
  const flagEl = document.getElementById("course-flag");
  const langDisplay = getCourseLanguageDisplayName(lang);
  if (flagEl) {
    flagEl.src = "https://flagcdn.com/w160/" + (FLAG_BY_LANG[lang] || "gb") + ".png";
    flagEl.alt = "Bandera de " + langDisplay;
  }

  let res;
  try {
    res = await fetch(apiUrl("/api/catalog/courses?lang=" + encodeURIComponent(lang)), {
      headers: { Authorization: "Bearer " + auth.token },
    });
  } catch (e) {
    console.warn("loadDynamicCoursePage: red", e);
    setCourseError(lc.courseErrorNetwork);
    return;
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const detail = formatApiErrorDetail(data);
    setCourseError(detail || lc.courseErrorFallback(res.status));
    return;
  }

  const courses = await res.json().catch(() => []);
  const list = Array.isArray(courses) ? courses : [];

  const titleEl = document.getElementById("course-title");
  if (titleEl) {
    titleEl.textContent =
      list.length === 1
        ? list[0].title || getCourseLanguageDisplayName(lang)
        : getCourseLanguageDisplayName(lang);
  }

  let totalLessons = 0;
  let openLessons = 0;
  const accessible = list.filter((c) => c && c.accessible);
  const lessonResults = await Promise.all(
    accessible.map(async function (c) {
      const r = await fetch(apiUrl("/api/catalog/courses/" + c.id + "/lessons"), {
        headers: { Authorization: "Bearer " + auth.token },
      });
      const rows = r.ok ? await r.json().catch(() => []) : [];
      return { courseId: c.id, lessons: Array.isArray(rows) ? rows : [] };
    })
  );
  const lessonsByCourseId = {};
  lessonResults.forEach(function (x) {
    lessonsByCourseId[x.courseId] = x.lessons;
  });

  list.forEach(function (c) {
    if (!c || !c.accessible) return;
    const les = lessonsByCourseId[c.id] || [];
    totalLessons += les.length;
    les.forEach(function (le) {
      if (le && le.accessible) openLessons += 1;
    });
  });

  const level =
    list.length === 1 && list[0].cefr_level
      ? String(list[0].cefr_level).toUpperCase()
      : "—";

  const progressTextEl = document.getElementById("course-progress-text");
  if (progressTextEl) {
    progressTextEl.textContent = lc.progressCompleted(0, Math.max(totalLessons, 0), level);
  }

  const progressWrap = document.querySelector(".course-intro .progress");
  const progressBarEl = document.getElementById("course-progress-bar");
  const pct = totalLessons > 0 ? 5 : 0;
  if (progressBarEl) {
    progressBarEl.style.width = pct + "%";
  }
  if (progressWrap) {
    progressWrap.setAttribute("aria-valuenow", String(pct));
    progressWrap.setAttribute("aria-valuemin", "0");
    progressWrap.setAttribute("aria-valuemax", "100");
    progressWrap.setAttribute(
      "aria-label",
      "Progreso del curso de " + langDisplay + ": " + pct + " por ciento"
    );
  }

  const availableEl = document.getElementById("course-available");
  if (availableEl) {
    availableEl.textContent = lc.availableCount(openLessons);
  }

  const listEl = document.getElementById("course-lessons-list");
  if (!listEl) return;
  listEl.innerHTML = "";

  if (list.length === 0) {
    const p = document.createElement("p");
    p.className = "text-muted";
    p.textContent = lc.catalogEmpty || "";
    listEl.appendChild(p);
    return;
  }

  list.forEach(function (course) {
    const block = document.createElement("div");
    block.className = "mb-4";

    const head = document.createElement("div");
    head.className = "d-flex flex-wrap align-items-center justify-content-between gap-2 border-bottom pb-2 mb-3";
    const h5 = document.createElement("h5");
    h5.className = "mb-0 section-title";
    h5.textContent = course.title || "—";
    const meta = document.createElement("span");
    meta.className = "small text-muted";
    meta.textContent = (course.cefr_level || "").toString().toUpperCase();
    head.appendChild(h5);
    head.appendChild(meta);
    if (course.is_premium) {
      const badge = document.createElement("span");
      badge.className = "badge bg-warning text-dark";
      badge.textContent = lc.premiumShort || "Premium";
      head.appendChild(badge);
    }
    block.appendChild(head);

    if (!course.accessible) {
      const p = document.createElement("p");
      p.className = "text-muted mb-0";
      p.textContent = lc.catalogCoursePremium || "";
      block.appendChild(p);
      listEl.appendChild(block);
      return;
    }

    const lessons = lessonsByCourseId[course.id] || [];
    if (lessons.length === 0) {
      const p = document.createElement("p");
      p.className = "text-muted small mb-0";
      p.textContent = lc.catalogCourseNoLessons || "";
      block.appendChild(p);
      listEl.appendChild(block);
      return;
    }

    const levelForLinks = (course.cefr_level || "B1").toString().toUpperCase().trim();

    lessons.forEach(function (lesson) {
      const card = document.createElement("div");
      card.className = "card lesson-card mb-3";

      const isLocked = !lesson.accessible;
      const iconClass = isLocked ? "icon-locked" : "icon-active";
      const titleMuted = isLocked ? " text-muted" : "";
      const descMuted = isLocked ? " text-muted" : "";

      const rightAction = isLocked
        ? '<span class="badge-locked">' + lc.locked + "</span>"
        : (
            '<a href="lesson.html?lesson_id=' +
            encodeURIComponent(String(lesson.id)) +
            "&lang=" +
            encodeURIComponent(lang) +
            "&course_id=" +
            encodeURIComponent(String(course.id)) +
            "&level=" +
            encodeURIComponent(levelForLinks) +
            '">' +
            '<button type="button" class="btn btn-primary-gradient">' +
            '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-play-fill me-1" viewBox="0 0 16 16">' +
            '<path d="m11.596 8.697-6.363 3.692c-.54.313-1.233-.066-1.233-.697V4.308c0-.63.692-1.01 1.233-.696l6.363 3.692a.802.802 0 0 1 0 1.393"/>' +
            "</svg>" +
            lc.start +
            "</button></a>"
          );

      card.innerHTML =
        '<div class="card-body d-flex align-items-center justify-content-between flex-wrap">' +
        '<div class="d-flex align-items-center">' +
        '<div class="lesson-icon ' +
        iconClass +
        '">' +
        (isLocked
          ? '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="white" class="bi bi-lock-fill" viewBox="0 0 16 16"><path d="M8 1a2 2 0 0 1 2 2v4H6V3a2 2 0 0 1 2-2m3 6V3a3 3 0 0 0-6 0v4a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2"/></svg>'
          : '<div class="inner-circle"></div>') +
        "</div>" +
        '<div class="ms-3">' +
        '<h6 class="lesson-title' +
        titleMuted +
        '">' +
        (lesson.title || "—") +
        "</h6>" +
        '<p class="lesson-desc' +
        descMuted +
        '">' +
        (lesson.description || "") +
        "</p>" +
        "</div>" +
        "</div>" +
        rightAction +
        "</div>";

      block.appendChild(card);
    });

    listEl.appendChild(block);
  });
}

async function loadLessonPage() {
  const auth = requireAuth();
  if (!auth) return;

  const uiLang = await getEffectiveUiLang(auth);
  const lc = uiLessonCoursePack(uiLang);
  document.documentElement.lang = uiLang;

  const params = new URLSearchParams(window.location.search);
  const lang = (params.get("lang") || "en").toLowerCase().trim();
  const level = (params.get("level") || "B1").trim().toUpperCase();
  const lessonIdRaw = (params.get("lesson_id") || "").trim();

  const backLink = document.getElementById("lesson-back-link");
  if (backLink) {
    backLink.textContent = lc.back;
    backLink.setAttribute("href", "course.html?lang=" + encodeURIComponent(lang));
  }
  const adminWrap = document.getElementById("lesson-admin-actions");
  const adminMsg = document.getElementById("lesson-admin-msg");
  const editBtn = document.getElementById("lesson-edit-btn");
  const deleteBtn = document.getElementById("lesson-delete-btn");

  function setLessonAdminMessage(message, kind) {
    if (!adminMsg) return;
    const text = String(message || "").trim();
    if (!text) {
      adminMsg.textContent = "";
      adminMsg.className = "small mt-2 mb-0 d-none";
      return;
    }
    adminMsg.textContent = text;
    adminMsg.className =
      "small mt-2 mb-0 " +
      (kind === "ok" ? "text-success" : kind === "info" ? "text-primary" : "text-danger");
  }

  const lessonTitleEl = document.getElementById("lesson-title");
  const lessonMetaEl = document.getElementById("lesson-meta-line");
  const listEl = document.getElementById("lesson-skills-list");
  if (!listEl) return;

  listEl.innerHTML = "";
  listEl.className = "mt-3";

  if (!lessonIdRaw || !/^\d+$/.test(lessonIdRaw)) {
    if (lessonTitleEl) lessonTitleEl.textContent = lc.courseErrorTitle || "—";
    if (lessonMetaEl) lessonMetaEl.textContent = "";
    const p = document.createElement("p");
    p.className = "text-muted";
    p.textContent = lc.lessonSelectFromCourse || "";
    listEl.appendChild(p);
    return;
  }

  let res;
  try {
    res = await fetch(apiUrl("/api/catalog/lessons/" + encodeURIComponent(lessonIdRaw)), {
      headers: { Authorization: "Bearer " + auth.token },
    });
  } catch (e) {
    console.warn("loadLessonPage", e);
    if (lessonTitleEl) lessonTitleEl.textContent = lc.lessonLoadError || "";
    return;
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    if (lessonTitleEl) lessonTitleEl.textContent = lc.lessonLoadError || "";
    const p = document.createElement("p");
    p.className = "text-danger";
    p.textContent = formatApiErrorDetail(data) || lc.courseErrorFallback(res.status);
    listEl.appendChild(p);
    return;
  }

  const detail = await res.json().catch(() => null);
  if (!detail) {
    if (lessonTitleEl) lessonTitleEl.textContent = lc.lessonLoadError || "";
    return;
  }

  let isAdmin = false;
  try {
    const meRes = await fetch(apiUrl("/api/auth/me"), {
      headers: { Authorization: "Bearer " + auth.token },
    });
    if (meRes.ok) {
      const me = await meRes.json().catch(() => null);
      isAdmin = String(me?.role || "").toLowerCase() === "admin";
    }
  } catch (e) {
    console.warn("loadLessonPage admin role", e);
  }

  if (adminWrap && isAdmin) {
    adminWrap.classList.remove("d-none");
    if (editBtn) {
      editBtn.href = "admin.html?lesson_id=" + encodeURIComponent(lessonIdRaw);
    }
    if (deleteBtn && !deleteBtn.dataset.corespeakBound) {
      deleteBtn.dataset.corespeakBound = "1";
      deleteBtn.addEventListener("click", async function () {
        const title = detail.title || ("ID " + lessonIdRaw);
        if (!window.confirm("¿Eliminar la lección «" + title + "»? Esta acción no se puede deshacer.")) {
          return;
        }
        deleteBtn.disabled = true;
        setLessonAdminMessage("Eliminando la lección…", "info");
        try {
          const delRes = await fetch(apiUrl("/api/admin/lessons/" + encodeURIComponent(lessonIdRaw)), {
            method: "DELETE",
            headers: { Authorization: "Bearer " + auth.token },
          });
          const delData = await delRes.json().catch(() => ({}));
          if (!delRes.ok) {
            setLessonAdminMessage(
              formatApiErrorDetail(delData) || delData.detail || "No se pudo borrar la lección.",
              "err"
            );
            deleteBtn.disabled = false;
            return;
          }
          setLessonAdminMessage("Lección eliminada. Volviendo al curso…", "ok");
          setTimeout(function () {
            window.location.href = backLink?.getAttribute("href") || "dashboard.html";
          }, 500);
        } catch (err) {
          console.warn("delete lesson from lesson page", err);
          setLessonAdminMessage("No se pudo borrar la lección por un problema de red.", "err");
          deleteBtn.disabled = false;
        }
      });
    }
  } else if (adminWrap) {
    adminWrap.classList.add("d-none");
  }

  if (lessonTitleEl) lessonTitleEl.textContent = detail.title || "—";
  if (lessonMetaEl) {
    lessonMetaEl.textContent =
      (lc.topicPrefix || "Tema") + ": " + (detail.description || "—") + " · MCER " + level;
  }

  if (!document.getElementById("corespeak-lesson-media-styles")) {
    const st = document.createElement("style");
    st.id = "corespeak-lesson-media-styles";
    st.textContent =
      ".corespeak-lesson-media-row{align-items:stretch}" +
      ".corespeak-lesson-transcript{border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc;padding:12px;max-height:min(360px,55vh);overflow-y:auto;font-size:0.9rem;line-height:1.45;white-space:pre-wrap;word-break:break-word}" +
      ".corespeak-lesson-transcript h6{font-size:0.85rem;font-weight:600;margin-bottom:8px;color:#475569}" +
      ".corespeak-lesson-cover img{box-shadow:0 8px 28px rgba(15,23,42,.12)}" +
      ".corespeak-lesson-gallery img{aspect-ratio:4/3}";
    document.head.appendChild(st);
  }

  if (detail.cover_image_path && detail.accessible) {
    const cover = document.createElement("div");
    cover.className = "corespeak-lesson-cover mb-4 text-center";
    const im = document.createElement("img");
    im.className = "img-fluid rounded-3";
    im.style.maxHeight = "min(360px, 50vh)";
    im.style.width = "auto";
    im.style.objectFit = "cover";
    im.alt = detail.title
      ? "Imagen de portada de la lección: " + detail.title
      : "Imagen de portada de la lección";
    im.src = corespeakLessonMediaSrc(detail.cover_image_path);
    cover.appendChild(im);
    listEl.appendChild(cover);
  }

  const galleryImages = Array.isArray(detail.gallery_images) ? detail.gallery_images : [];
  if (galleryImages.length && detail.accessible) {
    const grow = document.createElement("div");
    grow.className = "row g-3 mb-4 corespeak-lesson-gallery";
    galleryImages.forEach(function (src) {
      if (!src) return;
      const col = document.createElement("div");
      col.className = "col-6 col-md-4";
      const im = document.createElement("img");
      im.className = "img-fluid rounded-3 w-100 shadow-sm";
      im.style.objectFit = "cover";
      im.style.maxHeight = "220px";
      im.alt = detail.title
        ? "Imagen ilustrativa de la lección " + detail.title
        : "Imagen ilustrativa de la lección";
      im.loading = "lazy";
      im.src = corespeakLessonMediaSrc(src);
      col.appendChild(im);
      grow.appendChild(col);
    });
    if (grow.children.length) listEl.appendChild(grow);
  }

  let iframeSrc =
    detail.accessible && (detail.youtube_url || detail.youtube_embed_url)
      ? corespeakYoutubeIframeSrc(detail.youtube_url || "", detail.youtube_embed_url)
      : null;
  if (!iframeSrc && detail.accessible && detail.video_url) {
    iframeSrc = corespeakYoutubeIframeSrc(detail.video_url, null);
  }

  if (iframeSrc && detail.accessible) {
    const mediaRow = document.createElement("div");
    mediaRow.className = "row g-3 mb-4 corespeak-lesson-media-row";

    const colV = document.createElement("div");
    colV.className = "col-lg-7";
    const wrap = document.createElement("div");
    wrap.className = "ratio ratio-16x9";
    const ifr = document.createElement("iframe");
    ifr.src = iframeSrc;
    ifr.title = detail.title
      ? "Vídeo de la lección: " + detail.title
      : "Vídeo de la lección";
    ifr.setAttribute("loading", "lazy");
    ifr.setAttribute(
      "allow",
      "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
    );
    ifr.setAttribute("allowfullscreen", "");
    ifr.style.border = "0";
    wrap.appendChild(ifr);
    colV.appendChild(wrap);
    mediaRow.appendChild(colV);

    const colT = document.createElement("div");
    colT.className = "col-lg-5";
    const box = document.createElement("section");
    box.className = "corespeak-lesson-transcript h-100";
    box.setAttribute("aria-labelledby", "lesson-transcript-heading");
    const th = document.createElement("h2");
    th.id = "lesson-transcript-heading";
    th.className = "corespeak-lesson-transcript__title h6 mb-0";
    th.textContent = lc.transcriptTitle || "Transcripción";
    box.appendChild(th);
    const tx = document.createElement("div");
    tx.id = "lesson-transcript-body";
    const ttext = detail.youtube_transcript != null ? String(detail.youtube_transcript).trim() : "";
    if (ttext) {
      tx.className = "corespeak-lesson-transcript__body";
      tx.textContent = ttext;
    } else {
      tx.className = "corespeak-lesson-transcript__empty small";
      tx.textContent = lc.transcriptEmpty || "";
    }
    box.appendChild(tx);
    colT.appendChild(box);
    mediaRow.appendChild(colT);

    listEl.appendChild(mediaRow);
  }

  const extras = Array.isArray(detail.extra_videos) ? detail.extra_videos : [];
  extras.forEach(function (ev) {
    if (!ev || !ev.url || !detail.accessible) return;
    const block = document.createElement("div");
    block.className = "mb-4";
    if (ev.caption) {
      const cap = document.createElement("p");
      cap.className = "small fw-semibold text-secondary mb-2";
      cap.textContent = ev.caption;
      block.appendChild(cap);
    }
    if ((ev.kind || "").toLowerCase() === "mp4") {
      const v = document.createElement("video");
      v.className = "w-100 rounded-3 shadow-sm";
      v.controls = true;
      v.setAttribute("playsinline", "");
      v.src = corespeakLessonMediaSrc(ev.url);
      block.appendChild(v);
    } else {
      const iframeSrc2 = corespeakExtraVideoIframeSrc(ev.url, ev.embed_url, ev.kind);
      if (iframeSrc2) {
        const r = document.createElement("div");
        r.className = "ratio ratio-16x9 shadow-sm rounded-3 overflow-hidden";
        const ifr = document.createElement("iframe");
        ifr.src = iframeSrc2;
        ifr.title = ev.caption || "Video";
        ifr.setAttribute("loading", "lazy");
        ifr.setAttribute(
          "allow",
          "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        );
        ifr.setAttribute("allowfullscreen", "");
        ifr.style.border = "0";
        r.appendChild(ifr);
        block.appendChild(r);
      } else {
        const a = document.createElement("a");
        a.href = ev.url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.className = "small";
        a.textContent = ev.url;
        block.appendChild(a);
      }
    }
    listEl.appendChild(block);
  });

  if (detail.audio_static_path && detail.accessible) {
    const au = document.createElement("audio");
    au.className = "w-100 mb-3";
    au.controls = true;
    au.src = staticUrl("/static/" + String(detail.audio_static_path).replace(/^\/+/, ""));
    listEl.appendChild(au);
  }

  const exWrap = document.createElement("div");
  exWrap.className = "lesson-catalog-exercises";
  corespeakRenderCatalogExercises(exWrap, detail.exercises_json || "{}", lc);
  listEl.appendChild(exWrap);
}
