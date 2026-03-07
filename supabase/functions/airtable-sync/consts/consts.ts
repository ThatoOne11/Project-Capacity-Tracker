export const SyncStrategies = {
  PAYROLL: "PAYROLL",
  ASSIGNMENT: "ASSIGNMENT",
  PROJECT_ASSIGNMENT: "PROJECT_ASSIGNMENT",
} as const;

export type SyncStrategy = keyof typeof SyncStrategies;
