export interface TreatmentCycleProjectionInput {
  readonly firstCycleDate: string;
  readonly intervalDays: unknown;
  readonly initialCycle: unknown;
  readonly cycleCount: unknown;
  readonly durationMinutes: unknown;
  readonly durationText?: unknown;
}

export interface TreatmentCycleProjectionRow {
  readonly cycle: number;
  readonly dateIso: string;
  readonly dateLabel: string;
  readonly intervalLabel: string;
  readonly durationLabel: string;
}

export const TREATMENT_UI_MAX_CYCLES = 50;
export const TREATMENT_PROJECTION_LIMIT = 12;

export function treatmentCycleProjection(
  input: TreatmentCycleProjectionInput,
  limit = TREATMENT_PROJECTION_LIMIT
): TreatmentCycleProjectionRow[] {
  const first = isoDate(input.firstCycleDate);
  const count = boundedInteger(input.cycleCount, 1, TREATMENT_UI_MAX_CYCLES, 0);
  const initial = boundedInteger(input.initialCycle, 1, TREATMENT_UI_MAX_CYCLES, 1);
  const interval = boundedInteger(input.intervalDays, 0, 3650, 0);
  const visible = boundedInteger(limit, 1, TREATMENT_PROJECTION_LIMIT, TREATMENT_PROJECTION_LIMIT);
  if (!first || count < 1 || (count > 1 && interval < 1)) return [];
  const durationLabel = firstText(input.durationText) || formatTreatmentDuration(input.durationMinutes);
  return Array.from({ length: Math.min(count, visible) }, (_, index) => {
    const date = addUtcDays(first, index * interval);
    return {
      cycle: initial + index,
      dateIso: date,
      dateLabel: localDateLabel(date),
      intervalLabel: index === 0 ? 'Inicio' : `${interval} día${interval === 1 ? '' : 's'} desde el ciclo anterior`,
      durationLabel
    };
  });
}

export function formatTreatmentDuration(value: unknown): string {
  const minutes = boundedInteger(value, 1, 10080, 0);
  if (!minutes) return 'Duración no estimada';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

function isoDate(value: unknown): string {
  const text = String(value ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return '';
  const parsed = new Date(`${text}T12:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text ? '' : text;
}

function addUtcDays(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function localDateLabel(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

function boundedInteger(value: unknown, minimum: number, maximum: number, fallback: number): number {
  const number = Number(value);
  return Number.isInteger(number) && number >= minimum && number <= maximum ? number : fallback;
}

function firstText(value: unknown): string {
  return String(value ?? '').trim();
}
