import { test, expect } from "@playwright/test";
import { viewports } from "../playwright.config";
import { captureScreenshot } from "./utils/screenshot";

const baseURL = process.env.BASE_URL || "http://localhost:5173";

const employee = {
  id: "emp-1",
  employeeCode: "E-100",
  firstName: "Alex",
  lastName: "Stone",
  email: "alex@example.com",
  position: "Engineer",
  departmentId: "dept-1",
  status: "active",
  salary: "5000",
  companyId: "comp-1",
};

for (const [name, viewport] of Object.entries(viewports)) {
  test.describe(`viewport:${name}`, () => {
    test.use({ viewport });

    test.afterEach(async ({ page }, testInfo) => {
      await captureScreenshot(page, testInfo, name);
    });

    test("admin can progress onboarding workflow", async ({ page }) => {
      const workflowState: any = {
        id: "wf-1",
        employeeId: employee.id,
        workflowType: "onboarding",
        status: "in_progress",
        startedAt: new Date().toISOString(),
        completedAt: null,
        metadata: {},
        steps: [
          {
            id: "step-doc",
            workflowId: "wf-1",
            title: "Collect identity documents",
            description: "Upload passport and civil ID copies for the employee.",
            stepType: "document",
            status: "pending",
            orderIndex: 0,
            dueDate: null,
            completedAt: null,
            metadata: { requiredFields: ["passportImage", "civilIdImage"] },
          },
          {
            id: "step-asset",
            workflowId: "wf-1",
            title: "Assign starter asset",
            description: "Provide the employee with their initial equipment.",
            stepType: "asset",
            status: "pending",
            orderIndex: 1,
            dueDate: null,
            completedAt: null,
            metadata: { autoAssign: true },
          },
          {
            id: "step-orientation",
            workflowId: "wf-1",
            title: "Schedule orientation",
            description: "Coordinate the employee's first-day orientation.",
            stepType: "task",
            status: "pending",
            orderIndex: 2,
            dueDate: null,
            completedAt: null,
            metadata: {},
          },
          {
            id: "step-activate",
            workflowId: "wf-1",
            title: "Activate employee",
            description: "Set the employee's status to active once onboarding is complete.",
            stepType: "task",
            status: "pending",
            orderIndex: 3,
            dueDate: null,
            completedAt: null,
            metadata: { setStatus: "active" },
          },
        ],
      };

      await page.route("**/api/employees**", async (route) => {
        if (route.request().method() === "GET") {
          await route.fulfill({
            status: 200,
            body: JSON.stringify([employee]),
          });
        } else {
          await route.continue();
        }
      });

      await page.route("**/api/departments", (route) =>
        route.fulfill({ status: 200, body: JSON.stringify([{ id: "dept-1", name: "Engineering" }]) }),
      );
      await page.route("**/api/companies", (route) =>
        route.fulfill({ status: 200, body: JSON.stringify([{ id: "comp-1", name: "Main" }]) }),
      );

      await page.route("**/api/employees/emp-1/workflows?type=onboarding", async (route) => {
        await route.fulfill({
          status: 200,
          body: JSON.stringify({ workflows: [workflowState], activeWorkflow: workflowState }),
        });
      });

      await page.route("**/api/employees/emp-1/workflows/onboarding/start", async (route) => {
        workflowState.status = "in_progress";
        await route.fulfill({
          status: 201,
          body: JSON.stringify({ workflow: workflowState }),
        });
      });

      await page.route(/\/api\/employees\/emp-1\/workflows\/wf-1\/steps\/(.*)\/progress/, async (route) => {
        const url = route.request().url();
        const match = url.match(/steps\/([^/]+)/);
        const stepId = match ? match[1] : "";
        const body = route.request().postDataJSON();
        const step = workflowState.steps.find((s: any) => s.id === stepId);
        if (step) {
          step.status = body?.status ?? "completed";
          step.completedAt = new Date().toISOString();
          step.metadata = {
            ...(step.metadata || {}),
            result:
              step.stepType === "document"
                ? { documents: Object.keys(body?.payload?.documents || {}) }
                : step.stepType === "task" && body?.payload?.notes
                  ? { notes: body.payload.notes }
                  : step.stepType === "asset"
                    ? { assignedAsset: "auto" }
                    : undefined,
          };
        }
        await route.fulfill({
          status: 200,
          body: JSON.stringify({ workflow: workflowState, step }),
        });
      });

      await page.route("**/api/employees/emp-1/workflows/wf-1/complete", async (route) => {
        workflowState.status = "completed";
        workflowState.completedAt = new Date().toISOString();
        await route.fulfill({ status: 200, body: JSON.stringify({ workflow: workflowState }) });
      });

      await page.goto(`${baseURL}/employees`);

      await page.getByRole("button", { name: "Onboard" }).first().click();
      await expect(page.getByText("Preparing workflow", { exact: false })).toHaveCount(0);

      await page.getByLabel("passportImage").fill("passport-data-url");
      await page.getByLabel("civilIdImage").fill("civil-id-data-url");
      await page.getByRole("button", { name: "Upload documents" }).click();
      await expect(page.getByText("Workflow step completed.")).toBeVisible();

      await page.getByRole("button", { name: "Complete asset step" }).click();
      await expect(page.getByText("Workflow step completed.")).toBeVisible();

      await page.getByLabel("Notes").fill("Orientation booked");
      await page.getByRole("button", { name: "Mark task complete" }).first().click();
      await expect(page.getByText("Workflow step completed.")).toBeVisible();

      await page.getByRole("button", { name: "Mark task complete" }).last().click();
      await expect(page.getByText("Workflow step completed.")).toBeVisible();

      await expect(page.getByRole("button", { name: "Mark workflow complete" })).toBeEnabled();
      await page.getByRole("button", { name: "Mark workflow complete" }).click();
      await expect(page.getByText("Workflow completed.")).toBeVisible();

      await page.getByRole("button", { name: "Close" }).click();
      await expect(page.getByText("Workflow completed.")).toBeVisible();
    });
  });
}
