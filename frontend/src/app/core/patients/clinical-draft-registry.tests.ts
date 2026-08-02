import { deepStrictEqual, equal, notEqual, throws } from 'node:assert/strict';
import { ClinicalDraftRegistryService } from './clinical-draft-registry.service';

let assertions = 0;
const check = (actual: unknown, expected: unknown, message?: string): void => {
  equal(actual, expected, message); assertions += 1;
};

const registry = new ClinicalDraftRegistryService();
check(registry.hasDirty(), false, 'empieza sin borradores sucios');

throws(() => registry.acquire({ patientId: '', label: 'Resumen' })); assertions += 1;
throws(() => registry.acquire({ patientId: '42', label: '' })); assertions += 1;

const first = registry.acquire({ patientId: ' 42 ', label: ' Conclusión / resumen ' });
check(first.patientId, '42');
check(first.label, 'Conclusión / resumen');
check(Object.isFrozen(first), true);
check(registry.isDirty(first), false);

registry.setDirty(first, true);
check(registry.isDirty(first), true);
check(registry.hasDirty(), true);
check(registry.hasDirtyForPatient('42'), true);
check(registry.hasDirtyForPatient('7'), false);

const second = registry.acquire({ patientId: '7', label: 'Motivo de consulta' });
notEqual(first.token, second.token); assertions += 1;
registry.setDirty(second, true);
registry.markClean(first);
check(registry.isDirty(first), false);
check(registry.hasDirty(), true, 'el segundo borrador continúa sucio');

registry.release(first);
registry.release(first);
registry.setDirty(first, true);
check(registry.isDirty(first), false, 'un handle liberado queda inerte');

registry.clearPatient('7');
check(registry.hasDirty(), false);
registry.setDirty(second, true);
check(registry.isDirty(second), false, 'un handle invalidado por paciente queda inerte');

const publicKeys = Object.keys(registry.acquire({ patientId: '8', label: 'Examen físico' })).sort();
deepStrictEqual(publicKeys, ['label', 'patientId', 'token']); assertions += 1;

console.log(`OK · ${assertions} aserciones · registro clínico sucio sin contenido`);
