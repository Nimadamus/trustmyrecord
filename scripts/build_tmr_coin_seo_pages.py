# -*- coding: utf-8 -*-
"""
Builds the TMR Coin SEO landing pages.

WHY A GENERATOR AND NOT FOUR HAND-WRITTEN FILES

The existing /sports-picks-leaderboard/ page carries the whole SEO shell inline:
about 11KB of head, fonts, analytics and the ss-* stylesheet. Re-typing that four
times guarantees four slightly different pages and four places to fix a design
change. This clones the shell verbatim from that page and swaps only what is
genuinely per-page: canonical, title, description, social tags, schema, body.

EVERY CLAIM IN THE COPY IS ONE THAT WAS VERIFIED ON 2026-08-18 against Base, the
production ledger, or the live endpoints. No traction, holders, partners or
volume are described, because there are none. Numbers that will move (price,
liquidity, holders, member activity) are deliberately NOT baked into these pages;
they live on /tmr-coin/transparency/ where they are read live. A baked number is
a stale number the day after it is written.

    python scripts/build_tmr_coin_seo_pages.py
"""

import io
import os
import re
import json

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEMPLATE = os.path.join(ROOT, 'sports-picks-leaderboard', 'index.html')

CLUSTER = '''
<!-- tmr-internal-cluster : SEO internal linking (insert-only) -->
<section class="tmr-internal-cluster" aria-label="More about TMR Coin" style="max-width:1140px;margin:46px auto 0;padding:26px 22px;background:#FFFFFF;border:1px solid #D2DEEA;border-radius:18px;font-family:'Inter',system-ui,sans-serif;">
  <h2 style="font-family:'Barlow','Inter',sans-serif;font-weight:800;font-size:1.15rem;color:#07182A;margin:0 0 14px;">More about TMR Coin</h2>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:10px 18px;">
{links}
  </div>
</section>

</body>
</html>
'''

CLUSTER_LINKS = [
    ('/tmr-coin/', 'TMR Coin, live on Base'),
    ('/tmr-coin/transparency/', 'Live transparency figures'),
    ('/how-tmr-coin-works/', 'How TMR Coin works'),
    ('/tmr-coin/partners/', 'For partners and integrations'),
    ('/sports-community-coin/', 'What a sports community coin is'),
    ('/peer-to-peer-sports-challenges/', 'Peer to peer sports challenges'),
    ('/sports-picks-rewards-and-tipping/', 'Rewards and tipping'),
    ('/tmr-coin-utility/', 'TMR Coin utility'),
    ('/leaderboards/', 'Sports betting leaderboards'),
]


def cluster_for(slug):
    rows = []
    for href, label in CLUSTER_LINKS:
        if href == '/%s/' % slug:
            continue
        rows.append(
            '    <a href="%s" style="color:#07736D;text-decoration:none;font-weight:600;'
            'font-size:0.95rem;padding:4px 0;display:inline-flex;align-items:center;gap:8px;">'
            '<span style="color:#B98505;">&rsaquo;</span>%s</a>' % (href, label)
        )
    return CLUSTER.replace('{links}', '\n'.join(rows))


