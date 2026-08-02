import { Component, ElementRef, OnDestroy, OnInit, effect, inject, input, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ClinicalFocusRequest, ClinicalFocusService } from '../../core/clinical/clinical-focus.service';
import {
  CLINICAL_CHIEF_COMPLAINT_TEXT_LIMIT,
  ClinicalChiefComplaintEditError,
  applyStructuredChiefComplaintEdit,
  chiefComplaintBaseline,
  supportsStructuredChiefComplaint
} from '../../core/clinical/clinical-chief-complaint-edit';
import {
  CLINICAL_SUMMARY_PLAN_TEXT_LIMIT,
  applyStructuredSummaryPlanEdit,
  summaryPlanBaseline,
  supportsStructuredSummaryPlan
} from '../../core/clinical/clinical-summary-plan-edit';
import {
  ClinicalPrintFact,
  ClinicalPrintSection,
  clinicalPrintPatientFacts,
  clinicalPrintSectionHasContent
} from '../../core/clinical/clinical-print-projection';
import { ClinicalTreatmentKind, clinicalSectionTreatments, clinicalTreatmentBody } from '../../core/clinical/clinical-treatment-projection';
import { ClinicalDraftHandle, ClinicalDraftRegistryService } from '../../core/patients/clinical-draft-registry.service';
import { PatientWorkspaceService } from '../../core/patients/patient-workspace.service';
import { ClinicalPatient, ClinicalRecord, ClinicalState } from '../../core/patients/patient-workspace.models';

