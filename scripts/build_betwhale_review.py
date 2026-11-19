"""Build /betwhale-review/ from the /best-online-sportsbooks/ shell.
Usage: python build_betwhale.py <repo> <affiliate_url>"""
import re, sys, pathlib

repo = pathlib.Path(sys.argv[1]); AFF = sys.argv[2]
src = (repo / "best-online-sportsbooks/index.html").read_text(encoding="utf-8")
head = src[: src.index("<body")]
body_tag = re.search(r"<body[^>]*>", src).group(0)
tail_scripts = src[src.index('<script src="/static/js/tmr-session'):]

URL = "https://trustmyrecord.com/betwhale-review/"
TITLE = "Betwhale Review 2026: 200% Sports Bonus up to $6,000 | TrustMyRecord"
DESC = ("Betwhale review for 2026. A 200% sports welcome bonus up to $6,000, 30+ sports, live betting, "
        "Bet Builder and cash out, crypto deposits from $20. Every term, limit and payout rule explained.")
OGT = "Betwhale Review 2026: 200% Sports Bonus up to $6,000"
OGD = "The biggest sports welcome bonus we list, with every rollover, limit and payout rule spelled out."

def sub1(pat, rep, s):
    n = re.subn(pat, rep, s, count=1)
    assert n[1] == 1, pat
    return n[0]

head = sub1(r'<link rel="canonical" href="[^"]+">', f'<link rel="canonical" href="{URL}">', head)
head = sub1(r"<title>[^<]+</title>", f"<title>{TITLE}</title>", head)
head = sub1(r'<meta name="description" content="[^"]+">', f'<meta name="description" content="{DESC}">', head)
head = sub1(r'<meta property="og:title" content="[^"]+">', f'<meta property="og:title" content="{OGT}">', head)
head = sub1(r'<meta property="og:description" content="[^"]+">', f'<meta property="og:description" content="{OGD}">', head)
head = sub1(r'<meta property="og:url" content="[^"]+">', f'<meta property="og:url" content="{URL}">', head)
head = sub1(r'<meta name="twitter:title" content="[^"]+">', f'<meta name="twitter:title" content="{OGT}">', head)
head = sub1(r'<meta name="twitter:description" content="[^"]+">', f'<meta name="twitter:description" content="{OGD}">', head)
head = head.replace("<!-- BEST_ONLINE_SPORTSBOOKS_20260906 -->", "<!-- BETWHALE_REVIEW_20261119 -->")
head = head.replace("suppressed on /best-online-sportsbooks/", "suppressed on /betwhale-review/")
head = head.replace("</head>", """<style>
  .bk-banner img.bw-logo{max-height:78px}
  .bw-states{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0 0}
  .bw-states span{border:1px solid var(--as-border);border-radius:999px;padding:5px 12px;font-size:13px}
</style>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[
{"@type":"Question","name":"What is the Betwhale sports welcome bonus?","acceptedAnswer":{"@type":"Answer","text":"200% on your first deposit up to $6,000, minimum deposit $50. It carries a 10x rollover on deposit plus bonus within 30 days and a maximum win of 20 times your deposit. It cannot be combined with the casino welcome bonus."}},
{"@type":"Question","name":"How fast does Betwhale pay out?","acceptedAnswer":{"@type":"Answer","text":"Betwhale lists 3 to 5 business days for Bitcoin, Tether (TRC20), bank wire and card payouts, from $150 up to $2,500 per payout, with no payout fees."}},
{"@type":"Question","name":"Which US states does Betwhale restrict?","acceptedAnswer":{"@type":"Answer","text":"Betwhale's terms list Louisiana, Michigan, Mississippi, Tennessee and Minnesota as restricted, along with several countries."}}
]}</script>
</head>""", 1)

A = f'href="{AFF}" target="_blank" rel="nofollow sponsored noopener"'

