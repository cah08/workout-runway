const SUPABASE_URL = "https://plgcecwxluqcfzlrnzfo.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_pDqAmVZ0tvZ-nEUhdMAN8Q_rHZiRvj6";
const names = ["Chris", "Kimberly", "RJ", "Jeff", "Molly"];
const defaults = {
  Chris: "#F4C542",
  Kimberly: "#3B82F6",
  RJ: "#EF4444",
  Jeff: "#22C55E",
  Molly: "#EC4899",
};
const { dateKey, shiftMonth, safeColor, graceEligible } = FitnessScoring;
const $ = (id) => document.getElementById(id);
let today = dateKey(new Date());
const sync = FitnessSync.createCoordinator();
let dataReady = false;
let authEvent = 0;
let sb,
  user = null,
  profiles = [],
  preferences = {},
  person = "",
  month = new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  selected = today,
  activeTab = "dashboard",
  recoveryMode = false;
let store = { start: today, records: {} },
  rules = {
    starting_balance: 2,
    workout_credit: 1.5,
    rest_cost: 1,
    bank_cap: 4.5,
    grace_window_days: 30,
  };
const rec = (n) => store.records[n] || {},
  state = (n, k) => rec(n)[k] || "rest",
  profile = () => profiles.find((p) => p.user_id === user?.id),
  ownName = () => profile()?.display_name || "",
  admin = () => profile()?.is_admin === true;
const color = (n) =>
  safeColor(
    preferences[profiles.find((p) => p.display_name === n)?.user_id],
    defaults[n],
  );
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
function compute(n, end, preview = false) {
  return FitnessScoring.compute({
    start: store.start,
    records: rec(n),
    rules,
    end,
    preview,
  });
}
function cactus(v) {
  const stage =
    v.streak === 0
      ? 0
      : v.streak < 3
        ? 1
        : v.streak < 14
          ? 2
          : v.streak < 30
            ? 3
            : 4;
  const label = [
    "Wilted · recovery time",
    "Seedling",
    "Growing",
    "Strong",
    "Blooming",
  ][stage];
  const symbol =
    stage === 0 ? "🥀" : stage === 1 ? "🌱" : stage === 4 ? "🌵🌼" : "🌵";
  const size = [38, 35, 45, 56, 60][stage];
  return `<div class="cactus-wrap"><span class="cactus-icon" style="--cactus-size:${size}px;--cactus-rotate:${stage === 0 ? "16deg" : "0deg"}">${symbol}</span><div class="cactus-label">${label} · ${v.streak}-day streak</div><div class="muted tiny">Best: ${v.best} days</div></div>`;
}
function showTab(tab) {
  activeTab = tab;
  for (const t of ["dashboard", "calendar", "help", "account"])
    $("tab-" + t).classList.toggle("hidden", t !== tab);
  document
    .querySelectorAll("[data-tab]")
    .forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  if (tab === "calendar") renderCalendar();
}
document
  .querySelectorAll("[data-tab]")
  .forEach((b) => (b.onclick = () => showTab(b.dataset.tab)));
