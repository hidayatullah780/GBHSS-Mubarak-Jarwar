// GBHSS Mubarak Jarwar — Parents & Guardians (Stage 5, administrator only).
//
// parents/{id}                 : { fullName, contact, userUid, active }
// parentStudentLinks/{parentId_studentId} : { parentId, studentId, relation }
// The Security Rules read the links to decide which children a parent may see.

import { db, collection, doc, setDoc, deleteDoc, addDoc, updateDoc, writeBatch, serverTimestamp } from '../firebase-config.js';
import { escapeHtml as esc, emptyState, icon } from '../utils/helpers.js';
import { injectSharedStyle, friendlyError, writeAudit, showNotice, loadAll, accountOptions, relinkAccount } from './shared.js';

const RELATIONS = ['Father', 'Mother', 'Guardian', 'Brother', 'Uncle', 'Other'];

export async function renderParents(container, actor) {
  injectSharedStyle();
  container.innerHTML = `
    <div class="page-head"><div><h1>Parents &amp; Guardians</h1><p>Register parents and link each one to their children.</p></div></div>
    <div id="paNotice" role="status" aria-live="polite" hidden></div>
    <div class="sm-grid sm-section">
      <section class="card">
        <div class="card-head">${icon('plus', 20)}<h2 id="paTitle">Add parent / guardian</h2></div>
        <form id="paForm" novalidate>
          <div class="field"><label for="paName">Full name</label><input class="input" id="paName" maxlength="80" autocomplete="off"><div class="field-error" id="paNameErr" role="alert"></div></div>
          <div class="field"><label for="paContact">Contact phone</label><input class="input" id="paContact" maxlength="20" inputmode="tel" autocomplete="off"><div class="field-error" id="paContactErr" role="alert"></div></div>
          <div class="field"><label for="paUser">Sign-in account (optional)</label><select class="input" id="paUser"></select></div>
          <div class="sm-actions"><button type="submit" class="btn btn-primary" id="paSave">Add parent</button><button type="button" class="btn btn-ghost" id="paCancel" hidden>Cancel editing</button></div>
        </form>
      </section>
      <section class="card">
        <div class="card-head">${icon('parents', 20)}<h2>Link a child</h2></div>
        <form id="lkForm" novalidate>
          <div class="field"><label for="lkParent">Parent / guardian</label><select class="input" id="lkParent"></select></div>
          <div class="field"><label for="lkStudent">Student</label><select class="input" id="lkStudent"></select></div>
          <div class="field"><label for="lkRel">Relation</label><select class="input" id="lkRel">${RELATIONS.map((r) => `<option>${r}</option>`).join('')}</select></div>
          <button type="submit" class="btn btn-primary" id="lkSave">Link child</button>
        </form>
      </section>
    </div>
    <section class="card">
      <div class="card-head">${icon('parents', 20)}<h2>All parents</h2><span class="badge" id="paCount"></span></div>
      <div class="field"><label class="sr-only" for="paFilter">Search</label><input class="input" id="paFilter" type="search" placeholder="Search name or phone…"></div>
      <div id="paList" aria-live="polite">Loading…</div>
    </section>`;

  const $q = (s) => container.querySelector(s);
  let parents = []; let students = []; let links = []; let users = []; let classes = []; let sections = []; let editing = null;
  const notice = (kind, text) => showNotice($q('#paNotice'), kind, text);
  const stLabel = (id) => {
    const s = students.find((x) => x.id === id); if (!s) return null;
    const c = classes.find((x) => x.id === s.classId); const sec = sections.find((x) => x.id === s.sectionId);
    return `${s.fullName} (${s.admissionNo}${c ? `, ${c.name}${sec ? ' ' + sec.name : ''}` : ''})`;
  };

  async function load() {
    try {
      [parents, students, links, users, classes, sections] = await Promise.all([
        loadAll('parents', 800), loadAll('students', 1500), loadAll('parentStudentLinks', 3000), loadAll('users', 500), loadAll('classes', 100), loadAll('sections', 500)]);
      parents.sort((a, b) => String(a.fullName).localeCompare(String(b.fullName)));
      students.sort((a, b) => String(a.fullName).localeCompare(String(b.fullName)));
      drawSelects(); draw();
    } catch (error) { $q('#paList').textContent = friendlyError(error); }
  }

  function drawSelects() {
    $q('#paUser').innerHTML = accountOptions(users, 'parent', editing ? editing.userUid : '', esc);
    const p = $q('#lkParent').value; const s = $q('#lkStudent').value;
    $q('#lkParent').innerHTML = `<option value="">Select parent</option>${parents.filter((x) => x.active !== false).map((x) => `<option value="${esc(x.id)}">${esc(x.fullName)}${x.contact ? ' — ' + esc(x.contact) : ''}</option>`).join('')}`;
    $q('#lkStudent').innerHTML = `<option value="">Select student</option>${students.filter((x) => x.status === 'active').map((x) => `<option value="${esc(x.id)}">${esc(stLabel(x.id))}</option>`).join('')}`;
    $q('#lkParent').value = p; $q('#lkStudent').value = s;
  }

  function draw() {
    const f = $q('#paFilter').value.trim().toLowerCase();
    const shown = parents.filter((p) => !f || `${p.fullName} ${p.contact || ''}`.toLowerCase().includes(f));
    $q('#paCount').textContent = `${shown.length} of ${parents.length}`;
    if (!parents.length) { $q('#paList').innerHTML = emptyState('parents', 'No parents yet', 'Add a parent or guardian above, then link their children.'); return; }
    if (!shown.length) { $q('#paList').innerHTML = emptyState('search', 'No match', 'No parent matches that search.'); return; }
    const rows = shown.map((p) => {
      const kids = links.filter((l) => l.parentId === p.id).map((l) => `<span class="sm-chip">${esc(stLabel(l.studentId) || 'Unknown student')} · ${esc(l.relation || '')}<button type="button" aria-label="Unlink child" title="Unlink" data-unlink="${esc(l.id)}">×</button></span>`).join('');
      const acct = users.find((u) => u.id === p.userUid);
      return `<tr class="${p.active === false ? 'sm-muted' : ''}"><td>${esc(p.fullName)}</td><td>${esc(p.contact || '—')}</td>
        <td>${esc(acct ? acct.email : '—')}</td><td><div class="sm-chips" style="margin:0">${kids || '<span class="sm-muted">No children linked</span>'}</div></td>
        <td><div class="sm-actions"><button type="button" class="btn btn-ghost btn-sm" data-edit="${esc(p.id)}">Edit</button>
        <button type="button" class="btn btn-ghost btn-sm" data-toggle="${esc(p.id)}">${p.active === false ? 'Reactivate' : 'Deactivate'}</button></div></td></tr>`;
    }).join('');
    $q('#paList').innerHTML = `<div class="sm-table-wrap"><table class="sm-table"><thead><tr><th>Name</th><th>Contact</th><th>Account</th><th>Children</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  function reset() {
    editing = null; $q('#paForm').reset(); $q('#paTitle').textContent = 'Add parent / guardian'; $q('#paSave').textContent = 'Add parent';
    $q('#paCancel').hidden = true; drawSelects();
    container.querySelectorAll('.field-error').forEach((e) => { e.textContent = ''; });
  }
  $q('#paCancel').addEventListener('click', reset);
  $q('#paFilter').addEventListener('input', draw);

  $q('#paList').addEventListener('click', async (event) => {
    const edit = event.target.closest('[data-edit]'); const tog = event.target.closest('[data-toggle]'); const un = event.target.closest('[data-unlink]');
    try {
      if (edit) {
        const p = parents.find((x) => x.id === edit.dataset.edit); if (!p) return;
        editing = p; $q('#paName').value = p.fullName || ''; $q('#paContact').value = p.contact || ''; drawSelects();
        $q('#paTitle').textContent = `Edit ${p.fullName}`; $q('#paSave').textContent = 'Save changes'; $q('#paCancel').hidden = false;
        $q('#paForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      if (tog) {
        const p = parents.find((x) => x.id === tog.dataset.toggle); if (!p) return;
        const next = p.active === false;
        if (!next && !window.confirm(`Deactivate ${p.fullName}?`)) return;
        await updateDoc(doc(db, 'parents', p.id), { active: next, updatedAt: serverTimestamp(), updatedBy: actor.user.uid });
        await writeAudit(actor, next ? 'parent.reactivate' : 'parent.deactivate', 'parent', p.id, { name: p.fullName });
        await load();
      }
      if (un) {
        const l = links.find((x) => x.id === un.dataset.unlink); if (!l) return;
        if (!window.confirm(`Unlink ${stLabel(l.studentId) || 'this student'} from this parent?`)) return;
        await deleteDoc(doc(db, 'parentStudentLinks', l.id));
        await writeAudit(actor, 'parentLink.remove', 'parentStudentLink', l.id, { parentId: l.parentId, studentId: l.studentId });
        notice('info', 'Child unlinked.'); await load();
      }
    } catch (error) { notice('warn', friendlyError(error)); }
  });

  $q('#paForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const clean = (id) => $q(id).value.trim().replace(/\s+/g, ' ');
    const d = { fullName: clean('#paName'), contact: clean('#paContact'), userUid: $q('#paUser').value };
    container.querySelectorAll('.field-error').forEach((e) => { e.textContent = ''; });
    let ok = true;
    if (d.fullName.length < 2) { $q('#paNameErr').textContent = 'Enter the full name.'; ok = false; }
    if (d.contact && !/^[0-9+\-\s]{7,20}$/.test(d.contact)) { $q('#paContactErr').textContent = 'Enter a valid phone number.'; ok = false; }
    if (!ok) return;
    const button = $q('#paSave'); button.disabled = true;
    try {
      let id;
      if (editing) { id = editing.id; await updateDoc(doc(db, 'parents', id), { ...d, updatedAt: serverTimestamp(), updatedBy: actor.user.uid }); }
      else { const ref = await addDoc(collection(db, 'parents'), { ...d, active: true, createdAt: serverTimestamp(), createdBy: actor.user.uid, updatedAt: serverTimestamp(), updatedBy: actor.user.uid }); id = ref.id; }
      const oldUid = editing ? editing.userUid || '' : '';
      if (d.userUid !== oldUid) { const batch = writeBatch(db); relinkAccount(batch, oldUid, d.userUid, id, actor.user.uid, serverTimestamp, doc); await batch.commit(); }
      await writeAudit(actor, editing ? 'parent.update' : 'parent.create', 'parent', id, { name: d.fullName });
      notice('info', `${d.fullName} ${editing ? 'updated' : 'added'}.`); reset(); await load();
    } catch (error) { notice('warn', friendlyError(error)); }
    button.disabled = false;
  });

  $q('#lkForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const parentId = $q('#lkParent').value; const studentId = $q('#lkStudent').value; const relation = $q('#lkRel').value;
    if (!parentId || !studentId) { notice('warn', 'Select both a parent and a student.'); return; }
    const id = `${parentId}_${studentId}`;
    if (links.some((l) => l.id === id)) { notice('warn', 'This child is already linked to this parent.'); return; }
    const button = $q('#lkSave'); button.disabled = true;
    try {
      await setDoc(doc(db, 'parentStudentLinks', id), { parentId, studentId, relation, createdAt: serverTimestamp(), createdBy: actor.user.uid });
      await writeAudit(actor, 'parentLink.create', 'parentStudentLink', id, { parentId, studentId, relation });
      notice('info', 'Child linked.'); $q('#lkStudent').value = ''; await load();
    } catch (error) { notice('warn', friendlyError(error)); }
    button.disabled = false;
  });

  await load();
}
