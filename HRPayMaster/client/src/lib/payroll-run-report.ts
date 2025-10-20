import type { PayrollRunWithEntries } from "@shared/schema"
import type { Content, TDocumentDefinitions } from "pdfmake/interfaces"

import { openPdf } from "@/lib/pdf"
import { getBrand } from "@/lib/brand"
import {
  formatCurrency,
  formatDate,
  summarizeAllowances,
  calculateWorkingDaysAdjustment,
} from "@/lib/utils"

const EN = {
  reportTitle: "Payroll Run Report",
  summary: "Summary",
  scenarioSettings: "Scenario settings",
  period: "Period",
  status: "Status",
  employeeCount: "Employees",
  grossPay: "Gross pay",
  allowancesTotal: "Allowances",
  bonusesTotal: "Bonuses",
  totalDeductions: "Total deductions",
  netPay: "Net pay",
  createdAt: "Generated at",
  employee: "Employee",
  baseSalary: "Base salary",
  allowances: "Allowances",
  bonuses: "Bonuses",
  deductions: "Deductions",
  net: "Net",
  workingDays: "Working days",
  workingAdjustment: "Working days adjustment",
  vacationDays: "Vacation days",
  identifier: "Identifier",
  noAllowances: "None",
  noDeductions: "None",
  deductionBreakdown: "Deduction breakdown",
  employeeBreakdown: "Employee breakdown",
  enabled: "Enabled",
  disabled: "Disabled",
  noEntries: "No payroll entries available",
  allowanceDetails: "Allowance details",
  deductionDetails: "Deduction details",
}

const AR = {
  reportTitle: "تقرير مسير الرواتب",
  summary: "ملخص",
  scenarioSettings: "إعدادات السيناريو",
  period: "الفترة",
  status: "الحالة",
  employeeCount: "عدد الموظفين",
  grossPay: "إجمالي الرواتب",
  allowancesTotal: "البدلات",
  bonusesTotal: "المكافآت",
  totalDeductions: "إجمالي الاستقطاعات",
  netPay: "صافي الرواتب",
  createdAt: "وقت التوليد",
  employee: "الموظف",
  baseSalary: "الراتب الأساسي",
  allowances: "البدلات",
  bonuses: "المكافآت",
  deductions: "الاستقطاعات",
  net: "الصافي",
  workingDays: "أيام العمل",
  workingAdjustment: "تعديل أيام العمل",
  vacationDays: "أيام الإجازة",
  identifier: "المعرف",
  noAllowances: "لا يوجد",
  noDeductions: "لا يوجد",
  deductionBreakdown: "تفاصيل الاستقطاعات",
  employeeBreakdown: "تفاصيل الموظفين",
  enabled: "مفعّل",
  disabled: "معطل",
  noEntries: "لا توجد بيانات للرواتب",
  allowanceDetails: "تفاصيل البدلات",
  deductionDetails: "تفاصيل الاستقطاعات",
}

const STATUS_LABELS: Record<
  string,
  { en: string; ar: string }
> = {
  completed: { en: "Completed", ar: "مكتمل" },
  pending: { en: "Pending", ar: "قيد المعالجة" },
  draft: { en: "Draft", ar: "مسودة" },
  cancelled: { en: "Cancelled", ar: "ملغى" },
}

const SCENARIO_LABELS: Record<
  string,
  { en: string; ar: string }
> = {
  attendance: { en: "Attendance adjustments", ar: "تعديلات الحضور" },
  loans: { en: "Loans", ar: "السلف" },
  bonuses: { en: "Bonuses", ar: "المكافآت" },
  allowances: { en: "Allowances", ar: "البدلات" },
  statutory: { en: "Statutory deductions", ar: "الاستقطاعات النظامية" },
  overtime: { en: "Overtime", ar: "العمل الإضافي" },
}

