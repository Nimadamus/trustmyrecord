/* ===================================================================
   TMR Board Smilies  (Jul 22, 2026)
   The classic animated sportsbook-forum smilie set (the same pack
   Covers.com and SBR use), self-hosted at /static/emoticons/.

   API:
     TMRSmilies.LIST                 - [[file, code, label, group], ...]
     TMRSmilies.GROUPS               - ordered group names
     TMRSmilies.url(file)            - URL for a smilie file
     TMRSmilies.toHtml(escapedText)  - replace :code: with <img> tags.
                                       Input MUST already be HTML-escaped.
=================================================================== */
(function () {
  if (window.TMRSmilies) return;

  var BASE = '/static/emoticons/';

  // [file, shortcode, label, group]
  var LIST = [
    /* ---- Laughing & reactions ---- */
    ['lmao', 'lmao', 'Point and laugh', 'Laughing & reactions'],
    ['an_laugh', 'lol', 'LOL', 'Laughing & reactions'],
    ['an_roll_laugh', 'rofl', 'Rolling on the floor', 'Laughing & reactions'],
    ['an_razz', 'razz', 'Razz', 'Laughing & reactions'],
    ['an_tongueout', 'tongueout', 'Tongue out', 'Laughing & reactions'],
    ['smiley_3', 'grin', 'Grin', 'Laughing & reactions'],
    ['bigsmile', 'bigsmile', 'Big smile', 'Laughing & reactions'],
    ['reallyhappy', 'reallyhappy', 'Really happy', 'Laughing & reactions'],
    ['biggrin', 'biggrin', 'Big grin', 'Laughing & reactions'],
    ['smile', 'smile', 'Smile', 'Laughing & reactions'],
    ['wink', 'wink', 'Wink', 'Laughing & reactions'],
    ['an_wink', 'wink2', 'Big wink', 'Laughing & reactions'],
    ['frown', 'frown', 'Frown', 'Laughing & reactions'],
    ['sad', 'sad', 'Sad', 'Laughing & reactions'],
    ['an_cry', 'cry', 'Crying', 'Laughing & reactions'],
    ['angry', 'angry', 'Angry', 'Laughing & reactions'],
    ['mad', 'mad', 'Mad', 'Laughing & reactions'],
    ['redface', 'redface', 'Embarrassed', 'Laughing & reactions'],
    ['rolleyes', 'rolleyes', 'Rolling eyes', 'Laughing & reactions'],
    ['tongue', 'tongue', 'Tongue', 'Laughing & reactions'],
    ['eek', 'eek', 'Eek', 'Laughing & reactions'],
    ['an_eek2', 'eek2', 'Big eek', 'Laughing & reactions'],
    ['confused', 'confused', 'Confused', 'Laughing & reactions'],
    ['cool', 'cool', 'Cool', 'Laughing & reactions'],
    ['surprised', 'surprised', 'Surprised', 'Laughing & reactions'],
    ['quiet', 'quiet', 'Quiet', 'Laughing & reactions'],
    ['an_speechless', 'speechless', 'Speechless', 'Laughing & reactions'],
    ['an_speak', 'speak', 'Speak up', 'Laughing & reactions'],
    ['sleep2', 'sleep', 'Asleep', 'Laughing & reactions'],
    ['lie', 'lie', 'Liar', 'Laughing & reactions'],
    ['moose', 'moose', 'Moose', 'Laughing & reactions'],
    ['an_light', 'light', 'Lightbulb', 'Laughing & reactions'],
    ['an_lightening', 'lightning', 'Lightning', 'Laughing & reactions'],

    /* ---- Celebrating ---- */
    ['an_clap', 'clap', 'Applause', 'Celebrating'],
    ['an_dance', 'dance', 'Dancing', 'Celebrating'],
    ['an_boggienight', 'boogie', 'Boogie night', 'Celebrating'],
    ['an_happybounce', 'happybounce', 'Happy bounce', 'Celebrating'],
    ['an_bounce', 'bounce', 'Bouncing', 'Celebrating'],
    ['an_happydude', 'happydude', 'Happy dude', 'Celebrating'],
    ['an_woo', 'woo', 'Woo!', 'Celebrating'],
    ['jumpy', 'jumpy', 'Jumping', 'Celebrating'],
    ['an_shake', 'shake', 'Shake it', 'Celebrating'],
    ['an_praise', 'praise', 'Praise', 'Celebrating'],
    ['an_worship', 'worship', 'We are not worthy', 'Celebrating'],
    ['an_angel', 'angel', 'Angel', 'Celebrating'],
    ['an_baby', 'baby', 'Baby', 'Celebrating'],
    ['an_violin', 'violin', 'Tiny violin', 'Celebrating'],
    ['peace', 'peace', 'Peace', 'Celebrating'],
    ['peace_5', 'peace5', 'Peace out', 'Celebrating'],
    ['cheers', 'cheers', 'Cheers', 'Celebrating'],
    ['an_cheers', 'cheers2', 'Big cheers', 'Celebrating'],
    ['an_2drinks', '2drinks', 'Two drinks', 'Celebrating'],
    ['an_drunksick', 'drunksick', 'Drunk and sick', 'Celebrating'],
    ['thumbs_up', 'thumbsup', 'Thumbs up', 'Celebrating'],
    ['thumbs_down', 'thumbsdown', 'Thumbs down', 'Celebrating'],

    /* ---- Money & action ---- */
    ['moneybag', 'moneybag', 'Money bag', 'Money & action'],
    ['moneyeyes', 'moneyeyes', 'Money eyes', 'Money & action'],
    ['win', 'win', 'Winner', 'Money & action'],
    ['clover', 'clover', 'Lucky clover', 'Money & action'],
    ['an_burn_money', 'burnmoney', 'Burning money', 'Money & action'],
    ['an_burningbag', 'burningbag', 'Burning bag', 'Money & action'],
    ['an_nailbiter', 'nailbiter', 'Nail biter', 'Money & action'],
    ['an_timeout', 'timeout', 'Time out', 'Money & action'],
    ['an_getaway', 'getaway', 'Getaway', 'Money & action'],
    ['deadhorse', 'deadhorse', 'Beating a dead horse', 'Money & action'],
    ['paint_help', 'help', 'Help!', 'Money & action'],
    ['an_arsed', 'arsed', "Can't be arsed", 'Money & action'],
    ['an_popcorn', 'popcorn', 'Popcorn', 'Money & action'],

    /* ---- Beefs & beatdowns ---- */
    ['an_punch', 'punch', 'Punch', 'Beefs & beatdowns'],
    ['an_slap', 'slap', 'Slap', 'Beefs & beatdowns'],
    ['an_smash', 'smash', 'Smash', 'Beefs & beatdowns'],
    ['an_beatup', 'beatup', 'Beatdown', 'Beefs & beatdowns'],
    ['an_brick', 'brick', 'Brick', 'Beefs & beatdowns'],
    ['an_bomb', 'bomb', 'Bomb', 'Beefs & beatdowns'],
    ['an_cannon', 'cannon', 'Cannon', 'Beefs & beatdowns'],
    ['an_fight', 'fight', 'Fight', 'Beefs & beatdowns'],
    ['an_boxing', 'boxing', 'Boxing', 'Beefs & beatdowns'],
    ['an_hammer', 'hammer', 'Hammer', 'Beefs & beatdowns'],
    ['an_blowhorn', 'blowhorn', 'Blow horn', 'Beefs & beatdowns'],
    ['fingershake', 'fingershake', 'Finger shake', 'Beefs & beatdowns'],
    ['an_police', 'police', 'Police', 'Beefs & beatdowns'],
    ['an_policeman', 'policeman', 'Policeman', 'Beefs & beatdowns'],
    ['an_ref', 'ref', 'Referee', 'Beefs & beatdowns'],

    /* ---- Sports ---- */
    ['thefootball', 'football', 'Football', 'Sports'],
    ['football_c1', 'footballc', 'Football spin', 'Sports'],
    ['thebasketball', 'basketball', 'Basketball', 'Sports'],
    ['basketball_c1', 'basketballc', 'Basketball spin', 'Sports'],
    ['thebaseball', 'baseball', 'Baseball', 'Sports'],
    ['puck', 'puck', 'Hockey puck', 'Sports'],
    ['soccerball', 'soccer', 'Soccer ball', 'Sports'],
    ['an_soccerhead', 'soccerhead', 'Header', 'Sports'],
    ['golfball', 'golf', 'Golf ball', 'Sports'],
    ['tennisball', 'tennis', 'Tennis ball', 'Sports'],
    ['bowling', 'bowling', 'Bowling', 'Sports'],
    ['an_horse', 'horse', 'Horse racing', 'Sports'],
    ['poker', 'poker', 'Poker', 'Sports'],
    ['flag', 'flag', 'Checkered flag', 'Sports'],

    /* ---- Thread tags ---- */
    ['goodpost', 'goodpost', 'Good post', 'Thread tags'],
    ['goodthread', 'goodthread', 'Good thread', 'Thread tags'],
    ['welcome', 'welcome', 'Welcome', 'Thread tags'],
    ['att_please', 'attention', 'Attention please', 'Thread tags'],
    ['offtopic', 'offtopic', 'Off topic', 'Thread tags'],
    ['closed', 'closed', 'Closed', 'Thread tags'],
    ['admin', 'admin', 'Admin', 'Thread tags'],
    ['thejester', 'jester', 'Jester', 'Thread tags'],

    /* ---- Big emoji ---- */
    ['new_moj_smile', 'nsmile', 'Smile', 'Big emoji'],
    ['new_pleased', 'pleased', 'Pleased', 'Big emoji'],
    ['new_wink_grin', 'winkgrin', 'Wink grin', 'Big emoji'],
    ['new_moj_wink', 'nwink', 'Wink', 'Big emoji'],
    ['new_tounge_wink', 'tonguewink', 'Tongue wink', 'Big emoji'],
    ['new_emoj_tounge', 'ntongue', 'Tongue', 'Big emoji'],
    ['new_laugh_cry', 'laughcry', 'Laughing to tears', 'Big emoji'],
    ['new_laugh_sweat', 'laughsweat', 'Laugh sweat', 'Big emoji'],
    ['new_heart_eyes', 'hearteyes', 'Heart eyes', 'Big emoji'],
    ['new_heart_eyes2', 'hearteyes2', 'Heart eyes 2', 'Big emoji'],
    ['new_heart_eyes3', 'hearteyes3', 'Heart eyes 3', 'Big emoji'],
    ['new_kiss_heart', 'kissheart', 'Kiss heart', 'Big emoji'],
    ['new_cool', 'ncool', 'Cool shades', 'Big emoji'],
    ['new_angel', 'nangel', 'Angel', 'Big emoji'],
    ['new_devil', 'devil', 'Devil', 'Big emoji'],
    ['new_confused', 'nconfused', 'Confused', 'Big emoji'],
    ['new_nervous', 'nervous', 'Nervous', 'Big emoji'],
    ['new_jaw_drop', 'jawdrop', 'Jaw drop', 'Big emoji'],
    ['new_moj_wow', 'nwow', 'Wow', 'Big emoji'],
    ['new_smh', 'smh', 'SMH', 'Big emoji'],
    ['new_unpleased', 'unpleased', 'Unpleased', 'Big emoji'],
    ['new_moj_upset', 'nupset', 'Upset', 'Big emoji'],
    ['new_moj_angry', 'nangry', 'Angry', 'Big emoji'],
    ['new_moj_sad', 'nsad', 'Sad', 'Big emoji'],
    ['new_sad_cry', 'sadcry', 'Sad cry', 'Big emoji'],
    ['new_heavy_cry', 'heavycry', 'Heavy cry', 'Big emoji'],
    ['new_sad_sweat', 'sadsweat', 'Sad sweat', 'Big emoji'],
    ['new_bleak', 'bleak', 'Bleak', 'Big emoji'],
    ['new_sick', 'sick', 'Sick', 'Big emoji'],
    ['new_dead', 'dead', 'Dead', 'Big emoji'],
    ['new_sleep_drool', 'drool', 'Sleep drool', 'Big emoji'],
    ['new_poop', 'poop', 'Poop', 'Big emoji']
  ];

  var GROUPS = [];
  var byCode = {};
  LIST.forEach(function (s) {
    byCode[s[1]] = s;
    if (GROUPS.indexOf(s[3]) === -1) GROUPS.push(s[3]);
  });

  // Longest-first alternation so :cheers2: never matches :cheers: first.
  var codes = Object.keys(byCode).sort(function (a, b) { return b.length - a.length; });
  var RE = new RegExp(':(' + codes.join('|') + '):', 'g');

  function url(file) { return BASE + file + '.gif'; }

  // Input must already be HTML-escaped; the output is safe HTML.
  function toHtml(escapedText) {
    return String(escapedText == null ? '' : escapedText).replace(RE, function (m, code) {
      var s = byCode[code];
      if (!s) return m;
      return '<img class="tmr-smilie" src="' + url(s[0]) + '" alt=":' + code + ':" title="' + s[2] + '" loading="lazy">';
    });
  }

  window.TMRSmilies = { LIST: LIST, GROUPS: GROUPS, byCode: byCode, url: url, toHtml: toHtml, BASE: BASE };
})();
