/* CoreSpeak frontend JS (MVP) */

const TOKEN_KEY = "corespeak_token";
const USER_ID_KEY = "corespeak_user_id";
const UI_LANG_STORAGE_KEY = "corespeak_ui_lang";

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
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return null;
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

function langSelectOptionsHtml() {
  const opts = [
    { v: "es", t: "Español" },
    { v: "en", t: "English" },
    { v: "fr", t: "Français" },
    { v: "uk", t: "Українська" },
  ];
  return opts.map((o) => '<option value="' + o.v + '">' + o.t + "</option>").join("");
}

function injectLanguageSelectors(currentLang) {
  const mkSelect = () => {
    const sel = document.createElement("select");
    sel.className = "form-select form-select-sm corespeak-ui-lang-select";
    sel.setAttribute("aria-label", "Interface language");
    sel.style.maxWidth = "7.75rem";
    sel.innerHTML = langSelectOptionsHtml();
    sel.value = normalizeUiLang(currentLang);
    return sel;
  };

  document.querySelectorAll("ul.dashboard-nav-list").forEach((ul) => {
    if (ul.querySelector(".corespeak-ui-lang-select")) return;
    const li = document.createElement("li");
    li.className = "dashboard-nav-item align-self-center me-2 me-md-3";
    const label = document.createElement("label");
    label.className = "dashboard-nav-link mb-0 d-flex align-items-center gap-2";
    const sp = document.createElement("span");
    sp.className = "d-none d-lg-inline text-muted small";
    sp.setAttribute("data-i18n", "nav.uiLang");
    label.appendChild(sp);
    label.appendChild(mkSelect());
    li.appendChild(label);
    ul.insertBefore(li, ul.firstChild);
  });

  const nav = document.querySelector("nav.dashboard-nav");
  if (nav && !document.querySelector(".corespeak-ui-lang-select")) {
    const wrap = document.createElement("div");
    wrap.className = "ms-auto d-flex align-items-center pe-2 pe-md-3";
    const label = document.createElement("label");
    label.className = "d-flex align-items-center gap-2 mb-0 small";
    const sp = document.createElement("span");
    sp.className = "text-muted d-none d-sm-inline";
    sp.setAttribute("data-i18n", "nav.uiLang");
    label.appendChild(sp);
    label.appendChild(mkSelect());
    wrap.appendChild(label);
    nav.appendChild(wrap);
  }

  if (!document.querySelector(".corespeak-ui-lang-select") && document.body) {
    const bar = document.createElement("div");
    bar.className = "position-fixed top-0 end-0 p-2 p-md-3";
    bar.style.zIndex = "1080";
    const label = document.createElement("label");
    label.className = "d-flex align-items-center gap-2 mb-0 small bg-white shadow-sm rounded px-2 py-1 border";
    const sp = document.createElement("span");
    sp.setAttribute("data-i18n", "nav.uiLang");
    label.appendChild(sp);
    label.appendChild(mkSelect());
    bar.appendChild(label);
    document.body.appendChild(bar);
  }

  document.querySelectorAll(".corespeak-ui-lang-select").forEach((sel) => {
    sel.value = normalizeUiLang(currentLang);
    sel.removeEventListener("change", corespeakLangSelectChange);
    sel.addEventListener("change", corespeakLangSelectChange);
  });
}

