import type { ClinicalState } from '../patients/patient-workspace.models';
import {
  CLINICAL_PHYSICAL_EXAM_TEXT_LIMIT,
  ClinicalPhysicalExamEditError,
  applyStructuredPhysicalExamEdit,
  calculatePhysicalExamMetrics,
  formatPhysicalExamPlainText,
  physicalExamBaseline,
  physicalExamLegacySnapshot,
  physicalExamRows,
  supportsStructuredPhysicalExam
} from './clinical-physical-exam-edit';

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
function errorCode(run: () => unknown, expected: ClinicalPhysicalExamEditError['code']): void {
  assertions += 1;
  try {
    run();
  } catch (error) {
    if (error instanceof ClinicalPhysicalExamEditError && error.code === expected) return;
    throw error;
  }
  throw new Error(`se esperaba el error ${expected}.`);
}

const actor = {
  userId: '77', username: 'oncologo', displayName: 'Dra. Ana Prueba', licenseNumber: 'MP-4455'
};
const at = '2026-08-03T14:15:00.000Z';

function localState(overrides: ClinicalState = {}): ClinicalState {
  return {
    patient: { id: '42', fullName: 'Paciente sintetico' },
    exam: {},
    narrative: {},
    meta: {
      liraImport: { origin: 'local', patientId: '42' },
      sectionVersions: {}, sectionAudit: {}, sectionFormModes: {},
      createdAt: '2026-07-01T10:00:00.000Z', persistenceRevision: 3
    },
    ...overrides
  };
}

function edit(state: ClinicalState, overrides: Partial<Parameters<typeof applyStructuredPhysicalExamEdit>[1]> = {}): ClinicalState {
  return applyStructuredPhysicalExamEdit(state, {
    weightKg: '75', heightCm: '175', physicalExam: 'Buen estado general.',
    actor, at, id: 'physical-v1', ...overrides
  });
}

function record(value: unknown): Record<string, unknown> { return value as Record<string, unknown>; }
function meta(state: ClinicalState): Record<string, unknown> { return state.meta as Record<string, unknown>; }
function versions(state: ClinicalState): Array<Record<string, unknown>> {
  return record(meta(state)['sectionVersions'])['physicalExam'] as Array<Record<string, unknown>>;
}

test('detecta compatibilidad estructurada sin convertir formas importadas', () => {
  equal(supportsStructuredPhysicalExam(localState()), true);
  equal(supportsStructuredPhysicalExam(localState({ meta: {
    liraImport: { origin: 'local' }, sectionVersions: { physicalExam: [{ id: 'old' }] }, sectionFormModes: {}
  } })), false);
  equal(supportsStructuredPhysicalExam(localState({ meta: {
    liraImport: { origin: 'migration' }, sectionVersions: {}, sectionFormModes: {}
  } })), false);
  equal(supportsStructuredPhysicalExam(localState({
    exam: { weightKg: 75, heightM: 1.75 },
    meta: { liraImport: { origin: 'migration' }, sectionVersions: {}, sectionFormModes: { physicalExam: 'structured' } }
  })), true);
  equal(supportsStructuredPhysicalExam(localState({ exam: { weightKg: { legacy: true } } })), false);
  equal(supportsStructuredPhysicalExam(localState({ narrative: { physicalExam: ['legacy'] } })), false);
  equal(supportsStructuredPhysicalExam(localState({ exam: { weightKg: 'abc' } })), false);
  equal(supportsStructuredPhysicalExam(localState({ exam: { weightKg: '75,5', heightM: '1,75' } })), true);
  equal(supportsStructuredPhysicalExam({ exam: ['legacy'] } as unknown as ClinicalState), false);
  equal(supportsStructuredPhysicalExam({ narrative: 'legacy' } as unknown as ClinicalState), false);
});

test('recupera la ultima presentación legacy sin revivirla en modo estructurado', () => {
  const legacy = localState({
    exam: { weightKg: { legacy: true } },
    meta: {
      liraImport: { origin: 'migration' }, sectionFormModes: {},
      sectionVersions: { physicalExam: [
        { content: 'Examen anterior' }, { content: 'Examen importado vigente' }
      ] }
    }
  });
  equal(physicalExamLegacySnapshot(legacy), 'Examen importado vigente');
  equal(physicalExamLegacySnapshot({
    ...legacy,
    meta: { ...legacy.meta, sectionFormModes: { physicalExam: 'structured' } }
  }), '');
});

test('presenta la talla siempre en centimetros y detecta la carga inicial', () => {
  const blank = physicalExamBaseline(localState());
  equal(blank.weightKg, '');
  equal(blank.heightCm, '');
  equal(blank.physicalExam, '');
  equal(blank.initial, true);
  const meters = physicalExamBaseline(localState({
    exam: { weightKg: 75, heightM: 1.755 }, narrative: { physicalExam: '  Normal  ' }
  }));
  equal(meters.weightKg, '75');
  equal(meters.heightCm, '175.5');
  equal(meters.physicalExam, 'Normal');
  equal(meters.initial, false);
  equal(physicalExamBaseline(localState({ exam: { heightM: 175 } })).heightCm, '175');
});

