// Form submission handling for Trust My Record

// Configuration - UPDATE THIS WITH YOUR FORMSPREE ENDPOINT
const FORMSPREE_SIGNUP_ENDPOINT = 'https://formspree.io/f/YOUR_FORM_ID_HERE';
const FORMSPREE_PICKS_ENDPOINT = 'https://formspree.io/f/YOUR_FORM_ID_HERE';

/**
 * Handle signup form submission
 */
function handleSignupSubmit(e) {
    e.preventDefault();

    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    if (password !== confirmPassword) {
        alert('Passwords do not match!');
        return;
    }

    const formData = {
        username: document.getElementById('username').value,
        email: document.getElementById('email').value,
        password: password, // In production, never send plain passwords!
        timestamp: new Date().toISOString()
    };

    // Option 1: Send to Formspree
    submitToFormspree(FORMSPREE_SIGNUP_ENDPOINT, formData, 'signup');

    // Option 2: Store locally (fallback)
    storeSignupLocally(formData);
}

/**
 * Handle pick form submission
 */
function handlePickSubmit(e) {
    e.preventDefault();

    const formData = new FormData(e.target);
    const pick = {
        sport: formData.get('sport'),
        team1: formData.get('team1'),
        team2: formData.get('team2'),
        betType: formData.get('betType'),
        pick: formData.get('pick'),
        odds: formData.get('odds'),
        confidence: formData.get('confidence'),
        units: formData.get('units'),
        reasoning: formData.get('reasoning'),
        timestamp: new Date().toISOString(),
        status: 'pending'
    };

    // Option 1: Send to Formspree
    submitToFormspree(FORMSPREE_PICKS_ENDPOINT, pick, 'pick');

    // Option 2: Store locally
    storePickLocally(pick);

    // Add pick to history display
    addPickToHistory(pick);

    // Reset form
    e.target.reset();

    // Show success message
    alert('Pick submitted successfully! It has been added to your permanent record.');
}

/**
 * Submit data to Formspree
 */
async function submitToFormspree(endpoint, data, type) {
    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        if (response.ok) {
            console.log(`${type} submitted successfully to Formspree`);

            if (type === 'signup') {
                alert('Account created successfully! Welcome to Trust My Record.');
                showSection('picks');
            }
        } else {
            console.error(`Failed to submit ${type} to Formspree:`, response.statusText);
            alert(`There was an issue submitting your ${type}. It has been saved locally.`);
        }
    } catch (error) {
        console.error(`Error submitting ${type}:`, error);
        alert(`Network error. Your ${type} has been saved locally.`);
    }
}

/**
 * Store signup data locally in browser
 */
function storeSignupLocally(data) {
    const signups = JSON.parse(localStorage.getItem('trustmyrecord_signups') || '[]');
    signups.push(data);
    localStorage.setItem('trustmyrecord_signups', JSON.stringify(signups));
    console.log('Signup stored locally:', data);
}

/**
 * Store pick data locally in browser
 */
function storePickLocally(pick) {
    const picks = JSON.parse(localStorage.getItem('trustmyrecord_picks') || '[]');
    picks.push(pick);
    localStorage.setItem('trustmyrecord_picks', JSON.stringify(picks));
    console.log('Pick stored locally:', pick);
}

/**
 * Load picks from localStorage on page load
 */
function loadStoredPicks() {
    const picks = JSON.parse(localStorage.getItem('trustmyrecord_picks') || '[]');
    const container = document.getElementById('picksContainer');

    // Clear sample picks
    container.innerHTML = '';

    // Display stored picks
    picks.forEach(pick => addPickToHistory(pick));
}

/**
 * Add pick to history display
 */
function addPickToHistory(pick) {
    const container = document.getElementById('picksContainer');
    const pickElement = document.createElement('div');
    pickElement.className = `pick-item ${pick.status}`;

    pickElement.innerHTML = `
        <div class="pick-details">
            <div class="pick-game">${pick.team1} vs ${pick.team2}</div>
            <div class="pick-bet">${pick.pick} (${pick.odds}) | ${pick.units} Units</div>
        </div>
        <div class="pick-result ${pick.status}">${pick.status.toUpperCase()}</div>
    `;

    // Add to top of list
    container.insertBefore(pickElement, container.firstChild);
}

/**
 * Export data for backup
 */
function exportData() {
    const signups = JSON.parse(localStorage.getItem('trustmyrecord_signups') || '[]');
    const picks = JSON.parse(localStorage.getItem('trustmyrecord_picks') || '[]');

    const data = {
        signups,
        picks,
        exportDate: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trustmyrecord-data-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

// Initialize when DOM is loaded
if (typeof window !== 'undefined') {
    window.handleSignupSubmit = handleSignupSubmit;
    window.handlePickSubmit = handlePickSubmit;
    window.addPickToHistory = addPickToHistory;
    window.exportData = exportData;

    // Load stored picks when page loads
    document.addEventListener('DOMContentLoaded', loadStoredPicks);
}
