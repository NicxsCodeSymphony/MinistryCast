-- MinistryCast complete schema
-- Ordered by product flow: login (email → OTP → signup) → settings → library → sermon → setlist → live
-- PostgreSQL

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Login: 6-digit email OTP (signup or returning sign-in)
CREATE TABLE email_otps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email varchar(255) NOT NULL,
  code_hash varchar(128) NOT NULL,
  purpose varchar(20) NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  attempt_count int NOT NULL DEFAULT 0,
  user_id uuid,
  created_at timestamptz NOT NULL,
  CONSTRAINT chk_email_otps_purpose CHECK (purpose IN ('signup', 'login'))
);

-- 1. Login: church created at signup, locked until an admin approves
CREATE TABLE churches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(120) NOT NULL,
  email varchar(255) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'pending',
  approved_at timestamptz,
  approved_by uuid,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT chk_churches_status CHECK (status IN ('pending', 'active', 'suspended', 'offline'))
);

-- 1. Login: operator created after OTP + name/church signup
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL,
  name varchar(120) NOT NULL,
  email varchar(255) NOT NULL,
  email_verified_at timestamptz,
  google_sub varchar(255),
  role varchar(20) NOT NULL DEFAULT 'admin',
  status varchar(20) NOT NULL DEFAULT 'pending',
  avatar_url text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT fk_users_church_id FOREIGN KEY (church_id) REFERENCES churches (id) ON DELETE CASCADE,
  CONSTRAINT uq_users_email UNIQUE (email),
  CONSTRAINT uq_users_google_sub UNIQUE (google_sub),
  CONSTRAINT chk_users_role CHECK (role IN ('admin', 'producer', 'operator')),
  CONSTRAINT chk_users_status CHECK (status IN ('pending', 'active', 'disabled'))
);

ALTER TABLE churches
  ADD CONSTRAINT fk_churches_approved_by
  FOREIGN KEY (approved_by) REFERENCES users (id) ON DELETE SET NULL;

ALTER TABLE email_otps
  ADD CONSTRAINT fk_email_otps_user_id
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;

-- 2. Settings: General, account, projection prefs
CREATE TABLE church_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL,
  interface_language varchar(16) NOT NULL,
  theme varchar(8) NOT NULL,
  default_font varchar(80),
  default_transition varchar(40),
  transition_ms int,
  backup_frequency varchar(24),
  lyrics_text_size varchar(20),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT fk_church_settings_church_id FOREIGN KEY (church_id) REFERENCES churches (id) ON DELETE CASCADE,
  CONSTRAINT uq_church_settings_church_id UNIQUE (church_id)
);

-- 2. Settings: Projector, NDI, stage confidence
CREATE TABLE output_displays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL,
  name varchar(80) NOT NULL,
  kind varchar(24) NOT NULL,
  is_default boolean NOT NULL,
  sort_order int NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT fk_output_displays_church_id FOREIGN KEY (church_id) REFERENCES churches (id) ON DELETE CASCADE
);

-- 3. Categories: Worship flow buckets (Praise, Hymns…)
CREATE TABLE categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL,
  name varchar(80) NOT NULL,
  description text,
  icon varchar(64),
  color varchar(24),
  sort_order int NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT fk_categories_church_id FOREIGN KEY (church_id) REFERENCES churches (id) ON DELETE CASCADE
);

-- 3. Categories: Song lyric language filter
CREATE TABLE languages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL,
  name varchar(80) NOT NULL,
  code varchar(12) NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT fk_languages_church_id FOREIGN KEY (church_id) REFERENCES churches (id) ON DELETE CASCADE
);

-- 3. Categories: Freeform song tags
CREATE TABLE tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL,
  name varchar(80) NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT fk_tags_church_id FOREIGN KEY (church_id) REFERENCES churches (id) ON DELETE CASCADE
);

-- 3. Categories: ESV / NIV for live scripture lookup
CREATE TABLE bible_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(12) NOT NULL,
  name varchar(80) NOT NULL,
  CONSTRAINT uq_bible_versions_code UNIQUE (code)
);

-- 4. Songs & media: Images, video, audio, PDF, announcement loops
CREATE TABLE media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL,
  name varchar(200) NOT NULL,
  url text NOT NULL,
  kind varchar(24) NOT NULL,
  mime_type varchar(80),
  file_size_bytes bigint,
  duration_seconds int,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT fk_media_assets_church_id FOREIGN KEY (church_id) REFERENCES churches (id) ON DELETE CASCADE
);

