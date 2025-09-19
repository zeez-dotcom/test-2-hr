import { useEffect, useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Payroll from "@/pages/payroll";
import Loans from "@/pages/loans";
import { useTranslation } from "react-i18next";

export default function Finance() {
  const { t } = useTranslation();
  const allowed = ["payroll", "loans"] as const;
  const defaultTab = "payroll" as const;
  const [location, navigate] = useLocation();
  const search = useSearch();
  const qs = useMemo(() => new URLSearchParams(search), [search]);
  const initial = qs.get("tab")?.toLowerCase();
  const startTab = allowed.includes(initial as any) ? (initial as typeof allowed[number]) : defaultTab;
  const [tab, setTab] = useState<typeof allowed[number]>(startTab);

  useEffect(() => {
    const q = new URLSearchParams(search);
    const t = q.get("tab")?.toLowerCase();
    setTab(allowed.includes(t as any) ? (t as any) : defaultTab);
  }, [search]);

  const onTabChange = (value: string) => {
    const next = allowed.includes(value as any) ? value : defaultTab;
    setTab(next as any);
    navigate(`${location}?tab=${next}`);
  };
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold tracking-tight">{t('nav.finance','Finance')}</h1>
      <Tabs value={tab} onValueChange={onTabChange} className="space-y-4">
        <TabsList>
          <TabsTrigger value="payroll">{t('nav.payroll','Payroll')}</TabsTrigger>
          <TabsTrigger value="loans">{t('nav.loans','Loans')}</TabsTrigger>
        </TabsList>
        <TabsContent value="payroll">
          <Payroll />
        </TabsContent>
        <TabsContent value="loans">
          <Loans />
        </TabsContent>
      </Tabs>
    </div>
  );
}
