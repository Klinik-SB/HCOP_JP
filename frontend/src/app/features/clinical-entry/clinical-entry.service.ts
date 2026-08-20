import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, computed, inject } from '@angular/core';
import { Observable, catchError, defer, forkJoin, map, of, switchMap, throwError } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import type { ClinicalRecord, ClinicalState } from '../../core/patients/patient-workspace.models';
import { PatientWorkspaceService } from '../../core/patients/patient-workspace.service';
import {
  AjccSiteDetail, AjccStageResult, ClinicalAuditStamp, ClinicalEntryApiFailure,
  ClinicalEntrySaveResult, DiagnosisCatalogItem, DiagnosisEditorCatalog, DiagnosisEntryDraft,
  DiagnosisRecord, DiagnosisSystem, EvolutionEntryDraft
} from './clinical-entry.models';
import {
  applyDiagnosisRecord, applyEvolutionRecord, buildDiagnosisRecord, buildEvolutionRecord,
  diagnosisFingerprint, normalizeAjccDetail, normalizeAjccStage, normalizeCatalogResults,
  normalizeDiagnosisEditorCatalog
} from './clinical-entry.normalizers';

type JsonRecord = Record<string, unknown>;

@Injectable({ providedIn: 'root' })
export class ClinicalEntryService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly workspace = inject(PatientWorkspaceService);

  readonly canEdit = computed(() => Boolean(
    this.workspace.workspace()
    && this.auth.hasPermission('section.history.edit')
  ));

  readonly canStage = computed(() => Boolean(
    this.auth.hasPermission('section.tools.view')
    && this.auth.hasPermission('section.tools.use')
  ));

  loadDiagnosisEditor(): Observable<DiagnosisEditorCatalog> {
    const optional = (url: string): Observable<unknown> => this.http.get<unknown>(url, {
      params: new HttpParams().set('includeInactive', '0'), withCredentials: true
    }).pipe(catchError(() => of({ items: [] })));
    return forkJoin({
      ajcc: this.http.get<unknown>('/api/ajcc8', { withCredentials: true }),
      equivalences: optional('/api/clinical/configuration/diagnosis-equivalence'),
      settings: optional('/api/clinical/configuration/diagnosis-setting')
    }).pipe(
      map(({ ajcc, equivalences, settings }) => normalizeDiagnosisEditorCatalog(ajcc, equivalences, settings)),
      catchError((failure: unknown) => this.fail(failure, 'No se pudo preparar el editor de diagnóstico.'))
    );
  }

  ajccDetail(siteId: string): Observable<AjccSiteDetail> {
    const id = siteId.trim();
    if (!id) return throwError(() => entryFailure(400, 'INVALID_AJCC_SITE', 'Seleccione el sitio AJCC.'));
    return this.http.get<unknown>('/api/ajcc8/detail', {
      params: new HttpParams().set('id', id), withCredentials: true
    }).pipe(
      map(normalizeAjccDetail),
      catchError((failure: unknown) => this.fail(failure, 'No se pudieron cargar T, N y M del sitio AJCC.'))
    );
  }

  calculateStage(siteId: string, prefix: string, values: Readonly<Record<string, string>>): Observable<AjccStageResult> {
    const requestValues: Record<string, string> = {
      ...values,
      Classification: prefix.includes('p') ? 'p' : 'c',
      DescY: prefix.includes('y') ? 'Yes' : 'No',
      DescR: prefix === 'r' ? 'Yes' : 'No',
      DescM: 'No'
    };
    return this.http.post<unknown>('/api/ajcc8/stage', { id: siteId, values: requestValues }, { withCredentials: true }).pipe(
      map(normalizeAjccStage),
      catchError((failure: unknown) => this.fail(failure, 'No se pudo calcular el estadio. Puede ingresarlo manualmente.'))
    );
  }

  searchDiagnosis(system: 'snomed' | 'cie10', query: string): Observable<readonly DiagnosisCatalogItem[]> {
    const normalized = query.trim();
    if (normalized.length < 2) return of([]);
    return this.http.get<unknown>('/api/diagnosis-catalogs/search', {
      params: new HttpParams().set('system', system).set('q', normalized).set('limit', '40'),
      withCredentials: true
    }).pipe(
      map((payload) => normalizeCatalogResults(payload, system)),
      catchError((failure: unknown) => this.fail(failure, `No se pudo buscar en ${system === 'snomed' ? 'SNOMED CT' : 'CIE-10'}.`))
    );
  }

  saveEvolution(draft: EvolutionEntryDraft): Observable<ClinicalEntrySaveResult> {
    return defer(() => {
      this.requireEditPermission();
      const current = this.requireWorkspace();
      const audit = this.auditStamp();
      const clinicalRecord = buildEvolutionRecord(draft, audit);
      const existing = (current.state.evolutions || []).find((item) => String(item.id || '') === draft.id);
      if (existing && JSON.stringify(existing) !== JSON.stringify(clinicalRecord)) {
        return throwError(() => entryFailure(409, 'CLINICAL_ENTRY_ID_CONFLICT', 'La evolución ya existe con otro contenido.'));
      }
      const save: Observable<void> = existing
        ? of(undefined)
        : this.workspace.saveState(applyEvolutionRecord(current.state, clinicalRecord)).pipe(map(() => undefined));
      return save.pipe(map(() => {
        const saved = this.requireSamePatient(current.patientId);
        return { record: clinicalRecord, state: saved.state, revision: saved.revision, linked: true, warning: '' };
      }));
    }).pipe(catchError((failure: unknown) => this.fail(failure, 'No se pudo guardar la evolución.')));
  }

  saveDiagnosis(draft: DiagnosisEntryDraft): Observable<ClinicalEntrySaveResult<DiagnosisRecord>> {
    return defer(() => {
      this.requireEditPermission();
      const current = this.requireWorkspace();
      const diagnosis = buildDiagnosisRecord(draft, this.auditStamp());
      const oncology = asRecord(current.state.oncology);
      const records = Array.isArray(oncology['diagnosisRecords']) ? oncology['diagnosisRecords'] : [];
      const existing = records.map(asRecord).find((item) => String(item['id'] || '') === diagnosis.id);
      if (existing && diagnosisFingerprint(existing) !== diagnosisFingerprint(diagnosis)) {
        return throwError(() => entryFailure(409, 'CLINICAL_ENTRY_ID_CONFLICT', 'El diagnóstico ya existe con otro contenido.'));
      }
      const persist: Observable<void> = existing
        ? of(undefined)
        : this.workspace.saveState(applyDiagnosisRecord(current.state, diagnosis)).pipe(map(() => undefined));
      return persist.pipe(switchMap(() => this.linkDiagnosis(current.patientId, diagnosis)));
    }).pipe(catchError((failure: unknown) => this.fail(failure, 'No se pudo guardar el diagnóstico.')));
  }

  auditStamp(): ClinicalAuditStamp {
    const user = this.auth.session()?.user;
    const displayName = String(user?.displayName || user?.username || 'Profesional').trim();
    const lastName = displayName.includes(',')
      ? displayName.split(',')[0]?.trim() || 'Profesional'
      : displayName.split(/\s+/).filter(Boolean).at(-1) || 'Profesional';
    return { action: 'cargado', lastName, license: user?.licenseNumber || 's/d', at: new Date().toISOString() };
  }

  professionalName(): string {
    const user = this.auth.session()?.user;
    return String(user?.displayName || user?.username || 'Profesional').trim();
  }

  private linkDiagnosis(patientId: string, diagnosis: DiagnosisRecord): Observable<ClinicalEntrySaveResult<DiagnosisRecord>> {
    const saved = this.requireSamePatient(patientId);
    return this.http.put<unknown>(
      `/api/clinical/patients/${encodeURIComponent(patientId)}/diagnosis`,
      { expectedRevision: saved.revision, diagnosisEntryId: diagnosis.id },
      { withCredentials: true }
    ).pipe(
      map(() => {
        const current = this.requireSamePatient(patientId);
        return { record: diagnosis, state: current.state, revision: current.revision, linked: true, warning: '' };
      }),
      catchError((failure: unknown) => {
        const current = this.requireSamePatient(patientId);
        const message = normalizeEntryFailure(failure, 'No se pudo actualizar el selector de Tratamientos.').message;
        return of({ record: diagnosis, state: current.state, revision: current.revision, linked: false,
          warning: `${message} El diagnóstico quedó guardado en la historia clínica.` });
      })
    );
  }

  private requireEditPermission(): void {
    if (!this.canEdit()) throw entryFailure(403, 'PERMISSION_DENIED', 'Su usuario no tiene permiso para editar la historia clínica.');
  }

  private requireWorkspace() {
    const current = this.workspace.workspace();
    if (!current) throw entryFailure(409, 'ACTIVE_PATIENT_REQUIRED', 'Abra un paciente antes de agregar un registro.');
    return current;
  }

  private requireSamePatient(patientId: string) {
    const current = this.workspace.workspace();
    if (!current || current.patientId !== patientId) {
      throw entryFailure(409, 'CLINICAL_CONTEXT_CHANGED', 'El paciente activo cambió durante el guardado.');
    }
    return current;
  }

  private fail(failure: unknown, fallback: string): Observable<never> {
    return throwError(() => normalizeEntryFailure(failure, fallback));
  }
}

export function normalizeEntryFailure(failure: unknown, fallback: string): ClinicalEntryApiFailure {
  if (isEntryFailure(failure)) return failure;
  if (failure instanceof HttpErrorResponse) {
    const body = asRecord(failure.error);
    return entryFailure(failure.status, String(body['code'] || body['errorCode'] || 'CLINICAL_ENTRY_FAILED'),
      String(body['error'] || body['message'] || failure.message || fallback));
  }
  if (failure instanceof Error) return entryFailure(0, 'CLINICAL_ENTRY_FAILED', failure.message || fallback);
  return entryFailure(0, 'CLINICAL_ENTRY_FAILED', fallback);
}

function entryFailure(status: number, code: string, message: string): ClinicalEntryApiFailure { return { status, code, message }; }
function isEntryFailure(value: unknown): value is ClinicalEntryApiFailure {
  const item = asRecord(value); return Number.isFinite(Number(item['status'])) && Boolean(String(item['message'] || ''));
}
function asRecord(value: unknown): JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}
