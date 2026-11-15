// GBHSS Mubarak Jarwar — small helpers shared by the Stage 4+ modules.

import { db, collection, addDoc, serverTimestamp } from '../firebase-config.js';

const STYLE_ID = 'gbhss-shared-style';

/** Adds the few extra styles the data pages need (once). */
export function injectSharedStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .sm-row { display:flex; gap:.75rem; flex-wrap:wrap; align-items:flex-end; }
    .sm-row .field { margin-bottom:0; flex:1 1 220px; }
    .sm-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:1rem; }
    .sm-form { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:0 1rem; }
    .sm-table-wrap { overflow-x:auto; }
    .sm-table { width:100%; border-collapse:collapse; font-size:.9rem; }
    .sm-table th, .sm-table td { text-align:left; padding:.55rem .7rem; border-bottom:1px solid var(--border); vertical-align:middle; }
    .sm-table th { font-size:.75rem; text-transform:uppercase; letter-spacing:.05em; color:var(--text-muted); white-space:nowrap; }
    .sm-chips { display:flex; flex-wrap:wrap; gap:.4rem; margin:.6rem 0; }
    .sm-chip { display:inline-flex; align-items:center; gap:.3rem; padding:.2rem .3rem .2rem .7rem; border:1px solid var(--border); border-radius:999px; font-size:.85rem; }
    .sm-chip button { border:0; background:transparent; cursor:pointer; color:var(--text-muted); font-size:1rem; line-height:1; padding:.1rem .35rem; }
    .sm-muted { color:var(--text-muted); font-size:.85rem; }
    .sm-actions { display:flex; gap:.4rem; flex-wrap:wrap; }
    .sm-checks { display:flex; flex-wrap:wrap; gap:.4rem 1rem; margin:.3rem 0 .8rem; }
    .sm-checks label { display:flex; align-items:center; gap:.35rem; font-size:.9rem; }
    .sm-section { margin-bottom:1rem; }
  `;
  document.head.append(style);
}

export function friendlyError(error) {
  const code = error && error.code ? error.code : '';
  const known = {
    'permission-denied': 'Permission denied. Only an active administrator can change this.',
    unavailable: 'Cannot reach the database. Check your internet connection.',
    'failed-precondition': 'The database is not ready for this request. Please try again.',
  };
  return known[code] || 'Something went wrong. Please try again.';
}

/** Records who did what. A failure here must never undo a finished action. */
export async function writeAudit(actor, action, targetType, targetId, details) {
  try {
    await addDoc(collection(db, 'auditLogs'), {
      actorUid: actor.user.uid,
      actorRole: actor.profile.role,
      action,
      targetType,
      targetId: String(targetId || ''),
      details: details || {},
      createdAt: serverTimestamp(),
    });
  } catch (e) { /* ignore */ }
}

/** Shows a message box inside `box` (an element that exists in the page). */
export function showNotice(box, kind, text) {
  box.className = `notice notice-${kind}`;
  box.textContent = text;
  box.hidden = false;
}

export function newKey(text) { return String(text).trim().toLowerCase().replace(/\s+/g, ' '); }

/* ---------- Stage 5 helpers ---------- */

/** Reads up to `max` documents of a collection as [{ id, ...data }]. */
export async function loadAll(name, max = 500) {
  const { getDocs, query, limit } = await import('../firebase-config.js');
  const snap = await getDocs(query(collection(db, name), limit(max)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** <option> list of active accounts of one role, for linking a record to a sign-in account. */
export function accountOptions(users, role, selected, esc) {
  const list = users.filter((u) => u.role === role && u.active === true)
    .sort((a, b) => String(a.displayName || a.email).localeCompare(String(b.displayName || b.email)));
  return `<option value="">Not linked</option>${list.map((u) =>
    `<option value="${esc(u.id)}"${u.id === selected ? ' selected' : ''}>${esc(u.displayName || u.email)} (${esc(u.email || '')})</option>`).join('')}`;
}

/** Adds to `batch` the changes that move a record's link from one account to another. */
export function relinkAccount(batch, oldUid, newUid, recordId, actorUid, serverTimestamp, doc) {
  if (oldUid && oldUid !== newUid) batch.update(doc(db, 'users', oldUid), { linkedId: '', updatedAt: serverTimestamp(), updatedBy: actorUid });
  if (newUid) batch.update(doc(db, 'users', newUid), { linkedId: recordId, updatedAt: serverTimestamp(), updatedBy: actorUid });
}

export function fmtDate(ts) {
  try { return ts && ts.toDate ? ts.toDate().toLocaleString() : '—'; } catch (e) { return '—'; }
}
