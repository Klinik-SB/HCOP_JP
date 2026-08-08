import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import {
  AccessIdentity,
  AdminRole,
  AdminUser,
  CalculatorItem,
  DayHospitalItem,
  JsonRecord,
  LlmConfiguration,
  ResearchItem,
  SecuritySettings,
  ToolSettingsItem
} from './configuration-operations.models';
import {
  normalizeAccessIdentity,
  normalizeCalculatorCatalog,
  normalizeCalculatorMutation,
  normalizeDayHospitalCatalog,
  normalizeDayHospitalMutation,
  normalizeLlmConfiguration,
  normalizeResearchCatalog,
  normalizeResearchMutation,
  normalizeRoleMutation,
  normalizeRoles,
  normalizeSecuritySettings,
  normalizeToolSettingsCatalog,
  normalizeToolSettingsMutation,
  normalizeUserMutation,
  normalizeUsers
} from './configuration-operations.normalizers';

export const CONFIGURATION_OPERATIONS_UPDATED_EVENT = 'hcop-configuration-updated';
export const CALCULATOR_CONFIGURATION_UPDATED_EVENT = 'hcop-calculator-configuration-updated';

@Injectable({ providedIn: 'root' })
export class ConfigurationOperationsService {
  private readonly http = inject(HttpClient);

  calculators(): Observable<readonly CalculatorItem[]> {
    return this.http.get<unknown>('/api/clinical/configuration/calculator?includeInactive=1', this.options())
      .pipe(map(normalizeCalculatorCatalog));
  }

  createCalculator(payload: JsonRecord): Observable<CalculatorItem> {
    return this.http.post<unknown>('/api/clinical/configuration/calculator', payload, this.options())
      .pipe(map(normalizeCalculatorMutation));
  }

  updateCalculator(id: string, payload: JsonRecord): Observable<CalculatorItem> {
    return this.http.put<unknown>(`/api/clinical/configuration/calculator/${encodeURIComponent(id)}`, payload, this.options())
      .pipe(map(normalizeCalculatorMutation));
  }

  archiveCalculator(id: string): Observable<CalculatorItem> {
    return this.http.delete<unknown>(`/api/clinical/configuration/calculator/${encodeURIComponent(id)}`, this.options())
      .pipe(map(normalizeCalculatorMutation));
  }

  toolSettings(): Observable<ToolSettingsItem | null> {
    return this.http.get<unknown>('/api/clinical/configuration/tool-settings?includeInactive=1', this.options())
      .pipe(map(normalizeToolSettingsCatalog));
  }

  createToolSettings(payload: JsonRecord): Observable<ToolSettingsItem> {
    return this.http.post<unknown>('/api/clinical/configuration/tool-settings', payload, this.options())
      .pipe(map(normalizeToolSettingsMutation));
  }

  updateToolSettings(id: string, payload: JsonRecord): Observable<ToolSettingsItem> {
    return this.http.put<unknown>(`/api/clinical/configuration/tool-settings/${encodeURIComponent(id)}`, payload, this.options())
      .pipe(map(normalizeToolSettingsMutation));
  }

  researchForms(): Observable<readonly ResearchItem[]> {
    return this.http.get<unknown>('/api/clinical/configuration/research-form?includeInactive=1', this.options())
      .pipe(map(normalizeResearchCatalog));
  }

  createResearchForm(payload: JsonRecord): Observable<ResearchItem> {
    return this.http.post<unknown>('/api/clinical/configuration/research-form', payload, this.options())
      .pipe(map(normalizeResearchMutation));
  }

  updateResearchForm(id: string, payload: JsonRecord): Observable<ResearchItem> {
    return this.http.put<unknown>(`/api/clinical/configuration/research-form/${encodeURIComponent(id)}`, payload, this.options())
      .pipe(map(normalizeResearchMutation));
  }

  archiveResearchForm(id: string): Observable<ResearchItem> {
    return this.http.delete<unknown>(`/api/clinical/configuration/research-form/${encodeURIComponent(id)}`, this.options())
      .pipe(map(normalizeResearchMutation));
  }

  dayHospitalSettings(): Observable<DayHospitalItem | null> {
    return this.http.get<unknown>('/api/clinical/configuration/day-hospital-settings?includeInactive=1', this.options())
      .pipe(map(normalizeDayHospitalCatalog));
  }

