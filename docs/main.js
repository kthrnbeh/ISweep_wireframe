//-----------------------------------------------------
//  ISWEEP PLAN SYSTEM (Unified Version)
//-----------------------------------------------------

// Keys used in localStorage
const PLAN_KEY = "isweep-plan";          // internal value
const PLAN_LABEL_KEY = "isweep-plan-label"; // display value

// Which plans allow filtering?
function planHasFiltering(planKey) {
  // Developer mode: allow all plans to use filtering
  return true;
  // Production: 
  // return planKey === "flexible" || planKey === "full";
  // free = no filtering
  // flexible = filtering ON
  // full = filtering ON
}

// Apply selected plan + redirect if needed
function selectPlan(planKey, planLabel) {
  // Save to localStorage
  localStorage.setItem(PLAN_KEY, planKey);
  localStorage.setItem(PLAN_LABEL_KEY, planLabel);

  // Tell the user what happened
  const filteringMsg = planHasFiltering(planKey)
    ? "Filtering is ENABLED on this plan."
    : "Filtering is DISABLED on the Free plan.";

  alert(`Your plan is now: ${planLabel}\n${filteringMsg}`);

  // Redirect user to Account page
  window.location.href = "Account.html";
}

//-----------------------------------------------------
//  HOOK PLAN BUTTONS (Plans page)
//-----------------------------------------------------
const btnFree = document.getElementById("planFreeBtn");
const btnFlexible = document.getElementById("planFlexibleBtn");
const btnFull = document.getElementById("planFullBtn");

if (btnFree) {
  btnFree.addEventListener("click", (e) => {
    e.preventDefault();
    selectPlan("free", "Free Tier");
  });
}

if (btnFlexible) {
  btnFlexible.addEventListener("click", (e) => {
    e.preventDefault();
    selectPlan("flexible", "Flexible Subscription");
  });
}

if (btnFull) {
  btnFull.addEventListener("click", (e) => {
    e.preventDefault();
    selectPlan("full", "Full Ownership");
  });
}

//-----------------------------------------------------
//  THEME TOGGLE (All pages)
//-----------------------------------------------------
const themeBtn = document.getElementById("themeBtn");

if (themeBtn) {
  // Load saved theme
  const savedTheme = localStorage.getItem("isweep-theme") || "light";
  if (savedTheme === "dark") {
    document.body.classList.add("dark");
  }

  themeBtn.addEventListener("click", () => {
    const isDark = document.body.classList.toggle("dark");
    localStorage.setItem("isweep-theme", isDark ? "dark" : "light");
  });
}

//-----------------------------------------------------
//  ACCOUNT PAGE DISPLAY
//-----------------------------------------------------
function updateAccountPagePlanDisplay() {
  const displayElement = document.getElementById("current-plan-display");
  const inputElement = document.querySelector('input[name="plan"]');

  const planLabel = localStorage.getItem(PLAN_LABEL_KEY);

  if (planLabel) {
    if (displayElement) displayElement.textContent = planLabel;
    if (inputElement) inputElement.value = planLabel;
  } else {
    // Default case if no plan chosen yet
    if (displayElement) displayElement.textContent = "No plan selected yet";
    if (inputElement) inputElement.placeholder = "No plan selected yet";
  }
}

// Run automatically whenever the page loads
document.addEventListener("DOMContentLoaded", updateAccountPagePlanDisplay);

//-----------------------------------------------------
//  CHECK IF FILTERING IS ENABLED
//-----------------------------------------------------
function isFilteringEnabled() {
  const planKey = localStorage.getItem(PLAN_KEY) || "free";
  return planHasFiltering(planKey);
}
// Example usage:
// -----------------------------------------------------
// SETTINGS PAGE → LOCAL STORAGE + /preferences
// -----------------------------------------------------

// Reuse backend base + user id if you already have them.
// If not, uncomment these lines:
//
// const ISWEEP_API_BASE = "http://127.0.0.1:8000";
// const ISWEEP_USER_ID = "demo-user";

const SETTINGS_KEY = "isweep-settings";

// Helper: read current settings from localStorage
function loadSettingsFromStorage() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (err) {
    console.error("Failed to read settings from localStorage", err);
    return {};
  }
}

