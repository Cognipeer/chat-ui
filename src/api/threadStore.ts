import type { Conversation, Message } from "../types";

export interface StoredThread {
  conversation: Conversation;
  messages: Message[];
}

/**
 * Where stateless backends (Chat Completions, Responses, A2A, in-process
 * agent-sdk) keep conversations. Implement it to persist threads in your own
 * API or database; the built-ins keep them in memory or in `localStorage`.
 */
export interface ThreadStore {
  list(): Promise<StoredThread[]> | StoredThread[];
  get(id: string): Promise<StoredThread | undefined> | StoredThread | undefined;
  save(thread: StoredThread): Promise<void> | void;
  delete(id: string): Promise<void> | void;
}

export class MemoryThreadStore implements ThreadStore {
  private threads = new Map<string, StoredThread>();

  list() {
    return Array.from(this.threads.values());
  }
  get(id: string) {
    return this.threads.get(id);
  }
  save(thread: StoredThread) {
    this.threads.set(thread.conversation.id, thread);
  }
  delete(id: string) {
    this.threads.delete(id);
  }
}

function reviveThread(raw: any): StoredThread {
  const date = (v: unknown) => new Date(v as string);
  return {
    conversation: {
      ...raw.conversation,
      createdAt: date(raw.conversation.createdAt),
      updatedAt: date(raw.conversation.updatedAt),
    },
    messages: (raw.messages ?? []).map((m: any) => ({
      ...m,
      createdAt: date(m.createdAt),
      updatedAt: date(m.updatedAt),
    })),
  };
}

/** Keeps threads in `localStorage` under `<key>:<id>`, with an index at `<key>:index`. */
export class LocalStorageThreadStore implements ThreadStore {
  constructor(private key = "cognipeer-chat-threads") {}

  private storage(): Storage | undefined {
    try {
      return typeof localStorage === "undefined" ? undefined : localStorage;
    } catch {
      return undefined;
    }
  }

  private ids(): string[] {
    try {
      return JSON.parse(this.storage()?.getItem(`${this.key}:index`) ?? "[]");
    } catch {
      return [];
    }
  }

  private setIds(ids: string[]) {
    this.storage()?.setItem(`${this.key}:index`, JSON.stringify(ids));
  }

  list() {
    return this.ids()
      .map((id) => this.get(id))
      .filter((t): t is StoredThread => !!t);
  }

  get(id: string) {
    try {
      const raw = this.storage()?.getItem(`${this.key}:${id}`);
      return raw ? reviveThread(JSON.parse(raw)) : undefined;
    } catch {
      return undefined;
    }
  }

  save(thread: StoredThread) {
    const store = this.storage();
    if (!store) return;
    const id = thread.conversation.id;
    store.setItem(`${this.key}:${id}`, JSON.stringify(thread));
    const ids = this.ids();
    if (!ids.includes(id)) this.setIds([...ids, id]);
  }

  delete(id: string) {
    this.storage()?.removeItem(`${this.key}:${id}`);
    this.setIds(this.ids().filter((x) => x !== id));
  }
}
