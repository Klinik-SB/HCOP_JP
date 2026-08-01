import { Routes } from '@angular/router';
import { ClinicalShellComponent } from './layout/clinical-shell.component';
import { LoginPageComponent } from './features/auth/login-page.component';

export const routes: Routes = [
  { path: 'login', component: LoginPageComponent, title: 'Ingresar · HCOP Centro Oncologico' },
  { path: '', component: ClinicalShellComponent, title: 'HCOP Centro Oncologico' },
  { path: '**', redirectTo: '' }
];
