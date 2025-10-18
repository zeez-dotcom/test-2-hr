import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import ImageUpload from "@/components/ui/image-upload";
import { useToast } from "@/hooks/use-toast";
import { toastApiError } from "@/lib/toastError";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/http";
import { queryClient } from "@/lib/queryClient";
import { defaultTemplates, type TemplateKey } from "@/lib/default-templates";
import { buildAndEncodePdf, controllerNumber } from "@/lib/pdf";
import { getBrand } from "@/lib/brand";
import { sanitizeImageSrc } from "@/lib/sanitizeImageSrc";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  FileText,
  CreditCard,
  BookOpen,
  Building,
  Mail,
  Clock,
  RefreshCw,
  History,
  FileSignature,
  Trash2,
  Download,
  Layers,
  ShieldCheck,
  UploadCloud,
  Sparkles,
} from "lucide-react";
import type {
  DocumentExpiryCheck,
  GenericDocument,
  DocumentSignatureStatus,
} from "@shared/schema";
import { documentSignatureStatusSchema } from "@shared/schema";

const signatureStatusOptions = [
  "all",
  ...documentSignatureStatusSchema.options,
] as const;

const ALL_CATEGORIES_VALUE = "__all_categories__";
const UNCATEGORIZED_CATEGORY_VALUE = "__uncategorized__";
const ALL_TAGS_VALUE = "__all_tags__";
const UNTAGGED_TAG_VALUE = "__untagged__";
const ALL_EMPLOYEES_VALUE = "__all_employees__";
const NO_EMPLOYEE_VALUE = "__no_employee__";

const isSignatureStatusOption = (
  value: string,
): value is (typeof signatureStatusOptions)[number] =>
  (signatureStatusOptions as readonly string[]).includes(value);

const signatureBadgeStyles: Record<string, string> = {
  not_requested: "bg-slate-100 text-slate-700 border-slate-200",
  draft: "bg-purple-100 text-purple-800 border-purple-200",
  sent: "bg-blue-100 text-blue-800 border-blue-200",
  viewed: "bg-indigo-100 text-indigo-800 border-indigo-200",
  completed: "bg-green-100 text-green-800 border-green-200",
  declined: "bg-red-100 text-red-800 border-red-200",
  voided: "bg-gray-100 text-gray-700 border-gray-200",
  error: "bg-rose-100 text-rose-800 border-rose-200",
};

const splitTags = (value?: string | null): string[] =>
  value ? value.split(",").map(tag => tag.trim()).filter(Boolean) : [];

const trackedReplacementCategories = new Set([
  "visa",
  "civil_id",
  "passport",
  "driving_license",
  "company_license",
]);

const formatStatus = (status?: string | null) =>
  (status ?? "not_requested")
    .replace(/_/g, " ")
    .replace(/\b\w/g, match => match.toUpperCase());

const safeParseJson = (
  value: string,
  onError: (message: string) => void,
): Record<string, unknown> | undefined => {
  if (!value.trim()) return undefined;
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    onError("Invalid JSON metadata");
    return undefined;
  }
};

const applyTemplate = (template: string, replacements: Record<string, string>) =>
  Object.entries(replacements).reduce(
    (acc, [key, value]) => acc.split(key).join(value ?? ""),
    template,
  );

const buildTemplateDocument = (
  templateKey: TemplateKey,
  employee: Record<string, any> | undefined,
  context: {
    purpose?: string;
    startDate?: string;
    endDate?: string;
    docNumber: string;
  },
) => {
  const template = defaultTemplates[templateKey];
  const brand = getBrand();
  const now = new Date();
  const replacements: Record<string, string> = {
    "{{name}}": `${employee?.firstName ?? ""} ${employee?.lastName ?? ""}`.trim(),
    "{{employeeId}}": employee?.employeeCode ?? employee?.id ?? "",
    "{{position}}": employee?.position ?? "",
    "{{companyName}}": brand.name ?? "Company",
    "{{salary}}": employee?.salary ? String(employee.salary) : "",
    "{{date}}": now.toLocaleDateString(),
    "{{purpose}}": context.purpose ?? "",
    "{{startDate}}": context.startDate ?? "",
    "{{endDate}}": context.endDate ?? "",
  };

  const english = applyTemplate(template.en ?? "", replacements);
  const arabic = applyTemplate(template.ar ?? "", replacements);

  const headerColumns: any[] = [];
  if (brand.logo) {
    headerColumns.push({
      image: sanitizeImageSrc(brand.logo),
      width: 72,
      margin: [0, 0, 12, 0],
    });
  }
  headerColumns.push({ text: brand.name ?? "HRPayMaster", style: "title" });

  const content: any[] = [
    { columns: headerColumns, columnGap: 16 },
    {
      text: `Document No: ${context.docNumber}`,
      alignment: "right",
      margin: [0, 8, 0, 2],
      style: "muted",
    },
    {
      text: `Date: ${now.toLocaleString()}`,
      alignment: "right",
      margin: [0, 0, 0, 12],
      style: "muted",
    },
  ];

  if (employee) {
    const fullName = `${employee.firstName ?? ""} ${employee.lastName ?? ""}`.trim() ||
      employee.name ||
      employee.employeeCode ||
      employee.id ||
      "";
    const position = employee.position ?? "";
    const idLine = employee.employeeCode ?? employee.id ?? "";
    content.push({
      columns: [
        {
          stack: [
            { text: fullName || "-", style: "employeeName" },
            {
              text: [position, idLine].filter(Boolean).join(" • "),
              style: "muted",
            },
          ],
        },
      ],
      margin: [0, 0, 0, 16],
    });
  }

  content.push({
    columns: [
      {
        text: english || "-",
        style: "latin",
      },
      {
        text: arabic || "-",
        alignment: "right",
        style: "arabic",
      },
    ],
    columnGap: 24,
  });

  const signatureRoles = Object.entries(template.sigs ?? {})
    .filter(([, enabled]) => enabled)
    .map(([role]) => role.toUpperCase());

  if (signatureRoles.length) {
    content.push({ text: "Signatures", style: "section", margin: [0, 16, 0, 8] });
    content.push({
      columns: signatureRoles.map((role) => ({
        width: "*",
        stack: [
          { text: role, style: "muted", margin: [0, 0, 0, 12] },
          {
            canvas: [
              {
                type: "line",
                x1: 0,
                y1: 0,
                x2: 180,
                y2: 0,
                lineWidth: 1,
              },
            ],
          },
        ],
      })),
      columnGap: 16,
    });
  }

  const primaryColor = brand.primaryColor ?? "#0F172A";

  return {
    docDefinition: {
      info: { title: template.title },
      content,
      styles: {
        title: { fontSize: 18, bold: true, color: primaryColor, font: "Amiri" },
        employeeName: { fontSize: 14, bold: true, color: primaryColor, font: "Inter" },
        muted: { fontSize: 9, color: "#64748B", font: "Inter" },
        latin: { fontSize: 11, color: "#111827", font: "Inter" },
        arabic: { fontSize: 11, color: "#111827", font: "Amiri" },
        section: { fontSize: 12, bold: true, color: primaryColor, font: "Inter" },
      },
      defaultStyle: { font: "Inter", fontSize: 10, color: "#111827" },
    },
  };
};

const invalidateDocuments = () =>
  queryClient.invalidateQueries({
    predicate: (query) =>
      Array.isArray(query.queryKey) && query.queryKey[0] === "/api/documents",
  });

type DocumentsPageProps = {
  initialTab?: "library" | "expiry";
  showExpiryOnly?: boolean;
  expiredOnly?: boolean;
};

type ReplacementContext = {
  employeeId: string | null;
  employeeName: string;
  companyId: string | null;
  cardType: string;
  cardTitle: string;
  number?: string | null;
  expiryDate?: string;
  alertDays?: number;
};

const NEW_DOCUMENT_VALUE = "__new_replacement__";

