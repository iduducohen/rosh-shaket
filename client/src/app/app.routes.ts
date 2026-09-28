import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';

export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./pages/login.page').then(m => m.LoginPage) },
  { path: '', loadComponent: () => import('./pages/welcome.page').then(m => m.WelcomePage), canActivate: [authGuard] },
  { path: 'reason', loadComponent: () => import('./pages/reason.page').then(m => m.ReasonPage), canActivate: [authGuard] },
  { path: 'details', loadComponent: () => import('./pages/details.page').then(m => m.DetailsPage), canActivate: [authGuard] },
  {
    path: 'results',
    loadComponent: () => import('./pages/results-tabs.page').then(m => m.ResultsTabsPage),
    canActivate: [authGuard],
    children: [
      { path: 'summary', loadComponent: () => import('./pages/summary.page').then(m => m.SummaryPage) },
      { path: 'checklist', loadComponent: () => import('./pages/checklist.page').then(m => m.ChecklistPage) },
      { path: 'sources', loadComponent: () => import('./pages/sources.page').then(m => m.SourcesPage) },
      { path: '', redirectTo: 'summary', pathMatch: 'full' }
    ]
  },
  { path: '**', redirectTo: '/login' }
];
