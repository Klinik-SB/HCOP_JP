import type { ClinicalRecord } from '../patients/patient-workspace.models';
import {
  clinicalExplicitTreatmentCategory,
  clinicalIsTreatmentRecord,
  clinicalSectionTreatments,
  clinicalTreatmentBody,
  clinicalTreatmentCategory,
  clinicalTreatmentProjections,
  clinicalTreatmentsByKind
} from './clinical-treatment-projection';

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

test('clasifica procedimientos quirúrgicos frecuentes aun con acentos', () => {
  for (const scheme of ['Prostatectomía radical', 'Tiroidectomía total', 'Nefrectomía parcial', 'Gastrectomía']) {
    equal(clinicalTreatmentCategory({ scheme }), 'surgery', scheme);
  }
});

test('prioriza radioterapia cuando hay términos mixtos', () => {
  equal(clinicalTreatmentCategory({ notes: 'Radioterapia IMRT posterior a cirugía' }), 'radiotherapy');
});

test('conserva como sistémico lo que no pertenece a una categoría específica', () => {
  equal(clinicalTreatmentCategory({ scheme: 'Esquema institucional sin subtipo' }), 'systemic');
});

test('filtra y ordena sin mutar la colección clínica original', () => {
  const records: ClinicalRecord[] = [
    { id: 'late', date: '2025-06-12', scheme: 'Resección oncológica' },
    { id: 'systemic', date: '2024-01-01', scheme: 'Esquema institucional' },
    { id: 'early', date: '2018-03-02', scheme: 'Prostatectomia radical' }
  ];
  const surgeries = clinicalTreatmentsByKind(records, 'surgery');
  equal(surgeries.length, 2);
  equal(surgeries[0]?.id, 'early');
  equal(surgeries[1]?.id, 'late');
  equal(records[0]?.id, 'late');
});

test('proyecta el ejemplo QA con dos cirugías y una radioterapia', () => {
  const state = { evolutions: [
    { id: 's1', date: '2018-05-31', category: 'surgery', reason: 'Cirugía oncológica' },
    { id: 's2', date: '2025-04-17', sourceRef: { kind: 'surgery' }, reason: 'Cirugía oncológica' },
    { id: 'rt1', date: '2025-09-26', category: 'radiotherapy', reason: 'Radioterapia' }
  ] };
  equal(clinicalSectionTreatments(state, 'surgery').length, 2);
  equal(clinicalSectionTreatments(state, 'radiotherapy').length, 1);
  equal(clinicalSectionTreatments(state, 'systemic').length, 0);
});

test('acepta sourceRef.kind como única marca explícita', () => {
  equal(clinicalExplicitTreatmentCategory({ sourceRef: { kind: 'surgery' } }), 'surgery');
});

test('reconoce la marca productiva de un alta oncológica local', () => {
  const record = {
    id: 'treatment-evolution-77',
    text: 'Alta de tratamiento oncológico.\nTipo de tratamiento: Quimioterapia',
    sourceRef: { kind: 'oncological-treatment', treatmentId: '77' }
  };
  equal(clinicalIsTreatmentRecord(record), true);
  const projections = clinicalTreatmentProjections({ evolutions: [record] });
  equal(projections.length, 1);
  equal(projections[0]?.category, 'chemotherapy');
});

test('infiere nombres completos frecuentes en altas locales sin fila relacional', () => {
  const cases = [
    ['Inmunoterapia con Pembrolizumab', 'immunotherapy'],
    ['Hormonoterapia con Tamoxifeno', 'hormone'],
    ['Procedimiento quirúrgico', 'surgery'],
    ['Terapia dirigida con Trastuzumab', 'targeted']
  ];
  for (const [text, expected] of cases) {
    const projections = clinicalTreatmentProjections({ evolutions: [{
      text,
      sourceRef: { kind: 'oncological-treatment' }
    }] });
    equal(projections[0]?.category, expected, text);
  }
});

test('incorpora los tratamientos relacionales entregados por el workspace', () => {
  const projections = clinicalTreatmentProjections({}, [
    { id: '91', type: 'Inmunoterapia', scheme: 'Pembrolizumab', status: 'Iniciado' }
  ]);
  equal(projections.length, 1);
  equal(projections[0]?.record.id, '91');
  equal(projections[0]?.category, 'immunotherapy');
});

test('recupera la colección histórica oncology.surgeries', () => {
  const surgeries = clinicalSectionTreatments({
    oncology: { surgeries: [{ id: 'structured-surgery', date: '2024-01-10', title: 'Colectomía' }] }
  }, 'surgery');
  equal(surgeries.length, 1);
  equal(surgeries[0]?.id, 'structured-surgery');
});

test('deduplica un tratamiento con su evolución enlazada', () => {
  const projections = clinicalTreatmentProjections({
    treatments: [{ id: 'treatment-1', date: '2025-01-01', category: 'surgery' }],
    evolutions: [{ id: 'event-1', date: '2025-01-01', category: 'surgery', sourceRef: { treatmentId: 'treatment-1' } }]
  });
  equal(projections.length, 1);
  equal(projections[0]?.record.id, 'treatment-1');
  equal(projections[0]?.category, 'surgery');
});

