const { test } = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const S = require("../scoring.js");
const rules = {
  starting_balance: 2,
  workout_credit: 1.5,
  rest_cost: 1,
  bank_cap: 4.5,
  grace_window_days: 30,
};
const score = (records = {}, end = "2026-01-01", extra = {}) =>
  S.compute({ start: "2026-01-01", records, rules, end, ...extra });
test("starting balance applies once; start day is scored; pre-start dates are excluded", () => {
  assert.equal(score({}, "2025-12-31").b, 2);
  assert.deepEqual(score({}, "2025-12-31").rows, {});
  assert.equal(score({ "2025-12-31": "confirmed" }).b, 1);
  assert.equal(score({ "2026-01-01": "confirmed" }).b, 3.5);
});
test("documented workout/rest example, daily cap, and discarded surplus", () => {
  const v = score(
    {
      "2026-01-01": "confirmed",
      "2026-01-03": "confirmed",
      "2026-01-04": "confirmed",
    },
    "2026-01-05",
  );
  assert.deepEqual(
    Object.values(v.rows).map((r) => r.balance),
    [3.5, 2.5, 4, 4.5, 3.5],
  );
  assert.equal(v.workouts, 3);
});
test("rest permits debt; zero is compliant; recovery restarts streak", () => {
  const v = score({ "2026-01-04": "confirmed" }, "2026-01-04");
  assert.deepEqual(
    Object.values(v.rows).map((r) => r.balance),
    [1, 0, -1, 0.5],
  );
  assert.equal(v.violations, 1);
  assert.equal(v.streak, 1);
  assert.equal(v.best, 2);
});
test("grace waives deduction; invalid nearby grace scores as rest", () => {
  const v = score(
    { "2026-01-01": "grace", "2026-01-02": "grace" },
    "2026-01-02",
  );
  assert.equal(v.rows["2026-01-01"].balance, 2);
  assert.equal(v.rows["2026-01-02"].status, "rest");
  assert.equal(v.b, 1);
  for (const [date, eligible] of [
    ["2026-01-30", false],
    ["2026-01-31", true],
    ["2026-02-01", true],
  ]) {
    assert.equal(
      S.graceEligible({ "2026-01-01": "grace" }, date, 30),
      eligible,
    );
  }
  assert.equal(
    S.graceEligible({ "2026-02-01": "grace" }, "2026-01-15", 30),
    false,
  );
  assert.equal(
    S.graceEligible({ "2026-01-01": "grace" }, "2026-01-01", 30),
    true,
  );
  assert.equal(
    score({ "2026-01-01": "grace", "2026-01-31": "grace" }, "2026-01-31").rows[
      "2026-01-31"
    ].status,
    "grace",
  );
});
test("private plans affect preview only and never count as confirmed workouts", () => {
  const records = { "2026-01-01": "planned" };
  assert.equal(score(records).b, 1);
  assert.equal(score(records, "2026-01-01", { preview: true }).b, 3.5);
  assert.equal(score(records, "2026-01-01", { preview: true }).workouts, 0);
});
test("historical corrections recompute all later capped balances and streaks without mutating input", () => {
  const records = {
    "2026-01-01": "confirmed",
    "2026-01-02": "confirmed",
    "2026-01-03": "confirmed",
  };
  const before = score(records, "2026-01-05");
  assert.equal(before.b, 2.5);
  delete records["2026-01-03"];
  const after = score(records, "2026-01-05");
  assert.equal(after.b, 1.5);
  assert.equal(before.rows["2026-01-03"].balance, 4.5);
  const empty = {};
  assert.equal(score(empty, "2026-01-04").best, 2);
  assert.deepEqual(empty, {});
  assert.equal(score({ "2026-01-01": "confirmed" }, "2026-01-04").best, 4);
});
test("uses configured rule values rather than hardcoded constants", () => {
  assert.equal(
    score({ "2026-01-01": "confirmed" }, "2026-01-01", {
      rules: { ...rules, starting_balance: 3, workout_credit: 2, bank_cap: 6 },
    }).b,
    5,
  );
});
test("leap days, month/year boundaries and month navigation", () => {
  assert.equal(S.addDays("2024-02-28", 1), "2024-02-29");
  assert.equal(S.addDays("2024-02-29", 1), "2024-03-01");
  assert.equal(S.addDays("2025-12-31", 1), "2026-01-01");
  assert.equal(S.dateKey(S.shiftMonth(new Date(2026, 0, 31), 1)), "2026-02-01");
  assert.equal(
    S.dateKey(S.shiftMonth(new Date(2026, 2, 31), -1)),
    "2026-02-01",
  );
  assert.equal(
    S.dateKey(S.shiftMonth(new Date(2026, 11, 31), 1)),
    "2027-01-01",
  );
});
test("calendar grace distances survive DST and timezone differences", () => {
  for (const tz of [
    "UTC",
    "America/New_York",
    "Europe/London",
    "Australia/Sydney",
  ]) {
    const output = execFileSync(
      process.execPath,
      [
        "-e",
        `const s=require('./scoring.js'); console.log(JSON.stringify([s.dayDistance('2026-03-01','2026-03-31'),s.dayDistance('2026-10-15','2026-11-14'),s.graceEligible({'2026-03-01':'grace'},'2026-03-31',30)]))`,
      ],
      {
        cwd: require("node:path").join(__dirname, ".."),
        env: { ...process.env, TZ: tz },
      },
    );
    assert.deepEqual(JSON.parse(output), [30, 30, true]);
  }
});
test("only six-digit hex colors can enter markup, including fallbacks", () => {
  assert.equal(S.safeColor("#aBc123"), "#aBc123");
  for (const value of [
    "red",
    "#fff",
    "#123456;display:none",
    '" onmouseover="x',
    "<img>",
    null,
    42,
    "#123456\n",
  ]) {
    assert.equal(S.safeColor(value, "#112233"), "#112233");
    assert.equal(S.safeColor(value, "bad"), "#F4C542");
  }
});
