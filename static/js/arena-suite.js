/* TrustMyRecord Arena suite - shared helpers (ARENA_PHASE1_20260605)
 * Free predictions only: Arena Points have no cash value and cannot be
 * purchased or withdrawn. UI language: Free Predictions / Arena Picks /
 * Arena Points. Never "bets", "wagers", "deposit", "withdrawal", "cashout".
 */
(function () {
  const PREDICT_DISCLAIMER = 'Free predictions are for entertainment only. Arena Points have no cash value and cannot be purchased or withdrawn.';
  const ARENA_DISCLAIMER = 'TrustMyRecord Arena is an unofficial sports-gaming community. It is not affiliated with, endorsed by, or sponsored by MLB, MLBPA, Sony Interactive Entertainment, PlayStation, San Diego Studio, EA Sports, Microsoft, Xbox, or any game publisher. ' + PREDICT_DISCLAIMER;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function ready(fn) {
    let tries = 0;
    (function poll() {
      if (window.api && typeof window.api.request === 'function') return fn(window.api);
      if (++tries > 100) { console.error('Arena: API client unavailable'); return fn(null); }
      setTimeout(poll, 60);
    })();
  }

  async function currentUser(api) {
    try {
      if (api && api.isLoggedIn && api.isLoggedIn()) {
        const me = await api.getCurrentUser();
        return (me && (me.user || me)) || null;
      }
    } catch (_) { /* not logged in */ }
    return null;
  }

  function fmtDate(v) {
    if (!v) return 'TBD';
    const d = new Date(v);
    if (isNaN(d.getTime())) return 'TBD';
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  // Map backend challenge state -> Arena UI status
  function statusInfo(ch) {
    const verified = !!ch.admin_verified;
    switch (ch.status) {
      case 'pending': return { key: 'open', label: 'Open' };
      case 'accepted':
        if (ch.scheduled_at) return { key: 'scheduled', label: 'Scheduled' };
        return { key: 'accepted', label: 'Accepted' };
      case 'in_progress': return { key: 'live', label: ch.result_reported_at ? 'Awaiting Confirmation' : 'Live' };
      case 'completed': return verified ? { key: 'verified', label: 'Admin Verified' } : { key: 'completed', label: 'Completed' };
      case 'disputed': return { key: 'disputed', label: 'Disputed' };
      case 'cancelled': return { key: 'canceled', label: 'Canceled' };
      case 'declined': return { key: 'declined', label: 'Declined' };
      case 'expired': return { key: 'expired', label: 'Expired' };
      case 'voided': return { key: 'voided', label: 'Voided' };
      default: return { key: 'completed', label: ch.status || 'Unknown' };
    }
  }

  function pill(ch) {
    const s = statusInfo(ch);
    let html = '<span class="as-pill ' + s.key + '">' + esc(s.label) + '</span>';
    if (ch.admin_verified && ch.status === 'completed') {
      html = '<span class="as-pill verified">Admin Verified</span>';
    }
    return html;
  }

  function msg(el, kind, text) {
    if (!el) return;
    el.className = 'as-msg ' + kind;
    el.textContent = text;
  }

  async function loadPointsChip(api, el) {
    if (!el || !api) return;
    try {
      if (!api.isLoggedIn || !api.isLoggedIn()) { el.style.display = 'none'; return; }
      const data = await api.request('/arena/points/me');
      el.innerHTML = '<i class="fas fa-coins"></i> ' + Number(data.balance).toLocaleString() + ' Arena Points';
      el.title = PREDICT_DISCLAIMER;
      el.style.display = 'inline-flex';
    } catch (_) { el.style.display = 'none'; }
  }

  function qs(name) {
    return new URLSearchParams(location.search).get(name);
  }

  window.TMRArena = { esc, ready, currentUser, fmtDate, statusInfo, pill, msg, loadPointsChip, qs, PREDICT_DISCLAIMER, ARENA_DISCLAIMER };
})();
