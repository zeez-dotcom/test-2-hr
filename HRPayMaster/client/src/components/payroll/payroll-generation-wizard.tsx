import { useMemo, useState } from "react";
import PayrollForm from "./payroll-form";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { apiPost } from "@/lib/http";
import { formatCurrency } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

export interface PayrollGenerationPayload {
  period: string;
  startDate: string;
  endDate: string;
  deductions?: {
    taxDeduction?: number;
    socialSecurityDeduction?: number;
    healthInsuranceDeduction?: number;
  };
  useAttendance?: boolean;
  overrides?: {
    skippedVacationIds?: string[];
    skippedLoanIds?: string[];
    skippedEventIds?: string[];
  };
}

interface PayrollGenerationWizardProps {
  onSubmit: (payload: PayrollGenerationPayload) => void;
  isSubmitting: boolean;
  canGenerate: boolean;
}

type PayrollPreviewAllowance = {
  id: string;
  title: string;
  amount: number;
  source: "period" | "recurring";
};

type PayrollPreviewEvent = {
  id: string;
  title: string;
  amount: number;
  eventType: string;
  eventDate: string | null;
  effect: "bonus" | "deduction";
};

type PayrollPreviewLoan = {
  id: string;
  reason: string | null;
  monthlyDeduction: number;
  remainingAmount: number;
};

type PayrollPreviewVacation = {
  id: string;
  startDate: string;
  endDate: string;
  daysInPeriod: number;
};

type PayrollPreviewEmployee = {
  employeeId: string;
  employeeCode: string | null;
  employeeName: string;
  position: string | null;
  vacations: PayrollPreviewVacation[];
  loans: PayrollPreviewLoan[];
  events: PayrollPreviewEvent[];
  allowances: PayrollPreviewAllowance[];
};

type PayrollPreviewResponse = {
  period: string;
  startDate: string;
  endDate: string;
  employees: PayrollPreviewEmployee[];
};

type WizardStep = "form" | "vacations" | "loans" | "events" | "allowances" | "review";

const dataSteps: Exclude<WizardStep, "form">[] = [
  "vacations",
  "loans",
  "events",
  "allowances",
  "review",
];

interface OverrideState {
  skippedVacations: Set<string>;
  skippedLoans: Set<string>;
  skippedEvents: Set<string>;
}

const createInitialOverrides = (): OverrideState => ({
  skippedVacations: new Set(),
  skippedLoans: new Set(),
  skippedEvents: new Set(),
});

const normalizeTitle = (title: string | null | undefined, fallback: string) => {
  if (typeof title === "string" && title.trim() !== "") {
    return title.trim();
  }
  return fallback;
};

