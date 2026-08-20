import {
  CLINICAL_CURRENT_ILLNESS_TEXT_LIMIT,
  ClinicalCurrentIllnessEditError,
  applyStructuredCurrentIllnessEdit,
  currentIllnessBaseline,
  supportsStructuredCurrentIllness
} from './clinical-current-illness-edit';
import type { ClinicalState } from '../patients/patient-workspace.models';

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
function truthy(value: unknown, message = 'se esperaba un valor verdadero'): void {
  assertions += 1;
  if (!value) throw new Error(message);
}
function errorCode(run: () => unknown, expected: ClinicalCurrentIllnessEditError['code']): void {
  assertions += 1;
  try {
    run();
  } catch (error) {
    if (error instanceof ClinicalCurrentIllnessEditError && error.code === expected) return;
    throw error;
  }
  throw new Error(`se esperaba el error ${expected}.`);
}
function errorMessage(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (error instanceof ClinicalCurrentIllnessEditError) return error.message;
    throw error;
  }
  throw new Error('se esperaba un ClinicalCurrentIllnessEditError.');
}

const actor = {
  userId: '77', username: 'oncologo', displayName: 'Dra. Ana Prueba', licenseNumber: 'MP-4455'
};
const at = '2026-08-02T20:50:00.000Z';

function localState(overrides: ClinicalState = {}): ClinicalState {
  return {
    patient: { id: '42', fullName: 'Paciente sintético' },
    narrative: {},
    meta: {
      liraImport: { origin: 'local', patientId: '42' },
      sectionVersions: {}, sectionAudit: {}, sectionFormModes: {},
      createdAt: '2026-07-01T10:00:00.000Z', persistenceRevision: 3
    },
    ...overrides
  };
}

function edit(state: ClinicalState, overrides: Record<string, unknown> = {}): ClinicalState {
  return applyStructuredCurrentIllnessEdit(state, {
    currentIllness: 'Inició con dolor lumbar de tres meses de evolución', actor, at,
    id: 'illness-v1', ...overrides
  });
}

function meta(state: ClinicalState): Record<string, unknown> {
  return state.meta as Record<string, unknown>;
}
function record(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}
function versions(state: ClinicalState): Array<Record<string, unknown>> {
  return record(meta(state)['sectionVersions'])['currentIllness'] as Array<Record<string, unknown>>;
}

test('reproduce la compatibilidad structured/local del legacy para currentIllness', () => {
  equal(supportsStructuredCurrentIllness(localState()), true);
  equal(supportsStructuredCurrentIllness(localState({ meta: {
    liraImport: { origin: 'local' }, sectionVersions: { currentIllness: [{ id: 'old' }] }, sectionFormModes: {}
  } })), false);
  equal(supportsStructuredCurrentIllness(localState({ meta: {
    liraImport: { origin: 'migration' }, sectionVersions: {}, sectionFormModes: {}
  } })), false);
  equal(supportsStructuredCurrentIllness(localState({ meta: {
    liraImport: { origin: 'migration' }, sectionVersions: { currentIllness: [{ id: 'old' }] },
    sectionFormModes: { currentIllness: 'structured' }
  } })), true);
  equal(supportsStructuredCurrentIllness({ meta: {
    sectionFormModes: { currentIllness: 'structured' }
  } }), true);
});

test('rechaza valores legacy no textuales sin convertirlos ni perderlos', () => {
  const objectValue = localState({
    narrative: { currentIllness: { formato: 'legacy', texto: 'No convertir' } },
    meta: {
      liraImport: { origin: 'migration' }, sectionVersions: { currentIllness: [{ id: 'old' }] },
      sectionFormModes: { currentIllness: 'structured' }
    }
  });
  const arrayValue = localState({
    narrative: { currentIllness: ['Inicio', 'legacy'] },
    meta: { liraImport: { origin: 'local' }, sectionVersions: {}, sectionFormModes: {} }
  });
  const numericValue = localState({
    narrative: { currentIllness: 7 },
    meta: { liraImport: { origin: 'local' }, sectionVersions: {}, sectionFormModes: {} }
  });

  equal(supportsStructuredCurrentIllness(objectValue), false);
  equal(supportsStructuredCurrentIllness(arrayValue), false);
  equal(supportsStructuredCurrentIllness(numericValue), false);
  errorCode(() => edit(objectValue), 'STRUCTURED_CURRENT_ILLNESS_UNSUPPORTED');
  errorCode(() => edit(arrayValue), 'STRUCTURED_CURRENT_ILLNESS_UNSUPPORTED');
  errorCode(() => edit(numericValue), 'STRUCTURED_CURRENT_ILLNESS_UNSUPPORTED');
  equal(record(objectValue.narrative?.['currentIllness'])['texto'], 'No convertir');
  equal(supportsStructuredCurrentIllness(localState({ narrative: { currentIllness: null } })), true);
});

