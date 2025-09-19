import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { apiGet } from "@/lib/http";
import { openPdf, controllerNumber, buildAndEncodePdf } from "@/lib/pdf";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiPost, apiPut } from "@/lib/http";
import { getBrand } from "@/lib/brand";
import { sanitizeImageSrc } from "@/lib/sanitizeImageSrc";
import { defaultTemplates, type TemplateKey } from "@/lib/default-templates";

export default function DocumentGenerator() {
  const { data: employees = [] } = useQuery<any[]>({ queryKey: ["/api/employees"] });
  const { data: events = [] } = useQuery<any[]>({ queryKey: ["/api/employee-events"] });

  const [mode, setMode] = useState<'employee'|'custom'>("employee");
  const [tab, setTab] = useState<'create'|'saved'|'drawer'>("create");
  const [employeeId, setEmployeeId] = useState<string>("");
  const [includeImages, setIncludeImages] = useState({ profile: true, civilId: false, passport: false, visa: false, driving: false });
  const [includeEvents, setIncludeEvents] = useState({ bonus: true, commission: true, deduction: true, allowance: true, overtime: true, penalty: true });
  const [signatures, setSignatures] = useState({ ceo: true, hr: true, accountant: false, employee: true });
  const [customEn, setCustomEn] = useState("");
  const [customAr, setCustomAr] = useState("");
  const [template, setTemplate] = useState<"none"|TemplateKey>("none");
  const [purpose, setPurpose] = useState<string>("");
  const [expStart, setExpStart] = useState<string>("");
  const [expEnd, setExpEnd] = useState<string>("");

  const templates: Record<string, { title: string; en: string; ar: string; sigs: Partial<typeof signatures> }> = {
    none: { title: "", en: "", ar: "", sigs: {} },
    ...defaultTemplates as any,
  };

  function applyTemplate(text: string): string {
    const brand = getBrand();
    const now = new Date();
    const emp = selectedEmployee || {} as any;
    const map: Record<string, string> = {
      "{{name}}": `${emp.firstName || ''} ${emp.lastName || ''}`.trim(),
      "{{employeeId}}": emp.id || '',
      "{{position}}": emp.position || '',
      "{{companyName}}": brand.name || 'Company',
      "{{salary}}": emp.salary ? String(emp.salary) : '',
      "{{date}}": now.toLocaleDateString(),
      "{{purpose}}": purpose || '',
      "{{startDate}}": expStart || '',
      "{{endDate}}": expEnd || ''
    };
    return Object.keys(map).reduce((acc, k) => acc.split(k).join(map[k]), text);
  }

  const selectedEmployee = useMemo(() => employees.find((e: any) => e.id === employeeId), [employees, employeeId]);
  const employeeEvents = useMemo(() => (events as any[]).filter(e => e.employeeId === employeeId), [events, employeeId]);

  const buildDocDef = async () => {
    const brand = getBrand();
    const now = new Date();
    const docNo = controllerNumber();
    const headerColumns: any[] = [];
    if (brand.logo) headerColumns.push({ image: sanitizeImageSrc(brand.logo), width: 80, margin: [0,0,10,0] });
    headerColumns.push({ text: brand.name || 'HRPayMaster', style: 'title' });

    const content: any[] = [
      { columns: headerColumns, columnGap: 10 },
      { text: `Document No: ${docNo}`, alignment: 'right', margin: [0,6,0,10], style: 'muted' },
      { text: `Date: ${now.toLocaleString()}`, alignment: 'right', margin: [0,0,0,10], style: 'muted' },
    ];

    if (mode === 'employee' && selectedEmployee) {
      const emp = selectedEmployee;
      content.push({ text: 'Employee', style: 'section' });
      const empCols: any[] = [];
      if (includeImages.profile && emp.profileImage) empCols.push({ image: sanitizeImageSrc(emp.profileImage), width: 80, margin: [0,0,10,0] });
      empCols.push({
        stack: [
          { text: `${emp.firstName || ''} ${emp.lastName || ''}`.trim(), style: 'title' },
          { text: `${emp.position || ''} • ${emp.id}`, style: 'muted' },
        ]
      });
      content.push({ columns: empCols, columnGap: 10, margin: [0,0,0,10] });

      const pics: any[] = [];
      if (includeImages.civilId && emp.civilIdImage) pics.push({ image: sanitizeImageSrc(emp.civilIdImage), width: 180 });
      if (includeImages.passport && emp.passportImage) pics.push({ image: sanitizeImageSrc(emp.passportImage), width: 180 });
      if (includeImages.visa && emp.visaImage) pics.push({ image: sanitizeImageSrc(emp.visaImage), width: 180 });
      if (includeImages.driving && emp.drivingLicenseImage) pics.push({ image: sanitizeImageSrc(emp.drivingLicenseImage), width: 180 });
      if (pics.length) content.push({ columns: pics, columnGap: 10, margin: [0,10,0,10] });

      const kinds = Object.entries(includeEvents).filter(([, v]) => v).map(([k]) => k);
      const evFiltered = employeeEvents.filter(ev => kinds.includes(ev.eventType));
      if (evFiltered.length) {
        content.push({ text: 'Related Events', style: 'section' });
        const body = [[ 'Type', 'Title', 'Amount', 'Date' ]];
        for (const ev of evFiltered) body.push([ev.eventType, ev.title, ev.amount || '0', ev.eventDate]);
        content.push({ table: { headerRows: 1, widths: ['auto','*','auto','auto'], body } });
      }
    } else {
      // custom text
      content.push({ text: 'Custom Document', style: 'section' });
    }

    const tpl = templates[template] || templates.none;
    const blockEn = applyTemplate((customEn || tpl.en)?.trim());
    const blockAr = applyTemplate((customAr || tpl.ar)?.trim());
    if (blockEn || blockAr) {
      content.push({ columns: [
        [ { text: 'English', bold: true, margin: [0,0,0,4] }, { text: blockEn || '-', margin: [0,0,10,0] } ],
        [ { text: 'Arabic', bold: true, margin: [0,0,0,4], alignment: 'right' }, { text: blockAr || '-', alignment: 'right' } ],
      ], columnGap: 20, margin: [0,10,0,10] });
    }

    // signatures
    const sigState = { ...tpl.sigs, ...signatures } as typeof signatures;
    const sigs = Object.entries(sigState).filter(([, v]) => v).map(([k]) => k.toUpperCase());
    if (sigs.length) {
      const cols = sigs.map((role) => ({ stack: [ { text: role, style: 'muted', margin: [0,0,0,30] }, { canvas: [ { type: 'line', x1:0, y1:0, x2:180, y2:0, lineWidth: 1 } ] } ] }));
      content.push({ text: 'Signatures', style: 'section', margin: [0,10,0,6] });
      content.push({ columns: cols, columnGap: 20 });
    }

    return {
      info: { title: 'Generated Document' },
      pageMargins: [40, 56, 40, 56],
      content,
      styles: {
        title: { fontSize: 16, bold: true, color: brand.primaryColor || '#0F172A' },
        section: { fontSize: 12, bold: true, color: brand.primaryColor || '#0F172A', margin: [0, 14, 0, 6] },
        muted: { fontSize: 10, color: '#64748B' },
      },
      defaultStyle: { fontSize: 10, color: '#111827' },
    } as any;
  };

  const [saveCopy, setSaveCopy] = useState<boolean>(false);
  const [title, setTitle] = useState<string>("");
  const [description, setDescription] = useState<string>("");

  // Live preview (resolved placeholders)
  const brandPreview = getBrand();
  const nowPreview = new Date();
  const resolvedEn = applyTemplate((customEn || templates[template]?.en || '').trim());
  const resolvedAr = applyTemplate((customAr || templates[template]?.ar || '').trim());

  const buildDoc = async () => {
    const def = await buildDocDef();
    openPdf(def);
    if (saveCopy) {
      const pdfDataUrl = await buildAndEncodePdf(def as any);
      await apiPost('/api/documents', { title: title || 'Generated Document', description, pdfDataUrl });
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold tracking-tight">Document Generator</h1>
      <Tabs value={tab} onValueChange={(v)=> setTab(v as any)} className="space-y-4">
        <TabsList>
          <TabsTrigger value="create">Create</TabsTrigger>
          <TabsTrigger value="saved">Saved Documents</TabsTrigger>
          <TabsTrigger value="drawer">Employees Drawer</TabsTrigger>
        </TabsList>
        <TabsContent value="create">
      <Card>
        <CardHeader><CardTitle>Create Custom Document</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <FormLabel>Mode</FormLabel>
              <Select value={mode} onValueChange={(v)=> setMode(v as any)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="employee">Employee-based</SelectItem>
                  <SelectItem value="custom">Custom Text</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <FormLabel>Template</FormLabel>
              <Select value={template} onValueChange={(v)=> {
                setTemplate(v as any);
                const t = templates[v] || templates.none;
                if (t.title) setTitle(t.title);
                setCustomEn(t.en);
                setCustomAr(t.ar);
                setSignatures(s => ({ ...s, ...t.sigs }));
              }}>
                <SelectTrigger className="w-full"><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="noc">No Objection Certificate</SelectItem>
                  <SelectItem value="salary">Salary Certificate</SelectItem>
                  <SelectItem value="clearance">Clearance Letter</SelectItem>
                  <SelectItem value="offer">Employment Offer</SelectItem>
                  <SelectItem value="experience">Experience Letter</SelectItem>
                  <SelectItem value="warning">Warning Notice</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {mode === 'employee' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <FormLabel>Employee</FormLabel>
                <Select value={employeeId} onValueChange={setEmployeeId}>
                  <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                  <SelectContent>
                    {(employees as any[]).map((e) => (
                      <SelectItem key={e.id} value={e.id}>{e.firstName} {e.lastName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <FormLabel>Purpose (for NOC/Warning)</FormLabel>
                <Input placeholder="e.g., travel, bank account, performance" value={purpose} onChange={(e)=> setPurpose(e.target.value)} />
              </div>
              {template === 'experience' && (
                <>
                  <div>
                    <FormLabel>Start Date (Experience)</FormLabel>
                    <Input type="date" value={expStart} onChange={(e)=> setExpStart(e.target.value)} />
                  </div>
                  <div>
                    <FormLabel>End Date (Experience)</FormLabel>
                    <Input type="date" value={expEnd} onChange={(e)=> setExpEnd(e.target.value)} />
                  </div>
                </>
              )}
              <div className="space-y-2">
                <FormLabel>Include Images</FormLabel>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <label className="flex items-center gap-2"><Checkbox checked={includeImages.profile} onCheckedChange={(v)=> setIncludeImages(s=>({...s, profile: Boolean(v)}))} /> Profile</label>
                  <label className="flex items-center gap-2"><Checkbox checked={includeImages.civilId} onCheckedChange={(v)=> setIncludeImages(s=>({...s, civilId: Boolean(v)}))} /> Civil ID</label>
                  <label className="flex items-center gap-2"><Checkbox checked={includeImages.passport} onCheckedChange={(v)=> setIncludeImages(s=>({...s, passport: Boolean(v)}))} /> Passport</label>
                  <label className="flex items-center gap-2"><Checkbox checked={includeImages.visa} onCheckedChange={(v)=> setIncludeImages(s=>({...s, visa: Boolean(v)}))} /> Visa</label>
                  <label className="flex items-center gap-2"><Checkbox checked={includeImages.driving} onCheckedChange={(v)=> setIncludeImages(s=>({...s, driving: Boolean(v)}))} /> Driving License</label>
                </div>
              </div>
              <div className="space-y-2 md:col-span-2">
                <FormLabel>Include Events</FormLabel>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  {(['bonus','commission','deduction','allowance','overtime','penalty'] as const).map(k => (
                    <label key={k} className="flex items-center gap-2"><Checkbox checked={(includeEvents as any)[k]} onCheckedChange={(v)=> setIncludeEvents(s=> ({...s, [k]: Boolean(v)}))} /> {k[0].toUpperCase()+k.slice(1)}</label>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <FormLabel>English Text</FormLabel>
              <Textarea placeholder="English body..." value={customEn} onChange={e=> setCustomEn(e.target.value)} />
            </div>
            <div>
              <FormLabel>Arabic Text</FormLabel>
              <Textarea placeholder="النص العربي..." value={customAr} onChange={e=> setCustomAr(e.target.value)} />
            </div>
          </div>

          <div className="border rounded-md p-3 bg-white">
            <div className="flex items-center justify-between">
              <div className="text-lg font-semibold">{title || templates[template]?.title || 'Preview'}</div>
              <div className="text-xs text-muted-foreground">{nowPreview.toLocaleString()}</div>
            </div>
            <div className="text-xs text-muted-foreground mb-2">{brandPreview.name}</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
              <div>
                <div className="text-sm font-medium mb-1">English</div>
                <div className="text-sm whitespace-pre-wrap">{resolvedEn || '-'}</div>
              </div>
              <div>
                <div className="text-sm font-medium mb-1 text-right">Arabic</div>
                <div className="text-sm whitespace-pre-wrap text-right">{resolvedAr || '-'}</div>
              </div>
            </div>
            <div className="flex items-center gap-6 mt-4 text-xs text-muted-foreground">
              <div>CEO ________</div>
              <div>HR ________</div>
              <div>Accountant ________</div>
              <div>Employee ________</div>
            </div>
            <div className="flex justify-end mt-3">
              <Button variant="outline" onClick={()=> window.print()}>Print Preview</Button>
            </div>
          </div>

          <div className="space-y-2">
            <FormLabel>Signatures</FormLabel>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
              <label className="flex items-center gap-2"><Checkbox checked={signatures.ceo} onCheckedChange={(v)=> setSignatures(s=>({...s, ceo: Boolean(v)}))} /> CEO</label>
              <label className="flex items-center gap-2"><Checkbox checked={signatures.hr} onCheckedChange={(v)=> setSignatures(s=>({...s, hr: Boolean(v)}))} /> HR</label>
              <label className="flex items-center gap-2"><Checkbox checked={signatures.accountant} onCheckedChange={(v)=> setSignatures(s=>({...s, accountant: Boolean(v)}))} /> Accountant</label>
              <label className="flex items-center gap-2"><Checkbox checked={signatures.employee} onCheckedChange={(v)=> setSignatures(s=>({...s, employee: Boolean(v)}))} /> Employee</label>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <FormLabel>Title (for saving)</FormLabel>
              <Input placeholder="Document title" value={title} onChange={e=> setTitle(e.target.value)} />
            </div>
            <div>
              <FormLabel>Description (optional)</FormLabel>
              <Input placeholder="Short description" value={description} onChange={e=> setDescription(e.target.value)} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={saveCopy} onCheckedChange={(v)=> setSaveCopy(Boolean(v))} /> Save a copy to Saved Documents</label>
          <div className="flex justify-end">
            <Button onClick={buildDoc}>Generate Document</Button>
          </div>
        </CardContent>
      </Card>
        </TabsContent>
        <TabsContent value="saved">
          <SavedDocuments employees={employees as any[]} />
        </TabsContent>
        <TabsContent value="drawer">
          <EmployeesDrawer employees={employees as any[]} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SavedDocuments({ employees }: { employees: any[] }) {
  const { data: docs = [], refetch } = useQuery<any[]>({ queryKey: ["/api/documents"] });
  const [assigning, setAssigning] = useState<Record<string, string>>({});
  return (
    <Card>
      <CardHeader><CardTitle>Saved Documents</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {(!docs || docs.length === 0) ? (
          <div className="text-sm text-muted-foreground">No saved documents.</div>
        ) : (
          <div className="space-y-2">
            {docs.map((d) => (
              <div key={d.id} className="border rounded p-3 flex items-center justify-between">
                <div className="space-y-1">
                  <div className="font-medium">{d.title}</div>
                  <div className="text-sm text-muted-foreground">{d.description}</div>
                  <div className="text-xs text-muted-foreground">Doc#: {d.controllerNumber || '-'} • {new Date(d.createdAt).toLocaleString()}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={()=> window.open(d.documentUrl, '_blank')}>View</Button>
                  {!d.employeeId ? (
                    <>
                      <Select value={assigning[d.id] || ''} onValueChange={(v)=> setAssigning(s=> ({...s, [d.id]: v}))}>
                        <SelectTrigger className="w-48"><SelectValue placeholder="Assign to employee" /></SelectTrigger>
                        <SelectContent>
                          {employees.map((e)=> (
                            <SelectItem key={e.id} value={e.id}>{e.firstName} {e.lastName}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button onClick={async ()=> {
                        const empId = assigning[d.id]; if (!empId) return;
                        await apiPut(`/api/documents/${d.id}`, { employeeId: empId });
                        // also add to employee documents timeline
                        await apiPost(`/api/employees/${empId}/documents`, { title: d.title, description: d.description, pdfDataUrl: d.documentUrl });
                        refetch();
                      }}>Assign</Button>
                    </>
                  ) : (
                    <div className="text-xs text-muted-foreground">Assigned</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EmployeesDrawer({ employees }: { employees: any[] }) {
  const [employeeId, setEmployeeId] = useState<string>("");
  const [start, setStart] = useState<string>(() => new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]);
  const [end, setEnd] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const { data: events = [] } = useQuery<any[]>({ queryKey: ["/api/employee-events"] });
  const { data: loans = [] } = useQuery<any[]>({ queryKey: ["/api/loans"] });
  const { data: report = [] } = useQuery<any[]>({
    queryKey: ["/api/reports/employees", employeeId, start, end],
    enabled: !!employeeId,
    queryFn: async () => {
      const p = new URLSearchParams({ startDate: start, endDate: end });
      const res = await apiGet(`/api/reports/employees/${employeeId}?${p.toString()}`);
      if (!res.ok) return [] as any[];
      return res.data as any[];
    }
  });
  const emp = employees.find((e)=> e.id === employeeId) || {} as any;
  const brand = getBrand();
  const empEvents = (events as any[]).filter((e)=> e.employeeId === employeeId).sort((a,b)=> +new Date(a.eventDate) - +new Date(b.eventDate));
  const empLoans = (loans as any[]).filter((l)=> l.employeeId === employeeId);

  const totals = (report as any[]).reduce((acc: any, p: any)=> {
    acc.gross += (p.payrollEntries||[]).reduce((s: number, e: any)=> s + Number(e.grossPay||0), 0);
    acc.net += Number(p.totals?.netPay || 0);
    acc.bonus += Number(p.totals?.bonuses || 0);
    acc.deductions += Number(p.totals?.deductions || 0);
    return acc;
  }, { gross: 0, net: 0, bonus: 0, deductions: 0 });

  const bar = (label: string, value: number, max: number, color: string) => (
    <div className="space-y-1" key={label}>
      <div className="flex justify-between text-xs"><span>{label}</span><span>{value.toFixed(2)}</span></div>
      <div className="h-2 bg-gray-100 rounded"><div className="h-2 rounded" style={{ width: `${max>0? Math.min(100, (value/max)*100):0}%`, backgroundColor: color }} /></div>
    </div>
  );

  const maxVal = Math.max(totals.gross, totals.net, totals.bonus + 1, totals.deductions + 1);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
        <div className="md:col-span-2">
          <FormLabel>Employee</FormLabel>
          <Select value={employeeId} onValueChange={setEmployeeId}>
            <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
            <SelectContent>
              {employees.map((e)=> (
                <SelectItem key={e.id} value={e.id}>{e.firstName} {e.lastName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <FormLabel>Start</FormLabel>
          <Input type="date" value={start} onChange={(e)=> setStart(e.target.value)} />
        </div>
        <div>
          <FormLabel>End</FormLabel>
          <Input type="date" value={end} onChange={(e)=> setEnd(e.target.value)} />
        </div>
      </div>

      {employeeId && (
        <div className="border rounded-md bg-white">
          <div className="p-4 border-b flex items-center justify-between">
            <div>
              <div className="text-lg font-semibold">{emp.firstName} {emp.lastName}</div>
              <div className="text-xs text-muted-foreground">{emp.position} • {emp.id}</div>
            </div>
            {brand.logo && (<img src={brand.logo as any} alt="logo" className="h-10" />)}
          </div>
          <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-3">
              <div className="text-sm font-medium">Overview</div>
              {bar('Gross', totals.gross, maxVal, '#0ea5e9')}
              {bar('Net', totals.net, maxVal, '#10b981')}
              {bar('Bonuses', totals.bonus, maxVal, '#6366f1')}
              {bar('Deductions', totals.deductions, maxVal, '#ef4444')}
              <div className="text-xs text-muted-foreground">Period: {start} → {end}</div>
            </div>
            <div className="space-y-3">
              <div className="text-sm font-medium">Profile</div>
              <div className="flex items-center gap-3">
                {emp.profileImage ? (<img src={emp.profileImage} alt="profile" className="h-16 w-16 rounded object-cover" />) : (<div className="h-16 w-16 rounded bg-gray-100" />)}
                <div className="text-xs">
                  <div>{emp.firstName} {emp.lastName}</div>
                  <div className="text-muted-foreground">{emp.position}</div>
                  <div className="text-muted-foreground">{emp.workLocation || 'Office'}</div>
                </div>
              </div>
              <div className="text-xs">Loans: {empLoans.length}</div>
              <div className="text-xs">Events: {empEvents.length}</div>
            </div>
            <div className="space-y-3">
              <div className="text-sm font-medium">Quick Actions</div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={()=> window.print()}>Print</Button>
                <Button variant="outline" onClick={async ()=> {
                  // Build a simple PDF snapshot
                  const content: any[] = [];
                  content.push({ columns: [
                    brand.logo ? { image: sanitizeImageSrc(brand.logo), width: 60 } : { text: '' },
                    { stack: [ { text: `${emp.firstName||''} ${emp.lastName||''}`.trim(), style:'title' }, { text: `${emp.position||''} • ${emp.id}`, style:'muted' } ] }
                  ], columnGap: 10, margin: [0,0,0,10] });
                  content.push({ text: `Period: ${start} → ${end}`, style: 'muted', margin: [0,0,0,8] });
                  // Overview table
                  content.push({ table: { headerRows:1, widths:['*','auto'], body: [
                    ['Metric','Amount'],
                    ['Gross', totals.gross.toFixed(2)],
                    ['Net', totals.net.toFixed(2)],
                    ['Bonuses', totals.bonus.toFixed(2)],
                    ['Deductions', totals.deductions.toFixed(2)],
                  ] } });
                  // Timeline
                  const rows = [['Date','Type','Title','Amount']];
                  for (const ev of empEvents) rows.push([ new Date(ev.eventDate).toLocaleDateString(), ev.eventType, ev.title, String(ev.amount||'0') ]);
                  content.push({ text: 'Timeline', style:'section', margin:[0,10,0,6] });
                  content.push({ table: { headerRows:1, widths:['auto','auto','*','auto'], body: rows } });
                  openPdf({ pageMargins:[40,56,40,56], content, styles:{ title:{ fontSize:16, bold:true, color: brand.primaryColor||'#0F172A' }, section:{ fontSize:12, bold:true, color: brand.primaryColor||'#0F172A' }, muted:{ fontSize:10, color:'#64748B' } }, defaultStyle:{ fontSize:10, color:'#111827' } } as any);
                }}>Export PDF</Button>
              </div>
            </div>
          </div>
          <div className="p-4 border-t">
            <div className="text-sm font-medium mb-2">Timeline</div>
            <div className="space-y-2 max-h-96 overflow-auto">
              {empEvents.length === 0 ? (
                <div className="text-xs text-muted-foreground">No events in this range.</div>
              ) : (
                empEvents.map((ev)=> (
                  <div key={ev.id} className="border rounded p-2 flex items-center justify-between">
                    <div className="text-xs"><span className="text-muted-foreground mr-2">[{new Date(ev.eventDate).toLocaleDateString()}]</span>{ev.title}</div>
                    <div className="text-xs text-muted-foreground">{ev.eventType}{ev.amount?` • ${ev.amount}`:''}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
