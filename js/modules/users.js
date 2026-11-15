// GBHSS Mubarak Jarwar — User Management (administrator only).
//
// What this page does:
//   * lists every account in users/{uid}
//   * creates a new account: Firebase sign-in account + school profile, together
//   * deactivates / reactivates an account (accounts are never deleted, so history stays intact)
//
// How creation works without a server:
//   Creating a sign-in account with the normal connection would sign the administrator OUT and
//   sign the new person IN. So a second, temporary Firebase connection is used only for creating
//   the account, then it is closed. The administrator's own session is never touched.
//
// Security: the Firestore Security Rules decide who may write users/{uid}. Only an administrator
// passes them, so this page cannot be used by anyone else even if its code is edited.
//
// NOTE: the version number in the two URLs below must match js/firebase-config.js.

import {
  firebaseConfig, db, collection, getDocs, doc, setDoc, updateDoc, deleteDoc, addDoc, query, limit, serverTimestamp,
} from '../firebase-config.js';
import { ROLES } from '../permissions.js';
import { escapeHtml, emptyState, icon } from '../utils/helpers.js';
import { initializeApp, deleteApp } from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-app.js';
import {
  getAuth, createUserWithEmailAndPassword, sendPasswordResetEmail, signOut as authSignOut,
} from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const STYLE_ID = 'users-module-style';

