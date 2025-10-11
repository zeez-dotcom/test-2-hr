import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import EmployeeForm from "../components/employees/employee-form";
import type { Department, Company } from "@shared/schema";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/http";

vi.mock("@/lib/http", () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
}));

describe("EmployeeForm custom fields", () => {
  const departments: Department[] = [
    { id: "dept-1", name: "Engineering" } as any,
  ];
  const companies: Company[] = [];

  beforeEach(() => {
    vi.mocked(apiGet).mockReset();
    vi.mocked(apiPost).mockReset();
    vi.mocked(apiPut).mockReset();
    vi.mocked(apiDelete).mockReset();
  });

  it("renders custom field inputs and submits values", async () => {
    vi.mocked(apiGet).mockImplementation(async (url: string) => {
      if (url === "/api/employees/custom-fields") {
        return {
          ok: true,
          data: [
            { id: "field-1", name: "Favorite color" },
          ],
        } as any;
      }
      throw new Error(`Unexpected GET ${url}`);
    });

    const onSubmit = vi.fn();
    const client = new QueryClient();

    render(
      <QueryClientProvider client={client}>
        <EmployeeForm
          departments={departments}
          companies={companies}
          onSubmit={onSubmit as any}
          isSubmitting={false}
        />
      </QueryClientProvider>,
    );

    const customFieldInput = await screen.findByLabelText("Favorite color");

    await userEvent.type(screen.getByLabelText("Employee Code"), "E-100");
    await userEvent.type(screen.getByLabelText("First Name"), "Ada");
    await userEvent.type(screen.getByLabelText("Last Name"), "Lovelace");
    await userEvent.type(screen.getByLabelText("Position"), "Engineer");
    const salaryInput = screen.getByLabelText("Salary");
    await userEvent.clear(salaryInput);
    await userEvent.type(salaryInput, "1000");
    await userEvent.type(customFieldInput, "Blue");

    await userEvent.click(screen.getByRole("button", { name: "Add Employee" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const payload = onSubmit.mock.calls[0][0];
    expect(payload.customFieldValues).toEqual({ "field-1": "Blue" });
  });
});
