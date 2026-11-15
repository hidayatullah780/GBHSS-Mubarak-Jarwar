// GBHSS Mubarak Jarwar — Audit Logs (Stage 5, administrator only, read-only).
// auditLogs entries can never be edited or deleted (Security Rules), so this page is a true record.

import { db, collection, getDocs, query, orderBy, limit } from '../firebase-config.js';
import { escapeHtml as esc, emptyState, icon } from '../utils/helpers.js';
import { injectSharedStyle, friendlyError, loadAll, fmtDate } from './shared.js';

export async function renderAudit(container) {
  injectSharedStyle();
  container.innerHTML = `
    <div class="page-head"><div><h1>Audit Logs</h1><p>Who changed what, and when. The latest 300 entries are shown. Entries cannot be edited or deleted.</p></div></div>
    <section class="card">
      <div class="card-head">${icon('audit', 20)}<h2>Activity</h2><span class="badge" id="auCount"></span></div>
      <div class="field"><label class="sr-only" for="auFilter">Filter</label><input class="input" id="auFilter" type="search" placeholder="Filter by person, action or details…"></div>
      <div id="auList" aria-live="polite">Loading…</div>
    </section>`;
  const $q = (s) => container.querySelector(s);
  let logs = []; let names = {};

  const detailText = (d) => Object.entries(d || {}).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(', ');

  function draw() {
    const f = $q('#auFilter').value.trim().toLowerCase();
    const rows = logs.map((l) => ({ l, who: names[l.actorUid] || l.actorUid, text: detailText(l.details) }))
      .filter((r) => !f || `${r.who} ${r.l.action} ${r.l.targetType} ${r.text}`.toLowerCase().includes(f));
    $q('#auCount').textContent = `${rows.length} of ${logs.length}`;
    if (!logs.length) { $q('#auList').innerHTML = emptyState('audit', 'No activity yet', 'Changes made in the system will be listed here.'); return; }
    if (!rows.length) { $q('#auList').innerHTML = emptyState('search', 'No match', 'No entry matches that filter.'); return; }
    $q('#auList').innerHTML = `<div class="sm-table-wrap"><table class="sm-table"><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Target</th><th>Details</th></tr></thead><tbody>${
      rows.map(({ l, who, text }) => `<tr><td>${esc(fmtDate(l.createdAt))}</td><td>${esc(who)}${l.actorRole ? ` <span class="sm-muted">(${esc(l.actorRole)})</span>` : ''}</td>
        <td>${esc(l.action)}</td><td>${esc(l.targetType || '—')}</td><td class="sm-muted">${esc(text || '—')}</td></tr>`).join('')}</tbody></table></div>`;
  }

  try {
    const [snap, users] = await Promise.all([
      getDocs(query(collection(db, 'auditLogs'), orderBy('createdAt', 'desc'), limit(300))),
      loadAll('users', 500),
    ]);
    logs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    users.forEach((u) => { names[u.id] = u.displayName || u.email; });
    draw();
  } catch (error) { $q('#auList').textContent = friendlyError(error); }
  $q('#auFilter').addEventListener('input', draw);
}
