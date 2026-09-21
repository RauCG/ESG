import { Component, inject, signal } from '@angular/core';
import { SudoService } from '../core/sudo.service';

@Component({
  selector: 'app-password-dialog',
  standalone: true,
  template: `
    @if (sudo.needPassword()) {
      <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
        (mousedown)="onBackdrop($event)"
      >
        <div
          class="w-[380px] rounded-2xl border border-border bg-surface p-6 shadow-2xl"
          (mousedown)="$event.stopPropagation()"
        >
          <div class="flex items-center gap-3">
            <div class="grid h-11 w-11 place-items-center rounded-xl bg-amber-500/15 text-amber-300">
              @if (busy()) {
                <svg class="h-6 w-6 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
              } @else {
                <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <rect x="4" y="10" width="16" height="11" rx="2" />
                  <path d="M8 10V7a4 4 0 118 0v3" />
                </svg>
              }
            </div>
            <div>
              <h2 class="text-base font-semibold text-white">Se requiere contraseña</h2>
              <p class="text-xs text-muted">ESG necesita permisos de administrador (sudo).</p>
            </div>
          </div>

          <input
            #pwd
            type="password"
            autofocus
            [disabled]="busy()"
            (keydown.enter)="submit(pwd.value)"
            (keydown.escape)="cancel()"
            placeholder="Contraseña de usuario (@if (sudo.status().user) { {{ sudo.status().user }} })"
            class="mt-5 w-full rounded-xl border border-border bg-surface2 px-4 py-3 text-sm text-white outline-none transition focus:border-accent"
          />

          @if (sudo.lastError()) {
            <p class="mt-2 text-xs text-err">{{ sudo.lastError() }}</p>
          }

          <div class="mt-5 flex items-center justify-end gap-2">
            <button
              (click)="cancel()"
              class="rounded-xl px-4 py-2 text-sm text-muted transition hover:bg-surface2 hover:text-white"
            >
              Cancelar
            </button>
            <button
              (click)="submit(pwd.value)"
              [disabled]="busy() || !pwd.value"
              class="rounded-xl bg-accent px-5 py-2 text-sm font-medium text-white transition hover:brightness-110 disabled:opacity-40"
            >
              Verificar
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class PasswordDialog {
  sudo = inject(SudoService);
  busy = signal(false);

  async submit(password: string) {
    if (!password || this.busy()) return;
    this.busy.set(true);
    try {
      await this.sudo.verify(password);
      this.sudo.submitPassword(password);
    } catch {
      // error mostrado en el diálogo
    } finally {
      this.busy.set(false);
    }
  }

  cancel() {
    this.sudo.cancelPassword();
  }

  onBackdrop(e: MouseEvent) {
    this.cancel();
  }
}