"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  FolderOpen,
  FolderPlus,
  Folder as FolderIcon,
  FilePlus,
  Search,
  Trash2,
  Pencil,
  X,
  FileText,
  ChevronRight,
  ChevronDown,
  Plus,
  StickyNote,
  Users,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Folder {
  id: string;
  parentId: string | null; // null = top-level customer, string = subfolder
  name: string;
  createdAt: number;
}

interface Note {
  id: string;
  folderId: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const uid = () =>
  Math.random().toString(36).slice(2, 9) + Date.now().toString(36);

const formatDate = (ts: number) =>
  new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

const formatTime = (ts: number) =>
  new Date(ts).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

const preview = (text: string, max = 80) => {
  if (!text) return "No content";
  return text.length > max ? text.slice(0, max) + "…" : text;
};


// ─── Main App ────────────────────────────────────────────────────────────────

export default function Home() {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<string>("all");
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [folderDraft, setFolderDraft] = useState("");
  const [search, setSearch] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set()
  );

  const renameRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  // ─── Persistence ─────────────────────────────────────────────────────────

  useEffect(() => {
    try {
      const f = localStorage.getItem("cn_folders");
      const n = localStorage.getItem("cn_notes");
      if (f) {
        const parsed: Folder[] = JSON.parse(f);
        // Migrate old folders without parentId
        const migrated = parsed.map((folder) => ({
          ...folder,
          parentId: folder.parentId ?? null,
        }));
        setFolders(migrated);
      }
      if (n) setNotes(JSON.parse(n));
    } catch {
      /* ignore */
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) localStorage.setItem("cn_folders", JSON.stringify(folders));
  }, [folders, loaded]);

  useEffect(() => {
    if (loaded) localStorage.setItem("cn_notes", JSON.stringify(notes));
  }, [notes, loaded]);

  // ─── Focus helpers ───────────────────────────────────────────────────────

  useEffect(() => {
    if (editingFolderId && renameRef.current) {
      renameRef.current.focus();
      renameRef.current.select();
    }
  }, [editingFolderId]);

  // ─── Folder helpers ──────────────────────────────────────────────────────

  const topLevelFolders = folders.filter((f) => f.parentId === null);

  const getSubfolders = useCallback(
    (parentId: string) => folders.filter((f) => f.parentId === parentId),
    [folders]
  );

  const toggleExpanded = useCallback((folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  }, []);

  /** Get all folder IDs that are descendants of a given folder (inclusive) */
  const getFolderAndDescendants = useCallback(
    (folderId: string): string[] => {
      const children = folders.filter((f) => f.parentId === folderId);
      return [folderId, ...children.flatMap((c) => getFolderAndDescendants(c.id))];
    },
    [folders]
  );

  // ─── Folder ops ──────────────────────────────────────────────────────────

  const addFolder = useCallback(() => {
    const f: Folder = {
      id: uid(),
      parentId: null,
      name: "New Customer",
      createdAt: Date.now(),
    };
    setFolders((prev) => [...prev, f]);
    setActiveFolderId(f.id);
    setActiveNoteId(null);
    setEditingFolderId(f.id);
    setFolderDraft("New Customer");
  }, []);

  const addSubfolder = useCallback((parentId: string) => {
    const f: Folder = {
      id: uid(),
      parentId,
      name: "New Subfolder",
      createdAt: Date.now(),
    };
    setFolders((prev) => [...prev, f]);
    setActiveFolderId(f.id);
    setActiveNoteId(null);
    setEditingFolderId(f.id);
    setFolderDraft("New Subfolder");
    // Auto-expand parent
    setExpandedFolders((prev) => new Set(prev).add(parentId));
  }, []);

  const commitRename = useCallback(
    (id: string) => {
      const name = folderDraft.trim() || "Untitled";
      setFolders((prev) => prev.map((f) => (f.id === id ? { ...f, name } : f)));
      setEditingFolderId(null);
    },
    [folderDraft]
  );

  const startRename = useCallback((folder: Folder) => {
    setEditingFolderId(folder.id);
    setFolderDraft(folder.name);
  }, []);

  const deleteFolder = useCallback(
    (id: string) => {
      // Get all descendant folder IDs to delete
      const idsToDelete = new Set(getFolderAndDescendants(id));
      setFolders((prev) => prev.filter((f) => !idsToDelete.has(f.id)));
      setNotes((prev) => prev.filter((n) => !idsToDelete.has(n.folderId)));
      if (idsToDelete.has(activeFolderId)) {
        setActiveFolderId("all");
        setActiveNoteId(null);
      }
    },
    [activeFolderId, getFolderAndDescendants]
  );

