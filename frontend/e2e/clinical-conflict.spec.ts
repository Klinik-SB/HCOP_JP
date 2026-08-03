import {
  expect,
  test,
  type APIResponse,
  type BrowserContext,
  type Page,
  type Request,
  type Response
} from '@playwright/test';

const origin = (process.env['HCOP_E2E_BASE_URL'] || 'http://127.0.0.1:5182').replace(/\/$/, '');
const username = process.env['HCOP_E2E_USERNAME'] || 'qa_conflict';
const password = process.env['HCOP_E2E_PASSWORD'] || '';

async function expectStatus(response: APIResponse | Response, expected: number): Promise<void> {
  if (response.status() === expected) return;
  let detail = '';
  try { detail = await response.text(); } catch { detail = 'sin cuerpo disponible'; }
  throw new Error(`HTTP ${response.status()}, se esperaba ${expected}: ${detail}`);
}

async function login(context: BrowserContext): Promise<void> {
  expect(password, 'HCOP_E2E_PASSWORD debe estar definido por el lanzador descartable.').not.toBe('');
  const response = await context.request.post(`${origin}/api/auth/login`, {
    data: { username, password }
  });
  await expectStatus(response, 200);
}

async function activate(context: BrowserContext, patientId: string): Promise<void> {
  const response = await context.request.post(`${origin}/api/clinical/patients/${patientId}/activate`);
  await expectStatus(response, 200);
}

async function openPrescription(page: Page, patientName: string): Promise<void> {
  await page.goto('./');
  await expect(page.getByText(patientName, { exact: true }).first()).toBeVisible();
  await page.getByRole('tab', { name: 'Prescripcion', exact: true }).click();
  await page.getByRole('tab', { name: 'Texto libre', exact: true }).click();
  await expect(page.locator('textarea[name="freeText"]')).toBeVisible();
}

async function fillFreePrescription(page: Page, title: string, text: string): Promise<void> {
  await page.locator('input[name="freeTitle"]').fill(title);
  await page.locator('textarea[name="freeText"]').fill(text);
}

async function putAfterClick(page: Page): Promise<Response> {
  const response = page.waitForResponse((candidate) =>
    candidate.request().method() === 'PUT' && new URL(candidate.url()).pathname === '/api/hc');
  await page.getByRole('button', { name: 'Prescribir', exact: true }).click();
  return response;
}

test('conserva el borrador ante VERSION_CONFLICT y nunca pisa el cambio ganador', async ({ browser }) => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const winnerTitle = `Orden ganadora ${suffix}`;
  const winnerText = `E2E-WINNER-${suffix}`;
  const draftTitle = `Orden en borrador ${suffix}`;
  const draftText = `E2E-DRAFT-${suffix}`;
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();

  try {
    await Promise.all([login(contextA), login(contextB)]);
    const created = await contextA.request.post(`${origin}/api/clinical/patients`, {
      data: {
        firstName: `Paciente ${suffix}`,
        lastName: 'Concurrencia QA',
        dni: `99${Date.now().toString().slice(-6)}`,
        medicalRecord: `QA-${suffix}`,
        birthDate: '1980-01-01',
        sex: 'No especificado',
        insurance: 'Cobertura sintética QA',
        affiliateNumber: `QA-${suffix}`,
        phone: '', email: '', address: ''
      }
    });
    await expectStatus(created, 201);
    const createdBody = await created.json() as { patientId: string; revision: number; patient: { fullName: string } };
    const patientId = createdBody.patientId;
    expect(patientId).toBeTruthy();
    await activate(contextB, patientId);

    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    await Promise.all([
      openPrescription(pageA, createdBody.patient.fullName),
      openPrescription(pageB, createdBody.patient.fullName)
    ]);
    await fillFreePrescription(pageA, draftTitle, draftText);
    await fillFreePrescription(pageB, winnerTitle, winnerText);

    const winnerResponse = await putAfterClick(pageB);
    await expectStatus(winnerResponse, 200);
    const winnerBody = await winnerResponse.json() as { unified?: { revision?: number } };
    expect(winnerBody.unified?.revision).toBe(createdBody.revision + 1);
    await expect(pageB.getByRole('dialog')).toBeVisible();
    await pageB.getByRole('dialog').getByRole('button', { name: 'Cerrar' }).first().click();
    await expect(pageB.locator('.prescription-draft').filter({ hasText: winnerText })).toBeVisible();

    let clinicalPutCount = 0;
    pageA.on('request', (request) => {
      if (request.method() === 'PUT' && new URL(request.url()).pathname === '/api/hc') clinicalPutCount += 1;
    });
    const conflictResponse = await putAfterClick(pageA);
    await expectStatus(conflictResponse, 409);
    const conflictBody = await conflictResponse.json() as { code?: string };
    expect(conflictBody.code).toBe('VERSION_CONFLICT');

    const banner = pageA.locator('.clinical-save-conflict-banner');
    await expect(banner).toContainText('Hay cambios sin guardar.');
    await expect(banner).toBeFocused();
    await expect(pageA.locator('.prescription-draft').filter({ hasText: draftText })).toBeVisible();
    await expect(pageA.getByRole('button', { name: 'Nuevo paciente', exact: true })).toBeDisabled();
    await expect(pageA.getByRole('button', { name: 'Abrir paciente', exact: true })).toBeDisabled();
    await expect(pageA.getByRole('button', { name: 'Hospital de dia', exact: true })).toBeDisabled();
    await expect(pageA.locator('.configuration-button')).toBeDisabled();
    await expect(pageA.locator('.clinical-logout-button')).toBeDisabled();
    const putsAfterConflict = clinicalPutCount;

    const compareButton = pageA.getByRole('button', { name: 'Comparar cambios', exact: true });
    await compareButton.click();
    const comparison = pageA.getByRole('dialog', { name: 'Comparar cambios de la historia' });
    await expect(comparison).toBeVisible();
    await expect(comparison).toContainText(draftText);
    await expect(comparison).toContainText(winnerText);
    await expect(comparison.getByText(`v${winnerBody.unified?.revision}`, { exact: false })).toBeVisible();
    await Promise.all([
      pageA.waitForResponse((candidate) => candidate.request().method() === 'GET'
        && new URL(candidate.url()).pathname.endsWith(`/api/clinical/patients/${patientId}/workspace`)),
      comparison.getByRole('button', { name: 'Actualizar comparación', exact: true }).click()
    ]);
    await comparison.getByRole('button', { name: 'Cerrar', exact: true }).last().click();
    await expect(compareButton).toBeFocused();
    expect(clinicalPutCount).toBe(putsAfterConflict);

    pageA.once('dialog', (dialog) => dialog.dismiss());
    await banner.getByRole('button', { name: 'Descartar borrador y recuperar historia', exact: true }).click();
    await expect(banner).toBeVisible();
    await expect(pageA.locator('.prescription-draft').filter({ hasText: draftText })).toBeVisible();

    let releaseDelayed: (() => void) | undefined;
    const delayed = new Promise<void>((resolve) => { releaseDelayed = resolve; });
    let markDelayedRouteDone: (() => void) | undefined;
    const delayedRouteDone = new Promise<void>((resolve) => { markDelayedRouteDone = resolve; });
    let heldWorkspaceRequest: Request | undefined;
    let workspaceGets = 0;
    const workspacePattern = `**/api/clinical/patients/${patientId}/workspace`;
    await pageA.route(workspacePattern, async (route) => {
      workspaceGets += 1;
      if (workspaceGets === 1) {
        heldWorkspaceRequest = route.request();
        await delayed;
        await route.continue();
        markDelayedRouteDone?.();
        return;
      }
      await route.continue();
    });
    await compareButton.click();
    await expect.poll(() => workspaceGets).toBe(1);
    await pageA.getByRole('button', { name: 'Cerrar comparación', exact: true }).click();
    pageA.once('dialog', (dialog) => dialog.accept());
    await banner.getByRole('button', { name: 'Descartar borrador y recuperar historia', exact: true }).click();
    await expect(banner).toHaveCount(0);
    await expect(pageA.locator('.prescription-draft').filter({ hasText: winnerText })).toBeVisible();
    await expect(pageA.locator('.prescription-draft').filter({ hasText: draftText })).toHaveCount(0);
    expect(heldWorkspaceRequest).toBeDefined();
    const delayedResponseReceived = pageA.waitForResponse((response) => response.request() === heldWorkspaceRequest);
    releaseDelayed?.();
    await delayedRouteDone;
    const delayedResponse = await delayedResponseReceived;
    expect(delayedResponse.status()).toBe(200);
    await pageA.unroute(workspacePattern);
    await expect(banner).toHaveCount(0);
    await expect(pageA.locator('.prescription-draft').filter({ hasText: winnerText })).toBeVisible();
    await expect(pageA.locator('.prescription-draft').filter({ hasText: draftText })).toHaveCount(0);
    expect(clinicalPutCount).toBe(putsAfterConflict);

    const finalWorkspace = await contextA.request.get(`${origin}/api/clinical/patients/${patientId}/workspace`);
    await expectStatus(finalWorkspace, 200);
    const finalBody = await finalWorkspace.json() as { revision: number; state?: { prescriptions?: Array<{ title?: string; summary?: string }> } };
    expect(finalBody.revision).toBe(winnerBody.unified?.revision);
    const documents = finalBody.state?.prescriptions || [];
    expect(documents.some((record) => record.title === winnerTitle && record.summary === winnerText)).toBe(true);
    expect(documents.some((record) => record.title === draftTitle || record.summary === draftText)).toBe(false);
  } finally {
    await Promise.all([contextA.close(), contextB.close()]);
  }
});

