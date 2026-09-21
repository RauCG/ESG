import { Component, inject, signal } from '@angular/core';
import { OpsService } from '../../core/ops.service';
import { PackagesService } from '../../core/packages.service';
import { SettingsService } from '../../core/settings.service';
import { CacheInfo, Pkg } from '../../types';
import { formatBytes } from '../../format';

@Component({
  selector: 'app-maintenance',
  standalone: true,
  template: `
    <header class="mb-6">
      <h1 class="text-2xl font-bold text-white">Mantenimiento</h1>
      <p class="text-sm text-muted">Limpieza de paquetes huérfanos y cachés del sistema.</p>
    </header>

    <section class="mb-6 rounded-2xl border border-border bg-surface p-5">
      <div class="mb-3 flex items-center justify-between">
        <h2 class="text-sm font-semibold uppercase tracking-wide text-muted">Paquetes huérfanos</h2>
        <div class="flex items-center gap-2">
          <button
            (click)="loadOrphans()"
            class="rounded-lg border border-border px-3 py-1.5 text-xs text-slate-300 transition hover:border-accent/50"
          >
            Analizar
          </button>
          @if (orphans().length > 0) {
            <button
              (click)="cleanOrphans()"
              class="rounded-lg bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-300 transition hover:bg-amber-500/25"
            >
              Limpiar {{ orphans().length }}
            </button>
          }
        </div>
      </div>

      @if (orphans().length === 0) {
        <p class="text-sm text-muted">
          {{ orphansChecked() ? 'No hay paquetes huérfanos. 🎉' : 'Pulsa «Analizar» para detectar paquetes que ya no son necesarios.' }}
        </p>
      } @else {
        <div class="flex flex-wrap gap-2">
          @for (o of orphans(); track o.name) {
            <span class="rounded-lg bg-surface2 px-2.5 py-1 font-mono text-xs text-slate-300">{{ o.name }}</span>
          }
        </div>
      }
    </section>

    <section class="rounded-2xl border border-border bg-surface p-5">
      <div class="mb-3 flex items-center justify-between">
        <h2 class="text-sm font-semibold uppercase tracking-wide text-muted">Cachés</h2>
        <button
          (click)="loadCache()"
          class="rounded-lg border border-border px-3 py-1.5 text-xs text-slate-300 transition hover:border-accent/50"
        >
          Calcular tamaño
        </button>
      </div>

      @if (caches().length === 0) {
        <p class="text-sm text-muted">No hay cachés disponibles para tus gestores.</p>
      } @else {
        <div class="grid gap-3 md:grid-cols-2">
          @for (c of caches(); track c.path + c.label) {
            <div class="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface2/60 px-4 py-3">
              <div class="min-w-0">
                <div class="truncate text-sm text-white">{{ c.label }}</div>
                <div class="truncate font-mono text-[11px] text-muted">{{ c.path }}</div>
                <div class="mt-0.5 text-xs font-semibold text-slate-300">
                  {{ formatBytes(c.sizeBytes) || '—' }}
                </div>
              </div>
              <button
                (click)="cleanCache(c)"
                class="shrink-0 rounded-lg bg-err/10 px-3 py-1.5 text-xs font-semibold text-err transition hover:bg-err/20"
              >
                Limpiar
              </button>
            </div>
          }
        </div>
      }

      <p class="mt-4 text-[11px] leading-relaxed text-muted">
        «Limpiar caché» elimina versiones antiguas de paquetes descargados y archivos temporales,
        sin tocar los paquetes instalados. Los tamaños se recalculan tras cada limpieza.
      </p>
    </section>
  `,
})
export class MaintenancePage {
  packages = inject(PackagesService);
  settings = inject(SettingsService);
  ops = inject(OpsService);

  protected readonly formatBytes = formatBytes;

  orphans = signal<Pkg[]>([]);
  orphansChecked = signal(false);
  caches = signal<CacheInfo[]>([]);

  async loadOrphans() {
    this.orphans.set(await this.packages.orphans());
    this.orphansChecked.set(true);
  }

  async cleanOrphans() {
    const fam = this.settings.settings()?.family;
    const manager = fam === 'debian' ? 'apt' : fam === 'fedora' || fam === 'rhel' ? 'dnf' : 'pacman';
    await this.ops.run({ kind: 'orphans', manager }, 'Limpiar paquetes huérfanos');
    this.orphans.set([]);
  }

  async loadCache() {
    this.caches.set(await this.packages.cacheInfo());
  }

  async cleanCache(c: CacheInfo) {
    const manager = c.path.includes('pacman') ? 'pacman' : c.path.includes('yay') ? 'yay' : c.path.includes('/apt') ? 'apt' : 'dnf';
    await this.ops.run({ kind: 'cache', manager, packages: [c.path] }, `Limpiar ${c.label}`);
  }

  constructor() {
    void this.loadOrphans();
    void this.loadCache();
  }
}