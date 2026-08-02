import { Component, computed, input, signal } from '@angular/core';
import { evaluateCalculator } from './calculator.engine';
import {
  CalculatorChecklistNote,
  CalculatorDefinition,
  CalculatorEvaluation,
  CalculatorExternalLink,
  CalculatorField,
  CalculatorInput,
  CalculatorNote,
  CalculatorResult,
  CalculatorTableCell,
  CalculatorTableNote,
  CalculatorValue
} from './calculator.models';
import { PORTED_CALCULATORS } from './ported-calculator.registry';

interface CalculatorCategory {
  readonly id: string;
  readonly label: string;
}

const CATEGORIES: readonly CalculatorCategory[] = [
  { id: 'general', label: 'Generales' },
  { id: 'prostata', label: 'Próstata' },
  { id: 'vejiga', label: 'Vejiga' },
  { id: 'renal', label: 'Renal' },
  { id: 'testiculo', label: 'Testículo' },
  { id: 'mama', label: 'Mama' },
  { id: 'pulmon', label: 'Pulmón' },
  { id: 'ginecologia', label: 'Ginecología' },
  { id: 'digestivo', label: 'Digestivo' },
  { id: 'hematologia', label: 'Hematología' },
  { id: 'radioterapia', label: 'Radioterapia' },
  { id: 'all', label: 'Todas' }
];

const IDLE_RESULT: CalculatorResult = {
  title: 'Listo para calcular',
  detail: 'Completá los datos clínicos y presioná Calcular. No se usan valores ficticios ni se actualiza el resultado mientras escribís.',
  badge: 'sin resultado',
  score: 0,
  showScore: false,
  severity: 'info',
  metrics: [],
  notes: []
};

const FORBIDDEN_RESULT: CalculatorResult = {
  title: 'Cálculo restringido',
  detail: 'Su perfil puede consultar la definición, pero no ejecutar cálculos clínicos.',
  badge: 'sin permiso',
  score: 0,
  showScore: false,
  severity: 'warn',
  metrics: [],
  notes: []
};

@Component({
  selector: 'app-calculator-workspace',
  host: { class: 'embedded-tools angular-calculator-workspace' },
  templateUrl: './calculator-workspace.component.html',
  styleUrl: './calculator-workspace.component.scss'
})
export class CalculatorWorkspaceComponent {
  readonly canCalculate = input(true);
  readonly categories = CATEGORIES;
  readonly activeCategory = signal('general');
  readonly selectedCalculatorId = signal<string>(PORTED_CALCULATORS[0]?.id ?? '');
  readonly values = signal<CalculatorInput>(initialValues(PORTED_CALCULATORS[0]));
  readonly evaluation = signal<CalculatorEvaluation | null>(null);

  readonly filteredCalculators = computed<readonly CalculatorDefinition[]>(() => {
    const category = this.activeCategory();
    return PORTED_CALCULATORS.filter((calculator) => category === 'all' || calculator.category === category);
  });

  readonly activeCalculator = computed<CalculatorDefinition | null>(() =>
    PORTED_CALCULATORS.find((calculator) => calculator.id === this.selectedCalculatorId()) ?? null
  );

  readonly displayedResult = computed(() => {
    if (!this.canCalculate()) return FORBIDDEN_RESULT;
    return this.evaluation()?.result ?? IDLE_RESULT;
  });

  changeCategory(event: Event): void {
    this.activeCategory.set(controlValue(event) || 'general');
    this.openCalculator(this.filteredCalculators()[0]?.id ?? '');
  }

  changeCalculator(event: Event): void {
    this.openCalculator(controlValue(event));
  }

  updateField(field: CalculatorField, event: Event): void {
    const target = event.target;
    const value: CalculatorValue = field.kind === 'checkbox' && target instanceof HTMLInputElement
      ? target.checked
      : controlValue(event);
    this.values.update((current) => ({ ...current, [field.id]: value }));
    this.evaluation.set(null);
  }

  calculate(): void {
    const calculator = this.activeCalculator();
    if (!calculator || !this.canCalculate()) return;
    this.evaluation.set(evaluateCalculator(calculator, this.values()));
  }

  fieldVisible(field: CalculatorField): boolean {
    if (!field.scenario) return true;
    const scenario = this.values()['scenario'];
    return !scenario || scenario === field.scenario;
  }

  fieldIssue(fieldId: string): string {
    return this.evaluation()?.issues.find((issue) => issue.fieldId === fieldId)?.message ?? '';
  }

  fieldPlaceholder(field: CalculatorField): string {
    if (field.kind === 'text' || field.kind === 'textarea') {
      return field.placeholder ?? (field.exampleValue ? `Ej.: ${field.exampleValue}` : '');
    }
    if (field.kind === 'number' && field.exampleValue !== undefined) return `Ej.: ${field.exampleValue}`;
    return '';
  }

  scoreLabel(score: number): string {
    return `${Number.isFinite(score) ? Math.round(score) : 0}%`;
  }

  scoreWidth(score: number): string {
    const safe = Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 0;
    return `${safe}%`;
  }

  isExternalLink(value: CalculatorNote | CalculatorTableCell): value is CalculatorExternalLink {
    return isObjectKind(value, 'external-link');
  }

  isChecklist(value: CalculatorNote): value is CalculatorChecklistNote {
    return isObjectKind(value, 'checklist');
  }

  isTable(value: CalculatorNote): value is CalculatorTableNote {
    return isObjectKind(value, 'table');
  }

  hasEmptyOption(field: CalculatorField): boolean {
    return field.kind === 'select' && field.options.some((option) => option.value === '');
  }

  private openCalculator(id: string): void {
    const calculator = PORTED_CALCULATORS.find((entry) => entry.id === id);
    this.selectedCalculatorId.set(calculator?.id ?? '');
    this.values.set(initialValues(calculator));
    this.evaluation.set(null);
  }
}

function initialValues(calculator: CalculatorDefinition | undefined): CalculatorInput {
  if (!calculator) return {};
  return Object.fromEntries(calculator.fields.map((field) => [field.id, field.initialValue]));
}

function controlValue(event: Event): string {
  const target = event.target;
  return target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement
    ? target.value
    : '';
}

function isObjectKind<TKind extends string>(value: unknown, kind: TKind): value is { readonly kind: TKind } {
  return typeof value === 'object' && value !== null && 'kind' in value && value.kind === kind;
}
