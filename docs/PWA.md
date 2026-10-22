# Fitness Tracker PWA

Fitness Tracker · Cactus Biceps, Inc. · Stay Sharp. Stay Consistent.

## Hosting and installation

The app remains a build-free GitHub Pages site at
https://lightweight.cactusbiceps.com/. Manifest ID, start URL, and scope are `/`.
All public resource URLs are absolute root paths; a project subdirectory is not
supported. `CNAME`, Supabase project, publishable key, tables, scoring, and RLS
configuration are unchanged.

On Android, open the HTTPS site in Chrome and choose Install app / Add to home
screen from the browser menu (wording depends on the browser). On iPhone, open
it in Safari, choose Share → Add to Home Screen, and enable Open as Web App if
shown. A custom installation prompt is intentionally not added. The manifest
and Apple metadata use Fitness Tracker; the theme/background remain #111418.

The four PNG icons were prepared from the user's original attached Cactus Biceps
mascot with an image-assisted charcoal-background edit, preserving its flexing
arms, sunglasses, and shirt. They are not a generic replacement cactus. The
maskable export has additional charcoal padding (360px master within 512px) to
keep the recognizable features inside typical circular masks. Final launcher
cropping/legibility should be reviewed on actual devices. Regular icons are
192px and 512px; the Apple touch icon is 180px.

## What is cached

`sw.js` precaches an explicit inventory of public files: the clean `/` HTML shell,
application scripts, manifest, icons, and the locally hosted, pinned Supabase SDK.
Install fetches omit credentials, reject redirects, and verify each response against its generated content hash to reject mixed-deployment files. All files must succeed
before the new worker can install. The bundled SDK is unchanged at 2.118.0 and
retains its Phase 1 SHA-384 integrity check; its MIT license is included in vendor/.

- Root/index navigation is network-first, with an 8-second network timeout and
  fallback to the install-time public shell on network failure or server errors.
- Runtime navigation responses are never stored. No recovery query, fragment,
  password, auth response, or participant response is a cache key or cache body.
- Query-bearing navigation stays network-only and receives uncached reconnect
  guidance if offline. Browsers may strip fragments from requests; even then no
  runtime navigation or fragment URL is written to Cache Storage.
- Static files are cache-first only for the inventory's exact content-versioned
  URLs. Unknown URLs, non-GET methods, authenticated requests, and all other
  origins (including Supabase) pass through with no service-worker caching.
- Only this application's old `fitness-tracker-public-*` caches are removed on
  activation. Supabase's existing session storage is neither cleared nor changed.

No workout/history snapshot, IndexedDB store, background-sync registration, or
offline mutation queue is introduced. An already displayed session may retain
its in-memory display while offline; a cold offline launch has only the public
shell and existing SDK session handling, not stored workout records.

The offline banner disables workout/settings/color writes. Reconnection requires
a successful complete refresh before editing resumes. A network error while the
browser still reports online uses Phase 1's sync-failure warning and save
reconciliation. Ambiguous writes are not replayed automatically.

## Updates

A new worker downloads its entire public inventory, then waits. The user sees
**Update available / Refresh**. Refresh is disabled while offline or while a
workout/settings/color save, post-save reconciliation, or account action is
pending. Clicking Refresh explicitly activates the waiting worker and reloads
that tab. If a save starts in the activation gap, another click is required after
it completes. Other tabs never reload automatically, even when one tab activates
an update. A first installation does not show an update prompt.

Existing installed apps obtain future releases from the same service-worker URL
and manifest ID; normal code updates do not require reinstallation. Checks occur
on registration and on focus/visibility/online events, throttled to once per
minute. Browsers can also check independently. Do not change the manifest ID or
production origin during ordinary updates.

After changing public code, artwork, metadata, or worker logic:

```sh
npm run prepare:pwa
npm run check
npm test
npm run test:browser
npm run test:pwa
```

`prepare:pwa` updates asset hashes, HTML/manifest references, and the worker's
release/cache inventory. Commit all its outputs together. When adding a new public asset, add its filename to the explicit inventory in scripts/prepare-pwa.cjs; never add user data or API routes. CI rejects stale
outputs; GitHub Pages serves the committed files directly without a build step.
SDK upgrades additionally require verifying/updating its integrity pin and
license. Keep superseded assets available if future work introduces dynamically
loaded modules; this release eagerly loads its scripts and has no lazy chunks.

A failed worker installation leaves the previous worker active. For a rollback,
revert the application changes, run prepare:pwa, test, and release that commit
through the normal review process. Treat the rollback as another app update.
Do not unregister workers or clear authentication storage as an update mechanism.

## Automated validation

Unit tests check the manifest/Apple metadata, all production-root resource paths,
PNG sizes, SDK integrity, public-only precaching, private/API bypass, and uncached
recovery fallback. The existing scoring and coordination tests remain unchanged.

Browser tests use real Chromium workers and temporary regular browser profiles.
They check Chromium installability diagnostics, offline navigation and script
startup, disabled offline writes, absence of sensitive cache keys, recovery
fallback, explicit updates, pending saves, multiple tabs, and old-cache cleanup.
The update test serves a changed worker release from an in-memory local test
server; it does not edit repository files or contact production Supabase.
Reliability browser tests additionally cover the dynamic Toggle Workout / Remove
Workout button and historical add/remove operations with mocked responses.

## Manual checks before production release

1. Verify GitHub Pages still serves the custom domain over HTTPS, `/sw.js` is
   JavaScript (not an HTML redirect), the manifest has the right MIME type, and
   every referenced asset resolves at the production root. Local automated tests
   cannot establish production DNS, headers, or deployment state.
2. Install from Android Chrome and iPhone Safari. Check mascot crops, name,
   charcoal launch screen, standalone presentation, portrait/landscape layouts,
   keyboard behavior, and normal browser use. Apple installation and lifecycle
   behavior require a physical iPhone; desktop Chromium is not a substitute.
3. With an authorized test account/environment, verify login, persistent session,
   token renewal, sign-out, private plans, and owner/admin permissions. Existing
   Safari and Home Screen contexts may not share login state. No database policy
   or live authentication behavior is verified by mocked tests.
4. Test email password recovery both with the app closed and open. Keep existing
   canonical Supabase recovery redirects; never cache or log recovery tokens.
5. Start online, then use airplane mode. Check the banner, disabled edits,
   offline launch after a prior visit, and required refresh after reconnection.
   A first-ever visit without internet cannot install/cache the shell.
6. Test a staged second release in both installed apps: wait for the update
   notice, save a workout, confirm Refresh remains disabled through reconciliation,
   then refresh explicitly. Repeat with two tabs/windows and a password change.
   Check a failed update download leaves the current version usable.
7. Verify historical workout add/remove labels and balances with approved test
   records. Do not use participant production records as test fixtures.

No automatic merge, publication, deployment workflow, production record update,
or Supabase schema/policy change is part of this PR.
