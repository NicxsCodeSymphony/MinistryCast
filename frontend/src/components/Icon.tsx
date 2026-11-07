import type { CSSProperties } from "react";
import type { LucideIcon } from "lucide-react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bell,
  BookOpen,
  BookOpenText,
  Calendar,
  CalendarDays,
  Check,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Church,
  Circle,
  Clapperboard,
  Clock,
  Cloud,
  CloudOff,
  CloudUpload,
  Ban,
  Bold,
  Camera,
  Cast,
  Edit3,
  ExternalLink,
  EyeOff,
  FileAudio,
  FileText,
  Film,
  GripVertical,
  Hash,
  Heart,
  Info,
  Italic,
  LayoutDashboard,
  LayoutGrid,
  Link2,
  ListMusic,
  ListPlus,
  ListVideo,
  Loader2,
  LogOut,
  Maximize2,
  Megaphone,
  MessageSquare,
  MessagesSquare,
  Mic,
  Minus,
  Monitor,
  MonitorPlay,
  MonitorUp,
  MoreHorizontal,
  MoreVertical,
  Music2,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Paperclip,
  PartyPopper,
  Pencil,
  Play,
  PlayCircle,
  Plus,
  PlusCircle,
  PlusSquare,
  Presentation,
  RefreshCw,
  Reply,
  Save,
  Search,
  Send,
  Settings,
  Shapes,
  ShieldCheck,
  ShieldEllipsis,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Smile,
  Sparkles,
  Square,
  CircleStop,
  Star,
  StickyNote,
  Tag,
  Timer,
  Trash2,
  Tv,
  Underline,
  Undo2,
  User,
  UserCog,
  UserPlus,
  UserSquare,
  Users,
  Video,
  X,
  XSquare,
  ArchiveRestore,
  Space,
  Image,
  ArrowDown,
  ArrowUp,
  RectangleHorizontal,
  MonitorSmartphone,
  ScrollText,
  Archive,
} from "lucide-react";

/**
 * One icon component for the whole app, backed by Lucide.
 * Names are the legacy Material Symbols ids: they are also stored in the
 * database (category icons), so the mapping must stay backward compatible.
 */
const ICONS: Record<string, LucideIcon> = {
  add: Plus,
  add_box: PlusSquare,
  add_circle: PlusCircle,
  add_reaction: Smile,
  admin_panel_settings: ShieldEllipsis,
  arrow_back: ArrowLeft,
  arrow_forward: ArrowRight,
  assignment_ind: UserSquare,
  attach_file: Paperclip,
  audio_file: FileAudio,
  auto_awesome: Sparkles,
  auto_stories: BookOpenText,
  block: Ban,
  branding_watermark: Image,
  calendar_today: Calendar,
  campaign: Megaphone,
  cast: Cast,
  category: Shapes,
  celebration: PartyPopper,
  chat: MessageSquare,
  check: Check,
  check_circle: CheckCircle2,
  chevron_left: ChevronLeft,
  chevron_right: ChevronRight,
  church: Church,
  close: X,
  cloud: Cloud,
  cloud_done: Cloud,
  cloud_off: CloudOff,
  cloud_sync: RefreshCw,
  cloud_upload: CloudUpload,
  dashboard: LayoutDashboard,
  delete: Trash2,
  deselect: XSquare,
  desktop_windows: Monitor,
  drag_indicator: GripVertical,
  edit: Pencil,
  edit_note: Edit3,
  error: AlertCircle,
  event: CalendarDays,
  expand_more: ChevronDown,
  favorite: Heart,
  format_bold: Bold,
  format_italic: Italic,
  format_underlined: Underline,
  forum: MessagesSquare,
  group: Users,
  hide_image: EyeOff,
  info: Info,
  label: Tag,
  left_panel_close: PanelLeftClose,
  left_panel_open: PanelLeftOpen,
  link: Link2,
  list_alt: FileText,
  live_tv: Tv,
  logout: LogOut,
  manage_accounts: UserCog,
  menu_book: BookOpen,
  more_horiz: MoreHorizontal,
  more_vert: MoreVertical,
  movie: Film,
  movie_filter: Clapperboard,
  music_note: Music2,
  notifications: Bell,
  open_in_full: Maximize2,
  open_in_new: ExternalLink,
  palette: Palette,
  person: User,
  person_add: UserPlus,
  photo_camera: Camera,
  play_arrow: Play,
  play_circle: PlayCircle,
  playlist_add: ListPlus,
  playlist_play: ListVideo,
  present_to_all: MonitorUp,
  presentation: Presentation,
  progress_activity: Loader2,
  queue_music: ListMusic,
  radio_button_unchecked: Circle,
  record_voice_over: Mic,
  refresh: RefreshCw,
  remove: Minus,
  reply: Reply,
  right_panel_close: PanelRightClose,
  right_panel_open: PanelRightOpen,
  save: Save,
  search: Search,
  select_all: CheckSquare,
  send: Send,
  settings: Settings,
  skip_next: SkipForward,
  skip_previous: SkipBack,
  slideshow: MonitorPlay,
  space_bar: Space,
  star: Star,
  star_outline: Star,
  sticky_note_2: StickyNote,
  stop: Square,
  stop_circle: CircleStop,
  tag: Hash,
  team: Users,
  timer: Timer,
  tune: SlidersHorizontal,
  unarchive: ArchiveRestore,
  undo: Undo2,
  verified_user: ShieldCheck,
  videocam: Video,
  warning: AlertTriangle,
  schedule: Clock,
  grid_view: LayoutGrid,
  arrow_downward: ArrowDown,
  arrow_upward: ArrowUp,
  crop_landscape: RectangleHorizontal,
  devices: MonitorSmartphone,
  policy: ScrollText,
  archive: Archive,
};

/** Icons that read better solid when the legacy "filled" flag was set. */
const FILLABLE = new Set(["star", "favorite"]);

export function hasIcon(name: string) {
  return name in ICONS;
}

type IconProps = {
  name: string;
  className?: string;
  title?: string;
  strokeWidth?: number;
  style?: CSSProperties;
};

export default function Icon({
  name,
  className = "",
  title,
  strokeWidth = 1.75,
  style,
}: IconProps) {
  const key = (name || "").trim();
  const Glyph = ICONS[key];
  const filled = /(^|\s)filled(\s|$)/.test(className) && FILLABLE.has(key);
  const classes = `mc-icon ${className.replace(/(^|\s)filled(?=\s|$)/g, " ")}`.trim();
  if (!Glyph) {
    if (import.meta.env.DEV) console.warn(`[Icon] no Lucide mapping for "${key}"`);
    return (
      <Circle
        className={classes}
        style={style}
        data-icon-missing={key}
        role="img"
        aria-label={title ?? key}
        strokeWidth={strokeWidth}
      />
    );
  }
  return (
    <Glyph
      className={classes}
      style={style}
      data-icon={key}
      role="img"
      aria-label={title ?? key}
      strokeWidth={strokeWidth}
      fill={filled ? "currentColor" : "none"}
    />
  );
}
