import { Switch, Route, useLocation } from "wouter";
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
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";

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
        <Route path="/cars" component={Cars} />
        <Route path="/notifications" component={Notifications} />
        <Route path="/documents" component={Documents} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
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
