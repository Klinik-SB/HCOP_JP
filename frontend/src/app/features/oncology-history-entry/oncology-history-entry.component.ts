import { Component, ElementRef, OnDestroy, computed, inject, input, output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Subscription, firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { clinicalSectionTreatments } from '../../core/clinical/clinical-treatment-projection';
import { ClinicalDraftHandle, ClinicalDraftRegistryService } from '../../core/patients/clinical-draft-registry.service';
import { PatientWorkspaceService } from '../../core/patients/patient-workspace.service';
import { ClinicalRecord, ClinicalState } from '../../core/patients/patient-workspace.models';
import { OncologyHistoryActor, OncologyHistoryEntryDraft, OncologyHistoryEntryKind } from './oncology-history-entry.models';
import {
  ONCOLOGY_HISTORY_HEIGHT_MAX_CM,
  ONCOLOGY_HISTORY_HEIGHT_MIN_CM,
  ONCOLOGY_HISTORY_NOTES_LIMIT,
  ONCOLOGY_HISTORY_REASON_LIMIT,
  ONCOLOGY_HISTORY_SHORT_TEXT_LIMIT,
  ONCOLOGY_HISTORY_WEIGHT_MAX_KG,
  ONCOLOGY_HISTORY_WEIGHT_MIN_KG,
  OncologyHistoryEntryError,
  applyOncologyHistoryEntry,
  calculateOncologyHistoryMetrics,
  emptyOncologyHistoryDraft,
  isEditableOncologyHistoryRecord,
  oncologyHistoryAuditText,
  oncologyHistoryDraftFromRecord,
  oncologyHistoryEntryBody,
  oncologyHistoryEntryHeading,
  oncologyHistoryEntryLabel,
  oncologyHistorySectionKey,
  oncologyHistorySectionTitle
} from './oncology-history-entry.state';

@Component({
  selector: 'app-oncology-history-entry-section',
  imports: [ReactiveFormsModule],
  templateUrl: './oncology-history-entry.component.html',
  styleUrl: './oncology-history-entry.component.scss'
})
export class OncologyHistoryEntrySectionComponent implements OnDestroy {
  readonly kind = input.required<OncologyHistoryEntryKind>();
  readonly printMode = input(false);
  readonly saved = output<{ kind: OncologyHistoryEntryKind; recordId: string; mode: 'created' | 'updated' }>();
  readonly workspaceService = inject(PatientWorkspaceService);
  readonly auth = inject(AuthService);
  private readonly clinicalDrafts = inject(ClinicalDraftRegistryService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly editorOpen = signal(false);
  readonly editorBusy = signal(false);
  readonly editorError = signal('');
  readonly editorErrorField = signal('');
  readonly originalRecord = signal<ClinicalRecord | null>(null);
  readonly returnFocus = signal<HTMLElement | null>(null);
  private editorDraft: ClinicalDraftHandle | null = null;
  private readonly formSubscription: Subscription;

  readonly form = new FormGroup({
    date: new FormControl('', { nonNullable: true }),
    endDate: new FormControl('', { nonNullable: true }),
    diagnosis: new FormControl('', { nonNullable: true }),
    intent: new FormControl('', { nonNullable: true }),
    status: new FormControl('', { nonNullable: true }),
    institution: new FormControl('', { nonNullable: true }),
    professional: new FormControl('', { nonNullable: true }),
    weightKg: new FormControl('', { nonNullable: true }),
    heightCm: new FormControl('', { nonNullable: true }),
    notes: new FormControl('', { nonNullable: true }),
    treatmentType: new FormControl('', { nonNullable: true }),
    scheme: new FormControl('', { nonNullable: true }),
    drugs: new FormControl('', { nonNullable: true }),
    cycles: new FormControl('', { nonNullable: true }),
    response: new FormControl('', { nonNullable: true }),
    toxicity: new FormControl('', { nonNullable: true }),
    targetSite: new FormControl('', { nonNullable: true }),
    technique: new FormControl('', { nonNullable: true }),
    totalDoseGy: new FormControl('', { nonNullable: true }),
    fractions: new FormControl('', { nonNullable: true }),
    concurrentSystemic: new FormControl('', { nonNullable: true }),
    procedure: new FormControl('', { nonNullable: true }),
    surgeon: new FormControl('', { nonNullable: true }),
    pathology: new FormControl('', { nonNullable: true }),
    margins: new FormControl('', { nonNullable: true }),
    complications: new FormControl('', { nonNullable: true }),
    reason: new FormControl('', { nonNullable: true })
  });

  readonly records = computed(() => {
    const workspace = this.workspaceService.workingWorkspace();
    if (!workspace) return [];
    return clinicalSectionTreatments(
      workspace.state,
      this.kind(),
      workspace.treatments?.oncology || []
    );
  });
  readonly canEdit = computed(() => Boolean(
    this.workspaceService.workingWorkspace()
    && !this.workspaceService.loading()
    && this.auth.hasPermission('section.history.edit')
  ));
  readonly diagnosisOptions = computed(() => {
    const state = this.state();
    const oncology = this.asRecord(state.oncology);
    const values = [
      ...(state.diagnoses || []).flatMap((record) => [record.diagnosis, record.title, record.text]),
      oncology['diagnosis']
    ].map((value) => this.text(value)).filter(Boolean);
    return [...new Map(values.map((value) => [this.normalize(value), value])).values()];
  });

  readonly notesLimit = ONCOLOGY_HISTORY_NOTES_LIMIT;
  readonly reasonLimit = ONCOLOGY_HISTORY_REASON_LIMIT;
  readonly shortTextLimit = ONCOLOGY_HISTORY_SHORT_TEXT_LIMIT;
  readonly weightMin = ONCOLOGY_HISTORY_WEIGHT_MIN_KG;
  readonly weightMax = ONCOLOGY_HISTORY_WEIGHT_MAX_KG;
  readonly heightMin = ONCOLOGY_HISTORY_HEIGHT_MIN_CM;
  readonly heightMax = ONCOLOGY_HISTORY_HEIGHT_MAX_CM;

  constructor() {
    this.formSubscription = this.form.valueChanges.subscribe(() => {
      if (this.editorOpen() && this.editorDraft) this.clinicalDrafts.setDirty(this.editorDraft, true);
      if (this.editorError()) {
        this.editorError.set('');
        this.editorErrorField.set('');
      }
    });
  }

  ngOnDestroy(): void {
    this.formSubscription.unsubscribe();
    if (this.editorDraft) this.clinicalDrafts.release(this.editorDraft);
  }

  sectionKey(): string { return oncologyHistorySectionKey(this.kind()); }
  sectionTitle(): string { return oncologyHistorySectionTitle(this.kind()); }
  entryLabel(): string { return oncologyHistoryEntryLabel(this.kind()); }
  emptyText(): string {
    return this.kind() === 'systemic'
      ? 'Sin tratamientos sistémicos registrados.'
      : this.kind() === 'radiotherapy'
        ? 'Sin tratamientos radioterápicos registrados.'
        : 'Sin cirugías oncológicas registradas.';
  }
  editorTitle(): string {
    return `${this.originalRecord() ? 'Modificar' : 'Cargar'} ${this.entryLabel()}`;
  }
  heading(record: ClinicalRecord): string { return oncologyHistoryEntryHeading(record, this.kind()); }
  body(record: ClinicalRecord): string { return oncologyHistoryEntryBody(record, this.kind()); }
  audit(record: ClinicalRecord): string { return oncologyHistoryAuditText(record); }
  canEditRecord(record: ClinicalRecord): boolean {
    return this.canEdit() && isEditableOncologyHistoryRecord(record, this.state());
  }
  isInvalid(field: string): boolean { return this.editorErrorField() === field; }
  actorLabel(): string {
    const user = this.auth.session()?.user;
    return user?.displayName || user?.username || 'Usuario activo';
  }
  actorMeta(): string {
    const user = this.auth.session()?.user;
    return [user?.specialty, user?.licenseNumber].filter(Boolean).join(' · ');
  }
  metrics(): { bmi: string; bodySurfaceM2: string; dosePerFractionGy: string } {
    const metrics = calculateOncologyHistoryMetrics(
      this.form.controls.weightKg.value,
      this.form.controls.heightCm.value,
      this.form.controls.totalDoseGy.value,
      this.form.controls.fractions.value
    );
    return {
      bmi: metrics.bmi === null ? '—' : String(Number(metrics.bmi.toFixed(2))),
      bodySurfaceM2: metrics.bodySurfaceM2 === null ? '—' : `${Number(metrics.bodySurfaceM2.toFixed(3))} m²`,
      dosePerFractionGy: metrics.dosePerFractionGy === null ? '—' : `${Number(metrics.dosePerFractionGy.toFixed(3))} Gy`
    };
  }

  openCreate(event?: Event): void {
    if (!this.canOpenEditor()) return;
    const user = this.auth.session()?.user;
    const draft = emptyOncologyHistoryDraft(this.kind(), {
      date: this.today(),
      diagnosis: this.diagnosisOptions()[0] || '',
      professional: user?.displayName || user?.username || '',
      treatmentType: this.kind() === 'systemic' ? 'Quimioterapia' : ''
    });
    this.beginEditor(null, draft, event);
  }

  openEdit(record: ClinicalRecord, event?: Event): void {
    if (!this.canOpenEditor() || !this.canEditRecord(record)) return;
    this.beginEditor(record, oncologyHistoryDraftFromRecord(record, this.kind()), event);
  }

  closeEditor(): void {
    if (!this.editorOpen() || this.editorBusy()) return;
    if (this.editorDraft && this.clinicalDrafts.isDirty(this.editorDraft)
        && !window.confirm(`¿Descartar los cambios no guardados de ${this.entryLabel()}?`)) return;
    this.finishEditor(true);
  }

  async saveEditor(): Promise<void> {
    const workspace = this.workspaceService.workspace();
    if (!workspace || !this.editorDraft || this.editorBusy()) return;
    if (workspace.patientId !== this.editorDraft.patientId) {
      this.editorError.set('El paciente activo cambió. Cierre el editor y vuelva a abrir el registro antes de guardar.');
      return;
    }
    this.editorError.set('');
    this.editorErrorField.set('');
    let applied;
    try {
      applied = applyOncologyHistoryEntry(workspace.state, {
        kind: this.kind(),
        draft: this.form.getRawValue() as OncologyHistoryEntryDraft,
        actor: this.activeActor(),
        original: this.originalRecord()
      });
    } catch (error) {
      this.editorError.set(error instanceof Error ? error.message : 'Revise los campos antes de guardar.');
      if (error instanceof OncologyHistoryEntryError) {
        this.editorErrorField.set(error.field);
        if (error.field) this.focusField(error.field);
      }
      return;
    }

    this.editorBusy.set(true);
    try {
      await firstValueFrom(this.workspaceService.saveState(applied.state));
      this.clinicalDrafts.markClean(this.editorDraft);
      this.saved.emit({ kind: this.kind(), recordId: String(applied.record.id), mode: applied.mode });
      this.finishEditor(true);
    } catch (error) {
      if (this.workspaceService.activeSaveConflict()) {
        // PatientWorkspaceService keeps the attempted state as the conflict draft.
        this.clinicalDrafts.markClean(this.editorDraft);
        this.finishEditor(false);
      } else {
        this.editorError.set(error instanceof Error ? error.message : 'No se pudo guardar el registro clínico.');
      }
    } finally {
      this.editorBusy.set(false);
    }
  }

  trapFocus(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return;
    const modal = this.host.nativeElement.querySelector<HTMLElement>('.oncology-history-modal');
    if (!modal) return;
    const focusable = [...modal.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )].filter((element) => element.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  private canOpenEditor(): boolean {
    return this.canEdit()
      && !this.workspaceService.hasPendingClinicalWork()
      && !this.editorOpen();
  }

  private beginEditor(record: ClinicalRecord | null, draft: OncologyHistoryEntryDraft, event?: Event): void {
    const workspace = this.workspaceService.workspace();
    if (!workspace) return;
    this.returnFocus.set(event?.currentTarget instanceof HTMLElement
      ? event.currentTarget
      : document.activeElement instanceof HTMLElement ? document.activeElement : null);
    this.originalRecord.set(record ? structuredClone(record) : null);
    this.form.reset(draft, { emitEvent: false });
    this.editorError.set('');
    this.editorErrorField.set('');
    this.editorDraft = this.clinicalDrafts.acquire({
      patientId: workspace.patientId,
      label: `${record ? 'Modificar' : 'Cargar'} ${this.entryLabel()}`
    });
    this.editorOpen.set(true);
    queueMicrotask(() => this.host.nativeElement.querySelector<HTMLElement>('#oncologyHistory-date')?.focus());
  }

  private finishEditor(restoreFocus: boolean): void {
    const target = this.returnFocus();
    if (this.editorDraft) this.clinicalDrafts.release(this.editorDraft);
    this.editorDraft = null;
    this.editorOpen.set(false);
    this.originalRecord.set(null);
    this.editorError.set('');
    this.editorErrorField.set('');
    this.returnFocus.set(null);
    this.form.reset(emptyOncologyHistoryDraft(this.kind()), { emitEvent: false });
    if (restoreFocus && target?.isConnected) queueMicrotask(() => target.focus());
  }

  private activeActor(): OncologyHistoryActor {
    const user = this.auth.session()?.user;
    return {
      userId: user?.id || '',
      username: user?.username || 'usuario',
      displayName: user?.displayName || user?.username || 'Usuario activo',
      specialty: user?.specialty || '',
      licenseNumber: user?.licenseNumber || ''
    };
  }

  private focusField(field: string): void {
    queueMicrotask(() => this.host.nativeElement
      .querySelector<HTMLElement>(`#oncologyHistory-${CSS.escape(field)}`)?.focus());
  }

  private state(): ClinicalState {
    return this.workspaceService.workingWorkspace()?.state || {};
  }

  private today(): string {
    const date = new Date();
    const offset = date.getTimezoneOffset() * 60_000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 10);
  }

  private text(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }

  private normalize(value: string): string {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-AR').trim();
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
  }
}