test('calcula IMC y superficie corporal con valores de UI en centimetros', () => {
  const metrics = calculatePhysicalExamMetrics('75', '175');
  close(metrics.bmi, 24.4898, 0.0001);
  close(metrics.bodySurfaceM2, 1.9031, 0.0001);
  equal(calculatePhysicalExamMetrics('', '175').bmi, null);
  equal(calculatePhysicalExamMetrics('75', '0').bodySurfaceM2, null);
});

test('segmenta el texto con las mismas filas y el mismo orden que legacy', () => {
  const value = 'Examen físico al ingreso: estable. Corazón: R1 R2. Tórax murmullo conservado. Abdomen blando. SNC sin foco. Tacto rectal sin particularidades.';
  const rows = physicalExamRows(value);
  equal(rows.map((row) => row.label).join('|'), 'Estado general|Corazón|Tórax|Abdomen|SNC|Tacto rectal');
  equal(rows[0].text, 'estable.');
  equal(formatPhysicalExamPlainText(value), [
    'Estado general: estable.', 'Corazón: R1 R2.', 'Tórax: murmullo conservado.',
    'Abdomen: blando.', 'SNC: sin foco.', 'Tacto rectal: sin particularidades.'
  ].join('\n'));
  equal(formatPhysicalExamPlainText('Sin hallazgos relevantes.'), 'Estado general: Sin hallazgos relevantes.');
});

test('primera carga persiste metros, snapshot, auditoria y metadatos sin mutar origen', () => {
  const source = localState({
    exam: { weightKg: '', custom: 'conservar' },
    narrative: { physicalExam: '', unrelated: 'conservar' },
    meta: {
      liraImport: { origin: 'local', patientId: '42' },
      sectionVersions: { studies: [{ id: 'study' }] }, sectionAudit: {},
      sectionFormModes: { studies: 'structured' },
      sectionChangeRequests: { physicalExam: { requestId: 'request-local' } },
      currentProfessional: { specialty: 'Oncologia' }, createdAt: '2026-07-01T10:00:00.000Z'
    }
  });
  const saved = edit(source, { weightKg: '75,5', heightCm: '175.5', physicalExam: '  Buen estado general.  ' });
  equal(source.exam?.['heightM'], undefined);
  equal(saved.exam?.['weightKg'], '75.5');
  equal(saved.exam?.['heightM'], '1.755');
  equal(saved.exam?.['custom'], 'conservar');
  equal(saved.narrative?.['physicalExam'], 'Buen estado general.');
  equal(saved.narrative?.['unrelated'], 'conservar');
  equal(record(meta(saved)['sectionFormModes'])['physicalExam'], 'structured');
  equal(record(record(meta(saved)['sectionChangeRequests'])['physicalExam'])['reason'], 'Carga inicial');
  equal(record(record(meta(saved)['sectionChangeRequests'])['physicalExam'])['requestId'], 'request-local');
  equal(record(meta(saved)['sectionFormModes'])['studies'], 'structured');
  equal(versions(saved).length, 1);
  equal(versions(saved)[0]['content'], 'Peso: 75.5 kg\nTalla: 175.5 cm\nEstado general: Buen estado general.');
  equal(versions(saved)[0]['reason'], 'Carga inicial');
  equal(record(versions(saved)[0]['audit'])['action'], 'cargado');
  equal(record(record(meta(saved)['sectionAudit'])['physicalExam'])['action'], 'cargado');
  equal(meta(saved)['updatedAt'], at);
  equal(record(meta(saved)['currentProfessional'])['specialty'], 'Oncologia');
});

test('primera carga exige al menos un campo y admite cada campo por separado', () => {
  errorCode(() => edit(localState(), { weightKg: '', heightCm: '', physicalExam: ' ' }), 'EMPTY_PHYSICAL_EXAM');
  equal(edit(localState(), { weightKg: '80', heightCm: '', physicalExam: '' }).exam?.['weightKg'], '80');
  equal(edit(localState(), { weightKg: '', heightCm: '180', physicalExam: '' }).exam?.['heightM'], '1.8');
  equal(edit(localState(), { weightKg: '', heightCm: '', physicalExam: 'Sin hallazgos.' }).narrative?.['physicalExam'], 'Sin hallazgos.');
});

test('valida peso, talla en centimetros y acepta limites inclusivos', () => {
  errorCode(() => edit(localState(), { weightKg: 'abc' }), 'WEIGHT_INVALID');
  errorCode(() => edit(localState(), { weightKg: '0.001' }), 'WEIGHT_OUT_OF_RANGE');
  errorCode(() => edit(localState(), { weightKg: '501' }), 'WEIGHT_OUT_OF_RANGE');
  errorCode(() => edit(localState(), { heightCm: 'abc' }), 'HEIGHT_INVALID');
  errorCode(() => edit(localState(), { heightCm: '1.75' }), 'HEIGHT_OUT_OF_RANGE');
  errorCode(() => edit(localState(), { heightCm: '251' }), 'HEIGHT_OUT_OF_RANGE');
  equal(edit(localState(), { weightKg: '0.01', heightCm: '30', physicalExam: '' }).exam?.['heightM'], '0.3');
  equal(edit(localState(), { weightKg: '500', heightCm: '250', physicalExam: '' }).exam?.['heightM'], '2.5');
});

