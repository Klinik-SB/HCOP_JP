import {
  ClinicalSaveFailure,
  captureClinicalSaveConflict,
  clinicalConflictCode,
  clinicalSaveConflictView,
  clinicalTransitionBlockCode,
  clinicalSaveFailure
} from './clinical-save-conflict';

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

test('clasifica el conflicto de versión sin interpretar el texto del servidor', () => {
  const failure = clinicalSaveFailure({
    status: 409,
    error: { status: 409, code: 'VERSION_CONFLICT', error: 'Texto variable del servidor' }
  }, 'Fallback');
  equal(failure.code, 'VERSION_CONFLICT');
  equal(failure.status, 409);
  equal(failure.message, 'Otra persona modificó esta historia. El borrador quedó conservado y no se sobrescribió ningún dato.');
});

test('preserva códigos de precondición clínica con mensajes accionables', () => {
  equal(clinicalSaveFailure({ error: { code: 'ACTIVE_PATIENT_REQUIRED' } }, 'Fallback').message, 'Abra nuevamente el paciente antes de guardar.');
  equal(clinicalSaveFailure({ error: { code: 'CLINICAL_REVISION_REQUIRED' } }, 'Fallback').code, 'CLINICAL_REVISION_REQUIRED');
  equal(clinicalSaveFailure({ error: { code: 'CLINICAL_PATIENT_MISMATCH' } }, 'Fallback').message, 'El borrador pertenece a otro paciente y no fue guardado.');
  equal(clinicalSaveFailure({ status: 409, error: { code: 'PENDING_LOCAL_DRAFT' } }, 'Fallback').message, 'Hay cambios clínicos sin guardar en un editor abierto.');
});

test('conserva el error local ya tipado y respeta el fallback genérico', () => {
  const local = new ClinicalSaveFailure('Pendiente', 'PENDING_CLINICAL_CONFLICT', 409);
  equal(clinicalSaveFailure(local, 'Fallback'), local);
  equal(clinicalSaveFailure({}, 'Fallback').message, 'Fallback');
});

test('preserva un 409 sin código sin confundir otros errores con concurrencia', () => {
  equal(clinicalConflictCode(clinicalSaveFailure({ status: 409, error: { error: 'Conflicto' } }, 'Fallback')), 'UNKNOWN_CLINICAL_CONFLICT');
  equal(clinicalConflictCode(clinicalSaveFailure({ status: 500 }, 'Fallback')), '');
});

test('bloquea concurrencia y cambios de paciente sin ocultar el borrador actual', () => {
  const conflict = captureClinicalSaveConflict('A', 2, {}, {});
  equal(clinicalTransitionBlockCode(conflict, 'B', false), 'PENDING_CLINICAL_CONFLICT');
  equal(clinicalTransitionBlockCode(conflict, null, false), 'PENDING_CLINICAL_CONFLICT');
  equal(clinicalTransitionBlockCode(conflict, 'A', false), '');
  equal(clinicalTransitionBlockCode(null, 'A', true), 'CLINICAL_SAVE_IN_PROGRESS');
  equal(clinicalTransitionBlockCode(null, 'A', false, false, true), 'PENDING_LOCAL_DRAFT');
  equal(clinicalTransitionBlockCode(null, null, false, false, true), 'PENDING_LOCAL_DRAFT');
  equal(clinicalTransitionBlockCode(conflict, 'B', false, false, true), 'PENDING_CLINICAL_CONFLICT');
  equal(clinicalTransitionBlockCode(conflict, 'A', false, false, true), 'PENDING_LOCAL_DRAFT');
  equal(clinicalTransitionBlockCode(null, 'A', false, true), 'CLINICAL_CONTEXT_TRANSITION_IN_PROGRESS');
});

test('captura base e intento como copias inmutables independientes', () => {
  const base = { narrative: { summary: 'Base' } };
  const attempted = { narrative: { summary: 'Borrador' } };
  const conflict = captureClinicalSaveConflict(
    '42', 7, base, attempted, '2026-08-02T16:00:00Z', 'VERSION_CONFLICT', 'Conflicto seguro', 'conflict-test'
  );
  base.narrative.summary = 'Base mutada';
  attempted.narrative.summary = 'Borrador mutado';
  equal(conflict.patientId, '42');
  equal(conflict.baseRevision, 7);
  equal(conflict.baseState.narrative?.['summary'], 'Base');
  equal(conflict.attemptedState.narrative?.['summary'], 'Borrador');
  equal(conflict.code, 'VERSION_CONFLICT');
  equal(conflict.message, 'Conflicto seguro');
  equal(conflict.detectedAt, '2026-08-02T16:00:00Z');
  equal(conflict.conflictId, 'conflict-test');
});

test('la vista pública no expone los estados clínicos capturados', () => {
  const conflict = captureClinicalSaveConflict(
    '42', 9, { narrative: { summary: 'Base privada' } },
    { narrative: { summary: 'Borrador privado' } },
    '2026-08-02T17:20:00Z', 'VERSION_CONFLICT', 'Conflicto', 'conflict-private'
  );
  const view = clinicalSaveConflictView(conflict);
  equal(view.conflictId, 'conflict-private');
  equal(view.baseRevision, 9);
  equal('baseState' in view, false);
  equal('attemptedState' in view, false);
});

for (const item of tests) item.run();
console.log(`clinical-save-conflict: ${tests.length} casos, ${assertions} aserciones OK`);
