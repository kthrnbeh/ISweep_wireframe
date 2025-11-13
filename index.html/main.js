// scripts/main.js
// ======================================
// Global theme + plan selection for ISweep
// + optional ISweep demo API wiring
// ======================================

// ---------------------
// THEME + PLANS
// ---------------------
const THEME_KEY = "isweep-theme";

// Apply a theme to the whole site
function applyTheme(theme) {
  const root = document.documentElement; // <html> (used by Tailwind's dark:)
  const body = document.body;
  const btn = document.getElementById("themeBtn");

  if (theme === "dark") {
    root.classList.add("dark");
    body.classList.add("dark");
    if (btn) btn.textContent = "Light Mode";
  } else {
    root.classList.remove("dark");
    body.classList.remove("dark");
    if (btn) btn.textContent = "Dark Mode";
  }
}

// Look up saved theme or fall back to system preference
function loadTheme() {
  let saved = localStorage.getItem(THEME_KEY);

  if (!saved) {
    const prefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)"
    ).matches;
    saved = prefersDark ? "dark" : "light";
  }

  applyTheme(saved);
}

// Switch between dark & light, and remember it
function toggleTheme() {
  const isDark = document.documentElement.classList.contains("dark");
  const next = isDark ? "light" : "dark";
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
}

document.addEventListener("DOMContentLoaded", () => {
  // 1) THEME SETUP
  loadTheme();

  const themeBtn = document.getElementById("themeBtn");
  if (themeBtn) {
    themeBtn.addEventListener("click", toggleTheme);
  }

  // 2) PLAN SELECTION – save chosen plan to localStorage and go to Account
  const planButtons = document.querySelectorAll("[data-plan-select]");
  planButtons.forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.preventDefault(); // prevent "#" scroll

      const planName = btn.getAttribute("data-plan-select");
      if (!planName) return;

      // Save the chosen plan
      localStorage.setItem("currentPlan", planName);

      // Go to Account page
      window.location.href = "account.html";
    });
  });

  // 3) ACCOUNT PAGE – display the saved plan if available
  const planDisplay = document.getElementById("current-plan-display");
  const planInput = document.querySelector('input[name="plan"]');

  const storedPlan = localStorage.getItem("currentPlan");

  if (storedPlan) {
    if (planDisplay) planDisplay.textContent = storedPlan;
    if (planInput) planInput.value = storedPlan;
  } else {
    if (planDisplay) planDisplay.textContent = "No plan selected yet";
    if (planInput) planInput.placeholder = "No plan selected yet";
  }

  // ---------------------
  // OPTIONAL: ISweep demo API
  // (only runs on pages that have the demo elements)
  // ---------------------

  const ISWEEP_API_BASE = "http://127.0.0.1:8000";
  const USER_ID = "demo-user";

  const subtitleInput = document.getElementById("subtitleInput");
  const checkBtn = document.getElementById("checkSubtitleBtn");
  const decisionOutput = document.getElementById("decisionOutput");
  const broomIcon = document.getElementById("broomIcon");
  const demoVideo = document.getElementById("demoVideo");

  // If the demo elements don't exist on this page, stop here
  if (
    !subtitleInput ||
    !checkBtn ||
    !decisionOutput ||
    !broomIcon ||
    !demoVideo
  ) {
    return;
  }

  // 4) Set up preferences ONCE (which content & what action)
  async function setLanguagePreference() {
    const body = {
      user_id: USER_ID,
      content_type: "language",
      action: "mute", // or "skip" or "fast_forward"
      duration_seconds: 4,
      enabled: true,
      blocked_words: ["badword", "dummy", "oh my god"],
    };

    const res = await fetch(`${ISWEEP_API_BASE}/preferences`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      console.error("Failed to set preference", await res.text());
    } else {
      console.log("Language preference saved.");
    }
  }

  // 5) Call /event with subtitle text
  async function sendSubtitleToISweep(text) {
    const now = demoVideo.currentTime || 0;

    const body = {
      user_id: USER_ID,
      timestamp: now,
      source: "website",
      text: text,
      content_type: null,
      confidence: null,
      manual_override: false,
    };

    const res = await fetch(`${ISWEEP_API_BASE}/event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error("ISweep /event error: " + errorText);
    }

    const decision = await res.json(); // { action, duration_seconds, show_icon, reason }
    return decision;
  }

  // 6) Apply the decision: mute/skip + broom icon
  function applyDecision(decision) {
    decisionOutput.textContent = JSON.stringify(decision, null, 2);

    const duration = decision.duration_seconds || 3;

    // Show broom icon if requested
    if (decision.show_icon) {
      broomIcon.style.display = "inline-block";
      setTimeout(() => {
        broomIcon.style.display = "none";
      }, duration * 1000);
    }

    // Take action on the video
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

  // 7) Wire up the button
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

  // 8) When page loads: set preference
  setLanguagePreference().catch(console.error);
});

// ============================
// PLAN SELECTION BUTTONS
// ============================

const planFreeBtn      = document.getElementById("planFreeBtn");
const planFlexibleBtn  = document.getElementById("planFlexibleBtn");
const planFullBtn      = document.getElementById("planFullBtn");

function setPlanAndNotify(planKey, label) {
  localStorage.setItem("isweep-plan", planKey);

  const status =
    planKey === "free"
      ? "ISweep filtering is disabled on this plan."
      : "ISweep filtering is enabled on supported pages.";

  alert(`Your plan is now: ${label}. ${status}`);
}

// Hook buttons if they exist on this page
if (planFreeBtn) {
  planFreeBtn.addEventListener("click", (e) => {
    e.preventDefault();
    setPlanAndNotify("free", "Free Tier");
  });
}

if (planFlexibleBtn) {
  planFlexibleBtn.addEventListener("click", (e) => {
    e.preventDefault();
    setPlanAndNotify("flexible", "Flexible Subscription");
  });
}

if (planFullBtn) {
  planFullBtn.addEventListener("click", (e) => {
    e.preventDefault();
    setPlanAndNotify("full", "Full Ownership");
  });
}



// ============================================
// ISWEEP BACKEND INTEGRATION
// ============================================

// 1) Where the backend lives during development
const ISWEEP_API_BASE = "http://127.0.0.1:8000";
const ISWEEP_USER_ID = "demo-user"; // later this will be a real user id

// Keeps track whether ISweep should be used for this user
let isweepEnabled = false;

// Grab elements if they exist on the current page
const broomIcon      = document.getElementById("broomIcon");
const subtitleInput  = document.getElementById("subtitleInput");
const checkBtn       = document.getElementById("checkSubtitleBtn");
const decisionOutput = document.getElementById("decisionOutput");
const demoVideo      = document.getElementById("demoVideo");

// ------------------------------
// PLAN / SUBSCRIPTION GATING
// ------------------------------

function getCurrentPlan() {
  // Later this will come from your account system.
  // For now, we use localStorage.
  return localStorage.getItem("isweep-plan") || "free";
}

function planHasIsweepAccess(plan) {
  // Free = no filter; trial, flexible, full = filtering ON
  if (plan === "trial") return true;
  if (plan === "flexible") return true;
  if (plan === "full") return true;
  return false;
}

async function initIsweepIfSubscribed() {
  const plan = getCurrentPlan();
  console.log("Current plan:", plan);

  if (!planHasIsweepAccess(plan)) {
    console.log("ISweep disabled for this plan.");
    isweepEnabled = false;
    return;
  }

  isweepEnabled = true;
  console.log("ISweep enabled. Setting preferences...");

  try {
    await setLanguagePreference();
    console.log("ISweep preferences set.");
  } catch (err) {
    console.error("Failed to set ISweep preferences:", err);
  }
}

// --------------------------------------------------------
// SEND USER PREFERENCES TO BACKEND (/preferences)
// --------------------------------------------------------

async function setLanguagePreference() {
  const body = {
    user_id: ISWEEP_USER_ID,
    content_type: "language",
    action: "mute",           // mute for bad words
    duration_seconds: 4,      // seconds
    enabled: true,
    blocked_words: [
      "badword",
      "dummy",
      "oh my god"             // example of taking the Lord's name, etc.
    ]
  };

  const res = await fetch(`${ISWEEP_API_BASE}/preferences`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    throw new Error("Failed to save preference: " + (await res.text()));
  }
}

// ---------------------------------------------------
// SEND EVENTS TO BACKEND (/event)
// ---------------------------------------------------

async function sendSubtitleToIsweep(text) {
  const now = demoVideo ? (demoVideo.currentTime || 0) : 0;

  const body = {
    user_id: ISWEEP_USER_ID,
    timestamp: now,
    source: "website",
    text: text,
    content_type: null,   // let backend use blocked_words logic
    confidence: null,
    manual_override: false
  };

  const res = await fetch(`${ISWEEP_API_BASE}/event`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    throw new Error("ISweep /event error: " + (await res.text()));
  }

  return await res.json(); // { action, duration_seconds, show_icon, reason }
}

// ---------------------------------------
// APPLY DECISION: mute / skip / broom
// ---------------------------------------

function applyDecision(decision) {
  if (decisionOutput) {
    decisionOutput.textContent = JSON.stringify(decision, null, 2);
  }

  if (!demoVideo) return;

  const duration = decision.duration_seconds || 3;

  if (decision.show_icon && broomIcon) {
    broomIcon.style.display = "inline-block";
    setTimeout(() => {
      broomIcon.style.display = "none";
    }, duration * 1000);
  }

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

// ----------------------------------------------
// "Test ISweep" button
// ----------------------------------------------
if (checkBtn && subtitleInput) {
  checkBtn.addEventListener("click", async () => {
    if (!isweepEnabled) {
      alert("ISweep is not enabled for your current plan.");
      return;
    }

    const text = subtitleInput.value.trim();
    if (!text) {
      alert("Type a subtitle line first.");
      return;
    }

    try {
      const decision = await sendSubtitleToIsweep(text);
      applyDecision(decision);
    } catch (err) {
      console.error(err);
      if (decisionOutput) {
        decisionOutput.textContent = "Error: " + err.message;
      }
    }
  });
}

// ----------------------------------------------
// Initialize ISweep when page loads
// ----------------------------------------------
window.addEventListener("load", () => {
  initIsweepIfSubscribed();
});
