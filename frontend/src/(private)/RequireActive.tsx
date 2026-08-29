import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import {
  canAccessPath,
  getSessionProfile,
  isAppUnlocked,
  nextPathForProfile,
} from "../lib/auth";
import { heartbeatDevice, recordAuditEvent } from "../lib/admin";
import { readAppVersion } from "../lib/appVersion";
import { startSyncEngine } from "../lib/offline/sync";

export default function RequireActive() {
  const { pathname } = useLocation();
  const [ready, setReady] = useState(false);
  const [redirect, setRedirect] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let stop: (() => void) | undefined;
    void (async () => {
      try {
        const profile = await getSessionProfile();
        if (!isAppUnlocked(profile) || cancelled) return;
        try {
          const version = await readAppVersion();
          const firstOpen = !sessionStorage.getItem("mc.sessionAudited");
          if (firstOpen) sessionStorage.setItem("mc.sessionAudited", "1");
          await heartbeatDevice(version);
          if (firstOpen) {
            void recordAuditEvent({
              action: "session.open",
              summary: `${profile.user?.name || profile.user?.email || "Someone"} opened MinistryCast`,
              churchId: profile.church?.id,
            });
          }
        } catch {
          /* device heartbeat is best-effort */
        }
        if (!profile.church?.id) return;
        stop = await startSyncEngine(profile.church.id);
        if (cancelled) stop();
      } catch {
        /* Superadmin or missing church workspace stays online-only. */
      }
    })();
    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);

  useEffect(() => {
    setRedirect(null);
    void (async () => {
      try {
        const profile = await getSessionProfile();
        if (!isAppUnlocked(profile)) {
          setRedirect(nextPathForProfile(profile));
          return;
        }
        if (!canAccessPath(profile, pathname)) {
          setRedirect(nextPathForProfile(profile));
          return;
        }
        setReady(true);
      } catch {
        setRedirect("/");
      }
    })();
  }, [pathname]);

  if (redirect) return <Navigate to={redirect} replace />;
  if (!ready) {
    return (
      <div className="min-h-full w-full bg-surface-container-lowest flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
      </div>
    );
  }
  return <Outlet />;
}
