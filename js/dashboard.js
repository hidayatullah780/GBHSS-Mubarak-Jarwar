// GBHSS Mubarak Jarwar — dashboard.
//
// renderDashboard(role) draws the page instantly (honest placeholders), then hydrateDashboard() fills in the
// REAL figures from the database. Nothing here is sample data: where there are no records, the page says so.
// Figures that belong to modules not built yet (examinations, homework, announcements) stay as empty states.

import { canAccess, ROLES } from './permissions.js';
import { icon, escapeHtml, emptyState } from './utils/helpers.js';

const LATER = 'Available when this module is built';

const DASHBOARDS = {
  admin: {
    stats: [['Total students', 'students', 'students'], ['Total teachers', 'teachers', 'teachers'], ['Total classes', 'classes', 'classes'],
      ["Today's attendance", 'attendance', 'rate'], ['Present today', 'attendance', 'present'], ['Absent today', 'attendance', 'absent']],
    panels: [
      ['attendance-trend', 'Attendance, last 7 days', 'chart', 'No attendance recorded yet', 'Daily attendance will appear here once attendance is marked.'],
      ['distribution', 'Class-wise student distribution', 'classes', 'No students enrolled yet', 'Enrolment by section will appear here after students are admitted.'],
      ['activity', 'Recent administrative activity', 'audit', 'No activity recorded yet', 'Changes made by administrators and teachers will appear here.'],
      ['', 'Examination performance', 'results', 'No results yet', 'Performance charts will appear after marks are entered.'],
      ['', 'Upcoming examinations', 'examinations', 'No examinations scheduled', 'Scheduled examinations will be listed here.'],
      ['', 'Recent announcements', 'announcements', 'No announcements yet', 'School announcements will appear here.'],
    ],
    actions: [['Add student', 'students'], ['Mark attendance', 'attendance'], ['Create examination', 'examinations'], ['New announcement', 'announcements']],
  },
  teacher: {
    stats: [['My periods today', 'timetable', 'periodsToday'], ['My classes', 'classes', 'myClasses'], ['Homework to review', 'homework', 'later'], ['Unread notifications', 'notifications', 'later']],
    panels: [
      ['today-timetable', "Today's timetable", 'timetable', 'No periods today', 'Add your periods in the Timetable page and they will appear here.'],
      ['', 'Recent announcements', 'announcements', 'No announcements yet', 'School and class announcements will appear here.'],
    ],
    actions: [['Mark attendance', 'attendance'], ['My timetable', 'timetable'], ['Enter marks', 'examinations'], ['Add homework', 'homework']],
  },
  student: {
    stats: [['My attendance', 'attendance', 'myRate'], ['Next examination', 'examinations', 'later'], ['Homework due', 'homework', 'later'], ['Latest result', 'results', 'later']],
    panels: [
      ['', "Today's timetable", 'timetable', 'Open the Timetable page', 'Choose your class in the Timetable page to see its weekly periods.'],
      ['', 'Recent announcements', 'announcements', 'No announcements yet', 'School announcements will appear here.'],
    ],
    actions: [['View attendance', 'attendance'], ['View timetable', 'timetable'], ['View results', 'results'], ['View homework', 'homework']],
  },
  parent: {
    stats: [['Linked children', 'students', 'children'], ['Attendance (children)', 'attendance', 'childRate'], ['Latest result', 'results', 'later'], ['Homework due', 'homework', 'later']],
    panels: [
      ['children', 'My children', 'students', 'No linked children', 'Children linked to your account by the school will appear here.'],
      ['', 'Recent announcements', 'announcements', 'No announcements yet', 'School announcements will appear here.'],
    ],
    actions: [['View attendance', 'attendance'], ['View results', 'results'], ['View timetable', 'timetable']],
  },
};

export function renderDashboard(role) {
  const cfg = DASHBOARDS[role];
  const stats = cfg.stats.map(([label, ic, key]) => `
    <div class="card stat" data-stat="${key}">
      <div class="stat-icon">${icon(ic, 22)}</div>
      <div>
        <div class="stat-value" data-value>—</div>
        <div class="stat-label">${escapeHtml(label)}</div>
        <div class="stat-hint" data-hint>${key === 'later' ? LATER : 'Loading…'}</div>
      </div>
    </div>`).join('');

  const panels = cfg.panels.map(([id, title, ic, emptyTitle, emptyText]) => `
    <section class="card"${id ? ` data-panel="${id}"` : ''}>
      <div class="card-head">${icon(ic, 20)}<h2>${escapeHtml(title)}</h2></div>
      <div data-body>${emptyState('inbox', emptyTitle, emptyText)}</div>
    </section>`).join('');

  const actions = cfg.actions
    .filter(([, route]) => canAccess(role, route))
    .map(([label, route]) => `<a class="btn btn-ghost btn-sm" href="#/${route}">${icon('plus', 16)}${escapeHtml(label)}</a>`)
    .join('');

  return `
    <div class="page-head">
      <div>
        <h1>Dashboard</h1>
        <p>${escapeHtml(ROLES[role])} overview</p>
      </div>
      <label class="year-select">Academic year
        <select disabled id="dashYear"><option>Loading…</option></select>
      </label>
    </div>
    <h2 class="section-title">Quick actions</h2>
    <div class="quick-actions">${actions}</div>
    <div class="stat-grid">${stats}</div>
    <div class="grid-2">${panels}</div>`;
}