test('modificacion exige motivo, versiona y permite vaciar los tres campos', () => {
  const first = edit(localState());
  errorCode(() => edit(first, { physicalExam: 'Cambio', reason: '' }), 'REASON_REQUIRED');
  const changed = edit(first, {
    id: 'physical-v2', at: '2026-08-03T15:00:00.000Z',
    weightKg: '', heightCm: '', physicalExam: '', reason: 'Mediciones descartadas'
  });
  equal(changed.exam?.['weightKg'], '');
  equal(changed.exam?.['heightM'], '');
  equal(changed.narrative?.['physicalExam'], '');
  equal(versions(changed).length, 2);
  equal(versions(changed)[1]['reason'], 'Mediciones descartadas');
  equal(versions(changed)[1]['content'], 'Sin datos cargados.');
  equal(record(record(meta(changed)['sectionAudit'])['physicalExam'])['action'], 'modificado');
  equal(physicalExamBaseline(changed).initial, false);
});

test('normaliza decimales y rechaza no-op aunque cambie su representacion', () => {
  const first = edit(localState(), { weightKg: '75,0', heightCm: '175.0' });
  errorCode(() => edit(first, {
    weightKg: '75.00', heightCm: '175,00', physicalExam: ' Buen estado general. ', reason: 'No corresponde'
  }), 'NO_CHANGES');
});

test('redondea talla a una decimal en UI y a cuatro en metros persistidos', () => {
  const saved = edit(localState(), { weightKg: '', heightCm: '170.123', physicalExam: '' });
  equal(saved.exam?.['heightM'], '1.701');
  equal(physicalExamBaseline(saved).heightCm, '170.1');
  equal(versions(saved)[0]['content'], 'Talla: 170.1 cm');
});

test('aplica limite al texto y al motivo', () => {
  const tooLong = 'x'.repeat(CLINICAL_PHYSICAL_EXAM_TEXT_LIMIT + 1);
  errorCode(() => edit(localState(), { physicalExam: tooLong }), 'TEXT_TOO_LONG');
  const first = edit(localState());
  errorCode(() => edit(first, { physicalExam: 'Cambio', reason: tooLong }), 'REASON_TOO_LONG');
  equal(edit(localState(), {
    weightKg: '', heightCm: '', physicalExam: 'x'.repeat(CLINICAL_PHYSICAL_EXAM_TEXT_LIMIT)
  }).narrative?.['physicalExam']?.length, CLINICAL_PHYSICAL_EXAM_TEXT_LIMIT);
});

test('conserva una medida heredada fuera de rango si la modificacion no la toca', () => {
  const source = localState({
    exam: { weightKg: '600', heightM: '1.75' }, narrative: { physicalExam: 'Anterior' },
    meta: {
      liraImport: { origin: 'migration' }, sectionFormModes: { physicalExam: 'structured' },
      sectionVersions: { physicalExam: [{
        content: 'Contenido heredado', audit: { action: 'cargado', lastName: 'Legacy', license: 's/d', at }
      }] }
    }
  });
  const changed = edit(source, {
    weightKg: '600', heightCm: '175', physicalExam: 'Actualizado', reason: 'Control clínico'
  });
  equal(changed.exam?.['weightKg'], '600');
  equal(changed.exam?.['heightM'], '1.75');
  equal(changed.narrative?.['physicalExam'], 'Actualizado');
  errorCode(() => edit(source, {
    weightKg: '601', heightCm: '175', physicalExam: 'Anterior', reason: 'Cambio'
  }), 'WEIGHT_OUT_OF_RANGE');
});

test('usa fallback de actor y normaliza contenedores meta invalidos', () => {
  const saved = applyStructuredPhysicalExamEdit(localState({
    meta: {
      liraImport: { origin: 'local' }, sectionVersions: 'invalido', sectionAudit: 9,
      sectionFormModes: null, sectionChangeRequests: [], currentLicense: 'MAT-LEGACY'
    }
  }), {
    weightKg: '', heightCm: '', physicalExam: 'Normal', at, id: 'fallback',
    actor: { userId: 12, username: 'usuario.actual', displayName: '', licenseNumber: '' }
  });
  equal(Array.isArray(record(meta(saved)['sectionVersions'])['physicalExam']), true);
  equal(record(record(meta(saved)['sectionAudit'])['physicalExam'])['action'], 'cargado');
  equal(record(meta(saved)['sectionFormModes'])['physicalExam'], 'structured');
  equal(record(meta(saved)['currentProfessional'])['license'], 'MAT-LEGACY');
  equal(versions(saved)[0]['author'], 'usuario.actual');
});

for (const item of tests) item.run();
console.log(`clinical-physical-exam-edit: ${tests.length} casos, ${assertions} aserciones OK`);