  // ─── Note ops ────────────────────────────────────────────────────────────

  const addNote = useCallback(() => {
    let folderId = activeFolderId;
    if (folderId === "all") {
      if (folders.length === 0) return;
      // Pick first top-level folder
      const topLevel = folders.find((f) => f.parentId === null);
      if (!topLevel) return;
      folderId = topLevel.id;
      setActiveFolderId(folderId);
    }
    const n: Note = {
      id: uid(),
      folderId,
      title: "",
      content: "",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setNotes((prev) => [n, ...prev]);
    setActiveNoteId(n.id);
    setTimeout(() => titleRef.current?.focus(), 50);
  }, [activeFolderId, folders]);

  const updateNote = useCallback((id: string, patch: Partial<Note>) => {
    setNotes((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, ...patch, updatedAt: Date.now() } : n
      )
    );
  }, []);

  const deleteNote = useCallback(
    (id: string) => {
      setNotes((prev) => prev.filter((n) => n.id !== id));
      if (activeNoteId === id) setActiveNoteId(null);
    },
    [activeNoteId]
  );

  // ─── Derived state ──────────────────────────────────────────────────────

  const activeFolderIds =
    activeFolderId === "all"
      ? null
      : new Set(getFolderAndDescendants(activeFolderId));

  const visibleNotes = (
    activeFolderIds === null
      ? notes
      : notes.filter((n) => activeFolderIds.has(n.folderId))
  )
    .filter(
      (n) =>
        !search ||
        n.title.toLowerCase().includes(search.toLowerCase()) ||
        n.content.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => b.updatedAt - a.updatedAt);

  const activeNote = notes.find((n) => n.id === activeNoteId) ?? null;
  const activeFolder = folders.find((f) => f.id === activeFolderId) ?? null;

  /** Count notes in a folder and all its descendants */
  const noteCount = useCallback(
    (fid: string) => {
      const allIds = new Set(getFolderAndDescendants(fid));
      return notes.filter((n) => allIds.has(n.folderId)).length;
    },
    [notes, getFolderAndDescendants]
  );

  const folderName = (fid: string) =>
    folders.find((f) => f.id === fid)?.name ?? "Unknown";

  /** Build breadcrumb path for a folder */
  const folderPath = useCallback(
    (fid: string): string => {
      const folder = folders.find((f) => f.id === fid);
      if (!folder) return "Unknown";
      if (folder.parentId) {
        const parent = folders.find((f) => f.id === folder.parentId);
        return parent ? `${parent.name} / ${folder.name}` : folder.name;
      }
      return folder.name;
    },
    [folders]
  );

  // ─── Loading state ──────────────────────────────────────────────────────

