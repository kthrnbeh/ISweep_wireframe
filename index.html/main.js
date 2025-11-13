// scripts/main.js

document.addEventListener('DOMContentLoaded', () => {
  // 1) THEME TOGGLE WITH MEMORY
  const themeBtn = document.getElementById('themeBtn');

  // On load, apply saved theme
  const savedTheme = localStorage.getItem('theme'); // "light" or "dark"
  if (savedTheme === 'dark') {
    document.body.classList.add('dark');
  }

  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      document.body.classList.toggle('dark');
      const isDark = document.body.classList.contains('dark');
      localStorage.setItem('theme', isDark ? 'dark' : 'light');
    });
  }

  // 2) PLAN SELECTION – save chosen plan to localStorage
  const planButtons = document.querySelectorAll('[data-plan-select]');
  planButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const planName = btn.getAttribute('data-plan-select');
      localStorage.setItem('currentPlan', planName);
      // optional: show a quick alert
      // alert(`You chose the ${planName} plan.`);
    });
  });

  // 3) ACCOUNT PAGE – display the saved plan if available
  const planDisplay = document.getElementById('current-plan-display');
  if (planDisplay) {
    const storedPlan = localStorage.getItem('currentPlan');
    if (storedPlan) {
      planDisplay.textContent = storedPlan;
    } else {
      planDisplay.textContent = 'No plan selected yet';
    }
  }
});
// scripts/theme.js
// ==========================
// Site-wide dark / light mode
// ==========================

// Key name we use in localStorage
const THEME_KEY = 'isweep-theme';

// Apply a given theme to the whole site
function applyTheme(theme) {
  const root = document.documentElement; // <html> tag
  const btn  = document.getElementById('themeBtn');

  if (theme === 'dark') {
    root.classList.add('dark');      // Tailwind dark mode ON
    if (btn) btn.textContent = 'Light Mode';
  } else {
    root.classList.remove('dark');   // Tailwind dark mode OFF
    if (btn) btn.textContent = 'Dark Mode';
  }
}

// Load saved theme (or use system preference the first time)
function loadTheme() {
  let saved = localStorage.getItem(THEME_KEY);

  // If user has never chosen, match their OS setting
  if (!saved) {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    saved = prefersDark ? 'dark' : 'light';
  }

  applyTheme(saved);
}

// Toggle theme when button is clicked
function toggleTheme() {
  const root = document.documentElement;
  const current = root.classList.contains('dark') ? 'dark' : 'light';
  const next = current === 'dark' ? 'light' : 'dark';

  // Save for all pages
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
}

// Run when the page is ready
document.addEventListener('DOMContentLoaded', () => {
  // 1) Apply saved / default theme
  loadTheme();

  // 2) Hook up the button on this page (if it exists)
  const btn = document.getElementById('themeBtn');
  if (btn) {
    btn.addEventListener('click', toggleTheme);
  }
});
