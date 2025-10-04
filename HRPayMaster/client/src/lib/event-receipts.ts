import type { QueryClient } from "@tanstack/react-query";
import type { Employee, EmployeeEvent } from "@shared/schema";
import type { Content } from "pdfmake/interfaces";

import i18n from "@/lib/i18n";
import { apiPut } from "@/lib/http";
import { buildAndEncodePdf, buildBilingualActionReceipt, controllerNumber, openPdf } from "@/lib/pdf";
import { sanitizeImageSrc } from "@/lib/sanitizeImageSrc";
import { formatCurrency, formatDate } from "@/lib/utils";

type MinimalEmployee = Pick<Employee, "firstName" | "lastName" | "id" | "position" | "phone">;

function normalizeEmployee(
  employee?: MinimalEmployee | null,
  fallbackId?: string
): MinimalEmployee {
  return {
    firstName: employee?.firstName ?? "Employee",
    lastName: employee?.lastName ?? "",
    id: employee?.id ?? fallbackId ?? "",
    position: employee?.position ?? null,
    phone: employee?.phone ?? null,
  } as MinimalEmployee;
}

function appendSupportingDocument(
  doc: import("pdfmake/interfaces").TDocumentDefinitions,
  attachment?: string | null
) {
  if (!attachment) return;
  const content = Array.isArray(doc.content) ? [...doc.content] : doc.content ? [doc.content] : [];
  content.push({ text: "Supporting Document", style: "section", margin: [0, 14, 0, 6] } as Content);

  if (/^data:image\//i.test(attachment)) {
    content.push({
      image: sanitizeImageSrc(attachment),
      width: 320,
      margin: [0, 0, 0, 12],
    } as Content);
  } else {
    content.push({
      text: attachment,
      link: attachment,
      color: "#2563EB",
      margin: [0, 0, 0, 12],
    } as Content);
  }

  doc.content = content;
}

function titleCase(value?: string | null): string {
  if (!value) return "";
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map(part => part[0]?.toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

type BilingualText = {
  en: string;
  ar: string;
};

type BilingualDetails = {
  en: string[];
  ar: string[];
};

export function buildEventNarrative(event: EmployeeEvent, employeeLine: string) {
  const tEn = i18n.getFixedT("en");
  const tAr = i18n.getFixedT("ar");
  const dateText = formatDate(event.eventDate);
  const amountText = event.amount ? formatCurrency(event.amount) : null;
  const typeLabel = event.eventType ? titleCase(event.eventType) : tEn("eventReceipts.defaultType");
  const baseTitle = event.title?.trim() || typeLabel;
  const description = event.description?.trim();
  const statusLabel = titleCase(event.status) || event.status || "N/A";

  const affectsPayrollEn = event.affectsPayroll ? tEn("eventReceipts.yes") : tEn("eventReceipts.no");
  const affectsPayrollAr = event.affectsPayroll ? tAr("eventReceipts.yes") : tAr("eventReceipts.no");

  const bodyEnParts: string[] = [
    tEn("eventReceipts.body.intro", {
      employee: employeeLine,
      title: baseTitle,
      date: dateText,
    }),
  ];
  const bodyArParts: string[] = [
    tAr("eventReceipts.body.intro", {
      employee: employeeLine,
      title: baseTitle,
      date: dateText,
    }),
  ];
  if (amountText) {
    bodyEnParts.push(
      tEn("eventReceipts.body.amount", {
        amount: amountText,
      })
    );
    bodyArParts.push(
      tAr("eventReceipts.body.amount", {
        amount: amountText,
      })
    );
  }
  if (description) {
    bodyEnParts.push(
      tEn("eventReceipts.body.notes", {
        notes: description,
      })
    );
    bodyArParts.push(
      tAr("eventReceipts.body.notes", {
        notes: description,
      })
    );
  }

  const detailsEn: string[] = [
    tEn("eventReceipts.details.title", { title: baseTitle }),
    tEn("eventReceipts.details.type", { type: typeLabel }),
    tEn("eventReceipts.details.recordedOn", { date: dateText }),
    tEn("eventReceipts.details.status", { status: statusLabel }),
    tEn("eventReceipts.details.affectsPayroll", { value: affectsPayrollEn }),
  ];
  const detailsAr: string[] = [
    tAr("eventReceipts.details.title", { title: baseTitle }),
    tAr("eventReceipts.details.type", { type: typeLabel }),
    tAr("eventReceipts.details.recordedOn", { date: dateText }),
    tAr("eventReceipts.details.status", { status: statusLabel }),
    tAr("eventReceipts.details.affectsPayroll", { value: affectsPayrollAr }),
  ];
  if (amountText) {
    detailsEn.push(tEn("eventReceipts.details.amount", { amount: amountText }));
    detailsAr.push(tAr("eventReceipts.details.amount", { amount: amountText }));
  }
  if (description) {
    detailsEn.push(tEn("eventReceipts.details.description", { description }));
    detailsAr.push(tAr("eventReceipts.details.description", { description }));
  }

  return {
    title: {
      en: tEn("eventReceipts.title", { title: baseTitle }),
      ar: tAr("eventReceipts.title", { title: baseTitle }),
    } satisfies BilingualText,
    subheading: {
      en: tEn("eventReceipts.subheading", { type: typeLabel }),
      ar: tAr("eventReceipts.subheading", { type: typeLabel }),
    } satisfies BilingualText,
    body: {
      en: bodyEnParts.join(" "),
      ar: bodyArParts.join(" "),
    } satisfies BilingualText,
    details: {
      en: detailsEn,
      ar: detailsAr,
    } satisfies BilingualDetails,
  };
}

export async function generateEventReceipt(options: {
  event: EmployeeEvent;
  employee?: MinimalEmployee | null;
  queryClient?: QueryClient;
  openPreview?: boolean;
}): Promise<{ docNumber: string }> {
  const { event, employee, queryClient, openPreview = true } = options;
  const normalized = normalizeEmployee(employee, event.employeeId);
  const docNumber = controllerNumber();

  const fullName = `${normalized.firstName} ${normalized.lastName}`.trim() || normalized.id || "Employee";
  const phoneText = normalized.phone?.trim() || "N/A";
  const employeeLine = `${fullName} (Phone: ${phoneText})`;
  const narrative = buildEventNarrative(event, employeeLine);

  const doc = buildBilingualActionReceipt({
    titleEn: narrative.title.en,
    titleAr: narrative.title.ar,
    subheadingEn: narrative.subheading.en,
    subheadingAr: narrative.subheading.ar,
    bodyEn: narrative.body.en,
    bodyAr: narrative.body.ar,
    detailsEn: narrative.details.en,
    detailsAr: narrative.details.ar,
    docNumber,
    employee: {
      firstName: normalized.firstName,
      lastName: normalized.lastName ?? "",
      id: normalized.id,
      position: normalized.position ?? null,
      phone: normalized.phone ?? null,
    },
  });

  appendSupportingDocument(doc, event.documentUrl);

  if (openPreview) {
    try {
      openPdf(doc);
    } catch (error) {
      console.error("Failed to open receipt preview", error);
    }
  }

  const pdfDataUrl = await buildAndEncodePdf(doc);
  const update = await apiPut(`/api/employee-events/${event.id}`, { documentUrl: pdfDataUrl });
  if (!update.ok) {
    throw new Error((update as any).error || "Failed to attach event receipt");
  }

  if (queryClient) {
    await queryClient.invalidateQueries({ queryKey: ["/api/employee-events"] });
  }

  return { docNumber };
}

