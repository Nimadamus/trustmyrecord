/* CONTEST_LAUNCH_HOMEPAGE_BANNER_20260916 (Nima: put it flashing on the homepage so people can't miss it).
   A floating overlay injected at runtime, so the locked homepage hero and stripe geometry are untouched.
   Copy switches itself at 12:00 AM PT Sep 17, 2026 (contest start). */
(function () {
  if (document.getElementById('tmr-contest-launch')) return;
  var st = document.createElement('style');
  st.id = 'tmr-contest-launch-banner-css';
  st.textContent = "#tmr-contest-launch{position:fixed;left:50%;bottom:118px;transform:translateX(-50%);z-index:9000;display:flex;align-items:center;gap:12px;\n  width:min(760px,calc(100vw - 32px));box-sizing:border-box;padding:12px 14px 12px 16px;border-radius:14px;\n  background:linear-gradient(90deg,#3a2a06,#1c1606);border:2px solid #f0c449;color:#ffe9b0;font-family:Inter,system-ui,sans-serif;\n  box-shadow:0 10px 30px rgba(0,0,0,.45);animation:tmrClPulse 1.4s ease-in-out infinite}\n#tmr-contest-launch .cl-ic{flex-shrink:0;width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;\n  background:linear-gradient(180deg,#f0c449,#d4a72c);color:#1a1206;font-size:1.2rem}\n#tmr-contest-launch .cl-tx{flex:1;min-width:0;line-height:1.3}\n#tmr-contest-launch .cl-t{font-family:Barlow,Inter,sans-serif;font-weight:900;text-transform:uppercase;letter-spacing:.04em;font-size:1rem;color:#fff}\n#tmr-contest-launch .cl-s{font-size:.86rem;color:#f5e8c9}\n#tmr-contest-launch .cl-go{flex-shrink:0;padding:10px 14px;border-radius:10px;background:linear-gradient(180deg,#f0c449,#d4a72c);color:#1a1206;\n  font-weight:900;font-size:.86rem;text-decoration:none;white-space:nowrap}\n#tmr-contest-launch .cl-x{flex-shrink:0;background:none;border:0;color:#ffe9b0;font-size:1.3rem;line-height:1;cursor:pointer;padding:4px 6px}\n@keyframes tmrClPulse{0%,100%{box-shadow:0 10px 30px rgba(0,0,0,.45),0 0 0 0 rgba(240,196,73,.85);border-color:#f0c449}\n  50%{box-shadow:0 10px 30px rgba(0,0,0,.45),0 0 0 10px rgba(240,196,73,0);border-color:#fff3c4}}\n@media (prefers-reduced-motion: reduce){#tmr-contest-launch{animation:none}}\n@media (max-width:560px){#tmr-contest-launch{bottom:84px;gap:9px;padding:10px}#tmr-contest-launch .cl-ic{display:none}\n  #tmr-contest-launch .cl-t{font-size:.9rem}#tmr-contest-launch .cl-s{font-size:.78rem}#tmr-contest-launch .cl-go{padding:9px 10px;font-size:.8rem}}\n";
  document.head.appendChild(st);
  var wrap = document.createElement('div');
  wrap.innerHTML = "<aside id=\"tmr-contest-launch\" role=\"status\" aria-live=\"polite\" hidden>\n  <div class=\"cl-ic\"><i class=\"fa-solid fa-trophy\" aria-hidden=\"true\"></i></div>\n  <div class=\"cl-tx\"><div class=\"cl-t\"></div><div class=\"cl-s\"></div></div>\n  <a class=\"cl-go\" href=\"#\"></a>\n  <button class=\"cl-x\" type=\"button\" aria-label=\"Dismiss\">&times;</button>\n</aside>";
  document.body.appendChild(wrap.firstElementChild);
  var START = Date.parse('2026-09-17T07:00:00Z');
  var el = document.getElementById('tmr-contest-launch');
  if (!el) return;
  try { if (sessionStorage.getItem('tmrContestLaunchDismissed') === '1') return; } catch (e) {}
  function paint() {
    var live = Date.now() >= START;
    el.querySelector('.cl-t').textContent = live ? 'The contest is LIVE: make your picks now' : 'JustBet MLB Contest starts tonight';
    el.querySelector('.cl-s').textContent = live
      ? '$2,500 cash. 50 MLB picks each, sealed until first pitch. Enter your contest picks now.'
      : 'Picks open 12:00 AM PT / 3:00 AM ET. $2,500 cash. Registration closes at midnight PT.';
    var go = el.querySelector('.cl-go');
    go.textContent = live ? 'ENTER HERE' : 'Register Now';
    go.href = live ? '/sportsbook/?contest=justbet-mlb' : '/contests/justbet-mlb/register/';
  }
  paint();
  el.hidden = false;
  setInterval(paint, 30000);
  el.querySelector('.cl-x').addEventListener('click', function () {
    el.hidden = true;
    try { sessionStorage.setItem('tmrContestLaunchDismissed', '1'); } catch (e) {}
  });
})();
