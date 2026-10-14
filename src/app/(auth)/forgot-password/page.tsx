import { Suspense } from "react";
import { AuthForm } from "@/components/auth/AuthForm";
import { Alert } from "@/components/ui";
import { isDemoMode } from "@/lib/supabase/config";

export default function Page() {
  if (isDemoMode()) return <Alert kind="info" title="Demo mode">Account management requires Supabase. Use the demo users on the sign-in page.</Alert>;
  return (
    <Suspense>
      <AuthForm mode="forgot" />
    </Suspense>
  );
}
