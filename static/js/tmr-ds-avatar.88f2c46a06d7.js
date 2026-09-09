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
  /* ================= ASSIGNED CRESTS (2026-09-08) =====================
     Two rewrites got here. This slot was one shared grey silhouette, which made
     a leaderboard of twenty read as one account twenty times. It was then an
     illustrated fan per member, which fixed that and read as a cartoon - Nima:
     "too cartoonish ... hurting the credibility of the site". A betting record
     is a serious document and the faces beside it have to look like one.

     A member with no photo and no club now gets a CREST: navy ground, electric
     blue mark, one athletic motif, keyed off their user id. Browser copy of the
     API's utils/avatarEmblem.js - the two must stay in step, because a member
     has to wear the same crest whether it came from the avatar route or was
     drawn here while that request was still in flight. */
  
  
  function emHash(value) {
    var h = 0x811c9dc5;
    var s = String(value == null ? '' : value);
    for (var i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h >>> 0;
  }
  
  function emDraw(seed, salt, n) {
    var h = (seed ^ emHash(salt)) >>> 0;
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
    h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0;
    h = (h ^ (h >>> 15)) >>> 0;
    return h % n;
  }
  
  function emPick(seed, salt, arr) { return arr[emDraw(seed, salt, arr.length)]; }
  
  /* Every palette is a navy ground with one cool accent. Deliberately narrow in
     hue - the variety comes from shape and motif, not from colour, because a row
     of pink and lime discs is exactly the "childish" read being removed here. */
  var EM_PALETTES = [
    { ground: '#0B1220', panel: '#141E33', ink: '#4E8CFF' },
    { ground: '#0A121C', panel: '#12202E', ink: '#35E0CB' },
    { ground: '#0D1424', panel: '#182338', ink: '#6EA8FF' },
    { ground: '#091019', panel: '#111C2B', ink: '#8FB3D9' },
    { ground: '#0C1522', panel: '#16233A', ink: '#3B82F6' },
    { ground: '#0A0F1A', panel: '#131D2E', ink: '#5FD3E4' },
    { ground: '#0E1526', panel: '#1A2540', ink: '#7C9CE0' },
    { ground: '#080D16', panel: '#101927', ink: '#4ADEC4' },
  ];
  
  var EM_SHAPES = [
    'M50 14 82 25v27c0 17-14 27-32 32C32 79 18 69 18 52V25z',            // shield
    'M50 15a35 35 0 1 0 .01 0z',                                          // roundel
    'M50 13 84 32v36L50 87 16 68V32z',                                    // hex
    'M20 17h60v40L50 84 20 57z',                                          // pennant
    'M50 12 88 50 50 88 12 50z',                                          // diamond
    'M24 20h52c0 30-6 48-26 66C30 68 24 50 24 20z',                       // arch
  ];
  
  var EM_ESCMAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function emEsc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return EM_ESCMAP[c]; });
  }
  
  /* The athletic mark at the centre. Flat, single-weight, and sized to the same
     optical box so one crest is not visually heavier than the next. */
  function emMotif(index, ink) {
    var s = 'stroke="' + ink + '" fill="none" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"';
    switch (index) {
      case 0:  // baseball seams
        return '<circle cx="50" cy="49" r="14" ' + s + '/>'
          + '<path d="M41 39c5 6 5 14 0 20M59 39c-5 6-5 14 0 20" ' + s + '/>';
      case 1:  // football
        return '<path d="M50 35c11 0 18 6 18 14s-7 14-18 14-18-6-18-14 7-14 18-14z" ' + s + '/>'
          + '<path d="M43 49h14M47 45v8M53 45v8" ' + s + '/>';
      case 2:  // basketball
        return '<circle cx="50" cy="49" r="14" ' + s + '/>'
          + '<path d="M36 49h28M50 35v28M40 39c6 6 14 6 20 0M40 59c6-6 14-6 20 0" ' + s + '/>';
      case 3:  // goal net
        return '<path d="M33 41h34v18H33z" ' + s + '/>'
          + '<path d="M42 41v18M50 41v18M58 41v18M33 50h34" ' + s + ' stroke-width="2"/>';
      case 4:  // stadium arch
        return '<path d="M32 60c0-12 8-20 18-20s18 8 18 20" ' + s + '/>'
          + '<path d="M28 60h44M38 60v-8M50 60V44M62 60v-8" ' + s + '/>';
      case 5:  // track lanes
        return '<path d="M30 44h40M30 52h40M30 60h40" ' + s + '/>'
          + '<path d="M38 40v24M62 40v24" ' + s + ' stroke-width="2"/>';
      case 6:  // chevron rank
        return '<path d="M36 56l14-13 14 13M36 45l14-13 14 13" ' + s + '/>';
      case 7:  // laurel
        return '<path d="M50 38v24" ' + s + '/>'
          + '<path d="M50 44c-6-4-11-3-13 1 3 4 9 4 13 0zM50 44c6-4 11-3 13 1-3 4-9 4-13 0z" ' + s + ' stroke-width="2.4"/>'
          + '<path d="M50 54c-6-4-11-3-13 1 3 4 9 4 13 0zM50 54c6-4 11-3 13 1-3 4-9 4-13 0z" ' + s + ' stroke-width="2.4"/>';
      case 8:  // crossed bats
        return '<path d="M37 62 61 38M63 62 39 38" ' + s + '/>'
          + '<circle cx="37" cy="62" r="3.2" ' + s + ' stroke-width="2.4"/>'
          + '<circle cx="63" cy="62" r="3.2" ' + s + ' stroke-width="2.4"/>';
      case 9:  // pitch / field lines
        return '<path d="M31 38h38v24H31z" ' + s + '/>'
          + '<path d="M50 38v24" ' + s + ' stroke-width="2"/>'
          + '<circle cx="50" cy="50" r="5" ' + s + ' stroke-width="2"/>';
      case 10: // upward trend, which is what a record is
        return '<path d="M32 60l10-10 8 6 14-16" ' + s + '/>'
          + '<path d="M56 40h10v10" ' + s + '/>';
      case 11: // star
      default:
        return '<path d="M50 36l4.2 8.8L64 46l-7 6.6L58.6 62 50 57.4 41.4 62 43 52.6 36 46l9.8-1.2z" ' + s + '/>';
    }
  }
  
  function emblemSvg(seedValue, options) {
    var opts = options || {};
    var seed = typeof seedValue === 'number' ? (seedValue >>> 0) : emHash(seedValue);
    var pal = emPick(seed, 'palette', EM_PALETTES);
    var shape = emPick(seed, 'shape', EM_SHAPES);
    var division = emDraw(seed, 'division', 6);
    var motif = emDraw(seed, 'motif', 12);
    var px = Number(opts.size) > 0 ? Number(opts.size) : 96;
    var label = opts.label ? emEsc(opts.label) : 'TrustMyRecord member';
    var id = 'e' + seed.toString(36);
  
    var g = '';
    g += '<circle cx="50" cy="50" r="50" fill="' + pal.ground + '"/>';
    g += '<path d="M0 50a50 50 0 0 1 100 0Z" fill="#FFFFFF" opacity=".045"/>';
    g += '<defs><clipPath id="' + id + '"><path d="' + shape + '"/></clipPath></defs>';
    g += '<path d="' + shape + '" fill="' + pal.panel + '"/>';
  
    /* The division is what stops two crests that share a shape from reading as the
       same crest. Kept low-contrast: it is structure, not decoration. */
    var div = '<g clip-path="url(#' + id + ')">';
    if (division === 1) div += '<rect x="50" y="0" width="50" height="100" fill="#FFFFFF" opacity=".05"/>';
    if (division === 2) div += '<rect x="0" y="50" width="100" height="50" fill="#000000" opacity=".22"/>';
    if (division === 3) div += '<path d="M50 6 96 52 50 98 4 52z" fill="' + pal.ink + '" opacity=".07"/>';
    if (division === 4) div += '<path d="M0 74h100v40H0z" fill="' + pal.ink + '" opacity=".10"/>';
    if (division === 5) div += '<path d="M0 0h100v22H0z" fill="' + pal.ink + '" opacity=".10"/>';
    div += '</g>';
    g += div;
  
    g += '<path d="' + shape + '" fill="none" stroke="' + pal.ink + '" stroke-opacity=".55" stroke-width="2.4"/>';
    g += emMotif(motif, pal.ink);
    g += '<circle cx="50" cy="50" r="48.4" fill="none" stroke="' + pal.ink + '" stroke-opacity=".3" stroke-width="3.2"/>';
  
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="' + px + '" height="' + px
      + '" role="img" aria-label="' + label + '">' + g + '</svg>';
  }
  
  /* TIER 4. Only reached when there is no seed to draw a crest from. Same navy
     and the same ring as everything else, so it never reads as a different
     system - just a quieter member of it. */
  function initialsSvg(mark, size, seedValue) {
    var seed = typeof seedValue === 'number' ? (seedValue >>> 0) : emHash(seedValue || mark || 'tmr');
    var pal = emPick(seed, 'palette', EM_PALETTES);
    var text = String(mark || 'TM').slice(0, 2).toUpperCase();
    var px = Number(size) > 0 ? Number(size) : 96;
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="' + px + '" height="' + px
      + '" role="img" aria-label="' + emEsc(text) + '">'
      + '<circle cx="50" cy="50" r="50" fill="' + pal.ground + '"/>'
      + '<path d="M0 50a50 50 0 0 1 100 0Z" fill="#FFFFFF" opacity=".045"/>'
      + '<circle cx="50" cy="50" r="48.4" fill="none" stroke="' + pal.ink + '" stroke-opacity=".3" stroke-width="3.2"/>'
      + '<text x="50" y="50" text-anchor="middle" dominant-baseline="central" fill="' + pal.ink + '"'
      + ' font-family="Inter,\'Segoe UI\',system-ui,-apple-system,Helvetica,Arial,sans-serif"'
      + ' font-size="36" font-weight="700" letter-spacing="1.5">' + emEsc(text) + '</text>'
      + '</svg>';
  }
  
  
  

  function neutralSvg(size, id) {
    var i = id || {};
    var seed = i.seed || i.username || '';
    var label = i.username ? i.username + ' avatar' : 'TrustMyRecord member';
    if (!seed) return initialsSvg(i.initials || i.mark || 'TM', size, label);
    return emblemSvg(seed, { size: size, label: label });
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
