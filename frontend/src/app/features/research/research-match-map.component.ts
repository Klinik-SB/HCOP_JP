import { Component, computed, inject, signal } from '@angular/core';
import { PatientWorkspaceService } from '../../core/patients/patient-workspace.service';
import { TrialScreeningPreferenceService } from '../../core/research/trial-screening-preference.service';
import {
  RESEARCH_MATCH_AUDIT_RANKS,
  RESEARCH_MATCH_EXECUTION_STATES,
  RESEARCH_MATCH_PROFILES,
  ResearchMatchReviewProfile,
  researchMatchCapability
} from './research-match-map.models';

@Component({
  selector: 'app-research-match-map',
  templateUrl: './research-match-map.component.html',
  styleUrl: './research-match-map.component.scss'
})
export class ResearchMatchMapComponent {
  readonly workspace = inject(PatientWorkspaceService);
  readonly screening = inject(TrialScreeningPreferenceService);
  readonly profiles = RESEARCH_MATCH_PROFILES;
  readonly executionStates = RESEARCH_MATCH_EXECUTION_STATES;
  readonly auditRanks = RESEARCH_MATCH_AUDIT_RANKS;
  readonly profile = signal<ResearchMatchReviewProfile>('balanced');
  readonly capability = computed(() => researchMatchCapability(
    this.screening.state()?.engineReady === true
  ));
  readonly personalPreferenceMessage = computed(() => {
    const state = this.screening.state();
    if (!state) return 'La preferencia personal todavía no está disponible.';
    if (!state.researchActive) {
      return 'La futura consulta manual seguirá disponible aunque Investigación activa esté desactivada.';
    }
    if (!state.institutionalEnabled) {
      return 'Su preferencia está activa, pero la institución mantiene esta función pausada.';
    }
    if (state.mode === 'manual') {
      return 'Su preferencia está activa; el modo institucional es manual y no genera avisos proactivos.';
    }
    if (!state.engineReady) {
      return 'Su preferencia está activa (preparada); el motor de coincidencias todavía no está disponible.';
    }
    return state.proactiveActive
      ? 'La investigación proactiva está activa para este usuario.'
      : 'La preferencia está guardada, pero la investigación proactiva no está activa.';
  });

  selectProfile(profile: ResearchMatchReviewProfile): void {
    this.profile.set(profile);
  }

  profileDescription(): string {
    return this.profiles.find((option) => option.id === this.profile())?.description || '';
  }
}
