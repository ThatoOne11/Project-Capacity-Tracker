export type AggregateRow = {
  airtable_user_id: string | null;
  user_name: string;
  airtable_project_id: string | null;
  project_name: string;
  month: string;
  total_hours: string;
};

export type ViewRow = {
  user_name: string | null;
  project_name: string | null;
};
