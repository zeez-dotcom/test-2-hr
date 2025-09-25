import type { QueryClient } from "@tanstack/react-query";
import type { Employee, EmployeeEvent } from "@shared/schema";
import type { Content } from "pdfmake/interfaces";

import { apiPut } from "@/lib/http";
import { buildAndEncodePdf, buildBilingualActionReceipt, controllerNumber, openPdf } from "@/lib/pdf";
import { sanitizeImageSrc } from "@/lib/sanitizeImageSrc";
import { formatCurrency, formatDate } from "@/lib/utils";

type MinimalEmployee = Pick<Employee, "firstName" | "lastName" | "id" | "position">;

function normalizeEmployee(
  employee?: MinimalEmployee | null,
  fallbackId?: string
): MinimalEmployee {
  return {
    firstName: employee?.firstName || "Employee",
    lastName: employee?.lastName || "",
    id: employee?.id || fallbackId || "",
    position: employee?.position || null,
  };
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

export async function generateEventReceipt(options: {
  event: EmployeeEvent;
  employee?: MinimalEmployee | null;
  queryClient?: QueryClient;
  openPreview?: boolean;
}): Promise<{ docNumber: string }> {
  const { event, employee, queryClient, openPreview = true } = options;
  const normalized = normalizeEmployee(employee, event.employeeId);
  const docNumber = controllerNumber();

  const detailsEn = [
    `Title: ${event.title}`,
    `Type: ${event.eventType}`,
    `Date: ${formatDate(event.eventDate)}`,
    `Amount: ${formatCurrency(event.amount ?? "0")}`,
    `Affects Payroll: ${event.affectsPayroll ? "Yes" : "No"}`,
    `Status: ${event.status}`,
    `Description: ${event.description}`,
  ];

  const detailsAr = [
    `العنوان: ${event.title}`,
    `نوع الحدث: ${event.eventType}`,
    `التاريخ: ${formatDate(event.eventDate)}`,
    `المبلغ: ${formatCurrency(event.amount ?? "0")}`,
    `يؤثر على الراتب: ${event.affectsPayroll ? "نعم" : "لا"}`,
    `الحالة: ${event.status}`,
    `الوصف: ${event.description}`,
  ];

  const doc = buildBilingualActionReceipt({
    titleEn: "Employee Event Receipt",
    titleAr: "إيصال حدث الموظف",
    employee: normalized,
    detailsEn,
    detailsAr,
    docNumber,
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
