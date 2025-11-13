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
// scripts/main.js
// ======================================
// Global Dark / Light Mode for ISweep
// ======================================

// Name used to remember the user's preference
const THEME_KEY = 'isweep-theme';

// Apply a theme to the whole site
function applyTheme(theme) {
  const root = document.documentElement; // <html>
  const body = document.body;
  const btn  = document.getElementById('themeBtn');

  if (theme === 'dark') {
    // Add "dark" to html AND body
    root.classList.add('dark');   // for Tailwind `dark:` stuff (like on Plans)
    body.classList.add('dark');   // for your custom CSS using body.dark
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

// Run when the page is loaded
document.addEventListener('DOMContentLoaded', () => {
  // 1) Apply whatever theme we should start with
  loadTheme();

  // 2) Hook up the button on this page (if it exists)
  const btn = document.getElementById('themeBtn');
  if (btn) {
    btn.addEventListener('click', toggleTheme);
  }
});
