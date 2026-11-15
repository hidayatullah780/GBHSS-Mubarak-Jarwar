// GBHSS Mubarak Jarwar — session handling (who is signed in, and what are they allowed to be).
//
// The role is read from Firestore (users/{uid}), never from the URL or from anything the
// browser can change. The Security Rules still enforce access on the server; this file only
// decides which screen to show.

import {
  auth, isFirebaseConfigured, onAuthStateChanged, signOut, db, doc, getDoc,
} from './firebase-config.js';
import { isValidRole } from './permissions.js';

/** Plain-language messages for each reason a sign-in can be refused. */
export const REASON_MESSAGES = {
  idle: 'You were signed out because of 30 minutes of inactivity. Please sign in again.',
  pending: 'Your account request has been received and is waiting for approval by the school administration. You will be able to sign in once it is approved.',
  rejected: 'Your account request was not approved. Please contact the school administration.',
  inactive: 'This account has been deactivated. Please contact the school administration.',
  'no-profile': 'Your account has no school profile yet. Please contact the school administration.',
  'bad-role': 'Your account has no valid role. Please contact the school administration.',
  error: 'Could not load your profile. Check your internet connection and try again.',
};

/** Resolves with the signed-in user, or null, once Firebase has finished checking. */
export function waitForUser() {
  return new Promise((resolve) => {
    if (!auth) { resolve(null); return; }
    const stop = onAuthStateChanged(auth, (user) => { stop(); resolve(user); });
  });
}

/** Reads users/{uid} and checks the account is active and has a valid role. */
export async function loadProfile(user) {
  try {
    const snap = await getDoc(doc(db, 'users', user.uid));
    if (!snap.exists()) return { ok: false, reason: 'no-profile' };
    const profile = snap.data();
    if (profile.active !== true) {
      const reason = profile.status === 'pending' ? 'pending' : profile.status === 'rejected' ? 'rejected' : 'inactive';
      return { ok: false, reason };
    }
    if (!isValidRole(profile.role)) return { ok: false, reason: 'bad-role' };
    return { ok: true, profile };
  } catch (error) {
    return { ok: false, reason: 'error' };
  }
}

/**
 * Page guard: returns { user, profile } for a valid signed-in user,
 * otherwise sends the browser to the login page and returns null.
 */
export async function requireSession(loginUrl) {
  if (!isFirebaseConfigured()) { location.replace(loginUrl); return null; }

  const user = await waitForUser();
  if (!user) { location.replace(loginUrl); return null; }

  const result = await loadProfile(user);
  if (!result.ok) {
    try { await signOut(auth); } catch (e) { /* ignore */ }
    location.replace(`${loginUrl}?reason=${result.reason}`);
    return null;
  }

  // If the user signs out in another tab, leave this page too.
  onAuthStateChanged(auth, (current) => { if (!current) location.replace(loginUrl); });
  return { user, profile: result.profile };
}

/** Signs out and returns to the login page. */
export async function logout(loginUrl, reason) {
  try { await signOut(auth); } catch (e) { /* ignore */ }
  location.replace(reason ? `${loginUrl}?reason=${reason}` : loginUrl);
}

/** Calls onTimeout after `minutes` without mouse, keyboard, touch or scroll activity. */
export function startIdleTimer(minutes, onTimeout) {
  let timer;
  let last = 0;
  const reset = () => {
    const now = Date.now();
    if (now - last < 5000) return; // cheap: re-arm at most every 5 seconds
    last = now;
    clearTimeout(timer);
    timer = setTimeout(onTimeout, minutes * 60 * 1000);
  };
  ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'].forEach((name) =>
    window.addEventListener(name, reset, { passive: true }));
  last = 0;
  reset();
}
