import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, finalize, tap } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { ClinicalPatient, ClinicalSaveResponse, ClinicalState, CreatedPatientResponse, NewPatientRequest, PatientSearchResponse, PatientWorkspace, StudyUploadDescriptor } from './patient-workspace.models';

@Injectable({ providedIn: 'root' })
export class PatientWorkspaceService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  readonly workspace = signal<PatientWorkspace | null>(null);
  readonly pickerOpen = signal(false);
  readonly pickerRequest = signal(0);
  readonly loading = signal(false);
  readonly error = signal('');

  search(query: string): Observable<PatientSearchResponse> {
    return this.http.get<PatientSearchResponse>('/api/clinical/patients', { params: { q: query }, withCredentials: true });
  }

  openPicker(): void {
    this.pickerOpen.set(true);
    this.pickerRequest.update((value) => value + 1);
  }

  create(request: NewPatientRequest): Observable<CreatedPatientResponse> {
    return this.http.post<CreatedPatientResponse>('/api/clinical/patients', request, { withCredentials: true }).pipe(
      tap((response) => {
        this.workspace.set({
          ok: true, patientId: response.patientId, patient: response.patient, state: response.state,
          revision: response.revision, updatedAt: new Date().toISOString()
        });
        this.auth.load().subscribe();
      })
    );
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

  activateById(patientId: string): void {
    this.loading.set(true); this.error.set('');
    this.http.post<PatientWorkspace>(`/api/clinical/patients/${encodeURIComponent(patientId)}/activate`, {}, { withCredentials: true }).pipe(
      tap((workspace) => { this.workspace.set(workspace); this.pickerOpen.set(false); this.auth.load().subscribe(); }),
      finalize(() => this.loading.set(false))
    ).subscribe({ error: (response: { error?: { error?: string } }) => this.error.set(response?.error?.error || 'No se pudo activar el paciente identificado por QR.') });
  }

  close(): void {
    this.loading.set(true); this.error.set('');
    this.http.put('/api/auth/active-patient', { patientId: null }, { withCredentials: true }).pipe(
      tap(() => { this.workspace.set(null); this.auth.load().subscribe(); }),
      finalize(() => this.loading.set(false))
    ).subscribe({ error: (response: { error?: { error?: string } }) => this.error.set(response?.error?.error || 'No se pudo cerrar el paciente.') });
  }

  uploadStudy(patientId: string, studyId: string, file: File): Observable<StudyUploadDescriptor> {
    return this.http.post<StudyUploadDescriptor>('/api/media/studies', file, {
      params: { patientId, studyId, name: file.name },
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      withCredentials: true
    });
  }

  deleteUploadedStudy(storageName: string, deleteToken: string): Observable<unknown> {
    return this.http.delete(`/api/media/studies/${encodeURIComponent(storageName)}`, {
      headers: { 'X-Study-Delete-Token': deleteToken },
      withCredentials: true
    });
  }

  saveState(nextState: ClinicalState): Observable<ClinicalSaveResponse> {
    const startedFrom = this.workspace();
    const patientId = startedFrom?.patientId || '';
    const revisionAtStart = startedFrom?.revision || 0;
    return this.http.put<ClinicalSaveResponse>('/api/hc', nextState, { withCredentials: true }).pipe(
      tap((response) => {
        const current = this.workspace();
        const revision = Number(response.unified?.revision);
        if (!current || current.patientId !== patientId || current.revision !== revisionAtStart) {
          throw new Error('El paciente o la versión de la historia cambió durante el guardado. La respuesta anterior fue descartada.');
        }
        if (response.unified?.persisted !== true || !Number.isSafeInteger(revision) || revision < 1) {
          throw new Error('La base clínica no confirmó el guardado de la historia.');
        }
        const savedState = structuredClone(nextState);
        savedState.meta = { ...(savedState.meta || {}), persistenceRevision: revision };
        this.workspace.set({ ...current, state: savedState, revision, updatedAt: new Date().toISOString() });
      })
    );
  }
}
