// Single source of truth for the platform-currency display name. Update here,
// not in individual page templates -- wording drift happens when the label
// is hardcoded independently in many places over time.
window.TMR_TERMINOLOGY = {
  full: 'TMR Coin',
  short: 'coins',
  disclaimer: 'TMR Coin is the platform currency of TrustMyRecord. Every new member receives TMR Coin when they sign up. Members can earn additional coins through platform participation, achievements, referrals, contests, and competitions. Additional purchase and redemption options may be introduced as the platform develops.',
};

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-tmr-term]').forEach((el) => {
    const key = el.getAttribute('data-tmr-term');
    if (window.TMR_TERMINOLOGY[key]) el.textContent = window.TMR_TERMINOLOGY[key];
  });
});
