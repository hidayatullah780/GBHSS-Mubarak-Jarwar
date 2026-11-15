// Step 3 settings. Change these ONLY if something below does not match your project.
export const SETTINGS = {
  SCHOOL_NAME: 'GBHSS Mubarak Jarwar',
  DASHBOARD_URL: 'dashboard.html',   // page name of your dashboard inside /pages
  LOGIN_URL: 'login.html',
  // Normally leave null: the config is read from js/firebase-config.js.
  // If the pages say "Firebase config not found", paste your firebaseConfig object here.
  MANUAL_FIREBASE_CONFIG: null,
  // Collections admin can export to CSV in Reports (add your own names if different)
  EXPORT_COLLECTIONS: ['students','teachers','users','classes','attendance','results','exams','homework','announcements'],
};
