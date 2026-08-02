import { inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';
import { PatientWorkspaceService } from './patient-workspace.service';

export const pendingClinicalDraftGuard: CanDeactivateFn<unknown> = () => {
  const workspace = inject(PatientWorkspaceService);
  return !workspace.hasPendingClinicalWork();
};