// Helper: save settings object to localStorage
function saveSettingsToStorage(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (err) {
    console.error("Failed to save settings to localStorage", err);
  }
}

// Map select value -> backend action + duration
function mapAction(selectValue, defaultDurationSeconds) {
  switch (selectValue) {
    case "mute":
      return { action: "mute", duration_seconds: defaultDurationSeconds };
    case "skip":
      return { action: "skip", duration_seconds: defaultDurationSeconds };
    case "fast-forward":
      // Backend uses "fast_forward" with underscore
      return { action: "fast_forward", duration_seconds: defaultDurationSeconds };
    case "log-only":
    default:
      // "Log only" means no actual action, just logs
      return { action: "none", duration_seconds: 0 };
  }
}

// Send a single preference object to /preferences
async function sendPreferenceToBackend(prefBody) {
  const res = await fetch(`${ISWEEP_API_BASE}/preferences`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(prefBody),
  });

  if (!res.ok) {
    throw new Error("Failed to save preference: " + (await res.text()));
  }
}

// Build and send preferences for language/sexual/violence
async function syncFilterPreferencesWithBackend(settings) {
  // If backend isn't running, these will just error and we log it.
  const tasks = [];

  // 1) Profanity → ContentType.language
  const languageEnabled = !!settings.filter_profanity;
  const languageActionInfo = mapAction(
    settings.action_profanity || "mute",
    4 // seconds (matches earlier demo)
  );
  tasks.push(
    sendPreferenceToBackend({
      user_id: ISWEEP_USER_ID,
      content_type: "language",
      enabled: languageEnabled,
      action: languageActionInfo.action,
      duration_seconds: languageActionInfo.duration_seconds,
      blocked_words: [
        "badword",
        "dummy",
        "oh my god"
        // Later this list can come from another Settings panel
      ],
    })
  );

  // 2) Sexual content → ContentType.sexual
  const sexualEnabled = !!settings.filter_sexual;
  const sexualActionInfo = mapAction(
    settings.action_sexual || "skip",
    30 // seconds, matches your "Fast-forward 30 seconds" option
  );
  tasks.push(
    sendPreferenceToBackend({
      user_id: ISWEEP_USER_ID,
      content_type: "sexual",
      enabled: sexualEnabled,
      action: sexualActionInfo.action,
      duration_seconds: sexualActionInfo.duration_seconds,
      blocked_words: [], // Not word-based; backend can detect by type later
    })
  );

  // 3) Violence → ContentType.violence
  const violenceEnabled = !!settings.filter_violence;
  const violenceActionInfo = mapAction(
    settings.action_violence || "skip",
    15 // seconds, matches your "Fast-forward 15 seconds" option
  );
  tasks.push(
    sendPreferenceToBackend({
      user_id: ISWEEP_USER_ID,
      content_type: "violence",
      enabled: violenceEnabled,
      action: violenceActionInfo.action,
      duration_seconds: violenceActionInfo.duration_seconds,
      blocked_words: [],
    })
  );

  // Run all three calls
  await Promise.all(tasks);
}

// -----------------------------------------------------
// WIRE UP THE SETTINGS PAGE
// -----------------------------------------------------

