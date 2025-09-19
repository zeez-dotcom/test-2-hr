import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { apiGet, apiPost, apiPut, apiDelete, apiUpload } from "@/lib/http";

const schema = z.object({
  employeeId: z.string().min(1),
  date: z.string().min(1),
  checkIn: z.string().optional(),
  checkOut: z.string().optional(),
  hours: z.preprocess(v => v === '' || v === undefined ? undefined : Number(v), z.number().nonnegative().optional()),
  source: z.string().optional(),
  notes: z.string().optional(),
});

export default function Attendance() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [range, setRange] = useState(() => {
    const d = new Date();
    const start = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split('T')[0];
    return { start, end };
  });

  const { data: employees = [] } = useQuery<any[]>({ queryKey: ["/api/employees"] });

  const { data: rows = [], refetch } = useQuery<any[]>({
    queryKey: ["/api/attendance", range.start, range.end],
    queryFn: async () => {
      const res = await apiGet(`/api/attendance?startDate=${range.start}&endDate=${range.end}`);
      if (!res.ok) throw new Error(res.error || 'Failed');
      return res.data;
    },
  });

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      employeeId: '',
      date: new Date().toISOString().split('T')[0],
      source: 'manual',
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiPost('/api/attendance', data);
      if (!res.ok) throw res;
    },
    onSuccess: () => { setIsOpen(false); refetch(); toast({ title: t('attendancePage.recorded','Attendance recorded') }); },
  });

  const importMutation = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      const res = await apiUpload('/api/attendance/import', fd);
      if (!res.ok) throw res;
      return res.data as any;
    },
    onSuccess: (data: any) => { refetch(); toast({ title: t('attendancePage.imported','Imported'), description: `${t('attendancePage.imported','Imported')} ${data.imported}, ${t('attendancePage.failed','failed')} ${data.failed}` }); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiDelete(`/api/attendance/${id}`);
      if (!res.ok) throw res;
    },
    onSuccess: () => { refetch(); toast({ title: t('attendancePage.removed','Attendance removed') }); },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('nav.attendance','Attendance')}</h1>
        <div className="flex gap-2">
          <Input type="date" value={range.start} onChange={e => setRange(r => ({ ...r, start: e.target.value }))} />
          <Input type="date" value={range.end} onChange={e => setRange(r => ({ ...r, end: e.target.value }))} />
          <label className="inline-flex items-center gap-2 text-sm">
            <span>{t('attendancePage.importCsv','Import CSV')}</span>
            <Input type="file" accept=".csv,text/csv" onChange={e => { const f = e.target.files?.[0]; if (f) importMutation.mutate(f); }} />
          </label>
          <Button
            variant="outline"
            onClick={async () => {
              const res = await fetch('/api/attendance/template', { credentials: 'include' });
              const text = await res.text();
              const blob = new Blob([text], { type: 'text/csv' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = 'attendance-template.csv';
              document.body.appendChild(a);
              a.click();
              a.remove();
              URL.revokeObjectURL(url);
            }}
          >
            {t('attendancePage.downloadTemplate','Download Template')}
          </Button>
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button>{t('attendancePage.record','Record')}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('attendancePage.record','Record attendance')}</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit((d) => createMutation.mutate(d))} className="space-y-3">
                  <FormField control={form.control} name="employeeId" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('docgen.employee')}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || undefined}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={t('docgen.employee')} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {employees.map((e: any) => (
                            <SelectItem key={e.id} value={e.id}>{e.firstName} {e.lastName}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="date" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('vacationsPage.startDate','Date')}</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <div className="grid grid-cols-2 gap-3">
                    <FormField control={form.control} name="checkIn" render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('attendancePage.checkIn','Check-in')}</FormLabel>
                        <FormControl>
                          <Input type="datetime-local" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="checkOut" render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('attendancePage.checkOut','Check-out')}</FormLabel>
                        <FormControl>
                          <Input type="datetime-local" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                  <FormField control={form.control} name="hours" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('attendancePage.hoursOptional','Hours (optional)')}</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.25" {...field} onChange={e => field.onChange(e.target.value)} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="notes" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('attendancePage.notes','Notes')}</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <Button type="submit" disabled={createMutation.isPending}>{createMutation.isPending ? t('actions.save') : t('actions.save')}</Button>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t('attendancePage.records','Records')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {rows.length === 0 ? (
              <div className="text-sm text-muted-foreground">{t('attendancePage.none','No attendance records')}</div>
            ) : (
              rows.map((r: any) => (
                <div key={r.id} className="flex justify-between items-center border rounded p-2 text-sm">
                  <div>{new Date(r.date).toLocaleDateString()} • {employees.find((e: any) => e.id === r.employeeId)?.firstName} {employees.find((e: any) => e.id === r.employeeId)?.lastName}</div>
                  <div className="flex items-center gap-3">
                    <div>{r.checkIn ? new Date(r.checkIn).toLocaleString() : '—'} → {r.checkOut ? new Date(r.checkOut).toLocaleString() : '—'}</div>
                    <div>{r.hours ? `${r.hours}h` : ''}</div>
                    <Button size="sm" variant="outline" onClick={() => deleteMutation.mutate(r.id)} disabled={deleteMutation.isPending}>{t('actions.delete')}</Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
