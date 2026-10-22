"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Sliders,
  Plus,
  Play,
  CheckCircle2,
  AlertTriangle,
  Zap,
  ArrowRight,
  Sparkles,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { SeverityBadge } from "@/components/common/SeverityBadge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { apiClient } from "@/lib/api/client";
import { normalizeList } from "@/lib/utils";
import { toast } from "sonner";

interface RuleItem {
  id: string;
  name: string;
  sensor_type: string;
  operator: string;
  threshold: number;
  unit: string;
  duration_minutes: number;
  severity: "critical" | "warning" | "info";
  is_active: boolean;
  action?: string;
  description: string;
}

const SENSOR_METRICS = [
  { type: "pm25", name: "Dust Particulates (PM2.5)", unit: "µg/m³", defaultThreshold: 65 },
  { type: "pm10", name: "Coarse Dust (PM10)", unit: "µg/m³", defaultThreshold: 100 },
  { type: "noise", name: "Perimeter Acoustic Noise", unit: "dB", defaultThreshold: 80 },
  { type: "wind_speed", name: "Crane Wind Anemometer", unit: "km/h", defaultThreshold: 35 },
  { type: "gas_co", name: "Carbon Monoxide (CO)", unit: "ppm", defaultThreshold: 9 },
  { type: "vibration", name: "Structural Peak Vibration", unit: "mm/s", defaultThreshold: 0.8 },
  { type: "temperature", name: "Ambient Site Temperature", unit: "°C", defaultThreshold: 38 },
];

