export type TreatmentDocumentKind =
  | 'consent'
  | 'treatment-sheet'
  | 'prescription'
  | 'qr'
  | 'preparation-label';

export type DocumentAvailability = 'available' | 'pending' | 'unknown' | 'blocked';

export interface TreatmentDocumentContext {
  readonly patientId: string;
  readonly treatmentId: string;
  readonly cycle: number | null;
  readonly applicationDay: number | null;
  readonly sourceCycleId: string;
}

export interface TreatmentDocumentPermissions {
  readonly prescriptionsView: boolean;
  readonly dayHospitalView: boolean;
  readonly preparationManage: boolean;
}

export interface TreatmentDocumentSnapshot {
  readonly treatment?: Record<string, unknown>;
  readonly detail?: Record<string, unknown>;
  readonly workflow?: Record<string, unknown>;
}

export interface TreatmentDocumentAction {
  readonly kind: TreatmentDocumentKind;
  readonly label: string;
  readonly shortLabel: string;
  readonly availability: DocumentAvailability;
  readonly status: string;
  readonly enabled: boolean;
  readonly permission: string;
  readonly url: string;
}

const PREPARED_STATES = new Set(['prepared', 'released']);

export function normalizeDocumentContext(
  patientId: string | number | null | undefined,
  treatmentId: string | number | null | undefined,
  cycle: string | number | null | undefined,
  applicationDay: string | number | null | undefined,
  sourceCycleId: string | number | null | undefined
): TreatmentDocumentContext {
  return {
    patientId: text(patientId),
    treatmentId: text(treatmentId),
    cycle: positiveInteger(cycle),
    applicationDay: positiveInteger(applicationDay),
    sourceCycleId: text(sourceCycleId)
  };
}

export function treatmentDocumentUrl(
  kind: TreatmentDocumentKind,
  context: TreatmentDocumentContext
): string {
  const patientId = encodeURIComponent(context.patientId);
  const treatmentId = encodeURIComponent(context.treatmentId);
  const cycle = String(context.cycle || 1);
  const applicationDay = String(context.applicationDay || 1);
  if (kind === 'consent') {
    return `/api/clinical/treatments/${treatmentId}/consent`;
  }
  if (kind === 'prescription') {
    return `/api/clinical/patients/${patientId}/treatments/${treatmentId}/documents/prescription`;
  }
  if (kind === 'treatment-sheet') {
    return `/api/clinical/patients/${patientId}/treatments/${treatmentId}/documents/treatment-sheet?cycle=${encodeURIComponent(cycle)}`;
  }
  if (kind === 'qr') {
    return `/api/clinical/patients/${patientId}/treatments/${treatmentId}/documents/qr?cycle=${encodeURIComponent(cycle)}&applicationDay=${encodeURIComponent(applicationDay)}`;
  }
  return `/api/clinical/application-workflows/${patientId}/${treatmentId}/${encodeURIComponent(cycle)}/${encodeURIComponent(applicationDay)}/preparation-label`;
}

