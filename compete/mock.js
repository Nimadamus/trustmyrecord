/* CREATOR_COMPETITION_20261125: localhost only fixture for the design mockup
   (/compete/?c=demo&mock=active|upcoming|joined). Never loaded on the live site:
   index.html only requests it when the host is localhost. */
window.TMR_COMPETE_MOCK = function (mode) {
  var now = Date.now(), day = 864e5;
  var upcoming = mode === 'upcoming';
  var joined = mode === 'joined';
  var names = [
    ['SharpSideSam', 23, 11, 1, 10.42, 29.8, 'WWLWW', 2],
    ['DogDaysDana', 19, 12, 2, 6.10, 18.5, 'WLWWL', 3],
    ['CapperKing', 21, 13, 0, 5.85, 17.2, 'LWWLW', -1],
    ['PuckLineKev', 20, 14, 0, 4.37, 12.9, 'WLLWW', 0],
    ['TotalsTina', 17, 13, 1, 3.02, 9.7, 'LWLWP', -2],
    ['MiamiMoneyline', 16, 13, 0, 2.15, 7.4, 'WWLLW', 1],
    ['jordan_locks', 15, 14, 1, 0.48, 1.6, 'WLLWL', 4],
    ['RoundsRico', 14, 14, 0, -0.90, -3.2, 'LWLLW', -1],
    ['BankrollBea', 13, 15, 0, -2.75, -9.8, 'LLWLL', -3],
    ['NightcapNate', 11, 16, 1, -5.40, -19.3, 'LLWLL', 0]
  ];
  var standings = upcoming ? [] : names.map(function (n, i) {
    return { rank: i + 1, previous_rank: i + 1 + n[7], movement: n[7], user_id: 100 + i, username: n[0], display_name: n[0], avatar_url: null,
      is_host: n[0] === 'CapperKing', wins: n[1], losses: n[2], pushes: n[3], pending: 1, graded: n[1] + n[2] + n[3], units: n[4], roi: n[5], form: n[6].split(''), excluded: 0, qualified: true };
  });
  var you = standings[6] || null;
  var page = {
    competition: {
      slug: 'demo', kind: 'creator', title: 'Capper King December Showdown', tagline: 'Thirty days, verified picks only. Beat the King and take the bragging rights.',
      sport: null, accent_color: '#FFB020', banner_url: null,
      start_date: new Date(upcoming ? now + 6.4 * day : now - 9 * day).toISOString(), end_date: new Date(upcoming ? now + 36 * day : now + 21.3 * day).toISOString(),
      phase: upcoming ? 'upcoming' : 'active', server_time: new Date(now).toISOString(),
      host: { username: 'CapperKing', display_name: 'Capper King', avatar_url: null, bio: '' }, free: true, prizes: null, invite_url: ''
    },
    participant_count: upcoming ? 38 : 87, ranked_count: standings.length,
    standings: standings,
    qualifying: upcoming ? [] : [{ username: 'ParlayFreePaul', graded: 6, picks_to_qualify: 4 }, { username: 'UnderdogUma', graded: 3, picks_to_qualify: 7 }],
    host_standing: standings[2] || null,
    viewer: joined ? { joined: true, standing: you } : null,
    recent_results: upcoming ? [] : [
      { pick_id: 1, username: 'SharpSideSam', sport_key: 'basketball_nba', market_type: 'spread', selection: 'Lakers -4.5', line: -4.5, odds: -110, result: 'won', flat_units: 0.91, graded_at: new Date(now - 3600e3).toISOString() },
      { pick_id: 2, username: 'CapperKing', sport_key: 'americanfootball_nfl', market_type: 'total', selection: 'Over 44.5 Bills vs Dolphins', line: 44.5, odds: -105, result: 'lost', flat_units: -1, graded_at: new Date(now - 5400e3).toISOString() },
      { pick_id: 3, username: 'PuckLineKev', sport_key: 'icehockey_nhl', market_type: 'moneyline', selection: 'Rangers ML', line: null, odds: 135, result: 'won', flat_units: 1.35, graded_at: new Date(now - 8000e3).toISOString() },
      { pick_id: 4, username: 'DogDaysDana', sport_key: 'basketball_ncaab', market_type: 'spread', selection: 'Duke -7', line: -7, odds: -110, result: 'push', flat_units: 0, graded_at: new Date(now - 9000e3).toISOString() }
    ],
    rules: [
      'Every counted pick is scored as 1 unit, whatever stake you post it at.',
      'Only picks priced from -250 to +300 count.',
      'One pick per game and market: your first pick counts. A second pick on the same market, or the other side, does not.',
      'Up to 10 picks a day count, in the order you post them.',
      'Only public picks made after you join and before the competition ends count. Voided games do not count.',
      'You are ranked once you have 10 graded picks. Ties go to ROI, then picks graded, then who joined first.',
      'Your normal TrustMyRecord record is not affected by any of these rules.'
    ],
    rules_version: 'flat_units_v1'
  };
  return {
    username: joined ? 'jordan_locks' : '', page: page,
    me: joined ? { joined: true, not_counted: [
      { pick_id: 9, market_type: 'moneyline', selection: 'Hornets ML', odds: 420, reason: 'odds_outside_band' },
      { pick_id: 10, market_type: 'spread', selection: 'Lakers +4.5', odds: -110, reason: 'same_market_already_counted' }
    ] } : null,
    list: [{ slug: 'december-championship', title: 'December Prediction Championship', host_username: null, participant_count: 0, phase: 'upcoming' },
      { slug: 'demo', title: page.competition.title, host_username: 'CapperKing', participant_count: page.participant_count, phase: page.competition.phase }]
  };
};
