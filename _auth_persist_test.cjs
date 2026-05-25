// Live auth-persistence acceptance test for trustmyrecord.com
// Usage: TMR_USER=<u> TMR_PASS=<p> node _auth_persist_test.cjs
// Verifies: login -> refresh -> protected page -> close/reopen (new context with
// persisted storage) -> access-token expiry + reload (refresh keeps session) ->
// explicit logout clears -> reload stays out.
const { chromium } = require('playwright');

const USER = process.env.TMR_USER;
const PASS = process.env.TMR_PASS;
const BASE = 'https://trustmyrecord.com';
const sleep = ms => new Promise(r=>setTimeout(r,ms));

async function navState(page){
  return await page.evaluate(()=>{
    const chip = document.querySelector('.tmr-global-nav__user');
    const login = document.querySelector('.tmr-global-nav [data-tmr-auth-route="login"]');
    return {
      loggedIn: !!chip,
      chipText: chip ? chip.innerText.replace(/\s+/g,' ').trim() : null,
      showsLogin: !!login,
      hasSession: !!localStorage.getItem('trustmyrecord_session'),
      hasRefresh: !!localStorage.getItem('trustmyrecord_refresh_token'),
      hasToken: !!localStorage.getItem('trustmyrecord_token')
    };
  });
}

(async () => {
  if (!USER || !PASS) { console.error('Set TMR_USER and TMR_PASS'); process.exit(1); }
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  let page = await ctx.newPage();

  await page.goto(`${BASE}/login/?cb=`+Date.now(), { waitUntil:'networkidle', timeout:60000 });
  await page.fill('#loginValue', USER);
  await page.fill('#passwordValue', PASS);
  await Promise.all([ page.waitForLoadState('networkidle').catch(()=>{}), page.click('#submitBtn') ]);
  await sleep(4000);
  console.log('STEP1 after login submit, url=', page.url());

  await page.goto(`${BASE}/?cb=`+Date.now(), { waitUntil:'networkidle', timeout:60000 });
  await sleep(2500);
  console.log('STEP2 homepage nav:', JSON.stringify(await navState(page)));

  await page.reload({ waitUntil:'networkidle' });
  await sleep(2500);
  console.log('STEP3 after refresh:', JSON.stringify(await navState(page)));

  await page.goto(`${BASE}/profile/?user=${encodeURIComponent(USER)}&cb=`+Date.now(), { waitUntil:'networkidle', timeout:60000 });
  await sleep(2500);
  console.log('STEP4 protected /profile/:', JSON.stringify(await navState(page)));

  const storage = await ctx.storageState();
  await page.close(); await ctx.close();
  const ctx2 = await browser.newContext({ storageState: storage });
  const page2 = await ctx2.newPage();
  await page2.goto(`${BASE}/?cb=`+Date.now(), { waitUntil:'networkidle', timeout:60000 });
  await sleep(2500);
  console.log('STEP5 NEW CONTEXT (close/reopen) homepage:', JSON.stringify(await navState(page2)));

  await page2.evaluate(()=>{ ['trustmyrecord_token','accessToken','access_token','token','tmr_token'].forEach(k=>localStorage.removeItem(k)); });
  await page2.goto(`${BASE}/?cb=`+Date.now(), { waitUntil:'networkidle', timeout:60000 });
  await sleep(4000);
  console.log('STEP6 after access-token expiry+reload (refresh should keep in):', JSON.stringify(await navState(page2)));

  await page2.evaluate(()=>{ const b=document.querySelector('[data-tmr-logout]'); if(b) b.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true})); });
  await sleep(3500);
  console.log('STEP7 after explicit logout:', JSON.stringify(await navState(page2)));

  await page2.goto(`${BASE}/?cb=`+Date.now(), { waitUntil:'networkidle', timeout:60000 });
  await sleep(2500);
  console.log('STEP8 reload after logout (stays out):', JSON.stringify(await navState(page2)));

  await browser.close();
})().catch(e=>{ console.error('TEST ERROR', e); process.exit(1); });
