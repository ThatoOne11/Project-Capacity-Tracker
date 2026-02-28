export type AggregateRow = {
  user_name: string;
  project_name: string;
  month: string;
  total_hours: string;
};

// This matches the "Ashwin van der Merwe - Aqua Protrack - February 2026"
export type AirtableRecord = {
  id: string;
  fields: {
    "Name": string;
    "Actual Hours": number;
  };
};

export type SyncStats = {
  updated: number;
  inserted: number;
  skipped: number;
  missing: number;
};

export type AirtableUpdate = {
  id: string;
  fields: {
    "Actual Hours": number;
  };
};

export type AirtableInsert = {
  fields: {
    "User": string;
    "Project": string;
    "Month": string;
    "Actual Hours": number;
  };
};

export type SyncJob = {
  name: string;
  sourceView: string;
  destinationTableId: string;
  allowInserts: boolean;
};
