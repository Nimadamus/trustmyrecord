// Single source of truth for the platform-currency display name. Update here,
// not in individual page templates -- wording drift happens when the label
// is hardcoded independently in many places over time.
window.TMR_TERMINOLOGY = {
  full: 'TMR Coin',
  short: 'coins',
  disclaimer: 'Your TrustMyRecord balance is TMR credits: site credits you earn, receive at sign up or buy by card, and spend on the site. Credits are not the TMR token on Base, cannot be sent to a wallet, sold or exchanged for tokens.',
};

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-tmr-term]').forEach((el) => {
    const key = el.getAttribute('data-tmr-term');
    if (window.TMR_TERMINOLOGY[key]) el.textContent = window.TMR_TERMINOLOGY[key];
  });
});
