export type ToolPane = 'guides' | 'tnm' | 'calculators';

export interface GuideItem {
  readonly name: string;
  readonly url: string;
  readonly title: string;
  readonly site: string;
  readonly audience: string;
  readonly source: string;
  readonly version: string;
  readonly tags: readonly string[];
  readonly description: string;
  readonly active: boolean;
  readonly size: number;
  readonly updatedAt: string;
}

export interface GuideCatalog {
  readonly guides: readonly GuideItem[];
  readonly count: number;
}

export interface AjccSiteSummary {
  readonly id: string;
  readonly name: string;
  readonly group: string;
}

export interface AjccCatalog {
  readonly edition: string;
  readonly source: string;
  readonly sites: readonly AjccSiteSummary[];
  readonly count: number;
}

export interface AjccCategory {
  readonly code: string;
  readonly description: string;
  readonly notes: readonly string[];
}

export interface AjccAxis {
  readonly label: string;
  readonly categories: readonly AjccCategory[];
}

export interface AjccSiteDetail {
  readonly id: string;
  readonly name: string;
  readonly edition: string;
  readonly source: string;
  readonly guideVersion: string;
  readonly axes: Readonly<Record<string, AjccAxis>>;
}

export interface AjccStageRequest {
  readonly id: string;
  readonly values: Readonly<Record<string, string>>;
}

export interface AjccStageResult {
  readonly stage: string;
  readonly missing: readonly string[];
  readonly sourceRow: number | null;
}

export interface ToolsApiError {
  readonly status: number;
  readonly code: string;
  readonly message: string;
}
