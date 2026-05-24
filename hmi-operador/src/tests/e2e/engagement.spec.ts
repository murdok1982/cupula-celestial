import { test, expect } from '@playwright/test';

test.describe('Flujo de engagement completo', () => {
  test('operador autoriza un engagement letal con doble factor', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveTitle(/Cupula Celestial/i);
    await page.getByTestId('login-username').fill('OPS-0421');
    await page.getByTestId('login-password').fill('PasswordDePrueba!');
    await page.getByTestId('login-submit').click();
    await expect(page.getByText(/Token fisico FIDO2|segundo factor/i)).toBeVisible({ timeout: 5000 });
    await page.waitForURL(/\/dashboard/, { timeout: 10_000 });
    await expect(page.getByTestId('cesium-map')).toBeVisible();
    await expect(page.getByText('T-4471')).toBeVisible({ timeout: 5000 });
    await page.getByTestId('track-row-T-4471').click();
    await expect(page.getByTestId('recommendation-card')).toBeVisible();
    await expect(page.getByTestId('recommendation-card')).toHaveAttribute('data-action', 'ENGAGE');
    await page.getByTestId('btn-authorize').click();
    await expect(page.getByText(/AUTORIZAR ENGAGEMENT/i)).toBeVisible();
    await expect(page.getByTestId('auth-pin-input')).toBeVisible();
    await page.getByTestId('auth-pin-input').fill('123456');
    await page.getByTestId('auth-pin-submit').click();
    await expect(page.getByText(/Procesando|Token fisico FIDO2/i)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/AUTORIZAR ENGAGEMENT/i)).not.toBeVisible({ timeout: 10_000 });
  });

  test('rechazo de recomendacion', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('login-username').fill('OPS-0421');
    await page.getByTestId('login-password').fill('PasswordDePrueba!');
    await page.getByTestId('login-submit').click();
    await page.waitForURL(/\/dashboard/, { timeout: 10_000 });
    await expect(page.getByTestId('cesium-map')).toBeVisible();
    await expect(page.getByText('T-4471')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('recommendation-card')).toBeVisible();
    await page.getByTestId('btn-reject').click();
    await expect(page.getByText(/RECHAZAR ENGAGEMENT/i)).toBeVisible();
  });

  test('diferimiento de decision', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('login-username').fill('OPS-0421');
    await page.getByTestId('login-password').fill('PasswordDePrueba!');
    await page.getByTestId('login-submit').click();
    await page.waitForURL(/\/dashboard/, { timeout: 10_000 });
    await expect(page.getByTestId('cesium-map')).toBeVisible();
    await expect(page.getByText('T-4471')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('recommendation-card')).toBeVisible();
    await page.getByTestId('btn-defer').click();
    await expect(page.getByText(/DIFERIR DECISION/i)).toBeVisible();
  });
});
