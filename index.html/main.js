// scripts/main.js
// ======================================
// Global theme + plan selection for ISweep
// ======================================

const THEME_KEY = 'isweep-theme';

// Apply a theme to the whole site
function applyTheme(theme) {
  const root = document.documentElement;   // <html>
  const body = document.body;
  const btn  = document.getElementById('themeBtn');

  if (theme === 'dark') {
    root.classList.add('dark');    // Tailwind dark:
    body.classList.add('dark');    // your custom CSS
    if (btn) btn.textContent = 'Light Mode';
  } else {
    root.classList.remove('dark');
    body.classList.remove('dark');
    if (btn) btn.textContent = 'Dark Mode';
  }
}

// Look up saved theme or fall back to system preference
function loadTheme() {
  let saved = localStorage.getItem(THEME_KEY);

  // If nothing saved yet, use system preference
  if (!saved) {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    saved = prefersDark ? 'dark' : 'light';
  }

  applyTheme(saved);
}

// Switch between dark & light, and remember it
function toggleTheme() {
  const isDark = document.documentElement.classList.contains('dark');
  const next = isDark ? 'light' : 'dark';
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
}

document.addEventListener('DOMContentLoaded', () => {
  // 1) THEME SETUP
  loadTheme();

  const themeBtn = document.getElementById('themeBtn');
  if (themeBtn) {
    themeBtn.addEventListener('click', toggleTheme);
  }

  // 2) PLAN SELECTION – save chosen plan to localStorage
  const planButtons = document.querySelectorAll('[data-plan-select]');
  planButtons.forEach(btn => {
    btn.addEventListener('click', (event) => {
      event.preventDefault(); // stop "#" jump
      const planName = btn.getAttribute('data-plan-select');
      localStorage.setItem('currentPlan', planName);

      // tiny UX feedback (optional)
      // alert(`You chose the ${planName} plan.`);
    });
  });

  // 3) ACCOUNT PAGE – display the saved plan if available
  const planDisplay = document.getElementById('current-plan-display');
  if (planDisplay) {
    const storedPlan = localStorage.getItem('currentPlan');
    planDisplay.textContent = storedPlan || 'No plan selected yet';
  }
});