const DEDUCTION_LABELS = [
  { key: "taxDeduction", en: "Tax", ar: "الضريبة" },
  { key: "socialSecurityDeduction", en: "Social security", ar: "التأمينات الاجتماعية" },
  { key: "healthInsuranceDeduction", en: "Health insurance", ar: "التأمين الصحي" },
  { key: "loanDeduction", en: "Loan deduction", ar: "خصم السلف" },
  { key: "otherDeductions", en: "Other deductions", ar: "استقطاعات أخرى" },
] as const

const allowanceKeys = (allowances?: Record<string, unknown> | null) =>
  Object.keys(allowances ?? {})

const toNumber = (value: unknown): number => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0
  }
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (!trimmed) return 0
    const parsed = Number(trimmed)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

const formatDateAr = (value?: string | Date | null): string => {
  if (!value) return "-"
  const date = typeof value === "string" ? new Date(value) : value
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return "-"
  }
  return new Intl.DateTimeFormat("ar", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date)
}

const formatDateTimeEn = (value?: string | Date | null): string => {
  if (!value) return "-"
  const date = typeof value === "string" ? new Date(value) : value
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return "-"
  }
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)
}

const formatDateTimeAr = (value?: string | Date | null): string => {
  if (!value) return "-"
  const date = typeof value === "string" ? new Date(value) : value
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return "-"
  }
  return new Intl.DateTimeFormat("ar", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)
}

const buildScenarioLines = (toggles: Record<string, boolean | undefined>) => {
  const lines = Object.entries(SCENARIO_LABELS).map(([key, labels]) => {
    const enabled = toggles[key] !== false
    return {
      en: `${labels.en}: ${enabled ? EN.enabled : EN.disabled}`,
      ar: `${labels.ar}: ${enabled ? AR.enabled : AR.disabled}`,
    }
  })
  return {
    en: lines.map(line => line.en),
    ar: lines.map(line => line.ar),
  }
}

const buildAllowancesCellEn = (allowances: ReturnType<typeof summarizeAllowances>): Content => {
  if (allowances.entries.length === 0) {
    return { text: EN.noAllowances, style: "tableSubtextMuted" }
  }

  return {
    stack: [
      { text: formatCurrency(allowances.total), style: "tableCell" } as Content,
      ...allowances.entries.map(({ label, amount }) => ({
        text: `${label}: ${formatCurrency(amount)}`,
        style: "tableSubtext",
      })),
    ],
  }
}

const buildAllowancesCellAr = (allowances: ReturnType<typeof summarizeAllowances>): Content => {
  if (allowances.entries.length === 0) {
    return { text: AR.noAllowances, style: "tableSubtextMutedAr" }
  }

  return {
    stack: [
      { text: formatCurrency(allowances.total), style: "tableCellAr" } as Content,
      ...allowances.entries.map(({ label, amount }) => ({
        text: `${label}: ${formatCurrency(amount)}`,
        style: "tableSubtextAr",
      })),
    ],
  }
}

const buildDeductionCellEn = (entry: NonNullable<PayrollRunWithEntries["entries"]>[number]) => {
  const breakdown = DEDUCTION_LABELS.map(item => ({
    label: item.en,
    amount: toNumber((entry as any)[item.key]),
  })).filter(item => item.amount !== 0)

  const total =
    breakdown.reduce((sum, item) => sum + item.amount, 0) ||
    (toNumber(entry.taxDeduction) +
      toNumber(entry.socialSecurityDeduction) +
      toNumber(entry.healthInsuranceDeduction) +
      toNumber(entry.loanDeduction) +
      toNumber(entry.otherDeductions))

  if (breakdown.length === 0) {
    return { text: EN.noDeductions, style: "tableSubtextMuted" }
  }

  return {
    stack: [
      { text: formatCurrency(total), style: "tableCell" } as Content,
      ...breakdown.map(item => ({
        text: `${item.label}: ${formatCurrency(item.amount)}`,
        style: "tableSubtext",
      })),
    ],
  }
}

