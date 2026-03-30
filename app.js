const revealables = document.querySelectorAll(".reveal");
const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

if (prefersReduced) {
  revealables.forEach((el) => el.classList.add("is-visible"));
} else if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const el = entry.target;
          el.classList.add("is-visible");
          observer.unobserve(el);
        }
      });
    },
    { threshold: 0.12 }
  );

  revealables.forEach((el) => observer.observe(el));
} else {
  revealables.forEach((el) => el.classList.add("is-visible"));
}

const navToggle = document.querySelector(".nav-toggle");
const siteNav = document.querySelector(".site-nav");
const navLabel = navToggle ? navToggle.querySelector(".nav-label") : null;
const navLinks = siteNav ? Array.from(siteNav.querySelectorAll("a")) : [];
const NAV_MENU_CLOSE_MS = 860;
const FOOTER_LEGAL_TEXT = `© ${new Date().getFullYear()} Curator Property Presentation Co. Ltd, All Rights Reserved.`;
const CONTACT_INQUIRY_ENDPOINT =
  "https://africa-south1-mycurator-cf6ab.cloudfunctions.net/submitInquiry";
const CLOUD_FUNCTIONS_REGION = "africa-south1";
const DEFAULT_FUNCTIONS_PROJECT_ID = "mycurator-cf6ab";
let navCloseTimer = null;

function initPointerRing() {
  if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
    return;
  }

  const pointerRing = document.createElement("div");
  pointerRing.className = "pointer-ring";
  pointerRing.setAttribute("aria-hidden", "true");
  document.body.appendChild(pointerRing);
  document.body.classList.add("has-pointer-ring");

  const clickableSelector = [
    "a[href]",
    "button",
    "[role='button']",
    "summary",
    "label[for]",
    "select",
    "input[type='button']",
    "input[type='submit']",
    "input[type='reset']",
    "input[type='checkbox']",
    "input[type='radio']",
    ".btn",
    ".nav-toggle",
    ".header-cta",
    ".auth-link",
  ].join(", ");
  const editableSelector =
    "input:not([type='button']):not([type='submit']):not([type='reset']):not([type='checkbox']):not([type='radio']), textarea";
  const imageCanvasCache = new WeakMap();

  let pointerX = window.innerWidth / 2;
  let pointerY = window.innerHeight / 2;
  let isVisible = false;
  let isClickable = false;
  let isPressed = false;
  let pointerTone = "dark";
  let frameId = null;

  const setPointerTone = (tone) => {
    if (pointerTone === tone) {
      return;
    }

    pointerTone = tone;
    document.body.classList.toggle("pointer-on-mid", tone === "mid");
    document.body.classList.toggle("pointer-on-light", tone === "light");
  };

  const parseCssColor = (value) => {
    const match = String(value || "").match(/^rgba?\(([^)]+)\)$/i);
    if (!match) {
      return null;
    }

    const parts = match[1].split(",").map((part) => Number.parseFloat(part.trim()));
    if (parts.length < 3 || parts.some((part) => Number.isNaN(part))) {
      return null;
    }

    return {
      red: parts[0],
      green: parts[1],
      blue: parts[2],
      alpha: Number.isFinite(parts[3]) ? parts[3] : 1,
    };
  };

  const luminanceFromColor = ({ red, green, blue }) => {
    const channels = [red, green, blue].map((channel) => {
      const normalized = channel / 255;
      return normalized <= 0.03928
        ? normalized / 12.92
        : ((normalized + 0.055) / 1.055) ** 2.4;
    });

    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };

  const toneFromLuminance = (luminance) => {
    if (luminance >= 0.72) {
      return "light";
    }

    if (luminance >= 0.42) {
      return "mid";
    }

    return "dark";
  };

  const getImageSampler = (image) => {
    if (!(image instanceof HTMLImageElement) || !image.complete || !image.naturalWidth) {
      return null;
    }

    const cached = imageCanvasCache.get(image);
    if (cached !== undefined) {
      return cached;
    }

    try {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) {
        imageCanvasCache.set(image, null);
        return null;
      }

      const maxDimension = 180;
      const scale = Math.min(
        1,
        maxDimension / image.naturalWidth,
        maxDimension / image.naturalHeight
      );
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      const sampler = { canvas, context };
      imageCanvasCache.set(image, sampler);
      return sampler;
    } catch (error) {
      imageCanvasCache.set(image, null);
      return null;
    }
  };

  const toneFromImage = (image, clientX, clientY) => {
    const sampler = getImageSampler(image);
    if (!sampler) {
      return null;
    }

    const rect = image.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return null;
    }

    const localX = Math.min(Math.max(clientX - rect.left, 0), rect.width - 1);
    const localY = Math.min(Math.max(clientY - rect.top, 0), rect.height - 1);
    const sampleX = Math.min(
      sampler.canvas.width - 1,
      Math.round((localX / rect.width) * (sampler.canvas.width - 1))
    );
    const sampleY = Math.min(
      sampler.canvas.height - 1,
      Math.round((localY / rect.height) * (sampler.canvas.height - 1))
    );
    const pixel = sampler.context.getImageData(sampleX, sampleY, 1, 1).data;

    if (pixel[3] < 26) {
      return null;
    }

    return toneFromLuminance(
      luminanceFromColor({ red: pixel[0], green: pixel[1], blue: pixel[2] })
    );
  };

  const resolvePointerTone = (element) => {
    if (!(element instanceof Element)) {
      return "dark";
    }

    const stack =
      typeof document.elementsFromPoint === "function"
        ? document.elementsFromPoint(pointerX, pointerY)
        : [element];

    for (const candidate of stack) {
      if (!(candidate instanceof Element) || candidate === pointerRing) {
        continue;
      }

      const toneOverrideHost = candidate.closest("[data-pointer-tone]");
      const toneOverride = toneOverrideHost?.dataset.pointerTone;
      if (toneOverride === "dark" || toneOverride === "mid" || toneOverride === "light") {
        return toneOverride;
      }

      if (candidate instanceof HTMLImageElement) {
        const imageTone = toneFromImage(candidate, pointerX, pointerY);
        if (imageTone) {
          return imageTone;
        }
      }

      const style = window.getComputedStyle(candidate);
      const background = parseCssColor(style.backgroundColor);

      if (background && background.alpha > 0.12) {
        return toneFromLuminance(luminanceFromColor(background));
      }
    }

    const bodyBackground = parseCssColor(window.getComputedStyle(document.body).backgroundColor);
    return bodyBackground ? toneFromLuminance(luminanceFromColor(bodyBackground)) : "dark";
  };

  const render = () => {
    const scale = isClickable ? (isPressed ? 1.45 : 1.95) : isPressed ? 0.82 : 1;

    pointerRing.classList.toggle("is-visible", isVisible);
    pointerRing.classList.toggle("is-clickable", isClickable);
    pointerRing.classList.toggle("is-pressed", isPressed);
    pointerRing.style.transform = `translate3d(${pointerX}px, ${pointerY}px, 0) translate(-50%, -50%) scale(${scale})`;
    frameId = null;
  };

  const queueRender = () => {
    if (!frameId) {
      frameId = window.requestAnimationFrame(render);
    }
  };

  const updateTargetState = (target) => {
    const element = target instanceof Element ? target : null;
    isClickable = Boolean(element && element.closest(clickableSelector));
    document.body.classList.toggle(
      "pointer-editing",
      Boolean(element && element.closest(editableSelector))
    );
    setPointerTone(resolvePointerTone(element));
    queueRender();
  };

  window.addEventListener(
    "mousemove",
    (event) => {
      pointerX = event.clientX;
      pointerY = event.clientY;
      isVisible = true;
      updateTargetState(event.target);
      queueRender();
    },
    { passive: true }
  );

  window.addEventListener("mouseover", (event) => {
    isVisible = true;
    updateTargetState(event.target);
  });

  window.addEventListener("mouseout", (event) => {
    if (!event.relatedTarget) {
      isVisible = false;
      isClickable = false;
      setPointerTone("dark");
      queueRender();
    }
  });

  window.addEventListener("mousedown", () => {
    isPressed = true;
    queueRender();
  });

  window.addEventListener("mouseup", () => {
    isPressed = false;
    queueRender();
  });

  window.addEventListener("blur", () => {
    isPressed = false;
    isVisible = false;
    isClickable = false;
    setPointerTone("dark");
    queueRender();
  });

  document.addEventListener(
    "focusin",
    (event) => {
      updateTargetState(event.target);
    },
    true
  );

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      isPressed = false;
      isVisible = false;
      isClickable = false;
      setPointerTone("dark");
      queueRender();
    }
  });
}

initPointerRing();

if (navToggle && siteNav) {
  siteNav.style.setProperty("--nav-item-count", String(navLinks.length));
  navLinks.forEach((link, index) => {
    link.style.setProperty("--nav-item-index", String(index));
    if (!link.querySelector(".nav-link-mask")) {
      const mask = document.createElement("span");
      mask.className = "nav-link-mask";
      const copy = document.createElement("span");
      copy.className = "nav-link-copy";
      while (link.firstChild) {
        copy.appendChild(link.firstChild);
      }
      mask.appendChild(copy);
      link.appendChild(mask);
    }
  });

  const openNav = () => {
    if (navCloseTimer) {
      window.clearTimeout(navCloseTimer);
      navCloseTimer = null;
    }
    document.body.classList.remove("nav-closing");
    document.body.classList.add("nav-open");
    navToggle.setAttribute("aria-expanded", "true");
    if (navLabel) {
      navLabel.textContent = "Close";
    }
  };

  const closeNav = () => {
    if (!document.body.classList.contains("nav-open") && !document.body.classList.contains("nav-closing")) {
      return;
    }

    if (navCloseTimer) {
      window.clearTimeout(navCloseTimer);
    }

    document.body.classList.add("nav-closing");
    navToggle.setAttribute("aria-expanded", "false");
    if (navLabel) {
      navLabel.textContent = "Menu";
    }

    navCloseTimer = window.setTimeout(() => {
      document.body.classList.remove("nav-open", "nav-closing");
      navCloseTimer = null;
    }, NAV_MENU_CLOSE_MS);
  };

  navToggle.addEventListener("click", () => {
    if (document.body.classList.contains("nav-open") && !document.body.classList.contains("nav-closing")) {
      closeNav();
      return;
    }

    openNav();
  });

  navLinks.forEach((link) => {
    link.addEventListener("click", () => {
      if (document.body.classList.contains("nav-open")) {
        closeNav();
      }
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && document.body.classList.contains("nav-open")) {
      closeNav();
    }
  });
}

document.querySelectorAll(".site-footer .footer-note").forEach((note) => {
  if (!(note instanceof HTMLElement) || note.nextElementSibling?.classList.contains("footer-legal")) {
    return;
  }

  const legal = document.createElement("p");
  legal.className = "footer-legal";
  legal.textContent = FOOTER_LEGAL_TEXT;
  note.insertAdjacentElement("afterend", legal);
});

document.querySelectorAll("[data-contact-form]").forEach((form) => {
  if (!(form instanceof HTMLFormElement)) {
    return;
  }

  const feedback = form.querySelector("[data-contact-feedback]");
  const submitButton = form.querySelector("button[type='submit']");
  const defaultButtonLabel = submitButton ? submitButton.textContent : "";

  const setContactFeedback = (message, isError = false) => {
    if (!(feedback instanceof HTMLElement)) {
      return;
    }
    feedback.textContent = message;
    feedback.classList.toggle("is-error", isError);
    feedback.classList.toggle("is-success", !isError);
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formData = new FormData(form);
    const payload = {
      name: String(formData.get("name") || "").trim(),
      email: String(formData.get("email") || "").trim(),
      company: String(formData.get("company") || "").trim(),
      message: String(formData.get("message") || "").trim(),
      website: String(formData.get("website") || "").trim(),
      page: window.location.pathname || "/",
      source: String(form.dataset.contactForm || "website").trim(),
    };

    if (!payload.name || !payload.email || !payload.message) {
      setContactFeedback("Please complete your name, email, and message.", true);
      return;
    }

    if (submitButton instanceof HTMLButtonElement) {
      submitButton.disabled = true;
      submitButton.textContent = "Sending...";
    }
    setContactFeedback("Sending your inquiry...");

    try {
      const response = await fetch(CONTACT_INQUIRY_ENDPOINT, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || "Unable to send your inquiry right now.");
      }

      form.reset();
      setContactFeedback(result.message || "Inquiry received. We will get back to you shortly.");
    } catch (error) {
      setContactFeedback(error.message || "Unable to send your inquiry right now.", true);
    } finally {
      if (submitButton instanceof HTMLButtonElement) {
        submitButton.disabled = false;
        submitButton.textContent = defaultButtonLabel;
      }
    }
  });
});

const loginPage = document.querySelector("[data-portal-login-page]");
const activationPage = document.querySelector("[data-portal-activation-page]");
const bookingPage = document.querySelector("[data-portal-booking-page]");
const rolePage = document.querySelector("[data-role-page]");
const portalPageActive = Boolean(loginPage || activationPage || bookingPage || rolePage);

const portalMessage = document.querySelector("[data-portal-message]");
const loginForm = document.querySelector("[data-login-form]");
const registerForm = document.querySelector("[data-register-form]");
const otpPanel = document.querySelector("[data-otp-panel]");
const otpVerifyButton = document.querySelector("[data-verify-otp]");
const otpResendButton = document.querySelector("[data-resend-otp]");
const resetPasswordButton = document.querySelector("[data-reset-password]");
const signOutButtons = document.querySelectorAll("[data-signout]");
const bookingForm = document.querySelector("[data-booking-form]");
const registerAddressFieldset = registerForm?.querySelector('[data-address-fieldset="register"]');
const bookingAddressFieldset = bookingForm?.querySelector('[data-address-fieldset="booking"]');
const paymentFeedback = document.querySelector("[data-payment-feedback]");
const bookingFeedback = document.querySelector("[data-booking-feedback]");
const bookingOpenPaymentButton = document.querySelector("[data-booking-open-payment]");
const bookingCurrentPropertyLabel = document.querySelector("[data-booking-current-property]");
const bookingCurrentScopeLabel = document.querySelector("[data-booking-current-scope]");
const bookingServiceDayLabel = document.querySelector("[data-booking-service-day]");
const bookingServiceTimeLabel = document.querySelector("[data-booking-service-time]");
const bookingPropertyGrid = document.querySelector("[data-booking-property-grid]");
const bookingPropertyEmpty = document.querySelector("[data-booking-property-empty]");
const bookingCategoryCards = document.querySelectorAll("[data-booking-category-card]");
const bookingServicesPanel = document.querySelector("[data-booking-services-panel]");
const bookingServicesTitle = document.querySelector("[data-booking-services-title]");
const bookingServiceGrid = document.querySelector("[data-booking-service-grid]");
const bookingSelectionNote = document.querySelector("[data-booking-selection-note]");
const bookingOpenSheetButton = document.querySelector("[data-booking-open-sheet]");
const bookingSheet = document.querySelector("[data-booking-sheet]");
const bookingSheetPanel = document.querySelector("[data-booking-sheet-panel]");
const bookingSheetCloseButtons = document.querySelectorAll("[data-booking-sheet-close]");
const bookingDateInput = document.querySelector("[data-booking-date]");
const bookingTimeInput = document.querySelector("[data-booking-time]");
const bookingSummaryDate = document.querySelector("[data-booking-summary-date]");
const bookingSummaryTime = document.querySelector("[data-booking-summary-time]");
const bookingSummaryCategory = document.querySelector("[data-booking-summary-category]");
const bookingSummaryProperty = document.querySelector("[data-booking-summary-property]");
const bookingSummaryPropertyPill = document.querySelector("[data-booking-summary-property-pill]");
const bookingSummaryServicesCount = document.querySelector("[data-booking-summary-services-count]");
const bookingSummaryServices = document.querySelector("[data-booking-summary-services]");
const bookingPricingBlock = document.querySelector("[data-booking-pricing-block]");
const bookingPricingRows = document.querySelector("[data-booking-price-rows]");
const bookingPricingNote = document.querySelector("[data-booking-pricing-note]");
const bookingPricingMessage = document.querySelector("[data-booking-pricing-message]");
const bookingSubmitButton = document.querySelector("[data-booking-submit]");
const bookingNotice = document.querySelector("[data-booking-notice]");
const bookingNoticePanel = document.querySelector("[data-booking-notice-panel]");
const bookingNoticeTitle = document.querySelector("[data-booking-notice-title]");
const bookingNoticeKicker = document.querySelector("[data-booking-notice-kicker]");
const bookingNoticeMessage = document.querySelector("[data-booking-notice-message]");
const bookingNoticeDismissButtons = document.querySelectorAll("[data-booking-notice-dismiss]");
const loginFeedback = document.querySelector("[data-login-feedback]");
const registerFeedback = document.querySelector("[data-register-feedback]");
const otpFeedback = document.querySelector("[data-otp-feedback]");
const registerPopup = document.querySelector("[data-register-popup]");
const registerPopupTitle = document.querySelector("[data-register-popup-title]");
const registerPopupMessage = document.querySelector("[data-register-popup-message]");
const registerPopupDismissButtons = document.querySelectorAll("[data-register-popup-dismiss]");
const passwordToggleButtons = document.querySelectorAll("[data-password-toggle]");
const registerDocumentTypeField = registerForm?.querySelector("select[name='document_type']");
const registerDocumentNumberField = registerForm?.querySelector("input[name='document_number']");
const registerDocumentCountryField = registerForm?.querySelector("input[name='document_country']");
const registerDocumentCountryWrapper = registerForm?.querySelector("[data-document-country-field]");
const registerDocumentNumberWrapper = registerForm?.querySelector("[data-document-number-field]");
const registerDocumentNumberLabel = registerForm?.querySelector("[data-document-number-label]");
const registerDocumentDobWrapper = registerForm?.querySelector("[data-document-dob-field]");
const registerDocumentFeedback = registerForm?.querySelector("[data-document-feedback]");
const registerSubmitButton = registerForm?.querySelector("button[type='submit']");
const registerTitleField = registerForm?.querySelector("select[name='title']");
const registerFullNameField = registerForm?.querySelector("input[name='full_name']");
const registerSurnameField = registerForm?.querySelector("input[name='surname']");
const registerCellphoneField = registerForm?.querySelector("input[name='cellphone']");
const registerAgentCodeField = registerForm?.querySelector("input[name='agent_code']");
const registerEmailField = registerForm?.querySelector("input[name='email']");
const registerPasswordField = registerForm?.querySelector("input[name='password']");
const registerConfirmPasswordField = registerForm?.querySelector("input[name='confirm_password']");
const registerTermsField = registerForm?.querySelector(".register-agreement");
const registerTermsCheckbox = registerTermsField?.querySelector("input[type='checkbox']");
const statusTitle = document.querySelector("[data-status-title]");
const statusMessage = document.querySelector("[data-status-message]");
const outstandingBadge = document.querySelector("[data-outstanding]");
const userNameLabel = document.querySelector("[data-user-name]");
const emailChangeForm = document.querySelector("[data-email-change-form]");
const passwordChangeForm = document.querySelector("[data-password-change-form]");
const emailChangeFeedback = document.querySelector("[data-email-change-feedback]");
const passwordChangeFeedback = document.querySelector("[data-password-change-feedback]");
const settingsCurrentEmail = document.querySelector("[data-settings-current-email]");
const settingsOtpDestination = document.querySelector("[data-settings-otp-destination]");
const settingsOtpPanel = document.querySelector("[data-settings-otp-panel]");
const settingsOtpTitle = document.querySelector("[data-settings-otp-title]");
const settingsOtpMessage = document.querySelector("[data-settings-otp-message]");
const settingsOtpInput = settingsOtpPanel?.querySelector("input[name='settings_otp_code']");
const settingsOtpVerifyButton = document.querySelector("[data-settings-otp-verify]");
const settingsOtpResendButton = document.querySelector("[data-settings-otp-resend]");
const settingsOtpCancelButton = document.querySelector("[data-settings-otp-cancel]");
const settingsOtpFeedback = document.querySelector("[data-settings-otp-feedback]");
const payNowButton = document.querySelector("[data-request-paynow]");
const openPayNowButton = document.querySelector("[data-open-paynow]");
const cardPayButton = document.querySelector("[data-request-card]");
const presentationTierPanel = document.querySelector("[data-presentation-tier-panel]");
const presentationTierGrid = document.querySelector("[data-presentation-tier-grid]");
const presentationTierSummary = document.querySelector("[data-presentation-tier-summary]");
const presentationTierFeedback = document.querySelector("[data-presentation-tier-feedback]");
const paymentTermsCheckbox = document.querySelector("[data-payment-terms-checkbox]");
const bookingPaymentTermsCheckbox = document.querySelector("[data-booking-payment-terms-checkbox]");
const PASSWORD_RESET_SETTINGS = {
  url: "https://mycurator.co.za/portal-login.html?reset=complete",
  handleCodeInApp: false,
  iOS: {
    bundleId: "Curator-Property-Cleaners.MyCurator",
  },
  android: {
    packageName: "za.co.mycurator.mycurator",
    installApp: false,
  },
};
const openCardButton = document.querySelector("[data-open-card]");
const openMandateButton = document.querySelector("[data-open-mandate]");
const mandateButton = document.querySelector("[data-request-mandate]");
const mandateForm = document.querySelector("[data-mandate-form]");
const cancelMandateButton = document.querySelector("[data-cancel-mandate]");
const mandateAmountLabel = document.querySelector("[data-mandate-amount]");
const mandateReferenceLabel = document.querySelector("[data-mandate-reference]");
const customBankFields = document.querySelector("[data-custom-bank-fields]");
const customBankNote = document.querySelector("[data-custom-bank-note]");
const stepElements = document.querySelectorAll("[data-step]");
const roleTabs = document.querySelectorAll("[data-role-tab]");
const rolePanels = document.querySelectorAll("[data-role-panel]");
let portalCurrentPaymentType = "";
let portalCurrentPaymentUrl = "";

const workerPage = document.querySelector("[data-worker-page]");
const workerStatToday = document.querySelector("[data-worker-stat-today]");
const workerStatUpcoming = document.querySelector("[data-worker-stat-upcoming]");
const workerStatCompleted = document.querySelector("[data-worker-stat-completed]");
const workerNextJob = document.querySelector("[data-worker-next-job]");
const workerJobsList = document.querySelector("[data-worker-jobs]");
const workerFilters = document.querySelectorAll("[data-worker-filter]");
const workerName = document.querySelector("[data-worker-name]");
const workerCode = document.querySelector("[data-worker-code]");
const workerPhone = document.querySelector("[data-worker-phone]");
const workerEmail = document.querySelector("[data-worker-email]");
const workerRating = document.querySelector("[data-worker-rating]");
const workerSosButton = document.querySelector("[data-worker-sos]");
const workerCallButton = document.querySelector("[data-worker-call]");

const agentPage = document.querySelector("[data-realestate-page]");
const agentStatClients = document.querySelector("[data-agent-stat-clients]");
const agentStatProperties = document.querySelector("[data-agent-stat-properties]");
const agentStatBookings = document.querySelector("[data-agent-stat-bookings]");
const agentStatCurated = document.querySelector("[data-agent-stat-curated]");
const agentRecentBookings = document.querySelector("[data-agent-recent-bookings]");
const agentClientsList = document.querySelector("[data-agent-clients]");
const agentPropertiesList = document.querySelector("[data-agent-properties]");
const agentBookingsList = document.querySelector("[data-agent-bookings]");
const agentName = document.querySelector("[data-agent-name]");
const agentCompany = document.querySelector("[data-agent-company]");
const agentCode = document.querySelector("[data-agent-code]");
const agentPhone = document.querySelector("[data-agent-phone]");
const agentEmail = document.querySelector("[data-agent-email]");
const agentId = document.querySelector("[data-agent-id]");

