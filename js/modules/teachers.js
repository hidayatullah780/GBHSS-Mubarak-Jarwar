// GBHSS Mubarak Jarwar — Teachers (administrator only).
//
// teachers/{id}              : { employeeId, fullName, contact, userUid, active }
// employeeIds/{employeeId}   : { teacherId }  fixed ID => a duplicate employee ID is impossible
//
// Teachers choose their OWN subjects, classes and times in the Timetable page, so the administrator
// only keeps the staff record here. Teachers are deactivated, never deleted, so history stays correct.

import { db, collection, doc, runTransaction, writeBatch, serverTimestamp } from '../firebase-config.js';
import { escapeHtml as esc, emptyState, icon } from '../utils/helpers.js';
import { injectSharedStyle, friendlyError, writeAudit, showNotice, loadAll, accountOptions, relinkAccount } from './shared.js';

export async function renderTeachers(container, actor) {
  injectSharedStyle();
  const root = document.createElement('div');
  container.replaceChildren(root);
  root.innerHTML = `
    <div class="page-head"><div><h1>Teachers</h1><p>Staff records. Each teacher sets their own subjects and times in the Timetable page.</p></div></div>
    <div id="thNotice" role="status" aria-live="polite" hidden></div>
    <section class="card sm-section">
      <div class="card-head">${icon('plus', 20)}<h2 id="thTitle">Add teacher</h2></div>
      <form id="thForm" novalidate>
        <div class="sm-form">
          <div class="field"><label for="thEmp">Employee ID</label><input class="input" id="thEmp" maxlength="30" autocomplete="off"><div class="field-error" id="thEmpErr" role="alert"></div></div>
          <div class="field"><label for="thName">Full name</label><input class="input" id="thName" maxlength="80" autocomplete="off"><div class="field-error" id="thNameErr" role="alert"></div></div>
          <div class="field"><label for="thContact">Contact phone</label><input class="input" id="thContact" maxlength="20" inputmode="tel" autocomplete="off"><div class="field-error" id="thContactErr" role="alert"></div></div>
          <div class="field"><label for="thUser">Sign-in account (optional)</label><select class="input" id="thUser"></select></div>
        </div>
        <div class="sm-actions">
          <button type="submit" class="btn btn-primary" id="thSave">Add teacher</button>
          <button type="button" class="btn btn-ghost" id="thCancel" hidden>Cancel editing</button>
        </div>
      </form>
    </section>
    <section class="card">
      <div class="card-head">${icon('teachers', 20)}<h2>All teachers</h2><span class="badge" id="thCount"></span></div>
      <div class="field"><label class="sr-only" for="thFilter">Search</label><input class="input" id="thFilter" type="search" placeholder="Search name or employee ID…"></div>
      <div id="thList" aria-live="polite">Loading…</div>
    </section>`;

  const $q = (s) => root.querySelector(s);
  let teachers = []; let users = []; let editing = null;
  const notice = (kind, text) => showNotice($q('#thNotice'), kind, text);
  const accountName = (uid) => { const u = users.find((x) => x.id === uid); return u ? (u.displayName || u.email) : ''; };

  async function load() {
    try {
      [teachers, users] = await Promise.all([loadAll('teachers', 500), loadAll('users', 500)]);
      teachers.sort((a, b) => String(a.fullName).localeCompare(String(b.fullName)));
      $q('#thUser').innerHTML = accountOptions(users, 'teacher', editing ? editing.userUid : '', esc);
      draw();
    } catch (error) { $q('#thList').textContent = friendlyError(error); }
  }

  function draw() {
    const f = $q('#thFilter').value.trim().toLowerCase();
    const shown = teachers.filter((t) => !f || `${t.fullName} ${t.employeeId}`.toLowerCase().includes(f));
    $q('#thCount').textContent = `${shown.length} of ${teachers.length}`;
    if (!teachers.length) { $q('#thList').innerHTML = emptyState('teachers', 'No teachers yet', 'Add your first teacher above.'); return; }
    if (!shown.length) { $q('#thList').innerHTML = emptyState('search', 'No match', 'No teacher matches that search.'); return; }
    const rows = shown.map((t) => `<tr class="${t.active ? '' : 'sm-muted'}">
      <td>${esc(t.employeeId)}</td><td>${esc(t.fullName)}</td><td>${esc(t.contact || '—')}</td>
      <td>${esc(accountName(t.userUid) || 'Not linked')}</td><td><span class="badge">${t.active ? 'Active' : 'Inactive'}</span></td>
      <td><div class="sm-actions"><button type="button" class="btn btn-ghost btn-sm" data-edit="${esc(t.id)}">Edit</button>
      <button type="button" class="btn btn-ghost btn-sm" data-toggle="${esc(t.id)}">${t.active ? 'Deactivate' : 'Reactivate'}</button></div></td></tr>`).join('');
    $q('#thList').innerHTML = `<div class="sm-table-wrap"><table class="sm-table"><thead><tr><th>Emp. ID</th><th>Name</th><th>Contact</th><th>Sign-in account</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  function reset() {
    editing = null; $q('#thForm').reset(); $q('#thEmp').disabled = false; $q('#thTitle').textContent = 'Add teacher';
    $q('#thSave').textContent = 'Add teacher'; $q('#thCancel').hidden = true;
    $q('#thUser').innerHTML = accountOptions(users, 'teacher', '', esc);
    root.querySelectorAll('.field-error').forEach((e) => { e.textContent = ''; });
  }
  $q('#thCancel').addEventListener('click', reset);
  $q('#thFilter').addEventListener('input', draw);

  $q('#thList').addEventListener('click', async (event) => {
    const edit = event.target.closest('[data-edit]'); const tog = event.target.closest('[data-toggle]');
    if (edit) {
      const t = teachers.find((x) => x.id === edit.dataset.edit); if (!t) return;
      editing = t;
      $q('#thUser').innerHTML = accountOptions(users, 'teacher', t.userUid, esc);
      $q('#thEmp').value = t.employeeId || ''; $q('#thEmp').disabled = true; $q('#thName').value = t.fullName || '';
      $q('#thContact').value = t.contact || '';
      $q('#thTitle').textContent = `Edit ${t.fullName}`; $q('#thSave').textContent = 'Save changes'; $q('#thCancel').hidden = false;
      $q('#thForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    if (tog) {
      const t = teachers.find((x) => x.id === tog.dataset.toggle); if (!t) return;
      if (t.active && !window.confirm(`Deactivate ${t.fullName}?`)) return;
      tog.disabled = true;
      try {
        await runTransaction(db, async (tx) => { tx.update(doc(db, 'teachers', t.id), { active: !t.active, updatedAt: serverTimestamp(), updatedBy: actor.user.uid }); });
        await writeAudit(actor, t.active ? 'teacher.deactivate' : 'teacher.reactivate', 'teacher', t.id, { name: t.fullName });
        await load();
      } catch (error) { notice('warn', friendlyError(error)); tog.disabled = false; }
    }
  });

  $q('#thForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const clean = (id) => $q(id).value.trim().replace(/\s+/g, ' ');
    const d = { employeeId: editing ? editing.employeeId : clean('#thEmp').toUpperCase(), fullName: clean('#thName'), contact: clean('#thContact'), userUid: $q('#thUser').value };
    root.querySelectorAll('.field-error').forEach((e) => { e.textContent = ''; });
    let ok = true; const err = (id, t) => { $q(id).textContent = t; return false; };
    if (!/^[A-Z0-9-]{1,30}$/.test(d.employeeId)) ok = err('#thEmpErr', 'Use letters, numbers or hyphens only.');
    if (d.fullName.length < 2) ok = err('#thNameErr', 'Enter the teacher\'s full name.');
    if (d.contact && !/^[0-9+\-\s]{7,20}$/.test(d.contact)) ok = err('#thContactErr', 'Enter a valid phone number.');
    if (!ok) return;

    const button = $q('#thSave'); button.disabled = true;
    try {
      const ref = editing ? doc(db, 'teachers', editing.id) : doc(collection(db, 'teachers'));
      const empRef = doc(db, 'employeeIds', d.employeeId);
      await runTransaction(db, async (tx) => {
        const empSnap = editing ? null : await tx.get(empRef);
        if (empSnap && empSnap.exists()) throw new Error('DUP_EMP');
        const base = { ...d, active: editing ? editing.active : true, photoUrl: editing ? editing.photoUrl || '' : '', updatedAt: serverTimestamp(), updatedBy: actor.user.uid };
        if (editing) tx.update(ref, base);
        else {
          tx.set(ref, { ...base, createdAt: serverTimestamp(), createdBy: actor.user.uid });
          tx.set(empRef, { teacherId: ref.id, createdAt: serverTimestamp(), createdBy: actor.user.uid });
        }
      });
      const oldUid = editing ? editing.userUid || '' : '';
      if (d.userUid !== oldUid) {
        const batch = writeBatch(db); relinkAccount(batch, oldUid, d.userUid, ref.id, actor.user.uid, serverTimestamp, doc); await batch.commit();
      }
      await writeAudit(actor, editing ? 'teacher.update' : 'teacher.create', 'teacher', ref.id, { employeeId: d.employeeId, name: d.fullName });
      notice('info', `${d.fullName} ${editing ? 'updated' : 'added'}.`);
      reset(); await load();
    } catch (error) {
      if (error.message === 'DUP_EMP') $q('#thEmpErr').textContent = 'This employee ID is already used.';
      else notice('warn', friendlyError(error));
    }
    button.disabled = false;
  });

  await load();
}
