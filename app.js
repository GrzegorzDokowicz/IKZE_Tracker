const KEY='ikze-tracker:v1',TYPES=['Zakup','Sprzedaż','Wpłata','Wypłata','Dywidenda'];
const CLS=['Akcje polskie','Akcje zagraniczne','Obligacje skarbowe polskie','Obligacje skarbowe zagraniczne','Obligacje korporacyjne polskie','Obligacje korporacyjne zagraniczne','Metale i surowce','Kryptowaluty','Inne'];
const COL=['var(--ac)','#c9812b','#2f9e8f','#8b5fbf','#c4466b','#6f8f2a','#3b7dd8','#b5651d','#4aa3a3'];
let CFG={instruments:[]},PR={px:{},fx:{}},HI={seed:[],days:{}};
let ST={tx:[],cfg:{limit:11304,targets:{}}};
const ui={type:'Zakup',msg:'',del:null};
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const f=(n,d=2)=>isFinite(n)&&n!==null?n.toLocaleString('pl-PL',{minimumFractionDigits:d,maximumFractionDigits:d}):'–';
const pl=n=>isFinite(n)?(n>0?'+':'')+f(n):'–';
const pc=n=>isFinite(n)?(n>0?'+':'')+f(n*100)+'%':'–';
const sg=n=>n>0?'pos':n<0?'neg':'';
const today=()=>new Date().toISOString().slice(0,10);
const inst=tk=>CFG.instruments.find(i=>i.ticker===tk);

function load(){try{const s=JSON.parse(localStorage.getItem(KEY)||'null');if(s&&Array.isArray(s.tx))ST={tx:s.tx,cfg:{...ST.cfg,...s.cfg}}}catch(e){}}
function save(){try{localStorage.setItem(KEY,JSON.stringify(ST));ui.saveErr=false}catch(e){ui.saveErr=true}}

/* ceny: bieżące i historyczne */
const nowGetter=tk=>{const i=inst(tk),p=PR.px[tk]||{},r=!i||i.ccy==='PLN'?1:(PR.fx[i.ccy]?.r||1);return{px:p.p||0,prev:p.prev??p.p??0,rate:r}};
function dayGetter(d){
 const ks=Object.keys(HI.days).sort().filter(k=>k<=d).reverse();
 const look=k=>{for(const x of ks)if(HI.days[x][k]!=null)return HI.days[x][k];return null};
 return tk=>{const i=inst(tk),px=look(tk),r=!i||i.ccy==='PLN'?1:look(i.ccy);return{px,prev:px,rate:r}};
}

function xirr(fl){
 if(fl.length<2||!fl.some(x=>x[1]>0)||!fl.some(x=>x[1]<0))return NaN;
 const t0=new Date(fl[0][0]).getTime(),v=r=>fl.reduce((a,[d,c])=>a+c/Math.pow(1+r,(new Date(d).getTime()-t0)/31557600000),0);
 let lo=-.99,hi=10;if(v(lo)*v(hi)>0)return NaN;
 for(let i=0;i<100;i++){const m=(lo+hi)/2;v(lo)*v(m)<=0?hi=m:lo=m}
 return(lo+hi)/2;
}

function calc(asOf,get=nowGetter){
 const tx=[...ST.tx].filter(x=>!asOf||x.d<=asOf).sort((a,b)=>a.d.localeCompare(b.d)||String(a.id).localeCompare(String(b.id)));
 const pos={};let dep=0,wd=0,buys=0,sells=0,divs=0,fees=0,real=0;const fl=[],depYear={};
 for(const x of tx){const fx=x.fx||1,fee=x.fee||0;
  if(x.t==='Wpłata'){dep+=x.p;fl.push([x.d,-x.p]);const y=x.d.slice(0,4);depYear[y]=(depYear[y]||0)+x.p}
  else if(x.t==='Wypłata'){wd+=x.p;fl.push([x.d,x.p])}
  else if(x.t==='Dywidenda'){divs+=x.p*fx-fee;fees+=fee}
  else if(x.t==='Zakup'){const c=x.q*x.p*fx,o=pos[x.tk]||(pos[x.tk]={q:0,c:0});buys+=c+fee;fees+=fee;o.q+=x.q;o.c+=c+fee}
  else if(x.t==='Sprzedaż'){const o=pos[x.tk]||(pos[x.tk]={q:0,c:0}),a=o.q?o.c/o.q:0,pr=x.q*x.p*fx;sells+=pr-fee;fees+=fee;real+=pr-fee-a*x.q;o.c-=a*x.q;o.q-=x.q}
 }
 const cash=dep-wd-buys+sells+divs,rows=[];let open=0,day=0,cost=0,missing=false;
 for(const[tk,o]of Object.entries(pos)){if(o.q<1e-9)continue;
  const i=inst(tk)||{},g=get(tk);if(g.px==null||g.rate==null){missing=true;continue}
  const val=o.q*g.px*g.rate,d=o.q*(g.px-g.prev)*g.rate;
  rows.push({tk,name:i.name||tk,cls:i.cls||'Inne',ccy:i.ccy||'PLN',q:o.q,avg:o.c/o.q/g.rate,px:g.px,cost:o.c,val,day:d,pl:val-o.c,plp:o.c?val/o.c-1:NaN});
  open+=val;day+=d;cost+=o.c}
 const total=cash+open,net=dep-wd;
 const alloc={'Gotówka':cash};for(const r of rows)alloc[r.cls]=(alloc[r.cls]||0)+r.val;
 return{tx,rows,cash,open,total,net,real,divs,fees,day,unreal:open-cost,alloc,depYear,missing,
  xirr:asOf?NaN:xirr(fl.concat([[today(),total]]))};
}

