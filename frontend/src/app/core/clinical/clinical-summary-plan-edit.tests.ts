import {
  CLINICAL_SUMMARY_PLAN_TEXT_LIMIT,
  ClinicalSummaryPlanEditError,
  applyStructuredSummaryPlanEdit,
  summaryPlanBaseline,
  supportsStructuredSummaryPlan
} from './clinical-summary-plan-edit';
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
function errorCode(run: () => unknown, expected: ClinicalSummaryPlanEditError['code']): void {
  assertions += 1;
  try {
    run();
  } catch (error) {
    if (error instanceof ClinicalSummaryPlanEditError && error.code === expected) return;
    throw error;
  }
  throw new Error(`se esperaba el error ${expected}.`);
}

const actor = {
  userId: '77', username: 'oncologo', displayName: 'Dra. Ana Prueba', licenseNumber: 'MP-4455'
};
const at = '2026-08-02T18:40:00.000Z';

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
  return applyStructuredSummaryPlanEdit(state, {
    summary: 'Respuesta parcial', plan: 'Continuar controles', actor, at, id: 'summary-v1', ...overrides
  });
}

function meta(state: ClinicalState): Record<string, unknown> {
  return state.meta as Record<string, unknown>;
}
function record(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}
function versions(state: ClinicalState): Array<Record<string, unknown>> {
  return record(meta(state)['sectionVersions'])['summaryPlan'] as Array<Record<string, unknown>>;
}

test('detecta exactamente el modo estructurado compatible del cliente legacy', () => {
  equal(supportsStructuredSummaryPlan(localState()), true);
  equal(supportsStructuredSummaryPlan(localState({ meta: {
    liraImport: { origin: 'local' }, sectionVersions: { summaryPlan: [{ id: 'old' }] }, sectionFormModes: {}
  } })), false);
  equal(supportsStructuredSummaryPlan(localState({ meta: {
    liraImport: { origin: 'migration' }, sectionVersions: {}, sectionFormModes: {}
  } })), false);
  equal(supportsStructuredSummaryPlan(localState({ meta: {
    liraImport: { origin: 'migration' }, sectionVersions: { summaryPlan: [{ id: 'old' }] },
    sectionFormModes: { summaryPlan: 'structured' }
  } })), true);
  equal(supportsStructuredSummaryPlan({ meta: { sectionFormModes: { summaryPlan: 'structured' } } }), true);
});

test('impide el editor estructurado si resumen o plan conservan un valor legacy no textual', () => {
  const objectSummary = localState({
    narrative: { summary: { formato: 'legacy', texto: 'No convertir' }, plan: 'Plan textual' },
    meta: {
      liraImport: { origin: 'migration' }, sectionVersions: { summaryPlan: [{ id: 'old' }] },
      sectionFormModes: { summaryPlan: 'structured' }
    }
  });
  const arrayPlan = localState({
    narrative: { summary: 'Resumen textual', plan: ['Plan', 'legacy'] },
    meta: { liraImport: { origin: 'local' }, sectionVersions: {}, sectionFormModes: {} }
  });
  const numericSummary = localState({
    narrative: { summary: 7, plan: '' },
    meta: { liraImport: { origin: 'local' }, sectionVersions: {}, sectionFormModes: {} }
  });

  equal(supportsStructuredSummaryPlan(objectSummary), false);
  equal(supportsStructuredSummaryPlan(arrayPlan), false);
  equal(supportsStructuredSummaryPlan(numericSummary), false);
  errorCode(() => edit(objectSummary), 'STRUCTURED_SUMMARY_PLAN_UNSUPPORTED');
  errorCode(() => edit(arrayPlan), 'STRUCTURED_SUMMARY_PLAN_UNSUPPORTED');
  errorCode(() => edit(numericSummary), 'STRUCTURED_SUMMARY_PLAN_UNSUPPORTED');
  equal(supportsStructuredSummaryPlan(localState({ narrative: { summary: null, plan: undefined } })), true);
});

