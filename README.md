# Fitness Tracker

Workout accountability for Cactus Biceps, Inc. — Stay Sharp. Stay Consistent.

## Development

This remains a static GitHub Pages application; no application build is required.
Run `python3 -m http.server 8000` from this directory. The production Supabase
project and publishable key are unchanged. Do not use production records for
write tests.

- `index.html`: existing markup/styles and pinned Supabase SDK (2.118.0, with SRI).
- `app.js`: authentication, rendering, refresh coordination, and mutations.
- `scoring.js`: pure scoring, calendar-date, and color-validation helpers.
- `sync.js`: paginated reads and session/request/mutation coordination.

No PWA, service worker, schema migration, or permission change is included.

## Automated checks

Use Node.js 22 or newer:

```sh
npm ci
npm run check
npm test
npx playwright-core install --with-deps chromium
npm run test:browser
```

To use an existing Chromium installation, set `CHROMIUM_PATH` to its executable
path (for example `/usr/bin/chromium`) instead of installing another browser.
Browser tests require `curl` and HTTPS access to cdn.jsdelivr.net to obtain the
exact pinned SDK. The SDK is executed with its integrity attribute intact; all
Supabase endpoints are intercepted with fixtures. No production authentication,
password-reset email, or database request is performed. Unit tests need no network.
CI runs syntax, unit, and browser checks on pull requests.

## Reliability behavior and limits

Workout reads use deterministic date/user ordering, exact counts on every page,
and actual returned page lengths, including when a server cap is below 500 rows.
Missing counts, missing rows, duplicate keys, changing counts, and page errors
reject the entire refresh. Previous data remains visible with an explicit stale
warning; editing stays disabled until a complete refresh succeeds.

Session epochs and request sequences reject stale completions. Workout, color,
and challenge-setting writes share a lock held through a fresh post-save read.
Writes are not automatically replayed after an ambiguous network outcome.
These guards protect this client; they cannot serialize writes from other devices.

Independent paginated REST requests are not a transactional database snapshot.
Concurrent edits that preserve row count may still be observed at different
instants. The next successful poll reconciles them; exact snapshot isolation would
require backend support and is outside this change. Existing database RLS,
constraints, private-plan visibility, and write permissions still require a
separate authenticated review. Client-side tests do not verify those policies.

The current day follows the device's local calendar, as before. It is recomputed
on visible polling (every 15 seconds), focus, pageshow, visibility resume, and
before workout actions. Grace windows compare calendar dates, not elapsed hours.
The scoring constants and chronological cap/streak behavior are unchanged.

## Before merging

Review the diff and passing CI. Using an authorized isolated test environment,
verify existing participant sessions, password recovery, RLS for private plans,
owner-only workout/preferences writes, administrator settings, and multi-device
behavior. Confirm a non-main branch push cannot trigger a custom production
publishing integration; no deployment workflow is added here. GitHub Pages hosting
settings and production Supabase behavior were not verified by these tests.