/* ekspozycja geograficzna: wartość pozycji × udział krajów w ETF (z config.json) */
function geo(c){
 const g={};const add=(k,by,amt)=>{const o=g[k]||(g[k]={t:0,by:{}});o.t+=amt;if(by)o.by[by]=(o.by[by]||0)+amt};
 for(const r of c.rows){const w=inst(r.tk)?.countries||{Nieznane:100},s=Object.values(w).reduce((a,b)=>a+b,0)||1;
  for(const[k,v]of Object.entries(w))add(k,r.tk,r.val*v/s)}
 if(c.cash>0)add('Gotówka PLN',null,c.cash);
 return Object.entries(g).map(([k,o])=>({k,...o})).sort((a,b)=>(a.k==='Pozostałe')-(b.k==='Pozostałe')||b.t-a.t);
}

function series(){
 const days=Object.keys(HI.days).sort();if(!days.length)return[];
 const out=HI.seed.filter(s=>s.d<days[0]).map(s=>({d:s.d,v:s.v,n:s.n}));
 for(const d of days){const c=calc(d,dayGetter(d));if(!c.missing&&c.tx.length)out.push({d,v:c.total,n:c.net})}
 return out;
}

function chart(){
 const h=series();
 if(h.length<2)return'<div class="mu">Za mało danych na wykres.</div>';
 const W=620,H=190,p=40,vs=h.flatMap(x=>[x.v,x.n]),mn=Math.min(...vs)*.97,mx=Math.max(...vs)*1.02;
 const X=i=>p+i*(W-p-8)/(h.length-1),Y=v=>H-22-(v-mn)/(mx-mn||1)*(H-34);
 const L=k=>h.map((x,i)=>`${X(i).toFixed(1)},${Y(x[k]).toFixed(1)}`).join(' ');
 return`<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Wartość konta i wpłaty netto w czasie">
 <polyline points="${L('n')}" fill="none" stroke="var(--mu)" stroke-width="1.5" stroke-dasharray="4 3"/>
 <polyline points="${L('v')}" fill="none" stroke="var(--ac)" stroke-width="2.2"/>
 <text x="${p}" y="${H-5}">${h[0].d}</text><text x="${W-8}" y="${H-5}" text-anchor="end">${h[h.length-1].d}</text>
 <text x="2" y="${Y(mx/1.02)+4}">${f(mx/1.02,0)}</text><text x="2" y="${Y(mn/.97)+4}">${f(mn/.97,0)}</text></svg>
 <div class="mu"><span style="color:var(--ac)">━</span> wartość konta &nbsp; ╌ wpłaty netto</div>`;
}

