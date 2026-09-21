import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { PackagesService } from '../../core/packages.service';
import { SettingsService } from '../../core/settings.service';
import { OpsService } from '../../core/ops.service';
import { TerminalService } from '../../core/terminal.service';
import { PackageCard } from '../../components/package-card';
import { Category, Origin, Pkg, Section } from '../../types';
import { CATEGORY_LABEL, CATEGORY_ORDER, ORIGIN_LABEL, ORIGIN_ORDER, SECTION_ICON, SECTION_LABEL, SECTION_ORDER, classifySection, sectionColor } from '../../format';

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
        <label class="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-xs text-muted">
          <input type="checkbox" [checked]="showDeps()" (change)="toggleDeps($any($event.target).checked)" class="h-3.5 w-3.5 accent-accent" />
          dependencias
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
      @for (c of CATEGORY_ORDER; track c) {
        <button
          (click)="setTab(c)"
          class="flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm transition"
          [class.bg-accent]="tab() === c"
          [class.text-white]="tab() === c"
          [class.bg-surface2]="tab() !== c"
          [class.text-slate-300]="tab() !== c"
        >
          {{ CATEGORY_LABEL[c] }}
          <span class="text-xs opacity-70">{{ countOf(c) }}</span>
          @if (pendingOf(c).length > 0) {
            <span class="rounded-full bg-ok px-1.5 text-[10px] font-bold text-black">{{ pendingOf(c).length }}</span>
          }
        </button>
      }
      <div class="ml-auto flex items-center gap-2">
        @if (tab() === 'terminal') {
          <div class="relative w-48">
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
        }
        <div class="w-64">
          <input
            type="search"
            (input)="query.set($any($event.target).value)"
            placeholder="Buscar por nombre o descripción…"
            class="w-full rounded-xl border border-border bg-surface2 px-4 py-2 text-sm text-white outline-none transition focus:border-accent"
          />
        </div>
      </div>
    </div>

    @if (tab() === 'terminal' && sub() === null) {
      @if (sections().length === 0) {
        <div class="rounded-2xl border border-dashed border-border py-16 text-center text-sm text-muted">
          No hay programas de terminal instalados
        </div>
      } @else {
        <div class="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          @for (s of sections(); track s.section) {
            <button
              (click)="sub.set(s.section)"
              class="group flex flex-col items-start gap-3 rounded-2xl border border-border bg-surface p-5 text-left transition hover:border-accent/40 hover:bg-surface2"
            >
              <span class="flex h-10 w-10 items-center justify-center rounded-xl {{ sectionColor(s.section) }}">
                <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path [attr.d]="SECTION_ICON[s.section]" />
                </svg>
              </span>
              <span>
                <span class="block text-sm font-semibold text-white">{{ SECTION_LABEL[s.section] }}</span>
                <span class="block text-xs text-muted">{{ s.count }} {{ s.count === 1 ? 'programa' : 'programas' }}</span>
              </span>
            </button>
          }
        </div>
      }
    } @else {
      @if (tab() === 'terminal' && sub() !== null) {
        <div class="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-4 py-3">
          <button
            (click)="sub.set(null)"
            class="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-muted transition hover:bg-surface2 hover:text-white"
          >
            <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M19 12H5m0 0l6 6m-6-6l6-6" /></svg>
            Volver a secciones
          </button>
          <div class="flex items-center gap-2 text-sm">
            <span class="font-semibold text-white">{{ SECTION_LABEL[sub()!] }}</span>
            <span class="text-xs text-muted">{{ countOfSection(sub()!) }} programas</span>
          </div>
        </div>
      }

      @if (filtered().length === 0) {
        <div class="rounded-2xl border border-dashed border-border py-16 text-center text-sm text-muted">
          No se encontraron programas
        </div>
      } @else {
        <div class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
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

  protected readonly CATEGORY_ORDER = CATEGORY_ORDER;
  protected readonly CATEGORY_LABEL = CATEGORY_LABEL;
  protected readonly ORIGIN_ORDER = ORIGIN_ORDER;
  protected readonly ORIGIN_LABEL = ORIGIN_LABEL;
  protected readonly SECTION_ORDER = SECTION_ORDER;
  protected readonly SECTION_LABEL = SECTION_LABEL;
  protected readonly SECTION_ICON = SECTION_ICON;
  protected readonly sectionColor = sectionColor;

  tab = signal<Category>('all');
  sub = signal<Section | null>(null);
  originFilter = signal<Origin | 'todas'>('todas');
  originOpen = signal(false);
  query = signal('');
  showDeps = signal(true);
  updating = signal(false);
  toUninstall = signal<Pkg | null>(null);

  constructor() {
    if (!this.packages.loaded()) {
      void this.packages.refresh();
    }
  }

  setTab(c: Category) {
    this.sub.set(null);
    this.originFilter.set('todas');
    this.tab.set(c);
  }

  setOrigin(o: Origin | 'todas') {
    this.originFilter.set(o);
    this.originOpen.set(false);
  }

  originLabel() {
    const o = this.originFilter();
    return o === 'todas' ? 'Origen: todos' : ORIGIN_LABEL[o];
  }

  allCount() {
    return this.packages.packages().length;
  }

  countOf(c: Category) {
    return this.packages.packages().filter((p) => p.category === c).length;
  }

  sections() {
    return SECTION_ORDER.map((s) => ({ section: s, count: this.countOfSection(s) })).filter(
      (s) => s.count > 0,
    );
  }

  countOfSection(s: Section) {
    const o = this.originFilter();
    return this.packages.packages().filter((p) => p.category === 'terminal' && classifySection(p) === s && (o === 'todas' || p.origin === o)).length;
  }

  pending(): Pkg[] {
    return this.packages.availableUpdates();
  }

  pendingOf(c: Category) {
    return this.packages.packages().filter((p) => p.category === c && p.update);
  }

  filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const t = this.tab();
    const s = this.sub();
    const o = this.originFilter();
    return this.packages.packages().filter((p) => {
      if (t !== 'all' && p.category !== t) return false;
      if (t === 'terminal' && s !== null && classifySection(p) !== s) return false;
      if (t === 'terminal' && o !== 'todas' && p.origin !== o) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q);
    });
  });

  async refresh() {
    await this.packages.toggleDeps(this.showDeps());
  }

  async toggleDeps(v: boolean) {
    this.showDeps.set(v);
    await this.packages.toggleDeps(v);
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