import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onBack?: () => void;
  onResend?: () => void;
  isSubmitting?: boolean;
  error?: string;
  title: string;
  description: string;
  backupHint: string;
  codeLabel: string;
  verifyLabel: string;
  verifyingLabel: string;
  backLabel: string;
  resendLabel: string;
};

export function MfaChallengeForm({
  value,
  onChange,
  onSubmit,
  onBack,
  onResend,
  isSubmitting,
  error,
  title,
  description,
  backupHint,
  codeLabel,
  verifyLabel,
  verifyingLabel,
  backLabel,
  resendLabel,
}: Props) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      className="space-y-4"
    >
      <div className="space-y-2 text-center">
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
        <p className="text-xs text-muted-foreground">{backupHint}</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="mfa-code">{codeLabel}</Label>
        <Input
          id="mfa-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "mfa-error" : undefined}
        />
      </div>
      {error && (
        <p className="text-sm text-destructive" id="mfa-error" data-testid="mfa-error">
          {error}
        </p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? verifyingLabel : verifyLabel}
          </Button>
          {onBack && (
            <Button type="button" variant="outline" onClick={onBack} disabled={isSubmitting}>
              {backLabel}
            </Button>
          )}
        </div>
        {onResend && (
          <Button
            type="button"
            variant="ghost"
            className={cn("px-0", isSubmitting && "opacity-50 pointer-events-none")}
            onClick={onResend}
            disabled={isSubmitting}
          >
            {resendLabel}
          </Button>
        )}
      </div>
    </form>
  );
}

export default MfaChallengeForm;