/* ---------- helpers ---------- */

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .um-form { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:0 1rem; }
    .um-table-wrap { overflow-x:auto; }
    .um-table { width:100%; border-collapse:collapse; font-size:.9rem; }
    .um-table th, .um-table td { text-align:left; padding:.6rem .7rem; border-bottom:1px solid var(--border); white-space:nowrap; }
    .um-table th { font-size:.75rem; text-transform:uppercase; letter-spacing:.05em; color:var(--text-muted); }
    .um-pass { font-family:ui-monospace,Consolas,monospace; font-size:1.05rem; font-weight:700; letter-spacing:.05em; user-select:all; }
    .um-off { color:var(--text-muted); }
    .um-toolbar { display:flex; gap:.75rem; flex-wrap:wrap; align-items:center; margin-bottom:.75rem; }
    .um-toolbar .input { max-width:280px; }
  `;
  document.head.append(style);
}

/** 12-character password from an unambiguous alphabet (no 0/O, 1/l/I). */
function makeTempPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = new Uint32Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

function friendlyError(error) {
  const code = error && error.code ? error.code : '';
  const known = {
    'auth/email-already-in-use': 'An account with this email address already exists.',
    'auth/invalid-email': 'That email address is not valid.',
    'auth/weak-password': 'The generated password was rejected. Please try again.',
    'auth/network-request-failed': 'Cannot reach Firebase. Check your internet connection.',
    'auth/operation-not-allowed': 'Email/Password sign-in is not enabled in Firebase.',
    'permission-denied': 'Permission denied. Only an active administrator can do this.',
  };
  return known[code] || 'Something went wrong. Please try again.';
}

async function writeAudit(actor, action, targetId, details) {
  try {
    await addDoc(collection(db, 'auditLogs'), {
      actorUid: actor.user.uid,
      actorRole: actor.profile.role,
      action,
      targetType: 'user',
      targetId,
      details,
      createdAt: serverTimestamp(),
    });
  } catch (e) { /* an audit failure must not undo a completed action */ }
}

/* ---------- account creation ---------- */

async function createAccount({ email, displayName, role, sendReset }, actor) {
  const password = makeTempPassword();
  const app = initializeApp(firebaseConfig, `gbhss-create-${Date.now()}`);
  const secondaryAuth = getAuth(app);
  let created = null;
  try {
    created = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    const uid = created.user.uid;

    try {
      await setDoc(doc(db, 'users', uid), {
        email,
        displayName,
        role,
        active: true,
        status: 'approved',
        createdAt: serverTimestamp(),
        createdBy: actor.user.uid,
      });
    } catch (profileError) {
      // Roll back so no half-made account (sign-in without a profile) is left behind.
      try { await created.user.delete(); } catch (e) { /* ignore */ }
      throw profileError;
    }

    let resetSent = false;
    if (sendReset) {
      try { await sendPasswordResetEmail(secondaryAuth, email); resetSent = true; } catch (e) { /* reported below */ }
    }
    await writeAudit(actor, 'user.create', uid, { role, email });
    return { uid, password, resetSent };
  } finally {
    try { await authSignOut(secondaryAuth); } catch (e) { /* ignore */ }
    try { await deleteApp(app); } catch (e) { /* ignore */ }
  }
}

/* ---------- page ---------- */

export async function renderUsers(container, actor) {
  injectStyle();
  const roleOptions = Object.entries(ROLES)
    .map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`).join('');

  container.innerHTML = `
    <div class="page-head">
      <div><h1>User Management</h1><p>Create and manage the accounts that can sign in to GBHSS Mubarak Jarwar.</p></div>
    </div>

    <section class="card" style="margin-bottom:1rem">
      <div class="card-head">${icon('plus', 20)}<h2>Create account</h2></div>
      <div id="umNotice" role="status" aria-live="polite" hidden></div>
      <form id="umForm" class="um-form" novalidate>
        <div class="field"><label for="umName">Full name</label>
          <input class="input" id="umName" maxlength="80" autocomplete="off" required>
          <div class="field-error" id="umNameErr" role="alert"></div></div>
        <div class="field"><label for="umEmail">Email address</label>
          <input class="input" id="umEmail" type="email" inputmode="email" autocomplete="off" required>
          <div class="field-error" id="umEmailErr" role="alert"></div></div>
        <div class="field"><label for="umRole">Role</label>
          <select class="input" id="umRole">${roleOptions}</select></div>
      </form>
      <label style="display:flex;gap:.5rem;align-items:center;margin:.25rem 0 1rem">
        <input type="checkbox" id="umReset" checked form="umForm"> Also email a password-setup link to this address
      </label>
      <button type="submit" form="umForm" class="btn btn-primary" id="umSubmit">Create account</button>
      <p class="sub" style="color:var(--text-muted);font-size:.82rem;margin:.75rem 0 0">A temporary password is generated and shown once. Give it to the person privately; they can change it any time with "Forgot password?" on the sign-in page.</p>
    </section>

    <section class="card">
      <div class="card-head">${icon('users', 20)}<h2>All accounts</h2></div>
      <div id="umWaiting" class="notice notice-warn" role="status" hidden></div>
      <div class="um-toolbar"><input class="input" id="umFilter" type="search" placeholder="Filter by name, email or role…" aria-label="Filter accounts"></div>
      <div id="umList" aria-live="polite">Loading…</div>
    </section>`;

  const $q = (selector) => container.querySelector(selector);
  let rows = [];

  function showNotice(kind, build) {
    const box = $q('#umNotice');
    box.className = `notice notice-${kind}`;
    box.replaceChildren();
    build(box);
    box.hidden = false;
  }

  function renderList() {
    const filter = $q('#umFilter').value.trim().toLowerCase();
    const shown = rows.filter((r) =>
      !filter || `${r.displayName || ''} ${r.email || ''} ${r.role || ''}`.toLowerCase().includes(filter));
    const waiting = rows.filter((r) => r.active !== true && r.status === 'pending').length;
    $q('#umWaiting').textContent = waiting ? `${waiting} account request${waiting > 1 ? 's' : ''} waiting for your approval.` : '';
    $q('#umWaiting').hidden = !waiting;
    if (!rows.length) { $q('#umList').innerHTML = emptyState('users', 'No accounts yet', 'Accounts you create will appear here.'); return; }
    if (!shown.length) { $q('#umList').innerHTML = emptyState('search', 'No match', 'No account matches that filter.'); return; }

    const body = shown.map((r) => {
      const self = r.uid === actor.user.uid;
      const active = r.active === true;
      const pending = !active && r.status === 'pending';
      const label = active ? 'Active' : pending ? 'Pending approval' : r.status === 'rejected' ? 'Rejected' : 'Deactivated';
      const uidAttr = escapeHtml(r.uid);
      const action = self
        ? '<span class="um-off">You</span>'
        : pending
          ? `<button type="button" class="btn btn-primary btn-sm" data-approve="${uidAttr}">Approve</button> <button type="button" class="btn btn-ghost btn-sm" data-reject="${uidAttr}">Reject</button>`
          : `${active ? '' : `<button type="button" class="btn btn-ghost btn-sm" data-remove="${uidAttr}">Remove</button> `}<button type="button" class="btn btn-ghost btn-sm" data-toggle="${uidAttr}" data-next="${active ? 'off' : 'on'}">${active ? 'Deactivate' : 'Reactivate'}</button>`;
      return `<tr class="${active || pending ? '' : 'um-off'}">
        <td>${escapeHtml(r.displayName || '—')}</td>
        <td>${escapeHtml(r.email || '—')}</td>
        <td>${escapeHtml(ROLES[r.role] || r.role || '—')}</td>
        <td><span class="badge">${label}</span></td>
        <td>${action}</td></tr>`;
    }).join('');

    $q('#umList').innerHTML = `<div class="um-table-wrap"><table class="um-table">
      <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th></th></tr></thead>
      <tbody>${body}</tbody></table></div>`;
  }

  async function loadList() {
    try {
      const snap = await getDocs(query(collection(db, 'users'), limit(200)));
      rows = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
      rows.sort((a, b) => (b.status === 'pending' && !b.active) - (a.status === 'pending' && !a.active) || String(a.displayName || a.email || '').localeCompare(String(b.displayName || b.email || '')));
      renderList();
    } catch (error) {
      $q('#umList').textContent = friendlyError(error);
    }
  }

  $q('#umFilter').addEventListener('input', renderList);

  $q('#umList').addEventListener('click', async (event) => {
    const removeBtn = event.target.closest('[data-remove]');
    if (removeBtn) {
      const uid = removeBtn.dataset.remove;
      const target = rows.find((r) => r.uid === uid);
      if (!target || uid === actor.user.uid || target.active === true) return;
      const who = target.displayName || target.email;
      if (!window.confirm(`Remove ${who} permanently from the school system?\n\nTheir school profile will be deleted and cannot be restored. (Their sign-in email stays registered in Firebase until it is deleted in the Firebase Console.)`)) return;
      removeBtn.disabled = true;
      try {
        await deleteDoc(doc(db, 'users', uid));
        await writeAudit(actor, 'user.remove', uid, { email: target.email || '', role: target.role || '' });
        await loadList();
      } catch (error) {
        removeBtn.disabled = false;
        showNotice('warn', (box) => { box.textContent = friendlyError(error); });
      }
      return;
    }
    const decide = event.target.closest('[data-approve],[data-reject]');
    if (decide) {
      const approve = decide.hasAttribute('data-approve');
      const uid = decide.dataset.approve || decide.dataset.reject;
      const target = rows.find((r) => r.uid === uid);
      if (!target || uid === actor.user.uid) return;
      const who = target.displayName || target.email;
      const text = approve
        ? `Approve ${who} as ${ROLES[target.role] || target.role}? They will be able to sign in.`
        : `Reject the request from ${who}?`;
      if (!window.confirm(text)) return;
      decide.disabled = true;
      try {
        await updateDoc(doc(db, 'users', uid), {
          active: approve, status: approve ? 'approved' : 'rejected', updatedAt: serverTimestamp(), updatedBy: actor.user.uid,
        });
        await writeAudit(actor, approve ? 'user.approve' : 'user.reject', uid, { email: target.email || '', role: target.role || '' });
        await loadList();
      } catch (error) {
        decide.disabled = false;
        showNotice('warn', (box) => { box.textContent = friendlyError(error); });
      }
      return;
    }
    const button = event.target.closest('[data-toggle]');
    if (!button) return;
    const uid = button.dataset.toggle;
    const turnOn = button.dataset.next === 'on';
    const target = rows.find((r) => r.uid === uid);
    if (!target || uid === actor.user.uid) return;
    if (!turnOn && !window.confirm(`Deactivate ${target.displayName || target.email}? They will not be able to sign in.`)) return;
    button.disabled = true;
    try {
      await updateDoc(doc(db, 'users', uid), { active: turnOn, status: turnOn ? 'approved' : 'deactivated', updatedAt: serverTimestamp(), updatedBy: actor.user.uid });
      await writeAudit(actor, turnOn ? 'user.reactivate' : 'user.deactivate', uid, { email: target.email || '' });
      await loadList();
    } catch (error) {
      button.disabled = false;
      showNotice('warn', (box) => { box.textContent = friendlyError(error); });
    }
  });

  $q('#umForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = $q('#umName').value.trim().replace(/\s+/g, ' ');
    const email = $q('#umEmail').value.trim().toLowerCase();
    const role = $q('#umRole').value;
    let ok = true;
    $q('#umNameErr').textContent = ''; $q('#umEmailErr').textContent = '';
    if (name.length < 2 || name.length > 80) { $q('#umNameErr').textContent = 'Enter a name of 2 to 80 characters.'; ok = false; }
    if (!EMAIL_PATTERN.test(email)) { $q('#umEmailErr').textContent = 'Enter a valid email address.'; ok = false; }
    if (!Object.prototype.hasOwnProperty.call(ROLES, role)) ok = false;
    if (!ok) return;

    const submit = $q('#umSubmit');
    submit.disabled = true; submit.textContent = 'Creating…';
    $q('#umNotice').hidden = true;
    try {
      const result = await createAccount({ email, displayName: name, role, sendReset: $q('#umReset').checked }, actor);
      showNotice('info', (box) => {
        const line = document.createElement('p');
        line.textContent = `Account created for ${name} (${ROLES[role]}). Temporary password — shown only once:`;
        const pass = document.createElement('p');
        pass.className = 'um-pass';
        pass.textContent = result.password;
        const extra = document.createElement('p');
        extra.textContent = $q('#umReset').checked
          ? (result.resetSent ? 'A password-setup link was emailed to them.' : 'The password-setup email could not be sent; give them the temporary password instead.')
          : 'No email was sent.';
        box.append(line, pass, extra);
      });
      $q('#umForm').reset();
      await loadList();
    } catch (error) {
      showNotice('warn', (box) => { box.textContent = friendlyError(error); });
    }
    submit.disabled = false; submit.textContent = 'Create account';
  });

  await loadList();
}
