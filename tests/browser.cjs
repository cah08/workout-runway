// Real pinned Supabase SDK; all backend traffic is intercepted with test fixtures.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const os = require("node:os");
const { chromium } = require("playwright-core");
const root = path.join(__dirname, "..");
const deadline = setTimeout(() => {
  console.error("Browser test deadline exceeded");
  process.exit(1);
}, 120000);
const server = http.createServer((req, res) => {
  const file = path.join(
    root,
    new URL(req.url, "http://localhost").pathname === "/"
      ? "index.html"
      : new URL(req.url, "http://localhost").pathname.slice(1),
  );
  if (!file.startsWith(root + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  fs.readFile(file, (error, data) => {
    if (error) {
      res.writeHead(404).end();
      return;
    }
    res.setHeader(
      "Content-Type",
      file.endsWith(".js") ? "application/javascript" : "text/html",
    );
    res.end(data);
  });
});
const rules = {
  id: 1,
  start_date: "2026-01-01",
  starting_balance: 2,
  workout_credit: 1.5,
  rest_cost: 1,
  bank_cap: 4.5,
  grace_window_days: 30,
};
const profiles = [
  { user_id: "u1", display_name: "Chris", is_admin: true },
  { user_id: "u2", display_name: "Kimberly", is_admin: false },
];
(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "fitness-browser-"));
  let browser;
  let passed = 0;
  try {
    browser = await chromium.launch({
      headless: true,
      ...(process.env.CHROMIUM_PATH
        ? { executablePath: process.env.CHROMIUM_PATH }
        : {}),
      args: ["--no-sandbox"],
      env: { ...process.env, HOME: home },
    });
    async function scenario(name, run) {
      const context = await browser.newContext({
        timezoneId: "America/New_York",
        serviceWorkers: "block",
      });
      const page = await context.newPage(),
        errors = [];
      page.on("pageerror", (e) => {
        errors.push(e.message);
        console.error(e.message);
      });
      const state = {
        rows: [],
        writes: 0,
        historyReads: 0,
        fail: false,
        holdRead: null,
        holdWrite: null,
      };
      await page.clock.setFixedTime(new Date("2026-01-31T17:00:00Z"));
      page.on("console", (msg) => {
        if (process.env.DEBUG_BROWSER) console.log(msg.type(), msg.text());
      });
      await page.route(
        "https://plgcecwxluqcfzlrnzfo.supabase.co/**",
        async (route) => {
          const request = route.request(),
            url = new URL(request.url());
          // No unmocked Supabase endpoint is allowed to leave the browser.
          if (!url.pathname.startsWith("/rest/v1/")) {
            await route.fulfill({ json: {} });
            return;
          }
          const table = url.pathname.split("/").pop();
          if (request.method() !== "GET") {
            state.writes++;
            if (state.holdWrite) await state.holdWrite;
            if (table === "workout_days") {
              const row = request.postDataJSON();
              if (request.method() === "POST")
                state.rows = [
                  ...state.rows.filter(
                    (r) =>
                      r.user_id !== row.user_id ||
                      r.workout_date !== row.workout_date,
                  ),
                  row,
                ];
              else
                state.rows = state.rows.filter(
                  (r) =>
                    r.workout_date !==
                    url.searchParams.get("workout_date")?.slice(3),
                );
            }
            await route.fulfill({ status: 200, json: [] });
            return;
          }
          let data;
          if (table === "workout_days") {
            state.historyReads++;
            assert.equal(
              url.searchParams.get("order"),
              "workout_date.asc,user_id.asc",
            );
            assert.match(request.headers().prefer, /count=exact/);
            const snapshot = state.rows.map((r) => ({ ...r })),
              count = snapshot.length;
            if (state.holdRead) {
              const gate = state.holdRead;
              state.holdRead = null;
              await gate;
            }
            if (state.fail) {
              await route.fulfill({
                status: 500,
                json: { message: "fixture history unavailable" },
              });
              return;
            }
            const offset = Number(url.searchParams.get("offset") || 0);
            data = snapshot.slice(offset, offset + 1); // Deliberately cap below requested size.
            await route.fulfill({
              json: data,
              headers: {
                "content-range": `${offset}-${offset + data.length - 1}/${count}`,
                "access-control-expose-headers": "content-range",
              },
            });
            return;
          }
          if (table === "profiles") data = profiles;
          else if (table === "challenge_settings") data = rules;
          else if (table === "participant_preferences")
            data = [{ user_id: "u1", accent_color: '" onmouseover="alert(1)' }];
          else throw Error("Unexpected table " + table);
          await route.fulfill({ json: data });
        },
      );
      try {
        await page.goto(`http://127.0.0.1:${server.address().port}/`);
        await page.waitForFunction(
          () => typeof sb !== "undefined" && sb && user === null,
        );
        await page.waitForTimeout(50);
        await page.evaluate(() =>
          showAuth({ user: { id: "u1", email: "test@example.invalid" } }),
        );
        await page.waitForFunction(() => dataReady);
        await run(page, state);
        assert.deepEqual(errors, []);
        passed++;
        console.log("PASS", name);
      } finally {
        await context.close();
      }
    }
    await scenario(
      "pinned SDK boots; complete capped pages and sanitized colors render",
      async (page, state) => {
        state.rows = [1, 2, 3].map((d) => ({
          user_id: "u1",
          workout_date: `2026-01-0${d}`,
          day_type: "confirmed",
        }));
        await page.evaluate(() => refresh());
        assert.equal(
          await page.evaluate(() => Object.keys(rec("Chris")).length),
          3,
        );
        assert.equal(await page.evaluate(() => color("Chris")), "#F4C542");
        assert.equal(await page.locator("[onmouseover]").count(), 0);
        assert.equal(
          await page.evaluate(() => compute("Chris", "2026-01-03").b),
          4.5,
        );
      },
    );
    await scenario(
      "older refresh cannot overwrite a newer refresh",
      async (page, state) => {
        let release;
        state.holdRead = new Promise((r) => (release = r));
        const reads = state.historyReads;
        await page.evaluate(() => {
          window.oldRefresh = refresh();
        });
        while (state.historyReads === reads)
          await new Promise((r) => setTimeout(r, 5));
        state.rows = [
          { user_id: "u1", workout_date: "2026-01-01", day_type: "confirmed" },
        ];
        assert.equal(await page.evaluate(() => refresh()), true);
        release();
        await page.evaluate(() => window.oldRefresh);
        assert.equal(
          await page.evaluate(() => state("Chris", "2026-01-01")),
          "confirmed",
        );
      },
    );
    await scenario(
      "sign-out and account switch discard pending reads and old DOM",
      async (page, state) => {
        let release;
        state.holdRead = new Promise((r) => (release = r));
        const reads = state.historyReads;
        await page.evaluate(() => {
          window.oldRefresh = refresh();
        });
        while (state.historyReads === reads)
          await new Promise((r) => setTimeout(r, 5));
        await page.evaluate(() => showAuth(null));
        assert.equal(await page.locator("#group").textContent(), "");
        await page.evaluate(() =>
          showAuth({ user: { id: "u2", email: "other@example.invalid" } }),
        );
        await page.waitForFunction(() => dataReady);
        release();
        await page.evaluate(() => window.oldRefresh);
        assert.equal(await page.evaluate(() => user.id), "u2");
        assert.match(await page.locator("#signedIn").textContent(), /Kimberly/);
      },
    );
    await scenario(
      "repeated mutations are blocked through the post-save refresh",
      async (page, state) => {
        let release;
        state.holdWrite = new Promise((r) => (release = r));
        await page.evaluate(() => {
          selected = "2026-01-01";
          window.save = act("confirmed");
        });
        while (state.writes === 0) await new Promise((r) => setTimeout(r, 5));
        // Supabase can emit SIGNED_IN again on focus for the same account.
        await page.evaluate(() => handleAuthChange("SIGNED_IN", { user }));
        await page.waitForTimeout(10);
        assert.equal(await page.evaluate(() => sync.busy), true);
        await page.evaluate(() => act("confirmed"));
        assert.equal(state.writes, 1);
        let releaseRead;
        state.holdRead = new Promise((r) => (releaseRead = r));
        const reads = state.historyReads;
        release();
        while (state.historyReads === reads)
          await new Promise((r) => setTimeout(r, 5));
        assert.equal(await page.evaluate(() => sync.busy), true);
        await page.evaluate(() => act("confirmed"));
        assert.equal(state.writes, 1);
        releaseRead();
        await page.evaluate(() => window.save);
        assert.equal(await page.evaluate(() => sync.busy), false);
        assert.equal(
          await page.evaluate(() => state("Chris", "2026-01-01")),
          "confirmed",
        );
      },
    );
    await scenario(
      "failed history retains prior records and disables writes until recovery",
      async (page, state) => {
        state.rows = [
          { user_id: "u1", workout_date: "2026-01-01", day_type: "confirmed" },
        ];
        await page.evaluate(() => refresh());
        state.fail = true;
        assert.equal(await page.evaluate(() => refresh()), false);
        assert.equal(
          await page.evaluate(() => state("Chris", "2026-01-01")),
          "confirmed",
        );
        assert.equal(await page.evaluate(() => dataReady), false);
        await page.evaluate(() => act("confirmed"));
        assert.equal(state.writes, 0);
        assert.match(
          await page.locator("#syncStatus").textContent(),
          /Editing is disabled/,
        );
        state.fail = false;
        await page.evaluate(() => refresh());
        assert.equal(await page.evaluate(() => dataReady), true);
      },
    );
    await scenario(
      "successful write with failed reconciliation cannot be toggled twice",
      async (page, state) => {
        state.fail = true;
        await page.evaluate(() => {
          selected = "2026-01-01";
          return act("confirmed");
        });
        assert.equal(state.writes, 1);
        assert.equal(await page.evaluate(() => dataReady), false);
        await page.evaluate(() => act("confirmed"));
        assert.equal(state.writes, 1);
        state.fail = false;
        await page.evaluate(() => refresh());
        assert.equal(
          await page.evaluate(() => state("Chris", "2026-01-01")),
          "confirmed",
        );
      },
    );
    await scenario(
      "ambiguous write is not replayed and its warning survives reconciliation",
      async (page, state) => {
        await page.evaluate(() =>
          mutate(async () => {
            throw Error("fixture transport error");
          }),
        );
        assert.equal(state.writes, 0);
        assert.match(
          await page.locator("#syncStatus").textContent(),
          /Save outcome was uncertain/,
        );
        assert.equal(await page.evaluate(() => dataReady), true);
      },
    );
    await scenario(
      "workout button toggles its label across dates and add/remove saves",
      async (page, state) => {
        await page.evaluate(() => {
          selected = "2026-01-01";
          showTab("calendar");
        });
        assert.equal(
          await page.locator("#confirm").textContent(),
          "Toggle Workout",
        );
        await page.click("#confirm");
        await page.waitForFunction(
          () => !sync.busy && state("Chris", "2026-01-01") === "confirmed",
        );
        assert.equal(
          await page.locator("#confirm").textContent(),
          "Remove Workout",
        );
        await page.click('[data-date="2026-01-02"]');
        assert.equal(
          await page.locator("#confirm").textContent(),
          "Toggle Workout",
        );
        await page.click('[data-date="2026-01-01"]');
        assert.equal(
          await page.locator("#confirm").textContent(),
          "Remove Workout",
        );
        await page.click("#confirm");
        await page.waitForFunction(
          () => !sync.busy && state("Chris", "2026-01-01") === "rest",
        );
        assert.equal(
          await page.locator("#confirm").textContent(),
          "Toggle Workout",
        );
        assert.equal(state.writes, 2);
      },
    );
    await scenario(
      "month navigation and local date refresh on midnight/resume",
      async (page) => {
        await page.evaluate(() => {
          month = new Date(2026, 0, 31);
          showTab("calendar");
        });
        await page.click("#next");
        assert.match(await page.locator("#month").textContent(), /February/);
        await page.clock.install({ time: new Date("2026-02-01T05:00:01Z") });
        await page.evaluate(() => window.dispatchEvent(new Event("pageshow")));
        assert.equal(await page.evaluate(() => today), "2026-02-01");
        await page.clock.setSystemTime(new Date("2026-02-02T05:00:01Z"));
        await page.clock.runFor(15001);
        assert.equal(await page.evaluate(() => today), "2026-02-02");
      },
    );
    console.log(`${passed} browser scenarios passed; production requests: 0`);
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(home, { recursive: true, force: true });
    clearTimeout(deadline);
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
