import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'onboarding',
    loadComponent: () => import('./pages/onboarding/onboarding').then((m) => m.OnboardingPage),
  },
  {
    path: 'inicio',
    loadComponent: () => import('./pages/dashboard/dashboard').then((m) => m.DashboardPage),
  },
  {
    path: 'programas',
    loadComponent: () => import('./pages/programs/programs').then((m) => m.ProgramsPage),
  },
  {
    path: 'programas/:manager/:name',
    loadComponent: () => import('./pages/package/package').then((m) => m.PackageDetailPage),
  },
  {
    path: 'terminal',
    loadComponent: () => import('./pages/terminal/terminal').then((m) => m.TerminalPage),
  },
  {
    path: 'tienda',
    loadComponent: () => import('./pages/store/store').then((m) => m.StorePage),
  },
  {
    path: 'mantenimiento',
    loadComponent: () => import('./pages/maintenance/maintenance').then((m) => m.MaintenancePage),
  },
  {
    path: 'ajustes',
    loadComponent: () => import('./pages/settings/settings').then((m) => m.SettingsPage),
  },
  { path: '', pathMatch: 'full', redirectTo: 'inicio' },
  { path: '**', redirectTo: 'inicio' },
];