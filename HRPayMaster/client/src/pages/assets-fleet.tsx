import { useEffect, useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Assets from "@/pages/assets";
import Cars from "@/pages/cars";

export default function AssetsFleet() {
  const allowed = ["fleet", "assets"] as const;
  const defaultTab = "fleet" as const;
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
      <h1 className="text-3xl font-bold tracking-tight">Assets & Fleet</h1>
      <Tabs value={tab} onValueChange={onTabChange} className="space-y-4">
        <TabsList>
          <TabsTrigger value="fleet">Fleet</TabsTrigger>
          <TabsTrigger value="assets">Assets</TabsTrigger>
        </TabsList>
        <TabsContent value="fleet">
          <Cars />
        </TabsContent>
        <TabsContent value="assets">
          <Assets />
        </TabsContent>
      </Tabs>
    </div>
  );
}
