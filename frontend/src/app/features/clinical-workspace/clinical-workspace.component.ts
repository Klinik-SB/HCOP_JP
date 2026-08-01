import { Component, OnInit, effect, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { PatientWorkspaceService } from '../../core/patients/patient-workspace.service';
import { ClinicalPatient, ClinicalRecord, ClinicalState } from '../../core/patients/patient-workspace.models';

@Component({ selector: 'app-clinical-workspace', imports: [ReactiveFormsModule], templateUrl: './clinical-workspace.component.html', styleUrl: './clinical-workspace.component.scss' })
export class ClinicalWorkspaceComponent implements OnInit {
  readonly workspaceService = inject(PatientWorkspaceService);
  readonly query = new FormControl('', { nonNullable: true });
  readonly results = signal<ClinicalPatient[]>([]);
  readonly searching = signal(false);
  readonly searchError = signal('');

  constructor() {
    effect(() => {
      if (this.workspaceService.pickerOpen() && this.workspaceService.pickerRequest() > 0) this.search();
    });
  }

  ngOnInit(): void {
    this.query.valueChanges.subscribe(() => this.search());
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

  state(): ClinicalState { return this.workspaceService.workspace()?.state || {}; }
  records(key: 'diagnoses' | 'studies' | 'treatments' | 'evolutions' | 'prescriptions' | 'researchRecords'): ClinicalRecord[] { return this.state()[key] || []; }
  narrative(key: string): string { return this.text(this.state().narrative?.[key]); }
  oncology(key: string): string { return this.text(this.state().oncology?.[key]); }
  exam(key: string): string { return this.text(this.state().exam?.[key]); }
  text(value: unknown): string { return typeof value === 'string' || typeof value === 'number' ? String(value) : ''; }
  date(value?: string): string { if (!value) return ''; const parsed = new Date(`${value.length === 10 ? `${value}T12:00:00` : value}`); return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat('es-AR').format(parsed); }
  patientLine(patient: ClinicalPatient): string { return [`HC ${patient.medicalRecord || '—'}`, `DNI ${patient.dni || '—'}`, patient.insurance ? `Obra social ${patient.insurance}` : '', patient.affiliateNumber ? `Afiliado ${patient.affiliateNumber}` : ''].filter(Boolean).join(' · '); }
  recordTitle(record: ClinicalRecord): string { return this.text(record.diagnosis) || this.text(record.title) || this.text(record.scheme) || this.text(record.reason) || 'Registro clínico'; }
  recordBody(record: ClinicalRecord): string { return this.text(record.text) || this.text(record.summary) || this.text(record.status); }
  studyHeading(record: ClinicalRecord): string { return this.join(this.date(record.date), this.text(record.type), this.text(record.title)); }
  treatmentHeading(record: ClinicalRecord): string { return this.join(this.date(record.date), this.text(record.scheme)); }
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
}