const adminPage = document.querySelector("[data-admin-page]");
const adminStatClients = document.querySelector("[data-admin-stat-clients]");
const adminStatAgents = document.querySelector("[data-admin-stat-agents]");
const adminStatWorkers = document.querySelector("[data-admin-stat-workers]");
const adminStatBookings = document.querySelector("[data-admin-stat-bookings]");
const adminStatMandates = document.querySelector("[data-admin-stat-mandates]");
const adminStatIncidents = document.querySelector("[data-admin-stat-incidents]");
const adminRecentBookings = document.querySelector("[data-admin-recent-bookings]");
const adminClientsList = document.querySelector("[data-admin-clients]");
const adminAgentsList = document.querySelector("[data-admin-agents]");
const adminWorkersList = document.querySelector("[data-admin-workers]");
const adminBookingsList = document.querySelector("[data-admin-bookings]");
const adminMandatesList = document.querySelector("[data-admin-mandates]");
const adminIncidentsList = document.querySelector("[data-admin-incidents]");
const adminIncidentFeedback = document.querySelector("[data-admin-incident-feedback]");
const adminMandateExportButton = document.querySelector("[data-admin-export-mandates]");
const adminMandateFeedback = document.querySelector("[data-admin-mandate-feedback]");
const adminCommsForm = document.querySelector("[data-admin-comms-form]");
const adminCommsFeedback = document.querySelector("[data-admin-comms-feedback]");
const adminCommsRecent = document.querySelector("[data-admin-comms-recent]");

let auth = null;
let db = null;
let functions = null;
let currentUser = null;
let currentUserData = null;
let userListener = null;
let payNowListener = null;
let pendingOtpUserId = null;
let registrationProfilePending = false;
let hasRedirectedToBooking = false;
let workerBookingsListener = null;
let workerBookingsCache = [];
let workerFilter = "today";
let agentDataLoaded = false;
let adminDataLoaded = false;
let workerFiltersBound = false;
let adminMandatesBound = false;
let adminCommsBound = false;
const adminIncidentReplying = new Set();
let pendingSecurityChange = null;
let bookingPropertiesListener = null;
let bookingProperties = [];
let bookingSelectedPropertyId = "";
let bookingSelectedCategory = "";
let bookingSelectedServices = [];
let bookingPricingLines = [];
let bookingPayNowTotalCents = 0;
let bookingHasMonthlyServices = false;
let bookingPricingReady = false;
let bookingPricingMessageText = "";
let bookingPricingRequestId = 0;
let bookingSubmitting = false;
let selectingPresentationTier = false;
let pendingPresentationTierId = "";
let updateDashboard = () => {};

const CUSTOM_MANDATE_BANK_ID = "__other__";
const PAYMENT_TERMS_VERSION = "2026-03-20";
const PAYMENT_TERMS_REQUIRED_MESSAGE =
  "Please accept the Payment Terms & Conditions to continue.";
const PAYNOW_REQUEST_POLL_DELAYS_MS = [250, 500, 900, 1400, 2000, 2800];
const ADMIN_INCIDENT_QUICK_REPLIES = [
  {
    label: "Acknowledge",
    message: "We have acknowledged the incident reported. We will investigate and take necessary action.",
  },
  {
    label: "Under Review",
    message: "Your report has been received and is under review.",
  },
  {
    label: "Feedback Soon",
    message: "Thank you for reporting this. We will provide feedback shortly.",
  },
];
const normalizeComparableToken = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const SERVICE_NAME_ALIASES = {
  "Standard Cleaning": "Essential Cleaning",
  "Essential Cleaning": "Essential Cleaning",
  "Deep Cleaning": "Deep Cleaning",
  "Staging Furniture": "Property Staging",
  "Property Staging": "Property Staging",
  "Pest Control": "Pest Management",
  "Pest Management": "Pest Management",
  "Odour Control": "Odour Elimination",
  "Odour Elimination": "Odour Elimination",
  "Repainting": "Interior Repainting",
  "Interior Repainting": "Interior Repainting",
  "Pool Cleaning": "Pool Care",
  "Pool Care": "Pool Care",
  "Lawn Mowing": "Turf Management",
  "Turf Management": "Turf Management",
  "Plant Trimming": "Landscape Grooming",
  "Landscape Grooming": "Landscape Grooming",
  "Lawn Colour Shading": "Turf Rejuvenation",
  "Turf Rejuvenation": "Turf Rejuvenation",
  "Interior Wear & Tears Repair": "Interior Restoration",
  "Interior Restoration": "Interior Restoration",
  "Pavement Cleaning": "Pavement Cleaning",
  "Plant Uprooting": "Plant Uprooting",
  "Site Excavation": "Site Excavation",
  "Weed Removal": "Weed Removal",
};
const SERVICE_NAME_BY_TOKEN = Object.entries(SERVICE_NAME_ALIASES).reduce((accumulator, [key, value]) => {
  accumulator[normalizeComparableToken(key)] = value;
  return accumulator;
}, {});
const SERVICE_SUBMISSION_NAME_ALIASES = {
  "Essential Cleaning": "Standard Cleaning",
  "Deep Cleaning": "Deep Cleaning",
  "Property Staging": "Staging Furniture",
  "Pest Management": "Pest Control",
  "Odour Elimination": "Odour Control",
  "Interior Repainting": "Repainting",
  "Pool Care": "Pool Cleaning",
  "Turf Management": "Lawn Mowing",
  "Landscape Grooming": "Plant Trimming",
  "Turf Rejuvenation": "Lawn Colour Shading",
  "Interior Restoration": "Interior Wear & Tears Repair",
  "Pavement Cleaning": "Pavement Cleaning",
  "Plant Uprooting": "Plant Uprooting",
  "Site Excavation": "Site Excavation",
  "Weed Removal": "Weed Removal",
};
const SERVICE_SUBMISSION_NAME_BY_TOKEN = Object.entries(SERVICE_SUBMISSION_NAME_ALIASES).reduce(
  (accumulator, [key, value]) => {
    accumulator[normalizeComparableToken(key)] = value;
    return accumulator;
  },
  {}
);
const displayServiceName = (value) => {
  const token = normalizeComparableToken(value);
  return SERVICE_NAME_BY_TOKEN[token] || String(value || "").trim();
};
const submissionServiceName = (value) => {
  const displayName = displayServiceName(value);
  return SERVICE_SUBMISSION_NAME_BY_TOKEN[normalizeComparableToken(displayName)] || displayName;
};
const normalizeServiceLookupKey = (value) => normalizeComparableToken(displayServiceName(value));
const PRESENTATION_TIERS = {
  core: {
    id: "core",
    name: "Core",
    assessmentFeeCents: 29999,
    positioningLine: "Maintains general presentation",
    recurringSummary: ["Weekly Essential Cleaning"],
  },
  refined: {
    id: "refined",
    name: "Refined",
    assessmentFeeCents: 79999,
    positioningLine: "Maintains stable condition",
    recurringSummary: ["Weekly Essential Cleaning", "Weekly Turf Management"],
  },
  gallery: {
    id: "gallery",
    name: "Gallery",
    assessmentFeeCents: 149999,
    positioningLine: "Prepared for active listing and viewings",
    recurringSummary: ["Weekly Essential Cleaning", "Weekly Odour Elimination", "Weekly Turf Management"],
  },
  signature: {
    id: "signature",
    name: "Signature",
    assessmentFeeCents: 219999,
    positioningLine: "Positioned to maximise buyer perception",
    recurringSummary: [
      "Monthly Deep Cleaning",
      "Weekly Essential Cleaning",
      "Weekly Odour Elimination",
      "Weekly Turf Management",
      "Weekly Landscape Grooming",
    ],
  },
};
const compactTierServiceLabel = (value) =>
  String(value || "")
    .replace(/^(daily|weekly|monthly)\s+/i, "")
    .trim();
const normalizePresentationTierId = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
const resolvePresentationTierConfigFromData = (data) => {
  const explicitTier = PRESENTATION_TIERS[normalizePresentationTierId(
    data?.presentationTier || data?.presentationTierId || data?.presentationPackage || data?.assessmentFeeTier
  )];
  if (explicitTier) return explicitTier;
  const cents = Number(
    data?.presentationTierAssessmentFeeCents || data?.adminFeeCents || 0
  );
  if (!Number.isFinite(cents) || cents <= 0) return null;
  const paymentState = String(data?.assessmentFeeStatus || (data?.adminFeePaid === true ? "paid" : ""))
    .trim()
    .toLowerCase();
  const hasAssessmentFlow = Boolean(
    String(data?.assessmentFeePaymentRequestId || "").trim() ||
      String(data?.assessmentFeePaymentUrl || "").trim() ||
      paymentState === "paid"
  );
  if (!hasAssessmentFlow) return null;
  return Object.values(PRESENTATION_TIERS).find((tier) => tier.assessmentFeeCents === cents) || null;
};
const resolvePendingPresentationTierConfig = () =>
  PRESENTATION_TIERS[normalizePresentationTierId(pendingPresentationTierId)] || null;
const resolveEffectivePresentationTierData = (data) => {
  const sourceData = data || currentUserData || {};
  const pendingTier = resolvePendingPresentationTierConfig();
  if (!pendingTier) return sourceData;
  return {
    ...sourceData,
    presentationTier: pendingTier.id,
    presentationTierId: pendingTier.id,
    presentationPackage: pendingTier.id,
    assessmentFeeTier: pendingTier.id,
    presentationTierName: pendingTier.name,
    presentationTierAssessmentFeeCents: pendingTier.assessmentFeeCents,
    presentationTierRecurringSummary: pendingTier.recurringSummary.slice(),
    adminFeeCents: pendingTier.assessmentFeeCents,
  };
};
const resolveEffectivePresentationTierConfig = (data) =>
  resolvePendingPresentationTierConfig() || resolvePresentationTierConfigFromData(data);
const syncPendingPresentationTierFromSnapshot = (data) => {
  const pendingTier = resolvePendingPresentationTierConfig();
  if (!pendingTier) return;
  const snapshotTier = resolvePresentationTierConfigFromData(data);
  const assessmentFeeStatus = String(data?.assessmentFeeStatus || (data?.adminFeePaid === true ? "paid" : ""))
    .trim()
    .toLowerCase();
  if (assessmentFeeStatus === "paid" || snapshotTier?.id === pendingTier.id) {
    pendingPresentationTierId = "";
  }
};
const BOOKING_CATEGORY_SERVICES = {
  Residential: [
    "Essential Cleaning",
    "Deep Cleaning",
    "Property Staging",
    "Pest Management",
    "Odour Elimination",
    "Interior Repainting",
    "Pool Care",
    "Turf Management",
    "Landscape Grooming",
    "Turf Rejuvenation",
    "Interior Restoration",
    "Pavement Cleaning",
  ],
  Office: [
    "Essential Cleaning",
    "Deep Cleaning",
    "Property Staging",
    "Pest Management",
    "Odour Elimination",
    "Interior Repainting",
    "Pool Care",
    "Turf Management",
    "Landscape Grooming",
    "Turf Rejuvenation",
    "Interior Restoration",
    "Pavement Cleaning",
  ],
  Commercial: [
    "Essential Cleaning",
    "Deep Cleaning",
    "Property Staging",
    "Pest Management",
    "Odour Elimination",
    "Interior Repainting",
    "Pool Care",
    "Turf Management",
    "Landscape Grooming",
    "Turf Rejuvenation",
    "Interior Restoration",
    "Pavement Cleaning",
  ],
  "Vacant Land": ["Plant Uprooting", "Site Excavation", "Weed Removal"],
};

if (bookingSheet && bookingSheet.parentElement !== document.body) {
  document.body.appendChild(bookingSheet);
}

if (bookingNotice && bookingNotice.parentElement !== document.body) {
  document.body.appendChild(bookingNotice);
}

const showMessage = (message, isError = false, options = {}) => {
  if (!portalMessage) return;
  portalMessage.textContent = message;
  portalMessage.classList.toggle("is-error", Boolean(message) && isError);
  portalMessage.classList.toggle("is-success", Boolean(message) && !isError);
  portalMessage.classList.toggle("is-quiet-success", Boolean(message) && !isError && options.quietSuccess === true);
  portalMessage.classList.toggle("is-no-wrap", Boolean(message) && options.noWrap === true);
  portalMessage.classList.add("is-visible");
};

const clearMessage = () => {
  if (!portalMessage) return;
  portalMessage.textContent = "";
  portalMessage.classList.remove("is-error", "is-success", "is-quiet-success", "is-no-wrap");
  portalMessage.classList.remove("is-visible");
};

const setFeedback = (el, message, isError = false) => {
  if (!el) return;
  const hasMessage = Boolean(message);
  el.textContent = message;
  el.classList.toggle("is-visible", hasMessage);
  el.classList.toggle("is-error", hasMessage && isError);
  el.classList.toggle("is-success", hasMessage && !isError);
};

const showRegisterPopup = (message, title = "Registration issue") => {
  if (!(registerPopup && registerPopupMessage && registerPopupTitle)) return;
  registerPopupTitle.textContent = title;
  registerPopupMessage.textContent = String(message || "").trim();
  registerPopup.classList.remove("is-hidden");
  registerPopup.setAttribute("aria-hidden", "false");
  const dismissButton = registerPopup.querySelector("[data-register-popup-dismiss]");
  if (dismissButton instanceof HTMLButtonElement) {
    window.setTimeout(() => dismissButton.focus(), 0);
  }
};

const hideRegisterPopup = () => {
  if (!registerPopup) return;
  registerPopup.classList.add("is-hidden");
  registerPopup.setAttribute("aria-hidden", "true");
};

const formatRegistrationError = (error, fallbackMessage = "Unable to create account.") => {
  const code = String(error?.code || "").trim().toLowerCase();
  if (code === "auth/email-already-in-use") {
    return {
      title: "Email already registered",
      message: "That email address is already registered. Sign in instead or use a different email address.",
      invalidTargets: [registerEmailField],
    };
  }
  if (code === "auth/invalid-email") {
    return {
      title: "Invalid email",
      message: "Enter a valid email address before continuing.",
      invalidTargets: [registerEmailField],
    };
  }
  if (code === "auth/weak-password") {
    return {
      title: "Weak password",
      message: "Use a stronger password with at least 6 characters.",
      invalidTargets: [registerPasswordField, registerConfirmPasswordField],
    };
  }
  if (code === "auth/network-request-failed") {
    return {
      title: "Connection issue",
      message: "We could not reach the server just now. Check your connection and try again."
    };
  }
  if (code === "auth/too-many-requests") {
    return {
      title: "Too many attempts",
      message: "Too many attempts were made just now. Wait a moment and try again."
    };
  }
  return {
    title: "Registration issue",
    message: error?.message || fallbackMessage
  };
};

const showRegistrationError = (message, options = {}) => {
  const resolvedMessage = String(message || "").trim();
  if (!resolvedMessage) return;
  const feedbackTarget = options.feedbackEl || registerFeedback;
  setFeedback(feedbackTarget, "");
  if (Array.isArray(options.invalidTargets)) {
    options.invalidTargets.forEach((target) => {
      const field = target instanceof HTMLElement
        ? (target.classList.contains("field") || target.classList.contains("address-fieldset")
          ? target
          : target.closest(".field") || target)
        : null;
      field?.classList.add("is-invalid");
    });
  }
  showRegisterPopup(resolvedMessage, options.title || "Registration issue");
};

const clearRegisterFieldError = (target) => {
  if (!(target instanceof HTMLElement)) return;
  const field = target.classList.contains("field") || target.classList.contains("address-fieldset")
    ? target
    : target.closest(".field");
  field?.classList.remove("is-invalid");
};

const clearRegisterValidationState = () => {
  [
    registerTitleField,
    registerFullNameField,
    registerSurnameField,
    registerDocumentTypeField,
    registerDocumentNumberField,
    registerDocumentCountryField,
    registerCellphoneField,
    registerAddressFieldset,
    registerAgentCodeField,
    registerEmailField,
    registerPasswordField,
    registerConfirmPasswordField,
    registerTermsField,
  ].forEach((field) => clearRegisterFieldError(field));
};

const getRegisterFormState = () => {
  const formData = registerForm ? new FormData(registerForm) : new FormData();
  const addressDetails = registerAddressController?.collect() || {};
  const identityState = getRegisterIdentityState();
  const documentNumber = String(formData.get("document_number") || "").trim();
  const documentCountry = String(formData.get("document_country") || "").trim();
  const password = String(formData.get("password") || "");
  const confirmPassword = String(formData.get("confirm_password") || "");

  return {
    formData,
    addressDetails,
    identityState,
    title: String(formData.get("title") || "").trim(),
    fullName: String(formData.get("full_name") || "").trim(),
    surname: String(formData.get("surname") || "").trim(),
    documentType: String(formData.get("document_type") || "").trim(),
    documentNumber,
    documentCountry,
    cellphone: String(formData.get("cellphone") || "").trim(),
    realEstateCode: String(formData.get("agent_code") || "").trim(),
    email: String(formData.get("email") || "").trim(),
    password,
    confirmPassword,
    termsAccepted: Boolean(registerTermsCheckbox?.checked),
  };
};

const validateRegisterSubmission = () => {
  const state = getRegisterFormState();
  const invalidTargets = [];

  if (!state.title) invalidTargets.push(registerTitleField);
  if (!state.fullName) invalidTargets.push(registerFullNameField);
  if (!state.surname) invalidTargets.push(registerSurnameField);
  if (!state.documentType) invalidTargets.push(registerDocumentTypeField);
  if (!state.documentNumber) invalidTargets.push(registerDocumentNumberField);
  if (state.documentType === "passport" && !state.documentCountry) invalidTargets.push(registerDocumentCountryField);
  if (!state.cellphone) invalidTargets.push(registerCellphoneField);
  if (!isStructuredAddressComplete(state.addressDetails)) invalidTargets.push(registerAddressFieldset);
  if (!state.realEstateCode) invalidTargets.push(registerAgentCodeField);
  if (!state.email) invalidTargets.push(registerEmailField);
  if (!state.password) invalidTargets.push(registerPasswordField);
  if (!state.confirmPassword) invalidTargets.push(registerConfirmPasswordField);
  if (!state.termsAccepted) invalidTargets.push(registerTermsField);

  if (invalidTargets.length) {
    return {
      valid: false,
      title: "Missing information",
      message: "Please fill in all fields.",
      invalidTargets,
      state,
    };
  }

  if (registerEmailField instanceof HTMLInputElement && !registerEmailField.checkValidity()) {
    return {
      valid: false,
      title: "Invalid email",
      message: "Enter a valid email address before continuing.",
      invalidTargets: [registerEmailField],
      state,
    };
  }

  if (!state.identityState.isValid) {
    const identityTargets = [registerDocumentTypeField, registerDocumentNumberField];
    if (state.documentType === "passport") {
      identityTargets.push(registerDocumentCountryField);
    }
    return {
      valid: false,
      title: "Check your document details",
      message: state.identityState.message || MISSING_DOCUMENT_TYPE_MESSAGE,
      invalidTargets: identityTargets,
      state,
    };
  }

  if (state.password !== state.confirmPassword) {
    return {
      valid: false,
      title: "Password mismatch",
      message: "Passwords do not match.",
      invalidTargets: [registerPasswordField, registerConfirmPasswordField],
      state,
    };
  }

  return {
    valid: true,
    invalidTargets: [],
    state,
  };
};

const formatCurrency = (cents) => {
  if (!cents) return "R0.00";
  return `R${(cents / 100).toFixed(2)}`;
};

const isAssessmentTierRequired = () =>
  Boolean(
    currentUserData &&
      String(currentUserData.assessmentFeeStatus || "").trim().toLowerCase() !== "paid"
  );

const hasSelectedPresentationTier = () =>
  Boolean(resolveEffectivePresentationTierConfig(currentUserData));

const defaultPresentationTier = () => PRESENTATION_TIERS.core;

const applyPresentationTierSelection = (tierId, payload = {}) => {
  const fallbackTier = PRESENTATION_TIERS[normalizePresentationTierId(tierId)] || defaultPresentationTier();
  currentUserData = {
    ...(currentUserData || {}),
    presentationTier: payload.presentationTier || fallbackTier.id,
    presentationTierName: payload.presentationTierName || fallbackTier.name || "",
    presentationTierAssessmentFeeCents:
      Number(payload.presentationTierAssessmentFeeCents || fallbackTier.assessmentFeeCents || 0) || 0,
    presentationTierRecurringSummary: Array.isArray(payload.presentationTierRecurringSummary)
      ? payload.presentationTierRecurringSummary.slice()
      : fallbackTier.recurringSummary.slice() || [],
    presentationTierServices: Array.isArray(payload.presentationTierServices)
      ? payload.presentationTierServices.slice()
      : [],
    adminFeeCents:
      Number(payload.presentationTierAssessmentFeeCents || fallbackTier.assessmentFeeCents || 0) || 0,
    assessmentFeeStatus: "unpaid",
    adminFeePaid: false,
    assessmentFeePaymentRequestId: "",
    assessmentFeePaymentUrl: "",
    currentPaymentRequestId: "",
    currentPaymentType: "",
    payNowGateway: "ozow",
  };
  return currentUserData;
};

const ensureAssessmentTierBeforePayment = async () => {
  const existingTier = resolveEffectivePresentationTierConfig(currentUserData);
  if (existingTier || !isAssessmentTierRequired()) {
    return existingTier || defaultPresentationTier();
  }
  throw new Error("Select your property assessment fee option before continuing with secure payment.");
};

const renderPresentationTierSelector = (data) => {
  if (!presentationTierPanel || !presentationTierGrid || !presentationTierSummary) return;

  const sourceData = resolveEffectivePresentationTierData(data);
  const tier = resolveEffectivePresentationTierConfig(sourceData);
  const needsSelection =
    String(sourceData?.assessmentFeeStatus || "").trim().toLowerCase() !== "paid";
  presentationTierPanel.classList.toggle("is-hidden", !needsSelection);
  if (!needsSelection) {
    presentationTierGrid.innerHTML = "";
    presentationTierSummary.innerHTML = "";
    setFeedback(presentationTierFeedback, "");
    return;
  }

  presentationTierGrid.innerHTML = Object.values(PRESENTATION_TIERS)
    .map((option) => {
      const selected = tier?.id === option.id;
      return `
        <button
          class="tier-option${selected ? " is-selected" : ""}"
          type="button"
          data-presentation-tier-option="${option.id}"
          aria-pressed="${selected ? "true" : "false"}"
          ${selectingPresentationTier ? "disabled" : ""}
        >
          <span class="tier-option-name">${escapeHtml(option.name)}</span>
          <span class="tier-option-positioning">"${escapeHtml(option.positioningLine || "")}"</span>
          <span class="tier-option-services">
            ${(Array.isArray(option.recurringSummary) ? option.recurringSummary : [])
              .map(
                (item) =>
                  `<span class="tier-option-service">${escapeHtml(compactTierServiceLabel(item))}</span>`
              )
              .join("")}
          </span>
          <strong class="tier-option-price">${escapeHtml(formatCurrency(option.assessmentFeeCents))}</strong>
          <span class="tier-option-note">Property assessment fee</span>
        </button>
      `;
    })
    .join("");

  presentationTierGrid.querySelectorAll("[data-presentation-tier-option]").forEach((button) => {
    button.addEventListener("click", async () => {
      const tierId = button.getAttribute("data-presentation-tier-option");
      if (!tierId || selectingPresentationTier) return;

      const previousUserData = currentUserData ? { ...currentUserData } : null;
      pendingPresentationTierId = tierId;
      applyPresentationTierSelection(tierId, {});
      updateDashboard(currentUserData);
      renderPresentationTierSelector(currentUserData || {});
      if (!functions || !currentUser) {
        setFeedback(
          presentationTierFeedback,
          "Assessment fee option selected locally. Sign in on the hosted portal to save it to your account."
        );
        syncPaymentConsentState();
        return;
      }

      selectingPresentationTier = true;
      renderPresentationTierSelector(currentUserData || {});
      setFeedback(presentationTierFeedback, "Saving your selected property assessment fee option...");

      try {
        const result = await functions.httpsCallable("selectPresentationTier")({
          presentationTier: tierId,
        });
        applyPresentationTierSelection(tierId, result?.data || {});
        updateDashboard(currentUserData);
        setFeedback(
          presentationTierFeedback,
          `${currentUserData.presentationTierName || PRESENTATION_TIERS[tierId]?.name || "Assessment option"} selected for the property assessment fee.`
        );
        stopPayNowListener();
      } catch (error) {
        pendingPresentationTierId = "";
        currentUserData = previousUserData;
        if (currentUserData) {
          updateDashboard(currentUserData);
        } else {
          renderPresentationTierSelector({ assessmentFeeStatus: "unpaid" });
        }
        setFeedback(
          presentationTierFeedback,
          error.message || "We couldn't save your selected property assessment fee option just now.",
          true
        );
      } finally {
        selectingPresentationTier = false;
        renderPresentationTierSelector(currentUserData || data || {});
        syncPaymentConsentState();
      }
    });
  });

  presentationTierSummary.innerHTML = "";
};

