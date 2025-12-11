//-----------------------------------------------------
//  ISWEEP PLAN SYSTEM (Unified Version)
//-----------------------------------------------------

// Keys used in localStorage
const PLAN_KEY = "isweep-plan";          // internal value
const PLAN_LABEL_KEY = "isweep-plan-label"; // display value

// Which plans allow filtering?
function planHasFiltering(planKey) {
  return planKey === "flexible" || planKey === "full";
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