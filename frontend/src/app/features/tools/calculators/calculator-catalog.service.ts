import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, OnDestroy, inject } from '@angular/core';
import { Observable, Subject, catchError, map, shareReplay, throwError } from 'rxjs';
import { normalizeInstitutionalCalculatorCatalog } from './calculator-catalog.adapter';
import {
  CalculatorCatalogApiError,
  InstitutionalCalculatorCatalog
} from './calculator-catalog.models';

const CONFIGURATION_UPDATED_EVENT = 'hcop-configuration-updated';

@Injectable({ providedIn: 'root' })
export class CalculatorCatalogService implements OnDestroy {
  private readonly http = inject(HttpClient);
  private cache: Observable<InstitutionalCalculatorCatalog> | null = null;
  private readonly invalidatedSubject = new Subject<void>();
  private readonly configurationListener = (): void => this.invalidate();
  private readonly storageListener = (event: StorageEvent): void => {
    if (event.key === CONFIGURATION_UPDATED_EVENT) this.invalidate();
  };

  readonly invalidated$ = this.invalidatedSubject.asObservable();

  constructor() {
    globalThis.window?.addEventListener(CONFIGURATION_UPDATED_EVENT, this.configurationListener);
    globalThis.window?.addEventListener('storage', this.storageListener);
  }

  load(force = false): Observable<InstitutionalCalculatorCatalog> {
    if (force) this.cache = null;
    if (this.cache) return this.cache;

    let request!: Observable<InstitutionalCalculatorCatalog>;
    request = this.http.get<unknown>('/api/clinical/tools/calculators', {
      withCredentials: true
    }).pipe(
      map(normalizeInstitutionalCalculatorCatalog),
      catchError((failure: unknown) => {
        if (this.cache === request) this.cache = null;
        return throwError(() => normalizeApiError(failure));
      }),
      shareReplay({ bufferSize: 1, refCount: false })
    );
    this.cache = request;
    return request;
  }

  retry(): Observable<InstitutionalCalculatorCatalog> {
    return this.load(true);
  }

  invalidate(): void {
    this.cache = null;
    this.invalidatedSubject.next();
  }

  ngOnDestroy(): void {
    globalThis.window?.removeEventListener(CONFIGURATION_UPDATED_EVENT, this.configurationListener);
    globalThis.window?.removeEventListener('storage', this.storageListener);
    this.invalidatedSubject.complete();
  }
}

function normalizeApiError(failure: unknown): CalculatorCatalogApiError {
  if (failure instanceof HttpErrorResponse) {
    const body = record(failure.error);
    const fallback = fallbackMessage(failure.status);
    return {
      status: failure.status,
      code: text(body['code']) || text(body['errorCode']) || 'CALCULATOR_CATALOG_REQUEST_FAILED',
      message: text(body['error']) || text(body['message'])
        || (failure.status === 401 || failure.status === 403 ? fallback : failure.message || fallback)
    };
  }
  if (isApiError(failure)) return failure;
  if (failure instanceof Error) {
    return { status: 0, code: 'CALCULATOR_CATALOG_REQUEST_FAILED', message: failure.message || fallbackMessage(0) };
  }
  return { status: 0, code: 'CALCULATOR_CATALOG_REQUEST_FAILED', message: fallbackMessage(0) };
}

function fallbackMessage(status: number): string {
  if (status === 401) return 'La sesion vencio. Ingrese nuevamente para continuar.';
  if (status === 403) return 'No tiene permiso para ejecutar calculadoras clinicas.';
  return 'No se pudo cargar la configuracion institucional de calculadoras.';
}

function isApiError(value: unknown): value is CalculatorCatalogApiError {
  const item = record(value);
  return Number.isFinite(Number(item['status'])) && Boolean(text(item['message']));
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
