/* TMR SHARED BUCKET LABELS -- 2026-09-07
 *
 * ONE place that turns an internal split bucket key into the text a human
 * reads. Before this file, every profile page carried its own private copy of
 * the same lookup table, and each copy only knew the key spelling
 * "0.5_to_1u". The backend does not agree with itself on that spelling:
 *
 *   services/profileAnalytics.js  ->  0.5_to_1u
 *   routes/users.js  (/metrics)   ->  0_5_to_1u      <-- underscore, not a dot
 *   services/statsAggregator.js   ->  0_5_to_1u, 1_5_to_2u, 2_5_to_3u
 *
 * /api/users/:username/metrics is what feeds "Performance by Unit Size", so
 * the lowest bucket arrived as 0_5_to_1u, missed every lookup table, fell
 * through the `|| k` escape hatch and printed the raw key on the page.
 *
 * The fix is presentation only. Nothing here changes a key, a count, a unit
 * total, an ROI or a win percentage -- callers keep passing and storing the
 * exact key the API sent, and this module only decides what gets painted.
 *
 * Two rules it enforces for every caller:
 *   1. every spelling of a bucket resolves to the same label
 *   2. an unknown key is NEVER rendered raw; humanize() strips the internal
 *      shape (underscores, _to_, trailing _plus) before it can reach a user.
 */
(function (global) {
    'use strict';

    var EN_DASH = '–';

    /* Canonical unit-size keys. Both backend spellings map to one label. */
    var UNIT_SIZE = {
        '0_5_to_1u': '0.5' + EN_DASH + '1u',
        '0.5_to_1u': '0.5' + EN_DASH + '1u',
        '1_5_to_2u': '1.5' + EN_DASH + '2u',
        '1.5_to_2u': '1.5' + EN_DASH + '2u',
        '2_5_to_3u': '2.5' + EN_DASH + '3u',
        '2.5_to_3u': '2.5' + EN_DASH + '3u',
        '3u_plus': '3u+',
        'unknown': 'Unknown'
    };

    /* Canonical key per bucket, so sorting and grouping stay stable no matter
       which endpoint produced the row. Display order is biggest stake first. */
    var UNIT_SIZE_CANONICAL = {
        '0_5_to_1u': '0.5_to_1u',
        '0.5_to_1u': '0.5_to_1u',
        '1_5_to_2u': '1.5_to_2u',
        '1.5_to_2u': '1.5_to_2u',
        '2_5_to_3u': '2.5_to_3u',
        '2.5_to_3u': '2.5_to_3u',
        '3u_plus': '3u_plus'
    };

    var UNIT_SIZE_ORDER = {
        '3u_plus': 0,
        '2.5_to_3u': 1,
        '1.5_to_2u': 2,
        '0.5_to_1u': 3
    };

    var ODDS_BUCKET = {
        heavy_favorite: 'Heavy Fav (-200+)',
        favorite: 'Favorite (-110 to -200)',
        even: 'Even',
        even_money: 'Even',
        underdog: 'Dog (+100 to +200)',
        big_underdog: 'Longshot (+201+)',
        unknown: 'Unknown'
    };

    var FAV_DOG = { favorite: 'Favorite', underdog: 'Underdog' };

    var DAY_OF_WEEK = {
        sun: 'Sunday', mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday',
        thu: 'Thursday', fri: 'Friday', sat: 'Saturday'
    };

    /* statsAggregator emits these for how far ahead of first pitch a pick was
       locked. Same _to_ shape, same reason to never show it raw. */
    var BET_TIMING = {
        under_1h: 'Under 1 hour out',
        '1_to_6h': '1 ' + EN_DASH + ' 6 hours out',
        '6_to_24h': '6 ' + EN_DASH + ' 24 hours out',
        '24h_plus': 'A day or more out'
    };

    function keyOf(bucketKey) {
        return String(bucketKey == null ? '' : bucketKey);
    }

    /* Last line of defence. Anything that reaches here is a key nobody has a
       label for, so make it readable rather than letting the raw identifier
       out: "0_5_to_1u" -> "0.5 to 1u", "some_new_bucket" -> "Some New Bucket". */
    function humanize(bucketKey) {
        var k = keyOf(bucketKey);
        if (!k) return '—';
        var unit = k.match(/^(\d+)_(\d+)_to_(\d+(?:_\d+)?)u$/);
        if (unit) {
            return unit[1] + '.' + unit[2] + EN_DASH + unit[3].replace('_', '.') + 'u';
        }
        var plus = k.match(/^(.+)_plus$/);
        if (plus) return plus[1].replace(/_/g, ' ') + '+';
        return k
            .replace(/_to_/g, ' ' + EN_DASH + ' ')
            .replace(/_/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .replace(/\b\w/g, function (c) { return c.toUpperCase(); });
    }

    function unitSize(bucketKey) {
        var k = keyOf(bucketKey);
        return UNIT_SIZE[k] || UNIT_SIZE[k.toLowerCase()] || humanize(k);
    }

    /* Canonical key for sorting / grouping. Never rendered, never stored. */
    function unitSizeKey(bucketKey) {
        var k = keyOf(bucketKey);
        return UNIT_SIZE_CANONICAL[k] || UNIT_SIZE_CANONICAL[k.toLowerCase()] || k;
    }

    function unitSizeRank(bucketKey) {
        var rank = UNIT_SIZE_ORDER[unitSizeKey(bucketKey)];
        return rank == null ? 99 : rank;
    }

    /* Accepts "by_unit_size" and "unit_size" alike. The raw key leaked onto
       profile pages precisely because one caller passed the short form and the
       lookup only tested the long one. */
    function normalizeSplitKey(splitKey) {
        return String(splitKey == null ? '' : splitKey).toLowerCase().replace(/^by_/, '');
    }

    function format(splitKey, bucketKey) {
        var k = keyOf(bucketKey);
        if (!k) return '—';
        var split = normalizeSplitKey(splitKey);
        var lower = k.toLowerCase();
        if (split === 'unit_size') return unitSize(k);
        if (split === 'odds_bucket') return ODDS_BUCKET[lower] || humanize(k);
        if (split === 'fav_dog') return FAV_DOG[lower] || humanize(k);
        if (split === 'day_of_week') return DAY_OF_WEEK[lower] || humanize(k);
        if (split === 'bet_timing') return BET_TIMING[lower] || humanize(k);
        if (split === 'sport') return k.toUpperCase().replace(/_/g, ' ');
        /* Unknown split: still guarantee no internal identifier escapes. */
        if (UNIT_SIZE[lower]) return UNIT_SIZE[lower];
        if (BET_TIMING[lower]) return BET_TIMING[lower];
        return humanize(k);
    }

    global.TMR_BUCKET_LABELS = {
        format: format,
        humanize: humanize,
        unitSize: unitSize,
        unitSizeKey: unitSizeKey,
        unitSizeRank: unitSizeRank,
        normalizeSplitKey: normalizeSplitKey,
        UNIT_SIZE: UNIT_SIZE,
        UNIT_SIZE_ORDER: UNIT_SIZE_ORDER,
        ODDS_BUCKET: ODDS_BUCKET,
        FAV_DOG: FAV_DOG,
        DAY_OF_WEEK: DAY_OF_WEEK,
        BET_TIMING: BET_TIMING
    };
})(typeof window !== 'undefined' ? window : this);
