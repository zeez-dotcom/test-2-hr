import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import Chatbot from "@/components/chatbot/chatbot";

const httpMock = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
}));

const useQueryMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/http", () => httpMock);

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: any) => useQueryMock(options),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? "",
  }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick, type = "button", ...props }: any) => (
    <button type={type} onClick={onClick} {...props}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/input", () => ({
  Input: ({ onChange, ...props }: any) => <input onChange={onChange} {...props} />,
}));

vi.mock("@/components/ui/textarea", () => ({
  Textarea: ({ onChange, ...props }: any) => <textarea onChange={onChange} {...props} />,
}));

vi.mock("@/components/ui/select", () => {
  const React = require("react") as typeof import("react");
  const SelectContext = React.createContext<{ value?: string; onValueChange?: (value: string) => void }>({});

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
      <div role="option" data-value={value} onClick={() => ctx.onValueChange?.(value)}>
        {children}
      </div>
    );
  };

  return { Select, SelectTrigger, SelectContent, SelectValue, SelectItem };
});

vi.mock("@/components/ui/tabs", () => {
  const React = require("react") as typeof import("react");
  const TabsContext = React.createContext<{ value?: string; onValueChange?: (value: string) => void }>({});

  const Tabs = ({ children, value, onValueChange }: any) => (
    <TabsContext.Provider value={{ value, onValueChange }}>
      <div data-tabs-root data-value={value}>{children}</div>
    </TabsContext.Provider>
  );
  const TabsList = ({ children }: any) => <div>{children}</div>;
  const TabsTrigger = ({ children, value, onClick }: any) => {
    const ctx = React.useContext(TabsContext);
    const handleClick = () => {
      ctx.onValueChange?.(value);
      onClick?.(value);
    };
    return (
      <button type="button" onClick={handleClick}>
        {children}
      </button>
    );
  };
  const TabsContent = ({ children, value }: any) => {
    const ctx = React.useContext(TabsContext);
    if (ctx.value !== value) return null;
    return <div>{children}</div>;
  };

  return { Tabs, TabsList, TabsTrigger, TabsContent };
});

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
  default: ({ onChange, label = "Upload" }: any) => (
    <button type="button" onClick={() => onChange?.("data:mock")}>{label}</button>
  ),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@/lib/utils", () => ({
  getNewTabRel: () => "noopener",
}));

vi.mock("@/lib/pdf", () => ({
  buildBilingualActionReceipt: vi.fn(),
  buildAndEncodePdf: vi.fn(async () => ({ pdfBlob: new Blob(), pdfUrl: "blob:mock" })),
}));

vi.mock("lucide-react", () => ({
  AlertCircle: () => null,
  Loader2: () => null,
  Plus: () => null,
  Sparkles: () => null,
}));

vi.stubGlobal("WebSocket", vi.fn(() => ({
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  close: vi.fn(),
  readyState: 1,
  send: vi.fn(),
})));

const createSuccess = <T,>(data: T) => ({
  ok: true as const,
  status: 200,
  data,
  headers: new Headers(),
});

describe("Chatbot document drawer", () => {
  beforeEach(() => {
    httpMock.apiGet.mockReset();
    httpMock.apiPost.mockReset();
    httpMock.apiPut.mockReset();
    useQueryMock.mockReset();
  });

  const renderDrawer = async () => {
    const documents = [
      {
        id: "doc-1",
        title: "Passport",
        description: "Employee passport",
        documentUrl: "https://example.com/passport.pdf",
        category: "passport",
        tags: "travel",
        createdAt: new Date().toISOString(),
        expiryDate: "2030-01-01",
        alertDays: 30,
        employeeId: null,
        version: 1,
      },
    ];

    httpMock.apiPost.mockResolvedValue(createSuccess({}));
    httpMock.apiPut.mockResolvedValue(createSuccess({}));

    useQueryMock.mockImplementation(({ queryKey, enabled }: any) => {
      if (enabled === false) {
        return { data: [], isFetching: false, refetch: vi.fn() };
      }
      const key = Array.isArray(queryKey) ? queryKey.join("|") : String(queryKey);
      switch (key) {
        case "/api/employees":
        case "/api/assets":
        case "/api/asset-assignments":
        case "/api/vacations":
        case "/api/cars":
        case "/api/car-assignments":
          return { data: [], isFetching: false, refetch: vi.fn() };
        case "/api/documents":
          return { data: documents, isFetching: false, refetch: vi.fn() };
        case "/api/documents|doc-1|versions":
          return {
            data: [
              { id: "doc-1", version: 1, isLatest: true, createdAt: new Date().toISOString() },
            ],
            isFetching: false,
            refetch: vi.fn(),
          };
        default:
          return { data: [], isFetching: false, refetch: vi.fn() };
      }
    });

    render(<Chatbot initialTab="drawer" initialDocuments={documents} />);

    await screen.findByText("Passport");

  };

  it("renders history and replace actions for document cards", async () => {
    await renderDrawer();

    expect(screen.getByRole("button", { name: /history/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /replace/i })).toBeInTheDocument();
  });

  it("submits a new history version", async () => {
    await renderDrawer();

    fireEvent.click(screen.getByRole("button", { name: /history/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/metadata/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/metadata/i), {
      target: { value: "{\"note\":\"updated\"}" },
    });

    fireEvent.click(screen.getByRole("button", { name: /upload file/i }));

    fireEvent.click(screen.getByRole("button", { name: /save new version/i }));

    await waitFor(() => {
      expect(httpMock.apiPut).toHaveBeenCalledWith("/api/documents/doc-1", expect.any(Object));
    });

    await waitFor(() => {
      expect(httpMock.apiPost).toHaveBeenCalledWith("/api/documents/doc-1/versions", expect.objectContaining({
        pdfDataUrl: "data:mock",
      }));
    });
  });

  it("updates document metadata with a replacement upload", async () => {
    await renderDrawer();

    fireEvent.click(screen.getByRole("button", { name: /replace/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /upload replacement/i })).toBeInTheDocument();
    });

    const [, editTitleInput] = screen.getAllByLabelText(/title/i);
    fireEvent.change(editTitleInput, { target: { value: "Passport Renewed" } });

    const expiryInputs = screen.getAllByLabelText(/expiry date/i);
    fireEvent.change(expiryInputs[expiryInputs.length - 1], { target: { value: "2031-05-01" } });

    const alertInputs = screen.getAllByLabelText(/alert days/i);
    fireEvent.change(alertInputs[alertInputs.length - 1], { target: { value: "15" } });
    fireEvent.click(screen.getByRole("button", { name: /upload replacement/i }));

    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(httpMock.apiPut).toHaveBeenCalledWith(
        "/api/documents/doc-1",
        expect.objectContaining({
          title: "Passport Renewed",
          expiryDate: "2031-05-01",
          alertDays: 15,
        }),
      );
    });

    await waitFor(() => {
      expect(httpMock.apiPost).toHaveBeenCalledWith(
        "/api/documents/doc-1/versions",
        expect.objectContaining({ pdfDataUrl: "data:mock" }),
      );
    });
  });
});
