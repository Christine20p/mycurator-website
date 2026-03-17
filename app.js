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

function initServiceImageDissolve() {
  const serviceCards = Array.from(document.querySelectorAll(".service-category-card"));
  if (!serviceCards.length || prefersReduced) {
    return;
  }

  let frameId = null;

  const update = () => {
    const viewportHeight = window.innerHeight || 1;
    const start = viewportHeight * 0.92;
    const end = Math.max(88, viewportHeight * 0.16);

    serviceCards.forEach((card) => {
      const rect = card.getBoundingClientRect();
      const progress = Math.min(Math.max((start - rect.top) / (start - end), 0), 1);
      card.style.setProperty("--media-progress", progress.toFixed(3));
    });

    frameId = null;
  };

  const queueUpdate = () => {
    if (!frameId) {
      frameId = window.requestAnimationFrame(update);
    }
  };

  update();
  window.addEventListener("scroll", queueUpdate, { passive: true });
  window.addEventListener("resize", queueUpdate);
}

initServiceImageDissolve();

if (navToggle && siteNav) {
  navToggle.addEventListener("click", () => {
    const isOpen = document.body.classList.toggle("nav-open");
    navToggle.setAttribute("aria-expanded", String(isOpen));
    if (navLabel) {
      navLabel.textContent = isOpen ? "Close" : "Menu";
    }
  });

  siteNav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      if (document.body.classList.contains("nav-open")) {
        document.body.classList.remove("nav-open");
        navToggle.setAttribute("aria-expanded", "false");
        if (navLabel) {
          navLabel.textContent = "Menu";
        }
      }
    });
  });
}

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
const signOutButton = document.querySelector("[data-signout]");
const bookingForm = document.querySelector("[data-booking-form]");
const paymentFeedback = document.querySelector("[data-payment-feedback]");
const bookingFeedback = document.querySelector("[data-booking-feedback]");
const bookingOpenPaymentButton = document.querySelector("[data-booking-open-payment]");
const loginFeedback = document.querySelector("[data-login-feedback]");
const registerFeedback = document.querySelector("[data-register-feedback]");
const otpFeedback = document.querySelector("[data-otp-feedback]");
const statusTitle = document.querySelector("[data-status-title]");
const statusMessage = document.querySelector("[data-status-message]");
const outstandingBadge = document.querySelector("[data-outstanding]");
const userNameLabel = document.querySelector("[data-user-name]");
const payNowButton = document.querySelector("[data-request-paynow]");
const openPayNowButton = document.querySelector("[data-open-paynow]");
const cardPayButton = document.querySelector("[data-request-card]");
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
const adminRecentBookings = document.querySelector("[data-admin-recent-bookings]");
const adminClientsList = document.querySelector("[data-admin-clients]");
const adminAgentsList = document.querySelector("[data-admin-agents]");
const adminWorkersList = document.querySelector("[data-admin-workers]");
const adminBookingsList = document.querySelector("[data-admin-bookings]");
const adminMandatesList = document.querySelector("[data-admin-mandates]");
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
let hasRedirectedToBooking = false;
let workerBookingsListener = null;
let workerBookingsCache = [];
let workerFilter = "today";
let agentDataLoaded = false;
let adminDataLoaded = false;
let workerFiltersBound = false;
let adminMandatesBound = false;
let adminCommsBound = false;

const CUSTOM_MANDATE_BANK_ID = "__other__";

const showMessage = (message) => {
  if (!portalMessage) return;
  portalMessage.textContent = message;
  portalMessage.classList.add("is-visible");
};

const clearMessage = () => {
  if (!portalMessage) return;
  portalMessage.textContent = "";
  portalMessage.classList.remove("is-visible");
};

const setFeedback = (el, message, isError = false) => {
  if (!el) return;
  el.textContent = message;
  el.style.color = isError ? "crimson" : "inherit";
};