const buildDeductionCellAr = (entry: NonNullable<PayrollRunWithEntries["entries"]>[number]) => {
  const breakdown = DEDUCTION_LABELS.map(item => ({
    label: item.ar,
    amount: toNumber((entry as any)[item.key]),
  })).filter(item => item.amount !== 0)

  const total =
    breakdown.reduce((sum, item) => sum + item.amount, 0) ||
    (toNumber(entry.taxDeduction) +
      toNumber(entry.socialSecurityDeduction) +
      toNumber(entry.healthInsuranceDeduction) +
      toNumber(entry.loanDeduction) +
      toNumber(entry.otherDeductions))

  if (breakdown.length === 0) {
    return { text: AR.noDeductions, style: "tableSubtextMutedAr" }
  }

  return {
    stack: [
      { text: formatCurrency(total), style: "tableCellAr" } as Content,
      ...breakdown.map(item => ({
        text: `${item.label}: ${formatCurrency(item.amount)}`,
        style: "tableSubtextAr",
      })),
    ],
  }
}

const getEmployeeNames = (entry: NonNullable<PayrollRunWithEntries["entries"]>[number]) => {
  const first = entry.employee?.firstName?.trim()
  const last = entry.employee?.lastName?.trim()
  const nickname = entry.employee?.nickname?.trim()
  const englishName = [first, last].filter(Boolean).join(" ") || nickname || `Employee ${entry.employeeId}`
  const arabicName = entry.employee?.arabicName?.trim()
  return {
    english: englishName,
    arabic: arabicName || englishName,
  }
}

const getEmployeeIdentifier = (entry: NonNullable<PayrollRunWithEntries["entries"]>[number]) => {
  const code = entry.employee?.employeeCode?.trim()
  if (code) {
    return `Code: ${code}`
  }
  return `ID: ${entry.employeeId}`
}

const getEmployeeIdentifierAr = (entry: NonNullable<PayrollRunWithEntries["entries"]>[number]) => {
  const code = entry.employee?.employeeCode?.trim()
  if (code) {
    return `رمز: ${code}`
  }
  return `معرّف: ${entry.employeeId}`
}