export function deriveTreatmentDocumentActions(
  context: TreatmentDocumentContext,
  permissions: TreatmentDocumentPermissions,
  snapshot: TreatmentDocumentSnapshot
): TreatmentDocumentAction[] {
  const treatment = snapshot.treatment || {};
  const detail = nestedObject(snapshot.detail, 'detail') || snapshot.detail || {};
  const workflow = nestedObject(snapshot.workflow, 'workflow') || snapshot.workflow || {};
  const actions = object(detail['actions']);
  const availability = object(detail['documentAvailability']);
  const cycle = context.cycle;
  const validTreatment = Boolean(context.treatmentId);
  const validPatientTreatment = Boolean(context.patientId && context.treatmentId);
  const validApplication = validPatientTreatment && cycle !== null && context.applicationDay !== null;

  const consentKnown = booleanValue(treatment['consentAvailable']);
  const consentStatus = firstText(treatment, 'consentStatus', 'estadoConsentimiento') || 'Estado no informado';
  const prescriptionEnabledByDetail = booleanValue(actions['prescription']);
  const prescriptionAvailable = booleanValue(availability['prescription']);
  const sheetEnabled = cycle !== null && includesNumber(actions['treatmentSheetCycles'], cycle);
  const sheetAvailable = cycle !== null && includesNumber(availability['treatmentSheetCycles'], cycle);
  const sheetActionKnown = typeof actions['treatmentSheet'] === 'boolean' || Array.isArray(actions['treatmentSheetCycles']);
  const preparationStatus = firstText(workflow, 'preparationStatus', 'preparation_status').toLowerCase();

  return [
    action(
      'consent', 'Abrir consentimiento', 'Consentimiento',
      permissions.prescriptionsView, validTreatment,
      consentKnown === true ? 'available' : consentKnown === false ? 'pending' : 'unknown',
      consentKnown === true ? consentStatus : consentKnown === false ? consentPendingStatus(consentStatus) : consentStatus,
      'section.prescriptions.view', context
    ),
    action(
      'treatment-sheet', 'Abrir hoja de tratamiento', 'Hoja de tratamiento',
      permissions.prescriptionsView, validPatientTreatment && cycle !== null,
      sheetAvailable || (sheetActionKnown && sheetEnabled) ? 'available' : sheetActionKnown ? 'pending' : 'unknown',
      cycle === null ? 'Seleccione un ciclo' : sheetAvailable || sheetEnabled ? `Ciclo ${cycle}` : 'No disponible para este ciclo',
      'section.prescriptions.view', context
    ),
    action(
      'prescription', 'Abrir prescripción', 'Prescripción',
      permissions.prescriptionsView, validPatientTreatment,
      prescriptionAvailable === true ? 'available' : prescriptionAvailable === false || prescriptionEnabledByDetail === false ? 'pending' : 'unknown',
      prescriptionAvailable === true ? 'Documento disponible' : prescriptionAvailable === false || prescriptionEnabledByDetail === false ? 'Documento pendiente' : 'Disponibilidad por verificar',
      'section.prescriptions.view', context
    ),
    action(
      'qr', 'Imprimir QR de identificación', 'QR',
      permissions.dayHospitalView, validApplication,
      validApplication ? 'available' : 'pending',
      validApplication ? `Ciclo ${cycle} · día ${context.applicationDay}` : 'Seleccione ciclo y día de aplicación',
      'section.day-hospital.view', context
    ),
    action(
      'preparation-label', 'Imprimir etiqueta de preparación', 'Etiqueta',
      permissions.preparationManage, validApplication,
      PREPARED_STATES.has(preparationStatus) ? 'available' : preparationStatus ? 'pending' : 'unknown',
      PREPARED_STATES.has(preparationStatus) ? preparationStatusLabel(preparationStatus) : preparationStatus ? `Preparación: ${preparationStatusLabel(preparationStatus)}` : 'Preparación todavía no confirmada',
      'application.preparation.manage', context
    )
  ];
}

function action(
  kind: TreatmentDocumentKind,
  label: string,
  shortLabel: string,
  permitted: boolean,
  hasContext: boolean,
  availability: DocumentAvailability,
  status: string,
  permission: string,
  context: TreatmentDocumentContext
): TreatmentDocumentAction {
  const resolvedAvailability: DocumentAvailability = !permitted || !hasContext ? 'blocked' : availability;
  const resolvedStatus = !permitted
    ? 'Sin permiso para abrir este documento'
    : !hasContext ? 'Faltan datos de la aplicación' : status;
  return {
    kind, label, shortLabel,
    availability: resolvedAvailability,
    status: resolvedStatus,
    enabled: permitted && hasContext && availability === 'available',
    permission,
    url: treatmentDocumentUrl(kind, context)
  };
}

function positiveInteger(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function text(value: unknown): string {
  return value === null || value === undefined ? '' : String(value).trim();
}

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

function nestedObject(source: Record<string, unknown> | undefined, key: string): Record<string, unknown> | undefined {
  if (!source) return undefined;
  const value = object(source[key]);
  return Object.keys(value).length ? value : undefined;
}

function booleanValue(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1 ? true : value === 0 ? false : null;
  const normalized = text(value).toLowerCase();
  if (['true', '1', 'yes', 'si', 'sí'].includes(normalized)) return true;
  if (['false', '0', 'no'].includes(normalized)) return false;
  return null;
}

function includesNumber(value: unknown, expected: number): boolean {
  return Array.isArray(value) && value.some((item) => Number(item) === expected);
}

function firstText(source: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = text(source[key]);
    if (value) return value;
  }
  return '';
}

function preparationStatusLabel(status: string): string {
  return ({
    not_started: 'no iniciada', in_preparation: 'en preparación', prepared: 'preparada',
    released: 'liberada a sala', cancelled: 'cancelada', discarded: 'descartada'
  } as Record<string, string>)[status] || status.replaceAll('_', ' ');
}

function consentPendingStatus(status: string): string {
  return status.toLocaleLowerCase('es-AR').includes('pendiente')
    ? status : `${status} · documento pendiente`;
}
