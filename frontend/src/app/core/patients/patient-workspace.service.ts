import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, defer, finalize, map, tap, throwError } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import {
  ClinicalSaveConflictDraft,
  ClinicalSaveFailure,
  captureClinicalSaveConflict,
  clinicalConflictCode,
  clinicalSaveFailure,
  clinicalTransitionBlockCode
} from './clinical-save-conflict';
import { ClinicalPatient, ClinicalSaveResponse, ClinicalState, CreatedPatientResponse, NewPatientRequest, PatientSearchResponse, PatientWorkspace, StudyUploadDescriptor } from './patient-workspace.models';
import { normalizePatientWorkspace } from './patient-workspace.normalization';

@Injectable({ providedIn: 'root' })
export class PatientWorkspaceService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  readonly workspace = signal<PatientWorkspace | null>(null);
  readonly pickerOpen = signal(false);
  readonly pickerRequest = signal(0);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly saving = signal(false);
  readonly pendingSaveConflict = signal<ClinicalSaveConflictDraft | null>(null);
  readonly workingWorkspace = computed<PatientWorkspace | null>(() => {
    const workspace = this.workspace();
    const conflict = this.pendingSaveConflict();
    if (!workspace || conflict?.patientId !== workspace.patientId || conflict.code === 'CLINICAL_PATIENT_MISMATCH') return workspace;
    return { ...workspace, state: structuredClone(conflict.attemptedState) };
  });

  search(query: string): Observable<PatientSearchResponse> {
    return this.http.get<PatientSearchResponse>('/api/clinical/patients', { params: { q: query }, withCredentials: true });
  }

  openPicker(): void {
    this.pickerOpen.set(true);
    this.pickerRequest.update((value) => value + 1);
  }

  create(request: NewPatientRequest): Observable<CreatedPatientResponse> {
    return defer(() => {
      const transitionFailure = this.transitionFailure(null);
      if (transitionFailure) return throwError(() => transitionFailure);
      this.loading.set(true);
      return this.http.post<CreatedPatientResponse>('/api/clinical/patients', request, { withCredentials: true }).pipe(
        tap((response) => {
          this.workspace.set({
            ok: true, patientId: response.patientId, patient: response.patient, state: response.state,
            revision: response.revision, updatedAt: new Date().toISOString()
          });
          this.auth.load().subscribe();
        }),
        finalize(() => this.loading.set(false))
      );
    });
  }

  load(patientId: string, discardPendingConflict = false): void {
    const transitionFailure = this.transitionFailure(patientId);
    if (transitionFailure) { this.error.set(transitionFailure.message); return; }
    this.loading.set(true); this.error.set('');
    this.http.get<PatientWorkspace>(`/api/clinical/patients/${encodeURIComponent(patientId)}/workspace`, { withCredentials: true }).pipe(
      map(normalizePatientWorkspace),
      finalize(() => this.loading.set(false))
    ).subscribe({
      next: (workspace) => {
        if (discardPendingConflict && this.pendingSaveConflict()?.patientId === patientId) {
          this.pendingSaveConflict.set(null);
        }
        this.workspace.set(workspace);
      },
      error: (response: { error?: { error?: string } }) => this.error.set(response?.error?.error || 'No se pudo abrir la historia clínica.')
    });
  }

  activate(patient: ClinicalPatient): void {
    const transitionFailure = this.transitionFailure(patient.id);
    if (transitionFailure) { this.error.set(transitionFailure.message); return; }
    this.loading.set(true); this.error.set('');
    this.http.post<PatientWorkspace>(`/api/clinical/patients/${encodeURIComponent(patient.id)}/activate`, {}, { withCredentials: true }).pipe(
      map(normalizePatientWorkspace),
      tap((workspace) => { this.workspace.set(workspace); this.pickerOpen.set(false); this.auth.load().subscribe(); }),
      finalize(() => this.loading.set(false))
    ).subscribe({ error: (response: { error?: { error?: string } }) => this.error.set(response?.error?.error || 'No se pudo activar el paciente.') });
  }

  activateById(patientId: string, discardPendingConflict = false): void {
    const transitionFailure = this.transitionFailure(patientId);
    if (transitionFailure) { this.error.set(transitionFailure.message); return; }
    this.loading.set(true); this.error.set('');
    this.http.post<PatientWorkspace>(`/api/clinical/patients/${encodeURIComponent(patientId)}/activate`, {}, { withCredentials: true }).pipe(
      map(normalizePatientWorkspace),
      tap((workspace) => {
        if (discardPendingConflict && this.pendingSaveConflict()?.patientId === patientId) {
          this.pendingSaveConflict.set(null);
        }
        this.workspace.set(workspace);
        this.pickerOpen.set(false);
        this.auth.load().subscribe();
      }),
      finalize(() => this.loading.set(false))
    ).subscribe({ error: (response: { error?: { error?: string } }) => this.error.set(response?.error?.error || 'No se pudo activar el paciente identificado por QR.') });
  }

  close(): void {
    const transitionFailure = this.transitionFailure(null);
    if (transitionFailure) { this.error.set(transitionFailure.message); return; }
    this.loading.set(true); this.error.set('');
    this.http.put('/api/auth/active-patient', { patientId: null }, { withCredentials: true }).pipe(
      tap(() => { this.workspace.set(null); this.auth.load().subscribe(); }),
      finalize(() => this.loading.set(false))
    ).subscribe({ error: (response: { error?: { error?: string } }) => this.error.set(response?.error?.error || 'No se pudo cerrar el paciente.') });
  }

  uploadStudy(patientId: string, studyId: string, file: File): Observable<StudyUploadDescriptor> {
    const mutationFailure = this.mutationFailure();
    if (mutationFailure) return throwError(() => mutationFailure);
    return this.http.post<StudyUploadDescriptor>('/api/media/studies', file, {
      params: { patientId, studyId, name: file.name },
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      withCredentials: true
    });
  }

  deleteUploadedStudy(storageName: string, deleteToken: string): Observable<unknown> {
    const mutationFailure = this.mutationFailure();
    if (mutationFailure) return throwError(() => mutationFailure);
    return this.http.delete(`/api/media/studies/${encodeURIComponent(storageName)}`, {
      headers: { 'X-Study-Delete-Token': deleteToken },
      withCredentials: true
    });
  }

  saveState(nextState: ClinicalState): Observable<ClinicalSaveResponse> {
    const startedFrom = this.workspace();
    const patientId = startedFrom?.patientId || '';
    const revisionAtStart = startedFrom?.revision || 0;
    if (!patientId || !Number.isSafeInteger(revisionAtStart) || revisionAtStart < 1) {
      return throwError(() => new Error('La historia activa no tiene una revisión válida para guardar. Recargue el paciente.'));
    }
    if (this.loading()) {
      return throwError(() => new ClinicalSaveFailure(
        'El contexto del paciente se está actualizando. Espere a que termine.',
        'CLINICAL_CONTEXT_TRANSITION_IN_PROGRESS'
      ));
    }
    if (this.saving()) {
      return throwError(() => new ClinicalSaveFailure(
        'Hay un guardado clínico en curso. Espere a que termine.',
        'CLINICAL_SAVE_IN_PROGRESS'
      ));
    }
    if (this.pendingSaveConflict()?.patientId === patientId) {
      return throwError(() => new ClinicalSaveFailure(
        'Hay un borrador en conflicto pendiente. Recargue la historia antes de intentar otro guardado.',
        'PENDING_CLINICAL_CONFLICT',
        409
      ));
    }
    const baseState = structuredClone(startedFrom!.state);
    const stateToSave = structuredClone(nextState);
    stateToSave.meta = { ...(stateToSave.meta || {}), persistenceRevision: revisionAtStart };
    return defer(() => {
      if (this.loading()) {
        return throwError(() => new ClinicalSaveFailure(
          'El contexto del paciente se está actualizando. Espere a que termine.',
          'CLINICAL_CONTEXT_TRANSITION_IN_PROGRESS'
        ));
      }
      if (this.saving()) {
        return throwError(() => new ClinicalSaveFailure(
          'Hay un guardado clínico en curso. Espere a que termine.',
          'CLINICAL_SAVE_IN_PROGRESS'
        ));
      }
      if (this.pendingSaveConflict()?.patientId === patientId) {
        return throwError(() => new ClinicalSaveFailure(
          'Hay un borrador en conflicto pendiente. Recargue la historia antes de intentar otro guardado.',
          'PENDING_CLINICAL_CONFLICT',
          409
        ));
      }
      this.saving.set(true);
      return this.http.put<ClinicalSaveResponse>('/api/hc', stateToSave, { withCredentials: true }).pipe(
        catchError((error: unknown) => {
          const failure = clinicalSaveFailure(error, 'No se pudo guardar la historia clínica.');
          const conflictCode = clinicalConflictCode(failure);
          if (conflictCode) {
            this.pendingSaveConflict.set(captureClinicalSaveConflict(
              patientId,
              revisionAtStart,
              baseState,
              stateToSave,
              new Date().toISOString(),
              conflictCode,
              failure.message
            ));
          }
          return throwError(() => failure);
        }),
        tap((response) => {
          const current = this.workspace();
          const revision = Number(response.unified?.revision);
          if (!current || current.patientId !== patientId || current.revision !== revisionAtStart) {
            throw new Error('El paciente o la versión de la historia cambió durante el guardado. La respuesta anterior fue descartada.');
          }
          if (response.unified?.persisted !== true || !Number.isSafeInteger(revision) || revision < 1) {
            throw new Error('La base clínica no confirmó el guardado de la historia.');
          }
          const savedState = structuredClone(stateToSave);
          savedState.meta = { ...(savedState.meta || {}), persistenceRevision: revision };
          this.workspace.set({ ...current, state: savedState, revision, updatedAt: new Date().toISOString() });
        }),
        finalize(() => this.saving.set(false))
      );
    });
  }

  activeSaveConflict(): ClinicalSaveConflictDraft | null {
    const conflict = this.pendingSaveConflict();
    return conflict?.patientId === this.workspace()?.patientId ? conflict : null;
  }

  discardConflictAndReload(): void {
    const conflict = this.activeSaveConflict();
    if (!conflict) return;
    if (conflict.code === 'ACTIVE_PATIENT_REQUIRED') this.activateById(conflict.patientId, true);
    else this.load(conflict.patientId, true);
  }

  private transitionFailure(targetPatientId: string | null): ClinicalSaveFailure | null {
    const code = clinicalTransitionBlockCode(
      this.pendingSaveConflict(),
      targetPatientId,
      this.saving(),
      this.loading()
    );
    if (!code) return null;
    return new ClinicalSaveFailure(
      code === 'CLINICAL_SAVE_IN_PROGRESS'
        ? 'Hay un guardado clínico en curso. Espere a que termine.'
        : code === 'CLINICAL_CONTEXT_TRANSITION_IN_PROGRESS'
          ? 'El contexto del paciente se está actualizando. Espere a que termine.'
        : 'Hay un borrador en conflicto pendiente. Resuélvalo antes de cambiar o cerrar el paciente.',
      code,
      code === 'PENDING_CLINICAL_CONFLICT' ? 409 : 0
    );
  }

  private mutationFailure(): ClinicalSaveFailure | null {
    if (this.saving()) {
      return new ClinicalSaveFailure(
        'Hay un guardado clínico en curso. Espere a que termine.',
        'CLINICAL_SAVE_IN_PROGRESS'
      );
    }
    if (this.pendingSaveConflict()) {
      return new ClinicalSaveFailure(
        'Hay un borrador en conflicto pendiente. Resuélvalo antes de modificar archivos.',
        'PENDING_CLINICAL_CONFLICT',
        409
      );
    }
    return null;
  }
}
