// GBHSS Mubarak Jarwar — login page logic (Firebase Authentication).
//
// Security notes:
//  * Wrong-email and wrong-password show the SAME message, so nobody can discover which
//    email addresses have accounts.
//  * The password-reset message is also the same whether or not the account exists.
//  * The role is never chosen on this page. It comes from the user's profile in Firestore.

import { $, icon, getTheme, toggleTheme } from './utils/helpers.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const HOME_URL = '../index.html#/dashboard';

/* ---------- small UI helpers ---------- */

function setError(inputEl, errorEl, message) {
  errorEl.textContent = message;
  if (message) inputEl.setAttribute('aria-invalid', 'true');
  else inputEl.removeAttribute('aria-invalid');
  return !message;
}

function showStatus(message, kind = 'info') {
  const box = $('#status');
  box.textContent = message;
  box.className = `notice notice-${kind}`;
  box.hidden = false;
}

function hideStatus() { $('#status').hidden = true; }

function setBusy(button, busy, idleText, busyText) {
  button.disabled = busy;
  button.textContent = busy ? busyText : idleText;
}

function validateEmail(inputEl, errorEl) {
  const value = inputEl.value.trim();
  if (!value) return setError(inputEl, errorEl, 'Enter your email address.');
  if (!EMAIL_PATTERN.test(value)) return setError(inputEl, errorEl, 'Enter a valid email address, e.g. name@example.com.');
  return setError(inputEl, errorEl, '');
}

function showView(view) {
  $('#loginView').hidden = view !== 'login';
  $('#resetView').hidden = view !== 'reset';
  $('#signupView').hidden = view !== 'signup';
  hideStatus();
}

/* ---------- theme, password toggle, view switching (work even without Firebase) ---------- */

function refreshThemeButton() {
  const dark = getTheme() === 'dark';
  $('#themeBtn').innerHTML = icon(dark ? 'sun' : 'moon');
  $('#themeBtn').setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
}
$('#themeBtn').addEventListener('click', () => { toggleTheme(); refreshThemeButton(); });
refreshThemeButton();

$('#togglePassword').addEventListener('click', () => {
  const input = $('#password');
  const showing = input.type === 'text';
  input.type = showing ? 'password' : 'text';
  $('#togglePassword').textContent = showing ? 'Show' : 'Hide';
  $('#togglePassword').setAttribute('aria-pressed', String(!showing));
});

$('#showReset').addEventListener('click', () => {
  $('#resetEmail').value = $('#email').value.trim();
  showView('reset');
});
$('#backToLogin').addEventListener('click', () => showView('login'));
$('#showSignup').addEventListener('click', () => showView('signup'));
$('#suBack').addEventListener('click', () => showView('login'));

/* ---------- Firebase ---------- */

function friendlyAuthError(error) {
  const code = error && error.code ? error.code : '';
  if (['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-login-credentials'].includes(code)) {
    return 'Incorrect email or password.';
  }
  const known = {
    'auth/email-already-in-use': 'An account with this email address already exists. Try signing in, or use "Forgot password?".',
    'auth/weak-password': 'Choose a stronger password of at least 8 characters.',
    'permission-denied': 'The request was refused. Please contact the school administration.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/user-disabled': 'This account has been disabled. Please contact the school administration.',
    'auth/too-many-requests': 'Too many attempts. Please wait a few minutes and try again.',
    'auth/network-request-failed': 'Cannot reach the server. Check your internet connection.',
    'auth/unauthorized-domain': 'This web address is not authorised in Firebase (Authentication > Settings > Authorized domains).',
    'auth/operation-not-allowed': 'Email/Password sign-in is not enabled in Firebase.',
  };
  return known[code] || 'Something went wrong. Please try again.';
}

