"""PRO_BOARD_GAMES_20261102 regression test for /pro/board/.

  python tests/pro-board-games.py --mock <board.json> [--live] [--shots DIR]

Default serves THIS checkout's pro/board/index.html in place of the live page (same origin); /premium/me answers as a
Pro member and /pro/pending-board answers from the given JSON (same shape as the API). --live keeps the deployed HTML.
Checks: board opens at the top, By game view groups picks by game in start order, started games never show, league /
window filters, view switch, URL keeps the view across refresh and back, opening a record keeps the board position,
phone layout has no sideways scroll, and a signed out visitor gets no board data.
"""
import json
import os
import sys
from datetime import datetime, timezone

from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = 'https://trustmyrecord.com'
LIVE = '--live' in sys.argv
MOCK = json.load(open(sys.argv[sys.argv.index('--mock') + 1], encoding='utf-8'))
SHOTS = sys.argv[sys.argv.index('--shots') + 1] if '--shots' in sys.argv else None
LOCAL = open(os.path.join(HERE, 'pro', 'picks', 'index.html'), encoding='utf-8').read()
H = {'access-control-allow-origin': SITE, 'access-control-allow-credentials': 'true'}
ME = {'subscription': {'tier': 'pro', 'source': 'stripe', 'status': 'active', 'billing_period': 'monthly', 'current_period_end': '2026-12-01T00:00:00Z'}, 'can_manage_billing': True}
res = []


def check(n, ok, d=''):
    res.append(ok)
    print(('PASS ' if ok else 'FAIL ') + n + ('' if ok else '  ' + str(d)[:300]))


def ctx_for(br, vp, pro=True):
    ctx = br.new_context(viewport=vp, is_mobile=vp['width'] < 500, has_touch=vp['width'] < 500)
    ctx.route('**/googletagmanager.com/**', lambda r: r.abort())
    if not LIVE:
        ctx.route(SITE + '/pro/picks/*', lambda r: r.fulfill(status=200, content_type='text/html; charset=utf-8', body=LOCAL) if r.request.url.split('?')[0].split('#')[0] == SITE + '/pro/picks/' else r.continue_())
    if pro:
        ctx.add_init_script("try{localStorage.setItem('trustmyrecord_token','test.token')}catch(e){}")
        ctx.route('**/api/premium/me', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(ME), headers=H))
        ctx.route('**/api/pro/pending-board', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(MOCK), headers=H))
        ctx.route('**/api/pro/handicapper*', lambda r: r.fulfill(status=200, content_type='application/json', headers=H, body=json.dumps(
            {'name': 'Tracked Handicapper #0001', 'record': {'w': 10, 'l': 8, 'p': 0}, 'graded': 18, 'units': 1.2, 'roi': 6.7, 'streak': 2, 'sports': [], 'pending': [], 'recent': []})))
        ctx.route('**/api/auth/**', lambda r: r.fulfill(status=200, content_type='application/json', body='{}', headers=H))
    return ctx


