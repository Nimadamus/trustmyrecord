// Single source of truth for the platform-currency display name. Update here,
// not in individual page templates -- the "TMR Coin" vs "Competition Credits"
// wording drift this file fixes happened because the label was hardcoded
// independently in ~10 places over time.
window.TMR_TERMINOLOGY = {
  full: 'TMR Competition Credits',
  short: 'Credits',
  disclaimer: 'TMR Competition Credits are internal promotional rewards with no cash value. They cannot be purchased, transferred, redeemed, withdrawn, or cashed out.',
};

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-tmr-term]').forEach((el) => {
    const key = el.getAttribute('data-tmr-term');
    if (window.TMR_TERMINOLOGY[key]) el.textContent = window.TMR_TERMINOLOGY[key];
  });
});
