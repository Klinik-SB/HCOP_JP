import {
  blankProtocol,
  buildSaveProtocolPayload,
  coirCatalogFromProtocols,
  duplicateProtocol,
  normalizeCoirCatalog,
  normalizeDrugCatalog,
  normalizeProtocolCatalog,
  normalizeProtocolDetail,
  promoteCatalogProtocol,
  protocolDraftSignature,
  protocolFailureMessage,
  validateProtocolDraft
} from './protocol-configuration.normalizers';

let assertions = 0;

function equal(actual: unknown, expected: unknown, label: string): void {
  assertions += 1;
  if (actual !== expected) throw new Error(`${label}: se esperaba ${String(expected)} y se obtuvo ${String(actual)}`);
}

function ok(value: unknown, label: string): void {
  assertions += 1;
  if (!value) throw new Error(label);
}

const catalog = normalizeProtocolCatalog({
  currentCount: 1,
  catalogCount: 1,
  protocols: [
    { id: 10, name: 'Mama - AC', category: 'Mama', active: true, componentCount: 2, durationMinutes: 120 },
    { id: 'coir:77', coirSchemeId: '77', name: 'Pulmón - prueba', catalogOnly: true, components: [{ drugName: 'Droga' }] }
  ]
});
equal(catalog.protocols.length, 2, 'normaliza catálogo mixto');
equal(catalog.protocols[0]?.durationText, '2 h', 'presenta duración operativa');
equal(catalog.protocols[1]?.componentCount, 1, 'cuenta componentes importados');
equal(catalog.catalogCount, 1, 'conserva contador COIR');
const coirFromCatalog = coirCatalogFromProtocols(catalog);
equal(coirFromCatalog.length, 1, 'reutiliza el COIR incluido en el catálogo principal');
equal(coirFromCatalog[0]?.coirSchemeId, '77', 'conserva identificador COIR sin segunda consulta');
equal(coirFromCatalog[0]?.schemeName, 'Pulmón - prueba', 'conserva nombre para el selector de vinculación');
equal(
  protocolFailureMessage({ name: 'TimeoutError', message: 'Timeout has occurred' }),
  'La carga de protocolos superó los 30 segundos. Revise la conexión y vuelva a intentar.',
  'explica una espera agotada y permite reintentar'
);

const detail = normalizeProtocolDetail({
  protocol: {
    id: 10,
    revision: 4,
    name: 'Mama - AC',
    active: true,
    definition: {
      category: 'Mama',
      cycleDays: 21,
      durationMinutes: 150,
      coirSchemeId: '77',
      components: [{
        id: 3,
        drugId: 8,
        drugName: 'Doxorrubicina',
        day: '1',
        prescribedDoseText: '60',
        doseUnit: 'mg/m²',
        route: 'Endovenosa',
        administrationTime: '30 min',
        applications: [{ id: 5, reconstituent: 'SF', photosensitive: true }],
        presentations: [{ id: 9, amount: '50', unit: 'mg' }]
      }]
    }
  }
});
equal(detail.revision, 4, 'conserva revisión optimista');
equal(detail.components[0]?.drugName, 'Doxorrubicina', 'normaliza droga');
equal(detail.components[0]?.preparation.reconstituent, 'SF', 'normaliza preparación');
equal(detail.components[0]?.preparation.dirty, false, 'preparación cargada no se marca modificada');
equal(detail.components[0]?.presentationCount, 1, 'cuenta presentaciones');
const persistedSignature = protocolDraftSignature(detail);
const renamedDetail = structuredClone(detail);
renamedDetail.name = 'Mama - AC modificado';
ok(protocolDraftSignature(renamedDetail) !== persistedSignature, 'detecta cambios persistibles sin guardar');
const visualOnlyDetail = structuredClone(detail);
visualOnlyDetail.components[0]!.clientId = 'identidad-visual-distinta';
equal(protocolDraftSignature(visualOnlyDetail), persistedSignature, 'ignora identidades internas que no se persisten');

const drugs = normalizeDrugCatalog({
  drugs: [{
    id: '8', name: 'Doxorrubicina',
    instructions: [{ id: '5', drugId: '8', drugName: 'Doxorrubicina', diluent: 'SF' }],
    presentations: [{ id: '9', amount: '50', unit: 'mg' }]
  }]
});
equal(drugs[0]?.instructions[0]?.diluent, 'SF', 'normaliza instrucciones de droga');
equal(drugs[0]?.presentations[0]?.label, '50 mg', 'normaliza presentación de droga');

const coir = normalizeCoirCatalog({ catalog: [{ coirSchemeId: '77', schemeName: 'AC', durationMinutes: 90 }] });
equal(coir[0]?.durationText, '1 h 30 min', 'normaliza agenda COIR');

const blank = blankProtocol();
equal(validateProtocolDraft(blank)[0]?.path, 'name', 'exige nombre');
blank.name = 'Mama - AC';
blank.components[0]!.drugName = 'Doxorrubicina';
blank.components[0]!.prescribedDoseText = '60';
blank.components[0]!.doseUnit = 'mg/m²';
equal(validateProtocolDraft(blank).length, 0, 'acepta protocolo mínimo completo');
blank.components[0]!.preparation.dirty = true;
equal(validateProtocolDraft(blank).at(-1)?.path, 'components.0.preparation', 'exige vínculo para preparación');
blank.components[0]!.drugId = '8';
blank.components[0]!.preparation.diluent = 'SF';
blank.revision = 6;
const payload = buildSaveProtocolPayload(blank);
equal(payload.revision, 6, 'envía revisión para detectar edición concurrente');
equal(payload.preparations.length, 1, 'envía sólo preparación marcada');
equal(payload.preparations[0]?.drugId, '8', 'preparación usa vínculo de droga');

const duplicate = duplicateProtocol(detail);
equal(duplicate.id, '', 'duplicado es alta nueva');
equal(duplicate.revision, null, 'duplicado elimina revisión');
ok(duplicate.name.startsWith('Copia de '), 'duplicado identifica la copia');
ok(duplicate.components[0]?.clientId !== detail.components[0]?.clientId, 'duplicado renueva identidad visual');

const catalogDetail = normalizeProtocolDetail({ protocol: {
  id: 'coir:77', coirSchemeId: '77', name: 'AC', catalogOnly: true, cycleDays: 21, components: []
} });
equal(protocolDraftSignature(catalogDetail), '', 'un registro COIR de solo lectura no queda marcado como modificado');
const promoted = promoteCatalogProtocol(catalogDetail);
equal(promoted.id, '', 'promoción crea protocolo local');
equal(promoted.coirSchemeId, '77', 'promoción conserva vínculo COIR');
equal(promoted.components.length, 1, 'promoción vacía ofrece una droga editable');

const sharedPreparationDetail = normalizeProtocolDetail({ protocol: {
  id: 11,
  name: 'Esquema persistido',
  components: [{ drugId: '8', drugName: 'Doxorrubicina', day: '1' }],
  preparations: [{ drugId: '8', drugName: 'Doxorrubicina', diluent: 'Dextrosa' }]
} });
equal(sharedPreparationDetail.components[0]?.preparation.diluent, 'Dextrosa', 'recupera preparación persistida al nivel del protocolo');

equal(protocolFailureMessage({ status: 403 }), 'Su usuario no tiene permiso para administrar protocolos.', 'explica permiso faltante');
ok(protocolFailureMessage({ status: 409, error: { message: 'Revisión inválida' } }).includes('Revisión'), 'conserva mensaje de conflicto');

console.log(`Configuración de protocolos: ${assertions} aserciones aprobadas.`);