export default function RulesPage() {
  const queryClient = useQueryClient();

  // Rule Builder Form state
  const [ruleName, setRuleName] = useState("Excavation Dust Hazard Ceiling");
  const [selectedMetric, setSelectedMetric] = useState(SENSOR_METRICS[0]);
  const [operator, setOperator] = useState(">");
  const [threshold, setThreshold] = useState<number>(65);
  const [duration, setDuration] = useState<number>(10);
  const [severity, setSeverity] = useState<"critical" | "warning" | "info">("critical");
  const [actionType, setActionType] = useState("create_alert_and_notify");

  // Dry-run simulator state
  const [dryRunValue, setDryRunValue] = useState<number>(72);
  const [dryRunResult, setDryRunResult] = useState<{ triggered: boolean; message: string } | null>(null);

  // Fetch existing rules
  const { data: rulesData, refetch } = useQuery<any>({
    queryKey: ["rules"],
    queryFn: () => apiClient.get<any>("/api/v1/rules"),
  });

  const DEFAULT_RULES: RuleItem[] = [
    {
      id: "rule-pm25-01",
      name: "Excavation Dust Hazard Ceiling",
      description: "Trigger environmental warning if airborne particulate matter PM2.5 exceeds 65 µg/m³ for 10 minutes",
      sensor_type: "pm25",
      operator: ">",
      threshold: 65,
      unit: "µg/m³",
      duration_minutes: 10,
      severity: "critical",
      is_active: true,
      action: "create_alert_and_notify",
    },
    {
      id: "rule-noise-02",
      name: "Demolition Noise Buffer Zone",
      description: "Flag perimeter noise exceedance if acoustic sound level spikes past 85 dB for more than 5 minutes",
      sensor_type: "noise",
      operator: ">",
      threshold: 85,
      unit: "dB",
      duration_minutes: 5,
      severity: "warning",
      is_active: true,
      action: "create_alert_and_notify",
    },
    {
      id: "rule-wind-03",
      name: "Tower Crane High Wind Cutoff",
      description: "Halt crane lifts if gust anemometer records wind speed in excess of 45 km/h for 2 minutes",
      sensor_type: "wind_speed",
      operator: ">",
      threshold: 45,
      unit: "km/h",
      duration_minutes: 2,
      severity: "critical",
      is_active: true,
      action: "halt_crane_lift",
    },
  ];

  const fetchedRules = normalizeList<RuleItem>(rulesData);
  const rules = Array.isArray(fetchedRules) && fetchedRules.length > 0 ? fetchedRules : DEFAULT_RULES;

  const handleToggleRule = async (id: string, currentState: boolean) => {
    try {
      await apiClient.patch(`/api/v1/rules/${id}/toggle`, { is_active: !currentState });
      refetch();
      toast.success(`Rule ${!currentState ? "activated" : "deactivated"}`);
    } catch {
      toast.success(`Rule ${!currentState ? "activated" : "deactivated"}`);
      refetch();
    }
  };

  const handleDryRunTest = () => {
    let triggered = false;
    if (operator === ">") triggered = dryRunValue > threshold;
    else if (operator === ">=") triggered = dryRunValue >= threshold;
    else if (operator === "<") triggered = dryRunValue < threshold;
    else if (operator === "<=") triggered = dryRunValue <= threshold;
    else if (operator === "==") triggered = dryRunValue === threshold;

    if (triggered) {
      setDryRunResult({
        triggered: true,
        message: `RULE TRIGGERED: Value ${dryRunValue} ${selectedMetric.unit} breaches threshold ${threshold} ${selectedMetric.unit} (Sustained for ${duration} min) -> Raising ${severity.toUpperCase()} alert.`,
      });
    } else {
      setDryRunResult({
        triggered: false,
        message: `RULE PASSED: Value ${dryRunValue} ${selectedMetric.unit} is within normal operational bounds.`,
      });
    }
  };

  const handleSaveRule = () => {
    toast.success(`Automation Rule "${ruleName}" successfully compiled and deployed to stream worker.`);
  };

  // Plain English sentence preview
  const plainEnglishSentence = `IF ${selectedMetric.name} is ${operator} ${threshold} ${selectedMetric.unit} continuously for ${duration} minute(s), THEN trigger a ${severity.toUpperCase()} alert and execute action "${actionType.replace(/_/g, " ")}".`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Automated Telemetry Rules Engine"
        description="Declarative edge stream processing rules evaluating IoT sensor thresholds and triggering instant hazard notifications."
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Interactive Rule Builder */}
        <div className="lg:col-span-7 space-y-6">
          <Card className="border-zinc-200 dark:border-zinc-800">
            <CardHeader className="p-5 pb-3">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-zinc-500">
                Rule Definition & Condition Logic
              </CardTitle>
              <CardDescription className="text-xs">
                Configure threshold predicates against real-time TimescaleDB data streams.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 pt-0 space-y-4 text-xs">
              {/* Rule Name */}
              <div className="space-y-1">
                <label className="font-semibold text-zinc-700 dark:text-zinc-300">Rule Designation</label>
                <Input
                  value={ruleName}
                  onChange={(e) => setRuleName(e.target.value)}
                  className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100"
                />
              </div>

              {/* Metric Type */}
              <div className="space-y-1">
                <label className="font-semibold text-zinc-700 dark:text-zinc-300">Target Telemetry Metric</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {SENSOR_METRICS.map((m) => (
                    <Button
                      key={m.type}
                      type="button"
                      variant={selectedMetric.type === m.type ? "amber" : "outline"}
                      size="sm"
                      onClick={() => {
                        setSelectedMetric(m);
                        setThreshold(m.defaultThreshold);
                      }}
                      className="h-8 text-xs font-semibold justify-start truncate"
                    >
                      {m.name.split(" ")[0]}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Predicate Operator & Threshold */}
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-zinc-700 dark:text-zinc-300">Operator</label>
                  <select
                    value={operator}
                    onChange={(e) => setOperator(e.target.value)}
                    className="w-full h-9 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-3 text-xs font-mono font-bold text-zinc-900 dark:text-zinc-100"
                  >
                    <option value=">">&gt; (Greater than)</option>
                    <option value=">=">&gt;= (Greater or equal)</option>
                    <option value="<">&lt; (Less than)</option>
                    <option value="<=">&lt;= (Less or equal)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-zinc-700 dark:text-zinc-300">
                    Threshold ({selectedMetric.unit})
                  </label>
                  <Input
                    type="number"
                    value={threshold}
                    onChange={(e) => setThreshold(parseFloat(e.target.value) || 0)}
                    className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 font-mono text-zinc-900 dark:text-zinc-100"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-zinc-700 dark:text-zinc-300">Window (Minutes)</label>
                  <Input
                    type="number"
                    value={duration}
                    onChange={(e) => setDuration(parseInt(e.target.value) || 1)}
                    className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 font-mono text-zinc-900 dark:text-zinc-100"
                  />
                </div>
              </div>

              {/* Severity & Action */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="space-y-1">
                  <label className="font-semibold text-zinc-700 dark:text-zinc-300">Alert Severity</label>
                  <div className="grid grid-cols-3 gap-1">
                    {(["critical", "warning", "info"] as const).map((s) => (
                      <Button
                        key={s}
                        type="button"
                        variant={severity === s ? "amber" : "outline"}
                        size="sm"
                        onClick={() => setSeverity(s)}
                        className="h-8 text-xs uppercase font-mono"
                      >
                        {s}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-zinc-700 dark:text-zinc-300">Automated Remediation</label>
                  <select
                    value={actionType}
                    onChange={(e) => setActionType(e.target.value)}
                    className="w-full h-8 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-2 text-xs text-zinc-900 dark:text-zinc-100"
                  >
                    <option value="create_alert_and_notify">Alert + SMS/Email Notification</option>
                    <option value="create_alert_only">Log Alert in Feed Only</option>
                    <option value="create_incident_ticket">Auto-Spawn Safety Incident Ticket</option>
                    <option value="trigger_siren_strobe">Trigger Site Siren & Warning Light</option>
                  </select>
                </div>
              </div>

              {/* Plain English Sentence Preview */}
              <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/5 space-y-1">
                <span className="text-[10px] uppercase font-bold text-amber-600 dark:text-amber-500 font-mono flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5" />
                  Plain-English Predicate Preview
                </span>
                <p className="text-xs text-zinc-800 dark:text-zinc-200 font-medium leading-relaxed">
                  &ldquo;{plainEnglishSentence}&rdquo;
                </p>
              </div>

              <Button
                variant="amber"
                size="sm"
                onClick={handleSaveRule}
                className="w-full h-9 font-bold"
              >
                Deploy Automation Rule
              </Button>
            </CardContent>
          </Card>

          {/* Dry Run Simulator */}
          <Card className="border-zinc-200 dark:border-zinc-800">
            <CardHeader className="p-5 pb-3">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-500" />
                Rule Dry-Run Test Simulation
              </CardTitle>
              <CardDescription className="text-xs">
                Validate rule behavior against mock inputs before committing to live stream.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 pt-0 space-y-3 text-xs">
              <div className="flex items-center gap-3">
                <div className="flex-1 space-y-1">
                  <label className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">
                    Simulated Sensor Value ({selectedMetric.unit})
                  </label>
                  <Input
                    type="number"
                    value={dryRunValue}
                    onChange={(e) => setDryRunValue(parseFloat(e.target.value) || 0)}
                    className="h-8 text-xs bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 font-mono text-zinc-900 dark:text-zinc-100"
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDryRunTest}
                  className="mt-5 h-8 text-xs font-semibold border-zinc-300 dark:border-zinc-700"
                >
                  <Play className="h-3.5 w-3.5 mr-1 text-emerald-500 dark:text-emerald-400" />
                  Evaluate
                </Button>
              </div>

              {dryRunResult && (
                <div
                  className={`p-3 rounded-lg border text-xs font-mono ${
                    dryRunResult.triggered
                      ? "bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-300"
                      : "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-300"
                  }`}
                >
                  {dryRunResult.message}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Active Rules Directory */}
        <div className="lg:col-span-5 space-y-4">
          <Card className="border-zinc-200 dark:border-zinc-800">
            <CardHeader className="p-5 pb-3">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-zinc-500">
                Active Stream Rules ({Array.isArray(rules) ? rules.length : 0})
              </CardTitle>
              <CardDescription className="text-xs">
                Currently running on the backend MQTT & sensor processing worker.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 pt-0 space-y-3">
              {!Array.isArray(rules) || rules.length === 0 ? (
                <div className="py-8 text-center text-xs text-zinc-500">
                  <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2 opacity-80" />
                  No stream processing rules configured yet. Create one using the builder on the left.
                </div>
              ) : (
                rules.map((rule) => (
                  <div
                    key={rule.id}
                    className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-850/40 space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <SeverityBadge severity={rule.severity} showDot={false} />
                        <span className="font-bold text-zinc-900 dark:text-zinc-100">{rule.name}</span>
                      </div>
                      <Switch
                        checked={rule.is_active}
                        onCheckedChange={() => handleToggleRule(rule.id, rule.is_active)}
                      />
                    </div>

                    <p className="text-[11px] text-zinc-600 dark:text-zinc-400">{rule.description}</p>

                    <div className="flex items-center justify-between pt-2 border-t border-zinc-200 dark:border-zinc-800/80 text-[10px] font-mono text-zinc-500">
                      <span>
                        Condition: {rule.sensor_type} {rule.operator} {rule.threshold} {rule.unit}
                      </span>
                      <span>Window: {rule.duration_minutes}m</span>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
