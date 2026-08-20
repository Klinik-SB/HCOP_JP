export const CLINICAL_INBOX_PERMISSIONS = {
  resolvePrescription: 'workflow.resolve-prescription',
  resolveContinuity: 'workflow.resolve-continuity'
} as const;

export type ClinicalInboxPermission =
  typeof CLINICAL_INBOX_PERMISSIONS[keyof typeof CLINICAL_INBOX_PERMISSIONS];
export type ClinicalInboxRequestType = 'prescription_request' | 'continuity_request';
export type ClinicalInboxStatus = 'pending' | 'resolved' | string;
export type PrescriptionResolution = 'prescription_confirmed' | 'prescription_rejected';
export type ContinuityResolution = 'continue' | 'temporary_hold' | 'discontinued';
export type ClinicalInboxResolution = PrescriptionResolution | ContinuityResolution;

export interface ClinicalInboxContext {
  patientName?: string;
  patientDni?: string;
  scheme?: string;
  diagnosis?: string;
  [key: string]: unknown;
}

export interface ClinicalInboxItem {
  id: string;
  type: ClinicalInboxRequestType;
  status: ClinicalInboxStatus;
  patientId: string;
  treatmentId: string;
  cycleNumber: number;
  message: string;
  context: ClinicalInboxContext;
  resolution: string;
  resolutionReason: string;
  resumeDate: string | null;
  seen: boolean;
  seenAt: string | null;
  createdAt: string | null;
  patientName: string;
  patientDni: string;
  scheme: string;
  diagnosis: string;
  requestedByDisplayName: string;
  assignedToDisplayName: string;
}

export interface ClinicalInboxPage {
  ok: boolean;
  items: ClinicalInboxItem[];
  total: number;
}

export interface ClinicalInboxResolutionRequest {
  resolution: ClinicalInboxResolution;
  reason: string;
  resumeDate?: string;
}

export interface ClinicalInboxMutationResponse {
  ok: boolean;
  item?: ClinicalInboxItem;
  evolution?: Record<string, unknown>;
  documentRevision?: number;
  [key: string]: unknown;
}

export interface ClinicalInboxResolvedEvent {
  request: ClinicalInboxItem;
  decision: ClinicalInboxResolutionRequest;
  response: ClinicalInboxMutationResponse;
}

export interface ClinicalInboxResolutionOption {
  value: ClinicalInboxResolution;
  label: string;
}

export const PRESCRIPTION_RESOLUTIONS: readonly ClinicalInboxResolutionOption[] = [
  { value: 'prescription_confirmed', label: 'Prescripción confirmada' },
  { value: 'prescription_rejected', label: 'Rechazar solicitud' }
];

export const CONTINUITY_RESOLUTIONS: readonly ClinicalInboxResolutionOption[] = [
  { value: 'continue', label: 'Continuar tratamiento' },
  { value: 'temporary_hold', label: 'Suspender transitoriamente' },
  { value: 'discontinued', label: 'Suspender definitivamente' }
];

export function clinicalInboxPermission(type: ClinicalInboxRequestType): ClinicalInboxPermission {
  return type === 'continuity_request'
    ? CLINICAL_INBOX_PERMISSIONS.resolveContinuity
    : CLINICAL_INBOX_PERMISSIONS.resolvePrescription;
}

export function clinicalInboxResolutionOptions(
  type: ClinicalInboxRequestType
): readonly ClinicalInboxResolutionOption[] {
  return type === 'continuity_request' ? CONTINUITY_RESOLUTIONS : PRESCRIPTION_RESOLUTIONS;
}

export function clinicalInboxResolutionNeedsReason(
  resolution: ClinicalInboxResolution | ''
): boolean {
  return resolution === 'prescription_rejected'
    || resolution === 'temporary_hold'
    || resolution === 'discontinued';
}

export function normalizeClinicalInboxPage(payload: unknown): ClinicalInboxPage {
  const root = asRecord(payload);
  const source = Array.isArray(payload)
    ? payload
    : firstArray(root['items'], root['requests'], root['inbox'], root['tasks']);
  const items = source.map(normalizeClinicalInboxItem).filter((item): item is ClinicalInboxItem => item !== null);
  return {
    ok: root['ok'] !== false,
    items,
    total: numberValue(root['total'], items.length)
  };
}

export function normalizeClinicalInboxItem(value: unknown): ClinicalInboxItem | null {
  const raw = asRecord(value);
  const id = text(raw['id']);
  if (!id) return null;
  const context = asRecord(raw['context']) as ClinicalInboxContext;
  const typeText = text(raw['type'] ?? raw['requestType']).toLowerCase();
  if (typeText !== 'prescription_request' && typeText !== 'continuity_request') return null;
  const type: ClinicalInboxRequestType = typeText;
  return {
    id,
    type,
    status: text(raw['status']) || 'pending',
    patientId: text(raw['patientId']),
    treatmentId: text(raw['treatmentId']),
    cycleNumber: Math.max(1, numberValue(raw['cycleNumber'], 1)),
    message: text(raw['message'] ?? raw['reason']),
    context,
    resolution: text(raw['resolution']),
    resolutionReason: text(raw['resolutionReason']),
    resumeDate: nullableText(raw['resumeDate']),
    seen: raw['seen'] === true || Boolean(nullableText(raw['seenAt'])),
    seenAt: nullableText(raw['seenAt']),
    createdAt: nullableText(raw['createdAt']),
    patientName: text(raw['patientName'] ?? context['patientName']),
    patientDni: text(raw['patientDni'] ?? context['patientDni']),
    scheme: text(raw['scheme'] ?? raw['treatmentName'] ?? context['scheme']),
    diagnosis: text(raw['diagnosis'] ?? context['diagnosis']),
    requestedByDisplayName: text(
      raw['requestedByDisplayName'] ?? raw['requestedByName'] ?? raw['createdByName']
    ),
    assignedToDisplayName: text(raw['assignedToDisplayName'] ?? raw['assignedToName'])
  };
}

function firstArray(...values: unknown[]): unknown[] {
  return values.find(Array.isArray) as unknown[] | undefined ?? [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown): string {
  return value === null || value === undefined ? '' : String(value).trim();
}

function nullableText(value: unknown): string | null {
  const result = text(value);
  return result || null;
}

function numberValue(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
