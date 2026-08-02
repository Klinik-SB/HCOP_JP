import { Component, HostListener, OnInit, inject, signal } from '@angular/core';
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
import { ToolsComponent } from '../features/tools/tools.component';

type RightPane = 'studies' | 'care' | 'prescription' | 'agent' | 'research' | 'timeline' | 'protocols' | 'tools';

@Component({
  selector: 'app-clinical-shell',
  imports: [ClinicalWorkspaceComponent, StudyPanelComponent, TimelinePanelComponent, DayHospitalComponent, NewPatientModalComponent, CareSchedulerComponent, PrescriptionComponent, AgentComponent, ProtocolExplorerComponent, ToolsComponent],
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
  readonly printTimestamp = signal('');

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
  openPatient(): void { if (!this.hasPendingConflict()) this.patientWorkspace.openPicker(); }
  openNewPatient(): void { if (!this.hasPendingConflict()) this.newPatientOpen.set(true); }
  closePatient(): void { if (!this.hasPendingConflict()) this.patientWorkspace.close(); }
  logout(): void {
    if (this.hasPendingConflict()) return;
    this.auth.logout().subscribe({ next: () => this.router.navigateByUrl('/login') });
  }
  hasPendingConflict(): boolean {
    return Boolean(this.patientWorkspace.activeSaveConflict()) || this.patientWorkspace.saving();
  }
  canPrint(): boolean {
    return Boolean(
      this.patientWorkspace.workspace()
      && !this.patientWorkspace.loading()
      && !this.hasPendingConflict()
      && this.auth.hasPermission('section.history.view')
    );
  }
  print(): void {
    if (!this.canPrint()) return;
    this.preparePrint();
    window.setTimeout(() => window.print(), 0);
  }
  @HostListener('window:beforeprint')
  preparePrint(): void {
    if (this.canPrint() && !this.printTimestamp()) this.printTimestamp.set(new Date().toISOString());
  }
  @HostListener('window:afterprint')
  restoreAfterPrint(): void { this.printTimestamp.set(''); }
  legacyFallback(): void { if (!this.hasPendingConflict()) window.location.assign('/'); }
  resolvePendingConflict(): void {
    if (!this.hasPendingConflict()) return;
    if (!window.confirm('¿Descartar este borrador no guardado y recuperar la última versión confirmada?')) return;
    this.patientWorkspace.discardConflictAndReload();
  }
  initial(): string { return (this.auth.session()?.user?.displayName || this.auth.session()?.user?.username || 'U').slice(0, 1).toUpperCase(); }
  private canOpen(pane: RightPane): boolean {
    if (pane === 'prescription') return this.auth.hasPermission('section.prescriptions.view');
    if (pane === 'agent') return this.auth.hasPermission('section.agent.view');
    if (pane === 'protocols') return this.auth.hasPermission('section.protocols.view');
    if (pane === 'tools') return this.auth.hasPermission('section.tools.view');
    return true;
  }
}