test('expone el baseline directo y calcula primera carga con texto y versiones', () => {
  const blank = summaryPlanBaseline(localState());
  equal(blank.summary, '');
  equal(blank.plan, '');
  equal(blank.initial, true);
  const existing = summaryPlanBaseline(localState({
    narrative: { summary: 'Resumen anterior', plan: 7 },
    meta: { liraImport: { origin: 'local' }, sectionVersions: {}, sectionFormModes: {} }
  }));
  equal(existing.summary, 'Resumen anterior');
  equal(existing.plan, '7');
  equal(existing.initial, false);
  const spaced = localState({
    narrative: { summary: '  Resumen heredado  ', plan: '  Plan heredado  ' }
  });
  equal(summaryPlanBaseline(spaced).summary, 'Resumen heredado');
  equal(summaryPlanBaseline(spaced).plan, 'Plan heredado');
  errorCode(() => edit(spaced, {
    summary: 'Resumen heredado', plan: 'Plan heredado', reason: 'No corresponde'
  }), 'NO_CHANGES');
  const clearedWithHistory = summaryPlanBaseline(localState({
    narrative: { summary: '', plan: '' },
    meta: {
      liraImport: { origin: 'local' }, sectionFormModes: { summaryPlan: 'structured' },
      sectionVersions: { summaryPlan: [{ id: 'previous' }] }
    }
  }));
  equal(clearedWithHistory.initial, false);
});

test('primera carga persiste campos, snapshot, auditoría y actor sin mutar el origen', () => {
  const source = localState({
    narrative: { summary: '', unrelated: 'conservar' },
    meta: {
      liraImport: { origin: 'local', patientId: '42' },
      sectionVersions: { studies: [{ id: 'study-version' }] },
      sectionAudit: { studies: { action: 'cargado' } },
      sectionFormModes: { studies: 'structured' },
      sectionChangeRequests: {
        studies: { reason: 'preservar' },
        summaryPlan: { requestId: 'request-local' }
      },
      currentProfessional: { specialty: 'Oncología', custom: 'dato' },
      createdAt: '2026-07-01T10:00:00.000Z', persistenceRevision: 3, unknownMeta: { safe: true }
    },
    customRoot: { preserved: true }
  } as ClinicalState & { customRoot: unknown });
  const saved = edit(source, { summary: '  Respuesta parcial  ', plan: '  Continuar controles  ' });

  equal(source.narrative?.['summary'], '');
  equal(record(meta(source)['sectionVersions'])['summaryPlan'], undefined);
  equal(saved.narrative?.['summary'], 'Respuesta parcial');
  equal(saved.narrative?.['plan'], 'Continuar controles');
  equal(record(meta(saved)['sectionFormModes'])['summaryPlan'], 'structured');
  equal(record(record(meta(saved)['sectionChangeRequests'])['summaryPlan'])['reason'], 'Carga inicial');
  equal(record(record(meta(saved)['sectionChangeRequests'])['summaryPlan'])['requestId'], 'request-local');
  equal(record(record(meta(saved)['sectionChangeRequests'])['studies'])['reason'], 'preservar');
  equal(record(meta(saved)['sectionFormModes'])['studies'], 'structured');
  equal(record(meta(saved)['sectionVersions'])['studies'] !== undefined, true);
  equal(meta(saved)['unknownMeta'], meta(source)['unknownMeta']);
  equal((saved as ClinicalState & { customRoot: unknown }).customRoot, (source as ClinicalState & { customRoot: unknown }).customRoot);

  const version = versions(saved)[0];
  equal(versions(saved).length, 1);
  equal(version['id'], 'summary-v1');
  equal(version['reason'], 'Carga inicial');
  equal(version['content'], 'Conclusion / resumen: Respuesta parcial\nConducta / plan: Continuar controles');
  equal(version['createdAt'], at);
  equal(version['author'], actor.displayName);
  equal(version['license'], actor.licenseNumber);
  equal(record(version['audit'])['action'], 'cargado');
  equal(record(record(meta(saved)['sectionAudit'])['summaryPlan'])['action'], 'cargado');
  equal(meta(saved)['updatedAt'], at);
  equal(meta(saved)['currentUser'], actor.displayName);
  const professional = record(meta(saved)['currentProfessional']);
  equal(professional['firstName'], actor.displayName);
  equal(professional['lastName'], actor.displayName);
  equal(professional['license'], actor.licenseNumber);
  equal(professional['userId'], actor.userId);
  equal(professional['specialty'], 'Oncología');
  equal(professional['custom'], 'dato');
});