const disableForm = (form, disabled) => {
  if (!form) return;
  form.querySelectorAll("input, select, textarea, button").forEach((el) => {
    el.disabled = disabled;
  });
};

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
  if (statusTitle) statusTitle.textContent = "Loading your profile...";
  if (statusMessage) statusMessage.textContent = "We are fetching your account status.";
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
    currentUserData = doc.data();
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

  const formatCurrency = (cents) => {
    if (!cents) return "R0.00";
    return `R${(cents / 100).toFixed(2)}`;
  };

  const toIsoDateValue = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const buildDefaultMandateStartDate = (collectionDay) => {
    const today = new Date();
    const target = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 2, 0).getDate();
    const safeDay = Math.min(Math.max(Number(collectionDay || 1), 1), monthEnd);
    target.setDate(safeDay);
    return toIsoDateValue(target);
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

  const prefillMandateForm = (data) => {
    if (!mandateForm || !data) return;
    const reference = String(data.mandateReference || data.clientCode || currentUser?.uid || "").trim();
    const amountCents = Number(data.mandateAmountCents || 0);
    const bankSelect = mandateForm.querySelector("select[name='debtor_bank_id']");
    const customBankIdField = mandateForm.querySelector("input[name='custom_bank_id']");
    const customBankNameField = mandateForm.querySelector("input[name='custom_bank_name']");
    const storedBankId = String(data.mandateDebtorBankId || "").trim();
    const storedBankName = String(data.mandateDebtorBankName || "").trim();
    const hasPresetBank = Boolean(
      bankSelect && storedBankId && Array.from(bankSelect.options).some((option) => option.value === storedBankId)
    );
    if (mandateAmountLabel) {
      mandateAmountLabel.textContent = `Monthly amount: ${formatCurrency(amountCents)}`;
    }
    if (mandateReferenceLabel) {
      mandateReferenceLabel.textContent = reference || "Pending";
    }

    setMandateFieldIfEmpty("input[name='debtor_name']", data.fullName || "");
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
    setMandateFieldIfEmpty("select[name='debtor_account_type']", data.mandateAccountType || "1");
    setMandateFieldIfEmpty("select[name='debtor_id_type']", data.mandateIdType || "2");
    setMandateFieldIfEmpty("input[name='debtor_id']", data.IdNumber || "");
    setMandateFieldIfEmpty(
      "input[name='start_date']",
      data.mandateStartDate || buildDefaultMandateStartDate(data.mandateCollectionDay || 1)
    );
    setMandateFieldIfEmpty(
      "input[name='collection_day']",
      String(Number(data.mandateCollectionDay || 1) || 1)
    );
    setMandateFieldIfEmpty(
      "input[name='tracking_days']",
      "10"
    );
    syncCustomMandateBankFields();
  };

  const normalizedStatus = (value) =>
    String(value || "")
      .trim()
      .toLowerCase();

  const updateStep = (key, value) => {
    stepElements.forEach((el) => {
      if (el.dataset.step === key) {
        el.textContent = value;
      }
    });
  };

  const updateDashboard = (data) => {
    if (!data) return;

    if (userNameLabel) {
      userNameLabel.textContent = formatWelcomeName(data, currentUser?.email, "Client");
    }

    const adminFeePaid = data.adminFeePaid === true;
    const inspectionDone = ["completed", "complete", "done"].includes(
      normalizedStatus(data.inspectionStatus)
    );
    const outstandingBalance = Number(data.outstandingBalanceCents || 0);
    const hasOutstanding = outstandingBalance > 0;
    const mandateOfferStatus = normalizedStatus(data.mandateOfferStatus);
    const mandateStatus = normalizedStatus(data.mandateStatus);
    const mandateActive = ["active", "accepted", "signed", "future"].includes(mandateStatus);
    const mandateInFlight = [
      "requested",
      "queued",
      "submitted",
      "exported",
      "pending_signature",
      "pending_authorisation",
      "pending_authorization",
      "processing",
    ].includes(mandateStatus);
    const mandateFailed = [
      "submission_failed",
      "rejected",
      "cancelled",
      "expired",
      "inactive",
      "suspended",
    ].includes(mandateStatus);
    const hasMandateOffer =
      mandateOfferStatus === "offered" && Number(data.mandateAmountCents || 0) > 0;
    const servicesEnabled = data.servicesEnabled === true;
    const mandateReason = String(data.mandateReason || "").trim();
    const mandateUrl = String(data.mandateUrl || "").trim();

    let title = "Access Granted";
    let message = "Your account is active. You can submit bookings below.";

    if (hasOutstanding) {
      title = "Outstanding Balance";
      message = `Please pay the outstanding amount of ${formatCurrency(outstandingBalance)} before continuing.`;
    } else if (!adminFeePaid) {
      title = "Property Presentation Assessment Fee Required";
      message = `Please pay the once-off assessment fee of ${formatCurrency(
        data.adminFeeCents || 29999
      )}.`;
    } else if (!inspectionDone) {
      title = "Inspection Pending";
      message = "We will schedule your inspection and notify you once pricing is ready.";
    } else if (mandateFailed) {
      title = "Mandate Needs Attention";
      message =
        mandateReason || "Your DebiCheck mandate needs attention. Please review your details and resubmit.";
    } else if (hasMandateOffer && !mandateActive && !mandateInFlight) {
      title = "Monthly Price Awaiting Approval";
      message = `Your inspection is complete. A monthly price of ${formatCurrency(
        data.mandateAmountCents || 0
      )} is ready for acceptance.`;
    } else if (mandateInFlight) {
      title = "Mandate In Progress";
      message =
        mandateReason ||
        (mandateUrl
          ? "Your DebiCheck request is ready. Open the mandate link to continue."
          : "Your DebiCheck request is being processed.");
    } else if (!mandateActive) {
      title = "Mandate Required";
      message = "Please complete your mandate before services can start.";
    } else if (!servicesEnabled) {
      title = "Activation Pending";
      message = "Your mandate is confirmed. Services will activate shortly.";
    }

    if (statusTitle) statusTitle.textContent = title;
    if (statusMessage) statusMessage.textContent = message;

    if (outstandingBadge) {
      if (hasOutstanding) {
        outstandingBadge.textContent = `Outstanding: ${formatCurrency(outstandingBalance)}`;
        outstandingBadge.classList.add("is-visible");
      } else {
        outstandingBadge.textContent = "";
        outstandingBadge.classList.remove("is-visible");
      }
    }

    updateStep("adminFee", adminFeePaid ? "Paid" : "Payment required");
    updateStep("inspection", inspectionDone ? "Completed" : "Pending");
    updateStep("offer", hasMandateOffer || mandateInFlight || mandateActive ? "Sent" : "Awaiting pricing");
    updateStep(
      "mandate",
      mandateActive ? "Active" : mandateFailed ? "Retry required" : mandateInFlight ? "In progress" : "Not started"
    );
    updateStep("activation", servicesEnabled ? "Active" : "Pending");

    const payNowUrl = String(data.payNowUrl || "");
    if (openPayNowButton) {
      if (payNowUrl) {
        openPayNowButton.classList.remove("is-hidden");
        openPayNowButton.onclick = () => window.open(payNowUrl, "_blank");
      } else {
        openPayNowButton.classList.add("is-hidden");
      }
    }

    const cardPayUrl = String(data.cardPayUrl || "");
    if (openCardButton) {
      if (cardPayUrl) {
        openCardButton.classList.remove("is-hidden");
        openCardButton.onclick = () => window.open(cardPayUrl, "_blank");
      } else {
        openCardButton.classList.add("is-hidden");
      }
    }

    if (openMandateButton) {
      if (mandateUrl) {
        openMandateButton.classList.remove("is-hidden");
        openMandateButton.onclick = () => window.open(mandateUrl, "_blank");
      } else {
        openMandateButton.classList.add("is-hidden");
      }
    }

    if (mandateButton) {
      if (hasMandateOffer && !mandateActive && !mandateInFlight) {
        mandateButton.classList.remove("is-hidden");
        prefillMandateForm(data);
      } else {
        mandateButton.classList.add("is-hidden");
        setMandateFormVisible(false);
      }
    }

    const canProceed =
      adminFeePaid && servicesEnabled && !hasOutstanding && inspectionDone && mandateActive;

    if (activationPage && canProceed && !hasRedirectedToBooking) {
      hasRedirectedToBooking = true;
      showMessage("Activation complete. Redirecting to booking request...");
      setTimeout(() => {
        window.location.href = "portal-booking.html";
      }, 1600);
    }

    if (bookingForm) {
      disableForm(bookingForm, !canProceed);
      if (bookingPage && !canProceed && !hasRedirectedToBooking) {
        showMessage("Complete activation before submitting a booking request.");
        setTimeout(() => {
          window.location.href = "app.html";
        }, 1600);
      }
    }
  };

  const generateClientCode = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "C";
    for (let i = 0; i < 6; i += 1) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  };

  const ensureUniqueClientCode = async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = generateClientCode();
      const snapshot = await db.collection("users").where("clientCode", "==", candidate).get();
      if (snapshot.empty) return candidate;
    }
    return `C-${Date.now().toString(36).toUpperCase()}`;
  };

  const isValidSouthAfricanID = (id) => {
    if (!/^[0-9]{13}$/.test(id)) return false;
    let sum = 0;
    for (let i = 0; i < id.length; i += 1) {
      const digit = Number(id[i]);
      if (Number.isNaN(digit)) return false;
      if (i % 2 === 0) {
        sum += digit;
      } else {
        const doubled = digit * 2;
        sum += doubled > 9 ? doubled - 9 : doubled;
      }
    }
    return sum % 10 === 0;
  };

  const dateOfBirthFromSouthAfricanID = (id) => {
    if (!/^[0-9]{6}/.test(id)) return "";
    const yy = Number(id.slice(0, 2));
    const mm = Number(id.slice(2, 4));
    const dd = Number(id.slice(4, 6));
    if (!yy || !mm || !dd) return "";
    const currentYear = new Date().getFullYear() % 100;
    const year = yy <= currentYear ? 2000 + yy : 1900 + yy;
    const date = new Date(year, mm - 1, dd);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleDateString("en-ZA", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  if (registerForm) {
    const idField = registerForm.querySelector("input[name='id_number']");
    const dobField = registerForm.querySelector("input[name='dob']");
    if (idField && dobField) {
      idField.addEventListener("input", () => {
        const value = idField.value.replace(/\D/g, "");
        idField.value = value;
        dobField.value = dateOfBirthFromSouthAfricanID(value);
      });
    }
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
      const email = loginForm?.login_email?.value?.trim();
      if (!email) {
        setFeedback(loginFeedback, "Enter your email first.", true);
        return;
      }
      try {
        await auth.sendPasswordResetEmail(email);
        setFeedback(loginFeedback, "Password reset email sent.");
      } catch (error) {
        setFeedback(loginFeedback, error.message || "Unable to send reset email.", true);
      }
    });
  }

  if (registerForm && auth && db) {
    registerForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      setFeedback(registerFeedback, "");
      setFeedback(otpFeedback, "");

      const formData = new FormData(registerForm);
      const title = String(formData.get("title") || "").trim();
      const fullName = String(formData.get("full_name") || "").trim();
      const surname = String(formData.get("surname") || "").trim();
      const idNumber = String(formData.get("id_number") || "").trim();
      const dob = String(formData.get("dob") || "").trim();
      const cellphone = String(formData.get("cellphone") || "").trim();
      const address = String(formData.get("address") || "").trim();
      const realEstateCode = String(formData.get("agent_code") || "").trim().toUpperCase();
      const email = String(formData.get("email") || "").trim().toLowerCase();
      const password = String(formData.get("password") || "");
      const confirmPassword = String(formData.get("confirm_password") || "");

      if (
        !title ||
        !fullName ||
        !surname ||
        !idNumber ||
        !cellphone ||
        !address ||
        !realEstateCode ||
        !email ||
        !password ||
        !confirmPassword
      ) {
        setFeedback(registerFeedback, "Please fill in all fields.", true);
        return;
      }

      if (!isValidSouthAfricanID(idNumber)) {
        setFeedback(registerFeedback, "Please enter a valid South African ID number.", true);
        return;
      }

      if (password !== confirmPassword) {
        setFeedback(registerFeedback, "Passwords do not match.", true);
        return;
      }

      const agentDoc = await db.collection("realEstateCodes").doc(realEstateCode).get();
      if (!agentDoc.exists) {
        setFeedback(
          registerFeedback,
          "We couldn't find that real estate agent code. Please check it and try again.",
          true
        );
        return;
      }
      const agentId = agentDoc.data().agentId;

      try {
        const result = await auth.createUserWithEmailAndPassword(email, password);
        const user = result.user;
        const clientCode = await ensureUniqueClientCode();
        const userData = {
          title,
          fullName,
          surname,
          IdNumber: idNumber,
          dateOfBirth: dob,
          clientCode,
          cellphone,
          address,
          realEstateCode,
          realEstateAgentId: agentId,
          adminFeeCents: 29999,
          adminFeePaid: false,
          servicesEnabled: false,
          inspectionStatus: "pending",
          outstandingBalanceCents: 0,
          outstandingReason: "",
          payNowStatus: "",
          payNowUrl: "",
          payNowReference: "",
          mandateStatus: "not_requested",
          mandateType: "debiCheck",
          mandateAmountCents: 0,
          mandateOfferStatus: "pending",
          mandateReference: clientCode,
          mandateAuthType: "DELAYED",
          mandateFrequencyCode: "MNTH",
          mandateInstalments: 12,
          mandateTrackingDays: 0,
          mandateDebitValueTypeId: "1",
          mandateCollectionDay: "1",
          mandateStatusCode: "",
          mandateReason: "",
          mandateUrl: "",
          mandatePdfLink: "",
          mandateStatusUpdatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          userType: "Contract",
          role: "contract",
          email,
          uid: user.uid,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        };

        await db.collection("users").doc(user.uid).set(userData);
        await db
          .collection("users")
          .doc(user.uid)
          .collection("properties")
          .doc("home")
          .set({
            name: "Home Address",
            address,
            userId: user.uid,
            isSold: false,
            servicesEnabled: false,
            billingActive: false,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            realEstateCode,
            realEstateAgentId: agentId,
          });

        pendingOtpUserId = user.uid;
        sessionStorage.setItem("portalPendingOtp", user.uid);
        if (otpPanel) {
          otpPanel.classList.remove("is-hidden");
        }
        setFeedback(
          registerFeedback,
          "Account created. Enter the OTP sent to your phone to complete registration."
        );

        await fetch(
          "https://africa-south1-mycurator-cf6ab.cloudfunctions.net/sendOTP",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: user.uid, type: "signup" }),
          }
        );
      } catch (error) {
        setFeedback(registerFeedback, error.message || "Unable to create account.", true);
      }
    });
  }

  if (otpVerifyButton) {
    otpVerifyButton.addEventListener("click", async () => {
      const otpInput = otpPanel?.querySelector("input[name='otp_code']");
      const code = otpInput?.value?.trim();
      if (!pendingOtpUserId) {
        pendingOtpUserId = sessionStorage.getItem("portalPendingOtp");
      }
      if (!code || !pendingOtpUserId) {
        setFeedback(otpFeedback, "Enter the OTP code to continue.", true);
        return;
      }
      try {
        const response = await fetch(
          "https://africa-south1-mycurator-cf6ab.cloudfunctions.net/verifyOTP",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: pendingOtpUserId, code }),
          }
        );
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error || "OTP verification failed.");
        }
        setFeedback(otpFeedback, "OTP verified. Redirecting to activation...");
        if (otpPanel) otpPanel.classList.add("is-hidden");
        sessionStorage.removeItem("portalPendingOtp");
        window.location.href = "app.html";
      } catch (error) {
        setFeedback(otpFeedback, error.message || "OTP verification failed.", true);
      }
    });
  }

  if (otpResendButton) {
    otpResendButton.addEventListener("click", async () => {
      if (!pendingOtpUserId) {
        pendingOtpUserId = sessionStorage.getItem("portalPendingOtp");
      }
      if (!pendingOtpUserId) return;
      try {
        await fetch(
          "https://africa-south1-mycurator-cf6ab.cloudfunctions.net/sendOTP",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: pendingOtpUserId, type: "signup" }),
          }
        );
        setFeedback(otpFeedback, "OTP resent.");
      } catch (error) {
        setFeedback(otpFeedback, "Unable to resend OTP.", true);
      }
    });
  }

  if (signOutButton && auth) {
    signOutButton.addEventListener("click", () => {
      auth.signOut();
    });
  }

  const startPaymentRequest = async (gateway) => {
    if (!currentUser || !currentUserData) return;
    setFeedback(paymentFeedback, "");
    if (openPayNowButton) openPayNowButton.classList.add("is-hidden");
    if (openCardButton) openCardButton.classList.add("is-hidden");
    const outstanding = Number(currentUserData.outstandingBalanceCents || 0);
    const adminFeePaid = currentUserData.adminFeePaid === true;
    const amountCents = outstanding > 0 ? outstanding : adminFeePaid ? 0 : currentUserData.adminFeeCents || 29999;
    if (!amountCents) {
      setFeedback(paymentFeedback, "No payment is required at this time.");
      return;
    }
    const requestId =
      (window.crypto && crypto.randomUUID && crypto.randomUUID()) ||
      `req-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const reference =
      String(currentUserData.payNowReference || currentUserData.clientCode || currentUser.uid).trim();
    const reason = outstanding > 0 ? "outstanding_balance" : "admin_fee";
    const description =
      reason === "admin_fee"
        ? "Property presentation assessment fee payment"
        : "Outstanding balance payment";

    try {
      await db.collection("paynow_requests").doc(requestId).set({
        requestId,
        userId: currentUser.uid,
        clientCode: currentUserData.clientCode || reference,
        reference,
        amountCents,
        status: "queued",
        type: reason,
        description,
        gateway: gateway || "ozow",
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        requestedBy: currentUser.uid,
      });

      const userUpdates =
        gateway === "peach"
          ? {
              cardPayStatus: "requested",
              cardPayReference: reference,
              cardPayRequestedAt: firebase.firestore.FieldValue.serverTimestamp(),
            }
          : {
              payNowStatus: "requested",
              payNowReference: reference,
              payNowRequestedAt: firebase.firestore.FieldValue.serverTimestamp(),
            };

      await db.collection("users").doc(currentUser.uid).set(userUpdates, { merge: true });

      setFeedback(paymentFeedback, "Preparing your payment link...");
      stopPayNowListener();
      payNowListener = db
        .collection("paynow_requests")
        .doc(requestId)
        .onSnapshot((doc) => {
          const data = doc.data() || {};
          if (data.redirectUrl) {
            const resolvedGateway = String(data.gateway || gateway || "").toLowerCase();
            if (resolvedGateway === "peach" && openCardButton) {
              openCardButton.classList.remove("is-hidden");
              openCardButton.onclick = () => window.open(data.redirectUrl, "_blank");
            } else if (openPayNowButton) {
              openPayNowButton.classList.remove("is-hidden");
              openPayNowButton.onclick = () => window.open(data.redirectUrl, "_blank");
            }
            setFeedback(paymentFeedback, "Payment link is ready.");
          }
          if (data.status && ["paid", "declined", "failed"].includes(String(data.status).toLowerCase())) {
            stopPayNowListener();
          }
        });
    } catch (error) {
      setFeedback(paymentFeedback, error.message || "Unable to start payment.", true);
    }
  };

  if (payNowButton) {
    payNowButton.addEventListener("click", () => startPaymentRequest("ozow"));
  }

  if (cardPayButton) {
    cardPayButton.addEventListener("click", () => startPaymentRequest("peach"));
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
      collectionDayField.addEventListener("input", () => {
        const value = Math.min(31, Math.max(1, Number(collectionDayField.value || 1)));
        collectionDayField.value = String(Number.isNaN(value) ? 1 : value);
      });
    }

    if (startDateField && collectionDayField) {
      startDateField.addEventListener("change", () => {
        if (!startDateField.value) return;
        const date = new Date(`${startDateField.value}T00:00:00`);
        if (!Number.isNaN(date.getTime()) && !collectionDayField.value) {
          collectionDayField.value = String(date.getDate());
        }
      });
    }

    mandateForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!currentUser || !currentUserData) return;

      setFeedback(paymentFeedback, "");
      const mandateAmountCents = Number(currentUserData.mandateAmountCents || 0);
      if (!mandateAmountCents) {
        setFeedback(paymentFeedback, "A monthly price is not available yet.", true);
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
          debtorAccountType: String(formData.get("debtor_account_type") || "").trim(),
          debtorIdType: String(formData.get("debtor_id_type") || "").trim(),
          debtorId: String(formData.get("debtor_id") || "").trim(),
          startDate: String(formData.get("start_date") || "").trim(),
          collectionDay: Number(formData.get("collection_day") || 1),
          trackingIndicator: 10,
        });
        const result = response.data || {};
        setFeedback(
          paymentFeedback,
          result.message ||
            (result.status === "submission_failed"
              ? "Mandate request saved, but NuPay submission failed."
              : "DebiCheck request captured.")
        );
        if (result.mandateUrl && openMandateButton) {
          openMandateButton.classList.remove("is-hidden");
          openMandateButton.onclick = () => window.open(result.mandateUrl, "_blank");
        }
        setMandateFormVisible(false);
        mandateForm.reset();
        prefillMandateForm(currentUserData);
      } catch (error) {
        setFeedback(paymentFeedback, error.message || "Unable to request mandate.", true);
      }
    });

    syncCustomMandateBankFields();
  }

  if (mandateButton) {
    mandateButton.addEventListener("click", () => {
      if (!currentUser || !currentUserData) return;
      setFeedback(paymentFeedback, "");
      const mandateAmountCents = Number(currentUserData.mandateAmountCents || 0);
      if (!mandateAmountCents) {
        setFeedback(paymentFeedback, "A monthly price is not available yet.");
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

  if (bookingForm && db) {
    bookingForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      setFeedback(bookingFeedback, "");
      if (!currentUser || !currentUserData) return;
      if (bookingOpenPaymentButton) {
        bookingOpenPaymentButton.classList.add("is-hidden");
        bookingOpenPaymentButton.onclick = null;
      }

      const formData = new FormData(bookingForm);
      const propertyName = String(formData.get("property_name") || "").trim();
      const propertyAddress = String(formData.get("property_address") || "").trim();
      const category = String(formData.get("service_category") || "").trim();
      const bookingDateValue = String(formData.get("booking_date") || "").trim();
      const bookingTimeValue = String(formData.get("booking_time") || "").trim();
      const priorities = String(formData.get("priorities") || "").trim();

      const selectedServices = formData.getAll("services").map((item) => String(item));

      if (!propertyName || !propertyAddress || !category || !bookingDateValue || !bookingTimeValue) {
        setFeedback(bookingFeedback, "Please complete all booking fields.", true);
        return;
      }

      if (!selectedServices.length) {
        setFeedback(bookingFeedback, "Please select at least one service.", true);
        return;
      }

      const bookingPayload = {
        selectedProperty: propertyName,
        propertyAddress,
        category,
        bookingDateValue,
        bookingTimeValue,
        services: selectedServices,
        priorities,
      };

      try {
        const response = await functions.httpsCallable("submitBookingRequest")({
          gateway: "ozow",
          booking: bookingPayload,
        });
        const result = response.data || {};

        if (result.status === "created") {
          setFeedback(bookingFeedback, "Booking submitted. We'll confirm shortly.");
          bookingForm.reset();
          return;
        }

        if (result.status !== "payment_required" || !result.requestId) {
          throw new Error("We couldn't start the payment request.");
        }

        setFeedback(bookingFeedback, "Preparing your payment link...");
        stopPayNowListener();
        payNowListener = db
          .collection("paynow_requests")
          .doc(result.requestId)
          .onSnapshot((doc) => {
            const data = doc.data() || {};
            const redirectUrl = String(data.redirectUrl || data.payNowUrl || "").trim();
            const status = String(data.status || data.payNowStatus || "").trim().toLowerCase();
            const errorMessage = String(data.errorMessage || "").trim();

            if (redirectUrl && bookingOpenPaymentButton) {
              bookingOpenPaymentButton.classList.remove("is-hidden");
              bookingOpenPaymentButton.onclick = () => window.open(redirectUrl, "_blank");
              setFeedback(bookingFeedback, "Payment link is ready. Complete payment to confirm your booking.");
            }

            if (status === "paid") {
              if (bookingOpenPaymentButton) {
                bookingOpenPaymentButton.classList.add("is-hidden");
                bookingOpenPaymentButton.onclick = null;
              }
              setFeedback(bookingFeedback, "Payment received. Your booking is confirmed.");
              bookingForm.reset();
              stopPayNowListener();
            } else if (errorMessage || status === "failed" || status === "declined") {
              if (bookingOpenPaymentButton) {
                bookingOpenPaymentButton.classList.add("is-hidden");
                bookingOpenPaymentButton.onclick = null;
              }
              setFeedback(
                bookingFeedback,
                errorMessage || "Payment was not completed. Please try again.",
                true
              );
              stopPayNowListener();
            }
          });
      } catch (error) {
        setFeedback(bookingFeedback, error.message || "Unable to submit booking.", true);
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
    if (services.length) return services.join(", ");
    return String(data.serviceName || data.service || data.category || "Booking").trim() || "Booking";
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

    let users = [];
    try {
      const userSnap = await db.collection("users").get();
      users = userSnap.docs.map((doc) => ({ id: doc.id, data: doc.data() || {} }));
    } catch (error) {
      showMessage("We couldn't load user data. Please try again.");
      return;
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

    let bookings = [];
    try {
      let query = db.collectionGroup("bookings").orderBy("timestamp", "desc").limit(30);
      let snap = await query.get();
      bookings = snap.docs.map((doc) => ({ id: doc.id, data: doc.data() || {} }));
    } catch (error) {
      try {
        let query = db.collectionGroup("bookings").orderBy("createdAt", "desc").limit(30);
        let snap = await query.get();
        bookings = snap.docs.map((doc) => ({ id: doc.id, data: doc.data() || {} }));
      } catch (err) {
        try {
          let snap = await db.collectionGroup("bookings").limit(30).get();
          bookings = snap.docs.map((doc) => ({ id: doc.id, data: doc.data() || {} }));
        } catch (finalError) {
          showMessage("We couldn't load bookings. Please try again.");
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

    let mandates = [];
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
      try {
        const commsSnap = await db
          .collection("admin_notifications")
          .orderBy("createdAt", "desc")
          .limit(20)
          .get();
        const comms = commsSnap.docs.map((doc) => ({ id: doc.id, data: doc.data() || {} }));
        adminCommsRecent.innerHTML = "";
        if (!comms.length) {
          clearList(adminCommsRecent, "Notifications will appear here.");
        } else {
          comms.forEach((note) => {
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
      } catch (error) {
        clearList(adminCommsRecent, "Notifications will appear here.");
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
      if (workerBookingsListener) workerBookingsListener();
      workerBookingsListener = null;
      workerBookingsCache = [];
      agentDataLoaded = false;
      adminDataLoaded = false;
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
      showMessage("We could not load your profile. Please contact support.");
      return;
    }

    if (!profileDoc || !profileDoc.exists) {
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
      startUserListener(user.uid, updateDashboard);
      return;
    }

    if (loginPage) {
      redirectToRole(role);
    }
  });
}
