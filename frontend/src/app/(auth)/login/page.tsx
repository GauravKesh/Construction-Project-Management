"use client";

import React, { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/stores/authStore";
import { toast } from "sonner";
import { Lock, Mail, ArrowRight, ShieldCheck, HardHat, Briefcase } from "lucide-react";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextUrl = searchParams.get("next") || "/dashboard";
  const setUser = useAuthStore((s) => s.setUser);
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "admin@buildtrack.com",
      password: "Admin@123456",
    },
  });

  const onSubmit = async (data: LoginFormValues) => {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const resData = await res.json();

      if (!res.ok) {
        throw new Error(resData.detail || "Invalid email or password");
      }

      setUser({
        id: resData.user?.id || "usr-01",
        email: resData.user?.email || data.email,
        full_name: resData.user?.full_name || "Authorized User",
        role: resData.user?.role || "admin",
        is_active: true,
      });

      toast.success("Welcome back!", {
        description: `Signed in as ${resData.user?.full_name || data.email}`,
      });

      router.push(nextUrl);
    } catch (err: any) {
      toast.error("Authentication Failed", {
        description: err.message || "Could not log in to control room",
      });
    } finally {
      setLoading(false);
    }
  };

  const setDemoCredentials = (email: string, pass: string) => {
    setValue("email", email);
    setValue("password", pass);
  };

  return (
    <Card className="border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-zinc-900/90 shadow-2xl backdrop-blur-xl">
      <CardHeader className="space-y-1 p-6 pb-4">
        <CardTitle className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white font-mono">
          Control Room Sign In
        </CardTitle>
        <CardDescription className="text-xs text-zinc-500 dark:text-zinc-400">
          Enter your authorized credentials to access site telemetry & safety feeds.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-6 pt-0 space-y-4">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
              <Input
                {...register("email")}
                placeholder="name@buildtrack.com"
                className="pl-9 bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
              />
            </div>
            {errors.email && (
              <p className="text-[11px] text-red-500 dark:text-red-400">{errors.email.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Password</label>
              <Link
                href="/forgot-password"
                className="text-[11px] text-amber-500 hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
              <Input
                type="password"
                {...register("password")}
                placeholder="••••••••••••"
                className="pl-9 bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
              />
            </div>
            {errors.password && (
              <p className="text-[11px] text-red-500 dark:text-red-400">{errors.password.message}</p>
            )}
          </div>

          <Button
            type="submit"
            variant="amber"
            className="w-full h-10 mt-2 gap-2 text-sm font-bold"
            disabled={loading}
          >
            {loading ? "Authenticating..." : "Access Control Room"}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </form>

        {/* Quick Fill Demo Credentials */}
        <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800/80 space-y-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
            Quick Fill Demo Accounts:
          </span>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setDemoCredentials("admin@buildtrack.com", "Admin@123456")}
              className="flex flex-col items-center justify-center p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/60 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 hover:border-amber-500/50 transition-all text-center cursor-pointer group"
            >
              <ShieldCheck className="h-4 w-4 text-amber-500 mb-1 group-hover:scale-110 transition-transform" />
              <span className="text-[11px] font-semibold text-zinc-800 dark:text-zinc-200">Admin</span>
              <span className="text-[9px] text-zinc-400 dark:text-zinc-500">Full Access</span>
            </button>

            <button
              type="button"
              onClick={() => setDemoCredentials("safety@buildtrack.com", "Safety@123456")}
              className="flex flex-col items-center justify-center p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/60 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 hover:border-amber-500/50 transition-all text-center cursor-pointer group"
            >
              <HardHat className="h-4 w-4 text-emerald-500 dark:text-emerald-400 mb-1 group-hover:scale-110 transition-transform" />
              <span className="text-[11px] font-semibold text-zinc-800 dark:text-zinc-200">Safety</span>
              <span className="text-[9px] text-zinc-400 dark:text-zinc-500">PPE & Alerts</span>
            </button>

            <button
              type="button"
              onClick={() => setDemoCredentials("pm@buildtrack.com", "Manager@123456")}
              className="flex flex-col items-center justify-center p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/60 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 hover:border-amber-500/50 transition-all text-center cursor-pointer group"
            >
              <Briefcase className="h-4 w-4 text-sky-500 dark:text-sky-400 mb-1 group-hover:scale-110 transition-transform" />
              <span className="text-[11px] font-semibold text-zinc-800 dark:text-zinc-200">Manager</span>
              <span className="text-[9px] text-zinc-400 dark:text-zinc-500">Plans & BOQ</span>
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="p-8 text-center text-xs font-mono text-zinc-400">
        Loading sign-in form...
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