test('la primera carga exige al menos un campo y admite cualquiera de los dos', () => {
  const state = localState();
  errorCode(() => edit(state, { summary: ' ', plan: '\n' }), 'EMPTY_SUMMARY_PLAN');
  const onlyPlan = edit(state, { summary: '', plan: 'Control en 30 días' });
  equal(onlyPlan.narrative?.['summary'], '');
  equal(onlyPlan.narrative?.['plan'], 'Control en 30 días');
  equal(versions(onlyPlan)[0]['content'], 'Conducta / plan: Control en 30 días');
});

test('una modificación exige motivo, agrega historial y cambia la auditoría vigente', () => {
  const first = edit(localState());
  errorCode(() => edit(first, { summary: 'Nueva respuesta', reason: '' }), 'REASON_REQUIRED');
  const changed = edit(first, {
    id: 'summary-v2', at: '2026-08-03T09:15:00.000Z', summary: 'Nueva respuesta', reason: '  Cambio de conducta  '
  });
  equal(versions(changed).length, 2);
  equal(versions(changed)[0]['reason'], 'Carga inicial');
  equal(versions(changed)[1]['reason'], 'Cambio de conducta');
  equal(record(record(meta(changed)['sectionChangeRequests'])['summaryPlan'])['reason'], 'Cambio de conducta');
  equal(record(versions(changed)[1]['audit'])['action'], 'modificado');
  equal(record(record(meta(changed)['sectionAudit'])['summaryPlan'])['at'], '2026-08-03T09:15:00.000Z');
  equal(first.narrative?.['summary'], 'Respuesta parcial');
});

test('un intento sin cambios es no-op tipado y no altera el estado', () => {
  const first = edit(localState());
  const serialized = JSON.stringify(first);
  errorCode(() => edit(first, { reason: 'Revisión sin cambios' }), 'NO_CHANGES');
  equal(JSON.stringify(first), serialized);
});

test('compara resumen y plan por separado aunque sus snapshots concatenados coincidan', () => {
  const source = localState({
    narrative: { summary: 'Respuesta\nConducta / plan: Control', plan: '' },
    meta: {
      liraImport: { origin: 'local' }, sectionVersions: {}, sectionAudit: {}, sectionFormModes: {},
      createdAt: '2026-07-01T10:00:00.000Z'
    }
  });
  const changed = edit(source, {
    summary: 'Respuesta', plan: 'Control', reason: 'Separar los campos', id: 'collision-safe'
  });

  equal(changed.narrative?.['summary'], 'Respuesta');
  equal(changed.narrative?.['plan'], 'Control');
  equal(versions(changed).length, 2);
  equal(versions(changed)[1]['id'], 'collision-safe');
  equal(record(record(meta(changed)['sectionChangeRequests'])['summaryPlan'])['reason'], 'Separar los campos');
});

