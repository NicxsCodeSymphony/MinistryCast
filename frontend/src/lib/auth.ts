import { supabase } from "./supabase";
import { cachedQuery, invalidateQuery, setQueryCache } from "./offline/queryCache";

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
    avatar_url?: string | null;
  } | null;
  church: {
    id: string;
    name: string;
    status: string;
    onboarded_at: string | null;
    address?: string | null;
    phone?: string | null;
    photo_url?: string | null;
    email?: string | null;
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

export type ApprovalRequest = {
  kind: "church" | "member";
  id: string;
  church_id: string;
  church_name: string;
  church_email: string;
  status: string;
  phase: "church" | "platform" | null;
  created_at: string;
  applicant_id: string;
  applicant_name: string;
  applicant_email: string;
  applicant_role?: string;
};

function asError(error: { message: string } | null, fallback: string) {
  return new Error(error?.message || fallback);
}

async function invokeFunction(name: string, body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke<{
    ok?: boolean;
    error?: string;
  }>(name, { body });

  if (error) {
    let detail = error.message;
    const response = (error as { context?: Response }).context;
    if (response) {
      try {
        const payload = (await response.clone().json()) as { error?: string };
        if (payload.error) detail = payload.error;
      } catch {
        // keep error.message
      }
    }
    throw new Error(detail || "Request failed.");
  }

  if (data?.error) throw new Error(data.error);
}

export async function registerAccount(email: string, password: string) {
  await invokeFunction("register-account", {
    email,
    password,
    redirectTo: window.location.origin,
  });
  await signInWithEmailPassword(email, password);
}

export async function requestPasswordReset(email: string) {
  // Prefer edge function so we control allowlist + messaging.
  // Falls back to client Auth API if the function is unavailable.
  const redirectTo = `${window.location.origin}/reset-password`;
  try {
    await invokeFunction("send-password-reset", { email, redirectTo });
    return;
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (/not found|failed to send|FunctionsFetchError|404/i.test(message)) {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo,
      });
      if (error) throw asError(error, "Could not send the reset email.");
      return;
    }
    throw err;
  }
}

export async function updatePassword(password: string) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw asError(error, "Could not update your password.");
}

export async function deleteMyAccount(password: string) {
  await invokeFunction("delete-account", { password });
  clearSessionProfileCache();
  sessionStorage.removeItem("mc_auth_email");
  try {
    await supabase.auth.signOut({ scope: "global" });
  } catch {
    // Auth user may already be gone.
  }
}

export async function signInWithEmailPassword(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw asError(error, "Could not sign in.");
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

export const SESSION_PROFILE_EVENT = "mc:session-profile";

export function cacheSessionProfile(profile: SessionProfile) {
  localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile));
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(SESSION_PROFILE_EVENT, { detail: profile }),
    );
  }
}

export function clearSessionProfileCache() {
  localStorage.removeItem(PROFILE_CACHE_KEY);
}

