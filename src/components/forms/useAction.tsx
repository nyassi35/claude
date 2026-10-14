"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui";
import type { ActionResult } from "@/app/actions";

/** Runs a server action, tracks pending state, surfaces validation issues and refreshes the page. */
export function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<{ message: string; issues?: string[] } | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function exec<T>(fn: () => Promise<ActionResult<T> | undefined | void>, opts: { success?: string; onOk?: (data: T | undefined) => void; refresh?: boolean } = {}) {
    setError(null);
    setSuccess(null);
    start(async () => {
      try {
        const r = await fn();
        if (r && !r.ok) {
          setError({ message: r.error, issues: r.issues });
          return;
        }
        if (opts.success) setSuccess(opts.success);
        opts.onOk?.(r && r.ok ? (r.data as T) : undefined);
        if (opts.refresh !== false) router.refresh();
      } catch (e) {
        if ((e as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw e;
        setError({ message: "Network or server error. Your changes may not have been saved." });
      }
    });
  }

  const feedback = (
    <>
      {error && (
        <Alert kind="error" title={error.message} className="my-2">
          {error.issues?.length ? <ul>{error.issues.map((i) => <li key={i}>{i}</li>)}</ul> : null}
        </Alert>
      )}
      {success && <Alert kind="success" className="my-2">{success}</Alert>}
    </>
  );
  return { exec, pending, error, setError, feedback };
}
