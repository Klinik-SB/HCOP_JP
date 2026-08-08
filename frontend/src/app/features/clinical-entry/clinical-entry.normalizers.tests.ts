import {
  applyDiagnosisRecord, applyEvolutionRecord, buildDiagnosisRecord, buildEvolutionRecord,
  diagnosisMatchesQuery, diagnosisPlainText, formatAjccDisplay, mappedCatalogItems,
  normalizeAjccCatalog, normalizeAjccDetail, normalizeClassification, normalizeDiagnosisEditorCatalog,
  validateDiagnosisDraft
} from './clinical-entry.normalizers';
import type { ClinicalAuditStamp, DiagnosisEntryDraft } from './clinical-entry.models';

let assertions = 0;
function equal(actual: unknown, expected: unknown, label: string): void {
  assertions += 1; if (actual !== expected) throw new Error(`${label}: esperado ${String(expected)}, obtenido ${String(actual)}`);
}
function ok(value: unknown, label: string): void { assertions += 1; if (!value) throw new Error(label); }

equal(formatAjccDisplay('Genitourinario', '[corpu] Pene'), 'Genitourinario - Pene', 'ordena sección antes del sitio y limpia prefijo espurio');
const sites = normalizeAjccCatalog({ edition: 'AJCC 8', sites: [
  { id: 'penis', name: 'Pene', group: 'Genitourinario' },
  { id: 'larynx', name: 'Laringe', group: 'Cabeza y cuello' }
] });
equal(sites[0]?.id, 'larynx', 'ordena grupos AJCC');
equal(sites[1]?.display, 'Genitourinario - Pene', 'presenta grupo-sitio');

const carcinoma = normalizeClassification({ code: '1', display: 'Carcinoma de pulmón' }, 'snomed');
ok(diagnosisMatchesQuery({ ...carcinoma, group: '', sourceDisplay: '' }, 'tumor maligno pulmon'), 'equipara tumor maligno con carcinoma');

const rawEquivalence = { items: [{ id: 1, active: true, definition: {
  ajcc: { code: 'penis', display: 'Genitourinario - Pene' },
  snomed: { code: '39937001', display: 'Carcinoma de pene' },
  cie10: { code: 'C60', display: 'Tumor maligno del pene' }, relation: 'exact', confidence: 'high'
} }] };
const catalog = normalizeDiagnosisEditorCatalog({ sites: [{ id: 'penis', name: 'Pene', group: 'Genitourinario' }] }, rawEquivalence,
  { items: [{ key: 'diagnosis-display', definition: { visibleSystems: ['ajcc', 'snomed'] } }] });
equal(catalog.requiredSystems.join(','), 'ajcc,snomed', 'respeta clasificadores obligatorios configurados');
equal(normalizeDiagnosisEditorCatalog({ sites: [] }, { items: [] }, { items: [] }).requiredSystems.join(','),
  'ajcc,snomed,cie10', 'usa los tres sistemas como valor seguro si no puede leer configuracion');
equal(mappedCatalogItems(catalog.equivalences, 'penis', 'cie10')[0]?.code, 'C60', 'vincula terminología por AJCC');

const detail = normalizeAjccDetail({ id: 'penis', name: 'Pene', axes: {
  T: { label: 'Tumor', categories: [{ code: 'cT1', description: 'Limitado' }] },
  N: { label: 'Ganglios', categories: [{ code: 'N0', description: 'Sin ganglios' }] },
  M: { label: 'Metástasis', categories: [{ code: 'M0', description: 'Sin metástasis' }] }
} });
const draft: DiagnosisEntryDraft = {
  id: 'diagnosis-test', date: '2026-08-03', prefix: 'c', site: sites[1]!, detail,
  values: { T: 'cT1', N: 'N0', M: 'M0' }, stage: 'I', stageEdited: true, sourceRow: null,
  classifications: { ajcc: normalizeClassification({ code: 'penis', display: 'Genitourinario - Pene' }, 'ajcc'),
    snomed: normalizeClassification({ code: '39937001', display: 'Carcinoma de pene', freeText: 'carcinoma pene' }, 'snomed'),
    cie10: normalizeClassification({ code: 'C60', display: 'Tumor maligno del pene', freeText: 'tumor pene' }, 'cie10') }
};
equal(validateDiagnosisDraft(draft, ['ajcc', 'snomed'], catalog.equivalences).valid, true, 'permite estadio manual y sistemas configurados');
equal(validateDiagnosisDraft({ ...draft, stage: '' }, ['ajcc', 'snomed'], catalog.equivalences).issues[0]?.field, 'stage', 'exige estadio aunque el cálculo no encuentre combinación');

const audit: ClinicalAuditStamp = { action: 'cargado', lastName: 'Prueba', license: 'MP 1', at: '2026-08-03T12:00:00.000Z' };
const diagnosis = buildDiagnosisRecord(draft, audit);
let state = applyDiagnosisRecord({ oncology: { diagnosisRecords: [] }, evolutions: [], meta: {} }, diagnosis);
state = applyDiagnosisRecord(state, diagnosis);
equal(((state.oncology?.['diagnosisRecords'] as unknown[]) || []).length, 1, 'reintento diagnóstico idempotente');
equal(state.oncology?.['stage'], 'I', 'proyecta estadio a cabecera');
ok(diagnosisPlainText(diagnosis).includes('SNOMED CT 39937001'), 'conserva códigos en texto clínico');

const evolution = buildEvolutionRecord({ id: 'evolution-test', date: '2026-08-03', author: 'Médico', specialty: 'Oncología', text: 'Control clínico.' }, audit);
let evolutionState = applyEvolutionRecord({ evolutions: [], meta: {} }, evolution);
evolutionState = applyEvolutionRecord(evolutionState, evolution);
equal(evolutionState.evolutions?.length, 1, 'reintento evolución idempotente');
equal(evolutionState.evolutions?.[0]?.audit && (evolutionState.evolutions[0]!.audit as { license?: string }).license, 'MP 1', 'conserva auditoría');

console.log(`Entradas clínicas: ${assertions} aserciones aprobadas.`);
