export type PharmacyTimeScope = 'today' | 'next7' | 'next30' | 'all';

export type PharmacyQueueFilter =
  | ''
  | 'validation-pending'
  | 'validation-rejected'
  | 'patient-to-bring'
  | 'patient-has-medication'
  | 'received-center'
  | 'pending-supplier'
  | 'reservation-pending'
  | 'reserved';

export interface PharmacyQueueGroup<T extends Record<string, unknown> = Record<string, unknown>> {
  readonly date: string;
  readonly label: string;
  readonly items: readonly T[];
  readonly count: number;
}

export const PHARMACY_PAGE_SIZE = 250;

export function filterPharmacyQueue<T extends Record<string, unknown>>(
  items: readonly T[],
  scope: PharmacyTimeScope,
  status: PharmacyQueueFilter,
  today: string
): T[] {
  const upperDate = scope === 'next7'
    ? addDays(today, 7)
    : scope === 'next30' ? addDays(today, 30) : '';
  return items.filter((item) => {
    const plannedDate = datePart(item['plannedDate']);
    const inScope = scope === 'all'
      || (scope === 'today' && plannedDate === today)
      || ((scope === 'next7' || scope === 'next30')
        && Boolean(plannedDate) && plannedDate >= today && plannedDate < upperDate);
    return inScope && matchesStatus(item, status);
  });
}

export function groupPharmacyQueue<T extends Record<string, unknown>>(
  items: readonly T[]
): PharmacyQueueGroup<T>[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const date = datePart(item['plannedDate']);
    const key = date || 'undated';
    groups.set(key, [...(groups.get(key) || []), item]);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left === 'undated' ? 1 : right === 'undated' ? -1 : left.localeCompare(right))
    .map(([date, rows]) => ({
      date,
      label: date === 'undated' ? 'Sin fecha prevista' : dateLabel(date),
      items: rows,
      count: rows.length
    }));
}

export function pharmacyTraceabilityWarning(workflow: Record<string, unknown>): string {
  const state = text(workflow['pharmacyValidationStatus']).toLowerCase();
  if (!['approved', 'rejected'].includes(state)) return '';
  const expectedAction = state === 'approved'
    ? 'pharmacy_validation_approved'
    : 'pharmacy_validation_rejected';
  const events = array(workflow['auditTrail']);
  let event: Record<string, unknown> | undefined;
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (text(events[index]['action']).toLowerCase() === expectedAction) {
      event = events[index];
      break;
    }
  }
  const missing: string[] = [];
  if (!text(workflow['pharmacyValidatedAt'])) missing.push('fecha');
  if (!event || !text(event['actor'])) missing.push('actor');
  if (!missing.length) return '';
  return `Alerta de trazabilidad: la validación farmacéutica no informa ${joinHuman(missing)}.`;
}

export function pharmacyPrimaryActionLabel(status: unknown): string {
  return text(status).toLowerCase() === 'pending' || !text(status)
    ? 'Validar orden'
    : 'Revalidar orden';
}

export function pharmacyCanModify(workflow: Record<string, unknown>): boolean {
  const preparation = text(workflow['preparationStatus']).toLowerCase();
  const administration = text(workflow['administrationStatus']).toLowerCase();
  return text(workflow['prescriptionStatus']).toLowerCase() === 'confirmed'
    && text(workflow['clinicalAuthorizationStatus']).toLowerCase() !== 'passed'
    && ['not_started', 'cancelled'].includes(preparation || 'not_started')
    && ['not_started', 'withheld'].includes(administration || 'not_started')
    && text(workflow['workflowStatus']).toLowerCase() !== 'completed';
}

export function pharmacyCanReject(workflow: Record<string, unknown>): boolean {
  return pharmacyCanModify(workflow)
    && text(workflow['pharmacyValidationStatus']).toLowerCase() !== 'rejected'
    && text(workflow['stockReservationStatus']).toLowerCase() !== 'reserved';
}

function matchesStatus(item: Record<string, unknown>, filter: PharmacyQueueFilter): boolean {
  if (!filter) return true;
  const validation = text(item['pharmacyValidationStatus']).toLowerCase();
  const source = text(item['medicationSource']).toLowerCase();
  const reservation = text(item['stockReservationStatus']).toLowerCase();
  switch (filter) {
    case 'validation-pending': return !validation || validation === 'pending';
    case 'validation-rejected': return validation === 'rejected';
    case 'patient-to-bring': return source === 'patient_to_bring';
    case 'patient-has-medication': return source === 'patient_has_medication';
    case 'received-center': return source === 'received_center';
    case 'pending-supplier': return source === 'pending_supplier';
    case 'reservation-pending':
      return source === 'center_stock' && validation === 'approved' && reservation !== 'reserved';
    case 'reserved': return reservation === 'reserved';
  }
}

function addDays(date: string, days: number): string {
  const parsed = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return '';
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function datePart(value: unknown): string {
  const valueText = text(value);
  return /^\d{4}-\d{2}-\d{2}/.test(valueText) ? valueText.slice(0, 10) : '';
}

function dateLabel(date: string): string {
  const parsed = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat('es-AR', {
    weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC'
  }).format(parsed);
}

function array(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is Record<string, unknown> => entry !== null && typeof entry === 'object' && !Array.isArray(entry))
    : [];
}

function text(value: unknown): string {
  return value === null || value === undefined ? '' : String(value).trim();
}

function joinHuman(values: readonly string[]): string {
  return values.length < 2 ? values[0] || '' : `${values.slice(0, -1).join(', ')} y ${values.at(-1)}`;
}
