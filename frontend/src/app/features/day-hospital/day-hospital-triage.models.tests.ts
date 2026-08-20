import assert from 'node:assert/strict';
import test from 'node:test';
import {
  filterOperationalQueue,
  passRequiresJustification,
  triageSafetyAlerts
} from './day-hospital-triage.models';

test('muestra exactamente las alertas clínicas del circuito', () => {
  assert.deepEqual(triageSafetyAlerts({
    neutrophils: '999', platelets: 74_999, temperatureC: '38',
    oxygenSaturation: 91, toxicityGrade: 3
  }), [
    'Neutrófilos menores de 1.000/mm³',
    'Plaquetas menores de 75.000/mm³',
    'Temperatura de 38 °C o más',
    'Saturación menor de 92%',
    'Toxicidad CTCAE grado 3 o mayor'
  ]);
});

test('no alerta en los valores límite seguros', () => {
  assert.deepEqual(triageSafetyAlerts({
    neutrophils: 1_000, platelets: 75_000, temperatureC: 37.9,
    oxygenSaturation: 92, toxicityGrade: 2
  }), []);
});

test('PASS con alerta exige justificación de al menos diez caracteres', () => {
  assert.equal(passRequiresJustification(['alerta'], 'corto'), true);
  assert.equal(passRequiresJustification(['alerta'], 'Justificado'), false);
  assert.equal(passRequiresJustification([], ''), false);
});

test('filtra por estado y busca paciente, DNI, esquema o diagnóstico sin acentos', () => {
  const items = [
    { patientName: 'José Pérez', patientDni: '30111222', scheme: 'FOLFOX', clinicalAuthorizationStatus: 'pending' },
    { patientName: 'Ana Ruiz', diagnosis: 'Cáncer de mama', clinicalAuthorizationStatus: 'passed' },
    { patientName: 'Luis Soto', drugScheme: 'Paclitaxel', clinicalAuthorizationStatus: 'failed' }
  ];
  assert.deepEqual(filterOperationalQueue(items, 'jose', 'pending'), [items[0]]);
  assert.deepEqual(filterOperationalQueue(items, 'cancer', 'passed'), [items[1]]);
  assert.deepEqual(filterOperationalQueue(items, '', 'failed'), [items[2]]);
});
