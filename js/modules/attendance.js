// GBHSS Mubarak Jarwar — Attendance.
//
// attendance/{studentId_date}        : one student, one day  { studentId, classId, sectionId, classKey, date, status, markedBy, ... }
// attendanceSummary/{sectionId_date} : the day's totals for one section (so the dashboard needs only a few reads)
//
// Admin and teachers mark and correct attendance. A student sees only their own record; a parent sees only
// their linked children (the Security Rules enforce this, not just this page).

import {
  db, collection, getDocs, getDoc, doc, query, where, limit, writeBatch, serverTimestamp,
} from '../firebase-config.js';
import { escapeHtml, emptyState, icon } from '../utils/helpers.js';
import { injectSharedStyle, friendlyError, writeAudit, showNotice } from './shared.js';
import { DAY_NAMES } from './reminders.js';

const val = (v) => escapeHtml(v == null ? '' : String(v));
const STATUS = { present: 'Present', absent: 'Absent', leave: 'Leave' };
const KEY = { present: 'P', absent: 'A', leave: 'L' };

export const pad = (n) => String(n).padStart(2, '0');
export const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const percent = (present, total) => (total ? Math.round((present / total) * 100) : null);

export async function renderAttendance(container, actor) {
  injectSharedStyle();
  const role = actor.profile.role;
  const root = document.createElement('div');
  container.replaceChildren(root);
  if (role === 'admin' || role === 'teacher') await staffView(root, actor);
  else await familyView(root, actor);
}

