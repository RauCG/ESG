import { Component, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { SettingsService } from './core/settings.service';
import { ConsolePanel } from './components/console-panel';
import { PasswordDialog } from './components/password-dialog';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ConsolePanel, PasswordDialog],
  templateUrl: './app.html',
})
export class App {
  settings = inject(SettingsService);
  router = inject(Router);
  isOnboarding = signal(false);

  constructor() {
    this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd)).subscribe((e) => {
      this.isOnboarding.set(e.urlAfterRedirects.startsWith('/onboarding'));
    });
  }

  async ngOnInit() {
    await this.settings.boot();
    if (!this.settings.isConfigured) {
      await this.router.navigate(['onboarding']);
      if (this.router.url.startsWith('/onboarding')) this.isOnboarding.set(true);
    } else if (this.router.url.startsWith('/onboarding')) {
      await this.router.navigate(['inicio']);
    }
  }
}