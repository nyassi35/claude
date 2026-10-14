-- RootCause AI — Row Level Security
-- Principle: deny by default. Every tenant table is readable only by members of the row's
-- organization; writes are gated by role. Server code adds its own authorization checks
-- on top of these policies (defence in depth).

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.plants enable row level security;
alter table public.production_lines enable row level security;
alter table public.category_templates enable row level security;
alter table public.investigations enable row level security;
alter table public.timeline_events enable row level security;
alter table public.evidence enable row level security;
alter table public.measurements enable row level security;
alter table public.causes enable row level security;
alter table public.rca_analyses enable row level security;
alter table public.fmea_items enable row level security;
alter table public.capa_actions enable row level security;
alter table public.control_plan_items enable row level security;
alter table public.approvals enable row level security;
alter table public.audit_events enable row level security;

-- Organizations ------------------------------------------------------------
create policy org_select on public.organizations for select to authenticated using (public.is_org_member(id));
create policy org_update on public.organizations for update to authenticated
  using (public.is_org_admin(id)) with check (public.is_org_admin(id));
-- inserts happen only through create_organization() (security definer)

-- Profiles: own profile, plus profiles of people who share an organization
create policy profiles_select on public.profiles for select to authenticated using (
  id = auth.uid() or exists (
    select 1 from public.memberships a join public.memberships b on a.org_id = b.org_id
    where a.user_id = auth.uid() and b.user_id = profiles.id
  )
);
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Memberships ----------------------------------------------------------------
create policy memberships_select on public.memberships for select to authenticated using (public.is_org_member(org_id));
create policy memberships_admin_update on public.memberships for update to authenticated
  using (public.is_org_admin(org_id)) with check (public.is_org_admin(org_id));
create policy memberships_admin_delete on public.memberships for delete to authenticated
  using (public.is_org_admin(org_id) and user_id <> auth.uid());

-- Reference data -------------------------------------------------------------
create policy plants_select on public.plants for select to authenticated using (public.is_org_member(org_id));
create policy plants_write on public.plants for all to authenticated
  using (public.has_org_role(org_id, array['admin','rca_manager']::public.app_role[]))
  with check (public.has_org_role(org_id, array['admin','rca_manager']::public.app_role[]));
create policy lines_select on public.production_lines for select to authenticated using (public.is_org_member(org_id));
create policy lines_write on public.production_lines for all to authenticated
  using (public.has_org_role(org_id, array['admin','rca_manager']::public.app_role[]))
  with check (public.has_org_role(org_id, array['admin','rca_manager']::public.app_role[]));
create policy templates_select on public.category_templates for select to authenticated using (public.is_org_member(org_id));
create policy templates_write on public.category_templates for all to authenticated
  using (public.is_org_admin(org_id)) with check (public.is_org_admin(org_id));

-- Investigations ---------------------------------------------------------------
create policy inv_select on public.investigations for select to authenticated using (public.is_org_member(org_id));
create policy inv_insert on public.investigations for insert to authenticated
  with check (public.can_report(org_id) and created_by = auth.uid());
-- Analysts can edit any investigation in the org; operators only their own drafts.
create policy inv_update on public.investigations for update to authenticated
  using (public.can_analyze(org_id) or (public.can_report(org_id) and created_by = auth.uid() and status = 'draft'))
  with check (public.can_analyze(org_id) or (public.can_report(org_id) and created_by = auth.uid() and status = 'draft'));
create policy inv_delete on public.investigations for delete to authenticated
  using (public.has_org_role(org_id, array['admin','rca_manager']::public.app_role[]));

-- Evidence + timeline: anyone who can report incidents can add; analysts can modify.
create policy evidence_select on public.evidence for select to authenticated using (public.is_org_member(org_id));
create policy evidence_insert on public.evidence for insert to authenticated with check (public.can_report(org_id));
create policy evidence_update on public.evidence for update to authenticated
  using (public.can_analyze(org_id) or created_by = auth.uid()) with check (public.can_report(org_id));
create policy evidence_delete on public.evidence for delete to authenticated using (public.can_analyze(org_id));

