import { Injectable, signal } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';
import { CacheInfo, ListResult, Pkg, PkgDetails, SearchResult } from '../types';

@Injectable({ providedIn: 'root' })
export class PackagesService {
  readonly packages = signal<Pkg[]>([]);
  readonly errors = signal<string[]>([]);
  readonly managersUsed = signal<string[]>([]);
  readonly loading = signal(false);
  readonly loaded = signal(false);

  private lastDeps = true;

  async refresh(showDeps: boolean = true): Promise<void> {
    this.loading.set(true);
    try {
      const res = await invoke<ListResult>('list_packages', { showDependencies: showDeps });
      this.lastDeps = showDeps;
      const managers = [...new Set(res.packages.map((p) => p.manager))];
      const updates: Pkg[][] = await Promise.all(
        managers.map((m) =>
          invoke<Pkg[]>('list_updates', { manager: m }).catch(() => [] as Pkg[]),
        ),
      );
      const byName = new Map<string, Pkg | undefined>();
      for (const p of res.packages) byName.set(p.name, p);
      for (const list of updates) {
        for (const u of list) {
          const t = byName.get(u.name);
          if (t) t.update = u.update;
        }
      }
      this.packages.set(res.packages);
      this.errors.set(res.errors);
      this.managersUsed.set(res.managersUsed);
      this.loaded.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  toggleDeps(show: boolean): Promise<void> {
    return this.refresh(show);
  }

  updatesFor(manager: string): Promise<Pkg[]> {
    return invoke<Pkg[]>('list_updates', { manager }).catch(() => [] as Pkg[]);
  }

  async search(query: string): Promise<SearchResult[]> {
    return invoke<SearchResult[]>('search_packages', { query });
  }

  async details(manager: string, name: string): Promise<PkgDetails> {
    return invoke<PkgDetails>('package_details', { manager, name });
  }

  async orphans(): Promise<Pkg[]> {
    return invoke<Pkg[]>('get_orphans');
  }

  async cacheInfo(): Promise<CacheInfo[]> {
    return invoke<CacheInfo[]>('get_cache_info');
  }

  async launch(pkg: Pkg): Promise<void> {
    const name = pkg.desktopFiles[0] ?? pkg.name;
    await invoke('launch_app', { name });
  }

  availableUpdates(): Pkg[] {
    return this.packages().filter((p) => p.update);
  }
}