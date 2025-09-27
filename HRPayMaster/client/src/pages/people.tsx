import { useEffect, useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Employees from "@/pages/employees";
import Departments from "@/pages/departments";
import Vacations from "@/pages/vacations";
import EmployeeEvents from "@/pages/employee-events";
import Attendance from "@/pages/attendance";
import DocumentGenerator from "@/pages/document-generator";
import Logs from "@/pages/logs";
import { useTranslation } from "react-i18next";

export default function People() {
  const { t } = useTranslation();
  const allowed = ["employees", "departments", "vacations", "events", "attendance", "logs", "docgen"] as const;
  const defaultTab = "employees" as const;
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
      <h1 className="text-3xl font-bold tracking-tight">{t('nav.people','People')}</h1>
      <Tabs value={tab} onValueChange={onTabChange} className="space-y-4">
        <TabsList>
          <TabsTrigger value="employees">{t('nav.employees','Employees')}</TabsTrigger>
          <TabsTrigger value="departments">{t('nav.departments','Departments')}</TabsTrigger>
          <TabsTrigger value="vacations">{t('nav.vacations','Vacations')}</TabsTrigger>
          <TabsTrigger value="events">{t('nav.employeeEvents','Events')}</TabsTrigger>
          <TabsTrigger value="attendance">{t('nav.attendance','Attendance')}</TabsTrigger>
          <TabsTrigger value="logs">{t('nav.logs','Logs')}</TabsTrigger>
          <TabsTrigger value="docgen">{t('docgen.title','Document Generator')}</TabsTrigger>
        </TabsList>
        <TabsContent value="employees">
          <Employees />
        </TabsContent>
        <TabsContent value="departments">
          <Departments />
        </TabsContent>
        <TabsContent value="vacations">
          <Vacations />
        </TabsContent>
        <TabsContent value="events">
          <EmployeeEvents />
        </TabsContent>
        <TabsContent value="attendance">
          <Attendance />
        </TabsContent>
        <TabsContent value="logs">
          <Logs />
        </TabsContent>
        <TabsContent value="docgen">
          <DocumentGenerator />
        </TabsContent>
      </Tabs>
    </div>
  );
}
