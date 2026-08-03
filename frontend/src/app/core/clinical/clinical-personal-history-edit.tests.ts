import {
  CLINICAL_PERSONAL_HISTORY_TEXT_LIMIT,
  ClinicalPersonalHistoryEditError,
  applyStructuredPersonalHistoryEdit,
  personalHistoryBaseline,
  personalHistoryLegacySnapshot,
  supportsStructuredPersonalHistory
} from './clinical-personal-history-edit';
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
function errorCode(run: () => unknown, expected: ClinicalPersonalHistoryEditError['code']): void {
  assertions += 1;
  try {
    run();
  } catch (error) {
    if (error instanceof ClinicalPersonalHistoryEditError && error.code === expected) return;
    throw error;
  }
  throw new Error(`se esperaba el error ${expected}.`);
}

const actor = {
  userId: '77', username: 'oncologo', displayName: 'Dra. Ana Prueba', licenseNumber: 'MP-4455'
};
const at = '2026-08-02T20:55:00.000Z';

function localState(overrides: ClinicalState = {}): ClinicalState {
  return {
    patient: { id: '42', fullName: 'Paciente sintetico' },
    narrative: {},
    meta: {
      liraImport: { origin: 'local', patientId: '42' },
      sectionVersions: {}, sectionAudit: {}, sectionFormModes: {},
      createdAt: '2026-07-01T10:00:00.000Z', persistenceRevision: 3
    },
    ...overrides
  };
}

function edit(state: ClinicalState, overrides: Partial<Parameters<typeof applyStructuredPersonalHistoryEdit>[1]> = {}): ClinicalState {
  return applyStructuredPersonalHistoryEdit(state, {
    backgroundClinical: 'Hipertension arterial',
    currentMedication: 'Losartan 50 mg/dia',
    familyOncology: 'Madre con cancer de mama',
    gynecology: 'G2 P2',
    actor, at, id: 'personal-v1',
    ...overrides
  });
}

function record(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}
function meta(state: ClinicalState): Record<string, unknown> {
  return state.meta as Record<string, unknown>;
}
function versions(state: ClinicalState): Array<Record<string, unknown>> {
  return record(meta(state)['sectionVersions'])['personalHistory'] as Array<Record<string, unknown>>;
}

test('detecta exactamente la compatibilidad estructurada de antecedentes personales', () => {
  equal(supportsStructuredPersonalHistory(localState()), true);
  equal(supportsStructuredPersonalHistory(localState({ meta: {
    liraImport: { origin: 'local' }, sectionVersions: { personalHistory: [{ id: 'old' }] }, sectionFormModes: {}
  } })), false);
  equal(supportsStructuredPersonalHistory(localState({ meta: {
    liraImport: { origin: 'migration' }, sectionVersions: {}, sectionFormModes: {}
  } })), false);
  equal(supportsStructuredPersonalHistory(localState({ meta: {
    liraImport: { origin: 'migration' }, sectionVersions: { personalHistory: [{ id: 'old' }] },
    sectionFormModes: { personalHistory: 'structured' }
  } })), true);
  equal(supportsStructuredPersonalHistory({ meta: { sectionFormModes: { personalHistory: 'structured' } } }), true);
});

test('recupera la ultima presentacion legacy sin revivirla en una historia estructurada', () => {
  const versionsOnly = {
    narrative: {},
    meta: {
      liraImport: { origin: 'migration' },
      sectionVersions: { personalHistory: [
        { id: 'legacy-v1', content: 'Antecedente anterior' },
        { id: 'legacy-v2', content: 'Antecedente legacy vigente' }
      ] },
      sectionFormModes: {}
    }
  };
  equal(personalHistoryLegacySnapshot(versionsOnly), 'Antecedente legacy vigente');
  equal(personalHistoryLegacySnapshot({
    ...versionsOnly,
    narrative: { backgroundClinical: { formato: 'legacy-invalido' } },
    meta: { ...versionsOnly.meta, sectionFormModes: { personalHistory: 'structured' } }
  }), '');
});

test('rechaza cualquier campo legacy no textual sin coercionarlo', () => {
  const keys = ['backgroundClinical', 'currentMedication', 'familyOncology', 'gynecology'] as const;
  for (const key of keys) {
    const malformed = localState({
      narrative: { [key]: key === 'gynecology' ? ['legacy'] : { formato: 'legacy' } },
      meta: { liraImport: { origin: 'local' }, sectionVersions: {}, sectionFormModes: { personalHistory: 'structured' } }
    });
    equal(supportsStructuredPersonalHistory(malformed), false, key);
    errorCode(() => edit(malformed), 'STRUCTURED_PERSONAL_HISTORY_UNSUPPORTED');
  }
  equal(supportsStructuredPersonalHistory(localState({ narrative: {
    backgroundClinical: null, currentMedication: undefined, familyOncology: '', gynecology: ' '
  } })), true);
});

