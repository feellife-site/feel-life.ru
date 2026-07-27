/* ============================================================
   Earthen Editorial — основной JS
   Интерактив: мобильное меню, scroll-reveal, форма, FAQ
   ============================================================ */

(function () {
  "use strict";

  // --- Mobile menu toggle ---
  const menuToggle = document.querySelector("[data-menu-toggle]");
  const mobileMenu = document.querySelector("[data-mobile-menu]");
  const menuClose = document.querySelector("[data-menu-close]");
  const body = document.body;

  function openMenu() {
    if (!mobileMenu) return;
    mobileMenu.setAttribute("data-open", "true");
    mobileMenu.setAttribute("aria-hidden", "false");
    if (menuToggle) menuToggle.setAttribute("aria-expanded", "true");
    body.style.overflow = "hidden";
  }
  function closeMenu() {
    if (!mobileMenu) return;
    mobileMenu.setAttribute("data-open", "false");
    mobileMenu.setAttribute("aria-hidden", "true");
    if (menuToggle) menuToggle.setAttribute("aria-expanded", "false");
    body.style.overflow = "";
  }
  if (menuToggle) {
    menuToggle.addEventListener("click", function () {
      const isOpen = mobileMenu.getAttribute("data-open") === "true";
      isOpen ? closeMenu() : openMenu();
    });
  }
  if (menuClose) {
    menuClose.addEventListener("click", closeMenu);
  }
  if (mobileMenu) {
    mobileMenu.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", closeMenu);
    });
  }
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeMenu();
  });

  // --- FAQ toggle ---
  document.querySelectorAll(".faq__item").forEach(function (item) {
    const trigger = item.querySelector(".faq__trigger");
    if (!trigger) return;
    trigger.addEventListener("click", function () {
      const isOpen = item.getAttribute("data-open") === "true";
      item.setAttribute("data-open", isOpen ? "false" : "true");
      trigger.setAttribute("aria-expanded", isOpen ? "false" : "true");
    });
  });

  // --- Scroll reveal (IntersectionObserver) ---
  if ("IntersectionObserver" in window) {
    const revealObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            revealObserver.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.05 }
    );
    document.querySelectorAll(".reveal").forEach(function (el) {
      revealObserver.observe(el);
    });
  } else {
    document.querySelectorAll(".reveal").forEach(function (el) {
      el.classList.add("is-visible");
    });
  }

  // --- Contact form (демо) ---
  const form = document.querySelector("[data-contact-form]");
  if (form) {
    const status = form.querySelector("[data-form-status]");
    const submitBtn = form.querySelector("[type='submit']");
    const successMessage =
      "Спасибо! Заявка отправлена. Я свяжусь с вами в ближайшее время.";
    const errorMessage =
      "Не удалось отправить заявку. Попробуйте позже или свяжитесь напрямую.";

    function validateField(field) {
      const wrapper = field.closest(".form__field");
      if (!wrapper) return true;
      const value = (field.value || "").trim();
      let isValid = true;
      let message = "";

      if (field.required && !value) {
        isValid = false;
        message = "Это поле обязательно";
      } else if (field.type === "email" && value) {
        const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRe.test(value)) {
          isValid = false;
          message = "Введите корректный email";
        }
      } else if (field.type === "tel" && value) {
        const telRe = /^[\d\s+()\-]{6,}$/;
        if (!telRe.test(value)) {
          isValid = false;
          message = "Введите корректный телефон";
        }
      }
      wrapper.setAttribute("data-error", isValid ? "false" : "true");
      const errorEl = wrapper.querySelector(".form__error");
      if (errorEl) errorEl.textContent = message;
      return isValid;
    }

    form.querySelectorAll("input, textarea").forEach(function (field) {
      field.addEventListener("blur", function () {
        validateField(field);
      });
      field.addEventListener("input", function () {
        if (field.closest(".form__field").getAttribute("data-error") === "true") {
          validateField(field);
        }
      });
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      let isValid = true;
      form.querySelectorAll("input[required], textarea[required]").forEach(function (field) {
        if (!validateField(field)) isValid = false;
      });
      if (!isValid) {
        if (status) {
          status.setAttribute("data-state", "error");
          status.textContent =
            "Пожалуйста, проверьте правильность заполнения полей.";
        }
        return;
      }

      // Демо: имитация отправки
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.style.opacity = "0.7";
        submitBtn.textContent = "Отправка…";
      }
      setTimeout(function () {
        if (status) {
          status.setAttribute("data-state", "success");
          status.textContent = successMessage;
        }
        form.reset();
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.style.opacity = "";
          submitBtn.innerHTML =
            '<span>Отправить заявку</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>';
        }
        setTimeout(function () {
          if (status) {
            status.setAttribute("data-state", "");
            status.textContent = "";
          }
        }, 8000);
      }, 900);
    });
  }

  // --- Header scroll state (для лёгкого затемнения при прокрутке) ---
  const header = document.querySelector(".site-header");
  if (header) {
    let lastScroll = 0;
    function onScroll() {
      const y = window.scrollY;
      if (y > 8) {
        header.style.boxShadow = "0 1px 0 rgba(31, 27, 22, 0.06)";
      } else {
        header.style.boxShadow = "";
      }
      lastScroll = y;
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  // --- Smooth scroll для якорных ссылок ---
  document.querySelectorAll('a[href^="#"]').forEach(function (link) {
    const href = link.getAttribute("href");
    if (!href || href === "#") return;
    link.addEventListener("click", function (e) {
      const target = document.querySelector(href);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        // обновим URL без перезагрузки
        if (history.replaceState) history.replaceState(null, "", href);
      }
    });
  });

  // --- Установка года в подвале ---
  document.querySelectorAll("[data-current-year]").forEach(function (el) {
    el.textContent = String(new Date().getFullYear());
  });
})();
