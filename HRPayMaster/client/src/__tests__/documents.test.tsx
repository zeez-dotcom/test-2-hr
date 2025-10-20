import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  render,
  screen,
  waitFor,
  fireEvent,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@testing-library/jest-dom";
import DocumentsPage from "@/pages/documents";
import type { GenericDocument } from "@shared/schema";

const httpMock = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
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
  default: () => null,
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
    httpMock.apiDelete.mockReset();
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
        createdAt: new Date(),
      } satisfies GenericDocument,
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

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

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
});
