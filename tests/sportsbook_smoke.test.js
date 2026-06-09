/**
 * TrustMyRecord sportsbook regression smoke test (standalone Playwright, no framework).
 * Guards the bugs fixed on 2026-06-09 (silent submit failure) and core submit health.
 *
 * Run:  node sportsbook_smoke.test.js
 * Exits 0 if all checks pass, 1 otherwise. Creates picks then SOFT-DELETES them
 * (needs admin creds). Safe to run against production.
 *
 * Checks:
 *  1. live JS carries the SILENT_SUBMIT_FIX marker + page references it
 *  2. logged-in user submits Soccer ML, MLB total, NFL ML (201 + pick id)
 *  3. expired-session submit shows a VISIBLE error (no silent failure, no POST swallowed)
 *  4. invalid odds shows a VISIBLE error and creates no pick
 *  5. logged-out submit routes to login (no silent failure)
 *  6. mobile viewport can submit
 *  7. no uncaught console errors (excluding rate-limit) on the submit path
 */
const { chromium } = require('playwright');
const API = 'https://trustmyrecord-api.onrender.com';
const SITE = 'https://trustmyrecord.com/sportsbook/';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
function check(name, cond, detail){ results.push({ name, pass: !!cond, detail }); console.log((cond?'PASS':'FAIL')+' - '+name+(detail?(' :: '+detail):'')); }

async function login(page){ const j = await page.evaluate(async (API)=>{ const r=await fetch(API+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({login:'BetLegend',password:'BetLegend2026!'})}); return r.json(); }, API); await page.evaluate(j=>{['accessToken','tmr_access_token'].forEach(k=>localStorage.setItem(k,j.accessToken));localStorage.setItem('refreshToken',j.refreshToken||'');localStorage.setItem('tmr_refresh_token',j.refreshToken||'');localStorage.setItem('tmr_is_logged_in','true');localStorage.setItem('tmr_current_user',JSON.stringify(j.user));localStorage.setItem('trustmyrecord_session',JSON.stringify({user:j.user,accessToken:j.accessToken,refreshToken:j.refreshToken}));}, j); return j.accessToken; }
async function setSport(page,s,ms){ await page.evaluate(x=>window.TMR.setSport(x), s); await sleep(ms||8000); }
async function clickFirst(page, re){ return page.evaluate((reSrc)=>{ const rx=new RegExp(reSrc,'i'); const cards=Array.from(document.querySelectorAll('.sportsbook-game-card,.game-card')); for(const c of cards){ const b=Array.from(c.querySelectorAll('button.sb-odds,button.odds-btn')).find(x=>rx.test((x.textContent||'').trim())&&!x.disabled); if(b){b.scrollIntoView({block:'center'});b.click();return (b.textContent||'').trim();} } return null; }, re); }
async function lockAndCapture(page){ let status=null,id=null; const h=async r=>{ if(/\/api\/picks(?:\?|$)/.test(r.url())&&r.request().method()==='POST'){status=r.status();try{const j=JSON.parse(await r.text());id=j.pick&&j.pick.id;}catch(_){}}}; page.on('response',h); await page.evaluate(()=>window.lockInPick&&window.lockInPick()); for(let w=0;w<15&&await page.evaluate(()=>!!window.__tmrLockInFlight);w++) await sleep(700); await sleep(1500); page.off('response',h); const ui=await page.evaluate(()=>{const c=document.getElementById('confirmPickDetail');const e=document.getElementById('pickSlipError');return {confirm:c?(c.textContent||'').trim():null, err:e&&e.style.display!=='none'?(e.textContent||'').trim():null};}); return {status,id,ui}; }
async function softDelete(page,TOK,id){ if(!id) return; await page.evaluate(async({API,TOK,id})=>{await fetch(API+'/api/admin/soft-delete-pick',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+TOK},body:JSON.stringify({id,reason:'regression smoke test'})});},{API,TOK,id}); }

