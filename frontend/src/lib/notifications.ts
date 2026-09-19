import { supabase } from "./supabase";

export type NotificationKind = "chat" | "presentation" | "team" | "system";

export type AppNotification = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  icon: string | null;
  actor_id: string | null;
  actor_avatar_url: string | null;
  href: string | null;
  read_at: string | null;
  created_at: string;
};

export type NotificationPreferences = {
  user_id: string;
  enabled: boolean;
  chat: boolean;
  presentation: boolean;
  team: boolean;
  system: boolean;
  updated_at?: string;
};

function asError(error: { message?: string } | null, fallback: string) {
  return new Error(error?.message || fallback);
}

export async function getNotificationPreferences() {
  const { data, error } = await supabase.rpc("get_notification_preferences");
  if (error) throw asError(error, "Could not load notification settings.");
  return data as NotificationPreferences;
}

export async function updateNotificationPreferences(patch: {
  enabled?: boolean;
  chat?: boolean;
  presentation?: boolean;
  team?: boolean;
  system?: boolean;
}) {
  const { data, error } = await supabase.rpc("update_notification_preferences", {
    p_enabled: patch.enabled ?? null,
    p_chat: patch.chat ?? null,
    p_presentation: patch.presentation ?? null,
    p_team: patch.team ?? null,
    p_system: patch.system ?? null,
  });
  if (error) throw asError(error, "Could not update notification settings.");
  return data as NotificationPreferences;
}

export async function listMyNotifications(limit = 40) {
  const { data, error } = await supabase.rpc("list_my_notifications", {
    p_limit: limit,
  });
  if (error) throw asError(error, "Could not load notifications.");
  const rows =
    typeof data === "string"
      ? (JSON.parse(data) as AppNotification[])
      : (data as AppNotification[] | null);
  return Array.isArray(rows) ? rows : [];
}

export async function markNotificationRead(id: string) {
  const { error } = await supabase.rpc("mark_notification_read", {
    p_id: id,
  });
  if (error) throw asError(error, "Could not mark notification as read.");
}

export async function markAllNotificationsRead() {
  const { error } = await supabase.rpc("mark_all_notifications_read");
  if (error) throw asError(error, "Could not mark notifications as read.");
}

export function kindIcon(kind: NotificationKind) {
  switch (kind) {
    case "chat":
      return "chat";
    case "presentation":
      return "slideshow";
    case "team":
      return "group";
    default:
      return "notifications";
  }
}
