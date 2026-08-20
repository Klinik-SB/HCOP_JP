import { Component, input, output, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { NewPatientRequest } from '../../core/patients/patient-workspace.models';
import { PatientWorkspaceService } from '../../core/patients/patient-workspace.service';

@Component({
  selector: 'app-new-patient-modal',
  imports: [ReactiveFormsModule],
  templateUrl: './new-patient-modal.component.html',
  styleUrl: './new-patient-modal.component.scss'
})
export class NewPatientModalComponent {
  readonly open = input(false);
  readonly closed = output<void>();
  private readonly fb = inject(FormBuilder);
  private readonly workspace = inject(PatientWorkspaceService);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly form = this.fb.nonNullable.group({
    firstName: ['', Validators.required], lastName: ['', Validators.required], dni: [''], medicalRecord: [''], birthDate: [''], sex: [''],
    phone: [''], email: ['', Validators.email], insurance: [''], affiliateNumber: [''], address: ['']
  });

  close(): void { if (!this.busy()) { this.error.set(''); this.closed.emit(); } }
  async submit(): Promise<void> {
    this.error.set('');
    const value = this.form.getRawValue();
    if (!value.firstName.trim()) { this.error.set('El nombre es obligatorio.'); this.form.controls.firstName.markAsTouched(); return; }
    if (!value.lastName.trim()) { this.error.set('El apellido es obligatorio.'); this.form.controls.lastName.markAsTouched(); return; }
    if (!value.dni.trim() && !value.medicalRecord.trim()) { this.error.set('Informe el DNI o el número de historia clínica.'); this.form.controls.dni.markAsTouched(); return; }
    if (value.birthDate && value.birthDate > new Date().toISOString().slice(0, 10)) { this.error.set('La fecha de nacimiento no puede ser futura.'); return; }
    if (this.form.controls.email.invalid) { this.error.set('El correo electrónico no es válido.'); return; }
    this.busy.set(true);
    try {
      await firstValueFrom(this.workspace.create(this.clean(value)));
      this.form.reset();
      this.closed.emit();
    } catch (error) {
      const response = error as { error?: { error?: string; existingPatient?: { fullName?: string; id?: string } } };
      const existing = response.error?.existingPatient;
      this.error.set(`${response.error?.error || 'No se pudo crear el paciente.'}${existing ? ` Ya corresponde a ${existing.fullName || 'un paciente existente'} (ID ${existing.id || '—'}).` : ''}`);
    } finally { this.busy.set(false); }
  }

  private clean(value: NewPatientRequest): NewPatientRequest {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, item.trim()])) as NewPatientRequest;
  }
}