test('edita conclusión y plan con borrador protegido, auditoría y versiones reales', async ({ browser }) => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const initialSummary = `Respuesta clínica inicial ${suffix}`;
  const initialPlan = `Continuar controles ${suffix}`;
  const changedPlan = `Nuevo control en 30 días ${suffix}`;
  const context = await browser.newContext();

  try {
    await login(context);
    const created = await context.request.post(`${origin}/api/clinical/patients`, {
      data: {
        firstName: `Paciente ${suffix}`,
        lastName: 'Resumen QA',
        dni: `98${Date.now().toString().slice(-6)}`,
        medicalRecord: `QA-SUM-${suffix}`,
        birthDate: '1975-02-03',
        sex: 'No especificado',
        insurance: 'Cobertura sintética QA',
        affiliateNumber: `QA-SUM-${suffix}`,
        phone: '', email: '', address: ''
      }
    });
    await expectStatus(created, 201);
    const body = await created.json() as { patientId: string; revision: number; patient: { fullName: string } };
    const page = await context.newPage();
    await page.goto('./');
    await expect(page.getByText(body.patient.fullName, { exact: true }).first()).toBeVisible();

    const editSummaryTrigger = page.getByRole('button', { name: 'Editar conclusión / resumen', exact: true });
    await editSummaryTrigger.click();
    let editor = page.getByRole('dialog', { name: 'Conclusión / resumen', exact: true });
    await expect(editor).toBeVisible();
    const initialSummaryField = editor.getByLabel('Conclusión / resumen', { exact: true });
    const initialSaveButton = editor.getByRole('button', { name: 'Cargar en historia', exact: true });
    const initialCloseButton = editor.getByRole('button', { name: 'Cerrar editor de conclusión / resumen', exact: true });
    await expect(initialSaveButton).toBeVisible();
    await expect(initialSummaryField).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(initialCloseButton).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(initialSaveButton).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(initialCloseButton).toBeFocused();
    await page.locator('.summary-plan-editor-backdrop').click({ position: { x: 4, y: 4 } });
    await page.keyboard.press('Escape');
    await expect(editor).toBeVisible();
    await editor.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await expect(editor).toHaveCount(0);
    await expect(editSummaryTrigger).toBeFocused();

    await editSummaryTrigger.click();
    editor = page.getByRole('dialog', { name: 'Conclusión / resumen', exact: true });
    await expect(editor.getByLabel('Conclusión / resumen', { exact: true })).toBeFocused();
    await editor.getByLabel('Conclusión / resumen', { exact: true }).fill(`  ${initialSummary}  `);
    await editor.getByLabel('Conducta / plan', { exact: true }).fill(`  ${initialPlan}  `);
    await expect(page.getByRole('button', { name: 'Nuevo paciente', exact: true })).toBeDisabled();
    await expect(page.locator('.configuration-button')).toBeDisabled();

    page.once('dialog', (dialog) => dialog.dismiss());
    await editor.getByRole('button', { name: 'Cerrar editor de conclusión / resumen', exact: true }).click();
    await expect(editor).toBeVisible();

    const clinicalPath = '**/api/hc';
    await page.route(clinicalPath, async (route) => {
      if (route.request().method() === 'PUT') {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ ok: false, status: 503, code: 'QA_TRANSIENT', error: 'Falla transitoria sintética' })
        });
        return;
      }
      await route.continue();
    });
    const transientPut = page.waitForResponse((candidate) =>
      candidate.request().method() === 'PUT' && new URL(candidate.url()).pathname === '/api/hc');
    await editor.getByRole('button', { name: 'Cargar en historia', exact: true }).click();
    await expectStatus(await transientPut, 503);
    await expect(editor).toBeVisible();
    await expect(editor.getByRole('alert')).toContainText('Falla transitoria sintética');
    await expect(editor.getByLabel('Conclusión / resumen', { exact: true })).toHaveValue(`  ${initialSummary}  `);
    await expect(editor.getByLabel('Conducta / plan', { exact: true })).toHaveValue(`  ${initialPlan}  `);
    await page.unroute(clinicalPath);

    const initialPut = page.waitForResponse((candidate) =>
      candidate.request().method() === 'PUT' && new URL(candidate.url()).pathname === '/api/hc');
    await editor.getByRole('button', { name: 'Cargar en historia', exact: true }).click();
    await expectStatus(await initialPut, 200);
    await expect(editor).toHaveCount(0);
    await expect(page.locator('.doc-section').filter({ hasText: initialSummary })).toBeVisible();
    await expect(page.locator('.doc-section').filter({ hasText: initialPlan })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Nuevo paciente', exact: true })).toBeEnabled();

    await page.getByRole('button', { name: 'Editar conclusión / resumen', exact: true }).click();
    editor = page.getByRole('dialog', { name: 'Conclusión / resumen', exact: true });
    await expect(editor.getByRole('button', { name: 'Guardar modificación', exact: true })).toBeVisible();
    await editor.getByLabel('Conducta / plan', { exact: true }).fill(changedPlan);
    await editor.getByLabel('Motivo de la modificación', { exact: true }).fill('Cambio de conducta en control');
    const modificationPut = page.waitForResponse((candidate) =>
      candidate.request().method() === 'PUT' && new URL(candidate.url()).pathname === '/api/hc');
    await editor.getByRole('button', { name: 'Guardar modificación', exact: true }).click();
    await expectStatus(await modificationPut, 200);
    await expect(editor).toHaveCount(0);
    await expect(page.locator('.doc-section').filter({ hasText: changedPlan })).toBeVisible();

    const workspace = await context.request.get(`${origin}/api/clinical/patients/${body.patientId}/workspace`);
    await expectStatus(workspace, 200);
    const final = await workspace.json() as {
      revision: number;
      state?: {
        narrative?: { summary?: string; plan?: string };
        meta?: {
          sectionFormModes?: { summaryPlan?: string };
          sectionVersions?: { summaryPlan?: Array<{ reason?: string; content?: string; audit?: { action?: string } }> };
          sectionAudit?: { summaryPlan?: { action?: string } };
        };
      };
    };
    expect(final.revision).toBe(body.revision + 2);
    expect(final.state?.narrative?.summary).toBe(initialSummary);
    expect(final.state?.narrative?.plan).toBe(changedPlan);
    expect(final.state?.meta?.sectionFormModes?.summaryPlan).toBe('structured');
    const versions = final.state?.meta?.sectionVersions?.summaryPlan || [];
    expect(versions).toHaveLength(2);
    expect(versions[0]?.reason).toBe('Carga inicial');
    expect(versions[0]?.audit?.action).toBe('cargado');
    expect(versions[1]?.reason).toBe('Cambio de conducta en control');
    expect(versions[1]?.content).toContain(changedPlan);
    expect(versions[1]?.audit?.action).toBe('modificado');
    expect(final.state?.meta?.sectionAudit?.summaryPlan?.action).toBe('modificado');
  } finally {
    await context.close();
  }
});

