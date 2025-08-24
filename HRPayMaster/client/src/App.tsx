import { Switch, Route, useLocation } from "wouter";
import { useEffect } from "react";
import { useTranslation } from "@/lib/i18n";
import { queryClient, getQueryFn } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Layout from "@/components/layout/layout";
import Dashboard from "@/pages/dashboard";
import Employees from "@/pages/employees";
import Payroll from "@/pages/payroll";
import EmployeeEvents from "@/pages/employee-events";
import Reports from "@/pages/reports";
import Departments from "@/pages/departments";
import Vacations from "@/pages/vacations";
import Loans from "@/pages/loans";
import Cars from "@/pages/cars";
import Notifications from "@/pages/notifications";
import Documents from "@/pages/documents";
import Assets from "@/pages/assets";
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import Chatbot from "@/components/chatbot";

function Router() {
  const { data: user, isLoading } = useQuery({
    queryKey: ["/api/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });
  const [location, navigate] = useLocation();

  if (isLoading) return null;

  if (!user) {
    if (location !== "/login") navigate("/login");
    return <Login />;
  }

  if (location === "/login") {
    navigate("/");
  }

  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/employees" component={Employees} />
        <Route path="/payroll" component={Payroll} />
        <Route path="/employee-events" component={EmployeeEvents} />
        <Route path="/reports" component={Reports} />
        <Route path="/departments" component={Departments} />
        <Route path="/vacations" component={Vacations} />
        <Route path="/loans" component={Loans} />
        <Route path="/assets" component={Assets} />
        <Route path="/cars" component={Cars} />
        <Route path="/notifications" component={Notifications} />
        <Route path="/documents" component={Documents} />
        <Route path="/chat" component={Chatbot} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  const { i18n } = useTranslation();

  useEffect(() => {
    const lang = i18n.language;
    document.documentElement.lang = lang === "ar" ? "ar" : "en";
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  }, [i18n.language]);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
