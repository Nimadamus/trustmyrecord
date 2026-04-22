// Navigation handling for Trust My Record

const legacyRouteTargets = {
    picks: 'sportsbook.html#picks',
    mypicks: 'sportsbook.html#mypicks',
    'my-record': 'sportsbook.html#my-record',
    promos: 'sportsbook.html#promos',
    consensus: 'sportsbook.html#consensus',
    leaderboards: 'sportsbook.html#leaderboards',
    live: 'sportsbook.html',
    marketplace: 'premium.html',
    groups: 'friends.html',
    messages: 'messages.html',
    profile: 'profile.html',
    premium: 'premium.html',
    forums: 'forum.html',
    notifications: 'notifications.html',
    'polls-trivia': 'hangout.html'
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

/**
 * Show a specific section and hide others
 */
function showSection(sectionId, updateHistory = true) {
    if (legacyRouteTargets[sectionId]) {
        if (isAlreadyAtLegacyTarget(sectionId)) {
            return;
        }
        window.location.href = legacyRouteTargets[sectionId];
        return;
    }

    // Hide all sections
    const sections = document.querySelectorAll('.page-section');
    sections.forEach(section => section.classList.remove('active'));

    // Show selected section
    const targetSection = document.getElementById(sectionId);
    if (targetSection) {
        targetSection.classList.add('active');
    }

    // Update nav active states
    const navLinks = document.querySelectorAll('nav a');
    navLinks.forEach(link => link.classList.remove('active'));

    // Add active class to clicked nav item (if event exists)
    if (typeof event !== 'undefined' && event && event.target && event.target.classList) {
        event.target.classList.add('active');
    }

    // Update URL for browser history (allows back/forward to work)
    if (updateHistory && sectionId !== 'home') {
        window.history.pushState({ section: sectionId }, '', '/' + sectionId);
    } else if (updateHistory && sectionId === 'home') {
        window.history.pushState({ section: 'home' }, '', '/');
    }

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
