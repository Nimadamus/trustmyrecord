// GRADING IS NOW SERVER-SIDE
// The backend's gradingEngine.js handles pick grading automatically every 15 minutes.
// This file provides no-op stubs so existing references don't throw errors.

console.log('[TMR Grading] Grading is handled server-side. Client-side grading disabled.');

async function autoGradePicks() {
    console.log('[TMR Grading] autoGradePicks() is a no-op. Grading runs server-side every 15 minutes.');
    return { graded: 0, wins: 0, losses: 0, pushes: 0 };
}

function manualGradePick() {
    console.log('[TMR Grading] Manual grading disabled. Use the backend admin endpoint POST /api/admin/grade-picks.');
    return false;
}

function showGradingModal() {
    console.log('[TMR Grading] Grading modal disabled. Picks are graded automatically server-side.');
    alert('Pick grading is now automatic! The server grades picks every 15 minutes. Just refresh your picks to see updated results.');
}

function closeGradingModal() {
    const modal = document.getElementById('gradingModal');
    if (modal) modal.style.display = 'none';
}

function updateLeaderboardsWithRealData() {
    // Leaderboards now powered by backend API
    console.log('[TMR Grading] Leaderboards are now powered by the backend API.');
}

function viewGradingLogs() {
    console.log('[TMR Grading] Client-side grading logs are no longer generated. Check server logs instead.');
    return [];
}

function forceGradePick() {
    console.log('[TMR Grading] forceGradePick() disabled. Use backend admin endpoint.');
    return false;
}

function getPendingPicks() {
    console.log('[TMR Grading] getPendingPicks() disabled. Use window.api.getUserPicks() instead.');
    return [];
}

// Export functions globally (no-op stubs)
window.autoGradePicks = autoGradePicks;
window.manualGradePick = manualGradePick;
window.showGradingModal = showGradingModal;
window.closeGradingModal = closeGradingModal;
window.updateLeaderboardsWithRealData = updateLeaderboardsWithRealData;
window.viewGradingLogs = viewGradingLogs;
window.forceGradePick = forceGradePick;
window.getPendingPicks = getPendingPicks;
