import "dotenv/config";

import {
  PrismaClient,
  Role,
  SemesterStatus,
} from "../src/generated/prisma/client";

import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import bcrypt from "bcryptjs";

// PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Prisma 7 PostgreSQL adapter
const adapter = new PrismaPg(pool);

// Initialize Prisma Client with the adapter
const prisma = new PrismaClient({
  adapter,
});

async function main() {
  console.log("Starting database seeding...");

  // Hash passwords
  const adminHash = await bcrypt.hash("Admin@1234", 12);
  const instructorHash = await bcrypt.hash("Instructor@1234", 12);
  const studentHash = await bcrypt.hash("Student@1234", 12);

  // ============================================
  // 1. Create Departments
  // ============================================

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

  // ============================================
  // 2. Create Programs
  // ============================================

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

  // ============================================
  // 3. Create Courses
  // ============================================

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

  // ============================================
  // 4. Create Course Prerequisite
  // ============================================

  await prisma.coursePrerequisite.create({
    data: {
      courseId: cse201.id,
      prerequisiteId: cse101.id,
    },
  });

  // English course
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

  // ============================================
  // 5. Create Admin User
  // ============================================

  const admin = await prisma.user.create({
    data: {
      email: "admin@ums.edu",
      password: adminHash,
      name: "System Admin",
      role: Role.ADMIN,
    },
  });

  // ============================================
  // 6. Create Instructor and Profile
  // ============================================

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
    include: {
      instructorProfile: true,
    },
  });

  // ============================================
  // 7. Create Student and Profile
  // ============================================

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

  // ============================================
  // 8. Create Semester
  // ============================================

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

  // ============================================
  // 9. Create Course Sections
  // ============================================

  const instructorProfileId = instructorUser.instructorProfile?.id;

  if (!instructorProfileId) {
    throw new Error("Instructor profile was not created.");
  }

  await prisma.section.createMany({
    data: [
      {
        courseId: cse101.id,
        semesterId: semester.id,
        instructorId: instructorProfileId,
        sectionCode: "A",
        capacity: 2,
        schedule: "Sun/Tue 10:00-11:20 Room 301",
      },
      {
        courseId: cse102.id,
        semesterId: semester.id,
        instructorId: instructorProfileId,
        sectionCode: "A",
        capacity: 30,
        schedule: "Mon/Wed 12:00-13:20 Room 204",
      },
      {
        courseId: cse201.id,
        semesterId: semester.id,
        instructorId: instructorProfileId,
        sectionCode: "A",
        capacity: 25,
        schedule: "Sun/Tue 14:00-15:20 Room 110",
      },
    ],
  });

  // ============================================
  // 10. Create Audit Log
  // ============================================

  await prisma.auditLog.create({
    data: {
      actorId: admin.id,
      action: "SEED",
      entity: "Database",
      metadata: {
        message: "Initial academic data seeded",
      },
    },
  });

  // ============================================
  // 11. Display Seed Results
  // ============================================

  console.log("\n==================================");
  console.log("Database seeding completed!");
  console.log("==================================");
  console.log("ADMIN      admin@ums.edu       Admin@1234");
  console.log("INSTRUCTOR instructor@ums.edu  Instructor@1234");
  console.log("STUDENT    student@ums.edu     Student@1234");
  console.log("==================================");
}

main()
  .catch((error: unknown) => {
    console.error("Database seeding failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
