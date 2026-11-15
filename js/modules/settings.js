// GBHSS Mubarak Jarwar — Settings.
//
// Everyone : sees their own profile and can email themselves a password-reset link.
// Everyone : can read the school information.
// Admin    : edits school information, working days, pass mark, grading scale, and academic years.
//
// settings/school            : school-wide configuration (one document)
// academicYears/{id}         : { name, startDate, endDate, current }  (exactly one is current)

import {
  auth, db, collection, getDocs, getDoc, addDoc, setDoc, updateDoc, deleteDoc, doc, query, limit,
  writeBatch, serverTimestamp, sendPasswordResetEmail,
} from '../firebase-config.js';
import { ROLES } from '../permissions.js';
import { escapeHtml, emptyState, icon } from '../utils/helpers.js';
import { injectSharedStyle, friendlyError, writeAudit, showNotice, newKey } from './shared.js';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// Starting values only. They are shown in the form so you can correct them; nothing is saved until you press Save.
const DEFAULTS = {
  schoolName: 'Government Boys Higher Secondary School Mubarak Jarwar',
  address: 'Mubarak Jarwar, Tando Allahyar, Sindh',
  workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  passPercent: 33,
  grades: [
    { grade: 'A1', min: 80 }, { grade: 'A', min: 70 }, { grade: 'B', min: 60 },
    { grade: 'C', min: 50 }, { grade: 'D', min: 40 }, { grade: 'E', min: 33 }, { grade: 'F', min: 0 },
  ],
};

const val = (v) => escapeHtml(v == null ? '' : String(v));

