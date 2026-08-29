import {
  fetchBibleChapter,
  formatBibleReference,
  isFreeBibleTranslation,
  joinChapterText,
  joinVerseText,
  parseBibleReference,
  versesForRange,
  type FreeBibleTranslation,
} from "./bible";
import {
  asError,
  formatDuration,
  formatSectionLabel,
  isSermonSpace,
  pageMeta,
  requireChurchId,
  requireUserId,
  sermonDisplayLines,
  splitLyricLines,
} from "./helpers";
import { formatRosterDate, normalizeRoster, type RosterPayload } from "./roster";
import { sermonPlainText } from "./sermonMarkup";
import { asStageBackground } from "./stageBackgrounds";
import { PAGE_SIZE } from "./types";
import { categoryTone, presetForCategoryName } from "./categoryColor";
import { getSessionProfile, isSuperadmin, readCachedSessionProfile } from "./auth";
import { recordAuditEvent } from "./admin";
import type {
  BibleVersion,
  Category,
  ChurchSettings,
  DashboardStats,
  Language,
  LiveCue,
  MediaAsset,
  OutputDisplay,
  Page,
  Presentation,
  ScripturePassage,
  Sermon,
  SermonInput,
  Setlist,
  SetlistInput,
  SetlistItem,
  SetlistItemType,
  Song,
  SongInput,
  SongLyricSection,
  SermonNote,
  SermonSlide,
} from "./types";
import { supabase } from "./supabase";
import { publishPresentation, subscribeLocalPresentation } from "./offline/live";
import { newId, nowIso } from "./offline/status";
import { ensureHydrated, setBackupFrequency } from "./offline/sync";
import {
  getRow,
  listRows,
  putRow,
  removeRow,
  replaceChildren,
  type LocalRow,
} from "./offline/store";

async function ready() {
  const churchId = await requireChurchId();
  await ensureHydrated(churchId);
  return churchId;
}

const VIEW_CHURCH_KEY = "mc.setlistViewChurchId";

export type ChurchName = { id: string; name: string };

export function readSetlistViewChurchId() {
  try {
    return localStorage.getItem(VIEW_CHURCH_KEY) || "";
  } catch {
    return "";
  }
}

export function writeSetlistViewChurchId(id: string) {
  try {
    if (id) localStorage.setItem(VIEW_CHURCH_KEY, id);
    else localStorage.removeItem(VIEW_CHURCH_KEY);
  } catch {
    /* ignore */
  }
}

export async function listChurchNames(): Promise<ChurchName[]> {
  const { data, error } = await supabase.rpc("list_church_names");
  if (error) throw asError(error, "Could not load churches.");
  return (data ?? []) as ChurchName[];
}

async function shareChurchIdsFor(
  workspaceId: string,
  table: "setlist_shares" | "sermon_shares",
  parentColumn: "setlist_id" | "sermon_id",
  parentId: string,
  homeChurchId: string,
) {
  const shares = await listRows<{
    id: string;
    setlist_id?: string;
    sermon_id?: string;
    church_id: string;
  }>(workspaceId, table);
  return [
    ...new Set([
      homeChurchId,
      ...shares
        .filter((row) => row[parentColumn] === parentId)
        .map((row) => row.church_id),
    ]),
  ].filter(Boolean);
}

async function replaceAssignmentShares(
  workspaceId: string,
  table: "setlist_shares" | "sermon_shares",
  parentColumn: "setlist_id" | "sermon_id",
  parentId: string,
  churchIds: string[],
  homeChurchId: string,
  label: string,
  entityType: string,
) {
  const unique = [...new Set(churchIds.filter(Boolean))];
  const now = stamp();
  await replaceChildren(
    workspaceId,
    table,
    parentColumn,
    parentId,
    unique.map((churchId) => ({
      id: newId(),
      [parentColumn]: parentId,
      church_id: churchId,
      created_at: now,
    })),
  );
  void recordAuditEvent({
    action: `${entityType}.share`,
    summary: `Shared ${label} with ${unique.length} ${
      unique.length === 1 ? "church" : "churches"
    }`,
    churchId: homeChurchId,
    entityType,
    entityId: parentId,
    metadata: { church_ids: unique },
  });
}

async function rowsForChurch<T extends { id: string; church_id: string }>(
  workspaceId: string,
  rows: T[],
  shareTable: "setlist_shares" | "sermon_shares",
  parentColumn: "setlist_id" | "sermon_id",
  viewChurchId: string | null,
  asSuperadmin: boolean,
) {
  if (asSuperadmin) {
    if (!viewChurchId) return [];
    const shares = await listRows<{
      id: string;
      setlist_id?: string;
      sermon_id?: string;
      church_id: string;
    }>(workspaceId, shareTable);
    const shared = new Set(
      shares
        .filter((row) => row.church_id === viewChurchId)
        .map((row) => String(row[parentColumn] ?? "")),
    );
    return rows.filter((row) => row.church_id === viewChurchId || shared.has(row.id));
  }
  const shares = await listRows<{
    id: string;
    setlist_id?: string;
    sermon_id?: string;
    church_id: string;
  }>(workspaceId, shareTable);
  const shared = new Set(
    shares
      .filter((row) => row.church_id === workspaceId)
      .map((row) => String(row[parentColumn] ?? "")),
  );
  return rows.filter((row) => row.church_id === workspaceId || shared.has(row.id));
}

async function setlistShareChurchIds(
  workspaceId: string,
  setlistId: string,
  homeChurchId: string,
) {
  return shareChurchIdsFor(
    workspaceId,
    "setlist_shares",
    "setlist_id",
    setlistId,
    homeChurchId,
  );
}

async function replaceSetlistShares(
  workspaceId: string,
  setlistId: string,
  churchIds: string[],
  homeChurchId: string,
  setlistName: string,
) {
  await replaceAssignmentShares(
    workspaceId,
    "setlist_shares",
    "setlist_id",
    setlistId,
    churchIds,
    homeChurchId,
    `setlist “${setlistName}”`,
    "setlists",
  );
}

function stamp() {
  return nowIso();
}

function sortBy<T>(rows: T[], key: keyof T, direction: "asc" | "desc" = "asc") {
  return [...rows].sort((a, b) => {
    const left = a[key];
    const right = b[key];
    if (left == null && right == null) return 0;
    if (left == null) return 1;
    if (right == null) return -1;
    if (left < right) return direction === "asc" ? -1 : 1;
    if (left > right) return direction === "asc" ? 1 : -1;
    return 0;
  });
}