test('expone baseline recortado y calcula primera carga mediante texto o historial', () => {
  const blank = personalHistoryBaseline(localState());
  equal(blank.backgroundClinical, '');
  equal(blank.currentMedication, '');
  equal(blank.familyOncology, '');
  equal(blank.gynecology, '');
  equal(blank.initial, true);

  const existing = personalHistoryBaseline(localState({ narrative: {
    backgroundClinical: '  Diabetes  ', currentMedication: '  Metformina  ',
    familyOncology: '', gynecology: '  G1 P1  '
  } }));
  equal(existing.backgroundClinical, 'Diabetes');
  equal(existing.currentMedication, 'Metformina');
  equal(existing.gynecology, 'G1 P1');
  equal(existing.initial, false);

  const clearedWithHistory = personalHistoryBaseline(localState({
    narrative: {},
    meta: {
      liraImport: { origin: 'local' }, sectionFormModes: { personalHistory: 'structured' },
      sectionVersions: { personalHistory: [{ id: 'previous' }] }
    }
  }));
  equal(clearedWithHistory.initial, false);
});

test('primera carga persiste campos, snapshot legacy, auditoria y actor sin mutar origen', () => {
  const source = localState({
    narrative: { backgroundClinical: '', unrelated: 'conservar' },
    meta: {
      liraImport: { origin: 'local', patientId: '42' },
      sectionVersions: { studies: [{ id: 'study-version' }] },
      sectionAudit: { studies: { action: 'cargado' } },
      sectionFormModes: { studies: 'structured' },
      sectionChangeRequests: {
        studies: { reason: 'preservar' }, personalHistory: { requestId: 'request-local' }
      },
      currentProfessional: { specialty: 'Oncologia', custom: 'dato' },
      createdAt: '2026-07-01T10:00:00.000Z', persistenceRevision: 3, unknownMeta: { safe: true }
    },
    customRoot: { preserved: true }
  } as ClinicalState & { customRoot: unknown });
  const saved = edit(source, {
    backgroundClinical: '  Hipertension arterial  ',
    currentMedication: '  Losartan 50 mg/dia  ',
    familyOncology: '  Madre con cancer de mama  ',
    gynecology: '  G2 P2  '
  });

  equal(source.narrative?.['backgroundClinical'], '');
  equal(record(meta(source)['sectionVersions'])['personalHistory'], undefined);
  equal(saved.narrative?.['backgroundClinical'], 'Hipertension arterial');
  equal(saved.narrative?.['currentMedication'], 'Losartan 50 mg/dia');
  equal(saved.narrative?.['familyOncology'], 'Madre con cancer de mama');
  equal(saved.narrative?.['gynecology'], 'G2 P2');
  equal(saved.narrative?.['unrelated'], 'conservar');
  equal(record(meta(saved)['sectionFormModes'])['personalHistory'], 'structured');
  equal(record(record(meta(saved)['sectionChangeRequests'])['personalHistory'])['reason'], 'Carga inicial');
  equal(record(record(meta(saved)['sectionChangeRequests'])['personalHistory'])['requestId'], 'request-local');
  equal(record(record(meta(saved)['sectionChangeRequests'])['studies'])['reason'], 'preservar');
  equal(record(meta(saved)['sectionFormModes'])['studies'], 'structured');
  equal(meta(saved)['unknownMeta'], meta(source)['unknownMeta']);
  equal((saved as ClinicalState & { customRoot: unknown }).customRoot,
    (source as ClinicalState & { customRoot: unknown }).customRoot);

  const version = versions(saved)[0];
  equal(versions(saved).length, 1);
  equal(version['id'], 'personal-v1');
  equal(version['reason'], 'Carga inicial');
  equal(version['content'], [
    'Clínicos / quirúrgicos: Hipertension arterial',
    'Medicación habitual: Losartan 50 mg/dia',
    'Oncofamiliares: Madre con cancer de mama',
    'Gineco-obstétricos: G2 P2'
  ].join('\n'));
  equal(version['createdAt'], at);
  equal(version['author'], actor.displayName);
  equal(version['license'], actor.licenseNumber);
  equal(record(version['audit'])['action'], 'cargado');
  equal(record(record(meta(saved)['sectionAudit'])['personalHistory'])['action'], 'cargado');
  equal(meta(saved)['updatedAt'], at);
  equal(meta(saved)['currentUser'], actor.displayName);
  const professional = record(meta(saved)['currentProfessional']);
  equal(professional['firstName'], actor.displayName);
  equal(professional['lastName'], actor.displayName);
  equal(professional['license'], actor.licenseNumber);
  equal(professional['userId'], actor.userId);
  equal(professional['specialty'], 'Oncologia');
  equal(professional['custom'], 'dato');
});