document.addEventListener("DOMContentLoaded", () => {
  // Grab forms (will be null on non-settings pages)
  const contentFiltersForm = document.getElementById("contentFiltersForm");
  const filterActionsForm = document.getElementById("filterActionsForm");
  const sensitivityForm = document.getElementById("sensitivityForm");
  const notificationsForm = document.getElementById("notificationsForm");
  const parentalForm = document.getElementById("parentalForm");

  // If none of these exist, we're not on Settings page; do nothing.
  if (
    !contentFiltersForm &&
    !filterActionsForm &&
    !sensitivityForm &&
    !notificationsForm &&
    !parentalForm
  ) {
    return;
  }

  // Load previously saved settings and prefill the form UI
  const saved = loadSettingsFromStorage();

  // --- PREFILL: Content Filters checkboxes ---
  if (contentFiltersForm) {
    contentFiltersForm.elements["filter-profanity"].checked =
      saved.filter_profanity ?? true;
    contentFiltersForm.elements["filter-sexual"].checked =
      saved.filter_sexual ?? true;
    contentFiltersForm.elements["filter-violence"].checked =
      saved.filter_violence ?? false;
    contentFiltersForm.elements["filter-horror"].checked =
      saved.filter_horror ?? false;
    contentFiltersForm.elements["filter-crude"].checked =
      saved.filter_crude ?? false;

    contentFiltersForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      // Update settings object
      saved.filter_profanity =
        contentFiltersForm.elements["filter-profanity"].checked;
      saved.filter_sexual =
        contentFiltersForm.elements["filter-sexual"].checked;
      saved.filter_violence =
        contentFiltersForm.elements["filter-violence"].checked;
      saved.filter_horror =
        contentFiltersForm.elements["filter-horror"].checked;
      saved.filter_crude =
        contentFiltersForm.elements["filter-crude"].checked;

      saveSettingsToStorage(saved);

      try {
        await syncFilterPreferencesWithBackend(saved);
        alert("Content filter categories saved and sent to ISweep.");
      } catch (err) {
        console.error(err);
        alert(
          "Filters saved locally, but backend update failed. Is the API running?"
        );
      }
    });
  }

  // --- PREFILL: Filter Actions selects ---
  if (filterActionsForm) {
    // Profanity action
    if (saved.action_profanity) {
      filterActionsForm.elements["action-profanity"].value =
        saved.action_profanity;
    }

    // Sexual action
    if (saved.action_sexual) {
      filterActionsForm.elements["action-sexual"].value =
        saved.action_sexual;
    }

    // Violence action
    if (saved.action_violence) {
      filterActionsForm.elements["action-violence"].value =
        saved.action_violence;
    }

    filterActionsForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      saved.action_profanity =
        filterActionsForm.elements["action-profanity"].value;
      saved.action_sexual =
        filterActionsForm.elements["action-sexual"].value;
      saved.action_violence =
        filterActionsForm.elements["action-violence"].value;

      saveSettingsToStorage(saved);

      try {
        await syncFilterPreferencesWithBackend(saved);
        alert("Filter actions saved and sent to ISweep.");
      } catch (err) {
        console.error(err);
        alert(
          "Actions saved locally, but backend update failed. Is the API running?"
        );
      }
    });
  }

  // --- PREFILL: Sensitivity slider (local only for now) ---
  if (sensitivityForm) {
    const sensitivityInput = sensitivityForm.elements["sensitivity"];
    if (saved.sensitivity) {
      sensitivityInput.value = saved.sensitivity;
    }

    sensitivityForm.addEventListener("submit", (e) => {
      e.preventDefault();
      saved.sensitivity = sensitivityInput.value;
      saveSettingsToStorage(saved);
      alert("Sensitivity saved.");
    });
  }

  // --- PREFILL: Notifications (local only) ---
  if (notificationsForm) {
    notificationsForm.elements["notify-email"].checked =
      saved.notify_email ?? true;
    notificationsForm.elements["notify-inapp"].checked =
      saved.notify_inapp ?? true;
    notificationsForm.elements["notify-none"].checked =
      saved.notify_none ?? false;

    notificationsForm.addEventListener("submit", (e) => {
      e.preventDefault();
      saved.notify_email =
        notificationsForm.elements["notify-email"].checked;
      saved.notify_inapp =
        notificationsForm.elements["notify-inapp"].checked;
      saved.notify_none =
        notificationsForm.elements["notify-none"].checked;

      saveSettingsToStorage(saved);
      alert("Notification preferences saved.");
    });
  }

  // --- PREFILL: Parental controls (PIN + require-pin) ---
  if (parentalForm) {
    const pinInput = parentalForm.elements["parent-pin"];
    const requirePinCheckbox = parentalForm.elements["require-pin"];

    if (saved.parent_pin) {
      pinInput.value = saved.parent_pin;
    }
    requirePinCheckbox.checked = saved.require_pin ?? true;

    parentalForm.addEventListener("submit", (e) => {
      e.preventDefault();

      saved.parent_pin = pinInput.value;
      saved.require_pin = requirePinCheckbox.checked;

      saveSettingsToStorage(saved);
      alert(
        "Parental PIN saved locally. (In a real app, this would be stored securely on the server.)"
      );
    });
  }
});