PAGES = [
    {
        'slug': 'sports-community-coin',
        'title': 'Sports Community Coin | What It Is and Why Picks Communities Need One | TrustMyRecord',
        'description': 'A sports community coin is a shared unit a picks community earns, spends and competes with. Here is what TMR Coin does on TrustMyRecord, what is live today, and what is not.',
        'og_title': 'Sports Community Coin | TrustMyRecord',
        'og_description': 'What a sports community coin actually is, and what TMR Coin does on TrustMyRecord today.',
        'crumb': 'Sports Community Coin',
        'kicker': ('fas fa-coins', 'TMR Coin'),
        'h1': 'Sports Community <span class="gold">Coin</span>',
        'sub': 'Picks communities already keep score. A community coin is what turns that scorekeeping into something you can earn, spend and compete with.',
        'tagline': '<span class="blue">Being right is the whole game.</span> <span class="gold">A coin just makes it count for something.</span>',
        'actions': [('btn btn-gold', '/tmr-coin/', 'fas fa-circle-info', 'What TMR Coin is'),
                    ('btn btn-outline', '/register/', 'fas fa-user-plus', 'Start earning free')],
        'body': '''
    <section class="ss-section">
        <div class="ss-section-head"><h2>What a sports community coin actually <span class="gold">is</span></h2></div>
        <div class="ss-intro">
            <p>Every sports picks community runs on the same informal ledger. Somebody called the game. Somebody else fought them on it. By Sunday night everyone knows who was right, and none of it is written down anywhere that survives the thread.</p>
            <p>A sports community coin is that ledger made real. One shared unit, earned by being right and spent inside the community, so a good call pays something and a record is worth carrying.</p>
            <p>It is not a payment method for buying picks, and it is not a bet against a house. It is closer to what a chip is at a card table: the thing the game is played with.</p>
        </div>
    </section>

    <section class="ss-section">
        <div class="ss-section-head"><h2>Why a picks community needs <span class="gold">one</span></h2><p>Four problems every betting community has, and what a shared unit does about them.</p></div>
        <div class="ss-cards">
            <div class="ss-card"><i class="fas fa-clock-rotate-left"></i><h3>Nothing settles</h3><p>Arguments end when the thread dies, not when the game does. A graded result plus a unit means the argument settles itself.</p></div>
            <div class="ss-card"><i class="fas fa-trophy"></i><h3>Winning pays nothing</h3><p>Being right earns a reply and a like. A shared unit gives it a consequence that lasts past the scroll.</p></div>
            <div class="ss-card"><i class="fas fa-user-group"></i><h3>No way to back yourself</h3><p>Two members who disagree have nowhere to put it except a sportsbook that has nothing to do with either of them.</p></div>
            <div class="ss-card"><i class="fas fa-ranking-star"></i><h3>Reputation does not travel</h3><p>A leaderboard row lives and dies inside one site. A token on a public chain does not.</p></div>
        </div>
    </section>

    <section class="ss-section">
        <div class="ss-section-head"><h2>How TMR Coin <span class="gold">works</span></h2><p>Two places it lives, and they are not the same thing.</p></div>
        <div class="ss-pillars">
            <div class="ss-pillar"><i class="fas fa-medal"></i><h3>Earned on the site</h3><p>Winning picks, correct predictions, qualified trivia and forum activity pay TMR. It is instant, costs no gas, and is spent on site features.</p></div>
            <div class="ss-pillar"><i class="fas fa-link"></i><h3>Held on Base</h3><p>A fixed supply ERC-20 anyone can buy, hold and transfer in their own wallet, with no owner, no mint function and no way for us to alter it.</p></div>
            <div class="ss-pillar"><i class="fas fa-ban"></i><h3>Not yet connected</h3><p>Blockchain withdrawal is not active, so a balance earned on the site cannot be sent to an outside wallet or sold today. We say so on every page rather than implying otherwise.</p></div>
        </div>
    </section>

    <section class="ss-section">
        <div class="ss-section-head"><h2>What is live <span class="gold">today</span></h2><p>All of it is checkable without asking us for anything.</p></div>
        <div class="ss-intro">
            <p><strong>The token.</strong> TMR Coin is deployed on Base at a verified contract with a fixed supply of 1,000,000,000 and no mint, owner, pause, blacklist, tax or upgrade path. Nobody, including TrustMyRecord, can print more of it or alter it.</p>
            <p><strong>The market.</strong> A public Uniswap v3 pool has been open since 17 August 2026, so anyone with a wallet can trade without going through us. Liquidity is deliberately very small and trades of roughly twenty dollars or more will not fill, which is disclosed everywhere it is relevant.</p>
            <p><strong>The earning.</strong> Seven reward rules pay TMR for real graded activity, under a yearly emission budget and a per member yearly cap.</p>
            <p><strong>The numbers.</strong> Price, liquidity, supply, holders and member activity are all published on the <a href="/tmr-coin/transparency/">transparency page</a>, read live rather than typed in, including the figures that are zero.</p>
        </div>
    </section>

    <section class="ss-section">
        <div class="ss-section-head"><h2>What it is <span class="gold">not</span></h2></div>
        <div class="ss-intro">
            <p>It is not an investment, and nothing about it is offered as one. No return, profit, price increase or future listing is promised or implied, and crypto prices are volatile enough that you can lose everything you put in.</p>
            <p>It is not a way to bet against TrustMyRecord. The platform is the referee, never the counterparty.</p>
            <p>It is not sold by us. TrustMyRecord does not sell TMR, takes no payment for it, and has never distributed tokens to members.</p>
        </div>
    </section>

    <section class="ss-cta">
        <h2>Start with the free <span class="gold">half</span></h2>
        <p>Post picks, get them graded, and earn TMR for being right. No wallet, no purchase, nothing to connect.</p>
        <div class="ss-cta-actions">
            <a class="btn btn-gold" href="/register/"><i class="fas fa-user-plus"></i> Create a free account</a>
            <a class="btn btn-outline" href="/tmr-coin/"><i class="fas fa-circle-info"></i> Read the TMR Coin page</a>
        </div>
    </section>
''',
        'faq': [
            ('What is a sports community coin?',
             'A shared unit a sports picks community earns, spends and competes with, so that being right pays something and a record is worth carrying. On TrustMyRecord that unit is TMR Coin.'),
            ('Do I have to buy anything?',
             'No. TMR is earned free by competing on TrustMyRecord: winning picks, correct predictions, qualified trivia and forum activity all pay. Buying the on-chain token is a separate and entirely optional thing.'),
            ('Is TMR Coin an investment?',
             'No. Nothing about TMR is offered as an investment and no return, profit or increase in value is promised or implied. Crypto prices are volatile and you can lose everything you put in.'),
            ('Can I withdraw what I earn?',
             'Not today. Blockchain withdrawal and redemption are not active, so a balance earned on the site cannot be sent to an outside wallet or sold externally.'),
        ],
    },
    {
        'slug': 'peer-to-peer-sports-challenges',
        'title': 'Peer to Peer Sports Challenges | Member vs Member on TrustMyRecord',
        'description': 'A peer to peer sports challenge is one member against another on a graded outcome, settled by the same engine that grades picks. Here is how challenges work on TrustMyRecord and what is live.',
        'og_title': 'Peer to Peer Sports Challenges | TrustMyRecord',
        'og_description': 'One member against another on a graded outcome, with no house on the other side. How challenges work on TrustMyRecord.',
        'crumb': 'Peer to Peer Sports Challenges',
        'kicker': ('fas fa-user-group', 'Member vs Member'),
        'h1': 'Peer to Peer Sports <span class="gold">Challenges</span>',
        'sub': 'Two members, one graded outcome, and a platform that referees instead of taking the other side.',
        'tagline': '<span class="blue">No house.</span> <span class="gold">Just whoever was right.</span>',
        'actions': [('btn btn-gold', '/tmr-coin/', 'fas fa-coins', 'How TMR Coin works'),
                    ('btn btn-outline', '/register/', 'fas fa-user-plus', 'Create a free account')],
        'body': '''
    <section class="ss-section">
        <div class="ss-section-head"><h2>What a peer to peer challenge <span class="gold">is</span></h2></div>
        <div class="ss-intro">
            <p>A challenge is one member saying something specific about a game, another member taking the other side, and both of them staking TMR on it. When the game is graded, the stake goes to whoever was right.</p>
            <p>The important word is peer. A sportsbook is the counterparty to every bet it takes, which is why its price has a margin in it. A challenge has no counterparty at all: the other side is another member who wanted that side, and the platform only decides who won.</p>
        </div>
    </section>

    <section class="ss-section">
        <div class="ss-section-head"><h2>How it <span class="gold">settles</span></h2><p>The same grading that already runs the records runs the challenge.</p></div>
        <div class="ss-pillars">
            <div class="ss-pillar"><i class="fas fa-handshake"></i><h3>Both sides funded first</h3><p>Acceptance moves both stakes into escrow. A challenge nobody funded is a promise that fails at the worst moment.</p></div>
            <div class="ss-pillar"><i class="fas fa-scale-balanced"></i><h3>Graded, not argued</h3><p>Settlement reads the completed result through the same engine that grades picks, so neither member decides the outcome.</p></div>
            <div class="ss-pillar"><i class="fas fa-lock"></i><h3>Accounted end to end</h3><p>Every stake, refund and payout is a double entry ledger row, checked by accounting invariants that fail closed rather than quietly drifting.</p></div>
        </div>
    </section>

    <section class="ss-section">
        <div class="ss-section-head"><h2>Challenge vs <span class="gold">sportsbook</span></h2><p>Different things, and the difference is the point.</p></div>
        <div class="ss-compare-wrap">
            <table class="ss-compare">
                <thead><tr><th></th><th>Sportsbook</th><th>Group chat bet</th><th class="tmr">TMR challenge</th></tr></thead>
                <tbody>
                    <tr><td>Who is on the other side</td><td class="no">The house</td><td>Your friend</td><td class="tmr"><span class="yes">Another member</span></td></tr>
                    <tr><td>Who decides the result</td><td class="no">The house</td><td class="no">Whoever argues hardest</td><td class="tmr"><span class="yes">The grading engine</span></td></tr>
                    <tr><td>Is the stake actually held</td><td>Yes</td><td class="no">No</td><td class="tmr"><span class="yes">Escrowed on both sides</span></td></tr>
                    <tr><td>Does it change your public record</td><td class="no">No</td><td class="no">No</td><td class="tmr"><span class="yes">Yes</span></td></tr>
                    <tr><td>Real money at risk</td><td class="no">Yes</td><td>Sometimes</td><td class="tmr"><span class="yes">No, TMR earned on the site</span></td></tr>
                </tbody>
            </table>
        </div>
    </section>

    <section class="ss-section">
        <div class="ss-section-head"><h2>Where this stands <span class="gold">today</span></h2></div>
        <div class="ss-intro">
            <p>The challenge system is built, tested and running in production, and the order book that turns a resting offer into a challenge is built on top of the same settlement engine rather than beside it.</p>
            <p>What it does not have yet is use. At the time of writing no member has run a real challenge, and the live count is published on the <a href="/tmr-coin/transparency/">transparency page</a> whatever it says. A feature that exists and is unused is a fact worth stating plainly; describing it as adoption would not be.</p>
            <p>Challenges are staked in TMR earned on the site. That balance cannot be withdrawn to a wallet or sold, so a challenge is a competition between members rather than a wager of real money.</p>
        </div>
    </section>

    <section class="ss-cta">
        <h2>Back yourself against <span class="gold">someone</span></h2>
        <p>Earn TMR by being right, then put it behind the next call you are sure about.</p>
        <div class="ss-cta-actions">
            <a class="btn btn-gold" href="/register/"><i class="fas fa-user-plus"></i> Create a free account</a>
            <a class="btn btn-outline" href="/tmr-coin/transparency/"><i class="fas fa-chart-simple"></i> See the live figures</a>
        </div>
    </section>
''',
        'faq': [
            ('Is a TMR challenge gambling?',
             'A challenge is staked in TMR earned on TrustMyRecord. That balance cannot be withdrawn to an outside wallet or sold, so no real money is wagered and TrustMyRecord is not a sportsbook.'),
            ('Who decides who won a challenge?',
             'The grading engine does, from the completed result, using the same settlement path that grades picks. Neither member decides, and neither does TrustMyRecord by hand.'),
            ('What happens to my stake while the challenge runs?',
             'Both stakes are held in escrow from the moment the challenge is accepted, and every movement is written to a double entry ledger with accounting invariants over it.'),
            ('Has anyone run a challenge yet?',
             'The live count is published on the transparency page. It is read from the database rather than written by hand, so it says whatever is true at the moment you look.'),
        ],
    },
    {
        'slug': 'sports-picks-rewards-and-tipping',
        'title': 'Sports Picks Rewards and Tipping | Earn TMR on TrustMyRecord',
        'description': 'What pays TMR on TrustMyRecord, what does not, the daily and yearly caps, and how tipping another member works. Every rule, stated exactly.',
        'og_title': 'Sports Picks Rewards and Tipping | TrustMyRecord',
        'og_description': 'Winning picks, correct predictions, trivia and forum activity pay TMR. Here is every rule and every cap.',
        'crumb': 'Rewards and Tipping',
        'kicker': ('fas fa-gift', 'Earning'),
        'h1': 'Rewards and Tipping for <span class="gold">Sports Picks</span>',
        'sub': 'What pays, what does not, and the caps that keep it honest. Free to earn, nothing to buy.',
        'tagline': '<span class="blue">Taking part is not the reward.</span> <span class="gold">Being right is.</span>',
        'actions': [('btn btn-gold', '/register/', 'fas fa-user-plus', 'Start earning free'),
                    ('btn btn-outline', '/tmr-coin/', 'fas fa-circle-info', 'What TMR Coin is')],
        'body': '''
    <section class="ss-section">
        <div class="ss-section-head"><h2>What actually <span class="gold">pays</span></h2><p>Seven live rules. These are the exact amounts.</p></div>
        <div class="ss-cards">
            <div class="ss-card"><i class="fas fa-user-plus"></i><h3>25 TMR, signing up</h3><p>Once, when you create an account.</p></div>
            <div class="ss-card"><i class="fas fa-clipboard-check"></i><h3>10 TMR, first pick</h3><p>Once, for your first sportsbook pick.</p></div>
            <div class="ss-card"><i class="fas fa-comments"></i><h3>5 TMR, first thread</h3><p>Once, for your first forum thread.</p></div>
            <div class="ss-card"><i class="fas fa-trophy"></i><h3>10 TMR, a winning pick</h3><p>Up to three a day. Only a final graded win pays.</p></div>
            <div class="ss-card"><i class="fas fa-bullseye"></i><h3>10 TMR, a correct prediction</h3><p>Up to three a day, on a graded prediction.</p></div>
            <div class="ss-card"><i class="fas fa-brain"></i><h3>10 TMR, qualified trivia</h3><p>Up to twice a day. A session must be genuinely answered to qualify.</p></div>
            <div class="ss-card"><i class="fas fa-pen"></i><h3>2 TMR, a forum thread</h3><p>Once a day, for a qualifying thread.</p></div>
        </div>
    </section>

    <section class="ss-section">
        <div class="ss-section-head"><h2>What does <span class="gold">not</span> pay</h2><p>The rules that stop this becoming a faucet.</p></div>
        <div class="ss-pillars">
            <div class="ss-pillar"><i class="fas fa-clock"></i><h3>An ungraded pick</h3><p>A pick pays when it is graded as a final win, not when it is posted and not while it is pending.</p></div>
            <div class="ss-pillar"><i class="fas fa-ban"></i><h3>Turning up</h3><p>Opening a trivia session does not pay. It has to be genuinely answered, at a real standard, to qualify.</p></div>
            <div class="ss-pillar"><i class="fas fa-repeat"></i><h3>Volume</h3><p>Daily caps mean posting more does not earn more, and every rule is also capped per member per year.</p></div>
        </div>
    </section>

    <section class="ss-section">
        <div class="ss-section-head"><h2>The limits, in <span class="gold">numbers</span></h2></div>
        <div class="ss-intro">
            <p>Issuance runs under a yearly emission budget of roughly 9,994,437 TMR, which is one percent of the unreserved treasury, and a cap of 5,000 TMR per member per year. When the budget is consumed, earning scales down and then pauses; balances already earned are never reduced, because scarcity should change what you can earn next rather than take back what you earned.</p>
            <p>Every earned TMR is backed one for one by treasury tokens set aside for it. That is a reserve of tokens, not a promise of a dollar value, and blockchain withdrawal is not active, so an earned balance cannot be sent to a wallet or sold today.</p>
        </div>
    </section>

    <section class="ss-section">
        <div class="ss-section-head"><h2>Tipping another <span class="gold">member</span></h2></div>
        <div class="ss-intro">
            <p>Someone posts the call of the week and the room wants to say something better than a like. A tip sends TMR from your balance to theirs, directly, with no cut taken by the platform.</p>
            <p>Tipping is live. Whether anybody has used it, and how much has moved, is published on the <a href="/tmr-coin/transparency/">transparency page</a> rather than described here, so the figure is never older than the moment you read it.</p>
        </div>
    </section>

    <section class="ss-section">
        <div class="ss-section-head"><h2>What you spend it <span class="gold">on</span></h2></div>
        <div class="ss-intro">
            <p>BetLegend Pro matchup reports at 5 TMR each after the free daily one, badges, profile flair, priority support and entry to selected contests. Spending destroys the TMR spent: it is not resold and it does not come back to TrustMyRecord as revenue.</p>
        </div>
    </section>

    <section class="ss-cta">
        <h2>Get paid for being <span class="gold">right</span></h2>
        <p>Free account, graded picks, and a balance that grows when your calls land.</p>
        <div class="ss-cta-actions">
            <a class="btn btn-gold" href="/register/"><i class="fas fa-user-plus"></i> Create a free account</a>
            <a class="btn btn-outline" href="/how-tmr-coin-works/"><i class="fas fa-book"></i> Read the full guide</a>
        </div>
    </section>
''',
        'faq': [
            ('How do I earn TMR on TrustMyRecord?',
             'Seven live rules pay: 25 TMR for signing up, 10 for your first pick, 5 for your first forum thread, then 10 for a pick graded as a win up to three a day, 10 for a correct prediction up to three a day, 10 for a qualified trivia session up to twice a day, and 2 for a qualifying forum thread once a day.'),
            ('Does posting a pick pay by itself?',
             'No. A pick pays when it is graded as a final win. Posting, pending picks and losses do not pay.'),
            ('Is there a limit on how much I can earn?',
             'Yes. Daily caps apply per rule, every member is capped at 5,000 TMR per year, and total issuance runs under a yearly emission budget of roughly 9,994,437 TMR.'),
            ('Can I cash out tips or rewards?',
             'Not today. Blockchain withdrawal and redemption are not active, so an earned balance cannot be sent to an outside wallet or sold externally.'),
        ],
    },
    {
        'slug': 'tmr-coin-utility',
        'title': 'TMR Coin Utility | What You Can Actually Do With It | TrustMyRecord',
        'description': 'What TMR Coin does today: earning, spending, tipping, challenges, reports and access, plus the on-chain token on Base. What is live, what is being built, and what is not started.',
        'og_title': 'TMR Coin Utility | TrustMyRecord',
        'og_description': 'What TMR Coin does today, what is being built, and what has not started. No promises about price.',
        'crumb': 'TMR Coin Utility',
        'kicker': ('fas fa-toolbox', 'Utility'),
        'h1': 'TMR Coin <span class="gold">Utility</span>',
        'sub': 'What the coin is actually for, in the order you are likely to use it.',
        'tagline': '<span class="blue">Earn it by being right.</span> <span class="gold">Spend it where the record is kept.</span>',
        'actions': [('btn btn-gold', '/tmr-coin/', 'fas fa-circle-info', 'The TMR Coin page'),
                    ('btn btn-outline', '/tmr-coin/transparency/', 'fas fa-chart-simple', 'Live figures')],
        'body': '''
    <section class="ss-section">
        <div class="ss-section-head"><h2>Live utility, <span class="gold">today</span></h2><p>Everything here works right now.</p></div>
        <div class="ss-cards">
            <div class="ss-card"><i class="fas fa-trophy"></i><h3>Rewards for winning</h3><p>Graded wins, correct predictions, qualified trivia and forum activity pay TMR under daily and yearly caps.</p></div>
            <div class="ss-card"><i class="fas fa-file-lines"></i><h3>BetLegend Pro reports</h3><p>Run extra matchup reports at 5 TMR each after the free daily one.</p></div>
            <div class="ss-card"><i class="fas fa-hand-holding-dollar"></i><h3>Tipping</h3><p>Send TMR straight to a member whose post or pick deserved it. No cut is taken.</p></div>
            <div class="ss-card"><i class="fas fa-id-badge"></i><h3>Badges and flair</h3><p>Profile customisation and forum flair from the rewards catalog.</p></div>
            <div class="ss-card"><i class="fas fa-headset"></i><h3>Priority support</h3><p>Priced in TMR like everything else in the catalog.</p></div>
            <div class="ss-card"><i class="fas fa-user-group"></i><h3>Member challenges</h3><p>Stake TMR against another member on a graded outcome, settled by the grading engine.</p></div>
        </div>
    </section>

    <section class="ss-section">
        <div class="ss-section-head"><h2>The on-chain <span class="gold">token</span></h2></div>
        <div class="ss-intro">
            <p>Separately from anything you earn, TMR Coin exists as a fixed supply ERC-20 on Base at a verified contract. It has no owner, no mint function, no pause, no blacklist, no transfer tax and no upgrade path, so nobody, including TrustMyRecord, can print more of it, freeze a holder or change the code.</p>
            <p>Anyone can buy, hold and transfer it in a self custody wallet through a public exchange. Liquidity is deliberately very small, trades of roughly twenty dollars or more will not fill, and the price is whatever people trade at.</p>
            <p>What earning does not do is put tokens in your wallet, and what buying does not do is add to your site balance. Connecting the two is what a withdrawal system would do, and it is not live.</p>
        </div>
    </section>

    <section class="ss-section">
        <div class="ss-section-head"><h2>Live, building, <span class="gold">not started</span></h2><p>Kept apart on purpose, so nothing planned reads as shipped.</p></div>
        <div class="ss-pillars">
            <div class="ss-pillar"><i class="fas fa-check"></i><h3>Live</h3><p>Earning, spending, tipping, challenges, the public market on Base, and live public endpoints for market, supply, reserve and participation.</p></div>
            <div class="ss-pillar"><i class="fas fa-hammer"></i><h3>Building</h3><p>Real use of member challenges, deeper liquidity funded from platform revenue as it arrives, and more reasons to spend TMR.</p></div>
            <div class="ss-pillar"><i class="fas fa-ban"></i><h3>Not started</h3><p>Withdrawal between a site balance and a wallet, partner platforms using TMR, and any exchange or tracker listing, which are their decision and not ours.</p></div>
        </div>
    </section>

    <section class="ss-section">
        <div class="ss-section-head"><h2>What it will never <span class="gold">be</span></h2></div>
        <div class="ss-intro">
            <p>Not an investment, and not offered as one. No return, profit, appreciation or future listing is promised or implied anywhere, and the token can fall to nothing.</p>
            <p>Not sold by us. TrustMyRecord does not sell TMR, takes no payment for it, and has never distributed tokens to members.</p>
            <p>Not a reason to connect a wallet to this site. We never ask for a signature, a seed phrase or funds, and anyone doing so in our name is running a scam.</p>
        </div>
    </section>

    <section class="ss-cta">
        <h2>See it working before you believe <span class="gold">any of it</span></h2>
        <p>Price, liquidity, supply, holders and member activity are published live, including the figures that are zero.</p>
        <div class="ss-cta-actions">
            <a class="btn btn-gold" href="/tmr-coin/transparency/"><i class="fas fa-chart-simple"></i> Live transparency figures</a>
            <a class="btn btn-outline" href="/register/"><i class="fas fa-user-plus"></i> Create a free account</a>
        </div>
    </section>
''',
        'faq': [
            ('What can I do with TMR Coin?',
             'Earn it for graded wins, correct predictions, qualified trivia and forum activity, then spend it on BetLegend Pro reports, badges, forum flair and priority support, tip other members with it, or stake it in a challenge against another member.'),
            ('Is the TMR I earn the same as the token on Base?',
             'They are the same economy but not the same balance. An earned balance lives in TrustMyRecord records and cannot be withdrawn or sold today. The on-chain token lives in your own wallet and can be traded by anyone.'),
            ('Can TrustMyRecord mint more TMR?',
             'No. The contract has no mint function, no owner and no admin role, so the supply is fixed at 1,000,000,000 forever and the code cannot be changed by anyone, including us.'),
            ('Where do I check any of this?',
             'The transparency page publishes price, liquidity, supply, holders, transfers and member activity, read live from Base and from the ledger rather than typed in.'),
        ],
    },
]