-- 4. Songs & media: Song library
CREATE TABLE songs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL,
  category_id uuid,
  language_id uuid,
  audio_asset_id uuid,
  title varchar(200) NOT NULL,
  artist varchar(200),
  musical_key varchar(8),
  bpm int,
  time_signature varchar(8),
  duration_seconds int,
  youtube_url text,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT fk_songs_church_id FOREIGN KEY (church_id) REFERENCES churches (id) ON DELETE CASCADE,
  CONSTRAINT fk_songs_category_id FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE SET NULL,
  CONSTRAINT fk_songs_language_id FOREIGN KEY (language_id) REFERENCES languages (id) ON DELETE SET NULL,
  CONSTRAINT fk_songs_audio_asset_id FOREIGN KEY (audio_asset_id) REFERENCES media_assets (id) ON DELETE SET NULL
);

-- 4. Songs & media: Verse / chorus blocks shown live
CREATE TABLE song_lyric_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  song_id uuid NOT NULL,
  section varchar(40) NOT NULL,
  content text NOT NULL,
  sort_order int NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT fk_song_lyric_sections_song_id FOREIGN KEY (song_id) REFERENCES songs (id) ON DELETE CASCADE
);

-- 4. Songs & media: Songs ↔ tags
CREATE TABLE song_tags (
  song_id uuid NOT NULL,
  tag_id uuid NOT NULL,
  PRIMARY KEY (song_id, tag_id),
  CONSTRAINT fk_song_tags_song_id FOREIGN KEY (song_id) REFERENCES songs (id) ON DELETE CASCADE,
  CONSTRAINT fk_song_tags_tag_id FOREIGN KEY (tag_id) REFERENCES tags (id) ON DELETE CASCADE
);

-- 5. Sermon & scripture: Saved readings (Psalm 23, John 4:23)
CREATE TABLE scripture_passages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL,
  bible_version_id uuid,
  reference varchar(80) NOT NULL,
  text text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT fk_scripture_passages_church_id FOREIGN KEY (church_id) REFERENCES churches (id) ON DELETE CASCADE,
  CONSTRAINT fk_scripture_passages_bible_version_id FOREIGN KEY (bible_version_id) REFERENCES bible_versions (id) ON DELETE SET NULL
);

-- 5. Sermon & scripture: Sermon transcription / deck
CREATE TABLE sermons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL,
  primary_passage_id uuid,
  visual_asset_id uuid,
  title varchar(200) NOT NULL,
  speaker_name varchar(120),
  primary_scripture varchar(80),
  series_name varchar(120),
  service_date date,
  est_duration_seconds int,
  status varchar(20) NOT NULL,
  text_size varchar(16) NOT NULL DEFAULT 'md',
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT fk_sermons_church_id FOREIGN KEY (church_id) REFERENCES churches (id) ON DELETE CASCADE,
  CONSTRAINT fk_sermons_primary_passage_id FOREIGN KEY (primary_passage_id) REFERENCES scripture_passages (id) ON DELETE SET NULL,
  CONSTRAINT fk_sermons_visual_asset_id FOREIGN KEY (visual_asset_id) REFERENCES media_assets (id) ON DELETE SET NULL
);

-- 5. Sermon & scripture: Talking points shown on air
CREATE TABLE sermon_slides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sermon_id uuid NOT NULL,
  background_asset_id uuid,
  content text NOT NULL,
  scripture_reference varchar(80),
  sort_order int NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT fk_sermon_slides_sermon_id FOREIGN KEY (sermon_id) REFERENCES sermons (id) ON DELETE CASCADE,
  CONSTRAINT fk_sermon_slides_background_asset_id FOREIGN KEY (background_asset_id) REFERENCES media_assets (id) ON DELETE SET NULL
);

-- 5. Sermon & scripture: Private notes, never projected
CREATE TABLE sermon_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sermon_id uuid NOT NULL,
  content text NOT NULL,
  sort_order int NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT fk_sermon_notes_sermon_id FOREIGN KEY (sermon_id) REFERENCES sermons (id) ON DELETE CASCADE
);

-- 5. Sermon & scripture: PDF / bumper video on a sermon
CREATE TABLE sermon_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sermon_id uuid NOT NULL,
  media_asset_id uuid NOT NULL,
  created_at timestamptz NOT NULL,
  CONSTRAINT fk_sermon_attachments_sermon_id FOREIGN KEY (sermon_id) REFERENCES sermons (id) ON DELETE CASCADE,
  CONSTRAINT fk_sermon_attachments_media_asset_id FOREIGN KEY (media_asset_id) REFERENCES media_assets (id) ON DELETE CASCADE
);

