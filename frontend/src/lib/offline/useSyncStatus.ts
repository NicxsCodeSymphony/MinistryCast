import { useEffect, useState } from "react";
import { getSyncSnapshot, subscribeSync, type SyncSnapshot } from "./status";

export function useSyncStatus(): SyncSnapshot {
  const [snapshot, setSnapshot] = useState(getSyncSnapshot);
  useEffect(() => subscribeSync(setSnapshot), []);
  return snapshot;
}