test('primera carga exige al menos un campo y admite cualquiera de los cuatro', () => {
  const state = localState();
  errorCode(() => edit(state, {
    backgroundClinical: ' ', currentMedication: '\n', familyOncology: '', gynecology: ''
  }), 'EMPTY_PERSONAL_HISTORY');
  const onlyMedication = edit(state, {
    backgroundClinical: '', currentMedication: 'Levotiroxina', familyOncology: '', gynecology: ''
  });
  equal(onlyMedication.narrative?.['currentMedication'], 'Levotiroxina');
  equal(versions(onlyMedication)[0]['content'], 'Medicación habitual: Levotiroxina');
});

test('modificacion exige motivo, agrega historial y actualiza auditoria vigente', () => {
  const first = edit(localState());
  errorCode(() => edit(first, { currentMedication: 'Losartan 100 mg/dia', reason: '' }), 'REASON_REQUIRED');
  const changed = edit(first, {
    id: 'personal-v2', at: '2026-08-03T09:15:00.000Z',
    currentMedication: 'Losartan 100 mg/dia', reason: '  Ajuste de dosis  '
  });
  equal(versions(changed).length, 2);
  equal(versions(changed)[0]['reason'], 'Carga inicial');
  equal(versions(changed)[1]['reason'], 'Ajuste de dosis');
  equal(record(record(meta(changed)['sectionChangeRequests'])['personalHistory'])['reason'], 'Ajuste de dosis');
  equal(record(record(meta(changed)['sectionAudit'])['personalHistory'])['action'], 'modificado');
  equal(changed.narrative?.['currentMedication'], 'Losartan 100 mg/dia');
  equal(changed.narrative?.['backgroundClinical'], 'Hipertension arterial');
});

test('sintetiza carga inicial al modificar datos heredados sin version inicial', () => {
  const source = localState({
    narrative: {
      backgroundClinical: 'Diabetes', currentMedication: '', familyOncology: '', gynecology: ''
    },
    meta: {
      liraImport: { origin: 'local' }, sectionVersions: {}, sectionAudit: {},
      sectionFormModes: { personalHistory: 'structured' },
      createdAt: '2025-11-20T12:00:00.000Z'
    }
  });
  const changed = edit(source, {
    backgroundClinical: 'Diabetes tipo 2', currentMedication: '', familyOncology: '', gynecology: '',
    reason: 'Precision diagnostica', id: 'personal-v2'
  });
  equal(versions(changed).length, 2);
  equal(versions(changed)[0]['id'], 'personal-v2-initial');
  equal(versions(changed)[0]['reason'], 'Carga inicial');
  equal(versions(changed)[0]['content'], 'Clínicos / quirúrgicos: Diabetes');
  equal(versions(changed)[0]['createdAt'], '2025-11-20T12:00:00.000Z');
  equal(record(versions(changed)[0]['audit'])['action'], 'cargado');
  equal(versions(changed)[1]['reason'], 'Precision diagnostica');
});

test('preserva historial existente y usa su primer contenido para la inicial sintetica', () => {
  const source = localState({
    narrative: { backgroundClinical: 'Dato actual' },
    meta: {
      liraImport: { origin: 'local' }, sectionFormModes: { personalHistory: 'structured' },
      sectionVersions: { personalHistory: [{ id: 'legacy-v1', content: 'Contenido historico', reason: 'Importado' }] },
      sectionAudit: {}
    }
  });
  const changed = edit(source, {
    backgroundClinical: 'Dato corregido', currentMedication: '', familyOncology: '', gynecology: '',
    reason: 'Correccion', id: 'personal-v2'
  });
  equal(versions(changed).length, 3);
  equal(versions(changed)[0]['id'], 'personal-v2-initial');
  equal(versions(changed)[0]['content'], 'Contenido historico');
  equal(versions(changed)[1]['id'], 'legacy-v1');
  equal(versions(changed)[2]['id'], 'personal-v2');
});

test('permite vaciar todos los campos despues de la carga inicial con trazabilidad', () => {
  const first = edit(localState());
  const cleared = edit(first, {
    backgroundClinical: '', currentMedication: '', familyOncology: '', gynecology: '',
    reason: 'Antecedentes descartados', id: 'personal-clear'
  });
  equal(cleared.narrative?.['backgroundClinical'], '');
  equal(cleared.narrative?.['currentMedication'], '');
  equal(cleared.narrative?.['familyOncology'], '');
  equal(cleared.narrative?.['gynecology'], '');
  equal(versions(cleared).at(-1)?.['content'], 'Sin datos cargados.');
  equal(personalHistoryBaseline(cleared).initial, false);
});

