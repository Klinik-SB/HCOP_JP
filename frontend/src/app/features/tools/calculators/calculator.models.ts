export type CalculatorOrigin =
  | 'legacy-app-js'
  | 'oncology-general'
  | 'oncology-gynecology'
  | 'oncology-gi-thorax'
  | 'radiotherapy';

export type CalculatorMigrationStatus = 'ported' | 'pending';

export interface CalculatorInventoryItem<TId extends string = string> {
  readonly ordinal: number;
  readonly id: TId;
  readonly title: string;
  readonly origin: CalculatorOrigin;
  readonly legacySource: string;
  readonly migrationStatus: CalculatorMigrationStatus;
}

export interface CalculatorOption {
  readonly value: string;
  readonly label: string;
}

interface CalculatorFieldBase<TKind extends string> {
  readonly id: string;
  readonly kind: TKind;
  readonly label: string;
  readonly required: boolean;
  readonly help?: string;
  readonly wide?: boolean;
  readonly scenario?: string;
}

export interface CalculatorNumberField extends CalculatorFieldBase<'number'> {
  readonly unit?: string;
  readonly initialValue: number | '';
  readonly exampleValue?: number;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
}

export interface CalculatorSelectField extends CalculatorFieldBase<'select'> {
  readonly initialValue: string;
  readonly exampleValue?: string;
  readonly options: readonly CalculatorOption[];
}

export interface CalculatorCheckboxField extends CalculatorFieldBase<'checkbox'> {
  readonly initialValue: boolean;
  readonly weight?: number;
}

export interface CalculatorSectionField extends CalculatorFieldBase<'section'> {
  readonly required: false;
  readonly initialValue: '';
}

export type CalculatorField =
  | CalculatorNumberField
  | CalculatorSelectField
  | CalculatorCheckboxField
  | CalculatorSectionField;
export type CalculatorValue = string | number | boolean;
export type CalculatorValues = Readonly<Record<string, CalculatorValue>>;
export type CalculatorInput = Readonly<Record<string, unknown>>;
export type CalculatorSeverity = 'good' | 'warn' | 'bad' | 'info';

export interface CalculatorMetric {
  readonly label: string;
  readonly value: string | number;
}

export interface CalculatorExternalLink {
  readonly kind: 'external-link';
  readonly label: string;
  readonly href: string;
}

export type CalculatorNote = string | CalculatorExternalLink;

export interface CalculatorResult {
  readonly title: string;
  readonly detail: string;
  readonly badge: string;
  readonly score: number;
  readonly scoreName?: string;
  readonly showScore: boolean;
  readonly severity: CalculatorSeverity;
  readonly metrics: readonly CalculatorMetric[];
  readonly notes: readonly CalculatorNote[];
}

export type CalculatorValidationCode =
  | 'required'
  | 'not-a-number'
  | 'below-minimum'
  | 'above-maximum'
  | 'step-mismatch'
  | 'unknown-option';

export interface CalculatorValidationIssue {
  readonly fieldId: string;
  readonly label: string;
  readonly code: CalculatorValidationCode;
  readonly message: string;
}

export interface CalculatorEvaluation {
  readonly status: 'calculated' | 'invalid';
  readonly values: CalculatorValues;
  readonly issues: readonly CalculatorValidationIssue[];
  readonly result: CalculatorResult;
}

export interface CalculatorDefinition<TId extends string = string> {
  readonly id: TId;
  readonly title: string;
  readonly category: string;
  readonly subtitle: string;
  readonly source: string;
  readonly clinicalUse: string;
  readonly fields: readonly CalculatorField[];
  readonly isFieldValidationActive?: (fieldId: string, values: CalculatorValues) => boolean;
  readonly calculate: (values: CalculatorValues) => CalculatorResult;
}