function matchesQuery(
  row: Record<string, unknown>,
  query: string,
  fields: string[],
  extra: string[] = [],
) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  if (
    fields.some((field) =>
      String(row[field] ?? "")
        .toLowerCase()
        .includes(needle),
    )
  ) {
    return true;
  }
  return extra.some((value) => value.toLowerCase().includes(needle));
}

function paginate<T>(rows: T[], offset: number, limit: number): Page<T> {
  return pageMeta(rows.slice(offset, offset + limit), rows.length, offset, limit);
}

async function hydrateSong(churchId: string, song: Song): Promise<Song> {
  const [categories, languages, lyrics] = await Promise.all([
    listRows<Category>(churchId, "categories"),
    listRows<Language>(churchId, "languages"),
    listRows<SongLyricSection>(churchId, "song_lyric_sections"),
  ]);
  return sortLyricSections({
    ...song,
    category: categories.find((row) => row.id === song.category_id) ?? null,
    language: languages.find((row) => row.id === song.language_id) ?? null,
    lyric_sections: lyrics.filter((row) => row.song_id === song.id),
  });
}

async function hydrateSermon(churchId: string, sermon: Sermon): Promise<Sermon> {
  const [slides, notes] = await Promise.all([
    listRows<SermonSlide>(churchId, "sermon_slides"),
    listRows<SermonNote>(churchId, "sermon_notes"),
  ]);
  return sortSermon({
    ...sermon,
    slides: slides.filter((row) => row.sermon_id === sermon.id),
    notes: notes.filter((row) => row.sermon_id === sermon.id),
  });
}

async function hydrateSetlistItem(churchId: string, item: SetlistItem): Promise<SetlistItem> {
  const next = { ...item };
  if (item.song_id) {
    const song = await getRow<Song>(churchId, "songs", item.song_id);
    next.song = song ? await hydrateSong(churchId, song) : null;
  }
  if (item.sermon_id) {
    const sermon = await getRow<Sermon>(churchId, "sermons", item.sermon_id);
    next.sermon = sermon ? await hydrateSermon(churchId, sermon) : null;
  }
  if (item.passage_id) {
    next.passage = await getRow<ScripturePassage>(
      churchId,
      "scripture_passages",
      item.passage_id,
    );
  }
  if (item.media_asset_id) {
    next.media = await getRow<MediaAsset>(churchId, "media_assets", item.media_asset_id);
  }
  return next;
}

export async function listCategories(): Promise<Category[]> {
  const churchId = await ready();
  let categories = await listRows<Category>(churchId, "categories");
  let restyled = false;
  const legacy = new Set(["primary", "secondary", "tertiary", "error", "accent"]);
  for (const row of categories) {
    const preset = presetForCategoryName(row.name);
    if (!preset) continue;
    const stillLegacy = !row.color || legacy.has(row.color);
    if (!stillLegacy) continue;
    if (row.icon === preset.icon && categoryTone(row.color) === preset.color) {
      continue;
    }
    await updateCategory(row.id, {
      name: row.name,
      description: row.description ?? "",
      icon: preset.icon,
      color: preset.color,
    });
    restyled = true;
  }
  if (restyled) {
    categories = await listRows<Category>(churchId, "categories");
  }
  const songs = await listRows<Song>(churchId, "songs");
  const counts = new Map<string, number>();
  for (const song of songs) {
    if (!song.category_id) continue;
    counts.set(song.category_id, (counts.get(song.category_id) ?? 0) + 1);
  }
  return sortBy(categories, "sort_order").map((row) => ({
    ...row,
    song_count: counts.get(row.id) ?? 0,
  }));
}

export async function createCategory(input: {
  name: string;
  description?: string;
  icon?: string;
  color?: string;
}) {
  const churchId = await ready();
  const categories = await listRows<Category>(churchId, "categories");
  const last = sortBy(categories, "sort_order", "desc")[0];
  const now = stamp();
  const row: Category = {
    id: newId(),
    church_id: churchId,
    name: input.name.trim(),
    description: input.description?.trim() || null,
    icon: input.icon || "campaign",
    color: input.color || "sky",
    sort_order: (last?.sort_order ?? -1) + 1,
    created_at: now,
    updated_at: now,
  };
  await putRow(churchId, "categories", row as LocalRow, { localOnly: true });
  return row;
}

export async function updateCategory(
  id: string,
  input: {
    name: string;
    description?: string;
    icon?: string;
    color?: string;
  },
) {
  const churchId = await ready();
  const existing = await getRow<Category>(churchId, "categories", id);
  if (!existing) throw new Error("Could not update category.");
  const row: Category = {
    ...existing,
    name: input.name.trim(),
    description: input.description?.trim() || null,
    icon: input.icon || "campaign",
    color: input.color || "sky",
    updated_at: stamp(),
  };
  await putRow(churchId, "categories", row as LocalRow);
  return row;
}

export async function deleteCategory(id: string) {
  const churchId = await ready();
  await removeRow(churchId, "categories", id);
}

export async function listLanguages(): Promise<Language[]> {
  const churchId = await ready();
  return sortBy(await listRows<Language>(churchId, "languages"), "name");
}

export async function listSongs(
  options: {
    query?: string;
    categoryId?: string | null;
    languageId?: string | null;
    offset?: number;
    limit?: number;
  } = {},
): Promise<Page<Song>> {
  const churchId = await ready();
  const offset = options.offset ?? 0;
  const limit = options.limit ?? PAGE_SIZE;
  let songs = await listRows<Song>(churchId, "songs");
  if (options.categoryId) {
    songs = songs.filter((row) => row.category_id === options.categoryId);
  }
  if (options.languageId) {
    songs = songs.filter((row) => row.language_id === options.languageId);
  }
  if (options.query?.trim()) {
    const [lyrics, categories] = await Promise.all([
      listRows<SongLyricSection>(churchId, "song_lyric_sections"),
      listRows<Category>(churchId, "categories"),
    ]);
    songs = songs.filter((row) => {
      const category = categories.find((cat) => cat.id === row.category_id);
      const lyricText = lyrics
        .filter((block) => block.song_id === row.id)
        .map((block) => `${block.section} ${block.content}`)
        .join(" ");
      return matchesQuery(row, options.query ?? "", ["title", "artist", "musical_key"], [
        category?.name ?? "",
        lyricText,
      ]);
    });
  }
  const sorted = sortBy(songs, "title");
  const page = paginate(sorted, offset, limit);
  return {
    ...page,
    items: await Promise.all(page.items.map((song) => hydrateSong(churchId, song))),
  };
}

