import { useState } from "react";
import CategoryFormModal, {
  type CategoryColor,
  type CategoryFormValues,
} from "../../components/modals/CategoryFormModal";
import ConfirmDialog from "../../components/modals/ConfirmDialog";

type CategoryCard = {
  id: string;
  title: string;
  description: string;
  icon: string;
  color: CategoryColor;
  songCount: number;
  highlighted?: boolean;
  footer: "avatars" | "urgent" | "trend" | "active" | "star";
};

const initialCategories: CategoryCard[] = [
  {
    id: "1",
    title: "Call to Worship",
    description:
      "The opening sequence designed to focus the hearts of the congregation.",
    icon: "notifications_active",
    color: "primary",
    songCount: 12,
    footer: "avatars",
  },
  {
    id: "2",
    title: "Opening Song",
    description:
      "High-energy anthems that invite participation and celebration.",
    icon: "queue_music",
    color: "secondary",
    songCount: 28,
    footer: "urgent",
  },
  {
    id: "3",
    title: "Praise",
    description:
      "Fast to mid-tempo selections focused on the attributes of God.",
    icon: "bolt",
    color: "tertiary",
    songCount: 42,
    footer: "trend",
  },
  {
    id: "4",
    title: "Worship",
    description: "Intimate, slow-tempo songs for deep personal reflection.",
    icon: "favorite",
    color: "primary",
    songCount: 56,
    highlighted: true,
    footer: "active",
  },
  {
    id: "5",
    title: "Holy of Holies",
    description: "The peak moments of spiritual encounter and reverence.",
    icon: "brightness_high",
    color: "accent",
    songCount: 15,
    footer: "star",
  },
];

const colorClass: Record<CategoryColor, string> = {
  primary: "bg-primary/10 text-primary",
  secondary: "bg-secondary/10 text-secondary",
  tertiary: "bg-tertiary/10 text-tertiary",
  error: "bg-error/10 text-error",
  accent: "bg-primary-container/20 text-primary-container",
};

const chartBars = [
  { label: "Call", height: "40%", color: "bg-primary/20 hover:bg-primary/40" },
  {
    label: "Opening",
    height: "65%",
    color: "bg-secondary/20 hover:bg-secondary/40",
  },
  {
    label: "Praise",
    height: "85%",
    color: "bg-tertiary/20 hover:bg-tertiary/40",
  },
  {
    label: "Worship",
    height: "100%",
    color: "bg-primary/40 hover:bg-primary/60",
  },
  { label: "Holy", height: "50%", color: "bg-white/10 hover:bg-white/20" },
];

function CardFooter({ type }: { type: CategoryCard["footer"] }) {
  if (type === "avatars") {
    return (
      <div className="flex -space-x-2">
        <div className="w-6 h-6 rounded-full border-2 border-surface-container-high bg-slate-600" />
        <div className="w-6 h-6 rounded-full border-2 border-surface-container-high bg-slate-400" />
        <div className="w-6 h-6 rounded-full border-2 border-surface-container-high bg-slate-700 flex items-center justify-center text-[8px]">
          +3
        </div>
      </div>
    );
  }
  if (type === "urgent") {
    return (
      <div className="px-2 py-0.5 rounded bg-error/10 text-error text-[10px] font-bold">
        URGENT UPDATE
      </div>
    );
  }
  if (type === "trend") {
    return (
      <span className="material-symbols-outlined text-on-surface-variant/30">
        trending_up
      </span>
    );
  }
  if (type === "active") {
    return (
      <div className="flex items-center gap-1 text-primary animate-pulse">
        <div className="w-2 h-2 rounded-full bg-primary" />
        <span className="text-[10px] font-bold">ACTIVE IN REHEARSAL</span>
      </div>
    );
  }
  return <span className="material-symbols-outlined text-tertiary">star</span>;
}