test('edita motivo de consulta con foco contenido, reintento seguro y auditoría canónica', async ({ browser }) => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const initialComplaint = `Dolor abdominal de tres semanas ${suffix}`;
  const changedComplaint = `Dolor abdominal con náuseas de cuatro semanas ${suffix}`;
  const modificationReason = 'Actualización del cuadro referida en el control';
  const competingNote = `Cambio concurrente ganador ${suffix}`;
  const context = await browser.newContext();
  const competingContext = await browser.newContext();

  try {
    await login(context);
    const created = await context.request.post(`${origin}/api/clinical/patients`, {
      data: {
        firstName: `Paciente ${suffix}`,
        lastName: 'Motivo QA',
        dni: `97${Date.now().toString().slice(-6)}`,
        medicalRecord: `QA-MOT-${suffix}`,
        birthDate: '1978-04-05',
        sex: 'No especificado',
        insurance: 'Cobertura sintética QA',
        affiliateNumber: `QA-MOT-${suffix}`,
        phone: '', email: '', address: ''
      }
    });
    await expectStatus(created, 201);
    const body = await created.json() as {
      patientId: string;
      revision: number;
      patient: { fullName: string };
    };

    const page = await context.newPage();
    await page.goto('./');
    await expect(page.getByText(body.patient.fullName, { exact: true }).first()).toBeVisible();

    const loadTrigger = page.getByRole('button', { name: 'Cargar motivo de consulta', exact: true });
    await loadTrigger.click();
    let editor = page.getByRole('dialog', { name: 'Motivo de consulta', exact: true });
    const initialField = editor.getByLabel('Motivo de consulta', { exact: true });
    const initialSaveButton = editor.getByRole('button', { name: 'Cargar en historia', exact: true });
    const initialCloseButton = editor.getByRole('button', { name: 'Cerrar editor de motivo de consulta', exact: true });
    await expect(editor).toBeVisible();
    await expect(initialField).toBeFocused();
    await expect(initialSaveButton).toBeVisible();

    await page.keyboard.press('Shift+Tab');
    await expect(initialCloseButton).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(initialSaveButton).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(initialCloseButton).toBeFocused();
    await page.locator('.chief-complaint-editor-backdrop').click({ position: { x: 4, y: 4 } });
    await page.keyboard.press('Escape');
    await expect(editor).toBeVisible();

    await initialField.fill(`  ${initialComplaint}  `);
    await expect(page.getByRole('button', { name: 'Nuevo paciente', exact: true })).toBeDisabled();
    await expect(page.locator('.configuration-button')).toBeDisabled();
    page.once('dialog', (dialog) => dialog.dismiss());
    await initialCloseButton.click();
    await expect(editor).toBeVisible();

    const clinicalPath = '**/api/hc';
    await page.route(clinicalPath, async (route) => {
      if (route.request().method() === 'PUT') {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: false,
            status: 503,
            code: 'QA_TRANSIENT',
            error: 'Falla transitoria sintética del motivo de consulta'
          })
        });
        return;
      }
      await route.continue();
    });
    const transientPut = page.waitForResponse((candidate) =>
      candidate.request().method() === 'PUT' && new URL(candidate.url()).pathname === '/api/hc');
    await initialSaveButton.click();
    await expectStatus(await transientPut, 503);
    await expect(editor).toBeVisible();
    await expect(editor.getByRole('alert')).toContainText('Falla transitoria sintética del motivo de consulta');
    await expect(initialField).toHaveValue(`  ${initialComplaint}  `);
    await page.unroute(clinicalPath);

    const initialPut = page.waitForResponse((candidate) =>
      candidate.request().method() === 'PUT' && new URL(candidate.url()).pathname === '/api/hc');
    await initialSaveButton.click();
    await expectStatus(await initialPut, 200);
    await expect(editor).toHaveCount(0);
    await expect(page.locator('.doc-section').filter({ hasText: initialComplaint })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Nuevo paciente', exact: true })).toBeEnabled();

    const modifyTrigger = page.getByRole('button', { name: 'Modificar sección Motivo de consulta', exact: true });
    await modifyTrigger.click();
    editor = page.getByRole('dialog', { name: 'Motivo de consulta', exact: true });
    const modificationField = editor.getByLabel('Motivo de consulta', { exact: true });
    const reasonField = editor.getByLabel('Motivo de la modificación', { exact: true });
    await expect(editor.getByRole('button', { name: 'Guardar modificación', exact: true })).toBeVisible();
    await expect(modificationField).toHaveValue(initialComplaint);
    await modificationField.fill(changedComplaint);
    await reasonField.fill(modificationReason);

    await login(competingContext);
    await activate(competingContext, body.patientId);
    const competingWorkspaceResponse = await competingContext.request.get(
      `${origin}/api/clinical/patients/${body.patientId}/workspace`
    );
    await expectStatus(competingWorkspaceResponse, 200);
    const competingWorkspace = await competingWorkspaceResponse.json() as {
      revision: number;
      state: Record<string, unknown> & {
        narrative?: Record<string, unknown>;
        oncology?: Record<string, unknown>;
        meta?: Record<string, unknown>;
      };
    };
    const competingState = structuredClone(competingWorkspace.state);
    competingState.oncology = { ...(competingState.oncology || {}), performanceStatus: competingNote };
    competingState.meta = {
      ...(competingState.meta || {}),
      persistenceRevision: competingWorkspace.revision
    };
    const competingPut = await competingContext.request.put(`${origin}/api/hc`, { data: competingState });
    await expectStatus(competingPut, 200);

    const conflictPut = page.waitForResponse((candidate) =>
      candidate.request().method() === 'PUT' && new URL(candidate.url()).pathname === '/api/hc');
    await editor.getByRole('button', { name: 'Guardar modificación', exact: true }).click();
    const conflictResponse = await conflictPut;
    await expectStatus(conflictResponse, 409);
    const conflictBody = await conflictResponse.json() as { code?: string };
    expect(conflictBody.code).toBe('VERSION_CONFLICT');
    await expect(editor).toHaveCount(0);

    const conflictBanner = page.locator('.clinical-save-conflict-banner');
    await expect(conflictBanner).toContainText('Hay cambios sin guardar.');
    await expect(conflictBanner).toBeFocused();
    await conflictBanner.getByRole('button', { name: 'Comparar cambios', exact: true }).click();
    const comparison = page.getByRole('dialog', { name: 'Comparar cambios de la historia' });
    await expect(comparison).toContainText(changedComplaint);
    await expect(comparison).toContainText(competingNote);
    await comparison.getByRole('button', { name: 'Cerrar', exact: true }).last().click();
    page.once('dialog', (dialog) => dialog.accept());
    await conflictBanner.getByRole('button', {
      name: 'Descartar borrador y recuperar historia',
      exact: true
    }).click();
    await expect(conflictBanner).toHaveCount(0);
    await expect(page.locator('.doc-section').filter({ hasText: initialComplaint })).toBeVisible();

    await modifyTrigger.click();
    editor = page.getByRole('dialog', { name: 'Motivo de consulta', exact: true });
    await editor.getByLabel('Motivo de consulta', { exact: true }).fill(changedComplaint);
    await editor.getByLabel('Motivo de la modificación', { exact: true }).fill(modificationReason);
    const modificationPut = page.waitForResponse((candidate) =>
      candidate.request().method() === 'PUT' && new URL(candidate.url()).pathname === '/api/hc');
    await editor.getByRole('button', { name: 'Guardar modificación', exact: true }).click();
    await expectStatus(await modificationPut, 200);
    await expect(editor).toHaveCount(0);
    await expect(page.locator('.doc-section').filter({ hasText: changedComplaint })).toBeVisible();

    const workspace = await context.request.get(`${origin}/api/clinical/patients/${body.patientId}/workspace`);
    await expectStatus(workspace, 200);
    const final = await workspace.json() as {
      revision: number;
      state?: {
        narrative?: { chiefComplaint?: string };
        oncology?: { performanceStatus?: string };
        meta?: {
          sectionFormModes?: { chiefComplaint?: string };
          sectionVersions?: {
            chiefComplaint?: Array<{
              id?: string;
              author?: string;
              license?: string;
              createdAt?: string;
              reason?: string;
              content?: string;
              audit?: { action?: string; lastName?: string; license?: string; at?: string };
            }>;
          };
          sectionAudit?: {
            chiefComplaint?: { action?: string; lastName?: string; license?: string; at?: string };
          };
          sectionChangeRequests?: { chiefComplaint?: unknown };
        };
      };
    };
    expect(final.revision).toBe(body.revision + 3);
    expect(final.state?.narrative?.chiefComplaint).toBe(changedComplaint);
    expect(final.state?.oncology?.performanceStatus).toBe(competingNote);
    expect(final.state?.meta?.sectionFormModes?.chiefComplaint).toBe('structured');
    expect(final.state?.meta?.sectionChangeRequests?.chiefComplaint).toBeUndefined();
    const versions = final.state?.meta?.sectionVersions?.chiefComplaint || [];
    expect(versions).toHaveLength(2);
    expect(versions[0]?.id).toMatch(/^sec-chiefComplaint-/);
    expect(versions[0]?.reason).toBe('Carga inicial');
    expect(versions[0]?.content).toBe(initialComplaint);
    expect(versions[0]?.audit?.action).toBe('cargado');
    expect(versions[1]?.id).toMatch(/^sec-chiefComplaint-/);
    expect(versions[1]?.reason).toBe(modificationReason);
    expect(versions[1]?.content).toBe(changedComplaint);
    expect(versions[1]?.audit?.action).toBe('modificado');
    expect(versions[1]?.author).toBeTruthy();
    expect(versions[1]?.license).toBeTruthy();
    expect(versions[1]?.createdAt).toBeTruthy();
    expect(versions[1]?.createdAt).toBe(versions[1]?.audit?.at);
    expect(versions[1]?.author).toBe(versions[1]?.audit?.lastName);
    expect(versions[1]?.license).toBe(versions[1]?.audit?.license);
    expect(final.state?.meta?.sectionAudit?.chiefComplaint).toEqual(versions[1]?.audit);
  } finally {
    await Promise.all([context.close(), competingContext.close()]);
  }
});