function render() {
  if (!user || !profiles.length) return;
  const mine = ownName();
  $("signedIn").textContent = "Signed in as " + mine;
  document.documentElement.style.setProperty("--accent", color(mine));
  $("group").innerHTML = names
    .filter((n) => profiles.some((p) => p.display_name === n))
    .map((n) => {
      const v = compute(n, today),
        c = color(n);
      return `<div class="card" style="--person-color:${c}"><div class="group-name"><span class="avatar">${esc(n.slice(0, 1))}</span><span class="accent-name">${esc(n)}</span></div><div class="number ${v.b < 0 ? "bad" : "good"}">${v.b.toFixed(1)} <span class="muted tiny">/ ${rules.bank_cap}</span></div><div class="meter"><div style="width:${Math.min(100, Math.max(0, (v.b / Number(rules.bank_cap)) * 100))}%"></div></div><div class="muted tiny">${v.workouts} workouts · ${v.violations} debt days</div>${cactus(v)}</div>`;
    })
    .join("");
  const v = compute(mine, today);
  $("personalStats").innerHTML = [
    ["Banked days", v.b.toFixed(1)],
    ["Current streak", v.streak + " days"],
    ["Best streak", v.best + " days"],
  ]
    .map(
      ([label, value]) =>
        `<div class="card"><div class="number">${esc(value)}</div><div class="muted">${esc(label)}</div></div>`,
    )
    .join("");
  $("progressNote").textContent =
    v.b < 0
      ? "Your bank is negative. A confirmed workout helps you recover and your cactus will perk up when you reach a nonnegative balance."
      : `You're on track! ${v.b.toFixed(1)} days banked. Keep your cactus growing.`;
  $("startDate").value = store.start;
  $("startDate").disabled = !admin();
  $("adminNote").textContent = admin()
    ? "Chris administrator access: you can update the challenge start date."
    : "Only Chris can change global challenge settings.";
  $("creditLabel").textContent = "+" + rules.workout_credit;
  $("restLabel").textContent = "−" + rules.rest_cost;
  $("capLabel").textContent = rules.bank_cap;
  $("startingLabel").textContent = rules.starting_balance;
  $("accountIdentity").textContent =
    `${mine} · ${user.email || ""}${admin() ? " · Administrator" : ""}`;
  $("myColor").value = color(mine);
  $("colorCode").textContent = color(mine);
  renderCalendar();
}
function renderCalendar() {
  if (!user || !profiles.length) return;
  const view = person,
    own = view === ownName();
  $("people").innerHTML = names
    .filter((n) => profiles.some((p) => p.display_name === n))
    .map(
      (n) =>
        `<button data-name="${esc(n)}" class="${n === view ? "active" : ""}" style="${n === view ? "border-color:" + color(n) : ""}">${esc(n)}</button>`,
    )
    .join("");
  document.querySelectorAll("[data-name]").forEach(
    (b) =>
      (b.onclick = () => {
        person = b.dataset.name;
        renderCalendar();
      }),
  );
  $("month").textContent = month.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
  const first = new Date(month.getFullYear(), month.getMonth(), 1),
    offset = first.getDay(),
    count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate(),
    end = dateKey(new Date(month.getFullYear(), month.getMonth() + 1, 0)),
    projection = compute(view, end > today ? end : today, own);
  let html = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    .map((d) => `<div class="dow">${d}</div>`)
    .join("");
  for (let i = 0; i < offset; i++) html += '<div class="day empty"></div>';
  for (let d = 1; d <= count; d++) {
    const k = dateKey(new Date(month.getFullYear(), month.getMonth(), d)),
      s = state(view, k),
      v = projection.rows[k]?.balance,
      active = k >= store.start,
      cls =
        s === "confirmed"
          ? "confirmed"
          : s === "planned" && own
            ? "planned"
            : s === "grace"
              ? "grace"
              : "";
    const label =
      s === "confirmed"
        ? "✓ Workout"
        : s === "planned" && own
          ? "◌ Planned"
          : s === "grace"
            ? "★ Grace"
            : "Rest";
    html += `<button class="day ${cls} ${k === today ? "today" : ""} ${k === selected ? "selected" : ""}" data-date="${k}" ${active ? "" : "disabled"}><div class="date">${d}</div><div class="status">${active ? label : "—"}</div><div class="balance ${v < 0 ? "bad" : ""}">${active && v !== undefined ? v.toFixed(1) : ""}</div></button>`;
  }
  $("calendar").innerHTML = html;
  document.querySelectorAll("[data-date]").forEach((b) => {
    let hold,
      held = false;
    b.onclick = () => {
      if (held) {
        held = false;
        return;
      }
      selected = b.dataset.date;
      renderCalendar();
    };
    b.ondblclick = () => {
      if (own) {
        selected = b.dataset.date;
        act("confirmed");
      }
    };
    b.oncontextmenu = (e) => {
      e.preventDefault();
      if (own) {
        selected = b.dataset.date;
        act("confirmed");
      }
    };
    b.addEventListener(
      "touchstart",
      () => {
        held = false;
        if (own)
          hold = setTimeout(() => {
            held = true;
            selected = b.dataset.date;
            act("confirmed");
          }, 650);
      },
      { passive: true },
    );
    for (const ev of ["touchend", "touchmove", "touchcancel"])
      b.addEventListener(ev, () => clearTimeout(hold), { passive: true });
  });
  const row = projection.rows[selected];
  $("selectedInfo").textContent =
    `${selected}: ${own ? state(view, selected) : state(view, selected) === "planned" ? "rest" : state(view, selected)} · ${row ? "Projected balance " + row.balance.toFixed(1) : "before challenge start"} · ${view}'s calendar. Official balance today: ${compute(view, today).b.toFixed(1)}.`;
  $("viewNote").textContent = own
    ? "Your calendar: plans are private; confirmed workouts and grace days are shared."
    : "Viewing " +
      view +
      "'s shared workout history. You cannot edit another person's calendar.";
  updateControls();
}
function updateToday() {
  const next = dateKey(new Date());
  if (next === today) return false;
  today = next;
  render();
  return true;
}
function updateControls() {
  const editable = !!user && dataReady && !sync.busy && !recoveryMode;
  for (const id of ["plan", "confirm", "grace", "rest"]) {
    $(id).disabled =
      !editable ||
      person !== ownName() ||
      selected < store.start ||
      (id === "confirm" && selected > today);
  }
  $("startDate").disabled = !editable || !admin();
  $("saveColor").disabled = !editable;
}
async function refresh({ afterSave = false } = {}) {
  if (!user || recoveryMode) return false;
  const current = sync.beginRead({ afterSave });
  if (!current) return false;
  updateToday();
  try {
    const [pr, wr, st, pref] = await Promise.all([
      sb.from("profiles").select("user_id,display_name,is_admin"),
      FitnessSync.loadWorkoutHistory(sb, current),
      sb.from("challenge_settings").select("*").eq("id", 1).single(),
      sb.from("participant_preferences").select("user_id,accent_color"),
    ]);
    if (!current()) return false;
    for (const result of [pr, st]) if (result.error) throw result.error;
    const nextStore = { start: st.data.start_date, records: {} };
    for (const row of wr) {
      const participant = pr.data.find((p) => p.user_id === row.user_id);
      if (participant) {
        nextStore.records[participant.display_name] ||= {};
        nextStore.records[participant.display_name][row.workout_date] =
          row.day_type;
      }
    }
    profiles = pr.data;
    rules = st.data;
    store = nextStore;
    preferences = pref.error
      ? {}
      : Object.fromEntries(
          pref.data.map((p) => [p.user_id, safeColor(p.accent_color)]),
        );
    if (pref.error && !["42P01", "PGRST205"].includes(pref.error.code))
      console.warn("Color preferences unavailable:", pref.error.message);
    if (!person || !profiles.some((p) => p.display_name === person))
      person = ownName();
    dataReady = true;
    $("syncStatus").textContent = "";
    render();
    return true;
  } catch (error) {
    if (!current()) return false;
    dataReady = false;
    console.error(error);
    $("syncStatus").textContent =
      "Sync failed; displayed data may be outdated. Editing is disabled until sync succeeds. " +
      error.message;
    return false;
  } finally {
    if (current()) updateControls();
  }
}
async function mutate(write) {
  if (!user || !dataReady || recoveryMode) return false;
  const token = sync.beginMutation();
  if (!token) return false;
  const userId = user.id;
  updateControls();
  try {
    const { error } = await write(userId);
    if (!sync.current(token)) return false;
    // Even a failed/ambiguous request may have reached the server. Reconcile
    // before another toggle, rather than automatically retrying a write.
    dataReady = false;
    const refreshed = await refresh({ afterSave: true });
    if (!sync.current(token)) return false;
    if (error)
      $("syncStatus").textContent =
        "Save failed: " +
        error.message +
        (refreshed ? "" : " Sync is also unavailable.");
    return !error && refreshed;
  } catch (error) {
    if (sync.current(token)) {
      dataReady = false;
      const refreshed = await refresh({ afterSave: true });
      if (sync.current(token))
        $("syncStatus").textContent =
          "Save outcome was uncertain. " +
          (refreshed
            ? "Latest server data has been reloaded; check the selected date before retrying. "
            : "Editing is disabled until sync succeeds. ") +
          error.message;
    }
    return false;
  } finally {
    sync.finishMutation(token);
    updateControls();
  }
}
async function act(kind) {
  updateToday();
  if (
    !user ||
    !dataReady ||
    sync.busy ||
    person !== ownName() ||
    selected < store.start
  )
    return;
  if (kind === "confirmed" && selected > today) {
    alert("Future workouts can only be planned.");
    return;
  }
  const date = selected,
    old = state(person, date);
  const next = kind === "rest" ? "rest" : old === kind ? "rest" : kind;
  if (
    next === "grace" &&
    !graceEligible(rec(person), date, rules.grace_window_days)
  ) {
    alert(
      "You already used a grace day within " +
        rules.grace_window_days +
        " days of this date.",
    );
    return;
  }
  await mutate((userId) =>
    next === "rest"
      ? sb
          .from("workout_days")
          .delete()
          .eq("user_id", userId)
          .eq("workout_date", date)
      : sb
          .from("workout_days")
          .upsert(
            { user_id: userId, workout_date: date, day_type: next },
            { onConflict: "user_id,workout_date" },
          ),
  );
}
$("plan").onclick = () => act("planned");
$("confirm").onclick = () => act("confirmed");
$("grace").onclick = () => act("grace");
$("rest").onclick = () => act("rest");
$("prev").onclick = () => {
  month = shiftMonth(month, -1);
  renderCalendar();
};
$("next").onclick = () => {
  month = shiftMonth(month, 1);
  renderCalendar();
};
$("today").onclick = () => {
  updateToday();
  month = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  selected = today;
  renderCalendar();
};
$("startDate").onchange = async (e) => {
  if (!admin() || !e.target.value) return;
  const start = e.target.value;
  await mutate(() =>
    sb
      .from("challenge_settings")
      .update({ start_date: start, updated_at: new Date().toISOString() })
      .eq("id", 1),
  );
};
$("myColor").oninput = (e) =>
  ($("colorCode").textContent = safeColor(e.target.value));