test('expone baseline e identifica carga inicial usando texto e historial', () => {
  const blank = currentIllnessBaseline(localState());
  equal(blank.currentIllness, '');
  equal(blank.initial, true);

  const existing = currentIllnessBaseline(localState({ narrative: { currentIllness: 'Cuadro de tres meses' } }));
  equal(existing.currentIllness, 'Cuadro de tres meses');
  equal(existing.initial, false);

  const spaced = localState({ narrative: { currentIllness: '  Cuadro heredado  ' } });
  equal(currentIllnessBaseline(spaced).currentIllness, 'Cuadro heredado');
  errorCode(() => edit(spaced, {
    currentIllness: 'Cuadro heredado', reason: 'No corresponde'
  }), 'NO_CHANGES');

  const clearedWithHistory = currentIllnessBaseline(localState({
    narrative: { currentIllness: '' },
    meta: {
      liraImport: { origin: 'local' }, sectionFormModes: { currentIllness: 'structured' },
      sectionVersions: { currentIllness: [{ id: 'previous' }] }
    }
  }));
  equal(clearedWithHistory.initial, false);
});

test('la carga inicial exige contenido y persiste sólo las claves de currentIllness', () => {
  const source = localState({
    narrative: { currentIllness: '', unrelated: 'conservar' },
    meta: {
      liraImport: { origin: 'local', patientId: '42' },
      sectionVersions: { studies: [{ id: 'study-version' }] },
      sectionAudit: { studies: { action: 'cargado' } },
      sectionFormModes: { studies: 'structured' },
      sectionChangeRequests: {
        studies: { reason: 'preservar' },
        currentIllness: { requestId: 'request-local' }
      },
      currentProfessional: { specialty: 'Oncología', custom: 'dato' },
      createdAt: '2026-07-01T10:00:00.000Z', persistenceRevision: 3,
      unknownMeta: { safe: true }
    },
    customRoot: { preserved: true }
  } as ClinicalState & { customRoot: unknown });

  errorCode(() => edit(localState(), { currentIllness: ' \n ' }), 'EMPTY_CURRENT_ILLNESS');
  const saved = edit(source, { currentIllness: '  Dolor lumbar progresivo  ' });

  equal(source.narrative?.['currentIllness'], '');
  equal(saved.narrative?.['currentIllness'], 'Dolor lumbar progresivo');
  equal(saved.narrative?.['unrelated'], 'conservar');
  equal(record(meta(saved)['sectionFormModes'])['currentIllness'], 'structured');
  equal(record(meta(saved)['sectionFormModes'])['chiefComplaint'], undefined);
  equal(record(record(meta(saved)['sectionChangeRequests'])['currentIllness'])['reason'], 'Carga inicial');
  equal(record(record(meta(saved)['sectionChangeRequests'])['currentIllness'])['requestId'], 'request-local');
  equal(record(record(meta(saved)['sectionChangeRequests'])['studies'])['reason'], 'preservar');
  equal(record(meta(saved)['sectionVersions'])['studies'] !== undefined, true);
  equal(meta(saved)['unknownMeta'], meta(source)['unknownMeta']);
  equal((saved as ClinicalState & { customRoot: unknown }).customRoot,
    (source as ClinicalState & { customRoot: unknown }).customRoot);

  const version = versions(saved)[0];
  equal(versions(saved).length, 1);
  equal(version['id'], 'illness-v1');
  equal(version['reason'], 'Carga inicial');
  equal(version['content'], 'Dolor lumbar progresivo');
  equal(version['createdAt'], at);
  equal(version['author'], actor.displayName);
  equal(version['license'], actor.licenseNumber);
  equal(record(version['audit'])['action'], 'cargado');
  equal(record(record(meta(saved)['sectionAudit'])['currentIllness'])['action'], 'cargado');
  equal(record(meta(saved)['sectionAudit'])['chiefComplaint'], undefined);
  equal(meta(saved)['updatedAt'], at);
  equal(meta(saved)['currentUser'], actor.displayName);
  const professional = record(meta(saved)['currentProfessional']);
  equal(professional['license'], actor.licenseNumber);
  equal(professional['userId'], actor.userId);
  equal(professional['specialty'], 'Oncología');
  equal(professional['custom'], 'dato');
});