export async function getSong(id: string) {
  const churchId = await ready();
  const song = await getRow<Song>(churchId, "songs", id);
  if (!song) throw asError(null, "Could not load that song.");
  return hydrateSong(churchId, song);
}

async function replaceLyricSections(
  churchId: string,
  songId: string,
  lyrics: { section: string; content: string }[],
) {
  const now = stamp();
  const rows = lyrics.map((block, index) => ({
    id: newId(),
    song_id: songId,
    section: block.section,
    content: block.content,
    sort_order: index,
    created_at: now,
    updated_at: now,
  }));
  await replaceChildren(churchId, "song_lyric_sections", "song_id", songId, rows);
}

export async function createSong(input: SongInput) {
  const churchId = await ready();
  const now = stamp();
  const row: Song = {
    id: newId(),
    church_id: churchId,
    category_id: input.category_id || null,
    language_id: input.language_id || null,
    audio_asset_id: null,
    title: input.title.trim(),
    artist: input.artist?.trim() || null,
    musical_key: input.musical_key || null,
    bpm: input.bpm ?? null,
    time_signature: input.time_signature || null,
    duration_seconds: input.duration_seconds ?? null,
    youtube_url: input.youtube_url?.trim() || null,
    last_used_at: null,
    created_at: now,
    updated_at: now,
  };
  await putRow(churchId, "songs", row as LocalRow, { localOnly: true });
  if (input.lyrics?.length) await replaceLyricSections(churchId, row.id, input.lyrics);
  return getSong(row.id);
}

export async function updateSong(id: string, input: SongInput) {
  const churchId = await ready();
  const existing = await getRow<Song>(churchId, "songs", id);
  if (!existing) throw asError(null, "Could not update song.");
  const row: Song = {
    ...existing,
    title: input.title.trim(),
    artist: input.artist?.trim() || null,
    musical_key: input.musical_key || null,
    bpm: input.bpm ?? null,
    time_signature: input.time_signature || null,
    category_id: input.category_id || null,
    language_id: input.language_id || null,
    youtube_url: input.youtube_url?.trim() || null,
    duration_seconds:
      input.duration_seconds === undefined
        ? existing.duration_seconds
        : input.duration_seconds,
    updated_at: stamp(),
  };
  await putRow(churchId, "songs", row as LocalRow);
  if (input.lyrics) await replaceLyricSections(churchId, id, input.lyrics);
  return getSong(id);
}

export async function deleteSong(id: string) {
  const churchId = await ready();
  await removeRow(churchId, "songs", id);
}

export async function listSermons(
  options: {
    query?: string;
    offset?: number;
    limit?: number;
    viewChurchId?: string | null;
  } = {},
): Promise<Page<Sermon>> {
  const churchId = await ready();
  const offset = options.offset ?? 0;
  const limit = options.limit ?? PAGE_SIZE;
  let sermons = await listRows<Sermon>(churchId, "sermons");
  const profile = readCachedSessionProfile();
  const admin = Boolean(profile && isSuperadmin(profile));
  const viewId = options.viewChurchId || (admin ? readSetlistViewChurchId() : null);
  sermons = await rowsForChurch(
    churchId,
    sermons,
    "sermon_shares",
    "sermon_id",
    viewId,
    admin,
  );
  if (options.query?.trim()) {
    sermons = sermons.filter((row) =>
      matchesQuery(row, options.query ?? "", [
        "title",
        "speaker_name",
        "primary_scripture",
        "series_name",
      ]),
    );
  }
  const sorted = sortBy(sermons, "updated_at", "desc");
  const page = paginate(sorted, offset, limit);
  return {
    ...page,
    items: await Promise.all(page.items.map((row) => hydrateSermon(churchId, row))),
  };
}

export async function getSermon(id: string) {
  const churchId = await ready();
  const sermon = await getRow<Sermon>(churchId, "sermons", id);
  if (!sermon) throw asError(null, "Could not load that sermon.");
  return {
    ...(await hydrateSermon(churchId, sermon)),
    share_church_ids: await shareChurchIdsFor(
      churchId,
      "sermon_shares",
      "sermon_id",
      id,
      sermon.church_id,
    ),
  };
}

async function replaceSermonChildren(
  churchId: string,
  sermonId: string,
  input: SermonInput,
) {
  const now = stamp();
  if (input.slides) {
    const slides = input.slides
      .filter((slide) => slide.content.trim())
      .map((slide, index) => ({
        id:
          slide.id && !slide.id.startsWith("new-") ? slide.id : newId(),
        sermon_id: sermonId,
        background_asset_id: null,
        content: slide.content.trim(),
        scripture_reference: slide.scripture_reference?.trim() || null,
        sort_order: index,
        created_at: now,
        updated_at: now,
      }));
    await replaceChildren(churchId, "sermon_slides", "sermon_id", sermonId, slides);
  }
  if (input.notes) {
    const notes = input.notes
      .filter((note) => note.content.trim())
      .map((note, index) => ({
        id: newId(),
        sermon_id: sermonId,
        content: note.content.trim(),
        sort_order: index,
        created_at: now,
        updated_at: now,
      }));
    await replaceChildren(churchId, "sermon_notes", "sermon_id", sermonId, notes);
  }
}

export async function createSermon(input: SermonInput) {
  const workspaceId = await ready();
  const profile = await getSessionProfile();
  const requested = [...new Set((input.share_church_ids ?? []).filter(Boolean))];
  let homeId = workspaceId;
  if (isSuperadmin(profile)) {
    homeId = requested[0] || readSetlistViewChurchId();
    if (!homeId) {
      throw new Error("Choose at least one church that should receive this sermon.");
    }
  }
  const now = stamp();
  const row: Sermon = {
    id: newId(),
    church_id: homeId,
    primary_passage_id: input.primary_passage_id || null,
    visual_asset_id: null,
    title: input.title.trim(),
    speaker_name: input.speaker_name?.trim() || null,
    primary_scripture: input.primary_scripture?.trim() || null,
    series_name: input.series_name?.trim() || null,
    service_date: input.service_date || null,
    est_duration_seconds: input.est_duration_seconds ?? null,
    status: input.status || "draft",
    text_size: input.text_size || "md",
    created_at: now,
    updated_at: now,
  };
  await putRow(workspaceId, "sermons", row as LocalRow, { localOnly: true });
  await replaceSermonChildren(workspaceId, row.id, input);
  await replaceAssignmentShares(
    workspaceId,
    "sermon_shares",
    "sermon_id",
    row.id,
    isSuperadmin(profile)
      ? requested.length
        ? requested
        : [homeId]
      : [workspaceId],
    homeId,
    `sermon “${row.title}”`,
    "sermons",
  );
  return getSermon(row.id);
}