const closeBookingNotice = () => {
  if (!bookingNotice) return;
  bookingNotice.classList.add("is-hidden");
  bookingNotice.classList.remove("is-error", "is-success");
  bookingNotice.setAttribute("aria-hidden", "true");
};

const BOOKING_CONFIRMATION_MESSAGE =
  "Thank you for choosing Curator Property Presentation Co. Your visit has been received and is now being prepared with care.";

const BOOKING_INVALID_TIME_MESSAGE = `Please choose a date and time at least 24 hours from now.

Bookings are available on the hour and half hour only.

Our Working Hours:
Monday:     07:00 AM – 18:30 PM
Tuesday:    07:00 AM – 18:30 PM
Wednesday:  07:00 AM – 18:30 PM
Thursday:   07:00 AM – 18:30 PM
Friday:     07:00 AM – 18:00 PM
Saturday:   09:00 AM – 15:00 PM
Sunday:     09:00 AM – 15:00 PM`;

const resolveBookingNoticeMeta = (message, isError) => {
  const normalized = String(message || "").toLowerCase();
  if (normalized.includes("cleaned to perfection")) {
    return { kicker: "Booking confirmed", title: "Booking Confirmed" };
  }
  if (isError) {
    if (normalized.includes("please choose a date and time at least 24 hours from now")) {
      return { kicker: "Booking time", title: "Invalid Booking Time" };
    }
    return {
      kicker: "Booking issue",
      title: normalized.includes("payment") ? "Payment Issue" : "Booking Issue",
    };
  }
  if (normalized.includes("finalising your booking")) {
    return { kicker: "Processing", title: "Booking Update" };
  }
  if (normalized.includes("booking is confirmed")) {
    return { kicker: "Booking confirmed", title: "Booking Confirmed" };
  }
  if (normalized.includes("payment link")) {
    return { kicker: "Payment ready", title: "Continue to Payment" };
  }
  return { kicker: "Booking update", title: "Booking Update" };
};

const setBookingFeedback = (message, isError = false) => {
  if (!bookingNotice || !bookingNoticeMessage || !bookingNoticeTitle || !bookingNoticeKicker) {
    setFeedback(bookingFeedback, message, isError);
    return;
  }

  if (!message) {
    closeBookingNotice();
    return;
  }

  const meta = resolveBookingNoticeMeta(message, isError);
  bookingNoticeKicker.textContent = meta.kicker;
  bookingNoticeTitle.textContent = meta.title;
  bookingNoticeMessage.textContent = message;
  bookingNotice.classList.remove("is-hidden");
  bookingNotice.classList.toggle("is-error", Boolean(isError));
  bookingNotice.classList.toggle("is-success", !isError);
  bookingNotice.setAttribute("aria-hidden", "false");

  if (bookingNoticePanel) {
    window.requestAnimationFrame(() => {
      bookingNoticePanel.focus({ preventScroll: true });
    });
  }
};

const hasAcceptedTerms = (checkbox) => checkbox instanceof HTMLInputElement && checkbox.checked;
const getBrowserNavigationContext = () => {
  const userAgent = String(window.navigator?.userAgent || "");
  const isAndroid = /Android/i.test(userAgent);
  const isIOS = /iPhone|iPad|iPod/i.test(userAgent);
  const isAndroidWebView = isAndroid && (/\bwv\b/i.test(userAgent) || /Version\/[\d.]+/i.test(userAgent));
  const isIOSWebView =
    isIOS &&
    !/Safari/i.test(userAgent) &&
    !/CriOS/i.test(userAgent) &&
    !/FxiOS/i.test(userAgent) &&
    !/EdgiOS/i.test(userAgent);
  const isEmbeddedBrowser =
    /FBAN|FBAV|Instagram|Line|LinkedInApp|TikTok|Telegram|Snapchat|Pinterest|MicroMessenger/i.test(userAgent);
  const isStandaloneDisplayMode =
    typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches;
  const isIOSStandalone = isIOS && window.navigator?.standalone === true;
  const isAppShell =
    typeof window.ReactNativeWebView !== "undefined" ||
    typeof window.Capacitor !== "undefined" ||
    typeof window.cordova !== "undefined";
  return {
    isAppLike:
      isAppShell ||
      isStandaloneDisplayMode ||
      isIOSStandalone ||
      isAndroidWebView ||
      isIOSWebView ||
      isEmbeddedBrowser,
  };
};

const openExternalBrowserTarget = (target) => {
  try {
    const popup = window.open(target, "_blank", "noopener,noreferrer");
    if (popup) {
      try {
        popup.opener = null;
      } catch (error) {
        // Ignore cross-window opener assignment issues.
      }
      if (typeof popup.focus === "function") {
        popup.focus();
      }
      return true;
    }
  } catch (error) {
    // Fall through to anchor navigation.
  }

  try {
    const link = document.createElement("a");
    link.href = target;
    link.target = "_blank";
    link.rel = "noopener noreferrer external";
    link.className = "is-hidden";
    document.body.appendChild(link);
    link.click();
    link.remove();
    return true;
  } catch (error) {
    return false;
  }
};

const securePaymentRedirectMessage = () => {
  const { isAppLike } = getBrowserNavigationContext();
  return isAppLike
    ? "Opening your secure payment page. If it does not continue automatically in the app, tap Continue with secure payment."
    : "Taking you to our secure payment page. If it does not continue automatically, select Continue with secure payment.";
};

const usesPrimaryPortalPaymentButton = () =>
  portalCurrentPaymentType === "assessment_fee" && Boolean(portalCurrentPaymentUrl);

const syncPaymentConsentState = () => {
  const hasPortalConsent = hasAcceptedTerms(paymentTermsCheckbox);
  const hasRequiredTierSelection = !isAssessmentTierRequired() || hasSelectedPresentationTier();
  if (payNowButton) {
    payNowButton.disabled =
      !portalCurrentPaymentType || !hasPortalConsent || !hasRequiredTierSelection;
  }
  if (openPayNowButton) {
    openPayNowButton.disabled = !hasPortalConsent || !hasRequiredTierSelection;
  }
  if (bookingSubmitButton) {
    bookingSubmitButton.disabled = !hasAcceptedTerms(bookingPaymentTermsCheckbox);
  }
  if (bookingOpenPaymentButton) {
    bookingOpenPaymentButton.disabled = !hasAcceptedTerms(bookingPaymentTermsCheckbox);
  }
};

paymentTermsCheckbox?.addEventListener("change", syncPaymentConsentState);
bookingPaymentTermsCheckbox?.addEventListener("change", syncPaymentConsentState);
syncPaymentConsentState();

let pendingExternalRedirectUrl = "";
let pendingExternalRedirectTimer = null;

const continueInCurrentWindow = (
  url,
  { button, consentCheckbox, onConsentMissing, onReady } = {}
) => {
  const target = String(url || "").trim();
  if (!target) return false;
  const browserContext = getBrowserNavigationContext();

  const navigate = ({ fromButton = false } = {}) => {
    if (consentCheckbox && !hasAcceptedTerms(consentCheckbox)) {
      if (typeof onConsentMissing === "function") {
        onConsentMissing();
      }
      syncPaymentConsentState();
      return false;
    }
    if (browserContext.isAppLike && openExternalBrowserTarget(target)) {
      return true;
    }
    if (fromButton && openExternalBrowserTarget(target)) {
      return true;
    }
    try {
      if (window.top && window.top !== window && window.top.location) {
        window.top.location.assign(target);
        return true;
      }
    } catch (error) {
      // Ignore cross-origin frame access and fall back to current window navigation.
    }
    window.location.assign(target);
    return true;
  };

  if (button) {
    button.classList.remove("is-hidden");
    button.onclick = () => {
      navigate({ fromButton: true });
    };
  }

  if (typeof onReady === "function") {
    onReady();
  }

  if (pendingExternalRedirectUrl === target) {
    return true;
  }

  pendingExternalRedirectUrl = target;
  if (pendingExternalRedirectTimer) {
    window.clearTimeout(pendingExternalRedirectTimer);
  }

  // Let the updated fallback button and status render before leaving the page.
  pendingExternalRedirectTimer = window.setTimeout(() => {
    navigate();
  }, browserContext.isAppLike ? 240 : 120);

  return true;
};

bookingNoticeDismissButtons.forEach((button) => {
  button.addEventListener("click", closeBookingNotice);
});

registerPopupDismissButtons.forEach((button) => {
  button.addEventListener("click", hideRegisterPopup);
});

if (registerPopup) {
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !registerPopup.classList.contains("is-hidden")) {
      hideRegisterPopup();
    }
  });
}

passwordToggleButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const field = button.closest(".password-field");
    const input = field?.querySelector("input");
    if (!(input instanceof HTMLInputElement)) return;
    const shouldReveal = input.type === "password";
    input.type = shouldReveal ? "text" : "password";
    button.textContent = shouldReveal ? "Hide" : "Show";
    button.setAttribute("aria-label", shouldReveal ? "Hide password" : "Show password");
  });
});

if (loginPage && portalMessage) {
  const resetState = new URLSearchParams(window.location.search).get("reset");
  if (resetState === "complete") {
    showMessage("Password updated. Sign in with your new password.");
  }
}

if (registerForm) {
  registerForm.setAttribute("novalidate", "novalidate");
}

const getOtpDeliveryWarning = (result) => {
  if (result?.delivery === "log") {
    return "OTP delivery is not configured yet. Contact support before continuing.";
  }
  return "";
};

const buildHttpFunctionUrl = (path) => {
  const normalizedPath = String(path || "").trim().replace(/^\/+/, "");
  if (!normalizedPath) {
    throw new Error("Cloud Function path is missing.");
  }

  const configuredProjectId = String(window.firebaseConfig?.projectId || "").trim();
  const firebaseProjectId =
    typeof firebase !== "undefined"
      ? String(firebase.apps?.[0]?.options?.projectId || "").trim()
      : "";
  const activeProjectId = configuredProjectId || firebaseProjectId || DEFAULT_FUNCTIONS_PROJECT_ID;

  return `https://${CLOUD_FUNCTIONS_REGION}-${activeProjectId}.cloudfunctions.net/${normalizedPath}`;
};

const postHttpFunction = async (path, payload) => {
  const response = await fetch(buildHttpFunctionUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.error || "Request failed.");
  }
  return result;
};

const readFirestoreDocumentOnce = async (docRef) => {
  if (!docRef) return null;
  try {
    return await docRef.get({ source: "server" });
  } catch (error) {
    try {
      return await docRef.get();
    } catch (fallbackError) {
      return null;
    }
  }
};

const extractPayNowRequestState = (data = {}) => ({
  redirectUrl: String(data.redirectUrl || data.payNowUrl || "").trim(),
  status: String(data.status || data.payNowStatus || "").trim().toLowerCase(),
  paymentStatus: String(data.paymentStatus || "").trim().toLowerCase(),
  bookingSyncStatus: String(data.bookingSyncStatus || "").trim().toLowerCase(),
  processingMessage: String(data.processingMessage || data.message || "").trim(),
  errorMessage: String(data.errorMessage || "").trim(),
});

const watchPayNowRequest = (requestId, onUpdate, initialData = null) => {
  if (!db || !requestId || typeof onUpdate !== "function") {
    return () => {};
  }

  const docRef = db.collection("paynow_requests").doc(requestId);
  let stopped = false;
  let pollTimer = null;
  let pollIndex = 0;
  let lastSignature = "";

  const emit = (rawData) => {
    if (stopped || !rawData) return;
    const signature = JSON.stringify(extractPayNowRequestState(rawData));
    if (signature === lastSignature) return;
    lastSignature = signature;
    onUpdate(rawData);
  };

  const schedulePoll = () => {
    if (stopped || pollIndex >= PAYNOW_REQUEST_POLL_DELAYS_MS.length) {
      return;
    }

    const delay = PAYNOW_REQUEST_POLL_DELAYS_MS[pollIndex];
    pollIndex += 1;
    pollTimer = window.setTimeout(async () => {
      const snapshot = await readFirestoreDocumentOnce(docRef);
      if (snapshot?.exists) {
        emit(snapshot.data() || {});
      }
      schedulePoll();
    }, delay);
  };

  const unsubscribe = docRef.onSnapshot((doc) => {
    if (doc.exists) {
      emit(doc.data() || {});
    }
  });

  if (initialData && typeof initialData === "object") {
    emit(initialData);
  }
  schedulePoll();

  return () => {
    stopped = true;
    if (pollTimer) {
      window.clearTimeout(pollTimer);
      pollTimer = null;
    }
    unsubscribe();
  };
};

const maskCellphoneForDisplay = (value) => {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "your cellphone on file";
  const lastFour = digits.slice(-4);
  return `your cellphone ending in ${lastFour}`;
};

const normalizeAdminBookingStatus = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_")
    .replace(/\s+/g, "_");

const shouldIncludeAdminBooking = (data = {}) => {
  const pendingPaymentStates = new Set([
    "pending",
    "queued",
    "ready",
    "processing",
    "payment_pending",
    "payment_required",
    "awaiting_payment",
    "awaitingpayment",
  ]);

  const paymentStatus = normalizeAdminBookingStatus(data.paymentStatus);
  const payNowStatus = normalizeAdminBookingStatus(data.payNowStatus);
  const bookingStatus = normalizeAdminBookingStatus(data.bookingStatus || data.status);
  const cleaningStatus = normalizeAdminBookingStatus(data.cleaningStatus);
  const bookingSyncStatus = normalizeAdminBookingStatus(data.bookingSyncStatus);

  if (pendingPaymentStates.has(paymentStatus) || pendingPaymentStates.has(payNowStatus)) {
    return false;
  }
  if (bookingStatus === "payment_pending" || bookingStatus === "payment_required") {
    return false;
  }
  if (cleaningStatus === "payment_pending") {
    return false;
  }
  if (bookingSyncStatus === "pending" && paymentStatus !== "paid") {
    return false;
  }
  return true;
};

const disableForm = (form, disabled) => {
  if (!form) return;
  form.querySelectorAll("input, select, textarea, button").forEach((el) => {
    el.disabled = disabled;
  });
};

const normalizeLocationText = (value) => String(value || "").trim();

const buildStructuredAddress = (draft) => {
  const streetLine = [draft.houseNumber, draft.route]
    .map((value) => normalizeLocationText(value))
    .filter(Boolean)
    .join(" ");

  const formattedAddress = [
    draft.apartmentNumber,
    streetLine,
    draft.suburb,
    draft.town,
    draft.province,
    draft.postalCode,
    draft.country || "South Africa",
  ]
    .map((value) => normalizeLocationText(value))
    .filter(Boolean)
    .join(", ");

  const location = {};
  const latitude = Number(draft.latitude);
  const longitude = Number(draft.longitude);
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    location.lat = latitude;
    location.lng = longitude;
  }

  return {
    placeId: normalizeLocationText(draft.placeId),
    apartmentNumber: normalizeLocationText(draft.apartmentNumber),
    houseNumber: normalizeLocationText(draft.houseNumber),
    route: normalizeLocationText(draft.route),
    suburb: normalizeLocationText(draft.suburb),
    town: normalizeLocationText(draft.town),
    province: normalizeLocationText(draft.province),
    postalCode: normalizeLocationText(draft.postalCode),
    country: normalizeLocationText(draft.country) || "South Africa",
    formattedAddress,
    ...(Object.keys(location).length ? { location } : {}),
  };
};

const buildStructuredAddressFromRecord = (data, fallbackAddress = "") => {
  const details = buildStructuredAddress({
    placeId: data?.addressPlaceId,
    apartmentNumber: data?.apartmentNumber,
    houseNumber: data?.houseNumber,
    route: data?.route,
    suburb: data?.suburb,
    town: data?.town,
    province: data?.province,
    postalCode: data?.postalCode,
    country: data?.country || "South Africa",
    latitude: data?.location?.lat ?? data?.propertyLocation?.lat,
    longitude: data?.location?.lng ?? data?.propertyLocation?.lng,
  });

  return {
    ...details,
    formattedAddress: details.formattedAddress || normalizeLocationText(fallbackAddress),
  };
};

const isStructuredAddressComplete = (details) =>
  Boolean(
    normalizeLocationText(details.houseNumber) &&
      normalizeLocationText(details.route) &&
      normalizeLocationText(details.town) &&
      normalizeLocationText(details.province)
  );

const createPlacesAddressController = (fieldset) => {
  if (!fieldset) return null;

  const searchInput = fieldset.querySelector("input[name$='address_search']");
  const apartmentInput = fieldset.querySelector("input[name$='apartment_number']");
  const houseInput = fieldset.querySelector("input[name$='house_number']");
  const routeInput = fieldset.querySelector("input[name$='route']");
  const suburbInput = fieldset.querySelector("input[name$='suburb']");
  const townInput = fieldset.querySelector("input[name$='town']");
  const provinceInput = fieldset.querySelector("input[name$='province']");
  const postalCodeInput = fieldset.querySelector("input[name$='postal_code']");
  const addressInput = fieldset.querySelector("input[name$='address']");
  const placeIdInput = fieldset.querySelector("input[name$='place_id']");
  const latitudeInput = fieldset.querySelector("input[name$='lat']");
  const longitudeInput = fieldset.querySelector("input[name$='lng']");
  const suggestionsBox = fieldset.querySelector("[data-place-suggestions]");
  let searchTimer = null;
  let requestIndex = 0;
  let changeHandler = null;

  const renderSuggestions = (suggestions, onSelect) => {
    if (!suggestionsBox) return;
    if (!Array.isArray(suggestions) || !suggestions.length) {
      suggestionsBox.innerHTML = "";
      suggestionsBox.classList.remove("is-visible");
      return;
    }

    suggestionsBox.innerHTML = suggestions
      .map(
        (item, index) => `
          <button class="places-suggestion" type="button" data-place-index="${index}">
            <strong>${escapeHtml(item.primaryText || item.text || "")}</strong>
            <span>${escapeHtml(item.secondaryText || "")}</span>
          </button>
        `
      )
      .join("");
    suggestionsBox.classList.add("is-visible");
    suggestionsBox.querySelectorAll("[data-place-index]").forEach((button) => {
      button.addEventListener("click", () => {
        const index = Number(button.getAttribute("data-place-index"));
        const item = suggestions[index];
        if (item) {
          onSelect(item);
        }
      });
    });
  };

  const collect = () =>
    buildStructuredAddress({
      placeId: placeIdInput?.value,
      apartmentNumber: apartmentInput?.value,
      houseNumber: houseInput?.value,
      route: routeInput?.value,
      suburb: suburbInput?.value,
      town: townInput?.value,
      province: provinceInput?.value,
      postalCode: postalCodeInput?.value,
      country: "South Africa",
      latitude: latitudeInput?.value,
      longitude: longitudeInput?.value,
    });

  const syncAddress = () => {
    const details = collect();
    if (addressInput) {
      addressInput.value = details.formattedAddress;
    }
    if (typeof changeHandler === "function") {
      changeHandler(details);
    }
    return details;
  };

  const apply = (details) => {
    if (searchInput) searchInput.value = details.formattedAddress || "";
    if (apartmentInput) apartmentInput.value = details.apartmentNumber || "";
    if (houseInput) houseInput.value = details.houseNumber || "";
    if (routeInput) routeInput.value = details.route || "";
    if (suburbInput) suburbInput.value = details.suburb || "";
    if (townInput) townInput.value = details.town || "";
    if (provinceInput) provinceInput.value = details.province || "";
    if (postalCodeInput) postalCodeInput.value = details.postalCode || "";
    if (placeIdInput) placeIdInput.value = details.placeId || "";
    if (latitudeInput) latitudeInput.value = details.location?.lat ?? "";
    if (longitudeInput) longitudeInput.value = details.location?.lng ?? "";
    syncAddress();
    renderSuggestions([], () => {});
  };

  [apartmentInput, houseInput, routeInput, suburbInput, townInput, provinceInput, postalCodeInput]
    .filter(Boolean)
    .forEach((input) => {
      input.addEventListener("input", () => {
        if (input === houseInput) {
          houseInput.value = houseInput.value.replace(/\D/g, "").slice(0, 10);
        }
        if (input === routeInput) {
          routeInput.value = normalizeCapitalizedWords(routeInput.value);
        }
        if (input === suburbInput) {
          suburbInput.value = normalizeCapitalizedWords(suburbInput.value);
        }
        if (input === townInput) {
          townInput.value = normalizeCapitalizedWords(townInput.value);
        }
        if (input === provinceInput) {
          provinceInput.value = normalizeCapitalizedWords(provinceInput.value);
        }
        if (input === postalCodeInput) {
          postalCodeInput.value = postalCodeInput.value.replace(/\D/g, "").slice(0, 6);
        }
        syncAddress();
      });
    });

  if (searchInput) {
    searchInput.addEventListener("input", () => {
      const query = normalizeLocationText(searchInput.value);
      if (searchTimer) {
        window.clearTimeout(searchTimer);
      }

      if (query.length < 3 || !functions) {
        renderSuggestions([], () => {});
        return;
      }

      searchTimer = window.setTimeout(async () => {
        const currentRequest = requestIndex + 1;
        requestIndex = currentRequest;
        try {
          const response = await functions.httpsCallable("searchPlacesAutocomplete")({ input: query });
          if (currentRequest !== requestIndex) return;
          const suggestions = Array.isArray(response.data?.suggestions) ? response.data.suggestions : [];
          renderSuggestions(suggestions, async (item) => {
            try {
              const detailsResponse = await functions.httpsCallable("getPlaceAddressDetails")({
                placeId: item.placeId,
              });
              const details = detailsResponse.data?.address || {};
              apply(details);
            } catch (error) {
              console.error("Unable to resolve place details", error);
            }
          });
        } catch (error) {
          console.error("Unable to search places", error);
          renderSuggestions([], () => {});
        }
      }, 320);
    });
  }

  syncAddress();
  return {
    collect,
    syncAddress,
    setOnChange(handler) {
      changeHandler = typeof handler === "function" ? handler : null;
      if (changeHandler) {
        changeHandler(collect());
      }
    },
    isValid() {
      return isStructuredAddressComplete(collect());
    },
  };
};

const registerAddressController = createPlacesAddressController(registerAddressFieldset);
const bookingAddressController = createPlacesAddressController(bookingAddressFieldset);

