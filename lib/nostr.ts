import { SimplePool, finalizeEvent, nip19 } from "nostr-tools";

export const RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.primal.net",
];

export const NOTE_KIND = 30023;
export const APP_TAG = "nostr-memory-vault";

export interface VaultNote {
  id: string;
  title: string;
  content: string;
  folder: string;
  createdAt: number;
  eventId?: string;
}

declare global {
  interface Window {
    nostr?: {
      getPublicKey(): Promise<string>;
      signEvent(event: object): Promise<object>;
    };
  }
}

export async function getPublicKey(): Promise<string> {
  if (!window.nostr) throw new Error("NO_EXTENSION");
  return window.nostr.getPublicKey();
}

export function isNip07Available(): boolean {
  return typeof window !== "undefined" && !!window.nostr;
}

export async function publishNote(note: VaultNote): Promise<string> {
  if (!window.nostr) throw new Error("NO_EXTENSION");

  const pubkey = await window.nostr.getPublicKey();

  const eventTemplate = {
    kind: NOTE_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["d", note.id],
      ["title", note.title],
      ["t", note.folder],
      ["app", APP_TAG],
    ],
    content: note.content,
    pubkey,
  };

  const signedEvent = (await window.nostr.signEvent(eventTemplate)) as ReturnType<typeof finalizeEvent>;

  const pool = new SimplePool();
  await Promise.allSettled(
    RELAYS.map((relay) => {
      try {
        return pool.publish([relay], signedEvent);
      } catch {
        return Promise.resolve();
      }
    })
  );
  pool.close(RELAYS);

  return signedEvent.id;
}

export async function fetchNotes(pubkey: string): Promise<VaultNote[]> {
  const pool = new SimplePool();

  try {
    const events = await pool.querySync(RELAYS, {
      kinds: [NOTE_KIND],
      authors: [pubkey],
      "#app": [APP_TAG],
    });

    const notes: VaultNote[] = events.map((event) => {
      const dTag = event.tags.find((t) => t[0] === "d")?.[1] ?? event.id;
      const titleTag = event.tags.find((t) => t[0] === "title")?.[1] ?? "Untitled";
      const folderTag = event.tags.find((t) => t[0] === "t")?.[1] ?? "General";

      return {
        id: dTag,
        title: titleTag,
        content: event.content,
        folder: folderTag,
        createdAt: event.created_at * 1000,
        eventId: event.id,
      };
    });

    // Deduplicate by d-tag (keep latest)
    const seen = new Map<string, VaultNote>();
    for (const note of notes.sort((a, b) => b.createdAt - a.createdAt)) {
      if (!seen.has(note.id)) seen.set(note.id, note);
    }

    return Array.from(seen.values());
  } catch {
    return [];
  } finally {
    pool.close(RELAYS);
  }
}

export function generateNoteId(): string {
  return `nmv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function formatDate(ts: number): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ts));
}
