"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Alert, Button, Field } from "@/components/ui";

export function OnboardingForm({ email }: { email: string }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await createSupabaseBrowserClient().rpc("create_organization", { p_name: name });
    setBusy(false);
    if (error) return setError(error.message);
    router.replace("/dashboard");
    router.refresh();
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <h1 className="text-lg font-semibold">Create your organization</h1>
      <p className="text-sm text-slate-600">
        Signed in as {email}. You will become the organization&apos;s administrator. If your company already uses RootCause AI, ask an administrator to add you instead.
      </p>
      {error && <Alert kind="error">{error}</Alert>}
      <Field label="Organization name" htmlFor="org">
        <input id="org" className="input" value={name} onChange={(e) => setName(e.target.value)} minLength={2} maxLength={120} required />
      </Field>
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? "Creating…" : "Create organization"}
      </Button>
    </form>
  );
}
