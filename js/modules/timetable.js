// GBHSS Mubarak Jarwar — Timetable.
//
// timetable/{id} : one period = { day, start, end, classId, sectionId, classLabel, subjectId, subjectName,
//                                 room, teacherUid, teacherName }
//
// Teachers are INDEPENDENT: each teacher adds their own periods with their own start/end times and picks a
// subject from the school list or types their own. No bell schedule or admin set-up is needed.
// Admin can add/edit anything. Students and parents view a class timetable (read-only).
// The page shows today's progress for a teacher; reminders (reminders.js) use the same start times.

import {
  db, collection, getDocs, doc, query, limit, addDoc, updateDoc, deleteDoc, serverTimestamp,
} from '../firebase-config.js';
import { escapeHtml, emptyState, icon } from '../utils/helpers.js';
import { injectSharedStyle, friendlyError, writeAudit, showNotice } from './shared.js';
import { DAY_NAMES, KEYS, readSetting, writeSetting, toMinutes, todayStatus } from './reminders.js';

const val = (v) => escapeHtml(v == null ? '' : String(v));
const OTHER = '__other__';

export async function renderTimetable(container, actor) {
  injectSharedStyle();
  const role = actor.profile.role;
  const isAdmin = role === 'admin';
  const isTeacher = role === 'teacher';
  const uid = actor.user.uid;
  const myName = actor.profile.displayName || actor.user.email || '';

  const root = document.createElement('div');
  container.replaceChildren(root);
  root.innerHTML = `
    <div class="page-head"><div><h1>Timetable</h1><p>${isTeacher ? 'Set your own periods and times. You get a reminder when each one starts.' : isAdmin ? 'View and manage the timetable of any class or teacher.' : 'Weekly timetable of each class.'}</p></div></div>
    <div id="ttNotice" role="status" aria-live="polite" hidden></div>
    ${isTeacher ? '<section class="card sm-section" id="ttToday"></section>' : ''}
    <section class="card sm-section">
      <div class="sm-row" id="ttBar" style="margin-bottom:1rem"></div>
      <div id="ttDays" aria-live="polite">Loading…</div>
    </section>
    <section class="card sm-section" id="ttEditor" hidden></section>`;
  const $q = (s) => root.querySelector(s);
  const notice = (kind, text) => showNotice($q('#ttNotice'), kind, text);

  let days = []; let classes = []; let sections = []; let subjects = []; let entries = []; let teachers = [];
  let view = isTeacher ? 'teacher' : 'class'; let classKey = ''; let teacherPick = isTeacher ? uid : '';
  let editor = null; // { mode: 'add'|'edit', day, entry }

  /* ---------------- data ---------------- */
  async function load() {
    try {
      const reads = [
        getDocs(query(collection(db, 'settings'), limit(10))),
        getDocs(query(collection(db, 'classes'), limit(100))), getDocs(query(collection(db, 'sections'), limit(500))),
        getDocs(query(collection(db, 'subjects'), limit(300))), getDocs(query(collection(db, 'timetable'), limit(2000))),
      ];
      if (isAdmin) reads.push(getDocs(query(collection(db, 'users'), limit(300))));
      const [set, c, s, sub, ent, usr] = await Promise.all(reads);
      const school = (set.docs.find((d) => d.id === 'school') || { data: () => ({}) }).data();
      const wd = (school.workingDays || []).length ? school.workingDays : DAY_NAMES.slice(1, 7);
      days = DAY_NAMES.slice(1).concat(DAY_NAMES[0]).filter((d) => wd.includes(d));
      classes = c.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order || 0) - (b.order || 0));
      sections = s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.name).localeCompare(String(b.name)));
      subjects = sub.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.name).localeCompare(String(b.name)));
      entries = ent.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (usr) teachers = usr.docs.map((d) => ({ uid: d.id, ...d.data() })).filter((u) => u.role === 'teacher' && u.active === true)
        .sort((a, b) => String(a.displayName).localeCompare(String(b.displayName)));
      if (!classKey && classOptions()[0]) classKey = classOptions()[0].key;
      drawAll();
    } catch (error) { $q('#ttDays').textContent = friendlyError(error); }
  }

  function classOptions() {
    const out = [];
    classes.forEach((c) => {
      const own = sections.filter((s) => s.classId === c.id);
      if (!own.length) out.push({ key: `${c.id}|`, label: c.name });
      own.forEach((s) => out.push({ key: `${c.id}|${s.id}`, label: `${c.name} – ${s.name}` }));
    });
    return out;
  }
  const labelFor = (key) => (classOptions().find((o) => o.key === key) || {}).label || '';
  const canEdit = (e) => isAdmin || (isTeacher && e.teacherUid === uid);

  /* ---------------- screen ---------------- */
  function drawAll() { drawBar(); drawDays(); drawEditor(); drawToday(); }

  function drawBar() {
    const tab = (v, label) => `<button type="button" class="btn ${view === v ? 'btn-primary' : 'btn-ghost'} btn-sm" data-view="${v}">${label}</button>`;
    const tabs = [tab('class', 'By class')];
    if (isAdmin) tabs.push(tab('teacher', 'By teacher'));
    if (isTeacher) tabs.unshift(tab('teacher', 'My timetable'));
    let picker = '';
    if (view === 'class') {
      const opts = classOptions();
      picker = opts.length ? `<div class="field"><label for="ttClass">Class</label><select class="input" id="ttClass">${opts.map((o) => `<option value="${val(o.key)}"${o.key === classKey ? ' selected' : ''}>${val(o.label)}</option>`).join('')}</select></div>` : '';
    } else if (isAdmin) {
      picker = `<div class="field"><label for="ttTeacher">Teacher</label><select class="input" id="ttTeacher"><option value="">Choose a teacher…</option>${teachers.map((t) => `<option value="${val(t.uid)}"${t.uid === teacherPick ? ' selected' : ''}>${val(t.displayName || t.email)}</option>`).join('')}</select></div>`;
    }
    $q('#ttBar').innerHTML = `<div class="sm-actions">${tabs.join('')}</div>${picker}`;
  }

  function visibleEntries() {
    if (view === 'class') {
      const [classId, sectionId] = classKey.split('|');
      return entries.filter((e) => e.classId === classId && (e.sectionId || '') === (sectionId || ''));
    }
    return entries.filter((e) => e.teacherUid === teacherPick);
  }

  function drawDays() {
    if (view === 'class' && !classOptions().length) { $q('#ttDays').innerHTML = emptyState('classes', 'No classes yet', isAdmin ? 'Add classes first in Classes & Sections.' : 'Classes have not been added yet.'); return; }
    if (view === 'teacher' && !teacherPick) { $q('#ttDays').innerHTML = emptyState('teachers', 'Choose a teacher', 'Pick a teacher above to see their timetable.'); return; }
    const mine = visibleEntries();
    const canAdd = (view === 'teacher' && (isTeacher || (isAdmin && teacherPick))) || (view === 'class' && (isAdmin || isTeacher));
    $q('#ttDays').innerHTML = `<style>
      .tt-days{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:.75rem}
      .tt-day{border:1px solid var(--border);border-radius:.7rem;padding:.7rem}.tt-day h3{margin:0 0 .5rem;font-size:.95rem;display:flex;justify-content:space-between;align-items:center}
      .tt-item{display:block;width:100%;text-align:left;border:0;background:rgba(13,148,136,.08);color:inherit;font:inherit;border-radius:.5rem;padding:.45rem .6rem;margin-bottom:.4rem}
      button.tt-item{cursor:pointer}button.tt-item:hover{background:rgba(13,148,136,.18)}.tt-time{font-weight:700;font-size:.85rem}</style>
      <div class="tt-days">${days.map((day) => {
        const list = mine.filter((e) => e.day === day).sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
        const items = list.length ? list.map((e) => {
          const second = view === 'class' ? (e.teacherName || '—') : (e.classLabel || '—');
          const body = `<span class="tt-time">${val(e.start)}–${val(e.end)}</span><br><strong>${val(e.subjectName || '—')}</strong><br><span class="sm-muted">${val(second)}${e.room ? ' · Room ' + val(e.room) : ''}</span>`;
          return canEdit(e) ? `<button type="button" class="tt-item" data-edit="${val(e.id)}">${body}</button>` : `<div class="tt-item">${body}</div>`;
        }).join('') : '<p class="sm-muted" style="margin:0 0 .4rem">No periods</p>';
        return `<section class="tt-day"><h3>${day}${canAdd ? `<button type="button" class="btn btn-ghost btn-sm" data-add="${day}" aria-label="Add a period on ${day}">+ Add</button>` : ''}</h3>${items}</section>`;
      }).join('')}</div>`;
  }

  /* ---------------- editor ---------------- */
  function drawEditor() {
    const box = $q('#ttEditor');
    if (!editor) { box.hidden = true; box.innerHTML = ''; return; }
    const old = editor.entry;
    const curClass = old ? `${old.classId}|${old.sectionId || ''}` : (view === 'class' ? classKey : '');
    const classOpts = `<option value="">No class (general)</option>${classOptions().map((o) => `<option value="${val(o.key)}"${o.key === curClass ? ' selected' : ''}>${val(o.label)}</option>`).join('')}`;
    const inList = old && subjects.some((s) => s.id === old.subjectId);
    const subjectOpts = `<option value="">Choose a subject…</option>${subjects.map((s) => `<option value="${val(s.id)}"${old && s.id === old.subjectId ? ' selected' : ''}>${val(s.name)}</option>`).join('')}<option value="${OTHER}"${old && !inList ? ' selected' : ''}>Other (type it)…</option>`;
    const teacherPickId = old ? old.teacherUid : teacherPick;
    const teacherField = isAdmin
      ? `<div class="field"><label for="edTeacher">Teacher</label><select class="input" id="edTeacher"><option value="">Choose a teacher…</option>${teachers.map((t) => `<option value="${val(t.uid)}"${t.uid === teacherPickId ? ' selected' : ''}>${val(t.displayName || t.email)}</option>`).join('')}</select><div class="field-error" id="edTeacherErr" role="alert"></div></div>`
      : `<div class="field"><label>Teacher</label><input class="input" value="${val(myName)} (you)" disabled></div>`;
    box.hidden = false;
    box.innerHTML = `<div class="card-head"><h2>${editor.mode === 'add' ? 'Add period' : 'Edit period'}</h2></div>
      <form id="edForm" class="sm-form" novalidate>
        <div class="field"><label for="edDay">Day</label><select class="input" id="edDay">${days.map((d) => `<option${d === editor.day ? ' selected' : ''}>${d}</option>`).join('')}</select></div>
        <div class="field"><label for="edStart">Starts</label><input class="input" id="edStart" type="time" value="${val(old ? old.start : '')}"></div>
        <div class="field"><label for="edEnd">Ends</label><input class="input" id="edEnd" type="time" value="${val(old ? old.end : '')}"><div class="field-error" id="edTimeErr" role="alert"></div></div>
        <div class="field"><label for="edClass">Class / section</label><select class="input" id="edClass">${classOpts}</select></div>
        <div class="field"><label for="edSubject">Subject</label><select class="input" id="edSubject">${subjectOpts}</select>
          <input class="input" id="edOther" maxlength="60" placeholder="Type the subject name" style="margin-top:.4rem" value="${val(old && !inList ? old.subjectName : '')}"${old && !inList ? '' : ' hidden'}>
          <div class="field-error" id="edSubjectErr" role="alert"></div></div>
        <div class="field"><label for="edRoom">Room (optional)</label><input class="input" id="edRoom" maxlength="30" value="${val(old ? old.room : '')}"></div>
        ${teacherField}
        <div class="field" style="align-self:end"><div class="sm-actions">
          <button type="submit" class="btn btn-primary" id="edSave">${editor.mode === 'add' ? 'Add period' : 'Save changes'}</button>
          ${editor.mode === 'edit' ? '<button type="button" class="btn btn-ghost" id="edRemove">Remove</button>' : ''}
          <button type="button" class="btn btn-ghost" id="edCancel">Cancel</button></div></div>
      </form>`;
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  const overlaps = (a, b) => toMinutes(a.start) < toMinutes(b.end) && toMinutes(b.start) < toMinutes(a.end);

  async function saveEntry(event) {
    event.preventDefault();
    ['#edTimeErr', '#edSubjectErr', '#edTeacherErr'].forEach((id) => { if ($q(id)) $q(id).textContent = ''; });
    const day = $q('#edDay').value; const start = $q('#edStart').value; const end = $q('#edEnd').value;
    const classKeyPicked = $q('#edClass').value;
    const picked = $q('#edSubject').value;
    const typed = $q('#edOther').value.trim().replace(/\s+/g, ' ');
    const subject = subjects.find((s) => s.id === picked);
    const subjectName = picked === OTHER ? typed : (subject ? subject.name : '');
    const subjectId = picked === OTHER ? '' : picked;
    const teacherUid = isAdmin ? $q('#edTeacher').value : uid;
    const teacherName = isAdmin ? ((teachers.find((t) => t.uid === teacherUid) || {}).displayName || '') : myName;
    const room = $q('#edRoom').value.trim();
    const old = editor.entry;

    let ok = true;
    if (Number.isNaN(toMinutes(start)) || Number.isNaN(toMinutes(end)) || toMinutes(end) <= toMinutes(start)) { $q('#edTimeErr').textContent = 'Choose a start time and a later end time.'; ok = false; }
    if (!subjectName || subjectName.length > 60) { $q('#edSubjectErr').textContent = picked === OTHER ? 'Type the subject name (up to 60 characters).' : 'Choose a subject.'; ok = false; }
    if (!teacherUid) { $q('#edTeacherErr').textContent = teachers.length ? 'Choose a teacher.' : 'No teacher accounts yet. Approve teachers in User Management first.'; ok = false; }
    if (!ok) return;

    const [classId, sectionId] = classKeyPicked ? classKeyPicked.split('|') : ['', ''];
    const classLabel = classKeyPicked ? labelFor(classKeyPicked) : '';
    const probe = { start, end };
    const others = entries.filter((e) => e.day === day && (!old || e.id !== old.id));
    const teacherClash = others.find((e) => e.teacherUid === teacherUid && overlaps(e, probe));
    if (teacherClash) { $q('#edTimeErr').textContent = `${teacherName || 'This teacher'} already has ${teacherClash.start}–${teacherClash.end} (${teacherClash.subjectName}) at that time.`; return; }
    const classClash = classId && others.find((e) => e.classId === classId && (e.sectionId || '') === (sectionId || '') && overlaps(e, probe));
    if (classClash) { $q('#edTimeErr').textContent = `${classLabel} already has ${classClash.subjectName} with ${classClash.teacherName || 'another teacher'} at ${classClash.start}–${classClash.end}.`; return; }

    const data = { day, start, end, classId: classId || '', sectionId: sectionId || '', classLabel, subjectId, subjectName, room, teacherUid, teacherName };
    const button = $q('#edSave'); button.disabled = true;
    try {
      if (old) {
        await updateDoc(doc(db, 'timetable', old.id), { ...data, updatedAt: serverTimestamp(), updatedBy: uid });
        await writeAudit(actor, 'timetable.update', 'timetable', old.id, { day, start, end, subjectName });
        notice('info', 'Period updated.');
      } else {
        const ref = await addDoc(collection(db, 'timetable'), { ...data, createdAt: serverTimestamp(), createdBy: uid });
        await writeAudit(actor, 'timetable.create', 'timetable', ref.id, { day, start, end, subjectName });
        notice('info', 'Period added.');
      }
      editor = null; await load();
    } catch (error) { notice('warn', friendlyError(error)); button.disabled = false; }
  }

  async function removeEntry() {
    const old = editor && editor.entry; if (!old) return;
    if (!window.confirm(`Remove ${old.subjectName} on ${old.day} ${old.start}–${old.end}?`)) return;
    try {
      await deleteDoc(doc(db, 'timetable', old.id));
      await writeAudit(actor, 'timetable.delete', 'timetable', old.id, { day: old.day, start: old.start, subjectName: old.subjectName });
      notice('info', 'Period removed.'); editor = null; await load();
    } catch (error) { notice('warn', friendlyError(error)); }
  }

  /* ---------------- teacher: today + reminders (free, in-app) ---------------- */
  function drawToday() {
    if (!isTeacher) return;
    const mine = entries.filter((e) => e.teacherUid === uid);
    const { list, done, next } = todayStatus(new Date(), mine);
    const on = readSetting(KEYS.ON_KEY, '0') === '1';
    const lead = readSetting(KEYS.LEAD_KEY, '5');
    const perm = 'Notification' in window ? Notification.permission : 'unsupported';
    const badge = { done: 'Done', now: 'Now', later: 'Later' };
    const rows = list.length ? list.map(({ entry, status }) => `<tr class="${status === 'done' ? 'sm-muted' : ''}"><td><strong>${val(entry.start)}–${val(entry.end)}</strong></td>
      <td>${val(entry.subjectName)}</td><td>${val(entry.classLabel || '—')}</td><td><span class="badge">${badge[status]}</span></td></tr>`).join('')
      : '';
    $q('#ttToday').innerHTML = `<div class="card-head">${icon('timetable', 20)}<h2>Today</h2><span class="badge">${list.length ? `${done} of ${list.length} done` : 'No periods'}</span></div>
      <p style="margin:0 0 .75rem"><strong>${next ? `Next: ${val(next.entry.start)} — ${val(next.entry.subjectName)}${next.entry.classLabel ? ' · ' + val(next.entry.classLabel) : ''}` : list.length ? 'No more periods today.' : 'You have no periods today. Add yours below.'}</strong></p>
      ${rows ? `<div class="sm-table-wrap"><table class="sm-table"><thead><tr><th>Time</th><th>Subject</th><th>Class</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div>` : ''}
      <div class="sm-row" style="margin-top:.9rem">
        <label style="display:flex;gap:.5rem;align-items:center"><input type="checkbox" id="rmOn"${on ? ' checked' : ''}> Remind me about my periods</label>
        <div class="field" style="flex:0 0 220px"><label class="sr-only" for="rmLead">Reminder time</label>
          <select class="input" id="rmLead"><option value="off"${lead === 'off' ? ' selected' : ''}>Only when the period starts</option>${[2, 5, 10].map((m) => `<option value="${m}"${String(m) === lead ? ' selected' : ''}>${m} minutes before and at start</option>`).join('')}</select></div>
        ${perm === 'default' ? '<button type="button" class="btn btn-ghost btn-sm" id="rmPerm">Allow system pop-ups</button>' : ''}
      </div>
      <p class="sm-muted" style="margin:.75rem 0 0">Reminders work <strong>while this app is open and you are signed in</strong>. They cannot reach a closed app or a sleeping phone; that needs a paid server. While reminders are on you stay signed in for up to 6 hours of inactivity instead of 30 minutes (applies the next time you open the app), so sign out on shared devices.${perm === 'denied' ? ' System pop-ups are blocked in this browser; you will still see the on-screen alert and hear the sound.' : ''}</p>`;
    $q('#rmOn').addEventListener('change', (e) => { writeSetting(KEYS.ON_KEY, e.target.checked ? '1' : '0'); notice('info', e.target.checked ? 'Reminders are on. Keep the app open.' : 'Reminders are off.'); });
    $q('#rmLead').addEventListener('change', (e) => writeSetting(KEYS.LEAD_KEY, e.target.value));
    const p = $q('#rmPerm');
    if (p) p.addEventListener('click', async () => { try { await Notification.requestPermission(); } catch (e) { /* ignore */ } drawToday(); });
  }
  // Keep the "Today" statuses current while the page stays open; stop when the page is gone.
  const clock = setInterval(() => { if (!root.isConnected) { clearInterval(clock); return; } drawToday(); }, 60 * 1000);

  /* ---------------- events ---------------- */
  root.addEventListener('click', (event) => {
    const v = event.target.closest('[data-view]');
    if (v) { view = v.dataset.view; editor = null; drawBar(); drawDays(); drawEditor(); return; }
    const add = event.target.closest('[data-add]');
    if (add) { editor = { mode: 'add', day: add.dataset.add, entry: null }; drawEditor(); return; }
    const edit = event.target.closest('[data-edit]');
    if (edit) { const e = entries.find((x) => x.id === edit.dataset.edit); if (e && canEdit(e)) { editor = { mode: 'edit', day: e.day, entry: e }; drawEditor(); } return; }
    if (event.target.id === 'edCancel') { editor = null; drawEditor(); }
    if (event.target.id === 'edRemove') removeEntry();
  });
  root.addEventListener('change', (event) => {
    if (event.target.id === 'ttClass') { classKey = event.target.value; editor = null; drawDays(); drawEditor(); }
    if (event.target.id === 'ttTeacher') { teacherPick = event.target.value; editor = null; drawDays(); drawEditor(); }
    if (event.target.id === 'edSubject') { $q('#edOther').hidden = event.target.value !== OTHER; if (event.target.value === OTHER) $q('#edOther').focus(); }
  });
  root.addEventListener('submit', (event) => { if (event.target.id === 'edForm') saveEntry(event); });

  await load();
}
