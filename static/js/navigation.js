// Navigation handling for Trust My Record

/**
 * Show a specific section and hide others
 */
function showSection(sectionId) {
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

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Initialize when DOM is loaded
if (typeof window !== 'undefined') {
    window.showSection = showSection;

    document.addEventListener('DOMContentLoaded', function() {
        // Set home as active by default
        const homeSection = document.getElementById('home');
        if (homeSection) {
            homeSection.classList.add('active');
        }
    });
}
