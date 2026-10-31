// ---------- Settings ----------
const API_URL = "http://127.0.0.1:8000/predict";
const SCORE_MAX = 100;       // scale used only to draw the circular ring (example response was 65.42)
const TIMEOUT_MS = 20000;

// Same names and rules as the FastAPI StudentData model
const RULES = {
  Age:                     { num: true, int: true, min: 10, max: 100, label: "Age" },
  Gender:                  { label: "Gender" },
  Country:                 { label: "Country" },
  Academic_Level:          { label: "Academic level" },
  Most_Used_Platform:      { label: "Most-used platform" },
  Purpose_Of_Use:          { label: "Purpose of use" },
  Avg_Daily_Usage_Hours:   { num: true, min: 0, max: 24, label: "Average daily usage" },
  Daily_Unlocks:           { num: true, int: true, min: 0, label: "Daily unlocks" },
  Study_Hours:             { num: true, min: 0, max: 24, label: "Study hours" },
  Physical_Activity_Hours: { num: true, min: 0, max: 24, label: "Physical activity hours" },
  Sleep_Hours_Per_Night:   { num: true, min: 0, max: 24, label: "Sleep hours per night" },
  Stress_Level:            { label: "Stress level" },
};

const $ = (id) => document.getElementById(id);
const form = $("predictForm"), btn = $("submitBtn"), alertBox = $("formAlert");

// ---------- Mobile menu ----------
const menuBtn = $("menuBtn"), menu = $("menu");
menuBtn.addEventListener("click", () => {
  const open = menu.classList.toggle("open");
  menuBtn.setAttribute("aria-expanded", open);
});
menu.addEventListener("click", (e) => { if (e.target.tagName === "A") { menu.classList.remove("open"); menuBtn.setAttribute("aria-expanded", false); } });

// ---------- Inline errors (text + icon, not colour alone) ----------
function setError(name, message) {
  const input = $(name);
  if (!input) return false;
  const field = input.closest(".field");
  let err = $("err-" + name);
  if (!err && message) {
    err = document.createElement("span");
    err.className = "err"; err.id = "err-" + name; err.setAttribute("role", "alert");
    field.appendChild(err);
  }
  if (err) err.textContent = message || "";
  if (err && !message) err.remove();
  field.classList.toggle("invalid", Boolean(message));
  input.setAttribute("aria-invalid", Boolean(message));
  if (message) input.setAttribute("aria-describedby", "err-" + name); else input.removeAttribute("aria-describedby");
  return true;
}
const clearErrors = () => Object.keys(RULES).forEach((n) => setError(n, ""));
function showAlert(msg) { alertBox.textContent = msg; alertBox.hidden = false; }

// Validate one field and return { value } or { error }
function check(name) {
  const rule = RULES[name], raw = $(name).value.trim();
  if (raw === "") return { error: rule.num ? "Enter a value." : "This field is required." };
  if (!rule.num) return { value: raw };
  const n = Number(raw);
  if (Number.isNaN(n)) return { error: "Enter a valid number." };
  if (rule.int && !Number.isInteger(n)) return { error: "Enter a whole number." };
  if (rule.min !== undefined && n < rule.min) return { error: `Must be ${rule.min} or more.` };
  if (rule.max !== undefined && n > rule.max) return { error: `Must be ${rule.max} or less.` };
  return { value: n };
}
form.addEventListener("input", (e) => { if (RULES[e.target.name]) setError(e.target.name, ""); });
form.addEventListener("change", (e) => { if (RULES[e.target.name]) setError(e.target.name, ""); });

// ---------- Loading state ----------
function setLoading(on) {
  btn.disabled = on;
  btn.setAttribute("aria-busy", on);
  $("btnText").textContent = on ? "Analyzing Your Responses..." : "Predict My Score";
}

// ---------- Result ----------
function showResults(score) {
  const section = $("results");
  section.hidden = false;
  $("scoreValue").textContent = score.toFixed(2);
  $("scoreScale").textContent = "out of " + SCORE_MAX;
  $("ring").setAttribute("aria-label", `Predicted mental health score: ${score.toFixed(2)} out of ${SCORE_MAX}`);
  const bar = $("ringBar"), C = 2 * Math.PI * 66;
  bar.style.strokeDasharray = C; bar.style.strokeDashoffset = C;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    bar.style.strokeDashoffset = C * (1 - Math.min(1, Math.max(0, score / SCORE_MAX)));
  }));
  section.scrollIntoView({ behavior: "smooth" });
  $("resultTitle").focus({ preventScroll: true });
}

// FastAPI 422 -> { detail: [{ loc: ["body", "Age"], msg: "..." }] }
function showValidationErrors(body) {
  let other = [];
  (Array.isArray(body?.detail) ? body.detail : []).forEach((d) => {
    const name = d.loc?.[d.loc.length - 1];
    if (!setError(name, d.msg || "Invalid value")) other.push(d.msg);
  });
  showAlert(other.length ? other.join(" ") : "The server could not accept some values. Please fix the highlighted fields.");
  document.querySelector(".invalid input, .invalid select")?.focus();
}

// ---------- Submit ----------
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (btn.disabled) return;           // block duplicate submissions
  alertBox.hidden = true; clearErrors();

  const payload = {}; let firstBad = null;
  for (const name of Object.keys(RULES)) {
    const r = check(name);
    if (r.error) { setError(name, r.error); firstBad ??= name; } else payload[name] = r.value;
  }
  if (firstBad) { showAlert("Please fix the highlighted fields."); $(firstBad).focus(); return; }

  setLoading(true);
  const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(API_URL, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload), signal: ctrl.signal,
    });
    const body = await res.json().catch(() => null);
    if (res.status === 422) return showValidationErrors(body);
    if (!res.ok) return showAlert(res.status >= 500
      ? "The server ran into a problem while making the prediction. Please try again in a moment."
      : `The request could not be completed (status ${res.status}).`);
    const score = body?.predicted_mental_health_score;
    if (typeof score !== "number") return showAlert("The server replied in an unexpected format.");
    showResults(score);
  } catch (err) {
    showAlert(err.name === "AbortError"
      ? "The server took too long to respond. Please try again."
      : "Could not reach the prediction service. Check that the API is running at http://127.0.0.1:8000.");
  } finally {
    clearTimeout(timer); setLoading(false);
  }
});

// ---------- Result buttons ----------
$("againBtn").addEventListener("click", () => {
  $("results").hidden = true;
  $("predict").scrollIntoView({ behavior: "smooth" });
  $("Age").focus({ preventScroll: true });
});
$("homeBtn").addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
