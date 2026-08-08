import { strict as assert } from 'node:assert';
import {
  blankDiagnosisEquivalence,
  buildDiagnosisEquivalencePayload,
  buildGuidePayload,
  buildStudyTemplatePayload,
  normalizeDiagnosisCatalogResults,
  normalizeDiagnosisDisplaySetting,
  normalizeDiagnosisEquivalences,
  normalizeGuideCatalog,
  normalizeStudyTemplateCatalog,
  validateDiagnosisEquivalenceDraft,
  validateStudyTemplateDraft
} from './configuration-catalogs.normalizers';

const guides = normalizeGuideCatalog({ guides: [{
  name: 'mama.pdf', title: 'Mama 2026', site: 'Mama', active: false,
  configurationId: 9, configurationRevision: 3, size: 2048, tags: ['adyuvancia']
}] });
assert.equal(guides.length, 1);
assert.equal(guides[0]?.configurationId, '9');
assert.equal(guides[0]?.active, false);
assert.deepEqual(buildGuidePayload(guides[0]!, {
  title: 'Mama actualizada', category: 'Mama', audience: 'Equipo', source: 'COIR', version: '2',
  tags: 'mama, adyuvancia', description: 'Texto', active: true
}), {
  key: 'guide:mama_pdf', name: 'Mama actualizada', description: 'Texto', active: true, expectedRevision: 3,
  definition: { fileName: 'mama.pdf', category: 'Mama', audience: 'Equipo', source: 'COIR', version: '2', tags: ['mama', 'adyuvancia'] }
});

const templates = normalizeStudyTemplateCatalog({ templates: [{
  id: 'custom-12', configurationId: 12, configurationKey: 'study-template:torax', revision: 4,
  origin: 'custom', title: 'Tórax AP', active: true, available: true,
  definition: { category: 'torax', tags: ['frente'], rightsConfirmed: true, fileUrl: '/api/media/x.png', bytes: 1200 }
}] });
assert.equal(templates[0]?.title, 'Tórax AP');
assert.equal(templates[0]?.fileUrl, '/api/media/x.png');
const templatePayload = buildStudyTemplatePayload(templates[0]!, {
  title: 'Tórax PA', category: 'torax', tags: 'espalda, tórax', author: 'HCOP', attribution: 'HCOP',
  sourceUrl: 'https://example.test/source', license: 'Propia', licenseUrl: '', description: 'Plantilla',
  rightsConfirmed: true, active: true
});
assert.equal(templatePayload['expectedRevision'], 4);
assert.deepEqual((templatePayload['definition'] as Record<string, unknown>)['tags'], ['espalda', 'tórax']);

const setting = normalizeDiagnosisDisplaySetting({ items: [{ id: 2, revision: 7, key: 'diagnosis-display', definition: { visibleSystems: ['snomed', 'ajcc', 'invalid'] } }] });
assert.deepEqual(setting.visibleSystems, ['snomed', 'ajcc']);

const equivalences = normalizeDiagnosisEquivalences({ items: [{
  id: 5, name: 'Pulmón', active: true, revision: 2,
  definition: {
    snomed: { code: '254637007', display: 'Carcinoma pulmonar' },
    cie10: { code: 'C34.9', display: 'Tumor maligno de bronquio o pulmón' },
    ajcc: { code: 'lung', display: 'Tórax - Pulmón' }, relation: 'exact', confidence: 'high'
  }
}] });
assert.equal(equivalences[0]?.definition.cie10.code, 'C34.9');

const search = normalizeDiagnosisCatalogResults({ version: '2026', source: 'local', items: [{ code: 'C50.9', display: 'Mama', group: 'Neoplasias' }] });
assert.deepEqual(search[0], { code: 'C50.9', display: 'Mama', group: 'Neoplasias', version: '2026', source: 'local', sourceConceptId: '' });

const diagnosis = blankDiagnosisEquivalence();
assert.equal(validateDiagnosisEquivalenceDraft(diagnosis)[0], 'Escriba el nombre de la equivalencia.');
diagnosis.name = 'Próstata';
diagnosis.snomed = { code: '399068003', display: 'Neoplasia de próstata', version: '', source: '', sourceConceptId: '' };
diagnosis.cie10 = { code: 'C61', display: 'Tumor maligno de próstata', version: '', source: '', sourceConceptId: '' };
diagnosis.ajcc = { code: 'prostate', display: 'Genitourinario - Próstata', version: '8', source: 'AJCC', sourceConceptId: '' };
assert.deepEqual(validateDiagnosisEquivalenceDraft(diagnosis), []);
const diagnosisPayload = buildDiagnosisEquivalencePayload(diagnosis, 4);
assert.equal(diagnosisPayload['expectedRevision'], 4);
assert.equal(((diagnosisPayload['definition'] as Record<string, unknown>)['ajcc'] as Record<string, unknown>)['sourceConceptId'], undefined);

assert.deepEqual(validateStudyTemplateDraft({
  title: 'Pelvis', category: 'ginecologia', tags: '', author: 'HCOP', attribution: '',
  sourceUrl: 'http://inseguro.test', license: 'Propia', licenseUrl: '', description: '', rightsConfirmed: true, active: true
}, true), ['La fuente debe comenzar con https://.']);

console.log('configuration-catalogs normalizers: ok');
