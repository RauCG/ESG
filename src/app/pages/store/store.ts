import { Component, ChangeDetectorRef, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { OpsService } from '../../core/ops.service';
import { PackagesService } from '../../core/packages.service';
import { SearchResult } from '../../types';
import { managerLabel } from '../../format';

@Component({
  selector: 'app-store',
  standalone: true,
  styles: [`
    .dots::after { content: ''; animation: dots 1.2s steps(1) infinite; }
    @keyframes dots {
      0% { content: ''; }
      25% { content: '.'; }
      50% { content: '..'; }
      75% { content: '...'; }
    }
  `],
  template: `
    <header class="mb-6">
      <h1 class="text-2xl font-bold text-white">Tienda</h1>
      <p class="text-sm text-muted">Busca programas instalados en tu sistema o disponibles en tus gestores.</p>
    </header>

    <div class="flex items-center gap-2">
      <div class="relative flex-1 max-w-xl">
        <svg class="pointer-events-none absolute left-3 top-2.5 h-5 w-5 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.35-4.35" />
        </svg>
        <input
          type="search"
          (keydown.enter)="search()"
          (input)="onSearchInput($any($event.target).value)"
          placeholder="Buscar (ej. firefox, btop, spotify…)" autofocus
          class="w-full rounded-xl border border-border bg-surface2 py-2.5 pl-10 pr-4 text-sm text-white outline-none transition focus:border-accent"
        />
      </div>
      <button
        (click)="search()"
        [disabled]="!q() || loading()"
        class="rounded-xl bg-accent px-6 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
      >
        {{ loading() ? 'Buscando…' : 'Buscar' }}
      </button>
    </div>

    @if (loading()) {
      <div class="mt-8 flex flex-col items-center gap-4 rounded-2xl border border-border bg-surface/60 py-16">
        <svg class="h-10 w-10 animate-spin text-accent2" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
        <p class="text-sm font-medium text-slate-300">
          Buscando coincidencias<span class="dots"></span>
        </p>
        <p class="animate-pulse text-xs text-muted">consultando instalados, repos y AUR…</p>
      </div>
    }

    @if (searched() && results().length === 0 && !loading()) {
      <div class="mt-8 rounded-2xl border border-dashed border-border py-16 text-center text-sm text-muted">
        Sin resultados para «{{ lastQ() }}»
      </div>
    }

    @if (results().length > 0) {
      <div class="mt-6 space-y-2">
        @for (r of shown(); track r.manager + ':' + r.name + ':' + r.source) {
          <div
            (click)="open(r)"
            class="group flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 transition hover:border-accent/40 hover:bg-surface2"
          >
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <span class="font-mono text-sm font-semibold text-white">{{ r.name }}</span>
                <span class="rounded bg-surface2 px-1.5 py-0.5 font-mono text-[10px] text-muted">v{{ r.version }}</span>
                @if (r.repo) {
                  <span class="rounded bg-surface2 px-1.5 py-0.5 text-[10px] text-muted">{{ r.repo }}</span>
                }
                <span class="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] text-accent2">{{ managerLabel(r.manager) }}</span>
                <span class="rounded px-1.5 py-0.5 text-[10px] {{ badgeOf(r) }}">{{ labelOf(r) }}</span>
                @if (r.source === 'aur' && r.votes > 0) {
                  <span class="rounded bg-surface2 px-1.5 py-0.5 text-[10px] text-amber-300">★ {{ r.votes }} · {{ r.popularity.toFixed(2) }}</span>
                }
              </div>
              <p class="mt-1 truncate text-xs text-muted">{{ r.description || 'Sin descripción' }}</p>
            </div>
            <button
              (click)="install($event, r)"
              [disabled]="installing()"
              class="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-ok/15 px-4 py-1.5 text-xs font-semibold text-ok transition hover:bg-ok/25 disabled:opacity-50"
            >
              <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path d="M12 5v14m0 0l-6-6m6 6l6-6" />
              </svg>
              {{ r.installed ? 'Ver' : 'Instalar' }}
            </button>
          </div>
        }
      </div>
      @if (shown().length < results().length) {
        <div class="mt-4 text-center">
          <button
            (click)="loadMore()"
            class="rounded-xl border border-border bg-surface px-5 py-2 text-sm text-slate-300 transition hover:border-accent/50"
          >
            Mostrar más ({{ shown().length }} / {{ results().length }})
          </button>
        </div>
      }
    }
  `,
})
export class StorePage {
  packages = inject(PackagesService);
  ops = inject(OpsService);
  router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  protected readonly managerLabel = managerLabel;

  q = signal('');
  lastQ = signal('');
  results = signal<SearchResult[]>([]);
  loading = signal(false);
  searched = signal(false);
  installing = signal(false);
  visible = signal(20);

  onSearchInput(v: string) {
    this.q.set(v);
  }

  shown(): SearchResult[] {
    return this.results().slice(0, this.visible());
  }

  loadMore() {
    this.visible.set(this.visible() + 20);
  }

  labelOf(r: SearchResult): string {
    switch (r.source) {
      case 'instalado':
        return 'instalado';
      case 'aur':
        return 'AUR';
      case 'repos':
        return 'repos';
      case 'flatpak':
        return 'Flatpak';
      case 'snap':
        return 'Snap';
    }
  }

  badgeOf(r: SearchResult): string {
    switch (r.source) {
      case 'instalado':
        return 'bg-ok/15 text-ok';
      case 'aur':
        return 'bg-amber-500/15 text-amber-300';
      case 'repos':
        return 'bg-accent/15 text-accent2';
      case 'flatpak':
        return 'bg-emerald-500/15 text-emerald-300';
      case 'snap':
        return 'bg-orange-500/15 text-orange-300';
    }
  }

  async search() {
    const query = this.q().trim();
    if (!query || this.loading()) return;
    // Limpieza inmediata: ni rastro de resultados viejos mientras se busca.
    this.results.set([]);
    this.searched.set(false);
    this.loading.set(true);
    this.visible.set(20);
    // Pinta el panel al instante, antes de que empiece el trabajo asíncrono.
    this.cdr.detectChanges();
    const t0 = Date.now();
    try {
      const res = await this.packages.search(query);
      // Espera el tiempo mínimo ANTES de mostrar nada: todo sale a la vez.
      const wait = Math.max(0, 2500 - (Date.now() - t0));
      await new Promise((r) => setTimeout(r, wait));
      this.results.set(res);
      this.lastQ.set(query);
      this.searched.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  open(r: SearchResult) {
    void this.router.navigate(['programas', r.manager, r.name]);
  }

  async install(event: Event, r: SearchResult) {
    event.stopPropagation();
    if (r.installed) {
      this.open(r);
      return;
    }
    this.installing.set(true);
    try {
      await this.ops.run({ kind: 'install', manager: r.manager, packages: [r.name] }, `Instalar ${r.name}`);
    } finally {
      this.installing.set(false);
    }
  }
}