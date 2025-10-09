import React from "react";
import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
  vi,
} from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@testing-library/jest-dom";
import * as http from "@/lib/http";
import { defaultQueryFn } from "@/lib/queryClient";
import Chatbot from "./chatbot";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        "chatbot.intents.monthlySummary": "Monthly summary",
        "chatbot.selectAction": "Select action",
        "errors.monthlySummaryForbidden": "You do not have access to this employee",
        "errors.general": "An unexpected error occurred",
      } as Record<string, string>)[key] || key,
  }),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: any) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock("@/components/ui/input", () => ({
  Input: (props: any) => <input {...props} />,
}));
vi.mock("@/components/ui/select", () => {
  const React = require("react") as typeof import("react");
  const SelectContext = React.createContext<{
    onValueChange?: (value: string) => void;
  }>({});

  const Select = ({ children, onValueChange, value }: any) => (
    <SelectContext.Provider value={{ onValueChange }}>
      <div data-value={value}>{children}</div>
    </SelectContext.Provider>
  );

  const SelectContent = ({ children }: any) => <div>{children}</div>;
  const SelectTrigger = ({ children }: any) => <div>{children}</div>;
  const SelectValue = ({ placeholder }: any) => <span>{placeholder}</span>;
  const SelectItem = ({ children, value }: any) => {
    const ctx = React.useContext(SelectContext);
    return (
      <div data-value={value} onClick={() => ctx.onValueChange?.(value)}>
        {children}
      </div>
    );
  };

  return { Select, SelectContent, SelectTrigger, SelectValue, SelectItem };
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
  CardContent: ({ children }: any) => <div>{children}</div>,
  CardDescription: ({ children }: any) => <div>{children}</div>,
  CardTitle: ({ children }: any) => <div>{children}</div>,
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: any) => <span>{children}</span>,
}));

vi.mock("@/components/ui/textarea", () => ({
  Textarea: (props: any) => <textarea {...props} />,
}));

vi.mock("@/components/ui/label", () => ({
  Label: ({ children, htmlFor }: any) => <label htmlFor={htmlFor}>{children}</label>,
}));

vi.mock("@/components/ui/image-upload", () => ({
  __esModule: true,
  default: () => null,
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("lucide-react", () => ({
  Loader2: () => null,
  Plus: () => null,
}));
const apiGet = vi.spyOn(http, "apiGet");

const employeesFixture = [
  { id: "1", firstName: "Alice", lastName: "Smith" },
];

const createSuccessResponse = <T,>(data: T) => ({
  ok: true as const,
  status: 200,
  data,
  headers: new Headers(),
});

const collectionEndpoints = new Set([
  "/api/assets",
  "/api/asset-assignments",
  "/api/vacations",
  "/api/cars",
  "/api/car-assignments",
  "/api/employee-events",
]);

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        queryFn: defaultQueryFn,
        retry: false,
        refetchOnWindowFocus: false,
        staleTime: Infinity,
      },
      mutations: {
        retry: false,
      },
    },
  });
describe("Chatbot monthly summary", () => {
  let client: QueryClient;

  const renderWithClient = () =>
    render(
      <QueryClientProvider client={client}>
        <Chatbot />
      </QueryClientProvider>,
    );

  beforeAll(() => {
    if (!window.matchMedia) {
      Object.defineProperty(window, "matchMedia", {
        writable: true,
        value: vi.fn().mockImplementation((query: string) => ({
          matches: false,
          media: query,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          addListener: vi.fn(),
          removeListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
      });
    }

    if (typeof window.ResizeObserver === "undefined") {
      class ResizeObserverMock {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
      (window as any).ResizeObserver = ResizeObserverMock;
    }
  });

  beforeEach(() => {
    client = createTestQueryClient();
    apiGet.mockReset();
    client.setQueryData(["/api/employees"], employeesFixture);
    apiGet.mockImplementation(async (url: string) => {
      if (url === "/api/employees") {
        return createSuccessResponse(employeesFixture);
      }
      if (collectionEndpoints.has(url)) {
        return createSuccessResponse<any[]>([]);
      }
      throw new Error(`Unhandled apiGet request for ${url}`);
    });
  });

  afterEach(async () => {
    apiGet.mockReset();
    await client.cancelQueries();
    client.clear();
  });

  afterAll(() => {
    apiGet.mockRestore();
  });
  it("renders monthly summary when selected", async () => {
    renderWithClient();

    fireEvent.click(screen.getByText("Alice Smith"));
    fireEvent.click(screen.getByText("Monthly summary"));

    apiGet.mockResolvedValueOnce(
      createSuccessResponse({
        payroll: { gross: 1000, net: 900 },
        loanBalance: 100,
        events: [],
      }),
    );

    fireEvent.click(screen.getByText("Send"));

    expect(
      await screen.findByText(
        "Gross: 1000, Net: 900, Loan balance: 100. Events: No events.",
      ),
    ).toBeInTheDocument();
  });
  it("handles no data response", async () => {
    renderWithClient();

    fireEvent.click(screen.getByText("Alice Smith"));
    fireEvent.click(screen.getByText("Monthly summary"));

    apiGet.mockResolvedValueOnce(
      createSuccessResponse({
        payroll: { gross: 0, net: 0 },
        loanBalance: 0,
        events: [],
      }),
    );

    fireEvent.click(screen.getByText("Send"));

    expect(
      await screen.findByText(
        "Gross: 0, Net: 0, Loan balance: 0. Events: No events.",
      ),
    ).toBeInTheDocument();
  });
  it("shows localized error when unauthorized", async () => {
    renderWithClient();

    fireEvent.click(screen.getByText("Alice Smith"));
    fireEvent.click(screen.getByText("Monthly summary"));

    apiGet.mockResolvedValueOnce({
      ok: false,
      status: 403,
      error: { error: { code: "monthlySummaryForbidden" } },
      headers: new Headers(),
    } as any);

    fireEvent.click(screen.getByText("Send"));

    expect(
      await screen.findByText("You do not have access to this employee"),
    ).toBeInTheDocument();
  });
});

