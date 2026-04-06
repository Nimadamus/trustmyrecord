/**
 * Trust My Record - Analytics Module
 * Google Analytics 4 + Google Tag Manager Integration
 *
 * SETUP:
 * 1. Create a GA4 property at https://analytics.google.com
 * 2. Get your Measurement ID (e.g. G-V5MCVXS2HE)
 * 3. Update CONFIG.analytics.measurementId in config.js
 * 4. (Optional) Create GTM container, update CONFIG.analytics.gtmId
 * 5. In GA4 Admin > Events, mark conversions (see ANALYTICS_EVENTS.md)
 * 6. Register custom dimensions in GA4 for parameters like sport, pick_type, etc.
 */

(function () {
    'use strict';

    // =========================================================================
    // CONFIGURATION
    // =========================================================================

    const ANALYTICS_CONFIG = {
        get measurementId() {
            return (typeof CONFIG !== 'undefined' && CONFIG.analytics?.measurementId) || '';
        },
        get gtmId() {
            return (typeof CONFIG !== 'undefined' && CONFIG.analytics?.gtmId) || '';
        },
        get debug() {
            return (typeof CONFIG !== 'undefined' && CONFIG.analytics?.debug) || false;
        },
        get enabled() {
            if (typeof CONFIG !== 'undefined' && CONFIG.analytics?.enabled === false) return false;
            return true;
        }
    };

    // =========================================================================
    // GA4 INITIALIZATION
    // The gtag.js script and config are loaded inline in <head> of every page.
    // This function just confirms gtag is available for custom event tracking.
    // =========================================================================

    function initGA4() {
        if (!ANALYTICS_CONFIG.enabled) return;

        // gtag should already be defined by the inline snippet in <head>
        if (typeof window.gtag !== 'function') {
            console.warn('[TMR Analytics] gtag not found. Make sure the GA4 snippet is in <head>.');
            return;
        }

        // Set debug mode if configured
        if (ANALYTICS_CONFIG.debug) {
            window.gtag('set', { debug_mode: true });
        }

        console.log('[TMR Analytics] GA4 connected:', ANALYTICS_CONFIG.measurementId);
    }

    // =========================================================================
    // GTM INITIALIZATION
    // =========================================================================

    function initGTM() {
        const gtmId = ANALYTICS_CONFIG.gtmId;
        if (!gtmId) return;

        // GTM head snippet
        (function (w, d, s, l, i) {
            w[l] = w[l] || [];
            w[l].push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
            var f = d.getElementsByTagName(s)[0],
                j = d.createElement(s), dl = l !== 'dataLayer' ? '&l=' + l : '';
            j.async = true;
            j.src = 'https://www.googletagmanager.com/gtm.js?id=' + i + dl;
            f.parentNode.insertBefore(j, f);
        })(window, document, 'script', 'dataLayer', gtmId);

        // GTM noscript iframe (append to body)
        document.addEventListener('DOMContentLoaded', function () {
            const noscript = document.createElement('noscript');
            const iframe = document.createElement('iframe');
            iframe.src = 'https://www.googletagmanager.com/ns.html?id=' + gtmId;
            iframe.height = '0';
            iframe.width = '0';
            iframe.style.display = 'none';
            iframe.style.visibility = 'hidden';
            noscript.appendChild(iframe);
            document.body.insertBefore(noscript, document.body.firstChild);
        });

        console.log('[TMR Analytics] GTM initialized:', gtmId);
    }

    // =========================================================================
    // CORE TRACKING FUNCTIONS
    // =========================================================================

    /**
     * Send a custom event to GA4
     * @param {string} eventName - GA4 event name (snake_case)
     * @param {Object} params - Event parameters
     */
    function trackEvent(eventName, params) {
        if (!ANALYTICS_CONFIG.enabled) return;

        const eventParams = {
            page_path: window.location.pathname + window.location.hash,
            page_title: document.title,
            timestamp: new Date().toISOString(),
            ...params
        };

        // Add user context if logged in
        const user = getCurrentUser();
        if (user) {
            eventParams.user_id = user.id || user.username;
            eventParams.username = user.username;
        }

        // Send to GA4
        if (typeof window.gtag === 'function') {
            window.gtag('event', eventName, eventParams);
        }

        // Also push to dataLayer for GTM
        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push({
            event: eventName,
            ...eventParams
        });

        if (ANALYTICS_CONFIG.debug) {
            console.log('[TMR Analytics] Event:', eventName, eventParams);
        }
    }

    /**
     * Track a pageview (for SPA navigation)
     * @param {string} pagePath - The page path
     * @param {string} pageTitle - The page title
     */
    function trackPageView(pagePath, pageTitle) {
        if (!ANALYTICS_CONFIG.enabled) return;

        const params = {
            page_path: pagePath || window.location.pathname + window.location.hash,
            page_title: pageTitle || document.title,
            page_location: window.location.href
        };

        if (typeof window.gtag === 'function') {
            window.gtag('event', 'page_view', params);
        }

        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push({
            event: 'page_view',
            ...params
        });

        if (ANALYTICS_CONFIG.debug) {
            console.log('[TMR Analytics] Page View:', params);
        }
    }

    /**
     * Set user properties in GA4
     * @param {Object} properties - User properties to set
     */
    function setUserProperties(properties) {
        if (typeof window.gtag === 'function') {
            window.gtag('set', 'user_properties', properties);
        }
    }

    // =========================================================================
    // HELPER: GET CURRENT USER
    // =========================================================================

    function getCurrentUser() {
        try {
            if (typeof auth !== 'undefined' && auth.currentUser) {
                return auth.currentUser;
            }
            const stored = localStorage.getItem('tmr_current_user');
            return stored ? JSON.parse(stored) : null;
        } catch (e) {
            return null;
        }
    }

    // =========================================================================
    // CUSTOM EVENT METHODS - AUTH FUNNEL
    // =========================================================================

    const TMRAnalytics = {
        // --- Initialization ---
        init: function () {
            initGA4();
            initGTM();
            // Initial page_view is sent automatically by the inline gtag config in <head>.
            // We only send manual page_views for SPA route changes (see bindSPANavigation).
            this.bindAutoTracking();
            this.setUserContext();
            console.log('[TMR Analytics] Module ready');
        },

        trackInitialPageView: function () {
            trackPageView();
        },

        setUserContext: function () {
            const user = getCurrentUser();
            if (user) {
                if (typeof window.gtag === 'function') {
                    window.gtag('set', { user_id: user.id || user.username });
                }
                setUserProperties({
                    account_type: user.isPremium ? 'premium' : 'free',
                    has_picks: (user.stats?.totalPicks || 0) > 0 ? 'yes' : 'no',
                    join_date: user.joinedDate || 'unknown'
                });
            }
        },

        // --- AUTH EVENTS ---

        signUpStarted: function (params) {
            trackEvent('sign_up_started', {
                button_location: params?.button_location || 'unknown',
                ...params
            });
        },

        signUpCompleted: function (params) {
            trackEvent('sign_up_completed', {
                method: 'email',
                ...params
            });
            // Also send GA4 recommended sign_up event
            trackEvent('sign_up', {
                method: 'email',
                ...params
            });
        },

        loginStarted: function (params) {
            trackEvent('login_started', {
                button_location: params?.button_location || 'unknown',
                ...params
            });
        },

        loginCompleted: function (params) {
            trackEvent('login_completed', {
                method: 'email',
                ...params
            });
            // Also send GA4 recommended login event
            trackEvent('login', {
                method: 'email',
                ...params
            });
            // Update user context after login
            this.setUserContext();
        },

        // --- PICK EVENTS ---

        makePickStarted: function (params) {
            trackEvent('make_pick_started', {
                button_location: params?.button_location || 'unknown',
                sport: params?.sport || 'unknown',
                ...params
            });
        },

        pickSubmitted: function (params) {
            trackEvent('pick_submitted', {
                sport: params?.sport || 'unknown',
                pick_type: params?.pick_type || params?.betType || 'unknown',
                odds: params?.odds,
                units: params?.units || params?.stake,
                league: params?.league,
                ...params
            });
        },

        pickEdited: function (params) {
            trackEvent('pick_edited', {
                sport: params?.sport || 'unknown',
                pick_id: params?.pick_id,
                ...params
            });
        },

        pickHistoryViewed: function (params) {
            trackEvent('pick_history_viewed', {
                view_type: params?.view_type || 'own',
                username: params?.username,
                ...params
            });
        },

        // --- FORUM EVENTS ---

        forumThreadStarted: function (params) {
            trackEvent('forum_thread_started', {
                button_location: params?.button_location || 'forum_page',
                ...params
            });
        },

        forumThreadCreated: function (params) {
            trackEvent('forum_thread_created', {
                sport: params?.sport,
                thread_id: params?.thread_id,
                thread_title: params?.thread_title,
                post_type: params?.post_type || 'post',
                ...params
            });
        },

        forumReplySubmitted: function (params) {
            trackEvent('forum_reply_submitted', {
                thread_id: params?.thread_id,
                ...params
            });
        },

        // --- PROFILE EVENTS ---

        profileEditOpened: function (params) {
            trackEvent('profile_edit_opened', {
                ...params
            });
        },

        profileUpdated: function (params) {
            trackEvent('profile_updated', {
                fields_updated: params?.fields_updated,
                ...params
            });
        },

        // --- POLL EVENTS ---

        pollVoted: function (params) {
            trackEvent('poll_voted', {
                poll_id: params?.poll_id,
                sport: params?.sport,
                ...params
            });
        },

        // --- CTA & NAVIGATION EVENTS ---

        ctaClicked: function (params) {
            trackEvent('cta_clicked', {
                cta_text: params?.cta_text,
                cta_location: params?.cta_location || params?.button_location,
                cta_destination: params?.cta_destination,
                ...params
            });
        },

        // --- SOCIAL EVENTS ---

        postCreated: function (params) {
            trackEvent('post_created', {
                post_type: params?.post_type || 'post',
                sport: params?.sport,
                has_tags: params?.has_tags || false,
                ...params
            });
        },

        postLiked: function (params) {
            trackEvent('post_liked', {
                post_id: params?.post_id,
                ...params
            });
        },

        commentAdded: function (params) {
            trackEvent('comment_added', {
                post_id: params?.post_id,
                ...params
            });
        },

        // --- PREMIUM / ECOMMERCE EVENTS ---

        premiumPageViewed: function (params) {
            trackEvent('view_item_list', {
                item_list_name: 'premium_plans',
                ...params
            });
        },

        premiumPlanSelected: function (params) {
            trackEvent('select_item', {
                item_list_name: 'premium_plans',
                items: [{
                    item_id: params?.plan_id,
                    item_name: params?.plan_name,
                    price: params?.price,
                    currency: 'USD'
                }],
                ...params
            });
        },

        purchaseCompleted: function (params) {
            trackEvent('purchase', {
                transaction_id: params?.transaction_id,
                value: params?.value || params?.price,
                currency: params?.currency || 'USD',
                items: params?.items || [{
                    item_id: params?.plan_id,
                    item_name: params?.plan_name,
                    price: params?.price
                }],
                ...params
            });
        },

        // --- ENGAGEMENT EVENTS ---

        challengeCreated: function (params) {
            trackEvent('challenge_created', {
                challenge_type: params?.challenge_type,
                sport: params?.sport,
                ...params
            });
        },

        challengeAccepted: function (params) {
            trackEvent('challenge_accepted', {
                challenge_id: params?.challenge_id,
                ...params
            });
        },

        triviaPlayed: function (params) {
            trackEvent('trivia_played', {
                score: params?.score,
                sport: params?.sport,
                ...params
            });
        },

        messageSent: function (params) {
            trackEvent('message_sent', {
                ...params
            });
        },

        friendAdded: function (params) {
            trackEvent('friend_added', {
                ...params
            });
        },

        // --- SCROLL DEPTH (auto-tracked) ---

        scrollDepthReached: function (percent) {
            trackEvent('scroll_depth', {
                percent_scrolled: percent
            });
        },

        // --- OUTBOUND LINK CLICK (auto-tracked) ---

        outboundLinkClicked: function (url) {
            trackEvent('click', {
                link_url: url,
                link_domain: new URL(url).hostname,
                outbound: true
            });
        },

        // --- RAW EVENT (escape hatch) ---

        track: trackEvent,
        pageView: trackPageView,
        setUser: setUserProperties,

        // =====================================================================
        // AUTO-TRACKING BINDINGS
        // =====================================================================

        bindAutoTracking: function () {
            this.bindSPANavigation();
            this.bindOutboundLinks();
            this.bindScrollDepth();
            this.bindCTAButtons();
            this.bindPremiumPage();
            this.bindProfileEditButton();
            this.bindPickHistoryView();
        },

        /**
         * Track SPA navigation - fires on hash change and popstate
         */
        bindSPANavigation: function () {
            const self = this;

            // Intercept showSection calls for SPA navigation
            const originalShowSection = window.showSection;
            if (typeof originalShowSection === 'function') {
                window.showSection = function (section) {
                    originalShowSection.apply(this, arguments);
                    trackPageView('/' + section, section + ' - Trust My Record');
                };
            }

            // Also track hash changes
            window.addEventListener('hashchange', function () {
                trackPageView();
            });

            // And popstate for back/forward
            window.addEventListener('popstate', function () {
                trackPageView();
            });
        },

        /**
         * Auto-track outbound link clicks
         */
        bindOutboundLinks: function () {
            const self = this;
            document.addEventListener('click', function (e) {
                const link = e.target.closest('a[href]');
                if (!link) return;

                const href = link.href;
                if (!href) return;

                try {
                    const url = new URL(href);
                    if (url.hostname !== window.location.hostname) {
                        self.outboundLinkClicked(href);
                    }
                } catch (err) {
                    // Invalid URL, skip
                }
            });
        },

        /**
         * Auto-track scroll depth at 25%, 50%, 75%, 90%
         */
        bindScrollDepth: function () {
            const self = this;
            const thresholds = [25, 50, 75, 90];
            const reached = new Set();

            function getScrollPercent() {
                const h = document.documentElement;
                const b = document.body;
                const st = h.scrollTop || b.scrollTop;
                const sh = h.scrollHeight || b.scrollHeight;
                const ch = h.clientHeight;
                return Math.round((st / (sh - ch)) * 100);
            }

            let ticking = false;
            window.addEventListener('scroll', function () {
                if (ticking) return;
                ticking = true;
                requestAnimationFrame(function () {
                    const percent = getScrollPercent();
                    thresholds.forEach(function (t) {
                        if (percent >= t && !reached.has(t)) {
                            reached.add(t);
                            self.scrollDepthReached(t);
                        }
                    });
                    ticking = false;
                });
            });
        },

        /**
         * Auto-track CTA button clicks (buttons with data-cta attribute)
         */
        bindCTAButtons: function () {
            const self = this;
            document.addEventListener('click', function (e) {
                const btn = e.target.closest('[data-cta]');
                if (btn) {
                    self.ctaClicked({
                        cta_text: btn.textContent.trim().substring(0, 100),
                        cta_location: btn.dataset.cta || 'unknown',
                        cta_destination: btn.href || btn.dataset.destination || ''
                    });
                }
            });
        },

        /**
         * Track premium page views and plan selection clicks
         */
        bindPremiumPage: function () {
            if (!window.location.pathname.includes('premium')) return;

            const self = this;
            self.premiumPageViewed();

            document.addEventListener('click', function (e) {
                const planBtn = e.target.closest('.plan-select-btn, [data-plan]');
                if (planBtn) {
                    self.premiumPlanSelected({
                        plan_id: planBtn.dataset.plan || planBtn.dataset.planId || 'unknown',
                        plan_name: planBtn.dataset.planName || planBtn.textContent.trim(),
                        price: parseFloat(planBtn.dataset.price) || 0
                    });
                }
            });
        },

        /**
         * Auto-track profile edit button clicks
         */
        bindProfileEditButton: function () {
            const self = this;
            document.addEventListener('click', function (e) {
                const editBtn = e.target.closest('#edit-profile-btn, .edit-profile-btn, [data-action="edit-profile"]');
                if (editBtn) {
                    self.profileEditOpened();
                }
            });
        },

        /**
         * Auto-track pick history views on profile page
         */
        bindPickHistoryView: function () {
            if (!window.location.pathname.includes('profile')) return;
            const self = this;

            // Use MutationObserver to detect when pick history tab/section becomes visible
            var historyObserved = false;
            document.addEventListener('click', function (e) {
                const historyTab = e.target.closest('[data-tab="picks"], [data-tab="history"], .picks-history-tab');
                if (historyTab && !historyObserved) {
                    historyObserved = true;
                    self.pickHistoryViewed({ view_type: 'own' });
                    // Reset after a delay so it can fire again on next visit
                    setTimeout(function () { historyObserved = false; }, 5000);
                }
            });
        }
    };

    // =========================================================================
    // EXPOSE GLOBALLY
    // =========================================================================

    window.TMRAnalytics = TMRAnalytics;

    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            TMRAnalytics.init();
        });
    } else {
        TMRAnalytics.init();
    }

})();
