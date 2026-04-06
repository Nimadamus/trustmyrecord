
// TrustMyRecord Pick Debugger
// Run this in browser console (F12 → Console tab)

function debugPicks() {
    console.log('=== TRUSTMYRECORD PICK DEBUG ===');
    
    // 1. Check stored picks
    const picks = JSON.parse(localStorage.getItem('tmr_picks') || '[]');
    console.log('Total picks stored:', picks.length);
    
    if (picks.length === 0) {
        console.log('NO PICKS FOUND');
        return;
    }
    
    picks.forEach((p, i) => {
        console.log('--- Pick ' + (i+1) + ' ---');
        console.log('ID:', p.id);
        console.log('Game ID:', p.game_id);
        console.log('Sport:', p.sport_key);
        console.log('Teams:', p.away_team, '@', p.home_team);
        console.log('Market:', p.market_type);
        console.log('Selection:', p.selection);
        console.log('Line:', p.line_snapshot);
        console.log('Status:', p.status, '/ Result:', p.result);
        console.log('Commence Time:', p.commence_time);
        
        // Check if game should be graded
        const gameTime = new Date(p.commence_time);
        const now = new Date();
        const hoursSince = (now - gameTime) / (1000 * 60 * 60);
        console.log('Hours since game:', hoursSince.toFixed(1));
        
        if (p.status === 'pending' && hoursSince > 4) {
            console.log('PICK IS PENDING BUT GAME ENDED', hoursSince.toFixed(1), 'hours ago');
        }
    });
    
    // 2. Check auto-grader status
    console.log('AUTO-GRADER STATUS');
    if (window.TMR_GRADER) {
        console.log('TMR_GRADER loaded');
        console.log('Running:', window.TMR_GRADER.running);
        console.log('Last Run:', window.TMR_GRADER.lastRun);
    } else {
        console.log('TMR_GRADER NOT LOADED');
    }
    
    // 3. Try manual grade
    console.log('TRYING MANUAL GRADE');
    console.log('Run: TMR_GRADER.manualGrade()');
}

debugPicks();
