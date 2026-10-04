import { PrismaClient, Role, SemesterStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const adminHash = await bcrypt.hash("Admin@1234", 12);
  const instructorHash = await bcrypt.hash("Instructor@1234", 12);
  const studentHash = await bcrypt.hash("Student@1234", 12);

  const cse = await prisma.department.create({
    data: {
      name: "Computer Science and Engineering",
      code: "CSE",
      description: "Department of CSE",
    },
  });

  const bba = await prisma.department.create({
    data: {
      name: "Business Administration",
      code: "BBA",
      description: "Department of Business",
    },
  });

  const bscCse = await prisma.program.create({
    data: {
      name: "B.Sc. in Computer Science",
      code: "BSC-CSE",
      departmentId: cse.id,
      durationYears: 4,
    },
  });

  await prisma.program.create({
    data: {
      name: "BBA in Management",
      code: "BBA-MGT",
      departmentId: bba.id,
      durationYears: 4,
    },
  });

  const cse101 = await prisma.course.create({
    data: {
      code: "CSE101",
      title: "Introduction to Programming",
      description: "Fundamentals of programming using TypeScript/Java",
      credits: 3,
      departmentId: cse.id,
      programId: bscCse.id,
    },
  });

  const cse102 = await prisma.course.create({
    data: {
      code: "CSE102",
      title: "Discrete Mathematics",
      description: "Logic, sets, combinatorics",
      credits: 3,
      departmentId: cse.id,
      programId: bscCse.id,
    },
  });

  const cse201 = await prisma.course.create({
    data: {
      code: "CSE201",
      title: "Data Structures",
      description: "Arrays, lists, trees, graphs",
      credits: 3,
      departmentId: cse.id,
      programId: bscCse.id,
    },
  });

  await prisma.coursePrerequisite.create({
    data: { courseId: cse201.id, prerequisiteId: cse101.id },
  });

  await prisma.course.create({
    data: {
      code: "ENG101",
      title: "English Composition",
      description: "Academic writing",
      credits: 3,
      departmentId: bba.id,
      programId: bscCse.id,
    },
  });

  const admin = await prisma.user.create({
    data: {
      email: "admin@ums.edu",
      password: adminHash,
      name: "System Admin",
      role: Role.ADMIN,
    },
  });

  const instructorUser = await prisma.user.create({
    data: {
      email: "instructor@ums.edu",
      password: instructorHash,
      name: "Dr. Sarah Khan",
      role: Role.INSTRUCTOR,
      instructorProfile: {
        create: {
          employeeId: "EMP-1001",
          departmentId: cse.id,
          designation: "Assistant Professor",
        },
      },
    },
    include: { instructorProfile: true },
  });

  await prisma.user.create({
    data: {
      email: "student@ums.edu",
      password: studentHash,
      name: "Rahul Ahmed",
      role: Role.STUDENT,
      studentProfile: {
        create: {
          studentId: "STU-2024-0001",
          programId: bscCse.id,
          admissionYear: 2024,
        },
      },
    },
  });

  const semester = await prisma.semester.create({
    data: {
      name: "Fall 2025",
      code: "FALL-2025",
      startDate: new Date("2025-09-01"),
      endDate: new Date("2025-12-20"),
      status: SemesterStatus.REGISTRATION_OPEN,
      tuitionFee: "500.00",
      maxCredits: 18,
    },
  });

  await prisma.section.createMany({
    data: [
      {
        courseId: cse101.id,
        semesterId: semester.id,
        instructorId: instructorUser.instructorProfile!.id,
        sectionCode: "A",
        capacity: 2,
        schedule: "Sun/Tue 10:00-11:20 Room 301",
      },
      {
        courseId: cse102.id,
        semesterId: semester.id,
        instructorId: instructorUser.instructorProfile!.id,
        sectionCode: "A",
        capacity: 30,
        schedule: "Mon/Wed 12:00-13:20 Room 204",
      },
      {
        courseId: cse201.id,
        semesterId: semester.id,
        instructorId: instructorUser.instructorProfile!.id,
        sectionCode: "A",
        capacity: 25,
        schedule: "Sun/Tue 14:00-15:20 Room 110",
      },
    ],
  });

  await prisma.auditLog.create({
    data: {
      actorId: admin.id,
      action: "SEED",
      entity: "Database",
      metadata: { message: "Initial academic data seeded" },
    },
  });

  console.log("Seed complete");
  console.log("ADMIN      admin@ums.edu       Admin@1234");
  console.log("INSTRUCTOR instructor@ums.edu  Instructor@1234");
  console.log("STUDENT    student@ums.edu     Student@1234");
}

main()
  .catch((e) => {
    console.error(e);
    
  })
  .finally(async () => {
    await prisma.$disconnect();
  });