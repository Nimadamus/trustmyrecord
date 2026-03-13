// Test script to verify profile pick filtering logic
// Run this in browser console on profile page

(function testProfileLogic() {
    console.log('=== TMR Profile Logic Test ===\n');
    
    // Simulate what profile.html does
    const currentUserObj = JSON.parse(localStorage.getItem('tmr_current_user') || '{}');
    const profileUsername = currentUserObj.username || 'Guest';
    
    console.log('Current User:', currentUserObj);
    console.log('Profile Username:', profileUsername);
    console.log('');
    
    // Get picks
    let picks = JSON.parse(localStorage.getItem('tmr_picks') || '[]');
    console.log('Total picks in localStorage:', picks.length);
    console.log('');
    
    // Show each pick
    console.log('--- Picks Detail ---');
    picks.forEach((p, i) => {
        console.log(`Pick #${i+1}:`);
        console.log('  id:', p.id);
        console.log('  user_id:', p.user_id, '(type:', typeof p.user_id + ')');
        console.log('  sport:', p.sport_title);
        console.log('  teams:', p.away_team, '@', p.home_team);
        console.log('  status:', p.status);
        console.log('');
    });
    
    // Migration (from profile.html)
    let needsSave = false;
    const currentUserId = currentUserObj.username || currentUserObj.id || profileUsername;
    picks = picks.map(function(p) {
        if (!p.user_id) {
            console.log('MIGRATING pick', p.id, '- adding user_id:', currentUserId);
            p.user_id = currentUserId;
            needsSave = true;
        }
        return p;
    });
    if (needsSave) {
        localStorage.setItem('tmr_picks', JSON.stringify(picks));
        console.log('Saved migrated picks\n');
    }
    
    // Filter (from profile.html)
    console.log('--- Filter Test ---');
    console.log('Filtering with:');
    console.log('  profileUsername:', profileUsername, '(type:', typeof profileUsername + ')');
    console.log('  currentUserId:', currentUserId, '(type:', typeof currentUserId + ')');
    console.log('');
    
    const allPicks = picks.filter(function(p) { 
        const match = p.user_id == profileUsername || p.user_id == currentUserId;
        console.log('  Pick', p.id, 'user_id="' + p.user_id + '" vs profileUsername="' + profileUsername + '" ->', match ? 'MATCH' : 'NO MATCH');
        return match;
    });
    
    console.log('\n=== RESULT ===');
    console.log('Filtered picks count:', allPicks.length);
    
    if (allPicks.length >= 2) {
        console.log('✅ SUCCESS: Two or more picks found!');
    } else {
        console.log('❌ FAIL: Less than 2 picks found');
        console.log('\nPossible issues:');
        console.log('1. Picks were never saved to localStorage');
        console.log('2. Picks have different user_id than expected');
        console.log('3. Picks were saved with a different username');
    }
    
    return allPicks;
})();
