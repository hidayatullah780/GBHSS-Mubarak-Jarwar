import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import * as fs from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { SETTINGS } from './step3-settings.js';
export { fs, SETTINGS };

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const toMs = t => !t ? 0 : t.toMillis ? t.toMillis() : (t.seconds ? t.seconds*1000 : (Date.parse(t)||0));
export const fmtDate = t => { const m = toMs(t); return m ? new Date(m).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) : '—'; };
export const todayStr = () => { const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); };
export const lsGet = (k,d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch(e){ return d; } };
export const lsSet = (k,v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} };
export function toast(msg, bad){ const t=document.createElement('div'); t.className='s3-toast'+(bad?' bad':''); t.textContent=msg; document.body.appendChild(t); setTimeout(()=>t.remove(),3500); }
export const audiencesFor = role => (role==='admin'||role==='teacher') ? ['all','teachers','students','parents'] : ['all', role+'s'];

export async function fetchByAudience(db, coll, role){
  const out = new Map();
  const res = await Promise.all(audiencesFor(role).map(a => fs.getDocs(fs.query(fs.collection(db,coll), fs.where('audience','==',a)))));
  res.forEach(r => r.docs.forEach(d => out.set(d.id,{id:d.id,...d.data()})));
  return [...out.values()].sort((a,b)=>toMs(b.createdAt)-toMs(a.createdAt));
}