test('una modificación exige motivo, agrega historial y emite el comando transitorio', () => {
  const first = edit(localState());
  errorCode(() => edit(first, { currentIllness: 'Cuadro actualizado', reason: '' }), 'REASON_REQUIRED');

  const changed = edit(first, {
    id: 'illness-v2', at: '2026-08-03T09:15:00.000Z',
    currentIllness: 'Cuadro actualizado', reason: '  Evolución del cuadro clínico  '
  });

  equal(versions(changed).length, 2);
  equal(versions(changed)[0]['reason'], 'Carga inicial');
  equal(versions(changed)[1]['reason'], 'Evolución del cuadro clínico');
  equal(versions(changed)[1]['content'], 'Cuadro actualizado');
  equal(record(record(meta(changed)['sectionChangeRequests'])['currentIllness'])['reason'],
    'Evolución del cuadro clínico');
  equal(record(versions(changed)[1]['audit'])['action'], 'modificado');
  equal(record(record(meta(changed)['sectionAudit'])['currentIllness'])['at'], '2026-08-03T09:15:00.000Z');
  equal(first.narrative?.['currentIllness'], 'Inició con dolor lumbar de tres meses de evolución');
});

test('un intento sin cambios es no-op tipado e inmutable', () => {
  const first = edit(localState());
  const serialized = JSON.stringify(first);
  errorCode(() => edit(first, { reason: 'Revisión sin cambios' }), 'NO_CHANGES');
  equal(JSON.stringify(first), serialized);
});

test('permite vaciar una sección existente y conserva el historial', () => {
  const first = edit(localState());
  const cleared = edit(first, {
    id: 'illness-clear', at: '2026-08-04T11:00:00.000Z',
    currentIllness: '', reason: 'Dato revocado'
  });
  equal(cleared.narrative?.['currentIllness'], '');
  equal(versions(cleared).length, 2);
  equal(versions(cleared)[1]['content'], 'Sin datos cargados.');
  equal(versions(cleared)[1]['reason'], 'Dato revocado');
  equal(currentIllnessBaseline(cleared).initial, false);
});

test('retroversiona contenido preexistente antes de modificarlo', () => {
  const source = localState({
    narrative: { currentIllness: 'Cuadro heredado' },
    meta: {
      liraImport: { origin: 'local' }, sectionVersions: {}, sectionAudit: {}, sectionFormModes: {},
      createdAt: '2025-01-02T03:04:05.000Z', custom: 'preservar'
    }
  });
  const changed = edit(source, {
    id: 'illness-change', currentIllness: 'Cuadro corregido', reason: 'Corrección'
  });
  equal(versions(changed).length, 2);
  equal(versions(changed)[0]['id'], 'illness-change-initial');
  equal(versions(changed)[0]['reason'], 'Carga inicial');
  equal(versions(changed)[0]['content'], 'Cuadro heredado');
  equal(versions(changed)[0]['createdAt'], '2025-01-02T03:04:05.000Z');
  equal(record(versions(changed)[0]['audit'])['action'], 'cargado');
  equal(versions(changed)[1]['id'], 'illness-change');
  equal(record(versions(changed)[1]['audit'])['action'], 'modificado');
});

test('conserva versiones heredadas y no duplica una carga ya auditada', () => {
  const legacyVersion = { id: 'legacy-v1', content: 'Primer cuadro', unknown: { keep: true } };
  const withoutInitial = localState({
    narrative: { currentIllness: 'Cuadro vigente' },
    meta: {
      liraImport: { origin: 'migration' }, sectionFormModes: { currentIllness: 'structured' },
      sectionVersions: { currentIllness: [legacyVersion] }, sectionAudit: {}
    }
  });
  const retro = edit(withoutInitial, {
    id: 'v2', currentIllness: 'Nuevo cuadro', reason: 'Actualización'
  });
  equal(versions(retro).length, 3);
  equal(versions(retro)[0]['content'], 'Primer cuadro');
  equal(versions(retro)[1], legacyVersion);
  equal(record(versions(retro)[1]['unknown'])['keep'], true);

  const alreadyInitial = edit(localState());
  const next = edit(alreadyInitial, {
    id: 'v2', currentIllness: 'Otro cuadro', reason: 'Actualización'
  });
  equal(versions(next).length, 2);
  equal(versions(next).filter((version) => record(version['audit'])['action'] === 'cargado').length, 1);
});

