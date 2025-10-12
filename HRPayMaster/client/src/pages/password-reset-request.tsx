import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { apiPost } from "@/lib/http";
import { Loader2, MailCheck } from "lucide-react";

export default function PasswordResetRequest() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const normalized = email.trim();
    if (!normalized) {
      setError(t("passwordReset.emailRequired"));
      return;
    }

    try {
      setIsSubmitting(true);
      await apiPost("/forgot-password", { email: normalized });
      setSubmitted(true);
    } catch (err: any) {
      setError(err?.message ?? t("passwordReset.requestError"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 px-4">
      <Card className="w-full max-w-lg shadow-lg">
        <CardHeader className="text-center space-y-3">
          <CardTitle>{t("passwordReset.requestTitle")}</CardTitle>
          <CardDescription>{t("passwordReset.requestDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          {submitted ? (
            <Alert variant="default" className="bg-green-50 border-green-200 text-green-900">
              <MailCheck className="h-4 w-4" />
              <AlertTitle>{t("passwordReset.requestSuccessTitle")}</AlertTitle>
              <AlertDescription>{t("passwordReset.requestSuccessDescription", { email })}</AlertDescription>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button type="button" variant="secondary" onClick={() => navigate("/login")}>
                  {t("passwordReset.backToLogin")}
                </Button>
                <Button type="button" onClick={() => setSubmitted(false)}>
                  {t("passwordReset.requestAgain")}
                </Button>
              </div>
            </Alert>
          ) : (
            <form className="space-y-6" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="email">{t("passwordReset.emailLabel")}</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? "forgot-error" : undefined}
                />
              </div>
              {error && (
                <p className="text-sm text-red-600" id="forgot-error" data-testid="forgot-error">
                  {error}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t("passwordReset.requestSubmitting")}
                  </span>
                ) : (
                  t("passwordReset.requestSubmit")
                )}
              </Button>
              <div className="text-center">
                <Button type="button" variant="link" onClick={() => navigate("/login")}> 
                  {t("passwordReset.backToLogin")}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
