"use client";

import React, { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  AlertTriangle,
  User,
  MapPin,
  Calendar,
  Clock,
  Send,
  Paperclip,
  CheckCircle2,
  FileText,
  Download,
  ShieldCheck,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { SeverityBadge } from "@/components/common/SeverityBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiClient } from "@/lib/api/client";
import { toast } from "sonner";

export default function IncidentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const incidentId = params.id as string;

  const [commentText, setCommentText] = useState("");
  const [comments, setComments] = useState<any[]>([
    {
      id: "c1",
      author: "Vikram Mehta",
      role: "Field Engineer",
      text: "Containment boom deployed around hydraulic pump. Soil contamination was prevented; absorbent pads placed.",
      created_at: new Date(Date.now() - 1000 * 3600 * 3).toISOString(),
    },
    {
      id: "c2",
      author: "Priya Sharma",
      role: "Safety Officer",
      text: "Inspected containment on site. Maintenance subcontractor scheduled to replace ruptured hose assembly by 16:00.",
      created_at: new Date(Date.now() - 1000 * 3600 * 1).toISOString(),
    },
  ]);

  // Fetch incident info
  const { data: incident, refetch } = useQuery({
    queryKey: ["incident-detail", incidentId],
    queryFn: async () => {
      try {
        return await apiClient.get<any>(`/api/v1/incidents/${incidentId}`);
      } catch {
        // Fallback demo mock
        return {
          id: incidentId,
          title: "Hydraulic Fluid Spill near Crane 01 Staging Bay",
          description: "Approximately 15 liters of high-pressure hydraulic fluid leaked from boom cylinder during crane routine maintenance. Immediate containment deployed; hazard isolated.",
          status: "under_investigation",
          severity: "medium",
          assigned_to: "Vikram Mehta (Field Engineer)",
          reported_by: "safety@buildtrack.com",
          location: "Crane Staging Bay 3 (Zone B)",
          created_at: new Date(Date.now() - 1000 * 3600 * 6).toISOString(),
          updated_at: new Date(Date.now() - 1000 * 3600 * 1).toISOString(),
          attachments: [
            { id: "att-1", name: "spill_containment_site_photo.jpg", size: "2.4 MB" },
            { id: "att-2", name: "crane_hydraulic_incident_log.pdf", size: "480 KB" },
          ],
        };
      }
    },
  });

  const handlePostComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;

    const newComment = {
      id: `c-${Date.now()}`,
      author: "Gaurav Sharma",
      role: "Admin / Safety Supervisor",
      text: commentText,
      created_at: new Date().toISOString(),
    };
    setComments([...comments, newComment]);
    setCommentText("");
    toast.success("Corrective action note posted to timeline");
  };

  const handleStatusChange = async (newStatus: string) => {
    try {
      await apiClient.post(`/api/v1/incidents/${incidentId}/status`, {
        status: newStatus,
        comment: `Lifecycle transitioned to ${newStatus}`,
      });
      refetch();
      toast.success(`Status updated to ${newStatus.replace("_", " ").toUpperCase()}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to update status");
    }
  };

  if (!incident) {
    return (
      <div className="py-20 text-center font-mono text-xs text-zinc-500">
        Loading incident dossier...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back button */}
      <div>
        <Link
          href="/incidents"
          className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Incidents Kanban
        </Link>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-zinc-200 dark:border-zinc-800">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2.5">
            <span className="font-mono text-sm font-bold text-amber-500">
              {incident.incident_number || incident.id}
            </span>
            <SeverityBadge severity={incident.severity} />
            <span className="text-xs text-zinc-500 font-mono">
              Reported {new Date(incident.created_at).toLocaleDateString()}
            </span>
          </div>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-white font-sans">{incident.title}</h1>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">Lifecycle Status:</span>
          <select
            value={incident.status}
            onChange={(e) => handleStatusChange(e.target.value)}
            className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-xs font-mono font-bold text-zinc-900 dark:text-zinc-100"
          >
            <option value="open">Open / Reported</option>
            <option value="acknowledged">Acknowledged</option>
            <option value="investigating">Under Investigation</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Details & Timeline & Comments */}
        <div className="lg:col-span-2 space-y-6">
          {/* Summary */}
          <Card className="border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-5 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Hazard Observation & Description
            </h3>
            <p className="text-sm text-zinc-800 dark:text-zinc-200 leading-relaxed font-sans">
              {incident.description}
            </p>
          </Card>

          {/* Timeline & Remediations */}
          <Card className="border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-5 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Investigation & Remediation Log
            </h3>
            <div className="space-y-4">
              {comments.map((c) => (
                <div key={c.id} className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-zinc-800 dark:text-zinc-200">{c.author}</span>
                      <Badge variant="outline" className="text-[10px] text-amber-600 dark:text-amber-400 border-amber-500/30">
                        {c.role}
                      </Badge>
                    </div>
                    <span className="text-[10px] font-mono text-zinc-500">
                      {new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-700 dark:text-zinc-300">{c.text}</p>
                </div>
              ))}
            </div>

            {/* Comment Form */}
            <form onSubmit={handlePostComment} className="pt-2 space-y-2">
              <textarea
                placeholder="Add mitigation note, root-cause assessment, or status update..."
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                className="w-full h-20 rounded-lg bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-3 text-xs text-zinc-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-amber-500/50"
              />
              <div className="flex justify-end">
                <Button type="submit" variant="amber" size="sm" className="gap-1.5 font-bold">
                  <Send className="h-3.5 w-3.5" />
                  Post Log Update
                </Button>
              </div>
            </form>
          </Card>
        </div>

        {/* Right Column: Metadata & Attachments */}
        <div className="space-y-6">
          <Card className="border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-5 space-y-4 text-xs">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Ticket Attribution
            </h3>
            <div className="space-y-3 font-mono">
              <div className="flex items-center justify-between py-1 border-b border-zinc-200 dark:border-zinc-800">
                <span className="text-zinc-500 flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-zinc-400" />
                  Location:
                </span>
                <span className="text-zinc-800 dark:text-zinc-200">{incident.location}</span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-zinc-200 dark:border-zinc-800">
                <span className="text-zinc-500 flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-zinc-400" />
                  Assignee:
                </span>
                <span className="text-zinc-800 dark:text-zinc-200">{incident.assigned_to}</span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-zinc-200 dark:border-zinc-800">
                <span className="text-zinc-500 flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-zinc-400" />
                  Reported By:
                </span>
                <span className="text-zinc-800 dark:text-zinc-200">{incident.reported_by}</span>
              </div>
            </div>
          </Card>

          {/* Attachments Card */}
          <Card className="border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-5 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
              <Paperclip className="h-3.5 w-3.5" />
              Evidence Attachments ({incident.attachments?.length || 2})
            </h3>
            <div className="space-y-2">
              {(incident.attachments || []).map((file: any) => (
                <div
                  key={file.id}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="h-4 w-4 text-amber-500 shrink-0" />
                    <span className="text-zinc-800 dark:text-zinc-200 truncate">{file.name}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => toast.success(`Downloading ${file.name}`)}
                    className="h-7 w-7 text-zinc-400 hover:text-white"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
