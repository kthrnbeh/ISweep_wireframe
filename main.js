// scripts/main.js
// ======================================
// Global theme + plan selection for ISweep
// + optional ISweep demo API wiring
// ======================================

// ---------------------
// THEME + PLANS
// ---------------------
const THEME_KEY = "isweep-theme";
// Constant key name used in localStorage to remember the user's theme choice
// ("dark" or "light") across page reloads and different pages.

// Apply a theme to the whole site
function applyTheme(theme) {
  // This function takes a string "dark" or "light" and updates the DOM.

  const root = document.documentElement; // <html> element (used by Tailwind's `dark:` classes)
  const body = document.body;           // <body> element (used by your own dark-mode CSS)
  const btn = document.getElementById("themeBtn");
  // Get the theme toggle button if it exists on the page (e.g., Plans page).

  if (theme === "dark") {
    // If the chosen theme is "dark"…
    root.classList.add("dark");
    // Add "dark" class to <html> so Tailwind's dark: utilities activate.

    body.classList.add("dark");
    // Add "dark" class to <body> so your custom CSS (site-plan.css) can use it.

    if (btn) btn.textContent = "Light Mode";
    // If the button exists, update its label to show that clicking will switch to Light Mode.
  } else {
    // Otherwise, treat as "light" theme.
    root.classList.remove("dark");
    // Remove dark class from <html>.

    body.classList.remove("dark");
    // Remove dark class from <body>.

    if (btn) btn.textContent = "Dark Mode";
    // Button text indicates that clicking will switch to Dark Mode.
  }
}

// Look up saved theme or fall back to system preference
function loadTheme() {
  // This function decides what theme to use when the page loads.

  let saved = localStorage.getItem(THEME_KEY);
  // Try to read a previously saved theme value from localStorage (e.g., "dark" or "light").

  if (!saved) {
    // If nothing is stored yet…

    const prefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)"
    ).matches;
    // Use the user's system preference: checks if OS prefers dark mode.

    saved = prefersDark ? "dark" : "light";
    // Set theme based on that system preference.
  }

  applyTheme(saved);
  // Actually apply the chosen theme to the page.
}

// Switch between dark & light, and remember it
function toggleTheme() {
  // This function flips the current theme and saves the new value.

  const isDark = document.documentElement.classList.contains("dark");
  // Check whether <html> currently has the "dark" class (meaning dark mode is active).

  const next = isDark ? "light" : "dark";
  // Determine the next theme: if currently dark, switch to light; otherwise switch to dark.

  localStorage.setItem(THEME_KEY, next);
  // Save the new theme choice so it persists across reloads and pages.

  applyTheme(next);
  // Apply the new theme visually.
}

