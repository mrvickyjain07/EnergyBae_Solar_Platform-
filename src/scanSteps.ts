// src/scanSteps.ts
// Pure step-state rule behind ScanProgress.tsx. A step is "done" only once
// progress reaches the NEXT step's start — and the last step only at 100.
// Simulated scan progress parks below 100 until the server answers, so this
// keeps the final step "active" while the request is actually in flight
// (the old checklist marked every step Completed at 90% and looked stuck).

export interface ScanStep {
  label: string;
  /** Progress % at which this step becomes active. Ascending; first is 0. */
  start: number;
}

export type StepState = "done" | "active" | "pending";

export function stepStates(steps: ScanStep[], progress: number): StepState[] {
  return steps.map((s, i) => {
    const next = steps[i + 1]?.start ?? 100;
    if (progress >= next) return "done";
    if (progress >= s.start) return "active";
    return "pending";
  });
}
