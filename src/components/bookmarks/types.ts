// Shared types for the Bookmarks "passport" prototype.
//
// We reuse the same minimal repo shape the home page already persists for
// recent repositories (see RecentProjectItem in components/home/RecentProjectsStrip),
// so a repo dragged from the recent list drops straight into the passport.

export interface BookmarkRepo {
  full_name: string;
  name: string;
  owner: { login: string; avatar_url: string };
  description?: string | null;
  stargazers_count?: number;
  language?: string | null;
}

// A passport "page" is a fixed grid of slots. Each slot either holds a repo
// (by full_name) or is empty (null). Keeping placements keyed by slot index
// lets repos stay where the user stamped them, with gaps preserved.
export type PassportSlots = (string | null)[];

// MIME type used to carry a repo's full_name through native HTML5 drag-and-drop.
export const REPO_DND_MIME = "application/x-bookmark-repo";

// MIME type carrying a full serialized BookmarkRepo — used when dragging a repo
// that isn't already a slot (e.g. the current repo), so the drop target can
// persist the whole object without a separate lookup.
export const REPO_JSON_DND_MIME = "application/x-bookmark-repo-json";
