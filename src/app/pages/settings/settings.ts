import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FAMILIES, SettingsService } from '../../core/settings.service';
import { PackagesService } from '../../core/packages.service';
import { ManagerInfo } from '../../types';

@Component({
  selector: 'app-settings',
  standalone: true,
  template: `
    <header class="mb-6">
      <h1 class="text-2xl font-bold text-white">Ajustes</h1>
      <p class="text-sm text-muted">Configura el sistema y los gestores que usa ESG.</p>
    </header>

    <div class="grid gap-6 lg:grid-cols-2">
      <section class="rounded-2xl border border-border bg-surface p-5">
        <h2 class="mb-4 text-sm font-semibold uppercase tracking-wide text-muted">Sistema detectado</h2>
        @if (sys()) {
          <dl class="space-y-2 text-sm">
            @for (row of rows; track row.k) {
              <div class="flex justify-between gap-4 border-b border-border/50 pb-1.5">
                <dt class="shrink-0 text-muted">{{ row.k }}</dt>
                <dd class="truncate text-right text-slate-200">{{ row.v }}</dd>
              </div>
            }
          </dl>
        }
        <button
          (click)="redetect()"
          class="mt-5 rounded-xl border border-accent/40 px-4 py-2 text-sm text-accent2 transition hover:bg-accent/10"
        >
          Re-detectar gestores
        </button>
      </section>

      <section class="rounded-2xl border border-border bg-surface p-5">
        <h2 class="mb-4 text-sm font-semibold uppercase tracking-wide text-muted">Gestores de paquetes</h2>

        <label class="mb-1 block text-xs font-medium text-muted">Familia del sistema</label>
        <div class="relative mb-4">
          @if (famOpen()) {
            <div class="fixed inset-0 z-10" (click)="famOpen.set(false)"></div>
          }
          <button
            (click)="famOpen.set(!famOpen())"
            type="button"
            class="flex w-full items-center justify-between gap-2 rounded-xl border border-border bg-surface2 px-3 py-2.5 text-sm text-white outline-none transition focus:border-accent"
          >
            <span class="truncate">{{ familyLabel() }}</span>
            <svg class="h-4 w-4 shrink-0 text-muted transition" [class.rotate-180]="famOpen()" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6" /></svg>
          </button>
          @if (famOpen()) {
            <div class="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-border bg-surface2 shadow-2xl">
              @for (f of FAMILIES; track f.id) {
                <button
                  (click)="selectFamily(f.id)"
                  type="button"
                  class="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm text-slate-200 transition hover:bg-surface"
                >
                  <span class="truncate">{{ f.label }}</span>
                  @if (f.id === family()) {
                    <svg class="h-4 w-4 shrink-0 text-accent2" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M5 13l4 4L19 7" /></svg>
                  }
                </button>
              }
            </div>
          }
        </div>

        <div class="space-y-2">
          @for (m of managers(); track m.id) {
            <div class="flex items-center justify-between rounded-xl border border-border bg-surface2/60 px-3 py-2.5">
              <div class="min-w-0">
                <div class="flex items-center gap-2 text-sm text-white">
                  {{ m.label }}
                  @if (m.detected) {
                    <span class="rounded bg-ok/15 px-1.5 py-0.5 text-[10px] text-ok">detectado</span>
                  } @else {
                    <span class="rounded bg-surface px-1.5 py-0.5 text-[10px] text-muted">no instalado</span>
                  }
                </div>
              </div>
              <button
                (click)="toggle(m.id)"
                [disabled]="(m.family !== family() && m.family !== 'universal') || !m.detected"
                class="relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-30"
                [class.bg-accent]="m.enabled"
                [class.bg-border]="!m.enabled"
              >
                <span
                  class="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all"
                  [class.left-[22px]]="m.enabled"
                  [class.left-0.5]="!m.enabled"
                ></span>
              </button>
            </div>
          }
        </div>

        <label class="mt-5 flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-surface2/60 px-3 py-2.5">
          <input type="checkbox" [checked]="showDeps()" (change)="showDeps.set($any($event.target).checked)" class="h-4 w-4 accent-accent" />
          <span class="text-sm text-white">Mostrar dependencias en el listado</span>
        </label>

        @if (error()) {
          <p class="mt-3 text-xs text-err">{{ error() }}</p>
        }

        <div class="mt-5 flex items-center gap-2">
          <button
            (click)="save()"
            [disabled]="saving()"
            class="flex-1 rounded-xl bg-accent py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
          >
            {{ saving() ? 'Guardando…' : 'Guardar ajustes' }}
          </button>
          <button
            (click)="resetForSetup()"
            class="rounded-xl border border-border px-4 py-3 text-sm text-muted transition hover:bg-surface2"
            title="Volver a la configuración inicial"
          >
            Reconfigurar
          </button>
        </div>
      </section>
    </div>
  `,
})
export class SettingsPage {
  settings = inject(SettingsService);
  packages = inject(PackagesService);
  router = inject(Router);

  protected readonly FAMILIES = FAMILIES;

  sys = this.settings.system;
  family = signal<string>('arch');
  managers = signal<ManagerInfo[]>([]);
  showDeps = signal(false);
  saving = signal(false);
  error = signal<string | null>(null);
  famOpen = signal(false);

  constructor() {
    const s = this.settings.settings();
    this.family.set(s?.family ?? 'arch');
    this.managers.set(s?.managers ?? []);
    this.showDeps.set(s?.showDependencies ?? false);
  }

  get rows() {
    const s = this.sys();
    return [
      { k: 'Distribución', v: s?.prettyName ?? '—' },
      { k: 'ID', v: s?.distro ?? '—' },
      { k: 'Versión', v: s?.versionId || '—' },
      { k: 'Núcleo', v: s?.kernel ?? '—' },
      { k: 'Arquitectura', v: s?.arch ?? '—' },
      { k: 'Escritorio', v: s?.desktop || '—' },
      { k: 'Sesión', v: s?.session || '—' },
    ];
  }

  familyLabel(): string {
    return this.FAMILIES.find((f) => f.id === this.family())?.label ?? this.family();
  }

  async changeFamily(fam: string) {
    this.family.set(fam);
    await this.applyFamily(fam);
  }

  selectFamily(fam: string) {
    this.famOpen.set(false);
    void this.changeFamily(fam);
  }

  async applyFamily(fam: string) {
    try {
      const managers = await this.settings.detect(fam);
      this.managers.set(managers);
    } catch (e) {
      this.error.set(String(e));
    }
  }

  async redetect() {
    await this.applyFamily(this.family());
  }

  toggle(id: string) {
    this.managers.set(this.managers().map((m) => (m.id === id ? { ...m, enabled: !m.enabled } : m)));
  }

  async save() {
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.settings.save({
        family: this.family(),
        managers: this.managers(),
        showDependencies: this.showDeps(),
      });
      if (this.packages.loaded()) {
        void this.packages.refresh();
      }
    } catch (e) {
      this.error.set(String(e));
    } finally {
      this.saving.set(false);
    }
  }

  async resetForSetup() {
    localStorage.removeItem('esg.configured');
    await this.router.navigate(['onboarding']);
  }
}