@Component({ selector: 'app-clinical-workspace', imports: [ReactiveFormsModule], templateUrl: './clinical-workspace.component.html', styleUrl: './clinical-workspace.component.scss' })
export class ClinicalWorkspaceComponent implements OnInit, OnDestroy {
  readonly printTimestamp = input('');
  readonly workspaceService = inject(PatientWorkspaceService);
  readonly auth = inject(AuthService);
  private readonly clinicalFocus = inject(ClinicalFocusService);
  private readonly clinicalDrafts = inject(ClinicalDraftRegistryService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly query = new FormControl('', { nonNullable: true });
  readonly results = signal<ClinicalPatient[]>([]);
  readonly searching = signal(false);
  readonly searchError = signal('');
  readonly chiefComplaintOpen = signal(false);
  readonly chiefComplaintInitial = signal(true);
  readonly chiefComplaintBusy = signal(false);
  readonly chiefComplaintError = signal('');
  readonly chiefComplaintErrorTarget = signal<'content' | 'reason' | ''>('');
  readonly maxChiefComplaintChars = CLINICAL_CHIEF_COMPLAINT_TEXT_LIMIT;
  readonly chiefComplaintControl = new FormControl('', { nonNullable: true });
  readonly chiefComplaintReasonControl = new FormControl('', { nonNullable: true });
  private chiefComplaintDraft: ClinicalDraftHandle | null = null;
  private chiefComplaintEditorBaseline = { chiefComplaint: '', initial: true };
  private chiefComplaintReturnFocus: HTMLElement | null = null;
  readonly summaryPlanOpen = signal(false);
  readonly summaryPlanInitial = signal(true);
  readonly summaryPlanBusy = signal(false);
  readonly summaryPlanError = signal('');
  readonly maxClinicalNarrativeChars = CLINICAL_SUMMARY_PLAN_TEXT_LIMIT;
  readonly summaryControl = new FormControl('', { nonNullable: true });
  readonly planControl = new FormControl('', { nonNullable: true });
  readonly summaryPlanReasonControl = new FormControl('', { nonNullable: true });
  private summaryPlanDraft: ClinicalDraftHandle | null = null;
  private summaryPlanBaseline = { summary: '', plan: '', initial: true };
  private summaryPlanReturnFocus: HTMLElement | null = null;

  constructor() {
    effect(() => {
      if (this.workspaceService.pickerOpen() && this.workspaceService.pickerRequest() > 0) this.search();
    });
    effect(() => {
      const request = this.clinicalFocus.request();
      if (!request.id) return;
      queueMicrotask(() => this.applyClinicalFocus(request));
    });
    this.summaryControl.valueChanges.subscribe(() => this.refreshSummaryPlanDirtyState());
    this.planControl.valueChanges.subscribe(() => this.refreshSummaryPlanDirtyState());
    this.summaryPlanReasonControl.valueChanges.subscribe(() => this.refreshSummaryPlanDirtyState());
    this.chiefComplaintControl.valueChanges.subscribe(() => this.refreshChiefComplaintDirtyState());
    this.chiefComplaintReasonControl.valueChanges.subscribe(() => this.refreshChiefComplaintDirtyState());
  }

  ngOnInit(): void {
    this.query.valueChanges.subscribe(() => this.search());
  }

  ngOnDestroy(): void {
    if (this.chiefComplaintDraft) this.clinicalDrafts.release(this.chiefComplaintDraft);
    if (this.summaryPlanDraft) this.clinicalDrafts.release(this.summaryPlanDraft);
  }

  openPicker(): void { this.workspaceService.openPicker(); }
  closePicker(): void { this.workspaceService.pickerOpen.set(false); this.searchError.set(''); }
  search(): void {
    this.searching.set(true); this.searchError.set('');
    this.workspaceService.search(this.query.value.trim()).subscribe({
      next: (response) => { this.results.set(response.patients || []); this.searching.set(false); },
      error: (response: { error?: { error?: string } }) => { this.searchError.set(response?.error?.error || 'No se pudo buscar pacientes.'); this.searching.set(false); }
    });
  }
  open(patient: ClinicalPatient): void { this.workspaceService.activate(patient); }
  closePatient(): void { this.workspaceService.close(); }

  canEditChiefComplaint(): boolean {
    return Boolean(
      this.workspaceService.workspace()
      && !this.workspaceService.loading()
      && this.auth.hasPermission('section.history.edit')
      && supportsStructuredChiefComplaint(this.state())
    );
  }

  openChiefComplaintEditor(event?: Event): void {
    const workspace = this.workspaceService.workspace();
    if (!workspace || this.workspaceService.loading() || !this.canEditChiefComplaint() || this.workspaceService.hasPendingClinicalWork()) return;
    this.chiefComplaintReturnFocus = event?.currentTarget instanceof HTMLElement
      ? event.currentTarget
      : document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const baseline = chiefComplaintBaseline(workspace.state);
    this.chiefComplaintEditorBaseline = baseline;
    this.chiefComplaintInitial.set(baseline.initial);
    this.chiefComplaintControl.setValue(baseline.chiefComplaint, { emitEvent: false });
    this.chiefComplaintReasonControl.setValue('', { emitEvent: false });
    this.chiefComplaintError.set('');
    this.chiefComplaintErrorTarget.set('');
    this.chiefComplaintDraft = this.clinicalDrafts.acquire({
      patientId: workspace.patientId,
      label: 'Motivo de consulta'
    });
    this.chiefComplaintOpen.set(true);
    this.refreshChiefComplaintDirtyState();
    this.focusSummaryPlanAfterRender('#chiefComplaintNarrative');
  }

  closeChiefComplaintEditor(): void {
    if (!this.chiefComplaintOpen() || this.chiefComplaintBusy()) return;
    if (this.chiefComplaintDraft && this.clinicalDrafts.isDirty(this.chiefComplaintDraft)
        && !window.confirm('¿Descartar los cambios no guardados de Motivo de consulta?')) return;
    this.finishChiefComplaintEditor(true);
  }

  async saveChiefComplaint(): Promise<void> {
    const workspace = this.workspaceService.workspace();
    if (!workspace || !this.chiefComplaintDraft || this.chiefComplaintBusy()) return;
    this.chiefComplaintError.set('');
    this.chiefComplaintErrorTarget.set('');
    if (workspace.patientId !== this.chiefComplaintDraft.patientId) {
      this.chiefComplaintError.set('El paciente activo cambió. Cierre este editor y vuelva a abrir la sección antes de guardar.');
      return;
    }
    let nextState: ClinicalState;
    try {
      const user = this.auth.session()?.user;
      nextState = applyStructuredChiefComplaintEdit(workspace.state, {
        chiefComplaint: this.chiefComplaintControl.value,
        reason: this.chiefComplaintReasonControl.value,
        actor: {
          userId: user?.id || '',
          username: user?.username || '',
          displayName: user?.displayName || user?.username || 'Profesional',
          licenseNumber: user?.licenseNumber || ''
        }
      });
    } catch (error) {
      this.chiefComplaintError.set(this.errorMessage(error, 'Revise los campos antes de guardar.'));
      if (error instanceof ClinicalChiefComplaintEditError) {
        const target = error.code === 'REASON_REQUIRED' || error.code === 'REASON_TOO_LONG'
          ? 'reason'
          : error.code === 'EMPTY_CHIEF_COMPLAINT' || error.code === 'CHIEF_COMPLAINT_TOO_LONG'
            ? 'content'
            : '';
        this.chiefComplaintErrorTarget.set(target);
        if (target) this.focusSummaryPlanAfterRender(target === 'reason' ? '#chiefComplaintReason' : '#chiefComplaintNarrative');
      }
      return;
    }

    this.chiefComplaintBusy.set(true);
    try {
      await firstValueFrom(this.workspaceService.saveState(nextState));
      this.clinicalDrafts.markClean(this.chiefComplaintDraft);
      this.finishChiefComplaintEditor(true);
    } catch (error) {
      if (this.workspaceService.activeSaveConflict()) {
        this.clinicalDrafts.markClean(this.chiefComplaintDraft);
        this.finishChiefComplaintEditor(false);
      } else {
        this.chiefComplaintError.set(this.errorMessage(error, 'No se pudo guardar el motivo de consulta.'));
      }
    } finally {
      this.chiefComplaintBusy.set(false);
    }
  }

  chiefComplaintCount(): number { return this.chiefComplaintControl.value.length; }
  chiefComplaintIsInitial(): boolean { return chiefComplaintBaseline(this.state()).initial; }

  canEditSummaryPlan(): boolean {
    return Boolean(
      this.workspaceService.workspace()
      && !this.workspaceService.loading()
      && this.auth.hasPermission('section.history.edit')
      && supportsStructuredSummaryPlan(this.state())
    );
  }

  openSummaryPlanEditor(event?: Event): void {
    const workspace = this.workspaceService.workspace();
    if (!workspace || !this.canEditSummaryPlan() || this.workspaceService.hasPendingClinicalWork()) return;
    this.summaryPlanReturnFocus = event?.currentTarget instanceof HTMLElement
      ? event.currentTarget
      : document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const baseline = summaryPlanBaseline(workspace.state);
    this.summaryPlanBaseline = baseline;
    this.summaryPlanInitial.set(baseline.initial);
    this.summaryControl.setValue(baseline.summary, { emitEvent: false });
    this.planControl.setValue(baseline.plan, { emitEvent: false });
    this.summaryPlanReasonControl.setValue('', { emitEvent: false });
    this.summaryPlanError.set('');
    this.summaryPlanDraft = this.clinicalDrafts.acquire({
      patientId: workspace.patientId,
      label: 'Conclusión / resumen'
    });
    this.summaryPlanOpen.set(true);
    this.refreshSummaryPlanDirtyState();
    this.focusSummaryPlanAfterRender('#summaryPlanSummary');
  }

  closeSummaryPlanEditor(): void {
    if (!this.summaryPlanOpen() || this.summaryPlanBusy()) return;
    if (this.summaryPlanDraft && this.clinicalDrafts.isDirty(this.summaryPlanDraft)
        && !window.confirm('¿Descartar los cambios no guardados de Conclusión / resumen?')) return;
    this.finishSummaryPlanEditor(true);
  }

  trapSummaryPlanFocus(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return;
    const dialog = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    if (!dialog) return;
    const focusable = [...dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
    )].filter((element) => element.getAttribute('aria-hidden') !== 'true');
    if (!focusable.length) {
      event.preventDefault();
      dialog.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !dialog.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  }

  async saveSummaryPlan(): Promise<void> {
    const workspace = this.workspaceService.workspace();
    if (!workspace || !this.summaryPlanDraft || this.summaryPlanBusy()) return;
    this.summaryPlanError.set('');
    if (workspace.patientId !== this.summaryPlanDraft.patientId) {
      this.summaryPlanError.set('El paciente activo cambió. Cierre este editor y vuelva a abrir la sección antes de guardar.');
      return;
    }
    let nextState: ClinicalState;
    try {
      const user = this.auth.session()?.user;
      nextState = applyStructuredSummaryPlanEdit(workspace.state, {
        summary: this.summaryControl.value,
        plan: this.planControl.value,
        reason: this.summaryPlanReasonControl.value,
        actor: {
          userId: user?.id || '',
          username: user?.username || '',
          displayName: user?.displayName || user?.username || 'Profesional',
          licenseNumber: user?.licenseNumber || ''
        }
      });
    } catch (error) {
      this.summaryPlanError.set(this.errorMessage(error, 'Revise los campos antes de guardar.'));
      return;
    }

    this.summaryPlanBusy.set(true);
    try {
      await firstValueFrom(this.workspaceService.saveState(nextState));
      this.clinicalDrafts.markClean(this.summaryPlanDraft);
      this.finishSummaryPlanEditor(true);
    } catch (error) {
      if (this.workspaceService.activeSaveConflict()) {
        // El servicio conserva una copia profunda del intento; el banner pasa a
        // ser el propietario visible del borrador y evita una doble protección.
        this.clinicalDrafts.markClean(this.summaryPlanDraft);
        this.finishSummaryPlanEditor(false);
      } else {
        this.summaryPlanError.set(this.errorMessage(error, 'No se pudo guardar la conclusión / resumen.'));
      }
    } finally {
      this.summaryPlanBusy.set(false);
    }
  }

  summaryPlanCount(control: FormControl<string>): number { return control.value.length; }

  state(): ClinicalState { return this.workspaceService.workingWorkspace()?.state || {}; }
  records(key: 'diagnoses' | 'studies' | 'treatments' | 'evolutions' | 'prescriptions' | 'researchRecords'): ClinicalRecord[] { return this.state()[key] || []; }
  narrative(key: string): string { return this.text(this.state().narrative?.[key]); }
  oncology(key: string): string { return this.text(this.state().oncology?.[key]); }
  exam(key: string): string { return this.text(this.state().exam?.[key]); }
  text(value: unknown): string { return typeof value === 'string' || typeof value === 'number' ? String(value) : ''; }
  date(value?: string): string { if (!value) return ''; const parsed = new Date(`${value.length === 10 ? `${value}T12:00:00` : value}`); return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat('es-AR').format(parsed); }
  patientLine(patient: ClinicalPatient): string { return [`HC ${patient.medicalRecord || '—'}`, `DNI ${patient.dni || '—'}`, patient.insurance ? `Obra social ${patient.insurance}` : '', patient.affiliateNumber ? `Afiliado ${patient.affiliateNumber}` : ''].filter(Boolean).join(' · '); }
  recordTitle(record: ClinicalRecord): string { return this.text(record.diagnosis) || this.text(record.title) || this.text(record.scheme) || this.text(record.reason) || 'Registro clínico'; }
  recordBody(record: ClinicalRecord): string { return this.text(record.text) || this.text(record.summary) || this.text(record.status); }
  treatmentBody(record: ClinicalRecord): string { return clinicalTreatmentBody(record); }
  studyHeading(record: ClinicalRecord): string { return this.join(this.date(record.date), this.text(record.type), this.text(record.title)); }
  treatmentHeading(record: ClinicalRecord): string { return this.join(this.date(record.date), this.text(record.scheme) || this.text(record.title) || this.text(record.reason)); }
  treatmentRecords(kind: ClinicalTreatmentKind): ClinicalRecord[] {
    return clinicalSectionTreatments(
      this.state(),
      kind,
      this.workspaceService.workingWorkspace()?.treatments?.oncology || []
    );
  }
  printHas(section: ClinicalPrintSection): boolean {
    return clinicalPrintSectionHasContent(
      this.state(),
      section,
      this.workspaceService.workingWorkspace()?.treatments?.oncology || []
    );
  }
  printFacts(patient: ClinicalPatient): ClinicalPrintFact[] { return clinicalPrintPatientFacts(patient); }
  printFactValue(fact: ClinicalPrintFact): string {
    return fact.label === 'Fecha de nacimiento' ? this.date(fact.value) : fact.value;
  }
  printDateTime(): string {
    const value = this.printTimestamp();
    if (!value) return '';
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat('es-AR', {
      dateStyle: 'short', timeStyle: 'short'
    }).format(parsed);
  }
  evolutionHeading(record: ClinicalRecord): string { return this.join(this.date(record.date), this.text(record.author) || this.text(record.reason)); }
  activityRecords(): ClinicalRecord[] {
    return [...this.records('evolutions'), ...this.records('prescriptions')]
      .sort((left, right) => {
        const leftKey = [left.date || String(left.createdAt || '').slice(0, 10), left.createdAt || left.updatedAt || ''].join('|');
        const rightKey = [right.date || String(right.createdAt || '').slice(0, 10), right.createdAt || right.updatedAt || ''].join('|');
        return leftKey.localeCompare(rightKey);
      });
  }
  activityHeading(record: ClinicalRecord): string {
    const type = this.text(record.type);
    const label = ({ medication: 'Receta médica', certificate: 'Certificado médico', study: 'Solicitud de estudio', free: 'Indicación médica', systemic: 'Formulario sistémico' } as Record<string, string>)[type];
    return this.join(this.date(record.date), label || this.text(record.author) || this.text(record.reason), this.text(record.title));
  }
  prescriptionDetails(record: ClinicalRecord): string[] {
    const data = record['data'] && typeof record['data'] === 'object' ? record['data'] as Record<string, unknown> : {};
    const value = (key: string): string => this.text(data[key]);
    if (record.type === 'medication') return [
      this.join(value('generic'), value('brand')),
      [value('presentation'), value('form'), value('quantity')].filter(Boolean).join(' - '),
      [value('dose'), value('route'), value('frequency'), value('duration')].filter(Boolean).join(' - '),
      value('indication') ? `Indicación: ${value('indication')}` : '',
      value('instructions') ? `Instrucciones: ${value('instructions')}` : ''
    ].filter(Boolean);
    if (record.type === 'certificate') return [
      [value('from') ? `Desde ${this.date(value('from'))}` : '', value('to') ? `hasta ${this.date(value('to'))}` : ''].filter(Boolean).join(' '),
      value('text'), data['includeDiagnosis'] === true ? 'Incluye diagnóstico' : ''
    ].filter(Boolean);
    if (record.type === 'study') return [
      [value('category'), value('priority')].filter(Boolean).join(' - '), value('name'),
      value('indication') ? `Indicación clínica: ${value('indication')}` : '',
      value('notes') ? `Preparación / observaciones: ${value('notes')}` : ''
    ].filter(Boolean);
    if (record.type === 'systemic') {
      const fields = Array.isArray(data['fields']) ? data['fields'] as Array<Record<string, unknown>> : [];
      const seen = new Set<string>();
      const clinicalLines = fields.map((field) => {
        if (field['kind'] === 'checkbox') return field['value'] === true ? this.text(field['label']) : '';
        const fieldValue = this.text(field['value']);
        const localKey = this.text(field['localKey']);
        if (!fieldValue || /^(patient|professional|exam)\./.test(localKey)
            || ['today', 'todayWithCity', 'mendozaToday', 'alwaysTrue', 'currentYear', 'blank'].includes(localKey)) return '';
        return `${this.text(field['label'])}: ${fieldValue}`;
      }).filter((line) => {
        const key = line.toLocaleLowerCase('es-AR').replace(/\s+/g, ' ').trim();
        if (!key || seen.has(key)) return false;
        seen.add(key); return true;
      });
      const pages = Array.isArray(data['pages']) ? data['pages'].length : 0;
      return [value('formTitle') || this.text(record.title), ...clinicalLines, `${pages} ${pages === 1 ? 'página' : 'páginas'}`].filter(Boolean);
    }
    return [value('title'), value('text'), this.recordBody(record)].filter(Boolean);
  }
  activityAudit(record: ClinicalRecord): string {
    const audit = record['audit'] && typeof record['audit'] === 'object' ? record['audit'] as Record<string, unknown> : {};
    const author = [this.text(audit['lastName']) || this.text(record.author), this.text(audit['license']) ? `Mat. ${this.text(audit['license'])}` : ''].filter(Boolean).join(' · ');
    return author ? `${this.text(audit['action']) || 'cargado'} por ${author}` : '';
  }
  private join(...values: string[]): string { return values.filter((value) => Boolean(value)).join(' · '); }

  private applyClinicalFocus(request: ClinicalFocusRequest): void {
    const root = this.host.nativeElement;
    const colors = ['study', 'pathology', 'chemotherapy', 'evolution', 'hormone', 'systemic', 'radiotherapy', 'surgery', 'immunotherapy', 'targeted'];
    root.querySelectorAll<HTMLElement>('.agent-navigation-focus, .agent-highlight').forEach((element) => {
      element.classList.remove('agent-navigation-focus', 'agent-highlight', ...colors.map((color) => `agent-highlight--${color}`));
    });
    const candidates = [...root.querySelectorAll<HTMLElement>('[data-clinical-date], .doc-entry, .doc-section')];
    let first: HTMLElement | undefined;
    for (const highlight of request.highlights || []) {
      const terms = highlight.terms.map((term) => this.normalizeSearch(term)).filter((term) => term.length >= 3);
      if (!terms.length) continue;
      const color = colors.includes(String(highlight.color)) ? String(highlight.color) : 'study';
      for (const candidate of candidates) {
        const content = this.normalizeSearch(candidate.textContent || '');
        if (!terms.some((term) => content.includes(term))) continue;
        candidate.classList.add('agent-highlight', `agent-highlight--${color}`);
        first ||= candidate;
      }
    }
    if (request.date) first = candidates.find((candidate) => candidate.dataset['clinicalDate'] === request.date) || first;
    if (!first && request.text) {
      const words = this.normalizeSearch(request.text).split(/\s+/).filter((word) => word.length >= 5);
      first = candidates.find((candidate) => {
        const content = this.normalizeSearch(candidate.textContent || '');
        return words.some((word) => content.includes(word));
      });
    }
    if (!first) return;
    first.classList.add('agent-navigation-focus');
    first.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  private normalizeSearch(value: string): string {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-AR').replace(/\s+/g, ' ').trim();
  }

  private refreshSummaryPlanDirtyState(): void {
    if (!this.summaryPlanDraft) return;
    // La detección usa la misma normalización que el guardado: espacios solos
    // no deben dejar un borrador fantasma ni pedir confirmación al cerrar.
    const dirty = this.summaryControl.value.trim() !== this.summaryPlanBaseline.summary
      || this.planControl.value.trim() !== this.summaryPlanBaseline.plan
      || this.summaryPlanReasonControl.value.trim().length > 0;
    this.clinicalDrafts.setDirty(this.summaryPlanDraft, dirty);
  }

  private refreshChiefComplaintDirtyState(): void {
    if (!this.chiefComplaintDraft) return;
    const dirty = this.chiefComplaintControl.value.trim() !== this.chiefComplaintEditorBaseline.chiefComplaint
      || this.chiefComplaintReasonControl.value.trim().length > 0;
    this.clinicalDrafts.setDirty(this.chiefComplaintDraft, dirty);
  }

  private releaseChiefComplaintDraft(): void {
    if (!this.chiefComplaintDraft) return;
    this.clinicalDrafts.release(this.chiefComplaintDraft);
    this.chiefComplaintDraft = null;
  }

  private finishChiefComplaintEditor(returnFocus: boolean): void {
    this.releaseChiefComplaintDraft();
    this.chiefComplaintOpen.set(false);
    this.chiefComplaintError.set('');
    this.chiefComplaintErrorTarget.set('');
    const trigger = this.chiefComplaintReturnFocus;
    this.chiefComplaintReturnFocus = null;
    if (returnFocus && trigger) window.setTimeout(() => {
      if (trigger.isConnected && !trigger.hasAttribute('disabled')) trigger.focus({ preventScroll: true });
    }, 0);
  }

  private releaseSummaryPlanDraft(): void {
    if (!this.summaryPlanDraft) return;
    this.clinicalDrafts.release(this.summaryPlanDraft);
    this.summaryPlanDraft = null;
  }

  private finishSummaryPlanEditor(returnFocus: boolean): void {
    this.releaseSummaryPlanDraft();
    this.summaryPlanOpen.set(false);
    this.summaryPlanError.set('');
    const trigger = this.summaryPlanReturnFocus;
    this.summaryPlanReturnFocus = null;
    if (returnFocus && trigger) window.setTimeout(() => {
      if (trigger.isConnected && !trigger.hasAttribute('disabled')) trigger.focus({ preventScroll: true });
    }, 0);
  }

  private focusSummaryPlanAfterRender(selector: string): void {
    window.setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true }), 0);
  }

  private errorMessage(error: unknown, fallback: string): string {
    return error instanceof Error && error.message ? error.message : fallback;
  }
}
