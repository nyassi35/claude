import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth/session";
import { OnboardingForm } from "./OnboardingForm";

export const metadata = { title: "Create organization" };

export default async function Onboarding() {
  const base = await getAuthUser();
  if (!base) redirect("/login");
  if (base.memberships.length) redirect("/dashboard");
  return <OnboardingForm email={base.user.email} />;
}
