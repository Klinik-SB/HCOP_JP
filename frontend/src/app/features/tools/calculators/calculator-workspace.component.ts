import { Component, OnDestroy, computed, effect, inject, input, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { CalculatorCatalogService } from './calculator-catalog.service';
import {
  catalogFailurePresentation,
  catalogStatusCanRetry,
  evaluateCalculatorSafely
} from './calculator-workspace.helpers';
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
import { assembleInstitutionalCalculatorCatalog } from './institutional-calculator-catalog.assembler';
import { InstitutionalCalculatorCatalog } from './institutional-calculator-catalog.validator';

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
export class CalculatorWorkspaceComponent implements OnDestroy {
  private readonly calculatorCatalogService = inject(CalculatorCatalogService);
  private readonly subscriptions = new Subscription();
  private catalogRequest: Subscription | null = null;
  private catalogRequestSequence = 0;
  private catalogStarted = false;
  private pendingSelectedCalculatorId = '';

  readonly canCalculate = input(true);
  readonly categories = CATEGORIES;
  readonly activeCategory = signal('general');
  readonly selectedCalculatorId = signal('');
  readonly values = signal<CalculatorInput>({});
  readonly evaluation = signal<CalculatorEvaluation | null>(null);
  readonly catalogLoading = signal(false);
  readonly catalogError = signal('');
  readonly catalogErrorStatus = signal<number | null>(null);
  readonly catalogReady = signal(false);
  readonly calculators = signal<readonly CalculatorDefinition[]>([]);

  readonly catalogRetryAllowed = computed(() => {
    if (!this.catalogError()) return false;
    return catalogStatusCanRetry(this.catalogErrorStatus());
  });

  readonly filteredCalculators = computed<readonly CalculatorDefinition[]>(() => {
    const category = this.activeCategory();
    return this.calculators().filter((calculator) => category === 'all' || calculator.category === category);
  });

  readonly activeCalculator = computed<CalculatorDefinition | null>(() =>
    this.calculators().find((calculator) => calculator.id === this.selectedCalculatorId()) ?? null
  );

  readonly displayedResult = computed(() => {
    if (!this.canCalculate()) return FORBIDDEN_RESULT;
    return this.evaluation()?.result ?? IDLE_RESULT;
  });

  constructor() {
    this.subscriptions.add(this.calculatorCatalogService.invalidated$.subscribe(() => {
      if (this.canCalculate()) this.loadCatalog(true);
      else this.closeCatalog();
    }));

    effect(() => {
      if (!this.canCalculate()) {
        this.catalogStarted = false;
        this.closeCatalog();
        return;
      }
      if (this.catalogStarted) return;
      this.catalogStarted = true;
      this.loadCatalog(false);
    });
  }

  ngOnDestroy(): void {
    this.catalogRequest?.unsubscribe();
    this.subscriptions.unsubscribe();
  }

  retryCatalog(): void {
    if (!this.canCalculate() || this.catalogLoading()) return;
    this.loadCatalog(true);
  }

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
    this.evaluation.set(evaluateCalculatorSafely(calculator, this.values()));
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
    const calculator = this.calculators().find((entry) => entry.id === id);
    this.selectedCalculatorId.set(calculator?.id ?? '');
    this.values.set(initialValues(calculator));
    this.evaluation.set(null);
  }

  private loadCatalog(force: boolean): void {
    if (!this.canCalculate()) return;

    const selectedId = this.selectedCalculatorId();
    if (selectedId) this.pendingSelectedCalculatorId = selectedId;

    const sequence = ++this.catalogRequestSequence;
    this.catalogRequest?.unsubscribe();
    this.catalogRequest = null;
    this.catalogLoading.set(true);
    this.catalogError.set('');
    this.catalogErrorStatus.set(null);
    this.catalogReady.set(false);
    this.calculators.set([]);
    this.evaluation.set(null);

    this.catalogRequest = this.calculatorCatalogService.load(force).subscribe({
      next: (catalog) => {
        if (sequence !== this.catalogRequestSequence) return;
        this.acceptCatalog(catalog);
      },
      error: (failure: unknown) => {
        if (sequence !== this.catalogRequestSequence) return;
        const presentation = catalogFailurePresentation(failure);
        this.rejectCatalog(presentation.message, presentation.status);
      }
    });
  }

  private acceptCatalog(catalog: InstitutionalCalculatorCatalog): void {
    if (!catalog.ok) {
      this.rejectCatalog('La configuración institucional de calculadoras no es válida.');
      return;
    }

    let calculators: readonly CalculatorDefinition[];
    try {
      calculators = assembleInstitutionalCalculatorCatalog(PORTED_CALCULATORS, catalog);
    } catch (failure: unknown) {
      const presentation = catalogFailurePresentation(failure);
      this.rejectCatalog(presentation.message, presentation.status);
      return;
    }

    const selectedId = this.pendingSelectedCalculatorId;
    this.pendingSelectedCalculatorId = '';
    this.calculators.set(calculators);
    this.reconcileWorkspace(selectedId, calculators);
    this.catalogLoading.set(false);
    this.catalogError.set('');
    this.catalogErrorStatus.set(null);
    this.catalogReady.set(true);
  }

  private rejectCatalog(message: string, status: number | null = null): void {
    this.catalogLoading.set(false);
    this.catalogReady.set(false);
    this.catalogError.set(message || 'No se pudo cargar la configuración institucional de calculadoras.');
    this.catalogErrorStatus.set(status);
    this.calculators.set([]);
    this.selectedCalculatorId.set('');
    this.values.set({});
    this.evaluation.set(null);
  }

  private closeCatalog(): void {
    const selectedId = this.selectedCalculatorId();
    if (selectedId) this.pendingSelectedCalculatorId = selectedId;
    ++this.catalogRequestSequence;
    this.catalogRequest?.unsubscribe();
    this.catalogRequest = null;
    this.catalogLoading.set(false);
    this.catalogError.set('');
    this.catalogErrorStatus.set(null);
    this.catalogReady.set(false);
    this.calculators.set([]);
    this.selectedCalculatorId.set('');
    this.values.set({});
    this.evaluation.set(null);
  }

  private reconcileWorkspace(
    selectedId: string,
    calculators: readonly CalculatorDefinition[]
  ): void {
    const preserved = selectedId
      ? calculators.find((calculator) => calculator.id === selectedId)
      : undefined;

    if (preserved) {
      if (this.activeCategory() !== 'all' && preserved.category !== this.activeCategory()) {
        this.activeCategory.set(CATEGORIES.some((category) => category.id === preserved.category)
          ? preserved.category
          : 'all');
      }
      this.selectedCalculatorId.set(preserved.id);
      this.values.set(initialValues(preserved));
      this.evaluation.set(null);
      return;
    }

    const first = calculators.find((calculator) =>
      this.activeCategory() === 'all' || calculator.category === this.activeCategory()
    );
    this.selectedCalculatorId.set(first?.id ?? '');
    this.values.set(initialValues(first));
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
