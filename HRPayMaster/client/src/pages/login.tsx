import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { queryClient } from "@/lib/queryClient";
import { apiPost } from "@/lib/http";
import { useLocation } from "wouter";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [, navigate] = useLocation();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [capsOn, setCapsOn] = useState(false);
  const [remember, setRemember] = useState<boolean>(() => {
    try {
      return localStorage.getItem("rememberUsername") === "1";
    } catch {
      return false;
    }
  });
  const [usernameHydrated, setUsernameHydrated] = useState(false);
  const { t } = useTranslation();

  // Pre-fill username if remembered
  useState(() => {
    try {
      const saved = localStorage.getItem("rememberedUsername") || "";
      if (saved) setUsername(saved);
    } finally {
      setUsernameHydrated(true);
    }
  });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!username || !password) {
      setError(t("errors.loginRequired"));
      return;
    }
    try {
      setIsSubmitting(true);
      const res = await apiPost("/login", { username, password });
      if (!res.ok) throw new Error(res.error || t("login.loginFailed"));
      // Remember username locally if opted in
      try {
        if (remember) {
          localStorage.setItem("rememberedUsername", username);
          localStorage.setItem("rememberUsername", "1");
        } else {
          localStorage.removeItem("rememberedUsername");
          localStorage.removeItem("rememberUsername");
        }
      } catch {}
      await queryClient.invalidateQueries({ queryKey: ["/api/me"] });
      navigate("/");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="absolute top-4 right-4">
        <LangToggle />
      </div>
      <Card className="w-full max-w-sm mx-4 shadow-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 w-12 h-12 rounded-lg bg-primary flex items-center justify-center overflow-hidden">
            {typeof window !== 'undefined' && (window as any).__companyLogo ? (
              <img src={(window as any).__companyLogo} alt="Logo" className="w-12 h-12 object-cover" />
            ) : (
              <span className="text-white font-bold">HR</span>
            )}
          </div>
          <CardTitle>{t("login.title")}</CardTitle>
          <CardDescription>{t("login.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">{t("login.username")}</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
                aria-invalid={!!error}
                aria-describedby={error ? "login-error" : undefined}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t("login.password")}</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPwd ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyUp={(e) => setCapsOn((e as any).getModifierState?.("CapsLock"))}
                  autoComplete="current-password"
                  required
                  className="pr-10"
                  aria-invalid={!!error}
                  aria-describedby={error ? "login-error" : undefined}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500"
                  aria-label={t(showPwd ? "login.hidePassword" : "login.showPassword")}
                >
                  {showPwd ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {capsOn && (
                <p className="text-xs text-amber-600" role="status">{t("login.capsLockOn")}</p>
              )}
            </div>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-gray-600">
                <Checkbox
                  id="remember"
                  checked={remember}
                  onCheckedChange={(v) => setRemember(Boolean(v))}
                />
                {t("login.rememberMe")}
              </label>
              <a className="text-sm text-primary hover:underline" href="#" onClick={(e) => e.preventDefault()}>
                {t("login.forgotPassword")}
              </a>
            </div>
            {error && (
              <p className="text-sm text-red-600" data-testid="form-error" id="login-error">
                {String(error)}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("login.loggingIn")}
                </span>
              ) : (
                t("login.submit")
              )}
            </Button>
            <p className="text-xs text-gray-500 text-center">
              {t("login.hint")}
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function LangToggle() {
  const { i18n } = useTranslation();
  const isAr = i18n.language === "ar";
  function toggle() {
    const next = isAr ? "en" : "ar";
    i18n.changeLanguage(next);
    try { localStorage.setItem("language", next); } catch {}
  }
  return (
    <Button variant="outline" size="sm" onClick={toggle} aria-label="Toggle language">
      {isAr ? "العربية" : "English"}
    </Button>
  );
}
