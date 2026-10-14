import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { getBundle, templateFor } from "@/lib/services/investigations";
import { listMembers } from "@/lib/services/admin";
import { NotFoundError } from "@/lib/db/types";

/** Loads an investigation bundle for a page; 404s for ids outside the active organization. */
export const loadInvestigation = cache(async (id: string) => {
  const s = await requireSession();
  try {
    const bundle = await getBundle(s, id);
    const [template, members] = await Promise.all([templateFor(s, bundle.investigation.category_key), listMembers(s)]);
    const memberName = (uid: string | null | undefined) => {
      const m = members.find((x) => x.user_id === uid);
      return m?.profile?.full_name || m?.profile?.email || (uid ? "Unknown user" : "—");
    };
    return { s, ...bundle, template, members, memberName };
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
});