async function corespeakLangSelectChange(ev) {
  const sel = ev.target;
  if (!sel || !sel.classList.contains("corespeak-ui-lang-select")) return;
  const v = normalizeUiLang(sel.value);
  localStorage.setItem(UI_LANG_STORAGE_KEY, v);
  window.__corespeak_ui_lang = v;
  document.documentElement.lang = v;
  applyPageI18n(v);

  const regUi = document.getElementById("register-idioma-ui");
  if (regUi) regUi.value = v;

  document.querySelectorAll(".corespeak-ui-lang-select").forEach((s) => {
    if (s !== sel) s.value = v;
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

async function initCoreSpeakUiLanguage() {
  const token = localStorage.getItem(TOKEN_KEY);
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
      transcriptEmpty: "No hay transcripción disponible para este vídeo.",
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
      transcriptEmpty: "No transcript available for this video.",
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
      transcriptEmpty: "Pas de transcription pour cette vidéo.",
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
      transcriptEmpty: "Kein Transkript für dieses Video.",
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
      transcriptEmpty: "Немає транскрипту для цього відео.",
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
    nav: { uiLang: "Idioma", settings: "Configuración", logout: "Cerrar sesión" },
    dashboard: {
      greetingHi: "¡Hola,",
      userFallback: "Usuario",
      journey: "Continúa tu viaje de aprendizaje",
      dailyTitle: "Reto diario",
      dailySub: "Completa tu desafío hoy",
      streakTitle: "Racha",
      streakDays: "{n} días consecutivos",
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
      saveRowTitle: "Guardar cambios",
      deleteRowTitle: "Eliminar fila",
      confirmDelete: "¿Eliminar esta palabra de la agenda?",
    },
    login: {
      title: "Iniciar sesión",
      lead: "Ingresa a tu cuenta para continuar aprendiendo",
      email: "Correo electrónico",
      password: "Contraseña",
      submit: "Iniciar sesion",
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
    nav: { uiLang: "Language", settings: "Settings", logout: "Log out" },
    dashboard: {
      greetingHi: "Hello,",
      userFallback: "User",
      journey: "Continue your learning journey",
      dailyTitle: "Daily challenge",
      dailySub: "Complete your challenge today",
      streakTitle: "Streak",
      streakDays: "{n} days in a row",
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
      saveRowTitle: "Save changes",
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
    nav: { uiLang: "Langue", settings: "Réglages", logout: "Déconnexion" },
    dashboard: {
      greetingHi: "Bonjour,",
      userFallback: "Utilisateur",
      journey: "Poursuivez votre apprentissage",
      dailyTitle: "Défi du jour",
      dailySub: "Complétez votre défi aujourd’hui",
      streakTitle: "Série",
      streakDays: "{n} jours d’affilée",
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
      saveRowTitle: "Enregistrer",
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
    nav: { uiLang: "Sprache", settings: "Einstellungen", logout: "Abmelden" },
    dashboard: {
      greetingHi: "Hallo,",
      userFallback: "Nutzer",
      journey: "Mach weiter mit deinem Lernen",
      dailyTitle: "Tageschallenge",
      dailySub: "Schließe heute deine Aufgabe ab",
      streakTitle: "Serie",
      streakDays: "{n} Tage in Folge",
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
      saveRowTitle: "Speichern",
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
    nav: { uiLang: "Мова", settings: "Налаштування", logout: "Вийти" },
    dashboard: {
      greetingHi: "Привіт,",
      userFallback: "Користувач",
      journey: "Продовжуй навчання",
      dailyTitle: "Щоденний виклик",
      dailySub: "Виконай завдання сьогодні",
      streakTitle: "Серія",
      streakDays: "{n} днів поспіль",
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
      saveRowTitle: "Зберегти зміни",
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

document.addEventListener("click", (e) => {
  const a = e.target.closest("a.corespeak-logout");
  if (!a) return;
  e.preventDefault();
  logout();
});

function requireAuth() {
  const token = localStorage.getItem(TOKEN_KEY);
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
  const token = localStorage.getItem(TOKEN_KEY);
  const userId = localStorage.getItem(USER_ID_KEY);
  if (!token || !isValidStoredUserId(userId)) return;

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

function setLoginFormError(message) {
  const el = document.getElementById("login-error");
  if (!el) {
    if (message) window.alert(message);
    return;
  }
  if (!message) {
    el.textContent = "";
    el.classList.add("d-none");
    return;
  }
  el.textContent = message;
  el.classList.remove("d-none");
}

function setRegisterFormError(message) {
  const el = document.getElementById("register-error");
  if (!el) {
    if (message) window.alert(message);
    return;
  }
  if (!message) {
    el.textContent = "";
    el.classList.add("d-none");
    return;
  }
  el.textContent = message;
  el.classList.remove("d-none");
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
  setLoginFormError("");
  const email = document.getElementById("login-email")?.value?.trim() || "";
  const password = document.getElementById("login-password")?.value || "";

  let res;
  try {
    res = await fetch(apiUrl("/api/auth/login"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
  } catch (e) {
    console.warn("login: red", e);
    setLoginFormError("");
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
      setLoginFormError("");
    }
    return;
  }

  const data = await res.json();
  if (data.access_token == null || String(data.access_token).trim() === "") {
    console.warn("login: respuesta sin token");
    setLoginFormError("");
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
    setLoginFormError("");
    return;
  }

  setLoginFormError("");
  localStorage.setItem(TOKEN_KEY, data.access_token);
  localStorage.setItem(USER_ID_KEY, String(uid));
  window.location.href = "dashboard.html";
}

async function register() {
  setRegisterFormError("");
  const nombre = document.getElementById("register-nombre")?.value?.trim() || "";
  const apellido = document.getElementById("register-apellido")?.value?.trim() || "";
  const email = document.getElementById("register-email")?.value?.trim() || "";
  const password = document.getElementById("register-password")?.value || "";
  const passwordConfirm = document.getElementById("register-password-confirm")?.value || "";
  const consentAccepted = !!document.getElementById("register-consent")?.checked;

  if (!nombre || !email || !password) {
    setRegisterFormError("Nombre, email y contraseña son obligatorios.");
    return;
  }
  if (password !== passwordConfirm) {
    setRegisterFormError("Las contraseñas no coinciden.");
    return;
  }
  if (!/(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}/.test(password)) {
    setRegisterFormError("La contraseña debe tener mínimo 8 caracteres, números y símbolos.");
    return;
  }
  if (!consentAccepted) {
    setRegisterFormError("Debes aceptar los términos y la política de privacidad.");
    return;
  }

  const res = await fetch(apiUrl("/api/auth/register"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      full_name: [nombre, apellido].filter(Boolean).join(" "),
      email,
      password,
      ui_language: getCurrentUiLangSync(),
      native_language: "es",
      target_languages: ["en"],
      current_levels: { en: "A1" },
      interests: [],
      occupation: null,
      accepted_terms: consentAccepted,
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    setRegisterFormError(formatApiErrorDetail(data) || data.detail || "Error al crear la cuenta");
    return;
  }

  const data = await res.json().catch(() => ({}));
  if (!data.access_token) {
    setRegisterFormError("Cuenta creada, pero no se pudo iniciar la sesión.");
    return;
  }

  localStorage.setItem(TOKEN_KEY, data.access_token);
  try {
    const meRes = await fetch(apiUrl("/api/auth/me"), {
      headers: { Authorization: "Bearer " + data.access_token },
    });
    if (meRes.ok) {
      const me = await meRes.json().catch(() => ({}));
      if (me && me.id != null) localStorage.setItem(USER_ID_KEY, String(me.id));
      if (me && me.ui_language) localStorage.setItem(UI_LANG_STORAGE_KEY, normalizeUiLang(me.ui_language));
    }
  } catch (e) {
    console.warn("register: me lookup error", e);
  }

  setRegisterFormError("");
  window.location.href = "profile_setup.html";
}

function setProfileSetupError(message) {
  const el = document.getElementById("profile-setup-error");
  if (!el) return;
  const text = String(message || "").trim();
  if (!text) {
    el.classList.add("d-none");
    el.textContent = "";
    return;
  }
  el.textContent = text;
  el.classList.remove("d-none");
}

async function saveProfileSetup() {
  setProfileSetupError("");
  const auth = requireAuth();
  if (!auth) {
    window.location.href = "inicio_session.html";
    return;
  }

  const uiLanguage = normalizeUiLang(document.getElementById("setup-idioma-ui")?.value || "es");
  const nativeLanguage = String(document.getElementById("setup-idioma-nativo")?.value || "es").trim();
  const targetLanguage = String(document.getElementById("setup-idioma-objetivo")?.value || "en").trim();
  const interestsRaw = document.getElementById("setup-intereses")?.value?.trim() || "";
  const occupation = document.getElementById("setup-ocupacion")?.value?.trim() || null;
  const interests = interestsRaw.split(",").map((x) => x.trim()).filter(Boolean);
  const btn = document.getElementById("profile-setup-btn");
  if (btn) btn.disabled = true;

  try {
    const res = await fetch(apiUrl("/api/auth/profile-setup"), {
      method: "POST",
      headers: { Authorization: "Bearer " + auth.token, "Content-Type": "application/json" },
      body: JSON.stringify({
        ui_language: uiLanguage,
        native_language: nativeLanguage,
        target_languages: [targetLanguage],
        current_levels: { [targetLanguage]: "A1" },
        interests,
        occupation,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setProfileSetupError(formatApiErrorDetail(data) || data.detail || "No se pudo guardar tu perfil");
      return;
    }
    localStorage.setItem(UI_LANG_STORAGE_KEY, uiLanguage);
    window.location.href = "dashboard.html";
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

  if (isPremium) {
    cta.classList.add("d-none");
    if (navBtn) navBtn.classList.add("d-none");
    return;
  }

  cta.classList.remove("d-none");
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
  const adminNav = document.getElementById("admin-nav-wrap");
  if (adminNav) {
    adminNav.classList.toggle("d-none", !(profile && profile.is_admin));
  }

  const res = await fetch(apiUrl("/api/users/" + auth.userId + "/progress"), { headers });
  let p = null;
  if (res.ok) {
    p = await res.json().catch(() => null);
    if (p && p.nombre) {
      const fromProgress = String(p.nombre).trim();
      if (fromProgress && !displayName) displayName = fromProgress;
    }
  }

  const u = getUiPack(getCurrentUiLangSync());
  const nameEl = document.getElementById("user-name");
  if (nameEl) nameEl.textContent = displayName || (u.dashboard && u.dashboard.userFallback) || "Usuario";

  if (!p) return;

  const streakEl = document.getElementById("stat-streak");
  if (streakEl && typeof p.racha_actual === "number") {
    const tpl = (u.dashboard && u.dashboard.streakDays) || "{n} días consecutivos";
    streakEl.textContent = tpl.replace("{n}", String(p.racha_actual));
  }
  const xpEl = document.getElementById("stat-xp");
  if (xpEl && typeof p.total_xp === "number") {
    xpEl.textContent = String(p.total_xp);
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
  img.alt = "";
  flagWrap.appendChild(img);
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
  const progFill = document.createElement("div");
  progFill.className = "progress-fill";
  progFill.style.width = "0%";
  progBg.appendChild(progFill);
  const a = document.createElement("a");
  a.href = "course.html?lang=" + encodeURIComponent(lang);
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn btn-gradient";
  btn.textContent = course.accessible ? btnLabel : lcCourse.premiumShort || "Premium";
  a.appendChild(btn);
  bot.appendChild(progBg);
  bot.appendChild(a);

  card.appendChild(top);
  card.appendChild(bot);
  col.appendChild(card);
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

async function saveOnboarding() {
  const auth = requireAuth();
  if (!auth) return;

  const ocupacion = document.getElementById("onb-ocupacion")?.value?.trim() || "";
  const langChecks = Array.from(document.querySelectorAll(".onb-lang:checked"));
  const idiomas_objetivo = langChecks.map((el) => el.value);

  const niveles_actuales = {};
  ["en", "es", "fr", "de", "uk"].forEach((k) => {
    const v = document.getElementById("lvl-" + k)?.value;
    if (v) niveles_actuales[k] = v;
  });

  const res = await fetch(apiUrl("/api/users/me/onboarding"), {
    method: "POST",
    headers: apiHeaders() || { "Content-Type": "application/json" },
    body: JSON.stringify({ ocupacion, idiomas_objetivo, niveles_actuales }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    alert(data.detail || "No se pudo guardar el test inicial");
    return;
  }
  window.location.href = "dashboard.html";
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

  if (document.getElementById("login-btn")) {
    void redirectIfAlreadyLoggedIn();
    document.getElementById("login-btn").addEventListener("click", login);
  }
  if (document.getElementById("register-btn")) {
    document.getElementById("register-btn").addEventListener("click", register);
  }
  const setupUiInit = document.getElementById("setup-idioma-ui");
  if (setupUiInit) setupUiInit.value = getCurrentUiLangSync();
  if (document.getElementById("profile-setup-btn")) {
    document.getElementById("profile-setup-btn").addEventListener("click", saveProfileSetup);
  }
  // Detecta automaticamente la pagina dashboard si existen elementos de estadisticas.
  if (document.getElementById("stat-streak")) {
    loadMyProgress();
    loadDashboardCourses();
    initDashboardPremiumCta();
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

  if (document.getElementById("agenda-root")) {
    initAgendaPage().catch((err) => console.error("initAgendaPage", err));
  }
});

/** Evita que un render en curso borre filas mientras carga la API. */
let agendaRenderGeneration = 0;

async function loadAgendaWords() {
  const auth = requireAuth();
  if (!auth) return [];
  const res = await fetch(apiUrl("/api/agenda/words"), { headers: { Authorization: "Bearer " + auth.token } });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    alert(data.detail || "No se pudo cargar la agenda");
    return [];
  }
  return res.json();
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
    alert(data.detail || "No se pudo guardar");
    return false;
  }
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
      alert(data.detail || "No se pudo añadir la palabra");
      return null;
    }
    return res.json();
  } catch (e) {
    alert("No se pudo contactar con el servidor. Abre la app desde la misma URL que la API (por ejemplo http://127.0.0.1:8000/ui/agenda.html) y comprueba que el backend esté en marcha.");
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
    alert(data.detail || "No se pudo eliminar");
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
  const btnSave = document.createElement("button");
  btnSave.type = "button";
  btnSave.className = "agenda-btn-icon agenda-btn-save me-1";
  btnSave.title = ag.saveRowTitle || "";
  btnSave.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M2 1a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V4.414a1 1 0 0 0-.293-.707l-1.414-1.414A1 1 0 0 0 12.586 2H2m0 1h10v3H2zm0 4h10v7H2z"/></svg>';
  const btnDel = document.createElement("button");
  btnDel.type = "button";
  btnDel.className = "agenda-btn-icon";
  btnDel.title = ag.deleteRowTitle || "";
  btnDel.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0z"/><path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4zM2.5 3h11V2h-11z"/></svg>';
  tdAct.appendChild(btnSave);
  tdAct.appendChild(btnDel);

  tr.appendChild(tdWord);
  tr.appendChild(tdMean);
  tr.appendChild(tdAct);

  const id = item.id;

  btnSave.addEventListener("click", async () => {
    const ok = await saveAgendaRow(id, inpWord.value.trim(), inpMean.value.trim());
    if (ok) {
      btnSave.animate([{ transform: "scale(1)" }, { transform: "scale(1.15)" }, { transform: "scale(1)" }], { duration: 280 });
    }
  });

  btnDel.addEventListener("click", async () => {
    if (!confirm(ag.confirmDelete || "")) return;
    const ok = await deleteAgendaWord(id);
    if (ok) tr.remove();
  });

  return tr;
}

async function renderAgendaTable() {
  const tbody = document.getElementById("agenda-tbody");
  if (!tbody) return;

  const gen = ++agendaRenderGeneration;
  const words = await loadAgendaWords();
  if (gen !== agendaRenderGeneration) {
    return;
  }

  const loading = document.getElementById("agenda-loading-row");
  if (loading) loading.remove();

  tbody.innerHTML = "";

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

  await renderAgendaTable();

  const addBtn = document.getElementById("agenda-add-row");
  const newWordModal = document.getElementById("agenda-new-word-modal");
  const newWordInput = document.getElementById("agenda-new-word-input");
  const newMeaningInput = document.getElementById("agenda-new-meaning-input");
  const newWordSave = document.getElementById("agenda-new-word-save");
  const newWordCancel = document.getElementById("agenda-new-word-cancel");

  function openAgendaNewWordModal() {
    if (!newWordModal || !newWordInput) return;
    newWordInput.value = "";
    if (newMeaningInput) newMeaningInput.value = "";
    newWordModal.classList.remove("d-none");
    setTimeout(() => newWordInput.focus(), 50);
  }

  function closeAgendaNewWordModal() {
    if (newWordModal) newWordModal.classList.add("d-none");
    if (newWordSave) newWordSave.disabled = false;
  }

  async function submitAgendaNewWord() {
    if (!newWordSave || !newWordInput) return;
    if (newWordSave.disabled) return;
    const w = newWordInput.value.trim();
    const m = (newMeaningInput && newMeaningInput.value.trim()) || "";
    if (!w && !m) {
      alert("Escribe al menos la palabra o el significado.");
      newWordInput.focus();
      return;
    }
    newWordSave.disabled = true;
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
      alert("El servidor no devolvió el id de la palabra. Recarga la página.");
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
  const newWordCard = document.getElementById("agenda-new-word-card");
  if (newWordCard) {
    newWordCard.addEventListener("click", (ev) => ev.stopPropagation());
  }
  if (newWordModal) {
    newWordModal.addEventListener("click", () => closeAgendaNewWordModal());
  }
  if (newWordInput) {
    newWordInput.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        void submitAgendaNewWord();
      }
    });
  }
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
      img.alt = "";
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
    const radios = [];

    if (opciones && opciones.length > 0 && (type === "quiz" || type === "test" || type === "multiple_choice")) {
      const wrap = document.createElement("div");
      wrap.className = "d-flex flex-column gap-2";
      opciones.forEach(function (opt, j) {
        const labelText = typeof opt === "object" && opt != null ? opt.texto || opt.text || opt.label : String(opt);
        const id = uid + "-o" + j;
        const row = document.createElement("div");
        row.className = "form-check";
        const radio = document.createElement("input");
        radio.type = "radio";
        radio.className = "form-check-input";
        radio.name = uid + "-mc";
        radio.id = id;
        radio.value = String(labelText);
        radios.push(radio);
        const lab = document.createElement("label");
        lab.className = "form-check-label";
        lab.setAttribute("for", id);
        lab.textContent = String(labelText);
        row.appendChild(radio);
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
      if (inputEl) userVal = (inputEl.value || "").trim();
      else {
        for (let r = 0; r < radios.length; r++) {
          if (radios[r].checked) {
            userVal = radios[r].value;
            break;
          }
        }
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
      const ok = corespeakAnswerMatchesValid(userVal, valid);
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
  if (flagEl) flagEl.src = "https://flagcdn.com/w160/" + (FLAG_BY_LANG[lang] || "gb") + ".png";

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

  const progressBarEl = document.getElementById("course-progress-bar");
  if (progressBarEl) {
    progressBarEl.style.width = totalLessons > 0 ? "5%" : "0%";
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
    im.alt = detail.title || "";
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
      im.alt = "";
      im.loading = "lazy";
      im.src = corespeakLessonMediaSrc(src);
      col.appendChild(im);
      grow.appendChild(col);
    });
    if (grow.children.length) listEl.appendChild(grow);
  }

  const iframeSrc =
    detail.accessible && (detail.youtube_url || detail.youtube_embed_url)
      ? corespeakYoutubeIframeSrc(detail.youtube_url || "", detail.youtube_embed_url)
      : null;

  if (iframeSrc && detail.accessible) {
    const mediaRow = document.createElement("div");
    mediaRow.className = "row g-3 mb-4 corespeak-lesson-media-row";

    const colV = document.createElement("div");
    colV.className = "col-lg-7";
    const wrap = document.createElement("div");
    wrap.className = "ratio ratio-16x9";
    const ifr = document.createElement("iframe");
    ifr.src = iframeSrc;
    ifr.title = "YouTube";
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
    const box = document.createElement("div");
    box.className = "corespeak-lesson-transcript h-100";
    const th = document.createElement("h6");
    th.textContent = lc.transcriptTitle || "Transcripción";
    box.appendChild(th);
    const tx = document.createElement("div");
    tx.className = "small text-body-secondary";
    const ttext = detail.youtube_transcript != null ? String(detail.youtube_transcript).trim() : "";
    tx.textContent = ttext || lc.transcriptEmpty || "";
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


