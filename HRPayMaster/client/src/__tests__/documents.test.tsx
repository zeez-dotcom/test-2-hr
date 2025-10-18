import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  render,
  screen,
  waitFor,
  fireEvent,
  within,
} from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import "@testing-library/jest-dom";
import DocumentsPage from "@/pages/documents";
import type { GenericDocument } from "@shared/schema";
import { queryClient } from "@/lib/queryClient";

const httpMock = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: any) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/input", () => ({
  Input: (props: any) => <input {...props} />,
}));

vi.mock("@/components/ui/textarea", () => ({
  Textarea: (props: any) => <textarea {...props} />,
}));

vi.mock("@/components/ui/select", () => {
  const React = require("react") as typeof import("react");
  const SelectContext = React.createContext<{
    value?: string;
    onValueChange?: (value: string) => void;
  }>({});

  const Select = ({ children, value, onValueChange }: any) => (
    <SelectContext.Provider value={{ value, onValueChange }}>
      <div data-select-root data-value={value}>{children}</div>
    </SelectContext.Provider>
  );

  const SelectTrigger = ({ children, ...props }: any) => <div {...props}>{children}</div>;
  const SelectContent = ({ children }: any) => <div>{children}</div>;
  const SelectValue = ({ placeholder }: any) => <span>{placeholder}</span>;
  const SelectItem = ({ children, value }: any) => {
    const ctx = React.useContext(SelectContext);
    return (
      <div
        role="option"
        data-value={value}
        onClick={() => ctx.onValueChange?.(value)}
      >
        {children}
      </div>
    );
  };

  return { Select, SelectTrigger, SelectContent, SelectValue, SelectItem };
});

vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children }: any) => <div>{children}</div>,
  TabsList: ({ children }: any) => <div>{children}</div>,
  TabsTrigger: ({ children, onClick }: any) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
  TabsContent: ({ children }: any) => <div>{children}</div>,
}));

vi.mock("@/components/ui/card", () => ({
  Card: ({ children }: any) => <div>{children}</div>,
  CardHeader: ({ children }: any) => <div>{children}</div>,
  CardTitle: ({ children }: any) => <div>{children}</div>,
  CardDescription: ({ children }: any) => <div>{children}</div>,
  CardContent: ({ children }: any) => <div>{children}</div>,
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: any) => <span>{children}</span>,
}));

vi.mock("@/components/ui/label", () => ({
  Label: ({ children, htmlFor }: any) => <label htmlFor={htmlFor}>{children}</label>,
}));

vi.mock("@/components/ui/switch", () => ({
  Switch: ({ checked, onCheckedChange, ...props }: any) => (
    <input
      type="checkbox"
      checked={checked}
      onChange={(event) => onCheckedChange?.(event.target.checked)}
      {...props}
    />
  ),
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: any) => <div>{children}</div>,
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <div>{children}</div>,
  DialogDescription: ({ children }: any) => <div>{children}</div>,
  DialogFooter: ({ children }: any) => <div>{children}</div>,
}));

vi.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: ({ children }: any) => <div>{children}</div>,
}));

