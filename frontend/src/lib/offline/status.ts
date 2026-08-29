export type BackupFrequency = "15m" | "hourly" | "daily";

export function backupIntervalMs(frequency: string | null | undefined) {
  if (frequency === "15m") return 15 * 60 * 1000;
  if (frequency === "daily") return 24 * 60 * 60 * 1000;
  return 60 * 60 * 1000;
}

export function isOnline() {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

export type SyncSnapshot = {
  online: boolean;
  syncing: boolean;
  pending: number;
  lastSyncAt: string | null;
  frequency: BackupFrequency | string;
  error: string | null;
};

const listeners = new Set<(snap: SyncSnapshot) => void>();
let snapshot: SyncSnapshot = {
  online: isOnline(),
  syncing: false,
  pending: 0,
  lastSyncAt: null,
  frequency: "hourly",
  error: null,
};

export function getSyncSnapshot() {
  return snapshot;
}

export function setSyncSnapshot(patch: Partial<SyncSnapshot>) {
  snapshot = { ...snapshot, ...patch };
  for (const listener of listeners) listener(snapshot);
}

export function subscribeSync(listener: (snap: SyncSnapshot) => void) {
  listeners.add(listener);
  listener(snapshot);
  return () => {
    listeners.delete(listener);
  };
}

export function syncLabel(snap: SyncSnapshot) {
  if (snap.syncing) return "Backing up…";
  if (snap.error) return "Backup failed";
  if (!snap.online) {
    return snap.pending ? `${snap.pending} pending · offline` : "Offline";
  }
  if (snap.pending) return `${snap.pending} waiting to sync`;
  if (snap.lastSyncAt) return "Backed up";
  return "Saved on this device";
}

export function syncIcon(snap: SyncSnapshot) {
  if (snap.syncing) return "cloud_sync";
  if (!snap.online) return "cloud_off";
  if (snap.pending) return "cloud_upload";
  return "cloud_done";
}

export function nowIso() {
  return new Date().toISOString();
}

export function newId() {
  return crypto.randomUUID();
}
