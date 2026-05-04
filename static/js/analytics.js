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

    const DEFAULT_MEASUREMENT_ID = 'G-V5MCVXS2HE';

    function analyticsDebugEnabled() {
        try {
            const params = new URLSearchParams(window.location.search);
            if (params.has('tmr_debug_analytics')) {
                localStorage.setItem('tmr_debug_analytics', params.get('tmr_debug_analytics') === '0' ? '0' : '1');
            }
            return localStorage.getItem('tmr_debug_analytics') === '1';
        } catch (e) {
            return false;
        }
    }

    const ANALYTICS_CONFIG = {
        get measurementId() {
            return (typeof CONFIG !== 'undefined' && CONFIG.analytics?.measurementId) || DEFAULT_MEASUREMENT_ID;
        },
        get gtmId() {
            return (typeof CONFIG !== 'undefined' && CONFIG.analytics?.gtmId) || '';
        },
        get debug() {
            return analyticsDebugEnabled() || (typeof CONFIG !== 'undefined' && CONFIG.analytics?.debug) || false;
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

        const measurementId = ANALYTICS_CONFIG.measurementId;
        if (!measurementId) return;

        window.dataLayer = window.dataLayer || [];

        if (typeof window.gtag !== 'function') {
            window.gtag = function () { window.dataLayer.push(arguments); };
            window.gtag('js', new Date());
            window.gtag('config', measurementId, {
                debug_mode: ANALYTICS_CONFIG.debug
            });

            const existing = document.querySelector('script[src*="googletagmanager.com/gtag/js"]');
            if (!existing) {
                const script = document.createElement('script');
                script.async = true;
                script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(measurementId);
                (document.head || document.documentElement).appendChild(script);
            }
            window.__tmrGa4Bootstrapped = true;
        }

        if (typeof window.gtag !== 'function') {
            console.warn('[TMR Analytics] gtag not found. Make sure the GA4 snippet is in <head>.');
            return;
        }

        // Set debug mode if configured
        if (ANALYTICS_CONFIG.debug) {
            window.gtag('set', { debug_mode: true });
        }

        console.log('[TMR Analytics] GA4 connected:', measurementId);
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
    function getPagePath() {
        return window.location.pathname + window.location.search + window.location.hash;
    }

    function sanitizeParams(params) {
        const clean = {};
        Object.keys(params || {}).forEach(function (key) {
            const value = params[key];
            if (value === undefined || value === null || typeof value === 'function') return;
            clean[key] = value;
        });
        return clean;
    }

    function rememberDebugEvent(type, name, params) {
        window.__tmrAnalyticsEvents = window.__tmrAnalyticsEvents || [];
        window.__tmrAnalyticsEvents.push({
            type: type,
            name: name,
            params: params,
            at: new Date().toISOString()
        });
        if (window.__tmrAnalyticsEvents.length > 100) {
            window.__tmrAnalyticsEvents.shift();
        }
    }

    function trackEvent(eventName, params) {
        if (!ANALYTICS_CONFIG.enabled) return;

        const eventParams = sanitizeParams({
            page_path: getPagePath(),
            page_title: document.title,
            timestamp: new Date().toISOString(),
            ...params
        });

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

        rememberDebugEvent('event', eventName, eventParams);

        if (ANALYTICS_CONFIG.debug) {
            console.log('[TMR Analytics] Event:', eventName, eventParams);
        }
    }

    /**
     * Track a pageview (for SPA navigation)
     * @param {string} pagePath - The page path
     * @param {string} pageTitle - The page title
     */
    function routeNameFromPath(pagePath) {
        const path = String(pagePath || window.location.pathname || '/').split('?')[0].split('#')[0];
        const parts = path.split('/').filter(Boolean);
        return parts[0] || 'home';
    }

    const lastRouteEvents = {};

    function trackRouteEvent(eventName, params) {
        const key = eventName + '|' + (params && params.page_path ? params.page_path : '');
        const now = Date.now();
        if (lastRouteEvents[key] && now - lastRouteEvents[key] < 1000) return;
        lastRouteEvents[key] = now;
        trackEvent(eventName, params);
    }

    function trackRouteViewed(pagePath) {
        const route = routeNameFromPath(pagePath);
        const params = {
            route: route,
            page_path: pagePath || getPagePath()
        };

        if (route === 'picks' || route === 'make-picks' || route === 'submit-pick' || route === 'sportsbook') {
            trackRouteEvent('picks_page_viewed', params);
        } else if (route === 'forum' || route === 'forums') {
            trackRouteEvent('forum_viewed', params);
        } else if (route === 'handicappers' || route === 'cappers' || route === 'directory') {
            trackRouteEvent('handicappers_page_viewed', params);
        } else if (route === 'profile' || route === 'account' || route === 'my-record') {
            trackRouteEvent('profile_viewed', params);
        } else if (route === 'arena' || route === 'challenges' || route === 'polls' || route === 'trivia') {
            trackRouteEvent('arena_viewed', params);
        } else if (route === 'simulator' || route.indexOf('simulator') !== -1 || route === 'tool' || route === 'tools' || route.indexOf('tool') !== -1 || route === 'model-builder') {
            trackRouteEvent('simulator_tool_page_viewed', params);
        }
    }

    function trackPageView(pagePath, pageTitle) {
        if (!ANALYTICS_CONFIG.enabled) return;

        const params = {
            page_path: pagePath || getPagePath(),
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

        rememberDebugEvent('page_view', 'page_view', params);
        trackRouteViewed(params.page_path);

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
            trackRouteViewed(getPagePath());
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
            trackEvent('account_creation_started', {
                button_location: params?.button_location || 'unknown',
                method: 'email',
                ...params
            });
            trackEvent('sign_up_started', {
                button_location: params?.button_location || 'unknown',
                ...params
            });
        },

        signUpCompleted: function (params) {
            trackEvent('signup_completed', {
                method: 'email',
                ...params
            });
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
            trackEvent('forum_post_created', {
                sport: params?.sport,
                post_type: params?.post_type || 'post',
                post_id: params?.thread_id || params?.post_id,
                ...params
            });
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
        debugStatus: function () {
            const status = {
                enabled: ANALYTICS_CONFIG.enabled,
                debug: ANALYTICS_CONFIG.debug,
                measurementId: ANALYTICS_CONFIG.measurementId,
                gtagAvailable: typeof window.gtag === 'function',
                bootstrappedByAnalyticsModule: !!window.__tmrGa4Bootstrapped,
                queuedEvents: (window.__tmrAnalyticsEvents || []).slice()
            };
            console.table ? console.table(status.queuedEvents) : console.log(status.queuedEvents);
            return status;
        },

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
            this.bindImportantActions();
            this.bindApiSuccessTracking();
        },

        /**
         * Track SPA navigation - fires on hash change and popstate
         */
        bindSPANavigation: function () {
            let lastTrackedPath = getPagePath();

            function trackIfChanged(label) {
                setTimeout(function () {
                    const currentPath = getPagePath();
                    if (currentPath === lastTrackedPath && label !== 'showSection') return;
                    lastTrackedPath = currentPath;
                    trackPageView(currentPath, document.title);
                }, 0);
            }

            ['pushState', 'replaceState'].forEach(function (method) {
                const original = history[method];
                if (typeof original !== 'function' || original.__tmrAnalyticsWrapped) return;
                const wrapped = function () {
                    const result = original.apply(this, arguments);
                    trackIfChanged(method);
                    return result;
                };
                wrapped.__tmrAnalyticsWrapped = true;
                history[method] = wrapped;
            });

            // Intercept showSection calls for SPA navigation
            const originalShowSection = window.showSection;
            if (typeof originalShowSection === 'function' && !originalShowSection.__tmrAnalyticsWrapped) {
                window.showSection = function (section) {
                    const result = originalShowSection.apply(this, arguments);
                    trackPageView('/' + section, section + ' - TrustMyRecord');
                    return result;
                };
                window.showSection.__tmrAnalyticsWrapped = true;
            }

            // Also track hash changes
            window.addEventListener('hashchange', function () {
                trackIfChanged('hashchange');
            });

            // And popstate for back/forward
            window.addEventListener('popstate', function () {
                trackIfChanged('popstate');
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
        },

        bindImportantActions: function () {
            const self = this;
            document.addEventListener('submit', function (e) {
                const form = e.target;
                if (!form || !form.matches) return;

                if (form.matches('#signupForm, #signup-form, form[action*="register"], form[action*="signup"]')) {
                    self.signUpStarted({ button_location: 'signup_form_submit' });
                }

                if (form.matches('#loginForm, #login-form, form[action*="login"]')) {
                    self.loginStarted({ button_location: 'login_form_submit' });
                }

                if (form.matches('#pick-form, #pickForm, form[data-pick-form]')) {
                    self.makePickStarted({ button_location: 'pick_form_submit' });
                }

                if (form.matches('#forumPostForm, #threadForm, form[data-forum-post-form]')) {
                    self.forumThreadStarted({ button_location: 'forum_form_submit' });
                }
            }, true);

            document.addEventListener('click', function (e) {
                const target = e.target.closest && e.target.closest('#ttSlipSubmit,#submitPickBtn,button.submit-pick-btn,button.lock-pick-btn,[data-lock-pick-btn]');
                if (target) {
                    self.makePickStarted({
                        button_location: target.id || target.dataset.analyticsLocation || 'pick_submit_button'
                    });
                }
            }, true);
        },

        bindApiSuccessTracking: function () {
            const self = this;
            if (typeof window.fetch !== 'function' || window.fetch.__tmrAnalyticsWrapped) return;

            function parseBody(init) {
                if (!init || init.body == null) return {};
                if (typeof init.body === 'string') {
                    try { return JSON.parse(init.body); } catch (e) { return {}; }
                }
                if (typeof init.body === 'object' && !(init.body instanceof FormData)) {
                    return init.body;
                }
                return {};
            }

            function requestInfo(input, init) {
                const url = typeof input === 'string' ? input : (input && input.url) || '';
                const method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
                return { url: url, method: method };
            }

            const originalFetch = window.fetch;
            const wrappedFetch = function (input, init) {
                const info = requestInfo(input, init);
                const body = parseBody(init);
                return originalFetch.apply(this, arguments).then(function (response) {
                    try {
                        if (response && response.ok && info.method === 'POST') {
                            if (/\/picks(?:\?|$|\/)/.test(info.url)) {
                                self.pickSubmitted({
                                    sport: body.sport_key || body.sport || body.league,
                                    league: body.league,
                                    pick_type: body.market_type || body.pick_type,
                                    odds: body.odds_snapshot || body.odds,
                                    units: body.units,
                                    source: 'api_success'
                                });
                            } else if (/\/feed(?:\?|$|\/)|\/posts(?:\?|$|\/)|\/forum(?:\?|$|\/)|\/forums(?:\?|$|\/)|\/threads(?:\?|$|\/)|\/polls(?:\?|$|\/)/.test(info.url)) {
                                const route = routeNameFromPath(window.location.pathname);
                                const params = {
                                    post_type: body.post_type || body.type || (body.options ? 'poll' : 'post'),
                                    sport: body.sport,
                                    source: 'api_success'
                                };
                                self.postCreated(params);
                                if (route === 'forum' || route === 'forums') {
                                    self.forumThreadCreated(params);
                                }
                            }
                        }
                    } catch (e) {
                        if (ANALYTICS_CONFIG.debug) console.warn('[TMR Analytics] API success tracking failed:', e);
                    }
                    return response;
                });
            };

            wrappedFetch.__tmrAnalyticsWrapped = true;
            window.fetch = wrappedFetch;
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
