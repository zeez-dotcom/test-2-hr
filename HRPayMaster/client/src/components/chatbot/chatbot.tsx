import { useEffect, useState } from "react";
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
import { buildBilingualActionReceipt, buildAndEncodePdf } from "@/lib/pdf";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTranslation } from "react-i18next";

interface Message {
  from: "bot" | "user";
  text: string;
}

interface PendingIntent {
  type: ChatIntent;
  data: {
    amount?: number;
    date?: string;
    reason?: string;
    startDate?: string;
    endDate?: string;
    period?: string;
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
              const doc = buildBilingualActionReceipt({
                titleEn: 'Bonus',
                titleAr: 'مكافأة',
                employee: { firstName: (employees.find(e => e.id === selectedEmployee)?.firstName || ''), lastName: (employees.find(e => e.id === selectedEmployee)?.lastName || ''), id: selectedEmployee },
                detailsEn: [
                  `Amount: ${pending.data.amount}`,
                  `Date: ${pending.data.date}`,
                  `Reason: ${pending.data.reason || ''}`
                ],
                detailsAr: [
                  `المبلغ: ${pending.data.amount}`,
                  `التاريخ: ${pending.data.date}`,
                  `السبب: ${pending.data.reason || ''}`
                ],
              });
              const pdfDataUrl = await buildAndEncodePdf(doc);
              await apiPost(`/api/employees/${selectedEmployee}/documents`, { title: 'Bonus Receipt', description: 'Bonus action receipt', pdfDataUrl });
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
              const doc = buildBilingualActionReceipt({
                titleEn: 'Vacation Approval',
                titleAr: 'موافقة إجازة',
                employee: { firstName: (employees.find(e => e.id === selectedEmployee)?.firstName || ''), lastName: (employees.find(e => e.id === selectedEmployee)?.lastName || ''), id: selectedEmployee },
                detailsEn: [
                  `Start: ${vacation.startDate}`,
                  `End: ${vacation.endDate}`,
                  `Days: ${vacation.days}`,
                  `Reason: ${vacation.reason || ''}`
                ],
                detailsAr: [
                  `البداية: ${vacation.startDate}`,
                  `النهاية: ${vacation.endDate}`,
                  `الأيام: ${vacation.days}`,
                  `السبب: ${vacation.reason || ''}`
                ],
              });
              const pdfDataUrl = await buildAndEncodePdf(doc);
              await apiPost(`/api/employees/${selectedEmployee}/documents`, { title: 'Vacation Approval', description: 'Vacation approval receipt', pdfDataUrl });
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
              const doc = buildBilingualActionReceipt({
                titleEn: 'Payroll Generated',
                titleAr: 'تم إنشاء الرواتب',
                employee: { firstName: (employees.find(e => e.id === selectedEmployee)?.firstName || ''), lastName: (employees.find(e => e.id === selectedEmployee)?.lastName || ''), id: selectedEmployee },
                detailsEn: [
                  `Period: ${payroll.period}`, `Start: ${payroll.startDate}`, `End: ${payroll.endDate}`
                ],
                detailsAr: [
                  `الفترة: ${payroll.period}`, `البداية: ${payroll.startDate}`, `النهاية: ${payroll.endDate}`
                ],
              // logo will be injected from settings via pdf brand helper
              });
              const pdfDataUrl = await buildAndEncodePdf(doc);
              await apiPost(`/api/employees/${selectedEmployee}/documents`, { title: 'Payroll Action', description: 'Payroll generation receipt', pdfDataUrl });
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
              const doc = buildBilingualActionReceipt({
                titleEn: 'Vacation Cancelled', titleAr: 'تم إلغاء الإجازة',
                employee: { firstName: employees.find(e=>e.id===selectedEmployee)?.firstName||'', lastName: employees.find(e=>e.id===selectedEmployee)?.lastName||'', id: selectedEmployee },
                detailsEn: [`Start: ${vac.startDate}`, `End: ${vac.endDate}`],
                detailsAr: [`البداية: ${vac.startDate}`, `النهاية: ${vac.endDate}`],
                // logo will be injected from settings via pdf brand helper
                logo: null,
              });
              const pdfDataUrl = await buildAndEncodePdf(doc);
              await apiPost(`/api/employees/${selectedEmployee}/documents`, { title: 'Vacation Cancelled', description: 'Vacation cancelled', pdfDataUrl });
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
            const doc = buildBilingualActionReceipt({
              titleEn: 'Vacation Updated', titleAr: 'تم تعديل الإجازة',
              employee: { firstName: employees.find(e=>e.id===selectedEmployee)?.firstName||'', lastName: employees.find(e=>e.id===selectedEmployee)?.lastName||'', id: selectedEmployee },
              detailsEn: [`Start: ${pending.data.startDate}`, `End: ${endDate}`],
              detailsAr: [`البداية: ${pending.data.startDate}`, `النهاية: ${endDate}`],
            });
            const pdfDataUrl = await buildAndEncodePdf(doc);
            await apiPost(`/api/employees/${selectedEmployee}/documents`, { title: 'Vacation Updated', description: 'Vacation updated', pdfDataUrl });
            setMessages((m)=>[...m,{from:'bot', text:`Vacation updated to ${pending.data.startDate} → ${endDate}.`}]);
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
            const doc = buildBilingualActionReceipt({
              titleEn: 'Asset Assigned', titleAr: 'تخصيص أصل',
              employee: { firstName: employees.find(e=>e.id===selectedEmployee)?.firstName||'', lastName: employees.find(e=>e.id===selectedEmployee)?.lastName||'', id: selectedEmployee },
              detailsEn: [`Asset: ${(assets as any[]).find(a=>a.id===(pending.data as any).assetId)?.name || (pending.data as any).assetId}`, `Date: ${(pending.data as any).date}`, `Notes: ${notes}`],
              detailsAr: [`الأصل: ${(assets as any[]).find(a=>a.id===(pending.data as any).assetId)?.name || (pending.data as any).assetId}`, `التاريخ: ${(pending.data as any).date}`, `ملاحظات: ${notes}`],
            });
            const pdfDataUrl = await buildAndEncodePdf(doc);
            await apiPost(`/api/employees/${selectedEmployee}/documents`, { title: 'Asset Assignment', description: 'Asset assignment receipt', pdfDataUrl });
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
            const doc = buildBilingualActionReceipt({
              titleEn: 'Asset Returned', titleAr: 'إرجاع أصل',
              employee: { firstName: employees.find(e=>e.id===selectedEmployee)?.firstName||'', lastName: employees.find(e=>e.id===selectedEmployee)?.lastName||'', id: selectedEmployee },
              detailsEn: [`Asset: ${(assets as any[]).find(a=>a.id===(pending.data as any).assetId)?.name || (pending.data as any).assetId}`, `Date: ${today}`],
              detailsAr: [`الأصل: ${(assets as any[]).find(a=>a.id===(pending.data as any).assetId)?.name || (pending.data as any).assetId}`, `التاريخ: ${today}`],
              logo: null,
            });
            const pdfDataUrl = await buildAndEncodePdf(doc);
            await apiPost(`/api/employees/${selectedEmployee}/documents`, { title: 'Asset Returned', description: 'Asset return receipt', pdfDataUrl });
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
            const doc = buildBilingualActionReceipt({
              titleEn: 'Car Assigned', titleAr: 'تخصيص سيارة',
              employee: { firstName: employees.find(e=>e.id===selectedEmployee)?.firstName||'', lastName: employees.find(e=>e.id===selectedEmployee)?.lastName||'', id: selectedEmployee },
              detailsEn: [`Car: ${(cars as any[]).find(c=>c.id===(pending.data as any).carId)?.plateNumber || (pending.data as any).carId}`, `Date: ${date}`],
              detailsAr: [`السيارة: ${(cars as any[]).find(c=>c.id===(pending.data as any).carId)?.plateNumber || (pending.data as any).carId}`, `التاريخ: ${date}`],
              logo: null,
            });
            const pdfDataUrl = await buildAndEncodePdf(doc);
            await apiPost(`/api/employees/${selectedEmployee}/documents`, { title: 'Car Assignment', description: 'Car assignment receipt', pdfDataUrl });
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
            const doc = buildBilingualActionReceipt({
              titleEn: 'Car Returned', titleAr: 'إرجاع سيارة',
              employee: { firstName: employees.find(e=>e.id===selectedEmployee)?.firstName||'', lastName: employees.find(e=>e.id===selectedEmployee)?.lastName||'', id: selectedEmployee },
              detailsEn: [`Car: ${(cars as any[]).find(c=>c.id===(pending.data as any).carId)?.plateNumber || (pending.data as any).carId}`, `Date: ${today}`],
              detailsAr: [`السيارة: ${(cars as any[]).find(c=>c.id===(pending.data as any).carId)?.plateNumber || (pending.data as any).carId}`, `التاريخ: ${today}`],
              logo: null,
            });
            const pdfDataUrl = await buildAndEncodePdf(doc);
            await apiPost(`/api/employees/${selectedEmployee}/documents`, { title: 'Car Returned', description: 'Car return receipt', pdfDataUrl });
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
            const doc = buildBilingualActionReceipt({
              titleEn: 'Loan Created', titleAr: 'إنشاء قرض',
              employee: { firstName: employees.find(e=>e.id===selectedEmployee)?.firstName||'', lastName: employees.find(e=>e.id===selectedEmployee)?.lastName||'', id: selectedEmployee },
              detailsEn: [`Amount: ${payload.amount}`, `Monthly: ${payload.monthlyDeduction}`, `Start: ${payload.startDate}`],
              detailsAr: [`المبلغ: ${payload.amount}`, `الشهري: ${payload.monthlyDeduction}`, `البداية: ${payload.startDate}`],
              logo: null,
            });
            const pdfDataUrl = await buildAndEncodePdf(doc);
            await apiPost(`/api/employees/${selectedEmployee}/documents`, { title: 'Loan Created', description: 'Loan creation receipt', pdfDataUrl });
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
            const doc = buildBilingualActionReceipt({
              titleEn: 'Loan Updated', titleAr: 'تحديث القرض',
              employee: { firstName: employees.find(e=>e.id===selectedEmployee)?.firstName||'', lastName: employees.find(e=>e.id===selectedEmployee)?.lastName||'', id: selectedEmployee },
              detailsEn: [`Monthly: ${newMd}`],
              detailsAr: [`الشهري: ${newMd}`],
              logo: null,
            });
            const pdfDataUrl = await buildAndEncodePdf(doc);
            await apiPost(`/api/employees/${selectedEmployee}/documents`, { title: 'Loan Updated', description: 'Loan update receipt', pdfDataUrl });
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
            const doc = buildBilingualActionReceipt({
              titleEn: 'Employee Updated', titleAr: 'تم تحديث الموظف',
              employee: { firstName: employees.find(e=>e.id===selectedEmployee)?.firstName||'', lastName: employees.find(e=>e.id===selectedEmployee)?.lastName||'', id: selectedEmployee },
              detailsEn: [`${(pending.data as any).field}: ${value}`],
              detailsAr: [`${(pending.data as any).field}: ${value}`],
              logo: (import.meta as any).env?.VITE_COMPANY_LOGO || null,
            });
            const pdfDataUrl = await buildAndEncodePdf(doc);
            await apiPost(`/api/employees/${selectedEmployee}/documents`, { title: 'Employee Updated', description: 'Update receipt', pdfDataUrl });
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
      <div className="flex flex-col h-full border rounded p-2 space-y-2">
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
  );
}

export default Chatbot;
