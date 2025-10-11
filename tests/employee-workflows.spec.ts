import { test, expect } from "@playwright/test";
import { captureScreenshot } from "./utils/screenshot";

const baseURL = process.env.BASE_URL || "http://localhost:5173";

const jsonResponse = (data: unknown, status = 200) => ({
  status,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(data ?? null),
});

test.describe("Employee workflows", () => {
  test.afterEach(async ({ page }, testInfo) => {
    await captureScreenshot(page, testInfo, "desktop");
  });

  test("guides onboarding and offboarding checklists", async ({ page }) => {
    const employee = {
      id: "e1",
      firstName: "Aisha",
      lastName: "Khan",
      employeeCode: "EMP-001",
      position: "HR Manager",
      status: "active",
    };

    let onboardingWorkflow = {
      id: "wf-onboard",
      employeeId: employee.id,
      workflowType: "onboarding",
      status: "in_progress",
      startedAt: new Date().toISOString(),
      steps: [
        {
          id: "step-doc",
          workflowId: "wf-onboard",
          stepKey: "collect_documents",
          stepType: "document",
          title: "Collect mandatory documents",
          description: "Upload signed contract and ID copies.",
          status: "pending",
          orderIndex: 0,
        },
        {
          id: "step-asset",
          workflowId: "wf-onboard",
          stepKey: "assign_assets",
          stepType: "asset",
          title: "Assign starter assets",
          description: "Provision laptop or badge.",
          status: "pending",
          orderIndex: 1,
        },
        {
          id: "step-activate",
          workflowId: "wf-onboard",
          stepKey: "activate_status",
          stepType: "task",
          title: "Activate employee status",
          description: "Mark employee as active.",
          status: "pending",
          orderIndex: 2,
        },
      ],
    };

    let offboardingWorkflow = {
      id: "wf-offboard",
      employeeId: employee.id,
      workflowType: "offboarding",
      status: "in_progress",
      startedAt: new Date().toISOString(),
      steps: [
        {
          id: "step-return",
          workflowId: "wf-offboard",
          stepKey: "collect_assets",
          stepType: "asset",
          title: "Collect company assets",
          description: "Return laptop and badge.",
          status: "pending",
          orderIndex: 0,
        },
        {
          id: "step-settle",
          workflowId: "wf-offboard",
          stepKey: "settle_loans",
          stepType: "task",
          title: "Settle outstanding loans",
          description: "Clear remaining loan balance.",
          status: "pending",
          orderIndex: 1,
        },
        {
          id: "step-exit",
          workflowId: "wf-offboard",
          stepKey: "finalize_exit",
          stepType: "task",
          title: "Finalize exit status",
          description: "Terminate and archive record.",
          status: "pending",
          orderIndex: 2,
        },
      ],
    };

    const recorded: Record<string, any> = {};

    await page.route("**/api/employees?**", (route) => {
      route.fulfill({
        status: 200,
        headers: { "Content-Type": "application/json", "X-Total-Count": "1" },
        body: JSON.stringify([employee]),
      });
    });

    await page.route("**/api/departments", (route) => route.fulfill(jsonResponse([])));
    await page.route("**/api/companies", (route) => route.fulfill(jsonResponse([])));
    await page.route("**/api/assets", (route) =>
      route.fulfill(
        jsonResponse([
          {
            id: "asset-1",
            name: "Laptop",
            status: "available",
            serialNumber: "LT-01",
          },
        ]),
      ),
    );
    await page.route("**/api/asset-assignments", (route) =>
      route.fulfill(
        jsonResponse([
          {
            id: "assign-1",
            employeeId: employee.id,
            assetId: "asset-1",
            status: "active",
            asset: { id: "asset-1", name: "Laptop" },
          },
        ]),
      ),
    );
    await page.route("**/api/loans", (route) =>
      route.fulfill(
        jsonResponse([
          {
            id: "loan-1",
            employeeId: employee.id,
            status: "active",
            remainingAmount: 500,
            reason: "Relocation loan",
          },
        ]),
      ),
    );

    await page.route("**/api/employees/e1/workflows/onboarding", (route) => {
      if (route.request().method() === "GET") {
        route.fulfill(jsonResponse({ message: "not found" }, 404));
      } else {
        route.continue();
      }
    });

    await page.route("**/api/employees/e1/workflows/onboarding/start", (route) => {
      onboardingWorkflow = {
        ...onboardingWorkflow,
        status: "in_progress",
        steps: onboardingWorkflow.steps.map((step) => ({ ...step, status: "pending" })),
      };
      route.fulfill(jsonResponse(onboardingWorkflow));
    });

    await page.route("**/api/employees/e1/workflows/onboarding/steps/*/progress", (route) => {
      const url = route.request().url();
      const payload = route.request().postDataJSON();
      const updateStatus = (stepId: string) => {
        onboardingWorkflow = {
          ...onboardingWorkflow,
          steps: onboardingWorkflow.steps.map((step) =>
            step.id === stepId ? { ...step, status: payload.status ?? "completed" } : step,
          ),
        };
      };
      if (url.includes("step-doc")) {
        recorded.onboardingDocument = payload.document;
        updateStatus("step-doc");
      }
      if (url.includes("step-asset")) {
        recorded.onboardingAsset = payload.assetAssignment;
        updateStatus("step-asset");
      }
      if (url.includes("step-activate")) {
        recorded.onboardingActivation = payload.status;
        updateStatus("step-activate");
      }
      route.fulfill(jsonResponse(onboardingWorkflow));
    });

    await page.route("**/api/employees/e1/workflows/onboarding/complete", (route) => {
      onboardingWorkflow = {
        ...onboardingWorkflow,
        status: "completed",
      };
      route.fulfill(jsonResponse(onboardingWorkflow));
    });

    await page.route("**/api/employees/e1/workflows/offboarding", (route) => {
      if (route.request().method() === "GET") {
        route.fulfill(jsonResponse({ message: "not found" }, 404));
      } else {
        route.continue();
      }
    });

    await page.route("**/api/employees/e1/workflows/offboarding/start", (route) => {
      offboardingWorkflow = {
        ...offboardingWorkflow,
        status: "in_progress",
        steps: offboardingWorkflow.steps.map((step) => ({ ...step, status: "pending" })),
      };
      route.fulfill(jsonResponse(offboardingWorkflow));
    });

    await page.route("**/api/employees/e1/workflows/offboarding/steps/*/progress", (route) => {
      const url = route.request().url();
      const payload = route.request().postDataJSON();
      const updateStatus = (stepId: string) => {
        offboardingWorkflow = {
          ...offboardingWorkflow,
          steps: offboardingWorkflow.steps.map((step) =>
            step.id === stepId ? { ...step, status: payload.status ?? "completed" } : step,
          ),
        };
      };
      if (url.includes("step-return")) {
        recorded.offboardingReturn = payload.assetReturn;
        updateStatus("step-return");
      }
      if (url.includes("step-settle")) {
        recorded.offboardingLoan = payload.loanSettlement;
        updateStatus("step-settle");
      }
      if (url.includes("step-exit")) {
        recorded.offboardingExit = payload.status;
        updateStatus("step-exit");
      }
      route.fulfill(jsonResponse(offboardingWorkflow));
    });

    await page.route("**/api/employees/e1/workflows/offboarding/complete", (route) => {
      offboardingWorkflow = {
        ...offboardingWorkflow,
        status: "completed",
      };
      route.fulfill(jsonResponse(offboardingWorkflow));
    });

    await page.goto(`${baseURL}/employees`);

    await page.getByRole("button", { name: "Manage workflow" }).first().click();

    // Start onboarding workflow
    await page.getByRole("button", { name: "Start onboarding workflow" }).click();

    // Document step
    await page.getByLabel("Document title").fill("Employment contract");
    await page.setInputFiles("input[type=file]", "tests/fixtures/sample.pdf");
    await page.getByRole("button", { name: "Mark complete" }).first().click();

    // Asset step
    await page.getByLabel("Asset selection").click();
    await page.getByRole("option", { name: /Laptop/ }).click();
    await page.getByRole("button", { name: "Mark complete" }).nth(1).click();

    // Activate status step
    await page.getByRole("button", { name: "Mark complete" }).nth(2).click();

    await expect(page.getByRole("button", { name: "Complete onboarding workflow" })).toBeEnabled();
    await page.getByRole("button", { name: "Complete onboarding workflow" }).click();

    // Switch to offboarding flow

    await page.getByRole("combobox", { name: "Select workflow" }).click();
    await page.getByRole("option", { name: "Offboarding" }).click();

    await page.getByRole("button", { name: "Start offboarding workflow" }).click();

    // Collect assets
    await page.getByLabel("Assignment selection").click();
    await page.getByRole("option", { name: /Laptop/ }).click();
    await page.getByRole("button", { name: "Mark complete" }).first().click();

    // Settle loan
    await page.getByLabel("Loan selection").click();
    await page.getByRole("option", { name: /Relocation loan/ }).click();
    await page.getByRole("button", { name: "Mark complete" }).nth(1).click();

    // Finalize exit
    await page.getByRole("button", { name: "Mark complete" }).nth(2).click();

    await page.getByRole("button", { name: "Complete offboarding workflow" }).click();

    expect(recorded.onboardingDocument?.pdfDataUrl).toBeTruthy();
    expect(recorded.onboardingAsset?.assetId).toBe("asset-1");
    expect(recorded.onboardingActivation).toBe("completed");
    expect(recorded.offboardingReturn?.assignmentId).toBe("assign-1");
    expect(recorded.offboardingLoan?.loanId).toBe("loan-1");
  });
});