test('coordina Estudios entre hoja y panel sin duplicar registros', async ({ browser }) => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const context = await browser.newContext();
  try {
    await login(context);
    const created = await context.request.post(`${origin}/api/clinical/patients`, {
      data: {
        firstName: `Paciente ${suffix}`,
        lastName: 'Estudios QA',
        dni: `93${Date.now().toString().slice(-6)}`,
        medicalRecord: `QA-EST-${suffix}`,
        birthDate: '1981-05-12',
        sex: 'No especificado',
        insurance: 'Cobertura sintética QA',
        affiliateNumber: `QA-EST-${suffix}`,
        phone: '', email: '', address: ''
      }
    });
    await expectStatus(created, 201);
    const body = await created.json() as { patientId: string; patient: { fullName: string } };

    const page = await context.newPage();
    await page.goto('./');
    await expect(page.getByText(body.patient.fullName, { exact: true }).first()).toBeVisible();
    await page.getByRole('tab', { name: 'Linea del tiempo', exact: true }).click();
    const emptyTrigger = page.getByRole('button', { name: 'Subir estudios complementarios', exact: true });
    await emptyTrigger.click();
    await expect(page.getByRole('tab', { name: 'Estudios', exact: true })).toHaveAttribute('aria-selected', 'true');
    const uploadDialog = page.getByRole('dialog', { name: 'Subir archivos', exact: true });
    const uploadClose = uploadDialog.getByRole('button', { name: 'Cerrar carga de estudios', exact: true });
    await expect(uploadDialog).toBeVisible();
    await expect(uploadClose).toBeFocused();
    await page.locator('.study-upload-backdrop').click({ position: { x: 4, y: 4 } });
    await page.keyboard.press('Escape');
    await expect(uploadDialog).toBeVisible();
    await uploadClose.click();
    await expect(uploadDialog).toHaveCount(0);
    await expect(emptyTrigger).toBeFocused();

    await page.getByRole('button', { name: 'Subir estudios', exact: true }).click();
    await uploadDialog.locator('input[type="file"]').setInputFiles({
      name: `corte-039-${suffix}.png`,
      mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
    });
    await uploadDialog.getByRole('button', { name: 'Subir archivos', exact: true }).click();
    await expect(uploadDialog).toHaveCount(0);
    const uploadedCard = page.locator('.study-card.active').filter({ hasText: `corte-039-${suffix}` });
    await expect(uploadedCard).toHaveCount(1);
    page.once('dialog', (dialog) => dialog.accept());
    await uploadedCard.getByRole('button', { name: 'Eliminar', exact: true }).click();
    await expect(uploadedCard).toHaveCount(0);

    const workspaceResponse = await context.request.get(
      `${origin}/api/clinical/patients/${body.patientId}/workspace`
    );
    await expectStatus(workspaceResponse, 200);
    const workspace = await workspaceResponse.json() as {
      revision: number;
      state: Record<string, unknown> & { meta?: Record<string, unknown> };
    };
    const nextState = structuredClone(workspace.state) as Record<string, unknown> & { meta?: Record<string, unknown> };
    nextState['externalStudies'] = [
      { id: 'remote-study', date: '2026-08-02', type: 'TAC', title: 'TAC externa' },
      { id: 'shared-study', date: '2026-07-15', type: 'Informe', title: 'Informe remoto reemplazado' },
      { id: 'hidden-study', date: '2026-08-04', title: 'Registro eliminado' },
      { date: '2026-07-20', type: 'Imagen', title: 'Estudio externo sin ID' }
    ];
    nextState['studies'] = [
      { id: 'local-old', date: '2026-07-01', type: 'Laboratorio', title: 'Control local anterior' },
      { id: 'shared-study', date: '2026-08-03', type: 'Informe', title: 'Informe local preferido' },
      { id: 'hidden-study', deleted: true },
      { date: '2026-07-10', type: 'Imagen', title: 'Estudio local sin ID' }
    ];
    nextState.meta = { ...(nextState.meta || {}), persistenceRevision: workspace.revision };
    const seeded = await context.request.put(`${origin}/api/hc`, { data: nextState });
    await expectStatus(seeded, 200);

    await page.reload();
    await expect(page.getByText(body.patient.fullName, { exact: true }).first()).toBeVisible();
    const paperHeadings = await page.locator('.study-entry strong').allTextContents();
    expect(paperHeadings).toHaveLength(5);
    expect(paperHeadings[0]).toContain('Control local anterior');
    expect(paperHeadings[1]).toContain('Estudio local sin ID');
    expect(paperHeadings[2]).toContain('Estudio externo sin ID');
    expect(paperHeadings[3]).toContain('TAC externa');
    expect(paperHeadings[4]).toContain('Informe local preferido');
    expect(paperHeadings.join(' ')).not.toContain('Informe remoto reemplazado');
    expect(paperHeadings.join(' ')).not.toContain('Registro eliminado');

    await page.getByRole('tab', { name: 'Linea del tiempo', exact: true }).click();
    await page.locator('.study-entry').filter({ hasText: 'Informe local preferido' }).click();
    await expect(page.getByRole('tab', { name: 'Estudios', exact: true })).toHaveAttribute('aria-selected', 'true');
    const selectedCard = page.locator('.study-card.active').filter({ hasText: 'Informe local preferido' });
    await expect(selectedCard).toHaveCount(1);
    await expect(selectedCard).toBeFocused();
    const panelTitles = await page.locator('.study-title').allTextContents();
    expect(panelTitles).toEqual([
      'Informe local preferido', 'TAC externa', 'Estudio externo sin ID', 'Estudio local sin ID', 'Control local anterior'
    ]);

    await page.getByRole('tab', { name: 'Linea del tiempo', exact: true }).click();
    await page.locator('.study-entry').filter({ hasText: 'Estudio local sin ID' }).click();
    const selectedIdlessCard = page.locator('.study-card.active').filter({ hasText: 'Estudio local sin ID' });
    await expect(selectedIdlessCard).toHaveCount(1);
    await expect(selectedIdlessCard).toBeFocused();
    await expect(page.locator('.study-card.active')).toHaveCount(1);
  } finally {
    await context.close();
  }
});