export default function PayrollGenerationWizard({
  onSubmit,
  isSubmitting,
  canGenerate,
}: PayrollGenerationWizardProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<WizardStep>("form");
  const [formValues, setFormValues] = useState<PayrollGenerationPayload | null>(null);
  const [preview, setPreview] = useState<PayrollPreviewResponse | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<OverrideState>(createInitialOverrides);

  const vacationEmployees = useMemo(
    () => preview?.employees.filter(employee => employee.vacations.length > 0) ?? [],
    [preview],
  );
  const loanEmployees = useMemo(
    () => preview?.employees.filter(employee => employee.loans.length > 0) ?? [],
    [preview],
  );
  const eventEmployees = useMemo(
    () => preview?.employees.filter(employee => employee.events.length > 0) ?? [],
    [preview],
  );
  const allowanceEmployees = useMemo(
    () => preview?.employees.filter(employee => employee.allowances.length > 0) ?? [],
    [preview],
  );

  const totalVacationCount = useMemo(
    () => vacationEmployees.reduce((total, employee) => total + employee.vacations.length, 0),
    [vacationEmployees],
  );
  const totalLoanCount = useMemo(
    () => loanEmployees.reduce((total, employee) => total + employee.loans.length, 0),
    [loanEmployees],
  );
  const totalEventCount = useMemo(
    () => eventEmployees.reduce((total, employee) => total + employee.events.length, 0),
    [eventEmployees],
  );
  const totalAllowanceCount = useMemo(
    () => allowanceEmployees.reduce((total, employee) => total + employee.allowances.length, 0),
    [allowanceEmployees],
  );

  const skippedEventCount = useMemo(
    () =>
      eventEmployees.reduce(
        (total, employee) =>
          total + employee.events.filter(event => overrides.skippedEvents.has(event.id)).length,
        0,
      ),
    [eventEmployees, overrides.skippedEvents],
  );

  const skippedAllowanceCount = useMemo(
    () =>
      allowanceEmployees.reduce(
        (total, employee) =>
          total + employee.allowances.filter(allowance => overrides.skippedEvents.has(allowance.id)).length,
        0,
      ),
    [allowanceEmployees, overrides.skippedEvents],
  );

  const handleFormSubmit = async (values: PayrollGenerationPayload) => {
    setIsLoadingPreview(true);
    setLoadError(null);
    try {
      const response = await apiPost("/api/payroll/preview", values);
      if (!response.ok) {
        const message =
          (response.error && typeof response.error === "object" &&
            "message" in response.error &&
            typeof (response.error as any).message === "string"
            ? (response.error as any).message
            : typeof response.error === "string"
              ? response.error
              : null) ?? "Failed to load payroll preview";
        setLoadError(message);
        toast({ title: "Error", description: message, variant: "destructive" });
        return;
      }
      const data = response.data as PayrollPreviewResponse;
      setPreview(data);
      setFormValues(values);
      setOverrides(createInitialOverrides());
      setStep("vacations");
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const toggleVacation = (id: string, include: boolean) => {
    setOverrides(prev => {
      const next = new Set(prev.skippedVacations);
      if (include) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return { ...prev, skippedVacations: next };
    });
  };

  const toggleLoan = (id: string, include: boolean) => {
    setOverrides(prev => {
      const next = new Set(prev.skippedLoans);
      if (include) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return { ...prev, skippedLoans: next };
    });
  };

  const toggleEvent = (id: string, include: boolean) => {
    setOverrides(prev => {
      const next = new Set(prev.skippedEvents);
      if (include) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return { ...prev, skippedEvents: next };
    });
  };

  const goToNext = () => {
    const index = dataSteps.indexOf(step as Exclude<WizardStep, "form">);
    if (index >= 0 && index < dataSteps.length - 1) {
      setStep(dataSteps[index + 1]);
    }
  };

  const goToPrevious = () => {
    if (step === "vacations") {
      setStep("form");
      return;
    }
    const index = dataSteps.indexOf(step as Exclude<WizardStep, "form">);
    if (index > 0) {
      setStep(dataSteps[index - 1]);
    }
  };

  const handleFinish = () => {
    if (!formValues) {
      return;
    }
    const payload: PayrollGenerationPayload = { ...formValues };
    const overridesPayload: PayrollGenerationPayload["overrides"] = {};
    const vacationIds = Array.from(overrides.skippedVacations);
    const loanIds = Array.from(overrides.skippedLoans);
    const eventIds = Array.from(overrides.skippedEvents);
    if (vacationIds.length > 0) {
      overridesPayload.skippedVacationIds = vacationIds;
    }
    if (loanIds.length > 0) {
      overridesPayload.skippedLoanIds = loanIds;
    }
    if (eventIds.length > 0) {
      overridesPayload.skippedEventIds = eventIds;
    }
    if (Object.keys(overridesPayload).length > 0) {
      payload.overrides = overridesPayload;
    }
    onSubmit(payload);
  };

  const stepIndex = step === "form" ? 0 : dataSteps.indexOf(step as Exclude<WizardStep, "form">) + 1;
  const totalSteps = dataSteps.length;

  return (
    <div className="space-y-6">
      {step === "form" ? (
        <PayrollForm
          onSubmit={handleFormSubmit}
          isSubmitting={isLoadingPreview}
          canGenerate={canGenerate}
          submitLabel="Review payroll impacts"
        />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Step {stepIndex} of {totalSteps}</p>
              <h2 className="text-lg font-semibold capitalize">{step.replace(/^[a-z]/, letter => letter.toUpperCase())}</h2>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={goToPrevious} disabled={isSubmitting}>
                Back
              </Button>
              {step !== "review" ? (
                <Button onClick={goToNext} disabled={isSubmitting}>
                  Next
                </Button>
              ) : (
                <Button onClick={handleFinish} disabled={isSubmitting} className="bg-success text-white hover:bg-green-700">
                  {isSubmitting ? "Generating..." : "Generate Payroll"}
                </Button>
              )}
            </div>
          </div>
          <Separator />
          {step === "vacations" && (
            <div className="space-y-4">
              {vacationEmployees.length === 0 ? (
                <p className="text-sm text-muted-foreground">No approved vacations impact this period.</p>
              ) : (
                vacationEmployees.map(employee => (
                  <div key={employee.employeeId} className="rounded-md border p-4 space-y-3">
                    <div>
                      <p className="font-medium">{employee.employeeName}</p>
                      {employee.position && (
                        <p className="text-sm text-muted-foreground">{employee.position}</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      {employee.vacations.map(vacation => {
                        const vacationId = vacation.id;
                        const include = !overrides.skippedVacations.has(vacationId);
                        const labelId = `${employee.employeeId}-vacation-${vacationId}`;
                        return (
                          <div key={vacationId} className="flex items-center justify-between rounded bg-muted/40 px-3 py-2">
                            <div className="space-y-1">
                              <Label htmlFor={labelId} className="font-medium">
                                Apply vacation from {vacation.startDate} to {vacation.endDate}
                              </Label>
                              <p className="text-sm text-muted-foreground">
                                Deduct {vacation.daysInPeriod} day{vacation.daysInPeriod === 1 ? "" : "s"}
                              </p>
                            </div>
                            <Switch
                              id={labelId}
                              checked={include}
                              onCheckedChange={value => toggleVacation(vacationId, value)}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
          {step === "loans" && (
            <div className="space-y-4">
              {loanEmployees.length === 0 ? (
                <p className="text-sm text-muted-foreground">No loan deductions are scheduled for this period.</p>
              ) : (
                loanEmployees.map(employee => (
                  <div key={employee.employeeId} className="rounded-md border p-4 space-y-3">
                    <div>
                      <p className="font-medium">{employee.employeeName}</p>
                      {employee.position && (
                        <p className="text-sm text-muted-foreground">{employee.position}</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      {employee.loans.map(loan => {
                        const loanId = loan.id;
                        const include = !overrides.skippedLoans.has(loanId);
                        const labelId = `${employee.employeeId}-loan-${loanId}`;
                        return (
                          <div key={loanId} className="flex items-center justify-between rounded bg-muted/40 px-3 py-2">
                            <div className="space-y-1">
                              <Label htmlFor={labelId} className="font-medium">
                                Deduct {formatCurrency(loan.monthlyDeduction)} for loan repayment
                              </Label>
                              <p className="text-sm text-muted-foreground">
                                Remaining balance {formatCurrency(loan.remainingAmount)}
                              </p>
                            </div>
                            <Switch
                              id={labelId}
                              checked={include}
                              onCheckedChange={value => toggleLoan(loanId, value)}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
          {step === "events" && (
            <div className="space-y-4">
              {eventEmployees.length === 0 ? (
                <p className="text-sm text-muted-foreground">No bonuses or deductions need confirmation.</p>
              ) : (
                eventEmployees.map(employee => (
                  <div key={employee.employeeId} className="rounded-md border p-4 space-y-3">
                    <div>
                      <p className="font-medium">{employee.employeeName}</p>
                      {employee.position && (
                        <p className="text-sm text-muted-foreground">{employee.position}</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      {employee.events.map(event => {
                        const eventId = event.id;
                        const include = !overrides.skippedEvents.has(eventId);
                        const labelId = `${employee.employeeId}-event-${eventId}`;
                        const title = `${normalizeTitle(event.title, event.eventType)} (${event.effect === "bonus" ? "+" : "-"}${formatCurrency(event.amount)})`;
                        return (
                          <div key={eventId} className="flex items-center justify-between rounded bg-muted/40 px-3 py-2">
                            <div className="space-y-1">
                              <Label htmlFor={labelId} className="font-medium">
                                {title}
                              </Label>
                              {event.eventDate && (
                                <p className="text-sm text-muted-foreground">Scheduled for {event.eventDate}</p>
                              )}
                            </div>
                            <Switch
                              id={labelId}
                              checked={include}
                              onCheckedChange={value => toggleEvent(eventId, value)}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
          {step === "allowances" && (
            <div className="space-y-4">
              {allowanceEmployees.length === 0 ? (
                <p className="text-sm text-muted-foreground">No allowances are scheduled for this payroll run.</p>
              ) : (
                allowanceEmployees.map(employee => (
                  <div key={employee.employeeId} className="rounded-md border p-4 space-y-3">
                    <div>
                      <p className="font-medium">{employee.employeeName}</p>
                      {employee.position && (
                        <p className="text-sm text-muted-foreground">{employee.position}</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      {employee.allowances.map(allowance => {
                        const allowanceId = allowance.id;
                        const include = !overrides.skippedEvents.has(allowanceId);
                        const labelId = `${employee.employeeId}-allowance-${allowanceId}`;
                        return (
                          <div key={allowanceId} className="flex items-center justify-between rounded bg-muted/40 px-3 py-2">
                            <div className="space-y-1">
                              <Label htmlFor={labelId} className="font-medium">
                                {normalizeTitle(allowance.title, "Allowance")} ({allowance.source})
                              </Label>
                              <p className="text-sm text-muted-foreground">{formatCurrency(allowance.amount)}</p>
                            </div>
                            <Switch
                              id={labelId}
                              checked={include}
                              onCheckedChange={value => toggleEvent(allowanceId, value)}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
          {step === "review" && (
            <div className="space-y-4">
              <div className="rounded-md border p-4 space-y-3">
                <p className="font-medium">Review summary</p>
                <ul className="space-y-2 text-sm">
                  <li>
                    Vacations applied: {totalVacationCount - overrides.skippedVacations.size} of {totalVacationCount}
                  </li>
                  <li>
                    Loans deducted: {totalLoanCount - overrides.skippedLoans.size} of {totalLoanCount}
                  </li>
                  <li>
                    Bonuses and deductions applied: {totalEventCount - skippedEventCount} of {totalEventCount}
                  </li>
                  <li>
                    Allowances confirmed: {totalAllowanceCount - skippedAllowanceCount} of {totalAllowanceCount}
                  </li>
                </ul>
              </div>
              <p className="text-sm text-muted-foreground">
                Click "Generate Payroll" to apply these selections. Skipped items will be excluded from this payroll run.
              </p>
            </div>
          )}
        </div>
      )}
      {loadError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {loadError}
        </div>
      )}
    </div>
  );
}
