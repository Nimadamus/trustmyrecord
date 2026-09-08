/* TMR install CTA — a visible "Install app" button that drives PWA install.
 * Self-contained, additive, fail-safe. Shows only when the app is genuinely
 * installable (or on iOS Safari, where install is manual). Hides when already
 * installed, and stays dismissed for 14 days so it never nags. Added 20260908. */
(function () {
  "use strict";
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (window.__tmrInstallCta) return; window.__tmrInstallCta = true;

  try {
    var DISMISS_KEY = "tmr_install_dismissed_until";
    var standalone =
      window.matchMedia && window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true;
    if (standalone) return; // already installed

    var now = Date.now();
    try {
      var until = parseInt(localStorage.getItem(DISMISS_KEY) || "0", 10);
      if (until && now < until) return; // dismissed recently
    } catch (e) {}

    var ua = navigator.userAgent || "";
    var isIOS = /iphone|ipad|ipod/i.test(ua) && !window.MSStream;
    var deferred = null;

    function css() {
      if (document.getElementById("tmr-install-css")) return;
      var s = document.createElement("style");
      s.id = "tmr-install-css";
      s.textContent =
        ".tmr-install{position:fixed;left:50%;transform:translateX(-50%) translateY(120%);" +
        "bottom:max(16px,env(safe-area-inset-bottom));z-index:2147483000;display:flex;align-items:center;" +
        "gap:10px;padding:10px 12px 10px 14px;border-radius:999px;background:#111820;color:#eef4f8;" +
        "box-shadow:0 8px 30px rgba(0,0,0,.45);border:1px solid rgba(255,255,255,.10);" +
        "font:600 14px/1.2 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;" +
        "transition:transform .28s cubic-bezier(.2,.8,.2,1);max-width:calc(100vw - 24px)}" +
        ".tmr-install.show{transform:translateX(-50%) translateY(0)}" +
        ".tmr-install img{width:26px;height:26px;border-radius:7px;flex:0 0 auto}" +
        ".tmr-install .tmr-install-txt{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
        ".tmr-install button{cursor:pointer;font:inherit;border:0;border-radius:999px}" +
        ".tmr-install .tmr-install-go{background:#19c37d;color:#04140c;padding:8px 14px}" +
        ".tmr-install .tmr-install-go:hover{filter:brightness(1.06)}" +
        ".tmr-install .tmr-install-x{background:transparent;color:#9fb0bd;padding:4px 6px;font-size:18px;line-height:1}" +
        ".tmr-install .tmr-install-x:hover{color:#eef4f8}" +
        ".tmr-install-hint{position:fixed;left:50%;transform:translateX(-50%);bottom:76px;z-index:2147483000;" +
        "max-width:min(320px,calc(100vw - 24px));background:#111820;color:#eef4f8;border:1px solid rgba(255,255,255,.10);" +
        "border-radius:12px;padding:12px 14px;box-shadow:0 8px 30px rgba(0,0,0,.45);" +
        "font:500 13px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}";
      (document.head || document.documentElement).appendChild(s);
    }

    function dismiss(days) {
      try { localStorage.setItem(DISMISS_KEY, String(Date.now() + (days || 14) * 864e5)); } catch (e) {}
      remove();
    }
    function remove() {
      var el = document.getElementById("tmr-install");
      if (el) el.parentNode.removeChild(el);
      var h = document.getElementById("tmr-install-hint");
      if (h) h.parentNode.removeChild(h);
    }

    function build(label) {
      css();
      remove();
      var bar = document.createElement("div");
      bar.className = "tmr-install"; bar.id = "tmr-install";
      bar.setAttribute("role", "dialog"); bar.setAttribute("aria-label", "Install the Trust My Record app");
      var icon = document.createElement("img");
      icon.src = "/static/media/pwa-icon-192.png"; icon.alt = "";
      var txt = document.createElement("span");
      txt.className = "tmr-install-txt"; txt.textContent = "Install the TMR app";
      var go = document.createElement("button");
      go.className = "tmr-install-go"; go.type = "button"; go.textContent = label;
      var x = document.createElement("button");
      x.className = "tmr-install-x"; x.type = "button"; x.setAttribute("aria-label", "Dismiss"); x.textContent = "×";
      bar.appendChild(icon); bar.appendChild(txt); bar.appendChild(go); bar.appendChild(x);
      document.body.appendChild(bar);
      requestAnimationFrame(function () { bar.classList.add("show"); });
      x.addEventListener("click", function () { dismiss(14); });
      return go;
    }

    function showInstall() {
      var go = build("Install");
      go.addEventListener("click", function () {
        if (!deferred) return;
        deferred.prompt();
        deferred.userChoice.then(function (c) {
          deferred = null;
          if (c && c.outcome === "accepted") remove(); else dismiss(7);
        }).catch(function () {});
      });
    }

    function showIOS() {
      var go = build("How");
      go.addEventListener("click", function () {
        if (document.getElementById("tmr-install-hint")) return;
        var h = document.createElement("div");
        h.className = "tmr-install-hint"; h.id = "tmr-install-hint";
        h.textContent = "To install: tap the Share button, then “Add to Home Screen”.";
        document.body.appendChild(h);
        setTimeout(function () { if (h.parentNode) h.parentNode.removeChild(h); }, 6000);
      });
    }

    window.addEventListener("beforeinstallprompt", function (e) {
      e.preventDefault();
      deferred = e;
      showInstall();
    });
    window.addEventListener("appinstalled", function () { dismiss(3650); });

    if (isIOS) {
      // iOS gives no beforeinstallprompt; offer the manual path once DOM is ready.
      if (document.body) showIOS();
      else document.addEventListener("DOMContentLoaded", showIOS);
    }
  } catch (e) { /* never break the page */ }
})();