def build_head(template_head, page):
    slug = page['slug']
    url = 'https://trustmyrecord.com/%s/' % slug
    head = template_head
    head = head.replace(
        '<link rel="canonical" href="https://trustmyrecord.com/sports-picks-leaderboard/">',
        '<link rel="canonical" href="%s">' % url)
    head = re.sub(r'<title>.*?</title>', '<title>%s</title>' % page['title'], head, count=1, flags=re.S)
    head = re.sub(r'<meta name="description" content=".*?">',
                  '<meta name="description" content="%s">' % page['description'], head, count=1, flags=re.S)
    head = re.sub(r'<meta property="og:title" content=".*?">',
                  '<meta property="og:title" content="%s">' % page['og_title'], head, count=1, flags=re.S)
    head = re.sub(r'<meta property="og:description" content=".*?">',
                  '<meta property="og:description" content="%s">' % page['og_description'], head, count=1, flags=re.S)
    head = head.replace(
        '<meta property="og:url" content="https://trustmyrecord.com/sports-picks-leaderboard/">',
        '<meta property="og:url" content="%s">' % url)

    schema = {
        '@context': 'https://schema.org',
        '@graph': [
            {'@type': 'BreadcrumbList', 'itemListElement': [
                {'@type': 'ListItem', 'position': 1, 'name': 'TrustMyRecord', 'item': 'https://trustmyrecord.com/'},
                {'@type': 'ListItem', 'position': 2, 'name': page['crumb'], 'item': url},
            ]},
            {'@type': 'FAQPage', 'mainEntity': [
                {'@type': 'Question', 'name': q,
                 'acceptedAnswer': {'@type': 'Answer', 'text': a}} for q, a in page['faq']
            ]},
        ],
    }
    # Contrast. The shared SEO shell paints .yes at #0A8B4E, which is 3.96:1 on
    # the comparison table's tinted cell and fails WCAG AA. Overridden here for
    # these pages rather than in the shell, because the shell is shared with
    # pages outside this workstream. #077A42 is 4.93:1 and reads the same.
    contrast_override = (
        '    <style>' + chr(10)
        + '        .ss-compare .yes { color: #077A42; }' + chr(10)
        + '    </style>' + chr(10)
        + '</head>'
    )
    head = head.replace('</head>', contrast_override, 1)

    head = re.sub(r'<script type="application/ld\+json">.*?</script>',
                  '<script type="application/ld+json">\n%s\n    </script>'
                  % json.dumps(schema, indent=2, ensure_ascii=False),
                  head, count=1, flags=re.S)
    return head