test('deduplica el alta real oncological-treatment con su fila estructurada', () => {
  const projections = clinicalTreatmentProjections({
    treatments: [{ id: '77', date: '2025-01-01', type: 'Quimioterapia' }],
    evolutions: [{
      id: 'treatment-evolution-77', date: '2025-01-01',
      sourceRef: { kind: 'oncological-treatment', treatmentId: '77' }
    }]
  });
  equal(projections.length, 1);
  equal(projections[0]?.record.id, '77');
  equal(projections[0]?.category, 'chemotherapy');
});

test('fusiona transitivamente un puente entre las tres fuentes', () => {
  const projections = clinicalTreatmentProjections({
    treatments: [{ id: 'tx1', date: '2025-01-01', category: 'surgery', scheme: 'Cirugía prioritaria' }],
    oncology: { surgeries: [{ id: 'historical-1', date: '2025-01-01', title: 'Copia histórica' }] },
    evolutions: [{ id: 'event-1', category: 'surgery', sourceRef: { treatmentId: 'tx1', clinicalEntryId: 'historical-1' } }]
  });
  equal(projections.length, 1);
  equal(projections[0]?.record.id, 'tx1');
});

test('la evidencia explícita define la categoría aunque la fuente prioritaria sea genérica', () => {
  const projections = clinicalTreatmentProjections({
    treatments: [{ id: 'tx-category', date: '2025-01-01', scheme: 'Procedimiento institucional' }],
    evolutions: [{ id: 'event-category', category: 'surgery', sourceRef: { treatmentId: 'tx-category' } }]
  });
  equal(projections.length, 1);
  equal(projections[0]?.category, 'surgery');
});

test('no fusiona ids iguales que pertenecen a dominios distintos', () => {
  const projections = clinicalTreatmentProjections({
    treatments: [{ id: '42', date: '2025-01-01', type: 'Quimioterapia' }],
    evolutions: [{ id: '42', date: '2025-02-01', category: 'surgery' }]
  });
  equal(projections.length, 2);
  equal(projections.filter((item) => item.category === 'chemotherapy').length, 1);
  equal(projections.filter((item) => item.category === 'surgery').length, 1);
});

test('preserva eventos anónimos repetidos dentro de una misma colección', () => {
  const repeated = { date: '2025-03-01', category: 'surgery', title: 'Procedimiento repetido' };
  const projections = clinicalTreatmentProjections({ evolutions: [{ ...repeated }, { ...repeated }] });
  equal(projections.length, 2);
});

test('preserva categorías sistémicas detalladas aunque el contenido anónimo coincida', () => {
  const common = { date: '2025-04-01', title: 'Aplicación institucional' };
  const projections = clinicalTreatmentProjections({ evolutions: [
    { ...common, category: 'chemotherapy' },
    { ...common, category: 'immunotherapy' }
  ] });
  equal(projections.length, 2);
  equal(projections[0]?.category, 'chemotherapy');
  equal(projections[1]?.category, 'immunotherapy');
});

test('un tombstone prioritario bloquea su espejo inferior', () => {
  const projections = clinicalTreatmentProjections({
    treatments: [{ id: 'tx-deleted', category: 'surgery', deleted: true }],
    evolutions: [{ id: 'event-live', category: 'surgery', sourceRef: { treatmentId: 'tx-deleted' } }]
  });
  equal(projections.length, 0);
});

test('un tombstone inferior no elimina un tratamiento activo prioritario', () => {
  const projections = clinicalTreatmentProjections({
    treatments: [{ id: 'tx-live', category: 'surgery' }],
    evolutions: [{ id: 'event-deleted', category: 'surgery', deleted: true, sourceRef: { treatmentId: 'tx-live' } }]
  });
  equal(projections.length, 1);
});

test('no convierte una evolución genérica por una mera mención textual', () => {
  const surgeries = clinicalSectionTreatments({
    evolutions: [{ id: 'generic-event', reason: 'Control', text: 'Se conversa una eventual cirugía.' }]
  }, 'surgery');
  equal(surgeries.length, 0);
});

test('conserva las categorías operativas detalladas para la línea de tiempo', () => {
  const cases = [
    ['chemotherapy', 'chemotherapy'],
    ['hormonoterapia', 'hormone'],
    ['immunotherapy', 'immunotherapy'],
    ['targeted', 'targeted']
  ];
  for (const [category, expected] of cases) {
    equal(clinicalExplicitTreatmentCategory({ category }), expected, category);
  }
});

test('completa espacios en blanco y conserva la fuente prioritaria', () => {
  const projections = clinicalTreatmentProjections({
    treatments: [{ id: 'tx-blank', category: 'surgery', scheme: '   ' }],
    evolutions: [{ id: 'event-detail', category: 'surgery', scheme: 'Resección completa', sourceRef: { treatmentId: 'tx-blank' } }]
  });
  equal(projections[0]?.record.id, 'tx-blank');
  equal(projections[0]?.record.scheme, 'Resección completa');
});

test('el cuerpo preserva intención, estado y notas sin repetir valores', () => {
  equal(
    clinicalTreatmentBody({ intent: 'Adyuvante', status: 'Completado', notes: 'Sin complicaciones.' }),
    'Adyuvante. Completado. Sin complicaciones.'
  );
});

for (const item of tests) item.run();
console.log(`clinical-treatment-projection: ${tests.length} casos, ${assertions} aserciones OK`);
