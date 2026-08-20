import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, tap, throwError } from 'rxjs';
import {
  OncologyRepositoriesApiFailure,
  TrialScreeningSettingsDraft,
  TrialSourceDraft,
  TrialSourceItem
} from './oncology-repositories.models';
import {
  normalizeOncologyRepositoriesFailure,
  normalizeTrialScreeningMutation,
  normalizeTrialScreeningSettings,
  normalizeTrialSourceCatalog,
  normalizeTrialSourceMutation,
  trialScreeningSettingsPayload,
  trialSourcePayload
} from './oncology-repositories.normalizers';

const CONFIGURATION_UPDATED_EVENT = 'hcop-configuration-updated';

@Injectable({ providedIn: 'root' })
export class OncologyRepositoriesService {
  private readonly http = inject(HttpClient);

  sources(): Observable<readonly TrialSourceItem[]> {
    return this.http.get<unknown>('/api/clinical/configuration/trial-source', {
      params: new HttpParams().set('includeInactive', '1'),
      withCredentials: true
    }).pipe(
      map(normalizeTrialSourceCatalog),
      catchError((failure: unknown) => this.fail(failure, 'No se pudieron abrir las fuentes oncológicas.'))
    );
  }

  createSource(draft: TrialSourceDraft): Observable<TrialSourceItem> {
    return this.http.post<unknown>(
      '/api/clinical/configuration/trial-source',
      trialSourcePayload(draft),
      { withCredentials: true }
    ).pipe(
      map(normalizeTrialSourceMutation),
      tap(() => this.notifyUpdated()),
      catchError((failure: unknown) => this.fail(failure, 'No se pudo crear la fuente oncológica.'))
    );
  }

  updateSource(draft: TrialSourceDraft, active = draft.active): Observable<TrialSourceItem> {
    return this.http.put<unknown>(
      `/api/clinical/configuration/trial-source/${encodeURIComponent(draft.id)}`,
      trialSourcePayload(draft, active),
      { withCredentials: true }
    ).pipe(
      map(normalizeTrialSourceMutation),
      tap(() => this.notifyUpdated()),
      catchError((failure: unknown) => this.fail(failure, 'No se pudo guardar la fuente oncológica.'))
    );
  }

  archiveSource(draft: TrialSourceDraft): Observable<void> {
    return this.http.delete<unknown>(
      `/api/clinical/configuration/trial-source/${encodeURIComponent(draft.id)}`,
      { withCredentials: true }
    ).pipe(
      map(() => undefined),
      tap(() => this.notifyUpdated()),
      catchError((failure: unknown) => this.fail(failure, 'No se pudo desactivar la fuente oncológica.'))
    );
  }

  screeningSettings(): Observable<TrialScreeningSettingsDraft> {
    return this.http.get<unknown>('/api/clinical/configuration/trial-screening-settings', {
      params: new HttpParams().set('includeInactive', '1'),
      withCredentials: true
    }).pipe(
      map(normalizeTrialScreeningSettings),
      catchError((failure: unknown) => this.fail(failure, 'No se pudo leer la política de preselección.'))
    );
  }

  saveScreeningSettings(draft: TrialScreeningSettingsDraft): Observable<TrialScreeningSettingsDraft> {
    const request = draft.id
      ? this.http.put<unknown>(
          `/api/clinical/configuration/trial-screening-settings/${encodeURIComponent(draft.id)}`,
          trialScreeningSettingsPayload(draft),
          { withCredentials: true }
        )
      : this.http.post<unknown>(
          '/api/clinical/configuration/trial-screening-settings',
          trialScreeningSettingsPayload(draft),
          { withCredentials: true }
        );
    return request.pipe(
      map(normalizeTrialScreeningMutation),
      tap(() => this.notifyUpdated()),
      catchError((failure: unknown) => this.fail(failure, 'No se pudo guardar la política de preselección.'))
    );
  }

  private notifyUpdated(): void {
    const timestamp = String(Date.now());
    try { globalThis.localStorage?.setItem(CONFIGURATION_UPDATED_EVENT, timestamp); } catch { /* no-op */ }
    globalThis.window?.dispatchEvent(new CustomEvent(CONFIGURATION_UPDATED_EVENT, { detail: { timestamp } }));
  }

  private fail(failure: unknown, fallback: string): Observable<never> {
    return throwError((): OncologyRepositoriesApiFailure => normalizeOncologyRepositoriesFailure(failure, fallback));
  }
}
