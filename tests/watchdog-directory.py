"""Watchdog directory regression test for /around-the-web/.

  python tests/watchdog-directory.py            tests the live page
  python tests/watchdog-directory.py --page F   serves the built page F in place of the live one (same origin)
Checks paging, research views, tracking number search, filters, URL state, back from a profile, phone layout, links."""
import os, sys
from playwright.sync_api import sync_playwright
S = os.environ.get('WDD_SHOTS') or os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '_shots')
os.makedirs(S, exist_ok=True)
PAGE = open(sys.argv[sys.argv.index('--page') + 1], encoding='utf-8').read() if '--page' in sys.argv else None
URL = 'https://trustmyrecord.com/around-the-web/'
res = []
def check(n, ok, d=''):
    res.append(ok); print(('PASS ' if ok else 'FAIL ') + n + ('' if ok else '  ' + str(d)))
with sync_playwright() as pw:
    br = pw.chromium.launch()
    for vpn, vp in (('desktop', {'width': 1440, 'height': 900}), ('phone', {'width': 390, 'height': 844})):
        ctx = br.new_context(viewport=vp, is_mobile=vp['width'] < 500, has_touch=vp['width'] < 500)
        ctx.route('**/googletagmanager.com/**', lambda r: r.abort())
        if PAGE:
            ctx.route(URL + '*', lambda r: r.fulfill(status=200, content_type='text/html; charset=utf-8', body=PAGE) if r.request.url.split('?')[0] == URL else r.continue_())
        pg = ctx.new_page()
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(URL); pg.wait_for_selector('#awRows .wdd-row', timeout=20000); pg.wait_for_timeout(800)
        H = pg.evaluate('document.documentElement.scrollHeight')
        check(vpn + ' page height under 9000 px', H < 9000, H)
        check(vpn + ' 50 rows per page', pg.locator('#awRows .wdd-row').count() == 50)
        check(vpn + ' opens at top', pg.evaluate('scrollY') == 0)
        check(vpn + ' no sideways scroll', pg.evaluate('document.documentElement.scrollWidth - innerWidth') <= 1, pg.evaluate('document.documentElement.scrollWidth - innerWidth'))
        stats = pg.inner_text('.wdd-stats')
        check(vpn + ' totals filled', '…' not in stats, stats)
        # views
        pg.click('#wddViews [data-view="est"]'); pg.wait_for_timeout(300)
        picks = pg.eval_on_selector_all('#awRows .wdd-row', 'rs => rs.map(r => r.getAttribute("href"))')
        check(vpn + ' established view filters', len(picks) > 0 and 'view=est' in pg.url, pg.url)
        # search by number
        first = pg.get_attribute('#awRows .wdd-row', 'href'); num = first.strip('/').split('th-')[-1]
        pg.fill('#awSearch', num); pg.wait_for_timeout(500)
        check(vpn + ' search by tracking number', pg.locator('#awRows .wdd-row').count() >= 1 and pg.get_attribute('#awRows .wdd-row', 'href') == first, num)
        pg.fill('#awSearch', ''); pg.wait_for_timeout(400)
        pg.click('#wddViews [data-view="all"]'); pg.wait_for_timeout(300)
        # page 2, then open a profile and come back
        pg.click('#wddPager [data-page="1"]'); pg.wait_for_timeout(400)
        check(vpn + ' page 2 in URL', 'page=2' in pg.url, pg.url)
        pg.evaluate('scrollTo(0, document.getElementById("awRows").getBoundingClientRect().top + scrollY + 600)'); pg.wait_for_timeout(200)
        y0 = pg.evaluate('scrollY'); target = pg.locator('#awRows .wdd-row').nth(12)
        href = target.get_attribute('href'); target.click()
        pg.wait_for_url('**' + href, timeout=20000); pg.wait_for_load_state('domcontentloaded')
        check(vpn + ' row opens the profile', href in pg.url, pg.url)
        pg.go_back(); pg.wait_for_selector('#awRows .wdd-row', timeout=20000); pg.wait_for_timeout(1500)
        check(vpn + ' back returns to page 2', 'page=2' in pg.url and pg.inner_text('#wddPager').find('2 /') >= 0, pg.url)
        check(vpn + ' back keeps the scroll spot', abs(pg.evaluate('scrollY') - y0) < 120, (y0, pg.evaluate('scrollY')))
        # sort header
        pg.evaluate('scrollTo(0,0)')
        if vpn == 'desktop':
            pg.click('.aw-sort[data-sort="roi"]'); pg.wait_for_timeout(300)
            check(vpn + ' header sort', 'sort=roi' in pg.url, pg.url)
        pg.select_option('#awSource', 'covers'); pg.wait_for_timeout(300)
        srcs = set(pg.eval_on_selector_all('#awRows .wdd-row small:not(.wdd-tier)', 'e => e.map(x => x.textContent)'))
        check(vpn + ' source filter', srcs == {'Covers'}, srcs)
        html = pg.content()
        check(vpn + ' no identity leak (no real handles in links)', all(h.startswith('/around-the-web/th-') for h in pg.eval_on_selector_all('#awRows a', 'e => e.map(x => x.getAttribute("href"))')))
        check(vpn + ' no page errors', not errs, errs[:2])
        pg.goto(URL); pg.wait_for_selector('#awRows .wdd-row'); pg.wait_for_timeout(500)
        pg.screenshot(path=os.path.join(S, 'dir_%s.png' % vpn), full_page=False)
        ctx.close()
    br.close()
print('RESULT', 'PASS' if all(res) else 'FAIL', '%d/%d' % (sum(res), len(res)))