//-----------------------------------------------------
//  INDEX & HELP PAGE DEMO
//-----------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  const checkBtn = document.getElementById("checkSubtitleBtn");
  const subtitleInput = document.getElementById("subtitleInput");
  const decisionOutput = document.getElementById("decisionOutput");
  const broomIcon = document.getElementById("broomIcon");
  const demoVideo = document.getElementById("demoVideo");

  if (checkBtn && subtitleInput && decisionOutput) {
    checkBtn.addEventListener("click", () => {
      const text = subtitleInput.value.trim().toLowerCase();
      if (!text) {
        decisionOutput.textContent = "(Enter a subtitle line to test ISweep)";
        return;
      }

      // Check if filtering is enabled (developer mode: always enabled)
      const planKey = localStorage.getItem(PLAN_KEY) || "free";
      const filteringEnabled = true; // Developer: always allow filtering

      if (!filteringEnabled) {
        decisionOutput.textContent =
          "ISweep Filtering is DISABLED on your current plan.\nUpgrade to Flexible or Full plan to enable filtering.";
        return;
      }

      // Check for blocked words
      const blockedWords = [
        "badword",
        "profanity",
        "swear",
        "curse",
        "hell",
        "damn",
        "crap",
      ];
      let foundWords = [];
      blockedWords.forEach((word) => {
        if (text.includes(word)) {
          foundWords.push(word);
        }
      });

      if (foundWords.length > 0) {
        decisionOutput.textContent = `🧹 ISweep DETECTED: ${foundWords.join(
          ", "
        )}\nAction: MUTE\nDuration: 5 seconds`;
        if (broomIcon) {
          broomIcon.style.display = "block";
          setTimeout(() => {
            broomIcon.style.display = "none";
          }, 3000);
        }
      } else {
        decisionOutput.textContent =
          "✓ ISweep PASSED: No blocked content detected.\nAction: PLAY";
      }
    });

    // Allow Enter key to trigger test
    subtitleInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        checkBtn.click();
      }
    });
  }

  // Optional: video demo with broom on play
  if (demoVideo && broomIcon) {
    demoVideo.addEventListener("play", () => {
      broomIcon.style.display = "block";
      setTimeout(() => broomIcon.style.display = "none", 5000);
    });
  }
});

//-----------------------------------------------------
//  HELP PAGE: CONTACT FORM
//-----------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  const contactForm = document.querySelector("#contact-form .profile-form");
  if (contactForm) {
    contactForm.addEventListener("submit", (e) => {
      e.preventDefault();

      const name = contactForm.elements["name"].value;
      const email = contactForm.elements["email"].value;
      const topic = contactForm.elements["topic"].value;
      const message = contactForm.elements["message"].value;

      // Show confirmation
      alert(
        `Thank you, ${name}! Your message about "${topic}" has been received. We'll respond to ${email} within 24 hours.`
      );

      // Reset form
      contactForm.reset();
    });
  }
});

//-----------------------------------------------------
//  HELP PAGE: CHAT WIDGET
//-----------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  const chatToggle = document.getElementById("chatToggle");
  const chatWidget = document.getElementById("chatWidget");
  const chatClose = document.getElementById("chatClose");
  const chatForm = document.getElementById("chatForm");
  const chatInput = document.getElementById("chatInput");
  const chatLog = document.getElementById("chatLog");

  if (chatToggle && chatWidget && chatClose && chatForm) {
    chatToggle.addEventListener("click", () => {
      chatWidget.classList.toggle("open");
    });

    chatClose.addEventListener("click", () => {
      chatWidget.classList.remove("open");
    });

    // Fake chat: just echoes the user message into the window
    chatForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const text = chatInput.value.trim();
      if (!text) return;

      const msg = document.createElement("p");
      msg.className = "chat-message user";
      msg.textContent = text;
      chatLog.appendChild(msg);

      // Clear input
      chatInput.value = "";

      // Fake bot reply
      const reply = document.createElement("p");
      reply.className = "chat-message bot";
      reply.textContent =
        "Thanks for your message! In a real app, this would send to support.";
      chatLog.appendChild(reply);

      // Scroll to bottom
      chatLog.scrollTop = chatLog.scrollHeight;
    });
  }
});
