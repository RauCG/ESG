import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { PackagesService } from '../../core/packages.service';
import { SettingsService } from '../../core/settings.service';
import { OpsService } from '../../core/ops.service';
import { TerminalService } from '../../core/terminal.service';
import { PackageCard } from '../../components/package-card';
import { Origin, Pkg, Section } from '../../types';
import { MANAGER_TAB_ORDER, ORIGIN_LABEL, ORIGIN_ORDER, SECTION_LABEL, SECTION_ORDER, classifySection, managerTabLabel, sectionColor } from '../../format';

@Component({
  selector: 'app-programs',
  standalone: true,
  imports: [PackageCard],
  template: `
    <header class="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-2xl font-bold text-white">Programas</h1>
        <p class="text-sm text-muted">{{ packages.packages().length }} instalados ·
          {{ packages.availableUpdates().length }} con actualización disponible</p>
      </div>
      <div class="flex items-center gap-2">
        <label
          title="Al activarlo se quitarán todas las dependencias del SO"
          class="flex cursor-help items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-xs text-muted"
        >
          <input type="checkbox" [checked]="hideDeps()" (change)="toggleDeps($any($event.target).checked)" class="h-3.5 w-3.5 accent-accent" />
          Dependencias SO
        </label>
        <button
          (click)="refresh()"
          class="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2 text-sm text-slate-300 transition hover:border-accent/50"
        >
          <svg class="h-4 w-4" [class.animate-spin]="packages.loading()" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path d="M4 4v5h5M20 20v-5h-5 M5.1 14a7 7 0 0112.4 3.2M18.9 10A7 7 0 006.5 6.8" />
          </svg>
          Refrescar
        </button>
      </div>
    </header>

    @if (packages.errors().length > 0) {
      <div class="mb-4 rounded-xl border border-warn/30 bg-warn/10 px-4 py-3 text-xs text-amber-200">
        @for (e of packages.errors(); track e) {
          <div>⚠ {{ e }}</div>
        }
      </div>
    }

    @if (pending().length > 0) {
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ok/30 bg-ok/5 px-4 py-3">
        <div class="text-sm text-emerald-200">
          <span class="font-semibold">{{ pending().length }}</span> paquetes con actualización disponible
        </div>
        <button
          (click)="updateAllPending()"
          [disabled]="updating()"
          class="rounded-lg bg-ok px-4 py-1.5 text-xs font-semibold text-black transition hover:brightness-110 disabled:opacity-50"
        >
          {{ updating() ? 'Actualizando…' : 'Actualizar todo' }}
        </button>
      </div>
    }

    <div class="mb-4 flex flex-wrap items-center gap-2">
      <button
        (click)="setTab('all')"
        class="rounded-xl px-4 py-2 text-sm transition"
        [class.bg-accent]="tab() === 'all'"
        [class.text-white]="tab() === 'all'"
        [class.bg-surface2]="tab() !== 'all'"
        [class.text-slate-300]="tab() !== 'all'"
      >
        Todas
        <span class="ml-1 text-xs opacity-70">{{ allCount() }}</span>
      </button>
      @for (t of managerTabs(); track t.id) {
        <button
          (click)="setTab(t.id)"
          class="flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm transition"
          [class.bg-accent]="tab() === t.id"
          [class.text-white]="tab() === t.id"
          [class.bg-surface2]="tab() !== t.id"
          [class.text-slate-300]="tab() !== t.id"
        >
          {{ t.label }}
          <span class="text-xs opacity-70">{{ t.count }}</span>
          @if (t.pending > 0) {
            <span class="rounded-full bg-ok px-1.5 text-[10px] font-bold text-black">{{ t.pending }}</span>
          }
        </button>
      }
      <div class="ml-auto flex flex-wrap items-center gap-2">
        <button
          (click)="resetFilters()"
          type="button"
          title="Restablecer todos los filtros"
          class="inline-flex items-center justify-center rounded-xl border border-border bg-surface2 p-2 text-muted transition hover:border-accent/50 hover:text-white"
        >
          <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path d="M4 4v5h5M20 20v-5h-5 M5.1 14a7 7 0 0112.4 3.2M18.9 10A7 7 0 006.5 6.8" />
          </svg>
        </button>
        <div class="relative w-44">
          @if (originOpen()) {
            <div class="fixed inset-0 z-10" (click)="originOpen.set(false)"></div>
          }
          <button
            (click)="originOpen.set(!originOpen())"
            type="button"
            class="flex w-full items-center justify-between gap-2 rounded-xl border border-border bg-surface2 px-3 py-2 text-sm text-slate-200 outline-none transition hover:border-accent/50 focus:border-accent"
          >
            <span class="truncate">{{ originLabel() }}</span>
            <svg class="h-4 w-4 shrink-0 text-muted transition" [class.rotate-180]="originOpen()" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6" /></svg>
          </button>
          @if (originOpen()) {
            <div class="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-border bg-surface2 shadow-2xl">
              <button
                (click)="setOrigin('todas')"
                type="button"
                class="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-surface"
              >
                <span>Todos</span>
                @if (originFilter() === 'todas') {
                  <svg class="h-4 w-4 shrink-0 text-accent2" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M5 13l4 4L19 7" /></svg>
                }
              </button>
              @for (o of ORIGIN_ORDER; track o) {
                <button
                  (click)="setOrigin(o)"
                  type="button"
                  class="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-surface"
                >
                  <span>{{ ORIGIN_LABEL[o] }}</span>
                  @if (originFilter() === o) {
                    <svg class="h-4 w-4 shrink-0 text-accent2" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M5 13l4 4L19 7" /></svg>
                  }
                </button>
              }
            </div>
          }
        </div>
        @if (tab() === 'pacman') {
          <select
            (change)="sec.set($any($event.target).value)"
            class="w-44 cursor-pointer appearance-none rounded-xl border border-border bg-surface2 px-3 py-2 text-sm text-slate-200 outline-none transition hover:border-accent/50 focus:border-accent"
          >
            <option value="todas">Sección: todas</option>
            @for (s of sectionOptions(); track s.s) {
              <option [value]="s.s" [selected]="sec() === s.s">{{ SECTION_LABEL[s.s] }} ({{ s.count }})</option>
            }
          </select>
        }
        @for (cfg of sortDropdowns(); track cfg.key) {
          <div class="relative w-40">
            @if (sortOpen() === cfg.key) {
              <div class="fixed inset-0 z-10" (click)="sortOpen.set('')"></div>
            }
            <button
              (click)="sortOpen.set(sortOpen() === cfg.key ? '' : cfg.key)"
              type="button"
              class="flex w-full items-center justify-between gap-2 rounded-xl border border-border bg-surface2 px-3 py-2 text-sm text-slate-200 outline-none transition hover:border-accent/50 focus:border-accent"
            >
              <span class="truncate">{{ cfg.label }}</span>
              <svg class="h-4 w-4 shrink-0 text-muted transition" [class.rotate-180]="sortOpen() === cfg.key" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6" /></svg>
            </button>
            @if (sortOpen() === cfg.key) {
              <div class="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-border bg-surface2 shadow-2xl">
                @for (opt of cfg.opts; track opt.v) {
                  <button
                    (click)="setSort(opt.v)"
                    type="button"
                    class="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-surface"
                  >
                    <span>{{ opt.label }}</span>
                    @if (sortBy() === opt.v) {
                      <svg class="h-4 w-4 shrink-0 text-accent2" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M5 13l4 4L19 7" /></svg>
                    }
                  </button>
                }
              </div>
            }
          </div>
        }
        <div class="w-64">
          <input
            type="search"
            [value]="query()"
            (input)="query.set($any($event.target).value)"
            placeholder="Buscar por nombre o descripción…"
            class="w-full rounded-xl border border-border bg-surface2 px-4 py-2 text-sm text-white outline-none transition focus:border-accent"
          />
        </div>
      </div>
    </div>

    @if (filtered().length === 0) {
      <div class="rounded-2xl border border-dashed border-border py-16 text-center text-sm text-muted">
        No se encontraron programas
      </div>
    } @else {
      <div class="grid grid-cols-1 items-stretch gap-3 md:grid-cols-2 xl:grid-cols-3">
        @for (pkg of filtered(); track pkg.manager + ':' + pkg.name) {
          <app-package-card
            [pkg]="pkg"
            (launch)="launch($event)"
            (openTerminal)="openInTerminal($event)"
            (update)="updateOne($event)"
            (uninstall)="askUninstall($event)"
            (details)="goDetails($event)"
          />
        }
      </div>
    }

    @if (toUninstall()) {
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div class="w-[420px] rounded-2xl border border-border bg-surface p-6 shadow-2xl">
          <h2 class="flex items-center gap-2 text-base font-semibold text-white">
            <svg class="h-5 w-5 text-err" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path d="M12 9v4m0 4h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />
            </svg>
            ¿Desinstalar {{ toUninstall()!.name }}?
          </h2>
          <p class="mt-2 text-sm text-muted">
            Se eliminará el paquete y sus dependencias no usadas. Esta acción requiere permisos de administrador.
          </p>
          <div class="mt-6 flex justify-end gap-2">
            <button (click)="toUninstall.set(null)" class="rounded-xl px-4 py-2 text-sm text-muted transition hover:bg-surface2 hover:text-white">
              Cancelar
            </button>
            <button
              (click)="uninstall()"
              class="rounded-xl bg-err px-5 py-2 text-sm font-semibold text-white transition hover:brightness-110"
            >
              Desinstalar
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class ProgramsPage {
  packages = inject(PackagesService);
  settingsSvc = inject(SettingsService);
  ops = inject(OpsService);
  terminal = inject(TerminalService);
  router = inject(Router);

  protected readonly ORIGIN_ORDER = ORIGIN_ORDER;
  protected readonly ORIGIN_LABEL = ORIGIN_LABEL;
  protected readonly SECTION_ORDER = SECTION_ORDER;
  protected readonly SECTION_LABEL = SECTION_LABEL;
  protected readonly managerTabLabel = managerTabLabel;

  tab = signal<string>('all');
  sec = signal<Section | 'todas'>('todas');
  sortBy = signal<'nombre-asc' | 'nombre-desc' | 'tamano-asc' | 'tamano-desc' | 'fecha-asc' | 'fecha-desc'>('nombre-asc');
  sortOpen = signal<'' | 'nombre' | 'tamano' | 'fecha'>('');
  originFilter = signal<Origin | 'todas'>('todas');
  originOpen = signal(false);
  query = signal('');
  // Marcado = ocultar dependencias (por defecto desmarcado: se ve todo).
  hideDeps = signal(false);
  updating = signal(false);
  toUninstall = signal<Pkg | null>(null);

  constructor() {
    if (!this.packages.loaded()) {
      void this.packages.refresh();
    }
  }

  setTab(m: string) {
    this.sec.set('todas');
    this.originFilter.set('todas');
    this.tab.set(m);
  }

  setOrigin(o: Origin | 'todas') {
    this.originFilter.set(o);
    this.originOpen.set(false);
  }

  setSort(v: 'nombre-asc' | 'nombre-desc' | 'tamano-asc' | 'tamano-desc' | 'fecha-asc' | 'fecha-desc') {
    // Clic en la opción activa la quita y vuelve al orden por defecto.
    this.sortBy.set(this.sortBy() === v ? 'nombre-asc' : v);
    this.sortOpen.set('');
  }

  resetFilters() {
    this.originFilter.set('todas');
    this.originOpen.set(false);
    this.sec.set('todas');
    this.sortBy.set('nombre-asc');
    this.sortOpen.set('');
    this.query.set('');
  }

  sortDropdowns() {
    const s = this.sortBy();
    const active = (v: string) => s === v;
    return [
      {
        key: 'nombre' as const,
        label: active('nombre-asc') ? 'Nombre: A–Z' : active('nombre-desc') ? 'Nombre: Z–A' : 'Nombre',
        opts: [
          { v: 'nombre-asc' as const, label: 'A–Z' },
          { v: 'nombre-desc' as const, label: 'Z–A' },
        ],
      },
      {
        key: 'tamano' as const,
        label: active('tamano-asc') ? 'Tamaño: menor' : active('tamano-desc') ? 'Tamaño: mayor' : 'Tamaño',
        opts: [
          { v: 'tamano-asc' as const, label: 'Menor' },
          { v: 'tamano-desc' as const, label: 'Mayor' },
        ],
      },
      {
        key: 'fecha' as const,
        label: active('fecha-asc') ? 'Instalación: menor' : active('fecha-desc') ? 'Instalación: mayor' : 'Instalación',
        opts: [
          { v: 'fecha-asc' as const, label: 'Menor' },
          { v: 'fecha-desc' as const, label: 'Mayor' },
        ],
      },
    ];
  }

  originLabel() {
    const o = this.originFilter();
    return o === 'todas' ? 'Origen: todos' : ORIGIN_LABEL[o];
  }

  allCount() {
    return this.packages.packages().length;
  }

  managerTabs() {
    const pkgs = this.packages.packages();
    const order = (m: string) => {
      const i = MANAGER_TAB_ORDER.indexOf(m);
      return i < 0 ? 99 : i;
    };
    const ids = [...new Set(pkgs.map((p) => p.manager))].sort((a, b) => order(a) - order(b));
    return ids.map((id) => ({
      id,
      label: managerTabLabel(id),
      count: pkgs.filter((p) => p.manager === id).length,
      pending: pkgs.filter((p) => p.manager === id && p.update).length,
    }));
  }

  sectionOptions() {
    const o = this.originFilter();
    return SECTION_ORDER.map((s) => ({
      s,
      count: this.packages.packages().filter(
        (p) => p.category === 'terminal' && classifySection(p) === s && (o === 'todas' || !p.origin || p.origin === o),
      ).length,
    })).filter((x) => x.count > 0);
  }

  pending(): Pkg[] {
    return this.packages.availableUpdates();
  }

  filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const t = this.tab();
    const sec = this.sec();
    const o = this.originFilter();
    const sort = this.sortBy();
    const list = this.packages.packages().filter((p) => {
      if (t !== 'all' && p.manager !== t) return false;
      if (t === 'pacman' && sec !== 'todas' && (p.category !== 'terminal' || classifySection(p) !== sec)) return false;
      if (o !== 'todas' && p.origin && p.origin !== o) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q);
    });
    const arr = [...list];
    // Sin dato (0) siempre al final, en ambas direcciones.
    const numOr = (v: number | null | undefined, dir: 1 | -1) =>
      v ? v : dir === 1 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
    switch (sort) {
      case 'nombre-desc':
        arr.sort((a, b) => b.name.localeCompare(a.name));
        break;
      case 'tamano-asc':
        arr.sort((a, b) => numOr(a.size, 1) - numOr(b.size, 1) || a.name.localeCompare(b.name));
        break;
      case 'tamano-desc':
        arr.sort((a, b) => numOr(b.size, -1) - numOr(a.size, -1) || a.name.localeCompare(b.name));
        break;
      case 'fecha-asc':
        arr.sort((a, b) => numOr(a.installDate, 1) - numOr(b.installDate, 1) || a.name.localeCompare(b.name));
        break;
      case 'fecha-desc':
        arr.sort((a, b) => numOr(b.installDate, -1) - numOr(a.installDate, -1) || a.name.localeCompare(b.name));
        break;
      default:
        arr.sort((a, b) => a.name.localeCompare(b.name));
        break;
    }
    return arr;
  });

  async refresh() {
    await this.packages.toggleDeps(!this.hideDeps());
  }

  async toggleDeps(v: boolean) {
    this.hideDeps.set(v);
    await this.packages.toggleDeps(!v);
  }

  async launch(pkg: Pkg) {
    try {
      await this.packages.launch(pkg);
    } catch (e) {
      console.error(e);
    }
  }

  async openInTerminal(pkg: Pkg) {
    await this.terminal.open(pkg.name, pkg.name);
    void this.router.navigate(['terminal']);
  }

  goDetails(pkg: Pkg) {
    void this.router.navigate(['programas', pkg.manager, pkg.name]);
  }

  async updateOne(pkg: Pkg) {
    await this.ops.run({ kind: 'upgrade', manager: pkg.manager, packages: [pkg.name] }, `Actualizar ${pkg.name}`);
  }

  async updateAllPending() {
    this.updating.set(true);
    try {
      const managers = [...new Set(this.pending().map((p) => p.manager))];
      for (const m of managers) {
        const names = this.pending().filter((p) => p.manager === m).map((p) => p.name);
        await this.ops.run({ kind: 'upgrade', manager: m, packages: names }, `Actualizar pendientes (${m})`, true);
      }
    } finally {
      this.updating.set(false);
    }
  }

  askUninstall(pkg: Pkg) {
    this.toUninstall.set(pkg);
  }

  async uninstall() {
    const pkg = this.toUninstall();
    if (!pkg) return;
    this.toUninstall.set(null);
    await this.ops.run({ kind: 'uninstall', manager: pkg.manager, packages: [pkg.name] }, `Desinstalar ${pkg.name}`);
  }
}