import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { TreatmentWorkflowMutationResponse, TreatmentWorkflowTreatment, TreatmentWorkflowUser, workflowCycle } from './treatment-workflow-actions.models';

@Injectable({ providedIn: 'root' })
export class TreatmentWorkflowActionsService {
  private readonly http = inject(HttpClient);

  suspend(item: TreatmentWorkflowTreatment, request: { kind: 'temporary' | 'definitive'; reason: string; resumeDate?: string }): Observable<TreatmentWorkflowMutationResponse> {
    return this.http.post<TreatmentWorkflowMutationResponse>(this.treatmentEndpoint(item, 'suspend'),
      { ...request, cycleNumber: workflowCycle(item) }, { withCredentials: true });
  }

  resume(item: TreatmentWorkflowTreatment, reason: string): Observable<TreatmentWorkflowMutationResponse> {
    return this.http.post<TreatmentWorkflowMutationResponse>(this.treatmentEndpoint(item, 'resume'), { reason }, { withCredentials: true });
  }

  createRequest(item: TreatmentWorkflowTreatment, request: { type: 'prescription_request' | 'continuity_request'; assignedToUserId: string; message: string }): Observable<TreatmentWorkflowMutationResponse> {
    return this.http.post<TreatmentWorkflowMutationResponse>('/api/clinical/treatment-workflow-requests', {
      ...request, patientId: String(item.patientId), treatmentId: String(item.treatmentId), cycleNumber: workflowCycle(item)
    }, { withCredentials: true });
  }

  users(capability: 'workflow.resolve-prescription' | 'workflow.resolve-continuity'): Observable<TreatmentWorkflowUser[]> {
    const params = new HttpParams().set('capability', capability).set('t', Date.now().toString());
    return this.http.get<unknown>('/api/clinical/users', { params, withCredentials: true }).pipe(map(normalizeUsers));
  }

  private treatmentEndpoint(item: TreatmentWorkflowTreatment, action: 'suspend' | 'resume'): string {
    return `/api/clinical/treatments/${encodeURIComponent(String(item.patientId))}/${encodeURIComponent(String(item.treatmentId))}/${action}`;
  }
}

export function treatmentWorkflowApiMessage(error: unknown, fallback = 'No se pudo completar la acción.'): string {
  if (error instanceof HttpErrorResponse) {
    const body = error.error;
    if (body && typeof body === 'object' && typeof body.error === 'string' && body.error.trim()) return body.error.trim();
    if (typeof body === 'string' && body.trim()) return body.trim();
  }
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

export function treatmentWorkflowUnauthorized(error: unknown): boolean {
  return error instanceof HttpErrorResponse && error.status === 401;
}

function normalizeUsers(payload: unknown): TreatmentWorkflowUser[] {
  const root = record(payload);
  const source = Array.isArray(root['items']) ? root['items'] : Array.isArray(root['users']) ? root['users'] : [];
  return source.map((value) => {
    const item = record(value);
    return { id: text(item['id']), username: text(item['username']), displayName: text(item['displayName']),
      specialty: text(item['specialty']), email: text(item['email']),
      roles: Array.isArray(item['roles']) ? item['roles'] as TreatmentWorkflowUser['roles'] : [] };
  }).filter((user) => Boolean(user.id));
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function text(value: unknown): string { return value === null || value === undefined ? '' : String(value).trim(); }
