"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Users,
  ShieldCheck,
  Activity,
  FileText,
  Plus,
  Search,
  CheckCircle2,
  Server,
  Database,
  Cpu,
  Radio,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Can } from "@/components/common/Can";
import { apiClient } from "@/lib/api/client";
import { toast } from "sonner";

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState("users");
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserName, setNewUserName] = useState("");
  const [newUserRole, setNewUserRole] = useState("safety_officer");

  // Users list
  const [users, setUsers] = useState([
    { id: "u-1", name: "Gaurav Sharma", email: "admin@buildtrack.com", role: "admin", status: "active" },
    { id: "u-2", name: "Priya Sharma", email: "safety@buildtrack.com", role: "safety_officer", status: "active" },
    { id: "u-3", name: "Amit Patel", email: "pm@buildtrack.com", role: "project_manager", status: "active" },
    { id: "u-4", name: "Vikram Mehta", email: "engineer@buildtrack.com", role: "engineer", status: "active" },
  ]);

  // Audit logs
  const auditLogs = [
    { id: "log-1", ts: new Date(Date.now() - 1000 * 60 * 12).toISOString(), user: "admin@buildtrack.com", action: "RULE_TOGGLE", resource: "rule-1 (PM2.5 Hazard)", ip: "127.0.0.1", status: "SUCCESS" },
    { id: "log-2", ts: new Date(Date.now() - 1000 * 60 * 45).toISOString(), user: "safety@buildtrack.com", action: "ALERT_ACK", resource: "alt-002 (Noise Exceedance)", ip: "192.168.1.14", status: "SUCCESS" },
    { id: "log-3", ts: new Date(Date.now() - 1000 * 3600 * 2).toISOString(), user: "admin@buildtrack.com", action: "GEOFENCE_UPDATE", resource: "Zone Excavation", ip: "127.0.0.1", status: "SUCCESS" },
    { id: "log-4", ts: new Date(Date.now() - 1000 * 3600 * 5).toISOString(), user: "pm@buildtrack.com", action: "BOQ_EXPORT", resource: "TH-2026-A BOQ", ip: "192.168.1.28", status: "SUCCESS" },
  ];

  // Component statuses
  const subsystems = [
    { name: "PostgreSQL (TimescaleDB)", role: "Relational & Time-Series Engine", status: "healthy", latency: "1.8 ms", icon: Database },
    { name: "MongoDB", role: "Raw Sensor Logs & Unstructured Storage", status: "healthy", latency: "1.4 ms", icon: Server },
    { name: "Redis Broker", role: "Cache & Socket.IO Async Session State", status: "healthy", latency: "0.6 ms", icon: Cpu },
    { name: "Local / S3 Storage", role: "Media Snapshots & Blueprint Artifacts", status: "healthy", latency: "1.2 ms", icon: FileText },
    { name: "YOLOv8 CV Engine", role: "AI Edge PPE & Perimeter Inference", status: "healthy", latency: "4.5 ms", icon: Activity },
    { name: "EMQX / Mosquitto MQTT", role: "IoT Sensor Telemetry Ingestion Gateway", status: "healthy", latency: "0.9 ms", icon: Radio },
  ];

  const handleAddUser = () => {
    if (!newUserEmail || !newUserName) {
      toast.error("Please provide email and name");
      return;
    }
    const newUser = {
      id: `u-${Date.now()}`,
      name: newUserName,
      email: newUserEmail,
      role: newUserRole,
      status: "active",
    };
    setUsers([...users, newUser]);
    setIsAddUserOpen(false);
    toast.success(`User ${newUserName} invited as ${newUserRole}`);
  };

  return (
    <Can
      roles={["admin"]}
      fallback={
        <div className="py-20 text-center space-y-3">
          <ShieldCheck className="h-12 w-12 text-red-500 mx-auto" />
          <h2 className="text-lg font-bold text-white">403 — Unauthorized Access</h2>
          <p className="text-xs text-zinc-400">
            Administrative privileges required to access RBAC configuration and audit logs.
          </p>
        </div>
      }
    >
      <div className="space-y-6">
        <PageHeader
          title="System Administration & Security Audit"
          description="Role-based access control (RBAC), immutable system audit events, and backend microservice health."
        />

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="users" className="gap-1.5">
              <Users className="h-4 w-4" />
              <span>User Accounts & RBAC ({users.length})</span>
            </TabsTrigger>
            <TabsTrigger value="audit" className="gap-1.5">
              <FileText className="h-4 w-4" />
              <span>Security Audit Logs</span>
            </TabsTrigger>
            <TabsTrigger value="diagnostics" className="gap-1.5">
              <Activity className="h-4 w-4" />
              <span>Subsystem Diagnostics (6/6 Up)</span>
            </TabsTrigger>
          </TabsList>

          {/* Tab 1: Users */}
          <TabsContent value="users" className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-xs text-zinc-600 dark:text-zinc-400">
                Manage roles and permissions across control room operators.
              </span>
              <Button
                variant="amber"
                size="sm"
                onClick={() => setIsAddUserOpen(true)}
                className="gap-1.5 font-bold"
              >
                <Plus className="h-3.5 w-3.5" />
                Invite User
              </Button>
            </div>

            <Card className="border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-zinc-100 dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 font-mono text-[10px] uppercase">
                    <tr>
                      <th className="p-3">User</th>
                      <th className="p-3">Email</th>
                      <th className="p-3">Role Designation</th>
                      <th className="p-3">Status</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {users.map((u) => (
                      <tr key={u.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-850/50">
                        <td className="p-3 font-semibold text-zinc-900 dark:text-zinc-100">{u.name}</td>
                        <td className="p-3 font-mono text-zinc-600 dark:text-zinc-400">{u.email}</td>
                        <td className="p-3">
                          <Badge variant="outline" className="font-mono uppercase text-[10px] text-amber-600 dark:text-amber-400 border-amber-500/30">
                            {u.role.replace("_", " ")}
                          </Badge>
                        </td>
                        <td className="p-3 text-emerald-600 dark:text-emerald-400 font-mono font-semibold text-[11px]">
                          {u.status}
                        </td>
                        <td className="p-3 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toast.info(`Editing privileges for ${u.name}`)}
                            className="h-7 text-xs text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
                          >
                            Edit Privileges
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </TabsContent>

          {/* Tab 2: Audit Logs */}
          <TabsContent value="audit" className="space-y-4">
            <Card className="border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left font-mono">
                  <thead className="bg-zinc-100 dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 text-[10px] uppercase">
                    <tr>
                      <th className="p-3">Timestamp</th>
                      <th className="p-3">Initiating Operator</th>
                      <th className="p-3">Security Action</th>
                      <th className="p-3">Target Resource</th>
                      <th className="p-3">IP Address</th>
                      <th className="p-3 text-right">Outcome</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 text-[11px]">
                    {auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-850/50">
                        <td className="p-3 text-zinc-500 dark:text-zinc-400">
                          {new Date(log.ts).toLocaleTimeString()}
                        </td>
                        <td className="p-3 text-zinc-800 dark:text-zinc-200">{log.user}</td>
                        <td className="p-3 text-amber-600 dark:text-amber-400 font-bold">{log.action}</td>
                        <td className="p-3 text-zinc-700 dark:text-zinc-300">{log.resource}</td>
                        <td className="p-3 text-zinc-500">{log.ip}</td>
                        <td className="p-3 text-right text-emerald-600 dark:text-emerald-400 font-bold">{log.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </TabsContent>

          {/* Tab 3: Diagnostics */}
          <TabsContent value="diagnostics" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {subsystems.map((sub, idx) => {
                const Icon = sub.icon;
                return (
                  <Card key={idx} className="border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 dark:bg-zinc-800 text-amber-500">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div>
                          <h4 className="font-bold text-xs text-zinc-900 dark:text-zinc-100">{sub.name}</h4>
                          <span className="text-[10px] text-zinc-500 block">{sub.role}</span>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[9px] uppercase font-mono">
                        {sub.status}
                      </Badge>
                    </div>

                    <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800/80 flex items-center justify-between font-mono text-[11px] text-zinc-600 dark:text-zinc-400">
                      <span>Round-Trip Latency:</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">{sub.latency}</span>
                    </div>
                  </Card>
                );
              })}
            </div>
          </TabsContent>
        </Tabs>

        {/* Invite User Dialog */}
        <Dialog open={isAddUserOpen} onOpenChange={setIsAddUserOpen}>
          <DialogContent className="max-w-md bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100">
            <DialogHeader>
              <DialogTitle className="text-base font-bold font-mono text-zinc-900 dark:text-white">
                Authorize Operator Account
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 pt-2 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-zinc-700 dark:text-zinc-300">Operator Full Name</label>
                <Input
                  placeholder="e.g. Ramesh Patel"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-zinc-700 dark:text-zinc-300">Work Email</label>
                <Input
                  type="email"
                  placeholder="e.g. ramesh@buildtrack.com"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-zinc-700 dark:text-zinc-300">RBAC Role Privilege</label>
                <select
                  value={newUserRole}
                  onChange={(e) => setNewUserRole(e.target.value)}
                  className="w-full h-9 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-3 text-xs text-zinc-900 dark:text-zinc-100"
                >
                  <option value="admin">Admin (Full Control Room Access)</option>
                  <option value="safety_officer">Safety Officer (PPE & Alerts)</option>
                  <option value="project_manager">Project Manager (Schedules & BOQ)</option>
                  <option value="engineer">Field Engineer (Incident Remediation)</option>
                  <option value="viewer">Viewer (Read-Only Wall)</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-zinc-200 dark:border-zinc-800">
                <Button variant="outline" size="sm" onClick={() => setIsAddUserOpen(false)} className="border-zinc-300 dark:border-zinc-700">
                  Cancel
                </Button>
                <Button variant="amber" size="sm" onClick={handleAddUser} className="font-bold">
                  Grant Access
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Can>
  );
}
