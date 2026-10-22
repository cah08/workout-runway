/* Shared by the static application and Node's built-in test runner. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.FitnessScoring = factory();
})(globalThis, function () {
  "use strict";
  const pad = (n) => String(n).padStart(2, "0");
  const dateKey = (d) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  // ISO calendar dates, rather than local elapsed milliseconds, define the rules.
  function dayNumber(key) {
    const [year, month, day] = key.split("-").map(Number);
    return Date.UTC(year, month - 1, day) / 86400000;
  }
  function addDays(key, amount) {
    return new Date((dayNumber(key) + amount) * 86400000)
      .toISOString()
      .slice(0, 10);
  }
  const dayDistance = (a, b) => Math.abs(dayNumber(a) - dayNumber(b));
  const shiftMonth = (date, amount) =>
    new Date(date.getFullYear(), date.getMonth() + amount, 1);
  const safeColor = (value, fallback = "#F4C542") =>
    typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value)
      ? value
      : typeof fallback === "string" && /^#[0-9a-fA-F]{6}$/.test(fallback)
        ? fallback
        : "#F4C542";
  function graceEligible(records, date, windowDays) {
    return !Object.entries(records).some(
      ([key, state]) =>
        state === "grace" &&
        key !== date &&
        dayDistance(key, date) < Number(windowDays),
    );
  }
  function compute({ start, records = {}, rules, end, preview = false }) {
    let b = Number(rules.starting_balance),
      violations = 0,
      workouts = 0,
      streak = 0,
      best = 0;
    const rows = {},
      graces = [];
    for (let key = start; key <= end; key = addDays(key, 1)) {
      let state = records[key] || "rest";
      if (state === "planned" && !preview) state = "rest";
      if (state === "grace") {
        if (
          graces.some(
            (g) => dayDistance(key, g) < Number(rules.grace_window_days),
          )
        )
          state = "rest";
        else graces.push(key);
      }
      if (state === "confirmed" || state === "planned") {
        b = Math.min(Number(rules.bank_cap), b + Number(rules.workout_credit));
        if (state === "confirmed") workouts++;
      } else if (state !== "grace") b -= Number(rules.rest_cost);
      if (b < 0) {
        violations++;
        streak = 0;
      } else {
        streak++;
        best = Math.max(best, streak);
      }
      rows[key] = { balance: b, status: state, streak };
    }
    return { rows, b, violations, workouts, streak, best };
  }
  return {
    dateKey,
    dayNumber,
    addDays,
    dayDistance,
    shiftMonth,
    safeColor,
    graceEligible,
    compute,
  };
});
