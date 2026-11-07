import { useEffect, useMemo, useState } from "react";
import CategoryFormModal, {
  type CategoryColor,
  type CategoryFormValues,
} from "../../components/modals/CategoryFormModal";
import ConfirmDialog from "../../components/modals/ConfirmDialog";
import { Skeleton } from "../../components/Skeleton";
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
import { getSessionProfile } from "../../lib/auth";
import { subscribeContent } from "../../lib/offline/live";
import { LoadMoreBar } from "../../components/LoadMoreBar";
import { PAGE_SIZE, type Category } from "../../lib/types";
import Icon from "../../components/Icon";
import { Button, PageHeader, RowMenu } from "../../components/ui";
import {
  BarList,
  BentoCard,
  BentoGrid,
  SegmentedBar,
  Sparkline,
} from "../../components/bento";
import { useSongInsights } from "../../components/library/LibraryInsights";
import type { CategoryStat } from "../../components/library/insightsData";

function canManageLibraryRole(role: string | undefined) {
  return role === "superadmin" || role === "admin" || role === "producer";
}

function CategoriesSkeleton() {
  return (
    <BentoGrid>
      <div className="col-span-1 sm:col-span-6 lg:col-span-8 rounded-[14px] border border-white/5 bg-surface-container p-5 space-y-4" aria-hidden>
        <Skeleton className="h-3 w-32 rounded" />
        <Skeleton className="h-8 w-20 rounded" />
        <Skeleton className="h-2 w-full rounded" />
      </div>
      <div className="col-span-1 sm:col-span-6 lg:col-span-4 rounded-[14px] border border-white/5 bg-surface-container p-5 space-y-3" aria-hidden>
        <Skeleton className="h-3 w-28 rounded" />
        <Skeleton className="h-2 w-full rounded" />
        <Skeleton className="h-2 w-3/4 rounded" />
      </div>
      {Array.from({ length: 6 }, (_, i) => (
        <div
          key={i}
          aria-hidden
          className="col-span-1 sm:col-span-3 lg:col-span-4 rounded-[14px] border border-white/5 bg-surface-container p-5 space-y-3"
        >
          <Skeleton className="h-9 w-9 rounded-lg" />
          <Skeleton className="h-4 w-32 rounded" />
          <Skeleton className="h-3 w-48 max-w-full rounded" />
        </div>
      ))}
    </BentoGrid>
  );
}

