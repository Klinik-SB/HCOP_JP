export type SchedulerItem = Record<string, unknown>;

const CLINIC_TIME_ZONE = 'America/Argentina/Buenos_Aires';
const CLINIC_CLOCK_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: CLINIC_TIME_ZONE
});

const READY_MEDICATION_SOURCES = new Set([
  'patient_to_bring',
  'patient_has_medication',
  'received_center'
]);

export function schedulerMedicationAvailable(item: SchedulerItem): boolean {
  if (item['schedulingEligible'] === true) return true;
  const source = String(item['medicationSource'] || '').trim().toLowerCase();
  if (READY_MEDICATION_SOURCES.has(source)) return true;
  return Boolean(item['medicationReceived'])
    || Boolean(item['medicationWithPatient'])
    || ['reserved', 'available'].includes(String(item['stockReservationStatus'] || '').trim().toLowerCase());
}

export function schedulerMedicationLabel(item: SchedulerItem): string {
  const source = String(item['medicationSource'] || '').trim().toLowerCase();
  if (Boolean(item['medicationReceived']) || source === 'received_center') return 'Medicación recibida';
  if (Boolean(item['medicationWithPatient']) || source === 'patient_has_medication') return 'La tiene el paciente';
  if (source === 'patient_to_bring') return 'Debe traerla';
  if (['reserved', 'available'].includes(String(item['stockReservationStatus'] || '').trim().toLowerCase())) return 'Stock reservado';
  return 'Falta medicación';
}

export function schedulerBlockedReason(item: SchedulerItem): string {
  if (String(item['workflowStatus'] || item['continuityState'] || 'active') !== 'active') {
    return 'El tratamiento está suspendido o discontinuado.';
  }
  if (!Boolean(item['prescriptionConfirmed'])) return 'Falta confirmar la prescripción.';
  if (item['schedulingEligible'] === false) {
    return 'Farmacia todavía no habilitó esta aplicación para recibir turno.';
  }
  if (!schedulerMedicationAvailable(item)) return 'Falta confirmar la disponibilidad de la medicación.';
  return '';
}

export function schedulerInclusiveInfusionRange(scheduledAt: unknown, durationMinutes: unknown): string {
  const start = new Date(String(scheduledAt ?? ''));
  const duration = Number(durationMinutes);
  if (Number.isNaN(start.getTime()) || !Number.isFinite(duration) || duration < 1) return '';
  const end = new Date(start.getTime() + duration * 60_000 - 60_000);
  return `${clockLabel(start)} a ${clockLabel(end)}`;
}

function clockLabel(value: Date): string {
  return CLINIC_CLOCK_FORMATTER.format(value);
}
