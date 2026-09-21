import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { PackagesService } from '../../core/packages.service';
import { OpsService } from '../../core/ops.service';
import { TerminalService } from '../../core/terminal.service';
import { Pkg, PkgDetails } from '../../types';
import { categoryColor, CATEGORY_LABEL, SECTION_LABEL, classifySection, formatBytes, managerLabel, sectionColor } from '../../format';

@Component({
  selector: 'app-package-detail',
  standalone: true,
  template: `
    @if (loading()) {
      <div class="py-24 text-center text-sm text-muted">Cargando información…</div>
    } @else if (error()) {
      <div class="py-24 text-center text-sm text-err">{{ error() }}</div>
    } @else if (d()) {
      <header class="mb-6">
        <button
          (click)="back()"
          class="mb-4 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-muted transition hover:bg-surface2 hover:text-white"
        >
          <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M19 12H5m0 0l6 6m-6-6l6-6" /></svg>
          Volver
        </button>
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div class="flex flex-wrap items-center gap-2">
              <h1 class="font-mono text-2xl font-bold text-white">{{ d()!.name }}</h1>
              <span class="rounded-lg bg-surface2 px-2 py-1 font-mono text-sm text-muted">v{{ d()!.version || '—' }}</span>
            </div>
            <div class="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
              @if (d()!.category === 'terminal') {
                <span class="rounded-md border px-2 py-0.5 {{ sectionColor(classifySection(d()!)) }}">
                  {{ SECTION_LABEL[classifySection(d()!)] }}
                </span>
              } @else {
                <span class="rounded-md border px-2 py-0.5 {{ categoryColor(d()!.category) }}">
                  {{ CATEGORY_LABEL[d()!.category] ?? 'Paquete' }}
                </span>
              }
              <span class="rounded-md bg-surface2 px-2 py-0.5 text-muted">{{ managerLabel(d()!.manager) }}</span>
              @if (d()!.repo) {
                <span class="rounded-md bg-surface2 px-2 py-0.5 text-muted">{{ d()!.repo }}</span>
              }
              @if (d()!.installed) {
                <span class="rounded-md bg-ok/15 px-2 py-0.5 font-medium text-ok">instalado</span>
              } @else {
                <span class="rounded-md bg-accent/15 px-2 py-0.5 font-medium text-accent2">no instalado</span>
              }
              @if (d()!.outOfDate) {
                <span class="rounded-md bg-err/15 px-2 py-0.5 font-medium text-err">desactualizado (AUR)</span>
              }
            </div>
          </div>
          <div class="flex flex-wrap gap-2">
            @if (!d()!.installed) {
              <button
                (click)="install()"
                [disabled]="busy()"
                class="rounded-xl bg-ok px-5 py-2.5 text-sm font-semibold text-black transition hover:brightness-110 disabled:opacity-50"
              >
                Instalar
              </button>
            } @else {
              @if (upd()) {
                <button
                  (click)="upgrade()"
                  [disabled]="busy()"
                  class="rounded-xl bg-ok/15 px-5 py-2.5 text-sm font-semibold text-ok transition hover:bg-ok/25 disabled:opacity-50"
                >
                  Actualizar (v{{ upd()!.newVersion }})
                </button>
              }
              @if (d()!.desktopFiles.length > 0) {
                <button
                  (click)="launch()"
                  [disabled]="busy()"
                  class="rounded-xl bg-accent/15 px-5 py-2.5 text-sm font-medium text-accent2 transition hover:bg-accent/25 disabled:opacity-50"
                >
                  Abrir
                </button>
              }
              @if (d()!.category === 'terminal' || d()!.category === 'aur') {
                <button
                  (click)="openTerminal()"
                  class="rounded-xl bg-surface2 px-5 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-border"
                >
                  Terminal
                </button>
              }
              <button
                (click)="askUninstall()"
                [disabled]="busy()"
                class="rounded-xl bg-err/10 px-5 py-2.5 text-sm font-medium text-err transition hover:bg-err/20 disabled:opacity-50"
              >
                Desinstalar
              </button>
            }
          </div>
        </div>
      </header>

      @if (d()!.description) {
        <p class="mb-6 max-w-3xl whitespace-pre-line text-sm leading-relaxed text-slate-300">{{ d()!.description }}</p>
      } @else {
        <p class="mb-6 max-w-3xl text-sm italic text-muted">Sin descripción disponible.</p>
      }

      <div class="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        @for (m of metrics(); track m.label) {
          <div class="rounded-2xl border border-border bg-surface p-4">
            <div class="text-[10px] uppercase tracking-wide text-muted">{{ m.label }}</div>
            <div class="mt-1 text-sm font-semibold text-white">{{ m.value }}</div>
          </div>
        }
      </div>

      <div class="mb-6 rounded-2xl border border-border bg-surface p-5">
        <h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Información</h2>
        <dl class="grid gap-x-6 gap-y-2.5 text-sm md:grid-cols-2">
          @for (row of infoRows(); track row.k) {
            <div class="flex justify-between gap-4 border-b border-border/50 pb-1.5">
              <dt class="shrink-0 text-muted">{{ row.k }}</dt>
              <dd class="truncate text-right text-slate-200">{{ row.v }}</dd>
            </div>
          }
        </dl>
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        @for (g of groups(); track g.title) {
          <div class="rounded-2xl border border-border bg-surface p-5">
            <h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{{ g.title }}</h3>
            @if (g.items.length > 0) {
              <div class="flex flex-wrap gap-1.5">
                @for (item of g.items; track item) {
                  <span class="rounded-md bg-surface2 px-2 py-1 font-mono text-[11px] text-slate-300">{{ item }}</span>
                }
              </div>
            } @else {
              <p class="text-xs text-muted">Ninguno</p>
            }
          </div>
        }
      </div>

      @if (toUninstall()) {
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div class="w-[420px] rounded-2xl border border-border bg-surface p-6 shadow-2xl">
            <h2 class="flex items-center gap-2 text-base font-semibold text-white">
              <svg class="h-5 w-5 text-err" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path d="M12 9v4m0 4h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />
              </svg>
              ¿Desinstalar {{ d()!.name }}?
            </h2>
            <p class="mt-2 text-sm text-muted">
              Se eliminará el paquete y sus dependencias no usadas. Esta acción requiere permisos de administrador.
            </p>
            <div class="mt-6 flex justify-end gap-2">
              <button (click)="toUninstall.set(false)" class="rounded-xl px-4 py-2 text-sm text-muted transition hover:bg-surface2 hover:text-white">
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
    }
  `,
})
export class PackageDetailPage {
  packages = inject(PackagesService);
  ops = inject(OpsService);
  terminal = inject(TerminalService);
  router = inject(Router);
  route = inject(ActivatedRoute);

