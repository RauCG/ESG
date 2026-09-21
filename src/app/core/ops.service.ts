import { Injectable, signal } from '@angular/core';
import { Channel, invoke } from '@tauri-apps/api/core';
import { OpRequest, OpKind, PtsEvent } from '../types';
import { SudoService } from './sudo.service';

export interface ActiveOp {
  id: number;
  label: string;
  kind: OpKind;
  running: boolean;
  success?: boolean;
  code?: number | null;
  text: string;
  pendingSudo: boolean;
  at: number;
}

const STRIP_ANSI =
  /\x1b\[[0-9;?]*[a-zA-Z]|\x1b\][^\x07]*(\x07|\x1b\\)|\x1b[()AB012]|\x1b[=>]/g;

export function stripAnsi(s: string): string {
  return s
    .replace(STRIP_ANSI, '')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
}

const ROOT_BY_KIND: Record<OpKind, string[]> = {
  update: ['pacman', 'yay', 'paru', 'apt', 'dnf', 'zypper', 'snap'],
  upgrade: ['pacman', 'yay', 'paru', 'apt', 'dnf', 'zypper', 'snap'],
  install: ['pacman', 'yay', 'paru', 'apt', 'dnf', 'zypper', 'snap'],
  uninstall: ['pacman', 'yay', 'paru', 'apt', 'dnf', 'zypper', 'snap'],
  orphans: ['pacman', 'apt', 'dnf'],
  cache: ['pacman', 'apt', 'dnf'],
};

const SUDO_PROMPT = /\[sudo\]\s+password\s+for/i;

@Injectable({ providedIn: 'root' })
export class OpsService {
  readonly ops = signal<ActiveOp[]>([]);
  readonly hidden = signal(false);

  constructor(private sudo: SudoService) {}

  needsRoot(req: OpRequest): boolean {
    return (ROOT_BY_KIND[req.kind] ?? []).includes(req.manager);
  }

  async run(req: OpRequest, label?: string, wait = false): Promise<number> {
    label ??= describe(req);
    if (this.needsRoot(req)) {
      try {
        await this.sudo.ensure();
      } catch {
        return -1;
      }
    }
    const channel = new Channel<PtsEvent>();
    const op: ActiveOp = {
      id: -1,
      label,
      kind: req.kind,
      running: true,
      text: '',
      pendingSudo: false,
      at: Date.now(),
    };

    let sudoSent = false;
    let pendingAutoPwd: string | null = null;
    let resolveDone: (() => void) | null = null;

    channel.onmessage = (ev: PtsEvent) => {
      if (ev.type === 'data') {
        const text = new TextDecoder().decode(new Uint8Array(ev.data));
        const clean = stripAnsi(text);
        const window_ = (op.text + clean).slice(-400);
        if (SUDO_PROMPT.test(window_) && op.pendingSudo === false && !sudoSent) {
          const pwd = this.sudo.password();
          if (pwd) {
            sudoSent = true;
            op.text += clean.replace(/\[sudo\]\s+password\s+for[^\n]*\n?/i, '');
            if (op.id !== -1) {
              void this.sendPassword(op.id, pwd);
            } else {
              pendingAutoPwd = pwd;
            }
          } else {
            op.pendingSudo = true;
            op.text += clean.replace(/\[sudo\]\s+password\s+for[^\n]*\n?/i, '');
          }
        } else {
          op.text += clean;
        }
        this.upsert(op);
      } else if (ev.type === 'exit') {
        op.running = false;
        op.success = ev.success;
        op.code = ev.code;
        op.pendingSudo = false;
        if (!ev.success && !op.text.trim().endsWith('Proceso finalizado') && op.text) {
          op.text += '\n' + (ev.code != null ? `(salida con código ${ev.code})` : '(terminado)');
        }
        this.upsert(op);
        resolveDone?.();
      }
    };

    const id = await invoke<number>('op_start', { request: req, onEvent: channel });
    op.id = id;
    if (pendingAutoPwd && op.id !== -1) {
      void this.sendPassword(op.id, pendingAutoPwd);
      pendingAutoPwd = null;
    }
    this.upsert(op);
    if (wait && op.running) {
      await new Promise<void>((resolve) => {
        resolveDone = resolve;
      });
    }
    return id;
  }

  private upsert(op: ActiveOp) {
    const list = this.ops();
    const i = list.findIndex((o) => o.id === op.id || (op.id === -1 && o.at === op.at));
    const next = i >= 0 ? list.map((o) => (o === list[i] ? { ...op } : o)) : [...list, { ...op }];
    this.ops.set(next);
  }

  async cancel(id: number) {
    await invoke('op_cancel', { id }).catch(() => {});
  }

  async sendPassword(id: number, password: string) {
    const data = Array.from(new TextEncoder().encode(password + '\n'));
    await invoke('pty_write', { id, data }).catch(() => {});
    const list = this.ops().map((o) => (o.id === id ? { ...o, pendingSudo: false } : o));
    this.ops.set(list);
  }

  toggleHidden() {
    this.hidden.set(!this.hidden());
  }

  show() {
    this.hidden.set(false);
  }
}

export function describe(req: OpRequest): string {
  switch (req.kind) {
    case 'update':
      return `Actualizar (${req.manager})`;
    case 'install':
      return `Instalar: ${req.packages?.join(', ') ?? ''}`;
    case 'uninstall':
      return `Desinstalar: ${req.packages?.join(', ') ?? ''}`;
    case 'orphans':
      return 'Limpiar paquetes huérfanos';
    case 'cache':
      return `Limpiar caché (${req.manager})`;
    default:
      return 'Operación';
  }
}