test('edita examen físico con centímetros, métricas, plantilla, reintento y conflicto', async ({ browser }) => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const changedExam = `Control actualizado ${suffix}. Tórax: murmullo conservado. Abdomen: blando. SNC: sin foco.`;
  const modificationReason = 'Control clínico previo a la siguiente aplicación';
  const competingStatus = `ECOG concurrente ganador ${suffix}`;
  const context = await browser.newContext();
  const competingContext = await browser.newContext();

  try {
    await login(context);
    const created = await context.request.post(`${origin}/api/clinical/patients`, {
      data: {
        firstName: `Paciente ${suffix}`,
        lastName: 'Examen físico QA',
        dni: `94${Date.now().toString().slice(-6)}`,
        medicalRecord: `QA-EF-${suffix}`,
        birthDate: '1978-03-14',
        sex: 'No especificado',
        insurance: 'Cobertura sintética QA',
        affiliateNumber: `QA-EF-${suffix}`,
        phone: '', email: '', address: ''
      }
    });
    await expectStatus(created, 201);
    const body = await created.json() as {
      patientId: string;
      revision: number;
      patient: { fullName: string };
    };

    const page = await context.newPage();
    await page.goto('./');
    await expect(page.getByText(body.patient.fullName, { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Cargar examen físico', exact: true }).click();

    let editor = page.getByRole('dialog', { name: 'Examen físico', exact: true });
    let weightField = editor.getByLabel('Peso (kg)', { exact: true });
    let heightField = editor.getByLabel('Talla (cm)', { exact: true });
    let examField = editor.getByLabel('Examen físico', { exact: true });
    const initialSaveButton = editor.getByRole('button', { name: 'Cargar en historia', exact: true });
    const closeButton = editor.getByRole('button', { name: 'Cerrar editor de examen físico', exact: true });
    await expect(editor).toBeVisible();
    await expect(weightField).toBeFocused();
    await expect(heightField).toHaveValue('');
    await expect(examField).toHaveValue('');

    await page.keyboard.press('Shift+Tab');
    await expect(closeButton).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(initialSaveButton).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(closeButton).toBeFocused();
    await page.locator('.physical-exam-editor-backdrop').click({ position: { x: 4, y: 4 } });
    await page.keyboard.press('Escape');
    await expect(editor).toBeVisible();

    await weightField.fill('75');
    await heightField.fill('175');
    await expect(editor.getByText('24.49', { exact: true })).toBeVisible();
    await expect(editor.getByText('1.903 m²', { exact: true })).toBeVisible();
    await editor.getByRole('button', { name: 'Usar examen físico habitual', exact: true }).click();
    await expect(examField).toHaveValue(/Estado general: paciente en buen estado general\./);
    const templateText = await examField.inputValue();
    await editor.getByRole('button', { name: 'Usar examen físico habitual', exact: true }).click();
    await expect(editor.getByRole('alert')).toContainText('ya contiene texto');
    await expect(examField).toHaveValue(templateText);
    await expect(page.getByRole('button', { name: 'Nuevo paciente', exact: true })).toBeDisabled();
    page.once('dialog', (dialog) => dialog.dismiss());
    await closeButton.click();
    await expect(editor).toBeVisible();

    const clinicalPath = '**/api/hc';
    await page.route(clinicalPath, async (route) => {
      if (route.request().method() === 'PUT') {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: false, status: 503, code: 'QA_TRANSIENT',
            error: 'Falla transitoria sintética de examen físico'
          })
        });
        return;
      }
      await route.continue();
    });
    const transientPut = page.waitForResponse((candidate) =>
      candidate.request().method() === 'PUT' && new URL(candidate.url()).pathname === '/api/hc');
    await initialSaveButton.click();
    await expectStatus(await transientPut, 503);
    await expect(editor.getByRole('alert')).toContainText('Falla transitoria sintética de examen físico');
    await expect(weightField).toHaveValue('75');
    await expect(heightField).toHaveValue('175');
    await expect(examField).toHaveValue(templateText);
    await page.unroute(clinicalPath);

    const initialPut = page.waitForResponse((candidate) =>
      candidate.request().method() === 'PUT' && new URL(candidate.url()).pathname === '/api/hc');
    await initialSaveButton.click();
    await expectStatus(await initialPut, 200);
    await expect(editor).toHaveCount(0);
    const sheetSection = page.locator('.doc-section').filter({ hasText: 'Examen físico' });
    await expect(sheetSection).toContainText('175 cm');
    await expect(sheetSection).toContainText('24.49');
    await expect(sheetSection).not.toContainText('1.75 cm');

    const modifyTrigger = page.getByRole('button', { name: 'Modificar sección Examen físico', exact: true });
    await modifyTrigger.click();
    editor = page.getByRole('dialog', { name: 'Examen físico', exact: true });
    weightField = editor.getByLabel('Peso (kg)', { exact: true });
    heightField = editor.getByLabel('Talla (cm)', { exact: true });
    examField = editor.getByLabel('Examen físico', { exact: true });
    const reasonField = editor.getByLabel('Motivo de la modificación', { exact: true });
    const modificationSaveButton = editor.getByRole('button', { name: 'Guardar modificación', exact: true });
    await expect(weightField).toHaveValue('75');
    await expect(heightField).toHaveValue('175');
    await examField.fill(changedExam);

    let clinicalPutCount = 0;
    page.on('request', (request) => {
      if (request.method() === 'PUT' && new URL(request.url()).pathname === '/api/hc') clinicalPutCount += 1;
    });
    const putsBeforeMissingReason = clinicalPutCount;
    await modificationSaveButton.click();
    await expect(editor.getByRole('alert')).toContainText('Indique el motivo de la modificación.');
    await expect(reasonField).toBeFocused();
    expect(clinicalPutCount).toBe(putsBeforeMissingReason);
    await reasonField.fill(modificationReason);

    await login(competingContext);
    await activate(competingContext, body.patientId);
    const competingWorkspaceResponse = await competingContext.request.get(
      `${origin}/api/clinical/patients/${body.patientId}/workspace`
    );
    await expectStatus(competingWorkspaceResponse, 200);
    const competingWorkspace = await competingWorkspaceResponse.json() as {
      revision: number;
      state: Record<string, unknown> & {
        oncology?: Record<string, unknown>;
        meta?: Record<string, unknown>;
      };
    };
    const competingState = structuredClone(competingWorkspace.state);
    competingState.oncology = {
      ...(competingState.oncology || {}),
      performanceStatus: competingStatus
    };
    competingState.meta = {
      ...(competingState.meta || {}),
      persistenceRevision: competingWorkspace.revision
    };
    const competingPut = await competingContext.request.put(`${origin}/api/hc`, { data: competingState });
    await expectStatus(competingPut, 200);

    const conflictPut = page.waitForResponse((candidate) =>
      candidate.request().method() === 'PUT' && new URL(candidate.url()).pathname === '/api/hc');
    await modificationSaveButton.click();
    await expectStatus(await conflictPut, 409);
    await expect(editor).toHaveCount(0);
    const conflictBanner = page.locator('.clinical-save-conflict-banner');
    await expect(conflictBanner).toBeFocused();
    await conflictBanner.getByRole('button', { name: 'Comparar cambios', exact: true }).click();
    const comparison = page.getByRole('dialog', { name: 'Comparar cambios de la historia' });
    await expect(comparison).toContainText(changedExam);
    await expect(comparison).toContainText(competingStatus);
    await comparison.getByRole('button', { name: 'Cerrar', exact: true }).last().click();
    page.once('dialog', (dialog) => dialog.accept());
    await conflictBanner.getByRole('button', {
      name: 'Descartar borrador y recuperar historia', exact: true
    }).click();
    await expect(conflictBanner).toHaveCount(0);

    await modifyTrigger.click();
    editor = page.getByRole('dialog', { name: 'Examen físico', exact: true });
    await expect(editor.getByLabel('Talla (cm)', { exact: true })).toHaveValue('175');
    await editor.getByLabel('Examen físico', { exact: true }).fill(changedExam);
    await editor.getByLabel('Motivo de la modificación', { exact: true }).fill(modificationReason);
    const modificationPut = page.waitForResponse((candidate) =>
      candidate.request().method() === 'PUT' && new URL(candidate.url()).pathname === '/api/hc');
    await editor.getByRole('button', { name: 'Guardar modificación', exact: true }).click();
    await expectStatus(await modificationPut, 200);
    await expect(editor).toHaveCount(0);
    await expect(sheetSection).toContainText(`Control actualizado ${suffix}.`);

    const workspace = await context.request.get(`${origin}/api/clinical/patients/${body.patientId}/workspace`);
    await expectStatus(workspace, 200);
    const final = await workspace.json() as {
      revision: number;
      state?: {
        exam?: { weightKg?: string; heightM?: string };
        narrative?: { physicalExam?: string };
        oncology?: { performanceStatus?: string };
        meta?: {
          sectionFormModes?: { physicalExam?: string };
          sectionVersions?: { physicalExam?: Array<{
            id?: string; author?: string; license?: string; createdAt?: string;
            reason?: string; content?: string;
            audit?: { action?: string; lastName?: string; license?: string; at?: string };
          }> };
          sectionAudit?: { physicalExam?: unknown };
          sectionChangeRequests?: { physicalExam?: unknown };
        };
      };
    };
    expect(final.revision).toBe(body.revision + 3);
    expect(final.state?.exam?.weightKg).toBe('75');
    expect(final.state?.exam?.heightM).toBe('1.75');
    expect(final.state?.narrative?.physicalExam).toBe(changedExam);
    expect(final.state?.oncology?.performanceStatus).toBe(competingStatus);
    expect(final.state?.meta?.sectionFormModes?.physicalExam).toBe('structured');
    expect(final.state?.meta?.sectionChangeRequests?.physicalExam).toBeUndefined();
    const versions = final.state?.meta?.sectionVersions?.physicalExam || [];
    expect(versions).toHaveLength(2);
    expect(versions[0]?.id).toMatch(/^sec-physicalExam-/);
    expect(versions[0]?.reason).toBe('Carga inicial');
    expect(versions[0]?.content).toContain('Peso: 75 kg\nTalla: 175 cm\nEstado general:');
    expect(versions[0]?.audit?.action).toBe('cargado');
    expect(versions[1]?.id).toMatch(/^sec-physicalExam-/);
    expect(versions[1]?.reason).toBe(modificationReason);
    expect(versions[1]?.content).toBe([
      'Peso: 75 kg', 'Talla: 175 cm', `Estado general: Control actualizado ${suffix}.`,
      'Tórax: murmullo conservado.', 'Abdomen: blando.', 'SNC: sin foco.'
    ].join('\n'));
    expect(versions[1]?.audit?.action).toBe('modificado');
    expect(versions[1]?.author).toBeTruthy();
    expect(versions[1]?.license).toBeTruthy();
    expect(versions[1]?.createdAt).toBe(versions[1]?.audit?.at);
    expect(versions[1]?.author).toBe(versions[1]?.audit?.lastName);
    expect(versions[1]?.license).toBe(versions[1]?.audit?.license);
    expect(final.state?.meta?.sectionAudit?.physicalExam).toEqual(versions[1]?.audit);
  } finally {
    await Promise.all([context.close(), competingContext.close()]);
  }
});

