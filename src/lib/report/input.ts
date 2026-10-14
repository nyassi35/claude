import "server-only";
import type { Session } from "@/lib/auth/session";
import { getBundle, templateFor } from "@/lib/services/investigations";
import { listMembers, listPlants } from "@/lib/services/admin";
import type { ReportInput } from "./model";

export async function reportInput(s: Session, id: string): Promise<ReportInput> {
  const bundle = await getBundle(s, id);
  const [template, members, ref] = await Promise.all([templateFor(s, bundle.investigation.category_key), listMembers(s), listPlants(s)]);
  return {
    ...bundle,
    template,
    orgName: s.orgName,
    settings: s.settings,
    memberName: (uid) => members.find((m) => m.user_id === uid)?.profile?.full_name ?? (uid ? "Unknown user" : "—"),
    plantName: ref.plants.find((p) => p.id === bundle.investigation.plant_id)?.name,
    lineName: ref.lines.find((l) => l.id === bundle.investigation.line_id)?.name,
  };
}
