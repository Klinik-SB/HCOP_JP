export interface InstitutionalCalculatorOption {
  readonly [key: string]: unknown;
  readonly value: string;
  readonly label: string;
}

export interface InstitutionalCalculatorField {
  readonly [key: string]: unknown;
  readonly key: string;
  readonly label: string;
  readonly help: string;
  readonly unit: string;
  readonly options: readonly InstitutionalCalculatorOption[];
}

/**
 * Definicion operativa entregada por PostgreSQL.
 *
 * Las propiedades adicionales se conservan para una futura integracion de
 * formulas y scores, pero este corte solo aplica personalizaciones `builtin`.
 */
export interface InstitutionalCalculatorDefinition {
  readonly [key: string]: unknown;
  readonly mode: string;
  readonly replacesBuiltInKey: string;
  readonly category: string;
  readonly source: string;
  readonly clinicalUse: string;
  readonly fields: readonly InstitutionalCalculatorField[];
}

export interface InstitutionalCalculatorItem {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly revision: number;
  readonly definition: InstitutionalCalculatorDefinition;
}

export interface InstitutionalToolSettingsDefinition {
  readonly [key: string]: unknown;
  readonly disabledBuiltInKeys: readonly string[];
}

export interface InstitutionalToolSettings {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly revision: number;
  readonly definition: InstitutionalToolSettingsDefinition;
}

export interface InstitutionalCalculatorCatalog {
  readonly ok: boolean;
  readonly calculators: readonly InstitutionalCalculatorItem[];
  readonly settings: InstitutionalToolSettings;
  readonly total: number;
}

export interface CalculatorCatalogApiError {
  readonly status: number;
  readonly code: string;
  readonly message: string;
}
