import { Injectable, computed, signal } from '@angular/core';

export interface ClinicalDraftHandle {
  readonly token: string;
  readonly patientId: string;
  readonly label: string;
}

export interface ClinicalDraftRegistration {
  readonly patientId: string;
  /** Etiqueta estática de interfaz. Nunca debe contener datos del paciente. */
  readonly label: string;
}

interface ClinicalDraftEntry extends ClinicalDraftHandle {
  readonly dirty: boolean;
}

/**
 * Registro efímero de editores con cambios locales.
 *
 * Deliberadamente sólo conserva identidad opaca, contexto y estado sucio. El
 * contenido clínico permanece en el componente que lo edita y nunca se copia
 * aquí, ni se serializa en storage.
 */
@Injectable({ providedIn: 'root' })
export class ClinicalDraftRegistryService {
  private readonly entries = signal<ReadonlyMap<string, ClinicalDraftEntry>>(new Map());

  readonly hasDirty = computed(() => [...this.entries().values()].some((entry) => entry.dirty));

  acquire(registration: ClinicalDraftRegistration): ClinicalDraftHandle {
    const patientId = registration.patientId.trim();
    const label = registration.label.trim().slice(0, 80);
    if (!patientId) throw new Error('El borrador clínico requiere un paciente.');
    if (!label) throw new Error('El borrador clínico requiere una etiqueta estática.');
    const handle: ClinicalDraftHandle = Object.freeze({ token: this.token(), patientId, label });
    this.entries.update((current) => {
      const next = new Map(current);
      next.set(handle.token, { ...handle, dirty: false });
      return next;
    });
    return handle;
  }

  setDirty(handle: ClinicalDraftHandle, dirty: boolean): void {
    this.update(handle, (entry) => entry.dirty === dirty ? entry : { ...entry, dirty });
  }

  markClean(handle: ClinicalDraftHandle): void {
    this.setDirty(handle, false);
  }

  isDirty(handle: ClinicalDraftHandle): boolean {
    const entry = this.entries().get(handle.token);
    return Boolean(entry?.patientId === handle.patientId && entry.dirty);
  }

  hasDirtyForPatient(patientId: string): boolean {
    const expected = patientId.trim();
    return [...this.entries().values()].some((entry) => entry.patientId === expected && entry.dirty);
  }

  release(handle: ClinicalDraftHandle): void {
    const entry = this.entries().get(handle.token);
    if (!entry || entry.patientId !== handle.patientId) return;
    this.entries.update((current) => {
      const next = new Map(current);
      next.delete(handle.token);
      return next;
    });
  }

  clearPatient(patientId: string): void {
    const expected = patientId.trim();
    if (!expected) return;
    this.entries.update((current) => {
      const next = new Map(current);
      for (const [token, entry] of next) {
        if (entry.patientId === expected) next.delete(token);
      }
      return next.size === current.size ? current : next;
    });
  }

  private update(
    handle: ClinicalDraftHandle,
    transform: (entry: ClinicalDraftEntry) => ClinicalDraftEntry
  ): void {
    const entry = this.entries().get(handle.token);
    if (!entry || entry.patientId !== handle.patientId) return;
    const updated = transform(entry);
    if (updated === entry) return;
    this.entries.update((current) => {
      const latest = current.get(handle.token);
      if (!latest || latest.patientId !== handle.patientId) return current;
      const next = new Map(current);
      next.set(handle.token, transform(latest));
      return next;
    });
  }

  private token(): string {
    return globalThis.crypto?.randomUUID?.()
      || `clinical-draft-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}
