/* CREDIBILITY_FLAIR_20261114: the badge beside a member's name.
 *
 * The server decides everything (services/credibilityFlair.js, from the same
 * canonical record the profile shows): this file only draws `item.flair` when
 * a card has one, right after the name in the standard feed header. A card
 * without `flair` (older API, or fewer than 25 graded picks) is left exactly
 * as it was. */
(function () {
    'use strict';
    if (window.TMRFlair) return;

    function e(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function html(flair) {
        if (!flair || !flair.label) return '';
        var tone = flair.tone === 'up' || flair.tone === 'down' ? flair.tone : 'flat';
        return '<span class="tmr-flair tmr-flair--' + e(flair.tier || 'v25') + '" title="' + e(flair.title || '') + '" aria-label="' + e(flair.title || flair.label) + '">' +
            '<i class="fas fa-circle-check" aria-hidden="true"></i><b>' + e(flair.label) + '</b>' +
            (flair.units_text ? '<em class="tmr-flair-u tmr-flair-u--' + tone + '">' + e(flair.units_text) + '</em>' : '') +
        '</span>';
    }

    var NAME_END = '</a></span>';
    function wrapHeader() {
        var base = window.renderFeedHeader;
        if (typeof base !== 'function' || base.__tmrFlair) return;
        var wrapped = function (item, actionHtml) {
            var out = base(item, actionHtml);
            try {
                var badge = item && item.flair ? html(item.flair) : '';
                if (!badge) return out;
                var at = out.indexOf(NAME_END);
                return at === -1 ? out : out.slice(0, at + NAME_END.length) + badge + out.slice(at + NAME_END.length);
            } catch (x) { return out; }
        };
        wrapped.__tmrFlair = true;
        window.renderFeedHeader = wrapped;
        // the feed scripts call the bare name: keep it pointing at the wrapped header
        try { renderFeedHeader = wrapped; } catch (x) { /* module scope: window binding is enough */ }
    }

    wrapHeader();
    window.TMRFlair = { html: html, _wrap: wrapHeader };
})();
