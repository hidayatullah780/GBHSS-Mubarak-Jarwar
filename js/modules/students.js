// GBHSS Mubarak Jarwar — Students (Stage 5).
//
// students/{id}                : see docs/data-model.md
// admissionNumbers/{admissionNo}: { studentId }   fixed ID => a duplicate admission number is impossible
// rollNumbers/{sectionId_roll}  : { studentId }   fixed ID => a duplicate roll number in a section is impossible
//
// Administrators add and edit students. Teachers can view. Students are never deleted:
// they are marked transferred or inactive so history and reports stay correct.

import {
  db, collection, doc, runTransaction, writeBatch, serverTimestamp,
} from '../firebase-config.js';
import { escapeHtml as esc, emptyState, icon } from '../utils/helpers.js';
import {
  injectSharedStyle, friendlyError, writeAudit, showNotice, loadAll, accountOptions, relinkAccount,
} from './shared.js';

const STATUS = { active: 'Active', transferred: 'Transferred', inactive: 'Inactive' };

export async function renderStudents(container, actor) {
  injectSharedStyle();
  const isAdmin = actor.profile.role === 'admin';
  container.innerHTML = `
    <div class="page-head"><div><h1>Students</h1><p>${isAdmin ? 'Admit students, edit their records and manage transfers.' : 'Student records (view only).'}</p></div></div>
    <div id="stNotice" role="status" aria-live="polite" hidden></div>
    ${isAdmin ? `
    <section class="card sm-section">
      <div class="card-head">${icon('plus', 20)}<h2 id="stTitle">Admit student</h2></div>
      <form id="stForm" novalidate>
        <div class="sm-form">
          <div class="field"><label for="stAdm">Admission no.</label><input class="input" id="stAdm" maxlength="30" autocomplete="off"><div class="field-error" id="stAdmErr" role="alert"></div></div>
          <div class="field"><label for="stName">Full name</label><input class="input" id="stName" maxlength="80" autocomplete="off"><div class="field-error" id="stNameErr" role="alert"></div></div>
          <div class="field"><label for="stFather">Father's name</label><input class="input" id="stFather" maxlength="80" autocomplete="off"><div class="field-error" id="stFatherErr" role="alert"></div></div>
          <div class="field"><label for="stDob">Date of birth</label><input class="input" id="stDob" type="date"><div class="field-error" id="stDobErr" role="alert"></div></div>
          <div class="field"><label for="stGender">Gender</label><select class="input" id="stGender"><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option></select></div>
          <div class="field"><label for="stClass">Class</label><select class="input" id="stClass"></select><div class="field-error" id="stClassErr" role="alert"></div></div>
          <div class="field"><label for="stSection">Section</label><select class="input" id="stSection"></select><div class="field-error" id="stSectionErr" role="alert"></div></div>
          <div class="field"><label for="stRoll">Roll no.</label><input class="input" id="stRoll" type="number" min="1" max="999" inputmode="numeric"><div class="field-error" id="stRollErr" role="alert"></div></div>
          <div class="field"><label for="stAdmDate">Admission date</label><input class="input" id="stAdmDate" type="date"></div>
          <div class="field"><label for="stContact">Contact phone</label><input class="input" id="stContact" maxlength="20" inputmode="tel" autocomplete="off"><div class="field-error" id="stContactErr" role="alert"></div></div>
          <div class="field"><label for="stGName">Guardian name</label><input class="input" id="stGName" maxlength="80" autocomplete="off"></div>
          <div class="field"><label for="stGPhone">Guardian phone</label><input class="input" id="stGPhone" maxlength="20" inputmode="tel" autocomplete="off"></div>
          <div class="field"><label for="stAddress">Address</label><input class="input" id="stAddress" maxlength="200" autocomplete="off"></div>
          <div class="field"><label for="stStatus">Status</label><select class="input" id="stStatus">${Object.entries(STATUS).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></div>
          <div class="field"><label for="stUser">Sign-in account (optional)</label><select class="input" id="stUser"></select></div>
        </div>
        <div class="sm-actions">
          <button type="submit" class="btn btn-primary" id="stSave">Admit student</button>
          <button type="button" class="btn btn-ghost" id="stCancel" hidden>Cancel editing</button>
        </div>
      </form>
    </section>` : ''}
    <section class="card">
      <div class="card-head">${icon('students', 20)}<h2>All students</h2><span class="badge" id="stCount"></span></div>
      <div class="sm-row" style="margin-bottom:.75rem">
        <div class="field"><label class="sr-only" for="stFilter">Search</label><input class="input" id="stFilter" type="search" placeholder="Search name, father, admission no. or roll no.…"></div>
        <div class="field"><label class="sr-only" for="stFClass">Class</label><select class="input" id="stFClass"></select></div>
        <div class="field"><label class="sr-only" for="stFStatus">Status</label><select class="input" id="stFStatus"><option value="">All statuses</option>${Object.entries(STATUS).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></div>
      </div>
      <div id="stList" aria-live="polite">Loading…</div>
    </section>`;

  const $q = (s) => container.querySelector(s);
  let students = []; let classes = []; let sections = []; let users = []; let editing = null;
  const notice = (kind, text) => showNotice($q('#stNotice'), kind, text);
  const cName = (id) => (classes.find((c) => c.id === id) || {}).name || '—';
  const sName = (id) => (sections.find((s) => s.id === id) || {}).name || '—';

  async function load() {
    try {
      [students, classes, sections] = await Promise.all([loadAll('students', 1500), loadAll('classes', 100), loadAll('sections', 500)]);
      if (isAdmin) users = await loadAll('users', 500);
      classes.sort((a, b) => (a.order || 0) - (b.order || 0));
      students.sort((a, b) => String(a.fullName).localeCompare(String(b.fullName)));
      drawSelects(); draw();
    } catch (error) { $q('#stList').textContent = friendlyError(error); }
  }

  function drawSelects() {
    const opts = classes.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
    const keep = $q('#stFClass').value;
    $q('#stFClass').innerHTML = `<option value="">All classes</option>${opts}`; $q('#stFClass').value = keep;
    if (!isAdmin) return;
    const cur = $q('#stClass').value;
    $q('#stClass').innerHTML = `<option value="">Select class</option>${opts}`; $q('#stClass').value = cur;
    drawSections(); drawUsers(editing ? editing.userUid : '');
  }
  function drawSections(selected) {
    const cid = $q('#stClass').value;
    const own = sections.filter((s) => s.classId === cid).sort((a, b) => String(a.name).localeCompare(String(b.name)));
    $q('#stSection').innerHTML = `<option value="">Select section</option>${own.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')}`;
    if (selected) $q('#stSection').value = selected;
  }
  function drawUsers(selected) { $q('#stUser').innerHTML = accountOptions(users, 'student', selected, esc); }

  function draw() {
    const f = $q('#stFilter').value.trim().toLowerCase(); const fc = $q('#stFClass').value; const fs = $q('#stFStatus').value;
    const shown = students.filter((s) => (!fc || s.classId === fc) && (!fs || s.status === fs)
      && (!f || `${s.fullName} ${s.fatherName} ${s.admissionNo} ${s.rollNo || ''}`.toLowerCase().includes(f)));
    $q('#stCount').textContent = `${shown.length} of ${students.length}`;
    if (!students.length) { $q('#stList').innerHTML = emptyState('students', 'No students yet', isAdmin ? 'Admit your first student above. Add classes and sections first if you have not.' : 'No students have been admitted yet.'); return; }
    if (!shown.length) { $q('#stList').innerHTML = emptyState('search', 'No match', 'No student matches these filters.'); return; }
    const rows = shown.map((s) => `<tr class="${s.status === 'active' ? '' : 'sm-muted'}">
      <td>${esc(s.admissionNo)}</td><td>${esc(s.fullName)}</td><td>${esc(s.fatherName || '—')}</td>
      <td>${esc(cName(s.classId))} ${esc(sName(s.sectionId))}</td><td>${esc(s.rollNo || '—')}</td>
      <td>${esc(s.contact || '—')}</td><td><span class="badge">${esc(STATUS[s.status] || s.status)}</span></td>
      ${isAdmin ? `<td><button type="button" class="btn btn-ghost btn-sm" data-edit="${esc(s.id)}">Edit</button></td>` : ''}</tr>`).join('');
    $q('#stList').innerHTML = `<div class="sm-table-wrap"><table class="sm-table"><thead><tr><th>Adm. no.</th><th>Name</th><th>Father</th><th>Class</th><th>Roll</th><th>Contact</th><th>Status</th>${isAdmin ? '<th></th>' : ''}</tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  ['#stFilter', '#stFClass', '#stFStatus'].forEach((s) => $q(s).addEventListener('input', draw));
  if (!isAdmin) { await load(); return; }

  $q('#stClass').addEventListener('change', () => drawSections());

  function reset() {
    editing = null; $q('#stForm').reset(); $q('#stTitle').textContent = 'Admit student'; $q('#stSave').textContent = 'Admit student';
    $q('#stCancel').hidden = true; $q('#stAdm').disabled = false; drawSections(); drawUsers('');
    container.querySelectorAll('.field-error').forEach((e) => { e.textContent = ''; });
  }
  $q('#stCancel').addEventListener('click', reset);

  $q('#stList').addEventListener('click', (event) => {
    const b = event.target.closest('[data-edit]'); if (!b) return;
    const s = students.find((x) => x.id === b.dataset.edit); if (!s) return;
    editing = s;
    $q('#stAdm').value = s.admissionNo || ''; $q('#stAdm').disabled = true; // an admission number never changes
    $q('#stName').value = s.fullName || ''; $q('#stFather').value = s.fatherName || ''; $q('#stDob').value = s.dob || '';
    $q('#stGender').value = s.gender || 'male'; $q('#stClass').value = s.classId || ''; drawSections(s.sectionId);
    $q('#stRoll').value = s.rollNo || ''; $q('#stAdmDate').value = s.admissionDate || ''; $q('#stContact').value = s.contact || '';
    $q('#stGName').value = (s.guardian || {}).name || ''; $q('#stGPhone').value = (s.guardian || {}).phone || '';
    $q('#stAddress').value = s.address || ''; $q('#stStatus').value = s.status || 'active'; drawUsers(s.userUid || '');
    $q('#stTitle').textContent = `Edit ${s.fullName}`; $q('#stSave').textContent = 'Save changes'; $q('#stCancel').hidden = false;
    $q('#stForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  $q('#stForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const clean = (id) => $q(id).value.trim().replace(/\s+/g, ' ');
    const d = {
      admissionNo: editing ? editing.admissionNo : clean('#stAdm').toUpperCase(), fullName: clean('#stName'), fatherName: clean('#stFather'),
      dob: $q('#stDob').value, gender: $q('#stGender').value, classId: $q('#stClass').value, sectionId: $q('#stSection').value,
      rollNo: $q('#stRoll').value ? Number($q('#stRoll').value) : null, admissionDate: $q('#stAdmDate').value, contact: clean('#stContact'),
      guardian: { name: clean('#stGName'), phone: clean('#stGPhone') }, address: clean('#stAddress'), status: $q('#stStatus').value,
      userUid: $q('#stUser').value,
    };
    const err = (id, text) => { $q(id).textContent = text; return false; };
    container.querySelectorAll('.field-error').forEach((e) => { e.textContent = ''; });
    let ok = true;
    if (!/^[A-Z0-9-]{1,30}$/.test(d.admissionNo)) ok = err('#stAdmErr', 'Use letters, numbers or hyphens only.');
    if (d.fullName.length < 2) ok = err('#stNameErr', 'Enter the student\'s full name.');
    if (d.fatherName.length < 2) ok = err('#stFatherErr', 'Enter the father\'s name.');
    if (!d.dob || d.dob > new Date().toISOString().slice(0, 10)) ok = err('#stDobErr', 'Enter a valid date of birth.');
    if (!d.classId) ok = err('#stClassErr', 'Select a class.');
    if (!d.sectionId) ok = err('#stSectionErr', 'Select a section.');
    if (d.rollNo !== null && (!Number.isInteger(d.rollNo) || d.rollNo < 1 || d.rollNo > 999)) ok = err('#stRollErr', 'Roll number must be 1 to 999.');
    if (d.contact && !/^[0-9+\-\s]{7,20}$/.test(d.contact)) ok = err('#stContactErr', 'Enter a valid phone number.');
    if (!ok) return;

    const button = $q('#stSave'); button.disabled = true;
    try {
      const ref = editing ? doc(db, 'students', editing.id) : doc(collection(db, 'students'));
      const admRef = doc(db, 'admissionNumbers', d.admissionNo);
      const rollRef = d.rollNo ? doc(db, 'rollNumbers', `${d.sectionId}_${d.rollNo}`) : null;
      const oldRollRef = editing && editing.rollNo ? doc(db, 'rollNumbers', `${editing.sectionId}_${editing.rollNo}`) : null;
      await runTransaction(db, async (tx) => {
        // All reads first, then all writes (a Firestore transaction rule).
        const admSnap = editing ? null : await tx.get(admRef);
        const rollSnap = rollRef ? await tx.get(rollRef) : null;
        if (admSnap && admSnap.exists()) throw new Error('DUP_ADM');
        if (rollSnap && rollSnap.exists() && rollSnap.data().studentId !== ref.id) throw new Error('DUP_ROLL');
        const base = { ...d, updatedAt: serverTimestamp(), updatedBy: actor.user.uid, photoUrl: editing ? (editing.photoUrl || '') : '' };
        if (editing) tx.update(ref, base);
        else {
          tx.set(ref, { ...base, createdAt: serverTimestamp(), createdBy: actor.user.uid });
          tx.set(admRef, { studentId: ref.id, createdAt: serverTimestamp(), createdBy: actor.user.uid });
        }
        if (oldRollRef && (!rollRef || oldRollRef.path !== rollRef.path)) tx.delete(oldRollRef);
        if (rollRef && !(rollSnap && rollSnap.exists())) tx.set(rollRef, { studentId: ref.id, createdAt: serverTimestamp(), createdBy: actor.user.uid });
      });
      if (users.length && (d.userUid || (editing && editing.userUid)) && d.userUid !== (editing ? editing.userUid || '' : '')) {
        const batch = writeBatch(db);
        relinkAccount(batch, editing ? editing.userUid : '', d.userUid, ref.id, actor.user.uid, serverTimestamp, doc);
        await batch.commit();
      }
      await writeAudit(actor, editing ? 'student.update' : 'student.create', 'student', ref.id, { admissionNo: d.admissionNo, name: d.fullName, status: d.status });
      notice('info', `${d.fullName} ${editing ? 'updated' : 'admitted'}.`);
      reset(); await load();
    } catch (error) {
      if (error.message === 'DUP_ADM') { $q('#stAdmErr').textContent = 'This admission number is already used.'; }
      else if (error.message === 'DUP_ROLL') { $q('#stRollErr').textContent = 'This roll number is already taken in that section.'; }
      else notice('warn', friendlyError(error));
    }
    button.disabled = false;
  });

  await load();
}
