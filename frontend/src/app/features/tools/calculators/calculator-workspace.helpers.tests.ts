import {
  catalogFailurePresentation,
  evaluateCalculatorSafely
} from './calculator-workspace.helpers';
import { CalculatorDefinition, CalculatorResult } from './calculator.models';

interface TestCase {
  readonly name: string;
  readonly run: () => void;
}

const tests: TestCase[] = [];
let assertions = 0;

function test(name: string, run: () => void): void {
  tests.push({ name, run });
}

function equal(actual: unknown, expected: unknown, message = ''): void {
  assertions += 1;
  if (!Object.is(actual, expected)) {
    throw new Error(`${message ? `${message}: ` : ''}esperado ${String(expected)}, recibido ${String(actual)}.`);
  }
}

test('401 conserva el estado y no permite reintentar', () => {
  const result = catalogFailurePresentation({ status: 401, message: 'La sesión venció.' });
  equal(result.status, 401);
  equal(result.message, 'La sesión venció.');
  equal(result.retryAllowed, false);
});

test('403 conserva el estado y no permite reintentar', () => {
  const result = catalogFailurePresentation({ status: 403, message: 'Acceso restringido.' });
  equal(result.status, 403);
  equal(result.message, 'Acceso restringido.');
  equal(result.retryAllowed, false);
});

test('500 conserva el estado y permite reintentar', () => {
  const result = catalogFailurePresentation({ status: 500, message: 'Servicio no disponible.' });
  equal(result.status, 500);
  equal(result.message, 'Servicio no disponible.');
  equal(result.retryAllowed, true);
});

test('un error de contrato sin status permite reintentar', () => {
  const result = catalogFailurePresentation(new Error('Contrato inválido.'));
  equal(result.status, null);
  equal(result.message, 'Contrato inválido.');
  equal(result.retryAllowed, true);
});

test('evaluateCalculatorSafely conserva una evaluación exitosa', () => {
  const result = evaluateCalculatorSafely(calculator(() => successResult()), {});
  equal(result.status, 'calculated');
  equal(result.result.title, 'Resultado correcto');
  equal(result.result.severity, 'good');
});

test('evaluateCalculatorSafely convierte una excepción en advertencia segura', () => {
  const result = evaluateCalculatorSafely(calculator(() => {
    throw new Error('detalle interno secreto');
  }), {});
  equal(result.status, 'invalid');
  equal(result.issues.length, 0);
  equal(result.result.severity, 'warn');
  equal(result.result.title, 'No se pudo completar el cálculo');
  equal(result.result.detail.includes('detalle interno secreto'), false);
});

function calculator(calculate: () => CalculatorResult): CalculatorDefinition {
  return {
    id: 'helper-test',
    title: 'Prueba de helper',
    shortTitle: 'Prueba',
    category: 'general',
    subtitle: 'Prueba pura',
    source: 'Suite local',
    clinicalUse: 'Validar el resguardo del workspace.',
    fields: [],
    calculate
  };
}

function successResult(): CalculatorResult {
  return {
    title: 'Resultado correcto',
    detail: 'La evaluación finalizó.',
    badge: 'ok',
    score: 0,
    showScore: false,
    severity: 'good',
    metrics: [],
    notes: []
  };
}

const failures: string[] = [];
for (const entry of tests) {
  try {
    entry.run();
  } catch (failure) {
    failures.push(`${entry.name}: ${failure instanceof Error ? failure.message : String(failure)}`);
  }
}
if (failures.length) throw new Error(`Fallaron ${failures.length}/${tests.length} pruebas:\n${failures.join('\n')}`);
console.log(`OK · ${tests.length} pruebas · ${assertions} aserciones de helpers del workspace`);
