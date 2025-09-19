import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useEffect } from "react";
import { apiGet, apiPut } from "@/lib/http";
import { defaultTemplates } from "@/lib/default-templates";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";

export default function Settings() {
  const { t } = useTranslation();
  const { data: me } = useQuery<any>({ queryKey: ["/api/me"] });
  const { data: company } = useQuery<any>({ queryKey: ["/api/company"] });
  const { data: templates = [] } = useQuery<any[]>({ queryKey: ["/api/templates"] });
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [primaryColor, setPrimaryColor] = useState('');
  const [secondaryColor, setSecondaryColor] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [address, setAddress] = useState('');
  const [useAttendance, setUseAttendance] = useState<boolean>(false);
  useEffect(() => {
    if (company && typeof company.useAttendanceForDeductions === 'boolean') {
      setUseAttendance(Boolean(company.useAttendanceForDeductions));
    }
  }, [company]);
  const { toast } = useToast();
  const update = useMutation({
    mutationFn: async () => {
      const payload: any = {};
      if (name) payload.name = name;
      if (primaryColor) payload.primaryColor = primaryColor;
      if (secondaryColor) payload.secondaryColor = secondaryColor;
      if (email) payload.email = email;
      if (phone) payload.phone = phone;
      if (website) payload.website = website;
      if (address) payload.address = address;
      payload.useAttendanceForDeductions = useAttendance;
      if (file) {
        const b64 = await new Promise<string>((resolve, reject) => {
          const r = new FileReader(); r.onload = () => resolve(r.result as string); r.onerror = reject; r.readAsDataURL(file);
        });
        payload.logo = b64;
      }
      const res = await apiPut('/api/company', payload);
      if (!res.ok) throw new Error(res.error || 'Failed');
      return res.data;
    },
    onSuccess: () => { toast({ title: 'Updated' }); },
    onError: () => { toast({ title: 'Error', description: 'Failed to update', variant: 'destructive' }); },
  })
  if (!me || me.role !== 'admin') {
    return <div className="text-sm text-muted-foreground">{t('settings.onlyAdmin','Only super admin can access settings.')}</div>;
  }
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold tracking-tight">{t('nav.settings')}</h1>
      <Card>
        <CardHeader><CardTitle>{t('settings.company','Company')}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <Checkbox checked={useAttendance || company?.useAttendanceForDeductions} onCheckedChange={(v)=> setUseAttendance(Boolean(v))} />
            <span className="text-sm">{t('settings.useAttendance','Use attendance-based deduction in payroll')}</span>
          </div>
          <div className="space-y-1">
            <label className="text-sm">{t('settings.name','Name')}</label>
            <Input placeholder={company?.name || 'Company'} value={name} onChange={e=>setName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-sm">{t('settings.logo','Logo')}</label>
            <Input type="file" accept="image/*" onChange={e=> setFile(e.target.files?.[0] || null)} />
            {company?.logo && (<img src={company.logo} alt="logo" className="h-16 mt-2" />)}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm">{t('settings.primaryColor','Primary Color')}</label>
              <Input type="color" value={primaryColor || company?.primaryColor || '#0F172A'} onChange={e=>setPrimaryColor(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-sm">{t('settings.secondaryColor','Secondary Color')}</label>
              <Input type="color" value={secondaryColor || company?.secondaryColor || '#64748B'} onChange={e=>setSecondaryColor(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-sm">{t('settings.email','Email')}</label>
              <Input type="email" placeholder={company?.email || 'info@company.com'} value={email} onChange={e=>setEmail(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-sm">{t('settings.phone','Phone')}</label>
              <Input placeholder={company?.phone || '+1 555 123 4567'} value={phone} onChange={e=>setPhone(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-sm">{t('settings.website','Website')}</label>
              <Input placeholder={company?.website || 'https://example.com'} value={website} onChange={e=>setWebsite(e.target.value)} />
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-sm">{t('settings.address','Address')}</label>
              <Input placeholder={company?.address || '123 Main St, City, Country'} value={address} onChange={e=>setAddress(e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end"><Button onClick={()=>update.mutate()} disabled={update.isPending}>{t('actions.save')}</Button></div>
        </CardContent>
      </Card>

      {/* Templates management */}
      <TemplatesCard templates={templates} />
    </div>
  );
}

function TemplatesCard({ templates }: { templates: any[] }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [active, setActive] = useState<'noc'|'offer'|'warning'|'experience'>('noc');
  const map = Object.fromEntries((templates||[]).map((r:any)=> [r.key, r]));
  const [enVal, setEnVal] = useState<string>('');
  const [arVal, setArVal] = useState<string>('');
  const syncDefaults = (key: typeof active) => {
    const d = (defaultTemplates as any)[key];
    setEnVal(d?.en || '');
    setArVal(d?.ar || '');
  };
  useEffect(() => {
    const row = map[active];
    if (row) {
      setEnVal(row.en || '');
      setArVal(row.ar || '');
    } else {
      const d = (defaultTemplates as any)[active] || {};
      setEnVal(d.en || '');
      setArVal(d.ar || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, templates?.length]);
  const save = useMutation({
    mutationFn: async () => {
      const res = await apiPut(`/api/templates/${active}`, { en: enVal, ar: arVal });
      if (!res.ok) throw new Error(res.error || 'Failed');
      return res.data;
    },
    onSuccess: () => toast({ title: t('actions.save','Saved') }),
    onError: () => toast({ title: t('errors.errorTitle','Error'), description: t('errors.general','An unexpected error occurred'), variant: 'destructive' }),
  });
  return (
    <Card>
      <CardHeader><CardTitle>{t('settings.templates','Templates')}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-sm">{t('settings.templateType','Template')}</label>
            <select className="border rounded px-2 py-1 w-full" value={active} onChange={(e)=>{ setEnVal(''); setArVal(''); setActive(e.target.value as any); }}>
              <option value="noc">{t('docgen.noc','No Objection Certificate')}</option>
              <option value="offer">{t('docgen.offer','Employment Offer')}</option>
              <option value="warning">{t('docgen.warning','Warning Notice')}</option>
              <option value="experience">{t('docgen.experience','Experience Letter')}</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-sm">{t('docgen.englishText','English Text')}</label>
            <textarea className="border rounded w-full h-40 p-2 text-sm" value={enVal} onChange={(e)=> setEnVal(e.target.value)} />
          </div>
          <div>
            <label className="text-sm">{t('docgen.arabicText','Arabic Text')}</label>
            <textarea dir="rtl" className="border rounded w-full h-40 p-2 text-sm" value={arVal} onChange={(e)=> setArVal(e.target.value)} />
          </div>
        </div>
        <div className="flex items-center gap-2 justify-end">
          <Button variant="outline" onClick={()=> syncDefaults(active)}>{t('actions.reset','Reset')}</Button>
          <Button onClick={()=> save.mutate()} disabled={save.isPending}>{t('actions.save','Save')}</Button>
        </div>
      </CardContent>
    </Card>
  );
}