function render(){
 const c=calc(),yr=String(new Date().getFullYear()),lim=ST.cfg.limit||11304,used=c.depYear[yr]||0;
 const age=PR.date?Math.round((new Date(today())-new Date(PR.date))/864e5):null;
 $('#stamp').innerHTML=PR.date?`Ceny z dnia ${PR.date}${age>4?` <span class="neg">· nieaktualne (${age} dni), sprawdź Actions w GitHubie</span>`:' · aktualizacja automatyczna w dni robocze'}`:'Brak cen';
 const k=(l,v,cl='',b='')=>`<div class="kpi ${b}"><span class="mu">${l}</span><b class="${cl}">${v}</b></div>`;
 const tg=ST.cfg.targets||{},keys=['Gotówka',...CLS].filter(x=>c.alloc[x]||tg[x]);
 const allocH=keys.map(x=>{const v=c.alloc[x]||0,sh=c.total?v/c.total:0,dv=v-(tg[x]||0)/100*c.total;
  return`<div>${x}<div class="bar"><i style="width:${Math.min(100,sh*100)}%"></i></div></div><span>${f(sh*100,1)}%</span>
  <input type="number" step="1" min="0" max="100" value="${tg[x]??0}" data-t="${esc(x)}" aria-label="Cel % ${esc(x)}"><span class="${sg(dv)}">${pl(dv)}</span>`}).join('');
 const hold=[...c.rows].sort((a,b)=>b.val-a.val).map(r=>`<tr><td><b>${esc(r.tk)}</b><div class="mu">${esc(r.name)}</div></td><td>${f(r.q,4)}</td>
  <td>${f(r.avg)} ${r.ccy}</td><td>${f(r.px)} ${r.ccy}</td><td class="${sg(r.day)}">${pl(r.day)}</td><td>${f(r.val)}</td>
  <td class="${sg(r.pl)}">${pl(r.pl)}</td><td class="${sg(r.pl)}">${pc(r.plp)}</td><td>${f(c.total?r.val/c.total*100:0,1)}%</td></tr>`).join('')||'<tr><td colspan="9" class="mu">Brak otwartych pozycji. Zaimportuj dane lub dodaj zakup.</td></tr>';
 /* geografia */
 const G=geo(c),held=c.rows.map(r=>r.tk),T=c.total||1;
 const share=n=>G.filter(x=>n.includes(x.k)).reduce((a,x)=>a+x.t,0)/T;
 const usa=share(['USA']),pol=share(['Polska']),cashS=share(['Gotówka PLN']),rest=1-usa-pol-cashS;
 const ci=G.filter(x=>x.k!=='Pozostałe'&&x.k!=='Gotówka PLN').map((x,i)=>({...x,c:x.k==='USA'?COL[0]:COL[(i%8)+1]}));
 const segs=[...ci,...G.filter(x=>x.k==='Pozostałe').map(x=>({...x,c:'var(--mu)'})),...G.filter(x=>x.k==='Gotówka PLN').map(x=>({...x,c:'var(--ln)'}))];
 const bar=segs.map(x=>`<i title="${esc(x.k)}: ${f(x.t/T*100,1)}%" style="width:${x.t/T*100}%;background:${x.c}"></i>`).join('');
 const geoRows=segs.map(x=>`<tr><td><span class="dot" style="background:${x.c}"></span>${esc(x.k)}</td><td>${f(x.t/T*100,1)}%</td><td>${f(x.t)}</td>${held.map(h=>`<td class="mu">${x.by[h]?f(x.by[h]/T*100,1)+'%':''}</td>`).join('')}</tr>`).join('');
 const srcRows=CFG.instruments.filter(i=>held.includes(i.ticker)).map(i=>`<tr><td>${esc(i.ticker)}</td><td>${esc(i.asOf||'?')}</td><td><a href="${esc(i.source||'#')}" rel="noopener" target="_blank">źródło</a></td></tr>`).join('');
 const t=ui.type,tr=t==='Zakup'||t==='Sprzedaż',cashT=t==='Wpłata'||t==='Wypłata';
 const form=`<div class="seg">${TYPES.map(x=>`<button data-type="${x}" class="${x===t?'on':''}">${x}</button>`).join('')}</div>
 <div class="form"><label>Data<input type="date" id="fd" value="${today()}"></label>
 ${cashT?`<label>Kwota PLN<input type="number" step="any" id="fp"></label>`:`
  <label>Instrument<select id="ft">${CFG.instruments.map(i=>`<option value="${esc(i.ticker)}">${esc(i.ticker)}</option>`).join('')}</select></label>
  ${t==='Dywidenda'?'':`<label>Liczba<input type="number" step="any" id="fq"></label>`}
  <label>${t==='Dywidenda'?'Kwota (w walucie instrumentu)':'Cena (w walucie instrumentu)'}<input type="number" step="any" id="fp"></label>
  <label>Kurs PLN<input type="number" step="any" id="ffx" placeholder="bieżący NBP"></label>
  <label>Prowizja PLN<input type="number" step="any" id="ffee" value="0"></label>`}</div>
 <div style="margin-top:12px"><button class="pri" id="add">Zapisz: ${t.toLowerCase()}</button></div><div id="err">${esc(ui.msg)}</div>`;
 const txs=[...c.tx].reverse().map(x=>`<tr><td>${x.d}</td><td>${x.t}</td><td>${esc(x.tk||'')}</td><td>${x.q?f(x.q,4):''}</td><td>${f(x.p,x.t==='Wpłata'||x.t==='Wypłata'?2:4)}</td><td>${x.fx&&x.fx!==1?f(x.fx,4):''}</td>
  <td>${x.fee?f(x.fee):''}</td><td><button class="sm" data-del="${esc(x.id)}">${ui.del===x.id?'Na pewno?':'Usuń'}</button></td></tr>`).join('')||'<tr><td colspan="8" class="mu">Brak transakcji.</td></tr>';
 $('#app').innerHTML=`${ui.saveErr?'<div class="note neg">Przeglądarka nie pozwala zapisać danych (tryb prywatny?). Użyj „Kopia danych”.</div>':''}
 <div class="kpis">${k('Wartość konta',f(c.total),'','big')}${k('Wpłaty netto',f(c.net))}${k('Zysk łączny',pl(c.total-c.net),sg(c.total-c.net))}
  ${k('Niezrealizowany',pl(c.unreal),sg(c.unreal))}${k('Zrealizowany',pl(c.real),sg(c.real))}${k('Dziś',pl(c.day),sg(c.day))}${k('XIRR',pc(c.xirr),sg(c.xirr))}${k('Gotówka',f(c.cash))}${k('Dywidendy / koszty',f(c.divs)+' / '+f(c.fees))}</div>
 <section><h2>Gdzie są Twoje pieniądze</h2>
  <div class="geo-h"><div><b class="big">${f(usa*100,1)}%</b><span class="mu"> USA</span></div><div><b>${f(pol*100,1)}%</b><span class="mu"> Polska</span></div><div><b>${f(rest*100,1)}%</b><span class="mu"> reszta świata</span></div><div><b>${f(cashS*100,1)}%</b><span class="mu"> gotówka</span></div></div>
  <div class="stack">${bar}</div>
  <div class="wrap"><table><thead><tr><th>Kraj</th><th>% portfela</th><th>PLN</th>${held.map(h=>`<th>${esc(h.split(':')[1]||h)}</th>`).join('')}</tr></thead><tbody>${geoRows}</tbody></table></div>
  <div class="note" style="margin-top:12px">Liczone jako wartość pozycji × udział krajów w ETF (kraj siedziby spółki lub emitenta obligacji). Spółki z S&amp;P 500 część przychodów osiągają poza USA, a tego ta tabela nie pokazuje. Wagi ETF z config.json:
  <table style="min-width:0;width:auto;margin-top:6px"><tbody>${srcRows}</tbody></table></div></section>
 <section><h2>Pozycje</h2><div class="wrap"><table><thead><tr><th>Instrument</th><th>Liczba</th><th>Śr. cena zakupu</th><th>Cena</th><th>Dziś PLN</th><th>Wartość PLN</th><th>Zysk PLN</th><th>Zysk %</th><th>Udział</th></tr></thead><tbody>${hold}</tbody></table></div></section>
 <div class="two"><section><h2>Alokacja i cele</h2><div class="al"><span class="mu">Klasa</span><span class="mu">Udział</span><span class="mu">Cel %</span><span class="mu">Od celu PLN</span>${allocH}</div></section>
 <section><h2>Limit wpłat IKZE ${yr}</h2><div style="font-size:22px;font-weight:600">${f(used)} <span class="mu" style="font-weight:400">/ ${f(lim,0)} PLN</span></div>
  <div class="bar" style="height:10px"><i style="width:${Math.min(100,used/lim*100)}%;background:${used>lim?'var(--neg)':'var(--ac)'}"></i></div>
  <div class="mu">${used>lim?'Przekroczono limit o '+f(used-lim)+' PLN':'Pozostało '+f(lim-used)+' PLN'}</div>
  <label class="mu" style="display:block;margin-top:10px">Limit roczny (2026: 11 304 zł, działalność 16 956 zł) <input type="number" id="lim" value="${lim}" style="width:100px"></label></section></div>
 <section style="margin-top:14px"><h2>Wartość w czasie</h2>${chart()}</section>
 <section><h2>Dodaj transakcję</h2>${form}</section>
 <section><h2>Historia transakcji</h2><div class="wrap"><table><thead><tr><th>Data</th><th>Rodzaj</th><th>Ticker</th><th>Liczba</th><th>Cena / kwota</th><th>Kurs</th><th>Prowizja</th><th></th></tr></thead><tbody>${txs}</tbody></table></div></section>`;
 bind(c);
}

