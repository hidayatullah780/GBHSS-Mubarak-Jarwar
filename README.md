# GBHSS Mubarak Jarwar

Government Boys Higher Secondary School Mubarak Jarwar — Tando Allahyar, Sindh, Pakistan
**Educate • Empower • Excel**

A school management system built with plain HTML, CSS and JavaScript plus Firebase.
**No Node.js, npm or build tools are needed.**

## Current status: Stage 1 (Foundation)

Done: folder structure, branding, login page, responsive dashboard shell, role-based navigation,
light/dark mode, empty states.

Not done yet (by design): Firebase connection, real sign-in, real data, security rules.
Everything on screen is an empty state — there are no fake records.

## How to run (VS Code)

1. Install the **Live Server** extension in VS Code (publisher: Ritwick Dey).
2. Open this folder: **File → Open Folder → GBHSS-Mubarak-Jarwar**.
3. Right-click `index.html` → **Open with Live Server**.
4. The login page opens. Use the "Layout preview" links to open the dashboard as each role.

Why not just double-click `index.html`? The app uses JavaScript modules, and browsers block
modules on `file://` addresses. Service workers, push notifications and Firebase also need
`http://localhost` or HTTPS. Live Server provides `localhost`.

## Folder structure

```
GBHSS-Mubarak-Jarwar/
├── index.html                 App shell (dashboard); redirects to login if no role
├── manifest.webmanifest       PWA identity
├── README.md
├── assets/images/logo.jpg     Logo placeholder — replace with the official logo
├── css/                       main, components, dashboard, responsive
├── js/
│   ├── app.js                 Shell: sidebar, top bar, popovers, search, theme
│   ├── router.js              Hash router
│   ├── permissions.js         Roles and navigation per role (UI only)
│   ├── dashboard.js           Dashboard content (empty states for now)
│   ├── auth.js                Login page logic (Firebase added in Stage 3)
│   └── utils/helpers.js       Icons, theme, escaping, empty states
└── pages/login.html
```

Files such as `sw.js`, `firebase-config.js`, `firestore.rules` and `js/modules/*` are added in the
stage that needs them.

## Replace the logo

Replace `assets/images/logo.jpg` with the official logo (keep the file name, or update the
references in `index.html`, `pages/login.html`, `manifest.webmanifest` and `js/app.js`).
