// Visual effects for Trust My Record

/**
 * Interactive card tilt effect
 */
function initCardEffects() {
    document.addEventListener('mousemove', (e) => {
        const cards = document.querySelectorAll('.glass-card');
        cards.forEach(card => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            if (x >= 0 && x <= rect.width && y >= 0 && y <= rect.height) {
                const centerX = rect.width / 2;
                const centerY = rect.height / 2;
                const rotateX = (y - centerY) / 20;
                const rotateY = (centerX - x) / 20;

                card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-8px)`;
            } else {
                card.style.transform = '';
            }
        });
    });
}

/**
 * Dynamic background effect based on mouse position
 */
function initBackgroundEffect() {
    document.addEventListener('mousemove', (e) => {
        try {
            const mouseX = e.clientX / window.innerWidth;
            const mouseY = e.clientY / window.innerHeight;

            document.body.style.backgroundImage = `
                radial-gradient(circle at ${25 + mouseX * 10}% ${75 - mouseY * 10}%, rgba(0, 255, 255, 0.06) 0%, transparent 50%),
                radial-gradient(circle at ${75 - mouseX * 10}% ${25 + mouseY * 10}%, rgba(255, 215, 0, 0.06) 0%, transparent 50%),
                linear-gradient(180deg, var(--darker-bg) 0%, var(--dark-bg) 100%)
            `;
        } catch (error) {
            // Silently handle any errors
        }
    });
}

// Initialize effects when DOM is loaded
if (typeof window !== 'undefined') {
    document.addEventListener('DOMContentLoaded', function() {
        initCardEffects();
        initBackgroundEffect();
    });
}
