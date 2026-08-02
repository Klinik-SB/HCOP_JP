import { Component, HostListener, OnInit, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { PatientWorkspaceService } from './core/patients/patient-workspace.service';
import { LegacyVisualContractService } from './core/visual/legacy-visual-contract.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: '<router-outlet />'
})
export class AppComponent implements OnInit {
  private readonly visualContract = inject(LegacyVisualContractService);
  private readonly workspace = inject(PatientWorkspaceService);
  ngOnInit(): void { this.visualContract.load(); }
  @HostListener('window:beforeunload', ['$event'])
  protectPendingDraft(event: BeforeUnloadEvent): void {
    if (!this.workspace.activeSaveConflict() && !this.workspace.saving()) return;
    event.preventDefault();
    event.returnValue = '';
  }
}