$("saveColor").onclick = async () => {
  const c = safeColor($("myColor").value);
  $("colorStatus").textContent = "Saving…";
  const owner = user;
  const saved = await mutate((userId) =>
    sb.from("participant_preferences").upsert(
      {
        user_id: userId,
        accent_color: c,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    ),
  );
  if (user === owner)
    $("colorStatus").textContent = saved
      ? "Color saved!"
      : "Color could not be confirmed. See sync status.";
};
$("resetColor").onclick = () => {
  $("myColor").value = defaults[ownName()] || "#F4C542";
  $("colorCode").textContent = $("myColor").value;
};
$("changePasswordForm").onsubmit = async (e) => {
  e.preventDefault();
  const p = $("newPassword").value,
    c = $("confirmPassword").value;
  if (p !== c) {
    $("passwordStatus").textContent = "Passwords do not match.";
    return;
  }
  if (p.length < 8) {
    $("passwordStatus").textContent = "Use at least 8 characters.";
    return;
  }
  $("passwordStatus").textContent = "Updating…";
  const { error } = await sb.auth.updateUser({ password: p });
  $("passwordStatus").textContent = error
    ? "Could not update password: " + error.message
    : "Password updated successfully.";
  if (!error) $("changePasswordForm").reset();
};
function clearParticipantState() {
  profiles = [];
  preferences = {};
  person = "";
  dataReady = false;
  store = { start: today, records: {} };
  for (const id of ["group", "personalStats", "calendar", "people"])
    $(id).replaceChildren();
  for (const id of [
    "signedIn",
    "accountIdentity",
    "progressNote",
    "selectedInfo",
    "colorStatus",
    "passwordStatus",
    "syncStatus",
  ])
    $(id).textContent = "";
}
$("signOut").onclick = async () => {
  sync.reset();
  clearParticipantState();
  updateControls();
  const { error } = await sb.auth.signOut();
  if (error) {
    $("syncStatus").textContent = "Could not sign out: " + error.message;
    await refresh();
  } else showAuth(null);
};
function showAuth(session) {
  const next = session?.user || null;
  if (next?.id !== user?.id || recoveryMode) {
    sync.reset();
    clearParticipantState();
  }
  user = next;
  updateToday();
  $("authScreen").classList.toggle("hidden", !!user || recoveryMode);
  $("app").classList.toggle("hidden", !user || recoveryMode);
  $("recoveryScreen").classList.toggle("hidden", !recoveryMode);
  updateControls();
  if (user && !recoveryMode) {
    $("authStatus").textContent = "";
    refresh();
  }
}
$("loginForm").onsubmit = async (e) => {
  e.preventDefault();
  $("authStatus").textContent = "Signing in…";
  const { error } = await sb.auth.signInWithPassword({
    email: $("email").value.trim(),
    password: $("password").value,
  });
  if (error) $("authStatus").textContent = error.message;
  else $("password").value = "";
};
$("resetPassword").onclick = async () => {
  const email = $("email").value.trim();
  if (!email) {
    $("authStatus").textContent = "Enter your email address first.";
    return;
  }
  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: location.origin + location.pathname,
  });
  $("authStatus").textContent = error
    ? error.message
    : "If the account exists, a password-reset email will arrive.";
};
$("recoveryForm").onsubmit = async (e) => {
  e.preventDefault();
  const p = $("recoveryNew").value,
    c = $("recoveryConfirm").value;
  if (p !== c) {
    $("recoveryStatus").textContent = "Passwords do not match.";
    return;
  }
  const { error } = await sb.auth.updateUser({ password: p });
  $("recoveryStatus").textContent = error
    ? "Could not update: " + error.message
    : "Password updated! You can now return to Fitness Tracker.";
  if (!error) $("recoveryForm").reset();
};
$("recoveryBack").onclick = () => {
  recoveryMode = false;
  showAuth({ user });
  showTab("dashboard");
};
function resume() {
  updateToday();
  if (document.visibilityState === "visible" && user && !recoveryMode)
    refresh();
}
function handleAuthChange(event, session) {
  if (
    [
      "PASSWORD_RECOVERY",
      "SIGNED_IN",
      "SIGNED_OUT",
      "INITIAL_SESSION",
    ].includes(event)
  ) {
    const version = ++authEvent;
    // Invalidate synchronously; an already completed request must not publish
    // while this auth callback is waiting for its deferred UI work.
    if (
      event === "SIGNED_OUT" ||
      event === "PASSWORD_RECOVERY" ||
      session?.user?.id !== user?.id
    ) {
      sync.reset();
      dataReady = false;
    }
    setTimeout(() => {
      if (version !== authEvent) return;
      recoveryMode =
        event === "PASSWORD_RECOVERY" ||
        (recoveryMode && event !== "SIGNED_OUT");
      showAuth(session);
    }, 0);
  }
}

async function boot() {
  if (!window.supabase) {
    $("authStatus").textContent =
      "Supabase library failed to load. Check your connection.";
    return;
  }
  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  sb.auth.onAuthStateChange(handleAuthChange);
  const version = authEvent;
  const { data, error } = await sb.auth.getSession();
  if (version === authEvent && !recoveryMode) {
    if (error) $("authStatus").textContent = error.message;
    else showAuth(data.session);
  }
  setInterval(() => {
    if (document.visibilityState === "visible") resume();
  }, 15000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") resume();
  });
  window.addEventListener("pageshow", resume);
  window.addEventListener("focus", resume);
}
boot();
