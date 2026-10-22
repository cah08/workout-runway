(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.FitnessSync = factory();
})(globalThis, function () {
  "use strict";
  // Use the count, not a short page, to determine completion: server row caps may
  // be smaller than our requested page size. Reject partial or changing results.
  async function loadWorkoutHistory(
    client,
    isCurrent = () => true,
    pageSize = 500,
  ) {
    const rows = [],
      seen = new Set();
    let expected;
    do {
      if (!isCurrent()) throw new Error("Superseded history request");
      const { data, error, count } = await client
        .from("workout_days")
        .select("user_id,workout_date,day_type", { count: "exact" })
        .order("workout_date")
        .order("user_id")
        .range(rows.length, rows.length + pageSize - 1);
      if (!isCurrent()) throw new Error("Superseded history request");
      if (error) throw error;
      if (
        !Array.isArray(data) ||
        !Number.isInteger(count) ||
        count < 0 ||
        (expected !== undefined && expected !== count)
      ) {
        throw new Error(
          "Workout history changed or its completeness could not be verified. Please retry.",
        );
      }
      expected = count;
      for (const row of data) {
        const key = JSON.stringify([row.user_id, row.workout_date]);
        if (seen.has(key))
          throw new Error(
            "Workout history changed during loading. Please retry.",
          );
        seen.add(key);
        rows.push(row);
      }
      if (
        rows.length > expected ||
        (data.length === 0 && rows.length < expected)
      ) {
        throw new Error("Incomplete workout history. Please retry.");
      }
    } while (rows.length < expected);
    return rows;
  }
  // Session epoch + request sequence prevent old completions from publishing.
  // Mutations invalidate reads immediately and remain locked through reconciliation.
  function createCoordinator() {
    let epoch = 0,
      sequence = 0,
      mutation = null;
    return {
      reset() {
        epoch++;
        sequence++;
        mutation = null;
      },
      invalidateReads() {
        sequence++;
      },
      beginRead({ afterSave = false } = {}) {
        if (mutation && !afterSave) return null;
        const e = epoch,
          s = ++sequence;
        return () => e === epoch && s === sequence;
      },
      beginMutation() {
        if (mutation) return null;
        const token = { epoch };
        mutation = token;
        sequence++;
        return token;
      },
      current(token) {
        return token.epoch === epoch && mutation === token;
      },
      finishMutation(token) {
        if (mutation === token) mutation = null;
      },
      get busy() {
        return mutation !== null;
      },
    };
  }
  return { loadWorkoutHistory, createCoordinator };
});
