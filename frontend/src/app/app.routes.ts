import { CanDeactivateFn, Routes } from '@angular/router';
import { ClinicalShellComponent } from './layout/clinical-shell.component';
import { LoginPageComponent } from './features/auth/login-page.component';
import { pendingClinicalDraftGuard } from './core/patients/pending-clinical-draft.guard';
import { authenticatedGuard } from './core/auth/authenticated.guard';

const pendingConfigurationChangesGuard: CanDeactivateFn<{ canDeactivate: () => boolean }> = (component) =>
  component.canDeactivate();

export const routes: Routes = [
  { path: 'login', component: LoginPageComponent, title: 'Ingresar · HCOP Centro Oncologico' },
  {
    path: 'configuration',
    canActivate: [authenticatedGuard],
    canDeactivate: [pendingConfigurationChangesGuard],
    loadComponent: () => import('./features/configuration/configuration-hub').then((module) => module.ConfigurationHubComponent),
    title: 'Configuración · HCOP Centro Oncologico'
  },
  {
    path: 'help',
    canActivate: [authenticatedGuard],
    loadComponent: () => import('./features/help').then((module) => module.HelpCenterComponent),
    title: 'Ayuda · HCOP Centro Oncologico'
  },
  {
    path: 'herramientas',
    component: ClinicalShellComponent,
    canActivate: [authenticatedGuard],
    canDeactivate: [pendingClinicalDraftGuard],
    data: { initialPane: 'tools' },
    title: 'Herramientas · HCOP Centro Oncologico'
  },
  { path: '', component: ClinicalShellComponent, canActivate: [authenticatedGuard], canDeactivate: [pendingClinicalDraftGuard], title: 'HCOP Centro Oncologico' },
  { path: '**', redirectTo: '' }
];
