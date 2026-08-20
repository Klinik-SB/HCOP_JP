import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, defer, finalize, map, tap, throwError } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { ClinicalDraftRegistryService } from './clinical-draft-registry.service';
import {
  ClinicalConflictComparison,
  acceptsLatestClinicalWorkspace,
  attachLatestClinicalState,
  compareClinicalConflict,
  conflictLatestRequestIdentity,
  detachLatestClinicalState
} from './clinical-conflict-comparison';
import {
  ClinicalSaveConflictDraft,
  ClinicalSaveConflictView,
  ClinicalSaveFailure,
  captureClinicalSaveConflict,
  clinicalConflictCode,
  clinicalSaveConflictView,
  clinicalSaveFailure,
  clinicalTransitionBlockCode
} from './clinical-save-conflict';
import { ClinicalPatient, ClinicalSaveResponse, ClinicalState, CreatedPatientResponse, NewPatientRequest, PatientSearchResponse, PatientWorkspace, StudyUploadDescriptor } from './patient-workspace.models';
import { normalizePatientWorkspace } from './patient-workspace.normalization';

@Injectable({ providedIn: 'root' })
export class PatientWorkspaceService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly clinicalDrafts = inject(ClinicalDraftRegistryService);
  readonly workspace = signal<PatientWorkspace | null>(null);
  readonly pickerOpen = signal(false);
  readonly pickerRequest = signal(0);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly saving = signal(false);
  readonly conflictLatestLoading = signal(false);
  readonly conflictLatestError = signal('');
  private readonly patientScopedOperations = signal(0);
  readonly hasPendingClinicalWork = computed(() => Boolean(
    this.activeSaveConflictDraft()
      || this.saving()
      || this.clinicalDrafts.hasActive()
      || this.patientScopedOperations() > 0
  ));
  private readonly pendingSaveConflict = signal<ClinicalSaveConflictDraft | null>(null);
  private readonly conflictComparisonAuthorized = signal(true);
  private conflictLatestRequest = 0;
  readonly workingWorkspace = computed<PatientWorkspace | null>(() => {
    const workspace = this.workspace();
    const conflict = this.pendingSaveConflict();
    if (!workspace || conflict?.patientId !== workspace.patientId || conflict.code === 'CLINICAL_PATIENT_MISMATCH') return workspace;
    return { ...workspace, state: structuredClone(conflict.attemptedState) };
  });
  readonly activeConflictComparison = computed<ClinicalConflictComparison | null>(() => {
    const conflict = this.activeSaveConflictDraft();
    return conflict?.code === 'VERSION_CONFLICT'
      && this.conflictComparisonAuthorized()
      && this.auth.hasPermission('section.history.view')
      ? compareClinicalConflict(conflict)
      : null;
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
    if (this.pendingSaveConflict()?.patientId === patientId) {
      this.invalidateConflictLatest('La historia se está actualizando. Espere para volver a comparar.');
    }
    this.loading.set(true); this.error.set('');
    this.http.get<PatientWorkspace>(`/api/clinical/patients/${encodeURIComponent(patientId)}/workspace`, { withCredentials: true }).pipe(
      map(normalizePatientWorkspace),
      finalize(() => this.loading.set(false))
    ).subscribe({
      next: (workspace) => {
        this.installLoadedWorkspace(workspace, discardPendingConflict);
      },
      error: (response: { error?: { error?: string } }) => {
        this.error.set(response?.error?.error || 'No se pudo abrir la historia clínica.');
        if (this.pendingSaveConflict()?.patientId === patientId) {
          this.conflictLatestError.set('No se pudo actualizar la historia. Puede volver a intentar la comparación.');
        }
      }
    });
  }

  activate(patient: ClinicalPatient): void {
    const transitionFailure = this.transitionFailure(patient.id);
    if (transitionFailure) { this.error.set(transitionFailure.message); return; }
    if (this.pendingSaveConflict()?.patientId === patient.id) {
      this.invalidateConflictLatest('La historia se está actualizando. Espere para volver a comparar.');
    }
    this.loading.set(true); this.error.set('');
    this.http.post<PatientWorkspace>(`/api/clinical/patients/${encodeURIComponent(patient.id)}/activate`, {}, { withCredentials: true }).pipe(
      map(normalizePatientWorkspace),
      tap((workspace) => { this.installLoadedWorkspace(workspace, false); this.pickerOpen.set(false); this.auth.load().subscribe(); }),
      finalize(() => this.loading.set(false))
    ).subscribe({ error: (response: { error?: { error?: string } }) => {
      this.error.set(response?.error?.error || 'No se pudo activar el paciente.');
      if (this.pendingSaveConflict()?.patientId === patient.id) {
        this.conflictLatestError.set('No se pudo actualizar la historia. Puede volver a intentar la comparación.');
      }
    } });
  }

  activateById(patientId: string, discardPendingConflict = false): void {
    const transitionFailure = this.transitionFailure(patientId);
    if (transitionFailure) { this.error.set(transitionFailure.message); return; }
    if (this.pendingSaveConflict()?.patientId === patientId) {
      this.invalidateConflictLatest('La historia se está actualizando. Espere para volver a comparar.');
    }
    this.loading.set(true); this.error.set('');
    this.http.post<PatientWorkspace>(`/api/clinical/patients/${encodeURIComponent(patientId)}/activate`, {}, { withCredentials: true }).pipe(
      map(normalizePatientWorkspace),
      tap((workspace) => {
        this.installLoadedWorkspace(workspace, discardPendingConflict);
        this.pickerOpen.set(false);
        this.auth.load().subscribe();
      }),
      finalize(() => this.loading.set(false))
    ).subscribe({ error: (response: { error?: { error?: string } }) => {
      this.error.set(response?.error?.error || 'No se pudo activar el paciente identificado por QR.');
      if (this.pendingSaveConflict()?.patientId === patientId) {
        this.conflictLatestError.set('No se pudo actualizar la historia. Puede volver a intentar la comparación.');
      }
    } });
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

  beginPatientScopedOperation(patientId: string): () => void {
    const expected = patientId.trim();
    const current = this.workspace();
    if (!expected || current?.patientId !== expected) {
      throw new ClinicalSaveFailure(
        'El paciente activo cambió antes de iniciar la operación.',
        'CLINICAL_CONTEXT_CHANGED',
        409
      );
    }
    this.patientScopedOperations.update((count) => count + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.patientScopedOperations.update((count) => Math.max(0, count - 1));
    };
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
      const currentAtSubscription = this.workspace();
      if (!currentAtSubscription
          || currentAtSubscription.patientId !== patientId
          || currentAtSubscription.revision !== revisionAtStart) {
        return throwError(() => new ClinicalSaveFailure(
          'El paciente o la versión de la historia cambió antes de iniciar el guardado.',
          'CLINICAL_CONTEXT_CHANGED'
        ));
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
      this.saving.set(true);
      return this.http.put<ClinicalSaveResponse>('/api/hc', stateToSave, { withCredentials: true }).pipe(
        catchError((error: unknown) => {
          const failure = clinicalSaveFailure(error, 'No se pudo guardar la historia clínica.');
          const conflictCode = clinicalConflictCode(failure);
          const current = this.workspace();
          if (conflictCode
              && !this.pendingSaveConflict()
              && current?.patientId === patientId
              && current.revision === revisionAtStart) {
            this.conflictComparisonAuthorized.set(true);
            this.conflictLatestError.set('');
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
          // Java es la autoridad de los metadatos clínicos (actor, fecha, motivo y
          // versiones). Instalar su estado evita conservar una auditoría optimista
          // construida por el navegador.
          const savedState = structuredClone(response.state || stateToSave);
          savedState.meta = { ...(savedState.meta || {}), persistenceRevision: revision };
          this.workspace.set({ ...current, state: savedState, revision, updatedAt: new Date().toISOString() });
        }),
        finalize(() => this.saving.set(false))
      );
    });
  }

  activeSaveConflict(): ClinicalSaveConflictView | null {
    const conflict = this.activeSaveConflictDraft();
    return conflict ? clinicalSaveConflictView(conflict) : null;
  }

  private activeSaveConflictDraft(): ClinicalSaveConflictDraft | null {
    const conflict = this.pendingSaveConflict();
    return conflict?.patientId === this.workspace()?.patientId ? conflict : null;
  }

  discardConflictAndReload(): void {
    const conflict = this.activeSaveConflictDraft();
    if (!conflict) return;
    if (conflict.code === 'ACTIVE_PATIENT_REQUIRED') this.activateById(conflict.patientId, true);
    else this.load(conflict.patientId, true);
  }

  refreshConflictLatest(): void {
    const conflict = this.activeSaveConflictDraft();
    if (!conflict || conflict.code !== 'VERSION_CONFLICT') return;
    if (this.loading()) {
      this.conflictLatestError.set('La historia se está actualizando. Espere para volver a comparar.');
      return;
    }
    if (!this.auth.hasPermission('section.history.view')) {
      this.conflictComparisonAuthorized.set(false);
      this.conflictLatestError.set('La sesión actual no permite consultar esta historia.');
      return;
    }
    this.conflictComparisonAuthorized.set(true);
    const requestId = ++this.conflictLatestRequest;
    const identity = conflictLatestRequestIdentity(
      conflict,
      requestId,
      this.workspace()?.revision || conflict.baseRevision + 1
    );
    this.conflictLatestLoading.set(true);
    this.conflictLatestError.set('');
    this.http.get<PatientWorkspace>(
      `/api/clinical/patients/${encodeURIComponent(conflict.patientId)}/workspace`,
      { withCredentials: true }
    ).pipe(
      map(normalizePatientWorkspace),
      finalize(() => {
        if (this.conflictLatestRequest === requestId) this.conflictLatestLoading.set(false);
      })
    ).subscribe({
      next: (latestWorkspace) => {
        const activeConflict = this.activeSaveConflictDraft();
        if (!acceptsLatestClinicalWorkspace(
          activeConflict,
          identity,
          latestWorkspace,
          this.conflictLatestRequest
        )) {
          if (this.conflictLatestRequest === requestId && activeConflict?.conflictId === identity.conflictId) {
            this.conflictLatestError.set('La revisión recibida no corresponde al conflicto vigente. No se utilizó para comparar.');
          }
          return;
        }
        this.pendingSaveConflict.set(attachLatestClinicalState(
          activeConflict!,
          latestWorkspace.state,
          latestWorkspace.revision
        ));
      },
      error: (response: { status?: number; error?: { error?: string } }) => {
        const activeConflict = this.activeSaveConflictDraft();
        if (this.conflictLatestRequest === requestId && activeConflict?.conflictId === identity.conflictId) {
          if (response?.status === 401 || response?.status === 403) {
            this.conflictComparisonAuthorized.set(false);
            if (activeConflict.latestState) {
              this.pendingSaveConflict.set(detachLatestClinicalState(activeConflict));
            }
          }
          this.conflictLatestError.set(
            response?.status === 401 || response?.status === 403
              ? 'La sesión actual no permite consultar esta historia.'
              : response?.error?.error || 'No se pudo recuperar la última revisión confirmada.'
          );
        }
      }
    });
  }

  private transitionFailure(targetPatientId: string | null): ClinicalSaveFailure | null {
    const code = clinicalTransitionBlockCode(
      this.pendingSaveConflict(),
      targetPatientId,
      this.saving(),
      this.loading(),
      this.clinicalDrafts.hasActive() || this.patientScopedOperations() > 0
    );
    if (!code) return null;
    return new ClinicalSaveFailure(
      code === 'CLINICAL_SAVE_IN_PROGRESS'
        ? 'Hay un guardado clínico en curso. Espere a que termine.'
        : code === 'CLINICAL_CONTEXT_TRANSITION_IN_PROGRESS'
          ? 'El contexto del paciente se está actualizando. Espere a que termine.'
          : code === 'PENDING_LOCAL_DRAFT'
            ? 'Hay cambios clínicos sin guardar. Guárdelos o descártelos antes de cambiar el contexto.'
        : 'Hay un borrador en conflicto pendiente. Resuélvalo antes de cambiar o cerrar el paciente.',
      code,
      code === 'PENDING_CLINICAL_CONFLICT' || code === 'PENDING_LOCAL_DRAFT' ? 409 : 0
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
    if (this.clinicalDrafts.hasActive()) {
      return new ClinicalSaveFailure(
        'Hay un editor clínico abierto. Guárdelo o ciérrelo antes de modificar archivos.',
        'PENDING_LOCAL_DRAFT',
        409
      );
    }
    return null;
  }

  private installLoadedWorkspace(workspace: PatientWorkspace, discardPendingConflict: boolean): void {
    const conflict = this.pendingSaveConflict();
    if (conflict?.patientId === workspace.patientId) {
      this.invalidateConflictLatest(
        discardPendingConflict ? '' : 'La historia visible se actualizó. Actualice la comparación para usar esa revisión.'
      );
      if (discardPendingConflict) {
        this.conflictComparisonAuthorized.set(true);
        this.pendingSaveConflict.set(null);
      }
    }
    this.workspace.set(workspace);
  }

  private invalidateConflictLatest(message = ''): void {
    this.conflictLatestRequest += 1;
    this.conflictLatestLoading.set(false);
    this.conflictLatestError.set(message);
    const conflict = this.pendingSaveConflict();
    if (conflict?.latestState) this.pendingSaveConflict.set(detachLatestClinicalState(conflict));
  }
}
