import { SimplePool, finalizeEvent, nip19, getPublicKey as getPublicKeyFromPriv } from "nostr-tools";

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

export function isNip07Available(): boolean {
  return typeof window !== "undefined" && !!window.nostr;
}

export async function loginWithExtension(): Promise<string> {
  if (!window.nostr) throw new Error("NO_EXTENSION");
  return window.nostr.getPublicKey();
}

export function loginWithNsec(nsecOrHex: string): { pubkey: string; privkey: Uint8Array } {
  let privkey: Uint8Array;

  if (nsecOrHex.startsWith("nsec1")) {
    const decoded = nip19.decode(nsecOrHex);
    if (decoded.type !== "nsec") throw new Error("Invalid nsec key");
    privkey = decoded.data as Uint8Array;
  } else {
    // treat as hex
    if (!/^[0-9a-fA-F]{64}$/.test(nsecOrHex)) throw new Error("Invalid private key format");
    privkey = Uint8Array.from(Buffer.from(nsecOrHex, "hex"));
  }

  const pubkey = getPublicKeyFromPriv(privkey);
  return { pubkey, privkey };
}

export async function publishNote(
  note: VaultNote,
  privkey?: Uint8Array
): Promise<string> {
  const pool = new SimplePool();

  let signedEvent: ReturnType<typeof finalizeEvent>;

  if (privkey) {
    // nsec login — sign locally
    const pubkey = getPublicKeyFromPriv(privkey);
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
    signedEvent = finalizeEvent(eventTemplate, privkey);
  } else {
    // NIP-07 extension
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
    signedEvent = (await window.nostr.signEvent(eventTemplate)) as ReturnType<typeof finalizeEvent>;
  }

  await Promise.allSettled(
    RELAYS.map((relay) => {
      try { return pool.publish([relay], signedEvent); }
      catch { return Promise.resolve(); }
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
