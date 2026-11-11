const R=require('../static/js/mlb-postseason-replay.js');
const rows=[[1,'Tampa Bay Rays','98-64','+86','Milwaukee Brewers','103-59','+214'],[2,'Cleveland Guardians','85-77','+11','Los Angeles Dodgers','100-62','+201'],[3,'Houston Astros','81-81','−32','Atlanta Braves','94-68','+116'],[4,'New York Yankees','93-68','+138','San Diego Padres','91-71','+41'],[5,'Boston Red Sox','87-75','+78','Chicago Cubs','89-73','+147'],[6,'Chicago White Sox','84-78','+56','Philadelphia Phillies','88-74','+15']];
const f={AL:[],NL:[]};for(const r of rows){f.AL.push(R.parseTeam(r[1]+' (East)',r[2],r[3],r[0],'AL'));f.NL.push(R.parseTeam(r[4],r[5],r[6],r[0],'NL'));}
f.all=f.AL.concat(f.NL);
const list=R.slots([{key:'AL'},{key:'NL'}]);
const o=R.odds(f,list,{},20000,7);let tot=0;
for(const t of f.all.slice().sort((a,b)=>o.tally[b.abbr].win-o.tally[a.abbr].win)){const x=o.tally[t.abbr];tot+=x.win;console.log(t.abbr.padEnd(4),t.str.toFixed(3),'ds',(x.ds/200).toFixed(0),'cs',(x.cs/200).toFixed(0),'ws',(x.ws/200).toFixed(0),'win',(x.win/200).toFixed(1));}
console.log('sum win',tot, 'HOU str rd',f.AL[2].rd);
// invariants
const assert=require('assert');assert.strictEqual(tot,20000);
const s=R.simulateRest(f,list,{'AL-wc-a':'BOS'},R.mulberry32(3));assert.strictEqual(s.picks['AL-wc-a'],'BOS');assert.strictEqual(Object.keys(s.picks).length,11);
const ds=list.find(x=>x.id==='AL-ds-a');const st=R.settle(f,list,s.picks);assert.ok(['TB','BOS'].includes(st.winners['AL-ds-a'].abbr));
const bad=R.settle(f,list,{'AL-ds-a':'NYY'});assert.strictEqual(Object.keys(bad.picks).length,0,'a pick with no series under it is dropped');
const p=R.seriesP(f.NL[0],f.NL[5],5);assert.ok(p>0.5&&p<0.8);
// exact series chance agrees with simulation
let w=0;const rnd=R.mulberry32(11);for(let i=0;i<40000;i++){if(R.playSeries(f.NL[0],f.NL[5],5,rnd).w.abbr==='MIL')w++;}assert.ok(Math.abs(w/40000-p)<0.01,'exact vs simulated '+p+' '+w/40000);
console.log('mlb-postseason-replay: OK');
