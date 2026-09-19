import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import ConfirmDialog from "../../components/modals/ConfirmDialog";
import {
  CHAT_PAGE_SIZE,
  REACTION_EMOJIS,
  blockChatUser,
  cacheRecentChatMessages,
  clearChatMessages,
  deleteChatMessage,
  editChatMessage,
  ensureChurchChat,
  listChatChannels,
  listChatContacts,
  listChatMessages,
  openDmChannel,
  optimisticToggleReaction,
  peekChatMessages,
  sendChatMessage,
  attachReplyPreview,
  subscribeChatMessages,
  subscribeChurchRoster,
  toggleChatReaction,
  uploadChatAttachment,
  type ChatChannel,
  type ChatContact,
  type ChatMessage,
} from "../../lib/chat";
import {
  getSessionProfile,
  isSuperadmin,
  type SessionProfile,
} from "../../lib/auth";
import { Skeleton } from "../../components/Skeleton";
import { usePrefs } from "../../lib/PrefsContext";
import { usePageActive } from "../../lib/PageActiveContext";
import { translate } from "../../lib/i18n";
import { openExternalUrl, splitTextLinks } from "../../lib/helpers";
import { useToast } from "../../lib/ToastContext";

const CHAT_READ_KEY = "mc.chatReadAt";

const CHAT_IMAGE_ACCEPT =
  "image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif";
const CHAT_DOC_ACCEPT =
  ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const ALLOWED_CHAT_EXT = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "gif",
  "pdf",
  "doc",
  "docx",
  "ppt",
  "pptx",
  "xls",
  "xlsx",
]);

const ALLOWED_CHAT_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

function isAllowedChatFile(file: File) {
  const mime = (file.type || "").toLowerCase();
  if (mime.startsWith("audio/") || mime.startsWith("video/")) return false;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (
    [
      "mp3",
      "mp4",
      "wav",
      "m4a",
      "aac",
      "ogg",
      "flac",
      "mov",
      "webm",
      "avi",
      "mkv",
      "mpeg",
      "mpg",
    ].includes(ext)
  ) {
    return false;
  }
  if (ALLOWED_CHAT_EXT.has(ext)) return true;
  if (mime && ALLOWED_CHAT_MIME.has(mime)) return true;
  return false;
}

function replySnippet(message: {
  body?: string | null;
  deleted_at?: string | null;
  attachment_url?: string | null;
  attachment_name?: string | null;
  attachment_mime?: string | null;
}) {
  if (message.deleted_at) return "";
  const text = (message.body ?? "").trim();
  if (text) return text;
  if (message.attachment_url) {
    if (isImageMime(message.attachment_mime)) return "Photo";
    return message.attachment_name || "Attachment";
  }
  return "";
}

function ChatMessageBody({
  text,
  mine,
}: {
  text: string;
  mine: boolean;
}) {
  const parts = splitTextLinks(text.trim());
  if (!parts.length) return null;
  return (
    <span className="whitespace-pre-wrap break-words">
      {parts.map((part, index) =>
        part.type === "link" ? (
          <button
            key={`${part.value}-${index}`}
            type="button"
            className={`underline break-all text-left cursor-pointer hover:opacity-90 ${
              mine ? "text-on-primary/95" : "text-primary"
            }`}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void openExternalUrl(part.value);
            }}
          >
            {part.value}
          </button>
        ) : (
          <span key={`t-${index}`}>{part.value}</span>
        ),
      )}
    </span>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function isImageMime(mime?: string | null) {
  return Boolean(mime?.startsWith("image/"));
}

function readChatReadMap(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(CHAT_READ_KEY) || "{}") as Record<
      string,
      string
    >;
  } catch {
    return {};
  }
}