create policy timeline_select on public.timeline_events for select to authenticated using (public.is_org_member(org_id));
create policy timeline_insert on public.timeline_events for insert to authenticated with check (public.can_report(org_id));
create policy timeline_update on public.timeline_events for update to authenticated
  using (public.can_analyze(org_id)) with check (public.can_analyze(org_id));
create policy timeline_delete on public.timeline_events for delete to authenticated using (public.can_analyze(org_id));

create policy measurements_select on public.measurements for select to authenticated using (public.is_org_member(org_id));
create policy measurements_insert on public.measurements for insert to authenticated with check (public.can_report(org_id));
create policy measurements_modify on public.measurements for update to authenticated
  using (public.can_analyze(org_id)) with check (public.can_analyze(org_id));
create policy measurements_delete on public.measurements for delete to authenticated using (public.can_analyze(org_id));

-- Analysis tables: analysts write; reviewers may update causes (to confirm/reject).
create policy causes_select on public.causes for select to authenticated using (public.is_org_member(org_id));
create policy causes_insert on public.causes for insert to authenticated with check (public.can_analyze(org_id));
create policy causes_update on public.causes for update to authenticated
  using (public.can_analyze(org_id) or public.can_approve(org_id))
  with check (public.can_analyze(org_id) or public.can_approve(org_id));
create policy causes_delete on public.causes for delete to authenticated using (public.can_analyze(org_id));

create policy rca_select on public.rca_analyses for select to authenticated using (public.is_org_member(org_id));
create policy rca_write on public.rca_analyses for all to authenticated
  using (public.can_analyze(org_id)) with check (public.can_analyze(org_id));

create policy fmea_select on public.fmea_items for select to authenticated using (public.is_org_member(org_id));
create policy fmea_write on public.fmea_items for all to authenticated
  using (public.can_analyze(org_id)) with check (public.can_analyze(org_id));

create policy control_select on public.control_plan_items for select to authenticated using (public.is_org_member(org_id));
create policy control_write on public.control_plan_items for all to authenticated
  using (public.can_analyze(org_id)) with check (public.can_analyze(org_id));

-- CAPA: analysts manage; approvers may update (closure approval); operators update assigned actions
-- (the guard_operator_capa trigger limits which columns they can change).
create policy capa_select on public.capa_actions for select to authenticated using (public.is_org_member(org_id));
create policy capa_insert on public.capa_actions for insert to authenticated with check (public.can_analyze(org_id));
create policy capa_update on public.capa_actions for update to authenticated
  using (public.can_analyze(org_id) or public.can_approve(org_id) or (public.is_org_member(org_id) and assignee_id = auth.uid()))
  with check (public.can_analyze(org_id) or public.can_approve(org_id) or (public.is_org_member(org_id) and assignee_id = auth.uid()));
create policy capa_delete on public.capa_actions for delete to authenticated
  using (public.has_org_role(org_id, array['admin','rca_manager']::public.app_role[]));

-- Approvals: approvers sign as themselves; records are immutable.
create policy approvals_select on public.approvals for select to authenticated using (public.is_org_member(org_id));
create policy approvals_insert on public.approvals for insert to authenticated
  with check (public.can_approve(org_id) and approver_id = auth.uid());

-- Audit log: readable by admins and RCA managers; written only by triggers; never modified.
create policy audit_select on public.audit_events for select to authenticated
  using (public.has_org_role(org_id, array['admin','rca_manager']::public.app_role[]));

-- Least privilege for the anon role: nothing in public is reachable without a session.
revoke all on all tables in schema public from anon;
revoke insert, update, delete on public.audit_events from authenticated;
revoke update, delete on public.approvals from authenticated;

-- ---------------------------------------------------------------------------
-- Storage: evidence attachments live under "<org_id>/<investigation_id>/<file>"
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('evidence', 'evidence', false, 26214400)
on conflict (id) do nothing;

create policy evidence_files_select on storage.objects for select to authenticated
  using (bucket_id = 'evidence' and public.is_org_member(((storage.foldername(name))[1])::uuid));
create policy evidence_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'evidence' and public.can_report(((storage.foldername(name))[1])::uuid));
create policy evidence_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'evidence' and public.can_analyze(((storage.foldername(name))[1])::uuid));
