export type ConfigurationCatalogSection = 'diagnoses' | 'guides' | 'templates';
export type DiagnosisSystem = 'snomed' | 'cie10' | 'ajcc';
export type DiagnosisRelation = 'exact' | 'broader' | 'conditional';
export type DiagnosisConfidence = 'high' | 'medium' | 'low';

export interface ConfigurationApiFailure {
  readonly status: number;
  readonly code: string;
  readonly message: string;
}

export interface ConfigurationItem<TDefinition extends object = Record<string, unknown>> {
  readonly id: string;
  readonly kind: string;
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly active: boolean;
  readonly revision: number;
  readonly definition: TDefinition;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface GuideItem {
  readonly name: string;
  readonly title: string;
  readonly site: string;
  readonly audience: string;
  readonly source: string;
  readonly version: string;
  readonly tags: readonly string[];
  readonly description: string;
  readonly active: boolean;
  readonly configurationId: string;
  readonly configurationRevision: number | null;
  readonly url: string;
  readonly size: number;
  readonly updatedAt: string;
}

export interface GuideDraft {
  title: string;
  category: string;
  audience: string;
  source: string;
  version: string;
  tags: string;
  description: string;
  active: boolean;
}

export interface StudyTemplateItem {
  readonly id: string;
  readonly configurationId: string;
  readonly configurationKey: string;
  readonly revision: number | null;
  readonly origin: 'bundled' | 'custom';
  readonly title: string;
  readonly category: string;
  readonly tags: readonly string[];
  readonly author: string;
  readonly attribution: string;
  readonly sourceUrl: string;
  readonly license: string;
  readonly licenseUrl: string;
  readonly description: string;
  readonly rightsConfirmed: boolean;
  readonly active: boolean;
  readonly available: boolean;
  readonly availabilityReason: string;
  readonly fileUrl: string;
  readonly thumbnailUrl: string;
  readonly originalFileName: string;
  readonly mime: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly definition: Record<string, unknown>;
}

export interface StudyTemplateDraft {
  title: string;
  category: string;
  tags: string;
  author: string;
  attribution: string;
  sourceUrl: string;
  license: string;
  licenseUrl: string;
  description: string;
  rightsConfirmed: boolean;
  active: boolean;
}

export interface DiagnosisConcept {
  code: string;
  display: string;
  version: string;
  source: string;
  sourceConceptId: string;
}

export interface DiagnosisEquivalenceDefinition {
  readonly schemaVersion: number;
  readonly snomed: DiagnosisConcept;
  readonly cie10: DiagnosisConcept;
  readonly ajcc: DiagnosisConcept;
  readonly relation: DiagnosisRelation;
  readonly confidence: DiagnosisConfidence;
  readonly notes: string;
}

export type DiagnosisEquivalenceItem = ConfigurationItem<DiagnosisEquivalenceDefinition>;

export interface DiagnosisEquivalenceDraft {
  name: string;
  active: boolean;
  relation: DiagnosisRelation;
  confidence: DiagnosisConfidence;
  notes: string;
  snomed: DiagnosisConcept;
  cie10: DiagnosisConcept;
  ajcc: DiagnosisConcept;
}

export interface DiagnosisDisplaySetting {
  readonly id: string;
  readonly revision: number | null;
  readonly visibleSystems: readonly DiagnosisSystem[];
}

export interface DiagnosisCatalogResult extends DiagnosisConcept {
  readonly group: string;
}

export interface DiagnosisCatalogSearch {
  readonly system: DiagnosisSystem;
  readonly query: string;
  readonly results: readonly DiagnosisCatalogResult[];
}

export const DIAGNOSIS_SYSTEMS: readonly DiagnosisSystem[] = Object.freeze(['snomed', 'cie10', 'ajcc']);

export const DIAGNOSIS_SYSTEM_LABELS: Readonly<Record<DiagnosisSystem, string>> = Object.freeze({
  snomed: 'SNOMED CT',
  cie10: 'CIE-10',
  ajcc: 'AJCC'
});

export const STUDY_TEMPLATE_CATEGORIES = Object.freeze([
  { id: 'cuerpo-completo', label: 'Cuerpo completo' },
  { id: 'ginecologia', label: 'Ginecología' },
  { id: 'urologia', label: 'Urología' },
  { id: 'torax', label: 'Tórax' },
  { id: 'abdomen', label: 'Abdomen' },
  { id: 'cabeza-cuello', label: 'Cabeza y cuello' },
  { id: 'extremidades', label: 'Extremidades' },
  { id: 'organos-individuales', label: 'Órganos individuales' }
] as const);
