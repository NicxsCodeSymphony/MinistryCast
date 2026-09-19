const PREFERRED_SETLIST_KEY = "mc.preferredSetlistId";

export function readPreferredSetlistId() {
  try {
    return localStorage.getItem(PREFERRED_SETLIST_KEY) || "";
  } catch {
    return "";
  }
}

export function writePreferredSetlistId(id: string) {
  try {
    if (id) localStorage.setItem(PREFERRED_SETLIST_KEY, id);
    else localStorage.removeItem(PREFERRED_SETLIST_KEY);
  } catch {
    /* ignore */
  }
}
