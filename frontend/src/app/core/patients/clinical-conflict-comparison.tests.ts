import { captureClinicalSaveConflict } from './clinical-save-conflict';
import {
  acceptsLatestClinicalWorkspace,
  attachLatestClinicalState,
  compareClinicalConflict,
  conflictLatestRequestIdentity,
  detachLatestClinicalState
} from './clinical-conflict-comparison';
import type { PatientWorkspace } from './patient-workspace.models';

interface TestCase { readonly name: string; readonly run: () => void; }
const tests: TestCase[] = [];
let assertions = 0;

function test(name: string, run: () => void): void { tests.push({ name, run }); }
function equal(actual: unknown, expected: unknown, message = ''): void {
  assertions += 1;
  if (!Object.is(actual, expected)) {
    throw new Error(`${message ? `${message}: ` : ''}esperado ${String(expected)}, recibido ${String(actual)}.`);
  }
}

test('distingue cambios del borrador y del servidor por sección', () => {
  const conflict = attachLatestClinicalState(
    captureClinicalSaveConflict('42', 3, { narrative: { summary: 'Base' }, studies: [] }, { narrative: { summary: 'Borrador' }, studies: [] }),
    { narrative: { summary: 'Base' }, studies: [{ id: 'study-1' }] },
    4,
    '2026-08-02T17:00:00Z'
  );
  const comparison = compareClinicalConflict(conflict);
  equal(comparison.draftChanges, 1);
  equal(comparison.serverChanges, 1);
  equal(comparison.overlaps, 0);
  equal(comparison.sections.find((item) => item.key === 'narrative')?.draftChanged, true);
  equal(comparison.sections.find((item) => item.key === 'studies')?.serverChanged, true);
  equal(comparison.latestRevision, 4);
});

test('marca una sección superpuesta sin intentar mezclarla', () => {
  const conflict = attachLatestClinicalState(
    captureClinicalSaveConflict('42', 5, { oncology: { diagnosis: 'A' } }, { oncology: { diagnosis: 'B' } }),
    { oncology: { diagnosis: 'C' } },
    6
  );
  const comparison = compareClinicalConflict(conflict);
  equal(comparison.overlaps, 1);
  equal(comparison.sections.find((item) => item.key === 'diagnosis')?.overlaps, true);
  const detail = comparison.sections.find((item) => item.key === 'diagnosis')?.details[0];
  equal(detail?.baseValue, 'A');
  equal(detail?.draftValue, 'B');
  equal(detail?.serverValue, 'C');
});

test('sin última lectura sólo informa los cambios locales', () => {
  const comparison = compareClinicalConflict(captureClinicalSaveConflict(
    '42', 8, {}, { prescriptions: [{ id: 'rx-1' }] }
  ));
  equal(comparison.latestLoaded, false);
  equal(comparison.draftChanges, 1);
  equal(comparison.serverChanges, 0);
});

test('la última lectura queda clonada y el orden de claves no crea falsos cambios', () => {
  const latest = { narrative: { plan: 'P', summary: 'S' } };
  const conflict = attachLatestClinicalState(
    captureClinicalSaveConflict('42', 2, { narrative: { summary: 'S', plan: 'P' } }, {}),
    latest,
    2
  );
  latest.narrative.summary = 'Mutado';
  const comparison = compareClinicalConflict(conflict);
  equal(conflict.latestState?.narrative?.['summary'], 'S');
  equal(comparison.serverChanges, 0);
});

test('acepta solamente la revisión nueva del mismo conflicto, paciente y solicitud', () => {
  const conflict = captureClinicalSaveConflict(
    '42', 7, {}, {}, '2026-08-02T17:10:00Z', 'VERSION_CONFLICT', 'Conflicto', 'conflict-42'
  );
  const identity = conflictLatestRequestIdentity(conflict, 12);
  const workspace = latestWorkspace('42', 8);
  equal(acceptsLatestClinicalWorkspace(conflict, identity, workspace, 12), true);
  equal(acceptsLatestClinicalWorkspace(conflict, identity, workspace, 13), false);
  equal(acceptsLatestClinicalWorkspace(conflict, identity, latestWorkspace('99', 8), 12), false);
  equal(acceptsLatestClinicalWorkspace(conflict, identity, latestWorkspace('42', 7), 12), false);
  const afterNewerVisibleWorkspace = conflictLatestRequestIdentity(conflict, 12, 9);
  equal(acceptsLatestClinicalWorkspace(conflict, afterNewerVisibleWorkspace, latestWorkspace('42', 8), 12), false);
});

