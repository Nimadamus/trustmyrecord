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
        var slot = document.querySelector('.sbn-colhead span:first-child');
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
        slot.textContent = tally.textContent;
        if (!/loose/.test(slot.className)) slot.className = 'sbn-headtally';
        tally.style.display = 'none';
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
    function tidy() { moveTally(); splitPropLabels(); }
    var board = document.getElementById('sbnBoard');
    if (board && window.MutationObserver) new MutationObserver(tidy).observe(board, { childList: true });
    document.addEventListener('DOMContentLoaded', tidy);
    setTimeout(tidy, 400); setTimeout(tidy, 1500);
})();
