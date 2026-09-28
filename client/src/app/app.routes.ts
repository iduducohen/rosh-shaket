import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./pages/welcome.page').then(m => m.WelcomePage) },
  { path: 'reason', loadComponent: () => import('./pages/reason.page').then(m => m.ReasonPage) },
  { path: 'details', loadComponent: () => import('./pages/details.page').then(m => m.DetailsPage) },
  {
    path: 'results',
    loadComponent: () => import('./pages/results-tabs.page').then(m => m.ResultsTabsPage),
    children: [
      { path: 'summary', loadComponent: () => import('./pages/summary.page').then(m => m.SummaryPage) },
      { path: 'checklist', loadComponent: () => import('./pages/checklist.page').then(m => m.ChecklistPage) },
      { path: 'sources', loadComponent: () => import('./pages/sources.page').then(m => m.SourcesPage) },
      { path: '', redirectTo: 'summary', pathMatch: 'full' }
    ]
  },
  { path: '**', redirectTo: '' }
];
