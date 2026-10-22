const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadWorkoutHistory, createCoordinator } = require("../sync.js");
function client(pages) {
  const calls = [];
  return {
    calls,
    from(table) {
      assert.equal(table, "workout_days");
      return {
        select(fields, opts) {
          assert.equal(opts.count, "exact");
          return this;
        },
        order(field) {
          calls.push(field);
          return this;
        },
        async range(from, to) {
          calls.push([from, to]);
          const page = pages.shift();
          if (!page) throw Error("unexpected extra page");
          return page;
        },
      };
    },
  };
}
const row = (n) => ({
  user_id: "u",
  workout_date: `date-${n}`,
  day_type: "confirmed",
});
test("loads beyond server row cap using actual page lengths and stable compound ordering", async () => {
  const c = client([
    { data: [row(1), row(2)], count: 5 },
    { data: [row(3), row(4)], count: 5 },
    { data: [row(5)], count: 5 },
  ]);
  assert.equal((await loadWorkoutHistory(c)).length, 5);
  assert.deepEqual(c.calls, [
    "workout_date",
    "user_id",
    [0, 499],
    "workout_date",
    "user_id",
    [2, 501],
    "workout_date",
    "user_id",
    [4, 503],
  ]);
});
test("empty history is complete only with exact zero count", async () => {
  assert.deepEqual(
    await loadWorkoutHistory(client([{ data: [], count: 0 }])),
    [],
  );
});
test("refuses missing counts, partial results, duplicates, changed counts and page failures", async () => {
  for (const pages of [
    [{ data: [row(1)], count: null }],
    [
      { data: [row(1)], count: 2 },
      { data: [], count: 2 },
    ],
    [
      { data: [row(1)], count: 2 },
      { data: [row(1)], count: 2 },
    ],
    [
      { data: [row(1)], count: 2 },
      { data: [row(2)], count: 3 },
    ],
    [{ data: [row(1)], count: 2 }, { error: Error("network failed") }],
  ])
    await assert.rejects(loadWorkoutHistory(client(pages)));
});
test("superseded history stops without publishing partial rows", async () => {
  let current = true;
  const c = client([
    { data: [row(1)], count: 2 },
    { data: [row(2)], count: 2 },
  ]);
  const original = c.from;
  c.from = (table) => {
    const q = original(table),
      range = q.range;
    q.range = async (...args) => {
      const v = await range(...args);
      current = false;
      return v;
    };
    return q;
  };
  await assert.rejects(
    loadWorkoutHistory(c, () => current),
    /Superseded/,
  );
});
test("only latest read may publish; sign-out/account reset invalidates outstanding work", () => {
  const c = createCoordinator(),
    first = c.beginRead(),
    second = c.beginRead();
  assert.equal(first(), false);
  assert.equal(second(), true);
  c.reset();
  assert.equal(second(), false);
  assert.equal(c.beginRead()(), true);
});
test("mutation invalidates reads, rejects repeated writes, and locks through post-save refresh", () => {
  const c = createCoordinator(),
    old = c.beginRead(),
    token = c.beginMutation();
  assert.equal(old(), false);
  assert.equal(c.beginMutation(), null);
  assert.equal(c.beginRead(), null);
  const reconcile = c.beginRead({ afterSave: true });
  assert.equal(reconcile(), true);
  assert.equal(c.beginMutation(), null);
  assert.equal(c.beginRead(), null);
  c.finishMutation(token);
  assert.equal(c.busy, false);
  assert.ok(c.beginMutation());
});
test("old mutation completion cannot unlock a new account mutation", () => {
  const c = createCoordinator(),
    old = c.beginMutation();
  c.reset();
  const next = c.beginMutation();
  assert.equal(c.current(old), false);
  c.finishMutation(old);
  assert.equal(c.current(next), true);
  assert.equal(c.busy, true);
});
