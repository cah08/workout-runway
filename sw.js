/* Public application files only. Generated versions are checked in CI. */
// BEGIN GENERATED PWA ASSETS
const RELEASE = "835548401751298c";
const SHELL_HASH = "2ab4395fe5fe6bfb";
const PUBLIC_ASSETS = [
  "/",
  "/app.js?v=93f5e9c14de421d9",
  "/scoring.js?v=3b9042f63383d032",
  "/sync.js?v=b8092bf7e22ab168",
  "/pwa.js?v=c51253a1ae48e3f0",
  "/vendor/supabase-2.118.0.min.js?v=bee24fc29228ed5a",
  "/icons/icon-192.png?v=4bb83e013af96a0c",
  "/icons/icon-512.png?v=010767bc76dddc3d",
  "/icons/icon-maskable-512.png?v=a740afb1bd70a417",
  "/icons/apple-touch-icon.png?v=3bf5d3685304e2e5",
  "/manifest.webmanifest?v=d079afee1e6aa41c"
];
// END GENERATED PWA ASSETS
const CACHE_PREFIX = "fitness-tracker-public-";
const CACHE_NAME = CACHE_PREFIX + RELEASE;
const ASSET_URLS = new Set(
  PUBLIC_ASSETS.map((path) => new URL(path, self.location.origin).href),
);

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // No cookies, query-bearing documents, redirects, API traffic or user state.
      // A failed file prevents installation; the current worker keeps serving.
      await Promise.all(
        PUBLIC_ASSETS.map(async (path) => {
          const response = await fetch(path, {
            cache: "reload",
            credentials: "omit",
            redirect: "error",
          });
          if (!response.ok || response.type === "opaque")
            throw new Error("Public asset unavailable: " + path);
          // Reject mixed files if a deployment changes while installation runs.
          const expected =
            path === "/"
              ? SHELL_HASH
              : new URL(path, self.location.origin).searchParams.get("v");
          const digest = await crypto.subtle.digest(
            "SHA-256",
            await response.clone().arrayBuffer(),
          );
          const actual = Array.from(new Uint8Array(digest), (value) =>
            value.toString(16).padStart(2, "0"),
          )
            .join("")
            .slice(0, 16);
          if (actual !== expected)
            throw new Error(
              "Public asset changed during installation: " + path,
            );
          await cache.put(path, response);
        }),
      );
      // Intentionally no skipWaiting: existing sessions choose when to update.
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  // The UI sends this only after an explicit Refresh click outside a save.
  if (event.data?.type === "ACTIVATE_UPDATE") {
    const source = event.source;
    if (source?.url && new URL(source.url).origin === self.location.origin)
      self.skipWaiting();
  }
});

function offlineRecoveryResponse() {
  return new Response(
    '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fitness Tracker · Offline</title><body style="background:#111418;color:#f3f4f5;font-family:system-ui;padding:24px"><h1>You’re offline</h1><p>Reconnect to open this link. Password recovery requires an internet connection.</p><p><a href="/" style="color:#f4c542">Return to Fitness Tracker</a></p></body></html>',
    {
      status: 503,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    },
  );
}

self.addEventListener("fetch", (event) => {
  const request = event.request,
    url = new URL(request.url);
  // Leave all other origins/methods/paths alone, including every Supabase request.
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    request.headers.has("authorization")
  )
    return;
  if (
    request.mode === "navigate" &&
    (url.pathname === "/" || url.pathname === "/index.html")
  ) {
    event.respondWith(
      (async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        try {
          const response = await fetch(request, {
            cache: "no-store",
            signal: controller.signal,
          });
          if (response.ok) return response;
          if (response.status < 500) return response;
        } catch (_) {
          /* Fall back only to the install-time public shell. */
        } finally {
          clearTimeout(timeout);
        }
        // Never store runtime navigation responses or their URLs, including tokens.
        // Fragments can be absent from Fetch URLs, so even canonical documents are
        // only cached via the credential-free install request above.
        if (url.search || url.hash) return offlineRecoveryResponse();
        return (
          (await caches.match("/", { cacheName: CACHE_NAME })) ||
          offlineRecoveryResponse()
        );
      })(),
    );
    return;
  }
  if (!ASSET_URLS.has(url.href) || url.pathname === "/") return;
  event.respondWith(
    (async () => {
      const cached = await caches.match(request, { cacheName: CACHE_NAME });
      // Cache-first for this release's exact, content-versioned public URLs.
      // No runtime cache writes: unknown URLs can never enter the cache.
      return cached || fetch(request);
    })(),
  );
});
