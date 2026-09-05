/* SPORTSBOOK_NEXT_TIDY_20260904
 * Two small corrections the engine cannot make on its own, shared by the
 * preview shell and the live board so both run identical code:
 *   - the game/price tally moves out of the market tab row, which otherwise
 *     wraps the tabs onto a second line
 *   - a player prop label the engine writes as one string is split so the
 *     player reads first and the market supports it
 * Both are no-ops when their targets are absent.
 */
(function () {
    function moveTally() {
        var tally = document.querySelector('.sbn-toolbar .sbn-tally');
        if (!tally) return;
        // SECOND_HALF_20260905: the halftime panel prints a column header of
        // its own and sits ABOVE the board, so 'the first .sbn-colhead on the
        // page' is no longer the board's. The tally counts the pre-game slate;
        // it belongs in the board's header, never in the 2H one.
        var slot = null;
        var heads = document.querySelectorAll('.sbn-colhead');
        for (var h = 0; h < heads.length; h++) {
            if (heads[h].closest && heads[h].closest('.sbn-2h')) continue;
            slot = heads[h].querySelector('span:first-child');
            if (slot) break;
        }
        if (!slot) {
            // ladder tabs print no column header, so the count gets a strip of its
            // own rather than staying in the tab row and wrapping it onto two lines
            var board = document.getElementById('sbnBoard');
            if (!board) return;
            slot = board.querySelector('.sbn-loosetally');
            if (!slot) {
                slot = document.createElement('div');
                slot.className = 'sbn-loosetally';
                board.insertBefore(slot, board.firstChild);
            }
        }
        // idempotent: the observer below watches the subtree these lines write
        // into, so writing unconditionally would feed itself
        if (slot.textContent !== tally.textContent) slot.textContent = tally.textContent;
        if (!/loose/.test(slot.className)) slot.className = 'sbn-headtally';
        if (tally.style.display !== 'none') tally.style.display = 'none';
    }
    // The engine writes a player prop label as one string, "Name . Prop Type".
    // Split it so the player reads first and the market supports it.
    function splitPropLabels() {
        var on = document.querySelector('.sbn-cat.is-on');
        if (!on || on.getAttribute('data-cat') !== 'player_props') return;
        [].forEach.call(document.querySelectorAll('.sbn-striplabel > b'), function (b) {
            if (b.querySelector('i')) return;
            var parts = b.textContent.split('·');
            if (parts.length < 2) return;
            b.innerHTML = '';
            var who = document.createElement('span');
            who.className = 'sbn-propwho';
            who.textContent = parts[0].trim();
            var what = document.createElement('i');
            what.textContent = parts.slice(1).join('·').trim();
            b.appendChild(who); b.appendChild(what);
            b.parentNode.classList.add('is-prop');
        });
    }
    var busy = false;
    function tidy() {
        if (busy) return;
        busy = true;
        try { moveTally(); splitPropLabels(); } finally { busy = false; }
    }
    // The board is mounted by the embed after this file runs, so looking for it
    // once found nothing and the observer was never attached: the tally was
    // moved by the two timeouts below and then walked back into the tab row by
    // the next render, which is what wraps the tabs onto a second line. Wait
    // for the board, then watch the subtree, because a re-render replaces the
    // toolbar and the column header rather than the board's own children.
    var tries = 0;
    (function attach() {
        var board = document.getElementById('sbnBoard');
        if (board && window.MutationObserver) {
            new MutationObserver(tidy).observe(board, { childList: true, subtree: true });
            tidy();
            return;
        }
        if (++tries < 120) setTimeout(attach, 250);
    })();
    document.addEventListener('DOMContentLoaded', tidy);
    setTimeout(tidy, 400); setTimeout(tidy, 1500);
})();
