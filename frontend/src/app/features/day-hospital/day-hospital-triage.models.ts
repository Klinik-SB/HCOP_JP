export type TriageQueueFilter = 'all' | 'pending' | 'passed' | 'failed';

export interface TriageSafetyInput {
  readonly neutrophils: unknown;
  readonly platelets: unknown;
  readonly temperatureC: unknown;
  readonly oxygenSaturation: unknown;
  readonly toxicityGrade: unknown;
}

export interface OperationalQueueItem extends Record<string, unknown> {}

export function triageSafetyAlerts(input: TriageSafetyInput): readonly string[] {
  const alerts: string[] = [];
  const neutrophils = number(input.neutrophils);
  const platelets = number(input.platelets);
  const temperature = number(input.temperatureC);
  const saturation = number(input.oxygenSaturation);
  const toxicity = number(input.toxicityGrade);
  if (neutrophils !== null && neutrophils < 1_000) alerts.push('Neutrófilos menores de 1.000/mm³');
  if (platelets !== null && platelets < 75_000) alerts.push('Plaquetas menores de 75.000/mm³');
  if (temperature !== null && temperature >= 38) alerts.push('Temperatura de 38 °C o más');
  if (saturation !== null && saturation < 92) alerts.push('Saturación menor de 92%');
  if (toxicity !== null && toxicity >= 3) alerts.push('Toxicidad CTCAE grado 3 o mayor');
  return alerts;
}

export function filterOperationalQueue(
  items: readonly OperationalQueueItem[],
  query: string,
  filter: TriageQueueFilter
): readonly OperationalQueueItem[] {
  const needle = normalize(query);
  return items.filter((item) => {
    const clinicalStatus = String(item['clinicalAuthorizationStatus'] || '').trim().toLowerCase();
    if (filter !== 'all' && clinicalStatus !== filter) return false;
    if (!needle) return true;
    const appointment = object(item['appointment']);
    const searchable = [
      item['patientName'], item['patientDni'], item['dni'], item['medicalRecord'],
      item['scheme'], item['drugScheme'], item['diagnosis'], item['drugSummary'],
      appointment['chair'], appointment['scheduledAt']
    ].map((value) => String(value || '')).join(' ');
    return normalize(searchable).includes(needle);
  });
}

export function passRequiresJustification(alerts: readonly string[], reason: string): boolean {
  return alerts.length > 0 && reason.trim().length < 10;
}

function number(value: unknown): number | null {
  const normalized = String(value ?? '').trim().replace(',', '.');
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-AR').trim();
}

function object(value: unknown): OperationalQueueItem {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as OperationalQueueItem : {};
}
