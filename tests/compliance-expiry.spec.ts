import { test, expect } from "@playwright/test";
import { viewports } from "../playwright.config";
import { captureScreenshot } from "./utils/screenshot";

const baseURL = process.env.BASE_URL || "http://localhost:5173";

const employee = {
  id: "emp-expired-1",
  firstName: "Lina",
  lastName: "Hassan",
  email: "lina@example.com",
  position: "Compliance Analyst",
};

const expiredChecks = [
  {
    employeeId: employee.id,
    employeeName: `${employee.firstName} ${employee.lastName}`,
    email: employee.email,
    visa: {
      number: "V-001",
      expiryDate: "2024-01-01",
      alertDays: 30,
      daysUntilExpiry: -15,
    },
  },
];

const documents = [
  {
    id: "doc-expired-1",
    employeeId: employee.id,
    title: "Visa Copy",
    description: "Signed visa document",
    documentUrl: "https://example.com/doc.pdf",
    category: "visa",
    tags: "visa,government",
    referenceNumber: "V-001",
    controllerNumber: "CTRL-001",
    expiryDate: "2024-01-01",
    alertDays: 30,
    metadata: {},
    versionGroupId: "vg-1",
    version: 1,
    previousVersionId: null,
    isLatest: true,
    generatedFromTemplateKey: null,
    generatedByUserId: null,
    signatureStatus: "not_requested",
    signatureProvider: null,
    signatureEnvelopeId: null,
    signatureRecipientEmail: null,
    signatureRequestedAt: null,
    signatureCompletedAt: null,
    signatureDeclinedAt: null,
    signatureCancelledAt: null,
    signatureMetadata: {},
    createdAt: new Date().toISOString(),
  },
];

for (const [name, viewport] of Object.entries(viewports)) {
  test.describe(`viewport:${name}`, () => {
    test.use({ viewport });

    test.afterEach(async ({ page }, testInfo) => {
      await captureScreenshot(page, testInfo, name);
    });

    test("compliance expiry view surfaces replacement workflow", async ({ page }) => {
      await page.route("**/api/employees", (route) =>
        route.fulfill({ status: 200, body: JSON.stringify([employee]) }),
      );
      await page.route("**/api/documents/expiry-check", (route) =>
        route.fulfill({ status: 200, body: JSON.stringify(expiredChecks) }),
      );
      await page.route("**/api/documents", (route) => {
        if (route.request().method() === "GET") {
          return route.fulfill({ status: 200, body: JSON.stringify(documents) });
        }
        return route.fulfill({ status: 200, body: JSON.stringify({}) });
      });
      await page.route("**/api/fleet/expiry-check", (route) =>
        route.fulfill({ status: 200, body: JSON.stringify([]) }),
      );
      await page.route("**/api/notifications", (route) =>
        route.fulfill({ status: 200, body: JSON.stringify([]) }),
      );
      await page.route("**/api/notifications/unread", (route) =>
        route.fulfill({ status: 200, body: JSON.stringify([]) }),
      );
      await page.route("**/api/notifications/rules", (route) =>
        route.fulfill({ status: 200, body: JSON.stringify([]) }),
      );
      await page.route("**/api/employee-events", (route) =>
        route.fulfill({ status: 200, body: JSON.stringify([]) }),
      );

      await page.goto("about:blank");
      await page.evaluate(() => localStorage.setItem("language", "en"));

      await page.goto(`${baseURL}/compliance?tab=expiry`);

      await expect(
        page.getByRole("heading", { name: "Document Expiry Tracking" }),
      ).toBeVisible();
      await expect(page.getByText("Lina Hassan")).toBeVisible();
      await expect(page.getByText("Visa")).toBeVisible();

      const replacementButton = page.getByRole("button", { name: "Upload replacement" }).first();
      await expect(replacementButton).toBeVisible();

      await replacementButton.click();

      await expect(
        page.getByRole("heading", { name: "Upload replacement document" }),
      ).toBeVisible();
      await expect(page.getByLabel("Existing document")).toBeVisible();
    });
  });
}