test('vaciar una sección existente conserva historial y documenta Sin datos cargados', () => {
  const first = edit(localState());
  const cleared = edit(first, {
    id: 'summary-clear', at: '2026-08-04T11:00:00.000Z', summary: '', plan: '', reason: 'Dato revocado'
  });
  equal(cleared.narrative?.['summary'], '');
  equal(cleared.narrative?.['plan'], '');
  equal(versions(cleared).length, 2);
  equal(versions(cleared)[1]['content'], 'Sin datos cargados.');
  equal(versions(cleared)[1]['reason'], 'Dato revocado');
  equal(summaryPlanBaseline(cleared).initial, false);
});

test('retroversiona contenido preexistente sin historial antes de modificarlo', () => {
  const source = localState({
    narrative: { summary: 'Resumen heredado', plan: 'Plan heredado' },
    meta: {
      liraImport: { origin: 'local' }, sectionVersions: {}, sectionAudit: {}, sectionFormModes: {},
      createdAt: '2025-01-02T03:04:05.000Z', custom: 'preservar'
    }
  });
  const changed = edit(source, { id: 'summary-change', summary: 'Resumen corregido', reason: 'Corrección' });
  equal(versions(changed).length, 2);
  equal(versions(changed)[0]['id'], 'summary-change-initial');
  equal(versions(changed)[0]['reason'], 'Carga inicial');
  equal(versions(changed)[0]['content'], 'Conclusion / resumen: Resumen heredado\nConducta / plan: Plan heredado');
  equal(versions(changed)[0]['createdAt'], '2025-01-02T03:04:05.000Z');
  equal(record(versions(changed)[0]['audit'])['action'], 'cargado');
  equal(versions(changed)[0]['author'], actor.displayName);
  equal(versions(changed)[1]['id'], 'summary-change');
  equal(record(versions(changed)[1]['audit'])['action'], 'modificado');
});

test('retroversión toma el primer snapshot previo y no duplica una carga ya auditada', () => {
  const legacyVersion = { id: 'legacy-v1', content: 'Primer snapshot', unknown: { keep: true } };
  const withoutInitial = localState({
    narrative: { summary: 'Vigente', plan: 'Plan' },
    meta: {
      liraImport: { origin: 'migration' }, sectionFormModes: { summaryPlan: 'structured' },
      sectionVersions: { summaryPlan: [legacyVersion] }, sectionAudit: {}
    }
  });
  const retro = edit(withoutInitial, { id: 'v2', summary: 'Nuevo', reason: 'Actualización' });
  equal(versions(retro).length, 3);
  equal(versions(retro)[0]['content'], 'Primer snapshot');
  equal(versions(retro)[1], legacyVersion);
  equal(record(versions(retro)[1]['unknown'])['keep'], true);

  const alreadyInitial = edit(localState());
  const next = edit(alreadyInitial, { id: 'v2', summary: 'Otro', reason: 'Actualización' });
  equal(versions(next).length, 2);
  equal(versions(next).filter((version) => record(version['audit'])['action'] === 'cargado').length, 1);
});

test('usa el actor actual con fallback humano y preserva campos profesionales desconocidos', () => {
  const source = localState({
    meta: {
      liraImport: { origin: 'local' }, sectionVersions: {}, sectionAudit: {}, sectionFormModes: {},
      currentUser: 'Usuario previo', currentProfessional: { license: 'MAT-ANT', specialty: 'Clínica' }
    }
  });
  const saved = applyStructuredSummaryPlanEdit(source, {
    summary: 'Resumen', plan: '', at, id: 'fallback',
    actor: { userId: 12, username: 'usuario.actual', displayName: '', licenseNumber: '' }
  });
  const professional = record(meta(saved)['currentProfessional']);
  equal(meta(saved)['currentUser'], 'usuario.actual');
  equal(professional['lastName'], 'usuario.actual');
  equal(professional['license'], 'MAT-ANT');
  equal(professional['specialty'], 'Clínica');
  equal(professional['userId'], 12);
});

