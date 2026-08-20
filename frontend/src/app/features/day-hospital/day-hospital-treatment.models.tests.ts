import assert from 'node:assert/strict';
import test from 'node:test';
import {
  TREATMENT_PROJECTION_LIMIT,
  TREATMENT_UI_MAX_CYCLES,
  formatTreatmentDuration,
  treatmentCycleProjection
} from './day-hospital-treatment.models';

test('projects cycle numbers and dates from the selected first cycle', () => {
  const rows = treatmentCycleProjection({
    firstCycleDate: '2026-08-03', intervalDays: 21, initialCycle: 3,
    cycleCount: 4, durationMinutes: 150
  });
  assert.deepEqual(rows.map((row) => [row.cycle, row.dateIso]), [
    [3, '2026-08-03'], [4, '2026-08-24'], [5, '2026-09-14'], [6, '2026-10-05']
  ]);
  assert.equal(rows[1]?.intervalLabel, '21 días desde el ciclo anterior');
  assert.equal(rows[0]?.durationLabel, '2 h 30 min');
});

test('limits the preview to twelve rows without changing the prescribed count', () => {
  const rows = treatmentCycleProjection({
    firstCycleDate: '2026-01-01', intervalDays: 7, initialCycle: 1,
    cycleCount: TREATMENT_UI_MAX_CYCLES, durationMinutes: 60
  });
  assert.equal(rows.length, TREATMENT_PROJECTION_LIMIT);
  assert.equal(rows.at(-1)?.cycle, 12);
});

test('does not project an invalid or ambiguous multi-cycle schedule', () => {
  assert.deepEqual(treatmentCycleProjection({ firstCycleDate: '', intervalDays: 21, initialCycle: 1, cycleCount: 2, durationMinutes: 60 }), []);
  assert.deepEqual(treatmentCycleProjection({ firstCycleDate: '2026-08-03', intervalDays: 0, initialCycle: 1, cycleCount: 2, durationMinutes: 60 }), []);
  assert.deepEqual(treatmentCycleProjection({ firstCycleDate: '2026-08-03', intervalDays: 21, initialCycle: 1, cycleCount: 51, durationMinutes: 60 }), []);
});

test('formats estimated chair duration consistently', () => {
  assert.equal(formatTreatmentDuration(45), '45 min');
  assert.equal(formatTreatmentDuration(60), '1 h');
  assert.equal(formatTreatmentDuration(125), '2 h 5 min');
  assert.equal(formatTreatmentDuration(null), 'Duración no estimada');
});
