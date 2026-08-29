import type { RosterPayload } from "./roster";

export const PAGE_SIZE = 20;

export type CategoryColor =
  | "sky"
  | "violet"
  | "gold"
  | "rose"
  | "amber"
  | "emerald"
  | "teal"
  | "coral"
  | "cyan"
  | "indigo"
  | "primary"
  | "secondary"
  | "tertiary"
  | "error"
  | "accent";

export type Category = {
  id: string;
  church_id: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  song_count?: number;
};

export type Language = {
  id: string;
  church_id: string;
  name: string;
  code: string;
};

export type SongLyricSection = {
  id: string;
  song_id: string;
  section: string;
  content: string;
  sort_order: number;
};

export type Song = {
  id: string;
  church_id: string;
  category_id: string | null;
  language_id: string | null;
  audio_asset_id: string | null;
  title: string;
  artist: string | null;
  musical_key: string | null;
  bpm: number | null;
  time_signature: string | null;
  duration_seconds: number | null;
  youtube_url: string | null;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
  category?: Category | null;
  language?: Language | null;
  lyric_sections?: SongLyricSection[];
};

export type SongInput = {
  title: string;
  artist?: string;
  musical_key?: string;
  bpm?: number | null;
  time_signature?: string;
  category_id?: string | null;
  language_id?: string | null;
  youtube_url?: string | null;
  duration_seconds?: number | null;
  lyrics?: { section: string; content: string }[];
};

export type SermonSlide = {
  id: string;
  sermon_id: string;
  background_asset_id: string | null;
  content: string;
  scripture_reference: string | null;
  sort_order: number;
};

export type SermonNote = {
  id: string;
  sermon_id: string;
  content: string;
  sort_order: number;
};

export type MediaAsset = {
  id: string;
  church_id: string;
  name: string;
  url: string;
  kind: string;
  mime_type: string | null;
  file_size_bytes: number | null;
  duration_seconds: number | null;
};

export type Sermon = {
  id: string;
  church_id: string;
  primary_passage_id: string | null;
  visual_asset_id: string | null;
  title: string;
  speaker_name: string | null;
  primary_scripture: string | null;
  series_name: string | null;
  service_date: string | null;
  est_duration_seconds: number | null;
  status: string;
  text_size?: string | null;
  created_at: string;
  updated_at: string;
  slides?: SermonSlide[];
  notes?: SermonNote[];
  share_church_ids?: string[];
};

export type SermonInput = {
  title: string;
  speaker_name?: string;
  primary_scripture?: string;
  primary_passage_id?: string | null;
  series_name?: string | null;
  service_date?: string | null;
  est_duration_seconds?: number | null;
  status?: string;
  text_size?: string | null;
  slides?: { id?: string; content: string; scripture_reference?: string }[];
  notes?: { content: string }[];
  share_church_ids?: string[];
};

export type ScripturePassage = {
  id: string;
  church_id: string;
  bible_version_id: string | null;
  reference: string;
  text: string | null;
};

export type BibleVersion = {
  id: string;
  code: string;
  name: string;
};

export type { RosterPayload, RosterRole } from "./roster";

export type SetlistItemType = "song" | "sermon" | "scripture" | "media" | "roster";

export type SetlistItem = {
  id: string;
  setlist_id: string;
  item_type: SetlistItemType;
  song_id: string | null;
  sermon_id: string | null;
  passage_id: string | null;
  media_asset_id: string | null;
  payload?: RosterPayload | null;
  title: string;
  subtitle: string | null;
  duration_seconds: number | null;
  sort_order: number;
  song?: Song | null;
  sermon?: Sermon | null;
  passage?: ScripturePassage | null;
  media?: MediaAsset | null;
};

export type Setlist = {
  id: string;
  church_id: string;
  created_by: string | null;
  name: string;
  service_type: string | null;
  service_at: string | null;
  est_duration_seconds: number | null;
  created_at: string;
  updated_at: string;
  items?: SetlistItem[];
  share_church_ids?: string[];
};

export type SetlistInput = {
  name: string;
  service_type?: string;
  service_at?: string | null;
  est_duration_seconds?: number | null;
  share_church_ids?: string[];
};

export type ChurchSettings = {
  id: string;
  church_id: string;
  interface_language: string;
  theme: string;
  default_font: string | null;
  default_transition: string | null;
  transition_ms: number | null;
  backup_frequency: string | null;
  lyrics_text_size?: string | null;
  lyrics_text_style?: string | null;
  stage_background?: string | null;
};

export type OutputDisplay = {
  id: string;
  church_id: string;
  name: string;
  kind: string;
  is_default: boolean;
  sort_order: number;
};

export type Presentation = {
  id: string;
  church_id: string;
  setlist_id: string;
  operator_id: string | null;
  current_item_id: string | null;
  current_lyric_id: string | null;
  current_slide_id: string | null;
  name: string | null;
  status: string;
  is_blackout: boolean;
  show_logo: boolean;
  transition_ms: number | null;
  started_at: string | null;
  ended_at: string | null;
  verse_overlay_ref: string | null;
  verse_overlay_translation: string | null;
  verse_overlay_page: number;
  verse_overlay_take: number;
  created_at: string;
  updated_at: string;
};

export type Page<T> = {
  items: T[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
};

export type CueKind = "lyric" | "sermon" | "scripture" | "media" | "logo" | "roster";

export type LiveCue = {
  id: string;
  itemId: string;
  kind: CueKind;
  label: string;
  tag: string;
  title: string;
  preview: string;
  lines: string[];
  lyricId?: string;
  slideId?: string;
  songTitle?: string;
  musicalKey?: string | null;
  bpm?: number | null;
  nextPreview?: string;
  align?: "start" | "center";
  blank?: boolean;
  textSize?: string | null;
  heading?: string | null;
  sectionLabel?: string | null;
  verse?: string | null;
  versePlacement?: "bottom" | "prefix";
  titleSlide?: boolean;
  roster?: RosterPayload | null;
};

export type DashboardStats = {
  songCount: number;
  presentationCount: number;
  setlistCount: number;
};
