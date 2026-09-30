import { Routes } from '@angular/router';
import { loginGuard, sessionGuard } from './core/auth/auth.guards';
import { SEO } from './core/seo';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  { path: 'landing', loadComponent: () => import('./pages/landing.page').then(m => m.LandingPage), data: { seo: SEO.home } },
  { path: 'login', canActivate: [loginGuard], loadComponent: () => import('./pages/login.page').then(m => m.LoginPage), data: { seo: SEO.login } },
  { path: 'start', canActivate: [sessionGuard], loadComponent: () => import('./pages/welcome.page').then(m => m.WelcomePage), data: { seo: SEO.start } },
  { path: 'reason', canActivate: [sessionGuard], loadComponent: () => import('./pages/reason.page').then(m => m.ReasonPage), data: { seo: SEO.reason } },
  { path: 'details', canActivate: [sessionGuard], loadComponent: () => import('./pages/details.page').then(m => m.DetailsPage), data: { seo: SEO.details } },
  { path: 'checklist', canActivate: [sessionGuard], loadComponent: () => import('./pages/checklist.page').then(m => m.ChecklistPage), data: { seo: SEO.checklist } },
  { path: 'sources', canActivate: [sessionGuard], loadComponent: () => import('./pages/sources.page').then(m => m.SourcesPage), data: { seo: SEO.sources } },
  {
    path: 'results',
    canActivate: [sessionGuard],
    data: { seo: SEO.results },
    loadComponent: () => import('./pages/results-tabs.page').then(m => m.ResultsTabsPage),
    children: [
      { path: 'summary', loadComponent: () => import('./pages/summary.page').then(m => m.SummaryPage) },
      { path: 'reports', loadComponent: () => import('./pages/reports.page').then(m => m.ReportsPage) },
      { path: 'checklist', redirectTo: '/checklist', pathMatch: 'full' },
      { path: 'sources', redirectTo: '/sources', pathMatch: 'full' },
      { path: '', redirectTo: 'summary', pathMatch: 'full' }
    ]
  },
  { path: 'terms', loadComponent: () => import('./pages/legal.page').then(m => m.LegalPage), data: { seo: SEO.terms, doc: 'terms' } },
  { path: 'privacy', loadComponent: () => import('./pages/legal.page').then(m => m.LegalPage), data: { seo: SEO.privacy, doc: 'privacy' } },
  { path: '**', redirectTo: 'login' }
];
