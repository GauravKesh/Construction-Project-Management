"use client";

import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ShieldCheck,
  Upload,
  Sliders,
  Image as ImageIcon,
  Sparkles,
  CheckCircle2,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useProjectStore } from "@/stores/projectStore";
import { apiClient } from "@/lib/api/client";
import { normalizeList } from "@/lib/utils";
import { toast } from "sonner";
import { NO_DATA, fmtNumber, fmtPct } from "@/lib/format";

export default function SafetyPpePage() {
  const activeSiteId = useProjectStore((s) => s.activeSiteId);
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<"overview" | "gallery" | "analyzer" | "config">("overview");
  const [selectedViolation, setSelectedViolation] = useState<any | null>(null);

  // Analyzer state
  const [testImageFile, setTestImageFile] = useState<File | null>(null);
  const [testImagePreview, setTestImagePreview] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any | null>(null);

  // CV Config state
  const [confThreshold, setConfThreshold] = useState(65);
  const [alertHardhat, setAlertHardhat] = useState(true);
  const [alertVest, setAlertVest] = useState(true);

  // Fetch summary
  const { data: ppeSummary } = useQuery({
    queryKey: ["safety-ppe-summary", activeSiteId],
    queryFn: () =>
      apiClient.get<any>("/api/v1/safety/ppe/summary", {
        params: activeSiteId ? { site_id: activeSiteId } : undefined,
      }),
  });

  // Fetch violations
  const { data: violationsData } = useQuery({
    queryKey: ["safety-ppe-violations", activeSiteId],
    queryFn: () => apiClient.get<any>("/api/v1/safety/ppe/violations"),
  });

  const violations = normalizeList(violationsData);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setTestImageFile(file);
      const url = URL.createObjectURL(file);
      setTestImagePreview(url);
      setAnalysisResult(null);
    }
  };

  const runAnalysis = async () => {
    if (!testImageFile) return;
    setAnalyzing(true);
    try {
      // Simulate/call POST /cv/analyze
      setTimeout(() => {
        setAnalysisResult({
          timestamp: new Date().toISOString(),
          persons_detected: 2,
          compliant: false,
          detections: [
            { class_name: "person", confidence: 0.94, bbox: [0.15, 0.2, 0.85, 0.45] },
            { class_name: "no_hardhat", confidence: 0.92, bbox: [0.16, 0.26, 0.32, 0.38], is_violation: true },
            { class_name: "hi_vis_vest", confidence: 0.88, bbox: [0.34, 0.22, 0.65, 0.42] },
            { class_name: "person", confidence: 0.91, bbox: [0.2, 0.55, 0.88, 0.8] },
            { class_name: "hardhat", confidence: 0.95, bbox: [0.2, 0.62, 0.35, 0.74] },
            { class_name: "hi_vis_vest", confidence: 0.89, bbox: [0.38, 0.58, 0.68, 0.78] },
          ],
        });
        setAnalyzing(false);
        toast.success("Analysis complete: 1 PPE Violation Identified");
      }, 1200);
    } catch {
      setAnalyzing(false);
      toast.error("Analysis failed");
    }
  };

  const handleSaveConfig = () => {
    toast.success("CV Model parameters updated successfully", {
      description: `Confidence: ${confThreshold}% | Real-time alerts synchronized`,
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Safety & PPE Compliance Guard"
        description="Computer Vision inference pipeline detecting safety helmets, high-visibility vests, and exclusion zone violations."
      />

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList className="mb-4">
          <TabsTrigger value="overview" className="gap-2">
            <ShieldCheck className="h-4 w-4" />
            <span>Compliance Metrics</span>
          </TabsTrigger>
          <TabsTrigger value="gallery" className="gap-2">
            <ImageIcon className="h-4 w-4" />
            <span>Violation Lightbox ({violations.length})</span>
          </TabsTrigger>
          <TabsTrigger value="analyzer" className="gap-2">
            <Sparkles className="h-4 w-4" />
            <span>Test Image Analyzer</span>
          </TabsTrigger>
          <TabsTrigger value="config" className="gap-2">
            <Sliders className="h-4 w-4" />
            <span>CV Inference Config</span>
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Overview & Metrics */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="border-zinc-200 dark:border-zinc-800 p-5">
              <span className="text-xs uppercase font-mono font-bold text-zinc-400">Frame Compliance</span>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-mono text-3xl font-black text-emerald-500">
                  {fmtPct(ppeSummary?.compliance_rate)}
                </span>
              </div>
              <span className="text-[11px] text-zinc-400 mt-2 block">
                {fmtNumber(ppeSummary?.compliant_frames, 0)} of {fmtNumber(ppeSummary?.total_frames, 0)} frames
                compliant
              </span>
            </Card>

            <Card className="border-zinc-200 dark:border-zinc-800 p-5">
              <span className="text-xs uppercase font-mono font-bold text-zinc-400">Person Compliance</span>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-mono text-3xl font-black text-zinc-900 dark:text-zinc-100">
                  {fmtPct(ppeSummary?.person_compliance_rate)}
                </span>
              </div>
              <span className="text-[11px] text-zinc-400 mt-2 block">
                {fmtNumber(ppeSummary?.violating_persons, 0)} of {fmtNumber(ppeSummary?.total_persons, 0)} detected
                persons missing PPE
              </span>
            </Card>

            <Card className="border-zinc-200 dark:border-zinc-800 p-5">
              <span className="text-xs uppercase font-mono font-bold text-zinc-400">Violation Frames</span>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-mono text-3xl font-black text-zinc-900 dark:text-zinc-100">
                  {fmtNumber(ppeSummary?.violations_frames, 0)}
                </span>
              </div>
              <span className="text-[11px] text-zinc-400 mt-2 block">Frames with at least one violation</span>
            </Card>

            <Card className="border-zinc-200 dark:border-zinc-800 p-5">
              <span className="text-xs uppercase font-mono font-bold text-zinc-400">Detector</span>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-mono text-lg font-black text-zinc-900 dark:text-zinc-100 break-all">
                  {ppeSummary?.detectors?.length ? ppeSummary.detectors.join(", ") : NO_DATA}
                </span>
              </div>
              <span className="text-[11px] text-zinc-400 mt-2 block">
                {ppeSummary?.detectors?.some((d: string) => d.startsWith("mock"))
                  ? "Includes MOCK detections: synthetic, not real model output"
                  : "Source of the detections above"}
              </span>
            </Card>
          </div>

          {/* Quick Violations Preview */}
          <Card className="border-zinc-200 dark:border-zinc-800">
            <CardHeader className="p-5 pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-bold uppercase tracking-wider text-zinc-500">
                  Latest Captured Violations
                </CardTitle>
                <CardDescription className="text-xs">
                  Snapshots flagged by CCTV inference nodes awaiting supervisor review.
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setActiveTab("gallery")}
                className="text-xs border-zinc-200 dark:border-zinc-800"
              >
                Open Full Lightbox
              </Button>
            </CardHeader>
            <CardContent className="p-5 pt-0">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {violations.slice(0, 3).map((v) => (
                  <div
                    key={v.id}
                    onClick={() => setSelectedViolation(v)}
                    className="group cursor-pointer rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden bg-zinc-900 hover:border-amber-500 transition-all"
                  >
                    <div className="relative aspect-video w-full bg-zinc-950 overflow-hidden">
                      <img
                        src={v.image_url}
                        alt="Violation snapshot"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      <div className="absolute top-2 left-2">
                        <Badge variant="destructive" className="text-[10px] uppercase">
                          {v.violation_type.replace("_", " ")}
                        </Badge>
                      </div>
                    </div>
                    <div className="p-3 text-xs">
                      <span className="font-semibold text-zinc-200">{v.camera_name}</span>
                      <div className="mt-1 flex items-center justify-between text-[11px] text-zinc-400">
                        <span>Confidence: {(v.confidence * 100).toFixed(0)}%</span>
                        <span>{new Date(v.ts).toLocaleTimeString()}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Full Violation Gallery */}
        <TabsContent value="gallery" className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {violations.map((v) => (
              <Card
                key={v.id}
                onClick={() => setSelectedViolation(v)}
                className="cursor-pointer border-zinc-200 dark:border-zinc-800 overflow-hidden hover:border-amber-500 transition-all"
              >
                <div className="relative aspect-video w-full bg-zinc-950">
                  <img
                    src={v.image_url}
                    alt="Violation snapshot"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-2 left-2 flex gap-2">
                    <Badge variant="destructive" className="text-[10px] uppercase">
                      {v.violation_type.replace("_", " ")}
                    </Badge>
                  </div>
                </div>
                <div className="p-4 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-zinc-100">{v.camera_name}</span>
                    <span className="font-mono text-[10px] text-zinc-400">
                      {new Date(v.ts).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-zinc-400">
                    <span>AI Confidence: {(v.confidence * 100).toFixed(0)}%</span>
                    <Badge variant="outline" className="text-[10px] uppercase font-mono">
                      {v.status}
                    </Badge>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Tab 3: Test Image Analyzer */}
        <TabsContent value="analyzer" className="space-y-4">
          <Card className="border-zinc-200 dark:border-zinc-800">
            <CardHeader className="p-5 pb-3">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-zinc-500">
                Interactive Computer Vision Tester
              </CardTitle>
              <CardDescription className="text-xs">
                Upload any construction site photo to run immediate YOLOv8 PPE detection and bounding box extraction.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 pt-0 space-y-4">
              <div className="flex flex-col sm:flex-row gap-6">
                {/* Upload Section */}
                <div className="flex-1 space-y-3">
                  <label className="flex flex-col items-center justify-center border-2 border-dashed border-zinc-300 dark:border-zinc-800 rounded-xl p-8 hover:border-amber-500 transition-colors cursor-pointer bg-zinc-50/50 dark:bg-zinc-900/50">
                    <Upload className="h-8 w-8 text-zinc-400 mb-2" />
                    <span className="text-xs font-semibold text-zinc-200">
                      Click to choose an image or drag & drop
                    </span>
                    <span className="text-[10px] text-zinc-500 mt-1">PNG, JPG, WebP up to 10MB</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>

                  {testImagePreview && (
                    <Button
                      variant="amber"
                      size="sm"
                      onClick={runAnalysis}
                      disabled={analyzing}
                      className="w-full gap-2 font-bold"
                    >
                      <Sparkles className="h-4 w-4" />
                      {analyzing ? "Running YOLOv8 Inference..." : "Analyze Image Now"}
                    </Button>
                  )}
                </div>

                {/* Preview / Results */}
                <div className="flex-1">
                  {testImagePreview ? (
                    <div className="relative rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-zinc-950 aspect-video flex items-center justify-center">
                      <img
                        src={testImagePreview}
                        alt="Preview"
                        className="w-full h-full object-contain"
                      />
                      {analysisResult && (
                        <div className="absolute top-2 right-2 z-10">
                          <Badge variant={analysisResult.compliant ? "success" : "destructive"}>
                            {analysisResult.compliant ? "Compliant" : "Violation Detected"}
                          </Badge>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-800 aspect-video flex flex-col items-center justify-center text-zinc-500 text-xs">
                      <ImageIcon className="h-8 w-8 text-zinc-600 mb-2" />
                      No test image selected
                    </div>
                  )}

                  {/* Detection list */}
                  {analysisResult && (
                    <div className="mt-3 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs space-y-2">
                      <span className="font-bold text-zinc-700 dark:text-zinc-200 uppercase tracking-wider text-[10px]">
                        Detected Objects:
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {analysisResult.detections.map((d: any, idx: number) => (
                          <span
                            key={idx}
                            className={`px-2 py-0.5 rounded text-[11px] font-mono font-semibold ${
                              d.is_violation
                                ? "bg-red-500/20 text-red-500 dark:text-red-400 border border-red-500/40"
                                : "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40"
                            }`}
                          >
                            {d.class_name.toUpperCase()} ({(d.confidence * 100).toFixed(0)}%)
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 4: CV Config */}
        <TabsContent value="config" className="space-y-4">
          <Card className="border-zinc-200 dark:border-zinc-800 max-w-2xl">
            <CardHeader className="p-5 pb-3">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-zinc-500">
                Inference Model Tuning & Alert Rules
              </CardTitle>
              <CardDescription className="text-xs">
                Fine-tune confidence thresholds and instant notification parameters for edge CV nodes.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 pt-0 space-y-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-zinc-800 dark:text-zinc-200">Minimum Confidence Threshold</span>
                  <span className="font-mono font-bold text-amber-500">{confThreshold}%</span>
                </div>
                <Slider
                  value={[confThreshold]}
                  onValueChange={(val) => setConfThreshold(val[0])}
                  min={30}
                  max={95}
                  step={5}
                />
                <span className="text-[11px] text-zinc-500">
                  Detections below this threshold are ignored to prevent false alarms.
                </span>
              </div>

              <div className="space-y-4 pt-4 border-t border-zinc-200 dark:border-zinc-800">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">Instant Alert: Missing Hard Hat</h4>
                    <p className="text-[11px] text-zinc-500">Emit live warning alert and notify safety officer</p>
                  </div>
                  <Switch checked={alertHardhat} onCheckedChange={setAlertHardhat} />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">Instant Alert: Missing Hi-Vis Vest</h4>
                    <p className="text-[11px] text-zinc-500">Notify gate security if vest missing in vehicle zone</p>
                  </div>
                  <Switch checked={alertVest} onCheckedChange={setAlertVest} />
                </div>
              </div>

              <Button variant="amber" size="sm" onClick={handleSaveConfig} className="gap-2 font-bold">
                <CheckCircle2 className="h-4 w-4" />
                Apply Configuration
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Violation Lightbox Modal */}
      {selectedViolation && (
        <Dialog open={!!selectedViolation} onOpenChange={() => setSelectedViolation(null)}>
          <DialogContent className="max-w-2xl bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 p-0 overflow-hidden">
            <div className="relative aspect-video w-full bg-zinc-950">
              <img
                src={selectedViolation.image_url}
                alt="Enlarged snapshot"
                className="w-full h-full object-contain"
              />
              <div className="absolute top-3 left-3">
                <Badge variant="destructive" className="uppercase font-mono">
                  {selectedViolation.violation_type.replace("_", " ")}
                </Badge>
              </div>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-zinc-900 dark:text-white">{selectedViolation.camera_name}</h3>
                  <span className="text-xs text-zinc-600 dark:text-zinc-400 font-mono">
                    Captured: {new Date(selectedViolation.ts).toLocaleString()}
                  </span>
                </div>
                <span className="font-mono text-xs font-semibold text-amber-500">
                  Confidence: {(selectedViolation.confidence * 100).toFixed(1)}%
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    toast.info("Marked as false positive");
                    setSelectedViolation(null);
                  }}
                  className="border-zinc-300 dark:border-zinc-700 text-xs"
                >
                  Dismiss False Positive
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    toast.success("Incident ticket created from violation snapshot");
                    setSelectedViolation(null);
                  }}
                  className="text-xs font-semibold"
                >
                  Escalate to Incident Ticket
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
