import { Component, effect, inject, signal } from '@angular/core';
import { OpsService } from '../core/ops.service';

@Component({
  selector: 'app-console',
  standalone: true,
  template: `
    @if (ops.hidden()) {
      <button
        (click)="reveal()"
        class="fixed bottom-4 right-4 z-50 inline-flex items-center gap-2 rounded-full border border-accent/40 bg-surface px-4 py-2.5 text-xs font-semibold text-white shadow-2xl transition hover:border-accent hover:bg-surface2"
        title="Reabrir panel de operaciones"
      >
        <svg class="h-4 w-4 text-accent2" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path d="M12 19V5m0 0l-6 6m6-6l6 6" />
        </svg>
        Operaciones
        @if (runningCount() > 0) {
          <span class="rounded-full bg-accent/20 px-2 py-0.5 text-accent2">{{ runningCount() }} en curso</span>
        }
      </button>
    } @else if (collapsed()) {
      <div class="fixed bottom-0 left-60 right-0 z-40 border-t border-border bg-surface/95 shadow-2xl backdrop-blur">
        <div class="flex h-11 items-center justify-between px-4">
          <div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
            <span class="h-2 w-2 rounded-full bg-accent2" [class.animate-pulse]="runningCount() > 0"></span>
            Operaciones
            @if (runningCount() > 0) {
              <span class="rounded-full bg-accent/20 px-2 py-0.5 text-accent2">{{ runningCount() }} en curso</span>
            }
          </div>
          <div class="flex items-center gap-1">
            <button
              (click)="expand()"
              class="rounded-lg p-1.5 text-muted transition hover:bg-surface2 hover:text-white"
              title="Abrir panel"
            >
              <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M12 19V5m0 0l-6 6m6-6l6 6" /></svg>
            </button>
            <button
              (click)="ops.toggleHidden()"
              class="rounded-lg p-1.5 text-muted transition hover:bg-surface2 hover:text-white"
              title="Cerrar panel"
            >
              <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
      </div>
    } @else {
      <div class="fixed bottom-0 left-60 right-0 z-40 border-t border-border bg-surface/95 shadow-2xl backdrop-blur">
        <div class="flex max-h-[55vh] flex-col">
          <div class="flex items-center justify-between border-b border-border px-4 py-2">
            <div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
              <span class="h-2 w-2 rounded-full bg-accent2" [class.animate-pulse]="runningCount() > 0"></span>
              Operaciones
              @if (runningCount() > 0) {
                <span class="rounded-full bg-accent/20 px-2 py-0.5 text-accent2">{{ runningCount() }} en curso</span>
              }
            </div>
            <div class="flex items-center gap-1">
              <button
                (click)="expand()"
                class="rounded-lg p-1.5 text-muted transition hover:bg-surface2 hover:text-white"
                title="Colapsar panel"
              >
                <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M12 5v14m0 0l-6-6m6 6l6-6" /></svg>
              </button>
              <button
                (click)="ops.toggleHidden()"
                class="rounded-lg p-1.5 text-muted transition hover:bg-surface2 hover:text-white"
                title="Cerrar panel"
              >
                <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          </div>

          <div class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
            @if (ops.ops().length === 0) {
              <p class="py-6 text-center text-sm text-muted">
                Sin operaciones activas. Las tareas de actualizar, instalar o limpiar aparecerán aquí con su salida en directo.
              </p>
            }

            @for (op of ops.ops(); track op.id !== -1 ? op.id : op.at) {
              <div class="overflow-hidden rounded-xl border border-border bg-surface2/70">
                <div class="flex items-center justify-between gap-2 border-b border-border px-4 py-2">
                  <div class="flex min-w-0 items-center gap-2">
                    @if (op.running) {
                      <svg class="h-4 w-4 shrink-0 animate-spin text-accent2" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                      </svg>
                    } @else if (op.success) {
                      <svg class="h-4 w-4 shrink-0 text-ok" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M5 13l4 4L19 7" /></svg>
                    } @else {
                      <svg class="h-4 w-4 shrink-0 text-err" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18" /></svg>
                    }
                    <span class="truncate text-sm font-medium text-white">{{ op.label }}</span>
                    @if (!op.running) {
                      <span class="text-xs text-muted">— {{ op.success ? 'completado' : 'con errores' }} (código {{ op.code ?? '?' }})</span>
                    }
                  </div>
                  <div class="flex items-center gap-2">
                    @if (op.pendingSudo) {
                      <button
                        (click)="sendPwd(op.id)"
                        [disabled]="!inlinePwd(op.id)"
                        class="rounded-lg bg-amber-500/15 px-2 py-1 text-xs font-medium text-amber-300 transition hover:bg-amber-500/25 disabled:opacity-40"
                      >
                        Enviar contraseña
                      </button>
                    }
                    @if (op.running) {
                      <button
                        (click)="ops.cancel(op.id)"
                        class="rounded-lg px-2 py-1 text-xs text-muted transition hover:bg-surface hover:text-err"
                      >
                        Cancelar
                      </button>
                    }
                  </div>
                </div>

                @if (op.pendingSudo) {
                  <div class="flex items-center gap-2 border-b border-amber-500/20 bg-amber-500/5 px-4 py-2">
                    <svg class="h-4 w-4 text-amber-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 118 0v3" />
                    </svg>
                    <input
                      type="password"
                      placeholder="Contraseña de sudo requerida por el comando"
                      (input)="setInline(op.id, $any($event.target).value)"
                      (keydown.enter)="sendPwd(op.id)"
                      class="w-full rounded-lg border border-amber-500/30 bg-surface px-3 py-1.5 text-sm text-white outline-none focus:border-amber-300"
                    />
                  </div>
                }

                <pre
                  class="max-h-64 overflow-auto whitespace-pre-wrap break-all px-4 py-3 font-mono text-[11px] leading-relaxed text-slate-300"
                >{{ op.text || 'Ejecutando…' }}</pre>
              </div>
            }
          </div>
        </div>
      </div>
    }
  `,
})
export class ConsolePanel {
  ops = inject(OpsService);
  collapsed = signal(false);
  private inline = new Map<number, string>();

  constructor() {
    let prev = 0;
    effect(() => {
      const now = this.ops.ops().length;
      if (now > prev) {
        this.ops.show();
        this.collapsed.set(false);
      }
      prev = now;
    });
  }

  runningCount() {
    return this.ops.ops().filter((o) => o.running).length;
  }

  expand() {
    this.collapsed.set(!this.collapsed());
  }

  reveal() {
    this.ops.show();
    this.collapsed.set(false);
  }

  setInline(id: number, v: string) {
    this.inline.set(id, v);
  }

  inlinePwd(id: number): string {
    return this.inline.get(id) ?? '';
  }

  sendPwd(id: number) {
    const pwd = this.inlinePwd(id);
    if (!pwd) return;
    this.ops.sendPassword(id, pwd);
    this.inline.delete(id);
  }
}