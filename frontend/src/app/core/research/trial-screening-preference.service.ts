import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, defer, finalize, map, of, switchMap, tap, throwError } from 'rxjs';
import {
  TrialScreeningPreferenceState,
  isTrialScreeningVersionConflict,
  normalizeTrialScreeningPreference,
  trialScreeningPreferenceUpdate,
  withResearchActive
} from './trial-screening-preference.models';

@Injectable({ providedIn: 'root' })
export class TrialScreeningPreferenceService {
  private readonly http = inject(HttpClient);
  readonly state = signal<TrialScreeningPreferenceState | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');

  load(): Observable<TrialScreeningPreferenceState> {
    return defer(() => {
      this.loading.set(true);
      this.error.set('');
      return this.http.get<unknown>('/api/clinical/trial-screening/me', { withCredentials: true }).pipe(
        map(normalizeTrialScreeningPreference),
        tap((state) => this.state.set(state)),
        catchError((error: unknown) => {
          this.error.set(preferenceFailureMessage(error, 'No se pudo consultar su preferencia de investigación.'));
          return throwError(() => error);
        }),
        finalize(() => this.loading.set(false))
      );
    });
  }

  updateResearchActive(researchActive: boolean): Observable<TrialScreeningPreferenceState> {
    return defer(() => {
      const previous = this.state();
      if (!previous) {
        const error = new Error('La preferencia todavía no está disponible.');
        this.error.set(error.message);
        return throwError(() => error);
      }
      if (this.saving()) {
        const error = new Error('La preferencia ya se está guardando.');
        this.error.set(error.message);
        return throwError(() => error);
      }

      this.saving.set(true);
      this.error.set('');
      this.state.set(withResearchActive(previous, researchActive));
      const request = trialScreeningPreferenceUpdate(researchActive, previous.revision);

      return this.http.put<unknown>('/api/clinical/trial-screening/me', request, { withCredentials: true }).pipe(
        map(normalizeTrialScreeningPreference),
        tap((state) => this.state.set(state)),
        catchError((error: unknown) => {
          const message = preferenceFailureMessage(error, 'No se pudo guardar su preferencia de investigación.');
          this.state.set(previous);
          if (!isTrialScreeningVersionConflict(error)) {
            this.error.set(message);
            return throwError(() => error);
          }
          return this.load().pipe(
            catchError(() => {
              this.state.set(previous);
              return of(previous);
            }),
            switchMap(() => {
              this.error.set(message);
              return throwError(() => error);
            })
          );
        }),
        finalize(() => this.saving.set(false))
      );
    });
  }

  reset(): void {
    this.state.set(null);
    this.loading.set(false);
    this.saving.set(false);
    this.error.set('');
  }
}

function preferenceFailureMessage(error: unknown, fallback: string): string {
  if (error instanceof HttpErrorResponse) {
    const body = isRecord(error.error) ? error.error : {};
    const message = body['error'];
    if (typeof message === 'string' && message.trim()) return message.trim();
  }
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  return fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