document.addEventListener("DOMContentLoaded", () => {
  // This main block waits until the HTML is fully parsed before running.
  // It ensures all elements we query with getElementById/querySelector are present.

  // 1) THEME SETUP
  loadTheme();
  // Apply the stored or system theme as soon as DOM is ready.

  const themeBtn = document.getElementById("themeBtn");
  // Get the theme toggle button (if it exists on this page).

  if (themeBtn) {
    // Only if the button is present…

    themeBtn.addEventListener("click", toggleTheme);
    // Attach click handler so pressing the button calls toggleTheme().
  }

  // 2) PLAN SELECTION – save chosen plan to localStorage and go to Account
  const planButtons = document.querySelectorAll("[data-plan-select]");
  // Get all elements that have a data-plan-select attribute.
  // These are the plan buttons on Plans.html (Free, Flexible, Full).

  planButtons.forEach((btn) => {
    // Loop over each plan button found.

    btn.addEventListener("click", (event) => {
      // When a plan button is clicked…

      event.preventDefault(); // prevent "#" scroll
      // Stop the default <a href="#"> from jumping to the top of the page.

      const planName = btn.getAttribute("data-plan-select");
      // Read the plan name from data-plan-select, e.g. "Free Tier", "Flexible Subscription".

      if (!planName) return;
      // If for some reason there is no plan name, exit.

      // Save the chosen plan
      localStorage.setItem("currentPlan", planName);
      // Store the human-readable plan name in localStorage under "currentPlan".
      // This is used later to display on the Account page.

      // Go to Account page
      window.location.href = "account.html";
      // Redirect the user to the account page after choosing a plan.
      // NOTE: on Windows, file is "Account.html" (capital A), which might matter on some servers.
    });
  });

  // 3) ACCOUNT PAGE – display the saved plan if available
  const planDisplay = document.getElementById("current-plan-display");
  // Element on Account.html where you show text like "Flexible Subscription".

  const planInput = document.querySelector('input[name="plan"]');
  // The read-only input on Account.html that shows the current plan.

  const storedPlan = localStorage.getItem("currentPlan");
  // Retrieve the stored plan name (if any) from localStorage.

  if (storedPlan) {
    // If the user previously selected a plan…

    if (planDisplay) planDisplay.textContent = storedPlan;
    // Update the text display.

    if (planInput) planInput.value = storedPlan;
    // Update the read-only input field.
  } else {
    // If no plan has been chosen yet…

    if (planDisplay) planDisplay.textContent = "No plan selected yet";
    // Show default text in the display spot.

    if (planInput) planInput.placeholder = "No plan selected yet";
    // Show default placeholder in the input.
  }

  // ---------------------
  // OPTIONAL: ISweep demo API
  // (only runs on pages that have the demo elements)
  // ---------------------

  const ISWEEP_API_BASE = "http://127.0.0.1:8000";
  // Base URL for your FastAPI backend during local development.

  const USER_ID = "demo-user";
  // Temporary user id used when sending requests to the backend.

  const subtitleInput = document.getElementById("subtitleInput");
  // Text input where user types a "subtitle line" to test filtering.

  const checkBtn = document.getElementById("checkSubtitleBtn");
  // Button labeled "Test ISweep" on the Help page demo.

  const decisionOutput = document.getElementById("decisionOutput");
  // <pre> element where you display the JSON decision from the backend.

  const broomIcon = document.getElementById("broomIcon");
  // Floating "🧹 ISweep active" pill at the top-right of the page.

  const demoVideo = document.getElementById("demoVideo");
  // The demo <video> that ISweep will mute/skip/fast-forward during demo.

  // If the demo elements don't exist on this page, stop here
  if (
    !subtitleInput ||
    !checkBtn ||
    !decisionOutput ||
    !broomIcon ||
    !demoVideo
  ) {
    // If ANY of the required demo elements are missing, that means we are
    // not on the Help page (or the page is not set up for the demo).
    // Returning here prevents the rest of the demo logic from running.

    return;
  }

  // 4) Set up preferences ONCE (which content & what action)
  async function setLanguagePreference() {
    // This sends the user’s language preference to the /preferences endpoint
    // so the backend knows:
    // - which content type ("language"),
    // - which action ("mute"),
    // - how long to act (4 seconds),
    // - which words are blocked.

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
    // Sends a POST request to http://127.0.0.1:8000/preferences
    // with JSON body containing the preference settings.

    if (!res.ok) {
      // If the response code is not 2xx…

      console.error("Failed to set preference", await res.text());
      // Log the error response text in the browser console.
    } else {
      console.log("Language preference saved.");
      // Log success so you know the preference was accepted by backend.
    }
  }

  // 5) Call /event with subtitle text
  async function sendSubtitleToISweep(text) {
    // This sends a "content event" to the backend: "user saw/heard this text at this time".

    const now = demoVideo.currentTime || 0;
    // Current playback time of the demo video (seconds).
    // If demoVideo.currentTime is falsy, use 0.

    const body = {
      user_id: USER_ID,
      timestamp: now,
      source: "website",
      text: text,
      content_type: null,
      confidence: null,
      manual_override: false,
    };
    // This describes the event:
    // - who: user_id
    // - when: timestamp (video position)
    // - where: source (website)
    // - what text: text
    // - content_type: null (lets backend pick or use default)
    // - confidence/manual_override: reserved for future use (AI confidence, manual triggers).

    const res = await fetch(`${ISWEEP_API_BASE}/event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    // POST /event with JSON body.

    if (!res.ok) {
      // If the backend responded with error code…

      const errorText = await res.text();
      throw new Error("ISweep /event error: " + errorText);
      // Throw error that will be caught by caller.
    }

    const decision = await res.json(); // { action, duration_seconds, show_icon, reason }
    // Parse the JSON response into a JS object that includes:
    // - action ("mute", "skip", "fast_forward", or "none")
    // - duration_seconds
    // - show_icon (boolean)
    // - reason (text explanation)

    return decision;
  }

  // 6) Apply the decision: mute/skip + broom icon
  function applyDecision(decision) {
    // This function takes the decision from the backend and:
    // - prints it in the box
    // - shows the broom icon
    // - controls the demo video.

    decisionOutput.textContent = JSON.stringify(decision, null, 2);
    // Pretty-print the decision JSON inside the <pre> block for debugging.

    const duration = decision.duration_seconds || 3;
    // Use the duration from the server, or default to 3 seconds if missing.

    // Show broom icon if requested
    if (decision.show_icon) {
      broomIcon.style.display = "inline-block";
      // Make broom icon visible.

      setTimeout(() => {
        broomIcon.style.display = "none";
      }, duration * 1000);
      // Hide the broom after "duration" seconds.
    }

    // Take action on the video
    if (decision.action === "mute") {
      // If decision says "mute", turn off sound for a bit.

      demoVideo.muted = true;
      // Mute the demo video.

      setTimeout(() => {
        demoVideo.muted = false;
      }, duration * 1000);
      // After duration seconds, unmute it.
    } else if (decision.action === "skip") {
      // If decision says "skip", jump ahead in the video.

      demoVideo.currentTime = demoVideo.currentTime + duration;
      // Advance currentTime by "duration" seconds.
    } else if (decision.action === "fast_forward") {
      // If decision says "fast_forward", temporarily speed up playback.

      const oldRate = demoVideo.playbackRate;
      // Remember current playback speed (usually 1.0).

      demoVideo.playbackRate = 2.0;
      // Speed video up to 2x.

      setTimeout(() => {
        demoVideo.playbackRate = oldRate;
      }, duration * 1000);
      // After "duration" seconds, restore original speed.
    }
  }

  // 7) Wire up the button
  checkBtn.addEventListener("click", async () => {
    // When the "Test ISweep" button is clicked…

    const text = subtitleInput.value.trim();
    // Grab the text the user typed and trim extra spaces.

    if (!text) {
      // If user didn't type anything…

      alert("Type a subtitle line first.");
      // Show an alert and do nothing else.

      return;
    }

    try {
      // Try to talk to backend.

      const decision = await sendSubtitleToISweep(text);
      // Send the subtitle to backend, wait for decision.

      applyDecision(decision);
      // Apply the decision (show icon, control video, display JSON).
    } catch (err) {
      // If anything failed…

      console.error(err);
      decisionOutput.textContent = "Error: " + err.message;
      // Show error message in the decisionOutput area.
    }
  });

  // 8) When page loads: set preference
  setLanguagePreference().catch(console.error);
  // Immediately set up language preference for this demo user when the page
  // with the demo loads. Errors logged to console.
});

// ============================
// PLAN SELECTION BUTTONS
// ============================

// NOTE: The code below is *another* plan system with "isweep-plan" key.
// This overlaps with the earlier `currentPlan` logic. Right now you
// effectively have TWO different plan-tracking mechanisms.

const planFreeBtn      = document.getElementById("planFreeBtn");
const planFlexibleBtn  = document.getElementById("planFlexibleBtn");
const planFullBtn      = document.getElementById("planFullBtn");
// Grabs the three plan buttons if they exist on the current page.

// Single helper to set plan and show a message
function setPlanAndNotify(planKey, label) {
  // planKey: internal key used in localStorage: "free", "flexible", or "full"
  // label: user-facing label like "Free Tier".

  localStorage.setItem("isweep-plan", planKey);
  // Saves the internal plan key into localStorage so we can gate the filter.

  const status =
    planKey === "free"
      ? "ISweep filtering is disabled on this plan."
      : "ISweep filtering is enabled on supported pages.";
  // Sets a status message:
  // - For free plan: filtering is OFF.
  // - For flexible/full: filtering is ON.

  alert(`Your plan is now: ${label}. ${status}`);
  // Let the user know which plan they now have and what that means
  // for the ISweep filter.
}

// Hook buttons if they exist on this page
if (planFreeBtn) {
  // Only if the "Free" button exists (probably on the Plans page)…

  planFreeBtn.addEventListener("click", (e) => {
    e.preventDefault();
    // Prevent default anchor navigation.

    setPlanAndNotify("free", "Free Tier");
    // Save plan "free" and show its message.
  });
}

if (planFlexibleBtn) {
  // If the flexible subscription button exists…

  planFlexibleBtn.addEventListener("click", (e) => {
    e.preventDefault();
    setPlanAndNotify("flexible", "Flexible Subscription");
    // Save "flexible" plan and show message.
  });
}

if (planFullBtn) {
  // If the full ownership button exists…

  planFullBtn.addEventListener("click", (e) => {
    e.preventDefault();
    setPlanAndNotify("full", "Full Ownership");
    // Save "full" plan and show message.
  });
}



// ============================================
// ISWEEP BACKEND INTEGRATION
// ============================================
// NOTE: Below is a second block that also:
//  - declares ISWEEP_API_BASE
//  - defines setLanguagePreference, sendSubtitleToIsweep, applyDecision
//  - wires the "Test ISweep" button
// It’s a more advanced version that FIRST checks plan gating
// (isweepEnabled) before allowing the demo to run.

// 1) Where the backend lives during development
const ISWEEP_API_BASE = "http://127.0.0.1:8000";
// Base URL for your FastAPI backend (same as above, re-declared globally).

const ISWEEP_USER_ID = "demo-user"; // later this will be a real user id
// User identifier for backend calls (same idea as USER_ID above).

// Keeps track whether ISweep should be used for this user
let isweepEnabled = false;
// Flag toggled ON/OFF based on current plan (free vs flexible/full).

// Grab elements if they exist on the current page
const broomIcon      = document.getElementById("broomIcon");
const subtitleInput  = document.getElementById("subtitleInput");
const checkBtn       = document.getElementById("checkSubtitleBtn");
const decisionOutput = document.getElementById("decisionOutput");
const demoVideo      = document.getElementById("demoVideo");
// Same elements used for the demo: broom icon, subtitle input, test button,
// JSON output, and demo video.
// Here they are declared again at the top-level of the file.

// ------------------------------
// PLAN / SUBSCRIPTION GATING
// ------------------------------

function getCurrentPlan() {
  // Helper to get the current plan from localStorage.
  // Later, this might instead query your real account system.

  // Later this will come from your account system.
  // For now, we use localStorage.
  return localStorage.getItem("isweep-plan") || "free";
  // If nothing stored, treat as "free".
}

function planHasIsweepAccess(plan) {
  // Determine whether the given plan key enables ISweep filtering.

  // Free = no filter; trial, flexible, full = filtering ON
  if (plan === "trial") return true;
  if (plan === "flexible") return true;
  if (plan === "full") return true;

  return false;
  // For "free" or any unknown value, return false.
}

async function initIsweepIfSubscribed() {
  // Initialization function that:
  // - checks the current plan
  // - sets isweepEnabled flag
  // - sets preferences via backend if plan has access.

  const plan = getCurrentPlan();
  console.log("Current plan:", plan);
  // Log current plan key to console for debugging.

  if (!planHasIsweepAccess(plan)) {
    // If current plan does NOT have filter access (e.g., free)…

    console.log("ISweep disabled for this plan.");
    isweepEnabled = false;
    // Mark that filter should NOT be used.

    return;
  }

  isweepEnabled = true;
  // Mark filter as enabled for this plan.

  console.log("ISweep enabled. Setting preferences...");

  try {
    await setLanguagePreference();
    // Call backend /preferences to define language filtering.

    console.log("ISweep preferences set.");
  } catch (err) {
    console.error("Failed to set ISweep preferences:", err);
    // Log error if preferences fail to save.
  }
}

// --------------------------------------------------------
// SEND USER PREFERENCES TO BACKEND (/preferences)
// --------------------------------------------------------

async function setLanguagePreference() {
  // Similar idea to earlier function, but uses the global constants here.

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
  // The rules for what to do with language content.

  const res = await fetch(`${ISWEEP_API_BASE}/preferences`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  // POST request to /preferences endpoint.

  if (!res.ok) {
    // If backend responds with error status…

    throw new Error("Failed to save preference: " + (await res.text()));
    // Throw error with response body. Caller will catch it.
  }
}

// ---------------------------------------------------
// SEND EVENTS TO BACKEND (/event)
// ---------------------------------------------------

async function sendSubtitleToIsweep(text) {
  // Sends an "event" describing a subtitle line to backend for decision.

  const now = demoVideo ? (demoVideo.currentTime || 0) : 0;
  // If demoVideo exists, use its current time; otherwise 0.

  const body = {
    user_id: ISWEEP_USER_ID,
    timestamp: now,
    source: "website",
    text: text,
    content_type: null,   // let backend use blocked_words logic
    confidence: null,
    manual_override: false
  };
  // This is the same event structure as above but using ISWEEP_USER_ID
  // and focusing on plan-gated usage.

  const res = await fetch(`${ISWEEP_API_BASE}/event`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    throw new Error("ISweep /event error: " + (await res.text()));
    // If error, throw a message with backend response body.
  }

  return await res.json(); // { action, duration_seconds, show_icon, reason }
  // Return parsed decision object to caller.
}

// ---------------------------------------
// APPLY DECISION: mute / skip / broom
// ---------------------------------------

function applyDecision(decision) {
  // Similar to earlier version but checks for existence of DOM nodes.

  if (decisionOutput) {
    decisionOutput.textContent = JSON.stringify(decision, null, 2);
    // Show pretty JSON in decisionOutput if that element exists.
  }

  if (!demoVideo) return;
  // If no video, nothing to control.

  const duration = decision.duration_seconds || 3;
  // Use given duration or default 3 seconds.

  if (decision.show_icon && broomIcon) {
    // If server asked to show icon and broomIcon exists…

    broomIcon.style.display = "inline-block";
    // Show it.

    setTimeout(() => {
      broomIcon.style.display = "none";
    }, duration * 1000);
    // Hide after duration seconds.
  }

  if (decision.action === "mute") {
    // If action is mute…

    demoVideo.muted = true;
    // Mute video.

    setTimeout(() => {
      demoVideo.muted = false;
    }, duration * 1000);
    // Unmute after duration seconds.
  } else if (decision.action === "skip") {
    // If action is skip…

    demoVideo.currentTime = demoVideo.currentTime + duration;
    // Jump ahead by duration seconds.
  } else if (decision.action === "fast_forward") {
    // If action is fast_forward…

    const oldRate = demoVideo.playbackRate;
    // Remember current speed.

    demoVideo.playbackRate = 2.0;
    // Speed to 2x.

    setTimeout(() => {
      demoVideo.playbackRate = oldRate;
    }, duration * 1000);
    // Restore original speed after duration.
  }
}

// ----------------------------------------------
// "Test ISweep" button
// ----------------------------------------------
if (checkBtn && subtitleInput) {
  // Only wire the listener if both the button and input exist on this page.

  checkBtn.addEventListener("click", async () => {
    // When the Test ISweep button is clicked…

    if (!isweepEnabled) {
      // If plan access has not enabled ISweep (e.g., free plan)…

      alert("ISweep is not enabled for your current plan.");
      // Warn the user they need a higher plan.

      return;
    }

    const text = subtitleInput.value.trim();
    // Get trimmed subtitle text from input.

    if (!text) {
      // If nothing was typed…

      alert("Type a subtitle line first.");
      return;
    }

    try {
      // Try to send event + apply decision.

      const decision = await sendSubtitleToIsweep(text);
      // Call backend /event for this subtitle text.

      applyDecision(decision);
      // Apply resulting action.

    } catch (err) {
      // If something fails…

      console.error(err);
      if (decisionOutput) {
        decisionOutput.textContent = "Error: " + err.message;
        // Show error text in the output box if available.
      }
    }
  });
}

// ----------------------------------------------
// Initialize ISweep when page loads
// ----------------------------------------------
window.addEventListener("load", () => {
  // Once ALL resources (images, etc.) are fully loaded…

  initIsweepIfSubscribed();
  // Check plan, set isweepEnabled, and send preferences if allowed.
});