test('aplica el límite inclusivo de 50.000 caracteres al campo y al motivo', () => {
  const exact = 'x'.repeat(CLINICAL_CURRENT_ILLNESS_TEXT_LIMIT);
  const first = edit(localState(), { currentIllness: exact });
  equal(first.narrative?.['currentIllness'], exact);
  const over = `${exact}x`;
  errorCode(() => edit(localState(), { currentIllness: over }), 'CURRENT_ILLNESS_TOO_LONG');
  errorCode(() => edit(first, { currentIllness: 'Distinto', reason: over }), 'REASON_TOO_LONG');
});

test('conserva exactamente los mensajes públicos de validación', () => {
  const unsupported = localState({
    meta: { liraImport: { origin: 'migration' }, sectionVersions: {}, sectionFormModes: {} }
  });
  const first = edit(localState());
  const over = 'x'.repeat(CLINICAL_CURRENT_ILLNESS_TEXT_LIMIT + 1);
  equal(errorMessage(() => edit(unsupported)),
    'Esta historia conserva el editor de texto compatible con su formato anterior.');
  equal(errorMessage(() => edit(localState(), { currentIllness: '' })),
    'Complete los antecedentes de enfermedad actual.');
  equal(errorMessage(() => edit(localState(), { currentIllness: over })),
    'El texto de antecedentes de enfermedad actual no puede superar los 50.000 caracteres.');
  equal(errorMessage(() => edit(first, { currentIllness: 'Distinto' })),
    'Indique el motivo de la modificación.');
  equal(errorMessage(() => edit(first, { currentIllness: 'Distinto', reason: over })),
    'El motivo de la modificación no puede superar los 50.000 caracteres.');
  equal(errorMessage(() => edit(first, { reason: 'Revisión' })),
    'No hay cambios para guardar.');
});

test('un texto legacy sobredimensionado no se rechaza ni muta si permanece intacto', () => {
  const oversized = 'x'.repeat(CLINICAL_CURRENT_ILLNESS_TEXT_LIMIT + 1);
  const source = localState({
    narrative: { currentIllness: oversized },
    meta: {
      liraImport: { origin: 'migration' }, sectionFormModes: { currentIllness: 'structured' },
      sectionVersions: { currentIllness: [{
        id: 'legacy-initial', content: oversized,
        audit: { action: 'cargado', lastName: 'Legacy', license: 's/d', at }
      }] }, sectionAudit: {}
    }
  });

  const serialized = JSON.stringify(source);
  errorCode(() => edit(source, { currentIllness: oversized, reason: 'Sin cambio real' }), 'NO_CHANGES');
  equal(JSON.stringify(source), serialized);
  errorCode(() => edit(source, {
    currentIllness: `${oversized}x`, reason: 'Cambiar texto'
  }), 'CURRENT_ILLNESS_TOO_LONG');
});

test('usa fallbacks humanos del actor y preserva metadatos profesionales', () => {
  const source = localState({
    meta: {
      liraImport: { origin: 'local' }, sectionVersions: {}, sectionAudit: {}, sectionFormModes: {},
      currentUser: 'Usuario previo', currentLicense: 'MAT-LEGACY',
      currentProfessional: { specialty: 'Clínica' }
    }
  });
  const saved = applyStructuredCurrentIllnessEdit(source, {
    currentIllness: 'Cuadro actual', at, id: 'fallback',
    actor: { userId: 12, username: 'usuario.actual', displayName: '', licenseNumber: '' }
  });
  const professional = record(meta(saved)['currentProfessional']);
  equal(meta(saved)['currentUser'], 'usuario.actual');
  equal(professional['lastName'], 'usuario.actual');
  equal(professional['license'], 'MAT-LEGACY');
  equal(professional['specialty'], 'Clínica');
  equal(professional['userId'], 12);
  equal(versions(saved)[0]['license'], 'MAT-LEGACY');
});

test('normaliza contenedores meta inválidos sin perder el resto del documento', () => {
  const source = localState({
    narrative: { other: 'dato' },
    meta: {
      liraImport: { origin: 'local' }, sectionVersions: 'inválido', sectionAudit: 9,
      sectionFormModes: null
    }
  });
  const saved = edit(source);
  equal(saved.narrative?.['other'], 'dato');
  equal(Array.isArray(record(meta(saved)['sectionVersions'])['currentIllness']), true);
  equal(record(record(meta(saved)['sectionAudit'])['currentIllness'])['action'], 'cargado');
  equal(record(meta(saved)['sectionFormModes'])['currentIllness'], 'structured');
  truthy(meta(saved)['currentProfessional']);
});

for (const item of tests) item.run();
console.log(`clinical-current-illness-edit: ${tests.length} casos, ${assertions} aserciones OK`);
