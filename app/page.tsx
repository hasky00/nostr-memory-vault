"use client";

import { useState, useEffect, useCallback } from "react";
import {
  VaultNote,
  getPublicKey,
  isNip07Available,
  publishNote,
  fetchNotes,
  generateNoteId,
  formatDate,
} from "@/lib/nostr";

type Screen = "home" | "new";

export default function Home() {
  const [pubkey, setPubkey] = useState<string | null>(null);
  const [notes, setNotes] = useState<VaultNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [screen, setScreen] = useState<Screen>("home");
  const [search, setSearch] = useState("");
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noExtension, setNoExtension] = useState(false);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [folder, setFolder] = useState("General");
  const [publishing, setPublishing] = useState(false);
  const [publishSuccess, setPublishSuccess] = useState(false);

  const login = useCallback(async () => {
    if (!isNip07Available()) { setNoExtension(true); return; }
    setLoading(true); setError(null);
    try {
      const pk = await getPublicKey();
      setPubkey(pk);
    } catch { setError("Login cancelled or failed."); }
    finally { setLoading(false); }
  }, []);

  const sync = useCallback(async () => {
    if (!pubkey) return;
    setSyncing(true); setError(null);
    try {
      const fetched = await fetchNotes(pubkey);
      setNotes(fetched);
    } catch { setError("Could not sync from relays."); }
    finally { setSyncing(false); }
  }, [pubkey]);

  useEffect(() => { if (pubkey) sync(); }, [pubkey, sync]);

  const folders = Array.from(new Set(notes.map((n) => n.folder))).sort();

  const filtered = notes.filter((n) => {
    const matchFolder = activeFolder ? n.folder === activeFolder : true;
    const q = search.toLowerCase();
    const matchSearch = q
      ? n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q) || n.folder.toLowerCase().includes(q)
      : true;
    return matchFolder && matchSearch;
  });

  const handlePublish = async () => {
    if (!title.trim() || !content.trim()) return;
    setPublishing(true); setError(null);
    try {
      const note: VaultNote = {
        id: generateNoteId(),
        title: title.trim(),
        content: content.trim(),
        folder: folder.trim() || "General",
        createdAt: Date.now(),
      };
      const eventId = await publishNote(note);
      note.eventId = eventId;
      setNotes((prev) => [note, ...prev]);
      setPublishSuccess(true);
      setTimeout(() => {
        setPublishSuccess(false); setScreen("home");
        setTitle(""); setContent(""); setFolder("General");
      }, 1200);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      setError(msg === "NO_EXTENSION" ? "No Nostr extension found." : "Failed to publish. Try again.");
    } finally { setPublishing(false); }
  };

  if (noExtension) {
    return (
      <main style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", minHeight:"100dvh", padding:"24px", textAlign:"center" }}>
        <div style={{ fontSize:"48px", marginBottom:"16px" }}>🔐</div>
        <h1 style={{ fontSize:"22px", fontWeight:"700", marginBottom:"8px", color:"var(--ink)" }}>Nostr Extension Required</h1>
        <p style={{ color:"var(--ink-soft)", marginBottom:"24px", lineHeight:"1.6" }}>
          Open this in a Nostr-compatible browser or install an extension like <strong>Alby</strong> or <strong>nos2x</strong>.
        </p>
        <button className="btn-ghost" onClick={() => setNoExtension(false)}>← Back</button>
      </main>
    );
  }

  if (!pubkey) {
    return (
      <main style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", minHeight:"100dvh", padding:"24px", textAlign:"center" }}>
        <div style={{ marginBottom:"32px" }}>
          <div style={{ fontSize:"52px", marginBottom:"16px" }}>🗝️</div>
          <h1 style={{ fontSize:"28px", fontWeight:"800", letterSpacing:"-0.5px", color:"var(--ink)", marginBottom:"8px" }}>
            Nostr Memory Vault
          </h1>
          <p style={{ color:"var(--ink-soft)", fontSize:"16px" }}>Your private thoughts, synced through Nostr.</p>
        </div>
        {error && <p style={{ background:"#fee2e2", color:"var(--danger)", borderRadius:"12px", padding:"10px 16px", fontSize:"14px", marginBottom:"16px" }}>{error}</p>}
        <button className="btn-primary" style={{ width:"100%", maxWidth:"280px" }} onClick={login} disabled={loading}>
          {loading ? "Connecting…" : "Connect with Nostr"}
        </button>
        <p style={{ color:"var(--ink-soft)", fontSize:"12px", marginTop:"12px" }}>
          NIP-07 extension · No server · No account
        </p>
      </main>
    );
  }

  if (screen === "new") {
    return (
      <div className="modal-overlay" onClick={() => setScreen("home")}>
        <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"20px" }}>
            <h2 style={{ fontSize:"20px", fontWeight:"700", color:"var(--ink)" }}>New Memory</h2>
            <button style={{ fontSize:"24px", color:"var(--ink-soft)", background:"none", border:"none", cursor:"pointer" }} onClick={() => setScreen("home")}>×</button>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:"12px" }}>
            <div>
              <label style={{ fontSize:"13px", fontWeight:"500", color:"var(--ink-soft)", display:"block", marginBottom:"4px" }}>Title</label>
              <input placeholder="What's this about?" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
            </div>
            <div>
              <label style={{ fontSize:"13px", fontWeight:"500", color:"var(--ink-soft)", display:"block", marginBottom:"4px" }}>Thought</label>
              <textarea placeholder="Write your thought here…" value={content} onChange={(e) => setContent(e.target.value)} rows={5} style={{ resize:"none" }} />
            </div>
            <div>
              <label style={{ fontSize:"13px", fontWeight:"500", color:"var(--ink-soft)", display:"block", marginBottom:"4px" }}>Folder</label>
              <input placeholder="e.g. Ideas, Journal, Work" value={folder} onChange={(e) => setFolder(e.target.value)} />
              {folders.length > 0 && (
                <div style={{ display:"flex", gap:"8px", marginTop:"8px", flexWrap:"wrap" }}>
                  {folders.map((f) => (
                    <button key={f} className="folder-chip" onClick={() => setFolder(f)}>{f}</button>
                  ))}
                </div>
              )}
            </div>
            {error && <p style={{ background:"#fee2e2", color:"var(--danger)", borderRadius:"12px", padding:"10px 16px", fontSize:"13px" }}>{error}</p>}
            {publishSuccess
              ? <div style={{ textAlign:"center", padding:"12px", color:"var(--success)", fontWeight:"600" }}>✓ Saved to Nostr!</div>
              : <button className="btn-primary" style={{ width:"100%", marginTop:"4px", opacity: (!title.trim() || !content.trim()) ? 0.5 : 1 }} onClick={handlePublish} disabled={publishing || !title.trim() || !content.trim()}>
                  {publishing ? "Publishing…" : "Save Memory"}
                </button>
            }
          </div>
        </div>
      </div>
    );
  }

  return (
    <main style={{ minHeight:"100dvh", paddingBottom:"112px", background:"var(--paper)" }}>
      <div style={{ padding:"48px 20px 16px" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"4px" }}>
          <h1 style={{ fontSize:"24px", fontWeight:"800", letterSpacing:"-0.5px", color:"var(--ink)" }}>Memory Vault</h1>
          <button onClick={sync} disabled={syncing}
            style={{ fontSize:"13px", padding:"6px 12px", borderRadius:"20px", border:"none", background:"var(--accent-soft)", color:"var(--accent)", fontWeight:"600", cursor:"pointer" }}>
            {syncing ? "Syncing…" : "⟳ Sync"}
          </button>
        </div>
        <p style={{ color:"var(--ink-soft)", fontSize:"13px" }}>{notes.length} {notes.length === 1 ? "memory" : "memories"}</p>
      </div>

      <div style={{ padding:"0 20px 16px" }}>
        <input type="search" placeholder="Search memories…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {folders.length > 0 && (
        <div style={{ padding:"0 20px 16px", display:"flex", gap:"8px", overflowX:"auto", scrollbarWidth:"none" }}>
          <button className={`folder-chip ${!activeFolder ? "active" : ""}`} onClick={() => setActiveFolder(null)}>All</button>
          {folders.map((f) => (
            <button key={f} className={`folder-chip ${activeFolder === f ? "active" : ""}`} onClick={() => setActiveFolder(activeFolder === f ? null : f)} style={{ whiteSpace:"nowrap" }}>{f}</button>
          ))}
        </div>
      )}

      {error && (
        <div style={{ margin:"0 20px 16px", padding:"12px 16px", borderRadius:"12px", background:"#fee2e2", color:"var(--danger)", fontSize:"13px" }}>{error}</div>
      )}

      <div style={{ padding:"0 20px", display:"flex", flexDirection:"column", gap:"12px" }}>
        {syncing && notes.length === 0 ? (
          <div style={{ textAlign:"center", padding:"64px 0", color:"var(--ink-soft)" }}>
            <div style={{ fontSize:"32px", marginBottom:"12px" }}>⟳</div>
            <p>Fetching from relays…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign:"center", padding:"64px 0" }}>
            <div style={{ fontSize:"40px", marginBottom:"16px" }}>🌱</div>
            <p style={{ fontWeight:"600", color:"var(--ink)", marginBottom:"4px" }}>
              {search || activeFolder ? "No matching memories." : "Your memory vault is empty."}
            </p>
            <p style={{ color:"var(--ink-soft)", fontSize:"14px" }}>
              {search || activeFolder ? "Try a different search or folder." : "Save your first thought."}
            </p>
          </div>
        ) : (
          filtered.map((note) => <NoteCard key={note.id} note={note} />)
        )}
      </div>

      <button className="fab" onClick={() => { setError(null); setScreen("new"); }}>+ New Memory</button>
    </main>
  );
}

function NoteCard({ note }: { note: VaultNote }) {
  const [expanded, setExpanded] = useState(false);
  const preview = note.content.slice(0, 120);
  const hasMore = note.content.length > 120;

  return (
    <div className="card" style={{ padding:"16px", cursor: hasMore ? "pointer" : "default" }} onClick={() => hasMore && setExpanded((p) => !p)}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:"8px", marginBottom:"8px" }}>
        <h3 style={{ fontWeight:"600", fontSize:"16px", color:"var(--ink)", lineHeight:"1.3" }}>{note.title}</h3>
        <span className="folder-chip" style={{ cursor:"default", flexShrink:0 }}>{note.folder}</span>
      </div>
      <p style={{ fontSize:"14px", color:"var(--ink-soft)", lineHeight:"1.6", marginBottom:"12px" }}>
        {expanded ? note.content : preview}{hasMore && !expanded && "…"}
      </p>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <span style={{ fontSize:"12px", color:"#aaa" }}>{formatDate(note.createdAt)}</span>
        {hasMore && <span style={{ fontSize:"12px", fontWeight:"500", color:"var(--accent)" }}>{expanded ? "Show less" : "Read more"}</span>}
      </div>
    </div>
  );
}
