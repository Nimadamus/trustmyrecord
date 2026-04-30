// Navigation handling for Trust My Record

const legacyRouteTargets = {
    picks: 'sportsbook/',
    mypicks: 'mypicks/',
    'my-record': 'my-record/',
    promos: 'promos/',
    consensus: 'consensus/',
    leaderboards: 'leaderboards/',
    live: 'live/',
    marketplace: 'marketplace/',
    groups: 'groups/',
    messages: 'messages/',
    profile: 'profile/',
    premium: 'premium/',
    forums: 'forums/',
    notifications: 'notifications/',
    'polls-trivia': 'polls-trivia/'
};

function getCanonicalRoute(route) {
    if (!route) return null;

    const url = new URL(route, window.location.origin);
    return {
        pathname: url.pathname,
        hash: url.hash || ''
    };
}

function isSportsbookDocumentRoute() {
    const pathname = window.location.pathname || '';
    return pathname === '/sportsbook.html' || pathname === '/sportsbook/' || pathname === '/sportsbook';
}

function isAlreadyAtLegacyTarget(sectionId) {
    const target = getCanonicalRoute(legacyRouteTargets[sectionId]);
    if (!target) return false;

    return window.location.pathname === target.pathname &&
        (window.location.hash || '') === target.hash;
}

function normalizeSportsbookSectionId(sectionId) {
    if (sectionId === 'register') return 'signup';
    return sectionId;
}

function isSportsbookLocalSection(sectionId) {
    if (!isSportsbookDocumentRoute()) return false;
    const normalizedSectionId = normalizeSportsbookSectionId(sectionId);
    const targetSection = document.getElementById(normalizedSectionId);
    return !!(targetSection && targetSection.classList.contains('page-section'));
}

function getSportsbookLocalUrl(sectionId) {
    const normalizedSectionId = normalizeSportsbookSectionId(sectionId);
    // Use the canonical directory URL (/sportsbook/) instead of the .html
    // stub. The .html path 30x-redirects to the directory, and we don't
    // want the browser bar to flash a non-canonical URL after pushState.
    if (normalizedSectionId === 'home' || normalizedSectionId === 'picks') {
        return '/sportsbook/';
    }
    if (normalizedSectionId === 'signup') {
        return '/sportsbook/#register';
    }
    return '/sportsbook/#' + normalizedSectionId;
}

function getRequestedSportsbookSection(params, hashPath) {
    if (!isSportsbookDocumentRoute()) return '';

    const normalizedHash = normalizeSportsbookSectionId((hashPath || '').trim().toLowerCase());
    if (normalizedHash && isSportsbookLocalSection(normalizedHash)) {
        return normalizedHash;
    }

    const authRoute = String(params.get('auth') || '').trim().toLowerCase();
    if (authRoute === 'login') return 'login';
    if (authRoute === 'register' || authRoute === 'signup') return 'signup';

    try {
        const forcedSection = normalizeSportsbookSectionId((sessionStorage.getItem('tmr_force_section') || '').trim().toLowerCase());
        if ((forcedSection === 'login' || forcedSection === 'signup') && isSportsbookLocalSection(forcedSection)) {
            return forcedSection;
        }
    } catch (error) {
        // Ignore storage access failures and fall back to default routing.
    }

    return '';
}

