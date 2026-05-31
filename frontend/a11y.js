/* CoreSpeak — helpers de accesibilidad (cargar antes de app.js) */

(function (global) {
  "use strict";

  const FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  const CORESPEAK_BRAND_LABEL = "CoreSpeak, plataforma para aprender idiomas";
  const CORESPEAK_HOME_LABEL = "Ir al inicio de CoreSpeak";
  const GENERIC_ALTS = new Set(["corespeak logo", "corespeak", "logo", "logo corespeak"]);
  const HIDDEN_IMG = "corespeak-img-is-hidden";
  const HIDDEN_FALLBACK = "corespeak-brand-fallback--hidden";

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

  function normalizeBrandLogoSrc(img) {
    const src = (img.getAttribute("src") || "").trim();
    if (/^img\/logo\.png/i.test(src)) {
      img.setAttribute("src", "/ui/" + src.replace(/^\/+/, ""));
    }
  }

  function prepareBrandLogo(img) {
    if (!isBrandLogo(img)) return;
    normalizeBrandLogoSrc(img);
    normalizeBrandImage(img);
    const link = img.closest("a");
    if (link) {
      link.classList.add("corespeak-brand-link");
    }
  }

  function createBrandFallbackEl(img) {
    const fallback = document.createElement("span");
    fallback.className =
      "corespeak-brand-fallback " +
      HIDDEN_FALLBACK +
      (img.classList.contains("dashboard-logo") ? " corespeak-brand-fallback--nav" : "");
    fallback.textContent = "CoreSpeak";
    fallback.setAttribute("role", "img");
    fallback.setAttribute("aria-label", CORESPEAK_BRAND_LABEL);
    fallback.setAttribute("aria-hidden", "true");
    return fallback;
  }

  function getOrCreateBrandFallback(img) {
    let fallback = img.nextElementSibling;
    if (fallback && fallback.classList.contains("corespeak-brand-fallback")) {
      return fallback;
    }
    fallback = createBrandFallbackEl(img);
    img.insertAdjacentElement("afterend", fallback);
    return fallback;
  }

  function showFallback(fallback) {
    if (!fallback) return;
    fallback.classList.remove(HIDDEN_FALLBACK);
    fallback.removeAttribute("aria-hidden");
  }

  function hideFallback(fallback) {
    if (!fallback) return;
    fallback.classList.add(HIDDEN_FALLBACK);
    fallback.setAttribute("aria-hidden", "true");
  }

  function showImage(img) {
    if (!img) return;
    img.classList.remove(HIDDEN_IMG);
  }

  function hideImage(img) {
    if (!img) return;
    img.classList.add(HIDDEN_IMG);
  }

  function imageLoadFailed(img) {
    if (!(img instanceof HTMLImageElement)) return false;
    if (img.classList.contains(HIDDEN_IMG)) return false;
    if (img.complete && img.naturalWidth === 0) return true;
    return false;
  }

  function imageLooksBlocked(img) {
    if (!(img instanceof HTMLImageElement)) return false;
    if (img.complete && img.naturalWidth > 0) return false;
    if (imageLoadFailed(img)) return true;
    return false;
  }

  function setupBrandLogo(img) {
    if (!(img instanceof HTMLImageElement) || img.dataset.corespeakBrandSetup === "1") return;
    img.dataset.corespeakBrandSetup = "1";
    prepareBrandLogo(img);
    img.classList.add("corespeak-brand-img");

    const fallback = getOrCreateBrandFallback(img);

    function activateTextFallback() {
      hideImage(img);
      showFallback(fallback);
    }

    function activateImage() {
      showImage(img);
      hideFallback(fallback);
    }

    function evaluate() {
      if (imageLooksBlocked(img)) {
        activateTextFallback();
        return true;
      }
      if (img.complete && img.naturalWidth > 0) {
        activateImage();
        return true;
      }
      return false;
    }

    img.addEventListener("error", activateTextFallback);
    img.addEventListener("load", function () {
      if (img.naturalWidth > 0) {
        activateImage();
      } else {
        activateTextFallback();
      }
    });

    if (!evaluate()) {
      global.setTimeout(evaluate, 300);
      global.setTimeout(evaluate, 1200);
      global.setTimeout(evaluate, 3000);
    }
  }

  function createContentFallbackEl(altText, img) {
    const fallback = document.createElement("span");
    fallback.className = "corespeak-img-fallback " + HIDDEN_FALLBACK;
    if (img && img.closest && img.closest(".flag-img-wrapper")) {
      fallback.classList.add("corespeak-img-fallback--circle");
    }
    const short = altText.replace(/^Bandera de\s+/i, "").trim() || altText;
    fallback.textContent = short;
    fallback.setAttribute("role", "img");
    fallback.setAttribute("aria-label", altText);
    fallback.setAttribute("aria-hidden", "true");
    return fallback;
  }

  function setupContentImage(img) {
    if (!(img instanceof HTMLImageElement) || isBrandLogo(img) || isDecorativeImage(img)) return;
    if (img.dataset.corespeakContentSetup === "1") return;
    img.dataset.corespeakContentSetup = "1";

    const altText = (img.getAttribute("alt") || "").trim();
    if (!altText) return;

    let fallback = img.nextElementSibling;
    if (!fallback || !fallback.classList.contains("corespeak-img-fallback")) {
      fallback = createContentFallbackEl(altText, img);
      img.insertAdjacentElement("afterend", fallback);
    }

    function activateTextFallback() {
      hideImage(img);
      showFallback(fallback);
    }

    function activateImage() {
      showImage(img);
      hideFallback(fallback);
    }

    function evaluate() {
      if (imageLooksBlocked(img)) {
        activateTextFallback();
        return true;
      }
      if (img.complete && img.naturalWidth > 0) {
        activateImage();
        return true;
      }
      return false;
    }

    img.addEventListener("error", activateTextFallback);
    img.addEventListener("load", function () {
      if (img.naturalWidth > 0) {
        activateImage();
      } else {
        activateTextFallback();
      }
    });

    if (!evaluate()) {
      global.setTimeout(evaluate, 300);
      global.setTimeout(evaluate, 1200);
    }
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
      setupBrandLogo(img);
      return;
    }
    setupContentImage(img);
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
    global.addEventListener("load", function () {
      initAccessibleImages();
    });
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