export async function updateSermon(id: string, input: SermonInput) {
  const churchId = await ready();
  const existing = await getRow<Sermon>(churchId, "sermons", id);
  if (!existing) throw asError(null, "Could not update sermon.");
  const profile = await getSessionProfile();
  const requested = [...new Set((input.share_church_ids ?? []).filter(Boolean))];
  let homeId = existing.church_id;
  if (isSuperadmin(profile) && requested.length) homeId = requested[0];
  const row: Sermon = {
    ...existing,
    church_id: homeId,
    title: input.title.trim(),
    speaker_name: input.speaker_name?.trim() || null,
    primary_scripture: input.primary_scripture?.trim() || null,
    primary_passage_id:
      input.primary_passage_id === undefined
        ? existing.primary_passage_id
        : input.primary_passage_id,
    series_name: input.series_name?.trim() || null,
    service_date: input.service_date || null,
    est_duration_seconds: input.est_duration_seconds ?? null,
    status: input.status || "draft",
    text_size: input.text_size || existing.text_size || "md",
    updated_at: stamp(),
  };
  await putRow(churchId, "sermons", row as LocalRow);
  await replaceSermonChildren(churchId, id, input);
  if (isSuperadmin(profile) && requested.length) {
    await replaceAssignmentShares(
      churchId,
      "sermon_shares",
      "sermon_id",
      id,
      requested,
      homeId,
      `sermon “${row.title}”`,
      "sermons",
    );
  }
  return getSermon(id);
}

export async function deleteSermon(id: string) {
  const churchId = await ready();
  await removeRow(churchId, "sermons", id);
}

export async function updateSermonTextSize(id: string, textSize: string) {
  const churchId = await ready();
  const existing = await getRow<Sermon>(churchId, "sermons", id);
  if (!existing) throw asError(null, "Could not update sermon.");
  await putRow(churchId, "sermons", {
    ...existing,
    text_size: textSize,
    updated_at: stamp(),
  } as LocalRow);
}

export async function insertSermonSlide(
  sermonId: string,
  input: {
    content: string;
    afterSlideId?: string | null;
    scripture_reference?: string | null;
  },
) {
  const churchId = await ready();
  const sermon = await getRow<Sermon>(churchId, "sermons", sermonId);
  if (!sermon) throw asError(null, "Could not update sermon.");
  const slides = (await listRows<SermonSlide>(churchId, "sermon_slides"))
    .filter((row) => row.sermon_id === sermonId)
    .sort((a, b) => a.sort_order - b.sort_order);
  const afterIndex = input.afterSlideId
    ? slides.findIndex((row) => row.id === input.afterSlideId)
    : slides.length - 1;
  const insertAt = Math.max(0, afterIndex + 1);
  const now = stamp();
  await Promise.all(
    slides.slice(insertAt).map((row, index) =>
      putRow(churchId, "sermon_slides", {
        ...row,
        sort_order: insertAt + 1 + index,
        updated_at: now,
      } as LocalRow),
    ),
  );
  await putRow(
    churchId,
    "sermon_slides",
    {
      id: newId(),
      sermon_id: sermonId,
      background_asset_id: null,
      content: input.content,
      scripture_reference: input.scripture_reference?.trim() || null,
      sort_order: insertAt,
      created_at: now,
      updated_at: now,
    } as LocalRow,
    { localOnly: true },
  );
  return hydrateSermon(churchId, sermon);
}

export async function updateSermonSlide(
  id: string,
  patch: { content?: string; scripture_reference?: string | null },
) {
  const churchId = await ready();
  const existing = await getRow<SermonSlide>(churchId, "sermon_slides", id);
  if (!existing) throw asError(null, "Could not update that point.");
  await putRow(churchId, "sermon_slides", {
    ...existing,
    content: patch.content ?? existing.content,
    scripture_reference:
      patch.scripture_reference === undefined
        ? existing.scripture_reference
        : patch.scripture_reference,
    updated_at: stamp(),
  } as LocalRow);
}

export async function deleteSermonSlide(id: string) {
  const churchId = await ready();
  const existing = await getRow<SermonSlide>(churchId, "sermon_slides", id);
  if (!existing) return;
  await removeRow(churchId, "sermon_slides", id);
  const remaining = (await listRows<SermonSlide>(churchId, "sermon_slides"))
    .filter((row) => row.sermon_id === existing.sermon_id)
    .sort((a, b) => a.sort_order - b.sort_order);
  const now = stamp();
  await Promise.all(
    remaining.map((row, index) =>
      row.sort_order === index
        ? Promise.resolve()
        : putRow(churchId, "sermon_slides", {
            ...row,
            sort_order: index,
            updated_at: now,
          } as LocalRow),
    ),
  );
}

export async function reorderSermonSlides(sermonId: string, orderedIds: string[]) {
  const churchId = await ready();
  const slides = (await listRows<SermonSlide>(churchId, "sermon_slides")).filter(
    (row) => row.sermon_id === sermonId,
  );
  const now = stamp();
  await Promise.all(
    orderedIds.map((id, index) => {
      const row = slides.find((slide) => slide.id === id);
      if (!row || row.sort_order === index) return Promise.resolve();
      return putRow(churchId, "sermon_slides", {
        ...row,
        sort_order: index,
        updated_at: now,
      } as LocalRow);
    }),
  );
}

export async function listBibleVersions(): Promise<BibleVersion[]> {
  const churchId = await ready();
  const rows = await listRows<BibleVersion>(churchId, "bible_versions");
  return sortBy(rows, "code");
}

export async function bibleVersionIdForCode(code: string): Promise<string | null> {
  const rows = await listBibleVersions();
  return (
    rows.find((row) => row.code.toLowerCase() === code.toLowerCase())?.id ?? null
  );
}