def main():
    now = datetime.now(timezone.utc).isoformat()
    future = sum(1 for c in MOCK['handicappers'] for p in c['picks'] if p['start'] > now)
    with sync_playwright() as pw:
        br = pw.chromium.launch()
        for vpn, vp in (('desktop', {'width': 1440, 'height': 900}), ('phone', {'width': 390, 'height': 844})):
            ctx = ctx_for(br, vp)
            pg = ctx.new_page()
            errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.goto(SITE + '/pro/picks/')
            pg.wait_for_selector('.wdg-game', timeout=20000)
            pg.wait_for_timeout(600)
            check(vpn + ' opens at the top', pg.evaluate('scrollY') == 0, pg.evaluate('scrollY'))
            starts = pg.eval_on_selector_all('.wdg-game', 'gs => gs.length')
            n = pg.eval_on_selector_all('.wdg-pick', 'ps => ps.length')
            check(vpn + ' every upcoming pick listed once, none started', n == future, (n, future))
            check(vpn + ' grouped by game', 0 < starts <= n, starts)
            check(vpn + ' no sideways scroll', pg.evaluate('document.documentElement.scrollWidth - innerWidth') <= 1)
            leagues = pg.eval_on_selector('#wdLeague', 'el => [...el.options].map(o => o.value).filter(v => v !== "all")')
            if leagues:
                pg.select_option('#wdLeague', leagues[0])
                pg.wait_for_timeout(300)
                lg = set(pg.eval_on_selector_all('.wdg-lg', 'e => e.map(x => x.textContent)'))
                check(vpn + ' league filter', lg <= {leagues[0]}, lg)
                check(vpn + ' filter in the URL', 'league=' in pg.url, pg.url)
                pg.reload()
                pg.wait_for_selector('.wdg-switch', timeout=20000)
                pg.wait_for_timeout(400)
                check(vpn + ' refresh keeps the filter', pg.eval_on_selector('#wdLeague', 'e => e.value') == leagues[0])
                pg.select_option('#wdLeague', 'all')
                pg.wait_for_timeout(300)
            pg.select_option('#wdWin', '3')
            pg.wait_for_timeout(300)
            soon = pg.eval_on_selector_all('.wdg-game', 'gs => gs.length')
            check(vpn + ' starts-within filter narrows', soon <= starts, (soon, starts))
            pg.select_option('#wdWin', 'all')
            pg.wait_for_timeout(300)
            # open a record from the middle of the board: the board stays where it was
            pg.evaluate('scrollTo(0, 900)')
            pg.wait_for_timeout(200)
            y0 = pg.evaluate('scrollY')
            caps = pg.locator('.wdg-cap')
            idx = 0
            for i in range(caps.count()):
                box = caps.nth(i).bounding_box()
                if box and 160 < box['y'] < vp['height'] - 120:
                    idx = i
                    break
            caps.nth(idx).click()
            pg.wait_for_selector('#wdPanel:not([hidden])', timeout=10000)
            y_open = pg.evaluate('scrollY')
            pg.keyboard.press('Escape')
            pg.wait_for_timeout(300)
            check(vpn + ' record panel opens and closes in place', abs(pg.evaluate('scrollY') - y0) < 5, (y0, y_open, pg.evaluate('scrollY'), idx, pg.evaluate('document.documentElement.scrollHeight')))
            pg.click('.wdg-switch [data-view="cappers"]')
            pg.wait_for_timeout(300)
            check(vpn + ' by handicapper view', pg.locator('.wd-table').count() == 1 and 'view=cappers' in pg.url)
            pg.click('.wdg-switch [data-view="games"]')
            pg.wait_for_timeout(300)
            check(vpn + ' no page errors', not errs, errs[:2])
            if SHOTS:
                pg.evaluate('scrollTo(0,0)')
                pg.screenshot(path=os.path.join(SHOTS, 'board_%s.png' % vpn), full_page=False)
            ctx.close()
        # signed out: the page asks for no board data and shows no picks
        ctx = ctx_for(br, {'width': 1440, 'height': 900}, pro=False)
        pg = ctx.new_page()
        calls = []
        pg.on('request', lambda r: calls.append(r.url) if '/pro/pending-board' in r.url and not r.url.endswith('/summary') else None)
        pg.goto(SITE + '/pro/picks/')
        pg.wait_for_timeout(4000)
        check('signed out: no pending picks shown', pg.locator('.wdg-pick').count() == 0 and pg.locator('.wd-chip').count() == 0)
        check('signed out: board API not called', not calls, calls)
        ctx.close()
        br.close()
    print('RESULT', 'PASS' if all(res) else 'FAIL', '%d/%d' % (sum(res), len(res)))
    sys.exit(0 if all(res) else 1)


if __name__ == '__main__':
    main()