  createDayHospitalSettings(payload: JsonRecord): Observable<DayHospitalItem> {
    return this.http.post<unknown>('/api/clinical/configuration/day-hospital-settings', payload, this.options())
      .pipe(map(normalizeDayHospitalMutation));
  }

  updateDayHospitalSettings(id: string, payload: JsonRecord): Observable<DayHospitalItem> {
    return this.http.put<unknown>(`/api/clinical/configuration/day-hospital-settings/${encodeURIComponent(id)}`, payload, this.options())
      .pipe(map(normalizeDayHospitalMutation));
  }

  llmConfiguration(): Observable<LlmConfiguration> {
    return this.http.get<unknown>('/api/config', this.options()).pipe(map(normalizeLlmConfiguration));
  }

  updateLlmConfiguration(payload: JsonRecord): Observable<LlmConfiguration> {
    return this.http.put<unknown>('/api/config', payload, this.options()).pipe(map(normalizeLlmConfiguration));
  }

  testLlmConfiguration(payload: JsonRecord): Observable<{ readonly model: string; readonly response: string; readonly message: string }> {
    return this.http.post<unknown>('/api/llm/test', payload, this.options()).pipe(map((value) => {
      const root = value as Record<string, unknown>;
      return {
        model: String(root?.['model'] ?? ''),
        response: String(root?.['response'] ?? ''),
        message: String(root?.['message'] ?? 'Conexión correcta')
      };
    }));
  }

  identity(): Observable<AccessIdentity> {
    return this.http.get<unknown>('/api/auth/me', this.options()).pipe(map(normalizeAccessIdentity));
  }

  roles(): Observable<{ readonly roles: readonly AdminRole[]; readonly permissions: ReturnType<typeof normalizeRoles>['permissions'] }> {
    return this.http.get<unknown>('/api/admin/roles', this.options()).pipe(map(normalizeRoles));
  }

  createRole(payload: JsonRecord): Observable<AdminRole> {
    return this.http.post<unknown>('/api/admin/roles', payload, this.options()).pipe(map(normalizeRoleMutation));
  }

  updateRole(id: string, payload: JsonRecord): Observable<AdminRole> {
    return this.http.put<unknown>(`/api/admin/roles/${encodeURIComponent(id)}`, payload, this.options())
      .pipe(map(normalizeRoleMutation));
  }

  users(): Observable<readonly AdminUser[]> {
    return this.http.get<unknown>('/api/admin/users', this.options()).pipe(map(normalizeUsers));
  }

  createUser(payload: JsonRecord): Observable<AdminUser> {
    return this.http.post<unknown>('/api/admin/users', payload, this.options()).pipe(map(normalizeUserMutation));
  }

  updateUser(id: string, payload: JsonRecord): Observable<AdminUser> {
    return this.http.put<unknown>(`/api/admin/users/${encodeURIComponent(id)}`, payload, this.options())
      .pipe(map(normalizeUserMutation));
  }

  securitySettings(): Observable<SecuritySettings> {
    return this.http.get<unknown>('/api/admin/security-settings', this.options()).pipe(map(normalizeSecuritySettings));
  }

  updateSecuritySettings(sessionDurationMinutes: number): Observable<SecuritySettings> {
    return this.http.put<unknown>('/api/admin/security-settings', {
      loginRequired: true,
      sessionDurationMinutes
    }, this.options()).pipe(map(normalizeSecuritySettings));
  }

  broadcastChanged(calculators = false): void {
    const timestamp = String(Date.now());
    try {
      globalThis.localStorage?.setItem(CONFIGURATION_OPERATIONS_UPDATED_EVENT, timestamp);
      if (calculators) globalThis.localStorage?.setItem(CALCULATOR_CONFIGURATION_UPDATED_EVENT, timestamp);
    } catch {
      // El evento de ventana mantiene sincronizada la pestaña actual si el almacenamiento está bloqueado.
    }
    globalThis.window?.dispatchEvent(new CustomEvent(CONFIGURATION_OPERATIONS_UPDATED_EVENT, {
      detail: { timestamp, calculators }
    }));
    if (calculators) {
      globalThis.window?.dispatchEvent(new CustomEvent(CALCULATOR_CONFIGURATION_UPDATED_EVENT, {
        detail: { timestamp }
      }));
    }
  }

  private options(): { readonly withCredentials: true } {
    return { withCredentials: true };
  }
}