export default function DocumentsPage({
  initialTab = "library",
  showExpiryOnly = false,
  expiredOnly = false,
}: DocumentsPageProps) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<string>(initialTab);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>(ALL_CATEGORIES_VALUE);
  const [tagFilter, setTagFilter] = useState<string>(ALL_TAGS_VALUE);
  const [signatureFilter, setSignatureFilter] = useState<(typeof signatureStatusOptions)[number]>("all");

  const handleCategoryFilterChange = (value: string) => {
    setCategoryFilter(value && value.trim() ? value : ALL_CATEGORIES_VALUE);
  };

  const handleTagFilterChange = (value: string) => {
    setTagFilter(value && value.trim() ? value : ALL_TAGS_VALUE);
  };

  const handleSignatureFilterChange = (value: string) => {
    if (isSignatureStatusOption(value)) {
      setSignatureFilter(value);
    } else {
      setSignatureFilter("all");
    }
  };
  const [employeeFilter, setEmployeeFilter] = useState<string>(ALL_EMPLOYEES_VALUE);
  const [latestOnly, setLatestOnly] = useState(true);

  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadDescription, setUploadDescription] = useState("");
  const [uploadCategory, setUploadCategory] = useState("");
  const [uploadTags, setUploadTags] = useState("");
  const [uploadReference, setUploadReference] = useState("");
  const [uploadController, setUploadController] = useState("");
  const [uploadExpiry, setUploadExpiry] = useState("");
  const [uploadAlertDays, setUploadAlertDays] = useState("");
  const [uploadEmployeeId, setUploadEmployeeId] = useState<string>(NO_EMPLOYEE_VALUE);
  const [uploadMetadata, setUploadMetadata] = useState("");
  const [uploadDataUrl, setUploadDataUrl] = useState<string | undefined>();

  const [replacementContext, setReplacementContext] = useState<ReplacementContext | null>(null);
  const [replacementTitle, setReplacementTitle] = useState("");
  const [replacementDescription, setReplacementDescription] = useState("");
  const [replacementExpiryDate, setReplacementExpiryDate] = useState("");
  const [replacementAlertDays, setReplacementAlertDays] = useState("");
  const [replacementDocumentId, setReplacementDocumentId] = useState<string>(NEW_DOCUMENT_VALUE);
  const [replacementDataUrl, setReplacementDataUrl] = useState<string | undefined>();

  const [templateKey, setTemplateKey] = useState<TemplateKey>("noc");
  const [templateEmployeeId, setTemplateEmployeeId] = useState("");
  const [templatePurpose, setTemplatePurpose] = useState("");
  const [templateStartDate, setTemplateStartDate] = useState("");
  const [templateEndDate, setTemplateEndDate] = useState("");
  const [templateCategory, setTemplateCategory] = useState("letters");
  const [templateTags, setTemplateTags] = useState("template,auto");
  const [templateMetadata, setTemplateMetadata] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  const [templateSendSignature, setTemplateSendSignature] = useState(false);
  const [templateRecipientEmail, setTemplateRecipientEmail] = useState("");
  const [templateProvider, setTemplateProvider] = useState("docusign");

  const [historyDoc, setHistoryDoc] = useState<GenericDocument | null>(null);
  const [historyMetadata, setHistoryMetadata] = useState("");
  const [historyTitle, setHistoryTitle] = useState("");
  const [historyDescription, setHistoryDescription] = useState("");
  const [historyDataUrl, setHistoryDataUrl] = useState<string | undefined>();

  const [signatureDoc, setSignatureDoc] = useState<GenericDocument | null>(null);
  const [signatureProvider, setSignatureProvider] = useState("docusign");
  const [signatureEmail, setSignatureEmail] = useState("");
  const [signatureStatus, setSignatureStatus] = useState<DocumentSignatureStatus>("sent");
  const [signatureRequestedAt, setSignatureRequestedAt] = useState("");
  const [signatureMetadata, setSignatureMetadata] = useState("");

  const { data: employees = [] } = useQuery<any[]>({ queryKey: ["/api/employees"] });

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (!templateEmployeeId) return;
    const employee = employees.find((emp: any) => emp.id === templateEmployeeId);
    if (employee?.email) {
      setTemplateRecipientEmail(employee.email);
    }
  }, [templateEmployeeId, employees]);

  const documentsQuery = useQuery<GenericDocument[]>({
    queryKey: [
      "/api/documents",
      search,
      categoryFilter,
      tagFilter,
      signatureFilter,
      employeeFilter,
      latestOnly ? "1" : "0",
    ],
    queryFn: async ({ queryKey }) => {
      const [_, searchValue, category, tags, signature, employeeId, latestFlag] =
        queryKey as [
          string,
          string,
          string,
          string,
          (typeof signatureStatusOptions)[number],
          string,
          string,
        ];
      const params = new URLSearchParams();
      if (searchValue) params.set("search", searchValue);
      const normalizeCategoryFilterValue = (value: string): string | undefined => {
        if (
          value === ALL_CATEGORIES_VALUE ||
          value === UNCATEGORIZED_CATEGORY_VALUE ||
          !value.trim()
        ) {
          return undefined;
        }
        return value;
      };

      const normalizeTagFilterValue = (value: string): string | undefined => {
        if (value === ALL_TAGS_VALUE || value === UNTAGGED_TAG_VALUE || !value.trim()) {
          return undefined;
        }
        return value;
      };

      const categoryParam = normalizeCategoryFilterValue(category);
      const tagsParam = normalizeTagFilterValue(tags);
      const employeeParam = employeeId === ALL_EMPLOYEES_VALUE ? "" : employeeId;
      if (categoryParam) params.set("category", categoryParam);
      if (tagsParam) params.set("tags", tagsParam);
      if (signature && signature !== "all") params.set("signatureStatus", signature);
      if (employeeParam) params.set("employeeId", employeeParam);
      if (latestFlag !== "1") params.set("latestOnly", "0");
      const url = `/api/documents${params.toString() ? `?${params.toString()}` : ""}`;
      const res = await apiGet(url);
      if (!res.ok) throw res;
      return res.data as GenericDocument[];
    },
  });

  const { data: expiryChecks = [], isLoading: expiryLoading, error: expiryError } =
    useQuery<DocumentExpiryCheck[]>({ queryKey: ["/api/documents/expiry-check"] });

  const sendAlertsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiPost("/api/documents/send-alerts");
      if (!res.ok) throw res;
      return res.data as any;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents/expiry-check"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      toast({
        title: t("documents.alertsSent", "Alerts sent successfully"),
        description: `${t("documents.generated", "Generated")} ${data.alertsGenerated ?? 0} ${t(
          "documents.alerts",
          "alerts",
        )}, ${t("documents.sent", "sent")} ${data.emailsSent ?? 0} ${t(
          "documents.emails",
          "emails",
        )}`,
      });
    },
    onError: (error) => {
      toastApiError(error, t("documents.sendFailed", "Failed to send alerts"));
    },
  });

  const createDocumentMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await apiPost("/api/documents", body);
      if (!res.ok) throw res;
      return res.data as GenericDocument;
    },
    onSuccess: (doc) => {
      invalidateDocuments();
      toast({
        title: t("documents.created", "Document saved"),
        description: doc.title,
      });
    },
    onError: (error) => {
      toastApiError(error, t("documents.createFailed", "Failed to save document"));
    },
  });

  const createVersionMutation = useMutation({
    mutationFn: async ({
      id,
      body,
    }: {
      id: string;
      body: Record<string, unknown>;
    }) => {
      const res = await apiPost(`/api/documents/${id}/versions`, body);
      if (!res.ok) throw res;
      return res.data as GenericDocument;
    },
    onSuccess: (_, variables) => {
      invalidateDocuments();
      if (variables.id) {
        queryClient.invalidateQueries({ queryKey: ["/api/documents", variables.id, "versions"] });
      }
      toast({ title: t("documents.versionCreated", "New version created") });
    },
    onError: (error) => {
      toastApiError(error, t("documents.versionFailed", "Failed to create version"));
    },
  });

  const deleteDocumentMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiDelete(`/api/documents/${id}`);
      if (!res.ok) throw res;
    },
    onSuccess: () => {
      invalidateDocuments();
      toast({ title: t("documents.deleted", "Document removed") });
    },
    onError: (error) => {
      toastApiError(error, t("documents.deleteFailed", "Failed to delete document"));
    },
  });

  const sendSignatureMutation = useMutation({
    mutationFn: async ({
      id,
      body,
    }: {
      id: string;
      body: Record<string, unknown>;
    }) => {
      const res = await apiPost(`/api/documents/${id}/signature`, body);
      if (!res.ok) throw res;
      return res.data as GenericDocument;
    },
    onSuccess: (doc) => {
      invalidateDocuments();
      toast({
        title: t("documents.signatureSent", "Signature request sent"),
        description: formatStatus(doc.signatureStatus ?? "sent"),
      });
    },
    onError: (error) => {
      toastApiError(error, t("documents.signatureFailed", "Failed to update signature status"));
    },
  });

  const versionsQuery = useQuery<GenericDocument[]>({
    queryKey: historyDoc
      ? ["/api/documents", historyDoc.id, "versions"]
      : ["/api/documents", "", "versions"],
    enabled: Boolean(historyDoc),
    queryFn: async ({ queryKey }) => {
      const [, docId] = queryKey as [string, string, string];
      if (!docId) return [];
      const res = await apiGet(`/api/documents/${docId}/versions`);
      if (!res.ok) throw res;
      return res.data as GenericDocument[];
    },
  });

  useEffect(() => {
    if (historyDoc) {
      setHistoryTitle(historyDoc.title);
      setHistoryDescription(historyDoc.description ?? "");
      setHistoryMetadata(
        historyDoc.metadata ? JSON.stringify(historyDoc.metadata, null, 2) : "",
      );
      setHistoryDataUrl(undefined);
    }
  }, [historyDoc]);

  useEffect(() => {
    if (!signatureDoc) return;
    setSignatureProvider(signatureDoc.signatureProvider ?? "docusign");
    setSignatureEmail(signatureDoc.signatureRecipientEmail ?? "");
    setSignatureStatus((signatureDoc.signatureStatus as DocumentSignatureStatus) ?? "sent");
    setSignatureRequestedAt(
      signatureDoc.signatureRequestedAt
        ? String(signatureDoc.signatureRequestedAt).split("Z")[0]
        : "",
    );
    setSignatureMetadata(
      signatureDoc.signatureMetadata ? JSON.stringify(signatureDoc.signatureMetadata, null, 2) : "",
    );
  }, [signatureDoc]);

  const documents = documentsQuery.data ?? [];
  const employeeMap = useMemo(() => {
    const entries = employees?.map((emp: any) => [emp.id, emp]) ?? [];
    return new Map(entries as [string, any][]);
  }, [employees]);

  const documentsByEmployee = useMemo(() => {
    const map = new Map<string, GenericDocument[]>();
    for (const doc of documents) {
      if (!doc.employeeId) continue;
      const list = map.get(doc.employeeId) ?? [];
      list.push(doc);
      map.set(doc.employeeId, list);
    }
    return map;
  }, [documents]);

  const findMatchingDocument = (
    ownerId: string | null | undefined,
    card: { type: string; number?: string | null; title: string },
  ): GenericDocument | undefined => {
    const normalizedTitle = card.title.toLowerCase();

    if (card.type === "company_license") {
      return documents.find((doc) => {
        const matchesNumber = card.number
          ? doc.referenceNumber === card.number || doc.controllerNumber === card.number
          : false;
        const matchesCategory = (doc.category ?? "").toLowerCase() === card.type;
        const matchesTitle = doc.title.toLowerCase().includes(normalizedTitle);
        return matchesNumber || matchesCategory || matchesTitle;
      });
    }

    if (!ownerId) return undefined;
    const docs = documentsByEmployee.get(ownerId) ?? [];
    return docs.find((doc) => {
      const matchesNumber = card.number
        ? doc.referenceNumber === card.number || doc.controllerNumber === card.number
        : false;
      const matchesCategory = (doc.category ?? "").toLowerCase() === card.type;
      const matchesTitle = doc.title.toLowerCase().includes(normalizedTitle);
      return matchesNumber || matchesCategory || matchesTitle;
    });
  };

  const uniqueCategories = useMemo(() => {
    const set = new Set<string>();
    for (const doc of documents) {
      const rawCategory = typeof doc.category === "string" ? doc.category.trim() : "";
      if (rawCategory) {
        set.add(rawCategory);
      } else if (doc.category !== undefined) {
        set.add(UNCATEGORIZED_CATEGORY_VALUE);
      }
    }
    return Array.from(set).sort();
  }, [documents]);

  const uniqueTags = useMemo(() => {
    const set = new Set<string>();
    for (const doc of documents) {
      const tags = splitTags(doc.tags);
      if (tags.length) {
        for (const tag of tags) {
          const trimmedTag = tag.trim();
          set.add(trimmedTag.length ? trimmedTag : UNTAGGED_TAG_VALUE);
        }
      } else if (doc.tags !== undefined) {
        const rawTag = typeof doc.tags === "string" ? doc.tags.trim() : "";
        if (!rawTag.length) {
          set.add(UNTAGGED_TAG_VALUE);
        }
      }
    }
    return Array.from(set).sort();
  }, [documents]);

  const handleUploadSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!uploadDataUrl) {
      toast({
        title: t("documents.missingFile", "Attach a document to upload"),
        variant: "destructive",
      });
      return;
    }
    const metadataObject = safeParseJson(uploadMetadata, (message) =>
      toast({ title: message, variant: "destructive" }),
    );
    const selectedEmployeeId =
      uploadEmployeeId === NO_EMPLOYEE_VALUE ? undefined : uploadEmployeeId;

    const payload: Record<string, unknown> = {
      title: uploadTitle,
      description: uploadDescription,
      pdfDataUrl: uploadDataUrl,
      category: uploadCategory,
      tags: uploadTags,
      referenceNumber: uploadReference,
      controllerNumber: uploadController,
      expiryDate: uploadExpiry,
      alertDays: uploadAlertDays,
      employeeId: selectedEmployeeId ?? null,
      metadata: metadataObject,
    };
    await createDocumentMutation.mutateAsync(payload);
    setUploadTitle("");
    setUploadDescription("");
    setUploadCategory("");
    setUploadTags("");
    setUploadReference("");
    setUploadController("");
    setUploadExpiry("");
    setUploadAlertDays("");
    setUploadEmployeeId(NO_EMPLOYEE_VALUE);
    setUploadMetadata("");
    setUploadDataUrl(undefined);
  };

  const handleTemplateSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!templateEmployeeId) {
      toast({
        title: t("documents.selectEmployee", "Select an employee"),
        variant: "destructive",
      });
      return;
    }
    const employee = employeeMap.get(templateEmployeeId);
    const docNumber = controllerNumber();
    const { docDefinition } = buildTemplateDocument(templateKey, employee, {
      purpose: templatePurpose,
      startDate: templateStartDate,
      endDate: templateEndDate,
      docNumber,
    });
    const pdfDataUrl = await buildAndEncodePdf(docDefinition as any);
    const metadataObject = safeParseJson(templateMetadata, (message) =>
      toast({ title: message, variant: "destructive" }),
    );
    const templateMeta = {
      ...(metadataObject ?? {}),
      templateKey,
      docNumber,
      employeeId: templateEmployeeId,
      purpose: templatePurpose,
      startDate: templateStartDate,
      endDate: templateEndDate,
      generatedAt: new Date().toISOString(),
    };

    const payload: Record<string, unknown> = {
      title: `${defaultTemplates[templateKey].title} - ${employee?.firstName ?? ""} ${
        employee?.lastName ?? ""
      }`.trim(),
      description: templateDescription,
      pdfDataUrl,
      category: templateCategory,
      tags: templateTags,
      controllerNumber: docNumber,
      employeeId: templateEmployeeId,
      generatedFromTemplateKey: templateKey,
      metadata: templateMeta,
    };

    const created = await createDocumentMutation.mutateAsync(payload);

    if (templateSendSignature && templateRecipientEmail) {
      await sendSignatureMutation.mutateAsync({
        id: created.id,
        body: {
          provider: templateProvider,
          recipientEmail: templateRecipientEmail,
          status: "sent",
          metadata: {
            templateKey,
            autoGenerated: true,
          },
        },
      });
    }

    setTemplateDescription("");
    setTemplatePurpose("");
    setTemplateMetadata("");
    setTemplateStartDate("");
    setTemplateEndDate("");
  };

  const handleVersionSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!historyDoc) return;
    if (!historyDataUrl) {
      toast({
        title: t("documents.missingFile", "Attach a document to upload"),
        variant: "destructive",
      });
      return;
    }
    const metadataObject = safeParseJson(historyMetadata, (message) =>
      toast({ title: message, variant: "destructive" }),
    );
    await createVersionMutation.mutateAsync({
      id: historyDoc.id,
      body: {
        title: historyTitle,
        description: historyDescription,
        pdfDataUrl: historyDataUrl,
        metadata: metadataObject,
      },
    });
    setHistoryDataUrl(undefined);
    setHistoryDoc(null);
  };

  const handleSignatureSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!signatureDoc) return;
    const metadataObject = safeParseJson(signatureMetadata, (message) =>
      toast({ title: message, variant: "destructive" }),
    );
    await sendSignatureMutation.mutateAsync({
      id: signatureDoc.id,
      body: {
        provider: signatureProvider,
        recipientEmail: signatureEmail,
        status: signatureStatus,
        requestedAt: signatureRequestedAt || undefined,
        metadata: metadataObject,
      },
    });
    setSignatureDoc(null);
  };
  const renderDocumentCard = (doc: GenericDocument) => {
    const tags = splitTags(doc.tags);
    const employee = doc.employeeId ? employeeMap.get(doc.employeeId) : undefined;
    const employeeName = employee
      ? `${employee.firstName ?? ""} ${employee.lastName ?? ""}`.trim() ||
        employee.name ||
        employee.employeeCode ||
        employee.id ||
        ""
      : "";
    const signatureStyle = signatureBadgeStyles[doc.signatureStatus ?? ""] ??
      signatureBadgeStyles.not_requested;
    const isTrackedReplacementCandidate = Boolean(
      doc.employeeId &&
      doc.category &&
      trackedReplacementCategories.has(doc.category),
    );

    return (
      <Card key={doc.id} className="border border-slate-200 dark:border-slate-800">
        <CardHeader className="gap-4 md:flex md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="text-xl font-semibold">{doc.title}</CardTitle>
            <CardDescription className="space-y-1">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {doc.category && (
                  <Badge variant="secondary" className="bg-slate-100 text-slate-800">
                    {doc.category}
                  </Badge>
                )}
                <Badge className={cn("border", signatureStyle)}>{formatStatus(doc.signatureStatus)}</Badge>
                {doc.isLatest && (
                  <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">
                    <ShieldCheck className="mr-1 h-3 w-3" />
                    {t("documents.latest", "Latest")}
                  </Badge>
                )}
                <Badge variant="outline">
                  <Layers className="mr-1 h-3 w-3" />
                  {t("documents.version", "Version")} {doc.version}
                </Badge>
              </div>
              <div className="text-sm text-muted-foreground">
                {employee ? (
                  <span>
                    {employee.firstName} {employee.lastName}
                    {employee.position ? ` • ${employee.position}` : ""}
                  </span>
                ) : (
                  <span>
                    {doc.employeeId
                      ? `${t("documents.employee", "Employee")}: ${doc.employeeId}`
                      : t("documents.generic", "Generic document")}
                  </span>
                )}
              </div>
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => window.open(doc.documentUrl, "_blank")}>
              <Download className="mr-1 h-4 w-4" />
              {t("documents.open", "Open")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setHistoryDoc(doc)}>
              <History className="mr-1 h-4 w-4" />
              {t("documents.history", "History")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setSignatureDoc(doc)}>
              <FileSignature className="mr-1 h-4 w-4" />
              {t("documents.signature", "Signature")}
            </Button>
            {isTrackedReplacementCandidate && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setReplacementContext({
                    employeeId: doc.employeeId ?? null,
                    employeeName,
                    companyId: employee?.companyId ?? null,
                    cardType: doc.category as string,
                    cardTitle: doc.title,
                    number: doc.referenceNumber,
                    expiryDate: doc.expiryDate ?? undefined,
                    alertDays: doc.alertDays ?? undefined,
                  });
                  setReplacementDocumentId(doc.id);
                  setReplacementTitle(doc.title ?? "");
                  setReplacementDescription(doc.description ?? "");
                  setReplacementExpiryDate(doc.expiryDate ?? "");
                  setReplacementAlertDays(
                    doc.alertDays !== null && doc.alertDays !== undefined
                      ? String(doc.alertDays)
                      : "",
                  );
                  setReplacementDataUrl(undefined);
                }}
              >
                <UploadCloud className="mr-1 h-4 w-4" />
                {t("documents.uploadReplacement", "Upload replacement")}
              </Button>
            )}
            <Button
              variant="destructive"
              size="sm"
              onClick={() => deleteDocumentMutation.mutate(doc.id)}
            >
              <Trash2 className="mr-1 h-4 w-4" />
              {t("common.delete", "Delete")}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase">
                {t("documents.documentDetails", "Document details")}
              </p>
              <p>
                {t("documents.controller", "Controller")}: {doc.controllerNumber ?? "—"}
              </p>
              <p>
                {t("documents.reference", "Reference")}: {doc.referenceNumber ?? "—"}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase">
                {t("documents.timeline", "Timeline")}
              </p>
              <p>
                {t("documents.createdAt", "Created at")}: {format(new Date(doc.createdAt as any), "PPpp")}
              </p>
              <p>
                {t("documents.expiry", "Expiry")}: {doc.expiryDate ?? "—"}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase">
                {t("documents.signatureMeta", "Signature details")}
              </p>
              <p>{t("documents.provider", "Provider")}: {doc.signatureProvider ?? "—"}</p>
              <p>{t("documents.recipient", "Recipient")}: {doc.signatureRecipientEmail ?? "—"}</p>
            </div>
          </div>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {tags.map(tag => (
                <Badge key={tag} variant="secondary">
                  #{tag}
                </Badge>
              ))}
            </div>
          )}
          {doc.metadata && Object.keys(doc.metadata).length > 0 && (
            <div>
              <p className="text-xs uppercase text-muted-foreground mb-2">
                {t("documents.metadata", "Metadata")}
              </p>
              <ScrollArea className="max-h-48 rounded border border-slate-200 dark:border-slate-800 p-3 bg-slate-50 dark:bg-slate-950">
                <pre className="text-xs whitespace-pre-wrap text-slate-700 dark:text-slate-300">
                  {JSON.stringify(doc.metadata, null, 2)}
                </pre>
              </ScrollArea>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };
  const renderExpiryTab = () => {
    const getDocumentIcon = (type: string) => {
      switch (type) {
        case "visa":
          return <FileText className="w-5 h-5 text-blue-600" />;
        case "civil_id":
          return <CreditCard className="w-5 h-5 text-green-600" />;
        case "passport":
          return <BookOpen className="w-5 h-5 text-purple-600" />;
        case "driving_license":
          return <AlertTriangle className="w-5 h-5 text-amber-600" />;
        case "company_license":
          return <Building className="w-5 h-5 text-slate-600" />;
        default:
          return <FileText className="w-5 h-5 text-gray-600" />;
      }
    };

    const getUrgencyBadge = (daysUntilExpiry: number) => {
      if (daysUntilExpiry <= 7) {
        return (
          <Badge className="bg-red-100 text-red-800 border-red-200">
            {t("documents.criticalBadge", "Critical - {{days}} days", { days: daysUntilExpiry })}
          </Badge>
        );
      }
      if (daysUntilExpiry <= 30) {
        return (
          <Badge className="bg-orange-100 text-orange-800 border-orange-200">
            {t("documents.highBadge", "High - {{days}} days", { days: daysUntilExpiry })}
          </Badge>
        );
      }
      if (daysUntilExpiry <= 90) {
        return (
          <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">
            {t("documents.mediumBadge", "Medium - {{days}} days", { days: daysUntilExpiry })}
          </Badge>
        );
      }
      return (
        <Badge className="bg-gray-100 text-gray-800 border-gray-200">
          {t("documents.lowBadge", "Low - {{days}} days", { days: daysUntilExpiry })}
        </Badge>
      );
    };

    const buildCards = (check: DocumentExpiryCheck) => {
      const cards: {
        type: string;
        title: string;
        number?: string | null;
        expiryDate: string;
        daysUntilExpiry: number;
        alertDays: number;
        ownerId: string | null;
      }[] = [];

      if (check.visa) {
        cards.push({
          type: "visa",
          title: "Visa",
          number: check.visa.number,
          expiryDate: check.visa.expiryDate,
          daysUntilExpiry: check.visa.daysUntilExpiry,
          alertDays: check.visa.alertDays,
          ownerId: check.employeeId,
        });
      }
      if (check.civilId) {
        cards.push({
          type: "civil_id",
          title: "Civil ID",
          number: check.civilId.number,
          expiryDate: check.civilId.expiryDate,
          daysUntilExpiry: check.civilId.daysUntilExpiry,
          alertDays: check.civilId.alertDays,
          ownerId: check.employeeId,
        });
      }
      if (check.passport) {
        cards.push({
          type: "passport",
          title: "Passport",
          number: check.passport.number,
          expiryDate: check.passport.expiryDate,
          daysUntilExpiry: check.passport.daysUntilExpiry,
          alertDays: check.passport.alertDays,
          ownerId: check.employeeId,
        });
      }
      if (check.drivingLicense) {
        cards.push({
          type: "driving_license",
          title: "Driving License",
          number: check.drivingLicense.number,
          expiryDate: check.drivingLicense.expiryDate,
          daysUntilExpiry: check.drivingLicense.daysUntilExpiry,
          alertDays: check.drivingLicense.alertDays,
          ownerId: check.employeeId,
        });
      }
      if (check.companyLicense) {
        cards.push({
          type: "company_license",
          title: check.companyName ? `${check.companyName} License` : "Company License",
          number: check.companyLicense.number,
          expiryDate: check.companyLicense.expiryDate,
          daysUntilExpiry: check.companyLicense.daysUntilExpiry,
          alertDays: check.companyLicense.alertDays,
          ownerId: null,
        });
      }
      return cards.filter(card => {
        const alertWindow = Math.max(card.alertDays ?? 0, 0);
        return card.daysUntilExpiry <= alertWindow;
      });
    };

    const criticalExpiries = expiryChecks.filter(
      (check) =>
        (check.visa && check.visa.daysUntilExpiry <= 7) ||
        (check.civilId && check.civilId.daysUntilExpiry <= 7) ||
        (check.passport && check.passport.daysUntilExpiry <= 7) ||
        (check.drivingLicense && check.drivingLicense.daysUntilExpiry <= 7) ||
        (check.companyLicense && check.companyLicense.daysUntilExpiry <= 7),
    );

    const upcomingExpiries = expiryChecks.filter(
      (check) =>
        (check.visa && check.visa.daysUntilExpiry <= check.visa.alertDays) ||
        (check.civilId && check.civilId.daysUntilExpiry <= check.civilId.alertDays) ||
        (check.passport && check.passport.daysUntilExpiry <= check.passport.alertDays) ||
        (check.drivingLicense &&
          check.drivingLicense.daysUntilExpiry <= check.drivingLicense.alertDays) ||
        (check.companyLicense &&
          check.companyLicense.daysUntilExpiry <= check.companyLicense.alertDays),
    );

    const expiredCheckCards = expiryChecks
      .map((check) => ({
        check,
        cards: buildCards(check),
      }))
      .filter(({ cards }) => cards.length > 0);

    if (expiryLoading) {
      return (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold">
              {t("documents.title", "Document Expiry Tracking")}
            </h1>
          </div>
          <div className="space-y-4">
            {[...Array(3)].map((_, index) => (
              <Card key={index}>
                <CardContent className="p-6">
                  <div className="animate-pulse space-y-2">
                    <div className="h-4 bg-gray-200 rounded w-1/4" />
                    <div className="h-4 bg-gray-200 rounded w-1/2" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      );
    }

    if (expiryError) {
      return <div>{t("documents.errorLoading", "Error loading documents")}</div>;
    }

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">
            {t("documents.title", "Document Expiry Tracking")}
          </h1>
          <Button
            onClick={() => sendAlertsMutation.mutate()}
            disabled={sendAlertsMutation.isPending}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {sendAlertsMutation.isPending ? (
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Mail className="w-4 h-4 mr-2" />
            )}
            {t("documents.sendAlerts", "Send Expiry Alerts")}
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg text-red-800 dark:text-red-200">
                {t("documents.critical", "Critical Expiries")}
              </CardTitle>
              <CardDescription className="text-red-600 dark:text-red-300">
                {t("documents.within7", "Documents expiring within 7 days")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-red-800 dark:text-red-200">
                {criticalExpiries.length}
              </div>
            </CardContent>
          </Card>

          <Card className="border-orange-200 bg-orange-50 dark:border-orange-900 dark:bg-orange-950">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg text-orange-800 dark:text-orange-200">
                {t("documents.upcoming", "Upcoming Expiries")}
              </CardTitle>
              <CardDescription className="text-orange-600 dark:text-orange-300">
                {t("documents.requireAttention", "Documents requiring attention")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-orange-800 dark:text-orange-200">
                {upcomingExpiries.length}
              </div>
            </CardContent>
          </Card>

          <Card className="border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg text-blue-800 dark:text-blue-200">
                {t("documents.totalTracked", "Total tracked employees")}
              </CardTitle>
              <CardDescription className="text-blue-600 dark:text-blue-300">
                {t("documents.coverage", "Employees with monitored documents")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-blue-800 dark:text-blue-200">
                {expiryChecks.length}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          {expiredCheckCards.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                {t(
                  "documents.noExpired",
                  "No expired documents require replacement right now.",
                )}
              </CardContent>
            </Card>
          ) : (
            expiredCheckCards.map(({ check, cards }) => {
              const extended = check as DocumentExpiryCheck & {
                employeePosition?: string | null;
                nextAlertDate?: string | null;
              };
              return (
                <Card key={check.employeeId ?? Math.random()}>
                  <CardHeader className="pb-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-lg">
                          {check.employeeName ?? t("documents.unknownEmployee", "Unknown employee")}
                        </CardTitle>
                        <CardDescription className="text-sm">
                          {extended.employeePosition ?? ""}
                        </CardDescription>
                      </div>
                      <Badge variant="secondary" className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        {t("documents.expiredBadge", "Expired")}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="grid gap-4 md:grid-cols-2">
                    {cards.map(card => {
                      const linkedDocument = findMatchingDocument(card.ownerId, card);
                      const entityKey = check.employeeId ?? check.companyId ?? "unknown";
                      return (
                        <div
                          key={`${entityKey}-${card.type}`}
                          className="flex flex-col gap-3 rounded-lg border border-slate-200 dark:border-slate-800 p-4"
                        >
                          <div className="flex items-start space-x-3">
                            <div>{getDocumentIcon(card.type)}</div>
                            <div className="flex-1 space-y-1">
                              <div className="flex items-center justify-between">
                                <p className="font-medium text-slate-900 dark:text-slate-100">
                                  {card.title}
                                </p>
                                {getUrgencyBadge(card.daysUntilExpiry)}
                              </div>
                              <p className="text-sm text-muted-foreground">
                                {t("documents.number", "Number")}: {card.number ?? "—"}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {t("documents.expiryDate", "Expiry date")}: {card.expiryDate ?? "—"}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {t("documents.daysRemaining", "Days remaining")}: {card.daysUntilExpiry}
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={!linkedDocument}
                              onClick={() => {
                                if (linkedDocument) {
                                  setHistoryDoc(linkedDocument);
                                } else {
                                  toast({
                                    title: t(
                                      "documents.historyUnavailable",
                                      "History unavailable for this document",
                                    ),
                                    variant: "destructive",
                                  });
                                }
                              }}
                            >
                              <History className="h-4 w-4 mr-1" />
                              {t("documents.viewHistory", "View history")}
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => {
                                const defaultTitle = `${card.title} - ${check.employeeName ?? ""}`.trim();
                                const matched = linkedDocument;
                                setReplacementContext({
                                  employeeId: card.ownerId ?? null,
                                  employeeName: check.employeeName,
                                  companyId: check.companyId ?? null,
                                  cardType: card.type,
                                  cardTitle: card.title,
                                  number: card.number,
                                  expiryDate: card.expiryDate,
                                  alertDays: card.alertDays,
                                });
                                setReplacementDocumentId(matched?.id ?? NEW_DOCUMENT_VALUE);
                                setReplacementTitle(matched?.title ?? defaultTitle);
                                setReplacementDescription(matched?.description ?? "");
                                setReplacementExpiryDate(card.expiryDate ?? matched?.expiryDate ?? "");
                                setReplacementAlertDays(
                                  matched?.alertDays !== null && matched?.alertDays !== undefined
                                    ? String(matched.alertDays)
                                    : card.alertDays
                                      ? String(card.alertDays)
                                      : "",
                                );
                                setReplacementDataUrl(undefined);
                              }}
                            >
                              <UploadCloud className="h-4 w-4 mr-1" />
                              {t("documents.uploadReplacement", "Upload replacement")}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </div>
    );
  };

  const documentsContent = (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("documents.filters", "Filters")}</CardTitle>
          <CardDescription>
            {t("documents.filterDescription", "Search, filter, and narrow your document library")}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
          <div className="lg:col-span-2">
            <Label htmlFor="search">{t("common.search", "Search")}</Label>
            <Input
              id="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("documents.searchPlaceholder", "Search title, reference, controller...")}
            />
          </div>
          <div>
            <Label htmlFor="category">{t("documents.category", "Category")}</Label>
            <Select value={categoryFilter} onValueChange={handleCategoryFilterChange}>
              <SelectTrigger id="category">
                <SelectValue placeholder={t("documents.allCategories", "All categories")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_CATEGORIES_VALUE}>
                  {t("documents.allCategories", "All categories")}
                </SelectItem>
                {uniqueCategories.map((category) => (
                  <SelectItem key={category} value={category}>
                    {category === UNCATEGORIZED_CATEGORY_VALUE
                      ? t("documents.uncategorized", "Uncategorized")
                      : category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="tags">{t("documents.tags", "Tags")}</Label>
            <Select value={tagFilter} onValueChange={handleTagFilterChange}>
              <SelectTrigger id="tags">
                <SelectValue placeholder={t("documents.allTags", "All tags")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_TAGS_VALUE}>
                  {t("documents.allTags", "All tags")}
                </SelectItem>
                {uniqueTags.map((tag) => (
                  <SelectItem key={tag} value={tag}>
                    {tag === UNTAGGED_TAG_VALUE
                      ? t("documents.untagged", "Untagged")
                      : tag}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="signatureStatus">{t("documents.signatureStatus", "Signature status")}</Label>
            <Select value={signatureFilter} onValueChange={handleSignatureFilterChange}>
              <SelectTrigger id="signatureStatus">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {signatureStatusOptions.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option === "all"
                      ? t("documents.allStatuses", "All statuses")
                      : formatStatus(option)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="employeeFilter">{t("documents.employee", "Employee")}</Label>
            <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
              <SelectTrigger id="employeeFilter">
                <SelectValue placeholder={t("documents.allEmployees", "All employees")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_EMPLOYEES_VALUE}>
                  {t("documents.allEmployees", "All employees")}
                </SelectItem>
                {employees?.map((employee: any) => (
                  <SelectItem key={employee.id} value={employee.id}>
                    {employee.firstName} {employee.lastName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2">
            <Label htmlFor="latestOnly" className="text-sm font-medium">
              {t("documents.latestOnly", "Only latest versions")}
            </Label>
            <Switch
              id="latestOnly"
              checked={latestOnly}
              onCheckedChange={(value) => setLatestOnly(Boolean(value))}
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          {documents.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                {documentsQuery.isLoading
                  ? t("documents.loading", "Loading documents...")
                  : t("documents.empty", "No documents found for the selected filters.")}
              </CardContent>
            </Card>
          ) : (
            documents.map(renderDocumentCard)
          )}
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UploadCloud className="h-5 w-5" />
                {t("documents.upload", "Upload document")}
              </CardTitle>
              <CardDescription>
                {t("documents.uploadDescription", "Add external documents to the repository")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={handleUploadSubmit}>
                <div className="space-y-2">
                  <Label htmlFor="uploadTitle">{t("documents.titleLabel", "Title")}</Label>
                  <Input
                    id="uploadTitle"
                    value={uploadTitle}
                    onChange={(event) => setUploadTitle(event.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="uploadDescription">{t("documents.description", "Description")}</Label>
                  <Textarea
                    id="uploadDescription"
                    value={uploadDescription}
                    onChange={(event) => setUploadDescription(event.target.value)}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="uploadCategory">{t("documents.category", "Category")}</Label>
                    <Input
                      id="uploadCategory"
                      value={uploadCategory}
                      onChange={(event) => setUploadCategory(event.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="uploadTags">{t("documents.tags", "Tags")}</Label>
                    <Input
                      id="uploadTags"
                      value={uploadTags}
                      onChange={(event) => setUploadTags(event.target.value)}
                      placeholder="legal,offer,policy"
                    />
                  </div>
                  <div>
                    <Label htmlFor="uploadReference">{t("documents.reference", "Reference")}</Label>
                    <Input
                      id="uploadReference"
                      value={uploadReference}
                      onChange={(event) => setUploadReference(event.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="uploadController">{t("documents.controller", "Controller")}</Label>
                    <Input
                      id="uploadController"
                      value={uploadController}
                      onChange={(event) => setUploadController(event.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="uploadExpiry">{t("documents.expiry", "Expiry")}</Label>
                    <Input
                      id="uploadExpiry"
                      type="date"
                      value={uploadExpiry}
                      onChange={(event) => setUploadExpiry(event.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="uploadAlertDays">{t("documents.alertDays", "Alert days")}</Label>
                    <Input
                      id="uploadAlertDays"
                      type="number"
                      value={uploadAlertDays}
                      onChange={(event) => setUploadAlertDays(event.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="uploadEmployeeId">{t("documents.employee", "Employee")}</Label>
                    <Select value={uploadEmployeeId} onValueChange={setUploadEmployeeId}>
                      <SelectTrigger id="uploadEmployeeId">
                        <SelectValue placeholder={t("documents.optionalEmployee", "Optional employee")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_EMPLOYEE_VALUE}>
                          {t("documents.none", "None")}
                        </SelectItem>
                        {employees?.map((employee: any) => (
                          <SelectItem key={employee.id} value={employee.id}>
                            {employee.firstName} {employee.lastName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{t("documents.file", "File")}</Label>
                  <ImageUpload
                    label={t("documents.uploadFile", "Upload file")}
                    value={uploadDataUrl}
                    onChange={setUploadDataUrl}
                    accept="application/pdf,image/*"
                    maxSizeMB={5}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="uploadMetadata">{t("documents.metadata", "Metadata")}</Label>
                  <Textarea
                    id="uploadMetadata"
                    value={uploadMetadata}
                    onChange={(event) => setUploadMetadata(event.target.value)}
                    placeholder={'{\n  "custom": true\n}'}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={createDocumentMutation.isPending}>
                  {createDocumentMutation.isPending ? t("documents.saving", "Saving...") : t("documents.saveDocument", "Save document")}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                {t("documents.generate", "Generate from template")}
              </CardTitle>
              <CardDescription>
                {t("documents.generateDescription", "Build a letter from a saved template and optional signature workflow")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={handleTemplateSubmit}>
                <div>
                  <Label htmlFor="templateKey">{t("documents.template", "Template")}</Label>
                  <Select value={templateKey} onValueChange={(value: TemplateKey) => setTemplateKey(value)}>
                    <SelectTrigger id="templateKey">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(defaultTemplates).map(([key, value]) => (
                        <SelectItem key={key} value={key}>
                          {value.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="templateEmployee">{t("documents.employee", "Employee")}</Label>
                  <Select value={templateEmployeeId} onValueChange={setTemplateEmployeeId}>
                    <SelectTrigger id="templateEmployee">
                      <SelectValue placeholder={t("documents.selectEmployee", "Select employee")} />
                    </SelectTrigger>
                    <SelectContent>
                      {employees?.map((employee: any) => (
                        <SelectItem key={employee.id} value={employee.id}>
                          {employee.firstName} {employee.lastName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="templatePurpose">{t("documents.purpose", "Purpose")}</Label>
                    <Input
                      id="templatePurpose"
                      value={templatePurpose}
                      onChange={(event) => setTemplatePurpose(event.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="templateCategory">{t("documents.category", "Category")}</Label>
                    <Input
                      id="templateCategory"
                      value={templateCategory}
                      onChange={(event) => setTemplateCategory(event.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="templateTags">{t("documents.tags", "Tags")}</Label>
                    <Input
                      id="templateTags"
                      value={templateTags}
                      onChange={(event) => setTemplateTags(event.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="templateStart">{t("documents.startDate", "Start date")}</Label>
                    <Input
                      id="templateStart"
                      type="date"
                      value={templateStartDate}
                      onChange={(event) => setTemplateStartDate(event.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="templateEnd">{t("documents.endDate", "End date")}</Label>
                    <Input
                      id="templateEnd"
                      type="date"
                      value={templateEndDate}
                      onChange={(event) => setTemplateEndDate(event.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="templateDescription">{t("documents.description", "Description")}</Label>
                  <Textarea
                    id="templateDescription"
                    value={templateDescription}
                    onChange={(event) => setTemplateDescription(event.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="templateMetadata">{t("documents.metadata", "Metadata")}</Label>
                  <Textarea
                    id="templateMetadata"
                    value={templateMetadata}
                    onChange={(event) => setTemplateMetadata(event.target.value)}
                    placeholder={'{\n  "template": true\n}'}
                  />
                </div>
                <div className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2">
                  <div>
                    <p className="text-sm font-medium">
                      {t("documents.sendForSignature", "Send for signature")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t("documents.signatureHint", "Automatically create a signature request after generating")}
                    </p>
                  </div>
                  <Switch
                    checked={templateSendSignature}
                    onCheckedChange={(value) => setTemplateSendSignature(Boolean(value))}
                  />
                </div>
                {templateSendSignature && (
                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <Label htmlFor="templateProvider">{t("documents.provider", "Provider")}</Label>
                      <Input
                        id="templateProvider"
                        value={templateProvider}
                        onChange={(event) => setTemplateProvider(event.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="templateRecipient">{t("documents.recipient", "Recipient")}</Label>
                      <Input
                        id="templateRecipient"
                        type="email"
                        value={templateRecipientEmail}
                        onChange={(event) => setTemplateRecipientEmail(event.target.value)}
                        required
                      />
                    </div>
                  </div>
                )}
                <Button type="submit" className="w-full" disabled={createDocumentMutation.isPending}>
                  {createDocumentMutation.isPending ? t("documents.generating", "Generating...") : t("documents.generateDocument", "Generate document")}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );

  const handleTabChange = (value: string) => {
    if (showExpiryOnly) return;
    setActiveTab(value);
  };

  const replacementDocuments = replacementContext
    ? replacementContext.cardType === "company_license"
      ? documents.filter(
          (doc) => (doc.category ?? "").toLowerCase() === "company_license",
        )
      : replacementContext.employeeId
      ? documentsByEmployee.get(replacementContext.employeeId) ?? []
      : []
    : [];

  const handleReplacementDocumentChange = (value: string) => {
    setReplacementDocumentId(value);
    if (!replacementContext) return;
    if (value === NEW_DOCUMENT_VALUE) {
      setReplacementTitle(
        `${replacementContext.cardTitle} - ${replacementContext.employeeName ?? ""}`.trim(),
      );
      setReplacementDescription("");
      setReplacementExpiryDate(replacementContext.expiryDate ?? "");
      setReplacementAlertDays(
        replacementContext.alertDays !== undefined && replacementContext.alertDays !== null
          ? String(replacementContext.alertDays)
          : "",
      );
      setReplacementDataUrl(undefined);
      return;
    }
    const selectedDoc = replacementDocuments.find((doc) => doc.id === value);
    if (selectedDoc) {
      setReplacementTitle(selectedDoc.title);
      setReplacementDescription(selectedDoc.description ?? "");
      setReplacementExpiryDate(selectedDoc.expiryDate ?? "");
      setReplacementAlertDays(
        selectedDoc.alertDays !== null && selectedDoc.alertDays !== undefined
          ? String(selectedDoc.alertDays)
          : "",
      );
      setReplacementDataUrl(undefined);
    }
  };

  const closeReplacementModal = () => {
    setReplacementContext(null);
    setReplacementTitle("");
    setReplacementDescription("");
    setReplacementExpiryDate("");
    setReplacementAlertDays("");
    setReplacementDocumentId(NEW_DOCUMENT_VALUE);
    setReplacementDataUrl(undefined);
  };

  const syncReplacementExpiry = async () => {
    if (!replacementContext) return;

    const trimmedExpiry = replacementExpiryDate?.trim();
    const normalizedAlert = replacementAlertDays?.trim();
    const parsedAlert =
      normalizedAlert && normalizedAlert.length > 0 ? Number(normalizedAlert) : undefined;
    const alertDays =
      parsedAlert !== undefined && Number.isFinite(parsedAlert) ? parsedAlert : undefined;
    const trimmedNumber =
      typeof replacementContext.number === "string" && replacementContext.number.trim().length > 0
        ? replacementContext.number.trim()
        : undefined;

    const payload: Record<string, unknown> = {};
    let endpoint: string | null = null;

    const assignEmployeePayload = (
      fields: { expiry: string; number: string; alert?: string },
    ): void => {
      if (!replacementContext?.employeeId) return;
      endpoint = `/api/employees/${replacementContext.employeeId}`;
      if (trimmedExpiry) {
        payload[fields.expiry] = trimmedExpiry;
      }
      if (trimmedNumber) {
        payload[fields.number] = trimmedNumber;
      }
      if (fields.alert && alertDays !== undefined) {
        payload[fields.alert] = alertDays;
      }
    };

    switch (replacementContext.cardType) {
      case "visa":
        assignEmployeePayload({
          expiry: "visaExpiryDate",
          number: "visaNumber",
          alert: "visaAlertDays",
        });
        break;
      case "civil_id":
        assignEmployeePayload({
          expiry: "civilIdExpiryDate",
          number: "civilId",
          alert: "civilIdAlertDays",
        });
        break;
      case "passport":
        assignEmployeePayload({
          expiry: "passportExpiryDate",
          number: "passportNumber",
          alert: "passportAlertDays",
        });
        break;
      case "driving_license":
        assignEmployeePayload({
          expiry: "drivingLicenseExpiryDate",
          number: "drivingLicenseNumber",
          alert: "drivingLicenseAlertDays",
        });
        break;
      case "company_license":
        if (!replacementContext.companyId) break;
        endpoint = `/api/companies/${replacementContext.companyId}`;
        if (trimmedExpiry) {
          payload.companyLicenseExpiryDate = trimmedExpiry;
        }
        if (trimmedNumber) {
          payload.companyLicenseNumber = trimmedNumber;
        }
        if (alertDays !== undefined) {
          payload.companyLicenseAlertDays = alertDays;
        }
        break;
      default:
        break;
    }

    if (!endpoint || Object.keys(payload).length === 0) {
      return;
    }

    const res = await apiPut(endpoint, payload);
    if (!res.ok) {
      throw res;
    }
  };

  const handleReplacementSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!replacementContext) return;
    if (!replacementDataUrl) {
      toast({
        title: t("documents.missingFile", "Attach a document to upload"),
        variant: "destructive",
      });
      return;
    }

    const metadata = {
      replacedDocumentType: replacementContext.cardType,
      replacedDocumentNumber: replacementContext.number,
      replacedAt: new Date().toISOString(),
    } as Record<string, unknown>;

    const basePayload: Record<string, unknown> = {
      title: replacementTitle,
      description: replacementDescription,
      pdfDataUrl: replacementDataUrl,
      metadata,
      expiryDate: replacementExpiryDate || undefined,
      alertDays: replacementAlertDays || undefined,
    };

    try {
      if (replacementDocumentId !== NEW_DOCUMENT_VALUE) {
        await createVersionMutation.mutateAsync({
          id: replacementDocumentId,
          body: basePayload,
        });
      } else {
        await createDocumentMutation.mutateAsync({
          ...basePayload,
          employeeId: replacementContext.employeeId,
          category: replacementContext.cardType,
          referenceNumber: replacementContext.number ?? undefined,
        });
      }
    } catch (error) {
      // handled by mutation error handlers
      return;
    }

    try {
      await syncReplacementExpiry();
    } catch (error) {
      toastApiError(error, t("documents.expiryUpdateFailed", "Failed to update expiry information"));
      return;
    }

    await queryClient.invalidateQueries({ queryKey: ["/api/documents/expiry-check"] });
    closeReplacementModal();
  };

  return (
    <div className="space-y-6">
      {showExpiryOnly ? (
        renderExpiryTab()
      ) : (
        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
          <TabsList>
            <TabsTrigger value="library">{t("documents.library", "Document Library")}</TabsTrigger>
            <TabsTrigger value="expiry">{t("documents.expiryTracking", "Expiry Tracking")}</TabsTrigger>
          </TabsList>

          <TabsContent value="library" className="space-y-6">
            {documentsContent}
          </TabsContent>

          <TabsContent value="expiry" className="space-y-6">
            {renderExpiryTab()}
          </TabsContent>
        </Tabs>
      )}

      <Dialog open={Boolean(historyDoc)} onOpenChange={(open) => !open && setHistoryDoc(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t("documents.history", "Document history")}</DialogTitle>
            <DialogDescription>
              {historyDoc?.title} • {t("documents.version", "Version")} {historyDoc?.version}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-medium text-muted-foreground">
                {t("documents.versions", "Versions")}
              </h3>
              <ScrollArea className="max-h-48 rounded border border-slate-200 dark:border-slate-800">
                <div className="divide-y divide-slate-200 dark:divide-slate-800">
                  {versionsQuery.data?.map((version) => (
                    <div key={version.id} className="p-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">
                          {t("documents.version", "Version")} {version.version}
                        </span>
                        <Badge variant={version.isLatest ? "default" : "secondary"}>
                          {version.isLatest
                            ? t("documents.latest", "Latest")
                            : t("documents.archived", "Archived")}
                        </Badge>
                      </div>
                      <div className="text-muted-foreground">
                        {format(new Date(version.createdAt as any), "PPpp")}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
            <form className="space-y-3" onSubmit={handleVersionSubmit}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="historyTitle">{t("documents.titleLabel", "Title")}</Label>
                  <Input
                    id="historyTitle"
                    value={historyTitle}
                    onChange={(event) => setHistoryTitle(event.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="historyDescription">{t("documents.description", "Description")}</Label>
                  <Input
                    id="historyDescription"
                    value={historyDescription}
                    onChange={(event) => setHistoryDescription(event.target.value)}
                  />
                </div>
              </div>
              <div>
                <Label>{t("documents.file", "File")}</Label>
                <ImageUpload
                  label={t("documents.uploadFile", "Upload file")}
                  value={historyDataUrl}
                  onChange={setHistoryDataUrl}
                  accept="application/pdf,image/*"
                  maxSizeMB={5}
                />
              </div>
              <div>
                <Label htmlFor="historyMetadata">{t("documents.metadata", "Metadata")}</Label>
                <Textarea
                  id="historyMetadata"
                  value={historyMetadata}
                  onChange={(event) => setHistoryMetadata(event.target.value)}
                />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={createVersionMutation.isPending}>
                  {createVersionMutation.isPending
                    ? t("documents.saving", "Saving...")
                    : t("documents.saveVersion", "Save new version")}
                </Button>
              </DialogFooter>
            </form>
          </div>
      </DialogContent>
    </Dialog>

      <Dialog open={Boolean(replacementContext)} onOpenChange={(open) => !open && closeReplacementModal()}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {t("documents.replacementDialogTitle", "Upload replacement document")}
            </DialogTitle>
            <DialogDescription>
              {replacementContext
                ? t(
                    "documents.replacementDialogDescription",
                    "Provide a new file to replace the expired {{type}} for {{employee}}.",
                    {
                      type:
                        t(`documents.type.${replacementContext.cardType}` as any, replacementContext.cardTitle) ||
                        replacementContext.cardTitle,
                      employee: replacementContext.employeeName,
                    },
                  )
                : null}
            </DialogDescription>
          </DialogHeader>
          {replacementContext && (
            <form className="space-y-4" onSubmit={handleReplacementSubmit}>
              <div className="grid gap-3">
                <div className="grid gap-1">
                  <Label htmlFor="replacement-document">
                    {t("documents.replacementExistingLabel", "Existing document")}
                  </Label>
                  <Select value={replacementDocumentId} onValueChange={handleReplacementDocumentChange}>
                    <SelectTrigger id="replacement-document">
                      <SelectValue placeholder={t("documents.replacementSelect", "Select a document")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NEW_DOCUMENT_VALUE}>
                        {t("documents.replacementCreateNew", "Create new document")}
                      </SelectItem>
                      {replacementDocuments.map((doc) => (
                        <SelectItem key={doc.id} value={doc.id}>
                          {doc.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="replacement-title">{t("documents.titleLabel", "Title")}</Label>
                  <Input
                    id="replacement-title"
                    value={replacementTitle}
                    onChange={(event) => setReplacementTitle(event.target.value)}
                    required
                  />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="replacement-description">{t("documents.description", "Description")}</Label>
                  <Textarea
                    id="replacement-description"
                    value={replacementDescription}
                    onChange={(event) => setReplacementDescription(event.target.value)}
                  />
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="grid gap-1">
                    <Label htmlFor="replacement-expiry">{t("documents.expiryDate", "Expiry date")}</Label>
                    <Input
                      id="replacement-expiry"
                      type="date"
                      value={replacementExpiryDate}
                      onChange={(event) => setReplacementExpiryDate(event.target.value)}
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor="replacement-alert">{t("documents.alertDays", "Alert days")}</Label>
                    <Input
                      id="replacement-alert"
                      type="number"
                      min={0}
                      value={replacementAlertDays}
                      onChange={(event) => setReplacementAlertDays(event.target.value)}
                    />
                  </div>
                </div>
                <ImageUpload
                  label={t("documents.replacementFileLabel", "Replacement document")}
                  value={replacementDataUrl}
                  onChange={setReplacementDataUrl}
                />
              </div>
              <DialogFooter className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={closeReplacementModal}>
                  {t("actions.cancel", "Cancel")}
                </Button>
                <Button
                  type="submit"
                  disabled={createDocumentMutation.isPending || createVersionMutation.isPending}
                >
                  {createDocumentMutation.isPending || createVersionMutation.isPending
                    ? t("documents.saving", "Saving...")
                    : t("documents.replacementSubmit", "Save replacement")}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(signatureDoc)} onOpenChange={(open) => !open && setSignatureDoc(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("documents.signature", "Signature")}</DialogTitle>
            <DialogDescription>
              {signatureDoc?.title}
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-3" onSubmit={handleSignatureSubmit}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="signatureProvider">{t("documents.provider", "Provider")}</Label>
                <Input
                  id="signatureProvider"
                  value={signatureProvider}
                  onChange={(event) => setSignatureProvider(event.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="signatureEmail">{t("documents.recipient", "Recipient")}</Label>
                <Input
                  id="signatureEmail"
                  type="email"
                  value={signatureEmail}
                  onChange={(event) => setSignatureEmail(event.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="signatureStatus">{t("documents.signatureStatus", "Signature status")}</Label>
                <Select value={signatureStatus} onValueChange={(value: DocumentSignatureStatus) => setSignatureStatus(value)}>
                  <SelectTrigger id="signatureStatus">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {documentSignatureStatusSchema.options.map((status) => (
                      <SelectItem key={status} value={status}>
                        {formatStatus(status)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="signatureRequestedAt">{t("documents.requestedAt", "Requested at")}</Label>
                <Input
                  id="signatureRequestedAt"
                  type="datetime-local"
                  value={signatureRequestedAt}
                  onChange={(event) => setSignatureRequestedAt(event.target.value)}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="signatureMetadata">{t("documents.metadata", "Metadata")}</Label>
              <Textarea
                id="signatureMetadata"
                value={signatureMetadata}
                onChange={(event) => setSignatureMetadata(event.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={sendSignatureMutation.isPending}>
                {sendSignatureMutation.isPending
                  ? t("documents.updating", "Updating...")
                  : t("documents.updateSignature", "Update signature")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
