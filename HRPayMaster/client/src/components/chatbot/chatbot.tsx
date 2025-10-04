import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  Employee,
  InsertEmployeeEvent,
  InsertVacationRequest,
  InsertPayrollRun,
} from "@shared/schema";
import { resolveDate, ChatIntent } from "@shared/chatbot";
import { differenceInCalendarDays } from "date-fns";
import { apiGet, apiPost } from "@/lib/http";
import { getNewTabRel } from "@/lib/utils";
import { buildBilingualActionReceipt, buildAndEncodePdf } from "@/lib/pdf";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTranslation } from "react-i18next";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import ImageUpload from "@/components/ui/image-upload";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus } from "lucide-react";

interface Message {
  from: "bot" | "user";
  text: string;
}

type DocumentStatus = 'no-expiry' | 'active' | 'expiring' | 'expired';

interface PendingIntent {
  type: ChatIntent;
  data: {
    amount?: number;
    date?: string;
    reason?: string;
    startDate?: string;
    endDate?: string;
    period?: string;
    monthlyDeduction?: number;
    assetId?: string;
    carId?: string;
    title?: string;
    field?: string;
    value?: string;
  };
  confirm?: boolean;
}

export function Chatbot() {
  const { t } = useTranslation();
  const { data: employees = [] } = useQuery<Employee[]>({ queryKey: ["/api/employees"] });
  const { data: assets = [] } = useQuery<any[]>({ queryKey: ["/api/assets"] });
  const { data: assetAssignments = [] } = useQuery<any[]>({ queryKey: ["/api/asset-assignments"] });
  const { data: vacations = [] } = useQuery<any[]>({ queryKey: ["/api/vacations"] });
  const { data: cars = [] } = useQuery<any[]>({ queryKey: ["/api/cars"] });
  const { data: carAssignments = [] } = useQuery<any[]>({ queryKey: ["/api/car-assignments"] });
  const [selectedEmployee, setSelectedEmployee] = useState<string>("");
  const [selectedIntent, setSelectedIntent] = useState<ChatIntent | "">("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState<PendingIntent | null>(null);
  const [currentDate] = useState(new Date());
  const [docs, setDocs] = useState<any[] | null>(null);
  const [tab, setTab] = useState<"chat" | "drawer">("chat");
  const [drawerQuery, setDrawerQuery] = useState("");
  const [drawerEmployeeId, setDrawerEmployeeId] = useState<string>("");
  const [docCategoryFilter, setDocCategoryFilter] = useState<string>("");
  const [docStatusFilter, setDocStatusFilter] = useState<"all" | "active" | "expiring" | "expired">("all");
  const [docForm, setDocForm] = useState({
    title: "",
    description: "",
    employeeId: "",
    category: "",
    tags: "",
    referenceNumber: "",
    controllerNumber: "",
    expiryDate: "",
    alertDays: "30",
  });
  const [docUpload, setDocUpload] = useState<string | undefined>();
  const [docSaving, setDocSaving] = useState(false);

  const { toast } = useToast();

  const { data: companyDocuments = [], refetch: refetchCompanyDocuments, isFetching: documentsLoading } = useQuery<any[]>({
    queryKey: ["/api/documents"],
    enabled: tab === "drawer",
  });
  const employeeLookup = useMemo(() => {
    const lookup = new Map<string, Employee>();
    employees.forEach((emp) => {
      if (emp?.id) {
        lookup.set(emp.id, emp);
      }
    });
    return lookup;
  }, [employees]);

  const uniqueCategories = useMemo(() => {
    const categories = new Set<string>();
    (companyDocuments || []).forEach((doc: any) => {
      if (doc?.category) {
        categories.add(doc.category);
      }
    });
    return Array.from(categories).sort((a, b) => a.localeCompare(b));
  }, [companyDocuments]);

    const computeDocumentStatus = (doc: any): { status: DocumentStatus; daysRemaining: number | null } => {
    if (!doc?.expiryDate) {
      return { status: 'no-expiry', daysRemaining: null };
    }
    const diff = differenceInCalendarDays(new Date(doc.expiryDate), new Date());
    if (Number.isNaN(diff)) {
      return { status: 'no-expiry', daysRemaining: null };
    }
    if (diff < 0) {
      return { status: 'expired', daysRemaining: diff };
    }
    const parsedAlert = Number(doc.alertDays ?? 30);
    const threshold = Number.isNaN(parsedAlert) ? 30 : parsedAlert;
    if (diff <= threshold) {
      return { status: 'expiring', daysRemaining: diff };
    }
    return { status: 'active', daysRemaining: diff };
  };

  const expiryStats = useMemo(() => {
    let expired = 0;
    let expiring = 0;
    (companyDocuments || []).forEach((doc: any) => {
      const { status } = computeDocumentStatus(doc);
      if (status === 'expired') expired += 1;
      if (status === 'expiring') expiring += 1;
    });
    return {
      total: (companyDocuments || []).length,
      expired,
      expiring,
    };
  }, [companyDocuments]);

  const selectedEmployeeRecord = selectedEmployee ? employeeLookup.get(selectedEmployee) : undefined;
  const employeeDisplayName = selectedEmployeeRecord
    ? [selectedEmployeeRecord.firstName, selectedEmployeeRecord.lastName].filter(Boolean).join(" ").trim() ||
      selectedEmployeeRecord.employeeCode ||
      selectedEmployeeRecord.id ||
      "Employee"
    : "Employee";
  const employeePhoneLabel = selectedEmployeeRecord?.phone?.trim() || "N/A";
  const receiptEmployee = {
    firstName: selectedEmployeeRecord?.firstName ?? employeeDisplayName,
    lastName: selectedEmployeeRecord?.lastName ?? "",
    id: selectedEmployee ?? selectedEmployeeRecord?.id ?? "",
    position: selectedEmployeeRecord?.position ?? null,
    phone: selectedEmployeeRecord?.phone ?? null,
    employeeCode: selectedEmployeeRecord?.employeeCode ?? null,
    profileImage: selectedEmployeeRecord?.profileImage ?? null,
  };
  const employeeLine = `${employeeDisplayName} (Phone: ${employeePhoneLabel})`;

  const buildReceiptDocument = (config: {
    titleEn: string;
    titleAr?: string;
    subheadingEn?: string;
    subheadingAr?: string;
    bodyEn: string;
    bodyAr?: string;
    detailsEn: string[];
    detailsAr?: string[];
    docNumber?: string;
    issuedDate?: string;
  }) =>
    buildBilingualActionReceipt({
      titleEn: config.titleEn,
      titleAr: config.titleAr ?? config.titleEn,
      subheadingEn: config.subheadingEn,
      subheadingAr: config.subheadingAr ?? config.subheadingEn,
      bodyEn: config.bodyEn,
      bodyAr: config.bodyAr ?? config.bodyEn,
      detailsEn: config.detailsEn,
      detailsAr: config.detailsAr ?? config.detailsEn,
      docNumber: config.docNumber,
      issuedDate: config.issuedDate,
      employee: receiptEmployee,
    });
  const filteredDocs = useMemo(() => {
    const docs = (companyDocuments || []) as any[];
    const query = drawerQuery.trim().toLowerCase();
    return docs
      .filter((doc) => {
        if (drawerEmployeeId && doc.employeeId !== drawerEmployeeId) {
          return false;
        }
        if (docCategoryFilter && (doc.category || '') !== docCategoryFilter) {
          return false;
        }
        const { status } = computeDocumentStatus(doc);
        if (docStatusFilter === 'expired' && status !== 'expired') {
          return false;
        }
        if (docStatusFilter === 'expiring' && status !== 'expiring') {
          return false;
        }
        if (docStatusFilter === 'active' && ['active', 'no-expiry'].indexOf(status) === -1) {
          return false;
        }
        if (!query) {
          return true;
        }
        const employee = doc.employeeId ? employeeLookup.get(doc.employeeId) : undefined;
        const fullName = [employee?.firstName, employee?.lastName].filter(Boolean).join(' ').trim();
        const haystack = [
          doc.title,
          doc.description,
          doc.category,
          doc.tags,
          doc.referenceNumber,
          doc.controllerNumber,
          doc.employeeId,
          fullName,
          employee?.firstName,
          employee?.lastName,
          employee?.employeeCode,
          employee?.civilId,
          employee?.phone,
        ];
        return haystack.some((value) => typeof value === 'string' && value.toLowerCase().includes(query));
      })
      .sort((a, b) => {
        const aDate = new Date(a.createdAt ?? a.expiryDate ?? 0).getTime();
        const bDate = new Date(b.createdAt ?? b.expiryDate ?? 0).getTime();
        return bDate - aDate;
      });
  }, [companyDocuments, drawerQuery, drawerEmployeeId, docCategoryFilter, docStatusFilter, employeeLookup]);

  const handleCreateDocument = async () => {
    if (!docForm.title.trim()) {
      toast({
        title: 'Missing title',
        description: 'Please provide a title for the document.',
        variant: 'destructive',
      });
      return;
    }
    if (!docUpload) {
      toast({
        title: 'Upload required',
        description: 'Upload a PDF or image before saving.',
        variant: 'destructive',
      });
      return;
    }

    setDocSaving(true);
    try {
      const payload: Record<string, any> = {
        title: docForm.title.trim(),
        pdfDataUrl: docUpload,
      };
      if (docForm.description.trim()) payload.description = docForm.description.trim();
      if (docForm.employeeId) payload.employeeId = docForm.employeeId;
      if (docForm.category.trim()) payload.category = docForm.category.trim();
      if (docForm.tags.trim()) payload.tags = docForm.tags.trim();
      if (docForm.referenceNumber.trim()) payload.referenceNumber = docForm.referenceNumber.trim();
      if (docForm.controllerNumber.trim()) payload.controllerNumber = docForm.controllerNumber.trim();
      if (docForm.expiryDate) payload.expiryDate = docForm.expiryDate;
      if (docForm.alertDays) {
        const parsed = Number(docForm.alertDays);
        if (!Number.isNaN(parsed)) {
          payload.alertDays = parsed;
        }
      }

      const res = await apiPost('/api/documents', payload);
      if (!res.ok) {
        throw new Error(res.error || 'Failed to save document');
      }

      toast({
        title: 'Document saved',
        description: 'Document has been uploaded to the drawer.',
      });

      setDocForm({
        title: '',
        description: '',
        employeeId: '',
        category: '',
        tags: '',
        referenceNumber: '',
        controllerNumber: '',
        expiryDate: '',
        alertDays: '30',
      });
      setDocUpload(undefined);
      await refetchCompanyDocuments();
    } catch (error) {
      console.error('Failed to create document', error);
      toast({
        title: 'Failed to save document',
        description: error instanceof Error ? error.message : 'Please try again shortly.',
        variant: 'destructive',
      });
    } finally {
      setDocSaving(false);
    }
  };

  useEffect(() => { setDocs(null); }, [selectedEmployee]);

  useEffect(() => {
    setMessages([{ from: "bot", text: t("chatbot.selectAction") }]);
  }, [t]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();

    if (pending) {
      if (!text) return;
      setInput("");
      setMessages((m) => [...m, { from: "user", text }]);
      await handlePending(text);
      return;
    }

    setInput("");

    // Ensure an employee is selected for intents that require it
    if (!selectedEmployee) {
      setMessages((m) => [
        ...m,
        { from: "bot", text: "Please select an employee first." },
      ]);
      return;
    }

    if (!selectedIntent) {
      setMessages((m) => [
        ...m,
        { from: "bot", text: t("chatbot.selectAction") },
      ]);
      return;
    }

    // reset contextual panels
    setDocs(null);

    setMessages((m) => [
      ...m,
      { from: "user", text: t(`chatbot.intents.${selectedIntent}`) },
    ]);

    switch (selectedIntent) {
      case "employeeDocuments": {
        try {
          const res = await apiGet('/api/employee-events');
          if (!res.ok) throw new Error(res.error);
          const all = (res.data as any[]) || [];
          const list = all.filter(e => e.employeeId === selectedEmployee && e.documentUrl).sort((a:any,b:any)=> +new Date(b.createdAt || b.eventDate) - +new Date(a.createdAt || a.eventDate)).slice(0,20);
          setDocs(list);
          setMessages((m)=>[...m,{from:'bot', text: list.length ? `Found ${list.length} document(s).` : 'No documents found.'}]);
        } catch {
          setMessages((m)=>[...m,{from:'bot', text:'Failed to load documents.'}]);
        }
        break;
      }
      case "addBonus":
        setPending({ type: "addBonus", data: {} });
        setMessages((m) => [...m, { from: "bot", text: "Sure, what's the amount?" }]);
        break;
      case "addDeduction":
        setPending({ type: "addDeduction", data: {} });
        setMessages((m) => [...m, { from: "bot", text: "Deduction amount?" }]);
        break;
      case "requestVacation":
        setPending({ type: "requestVacation", data: {} });
        setMessages((m) => [...m, { from: "bot", text: "When does the vacation start?" }]);
        break;
      case "cancelVacation":
        setPending({ type: "cancelVacation", data: {} });
        setMessages((m) => [...m, { from: "bot", text: "Confirm cancel latest vacation request? (yes/no)" }]);
        break;
      case "changeVacation":
        setPending({ type: "changeVacation", data: {} });
        setMessages((m) => [...m, { from: "bot", text: "New start date?" }]);
        break;
      case "assignAsset":
        setPending({ type: "assignAsset", data: {} });
        setMessages((m) => [...m, { from: "bot", text: "Asset name or ID?" }]);
        break;
      case "assetDocument":
        setPending({ type: "assetDocument", data: {} });
        setMessages((m) => [...m, { from: "bot", text: "Asset name or ID?" }]);
        break;
      case "returnAsset":
        setPending({ type: "returnAsset", data: {} });
        setMessages((m) => [...m, { from: "bot", text: "Asset name or ID?" }]);
        break;
      case "assignCar":
        setPending({ type: "assignCar", data: {} });
        setMessages((m) => [...m, { from: "bot", text: "Car plate or ID?" }]);
        break;
      case "returnCar":
        setPending({ type: "returnCar", data: {} });
        setMessages((m) => [...m, { from: "bot", text: "Car plate or ID?" }]);
        break;
      case "runPayroll":
        setPending({ type: "runPayroll", data: {} });
        setMessages((m) => [...m, { from: "bot", text: "What is the payroll period name?" }]);
        break;
      case "createLoan":
        setPending({ type: "createLoan", data: {} });
        setMessages((m)=>[...m,{from:'bot', text:'Loan amount?'}]);
        break;
      case "updateLoan":
        setPending({ type: "updateLoan", data: {} });
        setMessages((m)=>[...m,{from:'bot', text:'New monthly deduction?'}]);
        break;
      case "updateEmployee":
        setPending({ type: "updateEmployee", data: {} });
        setMessages((m)=>[...m,{from:'bot', text:'Which field (position, phone, email, status)?'}]);
        break;
      case "loanStatus":
        try {
          const res = await apiGet(
            `/api/chatbot/loan-status/${selectedEmployee}`
          );
          if (res.ok) {
            const data: any = res.data;
            setMessages((m) => [
              ...m,
              { from: "bot", text: `Loan balance is ${data.balance}.` },
            ]);
          } else {
            const code = res.error?.error?.code || "general";
            setMessages((m) => [
              ...m,
              { from: "bot", text: t(`errors.${code}`) },
            ]);
          }
        } catch (err) {
          console.error("Loan status request failed", err);
          setMessages((m) => [
            ...m,
            { from: "bot", text: t("errors.general") },
          ]);
        }
        break;
      case "employeeInfo":
        try {
          const res = await apiGet(`/api/chatbot/employee-summary/${selectedEmployee}`);
          if (res.ok) {
            const d: any = res.data;
            const assetList = (d.assets || []).map((a: any) => a.name || a.id).join(', ') || 'None';
            const carText = d.car ? d.car.plateNumber : 'None';
            const loansText = `Taken: ${d.loans.totalTaken}, Remaining: ${d.loans.remaining}, Monthly: ${d.loans.monthly}`;
            const completion = d.loans.completionDate ? `, Forecast completion: ${d.loans.completionDate}` : '';
            setMessages((m)=>[...m,{from:'bot', text: `Employee: ${d.employee.firstName} ${d.employee.lastName}. Assets: ${assetList}. Car: ${carText}. Loans: ${loansText}${completion}.` }]);
          } else {
            setMessages((m)=>[...m,{from:'bot',text:'Unable to fetch employee info.'}]);
          }
        } catch (e) {
          setMessages((m)=>[...m,{from:'bot',text:'Unable to fetch employee info.'}]);
        }
        break;
          case "reportSummary":
            try {
              const res = await apiGet(
                `/api/chatbot/report-summary/${selectedEmployee}`
              );
              if (res.ok) {
                const data: any = res.data;
                setMessages((m) => [
                  ...m,
                  {
                    from: "bot",
                    text: `Bonuses: ${data.bonuses}, Deductions: ${data.deductions}, Net Pay: ${data.netPay}.`,
                  },
                ]);
              } else {
                const code = res.error?.error?.code || "general";
                setMessages((m) => [
                  ...m,
                  { from: "bot", text: t(`errors.${code}`) },
                ]);
              }
            } catch (err) {
              console.error("Report summary request failed", err);
              setMessages((m) => [
                ...m,
                { from: "bot", text: t("errors.general") },
              ]);
            }
            break;
          case "monthlySummary":
            try {
              const res = await apiGet(
                `/api/chatbot/monthly-summary/${selectedEmployee}`
              );
              if (res.ok) {
                const data: any = res.data;
                const eventsText =
                  data.events && data.events.length
                    ? data.events.map((e: any) => e.title).join(", ")
                    : "No events";
                setMessages((m) => [
                  ...m,
                  {
                    from: "bot",
                    text: `Gross: ${data.payroll.gross}, Net: ${data.payroll.net}, Loan balance: ${data.loanBalance}. Events: ${eventsText}.`,
                  },
                ]);
              } else {
                const code = res.error?.error?.code || "general";
                setMessages((m) => [
                  ...m,
                  { from: "bot", text: t(`errors.${code}`) },
                ]);
              }
            } catch (err) {
              console.error("Monthly summary request failed", err);
              setMessages((m) => [
                ...m,
                { from: "bot", text: t("errors.general") },
              ]);
            }
            break;
          default:
            break;
        }
      };

  const handlePending = async (text: string) => {
    if (!pending) return;
    const lower = text.toLowerCase();

    if (pending.confirm) {
      if (lower.startsWith("y")) {
        // User confirmed action
        switch (pending.type) {
          case "addBonus":
          case "addDeduction": {
            const eventData: InsertEmployeeEvent = {
              employeeId: selectedEmployee,
              eventType: pending.type === "addBonus" ? "bonus" : "deduction",
              title: pending.type === "addBonus" ? "Bonus" : "Deduction",
              description: pending.data.reason!,
              amount: pending.data.amount?.toString() || "0",
              eventDate: pending.data.date!,
              affectsPayroll: true,
              status: "active",
            };
            try {
              const res = await apiPost("/api/employee-events", eventData);
              if (!res.ok) throw new Error(res.error);
              // Build and save document



            const isBonus = pending.type === "addBonus";
            const amountText = (pending.data.amount ?? 0).toString();
            const effectiveDate = pending.data.date ?? new Date().toISOString().split("T")[0];
            const reasonText = pending.data.reason?.trim() || "No reason provided";
            const doc = buildReceiptDocument({
              titleEn: isBonus ? "Bonus Granted" : "Deduction Issued",
              subheadingEn: `${isBonus ? 'Bonus' : 'Deduction'} ${amountText}`,
              bodyEn: `This document confirms that ${employeeLine} ${isBonus ? "received" : "is subject to"} ${isBonus ? "a bonus" : "a deduction"} of ${amountText} on ${effectiveDate}. Reason: ${reasonText}.`,
              detailsEn: [
                `Amount: ${amountText}`,
                `Effective date: ${effectiveDate}`,
                `Reason: ${reasonText}`,
              ],
            });
            const pdfDataUrl = await buildAndEncodePdf(doc);
            await apiPost(`/api/employees/${selectedEmployee}/documents`, { title: isBonus ? "Bonus Receipt" : "Deduction Receipt", description: isBonus ? "Bonus action receipt" : "Deduction action receipt", pdfDataUrl });



              setMessages((m) => [
                ...m,
                {
                  from: "bot",
                  text:
                    pending.type === "addBonus"
                      ? `Bonus of ${pending.data.amount} added for ${pending.data.date}.`
                      : `Deduction of ${pending.data.amount} recorded for ${pending.data.date}.`,
                },
              ]);
            } catch (err) {
              console.error("Employee event request failed", err);
              setMessages((m) => [
                ...m,
                { from: "bot", text: "Could not connect to server" },
              ]);
            }
            break;
          }
          case "requestVacation": {
            const days =
              differenceInCalendarDays(
                new Date(pending.data.endDate!),
                new Date(pending.data.startDate!)
              ) + 1;
            const vacation: InsertVacationRequest = {
              employeeId: selectedEmployee,
              startDate: pending.data.startDate!,
              endDate: pending.data.endDate!,
              days,
              reason: pending.data.reason,
              leaveType: "annual",
              deductFromSalary: false,
              status: "approved",
            };
            try {
              const res = await apiPost("/api/vacations", vacation);
              if (!res.ok) throw new Error(res.error);
              // Save bilingual document for vacation approval


            const reasonText = vacation.reason?.trim() || "No reason provided";
            const doc = buildReceiptDocument({
              titleEn: "Vacation Approved",
              subheadingEn: `${vacation.startDate} ? ${vacation.endDate}`,
              bodyEn: `This document confirms that ${employeeLine} is approved for vacation from ${vacation.startDate} to ${vacation.endDate} covering ${vacation.days} day(s). Reason: ${reasonText}.`,
              detailsEn: [
                `Start date: ${vacation.startDate}`,
                `End date: ${vacation.endDate}`,
                `Total days: ${vacation.days}`,
                `Reason: ${reasonText}`,
              ],
            });

              setMessages((m) => [
                ...m,
                {
                  from: "bot",
                  text: `Vacation from ${vacation.startDate} to ${vacation.endDate} recorded.`,
                },
              ]);
            } catch (err) {
              console.error("Vacation request failed", err);
              setMessages((m) => [
                ...m,
                { from: "bot", text: "Could not connect to server" },
              ]);
            }
            break;
          }
          case "runPayroll": {
            const payroll: InsertPayrollRun = {
              period: pending.data.period!,
              startDate: pending.data.startDate!,
              endDate: pending.data.endDate!,
              grossAmount: "0",
              totalDeductions: "0",
              netAmount: "0",
            };
            try {
              const res = await apiPost("/api/payroll/generate", payroll);
              if (!res.ok) throw new Error(res.error);


            const doc = buildReceiptDocument({
              titleEn: "Payroll Generated",
              subheadingEn: payroll.period,
              bodyEn: `This document confirms that payroll for ${employeeLine} was generated for the period ${payroll.period} covering ${payroll.startDate} to ${payroll.endDate}.`,
              detailsEn: [
                `Period: ${payroll.period}`,
                `Start date: ${payroll.startDate}`,
                `End date: ${payroll.endDate}`,
              ],
            });

              setMessages((m) => [
                ...m,
                {
                  from: "bot",
                  text: `Payroll for ${payroll.period} generated.`,
                },
              ]);
            } catch (err) {
              console.error("Payroll generate request failed", err);
              setMessages((m) => [
                ...m,
                { from: "bot", text: "Could not connect to server" },
              ]);
            }
            break;
          }
        }
      } else {
        setMessages((m) => [...m, { from: "bot", text: "Action cancelled." }]);
      }
      setPending(null);
      return;
    }

    switch (pending.type) {
      case "addBonus":
      case "addDeduction": {
        if (pending.data.amount === undefined) {
          const amount = parseFloat(text);
          if (isNaN(amount)) {
            setMessages((m) => [
              ...m,
              { from: "bot", text: "Please provide a valid amount." },
            ]);
            return;
          }
          setPending({ ...pending, data: { amount } });
          setMessages((m) => [
            ...m,
            {
              from: "bot",
              text: "When should it apply? (e.g., 2024-05-01, next Friday, next month)",
            },
          ]);
          return;
        }
        if (!pending.data.date) {
          const date = resolveDate(text, currentDate);
          setPending({ ...pending, data: { ...pending.data, date } });
          setMessages((m) => [...m, { from: "bot", text: "Reason?" }]);
          return;
        }
        if (!pending.data.reason) {
          const reason = text;
          setPending({ ...pending, data: { ...pending.data, reason }, confirm: true });
          setMessages((m) => [
            ...m,
            {
              from: "bot",
              text: `Confirm ${
                pending.type === "addBonus" ? "bonus" : "deduction"
              } of ${pending.data.amount} on ${pending.data.date}? (yes/no)`,
            },
          ]);
          return;
        }
        break;
      }
      case "cancelVacation": {
        if (!pending.confirm) {
          if (lower.startsWith('y')) {
            const vac = (vacations || []).filter((v:any) => v.employeeId === selectedEmployee).sort((a:any,b:any) => +new Date(b.startDate) - +new Date(a.startDate))[0];
            if (!vac) {
              setMessages((m)=>[...m,{from:'bot',text:'No vacation found to cancel.'}]);
              setPending(null); return;
            }
            try {
              const res = await apiPost(`/api/vacations/${vac.id}`, { status: 'rejected' } as any);
              if (!res.ok) throw new Error(res.error);


            const doc = buildReceiptDocument({
              titleEn: "Vacation Cancelled",
              subheadingEn: `${vac.startDate} to ${vac.endDate}`,
              bodyEn: `This document confirms that the vacation for ${employeeLine} scheduled from ${vac.startDate} to ${vac.endDate} has been cancelled.`,
              detailsEn: [
                `Original start date: ${vac.startDate}`,
                `Original end date: ${vac.endDate}`,
              ],
            });

              setMessages((m)=>[...m,{from:'bot',text:'Vacation cancelled.'}]);
            } catch {
              setMessages((m)=>[...m,{from:'bot',text:'Failed to cancel vacation.'}]);
            }
          } else {
            setMessages((m)=>[...m,{from:'bot',text:'Action cancelled.'}]);
          }
          setPending(null);
          return;
        }
        break;
      }
      case "changeVacation": {
        if (!pending.data.startDate) {
          const startDate = resolveDate(text, currentDate);
          setPending({ ...pending, data: { ...pending.data, startDate } });
          setMessages((m)=>[...m,{from:'bot',text:'New end date?'}]);
          return;
        }
        if (!pending.data.endDate) {
          const endDate = resolveDate(text, currentDate);
          const vac = (vacations || []).filter((v:any)=> v.employeeId===selectedEmployee && v.status==='pending').sort((a:any,b:any)=> +new Date(b.startDate) - +new Date(a.startDate))[0];
          if (!vac) { setMessages((m)=>[...m,{from:'bot',text:'No pending vacation to change.'}]); setPending(null); return; }
          try {
            const res = await apiPost(`/api/vacations/${vac.id}`, { startDate: pending.data.startDate, endDate, status: 'pending' } as any);
            if (!res.ok) throw new Error(res.error);


            const doc = buildReceiptDocument({
              titleEn: "Vacation Updated",
              subheadingEn: `${pending.data.startDate} to ${endDate}`,
              bodyEn: `This document confirms that the vacation for ${employeeLine} has been updated to run from ${pending.data.startDate} to ${endDate}.`,
              detailsEn: [
                `New start date: ${pending.data.startDate}`,
                `New end date: ${endDate}`,
              ],
            });

            setMessages((m)=>[...m,{from:'bot', text:`Vacation updated to ${pending.data.startDate} to ${endDate}.`}]);
          } catch {
            setMessages((m)=>[...m,{from:'bot',text:'Failed to update vacation.'}]);
          }
          setPending(null); return;
        }
        break;
      }
      case "assignAsset": {
        if (!pending.data.reason && !pending.data.assetId) {
          // text contains asset name or id
          const asset = (assets || []).find((a:any) => a.id === text || a.name?.toLowerCase() === text.toLowerCase());
          if (!asset) { setMessages((m)=>[...m,{from:'bot',text:'Asset not found. Please provide exact name or ID.'}]); return; }
          setPending({ ...pending, data: { ...pending.data, assetId: asset.id } });
          setMessages((m)=>[...m,{from:'bot',text:'Assignment date? (yyyy-mm-dd)'}]);
          return;
        }
        if (!pending.data.date) {
          const assignedDate = resolveDate(text, currentDate);
          setPending({ ...pending, data: { ...pending.data, date: assignedDate } });
          setMessages((m)=>[...m,{from:'bot',text:'Any notes? (optional)'}]);
          return;
        }
        if (pending.data.reason === undefined) {
          const notes = text;
          try {
            const payload = { assetId: (pending.data as any).assetId, employeeId: selectedEmployee, assignedDate: (pending.data as any).date, status: 'active', notes };
            const res = await apiPost('/api/asset-assignments', payload);
            if (!res.ok) throw new Error(res.error);


            const assetName = (assets as any[]).find(a => a.id === (pending.data as any).assetId)?.name || (pending.data as any).assetId;
            const assignedDate = (pending.data as any).date;
            const doc = buildReceiptDocument({
              titleEn: "Asset Assigned",
              subheadingEn: assetName,
              bodyEn: `This document confirms that ${assetName} has been assigned to ${employeeLine} on ${assignedDate}. Notes: ${notes || 'None provided'}.`,
              detailsEn: [
                `Asset: ${assetName}`,
                `Assignment date: ${assignedDate}`,
                `Notes: ${notes || 'None provided'}`,
              ],
            });

            setMessages((m)=>[...m,{from:'bot',text:'Asset assigned.'}]);
          } catch {
            setMessages((m)=>[...m,{from:'bot',text:'Failed to assign asset.'}]);
          }
          setPending(null); return;
        }
        break;
      }
      case "assetDocument": {
        if (!(pending.data as any).assetId) {
          const asset = (assets || []).find((a:any) => a.id === text || a.name?.toLowerCase() === text.toLowerCase());
          if (!asset) { setMessages((m)=>[...m,{from:'bot',text:'Asset not found. Enter exact name or ID.'}]); return; }
          setPending({ ...pending, data: { ...pending.data, assetId: asset.id } });
          setMessages((m)=>[...m,{from:'bot',text:'Document title?'}]);
          return;
        }
        if (!(pending.data as any).title) {
          setPending({ ...pending, data: { ...pending.data, title: text } });
          setMessages((m)=>[...m,{from:'bot',text:'Paste document URL (can be data: URL)'}]);
          return;
        }
        if (!(pending.data as any).url) {
          const url = text;
          try {
            const res = await apiPost(`/api/assets/${(pending.data as any).assetId}/documents`, { title: (pending.data as any).title, description: (pending.data as any).title, documentUrl: url });
            if (!res.ok) throw new Error(res.error);
            setMessages((m)=>[...m,{from:'bot',text:'Asset document saved.'}]);
          } catch {
            setMessages((m)=>[...m,{from:'bot',text:'Failed to save asset document.'}]);
          }
          setPending(null); return;
        }
        break;
      }
      case "returnAsset": {
        if (!(pending.data as any).assetId) {
          const asset = (assets || []).find((a:any) => a.id === text || a.name?.toLowerCase() === text.toLowerCase());
          if (!asset) { setMessages((m)=>[...m,{from:'bot',text:'Asset not found. Enter exact name or ID.'}]); return; }
          setPending({ ...pending, data: { ...pending.data, assetId: asset.id } });
          setMessages((m)=>[...m,{from:'bot',text:'Confirm return today? (yes/no)'}]);
          return;
        }
        if (lower.startsWith('y')) {
          const asg = (assetAssignments || []).find((a:any) => a.assetId === (pending.data as any).assetId && a.employeeId === selectedEmployee && a.status === 'active');
          if (!asg) { setMessages((m)=>[...m,{from:'bot',text:'No active assignment found for this asset.'}]); setPending(null); return; }
          try {
            const today = new Date().toISOString().split('T')[0];
            const res = await apiPost(`/api/asset-assignments/${asg.id}`, { status: 'completed', returnDate: today } as any);
            if (!res.ok) throw new Error(res.error);


            const assetName = (assets as any[]).find(a => a.id === (pending.data as any).assetId)?.name || (pending.data as any).assetId;
            const doc = buildReceiptDocument({
              titleEn: "Asset Returned",
              subheadingEn: assetName,
              bodyEn: `This document confirms that ${assetName} has been returned by ${employeeLine} on ${today}.`,
              detailsEn: [
                `Asset: ${assetName}`,
                `Return date: ${today}`,
              ],
            });

            setMessages((m)=>[...m,{from:'bot',text:'Asset returned.'}]);
          } catch (e:any) {
            setMessages((m)=>[...m,{from:'bot',text:e?.message || 'Failed to return asset.'}]);
          }
          setPending(null); return;
        } else {
          setMessages((m)=>[...m,{from:'bot',text:'Action cancelled.'}]); setPending(null); return;
        }
      }
      case "assignCar": {
        if (!(pending.data as any).carId) {
          const car = (cars || []).find((c:any) => c.id === text || c.plateNumber?.toLowerCase() === text.toLowerCase());
          if (!car) { setMessages((m)=>[...m,{from:'bot',text:'Car not found. Enter exact plate or ID.'}]); return; }
          setPending({ ...pending, data: { ...pending.data, carId: car.id } });
          setMessages((m)=>[...m,{from:'bot',text:'Assignment date? (yyyy-mm-dd)'}]);
          return;
        }
        if (!(pending.data as any).date) {
          const date = resolveDate(text, currentDate);
          try {
            const res = await apiPost('/api/car-assignments', { carId: (pending.data as any).carId, employeeId: selectedEmployee, assignedDate: date, status: 'active' });
            if (!res.ok) throw new Error(res.error);


            const carRecord = (cars as any[]).find(c => c.id === (pending.data as any).carId);
            const carLabel = carRecord ? [carRecord.make, carRecord.model].filter(Boolean).join(" ") || carRecord.plateNumber || (pending.data as any).carId : (pending.data as any).carId;
            const licensePlate = carRecord?.plateNumber || (pending.data as any).carId;
            const doc = buildReceiptDocument({
              titleEn: "Car Assigned",
              subheadingEn: carLabel,
              bodyEn: `This document confirms that vehicle ${carLabel} (Plate: ${licensePlate}) has been assigned to ${employeeLine} on ${date}.`,
              detailsEn: [
                `Vehicle: ${carLabel}`,
                `Plate number: ${licensePlate}`,
                `Assignment date: ${date}`,
              ],
            });

            setMessages((m)=>[...m,{from:'bot',text:'Car assigned.'}]);
          } catch (e:any) {
            setMessages((m)=>[...m,{from:'bot',text: e?.message || 'Failed to assign car.'}]);
          }
          setPending(null); return;
        }
        break;
      }
      case "returnCar": {
        if (!(pending.data as any).carId) {
          const car = (cars || []).find((c:any) => c.id === text || c.plateNumber?.toLowerCase() === text.toLowerCase());
          if (!car) { setMessages((m)=>[...m,{from:'bot',text:'Car not found. Enter plate or ID.'}]); return; }
          setPending({ ...pending, data: { ...pending.data, carId: car.id } });
          setMessages((m)=>[...m,{from:'bot',text:'Confirm return today? (yes/no)'}]);
          return;
        }
        if (lower.startsWith('y')) {
          const asg = (carAssignments || []).find((a:any) => a.carId === (pending.data as any).carId && a.status === 'active');
          if (!asg) { setMessages((m)=>[...m,{from:'bot',text:'No active assignment found.'}]); setPending(null); return; }
          try {
            const today = new Date().toISOString().split('T')[0];
            const res = await apiPost(`/api/car-assignments/${asg.id}`, { status: 'completed', returnDate: today } as any);
            if (!res.ok) throw new Error(res.error);


            const carRecord = (cars as any[]).find(c => c.id === (pending.data as any).carId);
            const carLabel = carRecord ? [carRecord.make, carRecord.model].filter(Boolean).join(" ") || carRecord.plateNumber || (pending.data as any).carId : (pending.data as any).carId;
            const licensePlate = carRecord?.plateNumber || (pending.data as any).carId;
            const doc = buildReceiptDocument({
              titleEn: "Car Returned",
              subheadingEn: carLabel,
              bodyEn: `This document confirms that vehicle ${carLabel} (Plate: ${licensePlate}) has been returned by ${employeeLine} on ${today}.`,
              detailsEn: [
                `Vehicle: ${carLabel}`,
                `Plate number: ${licensePlate}`,
                `Return date: ${today}`,
              ],
            });

            setMessages((m)=>[...m,{from:'bot',text:'Car returned.'}]);
          } catch (e:any) {
            setMessages((m)=>[...m,{from:'bot',text:e?.message || 'Failed to return car.'}]);
          }
          setPending(null); return;
        } else {
          setMessages((m)=>[...m,{from:'bot',text:'Action cancelled.'}]); setPending(null); return;
        }
      }
      case "requestVacation": {
        if (!pending.data.startDate) {
          const startDate = resolveDate(text, currentDate);
          setPending({ ...pending, data: { ...pending.data, startDate } });
          setMessages((m) => [...m, { from: "bot", text: "When does it end?" }]);
          return;
        }
        if (!pending.data.endDate) {
          const endDate = resolveDate(text, currentDate);
          setPending({ ...pending, data: { ...pending.data, endDate } });
          setMessages((m) => [...m, { from: "bot", text: "Reason?" }]);
          return;
        }
        if (!pending.data.reason) {
          const reason = text;
          const start = pending.data.startDate!;
          const end = pending.data.endDate!;
          setPending({
            ...pending,
            data: { ...pending.data, reason },
            confirm: true,
          });
          setMessages((m) => [
            ...m,
            {
              from: "bot",
              text: `Confirm vacation from ${start} to ${end}? (yes/no)`,
            },
          ]);
          return;
        }
        break;
      }
      case "runPayroll": {
        if (!pending.data.period) {
          setPending({ ...pending, data: { period: text } });
          setMessages((m) => [...m, { from: "bot", text: "Start date?" }]);
          return;
        }
        if (!pending.data.startDate) {
          const startDate = resolveDate(text, currentDate);
          setPending({ ...pending, data: { ...pending.data, startDate } });
          setMessages((m) => [...m, { from: "bot", text: "End date?" }]);
          return;
        }
        if (!pending.data.endDate) {
          const endDate = resolveDate(text, currentDate);
          const data = { ...pending.data, endDate };
          setPending({ ...pending, data, confirm: true });
          setMessages((m) => [
            ...m,
            {
              from: "bot",
              text: `Confirm payroll for ${data.period} from ${data.startDate} to ${endDate}? (yes/no)`,
            },
          ]);
          return;
        }
        break;
      }
      case "createLoan": {
        if (pending.data.amount === undefined) {
          const v = parseFloat(text);
          if (isNaN(v)) { setMessages((m)=>[...m,{from:'bot', text:'Enter a valid amount.'}]); return; }
          setPending({ ...pending, data: { amount: v } });
          setMessages((m)=>[...m,{from:'bot', text:'Monthly deduction?'}]);
          return;
        }
        if (pending.data.monthlyDeduction === undefined) {
          const v = parseFloat(text);
          if (isNaN(v) || v <= 0) { setMessages((m)=>[...m,{from:'bot', text:'Enter a valid monthly deduction.'}]); return; }
          setPending({ ...pending, data: { ...pending.data, monthlyDeduction: v } });
          setMessages((m)=>[...m,{from:'bot', text:'Start date? (yyyy-mm-dd)'}]);
          return;
        }
        if (!pending.data.startDate) {
          const startDate = resolveDate(text, currentDate);
          const payload: any = {
            employeeId: selectedEmployee,
            amount: pending.data.amount,
            monthlyDeduction: pending.data.monthlyDeduction,
            startDate,
            status: 'active',
          };
          try {
            const res = await apiPost('/api/loans', payload);
            if (!res.ok) throw new Error(res.error);


            const amountText = payload.amount.toString();
            const monthlyText = payload.monthlyDeduction.toString();
            const doc = buildReceiptDocument({
              titleEn: "Loan Created",
              subheadingEn: `Amount ${amountText}`,
              bodyEn: `This document confirms that ${employeeLine} received a loan of ${amountText} starting ${payload.startDate} with a monthly deduction of ${monthlyText}.`,
              detailsEn: [
                `Principal: ${amountText}`,
                `Monthly deduction: ${monthlyText}`,
                `Start date: ${payload.startDate}`,
              ],
            });

            setMessages((m)=>[...m,{from:'bot', text:'Loan created.'}]);
          } catch {
            setMessages((m)=>[...m,{from:'bot', text:'Failed to create loan.'}]);
          }
          setPending(null); return;
        }
        break;
      }
      case "updateLoan": {
        if (pending.data.monthlyDeduction === undefined) {
          const v = parseFloat(text);
          if (isNaN(v) || v <= 0) { setMessages((m)=>[...m,{from:'bot', text:'Enter a valid monthly deduction.'}]); return; }
          const newMd = v;
          // choose latest active loan for employee
          try {
            const res = await apiGet('/api/loans');
            if (!res.ok) throw new Error(res.error);
            const loans: any[] = (res.data || []).filter((l:any)=> l.employeeId === selectedEmployee);
            const target = loans.sort((a,b)=> +new Date(b.startDate) - +new Date(a.startDate))[0];
            if (!target) { setMessages((m)=>[...m,{from:'bot', text:'No loan found to update.'}]); setPending(null); return; }
            const up = await apiPost(`/api/loans/${target.id}`, { monthlyDeduction: newMd } as any);
            if (!up.ok) throw new Error(up.error);


            const doc = buildReceiptDocument({
              titleEn: "Loan Updated",
              subheadingEn: `Monthly deduction ${newMd}`,
              bodyEn: `This document confirms that the loan for ${employeeLine} now has a monthly deduction of ${newMd}.`,
              detailsEn: [
                `Updated monthly deduction: ${newMd}`,
              ],
            });

            setMessages((m)=>[...m,{from:'bot', text:'Loan updated.'}]);
          } catch {
            setMessages((m)=>[...m,{from:'bot', text:'Failed to update loan.'}]);
          }
          setPending(null); return;
        }
        break;
      }
      case "updateEmployee": {
        if (!(pending.data as any).field) {
          const field = text.trim().toLowerCase();
          const allowed = ['position','phone','email','status'];
          if (!allowed.includes(field)) { setMessages((m)=>[...m,{from:'bot', text:'Allowed fields: position, phone, email, status.'}]); return; }
          setPending({ ...pending, data: { field } });
          setMessages((m)=>[...m,{from:'bot', text:'New value?'}]);
          return;
        }
        if (!(pending.data as any).value) {
          const value = text.trim();
          try {
            const payload: any = {}; payload[(pending.data as any).field] = value;
            const res = await apiPost(`/api/employees/${selectedEmployee}`, payload as any);
            if (!res.ok) throw new Error(res.error);


            const fieldLabel = (pending.data as any).field;
            const doc = buildReceiptDocument({
              titleEn: "Employee Record Updated",
              subheadingEn: fieldLabel,
              bodyEn: `This document confirms that ${employeeLine} has an updated ${fieldLabel} value of ${value}.`,
              detailsEn: [
                `${fieldLabel}: ${value}`,
              ],
            });

            setMessages((m)=>[...m,{from:'bot', text:'Employee updated.'}]);
          } catch {
            setMessages((m)=>[...m,{from:'bot', text:'Failed to update employee.'}]);
          }
          setPending(null); return;
        }
        break;
      }
    }
  };

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => setTab(value as "chat" | "drawer")}
      className="flex h-full flex-col"
    >
      <TabsList className="mb-4 grid w-full max-w-xs grid-cols-2">
        <TabsTrigger value="chat">Chat</TabsTrigger>
        <TabsTrigger value="drawer">Document Drawer</TabsTrigger>
      </TabsList>
      <TabsContent value="chat" className="flex flex-1 flex-col">
        <div className="flex h-full flex-col space-y-2 rounded border p-2">
        <div>
          <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
            <SelectTrigger>
              <SelectValue placeholder="Select employee" />
            </SelectTrigger>
            <SelectContent>
              {employees.map((emp) => (
                <SelectItem key={emp.id} value={emp.id}>
                  {emp.firstName} {emp.lastName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Select value={selectedIntent} onValueChange={(v) => setSelectedIntent(v as ChatIntent | "")}>

          <SelectTrigger>
            <SelectValue placeholder={t("chatbot.selectAction")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="employeeDocuments">Employee documents</SelectItem>
            <SelectItem value="employeeInfo">Employee info</SelectItem>
            <SelectItem value="addBonus">{t("chatbot.intents.addBonus")}</SelectItem>
            <SelectItem value="addDeduction">{t("chatbot.intents.addDeduction")}</SelectItem>
            <SelectItem value="requestVacation">{t("chatbot.intents.requestVacation")}</SelectItem>
            <SelectItem value="cancelVacation">Cancel vacation</SelectItem>
            <SelectItem value="changeVacation">Change vacation</SelectItem>
            <SelectItem value="assignAsset">Assign asset</SelectItem>
            <SelectItem value="assetDocument">Asset document</SelectItem>
            <SelectItem value="returnAsset">Return asset</SelectItem>
            <SelectItem value="assignCar">Assign car</SelectItem>
            <SelectItem value="returnCar">Return car</SelectItem>
            <SelectItem value="createLoan">Create loan</SelectItem>
            <SelectItem value="updateLoan">Update loan</SelectItem>
            <SelectItem value="updateEmployee">Update employee</SelectItem>
            <SelectItem value="runPayroll">{t("chatbot.intents.runPayroll")}</SelectItem>
            <SelectItem value="loanStatus">{t("chatbot.intents.loanStatus")}</SelectItem>
            <SelectItem value="reportSummary">{t("chatbot.intents.reportSummary")}</SelectItem>
            <SelectItem value="monthlySummary">{t("chatbot.intents.monthlySummary")}</SelectItem>
          </SelectContent>
          </Select>
        </div>
      <div className="flex-1 overflow-y-auto space-y-2">
        {messages.map((m, i) => (
          <div key={i} className={m.from === "bot" ? "text-left" : "text-right"}>
            <span
              className={
                m.from === "bot"
                ? "bg-gray-200 text-gray-800 px-2 py-1 rounded"
                : "bg-blue-500 text-white px-2 py-1 rounded"
            }
          >
          {m.text}
          </span>
        </div>
      ))}
      </div>
      {/* Documents panel when requested */}
      {docs && (
        <div className="border rounded p-2 space-y-2">
          {docs.map((d:any) => (
            <div key={d.id} className="flex items-center justify-between text-sm">
              <div>
                <div className="font-medium">{d.title}</div>
                <div className="text-muted-foreground">{new Date(d.eventDate).toLocaleString()}</div>
              </div>
              <div className="flex gap-2">
                <a className="text-blue-600 underline" href={(d as any).documentUrl} target="_blank">Open</a>
                <a className="text-blue-600 underline" href={`/employee-file?id=${encodeURIComponent(selectedEmployee)}`} target="_blank">Print File</a>
              </div>
            </div>
          ))}
        </div>
      )}
      {/* Quick Actions */}
      {pending && (
        <div className="border-t pt-2 space-y-2">
          {pending.confirm && (
            <div className="flex gap-2">
              <Button size="sm" onClick={() => handlePending('yes')}>Yes</Button>
              <Button size="sm" variant="outline" onClick={() => handlePending('no')}>No</Button>
            </div>
          )}
          {(['addBonus','addDeduction','createLoan'] as any[]).includes(pending.type) && pending.data.amount === undefined && (
            <div className="flex gap-2">
              {[10,50,100,200].map(v => (
                <Button key={v} size="sm" variant="outline" onClick={() => handlePending(String(v))}>{v}</Button>
              ))}
            </div>
          )}
          {pending.type === 'updateLoan' && pending.data.monthlyDeduction === undefined && (
            <div className="flex gap-2">
              {[25,50,100].map(v => (
                <Button key={v} size="sm" variant="outline" onClick={() => handlePending(String(v))}>{v}</Button>
              ))}
            </div>
          )}
          {(['requestVacation','changeVacation','assignAsset','assignCar'] as any[]).includes(pending.type) && !pending.confirm && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => handlePending('today')}>Today</Button>
              <Button size="sm" variant="outline" onClick={() => handlePending('tomorrow')}>Tomorrow</Button>
              <Button size="sm" variant="outline" onClick={() => handlePending('next friday')}>Next Friday</Button>
            </div>
          )}
          {pending.type === 'assignAsset' && !(pending.data as any).assetId && (
            <div className="flex gap-2 flex-wrap">
              {(assets as any[]).slice(0,5).map(a => (
                <Button key={a.id} size="sm" variant="outline" onClick={() => handlePending(a.name || a.id)}>{a.name || a.id}</Button>
              ))}
            </div>
          )}
          {(['assignCar','returnCar'] as any[]).includes(pending.type) && !(pending.data as any).carId && (
            <div className="flex gap-2 flex-wrap">
              {(cars as any[]).slice(0,5).map(c => (
                <Button key={c.id} size="sm" variant="outline" onClick={() => handlePending(c.plateNumber || c.id)}>{c.plateNumber || c.id}</Button>
              ))}
            </div>
          )}
          {pending.type === 'updateEmployee' && !(pending.data as any).field && (
            <div className="flex gap-2">
              {['position','phone','email','status'].map(f => (
                <Button key={f} size="sm" variant="outline" onClick={() => handlePending(f)}>{f}</Button>
              ))}
            </div>
          )}
        </div>
      )}
      <form onSubmit={handleSubmit} className="flex space-x-2">

        <Input

          value={input}

          onChange={(e) => setInput(e.target.value)}

          placeholder="Type a message"

        />

        <Button type="submit">Send</Button>

      </form>

        </div>

      </TabsContent>

      <TabsContent value="drawer" className="flex flex-1 flex-col space-y-4 overflow-hidden">

        <div className="flex flex-1 flex-col gap-4 lg:grid lg:grid-cols-[2fr,minmax(0,1fr)] lg:items-start">

          <div className="flex flex-col gap-4 overflow-hidden">

            <Card className="shadow-sm">

              <CardHeader>

                <CardTitle>Document Drawer</CardTitle>

                <CardDescription>Search, track, and create company-wide documents.</CardDescription>

              </CardHeader>

              <CardContent className="space-y-4">

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">

                  <div className="space-y-1">

                    <Label htmlFor="document-search">Search</Label>

                    <Input

                      id="document-search"

                      value={drawerQuery}

                      onChange={(e) => setDrawerQuery(e.target.value)}

                      placeholder="Search by title, employee, civil ID"

                    />

                  </div>

                  <div className="space-y-1">

                    <Label htmlFor="document-employee">Employee</Label>

                    <Select

                      value={drawerEmployeeId || 'all'}

                      onValueChange={(value) => setDrawerEmployeeId(value === 'all' ? '' : value)}

                    >

                      <SelectTrigger id="document-employee">

                        <SelectValue placeholder="All employees" />

                      </SelectTrigger>

                      <SelectContent>

                        <SelectItem value="all">All employees</SelectItem>

                        {employees.map((emp) => (

                          <SelectItem key={emp.id} value={emp.id}>

                            {[emp.firstName, emp.lastName].filter(Boolean).join(' ') || emp.employeeCode || emp.id}

                          </SelectItem>

                        ))}

                      </SelectContent>

                    </Select>

                  </div>

                  <div className="space-y-1">

                    <Label htmlFor="document-status">Status</Label>

                    <Select

                      value={docStatusFilter}

                      onValueChange={(value) => setDocStatusFilter(value as 'all' | 'active' | 'expiring' | 'expired')}

                    >

                      <SelectTrigger id="document-status">

                        <SelectValue placeholder="All statuses" />

                      </SelectTrigger>

                      <SelectContent>

                        <SelectItem value="all">All statuses</SelectItem>

                        <SelectItem value="active">Active</SelectItem>

                        <SelectItem value="expiring">Expiring soon</SelectItem>

                        <SelectItem value="expired">Expired</SelectItem>

                      </SelectContent>

                    </Select>

                  </div>

                  <div className="space-y-1">

                    <Label htmlFor="document-category">Category</Label>

                    <Select

                      value={docCategoryFilter || 'all'}

                      onValueChange={(value) => setDocCategoryFilter(value === 'all' ? '' : value)}

                    >

                      <SelectTrigger id="document-category">

                        <SelectValue placeholder="All categories" />

                      </SelectTrigger>

                      <SelectContent>

                        <SelectItem value="all">All categories</SelectItem>

                        {uniqueCategories.map((category) => (

                          <SelectItem key={category} value={category}>

                            {category}

                          </SelectItem>

                        ))}

                      </SelectContent>

                    </Select>

                  </div>

                </div>

                <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">

                  <span>Total: {expiryStats.total}</span>

                  <Badge variant="destructive">Expired {expiryStats.expired}</Badge>

                  <Badge className="bg-amber-500/10 text-amber-700 hover:bg-amber-500/20">Expiring {expiryStats.expiring}</Badge>

                </div>

              </CardContent>

            </Card>

            <Card className="flex h-full flex-col overflow-hidden shadow-sm">

              <CardHeader>

                <CardTitle>Documents</CardTitle>

                <CardDescription>Showing {filteredDocs.length} of {companyDocuments.length} records.</CardDescription>

              </CardHeader>

              <CardContent className="space-y-3 overflow-y-auto" style={{ maxHeight: '60vh' }}>

                {documentsLoading ? (

                  <div className="flex items-center justify-center py-10 text-muted-foreground">

                    <Loader2 className="h-5 w-5 animate-spin" />

                  </div>

                ) : filteredDocs.length === 0 ? (

                  <div className="rounded border border-dashed p-6 text-center text-sm text-muted-foreground">

                    No documents match your filters yet.

                  </div>

                ) : (

                  filteredDocs.map((doc) => {

                    const employee = doc.employeeId ? employeeLookup.get(doc.employeeId) : undefined;

                    const { status, daysRemaining } = computeDocumentStatus(doc);

                    const tags = typeof doc.tags === 'string' ? doc.tags.split(',').map((tag: string) => tag.trim()).filter(Boolean) : [];

                    const openRel = getNewTabRel(doc.documentUrl);

                    return (

                      <div key={doc.id} className="rounded border bg-white dark:bg-gray-900 p-3 shadow-sm">

                        <div className="flex flex-wrap items-start justify-between gap-3">

                          <div className="space-y-1">

                            <div className="flex flex-wrap items-center gap-2 text-sm font-medium">

                              <span>{doc.title}</span>

                              {doc.category ? (

                                <Badge variant="outline">{doc.category}</Badge>

                              ) : null}

                              {status === 'expired' ? (

                                <Badge variant="destructive">Expired</Badge>

                              ) : status === 'expiring' ? (

                                <Badge className="bg-amber-500/10 text-amber-700 hover:bg-amber-500/20">Expiring in {daysRemaining}d</Badge>

                              ) : status === 'active' ? (

                                <Badge variant="secondary">Active</Badge>

                              ) : (

                                <Badge variant="outline">No expiry</Badge>

                              )}

                            </div>

                            <div className="text-xs text-muted-foreground">

                              Added on {new Date(doc.createdAt || doc.expiryDate || Date.now()).toLocaleDateString()}

                            </div>

                            {employee && (

                              <div className="text-xs text-muted-foreground">

                                {([employee?.firstName, employee?.lastName].filter(Boolean).join(' ') || employee?.employeeCode || employee?.id || doc.employeeId)}

                              </div>

                            )}

                            {doc.referenceNumber && (

                              <div className="text-xs text-muted-foreground">Reference #: {doc.referenceNumber}</div>

                            )}

                            {doc.controllerNumber && (

                              <div className="text-xs text-muted-foreground">Controller #: {doc.controllerNumber}</div>

                            )}

                            {doc.expiryDate && (

                              <div className="text-xs text-muted-foreground">Expires on {new Date(doc.expiryDate).toLocaleDateString()}</div>

                            )}

                          </div>

                          <div className="flex flex-col items-end gap-2">

                            <div className="flex gap-2">

                              {doc.documentUrl ? (

                                <Button asChild size="sm" variant="outline">

                                  <a href={doc.documentUrl} target="_blank" rel={openRel}>Open</a>

                                </Button>

                              ) : null}

                              {doc.employeeId && (

                                <Button asChild size="sm" variant="ghost">

                                  <a href={`/employee-file?id=${encodeURIComponent(doc.employeeId)}`} target="_blank" rel="noopener noreferrer">Employee file</a>

                                </Button>

                              )}

                            </div>

                            {tags.length > 0 && (

                              <div className="flex flex-wrap justify-end gap-1">

                                {tags.map((tag: string) => (

                                  <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>

                                ))}

                              </div>

                            )}

                          </div>

                        </div>

                        {doc.description && (

                          <p className="mt-2 text-sm text-muted-foreground">{doc.description}</p>

                        )}

                      </div>

                    );

                  })

                )}

              </CardContent>

            </Card>

          </div>

          <Card className="shadow-sm">

            <CardHeader>

              <CardTitle>Create Document</CardTitle>

              <CardDescription>Upload documents such as licenses, certificates, and contracts.</CardDescription>

            </CardHeader>

            <CardContent className="space-y-4">

              <div className="space-y-1">

                <Label htmlFor="new-doc-title">Title</Label>

                <Input

                  id="new-doc-title"

                  value={docForm.title}

                  onChange={(e) => setDocForm((prev) => ({ ...prev, title: e.target.value }))}

                  placeholder="Company License Renewal"

                />

              </div>

              <div className="space-y-1">

                <Label htmlFor="new-doc-description">Description</Label>

                <Textarea

                  id="new-doc-description"

                  value={docForm.description}

                  onChange={(e) => setDocForm((prev) => ({ ...prev, description: e.target.value }))}

                  placeholder="Optional details about this document"

                  rows={3}

                />

              </div>

              <div className="grid gap-3 md:grid-cols-2">

                <div className="space-y-1">

                  <Label>Assign to employee</Label>

                  <Select

                    value={docForm.employeeId || 'none'}

                    onValueChange={(value) => setDocForm((prev) => ({ ...prev, employeeId: value === 'none' ? '' : value }))}

                  >

                    <SelectTrigger>

                      <SelectValue placeholder="Unassigned" />

                    </SelectTrigger>

                    <SelectContent>

                      <SelectItem value="none">Unassigned</SelectItem>

                      {employees.map((emp) => (

                        <SelectItem key={emp.id} value={emp.id}>

                          {[emp.firstName, emp.lastName].filter(Boolean).join(' ') || emp.employeeCode || emp.id}

                        </SelectItem>

                      ))}

                    </SelectContent>

                  </Select>

                </div>

                <div className="space-y-1">

                  <Label htmlFor="new-doc-category">Category</Label>

                  <Input

                    id="new-doc-category"

                    value={docForm.category}

                    onChange={(e) => setDocForm((prev) => ({ ...prev, category: e.target.value }))}

                    placeholder="Licenses"

                  />

                </div>

              </div>

              <div className="grid gap-3 md:grid-cols-2">

                <div className="space-y-1">

                  <Label htmlFor="new-doc-reference">Reference #</Label>

                  <Input

                    id="new-doc-reference"

                    value={docForm.referenceNumber}

                    onChange={(e) => setDocForm((prev) => ({ ...prev, referenceNumber: e.target.value }))}

                    placeholder="Optional reference"

                  />

                </div>

                <div className="space-y-1">

                  <Label htmlFor="new-doc-controller">Controller #</Label>

                  <Input

                    id="new-doc-controller"

                    value={docForm.controllerNumber}

                    onChange={(e) => setDocForm((prev) => ({ ...prev, controllerNumber: e.target.value }))}

                    placeholder="Optional control number"

                  />

                </div>

              </div>

              <div className="space-y-1">

                <Label htmlFor="new-doc-tags">Tags</Label>

                <Input

                  id="new-doc-tags"

                  value={docForm.tags}

                  onChange={(e) => setDocForm((prev) => ({ ...prev, tags: e.target.value }))}

                  placeholder="Comma separated"

                />

              </div>

              <div className="grid gap-3 md:grid-cols-2">

                <div className="space-y-1">

                  <Label htmlFor="new-doc-expiry">Expiry date</Label>

                  <Input

                    id="new-doc-expiry"

                    type="date"

                    value={docForm.expiryDate}

                    onChange={(e) => setDocForm((prev) => ({ ...prev, expiryDate: e.target.value }))}

                  />

                </div>

                <div className="space-y-1">

                  <Label htmlFor="new-doc-alert">Alert days</Label>

                  <Input

                    id="new-doc-alert"

                    type="number"

                    min="0"

                    value={docForm.alertDays}

                    onChange={(e) => setDocForm((prev) => ({ ...prev, alertDays: e.target.value }))}

                  />

                </div>

              </div>

              <ImageUpload

                label="Upload document (PDF or image)"

                value={docUpload}

                onChange={setDocUpload}

                accept="image/*,application/pdf"

                maxSizeMB={5}

              />

              <Button onClick={handleCreateDocument} disabled={docSaving} className="w-full justify-center">

                {docSaving ? (

                  <>

                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving

                  </>

                ) : (

                  <>

                    <Plus className="mr-2 h-4 w-4" /> Save document

                  </>

                )}

              </Button>

            </CardContent>

          </Card>

        </div>

      </TabsContent>

    </Tabs>

  );

}



export default Chatbot;















