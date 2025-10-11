import { useEffect, useMemo, useState } from "react";
import PayrollForm from "./payroll-form";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { apiPost } from "@/lib/http";
import { formatCurrency } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import type {
  PayrollCalendarConfig,
  PayrollFrequencyConfig,
  PayrollExportFormatConfig,
  PayrollScenarioToggle,
} from "@shared/schema";
import { Trash2 } from "lucide-react";

export interface PayrollGenerationPayload {
  period: string;
  startDate: string;
  endDate: string;
  calendarId?: string;
  cycleLabel?: string;
  scenarioKey?: string;
  scenarioToggles?: Record<string, boolean>;
  status?: "draft" | "completed";
  useAttendance?: boolean;
  deductions?: {
    taxDeduction?: number;
    socialSecurityDeduction?: number;
    healthInsuranceDeduction?: number;
  };
  overrides?: {
    skippedVacationIds?: string[];
    skippedLoanIds?: string[];
    skippedEventIds?: string[];
  };
  comparisons?: Array<{
    scenarioKey: string;
    label?: string;
    scenarioToggles?: Record<string, boolean>;
  }>;
  exports?: Array<{
    formatId?: string;
    type?: "bank" | "gl" | "statutory";
    format?: "pdf" | "csv" | "xlsx";
    filename?: string;
  }>;
}

interface PayrollGenerationWizardProps {
  onSubmit: (payload: PayrollGenerationPayload) => void;
  isSubmitting: boolean;
  canGenerate: boolean;
  calendars?: PayrollCalendarConfig[];
  frequencies?: PayrollFrequencyConfig[];
  exportFormats?: PayrollExportFormatConfig[];
}

type PayrollPreviewVacation = {
  id: string;
  startDate: string;
  endDate: string;
  daysInPeriod: number;
};

type PayrollPreviewLoan = {
  id: string;
  reason: string | null;
  monthlyDeduction: number;
  remainingAmount: number;
};

type PayrollPreviewEvent = {
  id: string;
  title: string;
  amount: number;
  eventType: string;
  eventDate: string | null;
  effect: "bonus" | "deduction";
};

