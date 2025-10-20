import { Switch, Route, Link, useLocation } from "wouter";
import { useEffect, useMemo } from "react";
import { useTranslation } from "@/lib/i18n";
import { queryClient, getQueryFn } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Layout from "@/components/layout/layout";
import Dashboard from "@/pages/dashboard";
import Reports from "@/pages/reports";
import People from "@/pages/people";
import Finance from "@/pages/finance";
import AssetsFleet from "@/pages/assets-fleet";
import Compliance from "@/pages/compliance";
import EmployeeFile from "@/pages/employee-file";
import AssetFile from "@/pages/asset-file";
import Settings from "@/pages/settings";
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import PasswordResetRequest from "@/pages/password-reset-request";
import PasswordReset from "@/pages/password-reset";
import Chatbot from "@/components/chatbot";
import type { SessionUser } from "@shared/schema";
import { apiGet } from "@/lib/http";
import Security from "@/pages/security";

function Router() {
  const { data: user, isLoading } = useQuery<SessionUser | null>({
    queryKey: ["/api/me"],
    queryFn: getQueryFn<SessionUser | null>({ on401: "returnNull" }),
  });
  const [location, navigate] = useLocation();
  const publicPrefixes = useMemo(() => ["/login", "/forgot-password", "/reset-password"], []);

  useEffect(() => {
    if (isLoading) return;
    if (!user && !publicPrefixes.some(prefix => location.startsWith(prefix))) {
      navigate("/login");
    }
  }, [isLoading, user, location, navigate, publicPrefixes]);

  useEffect(() => {
    if (isLoading) return;
    if (user && publicPrefixes.some(prefix => location.startsWith(prefix))) {
      navigate("/");
    }
  }, [isLoading, user, location, navigate, publicPrefixes]);

  if (isLoading) return null;

  if (!user) {
    return (
      <Switch>
        <Route path="/login" component={Login} />
        <Route path="/forgot-password" component={PasswordResetRequest} />
        <Route path="/reset-password/:token">
          {params => <PasswordReset initialToken={params.token} />}
        </Route>
        <Route path="/reset-password">
          {() => <PasswordReset />}
        </Route>
        <Route>
          <Login />
        </Route>
      </Switch>
    );
  }

  const Redirect = ({ to }: { to: string }) => {
    useEffect(() => {
      navigate(to);
    }, [to, navigate]);
    return null;
  };

  return (
    <Layout user={user}>
      {/* bootstrap company settings into window for pdf/logo */}
      <CompanyBootstrap />
      {/* Navigation entry for Chatbot */}
      <Link href="/chat" className="sr-only">
        Chatbot
      </Link>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/people" component={People} />
        <Route path="/finance" component={Finance} />
        <Route path="/reports" component={Reports} />
        <Route path="/assets-fleet" component={AssetsFleet} />
        <Route path="/compliance" component={Compliance} />
        <Route path="/security" component={Security} />
        <Route path="/employee-file" component={EmployeeFile} />
        <Route path="/asset-file" component={AssetFile} />
        <Route path="/settings" component={Settings} />
        {/* Legacy routes -> consolidated destinations */}
        <Route path="/employees"><Redirect to="/people?tab=employees" /></Route>
        <Route path="/departments"><Redirect to="/people?tab=departments" /></Route>
        <Route path="/vacations"><Redirect to="/people?tab=vacations" /></Route>
        <Route path="/employee-events"><Redirect to="/people?tab=events" /></Route>
        <Route path="/payroll"><Redirect to="/finance?tab=payroll" /></Route>
        <Route path="/loans"><Redirect to="/finance?tab=loans" /></Route>
        <Route path="/assets"><Redirect to="/assets-fleet?tab=assets" /></Route>
        <Route path="/cars"><Redirect to="/assets-fleet?tab=fleet" /></Route>
        <Route path="/documents"><Redirect to="/compliance?tab=expiry" /></Route>
        <Route path="/notifications"><Redirect to="/compliance?tab=notifications" /></Route>
        {/* Path aliases for tab-specific deep links */}
        <Route path="/people/employees"><Redirect to="/people?tab=employees" /></Route>
        <Route path="/people/departments"><Redirect to="/people?tab=departments" /></Route>
        <Route path="/people/vacations"><Redirect to="/people?tab=vacations" /></Route>
        <Route path="/people/events"><Redirect to="/people?tab=events" /></Route>
        <Route path="/finance/payroll"><Redirect to="/finance?tab=payroll" /></Route>
        <Route path="/finance/loans"><Redirect to="/finance?tab=loans" /></Route>
        <Route path="/assets-fleet/fleet"><Redirect to="/assets-fleet?tab=fleet" /></Route>
        <Route path="/assets-fleet/assets"><Redirect to="/assets-fleet?tab=assets" /></Route>
        <Route path="/compliance/expiry"><Redirect to="/compliance?tab=expiry" /></Route>
        <Route path="/compliance/notifications"><Redirect to="/compliance?tab=notifications" /></Route>
        <Route path="/chat">
          <Chatbot />
        </Route>
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function CompanyBootstrap() {
  useEffect(() => {
    (async () => {
      try {
        const res = await apiGet('/api/company');
        if ((res as any).ok) {
          const c = (res as any).data || {};
          (window as any).__companyName = c.name;
          (window as any).__companyLogo = c.logo;
          (window as any).__companyPrimaryColor = c.primaryColor;
          (window as any).__companySecondaryColor = c.secondaryColor;
          (window as any).__companyEmail = c.email;
          (window as any).__companyPhone = c.phone;
          (window as any).__companyWebsite = c.website;
          (window as any).__companyAddress = c.address;
        }
      } catch {}
    })();
  }, []);
  return null;
}

function App() {
  const { i18n } = useTranslation();

  useEffect(() => {
    const lang = i18n.language;
    document.documentElement.lang = lang === "ar" ? "ar" : "en";
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  }, [i18n.language]);

  // Apply persisted theme
  useEffect(() => {
    try {
      const saved = localStorage.getItem('theme');
      const root = document.documentElement;
      if (saved === 'dark') root.classList.add('dark');
      if (saved === 'light') root.classList.remove('dark');
    } catch {}
  }, []);

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
