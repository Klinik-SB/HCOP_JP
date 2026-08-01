import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../core/auth/auth.service';
import { PatientWorkspaceService } from '../core/patients/patient-workspace.service';
import { ClinicalWorkspaceComponent } from '../features/clinical-workspace/clinical-workspace.component';

type RightPane = 'studies' | 'care' | 'prescription' | 'agent' | 'research' | 'timeline' | 'protocols' | 'tools';

@Component({
  selector: 'app-clinical-shell',
  imports: [ClinicalWorkspaceComponent],
  templateUrl: './clinical-shell.component.html',
  styleUrl: './clinical-shell.component.scss'
})
export class ClinicalShellComponent implements OnInit {
  readonly auth = inject(AuthService);
  readonly patientWorkspace = inject(PatientWorkspaceService);
  private readonly router = inject(Router);
  readonly selectedPane = signal<RightPane>('studies');
  readonly searchExpanded = signal(false);

  ngOnInit(): void {
    this.auth.load().subscribe({
      next: (session) => { if (session.activePatientId) this.patientWorkspace.load(session.activePatientId); },
      error: () => this.auth.session.set({ ok: false, authenticated: false, loginRequired: true, activePatientId: null })
    });
  }

  selectPane(pane: RightPane): void { this.selectedPane.set(pane); }
  openLogin(): void { this.router.navigateByUrl('/login'); }
  openPatient(): void { this.patientWorkspace.pickerOpen.set(true); }
  closePatient(): void { this.patientWorkspace.close(); }
  logout(): void { this.auth.logout().subscribe({ next: () => this.router.navigateByUrl('/login') }); }
  print(): void { window.print(); }
  legacyFallback(): void { window.location.assign('/'); }
  initial(): string { return (this.auth.session()?.user?.displayName || this.auth.session()?.user?.username || 'U').slice(0, 1).toUpperCase(); }
}