function bind(c){
 document.querySelectorAll('[data-type]').forEach(b=>b.onclick=()=>{ui.type=b.dataset.type;ui.msg='';render()});
 document.querySelectorAll('[data-t]').forEach(i=>i.onchange=()=>{ST.cfg.targets={...ST.cfg.targets,[i.dataset.t]:+i.value||0};save();render()});
 $('#lim').onchange=e=>{ST.cfg.limit=+e.target.value||11304;save();render()};
 document.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>{if(ui.del!==b.dataset.del){ui.del=b.dataset.del;render();return}ui.del=null;ST.tx=ST.tx.filter(x=>String(x.id)!==b.dataset.del);save();render()});
 $('#add').onclick=()=>addTx(c);
}

function addTx(c){
 const t=ui.type,v=id=>{const e=$('#'+id);return e?e.value:''},n=id=>parseFloat(v(id));
 const x={id:'t'+Date.now().toString(36),d:v('fd'),t};
 const err=m=>{ui.msg=m;$('#err').textContent=m};
 if(!x.d)return err('Podaj datę.');
 if(t==='Wpłata'||t==='Wypłata'){x.p=n('fp');if(!(x.p>0))return err('Podaj kwotę większą od zera.');
  if(t==='Wypłata'&&x.p>c.cash+1e-6)return err('Wypłata większa niż gotówka ('+f(c.cash)+' PLN).')}
 else{
  x.tk=v('ft');const i=inst(x.tk);x.p=n('fp');if(!(x.p>0))return err('Podaj cenę.');
  x.fx=n('ffx')||nowGetter(x.tk).rate;x.fee=n('ffee')||0;
  if(t!=='Dywidenda'){x.q=n('fq');if(!(x.q>0))return err('Podaj liczbę jednostek.');
   if(t==='Sprzedaż'){const h=c.rows.find(r=>r.tk===x.tk);if(!h||x.q>h.q+1e-9)return err('Masz tylko '+f(h?h.q:0,4)+' szt. '+x.tk+'.')}
   else{const need=x.q*x.p*x.fx+x.fee;if(need>c.cash+1e-6)return err('Za mało gotówki: potrzeba '+f(need)+', jest '+f(c.cash)+' PLN. Najpierw dodaj wpłatę.')}}}
 ui.msg='';ST.tx.push(x);save();render();
}

