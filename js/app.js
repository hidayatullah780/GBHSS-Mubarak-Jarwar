// GBHSS Mubarak Jarwar — School Management System
// Developed by Hidayatullah, with the guidance of Sir Amjad Ali, the motivation of Sir Asfand Ali, and the support of the rest of the faculty.
//
// Stage 5: students, teachers, parents and audit logs are now real modules.
// Stage 3: the role now comes from the signed-in user's profile in Firestore (users/{uid}).
// The URL can no longer choose a role. The Security Rules enforce real access on the server.

import { ROLES, navForRole } from './permissions.js';
import { initRouter } from './router.js';
import { renderDashboard, hydrateDashboard } from './dashboard.js';
import { requireSession, startIdleTimer, logout } from './session.js';
import { $, $$, icon, escapeHtml, emptyState, getTheme, toggleTheme, store } from './utils/helpers.js';

const LOGIN_URL = 'pages/login.html';
const IDLE_MINUTES = 30;

console.info('GBHSS Mubarak Jarwar — developed by Hidayatullah, with the guidance of Sir Amjad Ali, the motivation of Sir Asfand Ali, and the support of the rest of the faculty.');

// Modules that are built are loaded only when opened, which keeps the app light.
const MODULES = {
  users: () => import('./modules/users.js').then((m) => m.renderUsers),
  classes: () => import('./modules/classes.js').then((m) => m.renderClasses),
  subjects: () => import('./modules/subjects.js').then((m) => m.renderSubjects),
  settings: () => import('./modules/settings.js').then((m) => m.renderSettings),
  students: () => import('./modules/students.js').then((m) => m.renderStudents),
  teachers: () => import('./modules/teachers.js').then((m) => m.renderTeachers),
  parents: () => import('./modules/parents.js').then((m) => m.renderParents),
  audit: () => import('./modules/audit.js').then((m) => m.renderAudit),
  timetable: () => import('./modules/timetable.js').then((m) => m.renderTimetable),
  attendance: () => import('./modules/attendance.js').then((m) => m.renderAttendance),
};

document.getElementById('app').innerHTML =
  '<p style="padding:2rem;font-family:system-ui,sans-serif">Loading GBHSS Mubarak Jarwar…</p>';

const session = await requireSession(LOGIN_URL);
if (session) start(session);

function start({ user, profile }) {
  const role = profile.role;
  const name = profile.displayName || user.email || 'User';

  document.getElementById('app').innerHTML = shellHtml(role, name, user.email || '', profile.photo || '');
  if (store.get('gbhss-sidebar') === 'collapsed' && !isMobile()) $('#shell').classList.add('is-collapsed');
  wireShell();
  wirePhoto(user, profile);
  showCurrentYear();
  if (role === 'teacher') import('./modules/reminders.js').then((m) => m.startReminders({ user, profile })).catch(() => {});
  // Teachers who switched period reminders on may stay signed in longer, so the reminders can keep running.
  let remindersOn = false;
  try { remindersOn = role === 'teacher' && localStorage.getItem('gbhss-remind-on') === '1'; } catch (e) { /* ignore */ }
  startIdleTimer(remindersOn ? 360 : IDLE_MINUTES, () => logout(LOGIN_URL, 'idle'));

  const routes = {};
  navForRole(role).filter((item) => !item.action).forEach((item) => {
    routes[item.id] = { render: () => renderPage(item) };
  });

  initRouter({ routes, defaultRoute: 'dashboard', onChange: setActive });

  async function renderPage(item) {
    const content = $('#content');
    document.title = `${item.label} • GBHSS Mubarak Jarwar`;
    window.scrollTo(0, 0);
    if (item.id === 'dashboard') {
      content.innerHTML = renderDashboard(role);
      hydrateDashboard(content, { user, profile }).catch(() => {});
      return;
    }
    if (MODULES[item.id]) {
      content.innerHTML = '<p>Loading…</p>';
      try {
        const render = await MODULES[item.id]();
        if (location.hash !== `#/${item.id}`) return; // user already moved on
        await render(content, { user, profile });
      } catch (error) {
        content.innerHTML = `<div class="notice notice-warn">This page could not be loaded. Check your internet connection and refresh.</div>`;
      }
      return;
    }
    content.innerHTML = modulePlaceholder(item);
  }
}

/* ---------- Markup ---------- */

