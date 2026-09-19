import { supabase } from "./supabase";
import { asError } from "./helpers";
import {
  cachedQuery,
  invalidateQueryPrefix,
  peekQuery,
  setQueryCache,
} from "./offline/queryCache";

export type ChatChannel = {
  id: string;
  kind: "church" | "dm";
  church_id: string | null;
  name: string;
  created_at: string;
  updated_at: string;
  last_message_at?: string | null;
  last_sender_id?: string | null;
  peer_user_id?: string | null;
  peer_name?: string | null;
  peer_avatar_url?: string | null;
  peer_role?: string | null;
  peer_church_name?: string | null;
  church_photo_url?: string | null;
};

export type ChatReactionGroup = {
  emoji: string;
  count: number;
  mine: boolean;
};

export type ChatReplyPreview = {
  id: string;
  body: string;
  sender_id: string;
  sender_name: string;
  deleted_at?: string | null;
  attachment_url?: string | null;
  attachment_name?: string | null;
  attachment_mime?: string | null;
};

export type ChatMessage = {
  id: string;
  channel_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  edited_at?: string | null;
  deleted_at?: string | null;
  attachment_url?: string | null;
  attachment_mime?: string | null;
  attachment_name?: string | null;
  reply_to_id?: string | null;
  reply_to?: ChatReplyPreview | null;
  reactions?: ChatReactionGroup[];
  pending?: boolean;
  failed?: boolean;
  sender?: {
    id: string;
    name: string;
    role: string;
    avatar_url?: string | null;
  } | null;
};

export type ChatContact = {
  id: string;
  name: string;
  email: string;
  role: string;
  church_name: string | null;
  avatar_url?: string | null;
};

export const REACTION_EMOJIS = ["👍", "❤️", "🙏", "😂", "😮", "🔥"] as const;

async function currentUserId() {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user?.id;
  if (!id) throw new Error("Sign in required.");
  return id;
}

export async function ensureChurchChat(churchId: string) {
  const { data, error } = await supabase.rpc("ensure_church_chat", {
    p_church_id: churchId,
  });
  if (error) throw asError(error, "Could not open church chat.");
  return data as string;
}

export async function openDmChannel(userId: string) {
  const { data, error } = await supabase.rpc("open_dm_channel", {
    p_user_id: userId,
  });
  if (error) throw asError(error, "Could not open direct message.");
  return data as string;
}

export async function listChatContacts() {
  const { data, error } = await supabase.rpc("list_chat_contacts");
  if (error) throw asError(error, "Could not load contacts.");
  return (data ?? []) as ChatContact[];
}

export async function listChatChannels() {
  const { data, error } = await supabase.rpc("list_chat_inbox");
  if (error) {
    const legacy = await supabase
      .from("chat_channels")
      .select("id, kind, church_id, name, created_at, updated_at")
      .order("updated_at", { ascending: false });
    if (legacy.error) throw asError(error, "Could not load chats.");
    return (legacy.data ?? []) as ChatChannel[];
  }
  return (data ?? []) as ChatChannel[];
}

async function loadReactionsForMessages(messageIds: string[]) {
  if (!messageIds.length) return new Map<string, ChatReactionGroup[]>();
  const me = (await supabase.auth.getSession()).data.session?.user?.id ?? "";

  const { data, error } = await supabase
    .from("chat_reactions")
    .select("message_id, user_id, emoji")
    .in("message_id", messageIds);
  if (error) return new Map<string, ChatReactionGroup[]>();

  const map = new Map<string, Map<string, { count: number; mine: boolean }>>();
  for (const row of data ?? []) {
    const mid = row.message_id as string;
    const emoji = row.emoji as string;
    if (!map.has(mid)) map.set(mid, new Map());
    const bucket = map.get(mid)!;
    const prev = bucket.get(emoji) ?? { count: 0, mine: false };
    bucket.set(emoji, {
      count: prev.count + 1,
      mine: prev.mine || row.user_id === me,
    });
  }

  const out = new Map<string, ChatReactionGroup[]>();
  for (const [mid, emojis] of map) {
    out.set(
      mid,
      [...emojis.entries()].map(([emoji, info]) => ({
        emoji,
        count: info.count,
        mine: info.mine,
      })),
    );
  }
  return out;
}

export const CHAT_PAGE_SIZE = 40;

export type ChatMessagePage = {
  items: ChatMessage[];
  offset: number;
  limit: number;
  hasMore: boolean;
};

