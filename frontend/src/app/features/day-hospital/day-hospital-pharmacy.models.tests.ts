import assert from 'node:assert/strict';
import test from 'node:test';
import {
  filterPharmacyQueue,
  groupPharmacyQueue,
  pharmacyCanModify,
  pharmacyCanReject,
  pharmacyPrimaryActionLabel,
  pharmacyTraceabilityWarning
} from './day-hospital-pharmacy.models';

const rows = [
  item('1', '2026-08-05', 'pending', 'pending_supplier', 'none'),
  item('2', '2026-08-06', 'rejected', 'patient_to_bring', 'none'),
  item('3', '2026-08-11', 'approved', 'patient_has_medication', 'not_applicable'),
  item('4', '2026-08-12', 'approved', 'received_center', 'not_applicable'),
  item('5', '2026-09-01', 'approved', 'center_stock', 'none'),
  item('6', '2026-09-02', 'approved', 'center_stock', 'reserved'),
  item('7', '', 'approved', 'center_stock', 'reserved')
];

test('applies today, seven-day, thirty-day and all pharmacy scopes', () => {
  assert.deepEqual(ids(filterPharmacyQueue(rows, 'today', '', '2026-08-05')), ['1']);
  assert.deepEqual(ids(filterPharmacyQueue(rows, 'next7', '', '2026-08-05')), ['1', '2', '3']);
  assert.deepEqual(ids(filterPharmacyQueue(rows, 'next30', '', '2026-08-05')), ['1', '2', '3', '4', '5', '6']);
  assert.deepEqual(ids(filterPharmacyQueue(rows, 'all', '', '2026-08-05')), ['1', '2', '3', '4', '5', '6', '7']);
});

test('filters every pharmacy state without conflating source and stock', () => {
  assert.deepEqual(ids(filterPharmacyQueue(rows, 'all', 'validation-pending', '2026-08-05')), ['1']);
  assert.deepEqual(ids(filterPharmacyQueue(rows, 'all', 'validation-rejected', '2026-08-05')), ['2']);
  assert.deepEqual(ids(filterPharmacyQueue(rows, 'all', 'patient-to-bring', '2026-08-05')), ['2']);
  assert.deepEqual(ids(filterPharmacyQueue(rows, 'all', 'patient-has-medication', '2026-08-05')), ['3']);
  assert.deepEqual(ids(filterPharmacyQueue(rows, 'all', 'received-center', '2026-08-05')), ['4']);
  assert.deepEqual(ids(filterPharmacyQueue(rows, 'all', 'pending-supplier', '2026-08-05')), ['1']);
  assert.deepEqual(ids(filterPharmacyQueue(rows, 'all', 'reservation-pending', '2026-08-05')), ['5']);
  assert.deepEqual(ids(filterPharmacyQueue(rows, 'all', 'reserved', '2026-08-05')), ['6', '7']);
});

test('groups by planned date, sorts undated rows last and exposes counts', () => {
  const groups = groupPharmacyQueue([rows[2], rows[1], rows[0], rows[6]]);
  assert.deepEqual(groups.map((group) => [group.date, group.count]), [
    ['2026-08-05', 1], ['2026-08-06', 1], ['2026-08-11', 1], ['undated', 1]
  ]);
  assert.match(groups[0].label, /05\/08\/2026/);
});

test('warns when a completed pharmacy validation lacks actor or date', () => {
  assert.equal(pharmacyTraceabilityWarning({ pharmacyValidationStatus: 'pending' }), '');
  assert.match(pharmacyTraceabilityWarning({
    pharmacyValidationStatus: 'approved', pharmacyValidatedAt: '2026-08-05T12:00:00Z', auditTrail: []
  }), /actor/);
  assert.match(pharmacyTraceabilityWarning({
    pharmacyValidationStatus: 'rejected',
    auditTrail: [{ action: 'pharmacy_validation_rejected', actor: 'Farmacéutica Test' }]
  }), /fecha/);
  assert.equal(pharmacyTraceabilityWarning({
    pharmacyValidationStatus: 'approved', pharmacyValidatedAt: '2026-08-05T12:00:00Z',
    auditTrail: [{ action: 'pharmacy_validation_approved', actor: 'Farmacéutica Test' }]
  }), '');
});

test('derives validation actions from the same transition gates as the backend', () => {
  const editable = {
    prescriptionStatus: 'confirmed', clinicalAuthorizationStatus: 'pending',
    preparationStatus: 'not_started', administrationStatus: 'not_started', workflowStatus: 'medication_pending',
    pharmacyValidationStatus: 'pending', stockReservationStatus: 'none'
  };
  assert.equal(pharmacyPrimaryActionLabel('pending'), 'Validar orden');
  assert.equal(pharmacyPrimaryActionLabel('rejected'), 'Revalidar orden');
  assert.equal(pharmacyCanModify(editable), true);
  assert.equal(pharmacyCanReject(editable), true);
  assert.equal(pharmacyCanModify({ ...editable, clinicalAuthorizationStatus: 'passed' }), false);
  assert.equal(pharmacyCanReject({ ...editable, stockReservationStatus: 'reserved' }), false);
  assert.equal(pharmacyCanReject({ ...editable, pharmacyValidationStatus: 'rejected' }), false);
});

function item(id: string, plannedDate: string, validation: string, source: string, reservation: string) {
  return {
    id, plannedDate, pharmacyValidationStatus: validation,
    medicationSource: source, stockReservationStatus: reservation
  };
}

function ids(items: readonly Record<string, unknown>[]): string[] {
  return items.map((entry) => String(entry['id']));
}
