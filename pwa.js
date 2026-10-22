/* Installation, connectivity notices, and user-controlled updates. No user data. */
(function () {
  "use strict";
  let busy = false,
    registration = null,
    activatedUpdate = false,
    requestedUpdate = false;
  let lastCheck = 0;
  let controlled = !!navigator.serviceWorker?.controller;
  const offline = document.getElementById("offlineNotice");
  const update = document.getElementById("updateNotice");
  const refreshButton = document.getElementById("refreshApp");
  const waiting = () =>
    (controlled && !!registration?.waiting) || activatedUpdate;
  function render() {
    offline.classList.toggle("hidden", navigator.onLine !== false);
    update.classList.toggle("hidden", !waiting());
    refreshButton.disabled =
      busy || navigator.onLine === false || requestedUpdate;
    document.getElementById("updateDetail").textContent = busy
      ? "Finish the current save before refreshing."
      : "Refresh when you’re ready. Your account and workouts stay in Supabase.";
  }
  window.FitnessPWA = {
    setBusy(value) {
      busy = value;
      render();
    },
  };
  function connectivity() {
    render();
    window.dispatchEvent(
      new CustomEvent("fitness:connectivity", {
        detail: { online: navigator.onLine !== false },
      }),
    );
    if (navigator.onLine !== false) checkForUpdate();
  }
  window.addEventListener("online", connectivity);
  window.addEventListener("offline", connectivity);
  render();

  // A worker activated by another tab never reloads this tab automatically.
  // If a save starts after the click, require another explicit Refresh afterward.
  navigator.serviceWorker?.addEventListener("controllerchange", () => {
    if (!controlled) {
      controlled = true;
      render();
      return;
    }
    if (requestedUpdate && !busy && navigator.onLine !== false) {
      window.location.reload();
      return;
    }
    if (requestedUpdate || registration?.active) activatedUpdate = true;
    requestedUpdate = false;
    render();
  });
  refreshButton.addEventListener("click", () => {
    if (busy || navigator.onLine === false || !waiting()) return;
    if (activatedUpdate) {
      window.location.reload();
      return;
    }
    requestedUpdate = true;
    render();
    registration.waiting.postMessage({ type: "ACTIVATE_UPDATE" });
  });
  async function checkForUpdate() {
    if (
      !registration ||
      navigator.onLine === false ||
      Date.now() - lastCheck < 60000
    )
      return;
    lastCheck = Date.now();
    try {
      await registration.update();
    } catch (error) {
      console.warn("Update check unavailable:", error.message);
    }
    render();
  }
  function watch(worker) {
    if (!worker) return;
    worker.addEventListener("statechange", () => {
      if (worker.state === "installed") setTimeout(render, 0);
    });
  }
  async function register() {
    if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
    try {
      const hadController = !!navigator.serviceWorker.controller;
      registration = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      });
      watch(registration.installing);
      registration.addEventListener("updatefound", () =>
        watch(registration.installing),
      );
      // The first claim is initial installation, not an available update.
      if (!hadController && !registration.waiting) activatedUpdate = false;
      render();
    } catch (error) {
      console.warn("Offline support unavailable:", error.message);
    }
  }
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
  window.addEventListener("focus", checkForUpdate);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") checkForUpdate();
  });
})();
