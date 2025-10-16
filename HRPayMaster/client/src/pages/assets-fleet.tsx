import { useEffect, useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Assets from "@/pages/assets";
import Cars from "@/pages/cars";
import { useTranslation } from "react-i18next";
import { CarFront } from "lucide-react";

export default function AssetsFleet() {
  const { t } = useTranslation();
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
    <div className="space-y-6 sm:space-y-8">
      <Card className="overflow-hidden border-none bg-gradient-to-r from-primary/10 via-primary/5 to-primary/10 shadow-md">
        <CardContent className="p-6 sm:p-8">
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-1 items-start gap-4">
                <div className="rounded-full bg-primary/15 p-3">
                  <CarFront className="h-8 w-8 text-primary" />
                </div>
                <div className="space-y-2">
                  <h1 className="text-3xl font-bold tracking-tight">
                    {t("nav.assetsFleet", "Assets & Fleet")}
                  </h1>
                  <p className="text-base text-muted-foreground">
                    {t(
                      "nav.assetsFleetDescription",
                      "Monitor your fleet vehicles and asset inventory from a unified workspace."
                    )}
                  </p>
                </div>
              </div>
            </div>
            <Tabs value={tab} onValueChange={onTabChange} className="space-y-6">
              <TabsList className="flex w-full flex-col gap-2 rounded-xl border border-border/60 bg-background/80 p-1 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/60 sm:flex-row sm:items-center">
                <TabsTrigger
                  value="fleet"
                  className="flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  {t("nav.cars", "Fleet")}
                </TabsTrigger>
                <TabsTrigger
                  value="assets"
                  className="flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  {t("nav.assets", "Assets")}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="fleet" className="mt-0">
                <Cars />
              </TabsContent>
              <TabsContent value="assets" className="mt-0">
                <Assets />
              </TabsContent>
            </Tabs>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
