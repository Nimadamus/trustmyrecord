// Single source of truth for the platform-currency display name. Update here,
// not in individual page templates -- wording drift happens when the label
// is hardcoded independently in many places over time.
window.TMR_TERMINOLOGY = {
  full: 'TMR Coin',
  short: 'coins',
  disclaimer: 'TMR Coin is the platform currency of TrustMyRecord. Every new member receives TMR Coin when they sign up, and members can earn more through verified platform participation such as posting picks and forum threads. TMR Coin can currently be spent on BetLegend Pro reports. Additional ways to earn, and any tipping, marketplace, or contest-reward features, are planned but not live today.',
};

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-tmr-term]').forEach((el) => {
    const key = el.getAttribute('data-tmr-term');
    if (window.TMR_TERMINOLOGY[key]) el.textContent = window.TMR_TERMINOLOGY[key];
  });
});
