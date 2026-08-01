import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, finalize, tap } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { ClinicalPatient, PatientSearchResponse, PatientWorkspace } from './patient-workspace.models';

@Injectable({ providedIn: 'root' })
export class PatientWorkspaceService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  readonly workspace = signal<PatientWorkspace | null>(null);
  readonly pickerOpen = signal(false);
  readonly loading = signal(false);
  readonly error = signal('');

  search(query: string): Observable<PatientSearchResponse> {
    return this.http.get<PatientSearchResponse>('/api/clinical/patients', { params: { q: query }, withCredentials: true });
  }

  load(patientId: string): void {
    this.loading.set(true); this.error.set('');
    this.http.get<PatientWorkspace>(`/api/clinical/patients/${encodeURIComponent(patientId)}/workspace`, { withCredentials: true }).pipe(
      finalize(() => this.loading.set(false))
    ).subscribe({ next: (workspace) => this.workspace.set(workspace), error: (response: { error?: { error?: string } }) => this.error.set(response?.error?.error || 'No se pudo abrir la historia clínica.') });
  }

  activate(patient: ClinicalPatient): void {
    this.loading.set(true); this.error.set('');
    this.http.post<PatientWorkspace>(`/api/clinical/patients/${encodeURIComponent(patient.id)}/activate`, {}, { withCredentials: true }).pipe(
      tap((workspace) => { this.workspace.set(workspace); this.pickerOpen.set(false); this.auth.load().subscribe(); }),
      finalize(() => this.loading.set(false))
    ).subscribe({ error: (response: { error?: { error?: string } }) => this.error.set(response?.error?.error || 'No se pudo activar el paciente.') });
  }

  close(): void {
    this.loading.set(true); this.error.set('');
    this.http.put('/api/auth/active-patient', { patientId: null }, { withCredentials: true }).pipe(
      tap(() => { this.workspace.set(null); this.auth.load().subscribe(); }),
      finalize(() => this.loading.set(false))
    ).subscribe({ error: (response: { error?: { error?: string } }) => this.error.set(response?.error?.error || 'No se pudo cerrar el paciente.') });
  }
}