function initials(name) {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

function navItemHtml(item) {
  if (item.action === 'logout') {
    return `<button type="button" class="nav-item nav-logout" data-action="logout" title="Logout">${icon(item.icon)}<span class="nav-label">${escapeHtml(item.label)}</span></button>`;
  }
  return `<a class="nav-item" href="#/${item.id}" data-route="${item.id}" title="${escapeHtml(item.label)}">${icon(item.icon)}<span class="nav-label">${escapeHtml(item.label)}</span></a>`;
}

function avatarInner(name, photo) {
  return photo
    ? `<img src="${escapeHtml(photo)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block">`
    : escapeHtml(initials(name));
}

function shellHtml(role, name, email, photo) {
  const items = navForRole(role);
  return `
  <div class="app-shell" id="shell">
    <aside class="sidebar" id="sidebar" aria-label="Main navigation">
      <div class="sidebar-brand">
        <img class="brand-logo" src="assets/images/logo.jpg" alt="GBHSS Mubarak Jarwar emblem" width="40" height="40" style="background:#fff;border-radius:50%;padding:2px">
        <div class="brand-text"><strong>GBHSS Mubarak Jarwar</strong><span>Educate • Empower • Excel</span></div>
      </div>
      <nav class="sidebar-nav" id="nav">
        ${items.map(navItemHtml).join('')}
        <div class="nav-empty" id="navEmpty" hidden>No matching module</div>
      </nav>
      <div class="sidebar-credit" aria-label="Credits">
        <strong>Developed by Hidayatullah</strong>
        <span>Guidance: Sir Amjad Ali</span>
        <span>Motivation: Sir Asfand Ali</span>
        <span>With the support of the faculty</span>
      </div>
      <style>
        .sidebar-credit{padding:.75rem 1rem;border-top:1px solid rgba(255,255,255,.12);font-size:.7rem;line-height:1.5;opacity:.8;display:flex;flex-direction:column;color:inherit}
        .sidebar-credit strong{font-size:.74rem}
        .is-collapsed .sidebar-credit{display:none}
      </style>
    </aside>
    <div class="sidebar-overlay" id="overlay"></div>

    <div class="main">
      <header class="topbar">
        <button type="button" class="icon-btn" id="menuBtn" aria-label="Toggle navigation menu">${icon('menu')}</button>
        <div class="search">
          <span class="search-icon">${icon('search', 18)}</span>
          <input id="searchInput" type="search" placeholder="Search modules…" autocomplete="off" aria-label="Search modules">
        </div>
        <div class="topbar-spacer"></div>
        <span class="chip" title="Academic years are configured in Stage 4">Academic year: not set</span>
        <button type="button" class="icon-btn" id="themeBtn"></button>

        <div class="popover-wrap">
          <button type="button" class="icon-btn" id="notifBtn" aria-haspopup="true" aria-expanded="false" aria-controls="notifPanel" aria-label="Notifications">
            ${icon('notifications')}<span class="badge-dot" id="notifCount" hidden>0</span>
          </button>
          <div class="popover" id="notifPanel" hidden>
            <div class="popover-head">Notifications</div>
            <div class="popover-body">${emptyState('notifications', 'You\'re all caught up', 'New notifications will appear here.')}</div>
          </div>
        </div>

        <div class="popover-wrap">
          <button type="button" class="profile-btn" id="profileBtn" aria-haspopup="true" aria-expanded="false" aria-controls="profilePanel">
            <span class="avatar" id="avatarBtn" aria-hidden="true" style="overflow:hidden">${avatarInner(name, photo)}</span>
            <span class="profile-meta"><strong>${escapeHtml(name)}</strong><span>${escapeHtml(ROLES[role])}</span></span>
          </button>
          <div class="popover" id="profilePanel" hidden style="width:260px">
            <div class="popover-head">${escapeHtml(name)}<br><small style="font-weight:400;color:var(--text-muted)">${escapeHtml(email)}</small></div>
            <div class="popover-body">
              <button type="button" class="menu-item" id="photoChange">${icon('users', 18)}<span id="photoChangeLabel">${photo ? 'Change photo' : 'Add photo'}</span></button>
              <button type="button" class="menu-item" id="photoRemove"${photo ? '' : ' hidden'}>${icon('logout', 18)}Remove photo</button>
              <input type="file" id="photoFile" accept="image/*" hidden>
              <div id="photoMsg" role="status" style="font-size:.78rem;padding:0 .75rem;color:var(--text-muted)"></div>
              <button type="button" class="menu-item" data-action="theme"><span data-theme-icon></span><span data-theme-label></span></button>
              <button type="button" class="menu-item" data-action="logout">${icon('logout', 18)}Logout</button>
            </div>
          </div>
        </div>
      </header>
      <main id="content" class="content" tabindex="-1"></main>
    </div>
  </div>`;
}

function modulePlaceholder(item) {
  return `
    <div class="page-head">
      <div><h1>${escapeHtml(item.label)}</h1><p>${escapeHtml(item.description)}</p></div>
      <span class="badge">Built in Stage ${item.stage}</span>
    </div>
    <div class="card">
      ${emptyState(item.icon, 'No records yet', `This module is not built yet. It will be connected to the school database in Stage ${item.stage}. Nothing is shown because no real school data exists.`)}
    </div>`;
}

/* ---------- Current academic year (top bar) ---------- */

async function showCurrentYear() {
  try {
    const fb = await import('./firebase-config.js');
    const snap = await fb.getDocs(fb.query(fb.collection(fb.db, 'academicYears'), fb.where('current', '==', true), fb.limit(1)));
    const chip = document.querySelector('.topbar .chip');
    if (!snap.empty && chip) { chip.textContent = `Academic year: ${snap.docs[0].data().name}`; chip.removeAttribute('title'); }
  } catch (e) { /* the chip simply keeps its default text */ }
}

/* ---------- Profile photo ---------- */
// The photo is shrunk to a small square in the browser and saved on the person's own profile
// (no file storage service is needed). Security Rules let a person change ONLY their photo.

async function shrinkImage(file) {
  const bitmap = await createImageBitmap(file);
  const size = 128;
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
  return canvas.toDataURL('image/jpeg', 0.8);
}

function wirePhoto(user, profile) {
  const name = profile.displayName || user.email || 'User';
  const msg = (text) => { $('#photoMsg').textContent = text; };
  const show = (photo) => {
    $('#avatarBtn').innerHTML = avatarInner(name, photo);
    $('#photoChangeLabel').textContent = photo ? 'Change photo' : 'Add photo';
    $('#photoRemove').hidden = !photo;
  };
  const save = async (photo) => {
    const fb = await import('./firebase-config.js');
    await fb.updateDoc(fb.doc(fb.db, 'users', user.uid), { photo });
    profile.photo = photo;
    show(photo);
  };

  $('#photoChange').addEventListener('click', () => $('#photoFile').click());
  $('#photoFile').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { msg('Please choose an image file.'); return; }
    if (file.size > 10 * 1024 * 1024) { msg('That image is too large (maximum 10 MB).'); return; }
    msg('Saving…');
    try { await save(await shrinkImage(file)); msg('Photo saved.'); }
    catch (error) { msg('Could not save the photo. Try a different image.'); }
  });
  $('#photoRemove').addEventListener('click', async () => {
    msg('Removing…');
    try { await save(''); msg('Photo removed.'); } catch (error) { msg('Could not remove the photo.'); }
  });
}