vi.mock("@/components/ui/image-upload", () => ({
  __esModule: true,
  default: ({ onChange }: any) => (
    <button
      type="button"
      data-testid="mock-image-upload"
      onClick={() => onChange?.("data:mock")}
    >
      Upload mock
    </button>
  ),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("lucide-react", () => ({
  FileText: () => null,
  CreditCard: () => null,
  BookOpen: () => null,
  Mail: () => null,
  Clock: () => null,
  RefreshCw: () => null,
  History: () => null,
  FileSignature: () => null,
  Trash2: () => null,
  Download: () => null,
  Layers: () => null,
  ShieldCheck: () => null,
  UploadCloud: () => null,
  Sparkles: () => null,
  AlertTriangle: () => null,
}));

vi.mock("@/lib/http", () => httpMock);

vi.mock("@/lib/pdf", () => ({
  buildAndEncodePdf: vi.fn(async () => ({ pdfBlob: new Blob(), pdfUrl: "blob:mock" })),
  controllerNumber: vi.fn(() => "DOC-TEST"),
}));

vi.mock("@/lib/brand", () => ({
  getBrand: () => ({ name: "Test Brand" }),
}));

const createSuccessResponse = <T,>(data: T) => ({
  ok: true as const,
  status: 200,
  data,
  headers: new Headers(),
});

describe("DocumentsPage", () => {
  beforeEach(() => {
    httpMock.apiGet.mockReset();
    httpMock.apiPost.mockReset();
    httpMock.apiPut.mockReset();
    httpMock.apiDelete.mockReset();
    queryClient.clear();
  });

  it("handles empty categories using sentinels without runtime errors", async () => {
    const documentsFixture: GenericDocument[] = [
      {
        id: "doc-1",
        employeeId: null,
        title: "Missing Category",
        description: null,
        documentUrl: "https://example.com/doc.pdf",
        category: "",
        tags: "",
        referenceNumber: null,
        controllerNumber: null,
        expiryDate: null,
        alertDays: null,
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
      } as GenericDocument,
    ];

    const documentCalls: string[] = [];

    httpMock.apiGet.mockImplementation(async (url: string) => {
      if (url.startsWith("/api/documents")) {
        documentCalls.push(url);
        return createSuccessResponse(documentsFixture);
      }
      if (url.startsWith("/api/employees")) {
        return createSuccessResponse([]);
      }
      if (url.startsWith("/api/documents/expiry-check")) {
        return createSuccessResponse([]);
      }
      return createSuccessResponse({});
    });

    httpMock.apiPost.mockResolvedValue(createSuccessResponse({}));
    httpMock.apiDelete.mockResolvedValue(createSuccessResponse({ success: true }));

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <QueryClientProvider client={queryClient}>
        <DocumentsPage />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByText("Uncategorized")).toBeInTheDocument());

    const initialDocumentCalls = documentCalls.length;

    fireEvent.click(screen.getByText("Uncategorized"));

    await waitFor(() => {
      expect(documentCalls.length).toBeGreaterThan(initialDocumentCalls);
    });

    const allCategoriesOption = document.querySelector(
      '[data-value="__all_categories__"][role="option"]',
    ) as HTMLElement | null;

    expect(allCategoriesOption).not.toBeNull();
    if (allCategoriesOption) {
      fireEvent.click(allCategoriesOption);
    }

    await waitFor(() => {
      const categorySelect = document.querySelector(
        '[data-select-root][data-value="__all_categories__"]',
      );
      expect(categorySelect).not.toBeNull();
    });

    expect(documentCalls.every((url) => !url.includes("category="))).toBe(true);
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("updates employee expiry information after replacing an expired document", async () => {
    const employeesFixture = [
      {
        id: "emp-1",
        firstName: "Alice",
        lastName: "Smith",
      },
    ];

    const expiredChecks = [
      {
        employeeId: "emp-1",
        employeeName: "Alice Smith",
        email: "alice@example.com",
        companyId: null,
        visa: {
          number: "V-123",
          expiryDate: "2020-01-01",
          alertDays: 30,
          daysUntilExpiry: -1,
        },
      },
    ];

    let expiryCall = 0;

    httpMock.apiGet.mockImplementation(async (url: string) => {
      if (url.startsWith("/api/documents/expiry-check")) {
        expiryCall += 1;
        const data = expiryCall === 1 ? expiredChecks : [];
        return createSuccessResponse(data);
      }
      if (url.startsWith("/api/documents")) {
        return createSuccessResponse([]);
      }
      if (url.startsWith("/api/employees")) {
        return createSuccessResponse(employeesFixture);
      }
      return createSuccessResponse({});
    });

    httpMock.apiPost.mockImplementation(async (url: string) => {
      if (url === "/api/documents") {
        return createSuccessResponse({ id: "doc-new" } as GenericDocument);
      }
      return createSuccessResponse({});
    });

    httpMock.apiPut.mockResolvedValue(createSuccessResponse({ id: "emp-1" }));

    render(
      <QueryClientProvider client={queryClient}>
        <DocumentsPage showExpiryOnly expiredOnly />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(expiryCall).toBeGreaterThan(0));

    await waitFor(() =>
      expect(
        screen.getAllByRole("button", {
          name: /upload replacement/i,
        }).length,
      ).toBeGreaterThan(0),
    );

    const replaceButtons = screen.getAllByRole("button", {
      name: /upload replacement/i,
    });
    expect(replaceButtons.length).toBeGreaterThan(0);
    fireEvent.click(replaceButtons[0]);

    const expiryInput = document.getElementById("replacement-expiry") as HTMLInputElement | null;
    expect(expiryInput).not.toBeNull();
    if (expiryInput) {
      fireEvent.change(expiryInput, { target: { value: "2030-01-01" } });
    }

    const alertInput = document.getElementById("replacement-alert") as HTMLInputElement | null;
    expect(alertInput).not.toBeNull();
    if (alertInput) {
      fireEvent.change(alertInput, { target: { value: "45" } });
    }

    const replacementTitleInput = document.getElementById("replacement-title");
    expect(replacementTitleInput).not.toBeNull();
    const replacementForm = replacementTitleInput?.closest("form");
    expect(replacementForm).not.toBeNull();
    if (replacementForm) {
      fireEvent.click(within(replacementForm).getByTestId("mock-image-upload"));
    }

    const submitButton = screen.getByRole("button", {
      name: /save replacement/i,
    });
    fireEvent.click(submitButton);

    await waitFor(() =>
      expect(httpMock.apiPut).toHaveBeenCalledWith(
        "/api/employees/emp-1",
        expect.objectContaining({
          visaExpiryDate: "2030-01-01",
          visaNumber: "V-123",
          visaAlertDays: 45,
        }),
      ),
    );

    await waitFor(() => expect(expiryCall).toBeGreaterThan(1));

    await screen.findByText(
      "No expired documents require replacement right now.",
    );
  });
});
