import { Injectable, signal } from '@angular/core';
import { invoke } from '@tauri-apps/api/core';
import { ManagerInfo, Settings, SystemInfo } from '../types';

export const FAMILIES: { id: string; label: string }[] = [
  { id: 'arch', label: 'Arch (pacman · yay/paru)' },
  { id: 'debian', label: 'Debian / Ubuntu (apt)' },
  { id: 'fedora', label: 'Fedora (dnf)' },
  { id: 'rhel', label: 'RHEL / Rocky / Alma (dnf)' },
  { id: 'suse', label: 'openSUSE (zypper)' },
  { id: 'other', label: 'Otra / personalizada' },
];

@Injectable({ providedIn: 'root' })
export class SettingsService {
  readonly system = signal<SystemInfo | null>(null);
  readonly settings = signal<Settings | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  get isConfigured(): boolean {
    return localStorage.getItem('esg.configured') === '1';
  }

  isFamily(family: string): boolean {
    return this.settings()?.family === family;
  }

  markConfigured() {
    localStorage.setItem('esg.configured', '1');
  }

  async boot(): Promise<void> {
    this.loading.set(true);
    try {
      const [settings, system] = await Promise.all([
        invoke<Settings>('get_settings'),
        invoke<SystemInfo>('system_info'),
      ]);
      this.settings.set(settings);
      this.system.set(system);
    } catch (e) {
      this.error.set(String(e));
    } finally {
      this.loading.set(false);
    }
  }

  async detect(family: string): Promise<ManagerInfo[]> {
    return invoke<ManagerInfo[]>('detect_managers', { family });
  }

  async save(s: Settings): Promise<void> {
    this.settings.set(s);
    await invoke('save_settings', { s });
  }

  async saveCurrent(): Promise<void> {
    const s = this.settings();
    if (s) await this.save(s);
  }

  managerEnabled(id: string): boolean {
    return this.settings()?.managers.find((m) => m.id === id)?.enabled ?? false;
  }

  enabledMaggers(): string[] {
    return (this.settings()?.managers ?? []).filter((m) => m.enabled && m.detected).map((m) => m.id);
  }
}