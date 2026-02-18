export type AggregateRow = {
  user_name: string;
  project_name: string;
  month: string;
  total_hours: string;
};

export type AirtableRecord = {
  id: string;
  fields: {
    "Name": string; // This matches the "Ashwin van der Merwe - Aqua Protrack - February 2026"
    "Actual Hours": number;
  };
};

export type SyncStats = {
  updated: number;
  skipped: number;
  missing: number;
};

export type AirtableUpdate = {
  id: string;
  fields: {
    "Actual Hours": number;
  };
};
