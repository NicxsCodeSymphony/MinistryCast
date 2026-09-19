const VIEW_CHURCH_KEY = "mc.setlistViewChurchId";

export function readSetlistViewChurchId() {
  try {
    return localStorage.getItem(VIEW_CHURCH_KEY) || "";
  } catch {
    return "";
  }
}

export function writeSetlistViewChurchId(id: string) {
  try {
    if (id) localStorage.setItem(VIEW_CHURCH_KEY, id);
    else localStorage.removeItem(VIEW_CHURCH_KEY);
  } catch {
    /* ignore */
  }
}