test('edita antecedentes personales por campos con reintento, conflicto y snapshot canónico', async ({ browser }) => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const initialBackground = `Hipertensión arterial diagnosticada hace cinco años ${suffix}`;
  const changedMedication = `Losartán 50 mg cada 12 horas ${suffix}`;
  const modificationReason = 'Se documenta medicación habitual informada durante el control';
  const competingExam = `Examen físico concurrente ganador ${suffix}`;
  const context = await browser.newContext();
  const competingContext = await browser.newContext();

  try {
    await login(context);
    const created = await context.request.post(`${origin}/api/clinical/patients`, {
      data: {
        firstName: `Paciente ${suffix}`,
        lastName: 'Antecedentes personales QA',
        dni: `95${Date.now().toString().slice(-6)}`,
        medicalRecord: `QA-AP-${suffix}`,
        birthDate: '1976-08-09',
        sex: 'No especificado',
        insurance: 'Cobertura sintética QA',
        affiliateNumber: `QA-AP-${suffix}`,
        phone: '', email: '', address: ''
      }
    });
    await expectStatus(created, 201);
    const body = await created.json() as {
      patientId: string;
      revision: number;
      patient: { fullName: string };
    };

    const page = await context.newPage();
    await page.goto('./');
    await expect(page.getByText(body.patient.fullName, { exact: true }).first()).toBeVisible();

    const loadTrigger = page.getByRole('button', {
      name: 'Cargar antecedentes personales',
      exact: true
    });
    await loadTrigger.click();
    let editor = page.getByRole('dialog', { name: 'Antecedentes personales', exact: true });
    const initialBackgroundField = editor.getByLabel('Antecedentes clínicos / quirúrgicos', { exact: true });
    const initialMedicationField = editor.getByLabel('Medicación habitual', { exact: true });
    const initialFamilyField = editor.getByLabel('Antecedentes oncofamiliares', { exact: true });
    const initialGynecologyField = editor.getByLabel('Antecedentes gineco-obstétricos', { exact: true });
    const initialSaveButton = editor.getByRole('button', { name: 'Cargar en historia', exact: true });
    const initialCloseButton = editor.getByRole('button', {
      name: 'Cerrar editor de antecedentes personales',
      exact: true
    });
    await expect(editor).toBeVisible();
    await expect(initialBackgroundField).toBeFocused();
    await expect(initialMedicationField).toHaveValue('');
    await expect(initialFamilyField).toHaveValue('');
    await expect(initialGynecologyField).toHaveValue('');

    await page.keyboard.press('Shift+Tab');
    await expect(initialCloseButton).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(initialSaveButton).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(initialCloseButton).toBeFocused();
    await page.locator('.personal-history-editor-backdrop').click({ position: { x: 4, y: 4 } });
    await page.keyboard.press('Escape');
    await expect(editor).toBeVisible();

    await initialBackgroundField.fill(`  ${initialBackground}  `);
    await expect(page.getByRole('button', { name: 'Nuevo paciente', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Abrir paciente', exact: true })).toBeDisabled();
    await expect(page.locator('.configuration-button')).toBeDisabled();
    page.once('dialog', (dialog) => dialog.dismiss());
    await initialCloseButton.click();
    await expect(editor).toBeVisible();

    const clinicalPath = '**/api/hc';
    await page.route(clinicalPath, async (route) => {
      if (route.request().method() === 'PUT') {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: false,
            status: 503,
            code: 'QA_TRANSIENT',
            error: 'Falla transitoria sintética de antecedentes personales'
          })
        });
        return;
      }
      await route.continue();
    });
    const transientPut = page.waitForResponse((candidate) =>
      candidate.request().method() === 'PUT' && new URL(candidate.url()).pathname === '/api/hc');
    await initialSaveButton.click();
    await expectStatus(await transientPut, 503);
    await expect(editor).toBeVisible();
    await expect(editor.getByRole('alert')).toContainText(
      'Falla transitoria sintética de antecedentes personales'
    );
    await expect(initialBackgroundField).toHaveValue(`  ${initialBackground}  `);
    await expect(initialMedicationField).toHaveValue('');
    await page.unroute(clinicalPath);

    const initialPut = page.waitForResponse((candidate) =>
      candidate.request().method() === 'PUT' && new URL(candidate.url()).pathname === '/api/hc');
    await initialSaveButton.click();
    await expectStatus(await initialPut, 200);
    await expect(editor).toHaveCount(0);
    await expect(page.locator('.doc-section').filter({ hasText: initialBackground })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Nuevo paciente', exact: true })).toBeEnabled();

    const modifyTrigger = page.getByRole('button', {
      name: 'Modificar sección Antecedentes personales',
      exact: true
    });
    await modifyTrigger.click();
    editor = page.getByRole('dialog', { name: 'Antecedentes personales', exact: true });
    const modificationBackgroundField = editor.getByLabel('Antecedentes clínicos / quirúrgicos', { exact: true });
    const modificationMedicationField = editor.getByLabel('Medicación habitual', { exact: true });
    const modificationFamilyField = editor.getByLabel('Antecedentes oncofamiliares', { exact: true });
    const modificationGynecologyField = editor.getByLabel('Antecedentes gineco-obstétricos', { exact: true });
    const reasonField = editor.getByLabel('Motivo de la modificación', { exact: true });
    const modificationSaveButton = editor.getByRole('button', { name: 'Guardar modificación', exact: true });
    await expect(modificationBackgroundField).toHaveValue(initialBackground);
    await expect(modificationMedicationField).toHaveValue('');
    await expect(modificationFamilyField).toHaveValue('');
    await expect(modificationGynecologyField).toHaveValue('');
    await modificationMedicationField.fill(changedMedication);
    await expect(modificationBackgroundField).toHaveValue(initialBackground);

    let clinicalPutCount = 0;
    page.on('request', (request) => {
      if (request.method() === 'PUT' && new URL(request.url()).pathname === '/api/hc') clinicalPutCount += 1;
    });
    const putsBeforeMissingReason = clinicalPutCount;
    await modificationSaveButton.click();
    await expect(editor.getByRole('alert')).toContainText('Indique el motivo de la modificación.');
    await expect(reasonField).toBeFocused();
    await expect(reasonField).toHaveAttribute('aria-invalid', 'true');
    expect(clinicalPutCount).toBe(putsBeforeMissingReason);
    await reasonField.fill(modificationReason);

    await login(competingContext);
    await activate(competingContext, body.patientId);
    const competingWorkspaceResponse = await competingContext.request.get(
      `${origin}/api/clinical/patients/${body.patientId}/workspace`
    );
    await expectStatus(competingWorkspaceResponse, 200);
    const competingWorkspace = await competingWorkspaceResponse.json() as {
      revision: number;
      state: Record<string, unknown> & {
        narrative?: Record<string, unknown>;
        oncology?: Record<string, unknown>;
        meta?: Record<string, unknown>;
      };
    };
    const competingState = structuredClone(competingWorkspace.state);
    competingState.oncology = {
      ...(competingState.oncology || {}),
      performanceStatus: competingExam
    };
    competingState.meta = {
      ...(competingState.meta || {}),
      persistenceRevision: competingWorkspace.revision
    };
    const competingPut = await competingContext.request.put(`${origin}/api/hc`, { data: competingState });
    await expectStatus(competingPut, 200);

    const conflictPut = page.waitForResponse((candidate) =>
      candidate.request().method() === 'PUT' && new URL(candidate.url()).pathname === '/api/hc');
    await modificationSaveButton.click();
    const conflictResponse = await conflictPut;
    await expectStatus(conflictResponse, 409);
    const conflictBody = await conflictResponse.json() as { code?: string };
    expect(conflictBody.code).toBe('VERSION_CONFLICT');
    await expect(editor).toHaveCount(0);

    const conflictBanner = page.locator('.clinical-save-conflict-banner');
    await expect(conflictBanner).toContainText('Hay cambios sin guardar.');
    await expect(conflictBanner).toBeFocused();
    await conflictBanner.getByRole('button', { name: 'Comparar cambios', exact: true }).click();
    const comparison = page.getByRole('dialog', { name: 'Comparar cambios de la historia' });
    await expect(comparison).toContainText(changedMedication);
    await expect(comparison).toContainText(competingExam);
    await comparison.getByRole('button', { name: 'Cerrar', exact: true }).last().click();
    page.once('dialog', (dialog) => dialog.accept());
    await conflictBanner.getByRole('button', {
      name: 'Descartar borrador y recuperar historia',
      exact: true
    }).click();
    await expect(conflictBanner).toHaveCount(0);
    await expect(page.locator('.doc-section').filter({ hasText: initialBackground })).toBeVisible();
    await expect(page.locator('.doc-section').filter({ hasText: changedMedication })).toHaveCount(0);

    await modifyTrigger.click();
    editor = page.getByRole('dialog', { name: 'Antecedentes personales', exact: true });
    await expect(editor.getByLabel('Antecedentes clínicos / quirúrgicos', { exact: true }))
      .toHaveValue(initialBackground);
    await expect(editor.getByLabel('Medicación habitual', { exact: true })).toHaveValue('');
    await editor.getByLabel('Medicación habitual', { exact: true }).fill(changedMedication);
    await editor.getByLabel('Motivo de la modificación', { exact: true }).fill(modificationReason);
    const modificationPut = page.waitForResponse((candidate) =>
      candidate.request().method() === 'PUT' && new URL(candidate.url()).pathname === '/api/hc');
    await editor.getByRole('button', { name: 'Guardar modificación', exact: true }).click();
    await expectStatus(await modificationPut, 200);
    await expect(editor).toHaveCount(0);
    await expect(page.locator('.doc-section').filter({ hasText: changedMedication })).toBeVisible();

    const workspace = await context.request.get(`${origin}/api/clinical/patients/${body.patientId}/workspace`);
    await expectStatus(workspace, 200);
    const final = await workspace.json() as {
      revision: number;
      state?: {
        narrative?: {
          backgroundClinical?: string;
          currentMedication?: string;
          familyOncology?: string;
          gynecology?: string;
        };
        oncology?: { performanceStatus?: string };
        meta?: {
          sectionFormModes?: { personalHistory?: string };
          sectionVersions?: {
            personalHistory?: Array<{
              id?: string;
              author?: string;
              license?: string;
              createdAt?: string;
              reason?: string;
              content?: string;
              audit?: { action?: string; lastName?: string; license?: string; at?: string };
            }>;
          };
          sectionAudit?: {
            personalHistory?: { action?: string; lastName?: string; license?: string; at?: string };
          };
          sectionChangeRequests?: { personalHistory?: unknown };
        };
      };
    };
    expect(final.revision).toBe(body.revision + 3);
    expect(final.state?.narrative?.backgroundClinical).toBe(initialBackground);
    expect(final.state?.narrative?.currentMedication).toBe(changedMedication);
    expect(final.state?.narrative?.familyOncology || '').toBe('');
    expect(final.state?.narrative?.gynecology || '').toBe('');
    expect(final.state?.oncology?.performanceStatus).toBe(competingExam);
    expect(final.state?.meta?.sectionFormModes?.personalHistory).toBe('structured');
    expect(final.state?.meta?.sectionChangeRequests?.personalHistory).toBeUndefined();
    const versions = final.state?.meta?.sectionVersions?.personalHistory || [];
    expect(versions).toHaveLength(2);
    expect(versions[0]?.id).toMatch(/^sec-personalHistory-/);
    expect(versions[0]?.reason).toBe('Carga inicial');
    expect(versions[0]?.content).toBe(`Clínicos / quirúrgicos: ${initialBackground}`);
    expect(versions[0]?.audit?.action).toBe('cargado');
    expect(versions[1]?.id).toMatch(/^sec-personalHistory-/);
    expect(versions[1]?.reason).toBe(modificationReason);
    expect(versions[1]?.content).toBe([
      `Clínicos / quirúrgicos: ${initialBackground}`,
      `Medicación habitual: ${changedMedication}`
    ].join('\n'));
    expect(versions[1]?.audit?.action).toBe('modificado');
    expect(versions[1]?.author).toBeTruthy();
    expect(versions[1]?.license).toBeTruthy();
    expect(versions[1]?.createdAt).toBeTruthy();
    expect(versions[1]?.createdAt).toBe(versions[1]?.audit?.at);
    expect(versions[1]?.author).toBe(versions[1]?.audit?.lastName);
    expect(versions[1]?.license).toBe(versions[1]?.audit?.license);
    expect(final.state?.meta?.sectionAudit?.personalHistory).toEqual(versions[1]?.audit);
  } finally {
    await Promise.all([context.close(), competingContext.close()]);
  }
});

