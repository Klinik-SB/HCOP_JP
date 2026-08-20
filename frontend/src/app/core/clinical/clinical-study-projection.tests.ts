import { clinicalStudyEntries, clinicalStudyRecords } from './clinical-study-projection';
import type { ClinicalState } from '../patients/patient-workspace.models';

let assertions = 0;
function equal(actual: unknown, expected: unknown, message = ''): void {
  assertions += 1;
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message || 'Valor inesperado'}\nactual=${JSON.stringify(actual)}\nesperado=${JSON.stringify(expected)}`);
  }
}

equal(clinicalStudyRecords(undefined), [], 'sin historia no hay estudios');

const state = {
  externalStudies: [
    { id: 'remote-1', date: '2026-07-01', title: 'TAC externa' },
    { id: 'same', date: '2026-06-01', title: 'Versión remota' },
    { id: 'deleted', date: '2026-08-01', title: 'Borrado', deleted: true },
    { id: 'remote-tombstone', date: '2026-08-03', title: 'No debe revivir' },
    { date: '2026-05-01', title: 'Sin ID externo' }
  ],
  studies: [
    { id: 'local-1', date: '2026-08-02', title: 'Laboratorio local' },
    { id: 'same', date: '2026-07-20', title: 'Versión local' },
    { id: 'remote-tombstone', deleted: true },
    { date: '2026-04-01', title: 'Sin ID local' }
  ]
} as ClinicalState;
const original = structuredClone(state);
const projected = clinicalStudyRecords(state);

equal(projected.map((record) => record.title), [
  'Laboratorio local', 'Versión local', 'TAC externa', 'Sin ID externo', 'Sin ID local'
], 'combina, deduplica y ordena');
equal(projected.some((record) => record.id === 'deleted'), false, 'omite borrados');
equal(projected.some((record) => record.id === 'remote-tombstone'), false, 'un tombstone local oculta el registro externo');
equal(projected.filter((record) => record.id === 'same').length, 1, 'un ID se muestra una sola vez');
equal(projected.find((record) => record.id === 'same')?.title, 'Versión local', 'el registro local prevalece');
equal(state, original, 'no muta la historia');
equal(clinicalStudyRecords(state, 'asc').map((record) => record.title), [
  'Sin ID local', 'Sin ID externo', 'TAC externa', 'Versión local', 'Laboratorio local'
], 'la hoja puede conservar el orden cronológico ascendente');
equal(clinicalStudyEntries(state).filter((entry) => !entry.record.id).map((entry) => entry.key), [
  'external:4', 'local:3'
], 'los registros sin ID conservan identidades distintas y compartidas por hoja y panel');

console.log(`clinical-study-projection: 9 casos, ${assertions} aserciones OK`);
