import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, ShieldCheck } from "lucide-react";
import { apiPost } from "@/lib/http";

interface PasswordResetProps {
  initialToken?: string;
}

export default function PasswordReset({ initialToken }: PasswordResetProps) {
  const { t } = useTranslation();
  const [location, navigate] = useLocation();
  const [token, setToken] = useState(initialToken ?? "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);

  const tokenFromQuery = useMemo(() => {
    if (initialToken) return initialToken;
    try {
      const [, queryString = ""] = location.split("?");
      const params = new URLSearchParams(queryString);
      const queryToken = params.get("token");
      return queryToken ?? "";
    } catch {
      return "";
    }
  }, [initialToken, location]);

  useEffect(() => {
    if (tokenFromQuery) {
      setToken(tokenFromQuery);
    }
  }, [tokenFromQuery]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const trimmedToken = token.trim();
    if (!trimmedToken) {
      setError(t("passwordReset.tokenRequired"));
      return;
    }
    if (password.length < 8) {
      setError(t("passwordReset.passwordTooShort"));
      return;
    }
    if (password !== confirmPassword) {
      setError(t("passwordReset.passwordMismatch"));
      return;
    }

    try {
      setIsSubmitting(true);
      const response = await apiPost("/reset-password", {
        token: trimmedToken,
        password,
      });
      if (!response?.ok) {
        throw new Error((response as any)?.error || t("passwordReset.resetError"));
      }
      setCompleted(true);
    } catch (err: any) {
      setError(err?.message ?? t("passwordReset.resetError"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 px-4">
      <Card className="w-full max-w-lg shadow-lg">
        <CardHeader className="text-center space-y-3">
          <CardTitle>{t("passwordReset.resetTitle")}</CardTitle>
          <CardDescription>{t("passwordReset.resetDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          {completed ? (
            <Alert variant="default" className="bg-blue-50 border-blue-200 text-blue-900">
              <ShieldCheck className="h-4 w-4" />
              <AlertTitle>{t("passwordReset.resetSuccessTitle")}</AlertTitle>
              <AlertDescription>{t("passwordReset.resetSuccessDescription")}</AlertDescription>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button type="button" onClick={() => navigate("/login")}> 
                  {t("passwordReset.backToLogin")}
                </Button>
                <Button type="button" variant="secondary" onClick={() => navigate("/forgot-password")}> 
                  {t("passwordReset.needAnotherLink")}
                </Button>
              </div>
            </Alert>
          ) : (
            <form className="space-y-6" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="token">{t("passwordReset.tokenLabel")}</Label>
                <Input
                  id="token"
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                  autoComplete="off"
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? "reset-error" : undefined}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">{t("passwordReset.newPasswordLabel")}</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">{t("passwordReset.confirmPasswordLabel")}</Label>
                <Input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />
              </div>
              {error && (
                <p className="text-sm text-red-600" id="reset-error" data-testid="reset-error">
                  {error}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t("passwordReset.resetSubmitting")}
                  </span>
                ) : (
                  t("passwordReset.resetSubmit")
                )}
              </Button>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-sm text-gray-600">
                <button type="button" className="text-primary hover:underline" onClick={() => navigate("/forgot-password")}> 
                  {t("passwordReset.needAnotherLink")}
                </button>
                <button type="button" className="text-primary hover:underline" onClick={() => navigate("/login")}> 
                  {t("passwordReset.backToLogin")}
                </button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
