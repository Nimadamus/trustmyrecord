/* CONTEST_ENTER_HERE_20260916 (Nima: "add ENTER HERE and make it a link ... get people's attention so they
   know where to go to enter their picks"). A big flashing link to Contest Mode on the sportsbook, placed at the
   top of the contest pages. It appears by itself at 12:00 AM PT Sep 17, 2026 (contest start) and checks every
   30 seconds, so nobody has to redeploy at midnight. */
(function () {
  var START = Date.parse('2026-09-17T07:00:00Z');
  var HREF = '/sportsbook/?contest=justbet-mlb';
  function mount() {
    if (document.getElementById('tmr-enter-here')) return true;
    if (Date.now() < START) return false;
    var host = document.querySelector('main.page') || document.querySelector('main') || document.body;
    var st = document.createElement('style');
    st.textContent =
      '#tmr-enter-here{display:flex;align-items:center;justify-content:center;gap:14px;flex-wrap:wrap;margin:16px 0 18px;padding:18px 20px;' +
      'border-radius:16px;border:3px solid #f0c449;background:linear-gradient(90deg,#3a2a06,#1c1606);text-decoration:none;color:#fff;' +
      'font-family:Barlow,Inter,sans-serif;text-align:center;animation:tmrEnterPulse 1.2s ease-in-out infinite}' +
      '#tmr-enter-here .eh-big{font-weight:900;font-size:clamp(1.5rem,4.5vw,2.4rem);letter-spacing:.04em;text-transform:uppercase;color:#fff}' +
      '#tmr-enter-here .eh-btn{display:inline-flex;align-items:center;gap:10px;padding:12px 22px;border-radius:12px;' +
      'background:linear-gradient(180deg,#f0c449,#d4a72c);color:#1a1206;font-weight:900;font-size:clamp(1.05rem,3.4vw,1.35rem);text-transform:uppercase;letter-spacing:.05em}' +
      '#tmr-enter-here .eh-sub{flex-basis:100%;font-family:Inter,sans-serif;font-size:.92rem;color:#f5e8c9}' +
      '@keyframes tmrEnterPulse{0%,100%{box-shadow:0 0 0 0 rgba(240,196,73,.9);border-color:#f0c449}50%{box-shadow:0 0 0 14px rgba(240,196,73,0);border-color:#fff3c4}}' +
      '@media (prefers-reduced-motion: reduce){#tmr-enter-here{animation:none}}';
    document.head.appendChild(st);
    var a = document.createElement('a');
    a.id = 'tmr-enter-here';
    a.href = HREF;
    a.innerHTML = '<span class="eh-big">Make your contest picks now</span>' +
      '<span class="eh-btn"><i class="fa-solid fa-trophy" aria-hidden="true"></i> Enter here</span>' +
      '<span class="eh-sub">The JustBet MLB Contest is live. Your picks go in on the sportsbook in Contest Mode and stay sealed until first pitch.</span>';
    host.insertBefore(a, host.firstElementChild);
    return true;
  }
  function run() {
    if (mount()) return;
    var t = setInterval(function () { if (mount()) clearInterval(t); }, 30000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
})();
