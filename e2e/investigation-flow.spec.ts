import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByTestId(`demo-login-${email}`).click();
  await page.waitForURL("**/dashboard");
}

test("engineer runs an end-to-end biochar investigation", async ({ page }) => {
  await login(page, "engineer@northwind.example");
  await expect(page.getByText("Engineering dashboard")).toBeVisible();

  // Step 1: category + context
  await page.goto("/investigations/new");
  await page.getByTestId("category-biochar").click();
  await page.getByLabel("Investigation title *").fill("E2E: product moisture above 10 %");
  await page.getByRole("button", { name: "Create & continue" }).click();
  await page.waitForURL(/intake\?step=2/);

  // Step 2: problem definition
  await page.getByLabel("Problem type").selectOption("high_moisture");
  await page.getByLabel("What happened? *").fill("Bagged biochar moisture measured at 14 % vs. 10 % maximum.");
  await page.getByRole("button", { name: "Save & continue" }).click();
  await page.waitForURL(/intake\?step=3/);
  await page.getByRole("button", { name: "Save & continue" }).click();
  await page.waitForURL(/intake\?step=4/);

  // Step 4: conditional follow-up questions appear for high moisture, downtime ones do not
  await expect(page.getByTestId("question-bc_moisture_sampling")).toBeVisible();
  await expect(page.getByTestId("question-dt_failure_codes")).toHaveCount(0);
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft saved")).toBeVisible();
  const invUrl = page.url().split("/intake")[0];

  // Evidence
  await page.goto(`${invUrl}/evidence`);
  await page.getByLabel("Title *").fill("Moisture lab results week 41");
  await page.getByRole("button", { name: "Add evidence" }).click();
  await expect(page.getByText("Evidence added")).toBeVisible();

  // 5 Whys
  await page.goto(`${invUrl}/five-whys`);
  await page.getByRole("button", { name: "First-level why" }).click();
  await page.getByLabel("Why 1 answer").fill("Quench water over-dosed after level sensor change");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("5 Whys saved")).toBeVisible();

  // Cause register: add a hypothesis
  await page.goto(`${invUrl}/causes`);
  await page.getByRole("button", { name: "Add cause" }).click();
  await page.getByLabel("Cause description *").fill("Quench water over-dosing");
  await page.getByRole("button", { name: "Save cause" }).click();
  await expect(page.getByText("Cause added")).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm", exact: true })).toHaveCount(0); // engineers cannot confirm

  // AI assistant (no key configured → deterministic engine)
  await page.goto(`${invUrl}/assistant`);
  await page.getByRole("button", { name: "Analyse investigation" }).click();
  await expect(page.getByText(/No AI API key is configured/)).toBeVisible();
  await expect(page.getByText("Candidate causal hypotheses")).toBeVisible();

  // Report + PDF
  await page.goto(`${invUrl}/report`);
  await expect(page.getByRole("heading", { name: /Root Cause Analysis Report/ })).toBeVisible();
  const pdf = await page.request.get(`${invUrl.replace("/investigations/", "/api/investigations/")}/export?format=pdf`);
  expect(pdf.status()).toBe(200);
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
});

test("viewer is read-only and other organizations are invisible", async ({ page }) => {
  await login(page, "viewer@northwind.example");
  await expect(page.getByRole("link", { name: "New investigation" })).toHaveCount(0);
  await page.goto("/investigations");
  await expect(page.getByText("CONFIDENTIAL")).toHaveCount(0);
  await page.getByRole("link", { name: /Biochar output/ }).click();
  await page.getByRole("link", { name: "FMEA 4" }).click();
  await expect(page.getByRole("button", { name: "Add failure mode" })).toHaveCount(0);

  await login(page, "qa@contoso.example");
  await page.goto("/investigations");
  await expect(page.getByText("CONFIDENTIAL Contoso")).toBeVisible();
  await expect(page.getByText("Biochar output")).toHaveCount(0);
});
