import { Routes } from '@angular/router';
import { loginGuard, sessionGuard } from './core/auth/auth.guards';
import { SEO } from './core/seo';
import { detailsStepGuard, resultsStepGuard, reviewCheckGuard, reviewDocumentsGuard } from './core/wizard-guards';

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
      { path: 'documents', canActivate: [reviewDocumentsGuard], loadComponent: () => import('./pages/review/review-documents.page').then(m => m.ReviewDocumentsPage) },
      { path: 'check', canActivate: [reviewCheckGuard], loadComponent: () => import('./pages/review/review-check.page').then(m => m.ReviewCheckPage) },
      { path: 'report', canActivate: [reviewCheckGuard], loadComponent: () => import('./pages/review/review-report.page').then(m => m.ReviewReportPage) },
      // Steps merged into check / report — keep old links and saved progress working.
      { path: 'salary', redirectTo: 'check', pathMatch: 'full' },
      { path: 'funds', redirectTo: 'check', pathMatch: 'full' },
      { path: 'dashboard', redirectTo: 'check', pathMatch: 'full' },
      { path: 'reconciliation', redirectTo: 'check', pathMatch: 'full' },
      { path: 'simulation', redirectTo: 'report', pathMatch: 'full' },
      { path: 'termination', redirectTo: 'report', pathMatch: 'full' }
    ]
  },
  { path: 'reason', canActivate: [sessionGuard], loadComponent: () => import('./pages/reason.page').then(m => m.ReasonPage), data: { seo: SEO.reason } },
  { path: 'details', canActivate: [sessionGuard, detailsStepGuard], loadComponent: () => import('./pages/details.page').then(m => m.DetailsPage), data: { seo: SEO.details } },
  { path: 'checklist', canActivate: [sessionGuard], loadComponent: () => import('./pages/checklist.page').then(m => m.ChecklistPage), data: { seo: SEO.checklist } },
  { path: 'sources', canActivate: [sessionGuard], loadComponent: () => import('./pages/sources.page').then(m => m.SourcesPage), data: { seo: SEO.sources } },
  { path: 'tax-refund', canActivate: [sessionGuard], loadComponent: () => import('./pages/tax-refund.page').then(m => m.TaxRefundPage), data: { seo: SEO.taxRefund } },
  { path: 'help/professionals', canActivate: [sessionGuard], loadComponent: () => import('./pages/partners.page').then(m => m.PartnersPage), data: { seo: SEO.professionals, kind: 'professionals' } },
  { path: 'help/lawyers', canActivate: [sessionGuard], loadComponent: () => import('./pages/partners.page').then(m => m.PartnersPage), data: { seo: SEO.lawyers, kind: 'lawyers' } },
  { path: 'help/:kind/:id', canActivate: [sessionGuard], loadComponent: () => import('./pages/partner-contact.page').then(m => m.PartnerContactPage), data: { seo: SEO.professionals } },
  {
    path: 'results',
    canActivate: [sessionGuard],
    data: { seo: SEO.results },
    loadComponent: () => import('./pages/results-tabs.page').then(m => m.ResultsTabsPage),
    children: [
      { path: 'summary', canActivate: [resultsStepGuard], loadComponent: () => import('./pages/summary.page').then(m => m.SummaryPage) },
      { path: 'reports', loadComponent: () => import('./pages/reports.page').then(m => m.ReportsPage) },
      { path: 'checklist', redirectTo: '/checklist', pathMatch: 'full' },
      { path: 'sources', redirectTo: '/sources', pathMatch: 'full' },
      { path: '', redirectTo: 'summary', pathMatch: 'full' }
    ]
  },
  { path: 'pricing', loadComponent: () => import('./pages/pricing.page').then(m => m.PricingPage) },
  { path: 'account', canActivate: [sessionGuard], loadComponent: () => import('./pages/account.page').then(m => m.AccountPage) },
  { path: 'how-it-works', loadComponent: () => import('./pages/info.page').then(m => m.InfoPage), data: { seo: SEO.howItWorks, doc: 'how' } },
  { path: 'about', loadComponent: () => import('./pages/info.page').then(m => m.InfoPage), data: { seo: SEO.about, doc: 'about' } },
  { path: 'glossary', loadComponent: () => import('./pages/glossary.page').then(m => m.GlossaryPage), data: { seo: SEO.glossary } },
  { path: 'terms', loadComponent: () => import('./pages/legal.page').then(m => m.LegalPage), data: { seo: SEO.terms, doc: 'terms' } },
  { path: 'privacy', loadComponent: () => import('./pages/legal.page').then(m => m.LegalPage), data: { seo: SEO.privacy, doc: 'privacy' } },
  { path: '**', redirectTo: 'login' }
];
