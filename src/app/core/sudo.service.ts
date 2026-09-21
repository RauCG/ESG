import { Injectable, signal } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';

@Injectable({ providedIn: 'root' })
export class SudoService {
  readonly status = signal<{ ok: boolean; user: string }>({ ok: false, user: '' });
  readonly needPassword = signal(false);
  readonly lastError = signal<string | null>(null);
  private pending: { resolve: (p: string) => void; reject: (e: unknown) => void } | null = null;
  private stored: string | null = null;

  async check(): Promise<{ ok: boolean; user: string }> {
    const [ok, user] = await invoke<[boolean, string]>('sudo_status');
    this.status.set({ ok, user });
    return { ok, user };
  }

  /** Asegura que el timestamp de sudo está validado; si no, pide contraseña por diálogo. */
  async ensure(): Promise<void> {
    const { ok } = await this.check();
    if (ok) return;
    const pwd = await this.requestPassword();
    await this.verify(pwd);
  }

  private async requestPassword(): Promise<string> {
    if (this.pending) {
      this.pending.reject(new Error('Sobrescrita'));
    }
    this.needPassword.set(true);
    this.lastError.set(null);
    return new Promise<string>((resolve, reject) => {
      this.pending = { resolve, reject };
    });
  }

  /** Última contraseña validada por sudo, guardada solo en memoria para auto-envío en operaciones PTY. */
  password(): string | null {
    return this.stored;
  }

  clear() {
    this.stored = null;
    this.status.set({ ok: false, user: '' });
  }

  async verify(password: string): Promise<void> {
    try {
      await invoke('verify_sudo', { password });
      this.stored = password;
      this.status.set({ ok: true, user: this.status().user });
      this.lastError.set(null);
    } catch (e) {
      if (String(e).includes('Cancelado')) {
        this.stored = null;
      }
      this.lastError.set(String(e));
      throw e;
    }
  }

  submitPassword(password: string) {
    if (!this.pending) return;
    this.needPassword.set(false);
    const p = this.pending;
    this.pending = null;
    p.resolve(password);
  }

  cancelPassword() {
    this.needPassword.set(false);
    this.stored = null;
    if (this.pending) {
      const p = this.pending;
      this.pending = null;
      p.reject(new Error('Cancelado'));
    }
  }
}