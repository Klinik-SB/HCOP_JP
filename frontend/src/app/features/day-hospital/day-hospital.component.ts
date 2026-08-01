import { HttpClient, HttpParams } from '@angular/common/http';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
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
  styleUrl: './day-hospital.component.scss'
})
export class DayHospitalComponent {
  readonly workspace = inject(PatientWorkspaceService);
  private readonly http = inject(HttpClient);

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
  readonly loading = signal(false);
  readonly error = signal('');

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

  selectView(view: CareView): void {
    this.view.set(view);
    if (view !== 'treatments') this.loadQueue();
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
  workflowAppointment(workflow: JsonObject): JsonObject { return this.object(workflow['appointment']); }
  workflowDrugs(workflow: JsonObject): JsonObject[] { return this.array(workflow['applicationDrugs']); }
  workflowReservations(workflow: JsonObject): JsonObject[] { return this.array(workflow['stockReservations']); }
  workflowAudit(workflow: JsonObject): JsonObject[] { return this.array(workflow['auditTrail']); }
  workflowField(workflow: JsonObject, ...keys: string[]): string { return this.pick(workflow, ...keys); }

  private workflowUrl(workflow: JsonObject): string {
    return `/api/clinical/application-workflows/${encodeURIComponent(this.pick(workflow, 'patientId'))}/${encodeURIComponent(this.pick(workflow, 'treatmentId'))}/${this.number(this.pick(workflow, 'cycleNumber'), 0)}/${this.number(this.pick(workflow, 'applicationDay'), 0)}`;
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
