import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, forkJoin, map, of } from 'rxjs';
import { TreatmentDocumentContext, TreatmentDocumentSnapshot } from './treatment-documents.models';

export interface TreatmentDocumentsLoadResult {
  readonly snapshot: TreatmentDocumentSnapshot;
  readonly warnings: string[];
}

export interface TreatmentDocumentContent {
  readonly body: Blob | string;
  readonly contentType: string;
  readonly fileName: string;
}

interface ApiResult<T> { readonly value?: T; readonly warning?: string; }

@Injectable({ providedIn: 'root' })
export class TreatmentDocumentsService {
  private readonly http = inject(HttpClient);

  load(context: TreatmentDocumentContext): Observable<TreatmentDocumentsLoadResult> {
    const treatmentsUrl = `/api/clinical/patients/${encodeURIComponent(context.patientId)}/treatments`;
    const detailUrl = `${treatmentsUrl}/${encodeURIComponent(context.treatmentId)}/detail`;
    const workflowUrl = `/api/clinical/application-workflows/${encodeURIComponent(context.patientId)}/${encodeURIComponent(context.treatmentId)}/${context.cycle}/${context.applicationDay}`;
    const treatments = this.safeGet<Record<string, unknown>>(treatmentsUrl, 'No se pudo verificar el estado del tratamiento.');
    const detail = this.safeGet<Record<string, unknown>>(detailUrl, 'No se pudo verificar la disponibilidad de los documentos.');
    const workflow = context.cycle !== null && context.applicationDay !== null
      ? this.safeGet<Record<string, unknown>>(workflowUrl, 'La aplicación todavía no tiene circuito operativo.')
      : of<ApiResult<Record<string, unknown>>>({});

    return forkJoin({ treatments, detail, workflow }).pipe(map((result) => {
      const rows = arrayFrom(result.treatments.value, 'treatments', 'oncology');
      const treatment = rows.find((row) => String(row['id'] || '') === context.treatmentId);
      return {
        snapshot: {
          treatment,
          detail: result.detail.value,
          workflow: result.workflow.value
        },
        warnings: [result.treatments.warning, result.detail.warning, result.workflow.warning]
          .filter((warning): warning is string => Boolean(warning))
      };
    }));
  }

  open(url: string, html: boolean): Observable<TreatmentDocumentContent> {
    if (html) {
      return this.http.get(url, {
        responseType: 'text', observe: 'response', withCredentials: true
      }).pipe(map((response) => ({
        body: response.body || '',
        contentType: response.headers.get('content-type') || 'text/html;charset=UTF-8',
        fileName: 'documento.html'
      })));
    }
    return this.http.get(url, {
      responseType: 'blob', observe: 'response', withCredentials: true
    }).pipe(map((response) => ({
      body: response.body || new Blob(),
      contentType: response.headers.get('content-type') || response.body?.type || 'application/octet-stream',
      fileName: contentDispositionFileName(response.headers.get('content-disposition')) || 'documento'
    })));
  }

  private safeGet<T>(url: string, fallback: string): Observable<ApiResult<T>> {
    return this.http.get<T>(url, { withCredentials: true }).pipe(
      map((value) => ({ value })),
      catchError((error: unknown) => of({ warning: treatmentDocumentError(error, fallback) }))
    );
  }
}

export function treatmentDocumentError(error: unknown, fallback: string): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 401) return 'La sesión venció. Ingrese nuevamente para abrir el documento.';
    if (error.status === 403) return 'Su usuario no tiene permiso para abrir este documento.';
    if (error.status === 404) return apiMessage(error) || 'El documento todavía no está disponible en la base clínica local.';
    if (error.status === 0) return 'No se pudo conectar con el servidor clínico.';
    return apiMessage(error) || fallback;
  }
  return error instanceof Error && error.message ? error.message : fallback;
}

function apiMessage(error: HttpErrorResponse): string {
  const body: unknown = error.error;
  if (typeof body === 'string') return body.trim();
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>;
    return String(record['error'] || record['message'] || '').trim();
  }
  return '';
}

function arrayFrom(source: Record<string, unknown> | undefined, ...keys: string[]): Record<string, unknown>[] {
  if (!source) return [];
  for (const key of keys) {
    const value = source[key];
    if (Array.isArray(value)) {
      return value.filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object');
    }
  }
  return [];
}

function contentDispositionFileName(header: string | null): string {
  if (!header) return '';
  const utf = /filename\*=UTF-8''([^;]+)/i.exec(header)?.[1];
  if (utf) {
    try { return decodeURIComponent(utf); } catch { return utf; }
  }
  return /filename="?([^";]+)"?/i.exec(header)?.[1]?.trim() || '';
}
