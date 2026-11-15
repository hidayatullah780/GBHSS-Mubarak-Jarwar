# GBHSS Mubarak Jarwar — Firestore data model

This is the plan for how school records are stored. Each stage builds its collections and adds
the matching security rules. Stage 2 builds only `users`, `settings` and `auditLogs`.

## Conventions

- **Document IDs:** Firestore auto-IDs, except where a fixed ID prevents duplicates (noted below).
- **Timestamps:** every record has `createdAt`, `createdBy`, `updatedAt`, `updatedBy`.
  Times are written with `serverTimestamp()`, never the device clock. `createdBy` and `updatedBy` hold a user UID.
- **Never deleted:** people and academic records are deactivated (`active: false` or `status`), not deleted, so history and reports stay correct.
- **References** are stored as IDs (for example `classId`), plus a few copied display fields (for example `studentName`) where lists need to show names without extra reads.
- **Ownership:** the rules decide access from the signed-in user's `users/{uid}` profile, never from anything the browser sends.

## Collections

### users  (Stage 2)
Document ID = the Firebase Authentication UID.
`email`, `displayName`, `role` (`admin` | `teacher` | `student` | `parent`), `active` (true/false),
`linkedId` (the matching `teachers` / `students` / `parents` document, set in Stage 5), timestamps.
Only admins create or change these. The first admin is created in the Firebase Console.

### settings  (Stage 2)
Few documents. `settings/school`: `schoolName`, `schoolDays`, `periodsPerDay`, `periodTimes`, `breaks`, `gradingScale`, `currentAcademicYearId`.

### auditLogs  (Stage 2)
Append-only. `actorUid`, `actorRole`, `action` (for example `student.update`), `targetType`, `targetId`, `details` (small map), `createdAt`.

### academicYears  (Stage 4)
`name` (for example `2026-27`), `startDate`, `endDate`, `isCurrent`.

### classes, sections  (Stage 4)
`classes`: `name`, `level`, `order`, `academicYearId`.
`sections`: `classId`, `name`, `classTeacherId`, `classroomId`, `capacity`.

### subjects  (Stage 4)
`name`, `code`, `classIds` (classes it is taught in), `teacherAssignments` (map of sectionId to teacherId).

### classrooms  (Stage 7)
`name`, `capacity`, `active`.

### students  (Stage 5)
`admissionNo` (unique), `fullName`, `fatherName`, `dob`, `gender`, `classId`, `sectionId`, `rollNo`,
`admissionDate`, `contact`, `guardian` (map), `address`, `photoUrl`, `status` (`active` | `transferred` | `inactive`).
Duplicate `admissionNo` is prevented with a fixed lookup document `admissionNumbers/{admissionNo}`
written in the same transaction; roll numbers use `rollNumbers/{sectionId}_{rollNo}` the same way.

### teachers  (Stage 5)
`employeeId` (unique), `fullName`, `contact`, `photoUrl`, `subjectIds`, `sectionIds`, `maxPeriodsPerWeek`, `availability` (map by day), `active`.

### parents and parentStudentLinks  (Stage 5)
`parents`: `fullName`, `contact`, `userUid`.
`parentStudentLinks`: ID = `{parentId}_{studentId}`; `parentId`, `studentId`, `relation`. The rules read this to decide which children a parent may see.

### attendance  (Stage 6)
One document per student per session. ID = `{date}_{sectionId}_{session}_{studentId}` so a duplicate cannot exist.
`studentId`, `sectionId`, `date`, `session`, `status` (`present` | `absent` | `late` | `leave`), `markedBy`, timestamps. Corrections write an `auditLogs` entry.

### examinations, marks, results  (Stage 6)
`examinations`: `name`, `type`, `academicYearId`, `classIds`, `subjects` (with `totalMarks`, `passingMarks`, `date`), `status` (`draft` | `open` | `published`).
`marks`: ID = `{examId}_{studentId}_{subjectId}`; `obtained`, `enteredBy`. Locked once the exam is `published`.
`results`: ID = `{examId}_{studentId}`; `total`, `percentage`, `grade`, `position`, `published`. Written only by authorised staff at publication.

### timetableSets, timetableEntries  (Stage 7)
`timetableSets`: `academicYearId`, `version`, `status` (`draft` | `approved` | `published` | `archived`), `effectiveFrom`, `effectiveTo`.
`timetableEntries`: `setId`, `sectionId`, `subjectId`, `teacherId`, `classroomId`, `day`, `period`, `startTime`, `endTime`. Earlier published versions are kept.

### announcements, homework, notifications  (Stage 8)
`announcements`: `title`, `body`, `audience` (roles and/or `sectionIds`), `priority`, `expiresAt`.
`homework`: `sectionId`, `subjectId`, `teacherId`, `title`, `description`, `dueDate`, `attachments`.
`notifications`: `recipientUid`, `type`, `title`, `body`, `read`, `createdAt`. Created by trusted server code (Stage 8), read only by the recipient.

## Indexes

Simple queries need no setup. When a stage adds a query that filters on one field and sorts by another,
Firestore shows an error with a one-click link to create the index. Each stage's guide lists the indexes it needs.
