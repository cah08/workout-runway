const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");
const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const worker = fs.readFileSync(path.join(root, "sw.js"), "utf8");
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, "manifest.webmanifest")),
);
const production = "https://lightweight.cactusbiceps.com";
function loadWorker() {
  const handlers = {},
    puts = [],
    fetches = [];
  const context = vm.createContext({
    self: {
      location: { origin: production },
      addEventListener: (name, fn) => (handlers[name] = fn),
      clients: { claim: async () => {} },
      skipWaiting: () => {
        throw Error("unexpected automatic activation");
      },
    },
    URL,
    crypto: crypto.webcrypto,
    Response,
    Request,
    AbortController,
    setTimeout,
    clearTimeout,
    caches: {
      open: async () => ({
        put: async (url, response) => puts.push([url, await response.text()]),
      }),
      keys: async () => [],
      match: async () => new Response("public shell"),
    },
    fetch: async (url, options) => {
      fetches.push([url, options]);
      const pathname = new URL(url.url || url, production).pathname;
      return new Response(
        fs.readFileSync(
          path.join(root, pathname === "/" ? "index.html" : pathname),
        ),
      );
    },
  });
  vm.runInContext(worker, context);
  return { handlers, puts, fetches, context };
}
test("manifest and Apple metadata use canonical root paths and required branding", () => {
  assert.equal(manifest.name, "Fitness Tracker");
  assert.equal(manifest.id, "/");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.theme_color, "#111418");
  assert.equal(manifest.background_color, "#111418");
  assert.match(html, /apple-mobile-web-app-capable" content="yes/);
  assert.match(html, /apple-touch-icon/);
  assert.match(html, /apple-mobile-web-app-title" content="Fitness Tracker/);
  for (const url of [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
    .map((m) => m[1])
    .filter((s) => s.startsWith("/"))
    .concat(manifest.icons.map((i) => i.src))) {
    assert.equal(new URL(url, production).origin, production);
    assert.ok(
      fs.existsSync(path.join(root, new URL(url, production).pathname)),
    );
  }
});
test("required PNG dimensions and dedicated maskable purpose", () => {
  for (const [file, size] of [
    ["icon-192.png", 192],
    ["icon-512.png", 512],
    ["icon-maskable-512.png", 512],
    ["apple-touch-icon.png", 180],
  ]) {
    const png = fs.readFileSync(path.join(root, "icons", file));
    assert.equal(png.toString("hex", 0, 8), "89504e470d0a1a0a");
    assert.equal(png.readUInt32BE(16), size);
    assert.equal(png.readUInt32BE(20), size);
  }
  assert.equal(
    manifest.icons.find((i) => i.purpose === "maskable").sizes,
    "512x512",
  );
});
test("local Supabase SDK matches existing integrity pin", () => {
  const sdk = fs.readFileSync(
    path.join(root, "vendor/supabase-2.118.0.min.js"),
  );
  const integrity =
    "sha384-" + crypto.createHash("sha384").update(sdk).digest("base64");
  assert.ok(html.includes('integrity="' + integrity + '"'));
  assert.ok(!html.includes("cdn.jsdelivr.net"));
});
test("installation precaches only explicit public files, without credentials", async () => {
  const { handlers, puts, fetches } = loadWorker();
  let installation;
  handlers.install({ waitUntil: (p) => (installation = p) });
  await installation;
  assert.equal(puts.length, 11);
  for (const [url, options] of fetches) {
    assert.equal(options.credentials, "omit");
    assert.equal(options.redirect, "error");
    assert.ok(
      url === "/" ||
        /^\/(?:app\.js|scoring\.js|sync\.js|pwa\.js|manifest\.webmanifest|icons\/[^?]+|vendor\/supabase[^?]+)\?v=[a-f0-9]+$/.test(
          url,
        ),
    );
    assert.ok(!url.includes("supabase.co"));
    assert.ok(!url.includes("token"));
  }
});
test("worker bypasses Supabase/authenticated requests, writes and non-allowlisted URLs", () => {
  const { handlers } = loadWorker();
  for (const request of [
    new Request("https://plgcecwxluqcfzlrnzfo.supabase.co/auth/v1/token"),
    new Request(
      "https://plgcecwxluqcfzlrnzfo.supabase.co/rest/v1/workout_days",
    ),
    new Request(production + "/private.json"),
    new Request(production + "/", { method: "POST", body: "private" }),
    new Request(production + "/", {
      headers: { authorization: "Bearer fixture" },
    }),
    new Request(production + "/app.js?token=recovery"),
  ])
    handlers.fetch({
      request,
      respondWith: () => assert.fail("private request intercepted"),
    });
});
test("recovery navigation is network-only with uncached offline guidance", async () => {
  const { handlers, context, puts } = loadWorker();
  context.fetch = async () => {
    throw Error("offline");
  };
  let result;
  handlers.fetch({
    request: {
      method: "GET",
      mode: "navigate",
      url: production + "/?code=DO_NOT_CACHE",
      headers: new Headers(),
    },
    respondWith: (p) => (result = p),
  });
  const response = await result;
  assert.equal(response.status, 503);
  assert.match(await response.text(), /Password recovery requires/);
  assert.deepEqual(puts, []);
});
test("normal navigation prefers network without writing the returned document into cache", async () => {
  const { handlers, puts } = loadWorker();
  let result;
  handlers.fetch({
    request: {
      method: "GET",
      mode: "navigate",
      url: production + "/",
      headers: new Headers(),
    },
    respondWith: (p) => (result = p),
  });
  assert.equal(await (await result).text(), html);
  assert.deepEqual(puts, []);
});

test("a failed required public asset rejects installation without automatic activation", async () => {
  const { handlers, context } = loadWorker();
  context.fetch = async () => new Response("unavailable", { status: 503 });
  let installation;
  handlers.install({ waitUntil: (p) => (installation = p) });
  await assert.rejects(installation, /Public asset unavailable/);
});
test("activation removes only this application’s obsolete caches", async () => {
  const { handlers, context } = loadWorker(),
    deleted = [];
  context.caches.keys = async () => [
    "another-app-cache",
    "fitness-tracker-public-old",
  ];
  context.caches.delete = async (key) => deleted.push(key);
  let activation;
  handlers.activate({ waitUntil: (p) => (activation = p) });
  await activation;
  assert.deepEqual(deleted, ["fitness-tracker-public-old"]);
});

test("mixed deployment content rejects installation rather than caching an inconsistent shell", async () => {
  const { handlers, context } = loadWorker();
  context.fetch = async () => new Response("different release content");
  let installation;
  handlers.install({ waitUntil: (p) => (installation = p) });
  await assert.rejects(installation, /changed during installation/);
});
