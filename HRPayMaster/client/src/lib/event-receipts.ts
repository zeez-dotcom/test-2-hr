
import type { QueryClient } from "@tanstack/react-query";
import type { Employee, EmployeeEvent } from "@shared/schema";
import type { Content } from "pdfmake/interfaces";

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

function buildEventNarrative(event: EmployeeEvent, employeeLine: string) {
  const dateText = formatDate(event.eventDate);
  const amountText = event.amount ? formatCurrency(event.amount) : null;
  const typeLabel = event.eventType ? titleCase(event.eventType) : "Event";
  const baseTitle = event.title?.trim() || typeLabel;
  const description = event.description?.trim();

  const bodyParts: string[] = [
    `This document confirms that ${employeeLine} has a "${baseTitle}" record dated ${dateText}.`,
  ];
  if (amountText) {
    bodyParts.push(`Recorded amount: ${amountText}.`);
  }
  if (description) {
    bodyParts.push(`Notes: ${description}.`);
  }

  const details: string[] = [
    `Title: ${baseTitle}`,
    `Type: ${typeLabel}`,
    `Recorded on: ${dateText}`,
    `Status: ${titleCase(event.status) || event.status}`,
    `Affects payroll: ${event.affectsPayroll ? "Yes" : "No"}`,
  ];
  if (amountText) {
    details.push(`Amount: ${amountText}`);
  }
  if (description) {
    details.push(`Description: ${description}`);
  }

  return {
    title: `${baseTitle} Receipt`,
    subheading: typeLabel,
    body: bodyParts.join(" "),
    details,
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
    titleEn: narrative.title,
    titleAr: narrative.title,
    subheadingEn: narrative.subheading,
    subheadingAr: narrative.subheading,
    bodyEn: narrative.body,
    bodyAr: narrative.body,
    detailsEn: narrative.details,
    detailsAr: narrative.details,
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