export function csvDownload(filename, rows){
  const flat = v => { if(v==null) return ''; if(v.toDate) return v.toDate().toISOString(); if(typeof v==='object') return JSON.stringify(v); return String(v); };
  const cols = [...new Set(rows.flatMap(r=>Object.keys(r)))];
  const q = v => '"'+flat(v).replace(/"/g,'""')+'"';
  const text = '\uFEFF'+[cols.map(q).join(','), ...rows.map(r=>cols.map(c=>q(r[c])).join(','))].join('\r\n');
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'})); a.download=filename; document.body.appendChild(a); a.click(); a.remove();
}

function css(){ const s=document.createElement('style'); s.textContent=`
*{box-sizing:border-box}body{margin:0;font-family:system-ui,Segoe UI,Arial,sans-serif;background:#f3f5f9;color:#1b2430}
.s3-bar{background:#14365d;color:#fff;display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:10px 16px;position:sticky;top:0;z-index:20}
.s3-bar b{margin-right:12px}.s3-bar a{color:#cfe0f5;text-decoration:none;padding:6px 10px;border-radius:6px;font-size:14px}
.s3-bar a:hover,.s3-bar a.on{background:#24508a;color:#fff}.s3-sp{flex:1}
.s3-wrap{max-width:1000px;margin:18px auto;padding:0 14px}
.s3-card{background:#fff;border-radius:10px;padding:16px;margin-bottom:14px;box-shadow:0 1px 3px rgba(0,0,0,.08)}
h1{font-size:22px;margin:0 0 12px}h2{font-size:17px;margin:0 0 10px}
label{display:block;font-size:13px;color:#4a5668;margin:8px 0 3px}
input,select,textarea{width:100%;padding:9px;border:1px solid #c6cfdb;border-radius:7px;font:inherit;background:#fff}
textarea{min-height:80px}.s3-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px}
.s3-btn{background:#14365d;color:#fff;border:0;border-radius:7px;padding:9px 16px;cursor:pointer;font:inherit}
.s3-btn.sec{background:#e4e9f1;color:#14365d}.s3-btn.red{background:#b3261e}.s3-btn:disabled{opacity:.5}
.s3-badge{display:inline-block;padding:2px 9px;border-radius:99px;font-size:12px;background:#e4e9f1;color:#14365d;margin-right:6px}
.s3-badge.late{background:#fde2e0;color:#b3261e}.s3-badge.today{background:#fff1cc;color:#8a5a00}.s3-badge.ok{background:#dff3e4;color:#1d6b34}
.s3-item{border-top:1px solid #e6eaf0;padding:12px 0}.s3-item:first-child{border-top:0}.s3-muted{color:#6b778a;font-size:13px}
table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:left;padding:7px 8px;border-bottom:1px solid #e6eaf0}th{background:#f3f5f9}
.s3-toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#1d6b34;color:#fff;padding:10px 18px;border-radius:8px;z-index:99}
.s3-toast.bad{background:#b3261e}.s3-bell{position:relative;background:none;border:0;color:#fff;font-size:18px;cursor:pointer}
.s3-dot{position:absolute;top:-4px;right:-6px;background:#e53935;color:#fff;border-radius:99px;font-size:11px;padding:1px 6px}
.s3-pop{position:absolute;right:12px;top:52px;width:min(340px,92vw);max-height:60vh;overflow:auto;background:#fff;color:#1b2430;border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.25);display:none}
.s3-pop.open{display:block}.s3-pop div{padding:10px 12px;border-bottom:1px solid #eee;font-size:14px}
@media print{.s3-bar,.s3-noprint,.s3-toast{display:none!important}body{background:#fff}.s3-card{box-shadow:none}}`; document.head.appendChild(s); }

function fatal(msg){ document.body.innerHTML='<div style="max-width:560px;margin:60px auto;font-family:system-ui;padding:20px;border:2px solid #b3261e;border-radius:10px"><h2>Cannot start</h2><p>'+esc(msg)+'</p></div>'; return new Promise(()=>{}); }

export async function boot(opts={}){
  css();
  let cfg = SETTINGS.MANUAL_FIREBASE_CONFIG;
  if(!cfg){ try{ const m = await import('./firebase-config.js'); cfg = m.firebaseConfig || (m.app && m.app.options) || (m.default && (m.default.options || m.default)) || window.firebaseConfig; }catch(e){ cfg = window.firebaseConfig; } }
  if(!cfg || !cfg.apiKey) return fatal('Firebase config not found. Open js/step3-settings.js and paste your firebaseConfig into MANUAL_FIREBASE_CONFIG.');
  const app = initializeApp(cfg); // default app name, so the existing login session is shared
  const auth = getAuth(app), db = fs.getFirestore(app);
  const user = await new Promise(r=>{ const u=onAuthStateChanged(auth,x=>{u();r(x);}); });
  if(!user){ location.href = SETTINGS.LOGIN_URL; return new Promise(()=>{}); }
  const snap = await fs.getDoc(fs.doc(db,'users',user.uid));
  const profile = snap.exists() ? snap.data() : null;
  if(!profile || profile.active===false){ await signOut(auth); location.href = SETTINGS.LOGIN_URL; return new Promise(()=>{}); }
  const role = profile.role;
  if(opts.roles && !opts.roles.includes(role)) return fatal('Your role ('+role+') cannot open this page. Go back to the dashboard.');
  const ctx = { db, auth, user, profile, role, isAdmin: role==='admin', isStaff: role==='admin'||role==='teacher' };
  shell(ctx, opts.page);
  return ctx;
}

async function shell(ctx, page){
  const links = [['homework.html','Homework'],['announcements.html','Announcements']];
  if(ctx.isStaff) links.push(['reports.html','Reports']);
  const bar = document.createElement('div'); bar.className='s3-bar';
  bar.innerHTML = '<b>'+esc(SETTINGS.SCHOOL_NAME)+'</b><a href="'+SETTINGS.DASHBOARD_URL+'">&larr; Dashboard</a>'
    + links.map(l=>'<a class="'+(page===l[0].replace('.html','')?'on':'')+'" href="'+l[0]+'">'+l[1]+'</a>').join('')
    + '<span class="s3-sp"></span><button class="s3-bell" title="Notifications">🔔<span class="s3-dot" style="display:none">0</span></button>'
    + '<span style="font-size:13px">'+esc(ctx.profile.displayName||ctx.user.email)+' · '+esc(ctx.role)+'</span><a href="#" id="s3out">Logout</a>';
  document.body.prepend(bar);
  const pop = document.createElement('div'); pop.className='s3-pop'; document.body.appendChild(pop);
  bar.querySelector('#s3out').onclick = async e => { e.preventDefault(); await signOut(ctx.auth); location.href = SETTINGS.LOGIN_URL; };
  const key='s3seen_'+ctx.user.uid, dot=bar.querySelector('.s3-dot');
  let list=[];
  try{ list = await fetchByAudience(ctx.db,'notifications',ctx.role); }catch(e){ console.warn('notifications',e); }
  const seen = lsGet(key,0); const n = list.filter(x=>toMs(x.createdAt)>seen).length;
  if(n){ dot.textContent=n>99?'99+':n; dot.style.display=''; }
  pop.innerHTML = list.length ? list.slice(0,30).map(x=>'<div><b>'+esc(x.title)+'</b><br><span class="s3-muted">'+esc(x.body)+' · '+fmtDate(x.createdAt)+'</span></div>').join('') : '<div class="s3-muted">No notifications yet.</div>';
  bar.querySelector('.s3-bell').onclick = () => { pop.classList.toggle('open'); lsSet(key,Date.now()); dot.style.display='none'; };
}
