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
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
  const { data: employees = [] } = useQuery<Employee[]>({ queryKey: ["/api/employees"] });
  const [selectedEmployee, setSelectedEmployee] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState<PendingIntent | null>(null);
  const [currentDate] = useState(new Date());

  useEffect(() => {
    setMessages([
      { from: "bot", text: "What do you want to do today? Add bonus, make deduction, …" },
    ]);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    const text = input.trim();
    setInput("");
    setMessages((m) => [...m, { from: "user", text }]);

    if (pending) {
      await handlePending(text);
      return;
    }

    // Ensure an employee is selected for intents that require it
    if (!selectedEmployee) {
      setMessages((m) => [
        ...m,
        { from: "bot", text: "Please select an employee first." },
      ]);
      return;
    }

    let intent: { type: ChatIntent } = { type: "unknown" };
    try {
      const res = await apiRequest("POST", "/api/chatbot", { message: text });
      intent = await res.json();
    } catch {
      // Fallback to unknown intent on failure
    }

    switch (intent.type) {
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
      case "runPayroll":
        setPending({ type: "runPayroll", data: {} });
        setMessages((m) => [...m, { from: "bot", text: "What is the payroll period name?" }]);
        break;
      case "loanStatus":
        try {
          const res = await apiRequest(
            "GET",
            `/api/chatbot/loan-status/${selectedEmployee}`
          );
          const data = await res.json();
          setMessages((m) => [
            ...m,
            { from: "bot", text: `Loan balance is ${data.balance}.` },
          ]);
        } catch {
          setMessages((m) => [
            ...m,
            { from: "bot", text: "Could not fetch loan status." },
          ]);
        }
        break;
      case "reportSummary":
        try {
          const res = await apiRequest(
            "GET",
            `/api/chatbot/report-summary/${selectedEmployee}`
          );
          const data = await res.json();
          setMessages((m) => [
            ...m,
            {
              from: "bot",
              text: `Bonuses: ${data.bonuses}, Deductions: ${data.deductions}, Net Pay: ${data.netPay}.`,
            },
          ]);
        } catch {
          setMessages((m) => [
            ...m,
            { from: "bot", text: "Could not fetch report summary." },
          ]);
        }
        break;
      case "help":
        setMessages((m) => [
          ...m,
          {
            from: "bot",
            text: "You can say 'add bonus', 'add deduction', 'request vacation', or 'run payroll'.",
          },
        ]);
        break;
      default:
        setMessages((m) => [
          ...m,
          {
            from: "bot",
            text: "Sorry, I didn't understand. Try 'add bonus', 'add deduction', 'request vacation', or 'run payroll'.",
          },
        ]);
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
            await apiRequest("POST", "/api/employee-events", eventData);
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
            await apiRequest("POST", "/api/vacations", vacation);
            setMessages((m) => [
              ...m,
              {
                from: "bot",
                text: `Vacation from ${vacation.startDate} to ${vacation.endDate} recorded.`,
              },
            ]);
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
            await apiRequest("POST", "/api/payroll/generate", payroll);
            setMessages((m) => [
              ...m,
              {
                from: "bot",
                text: `Payroll for ${payroll.period} generated.`,
              },
            ]);
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
