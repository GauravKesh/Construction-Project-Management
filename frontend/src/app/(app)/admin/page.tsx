"use client";

import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { normalizeList } from "@/lib/utils";
import { toast } from "sonner";

const ROLE_OPTIONS = [
  { value: "admin", label: "Admin" },
  { value: "project_manager", label: "Project Manager" },
  { value: "safety_officer", label: "Safety Officer" },
  { value: "site_engineer", label: "Site Engineer" },
  { value: "viewer", label: "Viewer (read-only)" },
];

export default function AdminPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("users");
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserName, setNewUserName] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState("safety_officer");

  const { data: usersData } = useQuery<any>({
    queryKey: ["admin-users"],
    queryFn: () => apiClient.get<any>("/api/v1/users", { params: { page_size: 200 } }),
  });
  const users = normalizeList<any>(usersData);

  const { data: auditData } = useQuery<any>({
    queryKey: ["admin-audit-logs"],
    queryFn: () => apiClient.get<any>("/api/v1/audit-logs", { params: { limit: 100 } }),
    enabled: activeTab === "audit",
  });
  const auditLogs = normalizeList<any>(auditData);
  const emailById = new Map(users.map((u: any) => [u.id, u.email]));

  const { data: health, isError: healthError } = useQuery<any>({
    queryKey: ["health-ready"],
    queryFn: () => apiClient.get<any>("/api/v1/health/ready"),
    retry: false,
  });
  const subsystems = Object.entries<any>(health?.dependencies ?? {});
  const healthyCount = subsystems.filter(([, d]) => d?.status === "healthy").length;

  const createUser = useMutation({
    mutationFn: () =>
      apiClient.post<any>("/api/v1/users", {
        email: newUserEmail,
        full_name: newUserName,
        password: newUserPassword,
        role: newUserRole,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setIsAddUserOpen(false);
      setNewUserEmail("");
      setNewUserName("");
      setNewUserPassword("");
      toast.success(`User ${newUserName} created as ${newUserRole}`);
    },
    onError: (err: any) => toast.error(err.message || "Failed to create user"),
  });

  const handleAddUser = () => {
    if (!newUserEmail || !newUserName || newUserPassword.length < 8) {
      toast.error("Provide a name, an email and a password of at least 8 characters");
      return;
    }
    createUser.mutate();
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
          description="User accounts and roles, recorded audit events, and backend dependency health."
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
              <span>
                Backend Health ({healthError ? "unavailable" : `${healthyCount}/${subsystems.length} healthy`})
              </span>
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
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {users.map((u: any) => (
                      <tr key={u.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-850/50">
                        <td className="p-3 font-semibold text-zinc-900 dark:text-zinc-100">{u.full_name}</td>
                        <td className="p-3 font-mono text-zinc-600 dark:text-zinc-400">{u.email}</td>
                        <td className="p-3">
                          <Badge variant="outline" className="font-mono uppercase text-[10px] text-amber-600 dark:text-amber-400 border-amber-500/30">
                            {u.role.replace("_", " ")}
                          </Badge>
                        </td>
                        <td className="p-3 text-emerald-600 dark:text-emerald-400 font-mono font-semibold text-[11px]">
                          {u.is_active ? "active" : "inactive"}
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
                      <th className="p-3">User</th>
                      <th className="p-3">Action</th>
                      <th className="p-3">Entity</th>
                      <th className="p-3">IP Address</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 text-[11px]">
                    {auditLogs.length === 0 && (
                      <tr>
                        <td colSpan={5} className="p-4 text-center text-zinc-500">
                          No audit events recorded.
                        </td>
                      </tr>
                    )}
                    {auditLogs.map((log: any) => (
                      <tr key={log.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-850/50">
                        <td className="p-3 text-zinc-500 dark:text-zinc-400">
                          {new Date(log.created_at).toLocaleString()}
                        </td>
                        <td className="p-3 text-zinc-800 dark:text-zinc-200">
                          {(log.user_id && emailById.get(log.user_id)) || log.user_id || "system"}
                        </td>
                        <td className="p-3 text-amber-600 dark:text-amber-400 font-bold">{log.action}</td>
                        <td className="p-3 text-zinc-700 dark:text-zinc-300">
                          {log.entity_type}
                          {log.entity_id ? ` ${String(log.entity_id).slice(0, 8)}` : ""}
                        </td>
                        <td className="p-3 text-zinc-500">{log.ip_address ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </TabsContent>

          {/* Tab 3: Diagnostics */}
          <TabsContent value="diagnostics" className="space-y-4">
            {healthError || !health ? (
              <p className="text-xs text-zinc-500">Backend readiness check is unavailable.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {subsystems.map(([name, dep]) => (
                  <Card key={name} className="border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 dark:bg-zinc-800 text-amber-500">
                          <Database className="h-4 w-4" />
                        </div>
                        <div>
                          <h4 className="font-bold text-xs text-zinc-900 dark:text-zinc-100 capitalize">{name}</h4>
                          {dep?.details && <span className="text-[10px] text-zinc-500 block break-all">{dep.details}</span>}
                        </div>
                      </div>
                      <Badge
                        variant="outline"
                        className={`text-[9px] uppercase font-mono ${
                          dep?.status === "healthy"
                            ? "text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                            : "text-red-600 dark:text-red-400 border-red-500/30"
                        }`}
                      >
                        {dep?.status}
                      </Badge>
                    </div>
                    <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800/80 flex items-center justify-between font-mono text-[11px] text-zinc-600 dark:text-zinc-400">
                      <span>Check latency:</span>
                      <span className="font-bold">{dep?.latency_ms != null ? `${dep.latency_ms} ms` : "—"}</span>
                    </div>
                  </Card>
                ))}
              </div>
            )}
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
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-zinc-700 dark:text-zinc-300">Initial Password (min 8 chars)</label>
                <Input
                  type="password"
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-zinc-200 dark:border-zinc-800">
                <Button variant="outline" size="sm" onClick={() => setIsAddUserOpen(false)} className="border-zinc-300 dark:border-zinc-700">
                  Cancel
                </Button>
                <Button variant="amber" size="sm" onClick={handleAddUser} disabled={createUser.isPending} className="font-bold">
                  Create User
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Can>
  );
}
