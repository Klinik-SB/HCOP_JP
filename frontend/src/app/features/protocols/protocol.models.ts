export type ProtocolSource = 'clinical' | 'seer';

export interface ProtocolCatalog {
  readonly source: ProtocolSource;
  readonly items: readonly ProtocolCatalogItem[];
  readonly categories: readonly string[];
  readonly total: number;
  readonly currentCount: number;
  readonly catalogCount: number;
  readonly referenceOnly: boolean;
}

export interface ProtocolCatalogItem {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly description: string;
  readonly cycleDays: number | null;
  readonly durationMinutes: number | null;
  readonly durationText: string;
  readonly active: boolean;
  readonly catalogOnly: boolean;
  readonly componentCount: number;
  readonly histology: string;
  readonly remarks: string;
  readonly alternateNames: string;
}

export interface ProtocolDetail {
  readonly source: ProtocolSource;
  readonly scheme: ProtocolCatalogItem;
  readonly drugs: readonly ProtocolDrug[];
  readonly referenceOnly: boolean;
}

export interface ProtocolDrug {
  readonly id: string;
  readonly drugId: string;
  readonly name: string;
  readonly day: string;
  readonly dose: string;
  readonly doseUnit: string;
  readonly doseCalculation: string;
  readonly route: string;
  readonly administrationTime: string;
  readonly dayHospital: boolean | null;
  readonly preparations: readonly ProtocolPreparation[];
  readonly presentations: readonly ProtocolPresentation[];
}

export interface ProtocolPreparation {
  readonly id: string;
  readonly title: string;
  readonly route: string;
  readonly reconstituent: string;
  readonly concentration: string;
  readonly diluent: string;
  readonly finalVolume: string;
  readonly stabilityRoomTemperature: string;
  readonly stabilityRefrigerated: string;
  readonly laboratory: string;
  readonly photosensitive: boolean | null;
  readonly infusionGuide: string;
  readonly preparationObservations: string;
  readonly labelObservations: string;
}

export interface ProtocolPresentation {
  readonly id: string;
  readonly label: string;
  readonly amount: string;
  readonly form: string;
  readonly vial: boolean | null;
}

export interface ProtocolApiFailure {
  readonly status?: number;
  readonly error?: {
    readonly status?: number;
    readonly code?: string;
    readonly error?: string;
    readonly message?: string;
  };
  readonly message?: string;
}
