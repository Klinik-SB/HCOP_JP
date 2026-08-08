import { Component, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HELP_ROLES, HELP_SECTIONS, HelpRole, HelpSection } from './help-content';

@Component({ selector: 'app-help-center', imports: [RouterLink], host: { class: 'help-center-host' }, templateUrl: './help-center.component.html', styleUrl: './help-center.component.scss' })
export class HelpCenterComponent {
  readonly roles = HELP_ROLES;
  readonly query = signal('');
  readonly selectedRole = signal<HelpRole>('Todos');
  readonly activeSectionId = signal(HELP_SECTIONS[0]?.id ?? 'inicio');
  readonly videoVisible = signal(false);
  readonly filteredSections = computed<readonly HelpSection[]>(() => {
    const query = normalize(this.query());
    const role = this.selectedRole();
    return HELP_SECTIONS.filter((section) => {
      if (role !== 'Todos' && !section.roles.includes('Todos') && !section.roles.includes(role)) return false;
      if (!query) return true;
      return normalize([section.eyebrow, section.title, section.summary, ...section.roles, ...section.keywords,
        ...section.steps.flatMap((step) => [step.title, step.detail]), ...(section.notes ?? []), section.warning ?? ''].join(' ')).includes(query);
    });
  });
  readonly activeSection = computed<HelpSection | null>(() => {
    const sections = this.filteredSections();
    return sections.find((section) => section.id === this.activeSectionId()) ?? sections[0] ?? null;
  });

  updateQuery(event: Event): void { const target = event.target; this.query.set(target instanceof HTMLInputElement ? target.value : ''); this.ensureVisibleSelection(); }
  chooseRole(role: HelpRole): void { this.selectedRole.set(role); this.ensureVisibleSelection(); }
  openSection(id: string): void { if (!this.filteredSections().some((section) => section.id === id)) return; this.activeSectionId.set(id); this.videoVisible.set(false); }
  clearSearch(): void { this.query.set(''); this.selectedRole.set('Todos'); this.activeSectionId.set(HELP_SECTIONS[0]?.id ?? 'inicio'); }
  private ensureVisibleSelection(): void { const sections = this.filteredSections(); const first = sections[0]; if (first && !sections.some((section) => section.id === this.activeSectionId())) { this.activeSectionId.set(first.id); this.videoVisible.set(false); } }
}

function normalize(value: string): string { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-AR').trim(); }
