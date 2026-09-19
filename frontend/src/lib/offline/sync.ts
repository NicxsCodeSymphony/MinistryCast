import { requireChurchId } from "../helpers";
import { invalidateQueries } from "./queryCache";
import { pullRemote, pushOutbox } from "./remote";
import {
  backupIntervalMs,
  isOnline,
  nowIso,
  setSyncSnapshot,
} from "./status";
import { getMeta, listRows, refreshPending, setMeta } from "./store";

let engineChurchId: string | null = null;
let engineGen = 0;
let timer: number | null = null;
let inflight: Promise<void> | null = null;
const hydrateJobs = new Map<string, Promise<void>>();

function clearTimer() {
  if (timer != null) {
    window.clearTimeout(timer);
    timer = null;
  }
}

function nextWait(lastSyncAt: string | null, frequency: string, minMs: number) {
  const interval = backupIntervalMs(frequency);
  if (!lastSyncAt) return minMs;
  const elapsed = Date.now() - new Date(lastSyncAt).getTime();
  if (!Number.isFinite(elapsed) || elapsed < 0) return minMs;
  return Math.max(minMs, interval - elapsed);
}

async function schedule(churchId: string, minMs = 5_000) {
  clearTimer();
  const meta = await getMeta(churchId);
  const wait = nextWait(meta.lastSyncAt ?? meta.hydratedAt, meta.backupFrequency, minMs);
  timer = window.setTimeout(() => {
    void runSync(churchId, "schedule");
  }, wait);
}

async function doSync(churchId: string) {
  setSyncSnapshot({ syncing: true, online: true, error: null });
  try {
    await pushOutbox(churchId);
    await pullRemote(churchId);
    const meta = await setMeta(churchId, {
      lastSyncAt: nowIso(),
      hydratedAt: nowIso(),
    });
    await refreshPending(churchId);
    setSyncSnapshot({
      syncing: false,
      error: null,
      lastSyncAt: meta.lastSyncAt,
      frequency: meta.backupFrequency,
    });
    await schedule(churchId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not sync.";
    setSyncSnapshot({
      syncing: false,
      error: message,
    });
    await refreshPending(churchId);
    await schedule(churchId, 15_000);
    throw err;
  }
}

async function runSync(churchId: string, reason: "manual" | "schedule" | "online") {
  if (reason !== "manual" && inflight) return;
  while (inflight) {
    try {
      await inflight;
    } catch {
      break;
    }
  }
  if (reason !== "manual" && inflight) return;
  if (reason !== "manual" && !isOnline()) {
    setSyncSnapshot({
      online: false,
      error: "Offline — changes stay on this device.",
    });
    await schedule(churchId);
    return;
  }
  const job = doSync(churchId);
  inflight = job;
  try {
    await job;
  } catch (err) {
    if (reason === "manual") throw err;
  } finally {
    if (inflight === job) inflight = null;
  }
}

export async function ensureHydrated(
  churchId: string,
  options?: { force?: boolean },
) {
  const existing = hydrateJobs.get(churchId);
  if (existing) return existing;
  const job = (async () => {
    const meta = await getMeta(churchId);
    await refreshPending(churchId);
    if (!isOnline()) return;
    const hydratedAt = meta.hydratedAt ? Date.parse(meta.hydratedAt) : 0;
    const isFresh =
      Number.isFinite(hydratedAt) &&
      hydratedAt > 0 &&
      Date.now() - hydratedAt < 120_000;
    // Skip redundant full pulls when IndexedDB was just hydrated (e.g. app open).
    if (!options?.force && isFresh) return;
    await pullRemote(churchId);
    localStorage.setItem("mc.catalogShares", "1");
    await setMeta(churchId, {
      hydratedAt: nowIso(),
      backupFrequency: meta.backupFrequency,
    });
  })().finally(() => hydrateJobs.delete(churchId));
  hydrateJobs.set(churchId, job);
  return job;
}

/** Hydrate a church workspace and drop in-memory list caches so pages re-read IndexedDB. */
export async function reloadChurchCatalog(
  churchId: string,
  options?: { force?: boolean },
) {
  if (!churchId) return;
  await ensureHydrated(churchId, options);
  invalidateQueries();
}

export async function setBackupFrequency(frequency: string) {
  const churchId = engineChurchId ?? (await requireChurchId());
  const meta = await getMeta(churchId);
  if (meta.backupFrequency === frequency) {
    setSyncSnapshot({ frequency });
    return;
  }
  await setMeta(churchId, { backupFrequency: frequency });
  setSyncSnapshot({ frequency });
  await schedule(churchId);
}

export async function forceSync() {
  const churchId = engineChurchId ?? (await requireChurchId());
  await runSync(churchId, "manual");
}

export async function startSyncEngine(churchId: string) {
  const gen = ++engineGen;
  engineChurchId = churchId;
  setSyncSnapshot({ online: isOnline() });
  await refreshPending(churchId);
  const meta = await getMeta(churchId);
  setSyncSnapshot({
    lastSyncAt: meta.lastSyncAt,
    frequency: meta.backupFrequency,
  });
  // First paint: pull remote catalog into IndexedDB (local reads stay primary).
  await ensureHydrated(churchId);
  if (engineGen !== gen) return () => undefined;

  // Every login / app open: full online↔offline sync so new members get existing
  // church setlists, songs, and sermons immediately, then keep reading from IDB.
  if (isOnline()) {
    try {
      await runSync(churchId, "online");
    } catch {
      /* hydrate already populated what it could; schedule will retry */
    }
  }
  if (engineGen !== gen) return () => undefined;

  void (async () => {
    if (engineGen !== gen) return;
    const settings = await listRows(churchId, "church_settings");
    const frequency = settings[0]?.backup_frequency;
    if (typeof frequency === "string" && frequency) {
      await setMeta(churchId, { backupFrequency: frequency });
      setSyncSnapshot({ frequency });
    }
    if (engineGen !== gen) return;
    await schedule(churchId);
  })();

  const onOnline = () => {
    setSyncSnapshot({ online: true });
    void runSync(churchId, "online").catch(() => undefined);
  };
  const onOffline = () => {
    setSyncSnapshot({ online: false });
  };
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  return () => {
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
    if (engineGen !== gen) return;
    clearTimer();
  };
}

export async function estimateStorage() {
  if (!navigator.storage?.estimate) return null;
  const { usage, quota } = await navigator.storage.estimate();
  return { usage: usage ?? 0, quota: quota ?? 0 };
}
