import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { getSessionProfile, isSuperadmin } from "../../lib/auth";

/** Deep-link redirect: Approvals now live under Settings. */
export default function ApprovalsRedirect() {
  const [target, setTarget] = useState("/settings?tab=approvals");

  useEffect(() => {
    void getSessionProfile()
      .then((profile) => {
        setTarget(
          isSuperadmin(profile)
            ? "/settings?tab=approvals"
            : "/settings?tab=team",
        );
      })
      .catch(() => setTarget("/settings"));
  }, []);

  return <Navigate to={target} replace />;
}
