import { CommonModule } from '@angular/common';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Component, OnChanges, SimpleChanges, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

type JsonObject = Record<string, unknown>;
interface ScheduleSettings { chairCount: number; slotMinutes: number; startTime: string; endTime: string; }
interface ScheduleSlot { row: number; minutes: number; label: string; }
interface ScheduleDrag { type: 'candidate' | 'infusion'; item: JsonObject; }
interface SchedulePlacement { chair: number; slotIndex: number; span: number; valid: boolean; time: string; }

@Component({ selector: 'app-care-scheduler', imports: [CommonModule, FormsModule], templateUrl: './care-scheduler.component.html', styleUrl: './care-scheduler.component.scss' })
export class CareSchedulerComponent implements OnChanges {
  readonly open = input(false);
  readonly closed = output<void>();
  private readonly http = inject(HttpClient);
  private requestVersion = 0;
  readonly date = signal(this.localDate());
  readonly loading = signal(false);
  readonly error = signal('');
  readonly candidates = signal<JsonObject[]>([]);
  readonly infusions = signal<JsonObject[]>([]);
  readonly settings = signal<ScheduleSettings>({ chairCount: 6, slotMinutes: 10, startTime: '08:00', endTime: '16:00' });
  readonly search = signal('');
  readonly filter = signal('prescribed');
  readonly selectedCandidateId = signal('');
  readonly drag = signal<ScheduleDrag | null>(null);
  readonly dropTarget = signal<SchedulePlacement | null>(null);
  readonly busy = signal(false);
  readonly actionMessage = signal('');
  readonly detailOpen = signal(false);
  readonly detailLoading = signal(false);
  readonly detailItem = signal<JsonObject | null>(null);
  readonly detailWorkflow = signal<JsonObject>({});
  readonly detailMessage = signal('');
  readonly removalRequested = signal(false);
  readonly removalReason = signal('Turno retirado de la agenda');
  readonly chairOffset = signal(0);
  readonly visibleChairCount = signal(6);
  readonly visibleChairs = computed(() => {
    const total = this.settings().chairCount;
    const count = Math.min(this.visibleChairCount(), total);
    const start = Math.min(this.chairOffset(), Math.max(0, total - count));
    return Array.from({ length: count }, (_, index) => start + index + 1);
  });
  readonly slots = computed<ScheduleSlot[]>(() => {
    const settings = this.settings();
    const start = this.clockMinutes(settings.startTime);
    const count = Math.max(0, Math.ceil((this.clockMinutes(settings.endTime) - start) / settings.slotMinutes));
    return Array.from({ length: count }, (_, index) => ({ row: index + 2, minutes: start + index * settings.slotMinutes, label: this.clockLabel(start + index * settings.slotMinutes) }));
  });
  readonly filteredCandidates = computed(() => {
    const query = this.normalize(this.search());
    const filter = this.filter();
    return this.candidates().filter(item => {
      if (filter === 'prescription-confirmed' && !this.flag(item, 'prescriptionConfirmed')) return false;
      if (filter === 'missing-prescription' && this.flag(item, 'prescriptionConfirmed')) return false;
      if (filter === 'missing-medication' && this.medicationAvailable(item)) return false;
      if (filter === 'medication-received' && !this.flag(item, 'medicationReceived')) return false;
      if (filter === 'medication-with-patient' && !this.flag(item, 'medicationWithPatient')) return false;
      return !query || this.searchText(item).includes(query);
    }).sort((left, right) => String(left['suggestedDate'] || '').localeCompare(String(right['suggestedDate'] || '')));
  });
  readonly visibleInfusions = computed(() => {
    const chairs = new Set(this.visibleChairs().map(String));
    const query = this.normalize(this.search());
    return this.infusions().filter(item => chairs.has(String(item['chair'] || '').replace(/\D/g, '')) && (!query || this.searchText(item).includes(query)));
  });
  readonly weekday = computed(() => new Intl.DateTimeFormat('es-AR', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${this.date()}T12:00:00Z`)).replace(/^./, value => value.toUpperCase()));
  readonly chairRange = computed(() => { const chairs = this.visibleChairs(); return chairs.length ? `Sillones ${chairs[0]}–${chairs[chairs.length - 1]}` : 'Sin sillones configurados'; });
  readonly selectedCandidate = computed(() => this.candidates().find(item => this.itemId(item) === this.selectedCandidateId()) || null);

  ngOnChanges(changes: SimpleChanges): void { if (changes['open']?.currentValue) this.refresh(); }
  close(): void { this.closed.emit(); }
  refresh(): void {
    const requestVersion = ++this.requestVersion;
    this.loading.set(true); this.error.set('');
    let completed = 0;
    const finish = (): void => { if (requestVersion !== this.requestVersion) return; completed += 1; if (completed === 3) this.loading.set(false); };
    this.http.get<{ items?: JsonObject[] }>('/api/clinical/configuration/day-hospital-settings', { withCredentials: true }).subscribe({ next: response => { if (requestVersion === this.requestVersion) this.applySettings(response.items?.[0]); finish(); }, error: () => { if (requestVersion === this.requestVersion) this.applySettings(undefined); finish(); } });
    this.http.get<{ infusions?: JsonObject[] }>('/api/clinical/infusions', { params: new HttpParams().set('date', this.date()), withCredentials: true }).subscribe({ next: response => { if (requestVersion === this.requestVersion) this.infusions.set(response.infusions || []); finish(); }, error: response => { if (requestVersion === this.requestVersion) this.error.set(response?.error?.error || 'No se pudo abrir la agenda.'); finish(); } });
    this.http.get<{ candidates?: JsonObject[] }>('/api/clinical/infusion-candidates', { params: new HttpParams().set('includeScheduled', 'false').set('onlySchedulingEligible', 'false'), withCredentials: true }).subscribe({ next: response => { if (requestVersion === this.requestVersion) this.candidates.set(response.candidates || []); finish(); }, error: response => { if (requestVersion === this.requestVersion) this.error.set(response?.error?.error || 'No se pudo abrir la lista de espera.'); finish(); } });
  }
  changeDate(value: string): void { if (/^\d{4}-\d{2}-\d{2}$/.test(value)) { this.date.set(value); this.refresh(); } }
  shiftDate(days: number): void { const next = new Date(`${this.date()}T12:00:00Z`); next.setUTCDate(next.getUTCDate() + days); this.date.set(next.toISOString().slice(0, 10)); this.refresh(); }
  today(): void { this.date.set(this.localDate()); this.refresh(); }
  shiftChairs(direction: number): void { const step = Math.max(1, this.visibleChairCount() - 1); const maximum = Math.max(0, this.settings().chairCount - this.visibleChairCount()); this.chairOffset.set(Math.max(0, Math.min(maximum, this.chairOffset() + direction * step))); }
  zoom(direction: number): void { const total = this.settings().chairCount; this.visibleChairCount.set(Math.max(1, Math.min(total, this.visibleChairCount() + direction))); this.chairOffset.set(Math.min(this.chairOffset(), Math.max(0, total - this.visibleChairCount()))); }
  selectCandidate(item: JsonObject): void {
    const reason = this.blockedReason(item);
    if (reason) { this.actionMessage.set(reason); this.selectedCandidateId.set(''); return; }
    const id = this.itemId(item);
    this.selectedCandidateId.set(this.selectedCandidateId() === id ? '' : id);
    this.actionMessage.set(this.selectedCandidateId() ? `${item['patientName'] || 'Paciente'} · ${this.durationLabel(item)} · lugares disponibles en celeste` : '');
  }
  beginCandidateDrag(event: DragEvent, item: JsonObject): void {
    const reason = this.blockedReason(item);
    if (reason || this.busy()) { event.preventDefault(); this.actionMessage.set(reason || 'La agenda está guardando otro cambio.'); return; }
    this.drag.set({ type: 'candidate', item }); this.selectedCandidateId.set(this.itemId(item)); this.dropTarget.set(null);
    if (event.dataTransfer) { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', this.itemId(item)); }
  }
  beginInfusionDrag(event: DragEvent, item: JsonObject): void {
    if (this.busy()) { event.preventDefault(); return; }
    this.drag.set({ type: 'infusion', item }); this.dropTarget.set(null);
    if (event.dataTransfer) { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', this.itemId(item)); }
  }
  dragOver(event: DragEvent, slot: ScheduleSlot, chair: number): void {
    const drag = this.drag(); if (!drag) return;
    event.preventDefault();
    const target = this.placement(drag.item, drag.type, chair, slot.row - 2);
    this.dropTarget.set(target);
    if (event.dataTransfer) event.dataTransfer.dropEffect = target.valid ? 'move' : 'none';
  }
  clearDrag(): void { this.drag.set(null); this.dropTarget.set(null); }
  drop(event: DragEvent): void {
    event.preventDefault();
    const drag = this.drag(); const target = this.dropTarget();
    this.clearDrag();
    if (!drag || !target?.valid || this.busy()) return;
    const previousInfusions = this.infusions(); const previousCandidates = this.candidates();
    const scheduledAt = `${this.date()}T${target.time}:00-03:00`;
    const durationMinutes = this.duration(drag.item);
    this.busy.set(true); this.actionMessage.set('Guardando turno...');
    if (drag.type === 'candidate') {
      const optimistic: JsonObject = { ...drag.item, id: `optimistic:${Date.now()}`, scheduledAt, chair: String(target.chair), durationMinutes, clinicalStatus: 'planned', appointmentConfirmed: false, optimistic: true };
      this.candidates.set(previousCandidates.filter(item => this.itemId(item) !== this.itemId(drag.item)));
      this.infusions.set([...previousInfusions, optimistic]);
      const body = {
        patientId: drag.item['patientId'], treatmentId: drag.item['treatmentId'], cycleNumber: drag.item['cycleNumber'],
        applicationDay: Number(drag.item['applicationDay'] || 1), scheduledAt, chair: String(target.chair), durationMinutes,
        clinicalStatus: 'planned', pharmacyStatus: 'pending', administrationStatus: 'not_started', appointmentConfirmed: false,
        notes: 'Turno asignado desde el turnero Angular por sillón', medications: drag.item['applicationDrugs'] || drag.item['medications'] || [],
        sourceRef: { scheduler: { scheme: drag.item['scheme'] || '', drugScheme: drag.item['drugScheme'] || drag.item['scheme'] || '', applicationDay: Number(drag.item['applicationDay'] || 1), durationSource: drag.item['durationSource'] || '', timeBasis: 'local-wall-clock-v2', prescriptionConfirmed: this.flag(drag.item, 'prescriptionConfirmed'), medicationReceived: this.flag(drag.item, 'medicationReceived'), medicationWithPatient: this.flag(drag.item, 'medicationWithPatient'), appointmentConfirmed: false } }
      };
      this.http.post('/api/clinical/infusions', body, { withCredentials: true }).subscribe({
        next: () => this.completePlacement('Turno asignado.'),
        error: response => this.rollbackPlacement(previousInfusions, previousCandidates, response)
      });
    } else {
      this.infusions.set(previousInfusions.map(item => this.itemId(item) === this.itemId(drag.item) ? { ...item, scheduledAt, chair: String(target.chair), durationMinutes, optimistic: true } : item));
      this.http.patch(`/api/clinical/infusions/${encodeURIComponent(this.itemId(drag.item))}`, { expectedVersion: drag.item['revision'] || drag.item['version'], scheduledAt, chair: String(target.chair), durationMinutes }, { withCredentials: true }).subscribe({
        next: () => this.completePlacement('Turno reprogramado.'),
        error: response => this.rollbackPlacement(previousInfusions, previousCandidates, response)
      });
    }
  }
  slotClass(slot: ScheduleSlot, chair: number): string {
    const index = slot.row - 2; const target = this.dropTarget();
    if (target && target.chair === chair && index >= target.slotIndex && index < target.slotIndex + target.span) return target.valid ? 'is-drag-target' : 'is-drag-invalid';
    const candidate = this.selectedCandidate();
    return candidate && this.placement(candidate, 'candidate', chair, index).valid ? 'is-candidate-fit' : '';
  }
  candidateSelected(item: JsonObject): boolean { return this.itemId(item) === this.selectedCandidateId(); }
  candidateDisabled(item: JsonObject): boolean { return Boolean(this.blockedReason(item)); }
  openDetail(item: JsonObject, remove = false): void {
    this.detailOpen.set(true); this.detailItem.set(item); this.detailWorkflow.set({});
    this.detailMessage.set(''); this.removalRequested.set(remove); this.removalReason.set('Turno retirado de la agenda');
    this.detailLoading.set(true);
    const path = `/api/clinical/application-workflows/${encodeURIComponent(String(item['patientId'] || ''))}/${encodeURIComponent(String(item['treatmentId'] || ''))}/${Number(item['cycleNumber'] || 1)}/${Number(item['applicationDay'] || 1)}`;
    this.http.get<{ workflow?: JsonObject }>(path, { withCredentials: true }).subscribe({
      next: response => { this.detailWorkflow.set(response.workflow || {}); this.detailLoading.set(false); },
      error: response => { this.detailLoading.set(false); this.detailMessage.set(response?.error?.error || 'Se muestran los datos disponibles del turno.'); }
    });
  }
  closeDetail(): void { if (!this.busy()) { this.detailOpen.set(false); this.detailItem.set(null); this.removalRequested.set(false); } }
  confirmAppointment(): void {
    const item = this.detailItem(); if (!item || this.busy()) return;
    this.busy.set(true); this.detailMessage.set('Confirmando turno...');
    this.http.patch<{ infusion?: JsonObject }>(`/api/clinical/infusions/${encodeURIComponent(this.itemId(item))}`, { expectedVersion: item['revision'] || item['version'], appointmentConfirmed: true }, { withCredentials: true }).subscribe({
      next: response => {
        const updated = { ...item, ...(response.infusion || {}), appointmentConfirmed: true };
        this.infusions.update(rows => rows.map(row => this.itemId(row) === this.itemId(item) ? updated : row));
        this.detailItem.set(updated); this.busy.set(false); this.detailMessage.set('Turno confirmado.'); this.loadDetailWorkflow(updated);
      },
      error: response => { this.busy.set(false); this.detailMessage.set(response?.error?.error || 'No se pudo confirmar el turno.'); this.refresh(); }
    });
  }
  removeAppointment(): void {
    const item = this.detailItem(); const reason = this.removalReason().trim();
    if (!item || this.busy()) return;
    if (!reason) { this.detailMessage.set('Indique por qué se quita el turno.'); return; }
    this.busy.set(true); this.detailMessage.set('Quitando turno...');
    this.http.patch(`/api/clinical/infusions/${encodeURIComponent(this.itemId(item))}`, { expectedVersion: item['revision'] || item['version'], scheduledAt: null, chair: null, clinicalStatus: 'cancelled', reason }, { withCredentials: true }).subscribe({
      next: () => { this.busy.set(false); this.detailOpen.set(false); this.detailItem.set(null); this.removalRequested.set(false); this.actionMessage.set('Turno quitado; la aplicación volvió a la lista de espera.'); this.refresh(); },
      error: response => { this.busy.set(false); this.detailMessage.set(response?.error?.error || 'No se pudo quitar el turno.'); this.refresh(); }
    });
  }
  currentDetail(): JsonObject { return this.detailItem() || {}; }
  detailAppointment(): JsonObject { const appointment = this.detailWorkflow()['appointment']; return appointment && typeof appointment === 'object' ? appointment as JsonObject : this.currentDetail(); }
  detailDrugs(): JsonObject[] { const drugs = this.detailWorkflow()['applicationDrugs'] || this.currentDetail()['medications']; return Array.isArray(drugs) ? drugs as JsonObject[] : []; }
  detailDrugLabel(item: JsonObject): string { return [item['drugName'] || item['name'] || item['nombre'], item['prescribedDoseText'] || item['dose'] || item['dosis'], item['route'] || item['via']].filter(Boolean).join(' · '); }
  candidateDate(item: JsonObject): string { return this.dateLabel(String(item['suggestedDate'] || '')); }
  candidateDays(item: JsonObject): string { const value = String(item['suggestedDate'] || ''); if (!value) return 'Sin fecha'; const difference = Math.ceil((new Date(`${value}T12:00:00Z`).getTime() - new Date(`${this.localDate()}T12:00:00Z`).getTime()) / 86400000); return difference <= 0 ? (difference === 0 ? 'Hoy' : `${Math.abs(difference)} d. vencido`) : `${difference} d.`; }
  candidateNear(item: JsonObject): boolean { const value = String(item['suggestedDate'] || ''); return Boolean(value) && (new Date(`${value}T12:00:00Z`).getTime() - new Date(`${this.localDate()}T12:00:00Z`).getTime()) / 86400000 < 5; }
  medicationLabel(item: JsonObject): string { if (this.flag(item, 'medicationReceived')) return 'Medicación recibida'; if (this.flag(item, 'medicationWithPatient')) return 'La tiene el paciente'; return 'Falta medicación'; }
  prescriptionLabel(item: JsonObject): string { return this.flag(item, 'prescriptionConfirmed') ? 'Prescripción confirmada' : 'Falta prescripción'; }
  infusionStyle(item: JsonObject): Record<string, string> {
    const scheduled = new Date(String(item['scheduledAt'] || '')); const settings = this.settings(); const start = this.clockMinutes(settings.startTime);
    const minutes = scheduled.getHours() * 60 + scheduled.getMinutes(); const row = Math.max(2, Math.floor((minutes - start) / settings.slotMinutes) + 2);
    const rows = Math.max(1, Math.ceil(Number(item['durationMinutes'] || settings.slotMinutes) / settings.slotMinutes));
    const column = this.visibleChairs().indexOf(Number(String(item['chair'] || '').replace(/\D/g, ''))) + 2;
    return { 'grid-row': `${row} / span ${rows}`, 'grid-column': String(column) };
  }
  infusionRange(item: JsonObject): string { const start = new Date(String(item['scheduledAt'] || '')); if (Number.isNaN(start.getTime())) return ''; const end = new Date(start.getTime() + Number(item['durationMinutes'] || 0) * 60000); return `${this.timeLabel(start)} a ${this.timeLabel(end)}`; }
  infusionClass(item: JsonObject): string { return this.flag(item, 'appointmentConfirmed') ? 'is-confirmed' : 'is-pending'; }
  trackSlot(_: number, slot: ScheduleSlot): number { return slot.minutes; }
  trackItem(_: number, item: JsonObject): string { return String(item['id'] || `${item['patientId']}:${item['treatmentId']}:${item['cycleNumber']}:${item['applicationDay']}`); }

  private applySettings(item?: JsonObject): void {
    const definition = (item?.['definition'] && typeof item['definition'] === 'object' ? item['definition'] : {}) as JsonObject;
    const configuredSlot = Number(definition['slotMinutes'] || 10); const allowed = [5, 10, 15, 20, 30];
    const settings = { chairCount: Math.max(1, Math.min(60, Number(definition['chairCount'] || 6))), slotMinutes: allowed.includes(configuredSlot) ? configuredSlot : 10, startTime: String(definition['startTime'] || '08:00'), endTime: String(definition['endTime'] || '16:00') };
    this.settings.set(settings); this.visibleChairCount.set(Math.min(6, settings.chairCount)); this.chairOffset.set(0);
  }
  private searchText(item: JsonObject): string { return this.normalize([item['patientName'], item['patientDni'], item['dni'], item['scheme'], item['drugScheme'], item['diagnosis'], item['chair']].join(' ')); }
  private placement(item: JsonObject, type: 'candidate' | 'infusion', chair: number, slotIndex: number): SchedulePlacement {
    const span = Math.max(1, Math.ceil(this.duration(item) / this.settings().slotMinutes));
    const start = this.slots()[slotIndex]?.minutes ?? this.clockMinutes(this.settings().startTime);
    const end = start + span * this.settings().slotMinutes;
    const conflict = this.infusions().some(infusion => {
      if (type === 'infusion' && this.itemId(infusion) === this.itemId(item)) return false;
      if (String(infusion['clinicalStatus'] || '') === 'cancelled' || Number(String(infusion['chair'] || '').replace(/\D/g, '')) !== chair || !infusion['scheduledAt']) return false;
      const date = new Date(String(infusion['scheduledAt']));
      const infusionStart = date.getHours() * 60 + date.getMinutes();
      const infusionEnd = infusionStart + Math.ceil(this.duration(infusion) / this.settings().slotMinutes) * this.settings().slotMinutes;
      return infusionStart < end && infusionEnd > start;
    });
    return { chair, slotIndex, span, valid: slotIndex >= 0 && slotIndex + span <= this.slots().length && !conflict, time: this.clockLabel(start) };
  }
  private completePlacement(message: string): void { this.busy.set(false); this.selectedCandidateId.set(''); this.actionMessage.set(message); this.refresh(); }
  private rollbackPlacement(infusions: JsonObject[], candidates: JsonObject[], response: { error?: { error?: string; code?: string } }): void { this.infusions.set(infusions); this.candidates.set(candidates); this.busy.set(false); this.actionMessage.set(response?.error?.code === 'CHAIR_SCHEDULE_CONFLICT' ? 'Ese lugar acaba de ser ocupado. La agenda se actualizó.' : response?.error?.error || 'No se pudo guardar el turno.'); this.refresh(); }
  private itemId(item: JsonObject): string { return String(item['id'] || `${item['patientId']}:${item['treatmentId']}:${item['cycleNumber']}:${item['applicationDay']}`); }
  private duration(item: JsonObject): number { return Math.max(this.settings().slotMinutes, Number(item['durationMinutes'] || this.settings().slotMinutes)); }
  private durationLabel(item: JsonObject): string { const minutes = this.duration(item); return minutes >= 60 && minutes % 60 === 0 ? `${minutes / 60} h` : `${minutes} min`; }
  private blockedReason(item: JsonObject): string {
    if (String(item['workflowStatus'] || item['continuityState'] || 'active') !== 'active') return 'El tratamiento está suspendido o discontinuado.';
    if (!this.flag(item, 'prescriptionConfirmed')) return 'Falta confirmar la prescripción.';
    if (!this.medicationAvailable(item)) return 'Falta confirmar la disponibilidad de la medicación.';
    if (item['schedulingEligible'] === false) return 'Farmacia todavía no habilitó esta aplicación para recibir turno.';
    return '';
  }
  private loadDetailWorkflow(item: JsonObject): void {
    const path = `/api/clinical/application-workflows/${encodeURIComponent(String(item['patientId'] || ''))}/${encodeURIComponent(String(item['treatmentId'] || ''))}/${Number(item['cycleNumber'] || 1)}/${Number(item['applicationDay'] || 1)}`;
    this.http.get<{ workflow?: JsonObject }>(path, { withCredentials: true }).subscribe({ next: response => this.detailWorkflow.set(response.workflow || {}), error: () => undefined });
  }
  private medicationAvailable(item: JsonObject): boolean { return this.flag(item, 'medicationReceived') || this.flag(item, 'medicationWithPatient') || ['reserved', 'available'].includes(String(item['stockReservationStatus'] || '')); }
  private flag(item: JsonObject, key: string): boolean { return Boolean(item[key]); }
  private normalize(value: unknown): string { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim(); }
  private clockMinutes(value: string): number { const [hours, minutes] = value.split(':').map(Number); return (hours || 0) * 60 + (minutes || 0); }
  private clockLabel(minutes: number): string { return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`; }
  private dateLabel(value: string): string { const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/); return match ? `${match[3]}/${match[2]}/${match[1]}` : 'Sin fecha'; }
  private timeLabel(value: Date): string { return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`; }
  private localDate(): string { const now = new Date(); return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
}
