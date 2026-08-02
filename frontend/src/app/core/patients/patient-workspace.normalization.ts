import type { PatientWorkspace } from './patient-workspace.models';

export function normalizePatientWorkspace(workspace: PatientWorkspace): PatientWorkspace {
  const stateRevision = workspace.state.meta?.['persistenceRevision'];
  const revision = positiveRevision(workspace.revision)
    || positiveRevision(workspace.document?.revision)
    || positiveRevision(stateRevision);
  if (!revision) throw new Error('La base clínica no devolvió una revisión válida de la historia.');
  return {
    ...workspace,
    revision,
    updatedAt: workspace.updatedAt || workspace.document?.updatedAt
  };
}

function positiveRevision(value: unknown): number {
  const revision = Number(value);
  return Number.isSafeInteger(revision) && revision > 0 ? revision : 0;
}
