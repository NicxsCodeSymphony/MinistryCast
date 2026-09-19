import { getCurrentLanguage } from "../langStore";
import { translate } from "../i18n";

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
  const lang = getCurrentLanguage();
  if (snap.syncing) return translate(lang, "sync.backingUp");
  if (snap.error) return translate(lang, "sync.failed");
  if (!snap.online) {
    return snap.pending
      ? translate(lang, "sync.offlinePending", { n: snap.pending })
      : translate(lang, "sync.offline");
  }
  if (snap.pending) return translate(lang, "sync.waiting", { n: snap.pending });
  if (snap.lastSyncAt) return translate(lang, "sync.backedUp");
  return translate(lang, "sync.savedLocal");
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