function activateCurrentPageSection(sectionId, updateHistory = true) {
    const normalizedSectionId = normalizeSportsbookSectionId(sectionId);
    const sections = document.querySelectorAll('.page-section');
    sections.forEach(section => section.classList.remove('active'));

    const targetSection = document.getElementById(normalizedSectionId);
    if (targetSection) {
        targetSection.classList.add('active');
    }

    const navLinks = document.querySelectorAll('nav a');
    navLinks.forEach(link => link.classList.remove('active'));

    if (typeof event !== 'undefined' && event && event.target && event.target.classList) {
        event.target.classList.add('active');
    }

    if (updateHistory && isSportsbookLocalSection(normalizedSectionId)) {
        // Default 'picks' tab on /sportsbook/ should stay at the bare
        // canonical URL — no #picks fragment cluttering the bar.
        const targetUrl = normalizedSectionId === 'picks'
            ? '/sportsbook/'
            : getSportsbookLocalUrl(normalizedSectionId);
        window.history.pushState({ section: normalizedSectionId }, '', targetUrl);
    } else if (updateHistory && normalizedSectionId === 'home' && isSportsbookDocumentRoute()) {
        // Guard: never silently rewrite /sportsbook/ to / while the picks
        // board is still painted on screen. If a user-initiated call
        // somehow lands here (updateHistory=true), do a real navigation
        // instead of pushState. Pure-routing passes use updateHistory=false
        // and skip this branch.
        window.location.href = '/';
        return;
    } else if (updateHistory && normalizedSectionId !== 'home') {
        window.history.pushState({ section: normalizedSectionId }, '', '/' + normalizedSectionId);
    } else if (updateHistory && normalizedSectionId === 'home') {
        window.history.pushState({ section: 'home' }, '', '/');
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function activateCanonicalLegacySection(sectionId, updateHistory = true) {
    if (window.__tmrCanonicalLegacyGuard) {
        activateCurrentPageSection(sectionId, updateHistory);
        return;
    }

    const currentShowSection = typeof window !== 'undefined' && typeof window.showSection === 'function'
        ? window.showSection
        : null;

    if (currentShowSection && currentShowSection !== showSection) {
        window.__tmrCanonicalLegacyGuard = true;
        try {
            currentShowSection(sectionId, updateHistory);
            return;
        } finally {
            window.__tmrCanonicalLegacyGuard = false;
        }
    }

    activateCurrentPageSection(sectionId, updateHistory);
}

/**
 * Show a specific section and hide others
 */
function showSection(sectionId, updateHistory = true) {
    const normalizedSectionId = normalizeSportsbookSectionId(sectionId);

    // 'home' from inside the sportsbook page must do a real navigation to
    // the homepage. Previously we pushState('/') which left the picks
    // board visually rendered (its CSS forces display:block!important)
    // while the URL bar said only "/". That made the sportsbook page look
    // like the homepage and broke refresh/bookmark/share behavior.
    // Only fire on intentional user clicks (updateHistory=true) — during
    // the initial-routing pass handleRouting() calls us with false, and
    // we must NOT redirect a direct visit to /sportsbook/ off the page.
    if (normalizedSectionId === 'home' && updateHistory && isSportsbookDocumentRoute()) {
        window.location.href = '/';
        return;
    }

    if (isSportsbookLocalSection(normalizedSectionId)) {
        activateCanonicalLegacySection(normalizedSectionId, updateHistory);
        return;
    }

    if (legacyRouteTargets[normalizedSectionId]) {
        if (isAlreadyAtLegacyTarget(normalizedSectionId)) {
            activateCurrentPageSection(normalizedSectionId, updateHistory);
            return;
        }
        window.location.href = legacyRouteTargets[normalizedSectionId];
        return;
    }

    activateCurrentPageSection(normalizedSectionId, updateHistory);
}

// Valid section IDs for routing
const validSections = ['home', 'picks', 'mypicks', 'my-record', 'promos', 'consensus', 'leaderboards', 'live', 'marketplace', 'groups', 'messages', 'profile', 'premium', 'forums', 'notifications', 'polls-trivia', 'login', 'signup', 'register'];

/**
 * Handle URL-based routing for SPA
 */
function handleRouting() {
    // Check for redirect parameter from 404.html
    const params = new URLSearchParams(window.location.search);
    const redirectPath = params.get('p');

    // Also check for hash-based routing
    const hashPath = window.location.hash.replace('#', '');

    const sportsbookRequestedSection = getRequestedSportsbookSection(params, hashPath);
    if (sportsbookRequestedSection) {
        activateCanonicalLegacySection(sportsbookRequestedSection, false);
        return;
    }

    // Determine which section to show
    let targetSection = 'home';

    if (redirectPath && validSections.includes(redirectPath)) {
        if (legacyRouteTargets[redirectPath]) {
            if (isAlreadyAtLegacyTarget(redirectPath)) {
                activateCanonicalLegacySection(redirectPath, false);
                return;
            }
            window.location.replace(legacyRouteTargets[redirectPath]);
            return;
        }
        targetSection = redirectPath;
        // Clean up the URL (remove the query param)
        window.history.replaceState({}, '', '/' + targetSection);
    } else if (hashPath && validSections.includes(hashPath)) {
        if (isSportsbookDocumentRoute()) {
            const localSection = document.getElementById(hashPath);
            if (localSection && localSection.classList.contains('page-section')) {
                activateCanonicalLegacySection(hashPath, false);
                return;
            }
        }
        if (legacyRouteTargets[hashPath]) {
            if (isAlreadyAtLegacyTarget(hashPath)) {
                activateCanonicalLegacySection(hashPath, false);
                return;
            }
            window.location.replace(legacyRouteTargets[hashPath]);
            return;
        }
        targetSection = hashPath;
    }

    showSection(targetSection, false); // Don't update history when restoring from URL
}

// Initialize when DOM is loaded
if (typeof window !== 'undefined') {
    window.showSection = showSection;

    document.addEventListener('DOMContentLoaded', function() {
        // Handle URL-based routing
        handleRouting();
    });

    // Handle browser back/forward buttons
    window.addEventListener('popstate', function() {
        handleRouting();
    });
}