export default function Categories() {
  const [categories, setCategories] = useState(initialCategories);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const editing = categories.find((card) => card.id === editingId);
  const deleting = categories.find((card) => card.id === deleteId);

  const openCreate = () => {
    setEditingId(null);
    setMenuId(null);
    setFormOpen(true);
  };

  const openEdit = (id: string) => {
    setEditingId(id);
    setMenuId(null);
    setFormOpen(true);
  };

  const handleSave = (values: CategoryFormValues) => {
    if (editingId) {
      setCategories((prev) =>
        prev.map((card) =>
          card.id === editingId
            ? {
                ...card,
                title: values.name,
                description: values.description,
                icon: values.icon,
                color: values.color,
              }
            : card,
        ),
      );
    } else {
      setCategories((prev) => [
        ...prev,
        {
          id: String(Date.now()),
          title: values.name,
          description: values.description,
          icon: values.icon,
          color: values.color,
          songCount: 0,
          footer: "trend",
        },
      ]);
    }
    setFormOpen(false);
    setEditingId(null);
  };

  return (
    <section className="h-full overflow-y-auto custom-scrollbar relative bg-[#050505]">
      <div className="pointer-events-none fixed top-[-10%] right-[-10%] w-[500px] h-[500px] bg-primary/10 rounded-full blur-[120px]" />
      <div className="pointer-events-none fixed bottom-[-5%] left-[-5%] w-[400px] h-[400px] bg-secondary/10 rounded-full blur-[100px]" />

      <div className="relative max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-8">
          <div>
            <h2 className="text-[clamp(1.75rem,3vw,2rem)] font-semibold tracking-[-0.01em] text-on-surface mb-2">
              Category Management
            </h2>
            <p className="text-on-surface-variant">
              Define and organize the flow of your worship services.
            </p>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="flex items-center gap-2 bg-gradient-to-r from-primary-container to-secondary-container text-white px-6 py-2.5 rounded-full text-xs font-semibold hover:opacity-90 active:scale-95 transition-transform self-start sm:self-auto"
          >
            <span className="material-symbols-outlined text-[20px]">add</span>
            Add Category
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {categories.map((card) => (
            <div
              key={card.id}
              className={`category-glass-card p-6 rounded-xl relative group ${
                card.highlighted ? "border-primary/20 bg-primary/5" : ""
              }`}
            >
              <div
                className={`absolute top-4 right-4 transition-opacity ${
                  menuId === card.id
                    ? "opacity-100"
                    : "opacity-0 group-hover:opacity-100 focus-within:opacity-100"
                }`}
              >
                <button
                  type="button"
                  onClick={() =>
                    setMenuId((prev) => (prev === card.id ? null : card.id))
                  }
                  className="p-1 hover:bg-white/10 rounded-lg text-on-surface-variant"
                  aria-label={`More actions for ${card.title}`}
                >
                  <span className="material-symbols-outlined">more_vert</span>
                </button>
                {menuId === card.id ? (
                  <div className="absolute right-0 mt-1 w-36 glass-modal rounded-xl py-1 z-10 shadow-xl">
                    <button
                      type="button"
                      onClick={() => openEdit(card.id)}
                      className="w-full text-left px-3 py-2 text-xs text-on-surface hover:bg-white/5"
                    >
                      Edit Details
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMenuId(null);
                        setDeleteId(card.id);
                      }}
                      className="w-full text-left px-3 py-2 text-xs text-error hover:bg-white/5"
                    >
                      Delete
                    </button>
                  </div>
                ) : null}
              </div>

              <div
                className={`w-12 h-12 rounded-lg flex items-center justify-center mb-4 ${
                  card.highlighted
                    ? "bg-primary/20 text-primary"
                    : colorClass[card.color]
                }`}
              >
                <span
                  className={`material-symbols-outlined text-[28px] ${
                    card.highlighted ? "filled" : ""
                  }`}
                >
                  {card.icon}
                </span>
              </div>

              <h3 className="text-[20px] font-semibold text-on-surface mb-1">
                {card.title}
              </h3>
              <p className="text-sm text-on-surface-variant mb-6 leading-relaxed">
                {card.description}
              </p>

              <div className="flex items-center justify-between gap-3">
                <div
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-full border ${
                    card.highlighted
                      ? "bg-primary/20 border-primary/20"
                      : "bg-white/5 border-white/5"
                  }`}
                >
                  <span
                    className={`material-symbols-outlined text-[14px] ${
                      card.highlighted
                        ? "text-primary"
                        : "text-on-surface-variant"
                    }`}
                  >
                    music_note
                  </span>
                  <span
                    className={`text-xs ${
                      card.highlighted
                        ? "text-primary"
                        : "text-on-surface-variant"
                    }`}
                  >
                    {card.songCount} Songs
                  </span>
                </div>
                <CardFooter type={card.footer} />
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={openCreate}
            className="border-2 border-dashed border-white/10 rounded-xl flex flex-col items-center justify-center p-6 hover:border-primary/40 hover:bg-white/5 cursor-pointer transition-all group min-h-[220px]"
          >
            <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-3 group-hover:bg-primary/20 transition-colors">
              <span className="material-symbols-outlined text-on-surface-variant group-hover:text-primary transition-colors">
                add_circle
              </span>
            </div>
            <p className="text-xs text-on-surface-variant group-hover:text-primary transition-colors">
              Create Custom Category
            </p>
          </button>
        </div>

        <div className="mt-12 category-glass-card rounded-2xl p-6 sm:p-8 border-none bg-gradient-to-br from-surface-container-high/60 to-surface-container-low/40">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
            <div>
              <h4 className="text-2xl font-semibold text-on-surface">
                Resource Utilization
              </h4>
              <p className="text-xs text-on-surface-variant mt-1">
                Distribution of musical assets across worship phases.
              </p>
            </div>
            <button
              type="button"
              className="bg-surface-variant/50 hover:bg-surface-variant px-4 py-1.5 rounded-lg text-xs font-medium self-start sm:self-auto"
            >
              Export Report
            </button>
          </div>

          <div className="flex items-end gap-1 h-32 mb-4">
            {chartBars.map((bar) => (
              <div
                key={bar.label}
                className={`flex-1 rounded-t-lg transition-all duration-500 ${bar.color}`}
                style={{ height: bar.height }}
                title={bar.label}
              />
            ))}
          </div>
          <div className="flex justify-between px-2">
            {chartBars.map((bar) => (
              <span
                key={bar.label}
                className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold"
              >
                {bar.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      <CategoryFormModal
        open={formOpen}
        mode={editing ? "edit" : "create"}
        initialValues={
          editing
            ? {
                name: editing.title,
                description: editing.description,
                icon: editing.icon,
                color: editing.color,
              }
            : undefined
        }
        onClose={() => {
          setFormOpen(false);
          setEditingId(null);
        }}
        onSubmit={handleSave}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete Category?"
        description={`Are you sure you want to delete "${deleting?.title ?? ""}"? This action cannot be undone.`}
        highlight={deleting ? `"${deleting.title}"` : undefined}
        onClose={() => setDeleteId(null)}
        onConfirm={() => {
          if (!deleteId) return;
          setCategories((prev) => prev.filter((card) => card.id !== deleteId));
          setDeleteId(null);
        }}
      />
    </section>
  );
}
