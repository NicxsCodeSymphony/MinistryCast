import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  SESSION_PROFILE_EVENT,
  getSessionProfile,
  readCachedSessionProfile,
  type SessionProfile,
} from "./auth";
import { supabase } from "./supabase";

type ProfileContextValue = {
  profile: SessionProfile | null;
  loading: boolean;
  refreshProfile: (fresh?: boolean) => Promise<SessionProfile | null>;
  setProfile: (profile: SessionProfile | null) => void;
};

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfileState] = useState<SessionProfile | null>(
    () => readCachedSessionProfile(),
  );
  const [loading, setLoading] = useState(!readCachedSessionProfile());

  const setProfile = useCallback((next: SessionProfile | null) => {
    setProfileState(next);
  }, []);

  const refreshProfile = useCallback(async (fresh = false) => {
    try {
      // Never clear the cache before a successful fetch — that wiped the header
      // avatar on token refresh / transient RPC failures.
      if (fresh) {
        /* still hit network via getSessionProfile */
      }
      const next = await getSessionProfile();
      setProfileState(next);
      return next;
    } catch {
      const cached = readCachedSessionProfile();
      if (cached) {
        setProfileState(cached);
        return cached;
      }
      setProfileState((prev) => prev);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshProfile(false);

    const onProfileEvent = (event: Event) => {
      const detail = (event as CustomEvent<SessionProfile | null>).detail;
      setProfileState(detail ?? null);
    };
    window.addEventListener(SESSION_PROFILE_EVENT, onProfileEvent);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setProfileState(null);
        return;
      }
      if (
        event === "SIGNED_IN" ||
        event === "TOKEN_REFRESHED" ||
        event === "USER_UPDATED"
      ) {
        void refreshProfile(true);
      }
    });

    return () => {
      window.removeEventListener(SESSION_PROFILE_EVENT, onProfileEvent);
      subscription.unsubscribe();
    };
  }, [refreshProfile]);

  const value = useMemo(
    () => ({ profile, loading, refreshProfile, setProfile }),
    [profile, loading, refreshProfile, setProfile],
  );

  return (
    <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
  );
}

export function useProfile() {
  const value = useContext(ProfileContext);
  if (!value) throw new Error("useProfile must be used within ProfileProvider");
  return value;
}