test('rechaza el helper estructurado en historias bajo compatibilidad de texto libre', () => {
  const incompatible = localState({ meta: {
    liraImport: { origin: 'migration' }, sectionVersions: {}, sectionAudit: {}, sectionFormModes: {}
  } });
  errorCode(() => edit(incompatible), 'STRUCTURED_SUMMARY_PLAN_UNSUPPORTED');
});

test('aplica el límite inclusivo de 50.000 caracteres a ambos campos y al motivo', () => {
  const exact = 'x'.repeat(CLINICAL_SUMMARY_PLAN_TEXT_LIMIT);
  const first = edit(localState(), { summary: exact, plan: exact });
  equal(first.narrative?.['summary'], exact);
  equal(first.narrative?.['plan'], exact);
  const over = `${exact}x`;
  errorCode(() => edit(localState(), { summary: over, plan: '' }), 'SUMMARY_TOO_LONG');
  errorCode(() => edit(localState(), { summary: '', plan: over }), 'PLAN_TOO_LONG');
  errorCode(() => edit(first, { summary: 'Distinto', reason: over }), 'REASON_TOO_LONG');
});

test('preserva un texto legacy sobredimensionado si sólo cambia el otro campo', () => {
  const oversizedLegacySummary = 'x'.repeat(CLINICAL_SUMMARY_PLAN_TEXT_LIMIT + 1);
  const source = localState({
    narrative: { summary: oversizedLegacySummary, plan: 'Plan anterior' },
    meta: {
      liraImport: { origin: 'migration' },
      sectionFormModes: { summaryPlan: 'structured' },
      sectionVersions: { summaryPlan: [{
        id: 'legacy-initial', reason: 'Carga inicial', content: 'Contenido heredado',
        audit: { action: 'cargado', lastName: 'Legacy', license: 's/d', at }
      }] },
      sectionAudit: {}
    }
  });

  const changed = edit(source, {
    summary: oversizedLegacySummary,
    plan: 'Plan actualizado',
    reason: 'Cambio exclusivo de conducta'
  });

  equal(changed.narrative?.['summary'], oversizedLegacySummary);
  equal(changed.narrative?.['plan'], 'Plan actualizado');
  errorCode(() => edit(source, {
    summary: `${oversizedLegacySummary}x`,
    plan: 'Plan anterior',
    reason: 'Cambio del resumen'
  }), 'SUMMARY_TOO_LONG');
});

test('usa meta.currentLicense como último fallback compatible de matrícula', () => {
  const source = localState({
    meta: {
      liraImport: { origin: 'local' }, sectionVersions: {}, sectionAudit: {}, sectionFormModes: {},
      currentLicense: 'MAT-LEGACY', currentProfessional: { specialty: 'Oncología' }
    }
  });
  const saved = applyStructuredSummaryPlanEdit(source, {
    summary: 'Resumen', plan: '', at, id: 'license-fallback',
    actor: { userId: 12, username: 'usuario.actual', displayName: '', licenseNumber: '' }
  });
  equal(record(meta(saved)['currentProfessional'])['license'], 'MAT-LEGACY');
  equal(versions(saved)[0]['license'], 'MAT-LEGACY');
});

test('normaliza contenedores meta inválidos sin perder el resto del documento', () => {
  const source = localState({
    narrative: { other: 'dato' },
    meta: { liraImport: { origin: 'local' }, sectionVersions: 'inválido', sectionAudit: 9, sectionFormModes: null }
  });
  const saved = edit(source);
  equal(saved.narrative?.['other'], 'dato');
  equal(Array.isArray(record(meta(saved)['sectionVersions'])['summaryPlan']), true);
  equal(record(record(meta(saved)['sectionAudit'])['summaryPlan'])['action'], 'cargado');
  equal(record(meta(saved)['sectionFormModes'])['summaryPlan'], 'structured');
  truthy(meta(saved)['currentProfessional']);
});

for (const item of tests) item.run();
console.log(`clinical-summary-plan-edit: ${tests.length} casos, ${assertions} aserciones OK`);
