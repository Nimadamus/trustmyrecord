/* TMR Redesign Loader — injects the dark redesign CSS LAST in cascade,
   after all other inline + runtime-injected styles have been parsed.
   Runs on window.load so it wins source-order ties even against
   page-specific runtime style injection. No markup or JS changes elsewhere. */
(function () {
    'use strict';
    var STYLE_ID = 'tmr-redesign-runtime-css';
    var CSS = [
        /* ===== Shared dark tokens ===== */
        ':root{--rd-bg:#070b14;--rd-bg-2:#0a1322;--rd-surface:#101b30;--rd-surface-2:#16243f;--rd-surface-3:#1d2f4f;--rd-line:#1f2e48;--rd-line-2:#2c4066;--rd-ink:#f1f5fb;--rd-ink-2:#b9c4d6;--rd-muted:#7a8499;--rd-green:#53d337;--rd-green-2:#3eb423;--rd-red:#ef4444;--rd-gold:#f5b400;--rd-teal:#1fb8d9;}',

        /* ===== SPORTSBOOK runtime-class overrides ===== */
        'body[data-tmr-route="index"][data-tmr-route] .tmr-market-card,body.tmr-site-shell .tmr-market-card{background:linear-gradient(180deg,var(--rd-surface),var(--rd-bg-2))!important;border:1px solid var(--rd-line)!important;border-radius:14px!important;box-shadow:0 12px 40px rgba(0,0,0,.4)!important;}',
        'body.tmr-site-shell .tmr-market-card::before{height:3px!important;background:linear-gradient(90deg,var(--rd-green),var(--rd-gold))!important;}',
        'body.tmr-site-shell .tmr-market-head{background:linear-gradient(180deg,rgba(255,255,255,.02),transparent)!important;padding:16px 18px!important;}',
        'body.tmr-site-shell .tmr-market-league{color:var(--rd-gold)!important;letter-spacing:.14em!important;}',
        'body.tmr-site-shell .tmr-market-status{background:rgba(83,211,55,.16)!important;color:var(--rd-green)!important;border-color:rgba(83,211,55,.32)!important;}',
        'body.tmr-site-shell .tmr-team-name{color:var(--rd-ink)!important;letter-spacing:-.02em!important;}',
        'body.tmr-site-shell .tmr-team-side{background:var(--rd-surface-2)!important;border-color:var(--rd-line)!important;color:var(--rd-ink-2)!important;}',
        'body.tmr-site-shell .tmr-team-abbr{background:var(--rd-surface-3)!important;border-color:var(--rd-line-2)!important;color:var(--rd-ink)!important;}',
        'body.tmr-site-shell .tmr-market-chip{background:var(--rd-surface-2)!important;border-color:var(--rd-line)!important;color:var(--rd-ink-2)!important;}',
        'body.tmr-site-shell .tmr-market-chip.real{background:rgba(83,211,55,.16)!important;color:var(--rd-green)!important;border-color:rgba(83,211,55,.3)!important;}',
        'body.tmr-site-shell .tmr-market-count{background:var(--rd-surface-2)!important;border-color:var(--rd-line)!important;color:var(--rd-ink-2)!important;border-radius:10px!important;}',
        'body.tmr-site-shell .tmr-board-filter-bar{background:linear-gradient(180deg,var(--rd-surface),var(--rd-bg-2))!important;border:1px solid var(--rd-line)!important;border-radius:14px!important;}',
        'body.tmr-site-shell .tmr-board-filter-label{color:var(--rd-muted)!important;letter-spacing:.14em!important;}',
        'body.tmr-site-shell .tmr-board-filter-tab{background:var(--rd-surface-2)!important;border:1px solid var(--rd-line)!important;color:var(--rd-ink-2)!important;border-radius:10px!important;}',
        'body.tmr-site-shell .tmr-board-filter-tab.active{background:linear-gradient(135deg,var(--rd-green),var(--rd-green-2))!important;color:#0a1f02!important;border-color:transparent!important;box-shadow:0 8px 20px rgba(83,211,55,.25)!important;}',
        'body.tmr-site-shell .tmr-option-btn{background:var(--rd-bg-2)!important;border:1px solid var(--rd-line)!important;border-radius:12px!important;}',
        'body.tmr-site-shell .tmr-option-btn:hover{background:var(--rd-surface-2)!important;border-color:var(--rd-green)!important;}',
        'body.tmr-site-shell .tmr-option-btn.active{background:linear-gradient(135deg,rgba(83,211,55,.22),rgba(83,211,55,.08))!important;border-color:var(--rd-green)!important;}',
        'body.tmr-site-shell .tmr-option-tag{background:var(--rd-surface-2)!important;border-color:var(--rd-line)!important;color:var(--rd-ink-2)!important;}',
        'body.tmr-site-shell .tmr-option-line{color:var(--rd-gold)!important;}',
        'body.tmr-site-shell .tmr-option-market{color:var(--rd-ink)!important;}',
        'body.tmr-site-shell .tmr-option-detail{color:var(--rd-muted)!important;}',
        'body.tmr-site-shell .tmr-option-odds{background:var(--rd-surface-3)!important;border-color:var(--rd-line-2)!important;color:var(--rd-ink)!important;font-family:"JetBrains Mono","Inter",monospace!important;border-radius:10px!important;}',
        'body.tmr-site-shell .tmr-option-btn.active .tmr-option-odds{background:var(--rd-green)!important;color:#0a1f02!important;border-color:transparent!important;}',
        'body.tmr-site-shell .tmr-board-banner{background:linear-gradient(180deg,var(--rd-surface),var(--rd-bg-2))!important;border:1px solid var(--rd-line)!important;border-radius:14px!important;color:var(--rd-ink-2)!important;}',
        'body.tmr-site-shell .tmr-board-button{background:linear-gradient(135deg,var(--rd-green),var(--rd-green-2))!important;border:0!important;color:#0a1f02!important;font-weight:800!important;border-radius:10px!important;}',
        'body.tmr-site-shell .tmr-group{background:var(--rd-surface)!important;border:1px solid var(--rd-line)!important;border-radius:12px!important;}',
        'body.tmr-site-shell .tmr-group-header{background:var(--rd-surface-2)!important;border-color:var(--rd-line)!important;}',
        'body.tmr-site-shell .tmr-group-title{color:var(--rd-gold)!important;}',
        'body.tmr-site-shell .tmr-group-count{background:var(--rd-surface-3)!important;border-color:var(--rd-line-2)!important;color:var(--rd-ink-2)!important;}',

        /* Sport pill bar (existing class .sportsbook-sports-nav) */
        'body.tmr-site-shell .sportsbook-sports-nav{background:var(--rd-bg-2)!important;border-bottom:1px solid var(--rd-line)!important;}',
        'body.tmr-site-shell .sportsbook-sports-nav button{background:var(--rd-surface)!important;border:1px solid var(--rd-line)!important;color:var(--rd-ink-2)!important;border-radius:999px!important;padding:9px 16px!important;font-weight:700!important;}',
        'body.tmr-site-shell .sportsbook-sports-nav button:hover{background:var(--rd-surface-2)!important;color:var(--rd-ink)!important;}',
        'body.tmr-site-shell .sportsbook-sports-nav button.active{background:linear-gradient(135deg,var(--rd-green),var(--rd-green-2))!important;color:#0a1f02!important;border-color:transparent!important;font-weight:800!important;}',

        /* Picks board sport cards (used by #picks .sport-card) */
        'body.tmr-site-shell #picks .sport-card{background:var(--rd-surface)!important;border:1px solid var(--rd-line)!important;}',
        'body.tmr-site-shell #picks .sport-card.selected{background:linear-gradient(135deg,rgba(83,211,55,.18),var(--rd-bg-2))!important;border-color:var(--rd-green)!important;}',
        'body.tmr-site-shell #picks .sport-name{color:var(--rd-ink)!important;}',
        'body.tmr-site-shell #picks .sport-games{color:var(--rd-gold)!important;}',
        'body.tmr-site-shell #picks .sport-card::before{background:linear-gradient(90deg,var(--rd-green),var(--rd-gold))!important;}',

        /* Bet form inputs */
        'body.tmr-site-shell #picks #pickLineInput,body.tmr-site-shell #picks #pickOddsInput,body.tmr-site-shell #picks #unitsInput,body.tmr-site-shell #picks #pickReasoning{background:var(--rd-bg-2)!important;border:1px solid var(--rd-line-2)!important;color:var(--rd-ink)!important;border-radius:10px!important;}',
        'body.tmr-site-shell #picks #pickLineInput:focus,body.tmr-site-shell #picks #pickOddsInput:focus,body.tmr-site-shell #picks #unitsInput:focus,body.tmr-site-shell #picks #pickReasoning:focus{border-color:var(--rd-green)!important;box-shadow:0 0 0 3px rgba(83,211,55,.15)!important;}',
        'body.tmr-site-shell #picks .submit-pick-btn{background:linear-gradient(135deg,var(--rd-green),var(--rd-green-2))!important;border:0!important;color:#0a1f02!important;border-radius:12px!important;}',
        'body.tmr-site-shell #picks .pick-summary-card{background:var(--rd-surface)!important;border:1px solid var(--rd-line)!important;}',
        'body.tmr-site-shell #picks .summary-label{color:var(--rd-muted)!important;}',
        'body.tmr-site-shell #picks .summary-value{color:var(--rd-ink)!important;}',
        'body.tmr-site-shell #picks .option-group{background:var(--rd-surface)!important;border-color:var(--rd-line)!important;}',
        'body.tmr-site-shell #picks .option-group label{color:var(--rd-gold)!important;}',

        /* Loading skeleton — keep but recolor */
        'body.tmr-site-shell .tmr-loading-card,body.tmr-site-shell .tmr-loading-topline{background:var(--rd-surface)!important;border-color:var(--rd-line)!important;}',
        'body.tmr-site-shell .tmr-empty-state{background:var(--rd-surface)!important;border-color:var(--rd-line)!important;color:var(--rd-ink-2)!important;}',

        /* ===== PROFILE page surfaces (real classes used in /profile/) ===== */
        'body.tmr-social-profile{background:var(--rd-bg)!important;color:var(--rd-ink)!important;}',
        'body.tmr-social-profile .profile-cover{background:radial-gradient(circle at 20% 30%,rgba(31,184,217,.4),transparent 50%),radial-gradient(circle at 80% 60%,rgba(245,180,0,.35),transparent 50%),linear-gradient(135deg,#0c1a3a,#1a0c3a)!important;}',
        'body.tmr-social-profile .stat-card,body.tmr-social-profile .big-stat-card,body.tmr-social-profile .achievement-card,body.tmr-social-profile .marketplace-card,body.tmr-social-profile .recent-pick,body.tmr-social-profile .splits-card,body.tmr-social-profile .roi-card,body.tmr-social-profile .activity-card,body.tmr-social-profile .pick-card{background:var(--rd-surface)!important;border:1px solid var(--rd-line)!important;border-radius:14px!important;color:var(--rd-ink)!important;}',
        'body.tmr-social-profile .stat-value,body.tmr-social-profile .big-stat-value,body.tmr-social-profile .kpi-value,body.tmr-social-profile .kpi__value{font-family:"JetBrains Mono","Inter",monospace!important;color:var(--rd-ink)!important;letter-spacing:-.02em!important;}',
        'body.tmr-social-profile .stat-label,body.tmr-social-profile .big-stat-label,body.tmr-social-profile .kpi-label,body.tmr-social-profile .kpi__label{color:var(--rd-muted)!important;letter-spacing:.14em!important;text-transform:uppercase!important;font-weight:700!important;font-size:10.5px!important;}',
        'body.tmr-social-profile .pick-result.win,body.tmr-social-profile .result-win{background:rgba(34,197,94,.16)!important;color:#4ade80!important;border:1px solid rgba(34,197,94,.3)!important;}',
        'body.tmr-social-profile .pick-result.loss,body.tmr-social-profile .result-loss{background:rgba(239,68,68,.16)!important;color:#f87171!important;border:1px solid rgba(239,68,68,.3)!important;}',
        'body.tmr-social-profile .pick-result.pending,body.tmr-social-profile .result-pending{background:rgba(245,180,0,.16)!important;color:var(--rd-gold)!important;border:1px solid rgba(245,180,0,.3)!important;}',

        /* ===== FORUM (forum body has no special class; use route attr) ===== */
        'body[data-tmr-route="forum"],body[data-tmr-route="index"][data-tmr-route]{background:var(--rd-bg)!important;}',

        /* ===== Generic global surface upgrades on any page in tmr-site-shell ===== */
        'body.tmr-site-shell .modal,body.tmr-site-shell .modal-overlay{background:rgba(5,10,20,.78)!important;backdrop-filter:blur(4px);}',
        'body.tmr-site-shell .modal-content,body.tmr-site-shell .modal-box{background:var(--rd-surface)!important;border:1px solid var(--rd-line-2)!important;border-radius:14px!important;color:var(--rd-ink)!important;box-shadow:0 30px 80px rgba(0,0,0,.6)!important;}'
    ].join('');

    function inject() {
        if (document.getElementById(STYLE_ID)) return;
        var s = document.createElement('style');
        s.id = STYLE_ID;
        s.textContent = CSS;
        document.head.appendChild(s);
    }

    if (document.readyState === 'complete') {
        inject();
    } else {
        window.addEventListener('load', inject);
    }
    /* Re-assert after a short delay in case any later script overwrites,
       and once more after 2s for very late hydration. */
    setTimeout(inject, 400);
    setTimeout(function () {
        var s = document.getElementById(STYLE_ID);
        if (s && s.parentNode !== document.head) document.head.appendChild(s);
        else if (!s) inject();
        /* Move to end of head to win source order against any later runtime injection */
        if (s) document.head.appendChild(s);
    }, 2000);
})();
