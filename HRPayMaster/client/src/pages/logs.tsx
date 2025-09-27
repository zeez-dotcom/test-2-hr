import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/http";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { EmployeeEvent } from "@shared/schema";
import { Printer } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function Logs() {
  const { t } = useTranslation();
  const [range, setRange] = useState(() => {
    const d = new Date();
    const start = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split('T')[0];
    return { start, end };
  });
  const { data: events = [] } = useQuery<(EmployeeEvent & { employee: any })[]>({
    queryKey: ["/api/employee-events", range.start, range.end],
    queryFn: async () => {
      const res = await apiGet("/api/employee-events");
      if (!res.ok) return [] as any[];
      return res.data as any[];
    },
  });

  const filtered = useMemo(() => {
    const s = new Date(range.start);
    const e = new Date(range.end);
    return (events || []).filter(ev => {
      const d = new Date(ev.eventDate);
      return d >= s && d <= e;
    }).sort((a, b) => +new Date(b.eventDate) - +new Date(a.eventDate));
  }, [events, range]);

  const fmt = (d: string | Date) => new Date(d).toLocaleString();

  const toLine = (ev: any) => {
    const name = `${ev.employee?.firstName ?? ''} ${ev.employee?.lastName ?? ''}`.trim();
    switch (ev.eventType) {
      case 'employee_added':
        return `${name} added`;
      case 'bonus':
        return `${name} received a bonus of ${ev.amount}`;
      case 'commission':
        return `${name} received a commission of ${ev.amount}`;
      case 'deduction':
        return `${name} received a deduction of ${ev.amount}`;
      case 'allowance':
        return `${name} received an allowance of ${ev.amount}`;
      case 'overtime':
        return `${name} recorded overtime of ${ev.amount}`;
      case 'penalty':
        return `${name} received a penalty of ${ev.amount}`;
      case 'vacation':
        return `${name} vacation update: ${ev.title}`;
      case 'asset_assignment':
      case 'asset_update':
      case 'asset_removal':
        return `${name} asset event: ${ev.title}`;
      case 'employee_update':
      case 'document_update':
        return `${name} updated: ${ev.title}`;
      default:
        return `${name}: ${ev.title}`;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Input type="date" value={range.start} onChange={e => setRange(r => ({ ...r, start: e.target.value }))} />
        <Input type="date" value={range.end} onChange={e => setRange(r => ({ ...r, end: e.target.value }))} />
      </div>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>{t('logs.title','Company Activity Log')}</CardTitle>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" />
            {t('actions.print','Print')}
          </Button>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 list-disc pl-5 text-sm">
            {filtered.length === 0 ? (
              <div className="text-muted-foreground">{t('logs.none','No events in this period')}</div>
            ) : (
              filtered.map((ev) => (
                <li key={ev.id}>
                  <span className="text-gray-500 mr-2">[{fmt(ev.eventDate)}]</span>
                  <span>{toLine(ev)}</span>
                </li>
              ))
            )}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
