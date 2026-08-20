import type { ClinicalState } from '../../core/patients/patient-workspace.models';
import type { OncologyHistoryEntryDraft, OncologyHistoryEntryKind } from './oncology-history-entry.models';
import {
  OncologyHistoryEntryError,
  applyOncologyHistoryEntry,
  calculateOncologyHistoryMetrics,
  emptyOncologyHistoryDraft,
  isEditableOncologyHistoryRecord,
  oncologyHistoryDraftFromRecord,
  oncologyHistoryEntryBody,
  oncologyHistoryEntryHeading,
  oncologyHistorySectionKey
} from './oncology-history-entry.state';

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
function close(actual: number | null, expected: number, precision: number): void {
  assertions += 1;
  if (actual === null || Math.abs(actual - expected) > precision) {
    throw new Error(`esperado ${expected} ± ${precision}, recibido ${String(actual)}.`);
  }
}
function errorCode(run: () => unknown, expected: OncologyHistoryEntryError['code']): void {
  assertions += 1;
  try {
    run();
  } catch (error) {
    if (error instanceof OncologyHistoryEntryError && error.code === expected) return;
    throw error;
  }
  throw new Error(`se esperaba el error ${expected}.`);
}
function object(value: unknown): Record<string, unknown> { return value as Record<string, unknown>; }

const actor = {
  userId: '77', username: 'oncologa', displayName: 'Dra. Ana Prueba', specialty: 'Oncología', licenseNumber: 'MP 4455'
};
const at = '2026-08-03T14:15:00.000Z';

function state(): ClinicalState {
  return {
    patient: { id: 'p-1', fullName: 'Paciente de prueba' },
    oncology: { diagnosis: 'Carcinoma pulmonar' },
    treatments: [],
    evolutions: [],
    meta: {
      liraImport: { origin: 'local' },
      persistenceRevision: 4,
      sectionVersions: {},
      sectionAudit: {},
      sectionFormModes: {},
      unrelated: 'conservar'
    }
  };
}

function draft(kind: OncologyHistoryEntryKind, overrides: Partial<OncologyHistoryEntryDraft> = {}): OncologyHistoryEntryDraft {
  const common = {
    date: '2026-07-20', diagnosis: 'Carcinoma pulmonar', intent: 'Adyuvante', status: 'Completado',
    institution: 'Centro de prueba', professional: 'Dra. Ana Prueba', weightKg: '75', heightCm: '175'
  };
  const byKind = kind === 'systemic'
    ? { treatmentType: 'Quimioterapia', scheme: 'Carboplatino + Paclitaxel', drugs: 'Carboplatino AUC 5', cycles: '6' }
    : kind === 'radiotherapy'
      ? { targetSite: 'Pulmón derecho', technique: 'IMRT', totalDoseGy: '60', fractions: '30' }
      : { procedure: 'Lobectomía superior derecha', targetSite: 'Pulmón derecho', surgeon: 'Dr. Cirujano' };
  return emptyOncologyHistoryDraft(kind, { ...common, ...byKind, ...overrides });
}

function apply(kind: OncologyHistoryEntryKind, overrides: Partial<OncologyHistoryEntryDraft> = {}, original = null) {
  return applyOncologyHistoryEntry(state(), {
    kind,
    draft: draft(kind, overrides),
    actor,
    original,
    at,
    id: original ? undefined : `${kind}-1`,
    evolutionId: `${kind}-evo-1`
  });
}

test('crea borradores completos y conserva el tipo sistémico por defecto', () => {
  const systemic = emptyOncologyHistoryDraft('systemic');
  equal(systemic.treatmentType, 'Quimioterapia');
  equal(systemic.heightCm, '');
  equal(emptyOncologyHistoryDraft('surgery').treatmentType, '');
});