def build_body(page):
    icon, kicker = page['kicker']
    actions = '\n'.join(
        '            <a class="%s" href="%s"><i class="%s"></i> %s</a>' % (cls, href, ico, label)
        for cls, href, ico, label in page['actions'])
    faq = '\n'.join(
        '            <details><summary>%s</summary><p>%s</p></details>' % (q, a)
        for q, a in page['faq'])
    return '''<body class="tmr-site-shell tmr-light">
<!-- Sitewide global nav + footer are injected by tmr-sitewide.js -->
<main class="ss-wrap">

    <nav class="ss-crumb"><a href="/">Home</a> / %(crumb)s</nav>

    <section class="ss-hero">
        <span class="ss-kicker"><i class="%(icon)s"></i> %(kicker)s</span>
        <h1>%(h1)s</h1>
        <p class="sub">%(sub)s</p>
        <p class="ss-tagline">%(tagline)s</p>
        <div class="ss-hero-actions">
%(actions)s
        </div>
    </section>
%(body)s
    <section class="ss-section">
        <div class="ss-section-head"><h2>Common <span class="gold">questions</span></h2></div>
        <div class="ss-faq">
%(faq)s
        </div>
    </section>

''' % {'crumb': page['crumb'], 'icon': icon, 'kicker': kicker, 'h1': page['h1'],
       'sub': page['sub'], 'tagline': page['tagline'], 'actions': actions,
       'body': page['body'], 'faq': faq}


def main():
    template = io.open(TEMPLATE, encoding='utf-8').read()
    head = template[:template.find('<body')]

    for page in PAGES:
        out_dir = os.path.join(ROOT, page['slug'])
        if not os.path.isdir(out_dir):
            os.makedirs(out_dir)
        html = build_head(head, page) + build_body(page) + cluster_for(page['slug'])
        path = os.path.join(out_dir, 'index.html')
        io.open(path, 'w', encoding='utf-8', newline='').write(html)
        print('wrote %s (%d bytes)' % (path, len(html)))


if __name__ == '__main__':
    main()
