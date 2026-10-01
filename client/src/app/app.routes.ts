import { Routes } from '@angular/router';
import { loginGuard, sessionGuard } from './core/auth/auth.guards';
import { SEO } from './core/seo';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  { path: 'landing', loadComponent: () => import('./pages/landing.page').then(m => m.LandingPage), data: { seo: SEO.home } },
  { path: 'login', canActivate: [loginGuard], loadComponent: () => import('./pages/login.page').then(m => m.LoginPage), data: { seo: SEO.login } },
  { path: 'resume', canActivate: [sessionGuard], loadComponent: () => import('./pages/resume.page').then(m => m.ResumePage), data: { seo: SEO.start } },
  { path: 'start', canActivate: [sessionGuard], loadComponent: () => import('./pages/welcome.page').then(m => m.WelcomePage), data: { seo: SEO.start } },
  {
    path: 'review',
    canActivate: [sessionGuard],
    loadComponent: () => import('./pages/review/review-shell.page').then(m => m.ReviewShellPage),
    data: { seo: SEO.review },
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'employment' },
      { path: 'employment', loadComponent: () => import('./pages/review/review-employment.page').then(m => m.ReviewEmploymentPage) },
      { path: 'documents', loadComponent: () => import('./pages/review/review-documents.page').then(m => m.ReviewDocumentsPage) },
      { path: 'salary', loadComponent: () => import('./pages/review/review-salary.page').then(m => m.ReviewSalaryPage) },
      { path: 'funds', loadComponent: () => import('./pages/review/review-funds.page').then(m => m.ReviewFundsPage) },
      { path: 'dashboard', loadComponent: () => import('./pages/review/review-dashboard.page').then(m => m.ReviewDashboardPage) },
      { path: 'reconciliation', loadComponent: () => import('./pages/review/review-reconciliation.page').then(m => m.ReviewReconciliationPage) },
      { path: 'simulation', loadComponent: () => import('./pages/review/review-simulation.page').then(m => m.ReviewSimulationPage) },
      { path: 'termination', loadComponent: () => import('./pages/review/review-termination.page').then(m => m.ReviewTerminationPage) },
      { path: 'report', loadComponent: () => import('./pages/review/review-report.page').then(m => m.ReviewReportPage) }
    ]
  },
  { path: 'reason', canActivate: [sessionGuard], loadComponent: () => import('./pages/reason.page').then(m => m.ReasonPage), data: { seo: SEO.reason } },
  { path: 'details', canActivate: [sessionGuard], loadComponent: () => import('./pages/details.page').then(m => m.DetailsPage), data: { seo: SEO.details } },
  { path: 'checklist', canActivate: [sessionGuard], loadComponent: () => import('./pages/checklist.page').then(m => m.ChecklistPage), data: { seo: SEO.checklist } },
  { path: 'sources', canActivate: [sessionGuard], loadComponent: () => import('./pages/sources.page').then(m => m.SourcesPage), data: { seo: SEO.sources } },
  { path: 'help/professionals', canActivate: [sessionGuard], loadComponent: () => import('./pages/partners.page').then(m => m.PartnersPage), data: { seo: SEO.professionals, kind: 'professionals' } },
  { path: 'help/lawyers', canActivate: [sessionGuard], loadComponent: () => import('./pages/partners.page').then(m => m.PartnersPage), data: { seo: SEO.lawyers, kind: 'lawyers' } },
  { path: 'help/:kind/:id', canActivate: [sessionGuard], loadComponent: () => import('./pages/partner-contact.page').then(m => m.PartnerContactPage), data: { seo: SEO.professionals } },
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
