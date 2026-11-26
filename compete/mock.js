/* CREATOR_COMPETITION_20261125: localhost only fixture for the design mockup
   (/compete/?c=demo&mock=active|upcoming|joined). Never loaded on the live site:
   index.html only requests it when the host is localhost. */
window.TMR_COMPETE_MOCK = function (mode) {
  var now = Date.now(), day = 864e5;
  var upcoming = mode === 'upcoming';
  var joined = mode === 'joined';
  var names = [
    ['sharpshooter_k', 14, 6, 0, 7.42, 18.6, 'WWLWW', 2],
    ['linebender', 12, 7, 1, 4.15, 10.9, 'WLWWL', -1],
    ['demo_host', 11, 8, 0, 2.31, 6.1, 'LWWLW', 1],
    ['puckline_pat', 9, 7, 0, 1.12, 3.5, 'WLLWW', 0],
    ['overunder_ozzy', 10, 9, 1, 0.48, 1.2, 'LWLWP', 3],
    ['demo_you', 8, 8, 0, -0.66, -2.1, 'WLLWL', -2],
    ['nightcap_nate', 7, 9, 0, -2.35, -7.3, 'LLWLL', 0]
  ];
  var standings = upcoming ? [] : names.map(function (n, i) {
    return { rank: i + 1, previous_rank: i + 1 + n[7], movement: n[7], user_id: 100 + i, username: n[0], display_name: n[0], avatar_url: null,
      is_host: n[0] === 'demo_host', wins: n[1], losses: n[2], pushes: n[3], pending: 1, graded: n[1] + n[2] + n[3], units: n[4], roi: n[5], form: n[6].split(''), excluded: 0, qualified: true };
  });
  var you = standings[5] || null;
  var page = {
    competition: {
      slug: 'demo', kind: 'creator', title: 'Demo Host December Showdown', tagline: 'Thirty days, verified picks only. Beat the host and earn the bragging rights.',
      sport: null, accent_color: '#2DD4BF', banner_url: null,
      start_date: new Date(upcoming ? now + 6.4 * day : now - 9 * day).toISOString(), end_date: new Date(upcoming ? now + 36 * day : now + 21.3 * day).toISOString(),
      phase: upcoming ? 'upcoming' : 'active', server_time: new Date(now).toISOString(),
      host: { username: 'demo_host', display_name: 'Demo Host', avatar_url: null, bio: '' }, free: true, prizes: null, invite_url: ''
    },
    participant_count: upcoming ? 38 : 214, ranked_count: standings.length,
    standings: standings,
    qualifying: upcoming ? [] : [{ username: 'fresh_face', graded: 6, picks_to_qualify: 4 }, { username: 'lateentry', graded: 3, picks_to_qualify: 7 }],
    host_standing: standings[2] || null,
    viewer: joined ? { joined: true, standing: you } : null,
    recent_results: upcoming ? [] : [
      { pick_id: 1, username: 'sharpshooter_k', sport_key: 'basketball_nba', market_type: 'spread', selection: 'Lakers -4.5', line: -4.5, odds: -110, result: 'won', flat_units: 0.91, graded_at: new Date(now - 3600e3).toISOString() },
      { pick_id: 2, username: 'demo_host', sport_key: 'americanfootball_nfl', market_type: 'total', selection: 'Over 44.5 Bills vs Dolphins', line: 44.5, odds: -105, result: 'lost', flat_units: -1, graded_at: new Date(now - 5400e3).toISOString() },
      { pick_id: 3, username: 'puckline_pat', sport_key: 'icehockey_nhl', market_type: 'moneyline', selection: 'Rangers ML', line: null, odds: 135, result: 'won', flat_units: 1.35, graded_at: new Date(now - 8000e3).toISOString() },
      { pick_id: 4, username: 'linebender', sport_key: 'basketball_ncaab', market_type: 'spread', selection: 'Duke -7', line: -7, odds: -110, result: 'push', flat_units: 0, graded_at: new Date(now - 9000e3).toISOString() }
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
    username: joined ? 'demo_you' : '', page: page,
    me: joined ? { joined: true, not_counted: [
      { pick_id: 9, market_type: 'moneyline', selection: 'Hornets ML', odds: 420, reason: 'odds_outside_band' },
      { pick_id: 10, market_type: 'spread', selection: 'Lakers +4.5', odds: -110, reason: 'same_market_already_counted' }
    ] } : null,
    list: [{ slug: 'december-championship', title: 'December Prediction Championship', host_username: null, participant_count: 0, phase: 'upcoming' },
      { slug: 'demo', title: page.competition.title, host_username: 'demo_host', participant_count: page.participant_count, phase: page.competition.phase }]
  };
};
