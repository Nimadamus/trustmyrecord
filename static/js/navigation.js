// Navigation handling for Trust My Record

/**
 * Show a specific section and hide others
 */
function showSection(sectionId, updateHistory = true) {
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
    if (event && event.target) {
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
const validSections = ['home', 'picks', 'leaderboards', 'live', 'marketplace', 'groups', 'messages', 'profile', 'premium', 'forums', 'notifications', 'polls-trivia'];

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
        targetSection = redirectPath;
        // Clean up the URL (remove the query param)
        window.history.replaceState({}, '', '/' + targetSection);
    } else if (hashPath && validSections.includes(hashPath)) {
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