  if (!loaded) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-pulse text-slate-400 text-sm">Loading…</div>
      </div>
    );
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen bg-white select-none">
      {/* ═══ SIDEBAR — Folders ═══ */}
      <aside className="w-[260px] min-w-[260px] bg-slate-50 border-r border-slate-200 flex flex-col">
        {/* Brand */}
        <div className="px-5 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
              <StickyNote size={16} className="text-white" />
            </div>
            <div>
              <h1 className="text-[15px] font-semibold text-slate-800 leading-tight">
                Customer Notes
              </h1>
              <p className="text-[11px] text-slate-400">Organize &amp; track</p>
            </div>
          </div>
        </div>

        {/* All Notes button */}
        <div className="px-3 pt-3">
          <button
            onClick={() => {
              setActiveFolderId("all");
              setActiveNoteId(null);
            }}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
              activeFolderId === "all"
                ? "bg-indigo-50 text-indigo-700 font-medium"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <FileText size={16} />
            <span>All Notes</span>
            <span className="ml-auto text-xs opacity-60">{notes.length}</span>
          </button>
        </div>

        {/* Customers header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-1">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Customers
          </span>
          <button
            onClick={addFolder}
            className="p-1 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
            title="New customer folder"
          >
            <FolderPlus size={15} />
          </button>
        </div>

        {/* Folder list */}
        <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-0.5">
          {topLevelFolders.length === 0 && (
            <div className="px-3 py-8 text-center">
              <Users size={28} className="mx-auto text-slate-300 mb-2" />
              <p className="text-xs text-slate-400">No customers yet</p>
              <button
                onClick={addFolder}
                className="mt-2 text-xs text-indigo-500 hover:text-indigo-700 font-medium"
              >
                + Add your first customer
              </button>
            </div>
          )}

          {topLevelFolders.map((folder) => {
            const subs = getSubfolders(folder.id);
            const isExpanded = expandedFolders.has(folder.id);
            const hasSubs = subs.length > 0;

            return (
              <div key={folder.id}>
                {/* Customer folder row */}
                <div
                  className={`group folder-item flex items-center gap-1 px-2 py-2 rounded-lg cursor-pointer ${
                    activeFolderId === folder.id
                      ? "bg-indigo-50 text-indigo-700"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                  onClick={() => {
                    if (editingFolderId !== folder.id) {
                      setActiveFolderId(folder.id);
                      setActiveNoteId(null);
                    }
                  }}
                >
                  {/* Expand/collapse toggle */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleExpanded(folder.id);
                    }}
                    className={`p-0.5 rounded hover:bg-slate-200/60 transition-colors ${
                      hasSubs
                        ? "text-slate-400"
                        : "text-transparent pointer-events-none"
                    }`}
                  >
                    {isExpanded ? (
                      <ChevronDown size={13} />
                    ) : (
                      <ChevronRight size={13} />
                    )}
                  </button>

                  <FolderOpen
                    size={16}
                    className={
                      activeFolderId === folder.id
                        ? "text-indigo-500"
                        : "text-slate-400"
                    }
                  />

                  {editingFolderId === folder.id ? (
                    <form
                      className="flex-1 flex items-center gap-1"
                      onSubmit={(e) => {
                        e.preventDefault();
                        commitRename(folder.id);
                      }}
                    >
                      <input
                        ref={renameRef}
                        value={folderDraft}
                        onChange={(e) => setFolderDraft(e.target.value)}
                        onBlur={() => commitRename(folder.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") setEditingFolderId(null);
                        }}
                        className="flex-1 bg-white border border-indigo-300 rounded px-1.5 py-0.5 text-sm text-slate-800 focus:ring-1 focus:ring-indigo-400"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </form>
                  ) : (
                    <>
                      <span className="flex-1 text-sm truncate font-medium ml-0.5">
                        {folder.name}
                      </span>
                      <span className="text-xs opacity-50 mr-1">
                        {noteCount(folder.id)}
                      </span>
                      <div className="flex items-center gap-0.5">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            addSubfolder(folder.id);
                          }}
                          className="p-1 rounded hover:bg-indigo-100 text-indigo-400 hover:text-indigo-600"
                          title="Add subfolder"
                        >
                          <FolderPlus size={13} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            startRename(folder);
                          }}
                          className="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-600 hidden group-hover:block"
                          title="Rename"
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteFolder(folder.id);
                          }}
                          className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 hidden group-hover:block"
                          title="Delete"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {/* Subfolders */}
                {isExpanded && subs.length > 0 && (
                  <div className="ml-4 pl-2 border-l border-slate-200 space-y-0.5 mt-0.5">
                    {subs.map((sub) => (
                      <div
                        key={sub.id}
                        className={`group folder-item flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer ${
                          activeFolderId === sub.id
                            ? "bg-indigo-50 text-indigo-700"
                            : "text-slate-500 hover:bg-slate-100"
                        }`}
                        onClick={() => {
                          if (editingFolderId !== sub.id) {
                            setActiveFolderId(sub.id);
                            setActiveNoteId(null);
                          }
                        }}
                      >
                        <FolderIcon
                          size={14}
                          className={
                            activeFolderId === sub.id
                              ? "text-indigo-400"
                              : "text-slate-400"
                          }
                        />

                        {editingFolderId === sub.id ? (
                          <form
                            className="flex-1 flex items-center gap-1"
                            onSubmit={(e) => {
                              e.preventDefault();
                              commitRename(sub.id);
                            }}
                          >
                            <input
                              ref={renameRef}
                              value={folderDraft}
                              onChange={(e) => setFolderDraft(e.target.value)}
                              onBlur={() => commitRename(sub.id)}
                              onKeyDown={(e) => {
                                if (e.key === "Escape")
                                  setEditingFolderId(null);
                              }}
                              className="flex-1 bg-white border border-indigo-300 rounded px-1.5 py-0.5 text-sm text-slate-800 focus:ring-1 focus:ring-indigo-400"
                              onClick={(e) => e.stopPropagation()}
                            />
                          </form>
                        ) : (
                          <>
                            <span className="flex-1 text-[13px] truncate">
                              {sub.name}
                            </span>
                            <span className="text-[10px] opacity-50 mr-1">
                              {noteCount(sub.id)}
                            </span>
                            <div className="hidden group-hover:flex items-center gap-0.5">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  startRename(sub);
                                }}
                                className="p-0.5 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-600"
                                title="Rename"
                              >
                                <Pencil size={11} />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteFolder(sub.id);
                                }}
                                className="p-0.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-500"
                                title="Delete"
                              >
                                <Trash2 size={11} />
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </aside>

      {/* ═══ NOTE LIST ═══ */}
      <div className="w-[300px] min-w-[300px] border-r border-slate-200 flex flex-col bg-white">
        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-slate-100">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-slate-800 truncate">
              {activeFolderId === "all"
                ? "All Notes"
                : folderPath(activeFolderId)}
            </h2>
            <div className="flex items-center gap-1.5">
              {/* Add Subfolder button — visible when a top-level customer folder is selected */}
              {activeFolder && activeFolder.parentId === null && (
                <button
                  onClick={() => addSubfolder(activeFolderId)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                  title="Add subfolder to this customer"
                >
                  <FolderPlus size={14} />
                  Subfolder
                </button>
              )}
              <button
                onClick={addNote}
                disabled={folders.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                title={
                  folders.length === 0
                    ? "Create a customer folder first"
                    : "New note"
                }
              >
                <FilePlus size={14} />
                New Note
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search
              size={15}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search notes…"
              className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 placeholder:text-slate-400 focus:border-indigo-300 focus:ring-1 focus:ring-indigo-200 transition"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Notes */}
        <div className="flex-1 overflow-y-auto">
          {visibleNotes.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <FileText size={32} className="mx-auto text-slate-200 mb-3" />
              <p className="text-sm text-slate-400">
                {search
                  ? "No notes match your search"
                  : folders.length === 0
                  ? "Create a customer folder to start"
                  : "No notes yet"}
              </p>
              {!search && folders.length > 0 && (
                <button
                  onClick={addNote}
                  className="mt-2 text-xs text-indigo-500 hover:text-indigo-700 font-medium"
                >
                  + Create your first note
                </button>
              )}
            </div>
          ) : (
            <div className="py-1">
              {visibleNotes.map((note) => (
                <div
                  key={note.id}
                  onClick={() => setActiveNoteId(note.id)}
                  className={`note-card group mx-2 my-0.5 px-3 py-2.5 rounded-lg cursor-pointer border ${
                    activeNoteId === note.id
                      ? "bg-indigo-50 border-indigo-200"
                      : "border-transparent hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h3
                        className={`text-sm font-medium truncate ${
                          activeNoteId === note.id
                            ? "text-indigo-800"
                            : "text-slate-800"
                        }`}
                      >
                        {note.title || "Untitled Note"}
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5 truncate">
                        {preview(note.content, 60)}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-[10px] text-slate-400">
                          {formatDate(note.updatedAt)}
                        </span>
                        {activeFolderId === "all" && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded">
                            {folderPath(note.folderId)}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteNote(note.id);
                      }}
                      className="hidden group-hover:block p-1 rounded hover:bg-red-50 text-slate-300 hover:text-red-500 transition-colors"
                      title="Delete note"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ═══ NOTE EDITOR ═══ */}
      <main className="flex-1 flex flex-col bg-white min-w-0">
        {activeNote ? (
          <>
            {/* Editor header */}
            <div className="px-8 pt-6 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2 text-xs text-slate-400 mb-3">
                <span className="px-2 py-0.5 bg-slate-100 rounded text-slate-500 font-medium">
                  {folderPath(activeNote.folderId)}
                </span>
                <span>·</span>
                <span>
                  Last edited {formatDate(activeNote.updatedAt)} at{" "}
                  {formatTime(activeNote.updatedAt)}
                </span>
              </div>
              <input
                ref={titleRef}
                type="text"
                value={activeNote.title}
                onChange={(e) =>
                  updateNote(activeNote.id, { title: e.target.value })
                }
                placeholder="Note title…"
                className="w-full text-2xl font-semibold text-slate-800 placeholder:text-slate-300 bg-transparent"
              />
            </div>

            {/* Editor body */}
            <div className="flex-1 overflow-y-auto px-8 py-5">
              <textarea
                value={activeNote.content}
                onChange={(e) =>
                  updateNote(activeNote.id, { content: e.target.value })
                }
                placeholder="Start writing your note…"
                className="w-full min-h-[calc(100vh-220px)] text-[15px] leading-relaxed text-slate-700 placeholder:text-slate-300 bg-transparent resize-none"
              />
            </div>
          </>
        ) : (
          /* Empty state */
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                <StickyNote size={28} className="text-slate-300" />
              </div>
              <h3 className="text-lg font-medium text-slate-400 mb-1">
                No note selected
              </h3>
              <p className="text-sm text-slate-300">
                Select a note from the list or create a new one
              </p>
              {folders.length > 0 && (
                <button
                  onClick={addNote}
                  className="mt-4 px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                >
                  Create a Note
                </button>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
