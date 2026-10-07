type ExamInput = {
  maxMarks: unknown;
  weight: unknown;
  results: { marks: unknown }[];
};

export function gradeForPercentage(percentage: number) {
  if (percentage >= 90) return { grade: "A", points: 4.0 };
  if (percentage >= 85) return { grade: "A-", points: 3.7 };
  if (percentage >= 80) return { grade: "B+", points: 3.3 };
  if (percentage >= 75) return { grade: "B", points: 3.0 };
  if (percentage >= 70) return { grade: "B-", points: 2.7 };
  if (percentage >= 65) return { grade: "C+", points: 2.3 };
  if (percentage >= 60) return { grade: "C", points: 2.0 };
  if (percentage >= 50) return { grade: "D", points: 1.0 };
  return { grade: "F", points: 0.0 };
}

/**
 * Results passed to this function should already be filtered to published
 * results for one student.
 */
export function calculateCourseOutcome(exams: ExamInput[]) {
  if (exams.length === 0) {
    return {
      hasAllResults: false,
      weightsComplete: false,
      percentage: null as number | null,
    };
  }

  let totalWeight = 0;
  let weightedPercentage = 0;
  let hasAllResults = true;

  for (const exam of exams) {
    const maxMarks = Number(exam.maxMarks);
    const weight = Number(exam.weight);
    totalWeight += weight;

    if (!exam.results.length || maxMarks <= 0) {
      hasAllResults = false;
      continue;
    }

    const marks = Number(exam.results[0].marks);
    weightedPercentage += (marks / maxMarks) * weight;
  }

  const weightsComplete = Math.abs(totalWeight - 100) < 0.01;

  return {
    hasAllResults,
    weightsComplete,
    percentage: hasAllResults
      ? Math.max(0, Math.min(100, weightedPercentage))
      : null,
  };
}