"use client";

import React, { useState } from "react";
import { PageHeader } from "@/components/common/PageHeader";
import { KpiCard } from "@/components/common/KpiCard";
import { RiskGauge } from "@/components/common/RiskGauge";
import { SeverityBadge } from "@/components/common/SeverityBadge";
import { StatusDot } from "@/components/common/StatusDot";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { ShieldAlert } from "lucide-react";

export default function DevComponentsCatalog() {
  const [sliderVal, setSliderVal] = useState(65);
  const [switchVal, setSwitchVal] = useState(true);

  return (
    <div className="space-y-8 pb-12">
      <PageHeader
        title="Design System & UI Components Catalog"
        description="Comprehensive reference for all industrial control-room tokens, typography, and interactive components."
      />

      {/* Buttons */}
      <Card className="border-zinc-800 bg-zinc-900/60 p-5 space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
          Buttons & Actions
        </h3>
        <div className="flex flex-wrap gap-3 items-center">
          <Button variant="amber">Amber Primary</Button>
          <Button variant="default">Default</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="amber" size="sm">Small</Button>
          <Button variant="amber" size="lg">Large</Button>
        </div>
      </Card>

      {/* Badges & Severity */}
      <Card className="border-zinc-800 bg-zinc-900/60 p-5 space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
          Severity & Status Badges
        </h3>
        <div className="flex flex-wrap gap-3 items-center">
          <SeverityBadge severity="critical" />
          <SeverityBadge severity="warning" />
          <SeverityBadge severity="info" />
          <SeverityBadge severity="ok" />
          <Badge variant="default">Default</Badge>
          <Badge variant="outline">Outline</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="destructive">Destructive</Badge>
          <Badge variant="success">Success</Badge>
          <Badge variant="warning">Warning</Badge>
        </div>
      </Card>

      {/* Status Dots */}
      <Card className="border-zinc-800 bg-zinc-900/60 p-5 space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
          Pulsing Status Indicators
        </h3>
        <div className="flex items-center gap-6 text-xs font-mono">
          <div className="flex items-center gap-2">
            <StatusDot status="healthy" pulse />
            <span>Healthy / Online</span>
          </div>
          <div className="flex items-center gap-2">
            <StatusDot status="warning" pulse />
            <span>Warning</span>
          </div>
          <div className="flex items-center gap-2">
            <StatusDot status="error" pulse />
            <span>Error / Offline</span>
          </div>
        </div>
      </Card>

      {/* KPI Cards & Gauges */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <KpiCard
          title="Safe Working Hours"
          value="148,250"
          unit="hrs"
          change="+12.4% vs L30D"
          trend="up"
          icon={<ShieldAlert className="h-4 w-4 text-emerald-500" />}
          sparklineData={[110, 115, 122, 130, 138, 142, 148]}
          status="success"
        />
        <Card className="border-zinc-800 bg-zinc-900/60 p-5 flex items-center justify-center">
          <RiskGauge score={28} />
        </Card>
      </div>

      {/* Form Controls */}
      <Card className="border-zinc-800 bg-zinc-900/60 p-5 space-y-4 max-w-lg">
        <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
          Form Elements
        </h3>
        <div className="space-y-3">
          <Input placeholder="Standard high-contrast input..." />
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-300">Toggle Switch</span>
            <Switch checked={switchVal} onCheckedChange={setSwitchVal} />
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-zinc-300">Threshold Slider</span>
              <span className="font-mono text-amber-500 font-bold">{sliderVal}%</span>
            </div>
            <Slider
              value={[sliderVal]}
              onValueChange={(v) => setSliderVal(v[0])}
              min={0}
              max={100}
            />
          </div>
        </div>
      </Card>
    </div>
  );
}