function writeChatReadMap(map: Record<string, string>) {
  try {
    localStorage.setItem(CHAT_READ_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

function channelActivityAt(channel: ChatChannel) {
  return channel.last_message_at || channel.updated_at || channel.created_at || "";
}

function channelActivityTime(channel: ChatChannel) {
  const raw = channelActivityAt(channel);
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : 0;
}

function isChannelUnread(
  channel: ChatChannel,
  me: string,
  readMap: Record<string, string>,
  activeId: string,
) {
  if (!channel.id || channel.id === activeId) return false;
  const activity = channelActivityAt(channel);
  if (!activity) return false;
  if (channel.last_sender_id && channel.last_sender_id === me) return false;
  const readAt = readMap[channel.id];
  if (!readAt) return Boolean(channel.last_message_at);
  return new Date(activity).getTime() > new Date(readAt).getTime();
}

function Avatar({
  name,
  url,
  size = "md",
  active = false,
}: {
  name: string;
  url?: string | null;
  size?: "sm" | "md" | "lg";
  active?: boolean;
}) {
  const dim =
    size === "lg" ? "w-14 h-14 text-sm" : size === "sm" ? "w-9 h-9 text-xs" : "w-11 h-11 text-sm";
  return (
    <div
      className={`${dim} rounded-full overflow-hidden shrink-0 flex items-center justify-center font-semibold ${
        active
          ? "ring-2 ring-primary ring-offset-2 ring-offset-surface-container-low"
          : "bg-surface-container-highest"
      } ${url ? "" : "bg-surface-container-highest text-on-surface"}`}
    >
      {url ? (
        <img src={url} alt="" className="w-full h-full object-cover" />
      ) : (
        initials(name) || (
          <span className="material-symbols-outlined text-[18px] text-on-surface-variant">
            person
          </span>
        )
      )}
    </div>
  );
}

export default function Chat() {
  const toast = useToast();
  const pageActive = usePageActive();
  const [searchParams, setSearchParams] = useSearchParams();
  const { language } = usePrefs();
  // Resolve through translate() + language so labels never stick on raw keys after HMR.
  const t = (key: string, vars?: Record<string, string | number>) =>
    translate(language, key, vars);
  const [profile, setProfile] = useState<SessionProfile | null>(null);
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [contacts, setContacts] = useState<ChatContact[]>([]);
  const [activeId, setActiveId] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [threadReady, setThreadReady] = useState(true);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [openingDm, setOpeningDm] = useState(false);
  const [query, setQuery] = useState("");
  const [channelsOpen, setChannelsOpen] = useState(true);
  const [dmsOpen, setDmsOpen] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [msgMenuFor, setMsgMenuFor] = useState<string | null>(null);
  const [reactPickerFor, setReactPickerFor] = useState<string | null>(null);
  const [actionAnchor, setActionAnchor] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [lightbox, setLightbox] = useState<{
    url: string;
    name: string;
  } | null>(null);
  const [confirmDeleteChat, setConfirmDeleteChat] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [confirmDeleteMsg, setConfirmDeleteMsg] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editExistingAttachment, setEditExistingAttachment] = useState<{
    url: string;
    mime: string;
    name: string;
  } | null>(null);
  const [editClearedAttachment, setEditClearedAttachment] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const draftInputRef = useRef<HTMLTextAreaElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const stickToBottom = useRef(true);
  const skipAutoScroll = useRef(false);
  /** While opening a thread, snap instantly — never animate from top → bottom. */
  const openingThreadRef = useRef(false);
  const loadingOlderRef = useRef(false);
  const hasMoreOlderRef = useRef(false);
  const messagesRef = useRef<ChatMessage[]>([]);
  const [readMap, setReadMap] = useState<Record<string, string>>(readChatReadMap);
  const me = profile?.user?.id ?? "";
  const myAvatar = profile?.user?.avatar_url ?? null;
  const myName = profile?.user?.name || "You";
  const superadmin = profile ? isSuperadmin(profile) : false;

  const markRead = (channelId: string, at = new Date().toISOString()) => {
    if (!channelId) return;
    setReadMap((prev) => {
      const next = { ...prev, [channelId]: at };
      writeChatReadMap(next);
      return next;
    });
  };

  const touchChannel = (
    channelId: string,
    at: string,
    senderId: string | null,
  ) => {
    setChannels((prev) => {
      const next = prev.map((row) =>
        row.id === channelId
          ? {
              ...row,
              last_message_at: at,
              last_sender_id: senderId,
              updated_at: at,
            }
          : row,
      );
      return [...next].sort(
        (a, b) => channelActivityTime(b) - channelActivityTime(a),
      );
    });
  };

  const active = useMemo(
    () => channels.find((row) => row.id === activeId) ?? null,
    [channels, activeId],
  );

  const groupChannels = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = channels.filter((row) => row.kind === "church");
    if (!q) return filtered;
    return filtered.filter((row) => row.name.toLowerCase().includes(q));
  }, [channels, query]);

  const dmChannels = useMemo(() => {
    const q = query.trim().toLowerCase();
    const myId = me.trim();
    const myLabel = myName.trim().toLowerCase();
    let filtered = channels.filter((row) => {
      if (row.kind !== "dm") return false;
      const peerId = row.peer_user_id?.trim() || "";
      // Orphan / self-only DMs have no other member — hide them.
      if (!peerId) return false;
      if (myId && peerId === myId) return false;
      const label = (row.peer_name || row.name || "").trim().toLowerCase();
      // Safety: never show a DM that is labeled as the current user.
      if (myLabel && label === myLabel) return false;
      return true;
    });
    if (q) {
      filtered = filtered.filter((row) =>
        [row.name, row.peer_name ?? "", row.peer_church_name ?? ""].some((s) =>
          s.toLowerCase().includes(q),
        ),
      );
    }
    return [...filtered].sort(
      (a, b) => channelActivityTime(b) - channelActivityTime(a),
    );
  }, [channels, query, me, myName]);

  const dmPeerIds = useMemo(
    () =>
      new Set(
        channels
          .filter(
            (row) =>
              row.kind === "dm" &&
              row.peer_user_id &&
              row.peer_user_id !== me,
          )
          .map((row) => row.peer_user_id as string),
      ),
    [channels, me],
  );

  const startableContacts = useMemo(() => {
    const q = query.trim().toLowerCase();
    const myId = me.trim();
    const myLabel = myName.trim().toLowerCase();
    return contacts.filter((row) => {
      if (myId && row.id === myId) return false;
      if (myLabel && row.name.trim().toLowerCase() === myLabel) return false;
      if (dmPeerIds.has(row.id)) return false;
      if (!q) return true;
      return [row.name, row.email, row.church_name ?? ""].some((s) =>
        s.toLowerCase().includes(q),
      );
    });
  }, [contacts, query, dmPeerIds, me, myName]);

  useEffect(() => {
    if (!activeId) return;
    const current = channels.find((row) => row.id === activeId);
    if (!current || current.kind !== "dm") return;
    const peerId = current.peer_user_id?.trim() || "";
    const label = (current.peer_name || current.name || "")
      .trim()
      .toLowerCase();
    const myLabel = myName.trim().toLowerCase();
    if (
      !peerId ||
      (me && peerId === me) ||
      (myLabel && label === myLabel)
    ) {
      setActiveId("");
    }
  }, [me, myName, activeId, channels]);

  const activePeerId = active?.peer_user_id ?? null;

  const refreshInbox = async () => {
    const [nextChannels, nextContacts] = await Promise.all([
      listChatChannels(),
      listChatContacts(),
    ]);
    setChannels(
      [...nextChannels].sort(
        (a, b) => channelActivityTime(b) - channelActivityTime(a),
      ),
    );
    setContacts(nextContacts);
    return nextChannels;
  };

  const bootstrap = async () => {
    setLoading(true);
    try {
      const nextProfile = await getSessionProfile();
      setProfile(nextProfile);
      if (!isSuperadmin(nextProfile) && nextProfile.church?.id) {
        await ensureChurchChat(nextProfile.church.id);
      }
      let nextChannels = await refreshInbox();
      const deepChannel = searchParams.get("channel")?.trim() || "";
      const deepPeer = searchParams.get("peer")?.trim() || "";
      let fromLink = deepChannel
        ? nextChannels.find((row) => row.id === deepChannel)
        : null;
      if (!fromLink && deepPeer) {
        fromLink =
          nextChannels.find(
            (row) => row.kind === "dm" && row.peer_user_id === deepPeer,
          ) ?? null;
        if (!fromLink) {
          try {
            const openedId = await openDmChannel(deepPeer);
            nextChannels = await refreshInbox();
            fromLink =
              nextChannels.find((row) => row.id === openedId) ??
              ({ id: openedId } as ChatChannel);
          } catch {
            // Fall through to default selection.
          }
        }
      }
      const preferredGroup = nextChannels.find((row) => row.kind === "church");
      const preferredDm = nextChannels.find((row) => {
        if (row.kind !== "dm") return false;
        const peerId = row.peer_user_id?.trim() || "";
        if (!peerId) return false;
        const uid = nextProfile.user?.id?.trim() || "";
        if (uid && peerId === uid) return false;
        return true;
      });
      const nextActive =
        fromLink?.id ??
        preferredGroup?.id ??
        preferredDm?.id ??
        nextChannels[0]?.id ??
        "";
      setActiveId(nextActive);
      if (nextActive) {
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            next.set("channel", nextActive);
            next.delete("peer");
            return next;
          },
          { replace: true },
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open chat.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional mount bootstrap
  }, []);

  // Notification / deep-link: activate the channel (or DM peer) from the URL.
  useEffect(() => {
    if (!pageActive || loading) return;
    const deepChannel = searchParams.get("channel")?.trim() || "";
    const deepPeer = searchParams.get("peer")?.trim() || "";
    if (!deepChannel && !deepPeer) return;

    if (deepChannel) {
      if (
        channels.some((row) => row.id === deepChannel) &&
        activeId !== deepChannel
      ) {
        setActiveId(deepChannel);
      }
      return;
    }

    if (!deepPeer || !channels.length) return;
    const dm = channels.find(
      (row) => row.kind === "dm" && row.peer_user_id === deepPeer,
    );
    if (dm) {
      if (activeId !== dm.id) setActiveId(dm.id);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("channel", dm.id);
          next.delete("peer");
          return next;
        },
        { replace: true },
      );
      return;
    }

    let cancelled = false;
    void openDmChannel(deepPeer)
      .then(async (openedId) => {
        if (cancelled) return;
        await refreshInbox();
        if (cancelled) return;
        setActiveId(openedId);
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            next.set("channel", openedId);
            next.delete("peer");
            return next;
          },
          { replace: true },
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [pageActive, searchParams, loading, channels, activeId, setSearchParams]);

  const selectChannel = (channelId: string) => {
    if (!channelId || channelId === activeId) return;
    setActiveId(channelId);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("channel", channelId);
        next.delete("peer");
        return next;
      },
      { replace: true },
    );
  };

  const clearPendingAttachment = () => {
    setPendingFile(null);
    setPendingPreview((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return null;
    });
  };

  useEffect(() => {
    const churchId = profile?.church?.id ?? null;
    // Superadmin: listen to all user changes; members: own church only.
    const stop = subscribeChurchRoster(
      superadmin ? "__all__" : churchId,
      () => {
        void listChatContacts()
          .then(setContacts)
          .catch(() => undefined);
      },
    );
    return () => stop();
  }, [profile?.church?.id, superadmin]);

  useEffect(() => {
    setMenuOpen(false);
    setMsgMenuFor(null);
    setReactPickerFor(null);
    setActionAnchor(null);
    clearPendingAttachment();
  }, [activeId]);

  useEffect(() => {
    if (!activeId) return;
    markRead(activeId);
  }, [activeId]);

  useEffect(() => {
    if (!msgMenuFor && !reactPickerFor) return;
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-msg-actions]")) return;
      setMsgMenuFor(null);
      setReactPickerFor(null);
      setActionAnchor(null);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [msgMenuFor, reactPickerFor]);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLightbox(null);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [lightbox]);

  useEffect(() => {
    return () => {
      if (pendingPreview?.startsWith("blob:")) URL.revokeObjectURL(pendingPreview);
    };
  }, [pendingPreview]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    hasMoreOlderRef.current = hasMoreOlder;
  }, [hasMoreOlder]);

  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      setHasMoreOlder(false);
      setLoadingMessages(false);
      openingThreadRef.current = false;
      setThreadReady(true);
      return;
    }

    let cancelled = false;
    let stop: (() => void) | undefined;
    stickToBottom.current = true;
    openingThreadRef.current = true;

    const snapBottomNow = () => {
      const el = listRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    };

    const revealThread = () => {
      if (cancelled) return;
      snapBottomNow();
      setThreadReady(true);
      openingThreadRef.current = false;
    };

    // Any cached page (including empty) means we've visited — no skeleton.
    const cached = peekChatMessages(activeId, 0, CHAT_PAGE_SIZE);
    if (cached) {
      setMessages(cached.items);
      setHasMoreOlder(cached.hasMore);
      setLoadingMessages(false);
      if (cached.items.length === 0) {
        setThreadReady(true);
        openingThreadRef.current = false;
      } else {
        // Hide until snapped to latest — prevents top→bottom jump.
        setThreadReady(false);
        requestAnimationFrame(() => {
          requestAnimationFrame(revealThread);
        });
      }
    } else {
      setMessages([]);
      setLoadingMessages(true);
      setThreadReady(false);
    }

    void (async () => {
      try {
        const page = await listChatMessages(activeId, {
          limit: CHAT_PAGE_SIZE,
          offset: 0,
          fresh: true,
        });
        if (cancelled) return;
        setMessages(page.items);
        setHasMoreOlder(page.hasMore);
        cacheRecentChatMessages(activeId, page.items, page.hasMore);
        if (cancelled) return;
        stop = subscribeChatMessages(
          activeId,
          (incoming) => {
            void (async () => {
              const hydrated = await attachReplyPreview(
                incoming,
                messagesRef.current,
              );
              setMessages((prev) => {
                if (prev.some((row) => row.id === hydrated.id)) return prev;
                const withoutOptimistic = prev.filter(
                  (row) =>
                    !(
                      row.pending &&
                      row.sender_id === hydrated.sender_id &&
                      row.body.trim() === (hydrated.body ?? "").trim()
                    ),
                );
                const next = [...withoutOptimistic, hydrated];
                cacheRecentChatMessages(
                  activeId,
                  next,
                  hasMoreOlderRef.current,
                );
                return next;
              });
            })();
            touchChannel(
              activeId,
              incoming.created_at,
              incoming.sender_id,
            );
            markRead(activeId, incoming.created_at);
            stickToBottom.current = true;
          },
          (updated) => {
            setMessages((prev) => {
              const next = prev.map((row) =>
                row.id === updated.id
                  ? {
                      ...row,
                      ...updated,
                      reply_to: row.reply_to,
                      reactions: updated.deleted_at ? [] : row.reactions,
                      pending: false,
                    }
                  : row,
              );
              cacheRecentChatMessages(
                activeId,
                next,
                hasMoreOlderRef.current,
              );
              return next;
            });
          },
          (deletedId) => {
            setMessages((prev) => {
              const next = prev.filter((row) => row.id !== deletedId);
              cacheRecentChatMessages(
                activeId,
                next,
                hasMoreOlderRef.current,
              );
              return next;
            });
          },
        );
        requestAnimationFrame(() => {
          requestAnimationFrame(revealThread);
        });
      } catch (err) {
        if (cancelled) return;
        toast.error(
          err instanceof Error ? err.message : "Could not load messages.",
        );
        setThreadReady(true);
        openingThreadRef.current = false;
      } finally {
        if (!cancelled) setLoadingMessages(false);
      }
    })();

    return () => {
      cancelled = true;
      stop?.();
      openingThreadRef.current = false;
    };
  }, [activeId]);

  const loadOlderMessages = async () => {
    if (!activeId || loadingOlderRef.current || !hasMoreOlderRef.current) return;
    loadingOlderRef.current = true;
    setLoadingOlder(true);
    const el = listRef.current;
    const prevHeight = el?.scrollHeight ?? 0;
    const prevTop = el?.scrollTop ?? 0;
    const offset = messagesRef.current.filter(
      (row) => !row.pending && !row.id.startsWith("temp-"),
    ).length;
    try {
      const page = await listChatMessages(activeId, {
        limit: CHAT_PAGE_SIZE,
        offset,
      });
      skipAutoScroll.current = true;
      setMessages((prev) => {
        const seen = new Set(prev.map((row) => row.id));
        const older = page.items.filter((row) => !seen.has(row.id));
        return [...older, ...prev];
      });
      setHasMoreOlder(page.hasMore);
      requestAnimationFrame(() => {
        if (el) {
          el.scrollTop = el.scrollHeight - prevHeight + prevTop;
        }
        skipAutoScroll.current = false;
      });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not load older messages.",
      );
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlder(false);
    }
  };

  const onMessagesScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottom.current = distanceFromBottom < 96;
    if (el.scrollTop < 72) void loadOlderMessages();
  };

  useEffect(() => {
    if (skipAutoScroll.current) return;
    if (!stickToBottom.current) return;
    const el = listRef.current;
    if (!el) return;
    // Opening a conversation: jump to latest with no animation (avoids blank→slide).
    if (openingThreadRef.current) {
      el.scrollTop = el.scrollHeight;
      return;
    }
    // Live follow while already in the thread.
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, activeId, pendingPreview]);

  const queueAttachment = (file: File | null) => {
    if (!file) return;
    if (!isAllowedChatFile(file)) {
      toast.error(t("chat.fileTypeError"));
      return;
    }
    clearPendingAttachment();
    setPendingFile(file);
    if (file.type.startsWith("image/")) {
      setPendingPreview(URL.createObjectURL(file));
    } else {
      setPendingPreview(null);
    }
  };

  const startDm = async (contact: ChatContact) => {
    if (openingDm) return;
    if (me && contact.id === me) return;
    const existing = channels.find(
      (row) => row.kind === "dm" && row.peer_user_id === contact.id,
    );
    if (existing) {
      selectChannel(existing.id);
      return;
    }
    setOpeningDm(true);
    try {
      const id = await openDmChannel(contact.id);
      const next = await refreshInbox();
      setChannels(
        [...next].sort(
          (a, b) => channelActivityTime(b) - channelActivityTime(a),
        ),
      );
      selectChannel(id);
      touchChannel(id, new Date().toISOString(), me || null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open DM.");
    } finally {
      setOpeningDm(false);
    }
  };

  const cancelEdit = () => {
    clearPendingAttachment();
    setEditingId(null);
    setEditExistingAttachment(null);
    setEditClearedAttachment(false);
    setDraft("");
  };

  const cancelReply = () => setReplyTo(null);

  const startReply = (message: ChatMessage) => {
    if (message.deleted_at) return;
    clearPendingAttachment();
    setEditingId(null);
    setEditExistingAttachment(null);
    setEditClearedAttachment(false);
    setMsgMenuFor(null);
    setReactPickerFor(null);
    setActionAnchor(null);
    setReplyTo(message);
    requestAnimationFrame(() => draftInputRef.current?.focus());
  };

  const scrollToMessage = (messageId: string) => {
    const el = document.getElementById(`chat-msg-${messageId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightId(messageId);
    window.setTimeout(() => {
      setHighlightId((prev) => (prev === messageId ? null : prev));
    }, 1600);
  };

  useEffect(() => {
    if (!editingId && !replyTo) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (editingId) cancelEdit();
      else cancelReply();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editingId, replyTo]);

  const startEdit = (message: ChatMessage) => {
    clearPendingAttachment();
    setReplyTo(null);
    setMsgMenuFor(null);
    setReactPickerFor(null);
    setActionAnchor(null);
    setEditingId(message.id);
    setDraft((message.body ?? "").trim());
    if (message.attachment_url) {
      setEditExistingAttachment({
        url: message.attachment_url,
        mime: message.attachment_mime || "application/octet-stream",
        name: message.attachment_name || "Attachment",
      });
      setEditClearedAttachment(false);
    } else {
      setEditExistingAttachment(null);
      setEditClearedAttachment(false);
    }
  };

  const onSend = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!activeId || !me || sending) return;
    const text = draft.trim();
    const file = pendingFile;

    if (editingId) {
      const keepExisting =
        !file && !editClearedAttachment && Boolean(editExistingAttachment);
      if (!text && !file && !keepExisting) return;
      setSending(true);
      try {
        let attachment:
          | { url: string; mime: string; name: string }
          | null
          | undefined;
        if (file) {
          attachment = await uploadChatAttachment(file, me, activeId);
        }
        const updated = await editChatMessage(editingId, text, {
          attachment: attachment ?? null,
          clearAttachment: editClearedAttachment && !file,
        });
        setMessages((prev) => {
          const next = prev.map((row) =>
            row.id === editingId
              ? {
                  ...row,
                  ...updated,
                  reactions: row.reactions,
                  sender: row.sender,
                }
              : row,
          );
          cacheRecentChatMessages(activeId, next, hasMoreOlderRef.current);
          return next;
        });
        cancelEdit();
        toast.success(t("chat.editedSaved"));
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : t("chat.editError"),
        );
      } finally {
        setSending(false);
      }
      return;
    }

    if (!text && !file) return;

    const replyTarget = replyTo;
    const replyPreview = replyTarget
      ? {
          id: replyTarget.id,
          body: replyTarget.body ?? "",
          sender_id: replyTarget.sender_id,
          sender_name:
            replyTarget.sender_id === me
              ? myName
              : replyTarget.sender?.name || "Member",
          deleted_at: replyTarget.deleted_at ?? null,
          attachment_url: replyTarget.attachment_url ?? null,
          attachment_name: replyTarget.attachment_name ?? null,
          attachment_mime: replyTarget.attachment_mime ?? null,
        }
      : null;

    const tempId = `temp-${crypto.randomUUID()}`;
    const localPreview = pendingPreview;
    const optimistic: ChatMessage = {
      id: tempId,
      channel_id: activeId,
      sender_id: me,
      body: text || (file ? " " : ""),
      created_at: new Date().toISOString(),
      attachment_url: localPreview,
      attachment_mime: file?.type ?? null,
      attachment_name: file?.name ?? null,
      reply_to_id: replyTarget?.id ?? null,
      reply_to: replyPreview,
      reactions: [],
      pending: true,
      sender: {
        id: me,
        name: myName,
        role: profile?.user?.role ?? "operator",
        avatar_url: myAvatar,
      },
    };

    setDraft("");
    setPendingFile(null);
    setPendingPreview(null);
    setReplyTo(null);
    setMessages((prev) => [...prev, optimistic]);
    setSending(true);

    try {
      let attachment:
        | { url: string; mime: string; name: string }
        | null
        | undefined;
      if (file) {
        attachment = await uploadChatAttachment(file, me, activeId);
      }
      const sent = await sendChatMessage(
        activeId,
        text,
        attachment,
        replyTarget?.id ?? null,
      );
      setChannels((prev) => {
        const at = sent.created_at || new Date().toISOString();
        const next = prev.map((row) =>
          row.id === activeId
            ? {
                ...row,
                updated_at: at,
                last_message_at: at,
                last_sender_id: me,
              }
            : row,
        );
        return [...next].sort(
          (a, b) => channelActivityTime(b) - channelActivityTime(a),
        );
      });
      markRead(activeId, sent.created_at);
      stickToBottom.current = true;
      setMessages((prev) => {
        const withoutTemp = prev.filter((row) => row.id !== tempId);
        if (withoutTemp.some((row) => row.id === sent.id)) {
          cacheRecentChatMessages(activeId, withoutTemp, hasMoreOlderRef.current);
          return withoutTemp;
        }
        const next = [
          ...withoutTemp,
          {
            ...sent,
            reply_to: replyPreview ?? sent.reply_to ?? null,
            sender: {
              id: me,
              name: myName,
              role: profile?.user?.role ?? "operator",
              avatar_url: myAvatar,
            },
          },
        ];
        cacheRecentChatMessages(activeId, next, hasMoreOlderRef.current);
        return next;
      });
    } catch (err) {
      setMessages((prev) =>
        prev.map((row) =>
          row.id === tempId ? { ...row, pending: false, failed: true } : row,
        ),
      );
      toast.error(err instanceof Error ? err.message : "Could not send.");
    } finally {
      setSending(false);
      if (localPreview?.startsWith("blob:")) URL.revokeObjectURL(localPreview);
    }
  };

  const onReact = async (messageId: string, emoji: string) => {
    setReactPickerFor(null);
    setMsgMenuFor(null);
    let previous: ChatMessage["reactions"];
    setMessages((prev) =>
      prev.map((row) => {
        if (row.id !== messageId) return row;
        previous = row.reactions;
        return {
          ...row,
          reactions: optimisticToggleReaction(row.reactions, emoji),
        };
      }),
    );
    try {
      const groups = await toggleChatReaction(messageId, emoji);
      setMessages((prev) =>
        prev.map((row) =>
          row.id === messageId ? { ...row, reactions: groups } : row,
        ),
      );
    } catch (err) {
      setMessages((prev) =>
        prev.map((row) =>
          row.id === messageId ? { ...row, reactions: previous } : row,
        ),
      );
      toast.error(err instanceof Error ? err.message : "Could not react.");
    }
  };

  const onDeleteMessage = async () => {
    if (!confirmDeleteMsg) return;
    const id = confirmDeleteMsg;
    setConfirmDeleteMsg(null);
    try {
      await deleteChatMessage(id);
      setMessages((prev) =>
        prev.map((row) =>
          row.id === id
            ? {
                ...row,
                deleted_at: new Date().toISOString(),
                body: "",
                attachment_url: null,
                attachment_mime: null,
                attachment_name: null,
                reactions: [],
              }
            : row,
        ),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete.");
    }
  };

  const onDeleteChat = async () => {
    if (!activeId) return;
    try {
      await clearChatMessages(activeId);
      setConfirmDeleteChat(false);
      setHasMoreOlder(false);
      setMessages([]);
      cacheRecentChatMessages(activeId, [], false);
      const clearedAt = new Date().toISOString();
      touchChannel(activeId, clearedAt, me || null);
      toast.success("Messages cleared.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not clear chat.");
    }
  };

  const onBlockUser = async () => {
    if (!activePeerId) return;
    try {
      await blockChatUser(activePeerId);
      setConfirmBlock(false);
      setActiveId("");
      await refreshInbox();
      toast.success("User blocked.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not block.");
    }
  };

  useEffect(() => {
    cancelEdit();
    cancelReply();
    // Reset composer when switching conversations.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  if (loading) {
    return (
      <main className="h-full flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
      </main>
    );
  }

  const headerName =
    active?.kind === "church"
      ? active.name
      : active?.peer_name || active?.name || "Conversation";
  const headerAvatar =
    active?.kind === "dm"
      ? active.peer_avatar_url
      : active?.church_photo_url ?? null;
  const canSend = Boolean(
    draft.trim() ||
      pendingFile ||
      (editingId && editExistingAttachment && !editClearedAttachment),
  );

  return (
    <main className="h-full overflow-hidden flex flex-col p-4 sm:p-6 gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-surface-container-high flex items-center justify-center text-primary">
            <span className="material-symbols-outlined text-[22px]">forum</span>
          </div>
          <div className="min-w-0">
            <h1 className="text-[clamp(1.4rem,2.5vw,1.75rem)] font-semibold tracking-tight text-on-surface">
              {t("chat.title")}
            </h1>
            <p className="text-sm text-on-surface-variant truncate mt-2">
              {superadmin
                ? t("chat.subtitle")
                : t("chat.subtitleChurch", {
                    church: profile?.church?.name ?? "Church",
                  })}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-0 flex-1">
        <section className="lg:col-span-4 flex flex-col rounded-xl bg-surface-container-low overflow-hidden border border-white/5 min-h-[320px]">
          <div className="p-3 border-b border-white/5">
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant">
                search
              </span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-surface-container-lowest border border-white/10 text-sm outline-none focus:border-primary/40"
                placeholder={t("chat.findPlaceholder")}
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4 custom-scrollbar">
            <div>
              <button
                type="button"
                onClick={() => setChannelsOpen((v) => !v)}
                className="w-full flex items-center gap-1 px-2 py-1.5 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant hover:text-on-surface"
              >
                <span
                  className={`material-symbols-outlined text-[16px] transition-transform ${
                    channelsOpen ? "rotate-0" : "-rotate-90"
                  }`}
                >
                  expand_more
                </span>
                {t("chat.channels")}
              </button>
              {channelsOpen ? (
                <div className="mt-1 space-y-0.5">
                  {groupChannels.map((channel) => {
                    const selected = channel.id === activeId;
                    return (
                      <button
                        key={channel.id}
                        type="button"
                        onClick={() => selectChannel(channel.id)}
                        className={`w-full text-left flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-colors ${
                          selected
                            ? "bg-surface-container-high text-on-surface"
                            : "text-on-surface-variant hover:bg-white/5 hover:text-on-surface"
                        }`}
                      >
                        {channel.church_photo_url ? (
                          <img
                            src={channel.church_photo_url}
                            alt=""
                            className="w-8 h-8 rounded-lg object-cover shrink-0"
                          />
                        ) : (
                          <span
                            className={`material-symbols-outlined text-[18px] shrink-0 ${
                              selected ? "text-primary" : ""
                            }`}
                          >
                            tag
                          </span>
                        )}
                        <span className="text-sm font-medium truncate">
                          {channel.name}
                        </span>
                      </button>
                    );
                  })}
                  {!groupChannels.length ? (
                    <p className="px-2.5 py-2 text-xs text-on-surface-variant">
                      {t("chat.noChannels")}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div>
              <button
                type="button"
                onClick={() => setDmsOpen((v) => !v)}
                className="w-full flex items-center gap-1 px-2 py-1.5 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant hover:text-on-surface"
              >
                <span
                  className={`material-symbols-outlined text-[16px] transition-transform ${
                    dmsOpen ? "rotate-0" : "-rotate-90"
                  }`}
                >
                  expand_more
                </span>
                {t("chat.directMessages")}
              </button>
              {dmsOpen ? (
                <div className="mt-1 space-y-0.5">
                  {dmChannels.length ? (
                    <p className="px-2.5 pt-1 pb-1 text-[10px] uppercase tracking-widest text-on-surface-variant/70">
                      Recent
                    </p>
                  ) : null}
                  {dmChannels.map((channel) => {
                    const label = channel.peer_name || channel.name;
                    const selected = channel.id === activeId;
                    const unread = isChannelUnread(
                      channel,
                      me,
                      readMap,
                      activeId,
                    );
                    return (
                      <button
                        key={channel.id}
                        type="button"
                        onClick={() => selectChannel(channel.id)}
                        className={`w-full text-left flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-colors ${
                          selected
                            ? "bg-surface-container-high text-on-surface"
                            : "text-on-surface-variant hover:bg-white/5 hover:text-on-surface"
                        }`}
                      >
                        <Avatar
                          name={label}
                          url={channel.peer_avatar_url}
                          size="sm"
                          active={selected}
                        />
                        <div className="min-w-0 flex-1">
                          <p
                            className={`text-sm truncate ${
                              unread
                                ? "font-bold text-on-surface"
                                : "font-medium"
                            }`}
                          >
                            {label}
                          </p>
                          {channel.peer_church_name ? (
                            <p
                              className={`text-[11px] truncate ${
                                unread
                                  ? "text-on-surface/70 font-semibold"
                                  : "text-on-surface-variant/80"
                              }`}
                            >
                              {channel.peer_church_name}
                            </p>
                          ) : null}
                        </div>
                      </button>
                    );
                  })}

                  {startableContacts.length ? (
                    <>
                      <p className="px-2.5 pt-3 pb-1 text-[10px] uppercase tracking-widest text-on-surface-variant/70">
                        {superadmin ? "People" : "Church members"}
                      </p>
                      {startableContacts.map((contact) => (
                        <button
                          key={contact.id}
                          type="button"
                          disabled={openingDm}
                          onClick={() => void startDm(contact)}
                          className="w-full text-left flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-on-surface-variant hover:bg-white/5 hover:text-on-surface disabled:opacity-60"
                          title={`Message ${contact.name}`}
                        >
                          <Avatar
                            name={contact.name}
                            url={contact.avatar_url}
                            size="sm"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">
                              {contact.name}
                            </p>
                            <p className="text-[11px] text-on-surface-variant/80 truncate">
                              {contact.church_name || "Start conversation"}
                            </p>
                          </div>
                        </button>
                      ))}
                    </>
                  ) : null}

                  {!dmChannels.length && !startableContacts.length ? (
                    <p className="px-2.5 py-2 text-xs text-on-surface-variant">
                      No direct messages yet.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <section className="lg:col-span-8 flex flex-col rounded-xl bg-surface-container-low overflow-hidden border border-white/5 min-h-[420px]">
          {active ? (
            <>
              <div className="p-4 border-b border-white/5 flex items-center gap-3">
                {active.kind === "dm" ? (
                  <Avatar name={headerName} url={headerAvatar} />
                ) : headerAvatar ? (
                  <img
                    src={headerAvatar}
                    alt=""
                    className="w-11 h-11 rounded-xl object-cover shrink-0"
                  />
                ) : (
                  <div className="w-11 h-11 rounded-full bg-surface-container-highest flex items-center justify-center text-primary shrink-0">
                    <span className="material-symbols-outlined">tag</span>
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-semibold text-on-surface truncate">
                    {headerName}
                  </h2>
                  <p className="text-xs text-on-surface-variant mt-1">
                    {active.kind === "church"
                      ? t("chat.churchGroupLive")
                      : active.peer_church_name
                        ? t("chat.privateWith", {
                            church: active.peer_church_name,
                          })
                        : t("chat.private")}
                  </p>
                </div>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setMenuOpen((v) => !v)}
                    className="w-9 h-9 rounded-lg flex items-center justify-center text-on-surface-variant hover:bg-white/5"
                    aria-label={t("chat.options")}
                  >
                    <span className="material-symbols-outlined">more_vert</span>
                  </button>
                  {menuOpen ? (
                    <div className="absolute right-0 top-10 z-20 w-52 rounded-xl border border-white/10 bg-surface-container-high shadow-xl py-1">
                      <button
                        type="button"
                        className="w-full text-left px-3 py-2.5 text-sm hover:bg-white/5 flex items-center gap-2"
                        onClick={() => {
                          setMenuOpen(false);
                          setConfirmDeleteChat(true);
                        }}
                      >
                        <span className="material-symbols-outlined text-[18px]">
                          delete
                        </span>
                        Delete messages
                      </button>
                      {active.kind === "dm" && activePeerId ? (
                        <button
                          type="button"
                          className="w-full text-left px-3 py-2.5 text-sm text-[#ffb4ab] hover:bg-white/5 flex items-center gap-2"
                          onClick={() => {
                            setMenuOpen(false);
                            setConfirmBlock(true);
                          }}
                        >
                          <span className="material-symbols-outlined text-[18px]">
                            block
                          </span>
                          Block user
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>

              <div
                ref={listRef}
                onScroll={onMessagesScroll}
                className={`flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar transition-opacity duration-150 ${
                  threadReady || loadingMessages ? "opacity-100" : "opacity-0"
                }`}
              >
                {loadingOlder ? (
                  <p className="text-center text-xs text-on-surface-variant py-1">
                    Loading older messages…
                  </p>
                ) : hasMoreOlder ? (
                  <p className="text-center text-[11px] text-on-surface-variant/70 py-1">
                    Scroll up for older messages
                  </p>
                ) : messages.length > 0 ? (
                  <p className="text-center text-[11px] text-on-surface-variant/50 py-1">
                    Beginning of conversation
                  </p>
                ) : null}

                {loadingMessages && !messages.length ? (
                  <div className="space-y-4 py-2" aria-label={t("common.loading")}>
                    {[0, 1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className={`flex items-start gap-3 ${
                          i % 2 === 0 ? "" : "justify-end"
                        }`}
                      >
                        {i % 2 === 0 ? (
                          <Skeleton className="w-8 h-8 rounded-full shrink-0" />
                        ) : null}
                        <div
                          className={`space-y-2 ${
                            i % 2 === 0 ? "items-start" : "items-end"
                          } flex flex-col max-w-[75%]`}
                        >
                          <Skeleton className="h-3 w-24 rounded" />
                          <Skeleton
                            className={`h-14 rounded-2xl ${
                              i % 3 === 0 ? "w-56" : i % 3 === 1 ? "w-40" : "w-48"
                            }`}
                          />
                        </div>
                        {i % 2 === 1 ? (
                          <Skeleton className="w-8 h-8 rounded-full shrink-0" />
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}

                {!loadingMessages && messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center text-center px-6 py-14 min-h-[240px]">
                    <Avatar
                      name={headerName}
                      url={headerAvatar}
                      size="lg"
                      active
                    />
                    <h3 className="mt-4 text-lg font-semibold text-on-surface">
                      {headerName}
                    </h3>
                    <p className="mt-2 text-sm text-on-surface-variant max-w-sm">
                      {active?.kind === "dm"
                        ? t("chat.emptyDm", { name: headerName })
                        : t("chat.emptyChannel")}
                    </p>
                  </div>
                ) : null}

                {messages.map((message) => {
                  const mine = message.sender_id === me;
                  const label = message.sender?.name ?? "Member";
                  const deleted = Boolean(message.deleted_at);
                  return (
                    <div
                      key={message.id}
                      id={`chat-msg-${message.id}`}
                      className={`flex items-start gap-3 group scroll-mt-8 rounded-2xl transition-colors duration-500 ${
                        mine ? "justify-end" : ""
                      } ${
                        highlightId === message.id
                          ? "bg-primary/10 ring-1 ring-primary/25"
                          : ""
                      }`}
                    >
                      {!mine ? (
                        <Avatar
                          name={label}
                          url={message.sender?.avatar_url}
                          size="sm"
                        />
                      ) : null}
                      <div className={`max-w-[75%] ${mine ? "items-end" : ""}`}>
                          <div className="flex items-baseline gap-2 mb-1 flex-wrap">
                          <span className="text-sm font-semibold text-on-surface">
                            {mine ? t("chat.you") : label}
                          </span>
                          <span className="text-[11px] text-on-surface-variant">
                            {formatTime(message.created_at)}
                          </span>
                        </div>
                        <div className="relative w-fit max-w-full">
                          {!deleted && message.reply_to ? (
                            <button
                              type="button"
                              onClick={() =>
                                scrollToMessage(message.reply_to!.id)
                              }
                              className={`mb-1 w-full text-left rounded-xl px-2.5 py-1.5 border-l-[3px] border-primary transition-colors duration-200 ${
                                mine
                                  ? "bg-primary/15 hover:bg-primary/25"
                                  : "bg-white/5 hover:bg-white/10"
                              }`}
                            >
                              <p className="text-[11px] font-semibold text-primary truncate">
                                {message.reply_to.sender_id === me
                                  ? t("chat.you")
                                  : message.reply_to.sender_name}
                              </p>
                              <p className="text-[11px] text-on-surface-variant truncate">
                                {message.reply_to.deleted_at
                                  ? t("chat.replyDeleted")
                                  : replySnippet(message.reply_to) ||
                                    t("chat.replyDeleted")}
                              </p>
                            </button>
                          ) : null}
                          <div
                            className={`p-3 rounded-2xl text-sm leading-relaxed ${
                              deleted
                                ? "italic opacity-60 bg-surface-container text-on-surface-variant"
                                : mine
                                  ? "rounded-tr-sm bg-primary text-on-primary"
                                  : "rounded-tl-sm bg-surface-container text-on-surface"
                            } ${message.pending ? "opacity-70" : ""} ${
                              message.failed ? "ring-1 ring-[#ffb4ab]" : ""
                            }`}
                          >
                            {deleted ? (
                              "Message deleted"
                            ) : (
                              <>
                                {message.attachment_url &&
                                isImageMime(message.attachment_mime) ? (
                                  <button
                                    type="button"
                                    className="block mb-2 text-left w-full"
                                    onClick={() =>
                                      setLightbox({
                                        url: message.attachment_url!,
                                        name:
                                          message.attachment_name || "Photo",
                                      })
                                    }
                                  >
                                    <img
                                      src={message.attachment_url}
                                      alt={message.attachment_name || "Photo"}
                                      className="max-h-56 rounded-lg object-cover cursor-zoom-in"
                                    />
                                  </button>
                                ) : null}
                                {message.attachment_url &&
                                !isImageMime(message.attachment_mime) ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void openExternalUrl(
                                        message.attachment_url!,
                                      )
                                    }
                                    className={`flex items-center gap-2 mb-2 underline text-left ${
                                      mine ? "text-on-primary" : "text-primary"
                                    }`}
                                  >
                                    <span className="material-symbols-outlined text-[18px]">
                                      attach_file
                                    </span>
                                    {message.attachment_name || t("chat.downloadFile")}
                                  </button>
                                ) : null}
                                {message.body.trim() ? (
                                  <ChatMessageBody
                                    text={message.body}
                                    mine={mine}
                                  />
                                ) : null}
                              </>
                            )}
                          </div>

                          {!deleted ? (
                            <div
                              data-msg-actions
                              className={`absolute top-0 z-20 ${
                                mine
                                  ? "-left-2 -translate-x-full"
                                  : "-right-2 translate-x-full"
                              } opacity-0 group-hover:opacity-100 focus-within:opacity-100 ${
                                msgMenuFor === message.id ||
                                reactPickerFor === message.id
                                  ? "!opacity-100"
                                  : ""
                              }`}
                            >
                              <div className="flex items-center gap-0.5 rounded-full bg-surface-container-high border border-white/10 px-1 py-1 shadow-lg">
                                <button
                                  type="button"
                                  className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center text-on-surface-variant"
                                  title={t("chat.reply")}
                                  aria-label={t("chat.reply")}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    startReply(message);
                                  }}
                                >
                                  <span className="material-symbols-outlined text-[20px]">
                                    reply
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center text-on-surface-variant"
                                  title="Add reaction"
                                  aria-label="Add reaction"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    const rect =
                                      event.currentTarget.getBoundingClientRect();
                                    setMsgMenuFor(null);
                                    if (reactPickerFor === message.id) {
                                      setReactPickerFor(null);
                                      setActionAnchor(null);
                                      return;
                                    }
                                    setReactPickerFor(message.id);
                                    setActionAnchor({
                                      top: Math.max(8, rect.top - 48),
                                      left: mine
                                        ? Math.max(8, rect.right - 220)
                                        : Math.max(8, rect.left),
                                    });
                                  }}
                                >
                                  <span className="material-symbols-outlined text-[20px]">
                                    add_reaction
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center text-on-surface-variant"
                                  title={t("chat.more")}
                                  aria-label={t("chat.messageOptions")}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    const rect =
                                      event.currentTarget.getBoundingClientRect();
                                    setReactPickerFor(null);
                                    if (msgMenuFor === message.id) {
                                      setMsgMenuFor(null);
                                      setActionAnchor(null);
                                      return;
                                    }
                                    setMsgMenuFor(message.id);
                                    setActionAnchor({
                                      top: rect.bottom + 6,
                                      left: Math.max(
                                        8,
                                        Math.min(
                                          rect.right - 168,
                                          window.innerWidth - 180,
                                        ),
                                      ),
                                    });
                                  }}
                                >
                                  <span className="material-symbols-outlined text-[20px]">
                                    more_horiz
                                  </span>
                                </button>
                              </div>
                            </div>
                          ) : null}

                          {message.reactions?.length ? (
                            <div className="relative z-10 -mt-2.5 flex flex-wrap gap-1 justify-start pl-1">
                              {message.reactions.map((reaction) => (
                                <button
                                  key={reaction.emoji}
                                  type="button"
                                  onClick={() =>
                                    void onReact(message.id, reaction.emoji)
                                  }
                                  className={`text-xs px-2 py-0.5 rounded-full border shadow-md ${
                                    mine
                                      ? "border-white/20 bg-background text-on-surface"
                                      : reaction.mine
                                        ? "border-primary/40 bg-surface-container-highest text-on-surface"
                                        : "border-white/15 bg-surface-container-highest text-on-surface"
                                  }`}
                                >
                                  {reaction.emoji} {reaction.count}
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>

                        {!deleted && message.edited_at ? (
                          <div
                            className={`mt-1 text-[11px] text-on-surface-variant italic ${
                              mine ? "text-right" : "text-left"
                            }`}
                          >
                            {t("chat.edited")}
                          </div>
                        ) : null}
                      </div>
                      {mine ? (
                        <Avatar
                          name={profile?.user?.name || "You"}
                          url={myAvatar}
                          size="sm"
                        />
                      ) : null}
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>

              <form
                onSubmit={(event) => void onSend(event)}
                className="p-4 border-t border-white/5 space-y-2"
              >
                {editingId ? (
                  <div className="flex items-center justify-between gap-2 text-xs text-primary animate-[fadeSlideIn_180ms_ease-out]">
                    <span className="inline-flex items-center gap-1.5 font-medium">
                      <span className="material-symbols-outlined text-[16px]">
                        edit
                      </span>
                      {t("chat.editing")}
                    </span>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="text-on-surface-variant hover:text-on-surface underline"
                    >
                      {t("chat.cancelEdit")}
                    </button>
                  </div>
                ) : null}
                {replyTo && !editingId ? (
                  <div className="flex items-stretch gap-2 rounded-xl border border-white/10 bg-surface-container overflow-hidden animate-[fadeSlideIn_180ms_ease-out]">
                    <div className="w-1 shrink-0 bg-primary" />
                    <div className="min-w-0 flex-1 py-2 pr-1">
                      <p className="text-xs font-semibold text-primary truncate">
                        {t("chat.replyingTo", {
                          name:
                            replyTo.sender_id === me
                              ? t("chat.you")
                              : replyTo.sender?.name || "Member",
                        })}
                      </p>
                      <p className="text-xs text-on-surface-variant truncate">
                        {replySnippet(replyTo) || t("chat.replyDeleted")}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={cancelReply}
                      className="px-3 text-on-surface-variant hover:text-on-surface"
                      aria-label={t("chat.cancelReply")}
                    >
                      <span className="material-symbols-outlined text-[18px]">
                        close
                      </span>
                    </button>
                  </div>
                ) : null}
                <input
                  ref={photoInputRef}
                  type="file"
                  accept={CHAT_IMAGE_ACCEPT}
                  className="hidden"
                  onChange={(event) => {
                    setEditClearedAttachment(false);
                    queueAttachment(event.target.files?.[0] ?? null);
                    event.target.value = "";
                  }}
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={CHAT_DOC_ACCEPT}
                  className="hidden"
                  onChange={(event) => {
                    setEditClearedAttachment(false);
                    queueAttachment(event.target.files?.[0] ?? null);
                    event.target.value = "";
                  }}
                />
                {pendingFile ? (
                  <div className="relative w-fit max-w-full rounded-xl overflow-hidden border border-white/10 bg-surface-container">
                    {pendingPreview ? (
                      <img
                        src={pendingPreview}
                        alt=""
                        className="max-h-40 max-w-[240px] object-cover block"
                      />
                    ) : (
                      <div className="flex items-center gap-2 px-3 py-2 text-sm text-on-surface">
                        <span className="material-symbols-outlined text-[18px]">
                          attach_file
                        </span>
                        <span className="truncate max-w-[200px]">
                          {pendingFile.name}
                        </span>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={clearPendingAttachment}
                      className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80"
                      title={t("chat.removeAttachment")}
                    >
                      <span className="material-symbols-outlined text-[16px]">
                        close
                      </span>
                    </button>
                  </div>
                ) : editingId &&
                  editExistingAttachment &&
                  !editClearedAttachment ? (
                  <div className="relative w-fit max-w-full rounded-xl overflow-hidden border border-white/10 bg-surface-container">
                    {isImageMime(editExistingAttachment.mime) ? (
                      <img
                        src={editExistingAttachment.url}
                        alt=""
                        className="max-h-40 max-w-[240px] object-cover block"
                      />
                    ) : (
                      <div className="flex items-center gap-2 px-3 py-2 text-sm text-on-surface">
                        <span className="material-symbols-outlined text-[18px]">
                          attach_file
                        </span>
                        <span className="truncate max-w-[200px]">
                          {editExistingAttachment.name}
                        </span>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => setEditClearedAttachment(true)}
                      className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80"
                      title={t("chat.removeAttachment")}
                    >
                      <span className="material-symbols-outlined text-[16px]">
                        close
                      </span>
                    </button>
                  </div>
                ) : null}
                <div className="rounded-2xl bg-surface-container-lowest border border-white/10 px-2 py-1.5 flex items-center gap-1.5 min-h-[52px]">
                  <button
                    type="button"
                    disabled={sending}
                    onClick={() => photoInputRef.current?.click()}
                    className="w-9 h-9 shrink-0 rounded-lg flex items-center justify-center text-on-surface-variant hover:bg-white/5 disabled:opacity-50"
                    title={t("chat.addPhoto")}
                  >
                    <span className="material-symbols-outlined text-[20px]">
                      photo_camera
                    </span>
                  </button>
                  <button
                    type="button"
                    disabled={sending}
                    onClick={() => fileInputRef.current?.click()}
                    className="w-9 h-9 shrink-0 rounded-lg flex items-center justify-center text-on-surface-variant hover:bg-white/5 disabled:opacity-50"
                    title={t("chat.addFile")}
                  >
                    <span className="material-symbols-outlined text-[20px]">
                      attach_file
                    </span>
                  </button>
                  <textarea
                    ref={draftInputRef}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void onSend();
                      }
                    }}
                    rows={1}
                    placeholder={
                      pendingFile ||
                      (editingId &&
                        editExistingAttachment &&
                        !editClearedAttachment)
                        ? t("chat.captionPlaceholder")
                        : active.kind === "church"
                          ? t("chat.messageChannel", { name: active.name })
                          : t("chat.writeMessage")
                    }
                    className="flex-1 min-w-0 bg-transparent resize-none outline-none px-2 py-2 text-sm leading-5 max-h-28 overflow-y-auto"
                  />
                  <button
                    type="submit"
                    disabled={sending || !canSend}
                    className="shrink-0 h-9 px-4 rounded-xl bg-primary text-on-primary text-sm font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-2"
                  >
                    {editingId ? t("chat.saveEdit") : t("chat.send")}
                    <span className="material-symbols-outlined text-[16px]">
                      {editingId ? "check" : "send"}
                    </span>
                  </button>
                </div>
              </form>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-on-surface-variant text-sm p-8 text-center">
              Pick a church member for a private chat, or open the group channel.
            </div>
          )}
        </section>
      </div>

      {reactPickerFor && actionAnchor
        ? createPortal(
            <div
              data-msg-actions
              className="fixed z-[130] flex items-center gap-0.5 rounded-full bg-surface-container-highest border border-white/10 px-1.5 py-1 shadow-xl"
              style={{ top: actionAnchor.top, left: actionAnchor.left }}
            >
              {REACTION_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className="text-[15px] leading-none w-7 h-7 rounded-full hover:bg-white/10 hover:scale-110 transition-transform"
                  title={`React ${emoji}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    const messageId = reactPickerFor;
                    setReactPickerFor(null);
                    setActionAnchor(null);
                    void onReact(messageId, emoji);
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}

      {msgMenuFor && actionAnchor
        ? createPortal(
            <div
              data-msg-actions
              className="fixed z-[130] min-w-[168px] rounded-xl border border-white/10 bg-surface-container-highest shadow-xl py-1"
              style={{ top: actionAnchor.top, left: actionAnchor.left }}
            >
              <button
                type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-white/5 flex items-center gap-2"
                onClick={(event) => {
                  event.stopPropagation();
                  const message = messages.find((row) => row.id === msgMenuFor);
                  setMsgMenuFor(null);
                  setActionAnchor(null);
                  if (message) startReply(message);
                }}
              >
                <span className="material-symbols-outlined text-[18px]">
                  reply
                </span>
                {t("chat.reply")}
              </button>
              {messages.find((row) => row.id === msgMenuFor)?.sender_id ===
              me ? (
                <button
                  type="button"
                  className="w-full text-left px-3 py-2 text-sm hover:bg-white/5 flex items-center gap-2"
                  onClick={(event) => {
                    event.stopPropagation();
                    const message = messages.find(
                      (row) => row.id === msgMenuFor,
                    );
                    setMsgMenuFor(null);
                    setActionAnchor(null);
                    if (message) startEdit(message);
                  }}
                >
                  <span className="material-symbols-outlined text-[18px]">
                    edit
                  </span>
                  {t("chat.edit")}
                </button>
              ) : null}
              {messages.find((row) => row.id === msgMenuFor)?.sender_id ===
              me ? (
                <button
                  type="button"
                  className="w-full text-left px-3 py-2 text-sm text-[#ffb4ab] hover:bg-white/5 flex items-center gap-2"
                  onClick={(event) => {
                    event.stopPropagation();
                    const messageId = msgMenuFor;
                    setMsgMenuFor(null);
                    setActionAnchor(null);
                    setConfirmDeleteMsg(messageId);
                  }}
                >
                  <span className="material-symbols-outlined text-[18px]">
                    delete
                  </span>
                  {t("chat.delete")}
                </button>
              ) : null}
            </div>,
            document.body,
          )
        : null}

      <ConfirmDialog
        open={confirmDeleteChat}
        onClose={() => setConfirmDeleteChat(false)}
        onConfirm={() => onDeleteChat()}
        title="Delete all messages?"
        description="Clears every message in this conversation. The chat stays in your sidebar so you can keep talking."
        confirmLabel="Delete messages"
      />
      <ConfirmDialog
        open={confirmBlock}
        onClose={() => setConfirmBlock(false)}
        onConfirm={() => onBlockUser()}
        title="Block this user?"
        description={`You won’t be able to message ${active?.peer_name || "this person"} until you unblock them.`}
        confirmLabel="Block"
      />
      <ConfirmDialog
        open={Boolean(confirmDeleteMsg)}
        onClose={() => setConfirmDeleteMsg(null)}
        onConfirm={() => onDeleteMessage()}
        title="Delete message?"
        description="This message will be removed for everyone in the chat."
        confirmLabel="Delete"
      />

      {lightbox
        ? createPortal(
            <div
              className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-8"
              role="dialog"
              aria-modal="true"
              aria-label={lightbox.name}
            >
              <button
                type="button"
                className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                aria-label="Close image"
                onClick={() => setLightbox(null)}
              />
              <div className="relative z-10 max-w-5xl max-h-full w-full flex flex-col items-center gap-3">
                <button
                  type="button"
                  onClick={() => setLightbox(null)}
                  className="absolute -top-1 right-0 sm:-top-2 sm:-right-2 w-10 h-10 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80"
                  aria-label="Close"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
                <img
                  src={lightbox.url}
                  alt={lightbox.name}
                  className="max-h-[min(85vh,900px)] max-w-full rounded-xl object-contain shadow-2xl"
                />
                <p className="text-sm text-white/80 truncate max-w-full">
                  {lightbox.name}
                </p>
              </div>
            </div>,
            document.body,
          )
        : null}
    </main>
  );
}