function chatMessagesCacheKey(channelId: string, offset: number, limit: number) {
  return `listChatMessages:${channelId}:${offset}:${limit}`;
}

async function hydrateChatMessages(rows: ChatMessage[]): Promise<ChatMessage[]> {
  const senderIds = [...new Set(rows.map((row) => row.sender_id))];
  const reactionMap = await loadReactionsForMessages(rows.map((r) => r.id));
  const replyMap = await loadReplyPreviews(rows);

  if (!senderIds.length) {
    return rows.map((row) => ({
      ...row,
      reactions: reactionMap.get(row.id) ?? [],
      reply_to: replyMap.get(row.id) ?? null,
    }));
  }

  const { data: users, error: userError } = await supabase
    .from("users")
    .select("id, name, role, avatar_url")
    .in("id", senderIds);
  if (userError) throw asError(userError, "Could not load message authors.");

  const byId = new Map((users ?? []).map((u) => [u.id as string, u]));
  return rows.map((row) => {
    const user = byId.get(row.sender_id);
    return {
      ...row,
      reactions: reactionMap.get(row.id) ?? [],
      reply_to: replyMap.get(row.id) ?? null,
      sender: user
        ? {
            id: user.id as string,
            name: user.name as string,
            role: user.role as string,
            avatar_url: (user.avatar_url as string | null) ?? null,
          }
        : null,
    };
  });
}

