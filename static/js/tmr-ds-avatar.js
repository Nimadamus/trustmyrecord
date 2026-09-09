/* =============================================================================
   TrustMyRecord — MEMBER IDENTITY / AVATAR RESOLVER  (tmr-ds-avatar.js)
   -----------------------------------------------------------------------------
   ONE definition of what a member looks like, for every surface on the site.

   Resolution order, and there is only one:

     1. uploaded avatar        (user.avatar_url)
     2. favourite-team LOGO    (the member's first favourite team: the club's own
                                mark, centred on a light disc ringed in the club's
                                colour. A team with no mark — a tennis player, an
                                unmapped program — keeps the lettered TMR badge
                                built from the club's colours and abbreviation.)
     3. neutral member mark    (no picture and no favourite team. 2026-09-07:
                                this step used to print the member's two
                                letters; it now draws a plain silhouette on the
                                same white disc the club marks sit on, so the
                                only lettering left anywhere in the avatar
                                system is a CLUB abbreviation.)

   The team mark is a FALLBACK ONLY. An uploaded picture always wins and nothing
   here ever writes to one.

   ABSOLUTE RULE: no member renders blank, anywhere. Two things enforce it:

     * components call TMRAvatar.html() / .src() / .paint() and get a face back
       unconditionally, and
     * a repair pass (scan()) finds avatar slots that were left empty by older
       markup — an empty circle, a broken <img>, a default-avatar.png that does
       not exist — and paints the member's real identity into them. Everything
       it touches is an avatar slot that was ALREADY blank, so it can only
       improve what is on screen.

   The team badge needs data the browser does not have in most list payloads, so
   where only a username or id is known the face is layered: the deterministic
   initials paint immediately (no request, no flash of nothing), and the API's
   own avatar route — which resolves the same three steps server-side — is
   loaded over it. If it never arrives, the initials stay.

   MIRROR: utils/avatarIdentity.js + services/teamIdentity.js in the backend
   implement the same three steps with the same hash, palette, geometry and
   escaping. Change one, change the other, or a member's face changes depending
   on which layer drew it.

   Created Sep 5, 2026.
   ============================================================================= */
