// Navigation handling for Trust My Record

const legacyRouteTargets = {
    picks: 'picks/',
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

function isAlreadyAtLegacyTarget(sectionId) {
    const target = getCanonicalRoute(legacyRouteTargets[sectionId]);
    if (!target) return false;

    return window.location.pathname === target.pathname &&
        (window.location.hash || '') === target.hash;
}

function activateCurrentPageSection(sectionId, updateHistory = true) {
    const sections = document.querySelectorAll('.page-section');
    sections.forEach(section => section.classList.remove('active'));

    const targetSection = document.getElementById(sectionId);
    if (targetSection) {
        targetSection.classList.add('active');
    }

    const navLinks = document.querySelectorAll('nav a');
    navLinks.forEach(link => link.classList.remove('active'));

    if (typeof event !== 'undefined' && event && event.target && event.target.classList) {
        event.target.classList.add('active');
    }

    if (updateHistory && sectionId !== 'home') {
        window.history.pushState({ section: sectionId }, '', '/' + sectionId);
    } else if (updateHistory && sectionId === 'home') {
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
    if (legacyRouteTargets[sectionId]) {
        if (isAlreadyAtLegacyTarget(sectionId)) {
            activateCurrentPageSection(sectionId, updateHistory);
            return;
        }
        window.location.href = legacyRouteTargets[sectionId];
        return;
    }

    activateCurrentPageSection(sectionId, updateHistory);
}

// Valid section IDs for routing
const validSections = ['home', 'picks', 'mypicks', 'my-record', 'promos', 'consensus', 'leaderboards', 'live', 'marketplace', 'groups', 'messages', 'profile', 'premium', 'forums', 'notifications', 'polls-trivia'];

/**
 * Handle URL-based routing for SPA
 */
function handleRouting() {
    // Check for redirect parameter from 404.html
    const params = new URLSearchParams(window.location.search);
    const redirectPath = params.get('p');

    // Also check for hash-based routing
    const hashPath = window.location.hash.replace('#', '');

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