/* ---------------------------------------------------------------- live figures */

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—');
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export async function hydrateDashboard(root, { user, profile }) {
  const fb = await import('./firebase-config.js');
  const { db, collection, getDocs, getDoc, doc, query, where, limit, orderBy } = fb;
  const role = profile.role;
  const live = () => root.isConnected && root.querySelector('[data-stat]');
  const stat = (key, value, hint) => {
    const el = root.querySelector(`[data-stat="${key}"]`); if (!el) return;
    el.querySelector('[data-value]').textContent = value;
    el.querySelector('[data-hint]').textContent = hint;
  };
  const panel = (id, html) => { const el = root.querySelector(`[data-panel="${id}"] [data-body]`); if (el) el.innerHTML = html; };
  const fail = (keys) => keys.forEach((k) => stat(k, '—', 'Could not load'));

  // How many documents match (cheap server-side count; falls back to reading them if unavailable).
  async function count(q) {
    try {
      const { getCountFromServer } = await import('https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js');
      return (await getCountFromServer(q)).data().count;
    } catch (e) { return (await getDocs(q)).size; }
  }
  const col = (name) => collection(db, name);

  // Academic year (everyone can read it).
  try {
    const snap = await getDocs(query(col('academicYears'), where('current', '==', true), limit(1)));
    const sel = root.querySelector('#dashYear');
    if (sel) sel.innerHTML = `<option>${snap.empty ? 'Not set' : escapeHtml(snap.docs[0].data().name)}</option>`;
  } catch (e) { const sel = root.querySelector('#dashYear'); if (sel) sel.innerHTML = '<option>—</option>'; }

  const today = iso(new Date());

  if (role === 'admin') {
    try {
      const [students, teachers, classes] = await Promise.all([
        count(query(col('students'), where('status', '==', 'active'))),
        count(query(col('teachers'), where('active', '==', true))), count(col('classes'))]);
      if (!live()) return;
      stat('students', students, students ? 'Active students' : 'No records yet');
      stat('teachers', teachers, teachers ? 'Active teachers' : 'No records yet');
      stat('classes', classes, classes ? 'Classes created' : 'No records yet');
    } catch (e) { fail(['students', 'teachers', 'classes']); }

    try {
      const sums = (await getDocs(query(col('attendanceSummary'), where('date', '==', today), limit(100)))).docs.map((d) => d.data());
      const p = sums.reduce((a, r) => a + r.present, 0); const a = sums.reduce((x, r) => x + r.absent, 0); const t = sums.reduce((x, r) => x + r.total, 0);
      if (!live()) return;
      stat('rate', pct(p, t), t ? `${sums.length} section${sums.length === 1 ? '' : 's'} marked` : 'Not marked yet today');
      stat('present', t ? p : '—', t ? `of ${t} students marked` : 'Not marked yet today');
      stat('absent', t ? a : '—', t ? `${sums.reduce((x, r) => x + r.leave, 0)} on leave` : 'Not marked yet today');
    } catch (e) { fail(['rate', 'present', 'absent']); }

    try {
      const since = new Date(); since.setDate(since.getDate() - 6);
      const sums = (await getDocs(query(col('attendanceSummary'), where('date', '>=', iso(since)), limit(600)))).docs.map((d) => d.data());
      const byDay = {}; sums.forEach((r) => { byDay[r.date] = byDay[r.date] || { p: 0, t: 0 }; byDay[r.date].p += r.present; byDay[r.date].t += r.total; });
      const dates = Object.keys(byDay).sort();
      if (dates.length) {
        panel('attendance-trend', `<div style="display:grid;gap:.5rem">${dates.map((d) => {
          const v = Math.round((byDay[d].p / byDay[d].t) * 100);
          return `<div style="display:grid;grid-template-columns:90px 1fr 44px;gap:.6rem;align-items:center;font-size:.85rem"><span>${d.slice(5)} ${DAYS[new Date(`${d}T12:00:00`).getDay()].slice(0, 3)}</span>
            <span style="background:rgba(13,148,136,.15);border-radius:99px;height:.7rem;overflow:hidden"><span style="display:block;height:100%;width:${v}%;background:#0d9488"></span></span><strong>${v}%</strong></div>`;
        }).join('')}</div>`);
      }
    } catch (e) { /* keep empty state */ }

    try {
      const [classes, sections] = await Promise.all([getDocs(query(col('classes'), limit(100))), getDocs(query(col('sections'), limit(500)))]);
      const cl = classes.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order || 0) - (b.order || 0));
      const counts = await Promise.all(cl.map(async (c) => ({ c, n: await count(query(col('students'), where('classId', '==', c.id), where('status', '==', 'active'))) })));
      const total = counts.reduce((a, x) => a + x.n, 0);
      if (total) {
        const max = Math.max(...counts.map((x) => x.n));
        panel('distribution', `<div style="display:grid;gap:.5rem">${counts.filter((x) => x.n).map(({ c, n }) => {
          const secs = sections.docs.filter((s) => s.data().classId === c.id).length;
          return `<div style="display:grid;grid-template-columns:90px 1fr 70px;gap:.6rem;align-items:center;font-size:.85rem"><span>${escapeHtml(c.name)}</span>
            <span style="background:rgba(13,148,136,.15);border-radius:99px;height:.7rem;overflow:hidden"><span style="display:block;height:100%;width:${Math.round((n / max) * 100)}%;background:#0d9488"></span></span><strong>${n}</strong></div>${secs ? '' : ''}`;
        }).join('')}</div>`);
      }
    } catch (e) { /* keep empty state */ }

    try {
      const logs = (await getDocs(query(col('auditLogs'), orderBy('createdAt', 'desc'), limit(6)))).docs.map((d) => d.data());
      if (logs.length) {
        panel('activity', `<ul style="list-style:none;margin:0;padding:0;display:grid;gap:.45rem;font-size:.85rem">${logs.map((l) => {
          const when = l.createdAt && l.createdAt.toDate ? l.createdAt.toDate().toLocaleString() : '';
          return `<li><strong>${escapeHtml(l.action)}</strong> <span class="sm-muted">${escapeHtml(when)}</span></li>`;
        }).join('')}</ul>`);
      }
    } catch (e) { /* keep empty state */ }
    return;
  }

  if (role === 'teacher') {
    try {
      const mine = (await getDocs(query(col('timetable'), where('teacherUid', '==', user.uid), limit(300)))).docs.map((d) => d.data());
      const todays = mine.filter((e) => e.day === DAYS[new Date().getDay()]).sort((a, b) => a.start.localeCompare(b.start));
      const classNames = new Set(mine.map((e) => e.classLabel).filter(Boolean));
      if (!live()) return;
      stat('periodsToday', todays.length, todays.length ? 'Scheduled for today' : 'No periods today');
      stat('myClasses', classNames.size, classNames.size ? 'In your timetable' : 'Add periods in Timetable');
      if (todays.length) panel('today-timetable', `<ul style="list-style:none;margin:0;padding:0;display:grid;gap:.5rem">${todays.map((e) =>
        `<li><strong>${escapeHtml(e.start)}–${escapeHtml(e.end)}</strong> · ${escapeHtml(e.subjectName)}${e.classLabel ? ' · ' + escapeHtml(e.classLabel) : ''}${e.room ? ' · Room ' + escapeHtml(e.room) : ''}</li>`).join('')}</ul>`);
    } catch (e) { fail(['periodsToday', 'myClasses']); }
    return;
  }

  // student / parent
  try {
    const linkedId = profile.linkedId || '';
    let ids = linkedId ? [linkedId] : [];
    let names = {};
    if (role === 'parent' && linkedId) {
      const links = await getDocs(query(col('parentStudentLinks'), where('parentId', '==', linkedId), limit(30)));
      ids = links.docs.map((d) => d.data().studentId);
      for (const id of ids) { try { const s = await getDoc(doc(db, 'students', id)); names[id] = s.exists() ? s.data().fullName : 'Student'; } catch (e) { names[id] = 'Student'; } }
      if (!live()) return;
      stat('children', ids.length, ids.length ? 'Linked to your account' : 'No linked children');
      if (ids.length) panel('children', `<ul style="list-style:none;margin:0;padding:0;display:grid;gap:.45rem">${ids.map((id) => `<li>${escapeHtml(names[id])}</li>`).join('')}</ul>`);
    }
    let present = 0; let total = 0;
    for (const id of ids) {
      const rows = (await getDocs(query(col('attendance'), where('studentId', '==', id), limit(500)))).docs.map((d) => d.data());
      total += rows.length; present += rows.filter((r) => r.status === 'present').length;
    }
    if (!live()) return;
    const key = role === 'parent' ? 'childRate' : 'myRate';
    stat(key, pct(present, total), !ids.length ? 'Not linked to a student yet' : total ? `${present} of ${total} days present` : 'No attendance yet');
  } catch (e) { fail(['myRate', 'childRate', 'children']); }
}
