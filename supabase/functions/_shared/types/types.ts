import { z } from "npm:zod";

export const SyncRequestSchema = z.object({
  lookbackDays: z.number().int().positive().optional(),
});

export const ClockifyUserSchema = z.object({
  id: z.string(),
  name: z.string().nullish().transform((val) => val || "Unknown User"),
  email: z.email().optional().nullable(),
  status: z.string().optional(),
});

export const ClockifyClientSchema = z.object({
  id: z.string(),
  name: z.string().nullish().transform((val) => val || "Unknown Client"),
});

export const ClockifyProjectSchema = z.object({
  id: z.string(),
  name: z.string().nullish().transform((val) => val || "Unknown Project"),
  clientId: z.string().nullable().optional(),
});

export const ClockifyTimeIntervalSchema = z.object({
  start: z.string(),
  end: z.string().nullable().optional(),
  duration: z.string().nullable().optional(),
});

export const ClockifyTimeEntrySchema = z.object({
  id: z.string(),
  description: z.string().nullable().optional(),
  userId: z.string(),
  projectId: z.string().nullable().optional(),
  timeInterval: ClockifyTimeIntervalSchema,
});

export type SyncResult = {
  synced: number;
  skipped: number;
};

export type TimeEntryRow = {
  clockify_id: string;
  description: string | null;
  start_time: string;
  end_time: string | null;
  duration: string | null;
  user_id: string;
  project_id: string | null;
  deleted_at?: string | null;
};

export type SyncReportStats = {
  durationSeconds: number;
  upserted: number;
  deleted: number;
  usersScanned: number;
  status: "SUCCESS" | "FAILURE";
  newUsers: string[];
  renamedUsers: string[];
  newProjects: string[];
  newClients: string[];
};

export type SlackBlock = {
  type: string;
  text?: {
    type: string;
    text: string;
    emoji?: boolean;
  };
  fields?: {
    type: string;
    text: string;
  }[];
  elements?: unknown[];
};

export type SlackPayload = {
  text: string;
  blocks?: SlackBlock[];
};

export type ClockifyUser = z.infer<typeof ClockifyUserSchema>;
export type ClockifyClient = z.infer<typeof ClockifyClientSchema>;
export type ClockifyProject = z.infer<typeof ClockifyProjectSchema>;
export type ClockifyTimeInterval = z.infer<typeof ClockifyTimeIntervalSchema>;
export type ClockifyTimeEntry = z.infer<typeof ClockifyTimeEntrySchema>;
export type SyncRequestBody = z.infer<typeof SyncRequestSchema>;
