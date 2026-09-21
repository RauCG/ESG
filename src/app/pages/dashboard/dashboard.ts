import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { PackagesService } from '../../core/packages.service';
import { SettingsService } from '../../core/settings.service';
import { OpsService } from '../../core/ops.service';
import { TerminalService } from '../../core/terminal.service';
import { CATEGORY_ORDER } from '../../format';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  template: `
    <header class="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-2xl font-bold text-white">Inicio</h1>
        <p class="text-sm text-muted">Resumen de tu sistema y acciones rápidas.</p>
      </div>
      <button
        (click)="refresh()"
        class="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2 text-sm text-slate-300 transition hover:border-accent/50"
      >
        <svg class="h-4 w-4" [class.animate-spin]="packages.loading()" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path d="M4 4v5h5M20 20v-5h-5 M5.1 14a7 7 0 0112.4 3.2M18.9 10A7 7 0 006.5 6.8" />
        </svg>
        Refrescar catálogo
      </button>
    </header>

    <div class="grid grid-cols-2 gap-4 md:grid-cols-4">
      @for (card of cards; track card.label) {
        <button
          (click)="card.go ? go(card.go) : null"
          class="rounded-2xl border border-border bg-surface p-4 text-left transition hover:border-accent/40 hover:bg-surface2"
        >
          <div class="flex items-center gap-2 text-xs uppercase tracking-wide text-muted">
            {{ card.label }}
          </div>
          <div class="mt-2 text-3xl font-bold text-white">{{ card.value }}</div>
          <div class="mt-1 text-[11px]" [class]="card.extraClass ?? 'text-muted'">{{ card.sub }}</div>
        </button>
      }
    </div>

    <div class="mt-6 grid gap-4 lg:grid-cols-2">
      <section class="rounded-2xl border border-border bg-surface p-5">
        <h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Sistema</h2>
        @if (sys()) {
          <dl class="space-y-2 text-sm">
            @for (row of systemRows; track row.k) {
              <div class="flex justify-between gap-4 border-b border-border/50 pb-1.5">
                <dt class="shrink-0 text-muted">{{ row.k }}</dt>
                <dd class="truncate text-right text-slate-200">{{ row.v }}</dd>
              </div>
            }
          </dl>
        } @else {
          <p class="text-sm text-muted">Cargando…</p>
        }
      </section>

      <section class="rounded-2xl border border-border bg-surface p-5">
        <h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Acciones rápidas</h2>
        <div class="grid gap-2">
          <button
            (click)="updateAll()"
            [disabled]="updating()"
            class="flex items-center justify-between rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
          >
            <span>{{ updating() ? 'Actualizando…' : 'Actualizar todo el sistema' }}</span>
            @if (pendingCount() > 0) {
              <span class="rounded-lg bg-white/20 px-2 py-0.5 text-xs">{{ pendingCount() }} pendientes</span>
            }
          </button>
          <button
            (click)="newTerminal()"
            class="flex items-center justify-between rounded-xl bg-surface2 px-4 py-3 text-sm text-slate-200 transition hover:bg-border"
          >
            <span>Nuevo terminal embebido</span>
            <span class="text-xs text-muted">xterm.js</span>
          </button>
          <button
            (click)="go('tienda')"
            class="flex items-center justify-between rounded-xl bg-surface2 px-4 py-3 text-sm text-slate-200 transition hover:bg-border"
          >
            <span>Buscar e instalar programas</span>
            <span class="text-xs text-muted">tienda</span>
          </button>
        </div>
      </section>
    </div>
  `,
})
export class DashboardPage {
  packages = inject(PackagesService);
  settingsSvc = inject(SettingsService);
  ops = inject(OpsService);
  terminal = inject(TerminalService);
  router = inject(Router);

  sys = this.settingsSvc.system;
  updating = signal(false);

  get systemRows() {
    const s = this.sys();
    const fam = this.settingsSvc.settings()?.family ?? s?.defaultFamily ?? '—';
    return [
      { k: 'Distribución', v: s?.prettyName ?? '—' },
      { k: 'Núcleo', v: `${s?.kernel ?? ''}` },
      { k: 'Arquitectura', v: s?.arch ?? '—' },
      { k: 'Escritorio', v: s?.desktop || '—' },
      { k: 'Familia', v: fam },
      { k: 'Host', v: s?.hostname ?? '—' },
    ];
  }

  total = computed(() => this.packages.packages().length);
  categories() {
    const arr = this.packages.packages();
    return CATEGORY_ORDER.map((c) => ({
      cat: c,
      count: arr.filter((p) => p.category === c).length,
    }));
  }
  pendingCount() {
    return this.packages.availableUpdates().length;
  }

  get cards() {
    const byCat = new Map(CATEGORY_ORDER.map((c) => [c, this.categories().find((x) => x.cat === c)?.count ?? 0]));
    const managers = this.settingsSvc.enabledMaggers().length;
    return [
      { label: 'Programas', value: this.total(), sub: 'instalados', go: 'programas' },
      {
        label: 'App GUI',
        value: byCat.get('gui') ?? 0,
        sub: 'con interfaz gráfica',
        go: 'programas',
        extraClass: 'text-cyan-300',
      },
      {
        label: 'Terminal',
        value: byCat.get('terminal') ?? 0,
        sub: 'programas de consola',
        go: 'programas',
        extraClass: 'text-violet-300',
      },
      {
        label: 'AUR',
        value: byCat.get('aur') ?? 0,
        sub: 'paquetes de AUR',
        go: 'programas',
        extraClass: 'text-amber-300',
      },
      {
        label: 'Actualizaciones',
        value: this.pendingCount(),
        sub: 'pendientes',
        extraClass: this.pendingCount() > 0 ? 'text-ok' : 'text-muted',
      },
      {
        label: 'Gestores',
        value: managers,
        sub: 'activados',
        extraClass: 'text-accent2',
      },
      {
        label: 'Flatpak',
        value: byCat.get('flatpak') ?? 0,
        sub: 'apps Flatpak',
        go: 'programas',
        extraClass: 'text-emerald-300',
      },
      {
        label: 'Snap',
        value: byCat.get('snap') ?? 0,
        sub: 'apps Snap',
        go: 'programas',
        extraClass: 'text-orange-300',
      },
    ];
  }

  async refresh() {
    await this.packages.refresh();
  }

  go(route: string) {
    void this.router.navigate([route]);
  }

  async newTerminal() {
    await this.terminal.open('Terminal');
    void this.router.navigate(['terminal']);
  }

  async updateAll() {
    this.updating.set(true);
    try {
      const managers = new Set(this.packages.packages().map((p) => p.manager));
      for (const m of managers) {
        await this.ops.run({ kind: 'update', manager: m }, `Actualizar todo (${m})`, true);
      }
    } finally {
      this.updating.set(false);
    }
  }

  constructor() {
    if (!this.packages.loaded()) {
      void this.packages.refresh();
    }
  }
}