type PayrollPreviewAllowance = {
  id: string;
  title: string;
  amount: number;
  source: "period" | "recurring";
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
type PayrollPreviewScenarioResponse = {
  scenarioKey: string;
  scenarioLabel: string;
  toggles: Record<string, boolean>;
  totals: { gross: number; net: number; deductions: number };
  employees: PayrollPreviewEmployee[];
};

type PayrollPreviewResponse = {
  period: string;
  startDate: string;
  endDate: string;
  calendarId: string | null;
  cycleLabel: string | null;
  scenarios: PayrollPreviewScenarioResponse[];
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

const TOGGLE_KEYS = [
  "attendance",
  "loans",
  "bonuses",
  "allowances",
  "statutory",
  "overtime",
] as const;

type ToggleKey = typeof TOGGLE_KEYS[number];

const TOGGLE_METADATA: Record<ToggleKey, { label: string; description: string }> = {
  attendance: {
    label: "Attendance",
    description: "Apply attendance variances and generate schedule alerts.",
  },
  loans: {
    label: "Loans",
    description: "Deduct active loan installments and update schedules.",
  },
  bonuses: {
    label: "Bonuses",
    description: "Include bonus and commission events in this run.",
  },
  allowances: {
    label: "Allowances",
    description: "Apply allowances recorded for this period.",
  },
  statutory: {
    label: "Statutory",
    description: "Apply tax, social security, and health deductions.",
  },
  overtime: {
    label: "Overtime",
    description: "Include overtime events in calculations.",
  },
};

interface ScenarioState {
  key: string;
  label: string;
  toggles: Record<string, boolean>;
}

const DEFAULT_TOGGLE_VALUES: Record<ToggleKey, boolean> = {
  attendance: true,
  loans: true,
  bonuses: true,
  allowances: true,
  statutory: true,
  overtime: true,
};

const applyScenarioOverrides = (
  toggles: Record<string, boolean>,
  overrides?: PayrollScenarioToggle[] | null,
) => {
  if (!Array.isArray(overrides)) {
    return toggles;
  }
  for (const override of overrides) {
    if (!override || typeof override.key !== "string") {
      continue;
    }
    if (typeof override.enabled === "boolean") {
      toggles[override.key] = override.enabled;
    }
  }
  return toggles;
};

const deriveScenarioDefaults = (
  frequency?: PayrollFrequencyConfig,
  calendar?: PayrollCalendarConfig,
) => {
  const toggles: Record<string, boolean> = { ...DEFAULT_TOGGLE_VALUES };
  applyScenarioOverrides(toggles, frequency?.defaultScenarios ?? null);
  applyScenarioOverrides(toggles, calendar?.scenarioOverrides ?? null);
  return toggles;
};

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const uniqueKey = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

const buildBaseScenarioKey = (calendar?: PayrollCalendarConfig | null) => {
  if (calendar?.id) {
    return `${calendar.id}-baseline`;
  }
  return "baseline";
};

const resolveScenarioLabel = (
  calendar?: PayrollCalendarConfig | null,
  frequency?: PayrollFrequencyConfig | null,
) => calendar?.name ?? frequency?.name ?? "Baseline";

const MAX_COMPARISONS = 3;
export default function PayrollGenerationWizard({
  onSubmit,
  isSubmitting,
  canGenerate,
  calendars,
  frequencies,
  exportFormats,
}: PayrollGenerationWizardProps) {
  const calendarList = calendars ?? [];
  const frequencyList = frequencies ?? [];
  const exportList = exportFormats ?? [];
  const initialCalendar = calendarList[0];
  const initialFrequency = initialCalendar
    ? frequencyList.find(freq => freq.id === initialCalendar.frequencyId) ?? frequencyList[0]
    : frequencyList[0];
  const initialScenarioKey = buildBaseScenarioKey(initialCalendar);
  const initialScenarioLabel = resolveScenarioLabel(initialCalendar, initialFrequency ?? null);
  const initialScenarioToggles = deriveScenarioDefaults(initialFrequency ?? undefined, initialCalendar);

  const { toast } = useToast();

  const [selectedCalendarId, setSelectedCalendarId] = useState<string | undefined>(initialCalendar?.id);
  const [baseScenario, setBaseScenario] = useState<ScenarioState>({
    key: initialScenarioKey,
    label: initialScenarioLabel,
    toggles: initialScenarioToggles,
  });
  const [comparisonScenarios, setComparisonScenarios] = useState<ScenarioState[]>([]);
  const [selectedExportIds, setSelectedExportIds] = useState<Set<string>>(
    () =>
      exportList.length > 0
        ? new Set(exportList.filter(format => format.enabled !== false).map(format => format.id))
        : new Set(),
  );
  const [exportsInitialized, setExportsInitialized] = useState(exportList.length > 0);
  const [status, setStatus] = useState<"completed" | "draft">("completed");
  const [step, setStep] = useState<WizardStep>("form");
  const [formValues, setFormValues] = useState<PayrollGenerationPayload | null>(null);
  const [preview, setPreview] = useState<PayrollPreviewResponse | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<OverrideState>(createInitialOverrides);
  const [activeScenarioKey, setActiveScenarioKey] = useState<string | null>(null);

  useEffect(() => {
    if (!exportsInitialized && exportList.length > 0) {
      setSelectedExportIds(
        new Set(exportList.filter(format => format.enabled !== false).map(format => format.id)),
      );
      setExportsInitialized(true);
    }
  }, [exportList, exportsInitialized]);

  useEffect(() => {
    if (calendarList.length === 0) {
      setSelectedCalendarId(undefined);
      return;
    }
    if (selectedCalendarId && calendarList.some(calendar => calendar.id === selectedCalendarId)) {
      return;
    }
    setSelectedCalendarId(calendarList[0].id);
  }, [calendarList, selectedCalendarId]);

  const selectedCalendar = useMemo(
    () => calendarList.find(calendar => calendar.id === selectedCalendarId),
    [calendarList, selectedCalendarId],
  );

  const selectedFrequency = useMemo(() => {
    if (selectedCalendar) {
      return (
        frequencyList.find(freq => freq.id === selectedCalendar.frequencyId) ?? frequencyList[0] ?? null
      );
    }
    return frequencyList[0] ?? null;
  }, [selectedCalendar, frequencyList]);

  useEffect(() => {
    const key = buildBaseScenarioKey(selectedCalendar);
    const label = resolveScenarioLabel(selectedCalendar, selectedFrequency);
    setBaseScenario(prev => {
      if (!prev || prev.key !== key) {
        return {
          key,
          label,
          toggles: deriveScenarioDefaults(selectedFrequency ?? undefined, selectedCalendar ?? undefined),
        };
      }
      if (prev.label !== label) {
        return { ...prev, label };
      }
      return prev;
    });
  }, [selectedCalendar, selectedFrequency]);

  useEffect(() => {
    if (!preview) {
      return;
    }
    if (!preview.scenarios.some(scenario => scenario.scenarioKey === activeScenarioKey)) {
      setActiveScenarioKey(preview.scenarios[0]?.scenarioKey ?? null);
    }
  }, [preview, activeScenarioKey]);

  const activeScenario = useMemo(() => {
    if (!preview) {
      return null;
    }
    return (
      preview.scenarios.find(scenario => scenario.scenarioKey === activeScenarioKey) ??
      preview.scenarios[0] ??
      null
    );
  }, [preview, activeScenarioKey]);

  const scenarioEmployees = activeScenario?.employees ?? [];
  const vacationEmployees = useMemo(
    () => scenarioEmployees.filter(employee => employee.vacations.length > 0),
    [scenarioEmployees],
  );
  const loanEmployees = useMemo(
    () => scenarioEmployees.filter(employee => employee.loans.length > 0),
    [scenarioEmployees],
  );
  const eventEmployees = useMemo(
    () => scenarioEmployees.filter(employee => employee.events.length > 0),
    [scenarioEmployees],
  );
  const allowanceEmployees = useMemo(
    () => scenarioEmployees.filter(employee => employee.allowances.length > 0),
    [scenarioEmployees],
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

  const updateScenarioLabel = (scenarioKey: string, label: string) => {
    if (scenarioKey === baseScenario.key) {
      setBaseScenario(prev => ({ ...prev, label }));
      return;
    }
    setComparisonScenarios(prev =>
      prev.map(scenario => (scenario.key === scenarioKey ? { ...scenario, label } : scenario)),
    );
  };

  const updateScenarioToggle = (scenarioKey: string, toggleKey: ToggleKey, value: boolean) => {
    if (scenarioKey === baseScenario.key) {
      setBaseScenario(prev => ({
        ...prev,
        toggles: { ...prev.toggles, [toggleKey]: value },
      }));
      return;
    }
    setComparisonScenarios(prev =>
      prev.map(scenario =>
        scenario.key === scenarioKey
          ? { ...scenario, toggles: { ...scenario.toggles, [toggleKey]: value } }
          : scenario,
      ),
    );
  };

  const addComparisonScenario = () => {
    if (comparisonScenarios.length >= MAX_COMPARISONS) {
      return;
    }
    const label = `Scenario ${comparisonScenarios.length + 2}`;
    setComparisonScenarios(prev => [
      ...prev,
      {
        key: `${slugify(label) || "scenario"}-${uniqueKey().slice(0, 6)}`,
        label,
        toggles: { ...baseScenario.toggles },
      },
    ]);
  };

  const removeComparisonScenario = (scenarioKey: string) => {
    setComparisonScenarios(prev => prev.filter(scenario => scenario.key !== scenarioKey));
  };

  const toggleExportSelection = (formatId: string, checked: boolean) => {
    setSelectedExportIds(prev => {
      const next = new Set(prev);
      if (checked) {
        next.add(formatId);
      } else {
        next.delete(formatId);
      }
      return next;
    });
  };
  const handleFormSubmit = async (values: PayrollGenerationPayload) => {
    setIsLoadingPreview(true);
    setLoadError(null);
    try {
      const calendarId = selectedCalendar?.id ?? selectedCalendarId ?? undefined;
      const scenarioKey = baseScenario.key || buildBaseScenarioKey(selectedCalendar);

      const previewPayload: PayrollGenerationPayload = {
        period: values.period,
        startDate: values.startDate,
        endDate: values.endDate,
        calendarId,
        scenarioKey,
        scenarioToggles: { ...baseScenario.toggles },
        useAttendance: baseScenario.toggles.attendance,
      };

      if (values.deductions && Object.keys(values.deductions).length > 0) {
        previewPayload.deductions = values.deductions;
      }

      if (comparisonScenarios.length > 0) {
        previewPayload.comparisons = comparisonScenarios.map(scenario => ({
          scenarioKey: scenario.key,
          label: scenario.label,
          scenarioToggles: { ...scenario.toggles },
        }));
      }

      const response = await apiPost("/api/payroll/preview", previewPayload);
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
      setFormValues(previewPayload);
      setOverrides(createInitialOverrides());
      setStep("vacations");
      setActiveScenarioKey(previewPayload.scenarioKey ?? scenarioKey);
    } catch (error) {
      console.error("Failed to load payroll preview", error);
      const message =
        error instanceof Error ? error.message : "Failed to load payroll preview";
      setLoadError(message);
      toast({ title: "Error", description: message, variant: "destructive" });
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

    const { comparisons: _comparisons, ...rest } = formValues;
    const payload: PayrollGenerationPayload = {
      ...rest,
      status,
    };

    if (Object.keys(overridesPayload).length > 0) {
      payload.overrides = overridesPayload;
    }

    if (selectedExportIds.size > 0) {
      payload.exports = Array.from(selectedExportIds).map(id => ({ formatId: id }));
    }

    onSubmit(payload);
  };
  const canAddScenario = comparisonScenarios.length < MAX_COMPARISONS;
  const stepIndex = step === "form" ? 0 : dataSteps.indexOf(step as Exclude<WizardStep, "form">) + 1;
  const totalSteps = dataSteps.length;

  const renderScenarioCard = (scenario: ScenarioState, removable: boolean) => {
    return (
      <div key={scenario.key} className="space-y-4 rounded-md border border-muted bg-background p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex-1 space-y-2">
            <Label className="text-sm font-medium" htmlFor={`scenario-${scenario.key}`}>
              Scenario label
            </Label>
            <Input
              id={`scenario-${scenario.key}`}
              value={scenario.label}
              onChange={event => updateScenarioLabel(scenario.key, event.target.value)}
              placeholder="Scenario name"
            />
            <p className="text-xs text-muted-foreground">
              Configure how payroll should be calculated for this scenario.
            </p>
          </div>
          {removable && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => removeComparisonScenario(scenario.key)}
              aria-label="Remove scenario"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {TOGGLE_KEYS.map(toggleKey => {
            const meta = TOGGLE_METADATA[toggleKey];
            const checked = Boolean(scenario.toggles?.[toggleKey]);
            return (
              <div
                key={toggleKey}
                className="flex items-start justify-between gap-3 rounded-md border border-muted-foreground/10 bg-muted/30 p-3"
              >
                <div className="space-y-1">
                  <p className="text-sm font-medium">{meta.label}</p>
                  <p className="text-xs text-muted-foreground">{meta.description}</p>
                </div>
                <Switch
                  checked={checked}
                  onCheckedChange={value => updateScenarioToggle(scenario.key, toggleKey, Boolean(value))}
                  aria-label={meta.label}
                />
              </div>
            );
          })}
        </div>
      </div>
    );
  };
  return (
    <div className="space-y-6">
      {step === "form" ? (
        <PayrollForm
          onSubmit={handleFormSubmit}
          isSubmitting={isLoadingPreview}
          canGenerate={canGenerate}
          submitLabel="Review payroll impacts"
        >
          {calendarList.length > 0 && (
            <div className="space-y-2 border-t border-muted pt-4">
              <Label className="text-sm font-medium" htmlFor="payroll-calendar">
                Pay cycle
              </Label>
              <Select
                value={selectedCalendarId ?? ""}
                onValueChange={value => setSelectedCalendarId(value)}
              >
                <SelectTrigger id="payroll-calendar" className="w-full sm:w-[280px]">
                  <SelectValue placeholder="Select pay cycle" />
                </SelectTrigger>
                <SelectContent>
                  {calendarList.map(calendar => (
                    <SelectItem key={calendar.id} value={calendar.id}>
                      {calendar.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Choose which payroll calendar this run should follow.
              </p>
            </div>
          )}

          <div className="space-y-4 border-t border-muted pt-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-base font-semibold">Scenario configuration</h3>
                <p className="text-sm text-muted-foreground">
                  Define the base payroll scenario and optional comparisons.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!canAddScenario}
                onClick={addComparisonScenario}
              >
                Add comparison scenario
              </Button>
            </div>
            {renderScenarioCard(baseScenario, false)}
            {comparisonScenarios.map(scenario => renderScenarioCard(scenario, true))}
            {!canAddScenario && (
              <p className="text-xs text-muted-foreground">
                Maximum comparison scenarios added. Remove one to add a different setup.
              </p>
            )}
          </div>

          {exportList.length > 0 && (
            <div className="space-y-3 border-t border-muted pt-4">
              <div>
                <h3 className="text-base font-semibold">Export files</h3>
                <p className="text-sm text-muted-foreground">
                  Select which export files should be generated after payroll is created.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {exportList.map(format => {
                  const checked = selectedExportIds.has(format.id);
                  return (
                    <label
                      key={format.id}
                      className="flex cursor-pointer items-start gap-3 rounded-md border border-muted bg-muted/30 p-3"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={value => toggleExportSelection(format.id, Boolean(value))}
                      />
                      <div className="space-y-1">
                        <p className="text-sm font-medium">{format.name}</p>
                        <p className="text-xs text-muted-foreground capitalize">
                          {format.type} · {format.format}
                        </p>
                        {format.description && (
                          <p className="text-xs text-muted-foreground">{format.description}</p>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-2 border-t border-muted pt-4">
            <h3 className="text-base font-semibold">Run options</h3>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <Label htmlFor="payroll-status">Run status</Label>
                <p className="text-xs text-muted-foreground">
                  Draft runs keep loan deductions pending until finalized.
                </p>
              </div>
              <Select value={status} onValueChange={value => setStatus(value as "completed" | "draft")}>
                <SelectTrigger id="payroll-status" className="w-[200px]">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {loadError && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {loadError}
            </div>
          )}
        </PayrollForm>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Step {stepIndex} of {totalSteps}</p>
              <h2 className="text-lg font-semibold capitalize">
                {step.replace(/^[a-z]/, letter => letter.toUpperCase())}
              </h2>
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
                <Button
                  onClick={handleFinish}
                  disabled={isSubmitting}
                  className="bg-success text-white hover:bg-success/90"
                >
                  {isSubmitting ? "Generating..." : "Generate payroll"}
                </Button>
              )}
            </div>
          </div>
          <Separator />
          {preview && (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Viewing impacts for</p>
                <p className="font-medium">
                  {activeScenario?.scenarioLabel ?? baseScenario.label}
                </p>
              </div>
              {preview.scenarios.length > 1 && (
                <Select
                  value={activeScenario?.scenarioKey ?? ""}
                  onValueChange={value => setActiveScenarioKey(value)}
                >
                  <SelectTrigger className="w-full sm:w-[220px]">
                    <SelectValue placeholder="Select scenario" />
                  </SelectTrigger>
                  <SelectContent>
                    {preview.scenarios.map(scenario => (
                      <SelectItem key={scenario.scenarioKey} value={scenario.scenarioKey}>
                        {scenario.scenarioLabel}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {step === "vacations" && (
            <div className="space-y-4">
              {vacationEmployees.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No approved vacations impact the {activeScenario?.scenarioLabel ?? "selected"} scenario.
                </p>
              ) : (
                vacationEmployees.map(employee => (
                  <div key={employee.employeeId} className="space-y-3 rounded-md border border-muted bg-background p-4">
                    <div>
                      <p className="font-medium">{employee.employeeName}</p>
                      {employee.position && (
                        <p className="text-sm text-muted-foreground">{employee.position}</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      {employee.vacations.map(vacation => {
                        const include = !overrides.skippedVacations.has(vacation.id);
                        const labelId = `${employee.employeeId}-vacation-${vacation.id}`;
                        return (
                          <div
                            key={vacation.id}
                            className="flex items-center justify-between gap-3 rounded-md border border-muted-foreground/10 bg-muted/30 px-3 py-2"
                          >
                            <div className="space-y-1">
                              <Label htmlFor={labelId} className="font-medium">
                                Apply vacation from {vacation.startDate} to {vacation.endDate}
                              </Label>
                              <p className="text-xs text-muted-foreground">
                                Deduct {vacation.daysInPeriod} day{vacation.daysInPeriod === 1 ? "" : "s"}
                              </p>
                            </div>
                            <Switch
                              id={labelId}
                              checked={include}
                              onCheckedChange={value => toggleVacation(vacation.id, Boolean(value))}
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
                <p className="text-sm text-muted-foreground">
                  No loan deductions are scheduled for the {activeScenario?.scenarioLabel ?? "selected"} scenario.
                </p>
              ) : (
                loanEmployees.map(employee => (
                  <div key={employee.employeeId} className="space-y-3 rounded-md border border-muted bg-background p-4">
                    <div>
                      <p className="font-medium">{employee.employeeName}</p>
                      {employee.position && (
                        <p className="text-sm text-muted-foreground">{employee.position}</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      {employee.loans.map(loan => {
                        const include = !overrides.skippedLoans.has(loan.id);
                        const labelId = `${employee.employeeId}-loan-${loan.id}`;
                        return (
                          <div
                            key={loan.id}
                            className="flex items-center justify-between gap-3 rounded-md border border-muted-foreground/10 bg-muted/30 px-3 py-2"
                          >
                            <div className="space-y-1">
                              <Label htmlFor={labelId} className="font-medium">
                                Deduct {formatCurrency(loan.monthlyDeduction)} for loan repayment
                              </Label>
                              <p className="text-xs text-muted-foreground">
                                Remaining balance {formatCurrency(loan.remainingAmount)}
                              </p>
                            </div>
                            <Switch
                              id={labelId}
                              checked={include}
                              onCheckedChange={value => toggleLoan(loan.id, Boolean(value))}
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
                <p className="text-sm text-muted-foreground">
                  No bonuses or deductions impact the {activeScenario?.scenarioLabel ?? "selected"} scenario.
                </p>
              ) : (
                eventEmployees.map(employee => (
                  <div key={employee.employeeId} className="space-y-3 rounded-md border border-muted bg-background p-4">
                    <div>
                      <p className="font-medium">{employee.employeeName}</p>
                      {employee.position && (
                        <p className="text-sm text-muted-foreground">{employee.position}</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      {employee.events.map(event => {
                        const include = !overrides.skippedEvents.has(event.id);
                        const labelId = `${employee.employeeId}-event-${event.id}`;
                        return (
                          <div
                            key={event.id}
                            className="flex items-center justify-between gap-3 rounded-md border border-muted-foreground/10 bg-muted/30 px-3 py-2"
                          >
                            <div className="space-y-1">
                              <Label htmlFor={labelId} className="font-medium">
                                {event.title} ({event.effect === "bonus" ? "Bonus" : "Deduction"})
                              </Label>
                              <p className="text-xs text-muted-foreground">
                                {event.eventDate ? `Effective ${event.eventDate}` : "No date provided"}
                              </p>
                            </div>
                            <Switch
                              id={labelId}
                              checked={include}
                              onCheckedChange={value => toggleEvent(event.id, Boolean(value))}
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
                <p className="text-sm text-muted-foreground">
                  No allowances impact the {activeScenario?.scenarioLabel ?? "selected"} scenario.
                </p>
              ) : (
                allowanceEmployees.map(employee => (
                  <div key={employee.employeeId} className="space-y-3 rounded-md border border-muted bg-background p-4">
                    <div>
                      <p className="font-medium">{employee.employeeName}</p>
                      {employee.position && (
                        <p className="text-sm text-muted-foreground">{employee.position}</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      {employee.allowances.map(allowance => {
                        const include = !overrides.skippedEvents.has(allowance.id);
                        const labelId = `${employee.employeeId}-allowance-${allowance.id}`;
                        return (
                          <div
                            key={allowance.id}
                            className="flex items-center justify-between gap-3 rounded-md border border-muted-foreground/10 bg-muted/30 px-3 py-2"
                          >
                            <div className="space-y-1">
                              <Label htmlFor={labelId} className="font-medium">
                                {allowance.title}
                              </Label>
                              <p className="text-xs text-muted-foreground">
                                Source: {allowance.source === "recurring" ? "Recurring" : "Period"}
                              </p>
                            </div>
                            <Switch
                              id={labelId}
                              checked={include}
                              onCheckedChange={value => toggleEvent(allowance.id, Boolean(value))}
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
            <div className="space-y-6">
              {preview ? (
                <>
                  <div className="grid gap-4 md:grid-cols-3">
                    {preview.scenarios.map(scenario => (
                      <div
                        key={scenario.scenarioKey}
                        className="space-y-2 rounded-md border border-muted bg-background p-4"
                      >
                        <div className="flex items-center justify-between">
                          <p className="font-semibold">{scenario.scenarioLabel}</p>
                          <Badge variant="secondary" className="uppercase">
                            {scenario.scenarioKey}
                          </Badge>
                        </div>
                        <div className="space-y-1 text-sm">
                          <div className="flex items-center justify-between">
                            <span>Gross</span>
                            <span>{formatCurrency(scenario.totals.gross)}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>Deductions</span>
                            <span>{formatCurrency(scenario.totals.deductions)}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>Net</span>
                            <span>{formatCurrency(scenario.totals.net)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-3 rounded-md border border-muted bg-background p-4">
                    <h3 className="text-sm font-semibold">Scenario toggles</h3>
                    <div className="grid gap-3 md:grid-cols-2">
                      {preview.scenarios.map(scenario => (
                        <div key={scenario.scenarioKey} className="space-y-2">
                          <p className="text-sm font-medium">{scenario.scenarioLabel}</p>
                          <div className="flex flex-wrap gap-2">
                            {TOGGLE_KEYS.map(key => (
                              <Badge
                                key={key}
                                className={
                                  scenario.toggles[key]
                                    ? "bg-success text-white"
                                    : "bg-muted text-muted-foreground"
                                }
                              >
                                {TOGGLE_METADATA[key].label}: {scenario.toggles[key] ? "On" : "Off"}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1 text-sm text-muted-foreground">
                    <p>
                      Vacations applied: {totalVacationCount - overrides.skippedVacations.size} of {totalVacationCount}
                    </p>
                    <p>
                      Loans deducted: {totalLoanCount - overrides.skippedLoans.size} of {totalLoanCount}
                    </p>
                    <p>
                      Bonuses and deductions applied: {totalEventCount - skippedEventCount} of {totalEventCount}
                    </p>
                    <p>
                      Allowances confirmed: {totalAllowanceCount - skippedAllowanceCount} of {totalAllowanceCount}
                    </p>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Preview data is not available. Return to the form to generate a fresh preview.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