-- 6. Setlists: Sunday service plan
CREATE TABLE setlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL,
  created_by uuid,
  name varchar(200) NOT NULL,
  service_type varchar(80),
  service_at timestamptz,
  est_duration_seconds int,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT fk_setlists_church_id FOREIGN KEY (church_id) REFERENCES churches (id) ON DELETE CASCADE,
  CONSTRAINT fk_setlists_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
);

-- 6. Setlists: Ordered service items (song | sermon | scripture | media)
CREATE TABLE setlist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setlist_id uuid NOT NULL,
  item_type varchar(20) NOT NULL,
  song_id uuid,
  sermon_id uuid,
  passage_id uuid,
  media_asset_id uuid,
  title varchar(200) NOT NULL,
  subtitle varchar(240),
  duration_seconds int,
  sort_order int NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT fk_setlist_items_setlist_id FOREIGN KEY (setlist_id) REFERENCES setlists (id) ON DELETE CASCADE,
  CONSTRAINT fk_setlist_items_song_id FOREIGN KEY (song_id) REFERENCES songs (id) ON DELETE CASCADE,
  CONSTRAINT fk_setlist_items_sermon_id FOREIGN KEY (sermon_id) REFERENCES sermons (id) ON DELETE CASCADE,
  CONSTRAINT fk_setlist_items_passage_id FOREIGN KEY (passage_id) REFERENCES scripture_passages (id) ON DELETE CASCADE,
  CONSTRAINT fk_setlist_items_media_asset_id FOREIGN KEY (media_asset_id) REFERENCES media_assets (id) ON DELETE CASCADE
);

ALTER TABLE setlist_items ADD CONSTRAINT chk_setlist_item_ref CHECK (
  (item_type = 'song' AND song_id IS NOT NULL)
  OR (item_type = 'sermon' AND sermon_id IS NOT NULL)
  OR (item_type = 'scripture' AND passage_id IS NOT NULL)
  OR (item_type = 'media' AND media_asset_id IS NOT NULL)
);

-- 7. Live: Go Live session for a setlist
CREATE TABLE presentations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL,
  setlist_id uuid NOT NULL,
  operator_id uuid,
  current_item_id uuid,
  current_lyric_id uuid,
  current_slide_id uuid,
  name varchar(200),
  status varchar(20) NOT NULL,
  is_blackout boolean NOT NULL,
  show_logo boolean NOT NULL,
  transition_ms int,
  started_at timestamptz,
  ended_at timestamptz,
  verse_overlay_ref varchar(120),
  verse_overlay_translation varchar(12),
  verse_overlay_page int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT fk_presentations_church_id FOREIGN KEY (church_id) REFERENCES churches (id) ON DELETE CASCADE,
  CONSTRAINT fk_presentations_setlist_id FOREIGN KEY (setlist_id) REFERENCES setlists (id) ON DELETE CASCADE,
  CONSTRAINT fk_presentations_operator_id FOREIGN KEY (operator_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_presentations_current_item_id FOREIGN KEY (current_item_id) REFERENCES setlist_items (id) ON DELETE SET NULL,
  CONSTRAINT fk_presentations_current_lyric_id FOREIGN KEY (current_lyric_id) REFERENCES song_lyric_sections (id) ON DELETE SET NULL,
  CONSTRAINT fk_presentations_current_slide_id FOREIGN KEY (current_slide_id) REFERENCES sermon_slides (id) ON DELETE SET NULL
);

-- 7. Live: Which displays are on air
CREATE TABLE presentation_outputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  presentation_id uuid NOT NULL,
  output_display_id uuid NOT NULL,
  is_active boolean NOT NULL,
  created_at timestamptz NOT NULL,
  CONSTRAINT fk_presentation_outputs_presentation_id FOREIGN KEY (presentation_id) REFERENCES presentations (id) ON DELETE CASCADE,
  CONSTRAINT fk_presentation_outputs_output_display_id FOREIGN KEY (output_display_id) REFERENCES output_displays (id) ON DELETE CASCADE
);

CREATE INDEX idx_email_otps_email ON email_otps (email, created_at DESC);
CREATE INDEX idx_churches_status ON churches (status);
CREATE INDEX idx_users_church ON users (church_id);
CREATE INDEX idx_users_status ON users (status);
CREATE INDEX idx_songs_church ON songs (church_id);
CREATE INDEX idx_songs_category ON songs (category_id);
CREATE INDEX idx_setlist_items_setlist ON setlist_items (setlist_id, sort_order);
CREATE INDEX idx_sermon_slides_sermon ON sermon_slides (sermon_id, sort_order);
CREATE INDEX idx_presentations_setlist ON presentations (setlist_id);
