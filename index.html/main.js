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
