import { Component, ElementRef, OnInit, effect, inject, input, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ClinicalFocusRequest, ClinicalFocusService } from '../../core/clinical/clinical-focus.service';
import {
  ClinicalPrintFact,
  ClinicalPrintSection,
  clinicalPrintPatientFacts,
  clinicalPrintSectionHasContent
} from '../../core/clinical/clinical-print-projection';
import { ClinicalTreatmentKind, clinicalSectionTreatments, clinicalTreatmentBody } from '../../core/clinical/clinical-treatment-projection';
import { PatientWorkspaceService } from '../../core/patients/patient-workspace.service';
import { ClinicalPatient, ClinicalRecord, ClinicalState } from '../../core/patients/patient-workspace.models';

@Component({ selector: 'app-clinical-workspace', imports: [ReactiveFormsModule], templateUrl: './clinical-workspace.component.html', styleUrl: './clinical-workspace.component.scss' })
export class ClinicalWorkspaceComponent implements OnInit {
  readonly printTimestamp = input('');
  readonly workspaceService = inject(PatientWorkspaceService);
  private readonly clinicalFocus = inject(ClinicalFocusService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly query = new FormControl('', { nonNullable: true });
  readonly results = signal<ClinicalPatient[]>([]);
  readonly searching = signal(false);
  readonly searchError = signal('');

  constructor() {
    effect(() => {
      if (this.workspaceService.pickerOpen() && this.workspaceService.pickerRequest() > 0) this.search();
    });
    effect(() => {
      const request = this.clinicalFocus.request();
      if (!request.id) return;
      queueMicrotask(() => this.applyClinicalFocus(request));
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
  treatmentBody(record: ClinicalRecord): string { return clinicalTreatmentBody(record); }
  studyHeading(record: ClinicalRecord): string { return this.join(this.date(record.date), this.text(record.type), this.text(record.title)); }
  treatmentHeading(record: ClinicalRecord): string { return this.join(this.date(record.date), this.text(record.scheme) || this.text(record.title) || this.text(record.reason)); }
  treatmentRecords(kind: ClinicalTreatmentKind): ClinicalRecord[] {
    return clinicalSectionTreatments(
      this.state(),
      kind,
      this.workspaceService.workspace()?.treatments?.oncology || []
    );
  }
  printHas(section: ClinicalPrintSection): boolean {
    return clinicalPrintSectionHasContent(
      this.state(),
      section,
      this.workspaceService.workspace()?.treatments?.oncology || []
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
}
