import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, Subject, catchError, map, shareReplay, throwError } from 'rxjs';
import { ClinicalState } from '../../core/patients/patient-workspace.models';
import { PatientWorkspaceService } from '../../core/patients/patient-workspace.service';
import { ResearchRecord, ResearchTemplateCatalog, normalizeResearchTemplateCatalog } from './research.models';

const CONFIGURATION_UPDATED_EVENT = 'hcop-configuration-updated';

export interface ResearchApiFailure {
  readonly status: number;
  readonly code: string;
  readonly message: string;
}

@Injectable({ providedIn: 'root' })
export class ResearchService {
  private readonly http = inject(HttpClient);
  private readonly workspace = inject(PatientWorkspaceService);
  private templateCache: Observable<ResearchTemplateCatalog> | null = null;
  private readonly invalidatedSubject = new Subject<void>();
  private readonly configurationListener = (): void => this.invalidateTemplates();
  private readonly storageListener = (event: StorageEvent): void => {
    if (event.key === CONFIGURATION_UPDATED_EVENT) this.invalidateTemplates();
  };

  readonly invalidated$ = this.invalidatedSubject.asObservable();

  constructor() {
    globalThis.window?.addEventListener(CONFIGURATION_UPDATED_EVENT, this.configurationListener);
    globalThis.window?.addEventListener('storage', this.storageListener);
  }

  templates(force = false): Observable<ResearchTemplateCatalog> {
    if (force) this.templateCache = null;
    if (this.templateCache) return this.templateCache;
    let request!: Observable<ResearchTemplateCatalog>;
    request = this.http.get<unknown>('/api/clinical/research/forms', { withCredentials: true }).pipe(
      map(normalizeResearchTemplateCatalog),
      catchError((failure: unknown) => {
        if (this.templateCache === request) this.templateCache = null;
        return throwError(() => normalizeResearchFailure(failure, 'No se pudieron cargar los formularios configurables.'));
      }),
      shareReplay({ bufferSize: 1, refCount: false })
    );
    this.templateCache = request;
    return request;
  }

  saveRecord(record: ResearchRecord): Observable<unknown> {
    const current = this.workspace.workspace();
    if (!current) {
      return throwError(() => researchFailure(409, 'ACTIVE_PATIENT_REQUIRED', 'Abra un paciente antes de registrar investigación.'));
    }
    const next = structuredClone(current.state) as ClinicalState;
    next.researchRecords = [...(next.researchRecords || []), structuredClone(record)];
    next.meta = { ...(next.meta || {}), updatedAt: record.audit.at };
    return this.workspace.saveState(next);
  }

  invalidateTemplates(): void {
    this.templateCache = null;
    this.invalidatedSubject.next();
  }
}

export function normalizeResearchFailure(failure: unknown, fallback: string): ResearchApiFailure {
  const response = failure && typeof failure === 'object' ? failure as Record<string, unknown> : {};
  const body = response['error'] && typeof response['error'] === 'object' ? response['error'] as Record<string, unknown> : {};
  const status = Number(response['status']);
  return researchFailure(
    Number.isFinite(status) ? status : 0,
    String(body['code'] || ''),
    String(body['error'] || body['message'] || fallback)
  );
}

function researchFailure(status: number, code: string, message: string): ResearchApiFailure {
  return { status, code, message };
}
