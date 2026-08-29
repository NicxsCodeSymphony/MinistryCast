import { useEffect, useMemo, useState } from "react";
import CategoryFormModal, {
  type CategoryColor,
  type CategoryFormValues,
} from "../../components/modals/CategoryFormModal";
import ConfirmDialog from "../../components/modals/ConfirmDialog";
import { CardGridSkeleton } from "../../components/Skeleton";
import {
  createCategory,
  deleteCategory,
  listCategories,
  updateCategory,
} from "../../lib/api";
import { categoryTone, categoryVisual } from "../../lib/categoryColor";
import { usePrefs } from "../../lib/PrefsContext";
import { useSearch } from "../../lib/SearchContext";
import { useToast } from "../../lib/ToastContext";
import { getSessionProfile, isSuperadmin } from "../../lib/auth";
import { subscribeContent } from "../../lib/offline/live";
import { LoadMoreBar } from "../../components/LoadMoreBar";
import { PAGE_SIZE, type Category } from "../../lib/types";

export default function Categories() {
  const { t } = usePrefs();
  const toast = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [error, setError] = useState("");
  const { query } = useSearch();
  const [workspaceId, setWorkspaceId] = useState("");
  const [superadmin, setSuperadmin] = useState(false);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((card) =>
      [card.name, card.description ?? ""].some((s) =>
        s.toLowerCase().includes(q),
      ),
    );
  }, [categories, query]);
  const paged = visible.slice(0, visibleCount);

  const load = async () => {
    setError("");
    setCategories(await listCategories());
  };

  useEffect(() => {
    void (async () => {
      try {
        const profile = await getSessionProfile();
        setWorkspaceId(profile.church?.id ?? "");
        setSuperadmin(isSuperadmin(profile));
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : t("categories.loadError"));
        toast.error(err instanceof Error ? err.message : t("categories.loadError"));
      } finally {
        setLoading(false);
      }
    })();
    return subscribeContent(() => {
      void load();
    });
  }, []);

  const editing = categories.find((card) => card.id === editingId);
  const deleting = categories.find((card) => card.id === deleteId);

  const handleSave = async (values: CategoryFormValues) => {
    try {
      if (editingId) {
        await updateCategory(editingId, values);
        toast.success("Category updated.");
      } else {
        await createCategory(values);
        toast.success("Category created.");
      }
      setFormOpen(false);
      setEditingId(null);
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : t("categories.saveError");
      setError(message);
      toast.error(message);
      throw err;
    }
  };

  return (
    <section className="h-full overflow-y-auto custom-scrollbar relative bg-surface-container-lowest">
      <div className="pointer-events-none fixed top-[-10%] right-[-10%] w-[500px] h-[500px] bg-primary/10 rounded-full blur-[120px]" />
      <div className="relative max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-8">
          <div>
            <h2 className="text-[clamp(1.75rem,3vw,2rem)] font-semibold tracking-[-0.01em] text-on-surface mb-2">
              {t("categories.title")}
            </h2>
            <p className="text-on-surface-variant">
              Shared with every church. Add a category here and everyone can use it.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setEditingId(null);
              setFormOpen(true);
            }}
            className="flex items-center gap-2 bg-gradient-to-r from-primary-container to-secondary-container text-white px-6 py-2.5 rounded-full text-xs font-semibold hover:opacity-90 active:scale-95 transition-transform self-start sm:self-auto"
          >
            <span className="material-symbols-outlined text-[20px]">add</span>
            {t("categories.add")}
          </button>
        </div>

        {error ? <p className="mb-6 text-sm text-[#ffb4ab]">{error}</p> : null}

        {loading ? (
          <CardGridSkeleton />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {paged.map((card) => {
              const visual = categoryVisual[categoryTone(card.color)];
              return (
              <div
                key={card.id}
                className={`category-glass-card p-6 rounded-xl relative group overflow-hidden border ${visual.wash}`}
              >
                <div className={`absolute inset-y-0 left-0 w-1.5 ${visual.bar}`} />
                <div
                  className="pointer-events-none absolute -top-10 -right-8 w-32 h-32 rounded-full blur-2xl opacity-50"
                  style={{ backgroundColor: visual.hex }}
                />
                  {superadmin || card.church_id === workspaceId ? (
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
                    aria-label={t("categories.more", { name: card.name })}
                  >
                    <span className="material-symbols-outlined">more_vert</span>
                  </button>
                  {menuId === card.id ? (
                    <div className="absolute right-0 mt-1 w-36 glass-modal rounded-xl py-1 z-10 shadow-xl">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(card.id);
                          setMenuId(null);
                          setFormOpen(true);
                        }}
                        className="w-full text-left px-3 py-2 text-xs text-on-surface hover:bg-white/5"
                      >
                        {t("categories.edit")}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMenuId(null);
                          setDeleteId(card.id);
                        }}
                        className="w-full text-left px-3 py-2 text-xs text-error hover:bg-white/5"
                      >
                        {t("categories.delete")}
                      </button>
                    </div>
                  ) : null}
                </div>
                  ) : null}

                <div
                  className={`w-12 h-12 rounded-lg flex items-center justify-center mb-4 ${visual.icon}`}
                >
                  <span className="material-symbols-outlined filled text-[28px]">
                    {card.icon || "category"}
                  </span>
                </div>
                <h3 className="text-[20px] font-semibold text-on-surface mb-1">
                  {card.name}
                </h3>
                <p className="text-sm text-on-surface-variant mb-6 leading-relaxed">
                  {card.description || t("categories.noDescription")}
                </p>
                <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full border w-fit ${visual.chip}`}>
                  <span className="material-symbols-outlined text-[14px]">
                    music_note
                  </span>
                  <span className="text-xs font-medium">
                    {t("categories.songsCount", { n: card.song_count ?? 0 })}
                  </span>
                </div>
              </div>
            );
            })}

            {visible.length === 0 && query.trim() ? (
              <p className="col-span-full text-sm text-on-surface-variant py-8 text-center">
                {t("categories.emptyQuery", { q: query.trim() })}
              </p>
            ) : null}

            {query.trim() ? null : (
              <button
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setFormOpen(true);
                }}
                className="border-2 border-dashed border-white/10 rounded-xl flex flex-col items-center justify-center p-6 hover:border-primary/40 hover:bg-white/5 cursor-pointer transition-all group min-h-[220px]"
              >
                <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-3 group-hover:bg-primary/20 transition-colors">
                  <span className="material-symbols-outlined text-on-surface-variant group-hover:text-primary transition-colors">
                    add_circle
                  </span>
                </div>
                <p className="text-xs text-on-surface-variant group-hover:text-primary transition-colors">
                  {t("categories.createCustom")}
                </p>
              </button>
            )}
          </div>
        )}
        <LoadMoreBar
          shown={paged.length}
          total={visible.length}
          hasMore={paged.length < visible.length}
          onMore={() => setVisibleCount((n) => n + PAGE_SIZE)}
        />
      </div>

      <CategoryFormModal
        open={formOpen}
        mode={editing ? "edit" : "create"}
        initialValues={
          editing
            ? {
                name: editing.name,
                description: editing.description ?? "",
                icon: editing.icon ?? "auto_awesome",
                color: (editing.color as CategoryColor) || "primary",
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
        title={t("categories.deleteTitle")}
        description={t("categories.deleteDesc", { name: deleting?.name ?? "" })}
        highlight={deleting ? `"${deleting.name}"` : undefined}
        onClose={() => setDeleteId(null)}
        onConfirm={async () => {
          if (!deleteId) return;
          try {
            await deleteCategory(deleteId);
            setDeleteId(null);
            await load();
            toast.success("Category deleted.");
          } catch (err) {
            const message =
              err instanceof Error ? err.message : t("categories.deleteError");
            setError(message);
            toast.error(message);
            throw err;
          }
        }}
      />
    </section>
  );
}