(async () => {
  const browser = await chromium.launch({ headless: true });

  // 1) deploy markers (fetch from inside a page context)
  const probe = await browser.newPage();
  await probe.goto(SITE, { waitUntil:'domcontentloaded', timeout:60000 });
  const marker = await probe.evaluate(async ()=>{ const r=await fetch('/static/js/sportsbook-production-fix-persist-reliability.js?cb='+Date.now()); const t=await r.text(); return t.includes('SILENT_SUBMIT_FIX_20260609'); });
  const pageRef = await probe.evaluate(()=> /persist-reliability\.js\?v=/.test(document.documentElement.innerHTML));
  check('live JS has silent-submit-fix marker', marker);
  check('page references reliability JS', pageRef);
  await probe.close();

  // 2) valid submits
  const page = await browser.newPage({ viewport:{width:1400,height:1000} });
  const cErr=[]; page.on('console',m=>{if(m.type()==='error'&&!/Too many requests/i.test(m.text()))cErr.push(m.text().slice(0,120));});
  await page.goto(SITE,{waitUntil:'domcontentloaded',timeout:60000});
  const TOK = await login(page); await page.reload({waitUntil:'domcontentloaded'}); await sleep(2500);
  for (const [sport,re,label] of [['Soccer','ML.?-?\\d','Soccer ML'],['MLB','^O\\s?\\d','MLB total'],['NFL','^ML','NFL ML']]) {
    await setSport(page, sport); const btn=await clickFirst(page, re);
    if(!btn){ check(label+' submits', false, 'no board button'); continue; }
    await sleep(800); const r=await lockAndCapture(page);
    check(label+' submits', (r.status===201||r.status===200)&&!!r.id, 'http='+r.status+' id='+r.id);
    await softDelete(page,TOK,r.id); await sleep(3500);
  }

  // 3) expired session -> visible error
  await setSport(page,'Soccer'); const b3=await clickFirst(page,'ML.?-?\\d');
  await page.evaluate(()=>{['accessToken','tmr_access_token','trustmyrecord_token','access_token','token','tmr_token','refreshToken','tmr_refresh_token','trustmyrecord_refresh_token','refresh_token'].forEach(k=>localStorage.removeItem(k)); if(window.api){window.api.token=null;window.api.refreshToken=null;} try{const s=JSON.parse(localStorage.getItem('trustmyrecord_session'));if(s){delete s.accessToken;delete s.refreshToken;localStorage.setItem('trustmyrecord_session',JSON.stringify(s));}}catch(_){}});
  const r3 = await lockAndCapture(page);
  check('expired session shows visible error (no silent fail)', !!r3.ui.err && !r3.id, 'err='+(r3.ui.err||'').slice(0,50));

  // 4) invalid odds -> visible error, no pick
  await login(page); await page.reload({waitUntil:'domcontentloaded'}); await sleep(2500);
  await setSport(page,'Soccer'); const b4=await clickFirst(page,'ML.?-?\\d');
  await page.evaluate(()=>{const o=document.getElementById('pickOddsInput');if(o){o.value='50';o.dispatchEvent(new Event('input',{bubbles:true}));}});
  const r4 = await lockAndCapture(page);
  check('invalid odds shows visible error + no pick', !!r4.ui.err && !r4.id, 'err='+(r4.ui.err||'').slice(0,50));

  // 7) console errors clean on submit path
  check('no uncaught console errors on submit path (excl rate-limit)', cErr.length===0, cErr.slice(0,3).join(' | '));
  await page.close();

  // 5) logged-out -> login route
  const lo = await browser.newPage({viewport:{width:1400,height:1000}});
  const dlgs=[]; lo.on('dialog',async d=>{dlgs.push(d.message());await d.dismiss().catch(()=>{});});
  await lo.goto(SITE,{waitUntil:'domcontentloaded',timeout:60000}); await lo.evaluate(()=>localStorage.clear()); await lo.reload({waitUntil:'domcontentloaded'}); await sleep(2500);
  await setSport(lo,'Soccer'); await clickFirst(lo,'ML.?-?\\d'); await lo.evaluate(()=>window.lockInPick&&window.lockInPick()); await sleep(2500);
  const routed = await lo.evaluate(()=>{const l=document.getElementById('login');return (l&&l.offsetParent!==null)|| /login/i.test(location.hash);});
  check('logged-out submit routes to login (no silent fail)', routed || dlgs.some(d=>/log ?in/i.test(d)), 'dialogs='+JSON.stringify(dlgs));
  await lo.close();

  // 6) mobile submit
  const mob = await browser.newPage({viewport:{width:390,height:844}});
  await mob.goto(SITE,{waitUntil:'domcontentloaded',timeout:60000}); const TOK2=await login(mob); await mob.reload({waitUntil:'domcontentloaded'}); await sleep(2500);
  await setSport(mob,'Soccer'); const bm=await clickFirst(mob,'ML.?-?\\d');
  let mr={status:null,id:null,ui:{}}; if(bm){ await sleep(800); mr=await lockAndCapture(mob); }
  check('mobile viewport submits', (mr.status===201||mr.status===200)&&!!mr.id, 'http='+mr.status+' id='+mr.id+' btn='+bm);
  await softDelete(mob,TOK2,mr.id);
  await mob.close();

  await browser.close();
  const failed = results.filter(r=>!r.pass);
  console.log('\\n===== SMOKE SUMMARY: '+(results.length-failed.length)+'/'+results.length+' passed =====');
  require('fs').writeFileSync('C:/Users/Nima/_sbverify/smoke_results.json', JSON.stringify(results,null,1));
  process.exit(failed.length?1:0);
})().catch(e=>{ console.error('FATAL', e); process.exit(1); });