/* ---------- Behaviour ---------- */

function isMobile() {
  return window.matchMedia('(max-width: 900px)').matches;
}

function setActive(id) {
  $$('.nav-item[data-route]').forEach((link) => {
    if (link.dataset.route === id) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  if (isMobile()) $('#shell').classList.remove('is-open');
}

function refreshThemeUi() {
  const dark = getTheme() === 'dark';
  $('#themeBtn').innerHTML = icon(dark ? 'sun' : 'moon');
  $('#themeBtn').setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
  $('[data-theme-icon]').innerHTML = icon(dark ? 'sun' : 'moon', 18);
  $('[data-theme-label]').textContent = dark ? 'Light mode' : 'Dark mode';
}

function wireShell() {
  const shell = $('#shell');

  $('#menuBtn').addEventListener('click', () => {
    if (isMobile()) {
      shell.classList.toggle('is-open');
    } else {
      shell.classList.toggle('is-collapsed');
      store.set('gbhss-sidebar', shell.classList.contains('is-collapsed') ? 'collapsed' : 'open');
    }
  });
  $('#overlay').addEventListener('click', () => shell.classList.remove('is-open'));

  shell.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    if (target.dataset.action === 'logout') logout(LOGIN_URL);
    if (target.dataset.action === 'theme') { toggleTheme(); refreshThemeUi(); }
  });
  $('#themeBtn').addEventListener('click', () => { toggleTheme(); refreshThemeUi(); });
  refreshThemeUi();

  const popovers = [['#notifBtn', '#notifPanel'], ['#profileBtn', '#profilePanel']];
  const closeAll = () => popovers.forEach(([b, p]) => { $(p).hidden = true; $(b).setAttribute('aria-expanded', 'false'); });
  popovers.forEach(([b, p]) => {
    $(b).addEventListener('click', (event) => {
      event.stopPropagation();
      const wasHidden = $(p).hidden;
      closeAll();
      $(p).hidden = !wasHidden;
      $(b).setAttribute('aria-expanded', String(wasHidden));
    });
    $(p).addEventListener('click', (event) => event.stopPropagation());
  });
  document.addEventListener('click', closeAll);
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeAll(); });

  const input = $('#searchInput');
  input.addEventListener('input', () => {
    const query = input.value.trim().toLowerCase();
    let visible = 0;
    $$('.nav-item[data-route]').forEach((link) => {
      const match = !query || link.textContent.toLowerCase().includes(query);
      link.hidden = !match;
      if (match) visible += 1;
    });
    $('#navEmpty').hidden = visible > 0;
  });
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    const first = $$('.nav-item[data-route]').find((link) => !link.hidden);
    if (first) { location.hash = `#/${first.dataset.route}`; input.value = ''; input.dispatchEvent(new Event('input')); input.blur(); }
  });
}