async function loadReplyPreviews(rows: ChatMessage[]) {
  const out = new Map<string, ChatReplyPreview | null>();
  const needed = [
    ...new Set(
      rows
        .map((row) => row.reply_to_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  if (!needed.length) {
    for (const row of rows) out.set(row.id, null);
    return out;
  }

  const localById = new Map(rows.map((row) => [row.id, row]));
  const missing = needed.filter((id) => !localById.has(id));

  let fetched: ChatMessage[] = [];
  if (missing.length) {
    const { data, error } = await supabase
      .from("chat_messages")
      .select(
        "id, channel_id, sender_id, body, created_at, edited_at, deleted_at, attachment_url, attachment_mime, attachment_name, reply_to_id",
      )
      .in("id", missing);
    if (!error) fetched = (data ?? []) as ChatMessage[];
  }

  const parents = new Map<string, ChatMessage>();
  for (const row of rows) parents.set(row.id, row);
  for (const row of fetched) parents.set(row.id, row);

  const parentSenderIds = [
    ...new Set(
      [...parents.values()]
        .filter((row) => needed.includes(row.id))
        .map((row) => row.sender_id),
    ),
  ];
  const nameById = new Map<string, string>();
  if (parentSenderIds.length) {
    const { data: users } = await supabase
      .from("users")
      .select("id, name")
      .in("id", parentSenderIds);
    for (const user of users ?? []) {
      nameById.set(user.id as string, (user.name as string) || "Member");
    }
  }

  for (const row of rows) {
    const parentId = row.reply_to_id;
    if (!parentId) {
      out.set(row.id, null);
      continue;
    }
    const parent = parents.get(parentId);
    if (!parent) {
      out.set(row.id, {
        id: parentId,
        body: "",
        sender_id: "",
        sender_name: "Message",
        deleted_at: new Date().toISOString(),
      });
      continue;
    }
    out.set(row.id, {
      id: parent.id,
      body: parent.body ?? "",
      sender_id: parent.sender_id,
      sender_name:
        parent.sender?.name ||
        nameById.get(parent.sender_id) ||
        "Member",
      deleted_at: parent.deleted_at ?? null,
      attachment_url: parent.attachment_url ?? null,
      attachment_name: parent.attachment_name ?? null,
      attachment_mime: parent.attachment_mime ?? null,
    });
  }
  return out;
}

/** Attach reply preview for a realtime/optimistic message using known thread rows. */
export async function attachReplyPreview(
  message: ChatMessage,
  known: ChatMessage[] = [],
): Promise<ChatMessage> {
  if (!message.reply_to_id) return { ...message, reply_to: null };
  const map = await loadReplyPreviews([
    message,
    ...known.filter((row) => row.id === message.reply_to_id),
  ]);
  return { ...message, reply_to: map.get(message.id) ?? null };
}

/** Newest page first (offset 0). Higher offsets load older messages. */
export async function listChatMessages(
  channelId: string,
  options: {
    limit?: number;
    offset?: number;
    fresh?: boolean;
  } = {},
): Promise<ChatMessagePage> {
  const limit = options.limit ?? CHAT_PAGE_SIZE;
  const offset = options.offset ?? 0;
  return cachedQuery(
    chatMessagesCacheKey(channelId, offset, limit),
    async () => {
      const { data, error } = await supabase
        .from("chat_messages")
        .select(
          "id, channel_id, sender_id, body, created_at, edited_at, deleted_at, attachment_url, attachment_mime, attachment_name, reply_to_id",
        )
        .eq("channel_id", channelId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
      if (error) throw asError(error, "Could not load messages.");

      const newestFirst = (data ?? []) as ChatMessage[];
      const chronological = [...newestFirst].reverse();
      const items = await hydrateChatMessages(chronological);
      return {
        items,
        offset,
        limit,
        hasMore: newestFirst.length === limit,
      };
    },
    { fresh: options.fresh },
  );
}

export function peekChatMessages(
  channelId: string,
  offset = 0,
  limit = CHAT_PAGE_SIZE,
) {
  return peekQuery<ChatMessagePage>(chatMessagesCacheKey(channelId, offset, limit));
}

/** Keep the newest cached page in sync after send / realtime. */
export function cacheRecentChatMessages(
  channelId: string,
  messages: ChatMessage[],
  hasMore: boolean,
  limit = CHAT_PAGE_SIZE,
) {
  const recent = messages.slice(-limit);
  setQueryCache(chatMessagesCacheKey(channelId, 0, limit), {
    items: recent,
    offset: 0,
    limit,
    hasMore,
  });
}

export function invalidateChatMessages(channelId: string) {
  invalidateQueryPrefix(`listChatMessages:${channelId}:`);
}

export async function sendChatMessage(
  channelId: string,
  body: string,
  attachment?: {
    url: string;
    mime: string;
    name: string;
  } | null,
  replyToId?: string | null,
) {
  const text = body.trim();
  if (!text && !attachment?.url) throw new Error("Message is empty.");
  const userId = await currentUserId();

  const { data, error } = await supabase
    .from("chat_messages")
    .insert({
      channel_id: channelId,
      sender_id: userId,
      body: text || (attachment ? " " : ""),
      attachment_url: attachment?.url ?? null,
      attachment_mime: attachment?.mime ?? null,
      attachment_name: attachment?.name ?? null,
      reply_to_id: replyToId || null,
    })
    .select(
      "id, channel_id, sender_id, body, created_at, edited_at, deleted_at, attachment_url, attachment_mime, attachment_name, reply_to_id",
    )
    .single();
  if (error) throw asError(error, "Could not send message.");

  // Fire-and-forget bump so send does not wait on a second round-trip.
  void supabase
    .from("chat_channels")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", channelId);

  return { ...(data as ChatMessage), reactions: [], reply_to: null };
}

export async function editChatMessage(
  messageId: string,
  body: string,
  options?: {
    attachment?: { url: string; mime: string; name: string } | null;
    clearAttachment?: boolean;
  },
) {
  const { data, error } = await supabase.rpc("edit_chat_message", {
    p_message_id: messageId,
    p_body: body,
    p_attachment_url: options?.attachment?.url ?? null,
    p_attachment_mime: options?.attachment?.mime ?? null,
    p_attachment_name: options?.attachment?.name ?? null,
    p_clear_attachment: Boolean(options?.clearAttachment),
  });
  if (error) throw asError(error, "Could not edit message.");
  const row = data as ChatMessage;
  return { ...row, reactions: [] as ChatReactionGroup[] };
}

export async function uploadChatAttachment(
  file: File,
  userId: string,
  channelId: string,
) {
  const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
  const safeName = file.name.replace(/[^\w.\-()+ ]+/g, "_").slice(0, 120);
  const path = `${userId}/${channelId}/${Date.now()}-${safeName || `file.${ext}`}`;
  const { error } = await supabase.storage
    .from("chat-attachments")
    .upload(path, file, {
      upsert: false,
      contentType: file.type || "application/octet-stream",
    });
  if (error) throw asError(error, "Could not upload file.");
  const { data } = supabase.storage.from("chat-attachments").getPublicUrl(path);
  return {
    url: data.publicUrl,
    mime: file.type || "application/octet-stream",
    name: file.name,
  };
}

export async function deleteChatMessage(messageId: string) {
  const { error } = await supabase.rpc("delete_chat_message", {
    p_message_id: messageId,
  });
  if (error) throw asError(error, "Could not delete message.");
}

export async function toggleChatReaction(messageId: string, emoji: string) {
  const { data, error } = await supabase.rpc("toggle_chat_reaction", {
    p_message_id: messageId,
    p_emoji: emoji,
  });
  if (error) throw asError(error, "Could not react.");
  return normalizeReactionGroups(data);
}

/** Apply a local reaction toggle for instant UI feedback. */
export function optimisticToggleReaction(
  groups: ChatReactionGroup[] | undefined,
  emoji: string,
): ChatReactionGroup[] {
  const list = [...(groups ?? [])];
  const mineIdx = list.findIndex((row) => row.mine);
  if (mineIdx >= 0 && list[mineIdx].emoji === emoji) {
    const next = { ...list[mineIdx], count: list[mineIdx].count - 1, mine: false };
    if (next.count <= 0) list.splice(mineIdx, 1);
    else list[mineIdx] = next;
    return list;
  }
  if (mineIdx >= 0) {
    const prev = list[mineIdx];
    const reduced = { ...prev, count: prev.count - 1, mine: false };
    if (reduced.count <= 0) list.splice(mineIdx, 1);
    else list[mineIdx] = reduced;
  }
  const existing = list.findIndex((row) => row.emoji === emoji);
  if (existing >= 0) {
    list[existing] = {
      ...list[existing],
      count: list[existing].count + 1,
      mine: true,
    };
  } else {
    list.push({ emoji, count: 1, mine: true });
  }
  return list;
}

function normalizeReactionGroups(data: unknown): ChatReactionGroup[] {
  let raw: unknown = data;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => {
      const item = row as Record<string, unknown>;
      return {
        emoji: String(item.emoji ?? ""),
        count: Number(item.count ?? item.cnt ?? 0),
        mine: Boolean(item.mine),
      };
    })
    .filter((row) => row.emoji && row.count > 0);
}

export async function blockChatUser(userId: string) {
  const { error } = await supabase.rpc("block_chat_user", {
    p_user_id: userId,
  });
  if (error) throw asError(error, "Could not block user.");
}

export async function unblockChatUser(userId: string) {
  const { error } = await supabase.rpc("unblock_chat_user", {
    p_user_id: userId,
  });
  if (error) throw asError(error, "Could not unblock user.");
}

/** Clears all messages in the chat; conversation stays in the inbox. */
export async function clearChatMessages(channelId: string) {
  const { error } = await supabase.rpc("clear_chat_messages", {
    p_channel_id: channelId,
  });
  if (error) {
    // Fallback if migration not applied yet.
    const legacy = await supabase.rpc("delete_chat_for_me", {
      p_channel_id: channelId,
    });
    if (legacy.error) throw asError(error, "Could not clear chat.");
  }
  invalidateChatMessages(channelId);
}

export function subscribeChatMessages(
  channelId: string,
  onInsert: (message: ChatMessage) => void,
  onUpdate?: (message: ChatMessage) => void,
  onDelete?: (messageId: string) => void,
) {
  const topic = `chat:${channelId}:${crypto.randomUUID()}`;

  const channel = supabase
    .channel(topic)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "chat_messages",
        filter: `channel_id=eq.${channelId}`,
      },
      (payload) => {
        onInsert({ ...(payload.new as ChatMessage), reactions: [] });
      },
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "chat_messages",
        filter: `channel_id=eq.${channelId}`,
      },
      (payload) => {
        onUpdate?.(payload.new as ChatMessage);
      },
    )
    .on(
      "postgres_changes",
      {
        event: "DELETE",
        schema: "public",
        table: "chat_messages",
        filter: `channel_id=eq.${channelId}`,
      },
      (payload) => {
        const id = (payload.old as { id?: string } | null)?.id;
        if (id) onDelete?.(id);
      },
    );

  channel.subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

/** Refresh contacts when someone in the church is activated / updated. */
export function subscribeChurchRoster(
  churchId: string | null | undefined,
  onChange: () => void,
) {
  if (!churchId) return () => undefined;

  const topic = `chat-roster:${churchId}:${crypto.randomUUID()}`;
  const channel = supabase.channel(topic);

  if (churchId === "__all__") {
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "users" },
      () => onChange(),
    );
  } else {
    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "users",
        filter: `church_id=eq.${churchId}`,
      },
      () => onChange(),
    );
  }

  channel.subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