/** Extract storage object path from a public bucket URL. */
export function storagePathFromPublicUrl(
  url: string | null | undefined,
  bucket: string,
): string | null {
  if (!url) return null;
  const marker = `/object/public/${bucket}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  try {
    return decodeURIComponent(url.slice(idx + marker.length).split("?")[0] ?? "");
  } catch {
    return url.slice(idx + marker.length).split("?")[0] ?? null;
  }
}

async function removeStoragePrefix(bucket: string, prefix: string) {
  const folder = prefix.replace(/\/+$/, "");
  if (!folder) return;
  const { data, error } = await supabase.storage.from(bucket).list(folder, {
    limit: 1000,
  });
  if (error || !data?.length) return;
  const files: string[] = [];
  const subfolders: string[] = [];
  for (const row of data) {
    if (!row.name) continue;
    const path = `${folder}/${row.name}`;
    // Supabase marks folders with null id.
    if (row.id == null) subfolders.push(path);
    else files.push(path);
  }
  if (files.length) {
    await supabase.storage.from(bucket).remove(files);
  }
  for (const sub of subfolders) {
    await removeStoragePrefix(bucket, sub);
  }
}

async function removeStorageObject(
  bucket: string,
  path: string | null | undefined,
) {
  if (!path) return;
  await supabase.storage.from(bucket).remove([path]);
}

/** Best-effort wipe of a user's media folders (avatars + chat uploads). */
export async function purgeUserStorage(userId: string) {
  if (!userId) return;
  await Promise.allSettled([
    removeStoragePrefix("avatars", userId),
    removeStoragePrefix("chat-attachments", userId),
  ]);
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

export async function completeSignup(
  name: string,
  churchName: string,
  churchId?: string | null,
) {
  const { data, error } = await supabase.rpc("complete_signup", {
    p_name: name,
    p_church_name: churchName,
    p_church_id: churchId || null,
  });
  if (error) throw asError(error, "Could not submit your ministry.");
  cacheSessionProfile(data as SessionProfile);
  return data as SessionProfile;
}

export type ChurchSuggestion = {
  id: string;
  name: string;
  status: string;
};

export async function suggestChurches(query: string) {
  const { data, error } = await supabase.rpc("suggest_churches", {
    p_query: query,
  });
  if (error) throw asError(error, "Could not load church suggestions.");
  const rows =
    typeof data === "string"
      ? (JSON.parse(data) as ChurchSuggestion[])
      : (data as ChurchSuggestion[] | null);
  return Array.isArray(rows) ? rows : [];
}

export async function listSignupRequests() {
  return listApprovalRequests();
}

export async function listApprovalRequests(options?: { fresh?: boolean }) {
  return cachedQuery(
    "approval-requests",
    async () => {
      const { data, error } = await supabase.rpc("list_approval_requests");
      if (error) throw asError(error, "Could not load requests.");
      const rows =
        typeof data === "string"
          ? (JSON.parse(data) as ApprovalRequest[])
          : (data as ApprovalRequest[] | null);
      return Array.isArray(rows) ? rows : [];
    },
    options,
  );
}

export async function reviewSignup(churchId: string, action: "approve" | "reject") {
  const { data, error } = await supabase.rpc("review_signup", {
    p_church_id: churchId,
    p_action: action,
  });
  if (error) throw asError(error, "Could not update that request.");
  const rows =
    typeof data === "string"
      ? (JSON.parse(data) as ApprovalRequest[])
      : (data as ApprovalRequest[] | null);
  const list = Array.isArray(rows) ? rows : [];
  setQueryCache("approval-requests", list);
  return list;
}

export async function reviewMemberJoin(
  userId: string,
  action: "approve" | "reject",
) {
  const { data, error } = await supabase.rpc("review_member_join", {
    p_user_id: userId,
    p_action: action,
  });
  if (error) throw asError(error, "Could not update that join request.");
  const rows =
    typeof data === "string"
      ? (JSON.parse(data) as ApprovalRequest[])
      : (data as ApprovalRequest[] | null);
  const list = Array.isArray(rows) ? rows : [];
  setQueryCache("approval-requests", list);
  // Roster may change after join approval.
  void invalidateQuery("church-team-accounts");
  return list;
}

export type ChurchTeamAccount = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  avatar_url?: string | null;
  role: AppRole;
  status: AppUserStatus;
  approval_phase?: string | null;
  church_id: string;
  church_name: string;
  created_at: string;
  updated_at?: string;
};

export async function listChurchTeamAccounts(options?: { fresh?: boolean }) {
  const key = "church-team-accounts";
  return cachedQuery(
    key,
    async () => {
      const { data, error } = await supabase.rpc("church_list_accounts");
      if (error) throw asError(error, "Could not load church accounts.");
      const rows =
        typeof data === "string"
          ? (JSON.parse(data) as ChurchTeamAccount[])
          : (data as ChurchTeamAccount[] | null);
      return Array.isArray(rows) ? rows : [];
    },
    options,
  );
}

export async function updateChurchTeamAccount(
  userId: string,
  input: {
    name?: string;
    role?: string;
    status?: string;
    phone?: string | null;
  },
) {
  const { data, error } = await supabase.rpc("church_update_account", {
    p_user_id: userId,
    p_name: input.name ?? null,
    p_role: input.role ?? null,
    p_status: input.status ?? null,
    ...(input.phone !== undefined ? { p_phone: input.phone } : {}),
  });
  if (error) throw asError(error, "Could not update account.");
  const rows =
    typeof data === "string"
      ? (JSON.parse(data) as ChurchTeamAccount[])
      : (data as ChurchTeamAccount[] | null);
  const list = Array.isArray(rows) ? rows : [];
  setQueryCache("church-team-accounts", list);
  return list;
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

export function isChurchAdmin(profile: SessionProfile) {
  return (
    profile.user?.status === "active" &&
    (profile.user.role === "admin" || profile.user.role === "superadmin")
  );
}

/** Songs / sermon / categories editors. */
export function isLibraryEditor(profile: SessionProfile) {
  const role = profile.user?.role;
  return (
    profile.user?.status === "active" &&
    (role === "superadmin" || role === "admin" || role === "producer")
  );
}

/** Create / edit / delete setlists and items (not operators). */
export function canManageSetlists(profile: SessionProfile) {
  return isLibraryEditor(profile);
}

/** Operators / members: run services, not edit library or church profile. */
export function isOperator(profile: SessionProfile) {
  return profile.user?.status === "active" && profile.user.role === "operator";
}

export async function updateMyProfile(input: {
  name?: string | null;
  avatar_url?: string | null;
}) {
  const { data, error } = await supabase.rpc("update_my_profile", {
    p_name: input.name ?? null,
    p_avatar_url: input.avatar_url ?? null,
  });
  if (error) throw asError(error, "Could not update your profile.");
  const profile = data as SessionProfile;
  cacheSessionProfile(profile);
  return profile;
}

export async function updateMyChurch(input: {
  name?: string | null;
  address?: string | null;
  phone?: string | null;
  photo_url?: string | null;
}) {
  const { data, error } = await supabase.rpc("update_my_church", {
    p_name: input.name ?? null,
    p_address: input.address ?? null,
    p_phone: input.phone ?? null,
    p_photo_url: input.photo_url ?? null,
  });
  if (error) throw asError(error, "Could not update church information.");
  const profile = data as SessionProfile;
  cacheSessionProfile(profile);
  return profile;
}

export async function uploadAvatar(
  file: File,
  userId: string,
  previousUrl?: string | null,
) {
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${userId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("avatars").upload(path, file, {
    upsert: true,
    contentType: file.type || "image/jpeg",
  });
  if (error) throw asError(error, "Could not upload photo.");
  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  const oldPath = storagePathFromPublicUrl(previousUrl, "avatars");
  if (oldPath && oldPath !== path) {
    void removeStorageObject("avatars", oldPath);
  }
  return data.publicUrl;
}

export async function uploadChurchPhoto(
  file: File,
  churchId: string,
  previousUrl?: string | null,
) {
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${churchId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from("church-photos")
    .upload(path, file, {
      upsert: true,
      contentType: file.type || "image/jpeg",
    });
  if (error) throw asError(error, "Could not upload church photo.");
  const { data } = supabase.storage.from("church-photos").getPublicUrl(path);
  const oldPath = storagePathFromPublicUrl(previousUrl, "church-photos");
  if (oldPath && oldPath !== path) {
    void removeStorageObject("church-photos", oldPath);
  }
  return data.publicUrl;
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

  const libraryPaths = ["/songs", "/sermon", "/categories"];
  if (libraryPaths.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return isLibraryEditor(profile) || isChurchAdmin(profile);
  }
  return true;
}
