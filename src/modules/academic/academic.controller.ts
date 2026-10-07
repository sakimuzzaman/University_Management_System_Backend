import { Request } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { sendResponse } from "../../utils/sendResponse";
import * as service from "./academic.service";

function actor(req: Request) {
  return { id: req.user!.id, role: req.user!.role };
}

function endpoint(
  message: string,
  status: number,
  action: (req: Request) => Promise<unknown>,
) {
  return asyncHandler(async (req, res) => {
    const data = await action(req);
    return sendResponse(res, status, message, data);
  });
}

export const createSemester = endpoint("Semester created", 201, (req) =>
  service.createSemester(req.body, actor(req), req.ip),
);
export const listSemesters = endpoint("Semesters fetched", 200, (req) =>
  service.listSemesters(req.validated?.query ?? {}),
);
export const getSemester = endpoint("Semester fetched", 200, (req) =>
  service.getSemester(req.validated?.params.id),
);
export const updateSemester = endpoint("Semester updated", 200, (req) =>
  service.updateSemester(req.validated?.params.id, req.body, actor(req), req.ip),
);
export const updateSemesterStatus = endpoint("Semester status updated", 200, (req) =>
  service.updateSemesterStatus(
    req.validated?.params.id,
    req.body.status,
    actor(req),
    req.ip,
  ),
);
export const deleteSemester = endpoint("Semester soft-deleted", 200, async (req) =>
  service.softDeleteSemester(req.validated?.params.id, actor(req), req.ip),
);

export const createSection = endpoint("Section created", 201, (req) =>
  service.createSection(req.body, actor(req), req.ip),
);
export const listSections = endpoint("Sections fetched", 200, (req) =>
  service.listSections(req.validated?.query ?? {}, actor(req)),
);
export const getSection = endpoint("Section fetched", 200, (req) =>
  service.getSection(req.validated?.params.id, actor(req)),
);
export const updateSection = endpoint("Section updated", 200, (req) =>
  service.updateSection(req.validated?.params.id, req.body, actor(req), req.ip),
);
export const assignInstructor = endpoint("Instructor assignment updated", 200, (req) =>
  service.assignInstructor(
    req.validated?.params.id,
    req.body.instructorProfileId,
    actor(req),
    req.ip,
  ),
);
export const deleteSection = endpoint("Section soft-deleted", 200, (req) =>
  service.softDeleteSection(req.validated?.params.id, actor(req), req.ip),
);

export const enroll = endpoint("Enrollment created", 201, (req) =>
  service.enrollInSection(req.body.sectionId, actor(req), req.ip),
);
export const myEnrollments = endpoint("Enrollments fetched", 200, (req) =>
  service.listMyEnrollments(req.user!.id, req.validated?.query ?? {}),
);
export const dropEnrollment = endpoint("Enrollment dropped", 200, (req) =>
  service.dropEnrollment(req.validated?.params.id, actor(req), req.ip),
);

export const markAttendance = endpoint("Attendance saved", 200, (req) =>
  service.markAttendance(
    req.validated?.params.sectionId,
    req.body,
    actor(req),
    req.ip,
  ),
);
export const sectionAttendance = endpoint("Attendance fetched", 200, (req) =>
  service.listSectionAttendance(
    req.validated?.params.sectionId,
    req.validated?.query ?? {},
    actor(req),
  ),
);
export const myAttendance = endpoint("Attendance fetched", 200, (req) =>
  service.listMyAttendance(req.user!.id, req.validated?.query ?? {}),
);

export const createExam = endpoint("Exam created", 201, (req) =>
  service.createExam(
    req.validated?.params.sectionId,
    req.body,
    actor(req),
    req.ip,
  ),
);
export const sectionExams = endpoint("Exams fetched", 200, (req) =>
  service.listSectionExams(req.validated?.params.sectionId, actor(req)),
);
export const deleteExam = endpoint("Exam soft-deleted", 200, (req) =>
  service.softDeleteExam(req.validated?.params.examId, actor(req), req.ip),
);

export const saveResults = endpoint("Result drafts saved", 200, (req) =>
  service.saveExamResults(
    req.validated?.params.examId,
    req.body.entries,
    actor(req),
    req.ip,
  ),
);
export const publishResults = endpoint("Results published", 200, (req) =>
  service.publishExamResults(req.validated?.params.examId, actor(req), req.ip),
);
export const examResults = endpoint("Exam results fetched", 200, (req) =>
  service.listExamResults(
    req.validated?.params.examId,
    req.validated?.query ?? {},
    actor(req),
  ),
);
export const myResults = endpoint("Published results fetched", 200, (req) =>
  service.listMyResults(req.user!.id, req.validated?.query ?? {}),
);

export const myTranscript = endpoint("Transcript fetched", 200, (req) =>
  service.getMyTranscript(req.user!.id),
);