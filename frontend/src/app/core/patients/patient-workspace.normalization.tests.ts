import type { PatientWorkspace } from './patient-workspace.models';
import { normalizePatientWorkspace } from './patient-workspace.normalization';

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
function workspace(patch: Partial<PatientWorkspace>): PatientWorkspace {
  return {
    ok: true,
    patientId: '1',
    patient: { id: '1', fullName: 'Paciente' },
    state: {},
    revision: 0,
    ...patch
  };
}

test('usa la revisión canónica del envelope superior', () => {
  const normalized = normalizePatientWorkspace(workspace({
    revision: 8,
    document: { revision: 7 },
    state: { meta: { persistenceRevision: 6 } }
  }));
  equal(normalized.revision, 8);
});

test('acepta el envelope anterior con revisión dentro de document', () => {
  const normalized = normalizePatientWorkspace(workspace({
    revision: 0,
    document: { revision: 7, updatedAt: '2026-08-02T12:00:00Z' }
  }));
  equal(normalized.revision, 7);
  equal(normalized.updatedAt, '2026-08-02T12:00:00Z');
});

test('usa persistenceRevision como último fallback compatible', () => {
  const normalized = normalizePatientWorkspace(workspace({
    revision: 0,
    state: { meta: { persistenceRevision: '5' } }
  }));
  equal(normalized.revision, 5);
});

test('rechaza un workspace sin ninguna revisión persistente', () => {
  let message = '';
  try { normalizePatientWorkspace(workspace({ revision: 0 })); }
  catch (error) { message = error instanceof Error ? error.message : String(error); }
  equal(message, 'La base clínica no devolvió una revisión válida de la historia.');
});

for (const item of tests) item.run();
console.log(`patient-workspace-normalization: ${tests.length} casos, ${assertions} aserciones OK`);
