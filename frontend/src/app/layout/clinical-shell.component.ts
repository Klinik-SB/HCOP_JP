import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../core/auth/auth.service';
import { PatientWorkspaceService } from '../core/patients/patient-workspace.service';
import { ClinicalWorkspaceComponent } from '../features/clinical-workspace/clinical-workspace.component';
import { StudyPanelComponent } from '../features/studies/study-panel.component';
import { TimelinePanelComponent } from '../features/timeline/timeline-panel.component';
import { NewPatientModalComponent } from '../features/patients/new-patient-modal.component';
import { DayHospitalComponent } from '../features/day-hospital/day-hospital.component';
import { CareSchedulerComponent } from '../features/scheduler/care-scheduler.component';
import { PrescriptionComponent } from '../features/prescription/prescription.component';
import { AgentComponent } from '../features/agent/agent.component';
import { ProtocolExplorerComponent } from '../features/protocols/protocol-explorer.component';

type RightPane = 'studies' | 'care' | 'prescription' | 'agent' | 'research' | 'timeline' | 'protocols' | 'tools';

@Component({
  selector: 'app-clinical-shell',
  imports: [ClinicalWorkspaceComponent, StudyPanelComponent, TimelinePanelComponent, DayHospitalComponent, NewPatientModalComponent, CareSchedulerComponent, PrescriptionComponent, AgentComponent, ProtocolExplorerComponent],
  templateUrl: './clinical-shell.component.html',
  styleUrl: './clinical-shell.component.scss'
})
export class ClinicalShellComponent implements OnInit {
  readonly auth = inject(AuthService);
  readonly patientWorkspace = inject(PatientWorkspaceService);
  private readonly router = inject(Router);
  readonly selectedPane = signal<RightPane>('studies');
  readonly searchExpanded = signal(false);
  readonly newPatientOpen = signal(false);
  readonly careSchedulerOpen = signal(false);

  ngOnInit(): void {
    this.auth.load().subscribe({
      next: (session) => {
        if (session.activePatientId) this.patientWorkspace.load(session.activePatientId);
        if (!this.canOpen(this.selectedPane())) this.selectedPane.set('studies');
      },
      error: () => this.auth.session.set({ ok: false, authenticated: false, loginRequired: true, activePatientId: null })
    });
  }

  selectPane(pane: RightPane): void { this.selectedPane.set(this.canOpen(pane) ? pane : 'studies'); }
  openLogin(): void { this.router.navigateByUrl('/login'); }
  openPatient(): void { this.patientWorkspace.openPicker(); }
  openNewPatient(): void { this.newPatientOpen.set(true); }
  closePatient(): void { this.patientWorkspace.close(); }
  logout(): void { this.auth.logout().subscribe({ next: () => this.router.navigateByUrl('/login') }); }
  print(): void { window.print(); }
  legacyFallback(): void { window.location.assign('/'); }
  initial(): string { return (this.auth.session()?.user?.displayName || this.auth.session()?.user?.username || 'U').slice(0, 1).toUpperCase(); }
  private canOpen(pane: RightPane): boolean {
    if (pane === 'prescription') return this.auth.hasPermission('section.prescriptions.view');
    if (pane === 'agent') return this.auth.hasPermission('section.agent.view');
    if (pane === 'protocols') return this.auth.hasPermission('section.protocols.view');
    return true;
  }
}
