export type ClockifyUser = {
  id: string;
  name: string;
  email: string;
  status: string;
};

export type ClockifyClient = {
  id: string;
  name: string;
};

export type ClockifyProject = {
  id: string;
  name: string;
  clientId: string | null;
};

export type ClockifyTimeInterval = {
  start: string;
  end: string;
  duration: string;
};

export type ClockifyTimeEntry = {
  id: string;
  description: string;
  userId: string;
  projectId: string | null;
  timeInterval: ClockifyTimeInterval;
};

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

export interface SyncReportStats {
  durationSeconds: number;
  upserted: number;
  deleted: number;
  usersScanned: number;
  status: "SUCCESS" | "FAILURE";
}

export interface SlackBlock {
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
}

export interface SlackPayload {
  text: string;
  blocks?: SlackBlock[];
}
