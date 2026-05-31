/* CoreSpeak — helpers de accesibilidad (cargar antes de app.js) */

(function (global) {
  "use strict";

  const FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  const LOGO_ALT = "Icono de CoreSpeak";
  const LOGO_TEXT = "CoreSpeak";

  function getFocusable(container) {
    if (!container) return [];
    return Array.from(container.querySelectorAll(FOCUSABLE)).filter((el) => {
      if (el.offsetParent === null && !el.getAttribute("aria-modal")) return false;
      return !el.hasAttribute("disabled") && el.getAttribute("aria-hidden") !== "true";
    });
  }

  function setFieldError(inputId, errorId, message) {
    const input = document.getElementById(inputId);
    const errEl = errorId ? document.getElementById(errorId) : null;
    if (!input) return;

    if (errEl) {
      errEl.textContent = message || "";
      errEl.classList.toggle("d-none", !message);
    }

    if (message) {
      input.setAttribute("aria-invalid", "true");
      const ids = [errorId].filter(Boolean);
      const existing = (input.getAttribute("aria-describedby") || "")
        .split(/\s+/)
        .filter((id) => id && id !== errorId);
      input.setAttribute("aria-describedby", [...existing, ...ids].join(" ").trim());
    } else {
      input.removeAttribute("aria-invalid");
      const described = (input.getAttribute("aria-describedby") || "")
        .split(/\s+/)
        .filter((id) => id && id !== errorId);
      if (described.length) {
        input.setAttribute("aria-describedby", described.join(" "));
      } else {
        input.removeAttribute("aria-describedby");
      }
    }
  }

  function clearFieldErrors(pairs) {
    (pairs || []).forEach(([inputId, errorId]) => setFieldError(inputId, errorId, ""));
  }

  function trapFocus(modalEl, options) {
    if (!modalEl) return function () {};
    const opts = options || {};
    let previousFocus = opts.returnFocusTo || document.activeElement;

    function handleKeydown(ev) {
      if (ev.key === "Escape" && typeof opts.onEscape === "function") {
        opts.onEscape(ev);
        return;
      }
      if (ev.key !== "Tab") return;
      const focusable = getFocusable(modalEl);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (ev.shiftKey && document.activeElement === first) {
        ev.preventDefault();
        last.focus();
      } else if (!ev.shiftKey && document.activeElement === last) {
        ev.preventDefault();
        first.focus();
      }
    }

    modalEl.addEventListener("keydown", handleKeydown);

    return function release() {
      modalEl.removeEventListener("keydown", handleKeydown);
      if (previousFocus && typeof previousFocus.focus === "function") {
        try {
          previousFocus.focus();
        } catch (e) {
          /* ignore */
        }
      }
    };
  }

  function initLogoutButtons(onLogout) {
    document.addEventListener("click", (e) => {
      const el = e.target.closest(".corespeak-logout");
      if (!el) return;
      e.preventDefault();
      if (typeof onLogout === "function") {
        onLogout();
      }
    });
  }

  function setBusy(button, busy, busyLabel, defaultLabel) {
    if (!button) return;
    button.disabled = !!busy;
    button.setAttribute("aria-busy", busy ? "true" : "false");
    if (busyLabel && defaultLabel) {
      button.dataset.a11yDefaultLabel = button.dataset.a11yDefaultLabel || defaultLabel;
      button.textContent = busy ? busyLabel : button.dataset.a11yDefaultLabel;
    }
  }

  function normalizeLogoSrc(img) {
    const src = (img.getAttribute("src") || "").trim();
    if (/^img\/logo\.png/i.test(src)) {
      img.setAttribute("src", "/ui/" + src.replace(/^\/+/, ""));
    }
  }

  function logoFailed(img) {
    return !!(img && img.complete && img.naturalWidth === 0);
  }

  function getLogoWrap(img) {
    const parent = img.parentElement;
    if (parent && parent.classList.contains("corespeak-logo-wrap")) {
      return parent;
    }
    if (parent && parent.tagName === "A") {
      parent.classList.add("corespeak-logo-wrap");
      if (img.classList.contains("dashboard-logo")) {
        parent.classList.add("corespeak-logo-wrap--nav");
      }
      return parent;
    }
    const wrap = document.createElement("span");
    wrap.className = "corespeak-logo-wrap d-inline-block";
    if (img.classList.contains("dashboard-logo")) {
      wrap.classList.add("corespeak-logo-wrap--nav");
    }
    img.parentNode.insertBefore(wrap, img);
    wrap.appendChild(img);
    return wrap;
  }

  function ensureLogoAltSpan(img, wrap) {
    wrap.querySelectorAll(".corespeak-logo-alt").forEach(function (node, idx) {
      if (idx > 0) node.remove();
    });
    let span = wrap.querySelector(".corespeak-logo-alt");
    if (!span) {
      span = document.createElement("span");
      span.className = "corespeak-logo-alt";
      img.insertAdjacentElement("afterend", span);
    }
    span.textContent = LOGO_TEXT;
    span.setAttribute("aria-hidden", "true");
    return span;
  }

  function showLogoFallback(wrap, img) {
    wrap.classList.add("corespeak-logo--failed");
    img.setAttribute("alt", "");
    img.setAttribute("aria-hidden", "true");
  }

  function showLogoImage(wrap, img) {
    wrap.classList.remove("corespeak-logo--failed");
    img.setAttribute("alt", LOGO_ALT);
    img.removeAttribute("aria-hidden");
  }

  function bindLogo(img) {
    if (!(img instanceof HTMLImageElement) || img.dataset.corespeakLogoBound === "1") return;
    img.dataset.corespeakLogoBound = "1";
    img.classList.add("corespeak-logo-img");
    normalizeLogoSrc(img);

    const wrap = getLogoWrap(img);
    ensureLogoAltSpan(img, wrap);

    function check() {
      if (logoFailed(img)) {
        showLogoFallback(wrap, img);
      } else if (img.complete && img.naturalWidth > 0) {
        showLogoImage(wrap, img);
      }
    }

    img.addEventListener("error", function () {
      showLogoFallback(wrap, img);
    });
    img.addEventListener("load", check);

    check();
    global.setTimeout(check, 250);
    global.setTimeout(check, 1000);
  }

  function initLogoImages() {
    document.querySelectorAll(".dashboard-logo, .logo-img, img[src*='logo.png']").forEach(bindLogo);
  }

  global.CoreSpeakA11y = {
    setFieldError,
    clearFieldErrors,
    trapFocus,
    getFocusable,
    initLogoutButtons,
    setBusy,
    initLogoImages,
  };

  function boot() {
    initLogoImages();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  global.addEventListener("load", boot);

  document.addEventListener("DOMContentLoaded", function () {
    const skip = document.querySelector(".skip-link");
    if (skip) {
      skip.addEventListener("click", function (ev) {
        const targetId = (skip.getAttribute("href") || "").replace(/^#/, "");
        const main = document.getElementById(targetId);
        if (main) {
          ev.preventDefault();
          if (!main.hasAttribute("tabindex")) {
            main.setAttribute("tabindex", "-1");
          }
          main.focus();
        }
      });
    }
  });
})(typeof window !== "undefined" ? window : globalThis);