test('normaliza registros legacy y devuelve siempre la talla en centímetros', () => {
  const projected = oncologyHistoryDraftFromRecord({
    id: 'legacy', date: '2025-01-02', diagnosis: 'Mama', scheme: 'AC-T', heightM: '1,68', weightKg: '70,5'
  }, 'systemic');
  equal(projected.heightCm, '168');
  equal(projected.weightKg, '70.5');
  equal(projected.scheme, 'AC-T');
  equal(projected.diagnosis, 'Mama');
});

test('calcula IMC, superficie corporal y dosis por fracción sin persistir metros en UI', () => {
  const metrics = calculateOncologyHistoryMetrics('75', '175', '60', '30');
  close(metrics.bmi, 24.4898, 0.0001);
  close(metrics.bodySurfaceM2, 1.9031, 0.0001);
  close(metrics.dosePerFractionGy, 2, 0.0001);
  equal(calculateOncologyHistoryMetrics('', '175').bmi, null);
  equal(calculateOncologyHistoryMetrics('75', '175', '60', '').dosePerFractionGy, null);
});

test('carga tratamiento sistémico, auditoría, versión y evolución plana sin mutar origen', () => {
  const source = state();
  const result = applyOncologyHistoryEntry(source, {
    kind: 'systemic', draft: draft('systemic', { notes: 'Buena tolerancia' }), actor, at,
    id: 'systemic-1', evolutionId: 'systemic-evo-1'
  });
  equal(source.treatments?.length, 0);
  equal(result.mode, 'created');
  equal(result.state.treatments?.length, 1);
  equal(result.state.evolutions?.length, 1);
  equal(result.record.category, 'chemotherapy');
  equal(result.record.heightCm, '175');
  equal(object(result.record['oncologyHistory'])['bodySurfaceM2'], 1.9031);
  equal(object(result.evolution.sourceRef)['kind'], 'oncology-history-entry-evolution');
  equal(result.evolution['immutable'], true);
  equal(String(result.evolution.text).includes('Talla: 175 cm'), true);
  equal(object(result.state.meta)['unrelated'], 'conservar');
  const versions = object(object(result.state.meta)['sectionVersions'])['systemicTreatments'] as unknown[];
  equal(versions.length, 1);
  equal(object(versions[0])['reason'], 'Carga inicial');
  equal(object(object(result.state.meta)['sectionFormModes'])['systemicTreatments'], 'structured');
});

test('radioterapia deriva dosis, usa rango real y conserva presentación legible', () => {
  const result = apply('radiotherapy', { endDate: '2026-08-30' });
  equal(result.record.scheme, 'IMRT - Pulmón derecho');
  equal(object(result.record['oncologyHistory'])['dosePerFractionGy'], 2);
  equal(oncologyHistoryEntryHeading(result.record, 'radiotherapy'), '20/07/2026 al 30/08/2026 - IMRT - Pulmón derecho');
  equal(oncologyHistoryEntryBody(result.record, 'radiotherapy').includes('2 Gy/fracción'), true);
  equal(oncologyHistorySectionKey('radiotherapy'), 'radiotherapyTreatments');
});

test('cirugía persiste procedimiento y anatomía patológica completa', () => {
  const result = apply('surgery', { pathology: 'Adenocarcinoma. Márgenes libres.', margins: 'R0' });
  equal(result.record.scheme, 'Lobectomía superior derecha');
  equal(object(result.record['oncologyHistory'])['pathology'], 'Adenocarcinoma. Márgenes libres.');
  equal(String(result.evolution.text).includes('Márgenes: R0'), true);
});