const downloadBase64File = (base64, fileName, mimeType) => {
  if (!base64 || !fileName) return;
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  const blob = new Blob([bytes], { type: mimeType || "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const setLoadingState = () => {
  if (statusTitle) statusTitle.textContent = "Preparing your dashboard...";
  if (statusMessage) statusMessage.textContent = "A moment while we arrange your next step.";
};

const setupRoleTabs = () => {
  if (!roleTabs.length || !rolePanels.length) return;
  const activate = (target) => {
    roleTabs.forEach((tab) => {
      tab.classList.toggle("is-active", tab.dataset.roleTab === target);
    });
    rolePanels.forEach((panel) => {
      panel.classList.toggle("is-active", panel.dataset.rolePanel === target);
    });
  };
  roleTabs.forEach((tab) => {
    tab.addEventListener("click", () => activate(tab.dataset.roleTab));
  });
  const initial = roleTabs[0]?.dataset.roleTab;
  if (initial) activate(initial);
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

if (activationPage && presentationTierPanel && presentationTierGrid && presentationTierSummary) {
  renderPresentationTierSelector({ assessmentFeeStatus: "unpaid" });
}

const toDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === "function") return value.toDate();
  return null;
};

const formatDate = (date) =>
  date
    ? date.toLocaleDateString("en-ZA", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "Date TBD";

const formatDateTime = (date) =>
  date
    ? date.toLocaleString("en-ZA", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

const buildInitials = (value) =>
  String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}.`)
    .join(" ");

const buildCompactInitials = (value) =>
  String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

const formatAccountHolderName = (data, fallback = "") => {
  const initials = buildCompactInitials(data?.fullName || data?.name || "");
  const surname = String(data?.surname || "").trim();
  const preferred = [initials, surname].filter(Boolean).join(" ").trim();
  if (preferred) return preferred;
  return String(data?.fullName || data?.name || fallback || "").trim();
};

const formatWelcomeName = (data, fallback, defaultLabel = "User") => {
  const title = String(data?.title || "").trim();
  const initials = buildInitials(data?.fullName || data?.name || "");
  const surname = String(data?.surname || "").trim();
  const preferred = [title, initials, surname].filter(Boolean).join(" ").trim();
  if (preferred) return preferred;
  return String(data?.fullName || data?.name || fallback || defaultLabel).trim();
};

const formatStatusLabel = (status) => {
  const raw = String(status || "").trim();
  if (!raw) return "";
  return raw
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const normalizeCapitalizedWords = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/(^|\s)([A-Za-zÀ-ÿ])/g, (match, prefix, letter) => `${prefix}${letter.toUpperCase()}`);

const normalizeSurnameText = (value) => {
  const normalized = String(value || "").toLowerCase().replace(/\s+/g, " ").trimStart();
  if (!normalized) return normalized;
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

const isFirebaseReady =
  typeof window.firebase !== "undefined" &&
  window.firebaseConfig &&
  window.firebaseConfig.apiKey;

if (rolePage) {
  setupRoleTabs();
}

const pageName = window.location.pathname.split("/").pop();

const roleRoutes = {
  admin: "portal-admin.html",
  worker: "portal-worker.html",
  realestate: "portal-realestate.html",
  inspector: "portal-worker.html",
  client: "app.html",
};

const normalizeRole = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[\_\-\s]/g, "");

const resolveRole = (data) => {
  if (!data) return "client";
  if (data.admin === true) return "admin";

  const candidates = [data.role, data.userRole, data.userType, data.accountType];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const normalized = normalizeRole(candidate);
    if (normalized.includes("admin")) return "admin";
    if (normalized.includes("inspector")) return "inspector";
    if (normalized.includes("worker")) return "worker";
    if (normalized.includes("realestate") || normalized.includes("agent")) return "realestate";
    if (normalized.includes("owner") || normalized.includes("contract") || normalized.includes("client")) {
      return "client";
    }
  }
  return "client";
};

const routeForRole = (role) => roleRoutes[role] || "app.html";
const isRolePageForRole = (role) => rolePage && pageName === routeForRole(role);

const redirectTo = (target) => {
  if (pageName !== target) {
    window.location.href = target;
  }
};

const redirectToRole = (role) => {
  redirectTo(routeForRole(role));
};

const stopUserListener = () => {
  if (userListener) userListener();
  userListener = null;
};

const stopPayNowListener = () => {
  if (payNowListener) payNowListener();
  payNowListener = null;
};

const startUserListener = (uid, onUpdate) => {
  stopUserListener();
  userListener = db.collection("users").doc(uid).onSnapshot((doc) => {
    if (!doc.exists) {
      showMessage("We could not load your profile. Please contact support.");
      return;
    }
    const snapshotData = doc.data();
    syncPendingPresentationTierFromSnapshot(snapshotData);
    currentUserData = snapshotData;
    if (onUpdate) onUpdate(currentUserData);
  });
};

if (!isFirebaseReady) {
  if (portalPageActive) {
    showMessage(
      "Portal setup required: add your Firebase web config in firebase-config.js to enable login, registration, bookings, and payments."
    );
  }
  disableForm(loginForm, true);
  disableForm(registerForm, true);
  disableForm(bookingForm, true);
} else {
  if (!firebase.apps.length) {
    firebase.initializeApp(window.firebaseConfig);
  }
  auth = firebase.auth();
  db = firebase.firestore();
  functions = firebase.app().functions("africa-south1");

  if (activationPage || bookingPage) {
    setLoadingState();
  }

  const toIsoDateValue = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const minimumMandateStartDate = () => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return toIsoDateValue(date);
  };

  const normalizedMandateAccountType = (value) => {
    const normalized = String(value || "").trim();
    if (normalized === "1" || normalized === "01") return "01";
    if (normalized === "2" || normalized === "02") return "02";
    if (normalized === "3" || normalized === "03") return "03";
    return "";
  };

  const normalizeInternationalPhone = (value) => {
    const trimmed = String(value || "").trim();
    if (!trimmed) return "";

    let candidate = trimmed.replace(/[^\d+]/g, "");
    if (candidate.startsWith("00")) {
      candidate = `+${candidate.slice(2)}`;
    }

    if (candidate.startsWith("+")) {
      candidate = `+${candidate.slice(1).replace(/\D/g, "")}`;
    } else {
      const digits = candidate.replace(/\D/g, "");
      if (!digits) return "";
      if (digits.startsWith("0") && digits.length === 10) {
        candidate = `+27${digits.slice(1)}`;
      } else if (digits.startsWith("27") && digits.length >= 11) {
        candidate = `+${digits}`;
      } else if (digits.length >= 8 && digits.length <= 15) {
        candidate = `+${digits}`;
      } else {
        return "";
      }
    }

    return /^\+\d{8,15}$/.test(candidate) ? candidate : "";
  };

  const buildDefaultMandateStartDate = () => {
    const today = new Date();
    const target = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    target.setHours(0, 0, 0, 0);
    return toIsoDateValue(target);
  };

  const bookingDayName = (value) => {
    const direct = String(value || "").trim();
    if (direct) return direct;
    const index = Number(currentUserData?.serviceDayIndex);
    const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    return Number.isFinite(index) ? days[((index % days.length) + days.length) % days.length] : "Reserved day to follow";
  };

  const bookingSlotLabel = (value) => {
    const direct = String(value || "").trim();
    if (direct) return direct;
    const index = Number(currentUserData?.serviceSlotIndex);
    const slots = ["06:00", "11:00"];
    return Number.isFinite(index) ? slots[((index % slots.length) + slots.length) % slots.length] : "Reserved time to follow";
  };

  const BOOKING_TIME_SLOT_VALUES = ["07:00", "14:00"];
  const BOOKING_ALLOWED_TIME_RANGES = {
    0: { start: 9 * 60, end: 15 * 60 },
    1: { start: 7 * 60, end: 18 * 60 + 30 },
    2: { start: 7 * 60, end: 18 * 60 + 30 },
    3: { start: 7 * 60, end: 18 * 60 + 30 },
    4: { start: 7 * 60, end: 18 * 60 + 30 },
    5: { start: 7 * 60, end: 18 * 60 },
    6: { start: 9 * 60, end: 15 * 60 },
  };

  const parseBookingDateValue = (value) => {
    const [year, month, day] = String(value || "")
      .split("-")
      .map((part) => Number(part));
    if (!year || !month || !day) return null;
    const date = new Date(year, month - 1, day);
    return Number.isNaN(date.getTime()) ? null : date;
  };

  const parseTimeValueToMinutes = (value) => {
    const [hours, minutes] = String(value || "")
      .split(":")
      .map((part) => Number(part));
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
    return hours * 60 + minutes;
  };

  const formatTimeMinutes = (minutes) => {
    const safeMinutes = Math.max(0, Math.min(Number(minutes || 0), 23 * 60 + 59));
    const hours = String(Math.floor(safeMinutes / 60)).padStart(2, "0");
    const mins = String(safeMinutes % 60).padStart(2, "0");
    return `${hours}:${mins}`;
  };

  const getBookingTimeRangeForDateValue = (value, now = new Date()) => {
    const bookingDate = parseBookingDateValue(value);
    if (!bookingDate) return null;
    const allowedRange = BOOKING_ALLOWED_TIME_RANGES[bookingDate.getDay()];
    if (!allowedRange) return null;

    const dayOpen = new Date(bookingDate);
    dayOpen.setHours(Math.floor(allowedRange.start / 60), allowedRange.start % 60, 0, 0);
    const dayClose = new Date(bookingDate);
    dayClose.setHours(Math.floor(allowedRange.end / 60), allowedRange.end % 60, 0, 0);

    const minimumDateTime = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    minimumDateTime.setSeconds(0, 0);
    const windowStart = new Date(Math.max(dayOpen.getTime(), minimumDateTime.getTime()));
    if (windowStart.getTime() > dayClose.getTime()) {
      return null;
    }

    const minMinutes = windowStart.getHours() * 60 + windowStart.getMinutes();
    const maxMinutes = allowedRange.end;

    return {
      minMinutes,
      maxMinutes,
      minValue: formatTimeMinutes(minMinutes),
      maxValue: formatTimeMinutes(maxMinutes),
    };
  };

  const getFirstBookableDate = (now = new Date()) => {
    const candidate = new Date(now);
    candidate.setHours(0, 0, 0, 0);
    candidate.setDate(candidate.getDate() + 1);

    for (let offset = 0; offset < 45; offset += 1) {
      const nextDate = new Date(candidate);
      nextDate.setDate(candidate.getDate() + offset);
      if (getBookingTimeRangeForDateValue(toIsoDateValue(nextDate), now)) {
        return nextDate;
      }
    }

    return candidate;
  };

  const getAllowedBookingSlotsForDateValue = (value, now = new Date()) => {
    const range = getBookingTimeRangeForDateValue(value, now);
    if (!range) return [];
    return BOOKING_TIME_SLOT_VALUES.filter((slot) => {
      const slotMinutes = parseTimeValueToMinutes(slot);
      return slotMinutes !== null && slotMinutes >= range.minMinutes && slotMinutes <= range.maxMinutes;
    });
  };

  const syncBookingTimeConstraints = () => {
    if (!bookingTimeInput) return null;
    const slots = getAllowedBookingSlotsForDateValue(bookingDateInput?.value || "");
    const previousValue = bookingTimeInput.value;
    bookingTimeInput.innerHTML = "";

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = slots.length ? "Select Time" : "No time available";
    bookingTimeInput.appendChild(placeholder);

    slots.forEach((slot) => {
      const option = document.createElement("option");
      option.value = slot;
      option.textContent = slot;
      bookingTimeInput.appendChild(option);
    });

    bookingTimeInput.disabled = slots.length === 0;
    if (slots.includes(previousValue)) {
      bookingTimeInput.value = previousValue;
    } else {
      bookingTimeInput.value = "";
    }

    return slots;
  };

  const isBookingDateTimeValid = (dateValue, timeValue) => {
    const slots = getAllowedBookingSlotsForDateValue(dateValue);
    return Boolean(timeValue) && slots.includes(timeValue);
  };

  const normalizeBookingCategory = (value) => {
    const normalized = String(value || "")
      .trim()
      .toLowerCase();
    return (
      Object.keys(BOOKING_CATEGORY_SERVICES).find(
        (category) => category.toLowerCase() === normalized
      ) || ""
    );
  };

  const getBookingServicesForCategory = (category) =>
    BOOKING_CATEGORY_SERVICES[normalizeBookingCategory(category)] || [];

  const getSelectedBookingProperty = () =>
    bookingProperties.find((property) => property.id === bookingSelectedPropertyId) || null;

  const bookingSelectionsReady = () =>
    Boolean(getSelectedBookingProperty() && bookingSelectedServices.length && bookingSelectedCategory);

  const stopBookingPropertiesListener = () => {
    if (bookingPropertiesListener) bookingPropertiesListener();
    bookingPropertiesListener = null;
  };

  const resetBookingPricingState = (message = "Select a property and presentation details to view your tailored pricing.") => {
    bookingPricingLines = [];
    bookingPayNowTotalCents = 0;
    bookingHasMonthlyServices = false;
    bookingPricingReady = false;
    bookingPricingMessageText = message;
  };

  const resetBookingDraft = ({ preserveProperty = true } = {}) => {
    if (!preserveProperty) {
      bookingSelectedPropertyId = "";
    }
    bookingSelectedCategory = "";
    bookingSelectedServices = [];
    bookingPricingRequestId += 1;
    resetBookingPricingState();
    if (bookingDateInput) bookingDateInput.value = "";
    if (bookingTimeInput) bookingTimeInput.value = "";
  };

  const parseBookingPropertyDocument = (doc) => {
    const data = doc.data() || {};
    const fallbackAddress = String(data.address || data.homeAddress || "").trim();
    const addressDetails = buildStructuredAddressFromRecord(data, fallbackAddress);
    const address = addressDetails.formattedAddress || fallbackAddress;
    const servicesEnabled = data.servicesEnabled !== false;
    const billingActive = data.billingActive !== false;
    const isSold = data.isSold === true;
    const accountActive = normalizedStatus(currentUserData?.activationStatus) === "active";

    return {
      id: doc.id,
      name: String(data.name || (doc.id === "home" ? "Home Address" : "Property")).trim() || "Property",
      address: address || "Address details to follow",
      addressDetails,
      isSold,
      servicesEnabled,
      billingActive,
      isBookable: accountActive && !isSold && servicesEnabled && billingActive,
    };
  };

  const renderBookingHeroState = () => {
    const selectedProperty = getSelectedBookingProperty();
    if (bookingCurrentPropertyLabel) {
      bookingCurrentPropertyLabel.textContent = selectedProperty?.name || "Choose a property";
    }
    if (bookingCurrentScopeLabel) {
      bookingCurrentScopeLabel.textContent = bookingSelectedServices.length
        ? `${bookingSelectedCategory || "Presentation"} • ${bookingSelectedServices.length} details selected`
        : "Presentation details to follow";
    }
    if (bookingOpenSheetButton) {
      bookingOpenSheetButton.disabled = !bookingSelectionsReady();
    }
    if (bookingServiceDayLabel) {
      bookingServiceDayLabel.textContent = bookingDayName(currentUserData?.serviceDayOfWeek);
    }
    if (bookingServiceTimeLabel) {
      bookingServiceTimeLabel.textContent = bookingSlotLabel(currentUserData?.serviceSlot);
    }
    if (bookingSelectionNote) {
      bookingSelectionNote.textContent =
        selectedProperty && bookingSelectedServices.length
          ? `${bookingSelectedCategory || "Presentation"} • ${bookingSelectedServices.length} details selected`
          : "Select a property and your presentation details to continue.";
    }
  };

  const renderBookingProperties = () => {
    if (!bookingPropertyGrid) return;

    const sorted = bookingProperties
      .slice()
      .sort((left, right) => {
        if (left.id === "home" && right.id !== "home") return -1;
        if (right.id === "home" && left.id !== "home") return 1;
        if (left.isBookable !== right.isBookable) return left.isBookable ? -1 : 1;
        return left.name.localeCompare(right.name);
      });

    bookingPropertyGrid.innerHTML = "";

    if (bookingPropertyEmpty) {
      bookingPropertyEmpty.classList.toggle("is-hidden", sorted.length > 0);
      bookingPropertyEmpty.textContent = sorted.length
        ? ""
        : "Your saved properties will appear here once they are available in your profile.";
    }

    sorted.forEach((property) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "booking-property-card";
      if (property.id === bookingSelectedPropertyId) {
        button.classList.add("is-selected");
      }
      if (!property.isBookable) {
        button.classList.add("is-disabled");
        button.disabled = true;
      }

      let statusLabel = "Available";
      if (property.isSold) {
        statusLabel = "Concluded";
      } else if (normalizedStatus(currentUserData?.activationStatus) !== "active") {
        statusLabel = "After activation";
      } else if (!property.servicesEnabled || !property.billingActive) {
        statusLabel = "Temporarily unavailable";
      }

      button.innerHTML = `
        <div class="booking-property-card-head">
          <strong>${escapeHtml(property.name)}</strong>
          <span class="booking-property-status">${escapeHtml(statusLabel)}</span>
        </div>
        <p>${escapeHtml(property.address)}</p>
      `;

      button.addEventListener("click", () => {
        bookingSelectedPropertyId = property.id;
        renderBookingProperties();
        renderBookingHeroState();
        renderBookingSummary();
        refreshBookingPricing();
      });

      bookingPropertyGrid.appendChild(button);
    });
  };

  const renderBookingCategories = () => {
    bookingCategoryCards.forEach((card) => {
      const category = normalizeBookingCategory(card.dataset.category);
      const isSelected = category === bookingSelectedCategory;
      card.classList.toggle("is-selected", isSelected);
      card.setAttribute("aria-pressed", String(isSelected));
      const count = card.querySelector(".booking-category-copy span");
      if (count) {
        count.textContent = `${getBookingServicesForCategory(category).length} options`;
      }
    });
  };

  const renderBookingServices = () => {
    if (!bookingServicesPanel || !bookingServiceGrid) return;

    const services = getBookingServicesForCategory(bookingSelectedCategory);
    bookingServicesPanel.classList.toggle("is-hidden", services.length === 0);
    if (!services.length) {
      bookingServiceGrid.innerHTML = "";
      return;
    }

    if (bookingServicesTitle) {
      bookingServicesTitle.textContent = `${bookingSelectedCategory} presentation details`;
    }

    bookingServiceGrid.innerHTML = "";
    services.forEach((service) => {
      const selected = bookingSelectedServices.includes(service);
      const serviceLabel = displayServiceName(service);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "booking-service-card";
      if (selected) {
        button.classList.add("is-selected");
      }
      button.innerHTML = `
        <span class="booking-service-icon">${selected ? "✓" : "+"}</span>
        <strong>${escapeHtml(serviceLabel)}</strong>
      `;
      button.addEventListener("click", () => {
        if (bookingSelectedServices.includes(service)) {
          bookingSelectedServices = bookingSelectedServices.filter((item) => item !== service);
        } else {
          bookingSelectedServices = [...bookingSelectedServices, service];
        }
        renderBookingHeroState();
        renderBookingServices();
        renderBookingSummary();
        refreshBookingPricing();
      });
      bookingServiceGrid.appendChild(button);
    });
  };

  const formatBookingSummaryDate = (value) => {
    if (!value) return "Pending selection";
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime())
      ? "Pending selection"
      : date.toLocaleDateString("en-ZA", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        });
  };

  const formatBookingSummaryTime = (value) => {
    if (!value) return "Pending selection";
    const date = new Date(`1970-01-01T${value}`);
    return Number.isNaN(date.getTime())
      ? "Pending selection"
      : date.toLocaleTimeString("en-ZA", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        });
  };

  const renderBookingSummary = () => {
    const selectedProperty = getSelectedBookingProperty();
    const selectedDateValue = bookingDateInput?.value || "";
    const selectedTimeValue = bookingTimeInput?.value || "";

    if (bookingSummaryDate) {
      bookingSummaryDate.textContent = formatBookingSummaryDate(selectedDateValue);
    }
    if (bookingSummaryTime) {
      bookingSummaryTime.textContent = formatBookingSummaryTime(selectedTimeValue);
    }
    if (bookingSummaryCategory) {
      bookingSummaryCategory.textContent =
        bookingSelectedCategory || "Select a property type";
    }
    if (bookingSummaryProperty) {
      bookingSummaryProperty.textContent =
        selectedProperty?.name || "Choose a property";
    }
    if (bookingSummaryPropertyPill) {
      bookingSummaryPropertyPill.textContent =
        selectedProperty?.name || "Property selection";
    }
    if (bookingSummaryServicesCount) {
      bookingSummaryServicesCount.textContent = bookingSelectedServices.length
        ? `${bookingSelectedServices.length} details selected`
        : "Choose presentation details";
    }
    if (bookingSummaryServices) {
      bookingSummaryServices.innerHTML = bookingSelectedServices.length
        ? bookingSelectedServices
            .map((service) => `<span>${escapeHtml(displayServiceName(service))}</span>`)
            .join("")
        : "";
    }
    if (bookingPricingRows) {
      bookingPricingRows.innerHTML = "";
      if (bookingPricingReady) {
        bookingPricingLines.forEach((line) => {
          const row = document.createElement("div");
          row.className = "booking-summary-row";
          row.innerHTML = `<span>${escapeHtml(displayServiceName(line.name))}</span><strong>${escapeHtml(
            formatCurrency(line.amountCents)
          )}</strong>`;
          bookingPricingRows.appendChild(row);
        });
        if (bookingPayNowTotalCents > 0) {
          const totalRow = document.createElement("div");
          totalRow.className = "booking-summary-row booking-summary-row--total";
          totalRow.innerHTML = `<span>Total Payable</span><strong>${escapeHtml(
            formatCurrency(bookingPayNowTotalCents)
          )}</strong>`;
          bookingPricingRows.appendChild(totalRow);
        }
      }
    }
    if (bookingPricingBlock) {
      const shouldShowPricingBlock =
        bookingPricingReady &&
        (bookingPricingLines.length > 0 || bookingPayNowTotalCents > 0 || bookingHasMonthlyServices);
      bookingPricingBlock.classList.toggle("is-hidden", !shouldShowPricingBlock);
    }
    if (bookingPricingNote) {
      bookingPricingNote.textContent = bookingHasMonthlyServices
        ? "Monthly services will be billed separately after approval."
        : "";
      bookingPricingNote.classList.toggle("is-hidden", !bookingHasMonthlyServices);
    }
    if (bookingPricingMessage) {
      bookingPricingMessage.textContent = bookingPricingReady ? "" : bookingPricingMessageText;
      bookingPricingMessage.classList.toggle(
        "is-hidden",
        bookingPricingReady || !bookingPricingMessageText
      );
    }
  };

  const refreshBookingPricing = async () => {
    if (!db || !currentUser) {
      resetBookingPricingState("Sign in to see pricing.");
      renderBookingSummary();
      return;
    }

    const selectedProperty = getSelectedBookingProperty();
    if (!selectedProperty) {
      resetBookingPricingState("Select a property to view your tailored pricing.");
      renderBookingSummary();
      return;
    }

    if (!bookingSelectedServices.length) {
      resetBookingPricingState("Select your presentation details to view your tailored pricing.");
      renderBookingSummary();
      return;
    }

    const requestId = bookingPricingRequestId + 1;
    bookingPricingRequestId = requestId;
    bookingPricingReady = false;
    bookingPricingMessageText = "Preparing your tailored pricing...";
    bookingPricingLines = [];
    bookingPayNowTotalCents = 0;
    bookingHasMonthlyServices = false;
    renderBookingSummary();

    try {
      const [overridesSnap, catalogSnap] = await Promise.all([
        db
          .collection("users")
          .doc(currentUser.uid)
          .collection("properties")
          .doc(selectedProperty.id)
          .collection("serviceOverrides")
          .get(),
        db.collection("services").get(),
      ]);

      if (requestId !== bookingPricingRequestId) return;

      const catalogById = new Map();
      const catalogByName = new Map();
      catalogSnap.docs.forEach((doc) => {
        const data = doc.data() || {};
        const docId = String(doc.id || "")
          .trim();
        const name = String(data.name || doc.id || "")
          .trim();
        const cents = Number(data.priceCents || data.basePriceCents || 0);
        const timing = String(data.paymentTiming || data.billingTiming || "pay_now")
          .trim()
          .toLowerCase();
        if (docId) {
          catalogById.set(normalizeServiceLookupKey(docId), { id: docId, name, cents, timing });
        }
        if (name) {
          catalogByName.set(normalizeServiceLookupKey(name), { id: docId || name, cents, timing });
        }
      });

      const overrides = new Map();
      overridesSnap.docs.forEach((doc) => {
        const data = doc.data() || {};
        overrides.set(normalizeServiceLookupKey(doc.id || ""), {
          enabled: data.isEnabled !== false,
          cents:
            data.overridePriceCents === undefined || data.overridePriceCents === null
              ? null
              : Number(data.overridePriceCents || 0),
          timing:
            data.paymentTiming === undefined || data.paymentTiming === null
              ? null
              : String(data.paymentTiming).trim().toLowerCase(),
        });
      });

      const lines = [];
      let total = 0;
      let monthly = false;

      bookingSelectedServices.forEach((service) => {
        const normalizedService = normalizeServiceLookupKey(service);
        if (!normalizedService) return;

        const catalogEntry = catalogByName.get(normalizedService) || catalogById.get(normalizedService);
        const overrideKey = overrides.has(normalizedService)
          ? normalizedService
          : catalogEntry?.id || "";
        const override = overrideKey ? overrides.get(overrideKey) : null;
        const catalogTiming = catalogEntry?.timing || "pay_now";
        const catalogCents = Number(catalogEntry?.cents || 0);

        if (override) {
          if (!override.enabled) return;
          const timing = override.timing || catalogTiming;
          if (timing === "monthly") {
            monthly = true;
            return;
          }
          const cents = override.cents ?? catalogCents;
          if (cents > 0) {
            total += cents;
            lines.push({ name: service, amountCents: cents, paymentTiming: timing });
          }
          return;
        }

        if (catalogEntry) {
          if (catalogTiming === "monthly") {
            monthly = true;
            return;
          }
          if (catalogCents > 0) {
            total += catalogCents;
            lines.push({ name: service, amountCents: catalogCents, paymentTiming: catalogTiming });
          }
        }
      });

      bookingPricingLines = lines;
      bookingPayNowTotalCents = total;
      bookingHasMonthlyServices = monthly;
      bookingPricingReady = true;
      bookingPricingMessageText =
        lines.length || monthly ? "" : "Pricing will appear once admin sets service prices.";
    } catch (error) {
      bookingPricingReady = false;
      bookingPricingMessageText = "Pricing will appear once admin sets service prices.";
    }

    renderBookingSummary();
  };

  const setBookingSheetOpen = (open) => {
    if (!bookingSheet) return;
    bookingSheet.classList.toggle("is-hidden", !open);
    bookingSheet.setAttribute("aria-hidden", open ? "false" : "true");
    document.body.classList.toggle("booking-sheet-open", open);
    if (open) {
      closeBookingNotice();
    }
    if (bookingPaymentTermsCheckbox) {
      bookingPaymentTermsCheckbox.checked = false;
    }
    syncPaymentConsentState();
    if (open) {
      bookingSheet.scrollTop = 0;
      if (bookingSheetPanel) {
        bookingSheetPanel.scrollTop = 0;
        window.requestAnimationFrame(() => {
          bookingSheetPanel.focus({ preventScroll: true });
        });
      }
    }
  };

  const setBookingMinimumDate = () => {
    if (!bookingDateInput) return;
    const minimumDate = getFirstBookableDate();
    bookingDateInput.min = toIsoDateValue(minimumDate);
    if (bookingDateInput.value && bookingDateInput.value < bookingDateInput.min) {
      bookingDateInput.value = bookingDateInput.min;
    }
    syncBookingTimeConstraints();
  };

  const startBookingPropertiesListener = (uid) => {
    if (!db || !uid) return;
    stopBookingPropertiesListener();
    bookingPropertiesListener = db
      .collection("users")
      .doc(uid)
      .collection("properties")
      .onSnapshot(
        (snapshot) => {
          bookingProperties = snapshot.docs.map(parseBookingPropertyDocument);
          if (
            bookingSelectedPropertyId &&
            !bookingProperties.some((property) => property.id === bookingSelectedPropertyId)
          ) {
            bookingSelectedPropertyId = "";
          }
          renderBookingProperties();
          renderBookingHeroState();
          renderBookingSummary();
          refreshBookingPricing();
        },
        () => {
          bookingProperties = [];
          renderBookingProperties();
          renderBookingHeroState();
          resetBookingPricingState("We couldn't load your properties.");
          renderBookingSummary();
        }
      );
  };

  const setMandateFieldIfEmpty = (selector, value) => {
    if (!mandateForm || value === undefined || value === null || value === "") return;
    const field = mandateForm.querySelector(selector);
    if (field && !field.value) {
      field.value = value;
    }
  };

  const setMandateFormVisible = (visible) => {
    if (!mandateForm) return;
    mandateForm.classList.toggle("is-hidden", !visible);
  };

  const syncCustomMandateBankFields = () => {
    if (!mandateForm) return;
    const bankSelect = mandateForm.querySelector("select[name='debtor_bank_id']");
    const customBankIdField = mandateForm.querySelector("input[name='custom_bank_id']");
    const customBankNameField = mandateForm.querySelector("input[name='custom_bank_name']");
    const isCustomBank = bankSelect?.value === CUSTOM_MANDATE_BANK_ID;

    customBankFields?.classList.toggle("is-hidden", !isCustomBank);
    customBankNote?.classList.toggle("is-hidden", !isCustomBank);

    if (customBankIdField) {
      customBankIdField.required = Boolean(isCustomBank);
    }
    if (customBankNameField) {
      customBankNameField.required = Boolean(isCustomBank);
    }
  };

  const syncMandateScheduleFields = () => {
    if (!mandateForm) return;
    const startDateField = mandateForm.querySelector("input[name='start_date']");
    const collectionDayField = mandateForm.querySelector("input[name='collection_day']");
    const fixedStartDate = buildDefaultMandateStartDate();

    if (collectionDayField) {
      collectionDayField.value = "1";
      collectionDayField.min = "1";
      collectionDayField.max = "1";
      collectionDayField.readOnly = true;
      collectionDayField.setAttribute("aria-readonly", "true");
    }

    if (startDateField) {
      startDateField.value = fixedStartDate;
      startDateField.min = fixedStartDate;
      startDateField.max = fixedStartDate;
      startDateField.readOnly = true;
      startDateField.setAttribute("aria-readonly", "true");
    }
  };

  const prefillMandateForm = (data) => {
    if (!mandateForm || !data) return;
    const reference = String(data.mandateReference || data.clientCode || currentUser?.uid || "").trim();
    const amountCents = Number(data.priceOfferedAmount || data.mandateAmountCents || 0);
    const bankSelect = mandateForm.querySelector("select[name='debtor_bank_id']");
    const customBankIdField = mandateForm.querySelector("input[name='custom_bank_id']");
    const customBankNameField = mandateForm.querySelector("input[name='custom_bank_name']");
    const storedBankId = String(data.mandateDebtorBankId || "").trim();
    const storedBankName = String(data.mandateDebtorBankName || "").trim();
    const hasPresetBank = Boolean(
      bankSelect && storedBankId && Array.from(bankSelect.options).some((option) => option.value === storedBankId)
    );
    if (mandateAmountLabel) {
      mandateAmountLabel.textContent = formatCurrency(amountCents);
    }
    if (mandateReferenceLabel) {
      mandateReferenceLabel.textContent = reference || "Pending";
    }

    setMandateFieldIfEmpty("input[name='debtor_name']", formatAccountHolderName(data, data.fullName || ""));
    setMandateFieldIfEmpty(
      "select[name='debtor_bank_id']",
      storedBankId ? (hasPresetBank ? storedBankId : CUSTOM_MANDATE_BANK_ID) : ""
    );
    if (customBankIdField && !hasPresetBank && !customBankIdField.value) {
      customBankIdField.value = storedBankId;
    }
    if (customBankNameField && !hasPresetBank && !customBankNameField.value) {
      customBankNameField.value = storedBankName;
    }
    setMandateFieldIfEmpty("input[name='debtor_branch_number']", data.mandateBranchNumber || "");
    setMandateFieldIfEmpty("select[name='debtor_account_type']", normalizedMandateAccountType(data.mandateAccountType) || "01");
    setMandateFieldIfEmpty("select[name='debtor_id_type']", data.mandateIdType || "2");
    setMandateFieldIfEmpty("input[name='debtor_id']", data.IdNumber || "");
    setMandateFieldIfEmpty(
      "input[name='tracking_days']",
      "10"
    );
    syncMandateScheduleFields();
    syncCustomMandateBankFields();
  };

  const updateAccountSettingsSummary = (data) => {
    if (settingsCurrentEmail) {
      settingsCurrentEmail.textContent = String(data?.email || currentUser?.email || "").trim() || "No email on file";
    }
    if (settingsOtpDestination) {
      settingsOtpDestination.textContent = maskCellphoneForDisplay(
        data?.cellphone || currentUser?.phoneNumber || ""
      );
    }
  };

  const setSettingsOtpBusy = (isBusy) => {
    if (!settingsOtpPanel) return;
    disableForm(settingsOtpPanel, isBusy);
  };

  const closeSettingsOtpPanel = () => {
    if (!settingsOtpPanel) return;
    settingsOtpPanel.classList.add("is-hidden");
    setSettingsOtpBusy(false);
    setFeedback(settingsOtpFeedback, "");
    if (settingsOtpInput) {
      settingsOtpInput.value = "";
    }
  };

  const openSettingsOtpPanel = (title, message) => {
    if (!settingsOtpPanel) return;
    if (settingsOtpTitle) settingsOtpTitle.textContent = title;
    if (settingsOtpMessage) settingsOtpMessage.textContent = message;
    setFeedback(settingsOtpFeedback, "");
    settingsOtpPanel.classList.remove("is-hidden");
    if (settingsOtpInput) {
      settingsOtpInput.value = "";
      settingsOtpInput.focus();
    }
  };

  const normalizedStatus = (value) =>
    String(value || "")
      .trim()
      .toLowerCase();

  const mandateFlowStatus = (value) => {
    const normalized = normalizedStatus(value);
    if (["approved", "active", "accepted", "signed", "future"].includes(normalized)) return "approved";
    if (["pending", "requested", "queued", "submitted", "exported", "pending_signature", "pending_authorisation", "pending_authorization", "processing"].includes(normalized)) {
      return "pending";
    }
    if (["retry_required", "submission_failed", "rejected", "declined", "cancelled", "expired", "inactive", "suspended"].includes(normalized)) {
      return "retry_required";
    }
    if (normalized === "failed") return "failed";
    if (normalized === "not_started") return "not_started";
    return "not_started";
  };

  const hasVerifiedMandateApproval = (data) => {
    const statusCode = String(data?.mandateStatusCode || data?.statusCode || "").trim();
    if (statusCode === "900000" || statusCode === "910000") return true;
    if (data?.mandateAcceptedAt) return true;
    return Boolean(
      String(
        data?.mandateUrl ||
        data?.mandatePdfLink ||
        data?.mandateProviderReference ||
        data?.providerReference ||
        ""
      ).trim()
    );
  };

  const resolvedMandateFlowStatus = (value, data) => {
    const status = mandateFlowStatus(value);
    if (status === "approved" && !hasVerifiedMandateApproval(data)) {
      return "retry_required";
    }
    return status;
  };

  const readableStepStatus = (value) => {
    const normalized = normalizedStatus(value);
    const labels = {
      active: "Active",
      approved: "Confirmed",
      awaiting_start_date: "Scheduled",
      cancelled: "Closed",
      completed: "Completed",
      failed: "Requires attention",
      fallback_payment_pending: "Payment requested",
      not_required: "Not required",
      not_started: "Awaiting",
      onboarding: "In preparation",
      paid: "Paid",
      paused: "Paused",
      payment_failed: "Payment required",
      pending: "In progress",
      ready: "Ready",
      retry_required: "Requires attention",
      unpaid: "Awaiting payment",
    };
    if (labels[normalized]) return labels[normalized];
    const fallback = normalized.replace(/_/g, " ");
    return fallback ? fallback.replace(/\b\w/g, (match) => match.toUpperCase()) : "In preparation";
  };

  const updateStep = (key, value) => {
    stepElements.forEach((el) => {
      if (el.dataset.step === key) {
        el.textContent = value;
      }
    });
  };

  updateDashboard = (data) => {
    if (!data) return;

    if (userNameLabel) {
      userNameLabel.textContent = formatWelcomeName(data, currentUser?.email, "Client");
    }
    updateAccountSettingsSummary(data);

    const assessmentFeeStatus =
      normalizedStatus(data.assessmentFeeStatus) || (data.adminFeePaid === true ? "paid" : "unpaid");
    const inspectionStatus =
      normalizedStatus(data.inspectionStatus) === "completed" ? "completed" : "pending";
    const priceOfferedAmount = Number(data.priceOfferedAmount || data.mandateAmountCents || 0);
    const priceOfferStatus =
      normalizedStatus(data.priceOfferStatus) === "ready" && priceOfferedAmount > 0
        ? "ready"
        : inspectionStatus === "completed" && priceOfferedAmount > 0
          ? "ready"
          : "not_ready";
    const mandateStatus = resolvedMandateFlowStatus(data.mandateStatus, data);
    const payNowStatus = normalizedStatus(data.payNowStatus || (Number(data.payNowAmount || 0) > 0 ? "pending" : "not_required")) || "pending";
    const activationStatus = normalizedStatus(data.activationStatus || (data.servicesEnabled === true ? "active" : "onboarding")) || "onboarding";
    const fallbackPaymentStatus = normalizedStatus(data.fallbackPaymentStatus || "");
    const outstandingBalance = Number(data.outstandingAmount || data.outstandingBalanceCents || 0);
    const hasOutstanding = outstandingBalance > 0;
    const effectiveData = resolveEffectivePresentationTierData(data);
    const resolvedTier = resolveEffectivePresentationTierConfig(effectiveData);
    const selectedTier = resolvedTier || defaultPresentationTier();
    const mandateReason = String(data.mandateReason || "").trim();
    const mandateUrl = String(data.mandateUrl || "").trim();
    const assessmentFeePaymentUrl = String(data.assessmentFeePaymentUrl || "").trim();
    const payNowPaymentUrl = String(data.payNowPaymentUrl || "").trim();
    const fallbackPaymentUrl = String(data.fallbackPaymentUrl || "").trim();

    const mandateApproved = mandateStatus === "approved";
    const mandatePending = mandateStatus === "pending";
    const mandateRetryRequired = mandateStatus === "retry_required" || mandateStatus === "failed";
    const hasPriceOffer = priceOfferStatus === "ready";
    const payNowRequired = payNowStatus !== "not_required";
    const currentPaymentType =
      assessmentFeeStatus !== "paid"
        ? "assessment_fee"
        : ["payment_failed", "fallback_payment_pending", "paused"].includes(activationStatus) || (fallbackPaymentStatus === "pending" && hasOutstanding)
          ? "fallback"
          : mandateApproved && payNowRequired && payNowStatus !== "paid"
            ? "pay_now"
            : "";
    const currentPaymentUrl =
      currentPaymentType === "assessment_fee"
        ? assessmentFeePaymentUrl
        : currentPaymentType === "fallback"
          ? fallbackPaymentUrl
          : payNowPaymentUrl;
    const paymentButtonLabel =
      currentPaymentType === "assessment_fee"
        ? "Continue with secure payment"
        : currentPaymentType === "fallback"
          ? "Settle outstanding balance"
          : currentPaymentType === "pay_now"
            ? "Settle initial amount"
            : "Continue with secure payment";

    let title = "Your service profile is ready";
    let message = "Your account is active and ready for bookings.";

    if (assessmentFeeStatus !== "paid") {
      title = "Assessment fee";
      message = `Kindly settle the once-off assessment fee of ${formatCurrency(
        Number(effectiveData.adminFeeCents || selectedTier?.assessmentFeeCents || 29999)
      )} to begin your Curator presentation journey.`;
    } else if (inspectionStatus !== "completed") {
      title = "Inspection in preparation";
      message = "Your inspection is being arranged. We will let you know as soon as it has been completed.";
    } else if (priceOfferStatus !== "ready") {
      title = "Tailored pricing in preparation";
      message = "Your tailored monthly fee will appear here once your inspection review is complete.";
    } else if (mandateRetryRequired) {
      title = "Mandate requires attention";
      message =
        mandateReason || "Your mandate needs a final review. Please check your details and continue once more.";
    } else if (mandatePending) {
      title = "Mandate in progress";
      message =
        mandateReason ||
        (mandateUrl
          ? "Your mandate invitation is ready. Continue to complete the approval."
          : "Your mandate is being prepared for approval.");
    } else if (!mandateApproved) {
      title = "Mandate invitation";
      message = `Your inspection is complete. Your tailored monthly fee is ${formatCurrency(priceOfferedAmount)}. Please complete your mandate to continue.`;
    } else if (payNowRequired && payNowStatus === "failed") {
      title = "Initial payment outstanding";
      message = `Your initial amount of ${formatCurrency(Number(data.payNowAmount || 0))} is still outstanding before activation can be completed.`;
    } else if (payNowRequired && payNowStatus !== "paid") {
      title = "Initial payment";
      message = `Settle ${formatCurrency(Number(data.payNowAmount || 0))} to complete your onboarding.`;
    } else if (activationStatus === "awaiting_start_date") {
      title = "Scheduled start";
      message = data.serviceStartDate
        ? `Everything is in place. Your services begin on ${data.serviceStartDate}.`
        : "Everything is in place. Your services begin on the first day of next month.";
    } else if (activationStatus === "payment_failed" || activationStatus === "fallback_payment_pending") {
      title = "Outstanding balance";
      message = hasOutstanding
        ? `A recent monthly debit was not completed. Please settle ${formatCurrency(outstandingBalance)} to restore services.`
        : "A recent monthly debit was not completed. Request a secure payment link to restore services.";
    } else if (activationStatus === "paused") {
      title = "Service on hold";
      message = hasOutstanding
        ? `Your account is on hold until the outstanding balance of ${formatCurrency(outstandingBalance)} is settled.`
        : "Your account is on hold until payment is resolved.";
    }

    if (statusTitle) statusTitle.textContent = title;
    if (statusMessage) statusMessage.textContent = message;
    renderPresentationTierSelector(effectiveData);

    if (outstandingBadge) {
      if (hasOutstanding) {
        outstandingBadge.textContent = `Amount due: ${formatCurrency(outstandingBalance)}`;
        outstandingBadge.classList.add("is-visible");
      } else {
        outstandingBadge.textContent = "";
        outstandingBadge.classList.remove("is-visible");
      }
    }

    updateStep("assessmentFee", assessmentFeeStatus === "paid" ? "Paid" : "Unpaid");
    updateStep("inspection", inspectionStatus === "completed" ? "Completed" : "Pending");
    updateStep("priceOffer", priceOfferStatus === "ready" ? `Ready • ${formatCurrency(priceOfferedAmount)}` : "Not Ready");
    updateStep("mandate", readableStepStatus(mandateStatus));
    updateStep("payNow", readableStepStatus(payNowStatus));
    updateStep("activation", readableStepStatus(activationStatus));
    updateStep("tier", String(effectiveData.presentationTierName || resolvedTier?.name || "").trim() || "Pending");
    portalCurrentPaymentType = currentPaymentType;
    portalCurrentPaymentUrl = currentPaymentUrl;

    if (payNowButton) {
      payNowButton.textContent = paymentButtonLabel;
      payNowButton.classList.remove("is-hidden");
    }

    if (openPayNowButton) {
      if (currentPaymentUrl && !usesPrimaryPortalPaymentButton()) {
        continueInCurrentWindow(currentPaymentUrl, {
          button: openPayNowButton,
          consentCheckbox: paymentTermsCheckbox,
          onConsentMissing: () => {
            setFeedback(paymentFeedback, PAYMENT_TERMS_REQUIRED_MESSAGE, true);
          },
        });
      } else {
        openPayNowButton.classList.add("is-hidden");
        openPayNowButton.onclick = null;
      }
    }
    syncPaymentConsentState();

    if (openMandateButton) {
      if (mandateUrl) {
        openMandateButton.classList.remove("is-hidden");
        openMandateButton.onclick = () => window.open(mandateUrl, "_blank");
      } else {
        openMandateButton.classList.add("is-hidden");
      }
    }

    if (mandateButton) {
      if (hasPriceOffer && !mandateApproved && !mandatePending) {
        mandateButton.classList.remove("is-hidden");
        prefillMandateForm(data);
      } else {
        mandateButton.classList.add("is-hidden");
        setMandateFormVisible(false);
      }
    }

    const canProceed = activationStatus === "active";

    if (bookingPage) {
      renderBookingHeroState();
      renderBookingSummary();
      if (canProceed && currentUser?.uid) {
        startBookingPropertiesListener(currentUser.uid);
      } else {
        stopBookingPropertiesListener();
        setBookingSheetOpen(false);
      }
    }

    if (activationPage && canProceed && !hasRedirectedToBooking) {
      hasRedirectedToBooking = true;
      showMessage("Activation complete. Redirecting to booking request...", false, {
        quietSuccess: true,
        noWrap: true,
      });
      setTimeout(() => {
        window.location.href = "portal-booking.html";
      }, 1600);
    }

    if (bookingForm) {
      disableForm(bookingForm, !canProceed);
      if (bookingPage && !canProceed && !hasRedirectedToBooking) {
        showMessage("Complete onboarding and activation before submitting a booking request.");
        setTimeout(() => {
          window.location.href = "app.html";
        }, 1600);
      }
    }
  };

  const SA_ID_ERROR_MESSAGE = "Enter a valid 13-digit South African ID number";
  const PASSPORT_ERROR_MESSAGE = "Enter a valid passport number";
  const MISSING_DOCUMENT_TYPE_MESSAGE = "Select ID or Passport to continue";

  const normalizePassportNumber = (value) =>
    String(value || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "");

  const parseSouthAfricanIdBirthDate = (id) => {
    const normalized = String(id || "").trim();
    if (!/^\d{13}$/.test(normalized)) return null;
    const yy = Number.parseInt(normalized.slice(0, 2), 10);
    const mm = Number.parseInt(normalized.slice(2, 4), 10);
    const dd = Number.parseInt(normalized.slice(4, 6), 10);
    if (!Number.isFinite(yy) || !Number.isFinite(mm) || !Number.isFinite(dd)) {
      return null;
    }
    const currentYear = new Date().getFullYear() % 100;
    const fullYear = yy <= currentYear ? 2000 + yy : 1900 + yy;
    const date = new Date(fullYear, mm - 1, dd);
    if (
      Number.isNaN(date.getTime()) ||
      date.getFullYear() !== fullYear ||
      date.getMonth() !== mm - 1 ||
      date.getDate() !== dd
    ) {
      return null;
    }
    return date;
  };

  const isValidSouthAfricanIdChecksum = (id) => {
    const normalized = String(id || "").trim();
    if (!/^\d{13}$/.test(normalized)) return false;
    let oddSum = 0;
    for (let index = 0; index < 12; index += 2) {
      oddSum += Number.parseInt(normalized[index], 10);
    }
    let evenDigits = "";
    for (let index = 1; index < 12; index += 2) {
      evenDigits += normalized[index];
    }
    const doubled = String(Number.parseInt(evenDigits, 10) * 2);
    const evenSum = doubled.split("").reduce((sum, digit) => sum + Number.parseInt(digit, 10), 0);
    const checksum = (10 - ((oddSum + evenSum) % 10)) % 10;
    return checksum === Number.parseInt(normalized[12], 10);
  };

  const validateSouthAfricanID = (id) => {
    const normalizedValue = String(id || "").trim();
    if (!/^\d{13}$/.test(normalizedValue)) {
      return {
        isValid: false,
        normalizedValue,
        dateOfBirth: null,
        citizenshipDigit: null,
        errorMessage: SA_ID_ERROR_MESSAGE,
      };
    }
    const dateOfBirth = parseSouthAfricanIdBirthDate(normalizedValue);
    if (!dateOfBirth) {
      return {
        isValid: false,
        normalizedValue,
        dateOfBirth: null,
        citizenshipDigit: null,
        errorMessage: SA_ID_ERROR_MESSAGE,
      };
    }
    const citizenshipDigit = Number.parseInt(normalizedValue[10], 10);
    if (![0, 1].includes(citizenshipDigit) || !isValidSouthAfricanIdChecksum(normalizedValue)) {
      return {
        isValid: false,
        normalizedValue,
        dateOfBirth: null,
        citizenshipDigit: null,
        errorMessage: SA_ID_ERROR_MESSAGE,
      };
    }
    return {
      isValid: true,
      normalizedValue,
      dateOfBirth,
      citizenshipDigit,
      errorMessage: "",
    };
  };

  const validatePassportNumber = (passport) => {
    const normalizedValue = normalizePassportNumber(passport);
    if (normalizedValue.length < 6 || normalizedValue.length > 20 || !/^[A-Z0-9]+$/.test(normalizedValue)) {
      return {
        isValid: false,
        normalizedValue,
        errorMessage: PASSPORT_ERROR_MESSAGE,
      };
    }
    return {
      isValid: true,
      normalizedValue,
      errorMessage: "",
    };
  };

  const formatIdentityDate = (date) => {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
    return date.toLocaleDateString("en-ZA", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const getRegisterIdentityState = () => {
    const documentType = String(registerDocumentTypeField?.value || "").trim();
    const documentNumber = String(registerDocumentNumberField?.value || "").trim();
    const documentCountry = String(registerDocumentCountryField?.value || "").trim();

    if (!documentType) {
      return {
        documentType: "",
        documentNumber,
        documentCountry,
        isValid: false,
        status: "empty",
        message: MISSING_DOCUMENT_TYPE_MESSAGE,
        dateOfBirth: "",
      };
    }

    if (documentType === "sa_id") {
      const result = validateSouthAfricanID(documentNumber);
      return {
        documentType,
        documentNumber: result.normalizedValue,
        documentCountry: "South Africa",
        isValid: result.isValid,
        status: result.normalizedValue ? (result.isValid ? "valid_format" : "invalid") : "empty",
        message: result.isValid ? "" : result.errorMessage,
        dateOfBirth: formatIdentityDate(result.dateOfBirth),
      };
    }

    const result = validatePassportNumber(documentNumber);
    const hasCountry = Boolean(documentCountry);
    return {
      documentType,
      documentNumber: result.normalizedValue,
      documentCountry,
      isValid: result.isValid && hasCountry,
      status: documentNumber ? ((result.isValid && hasCountry) ? "valid_format" : "invalid") : "empty",
      message: !result.isValid ? result.errorMessage : (hasCountry ? "" : "Enter your nationality / country"),
      dateOfBirth: "",
    };
  };

  const syncRegisterIdentityUi = () => {
    if (!registerForm) return;
    const state = getRegisterIdentityState();
    const isPassport = state.documentType === "passport";
    const isSouthAfricanId = state.documentType === "sa_id";

    if (registerDocumentNumberLabel) {
      registerDocumentNumberLabel.textContent = isPassport ? "Passport Number" : "South African ID Number";
    }
    if (registerDocumentNumberField) {
      registerDocumentNumberField.placeholder = isPassport ? "Passport Number" : "South African ID";
      registerDocumentNumberField.value = state.documentNumber;
      registerDocumentNumberField.inputMode = isSouthAfricanId ? "numeric" : "text";
    }
    if (registerDocumentCountryWrapper) {
      registerDocumentCountryWrapper.classList.toggle("is-hidden", !isPassport);
    }
    if (registerDocumentCountryField) {
      registerDocumentCountryField.required = isPassport;
      if (!isPassport) {
        registerDocumentCountryField.value = "";
      }
    }
    if (registerDocumentDobWrapper) {
      registerDocumentDobWrapper.classList.toggle("is-hidden", !isSouthAfricanId);
    }
    const dobField = registerForm.querySelector("input[name='dob']");
    if (dobField) {
      dobField.value = state.dateOfBirth;
    }
    if (registerDocumentFeedback) {
      const shouldShowMessage = state.documentType ? (!state.isValid && (state.documentNumber || isPassport)) : false;
      registerDocumentFeedback.textContent = shouldShowMessage ? state.message : "";
      registerDocumentFeedback.classList.toggle("is-error", shouldShowMessage);
      registerDocumentFeedback.classList.toggle("is-success", false);
    }
    syncRegisterSubmitState();
  };

  const syncRegisterSubmitState = () => {
    if (!(registerForm && registerSubmitButton instanceof HTMLButtonElement)) return;
    const state = getRegisterFormState();
    const isComplete =
      state.title &&
      state.fullName &&
      state.surname &&
      state.documentType &&
      state.documentNumber &&
      (state.documentType !== "passport" || state.documentCountry) &&
      state.cellphone &&
      isStructuredAddressComplete(state.addressDetails) &&
      state.realEstateCode &&
      state.email &&
      state.password &&
      state.confirmPassword &&
      state.termsAccepted;

    registerSubmitButton.disabled = !Boolean(isComplete);
  };

  if (registerForm) {
    registerFullNameField?.addEventListener("input", () => {
      registerFullNameField.value = normalizeCapitalizedWords(registerFullNameField.value).trimStart();
      clearRegisterFieldError(registerFullNameField);
      syncRegisterSubmitState();
    });

    registerSurnameField?.addEventListener("input", () => {
      registerSurnameField.value = normalizeSurnameText(registerSurnameField.value);
      clearRegisterFieldError(registerSurnameField);
      syncRegisterSubmitState();
    });

    registerCellphoneField?.addEventListener("input", () => {
      registerCellphoneField.value = registerCellphoneField.value.replace(/\D/g, "").slice(0, 10);
      clearRegisterFieldError(registerCellphoneField);
      syncRegisterSubmitState();
    });

    registerEmailField?.addEventListener("input", () => {
      registerEmailField.value = registerEmailField.value.toLowerCase().replace(/\s+/g, "");
      clearRegisterFieldError(registerEmailField);
      syncRegisterSubmitState();
    });

    [
      registerDocumentTypeField,
      registerDocumentNumberField,
      registerDocumentCountryField,
    ].forEach((field) => {
      field?.addEventListener("change", () => {
        clearRegisterFieldError(field);
        syncRegisterIdentityUi();
      });
    });

    [
      registerDocumentTypeField,
      registerDocumentNumberField,
      registerDocumentCountryField,
      registerFullNameField,
      registerSurnameField,
      registerCellphoneField,
      registerAgentCodeField,
      registerEmailField,
      registerPasswordField,
      registerConfirmPasswordField,
      registerTitleField,
      registerTermsCheckbox,
    ].forEach((field) => {
      field?.addEventListener("input", () => {
        clearRegisterFieldError(field);
        syncRegisterSubmitState();
      });
      field?.addEventListener("change", () => {
        clearRegisterFieldError(field);
        syncRegisterSubmitState();
      });
    });

    registerAddressController?.setOnChange(() => {
      clearRegisterFieldError(registerAddressFieldset);
      syncRegisterSubmitState();
    });

    syncRegisterIdentityUi();
  }

  if (loginForm && auth) {
    loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      setFeedback(loginFeedback, "");
      const email = loginForm.login_email?.value?.trim() || "";
      const password = loginForm.login_password?.value || "";
      if (!email || !password) {
        setFeedback(loginFeedback, "Please enter your email and password.", true);
        return;
      }
      try {
        await auth.signInWithEmailAndPassword(email, password);
      } catch (error) {
        setFeedback(loginFeedback, error.message || "Unable to sign in.", true);
      }
    });
  }

  if (resetPasswordButton && auth) {
    resetPasswordButton.addEventListener("click", async () => {
      const email = String(loginForm?.login_email?.value || "")
        .trim()
        .toLowerCase();
      if (!email) {
        setFeedback(loginFeedback, "Enter your email first.", true);
        return;
      }
      try {
        await auth.sendPasswordResetEmail(email, PASSWORD_RESET_SETTINGS);
        setFeedback(
          loginFeedback,
          "If an account exists for that email, a reset link has been sent. Check spam or junk if it does not arrive shortly."
        );
      } catch (error) {
        setFeedback(loginFeedback, error.message || "Unable to send reset email.", true);
      }
    });
  }

  if (registerForm && auth && db) {
    registerForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      hideRegisterPopup();
      setFeedback(registerFeedback, "");
      setFeedback(otpFeedback, "");
      clearRegisterValidationState();

      const validation = validateRegisterSubmission();
      const {
        title,
        fullName,
        surname,
        identityState,
        cellphone,
        addressDetails,
        realEstateCode,
        email,
        password,
      } = validation.state;
      const address = String(addressDetails.formattedAddress || validation.state.formData.get("address") || "").trim();

      if (!validation.valid) {
        showRegistrationError(validation.message, {
          title: validation.title,
          feedbackEl: registerFeedback,
          invalidTargets: validation.invalidTargets,
        });
        return;
      }

      let user = null;
      let profileReady = false;
      registrationProfilePending = true;
      disableForm(registerForm, true);
      try {
        const result = await auth.createUserWithEmailAndPassword(email, password);
        user = result.user;
        await functions.httpsCallable("completeClientRegistration")({
          title,
          fullName,
          surname,
          cellphone,
          address,
          addressDetails,
          realEstateCode,
          email,
          documentType: identityState.documentType,
          documentNumber: identityState.documentNumber,
          documentCountry: identityState.documentType === "sa_id" ? "South Africa" : identityState.documentCountry,
        });
        profileReady = true;

        pendingOtpUserId = user.uid;
        sessionStorage.setItem("portalPendingOtp", user.uid);
        if (otpPanel) {
          otpPanel.classList.remove("is-hidden");
        }
        setFeedback(
          registerFeedback,
          "Account created. Enter the OTP sent to your phone to complete registration."
        );

        try {
          const payload = await postHttpFunction("sendOTP", {
            userId: user.uid,
            type: "signup",
          });
          const deliveryWarning = getOtpDeliveryWarning(payload);
          if (deliveryWarning) {
            showRegistrationError(deliveryWarning, {
              title: "OTP delivery issue",
              feedbackEl: registerFeedback
            });
          }
        } catch (otpError) {
          showRegistrationError(
            otpError.message || "Account created, but the OTP could not be sent. Use Resend OTP or contact support.",
            {
              title: "OTP delivery issue",
              feedbackEl: registerFeedback
            }
          );
        }
      } catch (error) {
        if (user && !profileReady) {
          try {
            await user.delete();
          } catch (deleteError) {
            await auth.signOut().catch(() => {});
          }
        }
        const registrationError = formatRegistrationError(error, "Unable to create account.");
        showRegistrationError(registrationError.message, {
          title: registrationError.title,
          feedbackEl: registerFeedback,
          invalidTargets: registrationError.invalidTargets,
        });
      } finally {
        registrationProfilePending = false;
        disableForm(registerForm, false);
        syncRegisterIdentityUi();
      }
    });
  }

  if (otpVerifyButton) {
    otpVerifyButton.addEventListener("click", async () => {
      const otpInput = otpPanel?.querySelector("input[name='otp_code']");
      const code = otpInput?.value?.trim();
      hideRegisterPopup();
      if (!pendingOtpUserId) {
        pendingOtpUserId = sessionStorage.getItem("portalPendingOtp");
      }
      if (!code || !pendingOtpUserId) {
        showRegistrationError("Enter the OTP code to continue.", {
          title: "Missing OTP code",
          feedbackEl: otpFeedback
        });
        return;
      }
      try {
        await postHttpFunction("verifyOTP", { userId: pendingOtpUserId, code, type: "signup" });
        setFeedback(otpFeedback, "OTP verified. Redirecting to activation...");
        if (otpPanel) otpPanel.classList.add("is-hidden");
        sessionStorage.removeItem("portalPendingOtp");
        window.location.href = "app.html";
      } catch (error) {
        showRegistrationError(error.message || "OTP verification failed.", {
          title: "OTP verification issue",
          feedbackEl: otpFeedback
        });
      }
    });
  }

  if (otpResendButton) {
    otpResendButton.addEventListener("click", async () => {
      hideRegisterPopup();
      if (!pendingOtpUserId) {
        pendingOtpUserId = sessionStorage.getItem("portalPendingOtp");
      }
      if (!pendingOtpUserId) return;
      try {
        const payload = await postHttpFunction("sendOTP", {
          userId: pendingOtpUserId,
          type: "signup",
        });
        const deliveryWarning = getOtpDeliveryWarning(payload);
        if (deliveryWarning) {
          showRegistrationError(deliveryWarning, {
            title: "OTP delivery issue",
            feedbackEl: otpFeedback
          });
          return;
        }
        setFeedback(otpFeedback, "OTP resent.");
      } catch (error) {
        showRegistrationError(error.message || "Unable to resend OTP.", {
          title: "OTP resend issue",
          feedbackEl: otpFeedback
        });
      }
    });
  }

  if (signOutButtons.length && auth) {
    signOutButtons.forEach((button) => {
      button.addEventListener("click", async () => {
        if (!(button instanceof HTMLButtonElement)) return;
        const defaultLabel = button.textContent;
        button.disabled = true;
        button.textContent = "Signing out...";
        try {
          stopUserListener();
          stopPayNowListener();
          stopBookingPropertiesListener();
          if (workerBookingsListener) workerBookingsListener();
          workerBookingsListener = null;
          workerBookingsCache = [];
          agentDataLoaded = false;
          adminDataLoaded = false;
          pendingSecurityChange = null;
          sessionStorage.removeItem("portalPendingOtp");
          await auth.signOut();
          redirectTo("portal-login.html");
        } catch (error) {
          showMessage("We couldn't sign you out just now. Please try again.");
          button.disabled = false;
          button.textContent = defaultLabel;
        }
      });
    });
  }

  if (settingsOtpInput) {
    settingsOtpInput.addEventListener("input", () => {
      settingsOtpInput.value = settingsOtpInput.value.replace(/\D/g, "").slice(0, 8);
    });
  }

  if (emailChangeForm && auth && db) {
    emailChangeForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!currentUser) return;

      setFeedback(emailChangeFeedback, "");
      setFeedback(settingsOtpFeedback, "");

      const formData = new FormData(emailChangeForm);
      const newEmail = String(formData.get("new_email") || "").trim().toLowerCase();
      const currentEmail = String(currentUserData?.email || currentUser.email || "").trim().toLowerCase();

      if (!newEmail) {
        setFeedback(emailChangeFeedback, "Enter the new email address first.", true);
        return;
      }

      if (newEmail === currentEmail) {
        setFeedback(emailChangeFeedback, "Enter a different email address.", true);
        return;
      }

      disableForm(emailChangeForm, true);
      try {
        const payload = await postHttpFunction("sendOTP", {
          userId: currentUser.uid,
          type: "email_change",
        });
        const deliveryWarning = getOtpDeliveryWarning(payload);
        if (deliveryWarning) {
          setFeedback(emailChangeFeedback, deliveryWarning, true);
          pendingSecurityChange = null;
          closeSettingsOtpPanel();
          return;
        }

        pendingSecurityChange = {
          type: "email_change",
          newEmail,
          title: "Verify Email Change",
          message: "Enter the code sent to your cellphone.",
        };
        openSettingsOtpPanel(pendingSecurityChange.title, pendingSecurityChange.message);
        setFeedback(emailChangeFeedback, "OTP sent to your cellphone.");
      } catch (error) {
        setFeedback(emailChangeFeedback, error.message || "Unable to send OTP.", true);
      } finally {
        disableForm(emailChangeForm, false);
      }
    });
  }

  if (passwordChangeForm && auth) {
    passwordChangeForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!currentUser) return;

      setFeedback(passwordChangeFeedback, "");
      setFeedback(settingsOtpFeedback, "");

      const formData = new FormData(passwordChangeForm);
      const newPassword = String(formData.get("new_password") || "");
      const confirmPassword = String(formData.get("confirm_password") || "");

      if (!newPassword || !confirmPassword) {
        setFeedback(passwordChangeFeedback, "Enter and confirm the new password.", true);
        return;
      }

      if (newPassword !== confirmPassword) {
        setFeedback(passwordChangeFeedback, "Passwords do not match.", true);
        return;
      }

      disableForm(passwordChangeForm, true);
      try {
        const payload = await postHttpFunction("sendOTP", {
          userId: currentUser.uid,
          type: "password_change",
        });
        const deliveryWarning = getOtpDeliveryWarning(payload);
        if (deliveryWarning) {
          setFeedback(passwordChangeFeedback, deliveryWarning, true);
          pendingSecurityChange = null;
          closeSettingsOtpPanel();
          return;
        }

        pendingSecurityChange = {
          type: "password_change",
          newPassword,
          title: "Verify Password Change",
          message: "Enter the code sent to your cellphone.",
        };
        openSettingsOtpPanel(pendingSecurityChange.title, pendingSecurityChange.message);
        setFeedback(passwordChangeFeedback, "OTP sent to your cellphone.");
      } catch (error) {
        setFeedback(passwordChangeFeedback, error.message || "Unable to send OTP.", true);
      } finally {
        disableForm(passwordChangeForm, false);
      }
    });
  }

  if (settingsOtpVerifyButton) {
    settingsOtpVerifyButton.addEventListener("click", async () => {
      if (!currentUser || !pendingSecurityChange) {
        setFeedback(settingsOtpFeedback, "Start an email or password change first.", true);
        return;
      }

      const code = settingsOtpInput?.value?.trim() || "";
      if (!code) {
        setFeedback(settingsOtpFeedback, "Enter the OTP code to continue.", true);
        return;
      }

      setSettingsOtpBusy(true);
      setFeedback(settingsOtpFeedback, "");

      try {
        await postHttpFunction("verifyOTP", {
          userId: currentUser.uid,
          code,
          type: pendingSecurityChange.type,
        });

        if (pendingSecurityChange.type === "email_change") {
          await currentUser.verifyBeforeUpdateEmail(pendingSecurityChange.newEmail);
          await db.collection("users").doc(currentUser.uid).set(
            { email: pendingSecurityChange.newEmail },
            { merge: true }
          );
          currentUserData = {
            ...(currentUserData || {}),
            email: pendingSecurityChange.newEmail,
          };
          updateAccountSettingsSummary(currentUserData);
          emailChangeForm?.reset();
          setFeedback(emailChangeFeedback, "Verification email sent to your new address.");
        } else if (pendingSecurityChange.type === "password_change") {
          await currentUser.updatePassword(pendingSecurityChange.newPassword);
          passwordChangeForm?.reset();
          setFeedback(passwordChangeFeedback, "Password updated.");
        }

        pendingSecurityChange = null;
        closeSettingsOtpPanel();
      } catch (error) {
        setFeedback(
          settingsOtpFeedback,
          error.message || "We couldn't apply that change. Please try again.",
          true
        );
      } finally {
        setSettingsOtpBusy(false);
      }
    });
  }

  if (settingsOtpResendButton) {
    settingsOtpResendButton.addEventListener("click", async () => {
      if (!currentUser || !pendingSecurityChange) return;
      try {
        const payload = await postHttpFunction("sendOTP", {
          userId: currentUser.uid,
          type: pendingSecurityChange.type,
        });
        const deliveryWarning = getOtpDeliveryWarning(payload);
        if (deliveryWarning) {
          setFeedback(settingsOtpFeedback, deliveryWarning, true);
          return;
        }
        setFeedback(settingsOtpFeedback, "OTP resent.");
      } catch (error) {
        setFeedback(settingsOtpFeedback, error.message || "Unable to resend OTP.", true);
      }
    });
  }

  if (settingsOtpCancelButton) {
    settingsOtpCancelButton.addEventListener("click", () => {
      pendingSecurityChange = null;
      closeSettingsOtpPanel();
    });
  }

  const startPaymentRequest = async (gateway) => {
    if (!currentUser || !currentUserData) return;
    setFeedback(paymentFeedback, "");
    if (!hasAcceptedTerms(paymentTermsCheckbox)) {
      setFeedback(paymentFeedback, PAYMENT_TERMS_REQUIRED_MESSAGE, true);
      syncPaymentConsentState();
      return;
    }
    if (openPayNowButton) openPayNowButton.classList.add("is-hidden");

    try {
      await ensureAssessmentTierBeforePayment();
      const result = await functions.httpsCallable("startAccountPaymentRequest")({
        gateway: gateway || "ozow",
        paymentTermsAccepted: true,
        paymentTermsVersion: PAYMENT_TERMS_VERSION,
      });
      const response = result && result.data ? result.data : {};
      const requestId = String(response.requestId || "").trim();
      const initialState = extractPayNowRequestState(response);
      if (!requestId && !initialState.redirectUrl) {
        throw new Error("We could not prepare your secure payment just now.");
      }

      setFeedback(
        paymentFeedback,
        initialState.processingMessage || "Preparing your secure payment link..."
      );

      if (initialState.redirectUrl) {
        continueInCurrentWindow(initialState.redirectUrl, {
          button: usesPrimaryPortalPaymentButton() ? null : openPayNowButton,
          consentCheckbox: paymentTermsCheckbox,
          onConsentMissing: () => {
            setFeedback(paymentFeedback, PAYMENT_TERMS_REQUIRED_MESSAGE, true);
          },
          onReady: () => {
            setFeedback(paymentFeedback, securePaymentRedirectMessage());
          },
        });
        syncPaymentConsentState();
      }

      if (!requestId) {
        return;
      }

      stopPayNowListener();
      payNowListener = watchPayNowRequest(
        requestId,
        (data) => {
          const requestState = extractPayNowRequestState(data);

          if (requestState.redirectUrl) {
            portalCurrentPaymentUrl = requestState.redirectUrl;
            continueInCurrentWindow(requestState.redirectUrl, {
              button: usesPrimaryPortalPaymentButton() ? null : openPayNowButton,
              consentCheckbox: paymentTermsCheckbox,
              onConsentMissing: () => {
                setFeedback(paymentFeedback, PAYMENT_TERMS_REQUIRED_MESSAGE, true);
              },
              onReady: () => {
                setFeedback(paymentFeedback, securePaymentRedirectMessage());
              },
            });
            syncPaymentConsentState();
          } else if (requestState.processingMessage) {
            setFeedback(paymentFeedback, requestState.processingMessage);
          }

          if (requestState.status === "paid" || requestState.paymentStatus === "paid") {
            if (openPayNowButton) {
              openPayNowButton.classList.add("is-hidden");
              openPayNowButton.onclick = null;
            }
            setFeedback(
              paymentFeedback,
              requestState.processingMessage || "Payment received. Refreshing your account status."
            );
            stopPayNowListener();
            return;
          }

          if (requestState.errorMessage || ["declined", "failed"].includes(requestState.status)) {
            if (openPayNowButton) {
              openPayNowButton.classList.add("is-hidden");
              openPayNowButton.onclick = null;
            }
            setFeedback(
              paymentFeedback,
              requestState.errorMessage || "Payment was not completed. Please try again.",
              true
            );
            stopPayNowListener();
          }
        },
        response
      );
    } catch (error) {
      setFeedback(paymentFeedback, error.message || "We could not prepare your secure payment just now.", true);
    }
  };

  if (payNowButton) {
    payNowButton.addEventListener("click", () => {
      if (!portalCurrentPaymentType) {
        setFeedback(paymentFeedback, "Payment is not available for this stage yet.", true);
        return;
      }
      if (usesPrimaryPortalPaymentButton()) {
        continueInCurrentWindow(portalCurrentPaymentUrl, {
          consentCheckbox: paymentTermsCheckbox,
          onConsentMissing: () => {
            setFeedback(paymentFeedback, PAYMENT_TERMS_REQUIRED_MESSAGE, true);
          },
          onReady: () => {
            setFeedback(paymentFeedback, securePaymentRedirectMessage());
          },
        });
        return;
      }
      startPaymentRequest("ozow");
    });
  }

  if (mandateForm) {
    const branchField = mandateForm.querySelector("input[name='debtor_branch_number']");
    const accountField = mandateForm.querySelector("input[name='debtor_account_number']");
    const idField = mandateForm.querySelector("input[name='debtor_id']");
    const startDateField = mandateForm.querySelector("input[name='start_date']");
    const collectionDayField = mandateForm.querySelector("input[name='collection_day']");
    const trackingDaysField = mandateForm.querySelector("input[name='tracking_days']");
    const bankSelect = mandateForm.querySelector("select[name='debtor_bank_id']");
    const customBankIdField = mandateForm.querySelector("input[name='custom_bank_id']");

    if (branchField) {
      branchField.addEventListener("input", () => {
        branchField.value = branchField.value.replace(/\D/g, "").slice(0, 6);
      });
    }

    if (accountField) {
      accountField.addEventListener("input", () => {
        accountField.value = accountField.value.replace(/[^\d/]/g, "");
      });
    }

    if (idField) {
      idField.addEventListener("input", () => {
        idField.value = idField.value.trim();
      });
    }

    if (customBankIdField) {
      customBankIdField.addEventListener("input", () => {
        customBankIdField.value = customBankIdField.value.replace(/\D/g, "").slice(0, 6);
      });
    }

    if (bankSelect) {
      bankSelect.addEventListener("change", () => {
        syncCustomMandateBankFields();
      });
    }

    if (trackingDaysField) {
      trackingDaysField.addEventListener("input", () => {
        const value = Math.min(10, Math.max(0, Number(trackingDaysField.value || 0)));
        trackingDaysField.value = String(Number.isNaN(value) ? 0 : value);
      });
    }

    if (collectionDayField) {
      collectionDayField.addEventListener("input", syncMandateScheduleFields);
      collectionDayField.addEventListener("change", syncMandateScheduleFields);
    }

    if (startDateField && collectionDayField) {
      syncMandateScheduleFields();
      startDateField.addEventListener("input", syncMandateScheduleFields);
      startDateField.addEventListener("change", syncMandateScheduleFields);
    }

    mandateForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!currentUser || !currentUserData) return;

      setFeedback(paymentFeedback, "");
      const mandateAmountCents = Number(currentUserData.priceOfferedAmount || currentUserData.mandateAmountCents || 0);
      if (!mandateAmountCents) {
        setFeedback(paymentFeedback, "Your tailored monthly fee is not ready just yet.", true);
        return;
      }

      const formData = new FormData(mandateForm);
      const reference =
        String(currentUserData.mandateReference || currentUserData.clientCode || currentUser.uid).trim();
      const selectedBankId = String(formData.get("debtor_bank_id") || "").trim();
      const isCustomBank = selectedBankId === CUSTOM_MANDATE_BANK_ID;
      const selectedBankName =
        bankSelect && bankSelect.selectedIndex >= 0
          ? bankSelect.options[bankSelect.selectedIndex].textContent
          : "";
      const debtorBankId = String((isCustomBank ? formData.get("custom_bank_id") : selectedBankId) || "").trim();
      const debtorBankName = String(
        (isCustomBank ? formData.get("custom_bank_name") : selectedBankName) || ""
      ).trim();
      const debtorPhoneNumber = normalizeInternationalPhone(currentUserData.cellphone || currentUser?.phoneNumber || "");
      syncMandateScheduleFields();
      const startDate = buildDefaultMandateStartDate();
      const collectionDay = 1;
      const trackingIndicator = 10;

      if (!debtorPhoneNumber) {
        setFeedback(paymentFeedback, "Please add the cellphone number linked to this account before continuing.", true);
        return;
      }
      if (!startDate) {
        setFeedback(paymentFeedback, "We could not prepare the monthly collection date just now.", true);
        return;
      }

      try {
        const response = await functions.httpsCallable("createMandateRequest")({
          mandateAmountCents,
          mandateType: currentUserData.mandateType || "debiCheck",
          mandateReference: reference,
          clientCode: currentUserData.clientCode || reference,
          debtorName: String(formData.get("debtor_name") || "").trim(),
          debtorBankId,
          debtorBankName,
          debtorBranchNumber: String(formData.get("debtor_branch_number") || "").trim(),
          debtorAccountNumber: String(formData.get("debtor_account_number") || "").trim(),
          debtorAccountType: normalizedMandateAccountType(formData.get("debtor_account_type")) || "01",
          debtorPhoneNumber,
          debtorIdType: String(formData.get("debtor_id_type") || "").trim(),
          debtorId: String(formData.get("debtor_id") || "").trim(),
          startDate,
          collectionDay,
          trackingIndicator,
          ...(String(currentUserData.mandateType || "debiCheck").trim().toLowerCase().replace(/[\s_-]+/g, "") === "emandate"
            ? {}
            : {
                authenticationType: "DELAYED",
                debtorAuthenticationRequired: "0227",
              }),
        });
        const result = response.data || {};
        setFeedback(
          paymentFeedback,
          result.message ||
            (result.status === "submission_failed"
              ? "We saved your mandate details, but could not complete the bank handover. Please try again."
              : "Your mandate details have been received.")
        );
        if (result.mandateUrl && openMandateButton) {
          openMandateButton.classList.remove("is-hidden");
          openMandateButton.onclick = () => window.open(result.mandateUrl, "_blank");
        }
        setMandateFormVisible(false);
        mandateForm.reset();
        prefillMandateForm(currentUserData);
      } catch (error) {
        setFeedback(paymentFeedback, error.message || "We could not prepare your mandate just now.", true);
      }
    });

    syncCustomMandateBankFields();
  }

  if (mandateButton) {
    mandateButton.addEventListener("click", () => {
      if (!currentUser || !currentUserData) return;
      setFeedback(paymentFeedback, "");
      const mandateAmountCents = Number(currentUserData.priceOfferedAmount || currentUserData.mandateAmountCents || 0);
      if (!mandateAmountCents) {
        setFeedback(paymentFeedback, "Your tailored monthly fee is not ready just yet.");
        return;
      }
      prefillMandateForm(currentUserData);
      setMandateFormVisible(true);
    });
  }

  if (cancelMandateButton) {
    cancelMandateButton.addEventListener("click", () => {
      if (mandateForm) {
        mandateForm.reset();
        prefillMandateForm(currentUserData);
      }
      setMandateFormVisible(false);
      setFeedback(paymentFeedback, "");
    });
  }

  renderBookingCategories();
  renderBookingHeroState();
  renderBookingSummary();

  bookingCategoryCards.forEach((card) => {
    card.addEventListener("click", () => {
      const category = normalizeBookingCategory(card.dataset.category);
      if (!category) return;

      if (bookingSelectedCategory === category) {
        bookingSelectedCategory = "";
        bookingSelectedServices = [];
      } else {
        bookingSelectedCategory = category;
        bookingSelectedServices = [];
      }

      renderBookingCategories();
      renderBookingServices();
      renderBookingHeroState();
      resetBookingPricingState(
        bookingSelectedCategory
          ? "Select your presentation details to view your tailored pricing."
          : "Select a property and your presentation details to view your tailored pricing."
      );
      renderBookingSummary();
    });
  });

  if (bookingDateInput) {
    bookingDateInput.addEventListener("input", () => {
      renderBookingSummary();
    });
  }

  if (bookingDateInput) {
    bookingDateInput.addEventListener("input", () => {
      syncBookingTimeConstraints();
      renderBookingSummary();
    });
  }

  if (bookingTimeInput) {
    bookingTimeInput.addEventListener("input", () => {
      renderBookingSummary();
    });
    bookingTimeInput.addEventListener("change", () => {
      renderBookingSummary();
    });
  }

  if (bookingOpenSheetButton) {
    bookingOpenSheetButton.addEventListener("click", () => {
      if (!getSelectedBookingProperty()) {
        setBookingFeedback("Please select a property before continuing.", true);
        return;
      }
      if (!bookingSelectedCategory) {
        setBookingFeedback("Please select the property type first.", true);
        return;
      }
      if (!bookingSelectedServices.length) {
        setBookingFeedback("Please select at least one presentation detail before continuing.", true);
        return;
      }

      setBookingMinimumDate();
      setBookingFeedback("");
      renderBookingSummary();
      setBookingSheetOpen(true);
    });
  }

  bookingSheetCloseButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setBookingSheetOpen(false);
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && bookingNotice && !bookingNotice.classList.contains("is-hidden")) {
      closeBookingNotice();
      return;
    }
    if (event.key === "Escape" && bookingSheet && !bookingSheet.classList.contains("is-hidden")) {
      setBookingSheetOpen(false);
    }
  });

  if (bookingForm && db) {
    bookingForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      setBookingFeedback("");
      if (!currentUser || !currentUserData) return;
      if (bookingSubmitting) return;
      if (bookingOpenPaymentButton) {
        bookingOpenPaymentButton.classList.add("is-hidden");
        bookingOpenPaymentButton.onclick = null;
      }

      const selectedProperty = getSelectedBookingProperty();
      const bookingDateValue = String(bookingDateInput?.value || "").trim();
      const bookingTimeValue = String(bookingTimeInput?.value || "").trim();

      if (!selectedProperty) {
        setBookingFeedback("Please select a property before continuing.", true);
        return;
      }
      if (!bookingSelectedCategory) {
        setBookingFeedback("Please select the property type before continuing.", true);
        return;
      }
      if (!bookingSelectedServices.length) {
        setBookingFeedback("Please select at least one presentation detail.", true);
        return;
      }
      if (!bookingDateValue || !bookingTimeValue) {
        if (bookingDateValue && !getBookingTimeRangeForDateValue(bookingDateValue)) {
          setBookingFeedback(BOOKING_INVALID_TIME_MESSAGE, true);
          return;
        }
        setBookingFeedback("Please choose a date and time before continuing.", true);
        return;
      }
      const bookingTimeRange = syncBookingTimeConstraints();
      if (!bookingTimeRange || !isBookingDateTimeValid(bookingDateValue, bookingTimeValue)) {
        setBookingFeedback(BOOKING_INVALID_TIME_MESSAGE, true);
        renderBookingSummary();
        return;
      }
      if (!hasAcceptedTerms(bookingPaymentTermsCheckbox)) {
        setBookingFeedback(PAYMENT_TERMS_REQUIRED_MESSAGE, true);
        syncPaymentConsentState();
        return;
      }
      if (!selectedProperty.isBookable) {
        setBookingFeedback(
          selectedProperty.isSold
            ? "This property is no longer active in your portfolio."
            : "This property is not currently available for presentation services. Please contact Curator Concierge.",
          true
        );
        return;
      }
      if (!bookingPricingReady) {
        setBookingFeedback(bookingPricingMessageText || "Preparing your tailored pricing. Please wait a moment.", true);
        return;
      }
      if (!bookingPricingLines.length && !bookingHasMonthlyServices) {
        setBookingFeedback("Your tailored pricing is not ready just yet. Please check back shortly.", true);
        return;
      }

      const bookingPayload = {
        selectedProperty: selectedProperty.name,
        propertyId: selectedProperty.id,
        propertyAddress: selectedProperty.address,
        propertyAddressDetails: selectedProperty.addressDetails,
        category: bookingSelectedCategory,
        bookingDateValue,
        bookingTimeValue,
        services: bookingSelectedServices.map((service) => submissionServiceName(service)),
        paymentTermsAccepted: true,
        paymentTermsVersion: PAYMENT_TERMS_VERSION,
      };

      try {
        bookingSubmitting = true;
        if (bookingSubmitButton) {
          bookingSubmitButton.disabled = true;
          bookingSubmitButton.textContent = "Preparing secure payment...";
        }
        const response = await functions.httpsCallable("submitBookingRequest")({
          gateway: "ozow",
          booking: bookingPayload,
        });
        const result = response.data || {};

        if (result.status === "created") {
          setBookingFeedback(BOOKING_CONFIRMATION_MESSAGE);
          resetBookingDraft();
          renderBookingCategories();
          renderBookingServices();
          renderBookingHeroState();
          renderBookingSummary();
          setBookingSheetOpen(false);
          return;
        }

        const initialRequestState = extractPayNowRequestState(result);
        const requestId = String(result.requestId || "").trim();

        if (result.status !== "payment_required" || (!requestId && !initialRequestState.redirectUrl)) {
          throw new Error("We could not prepare your secure payment just now.");
        }

        setBookingFeedback(
          initialRequestState.processingMessage || "Preparing your secure payment link..."
        );

        if (initialRequestState.redirectUrl) {
          continueInCurrentWindow(initialRequestState.redirectUrl, {
            button: bookingOpenPaymentButton,
            consentCheckbox: bookingPaymentTermsCheckbox,
	            onConsentMissing: () => {
	              setBookingFeedback(PAYMENT_TERMS_REQUIRED_MESSAGE, true);
	            },
	            onReady: () => {
	              setBookingFeedback(securePaymentRedirectMessage());
	            },
	          });
	          syncPaymentConsentState();
        }

        if (!requestId) {
          return;
        }

        stopPayNowListener();
        payNowListener = watchPayNowRequest(
          requestId,
          (data) => {
            const requestState = extractPayNowRequestState(data);

            if (requestState.redirectUrl) {
              continueInCurrentWindow(requestState.redirectUrl, {
                button: bookingOpenPaymentButton,
                consentCheckbox: bookingPaymentTermsCheckbox,
	                onConsentMissing: () => {
	                  setBookingFeedback(PAYMENT_TERMS_REQUIRED_MESSAGE, true);
	                },
	                onReady: () => {
	                  setBookingFeedback(securePaymentRedirectMessage());
	                },
	              });
	              syncPaymentConsentState();
            }

            const bookingReady =
              requestState.paymentStatus === "paid" && requestState.bookingSyncStatus === "ready";
            const bookingStillSyncing =
              requestState.status === "paid" ||
              requestState.paymentStatus === "paid" ||
              requestState.bookingSyncStatus === "pending";

            if (bookingReady) {
              if (bookingOpenPaymentButton) {
                bookingOpenPaymentButton.classList.add("is-hidden");
                bookingOpenPaymentButton.onclick = null;
              }
              setBookingFeedback(BOOKING_CONFIRMATION_MESSAGE);
              resetBookingDraft();
              renderBookingCategories();
              renderBookingServices();
              renderBookingHeroState();
              renderBookingSummary();
              setBookingSheetOpen(false);
              stopPayNowListener();
            } else if (bookingStillSyncing) {
              if (bookingOpenPaymentButton) {
                bookingOpenPaymentButton.classList.add("is-hidden");
                bookingOpenPaymentButton.onclick = null;
              }
              setBookingFeedback(
                requestState.processingMessage || "Payment received. We are finalising your booking."
              );
            } else if (requestState.errorMessage || ["failed", "declined"].includes(requestState.status)) {
              if (bookingOpenPaymentButton) {
                bookingOpenPaymentButton.classList.add("is-hidden");
                bookingOpenPaymentButton.onclick = null;
              }
              setBookingFeedback(
                requestState.errorMessage || "Payment was not completed. Please try again.",
                true
              );
              stopPayNowListener();
            }
          },
          result
        );
      } catch (error) {
        setBookingFeedback(error.message || "We could not place your booking just now.", true);
      } finally {
        bookingSubmitting = false;
        if (bookingSubmitButton) {
          syncPaymentConsentState();
          bookingSubmitButton.textContent = "Continue to secure payment";
        }
      }
    });
  }

  const clearList = (container, emptyText) => {
    if (!container) return;
    container.innerHTML = "";
    if (emptyText) {
      const empty = document.createElement("p");
      empty.className = "role-empty";
      empty.textContent = emptyText;
      container.appendChild(empty);
    }
  };

  const createRoleCard = ({ title, meta = [], badge = "" }) => {
    const card = document.createElement("div");
    card.className = "role-card";
    const titleEl = document.createElement("p");
    titleEl.className = "role-card-title";
    titleEl.textContent = title;
    card.appendChild(titleEl);
    meta.forEach((line) => {
      if (!line) return;
      const metaEl = document.createElement("p");
      metaEl.className = "role-card-meta";
      metaEl.textContent = line;
      card.appendChild(metaEl);
    });
    if (badge) {
      const badgeEl = document.createElement("span");
      badgeEl.className = "role-badge";
      badgeEl.textContent = badge;
      card.appendChild(badgeEl);
    }
    return card;
  };

  const resolveBookingDate = (data) => {
    return (
      toDate(data.dateTime) ||
      toDate(data.bookingDate) ||
      toDate(data.bookingTime) ||
      toDate(data.timestamp) ||
      toDate(data.createdAt)
    );
  };

  const resolveBookingStatus = (data) => {
    return (
      String(data.status || data.bookingStatus || data.paymentStatus || "Scheduled").trim() || "Scheduled"
    );
  };

  const resolveServiceSummary = (data) => {
    const services = Array.isArray(data.services) ? data.services.filter(Boolean) : [];
    if (services.length) return services.map((service) => displayServiceName(service)).join(", ");
    return displayServiceName(String(data.serviceName || data.service || data.category || "Booking").trim() || "Booking");
  };

  const buildBookingMeta = (data, options = {}) => {
    const { includeStatus = true, includeAddress = true } = options;
    const meta = [];
    const client =
      String(data.fullName || data.clientName || data.clientCode || data.userId || "").trim();
    const address = String(data.propertyAddress || data.address || "").trim();
    const scheduled = resolveBookingDate(data);
    const status = formatStatusLabel(resolveBookingStatus(data));

    if (client) meta.push(`Client: ${client}`);
    if (includeAddress && address) meta.push(address);
    if (scheduled) meta.push(`Scheduled: ${formatDateTime(scheduled)}`);
    if (includeStatus && status) meta.push(`Status: ${status}`);
    return meta;
  };

  const isCompletedBooking = (data) => {
    const status = String(data.status || data.bookingStatus || "").toLowerCase();
    const progress =
      Number(data.progressPercent || data.progress || 0) ||
      Number(data.progressPercentValue || 0) ||
      0;
    return data.completed === true || progress >= 100 || status.includes("complete");
  };

  const initWorkerDashboard = () => {
    if (!workerPage || !currentUser || !db) return;

    if (workerName) workerName.textContent = currentUserData.fullName || currentUser.email || "Worker";
    if (workerCode)
      workerCode.textContent =
        currentUserData.workerId || currentUserData.clientCode || currentUser.uid;
    if (workerPhone) workerPhone.textContent = currentUserData.cellphone || "—";
    if (workerEmail) workerEmail.textContent = currentUserData.email || currentUser.email || "—";
    if (workerRating) {
      const rating = Number(currentUserData.ratingAverage || 0);
      const count = Number(currentUserData.ratingCount || 0);
      workerRating.textContent = rating ? `${rating.toFixed(1)} (${count})` : "—";
    }

    if (workerSosButton) {
      workerSosButton.addEventListener("click", async () => {
        if (!currentUser) return;
        try {
          await db
            .collection("users")
            .doc(currentUser.uid)
            .collection("sosAlerts")
            .add({
              source: "web",
              createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            });
          showMessage("SOS alert sent. Support has been notified.");
        } catch (error) {
          showMessage("Unable to send SOS alert. Please call support.");
        }
      });
    }

    if (workerCallButton) {
      workerCallButton.addEventListener("click", async () => {
        if (!currentUser) return;
        try {
          await db
            .collection("users")
            .doc(currentUser.uid)
            .collection("callSupportAlerts")
            .add({
              source: "web",
              createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            });
        } catch (error) {
          // ignore write failure
        }
        window.location.href = "tel:0792941992";
      });
    }

    if (!workerFiltersBound && workerFilters.length) {
      workerFiltersBound = true;
      workerFilters.forEach((button) => {
        button.addEventListener("click", () => {
          workerFilters.forEach((item) => item.classList.remove("is-active"));
          button.classList.add("is-active");
          workerFilter = button.dataset.workerFilter || "today";
          renderWorkerJobs();
        });
      });
    }

    const renderWorkerJobs = () => {
      if (!workerJobsList) return;
      let filtered = [...workerBookingsCache];
      const now = new Date();

      if (workerFilter === "today") {
        filtered = filtered.filter((item) => {
          const date = resolveBookingDate(item);
          return date && new Date(date).toDateString() === now.toDateString();
        });
      } else if (workerFilter === "upcoming") {
        filtered = filtered.filter((item) => {
          const date = resolveBookingDate(item);
          return date && date >= now;
        });
      } else if (workerFilter === "completed") {
        filtered = filtered.filter((item) => isCompletedBooking(item));
      }

      workerJobsList.innerHTML = "";
      if (!filtered.length) {
        clearList(workerJobsList, "No jobs to show.");
        return;
      }

      filtered.forEach((booking) => {
        const scheduled = resolveBookingDate(booking);
        const card = createRoleCard({
          title: resolveServiceSummary(booking),
          meta: buildBookingMeta(booking),
        });
        workerJobsList.appendChild(card);
      });
    };

    const renderWorkerDashboard = () => {
      const now = new Date();
      const today = workerBookingsCache.filter((item) => {
        const date = resolveBookingDate(item);
        return date && date.toDateString() === now.toDateString();
      });
      const upcoming = workerBookingsCache.filter((item) => {
        const date = resolveBookingDate(item);
        return date && date >= now;
      });
      const completed = workerBookingsCache.filter((item) => isCompletedBooking(item));

      if (workerStatToday) workerStatToday.textContent = `${today.length}`;
      if (workerStatUpcoming) workerStatUpcoming.textContent = `${upcoming.length}`;
      if (workerStatCompleted) workerStatCompleted.textContent = `${completed.length}`;

      if (workerNextJob) {
        workerNextJob.innerHTML = "";
        if (upcoming.length) {
          const sorted = [...upcoming].sort((a, b) => {
            const ad = resolveBookingDate(a) || new Date(0);
            const bd = resolveBookingDate(b) || new Date(0);
            return ad - bd;
          });
          const next = sorted[0];
          const card = createRoleCard({
            title: resolveServiceSummary(next),
            meta: buildBookingMeta(next),
          });
          workerNextJob.appendChild(card);
        } else {
          const empty = document.createElement("p");
          empty.className = "role-card-meta";
          empty.textContent = "No upcoming jobs yet.";
          workerNextJob.appendChild(empty);
        }
      }

      renderWorkerJobs();
    };

    if (workerBookingsListener) workerBookingsListener();
    workerBookingsListener = db
      .collection("users")
      .doc(currentUser.uid)
      .collection("bookings")
      .onSnapshot(
        (snapshot) => {
          workerBookingsCache = snapshot.docs.map((doc) => doc.data() || {});
          renderWorkerDashboard();
        },
        () => {
          showMessage("We couldn't load jobs. Please try again.");
        }
      );
  };

  const initRealEstateDashboard = async () => {
    if (!agentPage || !db || !currentUser || agentDataLoaded) return;
    agentDataLoaded = true;

    if (agentName) {
      agentName.textContent = currentUserData.fullName || currentUser.email || "Agent";
    }
    if (agentCompany) {
      agentCompany.textContent = currentUserData.realEstateCompany || "—";
    }
    const resolvedAgentCode =
      currentUserData.realEstateId ||
      currentUserData.realEstateCode ||
      currentUserData.clientCode ||
      "";
    if (agentCode) {
      agentCode.textContent = resolvedAgentCode || "—";
    }
    if (agentPhone) agentPhone.textContent = currentUserData.cellphone || "—";
    if (agentEmail) agentEmail.textContent = currentUserData.email || currentUser.email || "—";
    if (agentId) agentId.textContent = currentUserData.IdNumber || "—";

    try {
      const queries = [];
      if (resolvedAgentCode) {
        queries.push(db.collectionGroup("properties").where("realEstateCode", "==", resolvedAgentCode));
        queries.push(db.collectionGroup("bookings").where("realEstateCode", "==", resolvedAgentCode));
        queries.push(db.collection("users").where("realEstateCode", "==", resolvedAgentCode));
      }
      queries.push(db.collectionGroup("properties").where("realEstateAgentId", "==", currentUser.uid));
      queries.push(db.collectionGroup("bookings").where("realEstateAgentId", "==", currentUser.uid));
      queries.push(db.collection("users").where("realEstateAgentId", "==", currentUser.uid));

      const results = await Promise.all(
        queries.map(async (query) => {
          try {
            const snap = await query.get();
            return snap.docs.map((doc) => ({
              id: doc.id,
              path: doc.ref.path,
              data: doc.data(),
              ref: doc.ref,
            }));
          } catch (error) {
            return [];
          }
        })
      );

      const properties = new Map();
      const bookings = new Map();
      const clients = new Map();

      results.forEach((items) => {
        items.forEach((item) => {
          if (item.path.includes("/properties/")) {
            properties.set(item.path, item);
          } else if (item.path.includes("/bookings/")) {
            bookings.set(item.path, item);
          } else if (item.path.startsWith("users/")) {
            clients.set(item.id, item);
          }
        });
      });

      const propertyList = Array.from(properties.values());
      const bookingList = Array.from(bookings.values());
      const clientList = Array.from(clients.values());

      if (agentStatProperties) agentStatProperties.textContent = `${propertyList.length}`;
      if (agentStatBookings) agentStatBookings.textContent = `${bookingList.length}`;
      if (agentStatClients) agentStatClients.textContent = `${clientList.length}`;

      const curatedClientIds = new Set();
      propertyList.forEach((item) => {
        const userId = item.data.userId || item.data.ownerId;
        if (userId) curatedClientIds.add(userId);
      });
      bookingList.forEach((item) => {
        const userId = item.data.userId || item.data.clientId;
        if (userId) curatedClientIds.add(userId);
        if (item.data.clientCode) curatedClientIds.add(item.data.clientCode);
      });
      const curatedCount = clientList.filter((client) => {
        const code = client.data.clientCode;
        return curatedClientIds.has(client.id) || (code && curatedClientIds.has(code));
      }).length;
      if (agentStatCurated) agentStatCurated.textContent = `${curatedCount}`;

      if (agentRecentBookings) {
        agentRecentBookings.innerHTML = "";
        const sorted = bookingList
          .slice()
          .sort((a, b) => {
            const ad = resolveBookingDate(a.data) || new Date(0);
            const bd = resolveBookingDate(b.data) || new Date(0);
            return bd - ad;
          })
          .slice(0, 6);
        if (!sorted.length) {
          clearList(agentRecentBookings, "Recent bookings will appear here.");
        } else {
          sorted.forEach((item) => {
            const data = item.data || {};
            const scheduled = resolveBookingDate(data);
            const card = createRoleCard({
              title: resolveServiceSummary(data),
              meta: buildBookingMeta(data),
            });
            agentRecentBookings.appendChild(card);
          });
        }
      }

      if (agentClientsList) {
        agentClientsList.innerHTML = "";
        if (!clientList.length) {
          clearList(agentClientsList, "Clients will appear here.");
        } else {
          clientList.forEach((client) => {
            const data = client.data || {};
            const fullName = data.fullName || data.name || "Client";
            const code = data.clientCode || data.realEstateCode || client.id;
            const phone = data.cellphone || "";
            const email = data.email || "";
            const contact = [phone, email].filter(Boolean).join(" · ");
            const card = createRoleCard({
              title: fullName,
              meta: [code ? `Code: ${code}` : "", contact],
            });
            agentClientsList.appendChild(card);
          });
        }
      }

      if (agentPropertiesList) {
        agentPropertiesList.innerHTML = "";
        if (!propertyList.length) {
          clearList(agentPropertiesList, "Properties will appear here.");
        } else {
          propertyList.forEach((item) => {
            const data = item.data || {};
            const status = data.isSold ? "Sold" : "Active";
            const priceCents = Number(data.listingPriceCents || data.priceCents || 0);
            const price = priceCents ? `Listing: R${(priceCents / 100).toFixed(2)}` : "";
            const card = createRoleCard({
              title: data.name || "Property",
              meta: [data.address || "", status, price],
            });
            agentPropertiesList.appendChild(card);
          });
        }
      }

      if (agentBookingsList) {
        agentBookingsList.innerHTML = "";
        if (!bookingList.length) {
          clearList(agentBookingsList, "Bookings will appear here.");
        } else {
          bookingList
            .sort((a, b) => {
              const ad = resolveBookingDate(a.data) || new Date(0);
              const bd = resolveBookingDate(b.data) || new Date(0);
              return bd - ad;
            })
            .forEach((item) => {
              const data = item.data || {};
              const scheduled = resolveBookingDate(data);
              const card = createRoleCard({
                title: resolveServiceSummary(data),
                meta: buildBookingMeta(data),
              });
              agentBookingsList.appendChild(card);
            });
        }
      }
    } catch (error) {
      showMessage("We couldn't load the agent dashboard. Please try again.");
    }
  };

  const initAdminDashboard = async () => {
    if (!adminPage || !db || !currentUser || adminDataLoaded) return;
    adminDataLoaded = true;

    const normalizeDashboardDocs = (items, options = {}) => {
      const { includePath = false } = options;
      if (!Array.isArray(items)) return [];
      return items.map((item) => ({
        id: String(item?.id || "").trim(),
        ...(includePath ? { path: String(item?.path || "").trim() } : {}),
        data: item?.data && typeof item.data === "object" ? item.data : {},
      }));
    };

    let users = [];
    let bookings = [];
    let mandates = [];
    let incidents = [];
    let notifications = [];
    let dashboardLoadedFromServer = false;

    try {
      if (functions) {
        const result = await functions.httpsCallable("adminGetPortalDashboard")({ limit: 50 });
        users = normalizeDashboardDocs(result?.data?.users);
        bookings = normalizeDashboardDocs(result?.data?.bookings, { includePath: true }).filter((booking) =>
          shouldIncludeAdminBooking(booking.data)
        );
        mandates = normalizeDashboardDocs(result?.data?.mandates, { includePath: true });
        incidents = normalizeDashboardDocs(result?.data?.incidents, { includePath: true });
        notifications = normalizeDashboardDocs(result?.data?.notifications, { includePath: true });
        dashboardLoadedFromServer = true;
      } else {
        const userSnap = await db.collection("users").get();
        users = userSnap.docs.map((doc) => ({ id: doc.id, data: doc.data() || {} }));
      }
    } catch (error) {
      if (functions) {
        try {
          const result = await functions.httpsCallable("adminGetPortalUsers")();
          users = normalizeDashboardDocs(result?.data?.users);
        } catch (callableFallbackError) {
          try {
            const userSnap = await db.collection("users").get();
            users = userSnap.docs.map((doc) => ({ id: doc.id, data: doc.data() || {} }));
          } catch (fallbackError) {
            adminDataLoaded = false;
            showMessage("We couldn't load client data. Please try again.");
            return;
          }
        }
      } else {
        try {
          const userSnap = await db.collection("users").get();
          users = userSnap.docs.map((doc) => ({ id: doc.id, data: doc.data() || {} }));
        } catch (fallbackError) {
          adminDataLoaded = false;
          showMessage("We couldn't load client data. Please try again.");
          return;
        }
      }
    }

    const clients = [];
    const agents = [];
    const workers = [];

    users.forEach((user) => {
      const role = resolveRole(user.data);
      if (role === "admin") return;
      if (role === "realestate") {
        agents.push(user);
      } else if (role === "worker" || role === "inspector") {
        workers.push(user);
      } else {
        clients.push(user);
      }
    });

    if (adminStatClients) adminStatClients.textContent = `${clients.length}`;
    if (adminStatAgents) adminStatAgents.textContent = `${agents.length}`;
    if (adminStatWorkers) adminStatWorkers.textContent = `${workers.length}`;

    const renderUserList = (container, items, emptyText) => {
      if (!container) return;
      container.innerHTML = "";
      if (!items.length) {
        clearList(container, emptyText);
        return;
      }
      items.forEach((user) => {
        const data = user.data || {};
        const name = data.fullName || data.name || "User";
        const code = data.clientCode || data.realEstateCode || data.workerId || user.id;
        const email = data.email || "";
        const phone = data.cellphone || "";
        const contact = [phone, email].filter(Boolean).join(" · ");
        const card = createRoleCard({
          title: name,
          meta: [code ? `Code: ${code}` : "", contact],
        });
        container.appendChild(card);
      });
    };

    renderUserList(adminClientsList, clients, "Clients will appear here.");
    renderUserList(adminAgentsList, agents, "Agents will appear here.");
    renderUserList(adminWorkersList, workers, "Workers will appear here.");

    if (!dashboardLoadedFromServer) {
      try {
        let query = db.collectionGroup("bookings").orderBy("timestamp", "desc").limit(30);
        let snap = await query.get();
        bookings = snap.docs
          .map((doc) => ({ id: doc.id, data: doc.data() || {} }))
          .filter((booking) => shouldIncludeAdminBooking(booking.data));
      } catch (error) {
        try {
          let query = db.collectionGroup("bookings").orderBy("createdAt", "desc").limit(30);
          let snap = await query.get();
          bookings = snap.docs
            .map((doc) => ({ id: doc.id, data: doc.data() || {} }))
            .filter((booking) => shouldIncludeAdminBooking(booking.data));
        } catch (err) {
          try {
            let snap = await db.collectionGroup("bookings").limit(30).get();
            bookings = snap.docs
              .map((doc) => ({ id: doc.id, data: doc.data() || {} }))
              .filter((booking) => shouldIncludeAdminBooking(booking.data));
          } catch (finalError) {
            showMessage("We couldn't load bookings. Please try again.");
          }
        }
      }
    }

    if (adminStatBookings) adminStatBookings.textContent = `${bookings.length}`;

    const renderBookingList = (container, items, emptyText) => {
      if (!container) return;
      container.innerHTML = "";
      if (!items.length) {
        clearList(container, emptyText);
        return;
      }
      items.forEach((booking) => {
        const data = booking.data || {};
        const scheduled = resolveBookingDate(data);
        const clientLabel = data.clientCode || data.userId || "Client";
        const card = createRoleCard({
          title: resolveServiceSummary(data),
          meta: buildBookingMeta({ ...data, clientCode: clientLabel }),
        });
        container.appendChild(card);
      });
    };

    if (adminRecentBookings) {
      renderBookingList(adminRecentBookings, bookings.slice(0, 6), "Bookings will appear here.");
    }
    if (adminBookingsList) {
      renderBookingList(adminBookingsList, bookings, "Bookings will appear here.");
    }

    if (!dashboardLoadedFromServer) {
      try {
        const mandateSnap = await db.collection("mandate_requests").orderBy("createdAt", "desc").limit(30).get();
        mandates = mandateSnap.docs.map((doc) => ({ id: doc.id, data: doc.data() || {} }));
      } catch (error) {
        try {
          const mandateSnap = await db.collection("mandate_requests").limit(30).get();
          mandates = mandateSnap.docs.map((doc) => ({ id: doc.id, data: doc.data() || {} }));
        } catch (fallbackError) {
          mandates = [];
        }
      }
    }

    if (adminStatMandates) adminStatMandates.textContent = `${mandates.length}`;

    if (adminMandatesList) {
      adminMandatesList.innerHTML = "";
      if (!mandates.length) {
        clearList(adminMandatesList, "Mandate requests will appear here.");
      } else {
        mandates.forEach((mandate) => {
          const data = mandate.data || {};
          const card = createRoleCard({
            title: data.mandateReference || data.clientCode || mandate.id,
            meta: [
              data.clientCode ? `Client: ${data.clientCode}` : "",
              data.debtorBankName ? `Bank: ${data.debtorBankName}` : "",
              data.maskedAccountNumber ? `Account: ${data.maskedAccountNumber}` : "",
              Number(data.mandateAmountCents || 0)
                ? `Amount: ${formatCurrency(data.mandateAmountCents || 0)}`
                : "",
              data.status ? `Status: ${formatStatusLabel(data.status)}` : "",
              data.statusReason || "",
              data.createdAt ? formatDateTime(toDate(data.createdAt)) : "",
            ],
          });
          adminMandatesList.appendChild(card);
        });
      }
    }

    if (!dashboardLoadedFromServer) {
      try {
        const incidentSnap = await db.collectionGroup("incidents").orderBy("createdAt", "desc").limit(50).get();
        incidents = incidentSnap.docs.map((doc) => ({ id: doc.id, path: doc.ref.path, data: doc.data() || {} }));
      } catch (error) {
        try {
          const incidentSnap = await db.collectionGroup("incidents").orderBy("timestamp", "desc").limit(50).get();
          incidents = incidentSnap.docs.map((doc) => ({ id: doc.id, path: doc.ref.path, data: doc.data() || {} }));
        } catch (fallbackError) {
          try {
            const incidentSnap = await db.collectionGroup("incidents").limit(50).get();
            incidents = incidentSnap.docs.map((doc) => ({ id: doc.id, path: doc.ref.path, data: doc.data() || {} }));
          } catch (finalError) {
            incidents = [];
          }
        }
      }
    }

    incidents.sort((a, b) => {
      const aDate = toDate(a.data.createdAt || a.data.timestamp) || new Date(0);
      const bDate = toDate(b.data.createdAt || b.data.timestamp) || new Date(0);
      return bDate - aDate;
    });

    if (adminStatIncidents) adminStatIncidents.textContent = `${incidents.length}`;

    if (adminIncidentsList) {
      adminIncidentsList.innerHTML = "";
      if (!incidents.length) {
        clearList(adminIncidentsList, "Incidents will appear here.");
      } else {
        incidents.forEach((incident) => {
          const data = incident.data || {};
          const title = String(data.title || "Incident").trim();
          const details = String(data.details || data.description || "").trim();
          const reporter = String(data.reporterName || data.clientCode || data.userId || "").trim();
          const role = String(data.reportedByRole || data.sourceInterface || "").trim();
          const type = String(data.incidentType || "").trim();
          const status = String(data.status || "open").trim() || "open";
          const createdAt = toDate(data.createdAt || data.timestamp);
          const respondedAt = toDate(data.adminResponseAt);
          const latestReply = String(data.adminResponseMessage || "").trim();
          const repliedBy = String(data.adminResponseBy || "").trim();
          const card = createRoleCard({
            title,
            meta: [
              reporter ? `Reporter: ${reporter}` : "",
              role ? `Interface: ${formatStatusLabel(role)}` : "",
              type ? `Type: ${formatStatusLabel(type)}` : "",
              details,
              createdAt ? formatDateTime(createdAt) : "",
            ],
            badge: formatStatusLabel(status),
          });

          if (latestReply) {
            const responsePanel = document.createElement("div");
            responsePanel.className = "role-card-response";

            const responseLabel = document.createElement("p");
            responseLabel.className = "role-card-response-label";
            responseLabel.textContent = "Latest admin response";
            responsePanel.appendChild(responseLabel);

            const responseMessage = document.createElement("p");
            responseMessage.className = "role-card-response-message";
            responseMessage.textContent = latestReply;
            responsePanel.appendChild(responseMessage);

            const responseMeta = [repliedBy ? `By ${repliedBy}` : "", respondedAt ? formatDateTime(respondedAt) : ""]
              .filter(Boolean)
              .join(" · ");
            if (responseMeta) {
              const responseMetaEl = document.createElement("p");
              responseMetaEl.className = "role-card-response-meta";
              responseMetaEl.textContent = responseMeta;
              responsePanel.appendChild(responseMetaEl);
            }

            card.appendChild(responsePanel);
          }

          const actions = document.createElement("div");
          actions.className = "role-card-actions";
          const isReplying = adminIncidentReplying.has(incident.path || incident.id);

          ADMIN_INCIDENT_QUICK_REPLIES.forEach((reply) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "role-quick-reply";
            button.textContent = reply.label;
            button.disabled = !functions || isReplying;
            button.addEventListener("click", async () => {
              if (!functions) return;
              const replyKey = incident.path || incident.id;
              if (adminIncidentReplying.has(replyKey)) return;
              adminIncidentReplying.add(replyKey);
              actions.querySelectorAll(".role-quick-reply").forEach((actionButton) => {
                actionButton.disabled = true;
              });
              button.textContent = "Sending...";
              setFeedback(adminIncidentFeedback, "");
              adminDataLoaded = false;
              try {
                const result = await functions.httpsCallable("respondToIncidentReport")({
                  incidentPath: incident.path,
                  incidentId: incident.id,
                  replyMessage: reply.message,
                });
                setFeedback(adminIncidentFeedback, String(result?.data?.message || "Incident response sent."));
                await initAdminDashboard();
              } catch (error) {
                setFeedback(adminIncidentFeedback, error.message || "Unable to send incident response.", true);
              } finally {
                adminIncidentReplying.delete(replyKey);
              }
            });
            actions.appendChild(button);
          });

          card.appendChild(actions);
          adminIncidentsList.appendChild(card);
        });
      }
    }

    if (adminMandateExportButton && functions && !adminMandatesBound) {
      adminMandatesBound = true;
      adminMandateExportButton.addEventListener("click", async () => {
        setFeedback(adminMandateFeedback, "");
        try {
          const result = await functions.httpsCallable("exportNuPayMandatesCsv")({ limit: 200 });
          const payload = result.data || {};
          if (!Number(payload.count || 0)) {
            setFeedback(adminMandateFeedback, "No queued mandates are ready for export.");
            return;
          }
          downloadBase64File(payload.csvBase64, payload.fileName, "text/csv;charset=utf-8");
          setFeedback(
            adminMandateFeedback,
            `Exported ${payload.count} mandate${Number(payload.count) === 1 ? "" : "s"} to ${payload.fileName}.`
          );
          adminDataLoaded = false;
          initAdminDashboard();
        } catch (error) {
          setFeedback(adminMandateFeedback, error.message || "Unable to export mandates.", true);
        }
      });
    }

    if (adminCommsForm && !adminCommsBound) {
      adminCommsBound = true;
      adminCommsForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        setFeedback(adminCommsFeedback, "");
        const formData = new FormData(adminCommsForm);
        const title = String(formData.get("title") || "").trim();
        const message = String(formData.get("message") || "").trim();
        const target = String(formData.get("target") || "all").trim();
        const targetUserIdRaw = String(formData.get("targetUserId") || "").trim();

        if (!title || !message) {
          setFeedback(adminCommsFeedback, "Enter both a title and message.", true);
          return;
        }

        const sourceId = db.collection("admin_notifications").doc().id;
        const baseData = {
          title,
          message,
          body: message,
          target,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          createdBy: currentUser.uid,
          sourceId,
          timestamp: firebase.firestore.FieldValue.serverTimestamp(),
          isRead: false,
        };

        if (target === "user") {
          let targetUserId = targetUserIdRaw;
          if (!targetUserId) {
            setFeedback(adminCommsFeedback, "Provide a target user ID or client code.", true);
            return;
          }
          let userDoc = await db.collection("users").doc(targetUserId).get();
          if (!userDoc.exists) {
            const query = await db
              .collection("users")
              .where("clientCode", "==", targetUserId)
              .limit(1)
              .get();
            if (!query.empty) {
              userDoc = query.docs[0];
              targetUserId = userDoc.id;
            }
          }
          if (!userDoc.exists) {
            setFeedback(adminCommsFeedback, "User not found for that ID or client code.", true);
            return;
          }
          await db.collection("users").doc(targetUserId).collection("notifications").add({
            ...baseData,
            userId: targetUserId,
          });
        } else {
          const batches = [];
          let batch = db.batch();
          let count = 0;
          users.forEach((user) => {
            const ref = db.collection("users").doc(user.id).collection("messages").doc();
            batch.set(ref, { ...baseData, userId: user.id });
            count += 1;
            if (count >= 400) {
              batches.push(batch.commit());
              batch = db.batch();
              count = 0;
            }
          });
          if (count > 0) {
            batches.push(batch.commit());
          }
          await Promise.all(batches);
        }

        await db.collection("admin_notifications").doc(sourceId).set(baseData);
        setFeedback(adminCommsFeedback, "Notification sent.");
        adminCommsForm.reset();
        adminDataLoaded = false;
        initAdminDashboard();
      });
    }

    if (adminCommsRecent) {
      if (!dashboardLoadedFromServer) {
        try {
          const commsSnap = await db
            .collection("admin_notifications")
            .orderBy("createdAt", "desc")
            .limit(20)
            .get();
          notifications = commsSnap.docs.map((doc) => ({ id: doc.id, data: doc.data() || {} }));
        } catch (error) {
          notifications = [];
        }
      }

      adminCommsRecent.innerHTML = "";
      if (!notifications.length) {
        clearList(adminCommsRecent, "Notifications will appear here.");
      } else {
        notifications.forEach((note) => {
          const data = note.data || {};
          const card = createRoleCard({
            title: data.title || "Notification",
            meta: [
              data.body || data.message || "",
              data.target ? `Target: ${data.target}` : "",
              data.createdAt ? formatDateTime(toDate(data.createdAt)) : "",
            ],
          });
          adminCommsRecent.appendChild(card);
        });
      }
    }
  };

  if (loginPage) {
    const pending = sessionStorage.getItem("portalPendingOtp");
    if (pending && otpPanel) {
      pendingOtpUserId = pending;
      otpPanel.classList.remove("is-hidden");
    }
  }

  auth.onAuthStateChanged(async (user) => {
    currentUser = user;

    if (!user) {
      stopUserListener();
      stopPayNowListener();
      stopBookingPropertiesListener();
      if (workerBookingsListener) workerBookingsListener();
      workerBookingsListener = null;
      workerBookingsCache = [];
      agentDataLoaded = false;
      adminDataLoaded = false;
      pendingSecurityChange = null;
      bookingProperties = [];
      resetBookingDraft({ preserveProperty: false });
      renderBookingProperties();
      renderBookingCategories();
      renderBookingServices();
      renderBookingHeroState();
      renderBookingSummary();
      setBookingSheetOpen(false);
      closeSettingsOtpPanel();
      if (activationPage || bookingPage || rolePage) {
        redirectTo("portal-login.html");
      }
      return;
    }

    if (loginPage) {
      const pendingOtp = sessionStorage.getItem("portalPendingOtp");
      if (pendingOtp && pendingOtp === user.uid) {
        pendingOtpUserId = pendingOtp;
        if (otpPanel) otpPanel.classList.remove("is-hidden");
        return;
      }
    }

    let profileDoc = null;
    try {
      profileDoc = await db.collection("users").doc(user.uid).get();
    } catch (error) {
      if (loginPage && registrationProfilePending) {
        return;
      }
      showMessage("We could not load your profile. Please contact support.");
      return;
    }

    if (!profileDoc || !profileDoc.exists) {
      if (loginPage && registrationProfilePending) {
        return;
      }
      showMessage("We could not load your profile. Please contact support.");
      return;
    }

    currentUserData = profileDoc.data();
    const role = resolveRole(currentUserData);

    if (rolePage) {
      if (!isRolePageForRole(role)) {
        redirectToRole(role);
        return;
      }
      if (userNameLabel) {
        userNameLabel.textContent = formatWelcomeName(currentUserData, currentUser.email, "User");
      }
      if (role === "worker" || role === "inspector") {
        initWorkerDashboard();
      } else if (role === "realestate") {
        initRealEstateDashboard();
      } else if (role === "admin") {
        initAdminDashboard();
      }
      return;
    }

    if (activationPage) {
      if (role !== "client") {
        redirectToRole(role);
        return;
      }
      if (userNameLabel) {
        userNameLabel.textContent = formatWelcomeName(
          currentUserData,
          currentUser.email,
          "Client"
        );
      }
      updateDashboard(currentUserData);
      startUserListener(user.uid, updateDashboard);
      return;
    }

    if (bookingPage) {
      if (role !== "client") {
        redirectToRole(role);
        return;
      }
      if (userNameLabel) {
        userNameLabel.textContent = formatWelcomeName(
          currentUserData,
          currentUser.email,
          "Client"
        );
      }
      updateDashboard(currentUserData);
      startUserListener(user.uid, updateDashboard);
      return;
    }

    if (loginPage) {
      redirectToRole(role);
    }
  });
}
