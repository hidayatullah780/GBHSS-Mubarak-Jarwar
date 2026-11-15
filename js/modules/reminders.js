// GBHSS Mubarak Jarwar — free in-app period reminders for teachers.
//
// HOW IT WORKS (and its honest limit): while the app is open and the teacher is signed in, this checks the
// clock every 15 seconds. A few minutes before a period, and again when it starts, it shows a pop-up with a
// sound and, if the teacher allowed it, a system notification. It CANNOT notify a closed app or a phone that
// has put the page to sleep: that needs a paid server, which this free version deliberately avoids.

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const LEAD_KEY = 'gbhss-remind-lead';   // 'off' or minutes before the period
const ON_KEY = 'gbhss-remind-on';       // '1' when reminders are switched on

export function readSetting(key, fallback) {
  try { const v = localStorage.getItem(key); return v === null ? fallback : v; } catch (e) { return fallback; }
}
export function writeSetting(key, value) { try { localStorage.setItem(key, value); } catch (e) { /* ignore */ } }
export const KEYS = { LEAD_KEY, ON_KEY };

/** "08:30" -> 510 (minutes after midnight). Returns NaN when the text is not a valid time. */
export function toMinutes(text) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(text || ''));
  if (!m) return NaN;
  const h = Number(m[1]); const min = Number(m[2]);
  return h > 23 || min > 59 ? NaN : h * 60 + min;
}

/**
 * Decides which reminders are due right now.
 * Each entry has its own start time ("08:30"), set by the teacher.
 * Returns [{ id, kind: 'soon' | 'now', entry, minutes }] and never repeats one that is in `fired`.
 */
export function dueReminders(now, entries, leadMinutes, fired) {
  const day = DAY_NAMES[now.getDay()];
  const nowMin = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  const date = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
  const due = [];
  entries.filter((e) => e.day === day).forEach((entry) => {
    const start = toMinutes(entry.start);
    if (Number.isNaN(start)) return;
    const points = [{ kind: 'now', at: start }];
    if (leadMinutes > 0) points.push({ kind: 'soon', at: start - leadMinutes });
    points.forEach(({ kind, at }) => {
      const id = `${date}|${entry.id}|${kind}`;
      if (fired.has(id)) return;
      if (nowMin >= at && nowMin < at + 2) due.push({ id, kind, entry, minutes: start - Math.floor(nowMin) });
    });
  });
  return due;
}

/**
 * Today's periods of one teacher, in time order, each marked 'done', 'now' or 'later'.
 * Also returns how many are finished, so the page can show progress ("3 of 6 done").
 */
export function todayStatus(now, entries) {
  const day = DAY_NAMES[now.getDay()];
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const list = entries.filter((e) => e.day === day && !Number.isNaN(toMinutes(e.start)) && !Number.isNaN(toMinutes(e.end)))
    .sort((a, b) => toMinutes(a.start) - toMinutes(b.start))
    .map((entry) => {
      const s = toMinutes(entry.start); const e = toMinutes(entry.end);
      return { entry, status: nowMin >= e ? 'done' : nowMin >= s ? 'now' : 'later' };
    });
  const next = list.find((x) => x.status === 'later') || null;
  return { list, done: list.filter((x) => x.status === 'done').length, next };
}

function describe(item) {
  const e = item.entry;
  const what = [e.subjectName, e.classLabel].filter(Boolean).join(' · ');
  const room = e.room ? ` (Room ${e.room})` : '';
  const head = item.kind === 'now' ? `Your ${e.start} period is starting now` : `Your ${e.start} period starts in ${item.minutes} minute${item.minutes === 1 ? '' : 's'}`;
  return `${head} — ${what}${room}`;
}

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator(); const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = 880; gain.gain.value = 0.15;
    osc.start(); osc.stop(ctx.currentTime + 0.35);
  } catch (e) { /* sound is optional */ }
}

export function showToast(text) {
  let box = document.getElementById('gbhss-toasts');
  if (!box) {
    box = document.createElement('div');
    box.id = 'gbhss-toasts';
    box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'assertive');
    box.style.cssText = 'position:fixed;top:1rem;right:1rem;z-index:9999;display:flex;flex-direction:column;gap:.5rem;max-width:min(360px,calc(100vw - 2rem))';
    document.body.append(box);
  }
  const toast = document.createElement('div');
  toast.style.cssText = 'background:#0b2545;color:#fff;padding:.8rem 1rem;border-radius:.6rem;box-shadow:0 8px 24px rgba(0,0,0,.25);font-size:.92rem;display:flex;gap:.75rem;align-items:flex-start';
  const span = document.createElement('span'); span.textContent = text; span.style.flex = '1';
  const close = document.createElement('button');
  close.type = 'button'; close.textContent = '×'; close.setAttribute('aria-label', 'Dismiss');
  close.style.cssText = 'background:transparent;border:0;color:#fff;font-size:1.2rem;cursor:pointer;line-height:1';
  close.addEventListener('click', () => toast.remove());
  toast.append(span, close); box.append(toast);
  setTimeout(() => toast.remove(), 30000);
}

export function notify(text) {
  showToast(text);
  beep();
  try {
    if ('Notification' in window && Notification.permission === 'granted') new Notification('GBHSS Mubarak Jarwar', { body: text });
  } catch (e) { /* ignore */ }
}

/** Starts watching the clock for a signed-in teacher. Safe to call once per page load. */
export async function startReminders({ user, profile }) {
  if (profile.role !== 'teacher') return;
  const fb = await import('../firebase-config.js');
  let entries = [];
  const fired = new Set();

  async function refresh() {
    try {
      const s = await fb.getDocs(fb.query(fb.collection(fb.db, 'timetable'), fb.where('teacherUid', '==', user.uid), fb.limit(200)));
      entries = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (e) { /* keep the last data */ }
  }

  function tick() {
    if (readSetting(ON_KEY, '0') !== '1') return;
    const lead = readSetting(LEAD_KEY, '5') === 'off' ? 0 : Number(readSetting(LEAD_KEY, '5')) || 0;
    dueReminders(new Date(), entries, lead, fired).forEach((item) => { fired.add(item.id); notify(describe(item)); });
  }

  await refresh();
  setInterval(refresh, 10 * 60 * 1000);
  setInterval(tick, 15 * 1000);
  tick();
}