test('edita antecedentes de enfermedad actual con foco contenido, reintento, conflicto y auditoría canónica', async ({ browser }) => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const initialIllness = `Comenzó con tos seca y disnea progresiva hace dos meses ${suffix}`;
  const changedIllness = `Persisten tos seca y disnea, con pérdida de peso durante tres meses ${suffix}`;
  const modificationReason = 'Evolución clínica documentada durante el control';
  const competingNote = `Antecedente concurrente ganador ${suffix}`;
  const context = await browser.newContext();
  const competingContext = await browser.newContext();

  try {
    await login(context);
    const created = await context.request.post(`${origin}/api/clinical/patients`, {
      data: {
        firstName: `Paciente ${suffix}`,
        lastName: 'Enfermedad actual QA',
        dni: `96${Date.now().toString().slice(-6)}`,
        medicalRecord: `QA-EA-${suffix}`,
        birthDate: '1981-06-07',
        sex: 'No especificado',
        insurance: 'Cobertura sintética QA',
        affiliateNumber: `QA-EA-${suffix}`,
        phone: '', email: '', address: ''
      }
    });
    await expectStatus(created, 201);
    const body = await created.json() as {
      patientId: string;
      revision: number;
      patient: { fullName: string };
    };

    const page = await context.newPage();
    await page.goto('./');
    await expect(page.getByText(body.patient.fullName, { exact: true }).first()).toBeVisible();

    const loadTrigger = page.getByRole('button', {
      name: 'Cargar antecedentes de enfermedad actual',
      exact: true
    });
    await loadTrigger.click();
    let editor = page.getByRole('dialog', { name: 'Antecedentes de enfermedad actual', exact: true });
    const initialField = editor.getByLabel('Antecedentes de enfermedad actual', { exact: true });
    const initialSaveButton = editor.getByRole('button', { name: 'Cargar en historia', exact: true });
    const initialCloseButton = editor.getByRole('button', {
      name: 'Cerrar editor de antecedentes de enfermedad actual',
      exact: true
    });
    await expect(editor).toBeVisible();
    await expect(initialField).toBeFocused();
    await expect(initialSaveButton).toBeVisible();

    await page.keyboard.press('Shift+Tab');
    await expect(initialCloseButton).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(initialSaveButton).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(initialCloseButton).toBeFocused();
    await page.locator('.current-illness-editor-backdrop').click({ position: { x: 4, y: 4 } });
    await page.keyboard.press('Escape');
    await expect(editor).toBeVisible();

    await initialField.fill(`  ${initialIllness}  `);
    await expect(page.getByRole('button', { name: 'Nuevo paciente', exact: true })).toBeDisabled();
    await expect(page.locator('.configuration-button')).toBeDisabled();
    page.once('dialog', (dialog) => dialog.dismiss());
    await initialCloseButton.click();
    await expect(editor).toBeVisible();

    const clinicalPath = '**/api/hc';
    await page.route(clinicalPath, async (route) => {
      if (route.request().method() === 'PUT') {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: false,
            status: 503,
            code: 'QA_TRANSIENT',
            error: 'Falla transitoria sintética de antecedentes de enfermedad actual'
          })
        });
        return;
      }
      await route.continue();
    });
    const transientPut = page.waitForResponse((candidate) =>
      candidate.request().method() === 'PUT' && new URL(candidate.url()).pathname === '/api/hc');
    await initialSaveButton.click();
    await expectStatus(await transientPut, 503);
    await expect(editor).toBeVisible();
    await expect(editor.getByRole('alert')).toContainText(
      'Falla transitoria sintética de antecedentes de enfermedad actual'
    );
    await expect(initialField).toHaveValue(`  ${initialIllness}  `);
    await page.unroute(clinicalPath);

    const initialPut = page.waitForResponse((candidate) =>
      candidate.request().method() === 'PUT' && new URL(candidate.url()).pathname === '/api/hc');
    await initialSaveButton.click();
    await expectStatus(await initialPut, 200);
    await expect(editor).toHaveCount(0);
    await expect(page.locator('.doc-section').filter({ hasText: initialIllness })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Nuevo paciente', exact: true })).toBeEnabled();

    const modifyTrigger = page.getByRole('button', {
      name: 'Modificar sección Antecedentes de enfermedad actual',
      exact: true
    });
    await modifyTrigger.click();
    editor = page.getByRole('dialog', { name: 'Antecedentes de enfermedad actual', exact: true });
    const modificationField = editor.getByLabel('Antecedentes de enfermedad actual', { exact: true });
    const reasonField = editor.getByLabel('Motivo de la modificación', { exact: true });
    await expect(editor.getByRole('button', { name: 'Guardar modificación', exact: true })).toBeVisible();
    await expect(modificationField).toHaveValue(initialIllness);
    await modificationField.fill(changedIllness);
    await reasonField.fill(modificationReason);

    await login(competingContext);
    await activate(competingContext, body.patientId);
    const competingWorkspaceResponse = await competingContext.request.get(
      `${origin}/api/clinical/patients/${body.patientId}/workspace`
    );
    await expectStatus(competingWorkspaceResponse, 200);
    const competingWorkspace = await competingWorkspaceResponse.json() as {
      revision: number;
      state: Record<string, unknown> & {
        narrative?: Record<string, unknown>;
        oncology?: Record<string, unknown>;
        meta?: Record<string, unknown>;
      };
    };
    const competingState = structuredClone(competingWorkspace.state);
    competingState.oncology = {
      ...(competingState.oncology || {}),
      performanceStatus: competingNote
    };
    competingState.meta = {
      ...(competingState.meta || {}),
      persistenceRevision: competingWorkspace.revision
    };
    const competingPut = await competingContext.request.put(`${origin}/api/hc`, { data: competingState });
    await expectStatus(competingPut, 200);

    const conflictPut = page.waitForResponse((candidate) =>
      candidate.request().method() === 'PUT' && new URL(candidate.url()).pathname === '/api/hc');
    await editor.getByRole('button', { name: 'Guardar modificación', exact: true }).click();
    const conflictResponse = await conflictPut;
    await expectStatus(conflictResponse, 409);
    const conflictBody = await conflictResponse.json() as { code?: string };
    expect(conflictBody.code).toBe('VERSION_CONFLICT');
    await expect(editor).toHaveCount(0);

    const conflictBanner = page.locator('.clinical-save-conflict-banner');
    await expect(conflictBanner).toContainText('Hay cambios sin guardar.');
    await expect(conflictBanner).toBeFocused();
    await conflictBanner.getByRole('button', { name: 'Comparar cambios', exact: true }).click();
    const comparison = page.getByRole('dialog', { name: 'Comparar cambios de la historia' });
    await expect(comparison).toContainText(changedIllness);
    await expect(comparison).toContainText(competingNote);
    await comparison.getByRole('button', { name: 'Cerrar', exact: true }).last().click();
    page.once('dialog', (dialog) => dialog.accept());
    await conflictBanner.getByRole('button', {
      name: 'Descartar borrador y recuperar historia',
      exact: true
    }).click();
    await expect(conflictBanner).toHaveCount(0);
    await expect(page.locator('.doc-section').filter({ hasText: initialIllness })).toBeVisible();

    await modifyTrigger.click();
    editor = page.getByRole('dialog', { name: 'Antecedentes de enfermedad actual', exact: true });
    await editor.getByLabel('Antecedentes de enfermedad actual', { exact: true }).fill(changedIllness);
    await editor.getByLabel('Motivo de la modificación', { exact: true }).fill(modificationReason);
    const modificationPut = page.waitForResponse((candidate) =>
      candidate.request().method() === 'PUT' && new URL(candidate.url()).pathname === '/api/hc');
    await editor.getByRole('button', { name: 'Guardar modificación', exact: true }).click();
    await expectStatus(await modificationPut, 200);
    await expect(editor).toHaveCount(0);
    await expect(page.locator('.doc-section').filter({ hasText: changedIllness })).toBeVisible();

    const workspace = await context.request.get(`${origin}/api/clinical/patients/${body.patientId}/workspace`);
    await expectStatus(workspace, 200);
    const final = await workspace.json() as {
      revision: number;
      state?: {
        narrative?: { currentIllness?: string };
        oncology?: { performanceStatus?: string };
        meta?: {
          sectionFormModes?: { currentIllness?: string };
          sectionVersions?: {
            currentIllness?: Array<{
              id?: string;
              author?: string;
              license?: string;
              createdAt?: string;
              reason?: string;
              content?: string;
              audit?: { action?: string; lastName?: string; license?: string; at?: string };
            }>;
          };
          sectionAudit?: {
            currentIllness?: { action?: string; lastName?: string; license?: string; at?: string };
          };
          sectionChangeRequests?: { currentIllness?: unknown };
        };
      };
    };
    expect(final.revision).toBe(body.revision + 3);
    expect(final.state?.narrative?.currentIllness).toBe(changedIllness);
    expect(final.state?.oncology?.performanceStatus).toBe(competingNote);
    expect(final.state?.meta?.sectionFormModes?.currentIllness).toBe('structured');
    expect(final.state?.meta?.sectionChangeRequests?.currentIllness).toBeUndefined();
    const versions = final.state?.meta?.sectionVersions?.currentIllness || [];
    expect(versions).toHaveLength(2);
    expect(versions[0]?.id).toMatch(/^sec-currentIllness-/);
    expect(versions[0]?.reason).toBe('Carga inicial');
    expect(versions[0]?.content).toBe(initialIllness);
    expect(versions[0]?.audit?.action).toBe('cargado');
    expect(versions[1]?.id).toMatch(/^sec-currentIllness-/);
    expect(versions[1]?.reason).toBe(modificationReason);
    expect(versions[1]?.content).toBe(changedIllness);
    expect(versions[1]?.audit?.action).toBe('modificado');
    expect(versions[1]?.author).toBeTruthy();
    expect(versions[1]?.license).toBeTruthy();
    expect(versions[1]?.createdAt).toBeTruthy();
    expect(versions[1]?.createdAt).toBe(versions[1]?.audit?.at);
    expect(versions[1]?.author).toBe(versions[1]?.audit?.lastName);
    expect(versions[1]?.license).toBe(versions[1]?.audit?.license);
    expect(final.state?.meta?.sectionAudit?.currentIllness).toEqual(versions[1]?.audit);
  } finally {
    await Promise.all([context.close(), competingContext.close()]);
  }
});
