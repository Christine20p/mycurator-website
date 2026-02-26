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
