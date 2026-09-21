import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Pkg } from '../types';
import { CATEGORY_LABEL, ORIGIN_LABEL, SECTION_LABEL, categoryColor, classifySection, formatBytes, managerLabel, originColor, sectionColor } from '../format';

@Component({
  selector: 'app-package-card',
  standalone: true,
  styles: [':host { display: block; height: 100%; }'],
  template: `
    <div
      (click)="openDetails()"
      class="group flex h-full cursor-pointer flex-col gap-3 rounded-2xl border border-border bg-surface p-4 transition hover:border-accent/40 hover:bg-surface2"
    >
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <h3 class="truncate text-sm font-semibold text-white">{{ pkg.name }}</h3>
            <span class="rounded-md bg-surface2 px-1.5 py-0.5 font-mono text-[10px] text-muted">
              v{{ pkg.version || '—' }}
            </span>
          </div>
          <p class="mt-1 line-clamp-2 text-xs text-muted">{{ pkg.description || 'Sin descripción' }}</p>
        </div>
        @if (pkg.update) {
          <span class="flex shrink-0 items-center gap-1 rounded-lg bg-ok/10 px-2 py-1 text-[10px] font-medium text-ok">
            <svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path d="M4 4v5h5M20 20v-5h-5 M5.1 14a7 7 0 0112.4 3.2M18.9 10A7 7 0 006.5 6.8" />
            </svg>
            {{ pkg.update.newVersion }}
          </span>
        }
      </div>

      <div class="flex flex-wrap items-center gap-1.5 text-[10px]">
        <span class="rounded-md border px-1.5 py-0.5 {{ pkg.category === 'terminal' ? sectionColor(classifySection(pkg)) : categoryColor(pkg.category) }}">
          {{ pkg.category === 'terminal' ? SECTION_LABEL[classifySection(pkg)] : CATEGORY_LABEL[pkg.category] }}
        </span>
        <span class="rounded-md bg-surface2 px-1.5 py-0.5 text-muted">{{ managerLabel(pkg.manager) }}</span>
        @if (pkg.origin) {
          <span class="rounded-md border px-1.5 py-0.5 {{ originColor(pkg.origin) }}">
            {{ ORIGIN_LABEL[pkg.origin] }}
          </span>
        }
        @if (pkg.explicit) {
          <span class="rounded-md bg-surface2 px-1.5 py-0.5 text-muted">explicito</span>
        }
        @if (pkg.size > 0) {
          <span class="rounded-md bg-surface2 px-1.5 py-0.5 text-muted">{{ formatBytes(pkg.size) }}</span>
        }
        @if (pkg.update?.repo) {
          <span class="rounded-md bg-surface2 px-1.5 py-0.5 text-muted">{{ pkg.update!.repo }}</span>
        }
      </div>

      <div class="mt-auto flex flex-wrap gap-1.5">
        @if (pkg.desktopFiles.length > 0) {
          <button
            (click)="stop($event); launch.emit(pkg)"
            class="inline-flex items-center gap-1.5 rounded-lg bg-accent/15 px-3 py-1.5 text-xs font-medium text-accent2 transition hover:bg-accent/25"
          >
            <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path d="M10 15l6-6M15 9h.01M9 14a5 5 0 110 2" />
            </svg>
            Abrir
          </button>
        }
        @if (pkg.category === 'terminal' || pkg.category === 'aur') {
          <button
            (click)="stop($event); openTerminal.emit(pkg)"
            class="inline-flex items-center gap-1.5 rounded-lg bg-surface2 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-border"
            title="Abrir en un terminal dentro de ESG"
          >
            <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path d="M4 17l6-5-6-5M12 19h8" />
            </svg>
            Terminal
          </button>
        }
        @if (pkg.update) {
          <button
            (click)="stop($event); update.emit(pkg)"
            class="inline-flex items-center gap-1.5 rounded-lg bg-ok/15 px-3 py-1.5 text-xs font-medium text-ok transition hover:bg-ok/25"
          >
            <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path d="M4 4v5h5M20 20v-5h-5 M5.1 14a7 7 0 0112.4 3.2M18.9 10A7 7 0 006.5 6.8" />
            </svg>
            Actualizar
          </button>
        }
        <button
          (click)="stop($event); uninstall.emit(pkg)"
          class="ml-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-muted transition hover:bg-err/10 hover:text-err"
        >
          <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" />
          </svg>
          Desinstalar
        </button>
      </div>
    </div>
  `,
})
export class PackageCard {
  @Input() pkg!: Pkg;
  @Output() launch = new EventEmitter<Pkg>();
  @Output() openTerminal = new EventEmitter<Pkg>();
  @Output() update = new EventEmitter<Pkg>();
  @Output() uninstall = new EventEmitter<Pkg>();
  @Output() details = new EventEmitter<Pkg>();

  protected readonly CATEGORY_LABEL = CATEGORY_LABEL;
  protected readonly ORIGIN_LABEL = ORIGIN_LABEL;
  protected readonly SECTION_LABEL = SECTION_LABEL;
  protected readonly categoryColor = categoryColor;
  protected readonly originColor = originColor;
  protected readonly sectionColor = sectionColor;
  protected readonly classifySection = classifySection;
  protected readonly managerLabel = managerLabel;
  protected readonly formatBytes = formatBytes;

  stop(e: Event) {
    e.stopPropagation();
  }

  openDetails() {
    this.details.emit(this.pkg);
  }
}