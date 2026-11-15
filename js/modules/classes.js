// GBHSS Mubarak Jarwar — Classes & Sections (administrator only).
//
// classes/{id}   : { name, order }
// sections/{id}  : { classId, name }
// Teachers, students and parents can read these (to show names); only an admin can change them.

import {
  db, collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, limit, writeBatch, serverTimestamp,
} from '../firebase-config.js';
import { escapeHtml, emptyState, icon } from '../utils/helpers.js';
import { injectSharedStyle, friendlyError, writeAudit, showNotice, newKey } from './shared.js';

const PRESET = [6, 7, 8, 9, 10, 11, 12];

export async function renderClasses(container, actor) {
  injectSharedStyle();
  const root = document.createElement('div');
  container.replaceChildren(root);
  root.innerHTML = `
    <div class="page-head"><div><h1>Classes &amp; Sections</h1><p>Create the classes of the school and the sections inside each class.</p></div></div>
    <div id="clsNotice" role="status" aria-live="polite" hidden></div>
    <section class="card sm-section">
      <div class="card-head">${icon('plus', 20)}<h2>Add class</h2></div>
      <form id="clsForm" class="sm-row" novalidate>
        <div class="field"><label for="clsName">Class name</label>
          <input class="input" id="clsName" maxlength="40" placeholder="e.g. Class 6" autocomplete="off">
          <div class="field-error" id="clsErr" role="alert"></div></div>
        <button type="submit" class="btn btn-primary" id="clsAdd">Add class</button>
      </form>
      <div id="clsQuick" style="margin-top:.75rem"></div>
    </section>
    <div id="clsList" aria-live="polite">Loading…</div>`;

  const $q = (s) => root.querySelector(s);
  let classes = []; let sections = [];
  const notice = (kind, text) => showNotice($q('#clsNotice'), kind, text);

  async function load() {
    try {
      const [c, s] = await Promise.all([
        getDocs(query(collection(db, 'classes'), limit(100))),
        getDocs(query(collection(db, 'sections'), limit(500))),
      ]);
      classes = c.docs.map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.order || 0) - (b.order || 0) || String(a.name).localeCompare(String(b.name)));
      sections = s.docs.map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => String(a.name).localeCompare(String(b.name)));
      draw();
    } catch (error) { $q('#clsList').textContent = friendlyError(error); }
  }

  function draw() {
    $q('#clsQuick').innerHTML = classes.length ? ''
      : `<button type="button" class="btn btn-ghost" id="clsPreset">Quick add: Class ${PRESET[0]} to Class ${PRESET[PRESET.length - 1]}</button>
         <span class="sm-muted"> You can rename or remove any of them afterwards.</span>`;
    if (!classes.length) { $q('#clsList').innerHTML = `<div class="card">${emptyState('classes', 'No classes yet', 'Add your first class above, then add its sections.')}</div>`; return; }

    $q('#clsList').innerHTML = `<div class="sm-grid">${classes.map((c) => {
      const own = sections.filter((s) => s.classId === c.id);
      const chips = own.length
        ? own.map((s) => `<span class="sm-chip">${escapeHtml(s.name)}<button type="button" title="Remove section" aria-label="Remove section ${escapeHtml(s.name)}" data-del-sec="${escapeHtml(s.id)}">×</button></span>`).join('')
        : '<span class="sm-muted">No sections yet</span>';
      return `<section class="card">
        <div class="card-head"><h2>${escapeHtml(c.name)}</h2><span class="badge">${own.length} section${own.length === 1 ? '' : 's'}</span></div>
        <div class="sm-chips">${chips}</div>
        <form class="sm-row" data-sec-form="${escapeHtml(c.id)}" novalidate>
          <div class="field"><label class="sr-only" for="sec-${escapeHtml(c.id)}">New section name</label>
            <input class="input" id="sec-${escapeHtml(c.id)}" maxlength="20" placeholder="Section, e.g. A" autocomplete="off"></div>
          <button type="submit" class="btn btn-primary btn-sm">Add section</button>
        </form>
        <div class="sm-actions" style="margin-top:.75rem">
          <button type="button" class="btn btn-ghost btn-sm" data-rename="${escapeHtml(c.id)}">Rename</button>
          <button type="button" class="btn btn-ghost btn-sm" data-del-cls="${escapeHtml(c.id)}">Remove class</button>
        </div>
      </section>`;
    }).join('')}</div>`;
  }

  /* ---- add class ---- */
  $q('#clsForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = $q('#clsName').value.trim().replace(/\s+/g, ' ');
    const err = $q('#clsErr'); err.textContent = '';
    if (name.length < 1 || name.length > 40) { err.textContent = 'Enter a class name (up to 40 characters).'; return; }
    if (classes.some((c) => newKey(c.name) === newKey(name))) { err.textContent = 'A class with this name already exists.'; return; }
    const button = $q('#clsAdd'); button.disabled = true;
    try {
      // "Class 5" sorts as 5, "Class 10" as 10; a name without a number goes to the end.
      const digits = name.match(/\d+/);
      const order = digits ? Number(digits[0]) : classes.reduce((m, c) => Math.max(m, c.order || 0), 0) + 1;
      const ref = await addDoc(collection(db, 'classes'), { name, order, createdAt: serverTimestamp(), createdBy: actor.user.uid });
      await writeAudit(actor, 'class.create', 'class', ref.id, { name });
      $q('#clsName').value = '';
      notice('info', `${name} added.`);
      await load();
    } catch (error) { notice('warn', friendlyError(error)); }
    button.disabled = false;
  });

  /* ---- clicks: preset, rename, remove ---- */
  root.addEventListener('click', async (event) => {
    const t = event.target;
    try {
      if (t.id === 'clsPreset') {
        if (!window.confirm(`Add Class ${PRESET[0]} to Class ${PRESET[PRESET.length - 1]}?`)) return;
        t.disabled = true;
        const batch = writeBatch(db);
        PRESET.forEach((n) => batch.set(doc(collection(db, 'classes')), { name: `Class ${n}`, order: n, createdAt: serverTimestamp(), createdBy: actor.user.uid }));
        await batch.commit();
        await writeAudit(actor, 'class.preset', 'class', '', { from: PRESET[0], to: PRESET[PRESET.length - 1] });
        notice('info', 'Classes added.'); await load(); return;
      }
      const rename = t.closest('[data-rename]');
      if (rename) {
        const c = classes.find((x) => x.id === rename.dataset.rename); if (!c) return;
        const next = (window.prompt('New class name:', c.name) || '').trim().replace(/\s+/g, ' ');
        if (!next || next === c.name) return;
        if (next.length > 40) { notice('warn', 'The name is too long (maximum 40 characters).'); return; }
        if (classes.some((x) => x.id !== c.id && newKey(x.name) === newKey(next))) { notice('warn', 'A class with this name already exists.'); return; }
        await updateDoc(doc(db, 'classes', c.id), { name: next, updatedAt: serverTimestamp() });
        await writeAudit(actor, 'class.rename', 'class', c.id, { from: c.name, to: next });
        notice('info', 'Class renamed.'); await load(); return;
      }
      const delCls = t.closest('[data-del-cls]');
      if (delCls) {
        const c = classes.find((x) => x.id === delCls.dataset.delCls); if (!c) return;
        if (sections.some((s) => s.classId === c.id)) { notice('warn', `Remove the sections of ${c.name} first.`); return; }
        if (!window.confirm(`Remove ${c.name}?`)) return;
        await deleteDoc(doc(db, 'classes', c.id));
        await writeAudit(actor, 'class.delete', 'class', c.id, { name: c.name });
        notice('info', `${c.name} removed.`); await load(); return;
      }
      const delSec = t.closest('[data-del-sec]');
      if (delSec) {
        const s = sections.find((x) => x.id === delSec.dataset.delSec); if (!s) return;
        const c = classes.find((x) => x.id === s.classId);
        if (!window.confirm(`Remove section ${s.name} of ${c ? c.name : 'this class'}?`)) return;
        await deleteDoc(doc(db, 'sections', s.id));
        await writeAudit(actor, 'section.delete', 'section', s.id, { name: s.name, classId: s.classId });
        notice('info', 'Section removed.'); await load();
      }
    } catch (error) { notice('warn', friendlyError(error)); if (t.disabled) t.disabled = false; }
  });

  /* ---- add section ---- */
  root.addEventListener('submit', async (event) => {
    const form = event.target.closest('[data-sec-form]');
    if (!form) return;
    event.preventDefault();
    const classId = form.dataset.secForm;
    const c = classes.find((x) => x.id === classId); if (!c) return;
    const input = form.querySelector('input');
    const name = input.value.trim().replace(/\s+/g, ' ');
    if (!name || name.length > 20) { notice('warn', 'Enter a section name (up to 20 characters).'); return; }
    if (sections.some((s) => s.classId === classId && newKey(s.name) === newKey(name))) { notice('warn', `${c.name} already has a section ${name}.`); return; }
    try {
      const ref = await addDoc(collection(db, 'sections'), { classId, name, createdAt: serverTimestamp(), createdBy: actor.user.uid });
      await writeAudit(actor, 'section.create', 'section', ref.id, { name, classId });
      notice('info', `Section ${name} added to ${c.name}.`); await load();
    } catch (error) { notice('warn', friendlyError(error)); }
  });

  await load();
}
