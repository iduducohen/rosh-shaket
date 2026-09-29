import { Routes } from '@angular/router';
import { loginGuard, sessionGuard } from './core/auth/auth.guards';
import { SEO } from './core/seo';

export const routes: Routes = [
  { path: '', pathMatch: 'full', loadComponent: () => import('./pages/landing.page').then(m => m.LandingPage), data: { seo: SEO.home } },
  { path: 'login', canActivate: [loginGuard], loadComponent: () => import('./pages/login.page').then(m => m.LoginPage), data: { seo: SEO.login } },
  { path: 'start', canActivate: [sessionGuard], loadComponent: () => import('./pages/welcome.page').then(m => m.WelcomePage), data: { seo: SEO.start } },
  { path: 'reason', canActivate: [sessionGuard], loadComponent: () => import('./pages/reason.page').then(m => m.ReasonPage), data: { seo: SEO.reason } },
  { path: 'details', canActivate: [sessionGuard], loadComponent: () => import('./pages/details.page').then(m => m.DetailsPage), data: { seo: SEO.details } },
  {
    path: 'results',
    canActivate: [sessionGuard],
    data: { seo: SEO.results },
    loadComponent: () => import('./pages/results-tabs.page').then(m => m.ResultsTabsPage),
    children: [
      { path: 'summary', loadComponent: () => import('./pages/summary.page').then(m => m.SummaryPage) },
      { path: 'checklist', loadComponent: () => import('./pages/checklist.page').then(m => m.ChecklistPage) },
      { path: 'sources', loadComponent: () => import('./pages/sources.page').then(m => m.SourcesPage) },
      { path: '', redirectTo: 'summary', pathMatch: 'full' }
    ]
  },
  { path: 'terms', loadComponent: () => import('./pages/legal.page').then(m => m.LegalPage), data: { seo: SEO.terms, doc: 'terms' } },
  { path: 'privacy', loadComponent: () => import('./pages/legal.page').then(m => m.LegalPage), data: { seo: SEO.privacy, doc: 'privacy' } },
  { path: '**', redirectTo: '' }
];
