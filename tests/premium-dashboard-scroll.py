"""PREMIUM_SCROLL_20261102 regression test for /premium/: scroll position, hash links, member dashboard, entitlements.

  python tests/premium-dashboard-scroll.py [--live] [--shots DIR]

Default: serves THIS checkout's premium/index.html in place of the live page (same origin, so the real API answers
everything except /premium/me, which is mocked per membership state). --live tests the deployed page unchanged.
Checks, for anonymous, free, Pro monthly, Pro cancelling, Pro past due and Ultimate (complimentary) visitors, on
desktop and phone: plain /premium/ opens at the top; #dashboard opens at the top for members; a hidden sales #hash
never leaves a member partway down; a visible #hash lands just below the sticky header; the page does not jump
after the account loads; wheel and keyboard scrolling move the page; reload and back/forward keep a sane position;
the member dashboard shows tier, status and date from /premium/me and every feature card has a working target.
"""
import json
import os
import sys
from datetime import datetime, timedelta, timezone

from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LIVE = '--live' in sys.argv
SHOTS = sys.argv[sys.argv.index('--shots') + 1] if '--shots' in sys.argv else None
SITE = 'https://trustmyrecord.com'
LOCAL = open(os.path.join(HERE, 'premium', 'index.html'), encoding='utf-8').read()
END = (datetime.now(timezone.utc) + timedelta(days=21)).isoformat()
STATES = {
    'anon': None,
    'free': {'subscription': None, 'checkout_open': True, 'can_manage_billing': False, 'ultimate_checkout_open': True},
    'pro': {'subscription': {'tier': 'pro', 'source': 'stripe', 'status': 'active', 'billing_period': 'monthly', 'current_period_end': END, 'cancel_at_period_end': False},
            'can_manage_billing': True, 'ultimate_checkout_open': True},
    'pro_cancel': {'subscription': {'tier': 'pro', 'source': 'stripe', 'status': 'active', 'billing_period': 'yearly', 'current_period_end': END, 'cancel_at_period_end': True},
                   'can_manage_billing': True, 'ultimate_checkout_open': False},
    'pro_pastdue': {'subscription': {'tier': 'pro', 'source': 'stripe', 'status': 'past_due', 'billing_period': 'monthly', 'current_period_end': END, 'cancel_at_period_end': False},
                    'can_manage_billing': True, 'ultimate_checkout_open': False},
    'ultimate': {'subscription': {'tier': 'ultimate', 'source': 'admin', 'status': 'active', 'expires_at': END}, 'can_manage_billing': False, 'ultimate_checkout_open': False},
}
results = []

# what the visitor is looking at: the first block-level element with text at 40% of the viewport, and where it sits
SPOT = """() => { const y = Math.round(innerHeight * 0.4); let e = document.elementFromPoint(innerWidth / 2, y);
  while (e && e.parentElement && !(e.id || (e.textContent || '').trim().length > 20)) e = e.parentElement;
  if (e && e.closest('#pdOnboard')) e = document.getElementById('pdOnboard');
  const path = []; let n = e; while (n && n !== document.body) { path.unshift(n.tagName + ':' + [...n.parentElement.children].indexOf(n)); n = n.parentElement; }
  return { path: path.join('/'), top: e ? Math.round(e.getBoundingClientRect().top) : null }; }"""
AT = """p => { let n = document.body; for (const part of p.split('/')) { const i = +part.split(':')[1]; n = n && n.children[i]; }
  return n ? Math.round(n.getBoundingClientRect().top) : null; }"""


def check(name, ok, detail=''):
    results.append(ok)
    print(('PASS ' if ok else 'FAIL ') + name + ('' if ok else '  ' + str(detail)))


def ctx_for(br, state, vp):
    ctx = br.new_context(viewport=vp, is_mobile=vp['width'] < 500, has_touch=vp['width'] < 500)
    if state != 'anon':
        ctx.add_init_script("try{localStorage.setItem('trustmyrecord_token','test.token.value')}catch(e){}")
    ctx.route('**/googletagmanager.com/**', lambda r: r.abort())
    if not LIVE:
        ctx.route(SITE + '/premium/', lambda r: r.fulfill(status=200, content_type='text/html; charset=utf-8', body=LOCAL))
    me = STATES[state]
    if me is not None:
        ctx.route('**/api/premium/me', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(me),
                                                            headers={'access-control-allow-origin': SITE, 'access-control-allow-credentials': 'true'}))
        # the session script refreshes a fake token; answer quietly so nothing signs the test user out
        ctx.route('**/api/auth/**', lambda r: r.fulfill(status=200, content_type='application/json', body='{}',
                                                         headers={'access-control-allow-origin': SITE, 'access-control-allow-credentials': 'true'}))
    return ctx


def settle(pg):
    pg.wait_for_load_state('load')
    pg.wait_for_timeout(2500)


