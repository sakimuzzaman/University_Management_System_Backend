import { Router } from "express";
import { authenticate, authorize } from "../../middlewares/auth";
import { validate } from "../../middlewares/validate";
import * as controller from "./academic.controller";
import {
  assignInstructorSchema,
  createExamSchema,
  createSectionSchema,
  createSemesterSchema,
  enrollmentIdSchema,
  enrollSchema,
  examIdSchema,
  listExamResultsSchema,
  listMyAttendanceSchema,
  listMyResultsSchema,
  listSectionAttendanceSchema,
  listSectionExamsSchema,
  listSectionsSchema,
  listSemestersSchema,
  markAttendanceSchema,
  myEnrollmentsSchema,
  saveResultsSchema,
  sectionIdSchema,
  semesterIdSchema,
  updateSectionSchema,
  updateSemesterSchema,
  updateSemesterStatusSchema,
} from "./academic.validation";
import { Role } from "../../generated/prisma/enums";

const router = Router();

/* Semesters: reads are public; all writes are admin-only. */
router.get("/semesters", validate(listSemestersSchema), controller.listSemesters);
router.get("/semesters/:id", validate(semesterIdSchema), controller.getSemester);
router.post(
  "/semesters",
  authenticate,
  authorize(Role.ADMIN),
  validate(createSemesterSchema),
  controller.createSemester,
);
router.patch(
  "/semesters/:id",
  authenticate,
  authorize(Role.ADMIN),
  validate(updateSemesterSchema),
  controller.updateSemester,
);
router.patch(
  "/semesters/:id/status",
  authenticate,
  authorize(Role.ADMIN),
  validate(updateSemesterStatusSchema),
  controller.updateSemesterStatus,
);
router.delete(
  "/semesters/:id",
  authenticate,
  authorize(Role.ADMIN),
  validate(semesterIdSchema),
  controller.deleteSemester,
);

/* Sections */
router.get(
  "/sections",
  authenticate,
  validate(listSectionsSchema),
  controller.listSections,
);
router.get(
  "/sections/:id",
  authenticate,
  validate(sectionIdSchema),
  controller.getSection,
);
router.post(
  "/sections",
  authenticate,
  authorize(Role.ADMIN),
  validate(createSectionSchema),
  controller.createSection,
);
router.patch(
  "/sections/:id",
  authenticate,
  authorize(Role.ADMIN),
  validate(updateSectionSchema),
  controller.updateSection,
);
router.patch(
  "/sections/:id/assign-instructor",
  authenticate,
  authorize(Role.ADMIN),
  validate(assignInstructorSchema),
  controller.assignInstructor,
);
router.delete(
  "/sections/:id",
  authenticate,
  authorize(Role.ADMIN),
  validate(sectionIdSchema),
  controller.deleteSection,
);

/* Enrollments */
router.post(
  "/enrollments",
  authenticate,
  authorize(Role.STUDENT),
  validate(enrollSchema),
  controller.enroll,
);
router.get(
  "/enrollments/my",
  authenticate,
  authorize(Role.STUDENT),
  validate(myEnrollmentsSchema),
  controller.myEnrollments,
);
router.post(
  "/enrollments/:id/drop",
  authenticate,
  authorize(Role.STUDENT),
  validate(enrollmentIdSchema),
  controller.dropEnrollment,
);

/* Attendance */
router.post(
  "/sections/:sectionId/attendance",
  authenticate,
  authorize(Role.ADMIN, Role.INSTRUCTOR),
  validate(markAttendanceSchema),
  controller.markAttendance,
);
router.get(
  "/sections/:sectionId/attendance",
  authenticate,
  authorize(Role.ADMIN, Role.INSTRUCTOR),
  validate(listSectionAttendanceSchema),
  controller.sectionAttendance,
);
router.get(
  "/attendance/me",
  authenticate,
  authorize(Role.STUDENT),
  validate(listMyAttendanceSchema),
  controller.myAttendance,
);

/* Exams */
router.post(
  "/sections/:sectionId/exams",
  authenticate,
  authorize(Role.ADMIN, Role.INSTRUCTOR),
  validate(createExamSchema),
  controller.createExam,
);
router.get(
  "/sections/:sectionId/exams",
  authenticate,
  validate(listSectionExamsSchema),
  controller.sectionExams,
);
router.delete(
  "/exams/:examId",
  authenticate,
  authorize(Role.ADMIN, Role.INSTRUCTOR),
  validate(examIdSchema),
  controller.deleteExam,
);

/* Results */
router.post(
  "/exams/:examId/results",
  authenticate,
  authorize(Role.ADMIN, Role.INSTRUCTOR),
  validate(saveResultsSchema),
  controller.saveResults,
);
router.post(
  "/exams/:examId/results/publish",
  authenticate,
  authorize(Role.ADMIN, Role.INSTRUCTOR),
  validate(examIdSchema),
  controller.publishResults,
);
router.get(
  "/exams/:examId/results",
  authenticate,
  authorize(Role.ADMIN, Role.INSTRUCTOR),
  validate(listExamResultsSchema),
  controller.examResults,
);
router.get(
  "/results/me",
  authenticate,
  authorize(Role.STUDENT),
  validate(listMyResultsSchema),
  controller.myResults,
);

/* Transcript */
router.get(
  "/transcript/me",
  authenticate,
  authorize(Role.STUDENT),
  controller.myTranscript,
);

export default router;