import { evaluateCalculator } from './calculator.engine';
import {
  CalculatorDefinition,
  CalculatorEvaluation,
  CalculatorInput,
  CalculatorResult
} from './calculator.models';

const CALCULATION_FAILURE_RESULT: CalculatorResult = {
  title: 'No se pudo completar el cálculo',
  detail: 'El motor no pudo procesar estos datos de forma segura. Revisá los valores e intentá nuevamente.',
  badge: 'cálculo no disponible',
  score: 0,
  showScore: false,
  severity: 'warn',
  metrics: [],
  notes: []
};

export interface CatalogFailurePresentation {
  readonly status: number | null;
  readonly message: string;
  readonly retryAllowed: boolean;
}

export function evaluateCalculatorSafely(
  calculator: CalculatorDefinition,
  values: CalculatorInput
): CalculatorEvaluation {
  try {
    return evaluateCalculator(calculator, values);
  } catch {
    return {
      status: 'invalid',
      values: {},
      issues: [],
      result: CALCULATION_FAILURE_RESULT
    };
  }
}

export function catalogFailurePresentation(failure: unknown): CatalogFailurePresentation {
  const status = catalogFailureStatus(failure);
  const message = catalogFailureMessage(failure);
  return {
    status,
    message,
    retryAllowed: catalogStatusCanRetry(status)
  };
}

export function catalogStatusCanRetry(status: number | null): boolean {
  return status === null || status === 0 || status >= 500;
}

function catalogFailureStatus(failure: unknown): number | null {
  if (failure === null || typeof failure !== 'object' || !('status' in failure)) return null;
  const status = Number((failure as { readonly status?: unknown }).status);
  return Number.isInteger(status) && status >= 0 ? status : null;
}

function catalogFailureMessage(failure: unknown): string {
  if (failure instanceof Error && failure.message.trim()) return failure.message.trim();
  if (failure !== null && typeof failure === 'object' && 'message' in failure) {
    const message = (failure as { readonly message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message.trim();
  }
  return 'No se pudo cargar la configuración institucional de calculadoras.';
}
