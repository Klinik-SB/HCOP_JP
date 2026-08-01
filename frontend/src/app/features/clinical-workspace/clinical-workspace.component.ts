import { Component, OnInit, inject, signal } from '@angular/core';
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

  ngOnInit(): void {
    this.query.valueChanges.subscribe(() => this.search());
  }

  openPicker(): void { this.workspaceService.pickerOpen.set(true); this.search(); }
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
  private join(...values: string[]): string { return values.filter((value) => Boolean(value)).join(' · '); }
}
