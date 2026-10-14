"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Alert, Button, Field } from "@/components/ui";

type Mode = "login" | "signup" | "forgot" | "reset";

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(params.get("error") === "link" ? "The link is invalid or has expired." : null);
  const [info, setInfo] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    const sb = createSupabaseBrowserClient();
    const site = window.location.origin;
    try {
      if (mode === "login") {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        const next = params.get("next");
        router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
        router.refresh();
      } else if (mode === "signup") {
        if (password.length < 10) throw new Error("Use a password of at least 10 characters.");
        const { data, error } = await sb.auth.signUp({ email, password, options: { data: { full_name: name }, emailRedirectTo: `${site}/auth/callback?next=/onboarding` } });
        if (error) throw error;
        if (data.session) router.replace("/onboarding");
        else setInfo("Check your email to confirm your account, then sign in.");
      } else if (mode === "forgot") {
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: `${site}/auth/callback?next=/reset-password` });
        if (error) throw error;
        setInfo("If an account exists for that email, a reset link has been sent.");
      } else {
        if (password.length < 10) throw new Error("Use a password of at least 10 characters.");
        const { error } = await sb.auth.updateUser({ password });
        if (error) throw error;
        setInfo("Password updated.");
        router.replace("/dashboard");
      }
    } catch (err) {
      setError((err as Error).message || "Authentication failed");
    } finally {
      setBusy(false);
    }
  }

  const titles = { login: "Sign in", signup: "Create an account", forgot: "Reset your password", reset: "Choose a new password" };
  return (
    <form onSubmit={submit} className="space-y-4">
      <h1 className="text-lg font-semibold">{titles[mode]}</h1>
      {error && <Alert kind="error">{error}</Alert>}
      {info && <Alert kind="success">{info}</Alert>}
      {mode === "signup" && (
        <Field label="Full name" htmlFor="name">
          <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
        </Field>
      )}
      {mode !== "reset" && (
        <Field label="Email" htmlFor="email">
          <input id="email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </Field>
      )}
      {mode !== "forgot" && (
        <Field label={mode === "reset" ? "New password" : "Password"} htmlFor="password" hint={mode !== "login" ? "At least 10 characters" : undefined}>
          <input id="password" type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete={mode === "login" ? "current-password" : "new-password"} />
        </Field>
      )}
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "Please wait…" : titles[mode]}
      </Button>
      <div className="flex justify-between text-sm text-brand-700">
        {mode !== "login" && <Link href="/login">Back to sign in</Link>}
        {mode === "login" && <Link href="/signup">Create account</Link>}
        {mode === "login" && <Link href="/forgot-password">Forgot password?</Link>}
      </div>
    </form>
  );
}
