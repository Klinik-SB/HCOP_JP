import { CommonModule } from '@angular/common';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Component, OnChanges, SimpleChanges, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

type JsonObject = Record<string, unknown>;
interface ScheduleSettings { chairCount: number; slotMinutes: number; startTime: string; endTime: string; }
interface ScheduleSlot { row: number; minutes: number; label: string; }

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
  private medicationAvailable(item: JsonObject): boolean { return this.flag(item, 'medicationReceived') || this.flag(item, 'medicationWithPatient') || ['reserved', 'available'].includes(String(item['stockReservationStatus'] || '')); }
  private flag(item: JsonObject, key: string): boolean { return Boolean(item[key]); }
  private normalize(value: unknown): string { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim(); }
  private clockMinutes(value: string): number { const [hours, minutes] = value.split(':').map(Number); return (hours || 0) * 60 + (minutes || 0); }
  private clockLabel(minutes: number): string { return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`; }
  private dateLabel(value: string): string { const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/); return match ? `${match[3]}/${match[2]}/${match[1]}` : 'Sin fecha'; }
  private timeLabel(value: Date): string { return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`; }
  private localDate(): string { const now = new Date(); return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
}