test('rechaza una respuesta tardía cuando el conflicto fue reemplazado o no es de versión', () => {
  const original = captureClinicalSaveConflict(
    '42', 7, {}, {}, '2026-08-02T17:10:00Z', 'VERSION_CONFLICT', 'Conflicto', 'conflict-original'
  );
  const replacement = captureClinicalSaveConflict(
    '42', 7, {}, {}, '2026-08-02T17:11:00Z', 'VERSION_CONFLICT', 'Conflicto', 'conflict-replacement'
  );
  const notComparable = captureClinicalSaveConflict(
    '42', 7, {}, {}, '2026-08-02T17:12:00Z', 'CLINICAL_PATIENT_MISMATCH', 'Identidad', 'conflict-original'
  );
  const identity = conflictLatestRequestIdentity(original, 2);
  equal(acceptsLatestClinicalWorkspace(replacement, identity, latestWorkspace('42', 8), 2), false);
  equal(acceptsLatestClinicalWorkspace(notComparable, identity, latestWorkspace('42', 8), 2), false);
  equal(acceptsLatestClinicalWorkspace(null, identity, latestWorkspace('42', 8), 2), false);
});

test('alinea colecciones por identidad estable y no confunde reordenamiento con cambios', () => {
  const base = { treatments: [
    { id: 'tx-1', scheme: 'Esquema A', status: 'Pendiente' },
    { id: 'tx-2', scheme: 'Esquema B', status: 'Iniciado' }
  ] };
  const reordered = { treatments: [base.treatments[1], base.treatments[0]] };
  const conflict = attachLatestClinicalState(
    captureClinicalSaveConflict('42', 10, base, base),
    reordered,
    11
  );
  const treatment = compareClinicalConflict(conflict).sections.find((item) => item.key === 'treatments');
  equal(treatment?.serverChanged, false);
  equal(treatment?.details.length, 0);
});

test('entrega valores concretos pero acotados para una revisión humana', () => {
  const longText = 'x'.repeat(240);
  const conflict = attachLatestClinicalState(
    captureClinicalSaveConflict(
      '42', 12,
      { narrative: { summary: 'Resumen base' } },
      { narrative: { summary: longText } }
    ),
    { narrative: { summary: 'Resumen confirmado por otro usuario' } },
    13
  );
  const detail = compareClinicalConflict(conflict)
    .sections.find((item) => item.key === 'narrative')?.details[0];
  equal(detail?.label, 'Resumen');
  equal(detail?.baseValue, 'Resumen base');
  equal(detail?.serverValue, 'Resumen confirmado por otro usuario');
  equal(detail?.draftValue.length, 180);
  equal(detail?.draftValue.endsWith('…'), true);
});

test('ignora la revisión de transporte al comparar metadatos clínicos', () => {
  const conflict = attachLatestClinicalState(
    captureClinicalSaveConflict(
      '42', 14,
      { meta: { persistenceRevision: 14, source: 'HCOP' } },
      { meta: { persistenceRevision: 14, source: 'HCOP' } }
    ),
    { meta: { persistenceRevision: 15, source: 'HCOP' } },
    15
  );
  const meta = compareClinicalConflict(conflict).sections.find((item) => item.key === 'meta');
  equal(meta?.serverChanged, false);
  equal(meta?.details.length, 0);
});

test('invalida la última lectura sin tocar base ni borrador', () => {
  const conflict = attachLatestClinicalState(
    captureClinicalSaveConflict('42', 16, { narrative: { summary: 'Base' } }, { narrative: { summary: 'Borrador' } }),
    { narrative: { summary: 'Servidor' } },
    17
  );
  const detached = detachLatestClinicalState(conflict);
  equal(detached.latestState, undefined);
  equal(detached.latestRevision, undefined);
  equal(detached.baseState.narrative?.['summary'], 'Base');
  equal(detached.attemptedState.narrative?.['summary'], 'Borrador');
});

function latestWorkspace(patientId: string, revision: number): PatientWorkspace {
  return {
    ok: true,
    patientId,
    patient: { id: patientId, fullName: 'Paciente QA' },
    state: {},
    revision
  };
}

for (const item of tests) item.run();
console.log(`clinical-conflict-comparison: ${tests.length} casos, ${assertions} aserciones OK`);
