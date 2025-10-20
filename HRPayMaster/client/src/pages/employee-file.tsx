import { useEffect } from "react";
import { useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/http";
import { buildEmployeeFileReport, openPdf } from "@/lib/pdf";
import { getQueryFn } from "@/lib/queryClient";
import { expandEventsWithRecurringAllowances, parseDateInput } from "@/lib/employee-events";
import type { EmployeeEvent } from "@shared/schema";

export default function EmployeeFile() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const id = params.get('id') || '';
  const rawLanguage = (params.get('lang') || 'en').toLowerCase();
  const language: 'en' | 'ar' = rawLanguage === 'ar' ? 'ar' : 'en';
  const { data: employee } = useQuery<any>({
    queryKey: ["/api/employees", id],
    enabled: !!id,
    queryFn: getQueryFn({ on401: "returnNull" }),
  });
  const { data: events } = useQuery<EmployeeEvent[]>({
    queryKey: ["/api/employee-events"],
    enabled: !!id,
    queryFn: getQueryFn({ on401: "returnNull" }),
  });
  const { data: loans = [] } = useQuery<any[]>({
    queryKey: ["/api/loans"],
    enabled: !!id,
    queryFn: getQueryFn({ on401: "returnNull" }),
  });
  const { data: assetAssignments = [] } = useQuery<any[]>({
    queryKey: ["/api/asset-assignments"],
    enabled: !!id,
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  // Optional payroll report for period
  const searchParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const startDate = searchParams.get('startDate') || '';
  const endDate = searchParams.get('endDate') || '';
  const { data: report = [] } = useQuery<any[]>({
    queryKey: ["/api/reports/employees", id, startDate, endDate],
    enabled: !!id && !!startDate && !!endDate,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      const res = await apiGet(`/api/reports/employees/${id}?${params.toString()}`);
      if (!res.ok) return [] as any[];
      return res.data as any[];
    }
  });

  useEffect(() => {
    try {
      if (employee && events) {
        const searchParams = new URLSearchParams(window.location.search);
        const sectionsParam = searchParams.get('sections') || '';
        const sections = new Set((sectionsParam || '').split(',').filter(Boolean));
        const evs = (events || []).filter((e) => e.employeeId === id);
        const expandedEvents = expandEventsWithRecurringAllowances(evs, {
          rangeStart: startDate || undefined,
          rangeEnd: endDate || undefined,
        });
        const sortedExpandedEvents = [...expandedEvents].sort((a, b) => {
          const aDate = parseDateInput(a.eventDate)?.getTime() ?? 0;
          const bDate = parseDateInput(b.eventDate)?.getTime() ?? 0;
          return aDate - bDate;
        });
        const eventDocuments = evs
          .filter((e) => e.documentUrl)
          .map((e) => ({
            title: String(e.title ?? ''),
            createdAt: String(e.eventDate ?? ''),
            url: String(e.documentUrl ?? ''),
          }));

        const employeeDocumentFields = [
          { title: 'Visa Document', url: employee?.visaImage },
          { title: 'Civil ID Document', url: employee?.civilIdImage },
          { title: 'Passport Document', url: employee?.passportImage },
          { title: 'Driving License Document', url: employee?.drivingLicenseImage },
          { title: 'Additional Documents', url: employee?.additionalDocs },
          { title: 'Other Documents', url: employee?.otherDocs },
        ];

        const directDocuments = employeeDocumentFields
          .map((doc) => ({
            title: doc.title,
            url: typeof doc.url === 'string' ? doc.url.trim() : '',
          }))
          .filter((doc) => doc.url.length > 0)
          .map((doc) => ({
            title: doc.title,
            createdAt: undefined,
            url: doc.url,
          }));

        const docs = [...eventDocuments, ...directDocuments];
        const lns = (loans || [])
          .filter((l: any) => l.employeeId === id)
          .map((l: any) => ({
            amount: l.amount,
            remainingAmount: l.remainingAmount,
            monthlyDeduction: l.monthlyDeduction,
            status: l.status,
            startDate: l.startDate,
            endDate: l.endDate,
          }));
        const assignments = (assetAssignments || [])
          .filter((assignment: any) => assignment.employeeId === id)
          .map((assignment: any) => ({
            name: String(
              assignment.asset?.name ??
              assignment.assetName ??
              assignment.assetId ??
              ''
            ),
            type: String(
              assignment.asset?.type ??
              assignment.assetType ??
              ''
            ),
            status: String(
              assignment.status ??
              assignment.asset?.status ??
              assignment.assetStatus ??
              ''
            ),
            assignedDate: assignment.assignedDate,
            returnDate: assignment.returnDate,
            notes: String(
              assignment.notes ??
              assignment.asset?.details ??
              ''
            ),
          }));
        const doc = buildEmployeeFileReport({
          employee: {
            id: String(employee.id),
            firstName: String(employee.firstName ?? ''),
            lastName: String(employee.lastName ?? ''),
            arabicName: employee.arabicName,
            employeeCode: employee.employeeCode,
            position: employee.position,
            profileImage: employee.profileImage,
          },
          events: sortedExpandedEvents.map((e) => {
            const raw =
              typeof e.amount === 'number'
                ? e.amount
                : e.amount != null && e.amount !== ''
                  ? Number(e.amount)
                  : undefined;
            const amount = typeof raw === 'number' && Number.isFinite(raw) ? raw : undefined;
            return {
              title: String(e.title ?? ''),
              eventDate: String(e.eventDate ?? ''),
              amount,
            };
          }),
          loans: sections.size === 0 || sections.has('loans') ? lns : [],
          documents: sections.size === 0 || sections.has('documents') ? docs : [],
          assets: sections.size === 0 || sections.has('assets') ? assignments : undefined,
          language,
        });
        // Optional breakdown and narrative
        if (sections.has('breakdown')) {
          const byYear: Record<string, { bonus: number; commission: number; allowance: number; overtime: number; deduction: number; penalty: number }> = {};
          for (const e of sortedExpandedEvents.filter((ev) => ev.employeeId === id && ev.affectsPayroll)) {
            const y = new Date(e.eventDate).getFullYear().toString();
            byYear[y] ??= { bonus: 0, commission: 0, allowance: 0, overtime: 0, deduction: 0, penalty: 0 };
            const amt = parseFloat(e.amount || '0') || 0;
            if (e.eventType in byYear[y]) (byYear[y] as any)[e.eventType] += amt;
          }
          const rows = [[ 'Year', 'Bonus', 'Commission', 'Allowance', 'Overtime', 'Deductions', 'Penalties' ]] as any[];
          Object.keys(byYear).sort().forEach(y => {
            const s = byYear[y];
            rows.push([ y, s.bonus.toFixed(2), s.commission.toFixed(2), s.allowance.toFixed(2), s.overtime.toFixed(2), s.deduction.toFixed(2), s.penalty.toFixed(2) ]);
          });
          (doc.content as any[]).push({ text: 'Payroll Breakdown', style: 'section', pageBreak: 'before' });
          (doc.content as any[]).push({ table: { headerRows: 1, widths: ['auto','auto','auto','auto','auto','auto','auto'], body: rows } });
          const myLoans = (loans || []).filter((l: any) => l.employeeId === id);
          if (myLoans.length > 0) {
            (doc.content as any[]).push({ text: 'Loan Summary', style: 'section', margin: [0,10,0,0] });
            const items: any[] = [];
            for (const l of myLoans) {
              const amount = Number(l.amount||'0');
              const remaining = Number(l.remainingAmount || '0');
              const monthly = Number(l.monthlyDeduction || '0');
              const expectedMonths = monthly > 0 ? Math.ceil(amount / monthly) : 0;
              const actualMonths = l.startDate && l.endDate ? Math.ceil((new Date(l.endDate).getTime() - new Date(l.startDate).getTime()) / (30*24*60*60*1000)) : undefined;
              const line = actualMonths !== undefined
                ? `Loan ${amount.toFixed(2)}; monthly ${monthly.toFixed(2)}; expected ${expectedMonths} months; returned in ${actualMonths} months`
                : `Loan ${amount.toFixed(2)}; monthly ${monthly.toFixed(2)}; expected ${expectedMonths} months; remaining ${remaining.toFixed(2)}`;
              items.push(line);
            }
            (doc.content as any[]).push({ ul: items });
          }
        }

        // Payroll Timeline (if date range is provided)
        if (report && Array.isArray(report) && report.length > 0) {
          (doc.content as any[]).push({ text: 'Payroll Timeline', style: 'section', pageBreak: 'before' });
          const timelineRows: any[] = [[ 'Period', 'Gross', 'Net', 'Bonuses', 'Deductions' ]];
          for (const p of report) {
            const gross = (p.payrollEntries || []).reduce((s: number, e: any) => s + Number(e.grossPay||0), 0);
            const net = Number(p.totals?.netPay || 0);
            const bonuses = Number(p.totals?.bonuses || 0);
            const deductions = Number(p.totals?.deductions || 0);
            timelineRows.push([ p.period, gross.toFixed(2), net.toFixed(2), bonuses.toFixed(2), deductions.toFixed(2) ]);
          }
          ;(doc.content as any[]).push({ table: { headerRows: 1, widths: ['auto','auto','auto','auto','auto'], body: timelineRows } });
        }
        openPdf(doc);
      }
    } catch (err) {
      console.error('Failed to generate employee file PDF', err);
    }
  }, [employee, events, loans, assetAssignments, id, language]);

  return null;
}
