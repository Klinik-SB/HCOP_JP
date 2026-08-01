import { HttpClient, HttpParams } from '@angular/common/http';
import { Component, OnChanges, SimpleChanges, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/auth/auth.service';
import { PatientWorkspaceService } from '../../core/patients/patient-workspace.service';

type JsonObject = Record<string, unknown>;
type CareView = 'treatments' | 'applications' | 'pharmacy' | 'triage' | 'preparation' | 'administration';
type CycleState = 'completed' | 'current' | 'partial' | 'scheduled' | 'pending' | 'paused' | 'cancelled';

interface TreatmentListResponse { treatments?: JsonObject[]; oncology?: JsonObject[]; }
interface InfusionListResponse { infusions?: JsonObject[]; }
interface TreatmentDetailResponse { detail?: JsonObject; }
interface WorkflowListResponse { items?: JsonObject[]; }

interface CareCycle {
  number: number;
  state: CycleState;
  plannedDate: string;
  days: JsonObject[];
  homeMedications: JsonObject[];
}

interface CareCard {
  treatment: JsonObject;
  id: string;
  scheme: string;
  diagnosis: string;
  type: string;
  oncologist: string;
  status: string;
  cycleCount: number;
  completedCycles: number;
  duration: string;
  firstDate: string;
  lastDate: string;
  cycles: CareCycle[];
}

interface PreparationDraft {
  componentKey: string; drugId: string; drugName: string; lot: string; expiryDate: string;
  quantity: string; quantityText: string; unit: string; diluent: string; finalVolume: string;
  concentration: string; ttlMinutes: string; reservationId: string; inventoryLotId: string;
}

const STATUS_LABELS: Record<string, string> = {
  planned: 'Pendiente', pending: 'Pendiente', current: 'En seguimiento', partial: 'Parcial',
  scheduled: 'Turno registrado', completed: 'Aplicación finalizada', cancelled: 'Cancelado',
  paused: 'Pausado', checked_in: 'Admitido', ready: 'Listo', in_preparation: 'En preparación',
  released: 'Liberado a sala', in_progress: 'En curso', not_started: 'No iniciada',
  patient_to_bring: 'La trae el paciente', received: 'Recibida', reserved: 'Reservada',
  approved: 'Aprobado', rejected: 'Observado', failed: 'No aprobado'
};

@Component({
  selector: 'app-day-hospital',
  imports: [FormsModule],
  templateUrl: './day-hospital.component.html',
  styleUrl: './day-hospital.component.scss',
  host: { '[class.is-embedded]': 'embedded()' }
})
export class DayHospitalComponent implements OnChanges {
  readonly embedded = input(false);
  readonly initialView = input<CareView>('treatments');
  readonly autoOpenNewTreatment = input(false);
  readonly workflowRequest = input<JsonObject | null>(null);
  readonly workspace = inject(PatientWorkspaceService);
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  readonly view = signal<CareView>('treatments');
  readonly treatments = signal<JsonObject[]>([]);
  readonly infusions = signal<JsonObject[]>([]);
  readonly details = signal<Record<string, JsonObject>>({});
  readonly expandedId = signal('');
  readonly query = signal('');
  readonly date = signal('');
  readonly status = signal('');
  readonly queueItems = signal<JsonObject[]>([]);
  readonly queueLoading = signal(false);
  readonly workflowLoading = signal(false);
  readonly selectedWorkflow = signal<JsonObject | null>(null);
  readonly workflowActionLoading = signal(false);
  readonly workflowActionMessage = signal('');
  readonly medicationSource = signal('center_stock');
  readonly pharmacyNotes = signal('');
  readonly stockNotes = signal('');
  readonly triageLaboratoryDate = signal('');
  readonly triageNeutrophils = signal('');
  readonly triagePlatelets = signal('');
  readonly triageCreatinine = signal('');
  readonly triageWeight = signal('');
  readonly triageTemperature = signal('');
  readonly triageBloodPressure = signal('');
  readonly triageOxygen = signal('');
  readonly triageToxicityGrade = signal('0');
  readonly triageToxicityNotes = signal('');
  readonly triageReason = signal('');
  readonly triageRescheduledDate = signal('');
  readonly preparationNotes = signal('');
  readonly preparationVerifiedBy = signal('');
  readonly preparationDrafts = signal<PreparationDraft[]>([]);
  readonly preparationUsers = signal<JsonObject[]>([]);
  readonly eligiblePreparationUsers = computed(() => {
    const currentId = String(this.auth.session()?.user?.id || '');
    return this.preparationUsers().filter((user) => this.pick(user, 'id') !== currentId);
  });
  readonly administrationUsers = signal<JsonObject[]>([]);
  readonly administrationDoubleCheckBy = signal('');
  readonly administrationPatientVerified = signal(false);
  readonly administrationLabelVerified = signal(false);
  readonly administrationNotes = signal('');
  readonly interruptionReason = signal('');
  readonly interruptionActualDose = signal('');
  readonly interruptionMeasures = signal('');
  readonly interruptionPatientCondition = signal('');
  readonly interruptionDisposition = signal('observation');
  readonly resolutionNotes = signal('');
  readonly resolutionActualDose = signal('');
  readonly resolutionPatientCondition = signal('');
  readonly completionActualDose = signal('');
  readonly completionReactionOccurred = signal(false);
  readonly completionReactionDescription = signal('');
  readonly completionObservation = signal('');
  readonly eligibleAdministrationUsers = computed(() => {
    const currentId = String(this.auth.session()?.user?.id || '');
    return this.administrationUsers().filter((user) => this.pick(user, 'id') !== currentId);
  });
  readonly loading = signal(false);
  readonly error = signal('');
  readonly newTreatmentOpen = signal(false);
  readonly newTreatmentLoading = signal(false);
  readonly newTreatmentMessage = signal('');
  readonly treatmentOptions = signal<JsonObject>({});
  readonly treatmentRequirements = signal<JsonObject>({});
  readonly treatmentDiagnosisId = signal('');
  readonly treatmentSchemeId = signal('');
  readonly treatmentType = signal('Quimioterapia');
  readonly treatmentIntent = signal('Paliativo');
  readonly treatmentCycles = signal('1');
  readonly treatmentInitialCycle = signal('1');
  readonly treatmentCycleDays = signal('');
  readonly treatmentCreatedDate = signal(new Date().toISOString().slice(0, 10));
  readonly treatmentFirstCycleDate = signal(new Date().toISOString().slice(0, 10));
  readonly treatmentConsent = signal('Pendiente');
  readonly treatmentWeight = signal('');
  readonly treatmentHeight = signal('');
  readonly treatmentCreatinine = signal('');
  readonly treatmentGfr = signal('');
  readonly treatmentTargetAuc = signal('');
  readonly treatmentCalcium = signal('');
  readonly treatmentAlbumin = signal('');
  readonly treatmentNotes = signal('');
  readonly treatmentRequirementsConfirmed = signal(false);
  readonly treatmentMismatchConfirmed = signal(false);
  readonly treatmentMismatchReason = signal('');
  readonly diagnosisOptions = computed(() => this.array(this.treatmentOptions()['diagnoses']));
  readonly schemeOptions = computed(() => this.array(this.treatmentOptions()['schemes']));
  readonly treatmentTypeOptions = computed(() => this.array(this.treatmentOptions()['treatmentTypes']));
  readonly treatmentIntentOptions = computed(() => this.array(this.treatmentOptions()['characters']));
  readonly treatmentConsentOptions = computed(() => this.array(this.treatmentOptions()['consentStates']));

  readonly cards = computed(() => this.filteredCards());
  readonly activePatientId = computed(() => this.workspace.workspace()?.patientId || '');
  readonly selectedQueueLabel = computed(() => ({
    applications: 'Aplicaciones programadas', pharmacy: 'Farmacia', triage: 'Triaje clínico',
    preparation: 'Preparación estéril', administration: 'Administración'
  } as Partial<Record<CareView, string>>)[this.view()] || 'Tratamiento');

  constructor() {
    effect(() => {
      const patientId = this.activePatientId();
      if (!patientId) {
        this.treatments.set([]); this.infusions.set([]); this.details.set({}); this.expandedId.set('');
        return;
      }
      this.loadPatientCare(patientId);
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['initialView']) this.selectView(changes['initialView'].currentValue as CareView);
    if (changes['autoOpenNewTreatment']) {
      if (changes['autoOpenNewTreatment'].currentValue && this.activePatientId()) this.openNewTreatment();
      else if (!changes['autoOpenNewTreatment'].currentValue && this.newTreatmentOpen()) this.closeNewTreatment();
    }
    if (changes['workflowRequest']?.currentValue) {
      this.view.set('administration');
      this.openWorkflow(changes['workflowRequest'].currentValue as JsonObject);
    }
  }

  selectView(view: CareView): void {
    this.view.set(view);
    if (view !== 'treatments') this.loadQueue();
    if (view === 'preparation') this.loadPreparationUsers();
    if (view === 'administration') this.loadAdministrationUsers();
  }

  reload(): void {
    const patientId = this.activePatientId();
    if (patientId) this.loadPatientCare(patientId);
    if (this.view() !== 'treatments') this.loadQueue();
  }

  toggleTreatment(id: string): void {
    if (this.expandedId() === id) { this.expandedId.set(''); return; }
    this.expandedId.set(id);
    if (!this.details()[id]) this.loadDetail(id);
  }
  openNewTreatment(): void {
    const patientId = this.activePatientId();
    if (!patientId) return;
    this.newTreatmentOpen.set(true); this.newTreatmentLoading.set(true); this.newTreatmentMessage.set('');
    this.http.get<{ options?: JsonObject }>(`/api/clinical/patients/${encodeURIComponent(patientId)}/treatment-options`, { withCredentials: true }).subscribe({
      next: (response) => { this.treatmentOptions.set(this.object(response.options)); this.newTreatmentLoading.set(false); },
      error: (response: { error?: { error?: string } }) => { this.newTreatmentLoading.set(false); this.newTreatmentMessage.set(response?.error?.error || 'No se pudieron cargar las opciones del tratamiento.'); }
    });
  }
  closeNewTreatment(): void { if (!this.newTreatmentLoading()) this.newTreatmentOpen.set(false); }
  selectTreatmentScheme(schemeId: string): void {
    this.treatmentSchemeId.set(schemeId); this.treatmentRequirements.set({}); this.treatmentRequirementsConfirmed.set(false);
    const scheme = this.schemeOptions().find((item) => this.pick(item, 'id') === schemeId);
    if (scheme) this.treatmentCycleDays.set(this.pick(scheme, 'cycleDays', 'duracionCiclo'));
    const patientId = this.activePatientId();
    if (!patientId || !schemeId) return;
    this.http.get<{ requirements?: JsonObject }>(`/api/clinical/patients/${encodeURIComponent(patientId)}/treatment-requirements/${encodeURIComponent(schemeId)}`, { withCredentials: true }).subscribe({
      next: (response) => this.treatmentRequirements.set(this.object(response.requirements)),
      error: (response: { error?: { error?: string } }) => this.newTreatmentMessage.set(response?.error?.error || 'No se pudieron cargar los requisitos del esquema.')
    });
  }
  createTreatment(): void {
    const patientId = this.activePatientId();
    if (!patientId || this.newTreatmentLoading()) return;
    if (!this.treatmentDiagnosisId() || !this.treatmentSchemeId()) {
      this.newTreatmentMessage.set('Seleccione un diagnóstico guardado y un protocolo.'); return;
    }
    if (!this.treatmentRequirementsConfirmed()) {
      this.newTreatmentMessage.set('Confirme los requisitos y datos de cálculo antes de prescribir.'); return;
    }
    const body = {
      diagnostico: this.treatmentDiagnosisId(), esquema: this.treatmentSchemeId(),
      tipoOncologico: this.treatmentType(), caracter: this.treatmentIntent(),
      cantidadCiclos: this.number(this.treatmentCycles(), 1), cicloInicial: this.number(this.treatmentInitialCycle(), 1),
      duracionCiclo: this.number(this.treatmentCycleDays(), 0), fechaCreacion: this.treatmentCreatedDate(),
      fechaPrimerCiclo: this.treatmentFirstCycleDate(), estadoConsentimiento: this.treatmentConsent(),
      peso: this.numeric(this.treatmentWeight()), talla: this.numeric(this.treatmentHeight()),
      creatinina: this.numeric(this.treatmentCreatinine()), tfg: this.numeric(this.treatmentGfr()),
      targetAUC: this.numeric(this.treatmentTargetAuc()), calcio: this.numeric(this.treatmentCalcium()),
      albumina: this.numeric(this.treatmentAlbumin()), observaciones: this.treatmentNotes().trim(),
      requirementsConfirmed: true, protocolMismatchConfirmed: this.treatmentMismatchConfirmed(),
      protocolMismatchReason: this.treatmentMismatchReason().trim()
    };
    this.newTreatmentLoading.set(true); this.newTreatmentMessage.set('');
    this.http.post(`/api/clinical/patients/${encodeURIComponent(patientId)}/treatments`, body, { withCredentials: true }).subscribe({
      next: () => {
        this.newTreatmentLoading.set(false); this.newTreatmentOpen.set(false); this.resetTreatmentForm();
        this.loadPatientCare(patientId); this.workspace.load(patientId);
      },
      error: (response: { error?: { error?: string } }) => { this.newTreatmentLoading.set(false); this.newTreatmentMessage.set(response?.error?.error || 'No se pudo crear el tratamiento.'); }
    });
  }
  requirementEnabled(key: string): boolean { return Boolean(this.treatmentRequirements()[key]); }
  optionLabel(option: JsonObject): string { return this.pick(option, 'nombre', 'name', 'label', 'displayName') || this.pick(option, 'id'); }

  isExpanded(card: CareCard): boolean { return this.expandedId() === card.id; }
  detailReady(card: CareCard): boolean { return Boolean(this.details()[card.id]); }
  statusLabel(value: unknown): string { const key = this.string(value).toLowerCase(); return STATUS_LABELS[key] || this.string(value) || 'No informado'; }
  dateLabel(value: unknown): string { return this.formatDate(this.string(value), false); }
  dateTimeLabel(value: unknown): string { return this.formatDate(this.string(value), true); }
  dayMedications(day: JsonObject): JsonObject[] { return this.array(day['medications']); }
  medicationLabel(medication: JsonObject): string {
    const name = this.pick(medication, 'drugName', 'name', 'nombre') || 'Droga';
    const dose = this.pick(medication, 'actualDoseText', 'prescribedDoseText', 'doseText', 'dosis');
    return dose ? `${name} · ${dose}` : name;
  }
  daysFor(card: CareCard): CareCycle[] { return card.cycles; }
  applicationsFor(day: JsonObject): JsonObject[] {
    const id = this.pick(day, 'applicationId', 'id');
    if (!id) return [];
    return this.infusions().filter((item) => this.pick(item, 'id', 'sessionId') === id);
  }
  queueStatus(item: JsonObject): string {
    const view = this.view();
    if (view === 'pharmacy') return this.statusLabel(this.pick(item, 'pharmacyValidationStatus', 'stockReservationStatus', 'medicationSource'));
    if (view === 'triage') return this.statusLabel(this.pick(item, 'clinicalAuthorizationStatus', 'currentStep'));
    if (view === 'preparation') return this.statusLabel(this.pick(item, 'preparationStatus', 'currentStep'));
    return this.statusLabel(this.pick(item, 'administrationStatus', 'currentStep', 'workflowStatus'));
  }
  queueDate(item: JsonObject): string {
    const appointment = this.object(item['appointment']);
    return this.dateTimeLabel(this.pick(appointment, 'scheduledAt') || this.pick(item, 'plannedDate'));
  }
  trackId(index: number, item: JsonObject): string { return this.pick(item, 'id', 'treatmentId', 'applicationId') || String(index); }
  openWorkflow(item: JsonObject): void {
    const patientId = this.pick(item, 'patientId');
    const treatmentId = this.pick(item, 'treatmentId');
    const cycle = this.number(this.pick(item, 'cycleNumber'), 0);
    const day = this.number(this.pick(item, 'applicationDay'), 0);
    if (!patientId || !treatmentId || cycle < 1 || day < 1) {
      this.error.set('La aplicación no contiene una referencia clínica completa.');
      return;
    }
    this.workflowLoading.set(true); this.error.set('');
    const url = `/api/clinical/application-workflows/${encodeURIComponent(patientId)}/${encodeURIComponent(treatmentId)}/${cycle}/${day}`;
    this.http.get<{ workflow?: JsonObject }>(url, { withCredentials: true }).subscribe({
      next: (response) => {
        const workflow = this.object(response.workflow);
        this.selectedWorkflow.set(workflow);
        this.medicationSource.set(this.pick(workflow, 'medicationSource') || 'center_stock');
        this.pharmacyNotes.set(this.pick(workflow, 'pharmacyValidationNotes'));
        this.stockNotes.set(this.pick(workflow, 'stockReservationNotes'));
        this.populateTriage(workflow);
        this.preparationNotes.set('');
        this.populatePreparation(workflow);
        if (this.view() === 'preparation') this.loadPreparationUsers();
        this.populateAdministration(workflow);
        if (this.view() === 'administration') this.loadAdministrationUsers();
        this.workflowActionMessage.set('');
        this.workflowLoading.set(false);
      },
      error: (response: { error?: { error?: string } }) => {
        this.workflowLoading.set(false); this.error.set(response?.error?.error || 'No se pudo abrir el circuito de la aplicación.');
      }
    });
  }
  closeWorkflow(): void { this.selectedWorkflow.set(null); this.workflowActionMessage.set(''); }
  validatePharmacy(validated: boolean): void {
    const workflow = this.selectedWorkflow();
    if (!workflow || this.workflowActionLoading()) return;
    const notes = this.pharmacyNotes().trim();
    if (!validated && notes.length < 3) {
      this.workflowActionMessage.set('Para rechazar la orden debe documentar el motivo.');
      return;
    }
    const url = `${this.workflowUrl(workflow)}/pharmacy-validation`;
    const body = {
      expectedRevision: this.number(this.pick(workflow, 'revision'), 0),
      idempotencyKey: `pharmacy-validation-${Date.now()}-${crypto.randomUUID()}`,
      validated,
      medicationSource: this.medicationSource(),
      notes
    };
    this.workflowActionLoading.set(true); this.workflowActionMessage.set('');
    this.http.post<{ workflow?: JsonObject }>(url, body, { withCredentials: true }).subscribe({
      next: (response) => {
        const updated = this.object(response.workflow);
        this.selectedWorkflow.set(updated);
        this.workflowActionLoading.set(false);
        this.workflowActionMessage.set(validated ? 'Orden validada por Farmacia.' : 'Orden rechazada y motivo registrado.');
        this.loadQueue();
      },
      error: (response: { error?: { error?: string } }) => {
        this.workflowActionLoading.set(false);
        this.workflowActionMessage.set(response?.error?.error || 'No se pudo guardar la validación farmacéutica.');
      }
    });
  }
  updateStockReservation(reserved: boolean): void {
    const workflow = this.selectedWorkflow();
    if (!workflow || this.workflowActionLoading()) return;
    const notes = this.stockNotes().trim();
    if (reserved && this.medicationSource() !== 'center_stock') {
      this.workflowActionMessage.set('Esta procedencia no utiliza reserva de stock del centro.');
      return;
    }
    if (reserved && notes.length < 10) {
      this.workflowActionMessage.set('La constatación manual requiere una nota de al menos 10 caracteres.');
      return;
    }
    const body = {
      expectedRevision: this.number(this.pick(workflow, 'revision'), 0),
      idempotencyKey: `stock-${reserved ? 'reserve' : 'release'}-${Date.now()}-${crypto.randomUUID()}`,
      reserved,
      medicationSource: this.medicationSource(),
      verificationMethod: 'manual',
      notes,
      components: []
    };
    this.workflowActionLoading.set(true); this.workflowActionMessage.set('');
    this.http.post<{ workflow?: JsonObject }>(`${this.workflowUrl(workflow)}/stock-reservation`, body, { withCredentials: true }).subscribe({
      next: (response) => {
        this.selectedWorkflow.set(this.object(response.workflow));
        this.workflowActionLoading.set(false);
        this.workflowActionMessage.set(reserved ? 'Stock reservado para esta aplicación.' : 'Reserva liberada y stock devuelto a disponibilidad.');
        this.loadQueue();
      },
      error: (response: { error?: { error?: string } }) => {
        this.workflowActionLoading.set(false);
        this.workflowActionMessage.set(response?.error?.error || 'No se pudo actualizar la reserva de stock.');
      }
    });
  }
  submitTriage(decision: 'PASS' | 'FAIL'): void {
    const workflow = this.selectedWorkflow();
    if (!workflow || this.workflowActionLoading()) return;
    const requiredForPass = [
      this.triageLaboratoryDate(), this.triageNeutrophils(), this.triagePlatelets(),
      this.triageCreatinine(), this.triageWeight(), this.triageTemperature(),
      this.triageBloodPressure(), this.triageToxicityGrade()
    ];
    if (decision === 'PASS' && requiredForPass.some((value) => !String(value).trim())) {
      this.workflowActionMessage.set('Para autorizar complete laboratorio, peso, temperatura, presión arterial y toxicidad.');
      return;
    }
    if (decision === 'FAIL' && this.triageReason().trim().length < 3) {
      this.workflowActionMessage.set('Para postergar debe documentar el motivo clínico.');
      return;
    }
    const laboratory = this.compactObject({
      date: this.triageLaboratoryDate(), neutrophils: this.numeric(this.triageNeutrophils()),
      platelets: this.numeric(this.triagePlatelets()), creatinine: this.numeric(this.triageCreatinine())
    }, decision === 'FAIL');
    const vitalSigns = this.compactObject({
      weightKg: this.numeric(this.triageWeight()), temperatureC: this.numeric(this.triageTemperature()),
      bloodPressure: this.triageBloodPressure(), oxygenSaturation: this.numeric(this.triageOxygen())
    }, decision === 'FAIL');
    const toxicity = this.compactObject({
      grade: this.numeric(this.triageToxicityGrade()), notes: this.triageToxicityNotes()
    }, decision === 'FAIL');
    const body = {
      expectedRevision: this.number(this.pick(workflow, 'revision'), 0),
      idempotencyKey: `triage-${decision.toLowerCase()}-${Date.now()}-${crypto.randomUUID()}`,
      decision, laboratory, vitalSigns, toxicity,
      reason: this.triageReason().trim(),
      rescheduledDate: decision === 'FAIL' && this.triageRescheduledDate() ? this.triageRescheduledDate() : null
    };
    this.workflowActionLoading.set(true); this.workflowActionMessage.set('');
    this.http.post<{ workflow?: JsonObject }>(`${this.workflowUrl(workflow)}/clinical-authorization`, body, { withCredentials: true }).subscribe({
      next: (response) => {
        this.selectedWorkflow.set(this.object(response.workflow));
        this.workflowActionLoading.set(false);
        this.workflowActionMessage.set(decision === 'PASS' ? 'Aplicación autorizada clínicamente.' : 'Aplicación postergada; turno y reserva fueron liberados por el circuito.');
        this.loadQueue();
        const patientId = this.activePatientId();
        if (patientId) this.workspace.load(patientId);
      },
      error: (response: { error?: { error?: string } }) => {
        this.workflowActionLoading.set(false);
        this.workflowActionMessage.set(response?.error?.error || 'No se pudo registrar el Triaje.');
      }
    });
  }
  updatePreparation(action: 'start' | 'release'): void {
    const workflow = this.selectedWorkflow();
    if (!workflow || this.workflowActionLoading()) return;
    const body = {
      expectedRevision: this.number(this.pick(workflow, 'revision'), 0),
      idempotencyKey: `preparation-${action}-${Date.now()}-${crypto.randomUUID()}`,
      notes: this.preparationNotes().trim()
    };
    this.workflowActionLoading.set(true); this.workflowActionMessage.set('');
    this.http.post<{ workflow?: JsonObject }>(`${this.workflowUrl(workflow)}/preparation/${action}`, body, { withCredentials: true }).subscribe({
      next: (response) => {
        this.selectedWorkflow.set(this.object(response.workflow));
        this.workflowActionLoading.set(false);
        this.workflowActionMessage.set(action === 'start' ? 'Preparación estéril iniciada.' : 'Mezcla liberada a sala.');
        this.loadQueue();
      },
      error: (response: { error?: { error?: string } }) => {
        this.workflowActionLoading.set(false);
        this.workflowActionMessage.set(response?.error?.error || 'No se pudo actualizar la preparación.');
      }
    });
  }
  updatePreparationDraft(index: number, field: keyof PreparationDraft, value: string): void {
    this.preparationDrafts.update((current) => current.map((draft, position) => position === index ? { ...draft, [field]: String(value ?? '') } : draft));
  }
  completePreparation(): void {
    const workflow = this.selectedWorkflow();
    if (!workflow || this.workflowActionLoading()) return;
    if (!this.preparationVerifiedBy()) {
      this.workflowActionMessage.set('Seleccione un segundo profesional para verificar la mezcla.');
      return;
    }
    const drafts = this.preparationDrafts();
    if (!drafts.length || drafts.some((draft) => !draft.drugName || !draft.lot || !draft.expiryDate || !draft.quantity || !draft.unit || !draft.diluent || !draft.finalVolume || !draft.concentration || !draft.ttlMinutes)) {
      this.workflowActionMessage.set('Complete lote, vencimiento, cantidad, unidad, diluyente, volumen, concentración y TTL para cada droga.');
      return;
    }
    const preparations = drafts.map((draft) => ({
      componentKey: draft.componentKey || null,
      drugName: draft.drugName,
      lot: draft.lot.trim(),
      expiryDate: draft.expiryDate,
      quantity: this.numeric(draft.quantity),
      quantityText: draft.quantityText || `${draft.quantity} ${draft.unit}`.trim(),
      unit: draft.unit.trim(),
      diluent: draft.diluent.trim(),
      finalVolume: draft.finalVolume.trim(),
      concentration: draft.concentration.trim(),
      ttlMinutes: this.numeric(draft.ttlMinutes),
      reservationId: draft.reservationId || null,
      inventoryLotId: draft.inventoryLotId ? Number(draft.inventoryLotId) : null
    }));
    const body = {
      expectedRevision: this.number(this.pick(workflow, 'revision'), 0),
      idempotencyKey: `preparation-complete-${Date.now()}-${crypto.randomUUID()}`,
      verifiedBy: this.preparationVerifiedBy(), preparations,
      notes: this.preparationNotes().trim()
    };
    this.workflowActionLoading.set(true); this.workflowActionMessage.set('');
    this.http.post<{ workflow?: JsonObject }>(`${this.workflowUrl(workflow)}/preparation/complete`, body, { withCredentials: true }).subscribe({
      next: (response) => {
        const updated = this.object(response.workflow);
        this.selectedWorkflow.set(updated);
        this.populatePreparation(updated);
        this.workflowActionLoading.set(false);
        this.workflowActionMessage.set('Mezcla completada con trazabilidad y TTL registrados.');
        this.loadQueue();
      },
      error: (response: { error?: { error?: string } }) => {
        this.workflowActionLoading.set(false);
        this.workflowActionMessage.set(response?.error?.error || 'No se pudo completar la preparación.');
      }
    });
  }
  startAdministration(): void {
    const workflow = this.selectedWorkflow();
    if (!workflow || this.workflowActionLoading()) return;
    if (!this.administrationPatientVerified() || !this.administrationLabelVerified()) {
      this.workflowActionMessage.set('Confirme la identidad del paciente y la coincidencia con la etiqueta/QR.');
      return;
    }
    if (!this.administrationDoubleCheckBy()) {
      this.workflowActionMessage.set('Seleccione el segundo profesional que realizó el doble chequeo.');
      return;
    }
    const body = {
      expectedRevision: this.number(this.pick(workflow, 'revision'), 0),
      idempotencyKey: `administration-start-${Date.now()}-${crypto.randomUUID()}`,
      patientVerified: true,
      labelVerified: true,
      doubleCheckBy: this.administrationDoubleCheckBy(),
      startedAt: new Date().toISOString(),
      notes: this.administrationNotes().trim()
    };
    this.workflowActionLoading.set(true); this.workflowActionMessage.set('');
    this.http.post<{ workflow?: JsonObject }>(`${this.workflowUrl(workflow)}/administration/start`, body, { withCredentials: true }).subscribe({
      next: (response) => {
        const updated = this.object(response.workflow);
        this.selectedWorkflow.set(updated);
        this.populateAdministration(updated);
        this.workflowActionLoading.set(false);
        this.workflowActionMessage.set('Administración iniciada con doble chequeo registrado.');
        this.loadQueue();
      },
      error: (response: { error?: { error?: string } }) => {
        this.workflowActionLoading.set(false);
        this.workflowActionMessage.set(response?.error?.error || 'No se pudo iniciar la administración.');
      }
    });
  }
  interruptAdministration(): void {
    const workflow = this.selectedWorkflow();
    if (!workflow || this.workflowActionLoading()) return;
    if ([this.interruptionReason(), this.interruptionActualDose(), this.interruptionMeasures(), this.interruptionPatientCondition()].some((value) => value.trim().length < 2)) {
      this.workflowActionMessage.set('Complete motivo, dosis administrada, medidas y condición actual del paciente.');
      return;
    }
    const body = {
      expectedRevision: this.number(this.pick(workflow, 'revision'), 0),
      idempotencyKey: `administration-interrupt-${Date.now()}-${crypto.randomUUID()}`,
      interruptedAt: new Date().toISOString(),
      reason: this.interruptionReason().trim(),
      actualDose: this.interruptionActualDose().trim(),
      measures: this.interruptionMeasures().trim(),
      patientCondition: this.interruptionPatientCondition().trim(),
      disposition: this.interruptionDisposition()
    };
    this.workflowActionLoading.set(true); this.workflowActionMessage.set('');
    this.http.post<{ workflow?: JsonObject }>(`${this.workflowUrl(workflow)}/administration/interrupt`, body, { withCredentials: true }).subscribe({
      next: (response) => {
        const updated = this.object(response.workflow);
        this.selectedWorkflow.set(updated);
        this.populateAdministration(updated);
        this.workflowActionLoading.set(false);
        this.workflowActionMessage.set('Administración interrumpida; incidencia y evolución registradas.');
        this.loadQueue();
        const patientId = this.activePatientId();
        if (patientId) this.workspace.load(patientId);
      },
      error: (response: { error?: { error?: string } }) => {
        this.workflowActionLoading.set(false);
        this.workflowActionMessage.set(response?.error?.error || 'No se pudo registrar la interrupción.');
      }
    });
  }
  hasPendingInterruption(workflow: JsonObject): boolean { return Boolean(this.object(workflow['administrationData'])['interruptionPending']); }
  resolveAdministration(decision: 'resume' | 'terminate'): void {
    const workflow = this.selectedWorkflow();
    if (!workflow || this.workflowActionLoading()) return;
    if (this.resolutionNotes().trim().length < 3 || this.resolutionPatientCondition().trim().length < 3) {
      this.workflowActionMessage.set('Documente la decisión clínica y la condición actual del paciente.');
      return;
    }
    if (decision === 'terminate' && this.resolutionActualDose().trim().length < 2) {
      this.workflowActionMessage.set('Para cerrar registre la dosis total administrada.');
      return;
    }
    const body = {
      expectedRevision: this.number(this.pick(workflow, 'revision'), 0),
      idempotencyKey: `administration-${decision}-${Date.now()}-${crypto.randomUUID()}`,
      resolvedAt: new Date().toISOString(), decision,
      notes: this.resolutionNotes().trim(),
      actualDose: this.resolutionActualDose().trim(),
      patientCondition: this.resolutionPatientCondition().trim()
    };
    this.workflowActionLoading.set(true); this.workflowActionMessage.set('');
    this.http.post<{ workflow?: JsonObject }>(`${this.workflowUrl(workflow)}/administration/resolve`, body, { withCredentials: true }).subscribe({
      next: (response) => {
        const updated = this.object(response.workflow);
        this.selectedWorkflow.set(updated);
        this.populateAdministration(updated);
        this.workflowActionLoading.set(false);
        this.workflowActionMessage.set(decision === 'resume' ? 'Administración reanudada bajo decisión clínica.' : 'Administración cerrada sin completar.');
        this.loadQueue();
        const patientId = this.activePatientId();
        if (patientId) this.workspace.load(patientId);
      },
      error: (response: { error?: { error?: string } }) => {
        this.workflowActionLoading.set(false);
        this.workflowActionMessage.set(response?.error?.error || 'No se pudo resolver la interrupción.');
      }
    });
  }
  completeAdministration(): void {
    const workflow = this.selectedWorkflow();
    if (!workflow || this.workflowActionLoading()) return;
    if (this.completionActualDose().trim().length < 2 || this.completionObservation().trim().length < 3) {
      this.workflowActionMessage.set('Registre la dosis efectivamente administrada y la condición final del paciente.');
      return;
    }
    if (this.completionReactionOccurred() && this.completionReactionDescription().trim().length < 3) {
      this.workflowActionMessage.set('Describa la reacción y las medidas adoptadas.');
      return;
    }
    const body = {
      expectedRevision: this.number(this.pick(workflow, 'revision'), 0),
      idempotencyKey: `administration-complete-${Date.now()}-${crypto.randomUUID()}`,
      completedAt: new Date().toISOString(),
      actualDose: this.completionActualDose().trim(),
      reactionOccurred: this.completionReactionOccurred(),
      reactionDescription: this.completionReactionDescription().trim(),
      observation: this.completionObservation().trim()
    };
    this.workflowActionLoading.set(true); this.workflowActionMessage.set('');
    this.http.post<{ workflow?: JsonObject }>(`${this.workflowUrl(workflow)}/administration/complete`, body, { withCredentials: true }).subscribe({
      next: (response) => {
        const updated = this.object(response.workflow);
        this.selectedWorkflow.set(updated);
        this.populateAdministration(updated);
        this.workflowActionLoading.set(false);
        this.workflowActionMessage.set('Aplicación completada y documentada en la historia clínica.');
        this.loadQueue();
        const patientId = this.activePatientId();
        if (patientId) this.workspace.load(patientId);
      },
      error: (response: { error?: { error?: string } }) => {
        this.workflowActionLoading.set(false);
        this.workflowActionMessage.set(response?.error?.error || 'No se pudo cerrar la administración.');
      }
    });
  }
  workflowAppointment(workflow: JsonObject): JsonObject { return this.object(workflow['appointment']); }
  workflowDrugs(workflow: JsonObject): JsonObject[] { return this.array(workflow['applicationDrugs']); }
  workflowReservations(workflow: JsonObject): JsonObject[] { return this.array(workflow['stockReservations']); }
  workflowAudit(workflow: JsonObject): JsonObject[] { return this.array(workflow['auditTrail']); }
  workflowField(workflow: JsonObject, ...keys: string[]): string { return this.pick(workflow, ...keys); }

  private workflowUrl(workflow: JsonObject): string {
    return `/api/clinical/application-workflows/${encodeURIComponent(this.pick(workflow, 'patientId'))}/${encodeURIComponent(this.pick(workflow, 'treatmentId'))}/${this.number(this.pick(workflow, 'cycleNumber'), 0)}/${this.number(this.pick(workflow, 'applicationDay'), 0)}`;
  }

  private populateTriage(workflow: JsonObject): void {
    const assessment = this.object(workflow['clinicalAssessment']);
    const laboratory = this.object(assessment['laboratory']);
    const vitalSigns = this.object(assessment['vitalSigns']);
    const toxicity = this.object(assessment['toxicity']);
    this.triageLaboratoryDate.set(this.pick(laboratory, 'date', 'sampleDate'));
    this.triageNeutrophils.set(this.pick(laboratory, 'neutrophils'));
    this.triagePlatelets.set(this.pick(laboratory, 'platelets'));
    this.triageCreatinine.set(this.pick(laboratory, 'creatinine'));
    this.triageWeight.set(this.pick(vitalSigns, 'weightKg'));
    this.triageTemperature.set(this.pick(vitalSigns, 'temperatureC'));
    this.triageBloodPressure.set(this.pick(vitalSigns, 'bloodPressure'));
    this.triageOxygen.set(this.pick(vitalSigns, 'oxygenSaturation'));
    this.triageToxicityGrade.set(this.pick(toxicity, 'grade') || '0');
    this.triageToxicityNotes.set(this.pick(toxicity, 'notes'));
    this.triageReason.set(this.pick(assessment, 'reason') || this.pick(workflow, 'clinicalAuthorizationReason'));
    this.triageRescheduledDate.set(this.pick(assessment, 'rescheduledDate'));
  }

  private populatePreparation(workflow: JsonObject): void {
    const reservations = this.workflowReservations(workflow);
    const data = this.object(workflow['preparationData']);
    const existing = this.array(data['preparations']);
    this.preparationNotes.set(this.pick(data, 'notes'));
    this.preparationVerifiedBy.set(this.pick(workflow, 'preparationVerifiedByUserId'));
    this.preparationDrafts.set(this.workflowDrugs(workflow).map((drug, index) => {
      const name = this.pick(drug, 'drugName', 'name', 'nombre');
      const componentKey = this.pick(drug, 'sourceItemRef', 'componentKey');
      const current = existing.find((item) => (componentKey && this.pick(item, 'componentKey') === componentKey) || this.pick(item, 'drugName').toLocaleLowerCase('es-AR') === name.toLocaleLowerCase('es-AR')) || {};
      const reservation = reservations.find((item) => (componentKey && this.pick(item, 'componentKey') === componentKey) || this.pick(item, 'drugName').toLocaleLowerCase('es-AR') === name.toLocaleLowerCase('es-AR')) || {};
      const quantityText = this.pick(drug, 'calculatedDoseText', 'prescribedDoseText', 'totalDoseText', 'calculatedDose', 'dose', 'dosis');
      return {
        componentKey, drugId: this.pick(drug, 'drugId', 'idDroga', 'id'), drugName: name || `Droga ${index + 1}`,
        lot: this.pick(current, 'lot'), expiryDate: this.pick(current, 'expiryDate'),
        quantity: this.pick(current, 'quantity') || this.pick(reservation, 'requestedQuantity') || this.firstNumber(quantityText),
        quantityText: this.pick(current, 'quantityText') || this.pick(reservation, 'requestedQuantityText') || quantityText,
        unit: this.pick(current, 'unit') || this.pick(reservation, 'unit') || this.pick(drug, 'doseUnit', 'unidadDosis', 'unidad'),
        diluent: this.pick(current, 'diluent'), finalVolume: this.pick(current, 'finalVolume'),
        concentration: this.pick(current, 'concentration'), ttlMinutes: this.pick(current, 'ttlMinutes') || '240',
        reservationId: this.pick(reservation, 'id'), inventoryLotId: this.pick(reservation, 'inventoryLotId')
      };
    }));
  }

  private loadPreparationUsers(): void {
    this.http.get<{ items?: JsonObject[] }>('/api/clinical/users', {
      params: new HttpParams().set('capability', 'application.preparation.manage'), withCredentials: true
    }).subscribe({ next: (response) => this.preparationUsers.set(this.array(response.items)), error: () => this.preparationUsers.set([]) });
  }

  private populateAdministration(workflow: JsonObject): void {
    const data = this.object(workflow['administrationData']);
    this.administrationDoubleCheckBy.set(this.pick(data, 'doubleCheckByUserId', 'doubleCheckBy'));
    this.administrationPatientVerified.set(Boolean(data['patientVerified']));
    this.administrationLabelVerified.set(Boolean(data['labelVerified']));
    this.administrationNotes.set(this.pick(data, 'notes'));
    this.interruptionReason.set(this.pick(data, 'interruptionReason'));
    this.interruptionActualDose.set(this.pick(data, 'actualDoseAtInterruption'));
    this.interruptionMeasures.set(this.pick(data, 'interruptionMeasures'));
    this.interruptionPatientCondition.set(this.pick(data, 'interruptionPatientCondition'));
    this.interruptionDisposition.set(this.pick(data, 'interruptionDisposition') || 'observation');
    this.resolutionNotes.set(this.pick(data, 'interruptionResolutionNotes'));
    this.resolutionActualDose.set(this.pick(data, 'actualDose'));
    this.resolutionPatientCondition.set(this.pick(data, 'interruptionResolutionPatientCondition') || this.pick(data, 'interruptionPatientCondition'));
    this.completionActualDose.set(this.pick(data, 'actualDose'));
    this.completionReactionOccurred.set(Boolean(data['reactionOccurred']));
    this.completionReactionDescription.set(this.pick(data, 'reactionDescription'));
    this.completionObservation.set(this.pick(data, 'observation'));
  }

  private loadAdministrationUsers(): void {
    this.http.get<{ items?: JsonObject[] }>('/api/clinical/users', {
      params: new HttpParams().set('capability', 'application.administration.manage'), withCredentials: true
    }).subscribe({ next: (response) => this.administrationUsers.set(this.array(response.items)), error: () => this.administrationUsers.set([]) });
  }

  private firstNumber(value: string): string {
    const match = value.replace(',', '.').match(/-?\d+(?:\.\d+)?/);
    return match?.[0] || '';
  }

  private numeric(value: string): number | null {
    const normalized = value.trim().replace(',', '.');
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private compactObject(source: Record<string, unknown>, preserveEmpty: boolean): JsonObject {
    const result: JsonObject = {};
    for (const [key, value] of Object.entries(source)) {
      if (value !== null && value !== undefined && String(value).trim()) result[key] = value;
    }
    if (!Object.keys(result).length && preserveEmpty) result['notAvailable'] = true;
    return result;
  }

  private loadPatientCare(patientId: string): void {
    this.loading.set(true); this.error.set('');
    this.http.get<TreatmentListResponse>(`/api/clinical/patients/${encodeURIComponent(patientId)}/treatments`, { withCredentials: true }).subscribe({
      next: (response) => {
        if (this.activePatientId() !== patientId) return;
        this.treatments.set(this.array(response.treatments).length ? this.array(response.treatments) : this.array(response.oncology));
        this.loadInfusions(patientId);
      },
      error: (response: { error?: { error?: string } }) => {
        if (this.activePatientId() !== patientId) return;
        this.loading.set(false); this.error.set(response?.error?.error || 'No se pudieron cargar los tratamientos.');
      }
    });
  }

  private resetTreatmentForm(): void {
    this.treatmentDiagnosisId.set(''); this.treatmentSchemeId.set(''); this.treatmentRequirements.set({});
    this.treatmentType.set('Quimioterapia'); this.treatmentIntent.set('Paliativo');
    this.treatmentCycles.set('1'); this.treatmentInitialCycle.set('1'); this.treatmentCycleDays.set('');
    const today = new Date().toISOString().slice(0, 10);
    this.treatmentCreatedDate.set(today); this.treatmentFirstCycleDate.set(today); this.treatmentConsent.set('Pendiente');
    this.treatmentWeight.set(''); this.treatmentHeight.set(''); this.treatmentCreatinine.set(''); this.treatmentGfr.set('');
    this.treatmentTargetAuc.set(''); this.treatmentCalcium.set(''); this.treatmentAlbumin.set(''); this.treatmentNotes.set('');
    this.treatmentRequirementsConfirmed.set(false); this.treatmentMismatchConfirmed.set(false); this.treatmentMismatchReason.set('');
  }

  private loadInfusions(patientId: string): void {
    this.http.get<InfusionListResponse>('/api/clinical/infusions', {
      params: new HttpParams().set('patientId', patientId), withCredentials: true
    }).subscribe({
      next: (response) => {
        if (this.activePatientId() !== patientId) return;
        this.infusions.set(this.array(response.infusions)); this.loading.set(false);
      },
      error: (response: { error?: { error?: string } }) => {
        if (this.activePatientId() !== patientId) return;
        this.loading.set(false); this.error.set(response?.error?.error || 'Se cargaron los tratamientos, pero no los turnos.');
      }
    });
  }

  private loadDetail(id: string): void {
    const patientId = this.activePatientId();
    if (!patientId) return;
    this.http.get<TreatmentDetailResponse>(`/api/clinical/patients/${encodeURIComponent(patientId)}/treatments/${encodeURIComponent(id)}/detail`, { withCredentials: true }).subscribe({
      next: (response) => {
        if (this.activePatientId() !== patientId) return;
        const detail = this.object(response.detail);
        this.details.update((current) => ({ ...current, [id]: detail }));
      },
      error: (response: { error?: { error?: string } }) => this.error.set(response?.error?.error || 'No se pudo abrir el detalle del tratamiento.')
    });
  }

  loadQueue(): void {
    const selected = this.view();
    if (!['applications', 'pharmacy', 'triage', 'preparation', 'administration'].includes(selected)) return;
    const queue = selected === 'applications' ? 'administration' : selected;
    this.queueLoading.set(true); this.error.set('');
    let params = new HttpParams().set('queue', queue).set('q', this.query().trim());
    if (this.date()) params = params.set('date', this.date());
    this.http.get<WorkflowListResponse>('/api/clinical/application-workflows', { params, withCredentials: true }).subscribe({
      next: (response) => { this.queueItems.set(this.array(response.items)); this.queueLoading.set(false); },
      error: (response: { error?: { error?: string } }) => { this.queueLoading.set(false); this.error.set(response?.error?.error || 'No se pudo cargar la cola operativa.'); }
    });
  }

  private filteredCards(): CareCard[] {
    const query = this.query().trim().toLocaleLowerCase('es-AR');
    const date = this.date();
    const status = this.status().trim().toLowerCase();
    return this.treatments().map((treatment) => this.card(treatment)).filter((card) => {
      const searchable = [card.scheme, card.diagnosis, card.type, card.oncologist, card.status].join(' ').toLocaleLowerCase('es-AR');
      const matchQuery = !query || searchable.includes(query);
      const matchStatus = !status || card.status.toLocaleLowerCase().includes(status) || card.cycles.some((cycle) => cycle.state === status);
      const matchDate = !date || card.cycles.some((cycle) => cycle.plannedDate === date || cycle.days.some((day) => this.pick(day, 'plannedDate', 'date').slice(0, 10) === date));
      return matchQuery && matchStatus && matchDate;
    });
  }

  private card(treatment: JsonObject): CareCard {
    const id = this.pick(treatment, 'id', 'treatmentId');
    const detail = this.object(this.details()[id]);
    const rawCycles = this.array(detail['cycles']);
    const cycleCount = this.number(this.pick(treatment, 'cycleCount', 'cycles', 'cantidadCiclos'), rawCycles.length || 0);
    const cycles = rawCycles.length ? rawCycles.map((cycle, index) => this.toCycle(cycle, index + 1)) : this.syntheticCycles(treatment, cycleCount);
    const completedCycles = cycles.filter((cycle) => cycle.state === 'completed').length;
    const firstDate = cycles[0]?.plannedDate || this.pick(treatment, 'firstCycleDate', 'fechaPrimerCiclo');
    const lastDate = cycles.at(-1)?.plannedDate || this.projectedDate(firstDate, this.number(this.pick(treatment, 'cycleDays', 'duracionCiclo'), 0), Math.max(cycleCount - 1, 0));
    const minutes = this.number(this.pick(treatment, 'estimatedDurationMinutes', 'durationMinutes'), 0);
    return {
      treatment, id,
      scheme: this.pick(treatment, 'scheme', 'esquema') || 'Tratamiento sin esquema',
      diagnosis: this.pick(treatment, 'diagnosis', 'diagnostico') || 'Diagnóstico no informado',
      type: this.pick(treatment, 'type', 'tipo') || 'Tratamiento oncológico',
      oncologist: this.pick(treatment, 'oncologist', 'oncologo') || 'Sin oncólogo informado',
      status: this.pick(treatment, 'status', 'estadoTratamiento') || 'Registrado',
      cycleCount, completedCycles,
      duration: this.pick(treatment, 'estimatedDurationText') || this.durationLabel(minutes),
      firstDate, lastDate, cycles
    };
  }

  private toCycle(value: JsonObject, fallback: number): CareCycle {
    const state = this.normalizeCycleState(this.pick(value, 'state', 'status'));
    return {
      number: this.number(this.pick(value, 'number', 'cycleNumber'), fallback), state,
      plannedDate: this.pick(value, 'plannedDate', 'date'),
      days: this.array(value['days']), homeMedications: this.array(value['homeMedications'])
    };
  }

  private syntheticCycles(treatment: JsonObject, count: number): CareCycle[] {
    const first = this.pick(treatment, 'firstCycleDate', 'fechaPrimerCiclo');
    const days = this.number(this.pick(treatment, 'cycleDays', 'duracionCiclo'), 0);
    return Array.from({ length: count }, (_, index) => ({
      number: index + 1, state: 'pending' as CycleState,
      plannedDate: this.projectedDate(first, days, index), days: [], homeMedications: []
    }));
  }

  private normalizeCycleState(value: string): CycleState {
    const state = value.toLowerCase();
    return ['completed', 'current', 'partial', 'scheduled', 'pending', 'paused', 'cancelled'].includes(state)
      ? state as CycleState : 'pending';
  }

  private projectedDate(date: string, days: number, cycles: number): string {
    if (!date || !days || !cycles) return date || '';
    const parsed = new Date(`${date.slice(0, 10)}T12:00:00`);
    if (Number.isNaN(parsed.getTime())) return date;
    parsed.setDate(parsed.getDate() + (days * cycles));
    return parsed.toISOString().slice(0, 10);
  }

  private durationLabel(minutes: number): string {
    if (!minutes) return 'No estimada';
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60); const remainder = minutes % 60;
    return remainder ? `${hours} h ${remainder} min` : `${hours} h`;
  }

  private formatDate(value: string, withTime: boolean): string {
    if (!value) return 'No informada';
    const normalized = value.length === 10 ? `${value}T12:00:00` : value;
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('es-AR', withTime ? { dateStyle: 'short', timeStyle: 'short' } : { dateStyle: 'short' }).format(date);
  }
  private pick(source: JsonObject, ...keys: string[]): string { for (const key of keys) { const value = source[key]; if (value !== undefined && value !== null && String(value).trim()) return String(value).trim(); } return ''; }
  private number(value: string, fallback: number): number { const result = Number(value); return Number.isFinite(result) && result >= 0 ? result : fallback; }
  private object(value: unknown): JsonObject { return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {}; }
  private array(value: unknown): JsonObject[] { return Array.isArray(value) ? value.filter((item): item is JsonObject => item !== null && typeof item === 'object' && !Array.isArray(item)) : []; }
  private string(value: unknown): string { return value === undefined || value === null ? '' : String(value); }
}
