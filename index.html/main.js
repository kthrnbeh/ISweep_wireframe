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
    body.classList.add('dark');    // your custom CSS (body.dark, etc.)
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

document.addEventListener('DOMContentLoaded', () => {
  // 1) THEME SETUP
  loadTheme();

  const themeBtn = document.getElementById('themeBtn');
  if (themeBtn) {
    themeBtn.addEventListener('click', toggleTheme);
  }

  // 2) PLAN SELECTION – save chosen plan to localStorage and go to Account
  const planButtons = document.querySelectorAll('[data-plan-select]');
  planButtons.forEach(btn => {
    btn.addEventListener('click', (event) => {
      event.preventDefault(); // prevent "#" scroll

      const planName = btn.getAttribute('data-plan-select');

      // Save the chosen plan
      localStorage.setItem('currentPlan', planName);

      // Go to Account page
      window.location.href = "account.html";
    });
  });

  // 3) ACCOUNT PAGE – display the saved plan if available
  const planDisplay = document.getElementById('current-plan-display');
  const planInput   = document.querySelector('input[name="plan"]');

  const storedPlan = localStorage.getItem('currentPlan');

  if (storedPlan) {
    if (planDisplay) planDisplay.textContent = storedPlan;
    if (planInput)   planInput.value = storedPlan;
  } else {
    if (planDisplay) planDisplay.textContent = 'No plan selected yet';
    if (planInput)   planInput.placeholder = 'No plan selected yet';
  }
});
<script>
// ===============================
// 1. CONFIG: where is the backend?
// ===============================
// During development on your machine:
const ISWEEP_API_BASE = "http://127.0.0.1:8000";

// A fake user id for now. Later this will be tied to login/account info.
const USER_ID = "demo-user";

// Grab DOM elements we'll need
const subtitleInput  = document.getElementById("subtitleInput");
const checkBtn       = document.getElementById("checkSubtitleBtn");
const decisionOutput = document.getElementById("decisionOutput");
const broomIcon      = document.getElementById("broomIcon");
const demoVideo      = document.getElementById("demoVideo");

// ===============================
// 2. Set up preferences ONCE
//    (which content & what action)
// ===============================
async function setLanguagePreference() {
  const body = {
    user_id: USER_ID,
    content_type: "language",
    action: "mute",       // or "skip" or "fast_forward"
    duration_seconds: 4,  // how long to mute
    enabled: true,
    blocked_words: [
      "badword",
      "dummy",
      "oh my god" // example of taking the Lord's name, etc.
    ]
  };

  const res = await fetch(`${ISWEEP_API_BASE}/preferences`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    console.error("Failed to set preference", await res.text());
  } else {
    console.log("Language preference saved.");
  }
}

// ===============================
// 3. Call /event with subtitle text
// ===============================
async function sendSubtitleToISweep(text) {
  const now = demoVideo ? demoVideo.currentTime : 0; // use video time if available

  const body = {
    user_id: USER_ID,
    timestamp: now,
    source: "website",
    text: text,
    content_type: null,   // let blocked_words logic handle it
    confidence: null,
    manual_override: false
  };

  const res = await fetch(`${ISWEEP_API_BASE}/event`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error("ISweep /event error: " + errorText);
  }

  // This should match DecisionResponse from the backend
  const decision = await res.json();
  return decision; // { action, duration_seconds, show_icon, reason }
}

// ===============================
// 4. Apply the decision: mute/skip + broom
// ===============================
function applyDecision(decision) {
  decisionOutput.textContent = JSON.stringify(decision, null, 2);

  if (!demoVideo) return;

  // Show broom icon if requested
  if (decision.show_icon) {
    broomIcon.style.display = "inline-block";

    // Hide after a few seconds
    setTimeout(() => {
      broomIcon.style.display = "none";
    }, (decision.duration_seconds || 3) * 1000);
  }

  // Take action on the video:
  const duration = decision.duration_seconds || 3;

  if (decision.action === "mute") {
    demoVideo.muted = true;
    setTimeout(() => {
      demoVideo.muted = false;
    }, duration * 1000);
  } else if (decision.action === "skip") {
    demoVideo.currentTime = demoVideo.currentTime + duration;
  } else if (decision.action === "fast_forward") {
    const oldRate = demoVideo.playbackRate;
    demoVideo.playbackRate = 2.0;
    setTimeout(() => {
      demoVideo.playbackRate = oldRate;
    }, duration * 1000);
  }
}

// ===============================
// 5. Wire up the button
// ===============================
checkBtn.addEventListener("click", async () => {
  const text = subtitleInput.value.trim();
  if (!text) {
    alert("Type a subtitle line first.");
    return;
  }

  try {
    const decision = await sendSubtitleToISweep(text);
    applyDecision(decision);
  } catch (err) {
    console.error(err);
    decisionOutput.textContent = "Error: " + err.message;
  }
});

// ===============================
// 6. When page loads: set preference
// ===============================
window.addEventListener("load", () => {
  setLanguagePreference().catch(console.error);
});
</script>
