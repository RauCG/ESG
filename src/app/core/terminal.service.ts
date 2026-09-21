import { Injectable, signal } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';

export interface TermSession {
  id: number;
  label: string;
  live: boolean;
}

@Injectable({ providedIn: 'root' })
export class TerminalService {
  readonly sessions = signal<TermSession[]>([]);
  readonly activeId = signal<number | null>(null);

  async open(label: string = 'Terminal', exec?: string | null): Promise<number> {
    const id = await invoke<number>('pty_create', { label, exec: exec ?? null });
    this.sessions.set([...this.sessions(), { id, label, live: true }]);
    this.activeId.set(id);
    return id;
  }

  async close(id: number) {
    await invoke('pty_close', { id }).catch(() => {});
    const list = this.sessions().filter((s) => s.id !== id).map((s) => ({ ...s, live: s.id !== id }));
    this.sessions.set(list);
    if (this.activeId() === id) {
      const next = this.sessions()[0] ?? null;
      this.activeId.set(next ? next.id : null);
    }
  }

  async closeAll() {
    for (const s of [...this.sessions()]) {
      await invoke('pty_close', { id: s.id }).catch(() => {});
    }
    this.sessions.set([]);
    this.activeId.set(null);
  }

  setActive(id: number) {
    this.activeId.set(id);
  }
}