  protected readonly CATEGORY_LABEL = CATEGORY_LABEL;
  protected readonly SECTION_LABEL = SECTION_LABEL;
  protected readonly categoryColor = categoryColor;
  protected readonly sectionColor = sectionColor;
  protected readonly classifySection = classifySection;
  protected readonly managerLabel = managerLabel;
  protected readonly formatBytes = formatBytes;

  d = signal<PkgDetails | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);
  busy = signal(false);
  toUninstall = signal(false);

  constructor() {
    const manager = this.route.snapshot.paramMap.get('manager') ?? '';
    const name = this.route.snapshot.paramMap.get('name') ?? '';
    void this.load(manager, name);
  }

  private async load(manager: string, name: string) {
    this.loading.set(true);
    this.error.set(null);
    try {
      const d = await this.packages.details(manager, name);
      this.d.set(d);
    } catch (e) {
      this.error.set(String(e));
    } finally {
      this.loading.set(false);
    }
  }

  private async reload() {
    const m = this.route.snapshot.paramMap.get('manager') ?? '';
    const n = this.route.snapshot.paramMap.get('name') ?? '';
    await this.load(m, n);
  }

  upd() {
    const d = this.d();
    if (d?.update) return d.update;
    if (d) {
      const found = this.packages.packages().find((p) => p.name === d.name && p.update);
      return found?.update ?? null;
    }
    return null;
  }

  metrics(): { label: string; value: string }[] {
    const d = this.d();
    if (!d) return [];
    return [
      {
        label: 'Tamaño de descarga',
        value: d.downloadSize > 0 ? this.formatBytes(d.downloadSize) : '—',
      },
      {
        label: 'Tamaño instalado',
        value: d.installedSize > 0 ? this.formatBytes(d.installedSize) : '—',
      },
      { label: 'Votos (AUR)', value: d.votes > 0 ? String(d.votes) : '—' },
      { label: 'Popularidad (AUR)', value: d.popularity > 0 ? d.popularity.toFixed(2) : '—' },
    ];
  }

  infoRows(): { k: string; v: string }[] {
    const d = this.d();
    if (!d) return [];
    const rows = [
      { k: 'Arquitectura', v: d.architecture || '—' },
      { k: 'Repositorio', v: d.repo || '—' },
      { k: 'Licencias', v: d.licenses.join(', ') || '—' },
      { k: 'Grupos', v: d.groups.join(', ') || '—' },
      { k: 'URL', v: d.url || '—' },
      { k: 'Encargado', v: d.packager || '—' },
      { k: 'Fecha de compilación', v: d.buildDate || '—' },
      { k: 'Fecha de instalación', v: d.installDate || '—' },
      { k: 'Motivo de instalación', v: d.installReason || '—' },
      { k: 'Instalación explícita', v: d.installed ? (d.explicit ? 'Sí' : 'No') : '—' },
    ];
    if (d.maintainer) rows.push({ k: 'Mantenedor (AUR)', v: d.maintainer });
    if (d.submitted) rows.push({ k: 'Enviado (AUR)', v: d.submitted });
    if (d.modified) rows.push({ k: 'Última modificación (AUR)', v: d.modified });
    return rows;
  }

  groups(): { title: string; items: string[] }[] {
    const d = this.d();
    if (!d) return [];
    return [
      { title: 'Dependencias', items: d.depends },
      { title: 'Dependencias opcionales', items: d.optionalDeps },
      { title: 'Instalado por', items: d.requiredBy },
      { title: 'Provee', items: d.provides },
      { title: 'Conflictos', items: d.conflictsWith },
      { title: 'Reemplaza', items: d.replaces },
    ];
  }

  back() {
    window.history.length > 1 ? window.history.back() : void this.router.navigate(['programas']);
  }

  private buildPkg(): Pkg {
    const d = this.d();
    if (!d) throw new Error('Sin datos');
    return {
      name: d.name,
      version: d.version,
      description: d.description,
      manager: d.manager,
      category: d.category,
      size: d.installedSize,
      explicit: d.explicit,
      desktopFiles: d.desktopFiles,
      update: d.update,
    };
  }

  async install() {
    const d = this.d();
    if (!d) return;
    this.busy.set(true);
    try {
      await this.ops.run({ kind: 'install', manager: d.manager, packages: [d.name] }, `Instalar ${d.name}`);
      await this.afterChange();
    } finally {
      this.busy.set(false);
    }
  }

  async upgrade() {
    const d = this.d();
    if (!d) return;
    this.busy.set(true);
    try {
      await this.ops.run({ kind: 'upgrade', manager: d.manager, packages: [d.name] }, `Actualizar ${d.name}`);
      await this.afterChange();
    } finally {
      this.busy.set(false);
    }
  }

  async launch() {
    if (!this.d()) return;
    try {
      await this.packages.launch(this.buildPkg());
    } catch (e) {
      console.error(e);
    }
  }

  async openTerminal() {
    const d = this.d();
    if (!d) return;
    await this.terminal.open(d.name, d.name);
    void this.router.navigate(['terminal']);
  }

  askUninstall() {
    this.toUninstall.set(true);
  }

  async uninstall() {
    const d = this.d();
    if (!d) return;
    this.toUninstall.set(false);
    this.busy.set(true);
    try {
      await this.ops.run({ kind: 'uninstall', manager: d.manager, packages: [d.name] }, `Desinstalar ${d.name}`);
      await this.afterChange();
    } finally {
      this.busy.set(false);
    }
  }

  private async afterChange() {
    if (this.packages.loaded()) {
      await this.packages.refresh();
    }
    await this.reload();
  }
}