(function () {
  'use strict';
  if (window.TMRAvatar) return;

  function apiBase() {
    var base;
    try { base = (window.api && window.api.baseUrl) ? String(window.api.baseUrl) : null; } catch (e) { base = null; }
    if (!base) base = window.TMR_API_BASE || window.API_BASE_URL || 'https://trustmyrecord-api.onrender.com';
    return String(base).replace(/\/+$/, '').replace(/\/api$/, '');
  }

  /* --- deterministic primitives (mirrored in the backend) ----------------- */

  function hashString(value) {
    var h = 5381;
    var s = String(value == null ? '' : value);
    for (var i = 0; i < s.length; i += 1) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return h >>> 0;
  }

  var PALETTE = [
    ['#1D4ED8', '#60A5FA'], ['#0F766E', '#5EEAD4'], ['#B91C1C', '#FCA5A5'],
    ['#6D28D9', '#C4B5FD'], ['#C2410C', '#FDBA74'], ['#0E7490', '#67E8F9'],
    ['#15803D', '#86EFAC'], ['#A16207', '#FDE68A'], ['#BE123C', '#FDA4AF'],
    ['#334155', '#94A3B8'], ['#4338CA', '#A5B4FC'], ['#065F46', '#6EE7B7']
  ];

  /* Two-letter mark. Splits on separators AND camel-case humps:
       makaveli66 -> MA, Firelink -> FI, MoneyMakers -> MM, fade_my_picks -> FM */
  function initialsFor(displayName, username) {
    var source = '';
    var candidates = [displayName, username];
    for (var i = 0; i < candidates.length; i += 1) {
      var v = String(candidates[i] == null ? '' : candidates[i]).trim();
      if (/[A-Za-z0-9]/.test(v)) { source = v; break; }
    }
    var words = source.replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(/[^A-Za-z0-9]+/).filter(Boolean);
    if (!words.length) return 'TM';
    if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
    var w = words[0];
    var two = w.slice(0, 2).toUpperCase();
    return two.length === 2 ? two : (two + two).slice(0, 2);
  }

  function parseHex(hex) {
    var h = String(hex || '').replace('#', '');
    if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
    var n = parseInt(h, 16);
    if (h.length !== 6 || isNaN(n)) return { r: 29, g: 78, b: 216 };
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function toHex(c) {
    return '#' + [c.r, c.g, c.b].map(function (v) {
      var x = Math.max(0, Math.min(255, Math.round(v))).toString(16);
      return x.length === 1 ? '0' + x : x;
    }).join('');
  }

  function mix(hex, target, amount) {
    var c = parseHex(hex);
    var t = parseHex(target);
    return toHex({
      r: c.r + (t.r - c.r) * amount,
      g: c.g + (t.g - c.g) * amount,
      b: c.b + (t.b - c.b) * amount
    });
  }

  function luminance(hex) {
    var c = parseHex(hex);
    function chan(v) { var s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); }
    return 0.2126 * chan(c.r) + 0.7152 * chan(c.g) + 0.0722 * chan(c.b);
  }

  function inkFor(hex) { return luminance(hex) > 0.45 ? '#0B1220' : '#FFFFFF'; }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* --- identity ----------------------------------------------------------- */

  /* A row may carry the server-resolved identity (the homepage competition card
     and the profile payload both do, as `avatar`), in which case it is used
     verbatim — that is the only place a favourite-team badge can come from
     without a request. Otherwise the deterministic initials treatment. */
  function identity(user) {
    var u = user || {};
    var username = u.username || u.user_username || u.name || '';
    var display = u.display_name || u.displayName || '';
    var uploaded = u.avatar_url || u.avatarUrl || u.user_avatar || u.avatar || '';
    if (uploaded && typeof uploaded === 'object') uploaded = '';
    var mark = initialsFor(display, username);

    var server = u.avatar && typeof u.avatar === 'object' ? u.avatar : null;
    if (server && server.primary) {
      return {
        seed: u.id != null ? String(u.id) : (u.user_id != null ? String(u.user_id) : username),
        sports: Array.isArray(u.favorite_sports) ? u.favorite_sports
          : (Array.isArray(u.favoriteSports) ? u.favoriteSports : []),
        kind: server.kind || (server.logo ? 'team-logo' : 'team'),
        initials: mark,
        mark: server.mark || mark,
        team: server.team || null,
        /* The club mark, when the payload carries one. Where it does, the face
           is drawn from it directly: one request per CLUB that the browser then
           has cached for every other member who supports the same club, rather
           than one per member through the API's avatar route. */
        logo: (!uploaded && server.logo) ? String(server.logo) : null,
        primary: server.primary,
        secondary: server.secondary || mix(server.primary, '#FFFFFF', 0.4),
        ink: server.ink || inkFor(server.primary),
        src: uploaded ? String(uploaded) : null,
        username: username
      };
    }

    var pair = PALETTE[hashString(String(username || mark).toLowerCase()) % PALETTE.length];
    return {
      /* The portrait's seed and kit. The id is preferred because it never
         changes; a username can be edited and that would reroll the face. */
      seed: u.id != null ? String(u.id) : (u.user_id != null ? String(u.user_id) : username),
      sports: Array.isArray(u.favorite_sports) ? u.favorite_sports
        : (Array.isArray(u.favoriteSports) ? u.favoriteSports : []),
      kind: uploaded ? 'upload' : 'initials',
      initials: mark,
      mark: mark,
      team: null,
      logo: null,
      primary: pair[0],
      secondary: pair[1],
      ink: inkFor(pair[0]),
      src: uploaded ? String(uploaded) : null,
      username: username
    };
  }

  /* The disc a club mark sits on: white, ringed in the club's colour, and
     deliberately WITHOUT lettering. It is what shows through the transparent
     parts of the mark and for the moment before the mark itself loads, so an
     abbreviation printed here would read straight through the logo.
     Same geometry as the backend's avatarLogoSvg(). */
  function discSvg(id, size) {
    var px = Number(size) > 0 ? Number(size) : 96;
    var ring = (id && id.primary) || '#1D4ED8';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="' + px + '" height="' + px + '" role="img" aria-label="' + esc((id && id.team) || 'Team') + '">'
      + '<circle cx="50" cy="50" r="50" fill="#FFFFFF"/>'
      + '<circle cx="50" cy="50" r="48.2" fill="none" stroke="' + ring + '" stroke-opacity=".9" stroke-width="3.6"/>'
      + '</svg>';
  }

  /* The neutral member face: no picture, no favourite team. Same white disc
     and ring as the club-mark face above, so a row of them sits at exactly the
     same size and weight as a row of club logos, and deliberately WITHOUT
     lettering - the two-letter tile cut out of a username is the thing this
     step exists to stop drawing. Head circle plus shoulder dome, both inside
     r=48 so nothing crosses the ring, and no clipPath: this markup is also
     inlined into pages, where duplicate clip ids collide.
     Same bytes as the backend's avatarNeutralSvg(). */
  /* ================= ASSIGNED PORTRAITS (2026-09-08) ==================
     The grey silhouette below used to be ONE picture shared by all 89 members
     with no photo, so a leaderboard of twenty read as one account twenty times.
     Every faceless member now gets their own generated fan instead: a face, a
     haircut and their league's kit, seeded off their user id so it never
     changes and follows them across every surface.

     This is the browser copy of the API's utils/avatarPortrait.js and the two
     must stay in step - a member has to wear the same face whether the picture
     came from the avatar route or was drawn here while it loaded. */
  
  
  /* FNV-1a, then a mix per field, so two members who collide on hair do not also
     collide on everything else. */
  function pHash(value) {
    var h = 0x811c9dc5;
    var s = String(value == null ? '' : value);
    for (var i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h >>> 0;
  }
  
  function pDraw(seed, salt, n) {
    var h = (seed ^ pHash(salt)) >>> 0;
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
    h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0;
    h = (h ^ (h >>> 15)) >>> 0;
    return h % n;
  }
  
  function pPick(seed, salt, arr) { return arr[pDraw(seed, salt, arr.length)]; }
  
  /* Wide on hue on purpose: a board of forty must not read as one colour. */
  var KIT_PALETTES = [
    ['#E23D4B', '#FFFFFF'], ['#1D6FE0', '#F2F5FA'], ['#17A673', '#F2F7F4'],
    ['#F2A63D', '#20160A'], ['#8B5CF6', '#F4F1FB'], ['#E0448E', '#FFF3F8'],
    ['#0EA5B7', '#F0FBFC'], ['#D6482B', '#FFF4F0'], ['#4C6EF5', '#F3F5FF'],
    ['#65A30D', '#F7FBEF'], ['#C026A3', '#FDF2FA'], ['#0891B2', '#EFFAFC'],
    ['#EA580C', '#FFF6F0'], ['#7C3AED', '#F6F2FE'], ['#059669', '#F0FBF6'],
    ['#DB2777', '#FFF2F7'], ['#2563EB', '#F1F5FF'], ['#B45309', '#FFF8EE'],
    ['#DC2626', '#FFF3F3'], ['#0D9488', '#EFFAF8'], ['#4338CA', '#F2F2FE'],
    ['#9A3412', '#FFF5EF'], ['#166534', '#F0FAF2'], ['#701A75', '#FBF0FB'],
  ];
  
  var SKIN = ['#F4CCA6', '#EBB78D', '#DA9E70', '#BC8052', '#946039', '#70472A', '#F8DCC0', '#A9713F'];
  var HAIR = ['#191512', '#3A2417', '#6B4423', '#A9702F', '#C9A227', '#DAD7D2', '#7E1F1F', '#2C3A50'];
  
  /* A member's sports come back as free text from the fan-identity editor, so map
     loosely rather than exactly. The kit archetype is what the drawing needs. */
  var LEAGUE_KIT = {
    mlb: 'baseball', baseball: 'baseball',
    nfl: 'football', ncaaf: 'football', football: 'football', cfb: 'football',
    nba: 'basketball', ncaab: 'basketball', basketball: 'basketball', cbb: 'basketball', wnba: 'basketball',
    nhl: 'hockey', hockey: 'hockey',
    soccer: 'soccer', mls: 'soccer', epl: 'soccer', football_eu: 'soccer',
    ufc: 'combat', mma: 'combat', boxing: 'combat',
    tennis: 'tennis',
    golf: 'golf', pga: 'golf',
    f1: 'motor', nascar: 'motor', motorsport: 'motor',
  };
  
  function pKitFor(sports) {
    var list = Array.isArray(sports) ? sports : (sports ? [sports] : []);
    for (var i = 0; i < list.length; i += 1) {
      var key = String(list[i] || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
      if (LEAGUE_KIT[key]) return LEAGUE_KIT[key];
    }
    return '';
  }
  
  function pEsc(s) {
    var map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return map[c]; });
  }
  
  function pClamp(v) { return Math.max(0, Math.min(255, Math.round(v))); }
  
  function pShade(hex, amount) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
    if (!m) return amount < 0 ? '#101623' : '#8FA0B5';
    var n = parseInt(m[1], 16);
    var target = amount < 0 ? 0 : 255;
    var k = Math.abs(amount);
    var r = pClamp((n >> 16 & 255) + (target - (n >> 16 & 255)) * k);
    var g = pClamp((n >> 8 & 255) + (target - (n >> 8 & 255)) * k);
    var b = pClamp((n & 255) + (target - (n & 255)) * k);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }
  
  /* ------------------------------------------------------------------ the kit */
  /* Drawn BEFORE the head, so the shoulders sit behind the jaw. Every archetype
     fills the same footprint, so the face lands in the same place whichever sport
     a member follows and a row of mixed leagues still lines up. */
  function pKit(kit, seed, primary, secondary) {
    var dark = pShade(primary, -0.45);
    var body = 'M12 100c0-21 17-33 38-33s38 12 38 33z';
    var out = '';
  
    if (kit === 'basketball') {
      // Sleeveless: the shoulders are skin, so the vest is narrow.
      out += '<path d="M16 100c2-16 12-26 24-30 6 5 14 5 20 0 12 4 22 14 24 30z" fill="' + primary + '"/>';
      out += '<path d="M37 71c4 4 22 4 26 0l2 3c-7 6-23 6-30 0z" fill="' + secondary + '" opacity=".9"/>';
      return out;
    }
  
    out += '<path d="' + body + '" fill="' + primary + '"/>';
  
    if (kit === 'baseball') {
      var stripes = pDraw(seed, 'pin', 2);
      if (stripes) {
        for (var i = 0; i < 7; i += 1) {
          out += '<rect x="' + (16 + i * 10) + '" y="70" width="1.8" height="30" fill="' + secondary + '" opacity=".7"/>';
        }
      }
      out += '<path d="M40 68h20l-10 15z" fill="' + secondary + '"/>';
      out += '<rect x="47" y="68" width="6" height="32" fill="' + secondary + '" opacity=".55"/>';
    } else if (kit === 'football') {
      /* PADS, NOT A HELMET (2026-09-08). The first draft put a full helmet on
         these members and it covered the entire face, so a football fan rendered
         as a featureless coloured dome - worse than the silhouette this replaces.
         The sport reads off the SHOULDERS, which is how you tell it apart anyway:
         square, wide, and darker at the caps. */
      out += '<path d="M8 100c0-20 18-31 42-31s42 11 42 31z" fill="' + primary + '"/>';
      out += '<path d="M8 100c0-9 4-16 10-21l6 21zM92 100c0-9-4-16-10-21l-6 21z" fill="' + dark + '"/>';
      out += '<path d="M41 69h18l-9 12z" fill="' + secondary + '"/>';
      out += '<rect x="20" y="86" width="60" height="5" fill="' + secondary + '" opacity=".7"/>';
    } else if (kit === 'hockey') {
      /* A sweater: shoulder yoke and two hem bands. The first draft swept a wide
         arc across the chest and it read as a steering wheel, not a jersey. */
      out += '<path d="M12 100c0-21 17-33 38-33s38 12 38 33z" fill="' + primary + '"/>';
      out += '<path d="M26 70c7-3 41-3 48 0 4 3 7 7 9 11H17c2-4 5-8 9-11z" fill="' + secondary + '" opacity=".9"/>';
      out += '<rect x="13" y="90" width="74" height="4" fill="' + secondary + '" opacity=".75"/>';
      out += '<path d="M41 68h18l-9 11z" fill="' + pShade(primary, -0.4) + '"/>';
    } else if (kit === 'soccer') {
      out += '<path d="M38 68h24l-12 14z" fill="' + secondary + '"/>';
      out += '<path d="M30 71c-4 2-7 5-10 8l7 6zM70 71c4 2 7 5 10 8l-7 6z" fill="' + secondary + '" opacity=".8"/>';
      if (pDraw(seed, 'hoop', 2)) {
        out += '<rect x="12" y="86" width="76" height="7" fill="' + secondary + '" opacity=".65"/>';
      }
    } else if (kit === 'combat') {
      // A hood, not a jersey: nobody fights in a shirt.
      out += '<path d="M12 100c0-21 17-33 38-33s38 12 38 33z" fill="' + dark + '"/>';
      out += '<path d="M33 69c5 8 29 8 34 0 5 3 8 7 10 11-8 8-46 8-54 0 2-4 5-8 10-11z" fill="' + primary + '"/>';
    } else if (kit === 'tennis' || kit === 'golf') {
      out += '<path d="M42 68h16l-8 6z" fill="' + secondary + '"/>';
      out += '<path d="M43 68l-3 22h4l3-22zM57 68l3 22h-4l-3-22z" fill="' + secondary + '" opacity=".8"/>';
      out += '<circle cx="50" cy="88" r="1.8" fill="' + secondary + '"/>';
    } else if (kit === 'motor') {
      // A race suit: high collar, shoulder banding, zip. Not a hood.
      out += '<path d="M12 100c0-21 17-33 38-33s38 12 38 33z" fill="' + dark + '"/>';
      out += '<path d="M36 67h28c2 3 3 6 3 9H33c0-3 1-6 3-9z" fill="' + primary + '"/>';
      out += '<rect x="47" y="76" width="6" height="24" fill="' + secondary + '" opacity=".85"/>';
      out += '<rect x="14" y="88" width="72" height="5" fill="' + primary + '" opacity=".9"/>';
    } else {
      /* No sport on file: a club jacket. The placket is narrow on purpose - the
         first draft ran a wide bar up the chest and it out-shouted the face at
         32px, which is the size that matters. */
      out += '<path d="M48.5 70h3v30h-3z" fill="' + secondary + '" opacity=".75"/>';
      out += '<path d="M39 69l11 8 11-8-4-2-7 5-7-5z" fill="' + secondary + '" opacity=".9"/>';
    }
    return out;
  }
  
  /* Headwear goes over the hair, so it is drawn after the face. */
  function pHeadwear(kit, seed, primary, secondary) {
    var dark = pShade(primary, -0.35);
    if (kit === 'baseball' || kit === 'golf') {
      return '<path d="M27 38c0-13 10-21 23-21s23 8 23 21z" fill="' + primary + '"/>'
        + '<path d="M73 36h12c2 0 3 2 2 4-2 3-8 5-14 5z" fill="' + dark + '"/>'
        + '<circle cx="50" cy="18" r="2.6" fill="' + secondary + '"/>';
    }
    /* NO HELMETS. A football or hockey helmet covers the whole head, and the
       entire point of this system is that a board of fifty reads as fifty
       different people. Those sports are carried by the shoulders instead. */
    if (kit === 'tennis') {
      return '<rect x="29" y="33" width="42" height="7" rx="3.5" fill="' + primary + '"/>'
        + '<rect x="29" y="33" width="42" height="3" rx="1.5" fill="' + secondary + '" opacity=".8"/>';
    }
    return '';
  }
  
  /* --------------------------------------------------------------- the person */
  function portraitSvg(seedValue, options) {
    var opts = options || {};
    var seed = typeof seedValue === 'number' ? (seedValue >>> 0) : pHash(seedValue);
    var kit = pKitFor(opts.sports);
  
    var pair = opts.primary && opts.secondary
      ? [opts.primary, opts.secondary]
      : pPick(seed, 'kitpal', KIT_PALETTES);
    var primary = pair[0];
    var secondary = pair[1];
  
    var skin = pPick(seed, 'skin', SKIN);
    var hair = pPick(seed, 'haircolor', HAIR);
    var hairStyle = pDraw(seed, 'hairstyle', 8);
    var beard = pDraw(seed, 'beard', 5);
    var brow = pDraw(seed, 'brow', 3);
    var headwear = pHeadwear(kit, seed, primary, secondary);
    var ground = pShade(primary, -0.62);
    var px = Number(opts.size) > 0 ? Number(opts.size) : 96;
    var label = opts.label ? pEsc(opts.label) : 'TrustMyRecord member';
  
    var g = '';
    g += '<circle cx="50" cy="50" r="50" fill="' + ground + '"/>';
    g += '<path d="M0 50a50 50 0 0 1 100 0Z" fill="#FFFFFF" opacity=".06"/>';
    g += pKit(kit, seed, primary, secondary);
  
    // neck, ears, head
    g += '<path d="M42 56h16v14H42z" fill="' + pShade(skin, -0.18) + '"/>';
    g += '<ellipse cx="29" cy="46" rx="4.2" ry="6" fill="' + skin + '"/>';
    g += '<ellipse cx="71" cy="46" rx="4.2" ry="6" fill="' + skin + '"/>';
    g += '<ellipse cx="50" cy="44" rx="20.5" ry="23.5" fill="' + skin + '"/>';
  
    // Hair always shows: the only headwear left is a cap or a headband.
    var capped = kit === 'baseball' || kit === 'golf';
    if (!capped || pDraw(seed, 'longhair', 2) === 1) {
      if (hairStyle === 0) g += '<path d="M29 41c0-14 9-23 21-23s21 9 21 23c-1-8-9-12-21-12s-20 4-21 12z" fill="' + hair + '"/>';
      if (hairStyle === 1) g += '<path d="M28 45c-1-19 9-28 22-28s23 9 22 28c-2-7-4-15-9-17-6 4-21 5-27 1-3 3-6 9-8 16z" fill="' + hair + '"/>';
      if (hairStyle === 2) g += '<ellipse cx="50" cy="27" rx="21.5" ry="15" fill="' + hair + '"/><ellipse cx="32" cy="40" rx="6" ry="9.5" fill="' + hair + '"/><ellipse cx="68" cy="40" rx="6" ry="9.5" fill="' + hair + '"/>';
      if (hairStyle === 3) g += '<path d="M28 43c0-17 10-25 22-25s22 8 22 25v23h-7V45c-7 3-23 3-30-1v21h-7z" fill="' + hair + '"/>';
      if (hairStyle === 4) g += '<path d="M31 38c2-13 10-20 19-20s17 7 19 20c-4-6-9-9-19-9s-15 3-19 9z" fill="' + hair + '"/><circle cx="50" cy="13" r="7" fill="' + hair + '"/>';
      if (hairStyle === 5) g += '<path d="M27 47c0-20 10-30 23-30s23 10 23 30c0-12-10-17-23-17s-23 5-23 17z" fill="' + hair + '"/>';
      if (hairStyle === 6) g += '<path d="M30 40c1-13 9-22 20-22s19 9 20 22c-3-5-6-9-10-11-4 5-20 6-26 2-2 2-3 6-4 9z" fill="' + hair + '"/>';
      // 7 is bald, and stays bald.
    }
  
    // brows, eyes, mouth
    var browY = brow === 0 ? 39.5 : (brow === 1 ? 38.5 : 40.5);
    g += '<rect x="36" y="' + browY + '" width="9.5" height="2.4" rx="1.2" fill="' + (hairStyle === 7 ? HAIR[0] : hair) + '"/>';
    g += '<rect x="54.5" y="' + browY + '" width="9.5" height="2.4" rx="1.2" fill="' + (hairStyle === 7 ? HAIR[0] : hair) + '"/>';
    g += '<ellipse cx="41" cy="46.5" rx="2.7" ry="3.1" fill="#20262E"/>';
    g += '<ellipse cx="59" cy="46.5" rx="2.7" ry="3.1" fill="#20262E"/>';
    g += '<circle cx="41.9" cy="45.6" r="0.9" fill="#FFFFFF" opacity=".85"/>';
    g += '<circle cx="59.9" cy="45.6" r="0.9" fill="#FFFFFF" opacity=".85"/>';
  
    var mouth = '<path d="M44 56.5c3 2.6 9 2.6 12 0" stroke="' + pShade(skin, -0.55) + '" stroke-width="2.2" fill="none" stroke-linecap="round"/>';
    if (beard === 0) g += mouth;
    if (beard === 1) { // stubble
      g += '<path d="M31 47c1 13 9 21 19 21s18-8 19-21c2 13-5 24-19 24s-21-11-19-24z" fill="' + hair + '" opacity=".26"/>' + mouth;
    }
    if (beard === 2) { // full beard
      g += '<path d="M30 45c0 17 9 26 20 26s20-9 20-26c2 19-6 31-20 31s-22-12-20-31z" fill="' + hair + '"/>';
      g += '<path d="M44 57c3 2 9 2 12 0" stroke="' + pShade(hair, -0.4) + '" stroke-width="2" fill="none" stroke-linecap="round"/>';
    }
    if (beard === 3) { // moustache
      g += '<path d="M42 53.5h16c0 3.6-3.6 5.2-8 5.2s-8-1.6-8-5.2z" fill="' + hair + '"/>' + mouth;
    }
    if (beard === 4) { // goatee
      g += mouth + '<path d="M44 61h12c0 5-2.6 8-6 8s-6-3-6-8z" fill="' + hair + '"/>';
    }
  
    g += headwear;
    // one ring, so the face reads as an avatar and not as a sticker
    g += '<circle cx="50" cy="50" r="48.4" fill="none" stroke="' + pShade(primary, 0.25) + '" stroke-opacity=".42" stroke-width="3.2"/>';
  
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="' + px + '" height="' + px
      + '" role="img" aria-label="' + label + '">' + g + '</svg>';
  }
  
  function portraitDataUri(seedValue, options) {
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(portraitSvg(seedValue, options));
  }
  
  
  

  function neutralSvg(size, id) {
    var i = id || {};
    return portraitSvg(i.seed || i.username || 'tmr', {
      size: size,
      sports: i.sports,
      primary: i.logo ? i.primary : null,
      secondary: i.logo ? i.secondary : null,
      label: i.username ? i.username + ' avatar' : 'TrustMyRecord member'
    });
  }

  /* The badge. Same geometry as the backend's avatarSvg(). */
  function svg(id, size) {
    id = id || {};
    if (id.logo) return discSvg(id, size);
    /* Lettering is a CLUB abbreviation or nothing. No resolved team means the
       neutral mark, never the member's initials. */
    /* NO_LETTERS_WITHOUT_A_REAL_CLUB_20260907: favourite teams are free text, so
       a badge also needs a club that is in the logo map. Without this, 84Donkey's
       "LaoAngelaRam" drew a "LAO" tile and Leslie's "DoBronx" a "DOB" - initials
       by any other name. Mirrors utils/avatarIdentity.js avatarSvg(). */
    if (!id.team || !id.logo) return neutralSvg(size, id);
    var mark = String(id.mark || id.initials || 'TM').slice(0, 3);
    var primary = id.primary || '#1D4ED8';
    var secondary = id.secondary || '#60A5FA';
    var ink = id.ink || inkFor(primary);
    var font = mark.length >= 3 ? 34 : 41;
    var px = Number(size) > 0 ? Number(size) : 96;
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="' + px + '" height="' + px + '" role="img" aria-label="' + esc(mark) + '">'
      + '<circle cx="50" cy="50" r="50" fill="' + primary + '"/>'
      + '<path d="M0 50a50 50 0 0 1 100 0Z" fill="#FFFFFF" opacity=".12"/>'
      + '<path d="M0 50a50 50 0 0 0 100 0Z" fill="#000000" opacity=".16"/>'
      + '<circle cx="50" cy="50" r="45.5" fill="none" stroke="' + secondary + '" stroke-opacity=".85" stroke-width="3.5"/>'
      + '<text x="50" y="50" text-anchor="middle" dominant-baseline="central" fill="' + ink + '"'
      + ' font-family="Inter,\'Segoe UI\',system-ui,-apple-system,Helvetica,Arial,sans-serif"'
      + ' font-size="' + font + '" font-weight="800" letter-spacing="1">' + esc(mark) + '</text>'
      + '</svg>';
  }

  function dataUri(idOrUser, size) {
    var id = idOrUser && idOrUser.primary ? idOrUser : identity(idOrUser);
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg(id, size));
  }

  /* The best image URL available for a member: their upload, else the API's own
     avatar route (which resolves upload -> team badge -> initials server-side),
     else the generated badge itself. */
  function src(user) {
    var u = user || {};
    var id = identity(u);
    if (id.src) return id.src;
    var key = u.id != null ? u.id : (u.user_id != null ? u.user_id : (id.username || ''));
    if (key !== '' && key != null) {
      return apiBase() + '/api/users/' + encodeURIComponent(key) + '/avatar';
    }
    return dataUri(id);
  }

  /* --- painting ----------------------------------------------------------- */

  /* The <img> that carries a club mark. CONTAINED and inset, never cropped to
     fill: a circle is the wrong shape for a badge, and a wordmark cropped to
     one loses half its letters. The inset is a percentage, so a 44px row
     avatar and a 120px profile header frame the mark identically and the
     mobile breakpoints need no rule of their own.

     The declarations are !important because several of the site's avatar slots
     carry their own `object-fit:cover` on the <img> in a stylesheet, and
     losing that race is what would crop the mark. */
  function markStyle(img) {
    var css = [
      ['width', '100%'], ['height', '100%'], ['object-fit', 'contain'],
      ['padding', '18%'], ['box-sizing', 'border-box'], ['display', 'block'],
      ['border-radius', '50%'], ['background', 'transparent']
    ];
    for (var i = 0; i < css.length; i += 1) {
      if (img.style.setProperty) img.style.setProperty(css[i][0], css[i][1], 'important');
      else img.style[css[i][0]] = css[i][1];
    }
    return img;
  }

  /* Put the club mark inside an avatar slot that is already showing the disc.
     Idempotent: a slot that is re-rendered and repaired again does not collect
     a second copy. If the mark 404s it is removed and the disc is what stays,
     which is still a face and still not blank. */
  function markInto(el, id) {
    if (!el || !id || !id.logo) return null;
    if (el.querySelector && el.querySelector('img[data-tmr-logo]')) return null;
    var img = document.createElement('img');
    img.setAttribute('data-tmr-logo', '1');
    img.alt = id.team || id.username || '';
    img.loading = 'lazy';
    markStyle(img);
    img.onerror = function () { if (img.parentNode) img.parentNode.removeChild(img); };
    img.src = id.logo;
    el.appendChild(img);
    return img;
  }

  /* Put a member's generated face onto an element as a background, so an empty
     circle in old markup becomes a real avatar without touching its layout. */
  function paint(el, user, opts) {
    if (!el) return null;
    var id = user && user.primary ? user : identity(user);
    var o = opts || {};
    /* !important, because several of the site's avatar slots carry their own
       !important gradient in a stylesheet. An inline important declaration is
       the only thing that beats an author important one, and losing that race
       is what turns a repaired slot back into a blank pastel square. */
    var bg = 'url("' + dataUri(id, o.size || 96) + '")';
    if (el.style.setProperty) {
      el.style.setProperty('background-image', bg, 'important');
      el.style.setProperty('background-size', 'cover', 'important');
      el.style.setProperty('background-position', 'center', 'important');
      el.style.setProperty('background-repeat', 'no-repeat', 'important');
      el.style.setProperty('background-color', 'transparent', 'important');
    } else {
      el.style.backgroundImage = bg;
      el.style.backgroundSize = 'cover';
      el.style.backgroundPosition = 'center';
      el.style.backgroundRepeat = 'no-repeat';
      el.style.backgroundColor = 'transparent';
    }
    /* Old markup often prints one letter inside the circle. The badge already
       carries the mark, so any such text is removed rather than double-printed. */
    if (!el.querySelector('img,svg,canvas,picture') && el.textContent && el.textContent.trim().length <= 3) el.textContent = '';
    if (!el.getAttribute('aria-label') && id.username) el.setAttribute('aria-label', id.username);
    el.setAttribute('data-tmr-av', id.kind || 'initials');
    return id;
  }

  /* A complete avatar element: the generated badge underneath, the member's
     real picture (or the API's resolution of it) over the top. Nothing here can
     produce an empty circle — if the image never loads the badge is what shows. */
  function html(user, opts) {
    var o = opts || {};
    var id = identity(user);
    var size = o.size || 40;
    var cls = 'tmr-av' + (o.className ? ' ' + o.className : '');
    var name = id.username || id.mark;
    var style = 'width:' + size + 'px;height:' + size + 'px;'
      + 'background-image:url(&quot;' + dataUri(id, Math.max(96, size * 2)).replace(/"/g, '&quot;') + '&quot;)';
    var img = id.logo
      ? '<img src="' + esc(id.logo) + '" alt="' + esc(id.team || name) + '" loading="lazy" data-tmr-logo="1" '
        + 'onerror="this.remove()">'
      : '<img src="' + esc(src(user)) + '" alt="' + esc(name) + '" loading="lazy" '
        + 'onerror="this.remove()">';
    return '<span class="' + cls + '" style="' + style + '" data-tmr-av="' + esc(id.kind) + '"'
      + (o.title === false ? '' : ' title="' + esc(name) + '"') + '>' + img + '</span>';
  }

  /* --- repair pass -------------------------------------------------------- */

  /* An element is an avatar slot if one of its classes ends in avatar/ava/avl.
     Deliberately structural rather than a hand-kept list of the site's 30-odd
     avatar class names, which would go stale the first time a component is
     added. */
  /* `avatar` anywhere in a class token counts, with or without a size or
     variant suffix: profile-avatar, profile-avatar-large, tmr-social-avatar--letter,
     comp-avl, v2nav-ava. The site names these things thirty different ways and
     a hand-kept list would go stale the first time a component is added. */
  /* `-av` JOINED THE LIST 2026-09-08. The homepage "Live on TMR" ticker names
     its slot tkact-av, which this pattern did not match, so the one component on
     the site still printing a two-letter tile was also the one component the
     repair pass could not see. Any class token ending in av/ava/avl counts now. */
  var AV_CLASS = /(^|[-_])avatar([-_]+[a-z0-9]+)*$|(^|[-_])(av|ava|avl)$/i;
  var SKIP_CLASS = /(skel|skeleton|loading|placeholder|uploader|upload-|-btn|button)/i;

  function isAvatarSlot(el) {
    if (!el || el.nodeType !== 1) return false;
    var cls = el.className;
    if (typeof cls !== 'string' || !cls) return false;
    if (SKIP_CLASS.test(cls)) return false;
    var parts = cls.split(/\s+/);
    for (var i = 0; i < parts.length; i += 1) if (AV_CLASS.test(parts[i])) return true;
    return false;
  }

  function isBusy(el) {
    var n = el;
    for (var i = 0; n && i < 6; i += 1) {
      if (n.getAttribute && (n.getAttribute('aria-busy') === 'true')) return true;
      if (n.className && typeof n.className === 'string' && /\bis-skel\b|\bskeleton\b/.test(n.className)) return true;
      n = n.parentElement;
    }
    return false;
  }

  /* Who is this slot for? Whatever the markup already says: an explicit
     data-username, the image's alt text, or the member link in the same row —
     /u/<username>/ is how every member is linked across the site. */
  function subjectFor(el) {
    var node = el;
    for (var i = 0; node && i < 5; i += 1) {
      var u = node.getAttribute && (node.getAttribute('data-username') || node.getAttribute('data-user'));
      if (u) return { username: u, id: node.getAttribute('data-user-id') || null };
      node = node.parentElement;
    }
    var img = el.tagName === 'IMG' ? el : el.querySelector('img[alt]');
    if (img && img.alt && img.alt.trim() && !/avatar/i.test(img.alt)) return { username: img.alt.trim(), id: null };
    /* The row around the slot names the member three different ways across the
       site: /u/<name>/, /profile/?user=<name>, and an @handle. All three are
       read, because a feed row and a leaderboard row do not agree. */
    var row = el.closest ? el.closest('li,tr,article,.row,div') : null;
    for (var j = 0; row && j < 4; j += 1) {
      var links = row.querySelectorAll('a[href]');
      for (var k = 0; k < links.length; k += 1) {
        var href = links[k].getAttribute('href') || '';
        var m = href.match(/\/u\/([^/?#]+)/) || href.match(/[?&](?:user|username|u)=([^&#]+)/);
        if (m) return { username: decodeURIComponent(m[1]), id: null };
      }
      var handle = row.querySelector('[class*="handle"]');
      if (handle && /^@\S{2,}/.test((handle.textContent || '').trim())) {
        return { username: handle.textContent.trim().replace(/^@/, ''), id: null };
      }
      var named = row.querySelector('[class*="username"],[class*="-name"]');
      if (named && (named.textContent || '').trim().length >= 2) {
        return { username: named.textContent.trim(), id: null };
      }
      row = row.parentElement;
    }
    /* A single letter inside the slot is the OLD placeholder, not a name.
       Reading it as one is how a member ends up as "FF" on their own profile
       while the homepage calls them "FI": treat 2+ characters as a name and
       nothing shorter. */
    var text = (el.textContent || '').trim();
    if (text.length >= 2) return { username: text, id: null };
    /* On a member's own page the URL is the most reliable name there is. */
    var onProfile = String(location.pathname || '').match(/^\/u\/([^/?#]+)/);
    if (onProfile) return { username: decodeURIComponent(onProfile[1]), id: null };
    return null;
  }

  function hasVisibleContent(el) {
    if (el.tagName === 'IMG') return !!(el.getAttribute('src') || '').trim();
    if (el.querySelector('img,svg,canvas,picture')) return true;
    if ((el.textContent || '').trim()) return true;
    var bg = '';
    try { bg = window.getComputedStyle(el).backgroundImage || ''; } catch (e) {}
    return !!(bg && bg !== 'none');
  }

  /* A blank avatar slot gets the member's real identity. Where a username is
     known the API's avatar route is layered over it, so an uploaded picture or
     a favourite-team badge replaces the initials as soon as it arrives. */
  /* A slot repaired once can be blanked again: several pages re-render their
     own markup after hydration and wipe whatever was in it. So "already done"
     is not a flag we trust — it is re-checked against what is actually on
     screen, and a slot that lost its face gets it back. */
  function stillPainted(el) {
    if (!el.getAttribute('data-tmr-av')) return false;
    if (el.tagName === 'IMG') return !!(el.getAttribute('src') || '').trim();
    if (el.querySelector('img,svg,canvas,picture')) return true;
    var bg = '';
    try { bg = window.getComputedStyle(el).backgroundImage || ''; } catch (e) {}
    return bg.indexOf('data:image/svg') !== -1;
  }

  function repair(el) {
    if (!el || stillPainted(el)) return;
    if (isBusy(el)) return;

    if (el.tagName === 'IMG') {
      var s = (el.getAttribute('src') || '').trim();
      /* A legacy letter tile is not a face either. Three components used to
         generate their own single-initial SVG data URI, each with its own
         palette, so one member had a different coloured letter on every page.
         Those are replaced; ours carries the Inter face and is left alone. */
      /* Our own neutral face carries no font name, so it is matched by name
         instead: without this it would read as a legacy tile and be repaired
         on every pass. */
      var legacyTile = s.indexOf('data:image/svg+xml') === 0
        && s.indexOf('Inter') === -1 && s.indexOf('TrustMyRecord') === -1;
      if (s && !legacyTile && !/default-avatar|placeholder|\/avatar-placeholder/.test(s)) return;
      var who = subjectFor(el);
      var id = identity({ username: who ? who.username : '', id: who ? who.id : null });
      el.setAttribute('data-tmr-av', id.kind);
      el.src = who ? src({ username: who.username, id: who.id }) : dataUri(id);
      el.style.backgroundImage = 'url("' + dataUri(id) + '")';
      el.style.backgroundSize = 'cover';
      el.onerror = function () { this.src = dataUri(id); this.onerror = null; };
      return;
    }

    if (hasVisibleContent(el)) {
      /* A slot whose entire content is an initial or two is the OLD
         placeholder, not a face: a flat letter tile, in whatever colour that
         particular component happened to invent. Those are exactly what this
         system replaces — one member had a different coloured letter on every
         page — so they are upgraded to the member's real identity. Anything
         holding an actual image is left alone. */
      var t = (el.textContent || '').trim();
      if (!(t && t.length <= 3 && !el.querySelector('img,svg,canvas,picture'))) return;
    }

    /* An avatar slot whose member cannot be identified at all still gets the
       TMR mark rather than a hole in the layout — blank is never the answer. */
    var subject = subjectFor(el);
    var ident = paint(el, { username: subject ? subject.username : '', id: subject ? subject.id : null });
    if (!subject) return;
    if (!ident) return;
    /* Where the row itself carried the member's club, the mark is loaded from
       the club's own URL: one request per CLUB for the whole page rather than
       one per member, and the browser already has most of them cached from the
       boards. Otherwise the API's avatar route resolves it, and answers the
       same disc-and-mark composition. */
    if (ident.logo) { markInto(el, ident); return; }
    var img = document.createElement('img');
    img.alt = subject.username;
    img.loading = 'lazy';
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:inherit;display:block';
    img.onerror = function () { if (img.parentNode) img.parentNode.removeChild(img); };
    img.src = src({ username: subject.username, id: subject.id });
    el.appendChild(img);
  }

  var SELECTOR = '[class*="avatar"],[class*="-av"],[class*="-ava"],[class*="-avl"],[data-tmr-avatar]';

  function repairIn(node) {
    if (!node || node.nodeType !== 1) return;
    if (node.matches && node.matches(SELECTOR) && (node.hasAttribute('data-tmr-avatar') || isAvatarSlot(node))) {
      try { repair(node); } catch (e) {}
    }
    var nodes;
    try { nodes = node.querySelectorAll(SELECTOR); } catch (e) { return; }
    for (var i = 0; i < nodes.length; i += 1) {
      var el = nodes[i];
      if (el.hasAttribute('data-tmr-avatar') || isAvatarSlot(el)) {
        try { repair(el); } catch (e) {}
      }
    }
  }

  function scan(root) {
    repairIn(root && root.nodeType === 1 ? root : document.documentElement);
  }

  /* A member's picture that 404s must never leave a hole: swap in their badge.
     Capture phase, because an <img> error does not bubble. */
  document.addEventListener('error', function (ev) {
    var el = ev.target;
    if (!el || el.tagName !== 'IMG' || el.getAttribute('data-tmr-av-fixed')) return;
    if (!isAvatarSlot(el) && !isAvatarSlot(el.parentElement || {})) return;
    el.setAttribute('data-tmr-av-fixed', '1');
    var who = subjectFor(el);
    el.src = dataUri(identity({ username: who ? who.username : (el.alt || '') }));
  }, true);

  var CSS = '.tmr-av{display:inline-flex;align-items:center;justify-content:center;'
    + 'border-radius:50%;overflow:hidden;flex:0 0 auto;background-size:cover;background-position:center;'
    + 'box-shadow:0 0 0 1px rgba(15,23,42,.08)}'
    + '.tmr-av img{width:100%;height:100%;object-fit:cover;display:block;border-radius:50%}'
    /* A club mark is contained and inset inside whatever circle it lands in,
       at every size and on every breakpoint, because the inset is a
       percentage of the frame rather than a pixel count. */
    + 'img[data-tmr-logo]{width:100%;height:100%;object-fit:contain;padding:18%;'
    + 'box-sizing:border-box;display:block;border-radius:50%;background:transparent}';

  function injectCss() {
    if (document.getElementById('tmr-av-css')) return;
    var s = document.createElement('style');
    s.id = 'tmr-av-css';
    s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }

  /* Only ever look at what actually arrived. The pages this runs on rewrite
     themselves constantly — a rotating ticker, a live feed, a board that
     repaints on every poll — so re-querying the whole document on every
     mutation is the difference between a repair pass nobody notices and a
     page that stutters. Work is queued idle and coalesced. */
  var queue = [];
  var pending = 0;
  function flush() {
    pending = 0;
    var batch = queue;
    queue = [];
    for (var i = 0; i < batch.length && i < 400; i += 1) repairIn(batch[i]);
  }
  function schedule(node) {
    if (node) queue.push(node);
    if (pending) return;
    pending = 1;
    if (window.requestIdleCallback) window.requestIdleCallback(flush, { timeout: 500 });
    else setTimeout(flush, 250);
  }

  /* The observer is installed BEFORE the first sweep and kept in a variable on
     purpose. Installed after, a sweep that throws on some page's markup would
     take the observer with it and every later row would render blank — which is
     the one outcome this file exists to prevent. */
  var observer = null;
  var armedRoot = null;

  /* Re-arm, not just start. /u/<username>/ mounts the real profile app with
     document.open()/document.write() (tmr-profile-hydrate.js): the JavaScript
     realm survives, so this module is still loaded, but the document it swept
     and the element it observed are both gone. Everything below therefore
     keys off the CURRENT documentElement and re-attaches whenever it changes,
     which is exactly what a profile header needs to stop rendering blank. */
  function arm() {
    var root = document.documentElement;
    if (!root || root === armedRoot) return false;
    armedRoot = root;
    if (observer) { try { observer.disconnect(); } catch (e) {} }
    try { injectCss(); } catch (e) {}
    try {
      observer = new MutationObserver(function (records) {
        for (var i = 0; i < records.length; i += 1) {
          var added = records[i].addedNodes;
          for (var j = 0; added && j < added.length; j += 1) {
            if (added[j].nodeType === 1) schedule(added[j]);
          }
        }
      });
      observer.observe(root, { childList: true, subtree: true });
    } catch (e) {}
    sweep(0);
    /* Some pages fill an avatar slot by writing TEXT into markup that is
       already on the page — the profile header prints its single initial that
       way — and a text-only change produces no childList record for the
       observer to see. A few coarse sweeps catch those without watching every
       keystroke of every live feed on the site. */
    sweep(400); sweep(1500); sweep(4000);
    return true;
  }

  function sweep(delay) {
    if (!delay) { try { scan(document.documentElement); } catch (e) {} return; }
    try { if (window.setTimeout) window.setTimeout(function () { try { scan(document.documentElement); } catch (e) {} }, delay); } catch (e) {}
  }

  function start() {
    arm();
    try {
      window.addEventListener('load', function () { sweep(300); });
    } catch (e) {}
    // Cheap: one identity comparison per tick, and a sweep only when the
    // document underneath actually changed.
    try { if (window.setInterval) window.setInterval(arm, 750); } catch (e) {}
  }

  window.TMRAvatar = {
    identity: identity,
    initials: initialsFor,
    svg: svg,
    dataUri: dataUri,
    src: src,
    html: html,
    paint: paint,
    mark: markInto,
    scan: scan,
    hash: hashString
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