body = f"""{body_tag}

    <div class="as-hero">
        <div class="as-hero-inner">
            <nav class="as-breadcrumb" aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/best-online-sportsbooks/">Best Online Sportsbooks</a> / Betwhale Review</nav>
            <span class="as-kicker">TrustMyRecord Sportsbook Review</span>
            <h1>Betwhale <span class="gold">Review</span> for 2026</h1>
            <p class="lede">Betwhale runs the biggest sports welcome offer we list anywhere on TrustMyRecord: 200% on your first deposit, up to $6,000. Behind it sits a full board of more than 30 sports, live betting around the clock, Bet Builder, cash out and early payout markets, with crypto deposits that land in about 15 minutes. Here is everything it offers, and every term worth knowing before you deposit.</p>
            <div class="as-actions">
                <a class="as-btn as-btn-gold" {A}><i class="fas fa-gift"></i> Claim the 200% bonus</a>
                <a class="as-btn as-btn-outline" href="/best-online-sportsbooks/"><i class="fas fa-list"></i> Compare our other books</a>
            </div>
        </div>
    </div>

    <div class="as-main">

        <div class="as-section">
            <div class="bk-wrap">
                <section class="bk top" id="betwhale" style="--accent:#F9B035;--glow:rgba(249,176,53,.22)">
                    <a class="bk-hit" {A} tabindex="-1" aria-hidden="true">Join Betwhale</a>
                    <div class="bk-banner">
                        <span class="bk-ribbon"><i class="fas fa-gift"></i> Biggest welcome bonus</span>
                        <img class="bw-logo" src="/static/media/betwhale-logo.svg" alt="Betwhale sportsbook logo" width="149" height="61" loading="eager">
                    </div>

                    <div class="bk-intro">
                        <h2>Betwhale</h2>
                        <p class="lede2 m">A modern sportsbook and casino that leans hard into value for new players. The sports welcome bonus triples your first deposit up to $6,000, the board covers every major American league plus soccer, tennis, fighting, racing and esports, and the cashier takes cards, PayPal and seven cryptocurrencies. Bet Builder, cash out and early payout put it ahead of plenty of older offshore books on features.</p>
                        <div class="bk-go">
                            <a class="gobtn" {A}><i class="fas fa-arrow-right"></i> Join Betwhale and claim 200%</a>
                            <span class="gonote m2">Opens Betwhale. Affiliate link, costs you nothing.</span>
                        </div>
                    </div>

                    <div class="bk-body">

                        <div class="bk-hl">
                            <div><b>200% to $6,000</b><span class="m">Sports welcome bonus on your first deposit</span></div>
                            <div><b>30+ sports</b><span class="m">Including NFL, NBA, MLB, NHL, college, UFC and esports</span></div>
                            <div><b>About 15 min</b><span class="m">Crypto deposits credited, from $20</span></div>
                            <div><b>$0</b><span class="m">Payout fees, on every withdrawal method</span></div>
                        </div>

                        <div class="sub"><i class="fas fa-thumbs-up"></i> Why we like it</div>
                        <div class="bk-why">
                            <div>
                                <h4><i class="fas fa-gift"></i> A welcome offer nobody else matches</h4>
                                <p class="m">200% means a $500 deposit becomes $1,500 to bet with, and the bonus scales all the way to $6,000. The rollover is 10 times deposit plus bonus inside 30 days, which is a real commitment, so this offer suits a bettor who was going to put that volume through anyway.</p>
                            </div>
                            <div>
                                <h4><i class="fas fa-layer-group"></i> Features the old books still lack</h4>
                                <p class="m">Bet Builder for combining markets inside one game, cash out before and during play, early payout markets that settle your ticket when the condition is hit, and Comboboost that lifts parlay returns as you add legs.</p>
                            </div>
                            <div>
                                <h4><i class="fas fa-tower-broadcast"></i> Live betting all day</h4>
                                <p class="m">In play markets run 24 hours a day, seven days a week, with hundreds of player props across football, basketball and hockey and full futures boards for every major league.</p>
                            </div>
                            <div>
                                <h4><i class="fas fa-coins"></i> Easy to fund</h4>
                                <p class="m">Bitcoin, Litecoin, Ethereum, XRP, BNB, Dogecoin, Solana, USDT and USDC, plus Visa, Mastercard, Amex, Discover, PayPal, Neosurf and Flexepin. Crypto lands in about 15 minutes and cards and PayPal are instant.</p>
                            </div>
                            <div>
                                <h4><i class="fas fa-hand-holding-dollar"></i> No payout fees</h4>
                                <p class="m">Betwhale does not charge a fee on any withdrawal, whether you cash out in Bitcoin, Tether, bank wire or back to your card.</p>
                            </div>
                            <div>
                                <h4><i class="fas fa-headset"></i> A phone that answers</h4>
                                <p class="m">Live chat on every page and a toll free line at +1 855 470 0558, plus self exclusion and deposit limits available on request through support.</p>
                            </div>
                        </div>

                        <div class="sub"><i class="fas fa-gift"></i> Bonuses and promotions</div>
                        <div class="bonus">
                            <div class="bo"><b>200%</b><h6>Sports welcome, up to $6,000</h6><p class="m">First deposit only, minimum $50. Rollover 10x deposit plus bonus within 30 days, maximum win 20x your deposit.</p></div>
                            <div class="bo"><b>250%</b><h6>Casino welcome, up to $2,500</h6><p class="m">First deposit, minimum $20. Rollover 30x deposit plus bonus. Pick this or the sports bonus, not both.</p></div>
                            <div class="bo"><b>Up to 2x</b><h6>Comboboost on parlays</h6><p class="m">Parlay returns get a multiplier that grows with every leg, from 1.02 at three legs to 1.2 at ten and 2.0 at twenty. Legs must be 1.50 decimal or longer.</p></div>
                        </div>
                        <p class="terms m"><strong>The honest bonus note:</strong> the sports bonus has to be claimed in the cashier before you bet the deposit, and only one bonus can be active at a time. While it is active, legs need odds of 1.50 decimal or longer, outright futures are excluded, and you cannot parlay two selections from the same event. If you plan to withdraw quickly, skip the bonus and your deposit stays free to cash out once it has been wagered once.</p>

                        <details class="more"><summary><i class="fas fa-table-list"></i> Everything on offer: products, sports, wager types and banking</summary>
                        <div class="offer">
                            <div class="ocard">
                                <h5><i class="fas fa-dice"></i> Products</h5>
                                <ul><li>Sportsbook</li><li>Live betting</li><li>Bet Builder</li><li>Cash out</li><li>Early payout</li><li>Casino</li><li>Live dealer</li><li>Mobile browser play</li></ul>
                            </div>
                            <div class="ocard">
                                <h5><i class="fas fa-football"></i> Sports covered</h5>
                                <ul><li>NFL</li><li>NCAA football</li><li>NBA</li><li>NCAA basketball</li><li>MLB</li><li>NHL</li><li>MLS</li><li>Soccer</li><li>Champions League</li><li>Tennis</li><li>UFC and MMA</li><li>Horse racing</li><li>Greyhounds</li><li>Esports</li></ul>
                            </div>
                            <div class="ocard">
                                <h5><i class="fas fa-shapes"></i> Wager types</h5>
                                <ul><li>Straight bets</li><li>Parlays</li><li>System bets</li><li>Trixie and Patent</li><li>Yankee and Canadian</li><li>Heinz and Goliath</li><li>Player props</li><li>Futures</li><li>Live in play</li><li>Bet Builder</li></ul>
                            </div>
                            <div class="ocard">
                                <h5><i class="fas fa-building-columns"></i> Banking</h5>
                                <p class="m">Deposits: crypto from $20 (USDT and USDC from $40) with no upper limit, Visa, Mastercard, Amex and Discover $30 to $1,000, PayPal $30 to $9,000, Neosurf $10 to $250, Flexepin $20 to $500. Withdrawals: Bitcoin, Tether TRC20, bank wire or card, $150 to $2,500 per payout, 3 to 5 business days, no fees. ID verification is requested within your first three deposits.</p>
                            </div>
                        </div></details>

                        <div class="bk-cta">
                            <a class="as-btn as-btn-gold" {A}><i class="fas fa-arrow-right"></i> Open a Betwhale account</a>
                            <span class="note m2">Affiliate link. Costs you nothing and does not change your price.</span>
                        </div>
                    </div>
                </section>
            </div>
        </div>

        <div class="as-section">
            <div class="as-section-head"><h2><i class="fas fa-scale-balanced"></i> Betwhale at a glance</h2></div>
            <div class="cmp-scroll">
                <table class="cmp">
                    <thead><tr><th></th><th>Betwhale</th></tr></thead>
                    <tbody>
                        <tr><th class="m">Sports welcome bonus</th><td>200% up to $6,000, minimum deposit $50</td></tr>
                        <tr><th class="m">Bonus rollover</th><td>10x deposit plus bonus within 30 days</td></tr>
                        <tr><th class="m">Casino welcome bonus</th><td>250% up to $2,500, 30x rollover</td></tr>
                        <tr><th class="m">Crypto deposits</th><td>BTC, LTC, ETH, XRP, BNB, DOGE, SOL, USDT, USDC</td></tr>
                        <tr><th class="m">Other deposits</th><td>Visa, Mastercard, Amex, Discover, PayPal, Neosurf, Flexepin</td></tr>
                        <tr><th class="m">Payout methods</th><td>Bitcoin, Tether TRC20, bank wire, card</td></tr>
                        <tr><th class="m">Payout window</th><td>3 to 5 business days</td></tr>
                        <tr><th class="m">Payout size</th><td>$150 to $2,500 per payout</td></tr>
                        <tr><th class="m">Payout fees</th><td>None</td></tr>
                        <tr><th class="m">Live betting</th><td>Yes, 24/7</td></tr>
                        <tr><th class="m">Bet Builder and cash out</th><td>Yes</td></tr>
                        <tr><th class="m">Currencies</th><td>USD, CAD, AUD, EUR</td></tr>
                        <tr><th class="m">Support</th><td>Live chat, phone +1 855 470 0558</td></tr>
                        <tr><th class="m">License</th><td>Anjouan, Union of Comoros, per Betwhale's FAQ</td></tr>
                    </tbody>
                </table>
            </div>
        </div>

        <div class="as-section">
            <div class="as-section-head"><h2><i class="fas fa-user-check"></i> Who Betwhale suits</h2></div>
            <div class="pick2">
                <div class="p2">
                    <h4>Open Betwhale if</h4>
                    <p class="m">You want the most bonus money on your first deposit, you bet parlays and same game combinations through Bet Builder, or you like cashing out early. Funding is fast in crypto, card or PayPal, and the board is wide enough for every sport you follow.</p>
                </div>
                <div class="p2">
                    <h4>Look elsewhere if</h4>
                    <p class="m">You need large withdrawals the same day. Betwhale pays in 3 to 5 business days at up to $2,500 per payout, so if speed and size of payout matter most, <a href="/best-online-sportsbooks/">JustBet and YouWager</a> are faster.</p>
                </div>
                <div class="p2">
                    <h4>Best of all, hold two books</h4>
                    <p class="m">Line shopping is the easiest edge in betting. Keep Betwhale for its bonus and features and a second book for fast payouts, take the better number on every play, and collect two welcome offers instead of one.</p>
                </div>
            </div>
        </div>

        <div class="as-section">
            <div class="as-section-head"><h2><i class="fas fa-circle-question"></i> Questions people actually ask</h2></div>
            <div class="faqx">
                <details open><summary>What is the Betwhale sports welcome bonus?</summary><p class="m">200% on your first deposit, up to $6,000, with a $50 minimum. It carries a 10x rollover on deposit plus bonus inside 30 days and a maximum win of 20 times your deposit. It is one per account and cannot be combined with the casino welcome bonus.</p></details>
                <details><summary>How fast does Betwhale pay out?</summary><p class="m">Betwhale lists 3 to 5 business days for Bitcoin, Tether TRC20, bank wire and card payouts, from $150 up to $2,500 per payout, and charges no payout fees. Before your first withdrawal you need to have wagered your deposit at least once and completed ID verification.</p></details>
                <details><summary>Which US states does Betwhale restrict?</summary><p class="m">Betwhale's terms list Louisiana, Michigan, Mississippi, Tennessee and Minnesota as restricted, along with Georgia (the country), Israel, the Netherlands, Russia, Ukraine and the United Kingdom. VPN use is prohibited.</p></details>
                <details><summary>Does Betwhale have an app?</summary><p class="m">There is nothing to download. The full sportsbook and casino run in your phone's browser, so you can bet live from anywhere.</p></details>
                <details><summary>What can I deposit with?</summary><p class="m">Bitcoin, Litecoin, Ethereum, XRP, BNB, Dogecoin and Solana from $20, USDT and USDC from $40, Visa, Mastercard, Amex and Discover from $30 to $1,000, PayPal from $30 to $9,000, Neosurf and Flexepin. Crypto credits in about 15 minutes, cards and PayPal instantly.</p></details>
                <details><summary>Does TrustMyRecord get paid for this?</summary><p class="m">Yes. The links on this page are affiliate links and we are paid if you open an account through them. It costs you nothing, it does not change the price you get, and it does not change what we write.</p></details>
            </div>
        </div>

        <div class="as-section">
            <div class="as-section-head"><h2><i class="fas fa-shield-halved"></i> The honest part</h2></div>
            <p class="disc m">Betwhale is an offshore sportsbook. There is no domestic regulator holding your balance and no deposit insurance, so withdraw regularly instead of letting a balance sit, keep your own record of every wager and payout, read the rollover before you accept any bonus, and never play with money you cannot afford to lose. Betwhale is for adults 18 and over, and it is your responsibility to know the law where you live. If betting has stopped being entertainment, stop and get help. In the United States the National Problem Gambling Helpline is 1-800-522-4700, free and confidential, 24 hours a day.<br><br>The links on this page are affiliate links. TrustMyRecord is paid if you open an account through them. Bonus terms, payout speeds, limits and promotions are set by Betwhale and can change without notice, so confirm current terms on its site before you deposit. Every figure on this page was read from Betwhale's own published pages on 19 November 2026.</p>
        </div>

        <div class="as-section">
            <div class="as-section-head"><h2><i class="fas fa-chart-simple"></i> Then track what you bet</h2></div>
            <div class="pick2">
                <div class="p2"><h4>Post your picks</h4><p class="m">Log every play on TrustMyRecord, free, and it is graded from final scores automatically. <a href="/register/">Start your free record</a>.</p></div>
                <div class="p2"><h4>Shop the board first</h4><p class="m">Compare today's prices before you place anything. <a href="/sportsbook/">Open the odds board</a> or use <a href="/line-shopping/">line shopping</a>.</p></div>
                <div class="p2"><h4>See who is actually winning</h4><p class="m">Every record here is graded, public and permanent. <a href="/leaderboards/">Browse the leaderboards</a>.</p></div>
            </div>
        </div>

    </div>

<div class="stickycta" id="stickyCta" aria-hidden="true">
    <a class="sjb" {A}><i class="fas fa-gift"></i> Claim 200% at Betwhale</a>
</div>

<script>
/* AFFILIATE_INSTRUMENTATION betwhale-review */
(function () {{
  'use strict';
  var AFF = {AFF!r};
  function placementOf(a) {{
    if (a.classList.contains('bk-hit')) return 'card_body';
    if (a.closest('.stickycta')) return 'sticky_mobile';
    if (a.closest('.bk-go')) return 'card_cta_top';
    if (a.closest('.bk-cta')) return 'card_cta_bottom';
    if (a.closest('.as-hero')) return 'hero';
    return 'other';
  }}
  document.addEventListener('click', function (e) {{
    var a = e.target.closest('a');
    if (!a || a.getAttribute('href') !== AFF || typeof window.gtag !== 'function') return;
    window.gtag('event', 'affiliate_click', {{ book: 'betwhale', placement: placementOf(a), page: 'betwhale-review' }});
  }}, true);
  var bar = document.getElementById('stickyCta'), first = document.getElementById('betwhale');
  if (!bar || !first) return;
  function sync() {{
    var past = first.getBoundingClientRect().bottom < 0;
    bar.classList.toggle('on', past);
    bar.setAttribute('aria-hidden', past ? 'false' : 'true');
    document.body.classList.toggle('has-stickycta', past);
  }}
  addEventListener('scroll', sync, {{ passive: true }});
  addEventListener('resize', sync, {{ passive: true }});
  sync();
}})();
</script>

"""
out = repo / "betwhale-review/index.html"
out.parent.mkdir(exist_ok=True)
out.write_text(head + body + tail_scripts, encoding="utf-8")
print("wrote", out, len(head + body + tail_scripts))
