"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Mail, ArrowLeft, CheckCircle2 } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes("@")) {
      toast.error("Please enter a valid email address");
      return;
    }
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setSubmitted(true);
      toast.success("Recovery link dispatched", {
        description: `Instructions sent to ${email}`,
      });
    }, 800);
  };

  return (
    <Card className="border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-zinc-900/90 shadow-2xl backdrop-blur-xl">
      <CardHeader className="space-y-1 p-6 pb-4">
        <CardTitle className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white font-mono">
          Reset Credentials
        </CardTitle>
        <CardDescription className="text-xs text-zinc-600 dark:text-zinc-400">
          Enter your registered work email to receive password reset authorization.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-6 pt-0 space-y-4">
        {submitted ? (
          <div className="py-6 flex flex-col items-center text-center space-y-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500 dark:text-emerald-400">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">Instructions Dispatched</h3>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 max-w-xs">
              Check your inbox for a password reset security token. Follow the link to establish a new password.
            </p>
            <Link href="/login" className="pt-2">
              <Button variant="outline" size="sm" className="gap-1.5 border-zinc-300 dark:border-zinc-700">
                <ArrowLeft className="h-3.5 w-3.5" />
                Return to Sign In
              </Button>
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Work Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@buildtrack.com"
                  className="pl-9 bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
                  required
                />
              </div>
            </div>

            <Button
              type="submit"
              variant="amber"
              className="w-full h-10 gap-2 text-sm font-bold"
              disabled={loading}
            >
              {loading ? "Sending link..." : "Send Reset Link"}
            </Button>

            <div className="text-center pt-2">
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to Sign In
              </Link>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
