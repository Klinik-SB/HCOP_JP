import { CommonModule } from '@angular/common';
import { Component, ElementRef, HostListener, OnDestroy, ViewChild, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ClinicalDraftHandle, ClinicalDraftRegistryService } from '../../core/patients/clinical-draft-registry.service';
import { PatientWorkspaceService } from '../../core/patients/patient-workspace.service';
import {
  TreatmentWorkflowAction, TreatmentWorkflowChangedEvent, TreatmentWorkflowTreatment, TreatmentWorkflowUser,
  normalizePrescriptionState, treatmentResumeFlow, treatmentWorkflowActions,
  workflowCycle, workflowStateDescription, workflowUserLabel
} from './treatment-workflow-actions.models';
import { TreatmentWorkflowActionsService, treatmentWorkflowApiMessage, treatmentWorkflowUnauthorized } from './treatment-workflow-actions.service';

@Component({
  selector: 'app-treatment-workflow-actions',
  imports: [CommonModule, FormsModule],
  templateUrl: './treatment-workflow-actions.component.html',
  styleUrl: './treatment-workflow-actions.component.scss'
})
export class TreatmentWorkflowActionsComponent implements OnDestroy {
  readonly treatment = input.required<TreatmentWorkflowTreatment>();
  readonly buttonLabel = input('Gestionar ciclo');
  readonly disabled = input(false);
  readonly compact = input(false);
  readonly changed = output<TreatmentWorkflowChangedEvent>();
  readonly notification = output<string>();
  readonly sessionExpired = output<void>();

  readonly auth = inject(AuthService);
  readonly workspace = inject(PatientWorkspaceService);
  private readonly service = inject(TreatmentWorkflowActionsService);
  private readonly drafts = inject(ClinicalDraftRegistryService);

  readonly menuOpen = signal(false);
  readonly modalOpen = signal(false);
  readonly activeAction = signal<TreatmentWorkflowAction | ''>('');
  readonly busy = signal(false);
  readonly loadingUsers = signal(false);
  readonly error = signal('');
  readonly discardPrompt = signal(false);
  readonly users = signal<TreatmentWorkflowUser[]>([]);
  readonly suspendKind = signal<'temporary' | 'definitive'>('temporary');
  readonly reason = signal('');
  readonly resumeDate = signal('');
  readonly assignedToUserId = signal('');
  readonly message = signal('');

  readonly actions = computed(() => treatmentWorkflowActions(this.treatment(), (permission) => this.auth.hasPermission(permission)));
  readonly availableActions = computed(() => this.actions().filter((action) => action.available));
  readonly validIdentity = computed(() => Boolean(
    String(this.treatment().patientId ?? '').trim() && String(this.treatment().treatmentId ?? '').trim()
  ));
  readonly canOpen = computed(() => this.validIdentity() && !this.disabled() && !this.busy() && this.availableActions().length > 0);
  readonly selectedAction = computed(() => this.actions().find((item) => item.action === this.activeAction()) ?? null);
  readonly stateDescription = computed(() => workflowStateDescription(this.treatment()));
  readonly canSubmit = computed(() => {
    const action = this.activeAction();
    if (!action || this.busy() || !this.selectedAction()?.available) return false;
    if (action === 'request-prescription' || action === 'request-continuity') return Boolean(this.assignedToUserId()) && !this.loadingUsers();
    if (action === 'postpone') return this.reason().trim().length >= 3 && Boolean(this.resumeDate());
    return this.reason().trim().length >= 3;
  });
  readonly standalone = { standalone: true } as const;

  @ViewChild('workflowDialog') private dialog?: ElementRef<HTMLElement>;
  private draftHandle: ClinicalDraftHandle | null = null;
  private returnFocus: HTMLElement | null = null;

  ngOnDestroy(): void { this.releaseDraft(); }

  toggleMenu(): void {
    if (!this.canOpen()) return;
    this.error.set('');
    this.menuOpen.update((value) => !value);
  }

