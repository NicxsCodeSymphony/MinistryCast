import { supabase } from "./supabase";

export type AppUserStatus = "pending" | "active" | "disabled";
export type AppRole = "superadmin" | "admin" | "producer" | "operator";

export type SessionProfile = {
  authenticated: boolean;
  user: {
    id: string;
    name: string;
    email: string;
    role: AppRole;
    status: AppUserStatus;
  } | null;
  church: {
    id: string;
    name: string;
    status: string;
    onboarded_at: string | null;
  } | null;
};

export type SignupRequest = {
  church_id: string;
  church_name: string;
  church_email: string;
  status: string;
  created_at: string;
  applicant_id: string;
  applicant_name: string;
  applicant_email: string;
};

function asError(error: { message: string } | null, fallback: string) {
  return new Error(error?.message || fallback);
}

export async function sendEmailOtp(email: string) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
    },
  });
  if (error) throw asError(error, "Could not send the code.");
}

export async function verifyEmailOtp(email: string, token: string) {
  const types = ["email", "signup", "magiclink"] as const;
  let lastError: { message: string } | null = null;
  for (const type of types) {
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token,
      type,
    });
    if (!error) return data;
    lastError = error;
  }
  throw asError(lastError, "That code is invalid or expired.");
}

const PROFILE_CACHE_KEY = "mc_session_profile";

export function readCachedSessionProfile(): SessionProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY);
    return raw ? (JSON.parse(raw) as SessionProfile) : null;
  } catch {
    return null;
  }
}

export function cacheSessionProfile(profile: SessionProfile) {
  localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile));
}

export function clearSessionProfileCache() {
  localStorage.removeItem(PROFILE_CACHE_KEY);
}

export async function getSessionProfile(): Promise<SessionProfile> {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    clearSessionProfileCache();
    return { authenticated: false, user: null, church: null };
  }

  try {
    const { data, error } = await supabase.rpc("get_session_profile");
    if (error) throw asError(error, "Could not load your account.");
    const profile = data as SessionProfile;
    cacheSessionProfile(profile);
    return profile;
  } catch (err) {
    const cached = readCachedSessionProfile();
    if (cached?.authenticated && cached.user) return cached;
    throw err;
  }
}

export async function completeSignup(name: string, churchName: string) {
  const { data, error } = await supabase.rpc("complete_signup", {
    p_name: name,
    p_church_name: churchName,
  });
  if (error) throw asError(error, "Could not submit your ministry.");
  cacheSessionProfile(data as SessionProfile);
  return data as SessionProfile;
}

export async function listSignupRequests() {
  const { data, error } = await supabase.rpc("list_signup_requests");
  if (error) throw asError(error, "Could not load requests.");
  return (data ?? []) as SignupRequest[];
}

export async function reviewSignup(churchId: string, action: "approve" | "reject") {
  const { data, error } = await supabase.rpc("review_signup", {
    p_church_id: churchId,
    p_action: action,
  });
  if (error) throw asError(error, "Could not update that request.");
  return (data ?? []) as SignupRequest[];
}

export async function completeOnboarding() {
  const { data, error } = await supabase.rpc("complete_onboarding");
  if (error) throw asError(error, "Could not finish setup.");
  cacheSessionProfile(data as SessionProfile);
  return data as SessionProfile;
}

export async function signOut() {
  sessionStorage.removeItem("mc_auth_email");
  clearSessionProfileCache();
  await supabase.auth.signOut({ scope: "global" });
}

export function isSuperadmin(profile: SessionProfile) {
  return profile.user?.role === "superadmin" && profile.user.status === "active";
}

export function isAppUnlocked(profile: SessionProfile) {
  if (!profile.user) return false;
  if (isSuperadmin(profile)) return true;
  return profile.user.status === "active" && profile.church?.status === "active";
}

export function homePathForProfile(profile: SessionProfile) {
  return isSuperadmin(profile) ? "/admin" : "/dashboard";
}

export function needsOnboarding(profile: SessionProfile) {
  if (!isAppUnlocked(profile) || isSuperadmin(profile)) return false;
  return !profile.church?.onboarded_at;
}

export function nextPathForProfile(profile: SessionProfile) {
  if (!profile.authenticated) return "/";
  if (!profile.user) return "/signup";
  if (!isAppUnlocked(profile)) return "/signup";
  if (needsOnboarding(profile)) return "/onboarding";
  return homePathForProfile(profile);
}

export function canAccessPath(profile: SessionProfile, pathname: string) {
  if (!isAppUnlocked(profile)) return false;
  if (pathname.startsWith("/admin")) return isSuperadmin(profile);
  if (pathname === "/onboarding") return needsOnboarding(profile);
  if (needsOnboarding(profile) && pathname !== "/output") return false;
  return true;
}
