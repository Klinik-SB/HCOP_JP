import assert from 'node:assert/strict';
import test from 'node:test';
import {
  schedulerBlockedReason,
  schedulerInclusiveInfusionRange,
  schedulerMedicationAvailable,
  schedulerMedicationLabel
} from './care-scheduler.models';

test('accepts every pharmacy medication source enabled by the backend', () => {
  for (const medicationSource of ['patient_to_bring', 'patient_has_medication', 'received_center']) {
    const item = { workflowStatus: 'active', prescriptionConfirmed: true, medicationSource, schedulingEligible: true };
    assert.equal(schedulerMedicationAvailable(item), true);
    assert.equal(schedulerBlockedReason(item), '');
  }
});

test('shows the occupied range through its inclusive final minute', () => {
  assert.equal(schedulerInclusiveInfusionRange('2026-08-03T08:30:00-03:00', 60), '08:30 a 09:29');
  assert.equal(schedulerInclusiveInfusionRange('2026-08-03T08:30:00-03:00', 90), '08:30 a 09:59');
  assert.equal(schedulerInclusiveInfusionRange('invalid', 60), '');
});

test('uses backend scheduling eligibility as the authoritative pharmacy gate', () => {
  const item = {
    workflowStatus: 'active', prescriptionConfirmed: true, medicationSource: 'patient_has_medication',
    medicationWithPatient: true, schedulingEligible: false
  };
  assert.match(schedulerBlockedReason(item), /Farmacia/);
});

test('labels medication provenance without reporting false missing medication', () => {
  assert.equal(schedulerMedicationLabel({ medicationSource: 'patient_to_bring' }), 'Debe traerla');
  assert.equal(schedulerMedicationLabel({ medicationSource: 'patient_has_medication' }), 'La tiene el paciente');
  assert.equal(schedulerMedicationLabel({ medicationSource: 'received_center' }), 'Medicación recibida');
  assert.equal(schedulerMedicationLabel({ medicationSource: 'center_stock', stockReservationStatus: 'reserved' }), 'Stock reservado');
  assert.equal(schedulerMedicationLabel({ medicationSource: 'pending_supplier' }), 'Falta medicación');
});
