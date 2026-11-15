// GBHSS Mubarak Jarwar — Stage 2 connection and security check.
// Temporary developer tool: delete this file and pages/firebase-check.html in Stage 3.
// All text from Firebase is written with textContent, never innerHTML.

const $ = (id) => document.getElementById(id);

function setText(id, text) { $(id).textContent = text; }

function friendlyError(error) {
  const code = error && error.code ? error.code : '';
  const known = {
    'auth/invalid-credential': 'Wrong email or password.',
    'auth/invalid-email': 'That email address is not valid.',
    'auth/user-disabled': 'This account has been disabled in Firebase.',
    'auth/operation-not-allowed': 'Email/Password sign-in is not enabled. Enable it in Firebase Console > Authentication > Sign-in method.',
    'auth/network-request-failed': 'Cannot reach Firebase. Check your internet connection.',
    'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
    'unavailable': 'Cannot reach Firestore. Check your internet connection.',
    'failed-precondition': 'Firestore is not created yet. Create the database in the Firebase Console first.',
  };
  return known[code] || (code ? `Error: ${code}` : String(error && error.message ? error.message : error));
}

function addResult(label, status, detail) {
  const row = document.createElement('div');
  row.className = 'result';
  const tag = document.createElement('span');
  tag.className = `tag ${status}`;
  tag.textContent = status.toUpperCase();
  const body = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = label;
  const small = document.createElement('small');
  small.textContent = detail;
  body.append(title, small);
  row.append(tag, body);
  $('results').append(row);
}

async function main() {
  let fb;
  try {
    fb = await import('./firebase-config.js');
  } catch (error) {
    setText('connection', 'FAILED to load the Firebase library. Check your internet connection. If you are online, the Firebase version number in js/firebase-config.js may need updating. Technical detail: ' + friendlyError(error));
    return;
  }

  if (!fb.isFirebaseConfigured()) {
    setText('connection', 'Firebase is not configured yet. Open js/firebase-config.js and replace every PASTE_... value with your own values from the Firebase Console.');
    return;
  }

  setText('connection', `Connected to Firebase project: ${fb.firebaseConfig.projectId}`);

  fb.onAuthStateChanged(fb.auth, (user) => {
    $('signInCard').hidden = !!user;
    $('signedInCard').hidden = !user;
    $('resultsCard').hidden = true;
    $('results').replaceChildren();
    if (user) {
      setText('who', user.email || '(no email)');
      setText('uid', user.uid);
    }
  });

  $('signInForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    setText('signInError', '');
    const email = $('email').value.trim();
    const password = $('password').value;
    if (!email || !password) { setText('signInError', 'Enter your email and password.'); return; }
    try {
      await fb.signInWithEmailAndPassword(fb.auth, email, password);
      $('password').value = '';
    } catch (error) {
      setText('signInError', friendlyError(error));
    }
  });

  $('signOutBtn').addEventListener('click', () => fb.signOut(fb.auth));

  $('runChecks').addEventListener('click', async () => {
    const user = fb.auth.currentUser;
    if (!user) return;
    $('resultsCard').hidden = false;
    $('results').replaceChildren();
    let role = null;

    // Check A: you must be able to read your OWN profile.
    try {
      const snap = await fb.getDoc(fb.doc(fb.db, 'users', user.uid));
      if (!snap.exists()) {
        addResult('A. Read my own profile', 'fail', `No document found at users/${user.uid}. Create it in the Firebase Console (guide, step 7).`);
      } else {
        const data = snap.data();
        role = data.role;
        addResult('A. Read my own profile', 'pass', `role = ${data.role}, active = ${data.active}`);
      }
    } catch (error) {
      addResult('A. Read my own profile', 'fail', friendlyError(error));
    }

    // Check B: a collection with no rule yet must be DENIED.
    try {
      await fb.getDocs(fb.collection(fb.db, 'students'));
      addResult('B. Read the students collection (no rules yet)', 'fail', 'Access was ALLOWED. It must be denied. Re-publish firestore.rules in the Firebase Console.');
    } catch (error) {
      if (error && error.code === 'permission-denied') {
        addResult('B. Read the students collection (no rules yet)', 'pass', 'Denied, as it should be.');
      } else {
        addResult('B. Read the students collection (no rules yet)', 'fail', friendlyError(error));
      }
    }

    // Check C: a non-admin must NOT be able to make themselves an admin.
    if (role === 'admin') {
      addResult('C. Try to make myself admin', 'skip', 'Skipped: you are an admin. Run this check later when signed in as a teacher, student or parent test account.');
    } else if (role) {
      try {
        await fb.updateDoc(fb.doc(fb.db, 'users', user.uid), { role: 'admin' });
        addResult('C. Try to make myself admin', 'fail', 'The change was ALLOWED. This is a serious rules problem. Do not continue until it is fixed.');
      } catch (error) {
        if (error && error.code === 'permission-denied') {
          addResult('C. Try to make myself admin', 'pass', 'Denied, as it should be.');
        } else {
          addResult('C. Try to make myself admin', 'fail', friendlyError(error));
        }
      }
    }
  });
}

main();
