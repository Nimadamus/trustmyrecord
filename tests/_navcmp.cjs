const { chromium } = require('playwright');
const fs=require('fs'),path=require('path');const ROOT=path.join(__dirname,'..');
const T={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8'};
(async()=>{
  const b=await chromium.launch({headless:true});
  const ctx=await b.newContext({viewport:{width:1440,height:900}});
  await ctx.route('**/*',async r=>{const u=new URL(r.request().url());
    if(u.hostname!=='trustmyrecord.com')return r.continue();
    let rel=decodeURIComponent(u.pathname); if(rel.endsWith('/'))rel+='index.html';
    const e=path.extname(rel); if(!T[e])return r.continue();
    const f=path.join(ROOT,rel); if(!f.startsWith(ROOT)||!fs.existsSync(f))return r.continue();
    return r.fulfill({status:200,headers:{'content-type':T[e]},body:fs.readFileSync(f)});});
  for(const rel of process.argv.slice(2)){
    const p=await ctx.newPage(); p.on('pageerror',()=>{}); p.on('dialog',d=>d.dismiss().catch(()=>{}));
    try{
      await p.goto('https://trustmyrecord.com/'+rel,{waitUntil:'domcontentloaded',timeout:40000});
      await p.waitForTimeout(4000);
      const o=await p.evaluate(()=>{
        const n=document.querySelector('.ds-navitem, .ds-menu > button, .ds-mainnav a, .mainnav a');
        const s=n?getComputedStyle(n):null;
        const logo=document.querySelector('.ds-logo, .logo');
        const crumbs=document.querySelector('.tmrlh-crumbs');
        const h1=document.querySelector('h1');
        return {
          navSel:n?n.tagName+'.'+(typeof n.className==='string'?n.className.trim().split(/\s+/).slice(0,2).join('.'):''):null,
          navFF:s?s.fontFamily.split(',')[0]:null, navPx:s?s.fontSize:null, navW:s?s.fontWeight:null,
          navLS:s?s.letterSpacing:null, navTT:s?s.textTransform:null, navColor:s?s.color:null,
          logoText:logo?logo.innerText.replace(/\s+/g,' ').trim().slice(0,40):null,
          navText:(document.querySelector('.ds-nav, nav')||{innerText:''}).innerText.replace(/\s+/g,' ').trim().slice(0,110),
          crumbs:crumbs?crumbs.innerText.replace(/\s+/g,' ').trim().slice(0,60):null,
          h1FF:h1?getComputedStyle(h1).fontFamily.split(',')[0]:null,
          bodyCls:document.body.className.slice(0,60),
          today:(function(){var out=[];document.querySelectorAll('nav *, header *').forEach(function(e){var t='';for(var i=0;i<e.childNodes.length;i++){if(e.childNodes[i].nodeType===3)t+=e.childNodes[i].textContent;}t=t.trim();if(/^today$/i.test(t))out.push(e.tagName+'.'+(typeof e.className==='string'?e.className:''));});return out;})(),
        };
      });
      console.log('/'+rel+'  '+JSON.stringify(o));
    }catch(e){console.log('/'+rel+' ERROR '+String(e.message).slice(0,60));}
    await p.close();
  }
  await b.close();
})();