def main():
    with sync_playwright() as pw:
        br = pw.chromium.launch()
        for vp_name, vp in (('desktop', {'width': 1440, 'height': 900}), ('phone', {'width': 390, 'height': 844})):
            for state in STATES:
                member = bool(STATES[state] and STATES[state]['subscription'])
                ctx = ctx_for(br, state, vp)
                pg = ctx.new_page()
                tag = '%s %s' % (vp_name, state)
                # plain URL opens at the top and stays there
                pg.goto(SITE + '/premium/')
                settle(pg)
                check(tag + ': /premium/ opens at the top', pg.evaluate('scrollY') == 0, pg.evaluate('scrollY'))
                if member:
                    check(tag + ': member dashboard shown', pg.is_visible('#proWelcome') and pg.is_hidden('#pricing'))
                    facts = pg.inner_text('#pdxFacts')
                    want = 'TMR Ultimate' if state == 'ultimate' else 'TMR Pro'
                    check(tag + ': tier, status and date from the account', want in facts and ('2026' in facts or '2027' in facts), facts)
                    if state == 'pro_cancel':
                        check(tag + ': cancelling shown', 'cancelled' in facts.lower() and 'access until' in facts.lower(), facts)
                    if state == 'pro_pastdue':
                        check(tag + ': payment problem shown', 'payment failed' in facts.lower(), facts)
                    check(tag + ': one status block (old status strip text hidden)', pg.is_hidden('#proStatusText'))
                    if state in ('pro', 'pro_cancel', 'pro_pastdue'):
                        check(tag + ': manage billing button available', pg.is_visible('#proManage'))
                    hrefs = pg.eval_on_selector_all('#proWelcome a.pdx-card:not([hidden])', 'els => els.map(e => e.getAttribute("href"))')
                    check(tag + ': feature cards present', len(hrefs) >= 6, hrefs)
                    if state == 'ultimate':
                        check(tag + ': Ultimate report card', '/ultimate/report/' in hrefs, hrefs)
                    if SHOTS:
                        pg.screenshot(path=os.path.join(SHOTS, '%s_%s.png' % (vp_name, state)), full_page=True)
                else:
                    check(tag + ': sales page shown', pg.is_visible('#pricing') and pg.is_hidden('#proWelcome'))
                # wheel and keyboard scroll the page
                pg.mouse.wheel(0, 700)
                pg.wait_for_timeout(400)
                y1 = pg.evaluate('scrollY')
                pg.keyboard.press('End')
                pg.wait_for_timeout(600)
                y2 = pg.evaluate('scrollY')
                check(tag + ': wheel and keyboard scroll', y1 > 0 and y2 > y1, (y1, y2))
                # reload keeps the position the visitor chose, back/forward return to it
                pg.evaluate('scrollTo(0, 600)')
                pg.wait_for_timeout(300)
                spot = pg.evaluate(SPOT)
                pg.reload()
                settle(pg)
                now = pg.evaluate(AT, spot['path'])
                if state in ('pro', 'pro_cancel', 'pro_pastdue'):
                    check(tag + ': manage billing still shown after reload (returning member)', pg.is_visible('#proManage'))
                check(tag + ': reload shows the same content in the same place', now is not None and abs(now - spot['top']) <= 40 and pg.evaluate('scrollY') > 0, (spot, now))
                # hash links
                for h in ('#dashboard', '#watchdog', '#pricing', '#board', '#performance'):
                    pg.goto(SITE + '/premium/' + h)
                    pg.wait_for_load_state('load')
                    ys = []
                    for _ in range(6):
                        ys.append(pg.evaluate("h => { const el = document.querySelector(h); return el && el.getClientRects().length ? Math.round(el.getBoundingClientRect().top) : Math.round(-scrollY); }", h))
                        pg.wait_for_timeout(500)
                    info = pg.evaluate("""h => { const el = document.querySelector(h); const nav = document.querySelector('.ds-nav');
                        return { shown: !!(el && el.getClientRects().length), top: el && el.getClientRects().length ? Math.round(el.getBoundingClientRect().top) : null,
                                 nav: nav ? Math.max(0, Math.round(nav.getBoundingClientRect().bottom)) : 0, y: Math.round(scrollY), hash: location.hash }; }""", h)
                    stable = ys[-1] == ys[-2] == ys[-3]
                    if member and (not info['shown'] or h == '#dashboard'):
                        check('%s: %s opens the member dashboard at the top' % (tag, h), info['y'] == 0 and stable, (ys, info))
                    elif info['shown']:
                        check('%s: %s lands below the sticky header' % (tag, h), info['top'] is not None and info['nav'] - 2 <= info['top'] <= info['nav'] + 100 and stable, (ys, info))
                    else:
                        check('%s: %s hidden target leaves the page at the top' % (tag, h), info['y'] == 0, (ys, info))
                # back and forward across an internal link
                pg.goto(SITE + '/premium/')
                settle(pg)
                pg.evaluate('scrollTo(0, 500)')
                pg.wait_for_timeout(300)
                spot = pg.evaluate(SPOT)
                pg.goto(SITE + '/sports-simulators/')
                pg.wait_for_load_state('load')
                pg.go_back()
                settle(pg)
                now = pg.evaluate(AT, spot['path'])
                check(tag + ': back shows the same content in the same place', now is not None and abs(now - spot['top']) <= 40 and pg.evaluate('scrollY') > 0, (spot, now))
                ctx.close()
        br.close()
    print('RESULT', 'PASS' if all(results) else 'FAIL', '%d/%d' % (sum(results), len(results)))
    sys.exit(0 if all(results) else 1)


if __name__ == '__main__':
    main()