function CategoryCard({
  card,
  stat,
  canManage,
  onEdit,
  onDelete,
}: {
  card: Category;
  stat: CategoryStat | undefined;
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = usePrefs();
  const visual = categoryVisual[categoryTone(card.color)];
  const songs = card.song_count ?? stat?.songs ?? 0;
  const scheduled = stat?.scheduled ?? 0;
  const trend = stat?.weekly ?? [];
  return (
    <BentoCard span={4} aria-label={card.name} className="group">
      <div className="flex items-start justify-between gap-3">
        <span
          className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${visual.icon}`}
          aria-hidden
        >
          <Icon name={card.icon || "category"} className="filled text-[18px]" />
        </span>
        {canManage ? (
          <div className="lg:opacity-0 group-hover:opacity-100 focus-within:opacity-100 has-[[aria-expanded=true]]:opacity-100 transition-opacity -mr-1.5 -mt-1">
            <RowMenu
              label={t("categories.more", { name: card.name })}
              items={[
                { label: t("categories.edit"), icon: "edit", onSelect: onEdit },
                { label: t("categories.delete"), icon: "delete", danger: true, onSelect: onDelete },
              ]}
            />
          </div>
        ) : null}
      </div>
      <h3 className="mt-3 text-[15px] font-semibold text-on-surface truncate">{card.name}</h3>
      <p className="mt-1 text-[13px] text-on-surface-variant leading-relaxed line-clamp-2 min-h-[2.6em]">
        {card.description || t("categories.noDescription")}
      </p>
      <div className="mt-auto pt-4 flex items-end justify-between gap-3 border-t border-white/5 -mx-5 px-5">
        <dl className="flex items-center gap-5 text-[12px]">
          <div>
            <dt className="text-on-surface-variant">Songs</dt>
            <dd className="mt-0.5 text-[15px] font-semibold text-on-surface tabular-nums">{songs}</dd>
          </div>
          <div>
            <dt className="text-on-surface-variant">Times scheduled</dt>
            <dd className="mt-0.5 text-[15px] font-semibold text-on-surface tabular-nums">{scheduled}</dd>
          </div>
        </dl>
        {trend.some((v) => v > 0) ? (
          <Sparkline values={trend} label={`${card.name} times scheduled per week`} className="w-20 h-7 shrink-0" />
        ) : null}
      </div>
    </BentoCard>
  );
}

export default function Categories() {
  const { t } = usePrefs();
  const toast = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [error, setError] = useState("");
  const { query } = useSearch();
  const [canManageLibrary, setCanManageLibrary] = useState(false);
  const insights = useSongInsights(categories);
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
        setCanManageLibrary(canManageLibraryRole(profile.user?.role));
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

  const openCreate = () => {
    setEditingId(null);
    setFormOpen(true);
  };

  const categorized = categories.reduce((sum, card) => sum + (card.song_count ?? 0), 0);
  const totalSongs = insights?.total ?? categorized;
  const ranking = categories
    .map((card) => ({ label: card.name, value: insights?.categories[card.id]?.scheduled ?? 0 }))
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 4);

  return (
    <section className="h-full flex flex-col bg-surface-container-lowest">
      <PageHeader
        title={t("categories.title")}
        meta={categories.length === 1 ? "1 category" : `${categories.length} categories`}
        actions={
          <Button variant="primary" icon="add" onClick={openCreate}>
            {t("categories.add")}
          </Button>
        }
      />
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
        <div className="px-4 sm:px-6 py-6">
          {error ? <p className="mb-4 text-[13px] text-error">{error}</p> : null}

          {loading ? (
            <CategoriesSkeleton />
          ) : (
            <BentoGrid>
              <BentoCard
                span={8}
                accent
                title="Songs by category"
                subtitle={t("categories.subtitle")}
              >
                <div className="flex items-end gap-8 mb-4">
                  <div>
                    <p className="text-[32px] font-semibold tracking-[-0.02em] text-on-surface leading-none tabular-nums">
                      {totalSongs}
                    </p>
                    <p className="mt-1.5 text-[12px] text-on-surface-variant">Songs in the library</p>
                  </div>
                  <div>
                    <p className="text-[32px] font-semibold tracking-[-0.02em] text-on-surface leading-none tabular-nums">
                      {totalSongs ? `${Math.round((categorized / totalSongs) * 100)}%` : "—"}
                    </p>
                    <p className="mt-1.5 text-[12px] text-on-surface-variant">Categorized</p>
                  </div>
                </div>
                <div className="mt-auto">
                  {totalSongs ? (
                    <SegmentedBar
                      parts={insights?.byCategory ?? []}
                      label="Songs by category"
                    />
                  ) : (
                    <p className="text-[13px] text-on-surface-variant">No songs yet.</p>
                  )}
                </div>
              </BentoCard>
              <BentoCard span={4} title="Most scheduled" subtitle="Times its songs were scheduled">
                <BarList
                  data={ranking}
                  label="Categories by times scheduled"
                  format={(v) => `${v}×`}
                  empty="No songs scheduled yet."
                />
              </BentoCard>

              {paged.map((card) => (
                <CategoryCard
                  key={card.id}
                  card={card}
                  stat={insights?.categories[card.id]}
                  canManage={canManageLibrary}
                  onEdit={() => {
                    setEditingId(card.id);
                    setFormOpen(true);
                  }}
                  onDelete={() => setDeleteId(card.id)}
                />
              ))}

              {visible.length === 0 && query.trim() ? (
                <p className="col-span-full text-[13px] text-on-surface-variant py-8 text-center">
                  {t("categories.emptyQuery", { q: query.trim() })}
                </p>
              ) : null}

              {query.trim() ? null : (
                <button
                  type="button"
                  onClick={openCreate}
                  className="col-span-1 sm:col-span-3 lg:col-span-4 min-h-[180px] rounded-[14px] border border-dashed border-white/10 flex flex-col items-center justify-center gap-2 text-on-surface-variant hover:text-on-surface hover:border-white/20 hover:bg-white/[0.02] transition-colors"
                >
                  <Icon name="add" className="text-[18px]" />
                  <span className="text-[13px]">{t("categories.createCustom")}</span>
                </button>
              )}
            </BentoGrid>
          )}
          <LoadMoreBar
            shown={paged.length}
            total={visible.length}
            hasMore={paged.length < visible.length}
            onMore={() => setVisibleCount((n) => n + PAGE_SIZE)}
          />
        </div>
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