  async openAction(action: TreatmentWorkflowAction): Promise<void> {
    if (!this.availableActions().some((item) => item.action === action) || this.busy()) return;
    if (this.workspace.hasPendingClinicalWork()) {
      this.error.set('Finalice o descarte el editor clínico abierto antes de gestionar este ciclo.');
      this.menuOpen.set(false);
      return;
    }
    this.returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.resetDraft();
    this.activeAction.set(action);
    this.menuOpen.set(false);
    this.modalOpen.set(true);
    if (action === 'request-prescription' || action === 'request-continuity') await this.loadUsers(action);
    window.setTimeout(() => this.dialog?.nativeElement.focus(), 0);
  }

  async selectAction(action: TreatmentWorkflowAction): Promise<void> {
    if (this.busy() || !this.availableActions().some((item) => item.action === action)) return;
    this.activeAction.set(action);
    this.error.set('');
    this.discardPrompt.set(false);
    if (action === 'request-prescription' || action === 'request-continuity') await this.loadUsers(action);
  }

  update(field: 'suspendKind' | 'reason' | 'resumeDate' | 'assignedToUserId' | 'message', value: unknown): void {
    if (field === 'suspendKind') {
      const kind = value === 'definitive' ? 'definitive' : 'temporary';
      this.suspendKind.set(kind);
      if (kind === 'definitive') this.resumeDate.set('');
    } else if (field === 'reason') this.reason.set(String(value ?? ''));
    else if (field === 'resumeDate') this.resumeDate.set(String(value ?? ''));
    else if (field === 'assignedToUserId') this.assignedToUserId.set(String(value ?? ''));
    else this.message.set(String(value ?? ''));
    this.error.set('');
    this.discardPrompt.set(false);
    this.markDirty();
  }

  requestClose(): void {
    if (this.busy()) return;
    if (this.draftHandle && this.drafts.isDirty(this.draftHandle)) {
      this.discardPrompt.set(true);
      return;
    }
    this.finishClose();
  }
  continueEditing(): void { this.discardPrompt.set(false); }
  discardAndClose(): void { if (!this.busy()) this.finishClose(); }

  async submit(): Promise<void> {
    const action = this.activeAction();
    const item = this.treatment();
    const reason = this.reason().trim();
    if (!action || !this.canSubmit() || this.busy()) return;
    if (this.workspace.saving() || this.workspace.loading()) {
      this.error.set('La historia clínica se está actualizando. Espere y vuelva a intentar.');
      return;
    }
    this.busy.set(true);
    this.error.set('');
    this.discardPrompt.set(false);
    try {
      const response = action === 'resume'
        ? await firstValueFrom(this.service.resume(item, reason))
        : action === 'suspend'
          ? await firstValueFrom(this.service.suspend(item, { kind: this.suspendKind(), reason,
              ...(this.suspendKind() === 'temporary' && this.resumeDate() ? { resumeDate: this.resumeDate() } : {}) }))
          : action === 'postpone'
            ? await firstValueFrom(this.service.suspend(item, { kind: 'temporary', reason, resumeDate: this.resumeDate() }))
            : await firstValueFrom(this.service.createRequest(item, {
                type: action === 'request-prescription' ? 'prescription_request' : 'continuity_request',
                assignedToUserId: this.assignedToUserId(), message: this.message().trim()
              }));
      const event: TreatmentWorkflowChangedEvent = { action, patientId: String(item.patientId), treatmentId: String(item.treatmentId),
        cycleNumber: workflowCycle(item), response };
      this.releaseDraft();
      this.changed.emit(event);
      this.notification.emit(this.successMessage(action));
      this.finishClose();
      if (this.workspace.workspace()?.patientId === event.patientId) this.workspace.load(event.patientId);
    } catch (failure: unknown) {
      if (treatmentWorkflowUnauthorized(failure)) this.sessionExpired.emit();
      this.error.set(treatmentWorkflowApiMessage(failure));
    } finally {
      this.busy.set(false);
    }
  }

