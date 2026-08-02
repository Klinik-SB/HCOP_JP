import { expect, test, type APIResponse, type BrowserContext, type Page, type Request } from '@playwright/test';

const origin = (process.env['HCOP_E2E_BASE_URL'] || 'http://127.0.0.1:5182').replace(/\/$/, '');
const username = process.env['HCOP_E2E_USERNAME'] || 'qa_conflict';
const password = process.env['HCOP_E2E_PASSWORD'] || '';

async function expectStatus(response: APIResponse, expected: number): Promise<void> {
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

async function putAfterClick(page: Page): Promise<APIResponse> {
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
