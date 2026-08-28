import { useState } from "react";
import { Link } from "react-router-dom";
import ConfirmDialog from "../../components/modals/ConfirmDialog";

type Slide = {
  id: string;
  content: string;
  verse: string;
  graphic?: string;
};

const initialSlides: Slide[] = [
  {
    id: "1",
    content:
      "God is seeking true worshippers who will worship Him in spirit and in truth.",
    verse: "John 4:23",
    graphic: "Default Visual",
  },
  {
    id: "2",
    content:
      "True worship is not about the mountain or Jerusalem, but about the posture of the heart.",
    verse: "",
  },
];

export default function Sermon() {
  const [title, setTitle] = useState("The Heart of Worship");
  const [scripture, setScripture] = useState("John 4:23-24");
  const [speaker, setSpeaker] = useState("Pastor David");
  const [date, setDate] = useState("2023-10-22");
  const [duration, setDuration] = useState("35:00");
  const [slides, setSlides] = useState(initialSlides);
  const [deleteSlideId, setDeleteSlideId] = useState<string | null>(null);
  const deletingSlide = slides.find((slide) => slide.id === deleteSlideId);

  const updateSlide = (id: string, patch: Partial<Slide>) => {
    setSlides((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    );
  };

  const addSlide = () => {
    setSlides((prev) => [
      ...prev,
      {
        id: String(Date.now()),
        content: "",
        verse: "",
      },
    ]);
  };

  const removeSlide = (id: string) => {
    setSlides((prev) => prev.filter((s) => s.id !== id));
  };

  return (
    <section className="h-full overflow-y-auto custom-scrollbar bg-[#050505] p-4 sm:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
          <nav className="flex flex-wrap items-center gap-2 text-xs text-on-surface-variant">
            <Link to="/songs" className="hover:text-primary">
              Library
            </Link>
            <span className="material-symbols-outlined text-sm">
              chevron_right
            </span>
            <span className="hover:text-primary cursor-pointer">Sermons</span>
            <span className="material-symbols-outlined text-sm">
              chevron_right
            </span>
            <span className="text-primary">Transcription Mode</span>
          </nav>
          <div className="flex items-center gap-3">
            <Link
              to="/setlists"
              className="px-5 py-2 rounded-lg text-sm text-on-surface-variant hover:bg-surface-variant transition-all"
            >
              Cancel
            </Link>
            <button
              type="button"
              className="px-6 sm:px-8 py-2.5 rounded-lg text-sm font-bold bg-gradient-to-r from-primary-container to-secondary-container text-white shadow-lg hover:shadow-primary/20 transition-all active:scale-95 flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-sm">save</span>
              Save Sermon
            </button>
          </div>
        </div>

        <div className="glass-panel rounded-xl p-4 sm:p-6 border-l-4 border-primary mb-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8">
              <label className="block text-[12px] font-semibold tracking-[0.05em] uppercase text-primary mb-2">
                Sermon Title
              </label>
              <input
                className="w-full bg-transparent border-b border-outline-variant/30 py-3 sm:py-4 text-[clamp(1.5rem,3vw,2rem)] font-semibold text-on-surface focus:border-primary focus:outline-none transition-all placeholder:opacity-30"
                placeholder="Enter sermon title..."
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="lg:col-span-4">
              <label className="block text-[12px] font-semibold tracking-[0.05em] uppercase text-primary mb-2">
                Primary Scripture
              </label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-0 top-1/2 -translate-y-1/2 text-on-surface-variant">
                  menu_book
                </span>
                <input
                  className="w-full bg-transparent border-b border-outline-variant/30 py-3 sm:py-4 pl-8 text-[clamp(1.125rem,2vw,1.5rem)] font-semibold text-on-surface focus:border-primary focus:outline-none transition-all placeholder:opacity-30"
                  placeholder="e.g. John 4:23"
                  type="text"
                  value={scripture}
                  onChange={(e) => setScripture(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-4 sm:gap-6">
          <div className="col-span-12 lg:col-span-8 flex flex-col gap-4 sm:gap-6">
            <section className="glass-panel rounded-xl flex flex-col min-h-[520px] overflow-hidden">
              <div className="p-4 border-b border-outline-variant/10 flex items-center justify-between bg-surface-container-low/50">
                <h3 className="text-[12px] font-semibold tracking-[0.05em] uppercase text-on-surface-variant flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm">
                    edit_note
                  </span>
                  Transcription Flow
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="p-2 rounded-md hover:bg-surface-variant text-on-surface-variant transition-colors"
                    title="Paste text"
                  >
                    <span className="material-symbols-outlined text-sm">
                      content_paste
                    </span>
                  </button>
                  <button
                    type="button"
                    className="p-2 rounded-md hover:bg-surface-variant text-on-surface-variant transition-colors"
                    title="Toggle grid"
                  >
                    <span className="material-symbols-outlined text-sm">
                      grid_on
                    </span>
                  </button>
                </div>
              </div>

              <div className="flex-grow p-4 sm:p-6 notepad-lines">
                <div className="space-y-6">
                  {slides.map((slide, index) => (
                    <div
                      key={slide.id}
                      className="relative group bg-surface-container/20 rounded-lg p-4 sm:p-6 border border-outline-variant/10 hover:border-primary/30 transition-all ml-3"
                    >
                      <div className="absolute -left-3 top-6 w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary ring-4 ring-[#050505]">
                        {String(index + 1).padStart(2, "0")}
                      </div>
                      <div className="flex flex-col gap-4">
                        <textarea
                          className="w-full bg-transparent border-none focus:ring-0 focus:outline-none text-base sm:text-lg font-medium text-on-surface resize-none placeholder:text-on-surface-variant/30 leading-relaxed"
                          placeholder="Main slide content or talking point..."
                          rows={2}
                          value={slide.content}
                          onChange={(e) =>
                            updateSlide(slide.id, { content: e.target.value })
                          }
                        />
                        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-outline-variant/5">
                          <div className="flex items-center gap-2 bg-surface-container-low px-3 py-1 rounded-full border border-outline-variant/20">
                            <span className="material-symbols-outlined text-sm text-primary">
                              menu_book
                            </span>
                            <input
                              className="bg-transparent border-none focus:outline-none text-xs text-on-surface-variant w-28 p-0"
                              placeholder="Add verse..."
                              type="text"
                              value={slide.verse}
                              onChange={(e) =>
                                updateSlide(slide.id, { verse: e.target.value })
                              }
                            />
                          </div>
                          {slide.graphic ? (
                            <div className="flex items-center gap-2 bg-surface-container-low px-3 py-1 rounded-full border border-outline-variant/20">
                              <span className="material-symbols-outlined text-sm text-secondary">
                                image
                              </span>
                              <span className="text-xs text-on-surface-variant">
                                {slide.graphic}
                              </span>
                            </div>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => setDeleteSlideId(slide.id)}
                            className="ml-auto text-on-surface-variant hover:text-error opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <span className="material-symbols-outlined text-lg">
                              delete
                            </span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}

                  <div className="flex flex-col sm:flex-row gap-4 mt-8">
                    <button
                      type="button"
                      onClick={addSlide}
                      className="flex-1 border-2 border-dashed border-outline-variant/20 rounded-xl py-8 flex flex-col items-center justify-center text-on-surface-variant hover:border-primary/40 hover:bg-primary/5 hover:text-primary transition-all group"
                    >
                      <span className="material-symbols-outlined text-2xl mb-2 group-hover:scale-110 transition-transform">
                        add_circle
                      </span>
                      <span className="font-bold text-sm uppercase tracking-wider">
                        Add New Slide
                      </span>
                      <p className="text-[10px] mt-1 opacity-60 italic">
                        Shift + Enter for quick add
                      </p>
                    </button>
                    <button
                      type="button"
                      className="flex-1 border-2 border-dashed border-outline-variant/20 rounded-xl py-8 flex flex-col items-center justify-center text-on-surface-variant hover:border-secondary/40 hover:bg-secondary/5 hover:text-secondary transition-all group"
                    >
                      <span className="material-symbols-outlined text-2xl mb-2 group-hover:scale-110 transition-transform">
                        sticky_note_2
                      </span>
                      <span className="font-bold text-sm uppercase tracking-wider">
                        Add Private Note
                      </span>
                      <p className="text-[10px] mt-1 opacity-60 italic">
                        Not shown on presentation
                      </p>
                    </button>
                  </div>
                </div>
              </div>
            </section>

            <section className="glass-panel rounded-xl p-4 sm:p-6">
              <h3 className="text-[12px] font-semibold tracking-[0.05em] uppercase text-primary mb-4">
                Metadata & Attributes
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-on-surface-variant mb-1.5 ml-1">
                    Speaker
                  </label>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-sm">
                      person
                    </span>
                    <input
                      className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-lg py-3 pl-10 pr-4 text-sm text-on-surface focus:border-primary focus:outline-none focus:shadow-[0_0_10px_rgba(155,203,255,0.3)] transition-all"
                      type="text"
                      value={speaker}
                      onChange={(e) => setSpeaker(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-on-surface-variant mb-1.5 ml-1">
                    Service Date
                  </label>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-sm">
                      calendar_today
                    </span>
                    <input
                      className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-lg py-3 pl-10 pr-4 text-sm text-on-surface focus:border-primary focus:outline-none focus:shadow-[0_0_10px_rgba(155,203,255,0.3)] transition-all"
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-on-surface-variant mb-1.5 ml-1">
                    Duration
                  </label>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-sm">
                      timer
                    </span>
                    <input
                      className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-lg py-3 pl-10 pr-4 text-sm text-on-surface focus:border-primary focus:outline-none focus:shadow-[0_0_10px_rgba(155,203,255,0.3)] transition-all"
                      type="text"
                      value={duration}
                      onChange={(e) => setDuration(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </section>
          </div>

          <div className="col-span-12 lg:col-span-4 flex flex-col gap-4 sm:gap-6">
            <div className="glass-panel rounded-xl overflow-hidden group relative">
              <div className="w-full h-48 bg-gradient-to-br from-amber-900/40 via-[#2a1a14] to-[#121212] group-hover:scale-105 transition-transform duration-500" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#121212] via-transparent to-transparent" />
              <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end">
                <div>
                  <span className="text-[12px] font-semibold tracking-[0.05em] uppercase text-primary">
                    Sermon Visual
                  </span>
                  <p className="text-sm text-on-surface">Series: The Heart</p>
                </div>
                <button
                  type="button"
                  className="w-8 h-8 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center hover:bg-primary/20 transition-all"
                >
                  <span className="material-symbols-outlined text-sm">edit</span>
                </button>
              </div>
            </div>

            <section className="glass-panel rounded-xl p-4 sm:p-6">
              <h3 className="text-[12px] font-semibold tracking-[0.05em] uppercase text-primary mb-4">
                Media Attachments
              </h3>
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 bg-surface-container/50 border border-outline-variant/10 rounded-lg hover:border-primary/30 transition-all cursor-pointer">
                  <div className="w-10 h-10 rounded bg-red-900/20 flex items-center justify-center text-red-400 shrink-0">
                    <span className="material-symbols-outlined">description</span>
                  </div>
                  <div className="flex-grow overflow-hidden min-w-0">
                    <p className="text-xs font-medium text-on-surface truncate">
                      Sermon_Notes_V1.pdf
                    </p>
                    <p className="text-[10px] text-on-surface-variant">
                      2.4 MB • PDF Document
                    </p>
                  </div>
                  <button
                    type="button"
                    className="text-on-surface-variant hover:text-error transition-colors"
                  >
                    <span className="material-symbols-outlined text-sm">
                      close
                    </span>
                  </button>
                </div>
                <div className="flex items-center gap-3 p-3 bg-surface-container/50 border border-outline-variant/10 rounded-lg hover:border-primary/30 transition-all cursor-pointer">
                  <div className="w-10 h-10 rounded bg-blue-900/20 flex items-center justify-center text-primary shrink-0">
                    <span className="material-symbols-outlined">movie</span>
                  </div>
                  <div className="flex-grow overflow-hidden min-w-0">
                    <p className="text-xs font-medium text-on-surface truncate">
                      Series_Bumper_Worship.mp4
                    </p>
                    <p className="text-[10px] text-on-surface-variant">
                      124 MB • Video File
                    </p>
                  </div>
                  <button
                    type="button"
                    className="text-on-surface-variant hover:text-error transition-colors"
                  >
                    <span className="material-symbols-outlined text-sm">
                      close
                    </span>
                  </button>
                </div>
                <div className="mt-2 border-2 border-dashed border-outline-variant/20 rounded-lg py-6 px-4 flex flex-col items-center justify-center text-center hover:bg-primary/5 hover:border-primary/40 transition-all group cursor-pointer">
                  <span className="material-symbols-outlined text-on-surface-variant group-hover:text-primary mb-2">
                    upload_file
                  </span>
                  <p className="text-sm text-on-surface-variant">
                    Drop files or{" "}
                    <span className="text-primary font-bold">browse</span>
                  </p>
                  <p className="text-[10px] text-on-surface-variant mt-1">
                    PDF, MP4, PNG (Max 500MB)
                  </p>
                </div>
              </div>
            </section>

            <section className="glass-panel rounded-xl p-4 sm:p-6 border-l-4 border-primary">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-[12px] font-semibold tracking-[0.05em] uppercase text-primary mb-1">
                    Production Status
                  </h3>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                    <span className="text-sm text-on-surface">Ready for Air</span>
                  </div>
                </div>
                <div className="bg-primary/10 px-2 py-1 rounded text-[10px] font-bold text-primary shrink-0">
                  STANDBY
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-outline-variant/10">
                <p className="text-[10px] text-on-surface-variant leading-relaxed">
                  This sermon is currently linked to the{" "}
                  <span className="text-on-surface">Sunday Morning Live</span>{" "}
                  setlist.
                </p>
              </div>
            </section>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(deletingSlide)}
        title="Delete Slide?"
        description={
          deletingSlide?.verse
            ? `Are you sure you want to delete "${deletingSlide.verse}"? This action cannot be undone.`
            : "Are you sure you want to delete this slide? This action cannot be undone."
        }
        highlight={
          deletingSlide?.verse ? `"${deletingSlide.verse}"` : undefined
        }
        onClose={() => setDeleteSlideId(null)}
        onConfirm={() => {
          if (deleteSlideId) removeSlide(deleteSlideId);
          setDeleteSlideId(null);
        }}
      />
    </section>
  );
}
