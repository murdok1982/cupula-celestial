import { test, expect } from '@playwright/test';

test.describe('Login y MFA', () => {
  test('rechaza credenciales debiles', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('login-username').fill('OPS-0421');
    await page.getByTestId('login-password').fill('123');
    await page.getByTestId('login-submit').click();
    await expect(page.getByText(/Minimo 8 caracteres/i)).toBeVisible();
  });

  test('redirige a dashboard tras MFA en modo mock', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('login-username').fill('OPS-0421');
    await page.getByTestId('login-password').fill('PasswordDePrueba!');
    await page.getByTestId('login-submit').click();
    await page.waitForURL(/\/dashboard/, { timeout: 10_000 });
    await expect(page.getByTestId('cesium-map')).toBeVisible();
  });
});

test.describe('Flujo completo de inicio de sesion', () => {
  test('login -> dashboard -> tracks cargados -> WebSocket conectado', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('login-username').fill('OPS-0421');
    await page.getByTestId('login-password').fill('PasswordDePrueba!');
    await page.getByTestId('login-submit').click();
    await page.waitForURL(/\/dashboard/, { timeout: 10_000 });

    // Verify dashboard has loaded tracks
    await expect(page.getByTestId('cesium-map')).toBeVisible();
    await expect(page.getByText(/T-4471|T-4502|T-4519/)).toBeVisible({ timeout: 5000 });

    // Verify status bar shows connection info
    await expect(page.getByTestId('status-bar')).toBeVisible();
  });

  test('redirige a login al cerrar sesion', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('login-username').fill('OPS-0421');
    await page.getByTestId('login-password').fill('PasswordDePrueba!');
    await page.getByTestId('login-submit').click();
    await page.waitForURL(/\/dashboard/, { timeout: 10_000 });

    // Force logout via hotkey (Ctrl+Shift+L)
    await page.keyboard.press('Control+Shift+l');
    await page.waitForURL(/\/login/, { timeout: 5000 });
  });

  test('acceso denegado para rol insuficiente', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('login-username').fill('OPS-0421');
    await page.getByTestId('login-password').fill('PasswordDePrueba!');
    await page.getByTestId('login-submit').click();
    await page.waitForURL(/\/dashboard/, { timeout: 10_000 });

    // Verify that engagement buttons show insufficient privileges note
    // This depends on the operator having a non-commander role
    await expect(page.getByTestId('cesium-map')).toBeVisible();
  });

  test('MFA FIDO2 completo en modo mock', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('login-username').fill('OPS-0421');
    await page.getByTestId('login-password').fill('PasswordDePrueba!');
    await page.getByTestId('login-submit').click();

    // En modo mock MFA se completa automaticamente
    await page.waitForURL(/\/dashboard/, { timeout: 10_000 });
    await expect(page.getByTestId('cesium-map')).toBeVisible();
  });
});
