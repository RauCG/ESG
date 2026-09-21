import { Component, inject } from '@angular/core';
import { TerminalService } from '../../core/terminal.service';
import { TerminalView } from '../../components/terminal-view';

@Component({
  selector: 'app-terminal',
  standalone: true,
  imports: [TerminalView],
  template: `
    <header class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-bold text-white">Terminal</h1>
        <p class="text-sm text-muted">Sesiones de terminal integradas (PTY). Puedes ejecutar cualquier cosa aquí.</p>
      </div>
      <div class="flex items-center gap-2">
        <button
          (click)="term.open()"
          class="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110"
        >
          Nueva terminal
        </button>
        <button
          (click)="term.closeAll()"
          class="rounded-xl border border-border bg-surface px-4 py-2 text-sm text-muted transition hover:text-err"
        >
          Cerrar todas
        </button>
      </div>
    </header>

    @if (term.sessions().length === 0) {
      <div class="rounded-2xl border border-dashed border-border py-20 text-center">
        <p class="text-sm text-muted">Sin sesiones abiertas.</p>
        <button (click)="term.open()" class="mt-3 text-sm font-medium text-accent2 hover:underline">
          Nueva terminal →
        </button>
      </div>
    } @else {
      <div class="flex flex-wrap items-center gap-1 rounded-t-xl border border-b-0 border-border bg-surface px-2 pt-2">
        @for (s of term.sessions(); track s.id) {
          <button
            class="flex items-center gap-2 rounded-t-lg px-3 py-2 text-xs transition"
            [class.bg-surface2]="term.activeId() === s.id"
            [class.text-white]="term.activeId() === s.id"
            [class.text-muted]="term.activeId() !== s.id"
            (click)="term.setActive(s.id)"
          >
            <span class="h-1.5 w-1.5 rounded-full" [class.bg-ok]="s.live" [class.bg-muted]="!s.live"></span>
            <span class="max-w-40 truncate">{{ s.label }}</span>
            <span class="text-slate-500 hover:text-err" (click)="$event.stopPropagation(); term.close(s.id)">✕</span>
          </button>
        }
      </div>
      <div class="h-[calc(100vh-16rem)] overflow-hidden rounded-b-xl border border-border bg-[#0b0f1a]">
        @for (s of term.sessions(); track s.id) {
          @if (term.activeId() === s.id) {
            <app-terminal-view [sessionId]="s.id" />
          }
        }
      </div>
    }
  `,
})
export class TerminalPage {
  term = inject(TerminalService);

  constructor() {
    if (this.term.sessions().length === 0) {
      void this.term.open('Terminal');
    }
  }
}