async function main() {
  const reason = new URLSearchParams(location.search).get('reason');

  let fb; let session;
  try {
    fb = await import('./firebase-config.js');
    session = await import('./session.js');
  } catch (error) {
    showStatus('Could not load the sign-in service. Check your internet connection and refresh the page.', 'warn');
    return;
  }

  if (!fb.isFirebaseConfigured()) {
    showStatus('Firebase is not configured yet. Fill in js/firebase-config.js first.', 'warn');
    return;
  }

  if (reason && session.REASON_MESSAGES[reason]) showStatus(session.REASON_MESSAGES[reason], 'warn');

  // Already signed in with a valid profile? Go straight to the dashboard.
  const existing = await session.waitForUser();
  if (existing && !reason) {
    const result = await session.loadProfile(existing);
    if (result.ok) { location.replace(HOME_URL); return; }
  }

  /* Sign in */
  $('#loginForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    hideStatus();
    const emailOk = validateEmail($('#email'), $('#emailError'));
    const pw = $('#password');
    const pwOk = pw.value ? setError(pw, $('#passwordError'), '') : setError(pw, $('#passwordError'), 'Enter your password.');
    if (!emailOk || !pwOk) return;

    const button = $('#signInBtn');
    setBusy(button, true, 'Sign in', 'Signing in…');
    try {
      const cred = await fb.signInWithEmailAndPassword(fb.auth, $('#email').value.trim(), pw.value);
      const result = await session.loadProfile(cred.user);
      if (!result.ok) {
        await fb.signOut(fb.auth);
        showStatus(session.REASON_MESSAGES[result.reason], 'warn');
        setBusy(button, false, 'Sign in', 'Signing in…');
        return;
      }
      pw.value = '';
      // Best-effort audit entry. A failure here must never block sign-in.
      try {
        await fb.addDoc(fb.collection(fb.db, 'auditLogs'), {
          actorUid: cred.user.uid,
          actorRole: result.profile.role,
          action: 'auth.login',
          createdAt: fb.serverTimestamp(),
        });
      } catch (e) { /* ignore */ }
      location.replace(HOME_URL);
    } catch (error) {
      showStatus(friendlyAuthError(error), 'warn');
      setBusy(button, false, 'Sign in', 'Signing in…');
    }
  });

  /* Create account: becomes a PENDING request; an administrator must approve it */
  $('#signupForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    hideStatus();
    const name = $('#suName').value.trim().replace(/\s+/g, ' ');
    const email = $('#suEmail').value.trim().toLowerCase();
    const role = $('#suRole').value;
    const pass = $('#suPassword').value;
    let ok = true;
    ok = setError($('#suName'), $('#suNameError'), name.length >= 2 && name.length <= 80 ? '' : 'Enter your name (2 to 80 characters).') && ok;
    ok = validateEmail($('#suEmail'), $('#suEmailError')) && ok;
    ok = setError($('#suPassword'), $('#suPasswordError'), pass.length >= 8 ? '' : 'Use at least 8 characters.') && ok;
    ok = setError($('#suConfirm'), $('#suConfirmError'), $('#suConfirm').value === pass ? '' : 'The passwords do not match.') && ok;
    if (!['teacher', 'student', 'parent'].includes(role)) ok = false;
    if (!ok) return;

    const button = $('#suBtn');
    setBusy(button, true, 'Send request', 'Sending…');
    let created = null;
    try {
      const authLib = await import('https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js');
      created = await authLib.createUserWithEmailAndPassword(fb.auth, email, pass);
      try {
        await fb.setDoc(fb.doc(fb.db, 'users', created.user.uid), {
          email, displayName: name, role, active: false, status: 'pending', createdAt: fb.serverTimestamp(),
        });
      } catch (profileError) {
        try { await created.user.delete(); } catch (e) { /* ignore */ }
        throw profileError;
      }
      await fb.signOut(fb.auth);
      $('#signupForm').reset();
      showView('login');
      showStatus('Request sent. You can sign in after the school administration approves your account.', 'info');
    } catch (error) {
      showStatus(friendlyAuthError(error), 'warn');
    }
    setBusy(button, false, 'Send request', 'Sending…');
  });

  /* Password reset */
  $('#resetForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    hideStatus();
    if (!validateEmail($('#resetEmail'), $('#resetEmailError'))) return;

    const button = $('#resetBtn');
    setBusy(button, true, 'Send reset link', 'Sending…');
    try {
      await fb.sendPasswordResetEmail(fb.auth, $('#resetEmail').value.trim());
      showStatus('If an account exists for that email address, a password reset link has been sent. Check your Inbox and Spam folder.', 'info');
    } catch (error) {
      const code = error && error.code;
      if (code === 'auth/user-not-found') {
        showStatus('If an account exists for that email address, a password reset link has been sent. Check your Inbox and Spam folder.', 'info');
      } else {
        showStatus(friendlyAuthError(error), 'warn');
      }
    }
    setBusy(button, false, 'Send reset link', 'Sending…');
  });
}

main();