function download(name,text,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function wire(){
 $('#bTheme').onclick=()=>{const r=document.documentElement,dk=r.dataset.theme==='dark'||(!r.dataset.theme&&matchMedia('(prefers-color-scheme:dark)').matches);r.dataset.theme=dk?'light':'dark'};
 $('#bBak').onclick=()=>download('ikze-kopia-'+today()+'.json',JSON.stringify(ST,null,1),'application/json');
 $('#bCsv').onclick=()=>download('transakcje-ikze.csv',[['Data','Rodzaj','Ticker','Liczba','Cena','Kurs','Prowizja'],...calc().tx.map(x=>[x.d,x.t,x.tk||'',x.q||'',x.p,x.fx||'',x.fee||''])].map(r=>r.join(';')).join('\n'),'text/csv');
 $('#fImp').onchange=e=>{const fl=e.target.files[0];if(!fl)return;const r=new FileReader();r.onload=()=>{try{const s=JSON.parse(r.result);if(!Array.isArray(s.tx))throw 0;
  if(ST.tx.length&&!confirm('Zastąpić obecne transakcje ('+ST.tx.length+') importowanymi ('+s.tx.length+')?'))return;
  ST={tx:s.tx,cfg:{...ST.cfg,...(s.cfg||{})}};save();render()}catch(x){alert('Nieprawidłowy plik kopii danych.')}};r.readAsText(fl);e.target.value=''};
}

async function init(){
 load();wire();
 const get=u=>fetch(u+'?'+Date.now()).then(r=>{if(!r.ok)throw new Error(u);return r.json()});
 try{[CFG,PR,HI]=await Promise.all([get('config.json'),get('data/prices.json'),get('data/history.json')])}
 catch(e){$('#app').innerHTML='<section><h2>Nie można wczytać danych</h2><div class="mu">Otwórz stronę przez GitHub Pages (nie jako plik z dysku). Brakuje: '+esc(e.message)+'</div></section>';return}
 render();
}
if(typeof window!=='undefined'&&!window.__TEST__)init();