export async function createScripturePassage(input: {
  reference: string;
  text?: string;
  bibleVersionId?: string | null;
}) {
  const churchId = await ready();
  const now = stamp();
  const row: ScripturePassage = {
    id: newId(),
    church_id: churchId,
    bible_version_id: input.bibleVersionId || null,
    reference: input.reference.trim(),
    text: input.text?.trim() || null,
  };
  await putRow(churchId, "scripture_passages", {
    ...row,
    created_at: now,
    updated_at: now,
  } as LocalRow, { localOnly: true });
  return row;
}

function samePassage(
  row: ScripturePassage,
  reference: string,
  bibleVersionId: string | null,
) {
  return (
    row.reference.trim().toLowerCase() === reference.trim().toLowerCase() &&
    (row.bible_version_id || "") === (bibleVersionId || "")
  );
}

export async function findOrCreateScripturePassage(input: {
  reference: string;
  text?: string;
  bibleVersionId?: string | null;
}) {
  const churchId = await ready();
  const reference = input.reference.trim();
  const bibleVersionId = input.bibleVersionId || null;
  const text = input.text?.trim() || null;
  const rows = await listRows<ScripturePassage>(churchId, "scripture_passages");
  const existing = rows.find((row) =>
    samePassage(row, reference, bibleVersionId),
  );
  if (!existing) {
    return createScripturePassage({
      reference,
      text: text ?? undefined,
      bibleVersionId,
    });
  }
  if (text && existing.text !== text) {
    const next = { ...existing, text };
    await putRow(churchId, "scripture_passages", {
      ...next,
      updated_at: stamp(),
    } as LocalRow);
    return next;
  }
  return existing;
}

async function persistFetchedPassage(
  reference: string,
  text: string,
  translation: FreeBibleTranslation,
) {
  const bibleVersionId = await bibleVersionIdForCode(translation);
  return findOrCreateScripturePassage({
    reference,
    text,
    bibleVersionId,
  });
}

export async function loadBibleChapter(
  book: string,
  chapter: number,
  translation: string,
  signal?: AbortSignal,
) {
  const code: FreeBibleTranslation = isFreeBibleTranslation(translation)
    ? translation
    : "kjv";
  const data = await fetchBibleChapter(book, chapter, code, signal);
  try {
    await persistFetchedPassage(
      formatBibleReference(data.book, data.chapter, []),
      joinChapterText(data.verses),
      code,
    );
  } catch {
    // Chapter text stays in IndexedDB even if the church cache is not ready.
  }
  return data;
}

export async function lookupScripture(
  reference: string,
  translation: string = "kjv",
  signal?: AbortSignal,
) {
  const parsed = parseBibleReference(reference);
  if (!parsed) {
    throw new Error("Enter a reference like John 3:16.");
  }
  const code: FreeBibleTranslation = isFreeBibleTranslation(translation)
    ? translation
    : "kjv";
  const chapter = await loadBibleChapter(
    parsed.book,
    parsed.chapter,
    code,
    signal,
  );
  const selected = versesForRange(chapter, parsed.verses);
  if (!selected.length) {
    throw new Error("Those verses were not found in this translation.");
  }
  const verseNums = selected.map((row) => row.verse);
  const ref = formatBibleReference(parsed.book, parsed.chapter, verseNums);
  const text = joinVerseText(selected);
  const passage = await persistFetchedPassage(ref, text, code);
  return {
    ...chapter,
    reference: ref,
    text,
    selectedVerses: selected,
    passage,
  };
}

export async function listMedia(
  options: {
    query?: string;
    kind?: string | null;
    offset?: number;
    limit?: number;
  } = {},
): Promise<Page<MediaAsset>> {
  const churchId = await ready();
  const offset = options.offset ?? 0;
  const limit = options.limit ?? PAGE_SIZE;
  let rows = await listRows<MediaAsset>(churchId, "media_assets");
  if (options.kind) rows = rows.filter((row) => row.kind === options.kind);
  if (options.query?.trim()) {
    rows = rows.filter((row) => matchesQuery(row, options.query ?? "", ["name"]));
  }
  const sorted = [...rows].sort((a, b) => {
    const left = String((a as LocalRow).created_at ?? "");
    const right = String((b as LocalRow).created_at ?? "");
    return left < right ? 1 : left > right ? -1 : 0;
  });
  return paginate(sorted, offset, limit);
}

export async function createMediaAsset(input: {
  name: string;
  url: string;
  kind: string;
  mimeType?: string;
  durationSeconds?: number | null;
}) {
  const churchId = await ready();
  const now = stamp();
  const row: MediaAsset = {
    id: newId(),
    church_id: churchId,
    name: input.name.trim(),
    url: input.url.trim(),
    kind: input.kind,
    mime_type: input.mimeType || null,
    file_size_bytes: null,
    duration_seconds: input.durationSeconds ?? null,
  };
  await putRow(churchId, "media_assets", {
    ...row,
    created_at: now,
    updated_at: now,
  } as LocalRow, { localOnly: true });
  return row;
}

export async function listSetlists(
  options: {
    query?: string;
    offset?: number;
    limit?: number;
    viewChurchId?: string | null;
  } = {},
): Promise<Page<Setlist>> {
  const churchId = await ready();
  const offset = options.offset ?? 0;
  const limit = options.limit ?? PAGE_SIZE;
  let rows = await listRows<Setlist>(churchId, "setlists");
  const profile = readCachedSessionProfile();
  const admin = Boolean(profile && isSuperadmin(profile));
  const viewId = options.viewChurchId || (admin ? readSetlistViewChurchId() : null);
  rows = await rowsForChurch(
    churchId,
    rows,
    "setlist_shares",
    "setlist_id",
    viewId,
    admin,
  );
  if (options.query?.trim()) {
    rows = rows.filter((row) => matchesQuery(row, options.query ?? "", ["name"]));
  }
  const sorted = [...rows].sort((a, b) => {
    const aAt = a.service_at || a.updated_at;
    const bAt = b.service_at || b.updated_at;
    return aAt < bAt ? 1 : aAt > bAt ? -1 : 0;
  });
  return paginate(sorted, offset, limit);
}

