/* CoreSpeak — helpers de accesibilidad (cargar antes de app.js) */

(function (global) {
  "use strict";

  const FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  const CORESPEAK_BRAND_LABEL = "CoreSpeak, plataforma para aprender idiomas";
  const CORESPEAK_HOME_LABEL = "Ir al inicio de CoreSpeak";
  const GENERIC_ALTS = new Set(["corespeak logo", "corespeak", "logo", "logo corespeak"]);

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

  function isBrandLogo(img) {
    if (!(img instanceof HTMLImageElement)) return false;
    if (img.classList.contains("dashboard-logo") || img.classList.contains("logo-img")) return true;
    return /logo\.png/i.test(img.getAttribute("src") || "");
  }

  function isDecorativeImage(img) {
    if (!(img instanceof HTMLImageElement)) return true;
    if (img.getAttribute("aria-hidden") === "true") return true;
    if (img.classList.contains("password-eye-icon")) return true;
    const alt = img.getAttribute("alt");
    return alt === "";
  }

  function normalizeBrandImage(img) {
    const link = img.closest("a");
    if (link && !link.getAttribute("aria-label")) {
      link.setAttribute("aria-label", CORESPEAK_HOME_LABEL);
    }
    const altRaw = (img.getAttribute("alt") || "").trim();
    const altNorm = altRaw.toLowerCase();
    if (link) {
      if (!altRaw || GENERIC_ALTS.has(altNorm)) {
        img.setAttribute("alt", "");
      }
      return;
    }
    if (!altRaw || GENERIC_ALTS.has(altNorm)) {
      img.setAttribute("alt", CORESPEAK_BRAND_LABEL);
    }
  }

  function createBrandFallback(img) {
    const fallback = document.createElement("span");
    fallback.className =
      "corespeak-brand-fallback" +
      (img.classList.contains("dashboard-logo") ? " corespeak-brand-fallback--nav" : "");
    fallback.textContent = "CoreSpeak";
    fallback.setAttribute("role", "img");
    fallback.setAttribute("aria-label", CORESPEAK_BRAND_LABEL);
    return fallback;
  }

  function createContentFallback(altText) {
    const fallback = document.createElement("span");
    fallback.className = "corespeak-img-fallback";
    fallback.textContent = altText;
    fallback.setAttribute("role", "img");
    fallback.setAttribute("aria-label", altText);
    return fallback;
  }

  function bindImageFallback(img) {
    if (!(img instanceof HTMLImageElement)) return;
    if (img.dataset.corespeakImgBound === "1") return;
    img.dataset.corespeakImgBound = "1";

    img.addEventListener("error", function onImgError() {
      img.removeEventListener("error", onImgError);
      if (isBrandLogo(img)) {
        img.replaceWith(createBrandFallback(img));
        return;
      }
      const altText = (img.getAttribute("alt") || "").trim();
      if (!altText || isDecorativeImage(img)) return;
      img.replaceWith(createContentFallback(altText));
    });
  }

  function ensureImageAlt(img) {
    if (!(img instanceof HTMLImageElement)) return;
    if (img.hasAttribute("alt")) return;
    if (isBrandLogo(img)) {
      normalizeBrandImage(img);
      return;
    }
    img.setAttribute("alt", "Imagen de CoreSpeak");
  }

  function enhanceImage(img) {
    if (!(img instanceof HTMLImageElement)) return;
    ensureImageAlt(img);
    if (isBrandLogo(img)) {
      normalizeBrandImage(img);
    }
    bindImageFallback(img);
  }

  function enhanceImages(root) {
    const scope = root && root.querySelectorAll ? root : document;
    const imgs = root instanceof HTMLImageElement ? [root] : scope.querySelectorAll("img");
    imgs.forEach(enhanceImage);
  }

  function initAccessibleImages() {
    enhanceImages(document);
  }

  function observeDynamicImages() {
    if (!global.MutationObserver || !document.body) return;
    const observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        mutation.addedNodes.forEach(function (node) {
          if (node instanceof HTMLImageElement) {
            enhanceImage(node);
            return;
          }
          if (node instanceof Element) {
            enhanceImages(node);
          }
        });
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  global.CoreSpeakA11y = {
    setFieldError,
    clearFieldErrors,
    trapFocus,
    getFocusable,
    initLogoutButtons,
    setBusy,
    enhanceImage,
    enhanceImages,
    initAccessibleImages,
    initBrandedImages: initAccessibleImages,
  };

  document.addEventListener("DOMContentLoaded", function () {
    initAccessibleImages();
    observeDynamicImages();
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
