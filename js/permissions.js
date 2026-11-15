// GBHSS Mubarak Jarwar — roles and navigation permissions.
//
// IMPORTANT: this file only decides what the INTERFACE shows.
// Real protection comes from Firestore/Storage Security Rules (Stage 2),
// because anyone can edit JavaScript in their own browser.

export const ROLES = {
  admin: 'Principal / Administrator',
  teacher: 'Teacher',
  student: 'Student',
  parent: 'Parent / Guardian',
};

const ALL = ['admin', 'teacher', 'student', 'parent'];

// stage = the roadmap stage in which the module becomes functional.
export const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', roles: ALL, stage: 1, description: 'Overview of school activity.' },
  { id: 'students', label: 'Students', icon: 'students', roles: ['admin', 'teacher'], stage: 5, description: 'Student profiles, admission, promotion and transfers.' },
  { id: 'teachers', label: 'Teachers', icon: 'teachers', roles: ['admin'], stage: 5, description: 'Teacher records, subject and class assignments, availability.' },
  { id: 'parents', label: 'Parents', icon: 'parents', roles: ['admin'], stage: 5, description: 'Parent and guardian accounts linked to students.' },
  { id: 'classes', label: 'Classes & Sections', icon: 'classes', roles: ['admin'], stage: 4, description: 'Classes, sections, class teachers and academic years.' },
  { id: 'subjects', label: 'Subjects', icon: 'subjects', roles: ['admin', 'teacher'], stage: 4, description: 'Subjects and their assignment to classes and teachers.' },
  { id: 'attendance', label: 'Attendance', icon: 'attendance', roles: ALL, stage: 6, description: 'Daily attendance marking, history and reports.' },
  { id: 'timetable', label: 'Timetable', icon: 'timetable', roles: ALL, stage: 7, description: 'Weekly timetable with conflict detection.' },
  { id: 'examinations', label: 'Examinations', icon: 'examinations', roles: ALL, stage: 6, description: 'Examination schedules, marks and grading set-up.' },
  { id: 'results', label: 'Results', icon: 'results', roles: ALL, stage: 6, description: 'Published results and report cards.' },
  { id: 'homework', label: 'Homework', icon: 'homework', roles: ALL, stage: 8, description: 'Homework assignments, deadlines and learning resources.' },
  { id: 'announcements', label: 'Announcements', icon: 'announcements', roles: ALL, stage: 8, description: 'School-wide and class announcements.' },
  { id: 'notifications', label: 'Notifications', icon: 'notifications', roles: ALL, stage: 8, description: 'Your notification history.' },
  { id: 'reports', label: 'Reports', icon: 'reports', roles: ['admin', 'teacher'], stage: 6, description: 'Printable and exportable reports and analytics.' },
  { id: 'settings', label: 'Settings', icon: 'settings', roles: ALL, stage: 4, description: 'Profile and school settings.' },
  { id: 'users', label: 'User Management', icon: 'users', roles: ['admin'], stage: 5, description: 'Create and manage authorised user accounts.' },
  { id: 'audit', label: 'Audit Logs', icon: 'audit', roles: ['admin'], stage: 5, description: 'Who changed what, and when.' },
  { id: 'logout', label: 'Logout', icon: 'logout', roles: ALL, action: 'logout' },
];

export function isValidRole(role) {
  return Object.prototype.hasOwnProperty.call(ROLES, role);
}

export function navForRole(role) {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}

export function canAccess(role, itemId) {
  return NAV_ITEMS.some((item) => item.id === itemId && item.roles.includes(role));
}
