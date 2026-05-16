"use client";

import {
  Search,
  Plus,
  Bell,
  HelpCircle,
  Info,
  RotateCcw,
  Settings,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Check,
  X,
  Star,
  Home,
  Inbox,
  LayoutGrid,
  List,
  AlignLeft,
  Zap,
  BarChart3,
  Folder,
  Users,
  Filter,
  ArrowUpDown,
  MoreHorizontal,
  MoreVertical,
  Eye,
  Paperclip,
  MessageSquare,
  Flag,
  Link as LinkIcon,
  GripVertical,
  Calendar,
  Clock,
  Play,
  Pause,
  Trash2,
  Pencil,
  Copy,
  ArrowUp,
  ArrowDown,
  Minus,
  Image as ImageIcon,
  AtSign,
  Smile,
  Send,
  Sparkles,
  RotateCw,
  Loader2,
  Menu as MenuIcon,
  Tag as TagIcon,
  Sun,
  Moon,
  Monitor,
  Contrast,
  WifiOff,
  CloudUpload,
  Download,
  Palette,
  FileText,
  Terminal,
} from "lucide-react";

const STAR_FILLED = (props) => <Star {...props} fill="currentColor" strokeWidth={0} />;

const NAME_TO_ICON = {
  search: Search,
  plus: Plus,
  menu: MenuIcon,
  bell: Bell,
  help: HelpCircle,
  info: Info,
  "rotate-ccw": RotateCcw,
  settings: Settings,
  "chev-down": ChevronDown,
  "chev-right": ChevronRight,
  "chev-left": ChevronLeft,
  check: Check,
  x: X,
  star: Star,
  "star-fill": STAR_FILLED,
  home: Home,
  inbox: Inbox,
  board: LayoutGrid,
  list: List,
  backlog: AlignLeft,
  sprint: Zap,
  chart: BarChart3,
  folder: Folder,
  people: Users,
  filter: Filter,
  sort: ArrowUpDown,
  "more-h": MoreHorizontal,
  "more-v": MoreVertical,
  eye: Eye,
  paperclip: Paperclip,
  comment: MessageSquare,
  flag: Flag,
  link: LinkIcon,
  grip: GripVertical,
  calendar: Calendar,
  clock: Clock,
  play: Play,
  pause: Pause,
  lightning: Zap,
  trash: Trash2,
  edit: Pencil,
  copy: Copy,
  "arrow-up": ArrowUp,
  "arrow-down": ArrowDown,
  minus: Minus,
  image: ImageIcon,
  mention: AtSign,
  emoji: Smile,
  epic: Sparkles,
  send: Send,
  tag: TagIcon,
  refresh: RotateCw,
  loader: Loader2,
  sun: Sun,
  moon: Moon,
  monitor: Monitor,
  contrast: Contrast,
  "wifi-off": WifiOff,
  "cloud-upload": CloudUpload,
  download: Download,
  palette: Palette,
  "file-text": FileText,
  terminal: Terminal,
};

export function Icon({ name, size = 16, className = "", style }) {
  const Cmp = NAME_TO_ICON[name];
  if (!Cmp) return null;
  return <Cmp size={size} strokeWidth={1.7} className={className} style={style} />;
}

// API-driven type badge: a colored square using the type's own color, with
// the first letter of the type name as the glyph. There is no keyword-based
// shape variation — OpenProject doesn't tell us "this is a bug" vs "this is
// a story", only the configured name and color.
export function TypeIcon({ name, color, size = 14 }) {
  if (!name) return null;
  const initial = String(name).trim().slice(0, 1).toUpperCase() || "?";
  const swatch = color || "var(--text-3)";
  return (
    <span
      className="type-ico"
      title={name}
      style={{
        width: size,
        height: size,
        backgroundColor: swatch,
        color: "#fff",
        borderRadius: 3,
        display: "inline-grid",
        placeItems: "center",
        fontSize: Math.max(8, Math.round(size * 0.7)),
        fontWeight: 700,
        lineHeight: 1,
      }}
    >
      {initial}
    </span>
  );
}

// API-driven priority icon: Jira-style up/down arrows whose direction comes
// from the priority's *rank percentile* within the OpenProject priorities
// list — a top-quintile priority points up twice, the bottom quintile down
// twice, the middle is a flat double dash. No keyword matching: shape is a
// pure function of `position` and `totalPositions`, both API truth.
//
// Lower OP `position` = higher rank (matches OP's own UI). When `position` or
// `totalPositions` is missing, fall back to a level (medium) glyph so the
// icon still renders.
function rankShape(position, totalPositions) {
  if (
    typeof position !== "number" ||
    typeof totalPositions !== "number" ||
    totalPositions <= 0
  ) {
    return "level";
  }
  // Normalise to 0..1, where 0 is the highest-priority entry and 1 the
  // lowest. A single-priority list collapses to "level".
  const denom = Math.max(1, totalPositions - 1);
  const norm = Math.max(0, Math.min(1, (position - 1) / denom));
  if (norm <= 0.2) return "highest";
  if (norm <= 0.45) return "high";
  if (norm >= 0.8) return "lowest";
  if (norm >= 0.55) return "low";
  return "level";
}

export function PriorityIcon({ name, color, position, totalPositions, size = 14 }) {
  if (!name) return null;
  const stroke = color || "var(--text-3)";
  const shape = rankShape(position, totalPositions);
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke,
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  };
  return (
    <span
      className="priority-ico"
      title={name}
      style={{ color: stroke, width: size, height: size }}
    >
      {shape === "level" ? (
        <svg {...common}>
          <path d="M3 6h10M3 10h10" />
        </svg>
      ) : shape === "high" ? (
        <svg {...common}>
          <path d="M3 10l5-5 5 5" />
        </svg>
      ) : shape === "highest" ? (
        <svg {...common}>
          <path d="M3 14l5-5 5 5" />
          <path d="M3 9l5-5 5 5" />
        </svg>
      ) : shape === "low" ? (
        <svg {...common}>
          <path d="M3 6l5 5 5-5" />
        </svg>
      ) : (
        <svg {...common}>
          <path d="M3 2l5 5 5-5" />
          <path d="M3 7l5 5 5-5" />
        </svg>
      )}
    </span>
  );
}