test('edición exige motivo y rechaza cambios cosméticos o motivo aislado', () => {
  const first = apply('systemic').record;
  errorCode(() => applyOncologyHistoryEntry(state(), {
    kind: 'systemic', draft: oncologyHistoryDraftFromRecord(first, 'systemic'), actor, original: first, at
  }), 'REASON_REQUIRED');
  errorCode(() => applyOncologyHistoryEntry(state(), {
    kind: 'systemic', draft: { ...oncologyHistoryDraftFromRecord(first, 'systemic'), reason: 'Sólo motivo' }, actor, original: first, at
  }), 'NO_CHANGES');
  errorCode(() => applyOncologyHistoryEntry(state(), {
    kind: 'systemic', draft: { ...draft('systemic'), status: 'En curso', reason: 'Corrección' }, actor,
    original: { scheme: 'Carboplatino + Paclitaxel', diagnosis: 'Carcinoma pulmonar', date: '2026-07-20' }, at
  }), 'ORIGINAL_REQUIRED');
});

test('edición conserva campos ajenos, agrega historia y una evolución inmutable', () => {
  const first = apply('systemic').record;
  const source = state();
  source.treatments = [{ ...first, custom: 'conservar' }];
  source.evolutions = [{ id: 'previa', text: 'Anterior' }];
  const result = applyOncologyHistoryEntry(source, {
    kind: 'systemic',
    draft: { ...oncologyHistoryDraftFromRecord(first, 'systemic'), status: 'Suspendido', reason: 'Toxicidad grado 3' },
    actor,
    original: source.treatments[0],
    at: '2026-08-04T10:00:00.000Z',
    evolutionId: 'systemic-evo-2'
  });
  equal(result.mode, 'updated');
  equal(result.record['custom'], 'conservar');
  equal((result.record['history'] as unknown[]).length, 1);
  equal(object((result.record['history'] as unknown[])[0])['reason'], 'Toxicidad grado 3');
  equal(result.state.evolutions?.length, 2);
  equal(result.state.treatments?.length, 1);
  const versions = object(object(result.state.meta)['sectionVersions'])['systemicTreatments'] as unknown[];
  equal(versions.length, 2);
  equal(object(versions[1])['reason'], 'Toxicidad grado 3');
});

test('valida fechas, diagnóstico, descripciones principales y antropometría', () => {
  errorCode(() => apply('systemic', { date: '' }), 'DATE_REQUIRED');
  errorCode(() => apply('systemic', { date: '2026-02-30' }), 'DATE_INVALID');
  errorCode(() => apply('systemic', { endDate: '2026-01-01' }), 'END_DATE_BEFORE_START');
  errorCode(() => apply('systemic', { diagnosis: '' }), 'DIAGNOSIS_REQUIRED');
  errorCode(() => apply('systemic', { scheme: '' }), 'SCHEME_REQUIRED');
  errorCode(() => apply('radiotherapy', { targetSite: '' }), 'TARGET_REQUIRED');
  errorCode(() => apply('radiotherapy', { technique: '' }), 'TECHNIQUE_REQUIRED');
  errorCode(() => apply('surgery', { procedure: '' }), 'PROCEDURE_REQUIRED');
  errorCode(() => apply('systemic', { weightKg: '501' }), 'WEIGHT_OUT_OF_RANGE');
  errorCode(() => apply('systemic', { heightCm: '1.75' }), 'HEIGHT_OUT_OF_RANGE');
  errorCode(() => apply('systemic', { cycles: '2.5' }), 'CYCLES_INVALID');
  errorCode(() => apply('radiotherapy', { fractions: '0' }), 'FRACTIONS_INVALID');
  errorCode(() => apply('radiotherapy', { totalDoseGy: '-1' }), 'DOSE_INVALID');
});

test('solo permite edición directa de registros locales materializados', () => {
  const local = apply('systemic').record;
  equal(isEditableOncologyHistoryRecord(local, { treatments: [local] }), true);
  const imported = { id: 'lira-1', sourceRef: { kind: 'lira-oncological-treatment' } };
  equal(isEditableOncologyHistoryRecord(imported, { treatments: [imported] }), false);
  equal(isEditableOncologyHistoryRecord({ id: 'rel-1' }, { treatments: [] }), false);
});

for (const item of tests) item.run();
console.log(`oncology-history-entry.state: ${tests.length} casos, ${assertions} aserciones OK`);