  actionIcon(action: TreatmentWorkflowAction): string {
    return action === 'suspend' ? '⏸' : action === 'postpone' ? '↪' : action === 'resume' ? '▶' : action === 'request-prescription' ? '▤' : '⚕';
  }
  actionSubmitLabel(): string {
    return this.activeAction() === 'suspend' ? 'Registrar suspensión' : this.activeAction() === 'postpone' ? 'Postergar ciclo'
      : this.activeAction() === 'resume' ? 'Reanudar tratamiento' : 'Enviar solicitud';
  }
  patientDni(): string { return this.treatment().patientDni || this.treatment().dni || ''; }
  scheme(): string { return this.treatment().drugScheme || this.treatment().scheme || 'Esquema no informado'; }
  cycle(): number { return workflowCycle(this.treatment()); }
  totalCycles(): number { return Math.max(this.cycle(), Number(this.treatment().totalCycles) || this.cycle()); }
  userLabel(user: TreatmentWorkflowUser): string { return workflowUserLabel(user); }
  prescriptionState(): string { return normalizePrescriptionState(this.treatment()); }
  resumeFlow(): string { return treatmentResumeFlow(this.treatment()); }

  @HostListener('document:keydown.escape')
  onEscape(): void { if (this.modalOpen()) this.requestClose(); else this.menuOpen.set(false); }

  onDialogKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return;
    const root = this.dialog?.nativeElement;
    if (!root) return;
    const focusable = Array.from(root.querySelectorAll<HTMLElement>(
      'button:not([disabled]), select:not([disabled]), textarea:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
    )).filter((element) => !element.hidden && element.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  private async loadUsers(action: 'request-prescription' | 'request-continuity'): Promise<void> {
    this.loadingUsers.set(true);
    this.users.set([]);
    this.assignedToUserId.set('');
    try {
      const capability = action === 'request-prescription' ? 'workflow.resolve-prescription' : 'workflow.resolve-continuity';
      this.users.set(await firstValueFrom(this.service.users(capability)));
      if (!this.users().length) this.error.set('No hay médicos habilitados para responder esta solicitud.');
    } catch (failure: unknown) {
      if (treatmentWorkflowUnauthorized(failure)) this.sessionExpired.emit();
      this.error.set(treatmentWorkflowApiMessage(failure, 'No se pudieron cargar los médicos.'));
    } finally { this.loadingUsers.set(false); }
  }

  private markDirty(): void {
    const patientId = String(this.treatment().patientId || '');
    if (!patientId || !this.modalOpen()) return;
    this.draftHandle ||= this.drafts.acquire({ patientId, label: 'Gestión de tratamiento' });
    this.drafts.setDirty(this.draftHandle, true);
  }
  private resetDraft(): void {
    this.releaseDraft();
    this.suspendKind.set('temporary'); this.reason.set(''); this.resumeDate.set('');
    this.assignedToUserId.set(''); this.message.set(''); this.users.set([]);
    this.error.set(''); this.discardPrompt.set(false);
  }
  private finishClose(): void {
    this.releaseDraft(); this.modalOpen.set(false); this.menuOpen.set(false); this.activeAction.set('');
    this.error.set(''); this.discardPrompt.set(false);
    const focus = this.returnFocus; this.returnFocus = null;
    window.setTimeout(() => focus?.focus(), 0);
  }
  private releaseDraft(): void {
    if (!this.draftHandle) return;
    this.drafts.release(this.draftHandle); this.draftHandle = null;
  }
  private successMessage(action: TreatmentWorkflowAction): string {
    return action === 'suspend' ? 'Suspensión registrada en la historia clínica'
      : action === 'postpone' ? 'Postergación registrada en la historia clínica'
        : action === 'resume' ? `Tratamiento reanudado en el ciclo ${this.cycle()}`
          : 'Solicitud enviada y registrada en la historia clínica';
  }
}