export async function getSetlist(id: string) {
  const churchId = await ready();
  const setlist = await getRow<Setlist>(churchId, "setlists", id);
  if (!setlist) throw asError(null, "Could not load that setlist.");
  const items = (await listRows<SetlistItem>(churchId, "setlist_items"))
    .filter((row) => row.setlist_id === id)
    .sort((a, b) => a.sort_order - b.sort_order);
  return {
    ...setlist,
    share_church_ids: await setlistShareChurchIds(churchId, id, setlist.church_id),
    items: await Promise.all(items.map((item) => hydrateSetlistItem(churchId, item))),
  };
}

export async function createSetlist(input: SetlistInput) {
  const workspaceId = await ready();
  const userId = await requireUserId();
  const profile = await getSessionProfile();
  const requested = [...new Set((input.share_church_ids ?? []).filter(Boolean))];
  let homeId = workspaceId;
  if (isSuperadmin(profile)) {
    homeId = requested[0] || readSetlistViewChurchId();
    if (!homeId) {
      throw new Error("Choose at least one church that should receive this setlist.");
    }
  }
  const now = stamp();
  const row: Setlist = {
    id: newId(),
    church_id: homeId,
    created_by: userId,
    name: input.name.trim(),
    service_type: input.service_type || null,
    service_at: input.service_at || null,
    est_duration_seconds: input.est_duration_seconds ?? null,
    created_at: now,
    updated_at: now,
  };
  await putRow(workspaceId, "setlists", row as LocalRow, { localOnly: true });
  if (isSuperadmin(profile)) {
    await replaceSetlistShares(
      workspaceId,
      row.id,
      requested.length ? requested : [homeId],
      homeId,
      row.name,
    );
  } else {
    await replaceSetlistShares(workspaceId, row.id, [workspaceId], workspaceId, row.name);
  }
  return getSetlist(row.id);
}

export async function updateSetlist(id: string, input: SetlistInput) {
  const churchId = await ready();
  const existing = await getRow<Setlist>(churchId, "setlists", id);
  if (!existing) throw asError(null, "Could not update setlist.");
  const profile = await getSessionProfile();
  const requested = [...new Set((input.share_church_ids ?? []).filter(Boolean))];
  let homeId = existing.church_id;
  if (isSuperadmin(profile) && requested.length) {
    homeId = requested[0];
  }
  const row: Setlist = {
    ...existing,
    church_id: homeId,
    name: input.name.trim(),
    service_type: input.service_type || null,
    service_at: input.service_at || null,
    est_duration_seconds: input.est_duration_seconds ?? null,
    updated_at: stamp(),
  };
  await putRow(churchId, "setlists", row as LocalRow);
  if (isSuperadmin(profile) && requested.length) {
    await replaceSetlistShares(churchId, id, requested, homeId, row.name);
  }
  return getSetlist(id);
}

export async function deleteSetlist(id: string) {
  const churchId = await ready();
  await removeRow(churchId, "setlists", id);
}

export async function addSetlistItem(
  setlistId: string,
  input: {
    itemType: SetlistItemType;
    title: string;
    subtitle?: string;
    durationSeconds?: number | null;
    songId?: string | null;
    sermonId?: string | null;
    passageId?: string | null;
    mediaAssetId?: string | null;
    payload?: RosterPayload | null;
  },
) {
  const churchId = await ready();
  const items = (await listRows<SetlistItem>(churchId, "setlist_items")).filter(
    (row) => row.setlist_id === setlistId,
  );
  const last = sortBy(items, "sort_order", "desc")[0];
  const now = stamp();
  await putRow(
    churchId,
    "setlist_items",
    {
      id: newId(),
      setlist_id: setlistId,
      item_type: input.itemType,
      title: input.title.trim(),
      subtitle: input.subtitle?.trim() || null,
      duration_seconds: input.durationSeconds ?? null,
      song_id: input.songId || null,
      sermon_id: input.sermonId || null,
      passage_id: input.passageId || null,
      media_asset_id: input.mediaAssetId || null,
      payload: input.payload ?? null,
      sort_order: (last?.sort_order ?? -1) + 1,
      created_at: now,
      updated_at: now,
    } as LocalRow,
    { localOnly: true },
  );
  return getSetlist(setlistId);
}

export async function updateSetlistItem(
  setlistId: string,
  itemId: string,
  patch: Partial<{
    title: string;
    subtitle: string | null;
    payload: RosterPayload | null;
  }>,
) {
  const churchId = await ready();
  const existing = await getRow<SetlistItem>(churchId, "setlist_items", itemId);
  if (!existing) throw asError(null, "Could not update setlist item.");
  await putRow(churchId, "setlist_items", {
    ...existing,
    title: patch.title?.trim() ?? existing.title,
    subtitle: patch.subtitle !== undefined ? patch.subtitle : existing.subtitle,
    payload: patch.payload !== undefined ? patch.payload : existing.payload,
    updated_at: stamp(),
  } as LocalRow);
  return getSetlist(setlistId);
}

export async function deleteSetlistItem(setlistId: string, itemId: string) {
  const churchId = await ready();
  await removeRow(churchId, "setlist_items", itemId);
  return getSetlist(setlistId);
}

export async function reorderSetlistItems(
  setlistId: string,
  orderedIds: string[],
) {
  const churchId = await ready();
  const items = (await listRows<SetlistItem>(churchId, "setlist_items")).filter(
    (row) => row.setlist_id === setlistId,
  );
  const now = stamp();
  await Promise.all(
    orderedIds.map((id, index) => {
      const row = items.find((item) => item.id === id);
      if (!row || row.sort_order === index) return Promise.resolve();
      return putRow(churchId, "setlist_items", {
        ...row,
        sort_order: index,
        updated_at: now,
      } as LocalRow);
    }),
  );
  return getSetlist(setlistId);
}

export async function getChurchSettings() {
  const churchId = await ready();
  const rows = await listRows<ChurchSettings>(churchId, "church_settings");
  return rows[0] ?? null;
}