export async function renderSettings(container, actor) {
  injectSharedStyle();
  const isAdmin = actor.profile.role === 'admin';
  const root = document.createElement('div');
  container.replaceChildren(root);
  const $q = (s) => root.querySelector(s);

  root.innerHTML = `
    <div class="page-head"><div><h1>Settings</h1><p>${isAdmin ? 'Your profile and the school-wide settings.' : 'Your profile and school information.'}</p></div></div>
    <div id="setNotice" role="status" aria-live="polite" hidden></div>

    <section class="card sm-section">
      <div class="card-head">${icon('users', 20)}<h2>My profile</h2></div>
      <table class="sm-table"><tbody>
        <tr><th>Name</th><td>${val(actor.profile.displayName || '—')}</td></tr>
        <tr><th>Email</th><td>${val(actor.user.email || actor.profile.email)}</td></tr>
        <tr><th>Role</th><td>${val(ROLES[actor.profile.role] || actor.profile.role)}</td></tr>
      </tbody></table>
      <p class="sm-muted" style="margin:.75rem 0">To change your photo, use the menu at the top right (your name).</p>
      <button type="button" class="btn btn-ghost" id="setPw">Email me a password-reset link</button>
    </section>

    <section class="card sm-section" id="schoolCard"><div class="card-head">${icon('settings', 20)}<h2>School information</h2></div><div id="schoolBody">Loading…</div></section>
    ${isAdmin ? `<section class="card sm-section"><div class="card-head">${icon('timetable', 20)}<h2>Academic years</h2></div><div id="yearBody">Loading…</div></section>` : ''}`;

  const notice = (kind, text) => showNotice($q('#setNotice'), kind, text);

  /* ---------------- password reset ---------------- */
  $q('#setPw').addEventListener('click', async (event) => {
    const button = event.currentTarget; button.disabled = true;
    try {
      await sendPasswordResetEmail(auth, actor.user.email);
      notice('info', `A password-reset link was sent to ${actor.user.email}. Check your Inbox and Spam folder.`);
    } catch (error) { notice('warn', 'Could not send the email. Please try again later.'); }
    button.disabled = false;
  });

  /* ---------------- school information ---------------- */
  let school = null;
  async function loadSchool() {
    try {
      const snap = await getDoc(doc(db, 'settings', 'school'));
      school = snap.exists() ? snap.data() : null;
    } catch (error) { $q('#schoolBody').textContent = friendlyError(error); return false; }
    return true;
  }

  function drawSchoolReadOnly() {
    if (!school) { $q('#schoolBody').innerHTML = emptyState('settings', 'Not set up yet', 'The administration has not entered the school details yet.'); return; }
    const grades = (school.grades || []).map((g) => `${escapeHtml(g.grade)} (${g.min}%+)`).join(' · ');
    $q('#schoolBody').innerHTML = `<table class="sm-table"><tbody>
      <tr><th>School</th><td>${val(school.schoolName)}</td></tr>
      <tr><th>Address</th><td>${val(school.address || '—')}</td></tr>
      <tr><th>Phone</th><td>${val(school.phone || '—')}</td></tr>
      <tr><th>Email</th><td>${val(school.email || '—')}</td></tr>
      <tr><th>Principal</th><td>${val(school.principalName || '—')}</td></tr>
      <tr><th>Working days</th><td>${val((school.workingDays || []).join(', ') || '—')}</td></tr>
      <tr><th>Pass mark</th><td>${val(school.passPercent)}%</td></tr>
      <tr><th>Grades</th><td>${grades || '—'}</td></tr></tbody></table>`;
  }

  function gradeRow(g, i) {
    return `<tr data-grade-row><td><input class="input" data-g-name value="${val(g.grade)}" maxlength="6" aria-label="Grade ${i + 1}"></td>
      <td><input class="input" data-g-min type="number" min="0" max="100" value="${val(g.min)}" aria-label="Minimum percent for grade ${i + 1}"></td>
      <td><button type="button" class="btn btn-ghost btn-sm" data-g-del aria-label="Remove grade">×</button></td></tr>`;
  }

  function drawSchoolForm() {
    const s = { ...DEFAULTS, ...(school || {}) };
    const days = s.workingDays || [];
    $q('#schoolBody').innerHTML = `
      ${school ? '' : '<p class="notice notice-info">These are starting values. Check them, correct anything that is wrong, and press Save.</p>'}
      <form id="schoolForm" novalidate>
        <div class="sm-form">
          <div class="field"><label for="sName">School name</label><input class="input" id="sName" maxlength="120" value="${val(s.schoolName)}"><div class="field-error" id="sNameErr" role="alert"></div></div>
          <div class="field"><label for="sPrincipal">Principal</label><input class="input" id="sPrincipal" maxlength="80" value="${val(s.principalName)}"></div>
          <div class="field"><label for="sAddress">Address</label><input class="input" id="sAddress" maxlength="200" value="${val(s.address)}"></div>
          <div class="field"><label for="sPhone">Phone</label><input class="input" id="sPhone" maxlength="30" value="${val(s.phone)}"></div>
          <div class="field"><label for="sEmail">School email</label><input class="input" id="sEmail" type="email" maxlength="120" value="${val(s.email)}"><div class="field-error" id="sEmailErr" role="alert"></div></div>
          <div class="field"><label for="sPass">Pass mark (%)</label><input class="input" id="sPass" type="number" min="1" max="100" value="${val(s.passPercent)}"><div class="field-error" id="sPassErr" role="alert"></div></div>
        </div>
        <label>Working days</label>
        <div class="sm-checks" id="sDays">${DAYS.map((d) => `<label><input type="checkbox" value="${d}"${days.includes(d) ? ' checked' : ''}> ${d}</label>`).join('')}</div>
        <label>Grading scale <span class="sm-muted">(minimum percentage for each grade; edit to match your board)</span></label>
        <div class="sm-table-wrap"><table class="sm-table" style="max-width:420px"><thead><tr><th>Grade</th><th>From %</th><th></th></tr></thead>
          <tbody id="gRows">${(s.grades || []).map(gradeRow).join('')}</tbody></table></div>
        <div class="field-error" id="gErr" role="alert"></div>
        <div class="sm-actions" style="margin-top:.5rem"><button type="button" class="btn btn-ghost btn-sm" id="gAdd">Add grade</button></div>
        <div style="margin-top:1rem"><button type="submit" class="btn btn-primary" id="sSave">Save school settings</button></div>
      </form>`;

    $q('#gAdd').addEventListener('click', () => {
      $q('#gRows').insertAdjacentHTML('beforeend', gradeRow({ grade: '', min: '' }, $q('#gRows').children.length));
    });
    $q('#gRows').addEventListener('click', (event) => {
      const del = event.target.closest('[data-g-del]');
      if (del) del.closest('tr').remove();
    });
    $q('#schoolForm').addEventListener('submit', saveSchool);
  }

  async function saveSchool(event) {
    event.preventDefault();
    ['#sNameErr', '#sEmailErr', '#sPassErr', '#gErr'].forEach((id) => { $q(id).textContent = ''; });
    const data = {
      schoolName: $q('#sName').value.trim(),
      principalName: $q('#sPrincipal').value.trim(),
      address: $q('#sAddress').value.trim(),
      phone: $q('#sPhone').value.trim(),
      email: $q('#sEmail').value.trim(),
      passPercent: Number($q('#sPass').value),
      workingDays: [...$q('#sDays').querySelectorAll('input:checked')].map((i) => i.value),
      grades: [...$q('#gRows').querySelectorAll('[data-grade-row]')].map((r) => ({
        grade: r.querySelector('[data-g-name]').value.trim(), min: Number(r.querySelector('[data-g-min]').value),
      })),
    };
    let ok = true;
    if (data.schoolName.length < 3) { $q('#sNameErr').textContent = 'Enter the school name.'; ok = false; }
    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(data.email)) { $q('#sEmailErr').textContent = 'Enter a valid email address.'; ok = false; }
    if (!(data.passPercent >= 1 && data.passPercent <= 100)) { $q('#sPassErr').textContent = 'Enter a number from 1 to 100.'; ok = false; }
    const names = data.grades.map((g) => g.grade.toLowerCase());
    if (!data.grades.length || data.grades.some((g) => !g.grade || !(g.min >= 0 && g.min <= 100))) {
      $q('#gErr').textContent = 'Every grade needs a name and a percentage from 0 to 100.'; ok = false;
    } else if (new Set(names).size !== names.length || new Set(data.grades.map((g) => g.min)).size !== data.grades.length) {
      $q('#gErr').textContent = 'Grade names and percentages must all be different.'; ok = false;
    } else if (!data.grades.some((g) => g.min === 0)) {
      $q('#gErr').textContent = 'One grade must start at 0% so every mark gets a grade.'; ok = false;
    }
    if (!ok) return;
    data.grades.sort((a, b) => b.min - a.min);

    const button = $q('#sSave'); button.disabled = true;
    try {
      await setDoc(doc(db, 'settings', 'school'), { ...data, updatedAt: serverTimestamp(), updatedBy: actor.user.uid });
      await writeAudit(actor, 'settings.school.update', 'settings', 'school', { schoolName: data.schoolName });
      school = data;
      notice('info', 'School settings saved.');
      drawSchoolForm();
    } catch (error) { notice('warn', friendlyError(error)); button.disabled = false; }
  }

  if (await loadSchool()) { if (isAdmin) drawSchoolForm(); else drawSchoolReadOnly(); }

  /* ---------------- academic years (admin) ---------------- */
  if (!isAdmin) return;
  let years = [];

  async function loadYears() {
    try {
      const snap = await getDocs(query(collection(db, 'academicYears'), limit(50)));
      years = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => String(b.startDate || '').localeCompare(String(a.startDate || '')));
      drawYears();
    } catch (error) { $q('#yearBody').textContent = friendlyError(error); }
  }

  function drawYears() {
    const rows = years.length ? `<div class="sm-table-wrap"><table class="sm-table"><thead><tr><th>Year</th><th>Starts</th><th>Ends</th><th>Status</th><th></th></tr></thead><tbody>${years.map((y) => `
      <tr><td>${val(y.name)}</td><td>${val(y.startDate)}</td><td>${val(y.endDate)}</td>
      <td>${y.current ? '<span class="badge">Current</span>' : '<span class="sm-muted">Past / future</span>'}</td>
      <td><div class="sm-actions">${y.current ? '' : `<button type="button" class="btn btn-ghost btn-sm" data-cur="${val(y.id)}">Make current</button><button type="button" class="btn btn-ghost btn-sm" data-ydel="${val(y.id)}">Remove</button>`}</div></td></tr>`).join('')}</tbody></table></div>`
      : emptyState('timetable', 'No academic year yet', 'Add the current academic year below. Attendance, exams and results are grouped by year.');
    $q('#yearBody').innerHTML = `${rows}
      <form id="yearForm" class="sm-form" style="margin-top:1rem" novalidate>
        <div class="field"><label for="yName">Year name</label><input class="input" id="yName" maxlength="30" placeholder="e.g. 2026-27"><div class="field-error" id="yNameErr" role="alert"></div></div>
        <div class="field"><label for="yStart">Starts on</label><input class="input" id="yStart" type="date"></div>
        <div class="field"><label for="yEnd">Ends on</label><input class="input" id="yEnd" type="date"><div class="field-error" id="yDateErr" role="alert"></div></div>
        <div class="field" style="align-self:end"><button type="submit" class="btn btn-primary" id="yAdd">Add academic year</button></div>
      </form>`;
    $q('#yearForm').addEventListener('submit', addYear);
  }

  async function addYear(event) {
    event.preventDefault();
    const name = $q('#yName').value.trim(); const startDate = $q('#yStart').value; const endDate = $q('#yEnd').value;
    $q('#yNameErr').textContent = ''; $q('#yDateErr').textContent = '';
    let ok = true;
    if (!name || name.length > 30) { $q('#yNameErr').textContent = 'Enter a year name, e.g. 2026-27.'; ok = false; }
    else if (years.some((y) => newKey(y.name) === newKey(name))) { $q('#yNameErr').textContent = 'This year already exists.'; ok = false; }
    if (!startDate || !endDate || endDate <= startDate) { $q('#yDateErr').textContent = 'Choose a start date and a later end date.'; ok = false; }
    if (!ok) return;
    const button = $q('#yAdd'); button.disabled = true;
    try {
      const current = years.length === 0; // the first year becomes the current one automatically
      const ref = await addDoc(collection(db, 'academicYears'), { name, startDate, endDate, current, createdAt: serverTimestamp(), createdBy: actor.user.uid });
      await writeAudit(actor, 'academicYear.create', 'academicYear', ref.id, { name });
      notice('info', `${name} added${current ? ' and set as the current year' : ''}.`);
      await loadYears();
    } catch (error) { notice('warn', friendlyError(error)); button.disabled = false; }
  }

  $q('#yearBody').addEventListener('click', async (event) => {
    const cur = event.target.closest('[data-cur]');
    const del = event.target.closest('[data-ydel]');
    try {
      if (cur) {
        const y = years.find((x) => x.id === cur.dataset.cur); if (!y) return;
        if (!window.confirm(`Make ${y.name} the current academic year?`)) return;
        const batch = writeBatch(db);
        years.forEach((x) => { if (x.current && x.id !== y.id) batch.update(doc(db, 'academicYears', x.id), { current: false }); });
        batch.update(doc(db, 'academicYears', y.id), { current: true });
        await batch.commit();
        await writeAudit(actor, 'academicYear.setCurrent', 'academicYear', y.id, { name: y.name });
        notice('info', `${y.name} is now the current academic year. Refresh the page to see it in the top bar.`);
        await loadYears();
      }
      if (del) {
        const y = years.find((x) => x.id === del.dataset.ydel); if (!y || y.current) return;
        if (!window.confirm(`Remove academic year ${y.name}?`)) return;
        await deleteDoc(doc(db, 'academicYears', y.id));
        await writeAudit(actor, 'academicYear.delete', 'academicYear', y.id, { name: y.name });
        notice('info', `${y.name} removed.`); await loadYears();
      }
    } catch (error) { notice('warn', friendlyError(error)); }
  });

  await loadYears();
}
