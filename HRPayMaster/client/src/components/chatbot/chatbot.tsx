import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Employee, InsertEmployeeEvent } from "@shared/schema";
import { parseIntent, resolveDate, ChatIntent } from "@shared/chatbot";
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
  data: { amount?: number; date?: string; reason?: string };
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

    if (!selectedEmployee) {
      setMessages((m) => [...m, { from: "bot", text: "Please select an employee first." }]);
      return;
    }

    if (pending) {
      await handlePending(text);
      return;
    }

    const intent = parseIntent(text);
    switch (intent.type) {
      case "addBonus":
        setPending({ type: "addBonus", data: {} });
        setMessages((m) => [...m, { from: "bot", text: "Sure, what's the amount?" }]);
        break;
      case "deductLoan":
        setPending({ type: "deductLoan", data: {} });
        setMessages((m) => [...m, { from: "bot", text: "Okay, loan deduction amount?" }]);
        break;
      case "help":
        setMessages((m) => [...m, { from: "bot", text: "You can say 'add bonus' or 'deduct loan'." }]);
        break;
      default:
        setMessages((m) => [
          ...m,
          { from: "bot", text: "Sorry, I didn't understand. Try 'add bonus' or 'deduct loan'." },
        ]);
    }
  };

  const handlePending = async (text: string) => {
    if (!pending) return;
    if (pending.data.amount === undefined) {
      const amount = parseFloat(text);
      if (isNaN(amount)) {
        setMessages((m) => [...m, { from: "bot", text: "Please provide a valid amount." }]);
        return;
      }
      setPending({ ...pending, data: { amount } });
      setMessages((m) => [...m, { from: "bot", text: "When should it apply? (e.g., 2024-05-01, next Friday, this month)" }]);
      return;
    }
    if (!pending.data.date) {
      const date = resolveDate(text, currentDate);
      setPending({ ...pending, data: { ...pending.data, date } });
      setMessages((m) => [...m, { from: "bot", text: "Reason?" }]);
      return;
    }
    if (!pending.data.reason) {
      const finalData = { ...pending.data, reason: text };
      setPending(null);
      const eventData: InsertEmployeeEvent = {
        employeeId: selectedEmployee,
        eventType: pending.type === "addBonus" ? "bonus" : "deduction",
        title: pending.type === "addBonus" ? "Bonus" : "Loan Deduction",
        description: finalData.reason,
        amount: finalData.amount?.toString() || "0",
        eventDate: finalData.date!,
        affectsPayroll: true,
        status: "active",
      };

      await apiRequest("POST", "/api/employee-events", eventData);

      if (pending.type === "addBonus") {
        setMessages((m) => [
          ...m,
          { from: "bot", text: `Bonus of ${finalData.amount} added for ${finalData.date}.` },
        ]);
      } else if (pending.type === "deductLoan") {
        setMessages((m) => [
          ...m,
          { from: "bot", text: `Loan deduction of ${finalData.amount} recorded for ${finalData.date}.` },
        ]);
      }
      return;
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