export async function saveChurchSettings(input: {
  interface_language: string;
  theme: string;
  default_font?: string;
  default_transition?: string;
  transition_ms?: number;
  backup_frequency?: string;
  lyrics_text_size?: string;
  stage_background?: string;
}) {
  const churchId = await ready();
  const existing = await getChurchSettings();
  const now = stamp();
  const row: ChurchSettings = {
    id: existing?.id ?? newId(),
    church_id: churchId,
    interface_language: input.interface_language,
    theme: input.theme,
    default_font: input.default_font ?? existing?.default_font ?? null,
    default_transition: input.default_transition ?? existing?.default_transition ?? null,
    transition_ms: input.transition_ms ?? existing?.transition_ms ?? null,
    backup_frequency: input.backup_frequency ?? existing?.backup_frequency ?? "hourly",
    lyrics_text_size:
      input.lyrics_text_size ?? existing?.lyrics_text_size ?? "48",
    stage_background: asStageBackground(
      input.stage_background ?? existing?.stage_background,
    ),
  };
  await putRow(
    churchId,
    "church_settings",
    {
      ...row,
      created_at: existing ? (existing as ChurchSettings & { created_at?: string }).created_at ?? now : now,
      updated_at: now,
    } as LocalRow,
    { localOnly: !existing },
  );
  if (row.backup_frequency) await setBackupFrequency(row.backup_frequency);
  return row;
}

export async function patchChurchSettings(
  patch: Partial<{
    interface_language: string;
    theme: string;
    default_font: string;
    default_transition: string;
    transition_ms: number;
    backup_frequency: string;
    lyrics_text_size: string;
    stage_background: string;
  }>,
) {
  const existing = await getChurchSettings();
  return saveChurchSettings({
    interface_language:
      patch.interface_language ?? existing?.interface_language ?? "en",
    theme: patch.theme ?? existing?.theme ?? "dark",
    default_font: patch.default_font ?? existing?.default_font ?? undefined,
    default_transition:
      patch.default_transition ?? existing?.default_transition ?? undefined,
    transition_ms: patch.transition_ms ?? existing?.transition_ms ?? undefined,
    backup_frequency:
      patch.backup_frequency ?? existing?.backup_frequency ?? undefined,
    lyrics_text_size:
      patch.lyrics_text_size ?? existing?.lyrics_text_size ?? undefined,
    stage_background:
      patch.stage_background ?? existing?.stage_background ?? undefined,
  });
}

export async function listOutputDisplays(): Promise<OutputDisplay[]> {
  const churchId = await ready();
  return sortBy(await listRows<OutputDisplay>(churchId, "output_displays"), "sort_order");
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const churchId = await ready();
  const [songs, presentations, setlists] = await Promise.all([
    listRows(churchId, "songs"),
    listRows(churchId, "presentations"),
    listRows(churchId, "setlists"),
  ]);
  return {
    songCount: songs.length,
    presentationCount: presentations.length,
    setlistCount: setlists.length,
  };
}

export async function listRecentPresentations(limit = 6) {
  const churchId = await ready();
  const rows = await listRows<Presentation>(churchId, "presentations");
  return [...rows]
    .sort((a, b) => {
      const aAt = a.started_at || a.created_at;
      const bAt = b.started_at || b.created_at;
      return aAt < bAt ? 1 : aAt > bAt ? -1 : 0;
    })
    .slice(0, limit);
}

export async function getActivePresentation() {
  const churchId = await ready();
  const rows = (await listRows<Presentation>(churchId, "presentations"))
    .filter((row) => row.status === "live")
    .sort((a, b) => (a.started_at || a.created_at) < (b.started_at || b.created_at) ? 1 : -1);
  return rows[0] ?? null;
}

export async function getPresentation(id: string) {
  const churchId = await ready();
  const row = await getRow<Presentation>(churchId, "presentations", id);
  if (!row) throw asError(null, "Could not load that session.");
  return row;
}

export async function startPresentation(setlistId: string, name?: string) {
  const churchId = await ready();
  const userId = await requireUserId();
  const settings = await getChurchSettings();
  const setlist = await getSetlist(setlistId);
  const firstCue = buildCues(setlist)[0];
  const now = stamp();

  const live = (await listRows<Presentation>(churchId, "presentations")).filter(
    (row) => row.status === "live",
  );
  for (const row of live) {
    await putRow(churchId, "presentations", {
      ...row,
      status: "ended",
      ended_at: now,
      updated_at: now,
    } as LocalRow);
  }

  const row: Presentation = {
    id: newId(),
    church_id: churchId,
    setlist_id: setlistId,
    operator_id: userId,
    name: name || setlist.name,
    status: "live",
    is_blackout: false,
    show_logo: false,
    transition_ms: settings?.transition_ms ?? 400,
    started_at: now,
    ended_at: null,
    current_item_id: firstCue?.itemId ?? null,
    current_lyric_id: firstCue?.lyricId ?? null,
    current_slide_id: firstCue?.slideId ?? null,
    verse_overlay_ref: null,
    verse_overlay_translation: null,
    verse_overlay_page: 0,
    verse_overlay_take: 5,
    created_at: now,
    updated_at: now,
  };
  await putRow(churchId, "presentations", row as LocalRow, { localOnly: true });
  publishPresentation(row);
  return row;
}

export async function updatePresentation(
  id: string,
  patch: Partial<{
    current_item_id: string | null;
    current_lyric_id: string | null;
    current_slide_id: string | null;
    is_blackout: boolean;
    show_logo: boolean;
    transition_ms: number;
    status: string;
    ended_at: string | null;
    verse_overlay_ref: string | null;
    verse_overlay_translation: string | null;
    verse_overlay_page: number;
    verse_overlay_take: number;
  }>,
) {
  const churchId = await ready();
  const existing = await getRow<Presentation>(churchId, "presentations", id);
  if (!existing) throw asError(null, "Could not update the live session.");
  const row: Presentation = {
    ...existing,
    ...patch,
    updated_at: stamp(),
  };
  await putRow(churchId, "presentations", row as LocalRow);
  publishPresentation(row);
  return row;
}

export async function endPresentation(id: string) {
  return updatePresentation(id, {
    status: "ended",
    ended_at: stamp(),
  });
}