test('rechaza no-op aun con espacios normalizados y motivo', () => {
  const first = edit(localState());
  errorCode(() => edit(first, {
    backgroundClinical: '  Hipertension arterial ', currentMedication: ' Losartan 50 mg/dia ',
    familyOncology: 'Madre con cancer de mama', gynecology: ' G2 P2 ', reason: 'No corresponde'
  }), 'NO_CHANGES');
});

test('aplica limite independiente a cada campo y al motivo', () => {
  const tooLong = 'x'.repeat(CLINICAL_PERSONAL_HISTORY_TEXT_LIMIT + 1);
  const state = localState();
  errorCode(() => edit(state, { backgroundClinical: tooLong }), 'BACKGROUND_CLINICAL_TOO_LONG');
  errorCode(() => edit(state, { currentMedication: tooLong }), 'CURRENT_MEDICATION_TOO_LONG');
  errorCode(() => edit(state, { familyOncology: tooLong }), 'FAMILY_ONCOLOGY_TOO_LONG');
  errorCode(() => edit(state, { gynecology: tooLong }), 'GYNECOLOGY_TOO_LONG');
  const first = edit(state);
  errorCode(() => edit(first, { backgroundClinical: 'Cambio', reason: tooLong }), 'REASON_TOO_LONG');
  equal(edit(state, {
    backgroundClinical: 'x'.repeat(CLINICAL_PERSONAL_HISTORY_TEXT_LIMIT),
    currentMedication: '', familyOncology: '', gynecology: ''
  }).narrative?.['backgroundClinical']?.length, CLINICAL_PERSONAL_HISTORY_TEXT_LIMIT);
});

test('conserva un campo heredado sobredimensionado si la modificacion no lo toca', () => {
  const oversized = 'x'.repeat(CLINICAL_PERSONAL_HISTORY_TEXT_LIMIT + 1);
  const source = localState({
    narrative: {
      backgroundClinical: oversized, currentMedication: 'Anterior', familyOncology: '', gynecology: ''
    },
    meta: {
      liraImport: { origin: 'migration' }, sectionFormModes: { personalHistory: 'structured' },
      sectionVersions: { personalHistory: [{
        id: 'legacy-initial', content: 'Contenido heredado',
        audit: { action: 'cargado', lastName: 'Legacy', license: 's/d', at }
      }] }
    }
  });
  const changed = edit(source, {
    backgroundClinical: oversized, currentMedication: 'Actualizada', familyOncology: '', gynecology: '',
    reason: 'Actualizacion farmacologica'
  });
  equal(changed.narrative?.['backgroundClinical'], oversized);
  equal(changed.narrative?.['currentMedication'], 'Actualizada');
  errorCode(() => edit(source, {
    backgroundClinical: `${oversized}x`, currentMedication: 'Anterior', familyOncology: '', gynecology: '',
    reason: 'Cambio clinico'
  }), 'BACKGROUND_CLINICAL_TOO_LONG');
});

test('usa fallback de actor y normaliza contenedores meta invalidos', () => {
  const source = localState({
    narrative: { other: 'dato' },
    meta: {
      liraImport: { origin: 'local' }, sectionVersions: 'invalido', sectionAudit: 9, sectionFormModes: null,
      sectionChangeRequests: [], currentLicense: 'MAT-LEGACY', currentProfessional: { specialty: 'Oncologia' }
    }
  });
  const saved = applyStructuredPersonalHistoryEdit(source, {
    backgroundClinical: 'Asma', currentMedication: '', familyOncology: '', gynecology: '', at, id: 'fallback',
    actor: { userId: 12, username: 'usuario.actual', displayName: '', licenseNumber: '' }
  });
  equal(saved.narrative?.['other'], 'dato');
  equal(Array.isArray(record(meta(saved)['sectionVersions'])['personalHistory']), true);
  equal(record(record(meta(saved)['sectionAudit'])['personalHistory'])['action'], 'cargado');
  equal(record(meta(saved)['sectionFormModes'])['personalHistory'], 'structured');
  equal(record(meta(saved)['currentProfessional'])['license'], 'MAT-LEGACY');
  equal(versions(saved)[0]['author'], 'usuario.actual');
  equal(versions(saved)[0]['license'], 'MAT-LEGACY');
  truthy(meta(saved)['currentProfessional']);
});

for (const item of tests) item.run();
console.log(`clinical-personal-history-edit: ${tests.length} casos, ${assertions} aserciones OK`);