const buildDoc = (run: PayrollRunWithEntries): TDocumentDefinitions => {
  const entries = run.entries ?? []
  const brand = getBrand()

  const aggregated = entries.reduce(
    (acc, entry) => {
      const gross = toNumber(entry.grossPay)
      const net = toNumber(entry.netPay)
      const bonus = toNumber(entry.bonusAmount)
      const allowancesSummary = summarizeAllowances(entry.allowances)
      const deductions =
        toNumber(entry.taxDeduction) +
        toNumber(entry.socialSecurityDeduction) +
        toNumber(entry.healthInsuranceDeduction) +
        toNumber(entry.loanDeduction) +
        toNumber(entry.otherDeductions)

      acc.gross += gross
      acc.net += net
      acc.bonuses += bonus
      acc.allowances += allowancesSummary.total
      acc.deductions += deductions
      return acc
    },
    { gross: 0, net: 0, bonuses: 0, allowances: 0, deductions: 0 },
  )

  const grossTotal = toNumber(run.grossAmount) || aggregated.gross
  const netTotal = toNumber(run.netAmount) || aggregated.net
  const deductionTotal = toNumber(run.totalDeductions) || aggregated.deductions
  const allowanceTotal = aggregated.allowances
  const bonusTotal = aggregated.bonuses

  const periodEn = `${formatDate(run.startDate)} - ${formatDate(run.endDate)}`
  const periodAr = `${formatDateAr(run.startDate)} - ${formatDateAr(run.endDate)}`

  const statusLabel = STATUS_LABELS[run.status ?? ""] ?? {
    en: run.status ?? "Unknown",
    ar: run.status ?? "غير معروف",
  }

  const scenarioLines = buildScenarioLines((run.scenarioToggles as Record<string, boolean | undefined>) ?? {})

  const englishSummaryLines = [
    `${EN.period}: ${periodEn}`,
    `${EN.status}: ${statusLabel.en}`,
    `${EN.employeeCount}: ${entries.length}`,
    `${EN.grossPay}: ${formatCurrency(grossTotal)}`,
    `${EN.allowancesTotal}: ${formatCurrency(allowanceTotal)}`,
    `${EN.bonusesTotal}: ${formatCurrency(bonusTotal)}`,
    `${EN.totalDeductions}: ${formatCurrency(deductionTotal)}`,
    `${EN.netPay}: ${formatCurrency(netTotal)}`,
    `${EN.createdAt}: ${formatDateTimeEn(run.createdAt)}`,
  ]

  const arabicSummaryLines = [
    `${AR.period}: ${periodAr}`,
    `${AR.status}: ${statusLabel.ar}`,
    `${AR.employeeCount}: ${entries.length}`,
    `${AR.grossPay}: ${formatCurrency(grossTotal)}`,
    `${AR.allowancesTotal}: ${formatCurrency(allowanceTotal)}`,
    `${AR.bonusesTotal}: ${formatCurrency(bonusTotal)}`,
    `${AR.totalDeductions}: ${formatCurrency(deductionTotal)}`,
    `${AR.netPay}: ${formatCurrency(netTotal)}`,
    `${AR.createdAt}: ${formatDateTimeAr(run.createdAt)}`,
  ]

  const englishHeaders = [
    EN.employee,
    EN.baseSalary,
    EN.allowances,
    EN.bonuses,
    EN.deductions,
    EN.net,
  ]

  const englishTableBody: any[][] = [
    englishHeaders.map(header => ({ text: header, style: "tableHeader" })),
  ]

  entries.forEach(entry => {
    const names = getEmployeeNames(entry)
    const identifierEn = getEmployeeIdentifier(entry)
    const workingAdjustment = calculateWorkingDaysAdjustment(entry)
    const allowancesSummary = summarizeAllowances(entry.allowances)

    const employeeStack: Content[] = [
      { text: names.english, style: "tableCell", bold: true, margin: [0, 0, 0, 2] },
      { text: identifierEn, style: "tableSubtext" },
      { text: `${EN.workingDays}: ${entry.workingDays ?? 0}`, style: "tableSubtext" },
      { text: `${EN.vacationDays}: ${entry.vacationDays ?? 0}`, style: "tableSubtext" },
    ]

    if (workingAdjustment !== 0) {
      employeeStack.push({
        text: `${EN.workingAdjustment}: ${formatCurrency(workingAdjustment)}`,
        style: "tableSubtext",
      })
    }

    englishTableBody.push([
      { stack: employeeStack },
      { text: formatCurrency(entry.baseSalary ?? entry.grossPay), style: "tableCell" },
      buildAllowancesCellEn(allowancesSummary),
      { text: formatCurrency(toNumber(entry.bonusAmount)), style: "tableCell" },
      buildDeductionCellEn(entry),
      { text: formatCurrency(entry.netPay), style: "tableCell" },
    ])
  })

  if (entries.length === 0) {
    englishTableBody.push([
      { text: EN.noEntries, colSpan: englishHeaders.length, alignment: "center", style: "tableSubtextMuted" },
      ...Array.from({ length: englishHeaders.length - 1 }, () => ({})),
    ])
  }

  const arabicHeaders = [
    AR.employee,
    AR.baseSalary,
    AR.allowances,
    AR.bonuses,
    AR.deductions,
    AR.net,
  ]

  const arabicTableBody: any[][] = [
    arabicHeaders.map(header => ({ text: header, style: "tableHeaderAr" })),
  ]

  entries.forEach(entry => {
    const names = getEmployeeNames(entry)
    const identifierAr = getEmployeeIdentifierAr(entry)
    const workingAdjustment = calculateWorkingDaysAdjustment(entry)
    const allowancesSummary = summarizeAllowances(entry.allowances)

    const employeeStack: Content[] = [
      { text: names.arabic, style: "tableCellAr", bold: true, margin: [0, 0, 0, 2] },
      { text: identifierAr, style: "tableSubtextAr" },
      { text: `${AR.workingDays}: ${entry.workingDays ?? 0}`, style: "tableSubtextAr" },
      { text: `${AR.vacationDays}: ${entry.vacationDays ?? 0}`, style: "tableSubtextAr" },
    ]

    if (workingAdjustment !== 0) {
      employeeStack.push({
        text: `${AR.workingAdjustment}: ${formatCurrency(workingAdjustment)}`,
        style: "tableSubtextAr",
      })
    }

    arabicTableBody.push([
      { stack: employeeStack },
      { text: formatCurrency(entry.baseSalary ?? entry.grossPay), style: "tableCellAr" },
      buildAllowancesCellAr(allowancesSummary),
      { text: formatCurrency(toNumber(entry.bonusAmount)), style: "tableCellAr" },
      buildDeductionCellAr(entry),
      { text: formatCurrency(entry.netPay), style: "tableCellAr" },
    ])
  })

  if (entries.length === 0) {
    arabicTableBody.push([
      { text: AR.noEntries, colSpan: arabicHeaders.length, alignment: "center", style: "tableSubtextMutedAr" },
      ...Array.from({ length: arabicHeaders.length - 1 }, () => ({})),
    ])
  }

  const employeeDetailsSections: Content[] = []

  entries.forEach(entry => {
    const names = getEmployeeNames(entry)
    const allowancesSummary = summarizeAllowances(entry.allowances)
    const allowanceLinesEn = allowancesSummary.entries.map(allowance => `${allowance.label}: ${formatCurrency(allowance.amount)}`)
    const allowanceLinesAr = allowancesSummary.entries.map(allowance => `${allowance.label}: ${formatCurrency(allowance.amount)}`)

    const deductions = DEDUCTION_LABELS.map(item => ({
      labelEn: item.en,
      labelAr: item.ar,
      amount: toNumber((entry as any)[item.key]),
    })).filter(item => item.amount !== 0)

    const deductionsTotal =
      deductions.reduce((sum, item) => sum + item.amount, 0) ||
      (toNumber(entry.taxDeduction) +
        toNumber(entry.socialSecurityDeduction) +
        toNumber(entry.healthInsuranceDeduction) +
        toNumber(entry.loanDeduction) +
        toNumber(entry.otherDeductions))

    employeeDetailsSections.push({
      columns: [
        {
          width: "*",
          stack: [
            { text: names.english, style: "bodyEnBold" },
            { text: getEmployeeIdentifier(entry), style: "bodyEnMuted" },
            { text: `${EN.baseSalary}: ${formatCurrency(entry.baseSalary ?? entry.grossPay)}`, style: "bodyEn" },
            { text: `${EN.netPay}: ${formatCurrency(entry.netPay)}`, style: "bodyEn" },
            { text: `${EN.bonuses}: ${formatCurrency(toNumber(entry.bonusAmount))}`, style: "bodyEn" },
            {
              text: `${EN.allowances}: ${formatCurrency(allowancesSummary.total)}`,
              style: "bodyEn",
              margin: [0, 4, 0, allowanceLinesEn.length ? -2 : 0],
            },
            allowanceLinesEn.length
              ? { ul: allowanceLinesEn.map(line => ({ text: line, style: "bodyEn" })), margin: [0, 0, 0, 4] }
              : { text: EN.noAllowances, style: "bodyEnMuted", margin: [0, 0, 0, 4] },
            {
              text: `${EN.deductions}: ${formatCurrency(deductionsTotal)}`,
              style: "bodyEn",
              margin: [0, 4, 0, deductions.length ? -2 : 0],
            },
            deductions.length
              ? { ul: deductions.map(item => ({ text: `${item.labelEn}: ${formatCurrency(item.amount)}`, style: "bodyEn" })), margin: [0, 0, 0, 0] }
              : { text: EN.noDeductions, style: "bodyEnMuted" },
          ],
        },
        {
          width: "*",
          stack: [
            { text: names.arabic, style: "bodyArBold" },
            { text: getEmployeeIdentifierAr(entry), style: "bodyArMuted" },
            { text: `${AR.baseSalary}: ${formatCurrency(entry.baseSalary ?? entry.grossPay)}`, style: "bodyAr" },
            { text: `${AR.netPay}: ${formatCurrency(entry.netPay)}`, style: "bodyAr" },
            { text: `${AR.bonuses}: ${formatCurrency(toNumber(entry.bonusAmount))}`, style: "bodyAr" },
            {
              text: `${AR.allowances}: ${formatCurrency(allowancesSummary.total)}`,
              style: "bodyAr",
              margin: [0, 4, 0, allowanceKeys(entry.allowances).length ? -2 : 0],
            },
            allowanceLinesAr.length
              ? {
                  ul: allowanceLinesAr.map(line => ({ text: line, style: "bodyAr" })),
                  margin: [0, 0, 0, 4],
                }
              : { text: AR.noAllowances, style: "bodyArMuted", margin: [0, 0, 0, 4] },
            {
              text: `${AR.deductions}: ${formatCurrency(deductionsTotal)}`,
              style: "bodyAr",
              margin: [0, 4, 0, deductions.length ? -2 : 0],
            },
            deductions.length
              ? {
                  ul: deductions.map(item => ({ text: `${item.labelAr}: ${formatCurrency(item.amount)}`, style: "bodyAr" })),
                  margin: [0, 0, 0, 0],
                }
              : { text: AR.noDeductions, style: "bodyArMuted" },
          ],
        },
      ],
      columnGap: 24,
      margin: [0, 12, 0, 12],
    } as Content)
  })

  const content: Content[] = [
    {
      columns: [
        {
          width: "*",
          stack: [
            { text: brand.name || "HRPayMaster", style: "brandEn" },
            { text: EN.reportTitle, style: "titleEn", margin: [0, 4, 0, 0] },
            { text: periodEn, style: "muted" },
          ],
        },
        {
          width: "*",
          alignment: "right",
          stack: [
            { text: brand.name || "HRPayMaster", style: "brandAr" },
            { text: AR.reportTitle, style: "titleAr", margin: [0, 4, 0, 0] },
            { text: periodAr, style: "mutedAr" },
          ],
        },
      ],
      columnGap: 16,
      margin: [0, 0, 0, 16],
    },
    {
      columns: [
        {
          width: "*",
          stack: [
            { text: EN.summary, style: "sectionHeading", margin: [0, 0, 0, 6] },
            ...englishSummaryLines.map(line => ({ text: line, style: "bodyEn" })),
            { text: EN.scenarioSettings, style: "sectionHeading", margin: [0, 12, 0, 6] },
            ...scenarioLines.en.map(line => ({ text: line, style: "bodyEn" })),
          ],
        },
        {
          width: "*",
          stack: [
            { text: AR.summary, style: "sectionHeadingAr", margin: [0, 0, 0, 6] },
            ...arabicSummaryLines.map(line => ({ text: line, style: "bodyAr" })),
            { text: AR.scenarioSettings, style: "sectionHeadingAr", margin: [0, 12, 0, 6] },
            ...scenarioLines.ar.map(line => ({ text: line, style: "bodyAr" })),
          ],
        },
      ],
      columnGap: 24,
      margin: [0, 0, 0, 16],
    },
    { text: EN.employeeBreakdown, style: "sectionHeading", margin: [0, 16, 0, 8] },
    {
      table: {
        headerRows: 1,
        widths: ["*", "auto", "auto", "auto", "auto", "auto"],
        body: englishTableBody,
      },
      layout: "lightHorizontalLines",
    },
    { text: AR.employeeBreakdown, style: "sectionHeadingAr", margin: [0, 16, 0, 8] },
    {
      table: {
        headerRows: 1,
        widths: ["*", "auto", "auto", "auto", "auto", "auto"],
        body: arabicTableBody,
      },
      layout: "lightHorizontalLines",
    },
  ]

  if (employeeDetailsSections.length > 0) {
    content.push(
      { text: EN.employeeBreakdown, style: "sectionHeading", margin: [0, 24, 0, 8] },
      { text: AR.employeeBreakdown, style: "sectionHeadingAr", margin: [0, 0, 0, 8] },
      ...employeeDetailsSections,
    )
  }

  return {
    info: {
      title: `${EN.reportTitle} - ${run.period ?? formatDate(run.startDate)}`,
    },
    pageMargins: [40, 56, 40, 56],
    defaultStyle: {
      font: "Inter",
      fontSize: 10,
      color: "#111827",
    },
    styles: {
      brandEn: { font: "Inter", fontSize: 12, bold: true, color: "#0f172a" },
      brandAr: { font: "Amiri", fontSize: 12, bold: true, color: "#0f172a", alignment: "right" },
      titleEn: { font: "Inter", fontSize: 18, bold: true, color: "#111827" },
      titleAr: { font: "Amiri", fontSize: 18, bold: true, color: "#111827", alignment: "right" },
      sectionHeading: { font: "Inter", fontSize: 12, bold: true, color: "#0f172a" },
      sectionHeadingAr: { font: "Amiri", fontSize: 12, bold: true, color: "#0f172a", alignment: "right" },
      tableHeader: { font: "Inter", fontSize: 10, bold: true, color: "#0f172a", fillColor: "#f8fafc" },
      tableHeaderAr: { font: "Amiri", fontSize: 10, bold: true, color: "#0f172a", alignment: "right", fillColor: "#f8fafc" },
      tableCell: { font: "Inter", fontSize: 9, color: "#0f172a" },
      tableCellAr: { font: "Amiri", fontSize: 9, color: "#0f172a", alignment: "right" },
      tableSubtext: { font: "Inter", fontSize: 8, color: "#475569" },
      tableSubtextAr: { font: "Amiri", fontSize: 8, color: "#475569", alignment: "right" },
      tableSubtextMuted: { font: "Inter", fontSize: 8, color: "#94a3b8" },
      tableSubtextMutedAr: { font: "Amiri", fontSize: 8, color: "#94a3b8", alignment: "right" },
      bodyEn: { font: "Inter", fontSize: 10, color: "#111827", margin: [0, 0, 0, 2] },
      bodyAr: { font: "Amiri", fontSize: 10, color: "#111827", margin: [0, 0, 0, 2], alignment: "right" },
      bodyEnBold: { font: "Inter", fontSize: 11, bold: true, color: "#0f172a", margin: [0, 0, 0, 2] },
      bodyArBold: { font: "Amiri", fontSize: 11, bold: true, color: "#0f172a", margin: [0, 0, 0, 2], alignment: "right" },
      bodyEnMuted: { font: "Inter", fontSize: 9, color: "#64748b", margin: [0, 0, 0, 2] },
      bodyArMuted: { font: "Amiri", fontSize: 9, color: "#64748b", alignment: "right", margin: [0, 0, 0, 2] },
      muted: { font: "Inter", fontSize: 9, color: "#64748b" },
      mutedAr: { font: "Amiri", fontSize: 9, color: "#64748b", alignment: "right" },
    },
    footer: (currentPage: number, pageCount: number) => ({
      columns: [
        { text: brand.name || "HRPayMaster", style: "muted" },
        { text: `${currentPage} / ${pageCount}`, style: "muted", alignment: "right" },
      ],
      margin: [40, 0, 40, 24],
    }),
    content,
  }
}

export function openPayrollRunReport(run: PayrollRunWithEntries) {
  const doc = buildDoc(run)
  openPdf(doc)
}