export function subscribePresentation(
  id: string,
  onChange: (row: Presentation) => void,
) {
  const unsubLocal = subscribeLocalPresentation(id, onChange);
  const channel = supabase
    .channel(`presentation:${id}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "presentations",
        filter: `id=eq.${id}`,
      },
      (payload) => {
        if (payload.new && typeof payload.new === "object") {
          onChange(payload.new as Presentation);
        }
      },
    )
    .subscribe();
  return () => {
    unsubLocal();
    void supabase.removeChannel(channel);
  };
}

export function buildCues(setlist: Setlist): LiveCue[] {
  const cues: LiveCue[] = [];
  for (const item of setlist.items ?? []) {
    if (item.item_type === "song") {
      const songTitle = item.song?.title ?? item.title;
      const sections = [...(item.song?.lyric_sections ?? [])].sort(
        (a, b) => a.sort_order - b.sort_order,
      );
      if (!sections.length) {
        cues.push({
          id: `${item.id}-empty`,
          itemId: item.id,
          kind: "lyric",
          label: "SONG",
          tag: "SNG",
          title: songTitle,
          preview: item.subtitle || songTitle,
          lines: [songTitle],
          heading: songTitle,
          songTitle,
          musicalKey: item.song?.musical_key,
          bpm: item.song?.bpm,
        });
        continue;
      }
      sections.forEach((section, index) => {
        const lines = splitLyricLines(section.content);
        const sectionLabel = formatSectionLabel(section.section);
        cues.push({
          id: section.id,
          itemId: item.id,
          kind: "lyric",
          label: sectionLabel.toUpperCase() || "SONG",
          tag: section.section.slice(0, 3).toUpperCase() || `V${index + 1}`,
          title: songTitle,
          preview: lines[0] || sectionLabel,
          lines: lines.length ? lines : [sectionLabel || songTitle],
          heading: songTitle,
          sectionLabel,
          lyricId: section.id,
          songTitle,
          musicalKey: item.song?.musical_key,
          bpm: item.song?.bpm,
        });
      });
      continue;
    }
    if (item.item_type === "sermon") {
      const slides = [...(item.sermon?.slides ?? [])].sort(
        (a, b) => a.sort_order - b.sort_order,
      );
      const sermonTitle = item.sermon?.title ?? item.title;
      const titleVerse =
        slides.find((slide) => !isSermonSpace(slide.content))?.scripture_reference?.trim() ||
        item.sermon?.primary_scripture?.trim() ||
        "";
      cues.push({
        id: `${item.id}-title`,
        itemId: item.id,
        kind: "sermon",
        label: "TITLE",
        tag: "TTL",
        title: sermonTitle,
        preview: sermonTitle,
        lines: [sermonTitle],
        heading: null,
        align: "center",
        textSize: item.sermon?.text_size,
        verse: titleVerse || null,
        versePlacement: titleVerse ? "bottom" : undefined,
        titleSlide: true,
        lyricId: `sermon-title:${item.id}`,
      });
      if (!slides.length) continue;
      let point = 0;
      slides.forEach((slide) => {
        if (isSermonSpace(slide.content)) return;
        point += 1;
        const lines = sermonDisplayLines(slide.content);
        cues.push({
          id: slide.id,
          itemId: item.id,
          kind: "sermon",
          label: `POINT ${point}`,
          tag: `P${point}`,
          title: sermonTitle,
          preview: sermonPlainText(slide.content).slice(0, 80) || slide.content.slice(0, 80),
          lines: lines.length ? lines : [slide.content],
          heading: null,
          slideId: slide.id,
          lyricId: `sermon-page:${slide.id}:0`,
          align: "start",
          textSize: item.sermon?.text_size,
        });
      });
      continue;
    }
    if (item.item_type === "scripture") {
      const reference = item.passage?.reference || item.title;
      const text = item.passage?.text?.trim() || item.subtitle?.trim() || "";
      cues.push({
        id: item.id,
        itemId: item.id,
        kind: "scripture",
        label: "SCRIPTURE",
        tag: "REF",
        title: reference,
        preview: (text || reference).slice(0, 80),
        lines: text ? splitLyricLines(text) : [],
        heading: reference,
        verse: reference,
        align: "center",
      });
      continue;
    }
    if (item.item_type === "roster") {
      const roster = normalizeRoster(item.payload);
      const dateLabel = formatRosterDate(roster.date);
      cues.push({
        id: item.id,
        itemId: item.id,
        kind: "roster",
        label: roster.heading.toUpperCase() || "ASSIGNMENTS",
        tag: "ASG",
        title: roster.heading,
        preview: `${roster.heading} · ${dateLabel}`,
        lines: [],
        heading: roster.heading,
        roster,
      });
      continue;
    }
    cues.push({
      id: item.id,
      itemId: item.id,
      kind: "media",
      label: "MEDIA",
      tag: "MED",
      title: item.title,
      preview: item.subtitle || item.title,
      lines: [item.title],
    });
  }
  return cues.map((cue, index, list) => ({
    ...cue,
    nextPreview: list[index + 1]?.preview,
  }));
}

export function cueIndexFor(presentation: Presentation, cues: LiveCue[]) {
  if (!cues.length) return 0;
  if (presentation.current_lyric_id) {
    const byLyric = cues.findIndex(
      (cue) => cue.lyricId === presentation.current_lyric_id,
    );
    if (byLyric >= 0) return byLyric;
  }
  if (presentation.current_slide_id) {
    const bySlide = cues.findIndex(
      (cue) => cue.slideId === presentation.current_slide_id,
    );
    if (bySlide >= 0) return bySlide;
  }
  if (presentation.current_item_id) {
    const byItem = cues.findIndex(
      (cue) => cue.itemId === presentation.current_item_id,
    );
    if (byItem >= 0) return byItem;
  }
  return 0;
}

export function patchFromCue(cue: LiveCue | undefined) {
  return {
    current_item_id: cue?.itemId ?? null,
    current_lyric_id: cue?.lyricId ?? null,
    current_slide_id: cue?.slideId ?? null,
  };
}

export function itemMeta(item: SetlistItem) {
  if (item.item_type === "song") {
    const key = item.song?.musical_key;
    const bpm = item.song?.bpm;
    const sig = item.song?.time_signature;
    return [key ? `Key: ${key}` : null, bpm ? `${bpm} BPM` : null, sig]
      .filter(Boolean)
      .join(" • ");
  }
  if (item.item_type === "roster") {
    const roster = normalizeRoster(item.payload);
    return formatRosterDate(roster.date);
  }
  return item.subtitle || formatDuration(item.duration_seconds);
}

function sortLyricSections(song: Song): Song {
  return {
    ...song,
    lyric_sections: [...(song.lyric_sections ?? [])].sort(
      (a, b) => a.sort_order - b.sort_order,
    ),
  };
}

function sortSermon(sermon: Sermon): Sermon {
  return {
    ...sermon,
    slides: [...(sermon.slides ?? [])].sort((a, b) => a.sort_order - b.sort_order),
    notes: [...(sermon.notes ?? [])].sort((a, b) => a.sort_order - b.sort_order),
  };
}
