export type ResearchMatchReviewProfile =
  | 'sensitivity-oriented'
  | 'balanced'
  | 'specificity-oriented';

export type ResearchMatchExecutionState =
  | 'not-run'
  | 'not-evaluable'
  | 'hard-incompatible'
  | 'human-review';

export type ResearchMatchAuditRank = 'possible-review' | 'high-concordance-review';
export type ResearchMatchCriterionState = 'meets' | 'does-not-meet' | 'unknown';

export interface ResearchMatchProfileOption {
  readonly id: ResearchMatchReviewProfile;
  readonly label: string;
  readonly description: string;
  readonly effects: readonly ('breadth' | 'ranking' | 'questions')[];
  readonly changesHardRules: false;
}

export interface ResearchMatchExecutionOption {
  readonly id: ResearchMatchExecutionState;
  readonly label: string;
  readonly description: string;
}

export interface ResearchMatchAuditRankOption {
  readonly id: ResearchMatchAuditRank;
  readonly label: string;
  readonly description: string;
}

export interface ResearchMatchCapability {
  readonly engineReady: boolean;
  readonly executionState: 'not-run';
  readonly message: string;
}

export interface ResearchMatchCriterionEvaluation {
  readonly id: string;
  readonly label: string;
  readonly state: ResearchMatchCriterionState;
  readonly hard: boolean;
  readonly requirement: string;
  readonly patientEvidence: string;
  readonly sourceName: string;
  readonly sourceVersion: string;
  readonly sourceUrl: string;
}

export interface ResearchMatchResolution {
  readonly state: ResearchMatchExecutionState;
  readonly rank: ResearchMatchAuditRank | null;
}

export const RESEARCH_MATCH_PROFILES: readonly ResearchMatchProfileOption[] = [
  {
    id: 'sensitivity-oriented',
    label: 'Sensibilidad relativa',
    description: 'Amplía los casos a revisar, adelanta señales compatibles y puede formular más preguntas de alto valor.',
    effects: ['breadth', 'ranking', 'questions'],
    changesHardRules: false
  },
  {
    id: 'balanced',
    label: 'Equilibrado',
    description: 'Balancea amplitud, orden de revisión y preguntas sin alterar criterios obligatorios.',
    effects: ['breadth', 'ranking', 'questions'],
    changesHardRules: false
  },
  {
    id: 'specificity-oriented',
    label: 'Especificidad relativa',
    description: 'Acota la revisión a mayor concordancia estructurada y puede dejar más casos como no evaluables.',
    effects: ['breadth', 'ranking', 'questions'],
    changesHardRules: false
  }
];

export const RESEARCH_MATCH_EXECUTION_STATES: readonly ResearchMatchExecutionOption[] = [
  {
    id: 'not-run',
    label: 'No ejecutado',
    description: 'No se realizó una evaluación para esta historia y versión de fuentes.'
  },
  {
    id: 'not-evaluable',
    label: 'No evaluable / faltan datos',
    description: 'Falta información decisiva, es ambigua o todavía no fue validada.'
  },
  {
    id: 'hard-incompatible',
    label: 'Contradicción con regla obligatoria',
    description: 'Un dato explícito contradice un requisito obligatorio; debe mostrarse con evidencia y revisarse profesionalmente.'
  },
  {
    id: 'human-review',
    label: 'Requiere auditoría humana',
    description: 'No apareció una incompatibilidad computable; un profesional debe revisar el protocolo completo.'
  }
];

export const RESEARCH_MATCH_AUDIT_RANKS: readonly ResearchMatchAuditRankOption[] = [
  {
    id: 'possible-review',
    label: 'Posible para auditar',
    description: 'Prioridad ordinal de revisión con señales compatibles e incertidumbre pendiente.'
  },
  {
    id: 'high-concordance-review',
    label: 'Alta concordancia para auditar',
    description: 'Prioridad ordinal superior por mayor concordancia estructurada; no es una probabilidad.'
  }
];

const PROFILES = new Set<ResearchMatchReviewProfile>(
  RESEARCH_MATCH_PROFILES.map((option) => option.id)
);

export function normalizeResearchMatchProfile(value: unknown): ResearchMatchReviewProfile {
  return typeof value === 'string' && PROFILES.has(value as ResearchMatchReviewProfile)
    ? value as ResearchMatchReviewProfile
    : 'balanced';
}

export function researchMatchCapability(engineReady: boolean): ResearchMatchCapability {
  return {
    engineReady,
    executionState: 'not-run',
    message: engineReady
      ? 'La capacidad fue informada, pero esta vista todavía no tiene una ejecución ni un contrato de resultados conectado.'
      : 'La ingesta y el motor de coincidencias todavía no están disponibles.'
  };
}

export function resolveResearchMatch(
  executed: boolean,
  criteria: readonly ResearchMatchCriterionEvaluation[],
  requestedRank: ResearchMatchAuditRank = 'possible-review'
): ResearchMatchResolution {
  if (!executed) return { state: 'not-run', rank: null };
  if (criteria.some((criterion) => criterion.hard && criterion.state === 'does-not-meet')) {
    return { state: 'hard-incompatible', rank: null };
  }
  if (!criteria.length
      || criteria.some((criterion) => criterion.hard && criterion.state === 'unknown')) {
    return { state: 'not-evaluable', rank: null };
  }
  return {
    state: 'human-review',
    rank: requestedRank === 'high-concordance-review'
      ? 'high-concordance-review'
      : 'possible-review'
  };
}

export function visibleResearchMatchCriteria(
  criteria: readonly ResearchMatchCriterionEvaluation[]
): readonly ResearchMatchCriterionEvaluation[] {
  const rank: Record<ResearchMatchCriterionState, number> = {
    'does-not-meet': 0,
    unknown: 1,
    meets: 2
  };
  return [...criteria].sort((left, right) =>
    Number(right.hard) - Number(left.hard)
      || rank[left.state] - rank[right.state]
      || left.label.localeCompare(right.label, 'es-AR')
  );
}
