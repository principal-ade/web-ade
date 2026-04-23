export interface RepoNote {
  content: string;
  updatedAt: string; // ISO 8601
}

// All notes for a user. Key: "owner/repo"
export interface RepoNotesData {
  notes: Record<string, RepoNote>;
  updatedAt: string; // ISO 8601
}

export interface UpsertRepoNoteRequest {
  owner: string;
  repo: string;
  content: string;
}

export const MAX_NOTE_LENGTH = 10_000;
