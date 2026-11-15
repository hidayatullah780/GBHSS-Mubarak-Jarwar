// GBHSS Mubarak Jarwar — Subjects.
//
// subjects/{id} : { name, code }
// A plain list of subject names. Teachers pick from it (or type their own) when they add their periods.
// Administrators add/edit/remove subjects. Everyone else can view the list.

import {
  db, collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, limit, serverTimestamp,
} from '../firebase-config.js';
import { escapeHtml, emptyState, icon } from '../utils/helpers.js';
import { injectSharedStyle, friendlyError, writeAudit, showNotice, newKey } from './shared.js';

export async function renderSubjects(container, actor) {
  injectSharedStyle();
  const isAdmin = actor.profile.role === 'admin';
  const root = document.createElement('div');
  container.replaceChildren(root);

  root.innerHTML = `
    <div class="page-head"><div><h1>Subjects</h1><p>The list of subjects taught at the school.</p></div></div>
    <div id="subNotice" role="status" aria-live="polite" hidden></div>
    ${isAdmin ? `
    <section class="card sm-section">
      <div class="card-head">${icon('plus', 20)}<h2 id="subFormTitle">Add subject</h2></div>
      <form id="subForm" class="sm-row" novalidate>
        <div class="field"><label for="subName">Subject name</label>
          <input class="input" id="subName" maxlength="60" placeholder="e.g. Mathematics" autocomplete="off">
          <div class="field-error" id="subNameErr" role="alert"></div></div>
        <div class="field" style="flex:0 1 160px"><label for="subCode">Code (optional)</label>
          <input class="input" id="subCode" maxlength="12" placeholder="e.g. MATH" autocomplete="off">
          <div class="field-error" id="subCodeErr" role="alert"></div></div>
        <div class="sm-actions">
          <button type="submit" class="btn btn-primary" id="subSave">Add subject</button>
          <button type="button" class="btn btn-ghost" id="subCancel" hidden>Cancel editing</button>
        </div>
      </form>
    </section>` : ''}
    <section class="card">
      <div class="card-head">${icon('subjects', 20)}<h2>All subjects</h2></div>
      <div id="subList" aria-live="polite">Loading…</div>
    </section>`;

  const $q = (s) => root.querySelector(s);
  let subjects = []; let editingId = null;
  const notice = (kind, text) => showNotice($q('#subNotice'), kind, text);

  async function load() {
    try {
      const snap = await getDocs(query(collection(db, 'subjects'), limit(300)));
      subjects = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.name).localeCompare(String(b.name)));
      draw();
    } catch (error) { $q('#subList').textContent = friendlyError(error); }
  }

  function draw() {
    if (!subjects.length) { $q('#subList').innerHTML = emptyState('subjects', 'No subjects yet', isAdmin ? 'Add your first subject above.' : 'The administration has not added subjects yet. You can still type your own subject when you add a period.'); return; }
    const rows = subjects.map((s) => `<tr><td>${escapeHtml(s.name)}</td><td>${escapeHtml(s.code || '—')}</td>
      ${isAdmin ? `<td><div class="sm-actions"><button type="button" class="btn btn-ghost btn-sm" data-edit="${escapeHtml(s.id)}">Edit</button><button type="button" class="btn btn-ghost btn-sm" data-del="${escapeHtml(s.id)}">Remove</button></div></td>` : ''}</tr>`).join('');
    $q('#subList').innerHTML = `<div class="sm-table-wrap"><table class="sm-table"><thead><tr><th>Subject</th><th>Code</th>${isAdmin ? '<th></th>' : ''}</tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  function resetForm() {
    editingId = null;
    if (!isAdmin) return;
    $q('#subForm').reset(); $q('#subFormTitle').textContent = 'Add subject'; $q('#subSave').textContent = 'Add subject'; $q('#subCancel').hidden = true;
  }

  if (isAdmin) {
    $q('#subCancel').addEventListener('click', resetForm);

    $q('#subForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const name = $q('#subName').value.trim().replace(/\s+/g, ' ');
      const code = $q('#subCode').value.trim().toUpperCase();
      let ok = true;
      $q('#subNameErr').textContent = ''; $q('#subCodeErr').textContent = '';
      if (name.length < 2 || name.length > 60) { $q('#subNameErr').textContent = 'Enter a name of 2 to 60 characters.'; ok = false; }
      else if (subjects.some((s) => s.id !== editingId && newKey(s.name) === newKey(name))) { $q('#subNameErr').textContent = 'This subject already exists.'; ok = false; }
      if (code && !/^[A-Z0-9-]{1,12}$/.test(code)) { $q('#subCodeErr').textContent = 'Use letters, numbers or hyphens only (up to 12).'; ok = false; }
      if (!ok) return;

      const button = $q('#subSave'); button.disabled = true;
      try {
        if (editingId) {
          await updateDoc(doc(db, 'subjects', editingId), { name, code, updatedAt: serverTimestamp() });
          await writeAudit(actor, 'subject.update', 'subject', editingId, { name });
          notice('info', `${name} updated.`);
        } else {
          const ref = await addDoc(collection(db, 'subjects'), { name, code, createdAt: serverTimestamp(), createdBy: actor.user.uid });
          await writeAudit(actor, 'subject.create', 'subject', ref.id, { name });
          notice('info', `${name} added.`);
        }
        resetForm(); await load();
      } catch (error) { notice('warn', friendlyError(error)); }
      button.disabled = false;
    });

    $q('#subList').addEventListener('click', async (event) => {
      const edit = event.target.closest('[data-edit]');
      const del = event.target.closest('[data-del]');
      if (edit) {
        const s = subjects.find((x) => x.id === edit.dataset.edit); if (!s) return;
        editingId = s.id;
        $q('#subName').value = s.name || ''; $q('#subCode').value = s.code || '';
        $q('#subFormTitle').textContent = `Edit ${s.name}`; $q('#subSave').textContent = 'Save changes'; $q('#subCancel').hidden = false;
        $q('#subForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      if (del) {
        const s = subjects.find((x) => x.id === del.dataset.del); if (!s) return;
        if (!window.confirm(`Remove subject ${s.name}? Periods already in the timetable keep their subject name.`)) return;
        try {
          await deleteDoc(doc(db, 'subjects', s.id));
          await writeAudit(actor, 'subject.delete', 'subject', s.id, { name: s.name });
          if (editingId === s.id) resetForm();
          notice('info', `${s.name} removed.`); await load();
        } catch (error) { notice('warn', friendlyError(error)); }
      }
    });
  }

  await load();
}
