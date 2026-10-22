// Real service workers, local static hosting and the pinned SDK. No live backend.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const { chromium } = require("playwright-core");
const root = path.join(__dirname, "..");
const serverState = { release: 1, navigations: 0 };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  const file = path.join(
    root,
    url.pathname === "/" ? "index.html" : url.pathname.slice(1),
  );
  if (!file.startsWith(root + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  if (url.pathname === "/private.json") {
    res.setHeader("Content-Type", "application/json");
    res.end('{"private":"DO_NOT_CACHE"}');
    return;
  }
  fs.readFile(file, (error, bytes) => {
    if (error) {
      res.writeHead(404).end();
      return;
    }
    if (url.pathname === "/") serverState.navigations++;
    if (url.pathname === "/sw.js")
      bytes = Buffer.from(
        bytes
          .toString()
          .replace(
            /const RELEASE = "[^"]+"/,
            `const RELEASE = "browser-release-${serverState.release}"`,
          ),
      );
    res.setHeader("Cache-Control", "no-store");
    res.setHeader(
      "Content-Type",
      file.endsWith(".js")
        ? "application/javascript"
        : file.endsWith(".png")
          ? "image/png"
          : file.endsWith(".webmanifest")
            ? "application/manifest+json"
            : "text/html",
    );
    res.end(bytes);
  });
});
const deadline = setTimeout(() => {
  console.error("PWA browser deadline exceeded");
  process.exit(1);
}, 120000);
(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "fitness-pwa-"));
  let browser,
    passed = 0;
  try {
    const launchOptions = {
      headless: true,
      ...(process.env.CHROMIUM_PATH
        ? { executablePath: process.env.CHROMIUM_PATH }
        : {}),
      args: ["--no-sandbox"],
      env: { ...process.env, HOME: home },
    };
    async function fixture(run) {
      serverState.release = 1;
      const context = await chromium.launchPersistentContext(
        fs.mkdtempSync(path.join(home, "profile-")),
        { ...launchOptions, serviceWorkers: "allow" },
      );
      let writes = 0;
      const errors = [];
      context.on("page", (page) => {
        page.on("pageerror", (error) => errors.push(error.message));
      });
      await context.route("**/*", async (route) => {
        const request = route.request(),
          url = new URL(request.url());
        if (url.origin === origin) {
          await route.continue();
          return;
        }
        // Every remote request is either mocked or aborted, never continued.
        if (url.hostname !== "plgcecwxluqcfzlrnzfo.supabase.co") {
          await route.abort();
          return;
        }
        if (request.method() !== "GET") {
          writes++;
          await route.fulfill({ json: [] });
          return;
        }
        const today = require("../scoring.js").dateKey(new Date());
        let data = {};
        if (url.pathname.endsWith("/profiles"))
          data = [{ user_id: "u1", display_name: "Chris", is_admin: true }];
        if (url.pathname.endsWith("/workout_days")) data = [];
        if (url.pathname.endsWith("/challenge_settings"))
          data = {
            id: 1,
            start_date: today,
            starting_balance: 2,
            workout_credit: 1.5,
            rest_cost: 1,
            bank_cap: 4.5,
            grace_window_days: 30,
          };
        if (url.pathname.endsWith("/participant_preferences")) data = [];
        await route.fulfill({
          json: data,
          headers: {
            "content-range": "*/0",
            "access-control-expose-headers": "content-range",
          },
        });
      });
      const page = await context.newPage();
      try {
        await page.goto(origin + "/");
        await page.evaluate(() => navigator.serviceWorker.ready);
        await page.waitForFunction(() => !!navigator.serviceWorker.controller);
        await page.waitForFunction(() => typeof sb !== "undefined" && sb);
        await page.waitForTimeout(50);
        await run({ page, context, writes: () => writes });
        assert.deepEqual(errors, []);
        passed++;
      } finally {
        await context.close();
      }
    }
    await fixture(async ({ page, context, writes }) => {
      assert.equal(
        await page.locator("#updateNotice").isVisible(),
        false,
        "first installation is not an update",
      );
      const cdp = await context.newCDPSession(page);
      const manifest = await cdp.send("Page.getAppManifest");
      assert.equal(manifest.errors.length, 0);
      const data = JSON.parse(manifest.data);
      assert.equal(data.name, "Fitness Tracker");
      assert.equal(data.scope, "/");
      const install = await cdp.send("Page.getInstallabilityErrors");
      console.log(
        "Chromium installability errors:",
        JSON.stringify(install.installabilityErrors),
      );
      assert.deepEqual(install.installabilityErrors, []);
      await page.evaluate(() =>
        showAuth({ user: { id: "u1", email: "fixture@example.invalid" } }),
      );
      await page.waitForFunction(() => dataReady);
      await page.evaluate(() => showTab("calendar"));
      await context.setOffline(true);
      await page.waitForFunction(() => navigator.onLine === false);
      assert.equal(await page.locator("#offlineNotice").isVisible(), true);
      assert.equal(await page.locator("#confirm").isDisabled(), true);
      await page.evaluate(() => act("confirmed"));
      assert.equal(writes(), 0);
      await page.reload({ waitUntil: "load" });
      assert.equal(await page.locator("#offlineNotice").isVisible(), true);
      assert.equal(
        await page.evaluate(() => !!window.supabase && !!window.FitnessScoring),
        true,
        "offline shell includes all scripts",
      );
      assert.equal(
        await page.evaluate(() => !!navigator.serviceWorker.controller),
        true,
      );
      await context.setOffline(false);
      console.log(
        "PASS installability, first-install behavior, offline shell and write blocking",
      );
    });
    await fixture(async ({ page, context }) => {
      await page.evaluate(async () => {
        await fetch("/private.json");
        await fetch(SUPABASE_URL + "/auth/v1/settings", {
          headers: { apikey: SUPABASE_PUBLISHABLE_KEY },
        });
        await fetch(SUPABASE_URL + "/rest/v1/workout_days?select=*", {
          headers: { apikey: SUPABASE_PUBLISHABLE_KEY },
        });
      });
      await page.goto(origin + "/?type=recovery&token_hash=DO_NOT_CACHE");
      const keys = await page.evaluate(async () => {
        const result = [];
        for (const key of await caches.keys())
          for (const request of await (await caches.open(key)).keys())
            result.push(request.url);
        return result;
      });
      assert.equal(keys.length, 11);
      assert.ok(keys.every((url) => url.startsWith(origin + "/")));
      assert.ok(
        keys.every(
          (url) =>
            !url.includes("DO_NOT_CACHE") &&
            !url.includes("private") &&
            !url.includes("/auth/") &&
            !url.includes("/rest/"),
        ),
      );
      await context.setOffline(true);
      const response = await page.goto(
        origin + "/?type=recovery&token_hash=DO_NOT_CACHE",
      );
      assert.equal(response.status(), 503);
      assert.match(
        await page.locator("body").textContent(),
        /Password recovery requires/,
      );
      console.log(
        "PASS no API, private response or recovery URL in caches; offline recovery guidance",
      );
    });
    await fixture(async ({ page, context }) => {
      const other = await context.newPage();
      await other.goto(origin + "/");
      await other.evaluate(() =>
        showAuth({ user: { id: "u1", email: "fixture@example.invalid" } }),
      );
      await other.waitForFunction(() => dataReady);
      await other.evaluate(() => {
        window.pendingSave = mutate(
          () =>
            new Promise((resolve) => {
              window.finishSave = () => resolve({ error: null });
            }),
        );
      });
      const otherNavigations = [];
      other.on("framenavigated", (frame) => {
        if (frame === other.mainFrame()) otherNavigations.push(frame.url());
      });
      serverState.release = 2;
      await page.evaluate(async () => {
        const reg = await navigator.serviceWorker.getRegistration();
        await reg.update();
      });
      await page.waitForFunction(
        async () => !!(await navigator.serviceWorker.getRegistration()).waiting,
      );
      await page.waitForFunction(
        () =>
          !document.getElementById("updateNotice").classList.contains("hidden"),
      );
      // Save in this tab too: Refresh must not activate the worker mid-save.
      await page.evaluate(() =>
        showAuth({ user: { id: "u1", email: "fixture@example.invalid" } }),
      );
      await page.waitForFunction(() => dataReady);
      await page.evaluate(() => {
        window.pendingSave = mutate(
          () =>
            new Promise((resolve) => {
              window.finishSave = () => resolve({ error: null });
            }),
        );
      });
      assert.equal(await page.locator("#refreshApp").isDisabled(), true);
      await page.evaluate(() => document.getElementById("refreshApp").click());
      assert.ok(
        await page.evaluate(
          async () =>
            !!(await navigator.serviceWorker.getRegistration()).waiting,
        ),
      );
      await page.evaluate(() => window.finishSave());
      await page.evaluate(() => window.pendingSave);
      await Promise.all([page.waitForEvent("load"), page.click("#refreshApp")]);
      await page.waitForFunction(() => !!navigator.serviceWorker.controller);
      await other.waitForFunction(
        () =>
          !document.getElementById("updateNotice").classList.contains("hidden"),
      );
      assert.equal(
        otherNavigations.length,
        0,
        "another tab must not reload during its save",
      );
      assert.equal(await other.locator("#refreshApp").isDisabled(), true);
      await other.evaluate(() => window.finishSave());
      await other.evaluate(() => window.pendingSave);
      assert.equal(await other.locator("#refreshApp").isDisabled(), false);
      assert.equal(
        otherNavigations.length,
        0,
        "another tab still requires an explicit Refresh",
      );
      const cacheNames = await page.evaluate(() => caches.keys());
      assert.deepEqual(cacheNames, [
        "fitness-tracker-public-browser-release-2",
      ]);
      console.log(
        "PASS user-controlled update, pending-save locks, multi-tab safety and cache cleanup",
      );
    });
    await fixture(async ({ page }) => {
      serverState.release = 2;
      await page.evaluate(async () => {
        const reg = await navigator.serviceWorker.getRegistration();
        await reg.update();
      });
      await page.waitForFunction(
        async () => !!(await navigator.serviceWorker.getRegistration()).waiting,
      );
      await page.waitForFunction(
        () =>
          !document.getElementById("updateNotice").classList.contains("hidden"),
      );
      let navigations = 0;
      page.on("framenavigated", (frame) => {
        if (frame === page.mainFrame()) navigations++;
      });
      await page.evaluate(() => {
        const send = ServiceWorker.prototype.postMessage;
        ServiceWorker.prototype.postMessage = function (message) {
          window.delayedActivation = () => send.call(this, message);
        };
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          window.updateActivated = true;
        });
      });
      await page.click("#refreshApp");
      await page.evaluate(() => {
        window.pendingAuth = withAuthAction(
          () =>
            new Promise((resolve) => {
              window.finishAuth = () => resolve({ error: null });
            }),
        );
        window.delayedActivation();
      });
      await page.waitForFunction(() => window.updateActivated);
      assert.equal(
        navigations,
        0,
        "a save starting after the click must postpone reload",
      );
      assert.equal(await page.locator("#refreshApp").isDisabled(), true);
      await page.evaluate(() => window.finishAuth());
      await page.evaluate(() => window.pendingAuth);
      assert.equal(
        navigations,
        0,
        "finishing the action must not reload automatically",
      );
      assert.equal(await page.locator("#refreshApp").isDisabled(), false);
      await Promise.all([page.waitForEvent("load"), page.click("#refreshApp")]);
      console.log(
        "PASS activation-gap safety for account actions; a second explicit Refresh is required",
      );
    });
    console.log(
      `${passed} PWA browser scenarios passed; production backend requests: 0`,
    );
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
