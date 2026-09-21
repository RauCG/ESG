import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FAMILIES, SettingsService } from '../../core/settings.service';
import { ManagerInfo } from '../../types';

@Component({
  selector: 'app-onboarding',
  standalone: true,
  template: `
    <div class="flex min-h-screen items-center justify-center bg-bg p-6">
      <div class="w-full max-w-lg">
        <div class="mb-8 text-center">
          <h1 class="text-3xl font-black tracking-tight text-white">
            <span class="bg-gradient-to-r from-accent to-accent2 bg-clip-text text-transparent">ESG</span>
          </h1>
          <p class="mt-2 text-sm text-muted">
            Detecta los programas de tu sistema y los gestiona de forma sencilla.
          </p>
        </div>

        <div class="rounded-2xl border border-border bg-surface p-6 shadow-xl">
          <div class="mb-5 flex items-center justify-between">
            <h2 class="text-sm font-semibold uppercase tracking-wide text-muted">Configuración inicial</h2>
            @if (sys()) {
              <span class="rounded-lg bg-surface2 px-2 py-1 text-xs text-slate-300">{{ sys()!.prettyName }}</span>
            }
          </div>

          @if (loading()) {
            <p class="py-10 text-center text-sm text-muted">Detectando sistema…</p>
          } @else {
            <label class="mb-1 block text-xs font-medium text-muted">Familia de gestores del sistema</label>
            <select
              (change)="changeFamily($any($event.target).value)"
              [value]="family()"
              class="mb-5 w-full rounded-xl border border-border bg-surface2 px-3 py-2.5 text-sm text-white outline-none transition focus:border-accent"
            >
              @for (f of FAMILIES; track f.id) {
                <option [value]="f.id">{{ f.label }}</option>
              }
            </select>

            <div class="mb-2 text-xs font-medium text-muted">Gestores de paquetes</div>
            <div class="space-y-2">
              @for (m of managers(); track m.id) {
                <div
                  class="flex items-center justify-between rounded-xl border border-border bg-surface2/60 px-3 py-2.5"
                >
                  <div class="min-w-0">
                    <div class="flex items-center gap-2 text-sm text-white">
                      {{ m.label }}
                      @if (m.detected) {
                        <span class="rounded bg-ok/15 px-1.5 py-0.5 text-[10px] text-ok">detectado</span>
                      } @else {
                        <span class="rounded bg-surface px-1.5 py-0.5 text-[10px] text-muted">no está instalado</span>
                      }
                    </div>
                    @if (m.note) {
                      <div class="text-[10px] text-muted">{{ m.note }}</div>
                    }
                  </div>
                  <button
                    (click)="toggle(m.id)"
                    [disabled]="m.family !== family() && m.family !== 'universal'"
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

            <label class="mt-5 flex items-center gap-3 rounded-xl border border-border bg-surface2/60 px-3 py-2.5">
              <input
                type="checkbox"
                [checked]="showDeps()"
                (change)="showDeps.set($any($event.target).checked)"
                class="h-4 w-4 accent-accent"
              />
              <span class="text-sm text-white">Mostrar dependencias en el listado</span>
            </label>

            @if (error()) {
              <p class="mt-3 text-xs text-err">{{ error() }}</p>
            }

            <button
              (click)="save()"
              [disabled]="saving()"
              class="mt-6 w-full rounded-xl bg-accent py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
            >
              {{ saving() ? 'Guardando…' : 'Listo, empezar' }}
            </button>
          }
        </div>

        <p class="mt-6 text-center text-[11px] leading-relaxed text-muted">
          La contraseña de administrador solo se usa para validar sudo y nunca se guarda.
        </p>
      </div>
    </div>
  `,
})
export class OnboardingPage {
  settings = inject(SettingsService);
  router = inject(Router);
  protected readonly FAMILIES = FAMILIES;

  family = signal<string>('arch');
  managers = signal<ManagerInfo[]>([]);
  showDeps = signal(false);
  loading = signal(true);
  saving = signal(false);
  error = signal<string | null>(null);
  sys = signal(this.settings.system() ?? null);

  constructor() {
    void this.init();
  }

  private async init() {
    const sys = this.settings.system() ?? (await this.settings.boot(), this.settings.system());
    this.sys.set(sys);
    this.family.set(sys?.defaultFamily || 'arch');
    await this.applyFamily(this.family());
  }

  async changeFamily(fam: string) {
    this.family.set(fam);
    await this.applyFamily(fam);
  }

  async applyFamily(fam: string) {
    this.loading.set(true);
    try {
      const managers = await this.settings.detect(fam);
      this.managers.set(managers);
      this.settings.settings()?.managers.forEach((saved) => {
        if (saved.enabled && saved.id !== 'pacman') {
          const target = managers.find((m) => m.id === saved.id);
          if (target) target.enabled = saved.enabled;
        }
      });
    } catch (e) {
      this.error.set(String(e));
    } finally {
      this.loading.set(false);
    }
  }

  toggle(id: string) {
    this.managers.set(this.managers().map((m) => (m.id === id ? { ...m, enabled: !m.enabled } : m)));
  }

  async save() {
    this.saving.set(true);
    try {
      const s = {
        family: this.family(),
        managers: this.managers(),
        showDependencies: this.showDeps(),
      };
      await this.settings.save(s);
      this.settings.markConfigured();
      await this.router.navigate(['inicio']);
    } catch (e) {
      this.error.set(String(e));
    } finally {
      this.saving.set(false);
    }
  }
}