/* ====================================================================== staff: mark + history */
async function staffView(root, actor) {
  const isAdmin = actor.profile.role === 'admin';
  const today = isoDate(new Date());
  root.innerHTML = `
    <div class="page-head"><div><h1>Attendance</h1><p>Mark daily attendance for a class, or review past days.</p></div></div>
    <div id="atNotice" role="status" aria-live="polite" hidden></div>
    <section class="card sm-section">
      <div class="sm-row" style="margin-bottom:.75rem">
        <div class="field"><label for="atSection">Class / section</label><select class="input" id="atSection"></select></div>
        <div class="field" style="flex:0 1 170px"><label for="atDate">Date</label><input class="input" id="atDate" type="date" max="${today}" value="${today}"></div>
      </div>
      <div id="atSheet" aria-live="polite">Loading…</div>
    </section>
    <section class="card"><div class="card-head">${icon('attendance', 20)}<h2>History of this section</h2></div>
      <div class="sm-row" style="margin-bottom:.75rem"><div class="field" style="flex:0 1 190px"><label for="atMonth">Month</label><input class="input" id="atMonth" type="month" max="${today.slice(0, 7)}" value="${today.slice(0, 7)}"></div></div>
      <div id="atHistory">Loading…</div></section>`;
  const $q = (s) => root.querySelector(s);
  const notice = (kind, text) => showNotice($q('#atNotice'), kind, text);
  let classes = []; let sections = []; let students = []; let marks = {}; let workingDays = DAY_NAMES.slice(1, 7);

  const sectionLabel = (id) => { const s = sections.find((x) => x.id === id); if (!s) return ''; const c = classes.find((x) => x.id === s.classId); return `${c ? c.name : ''} – ${s.name}`; };

  try {
    const [c, s, st] = await Promise.all([
      getDocs(query(collection(db, 'classes'), limit(100))), getDocs(query(collection(db, 'sections'), limit(500))),
      getDoc(doc(db, 'settings', 'school')),
    ]);
    classes = c.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order || 0) - (b.order || 0));
    sections = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    sections.sort((a, b) => sectionLabel(a.id).localeCompare(sectionLabel(b.id), undefined, { numeric: true }));
    if (st.exists() && (st.data().workingDays || []).length) workingDays = st.data().workingDays;
  } catch (error) { $q('#atSheet').textContent = friendlyError(error); return; }

  if (!sections.length) {
    $q('#atSheet').innerHTML = emptyState('classes', 'No sections yet', 'Add classes and sections first, then admit students.');
    $q('#atHistory').innerHTML = '';
    return;
  }
  $q('#atSection').innerHTML = sections.map((x) => `<option value="${val(x.id)}">${val(sectionLabel(x.id))}</option>`).join('');

  async function loadSheet() {
    const sectionId = $q('#atSection').value; const date = $q('#atDate').value;
    if (!date) return;
    $q('#atSheet').textContent = 'Loading…';
    try {
      const [stu, rec] = await Promise.all([
        getDocs(query(collection(db, 'students'), where('sectionId', '==', sectionId), limit(500))),
        getDocs(query(collection(db, 'attendance'), where('classKey', '==', sectionId), where('date', '==', date), limit(500))),
      ]);
      students = stu.docs.map((d) => ({ id: d.id, ...d.data() })).filter((x) => x.status === 'active')
        .sort((a, b) => (Number(a.rollNo) || 9999) - (Number(b.rollNo) || 9999) || String(a.fullName).localeCompare(String(b.fullName)));
      marks = {}; rec.docs.forEach((d) => { marks[d.data().studentId] = d.data().status; });
      drawSheet();
    } catch (error) { $q('#atSheet').textContent = friendlyError(error); }
  }

  function counts() {
    const out = { present: 0, absent: 0, leave: 0, none: 0 };
    students.forEach((s) => { if (marks[s.id]) out[marks[s.id]] += 1; else out.none += 1; });
    return out;
  }

  function drawSheet() {
    if (!students.length) { $q('#atSheet').innerHTML = emptyState('students', 'No students in this section', 'Admit students to this section in the Students page first.'); return; }
    const saved = students.some((s) => marks[s.id]);
    $q('#atSheet').innerHTML = `<style>
      .at-seg{display:inline-flex;border:1px solid var(--border);border-radius:.5rem;overflow:hidden}.at-seg label{margin:0;cursor:pointer}
      .at-seg input{position:absolute;opacity:0;pointer-events:none}.at-seg span{display:block;padding:.35rem .7rem;font-weight:700;font-size:.85rem;min-width:2.2rem;text-align:center}
      .at-seg input:checked + span.p{background:#0d9488;color:#fff}.at-seg input:checked + span.a{background:#dc2626;color:#fff}.at-seg input:checked + span.l{background:#d97706;color:#fff}
      .at-seg input:focus-visible + span{outline:2px solid var(--primary,#0d9488);outline-offset:-2px}</style>
      <div class="sm-actions" style="margin-bottom:.75rem"><button type="button" class="btn btn-ghost btn-sm" id="atAll">Mark all present</button><span class="badge" id="atCounts"></span>${saved ? '<span class="sm-muted">Already saved for this day. Saving again will update it.</span>' : ''}</div>
      <div class="sm-table-wrap"><table class="sm-table"><thead><tr><th>Roll</th><th>Name</th><th>Attendance</th></tr></thead><tbody>
      ${students.map((s) => `<tr><td>${val(s.rollNo || '—')}</td><td>${val(s.fullName)}</td><td><div class="at-seg" role="radiogroup" aria-label="Attendance of ${val(s.fullName)}">
        ${Object.entries(STATUS).map(([k, l]) => `<label title="${l}"><input type="radio" name="m-${val(s.id)}" value="${k}"${marks[s.id] === k ? ' checked' : ''}><span class="${KEY[k].toLowerCase()}">${KEY[k]}</span></label>`).join('')}</div></td></tr>`).join('')}
      </tbody></table></div>
      <div class="field-error" id="atErr" role="alert"></div>
      <div style="margin-top:1rem"><button type="button" class="btn btn-primary" id="atSave">Save attendance</button></div>`;
    refreshCounts();
  }
  function refreshCounts() {
    const c = counts();
    const el = $q('#atCounts'); if (el) el.textContent = `P ${c.present} · A ${c.absent} · L ${c.leave}${c.none ? ` · ${c.none} not marked` : ''}`;
  }

  async function save() {
    const sectionId = $q('#atSection').value; const date = $q('#atDate').value;
    if (counts().none) { $q('#atErr').textContent = `Mark every student first (${counts().none} left), or use "Mark all present" and change the exceptions.`; return; }
    $q('#atErr').textContent = '';
    const dayName = DAY_NAMES[new Date(`${date}T12:00:00`).getDay()];
    if (!workingDays.includes(dayName) && !window.confirm(`${dayName} is not a working day in Settings. Save attendance anyway?`)) return;
    const section = sections.find((x) => x.id === sectionId);
    const c = counts(); const button = $q('#atSave'); button.disabled = true;
    try {
      const base = { classId: section.classId, sectionId, classKey: sectionId, date, markedBy: actor.user.uid, markedByName: actor.profile.displayName || actor.user.email || '' };
      const ops = students.map((s) => ({ ref: doc(db, 'attendance', `${s.id}_${date}`), data: { ...base, studentId: s.id, status: marks[s.id], updatedAt: serverTimestamp() } }));
      ops.push({ ref: doc(db, 'attendanceSummary', `${sectionId}_${date}`), data: { ...base, classLabel: sectionLabel(sectionId), present: c.present, absent: c.absent, leave: c.leave, total: students.length, updatedAt: serverTimestamp() } });
      for (let i = 0; i < ops.length; i += 400) {
        const batch = writeBatch(db); ops.slice(i, i + 400).forEach((o) => batch.set(o.ref, o.data)); await batch.commit();
      }
      await writeAudit(actor, 'attendance.save', 'attendance', `${sectionId}_${date}`, { section: sectionLabel(sectionId), date, present: c.present, absent: c.absent, leave: c.leave });
      notice('info', `Attendance saved for ${sectionLabel(sectionId)} on ${date}: ${c.present} present, ${c.absent} absent, ${c.leave} on leave.`);
      await Promise.all([loadSheet(), loadHistory()]);
    } catch (error) { notice('warn', friendlyError(error)); button.disabled = false; }
  }

  async function loadHistory() {
    const sectionId = $q('#atSection').value; const month = $q('#atMonth').value;
    try {
      const snap = await getDocs(query(collection(db, 'attendanceSummary'), where('classKey', '==', sectionId), limit(400)));
      const rows = snap.docs.map((d) => d.data()).filter((r) => String(r.date).startsWith(month)).sort((a, b) => b.date.localeCompare(a.date));
      if (!rows.length) { $q('#atHistory').innerHTML = emptyState('attendance', 'No attendance this month', 'Days you save will be listed here.'); return; }
      const tp = rows.reduce((a, r) => a + r.present, 0); const tt = rows.reduce((a, r) => a + r.total, 0);
      $q('#atHistory').innerHTML = `<p class="sm-muted" style="margin:0 0 .6rem">${rows.length} day${rows.length === 1 ? '' : 's'} recorded · average attendance ${percent(tp, tt)}%</p>
        <div class="sm-table-wrap"><table class="sm-table"><thead><tr><th>Date</th><th>Present</th><th>Absent</th><th>Leave</th><th>%</th><th></th></tr></thead><tbody>
        ${rows.map((r) => `<tr><td>${val(r.date)}</td><td>${r.present}</td><td>${r.absent}</td><td>${r.leave}</td><td>${percent(r.present, r.total)}%</td><td><button type="button" class="btn btn-ghost btn-sm" data-open="${val(r.date)}">Open</button></td></tr>`).join('')}</tbody></table></div>`;
    } catch (error) { $q('#atHistory').textContent = friendlyError(error); }
  }

  root.addEventListener('change', (event) => {
    if (event.target.id === 'atSection') { loadSheet(); loadHistory(); }
    if (event.target.id === 'atDate') loadSheet();
    if (event.target.id === 'atMonth') loadHistory();
    if (event.target.matches && event.target.matches('input[type=radio]')) { marks[event.target.name.slice(2)] = event.target.value; refreshCounts(); }
  });
  root.addEventListener('click', (event) => {
    if (event.target.id === 'atAll') { students.forEach((s) => { marks[s.id] = 'present'; }); drawSheet(); }
    if (event.target.id === 'atSave') save();
    const open = event.target.closest('[data-open]');
    if (open) { $q('#atDate').value = open.dataset.open; loadSheet(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  });
  void isAdmin;
  await Promise.all([loadSheet(), loadHistory()]);
}

/* ================================================================ student / parent: view only */
async function familyView(root, actor) {
  const role = actor.profile.role;
  const linkedId = actor.profile.linkedId || '';
  root.innerHTML = `
    <div class="page-head"><div><h1>Attendance</h1><p>${role === 'parent' ? 'Your children\'s attendance (view only).' : 'Your attendance record (view only).'}</p></div></div>
    <section class="card"><div id="fvBody">Loading…</div></section>`;
  const $q = (s) => root.querySelector(s);
  if (!linkedId) { $q('#fvBody').innerHTML = emptyState('attendance', 'Not linked yet', role === 'parent' ? 'Your account is not linked to a child yet. Please contact the school office.' : 'Your account is not linked to a student record yet. Please contact the school office.'); return; }

  let children = [{ id: linkedId, name: actor.profile.displayName || 'Me' }];
  try {
    if (role === 'parent') {
      const links = await getDocs(query(collection(db, 'parentStudentLinks'), where('parentId', '==', linkedId), limit(30)));
      children = [];
      for (const l of links.docs) {
        const sid = l.data().studentId;
        try { const s = await getDoc(doc(db, 'students', sid)); children.push({ id: sid, name: s.exists() ? s.data().fullName : 'Student' }); } catch (e) { /* skip unreadable */ }
      }
      if (!children.length) { $q('#fvBody').innerHTML = emptyState('students', 'No linked children', 'The school office has not linked a child to your account yet.'); return; }
    }
  } catch (error) { $q('#fvBody').textContent = friendlyError(error); return; }

  const month = isoDate(new Date()).slice(0, 7);
  $q('#fvBody').innerHTML = `<div class="sm-row" style="margin-bottom:1rem">
      ${children.length > 1 ? `<div class="field"><label for="fvChild">Child</label><select class="input" id="fvChild">${children.map((c) => `<option value="${val(c.id)}">${val(c.name)}</option>`).join('')}</select></div>` : `<strong>${val(children[0].name)}</strong>`}
      <div class="field" style="flex:0 1 190px"><label for="fvMonth">Month</label><input class="input" id="fvMonth" type="month" value="${month}" max="${month}"></div></div>
    <div id="fvData" aria-live="polite">Loading…</div>`;

  async function load() {
    const id = $q('#fvChild') ? $q('#fvChild').value : children[0].id; const m = $q('#fvMonth').value;
    $q('#fvData').textContent = 'Loading…';
    try {
      const snap = await getDocs(query(collection(db, 'attendance'), where('studentId', '==', id), limit(500)));
      const all = snap.docs.map((d) => d.data()).sort((a, b) => b.date.localeCompare(a.date));
      const rows = all.filter((r) => String(r.date).startsWith(m));
      const n = (list, s) => list.filter((r) => r.status === s).length;
      if (!all.length) { $q('#fvData').innerHTML = emptyState('attendance', 'No attendance yet', 'Attendance will appear here once teachers mark it.'); return; }
      const card = (label, value) => `<div class="card stat"><div><div class="stat-value">${value}</div><div class="stat-label">${label}</div></div></div>`;
      $q('#fvData').innerHTML = `<div class="stat-grid" style="margin-bottom:1rem">${card('This month', rows.length ? percent(n(rows, 'present'), rows.length) + '%' : '—')}${card('Present', n(rows, 'present'))}${card('Absent', n(rows, 'absent'))}${card('Leave', n(rows, 'leave'))}${card('Whole year so far', percent(n(all, 'present'), all.length) + '%')}</div>
        ${rows.length ? `<div class="sm-table-wrap"><table class="sm-table"><thead><tr><th>Date</th><th>Day</th><th>Status</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${val(r.date)}</td><td>${DAY_NAMES[new Date(`${r.date}T12:00:00`).getDay()]}</td><td><span class="badge">${STATUS[r.status] || val(r.status)}</span></td></tr>`).join('')}</tbody></table></div>` : emptyState('attendance', 'Nothing this month', 'No attendance was marked in this month.')}`;
    } catch (error) { $q('#fvData').textContent = friendlyError(error); }
  }
  root.addEventListener('change', (e) => { if (e.target.id === 'fvChild' || e.target.id === 'fvMonth') load(); });
  await load();
}
