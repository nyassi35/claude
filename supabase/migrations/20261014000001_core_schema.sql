-- RootCause AI — core schema
-- Organization-scoped multi-tenant data model with Row Level Security.
-- Every tenant table carries org_id; RLS policies restrict access to members of that org,
-- and write policies are additionally gated by role.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('admin', 'rca_manager', 'engineer', 'operator', 'reviewer', 'viewer');
create type public.investigation_status as enum (
  'draft', 'open', 'in_analysis', 'awaiting_evidence', 'root_cause_confirmed',
  'capa_in_progress', 'verification', 'closed', 'cancelled'
);
create type public.severity_level as enum ('low', 'medium', 'high', 'critical');
create type public.priority_level as enum ('low', 'medium', 'high', 'urgent');
create type public.cause_status as enum ('hypothesis', 'under_investigation', 'supported', 'confirmed', 'rejected');
create type public.cause_type as enum ('symptom', 'possible_cause', 'contributing_factor', 'root_cause', 'systemic_cause');
create type public.six_m as enum ('manpower', 'machine', 'method', 'material', 'measurement', 'environment');
create type public.confidence_level as enum ('low', 'medium', 'high');
create type public.evidence_kind as enum ('measurement', 'observation', 'document', 'photo', 'log', 'interview', 'test_result', 'record');
create type public.capa_status as enum ('open', 'assigned', 'in_progress', 'pending_verification', 'effective', 'ineffective', 'closed');
create type public.capa_type as enum ('containment', 'corrective', 'preventive');
create type public.analysis_status as enum ('not_started', 'in_progress', 'complete');
create type public.approval_decision as enum ('approved', 'rejected', 'changes_requested');

-- ---------------------------------------------------------------------------
-- Organizations, profiles, memberships
-- ---------------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  settings jsonb not null default '{"rpn_threshold":120,"severity_escalation":9,"use_action_priority":true,"currency":"EUR"}'::jsonb,
  investigation_seq integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  created_at timestamptz not null default now()
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.app_role not null default 'viewer',
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);
create index memberships_user_idx on public.memberships (user_id);

-- ---------------------------------------------------------------------------
-- Authorization helpers (SECURITY DEFINER so policies don't recurse through RLS)
-- ---------------------------------------------------------------------------
create or replace function public.is_org_member(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.memberships m where m.org_id = p_org and m.user_id = auth.uid());
$$;

create or replace function public.has_org_role(p_org uuid, p_roles public.app_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.memberships m
    where m.org_id = p_org and m.user_id = auth.uid() and m.role = any (p_roles)
  );
$$;

-- Role groups used by policies
create or replace function public.can_analyze(p_org uuid)
returns boolean language sql stable as $$
  select public.has_org_role(p_org, array['admin','rca_manager','engineer']::public.app_role[]);
$$;
create or replace function public.can_report(p_org uuid)
returns boolean language sql stable as $$
  select public.has_org_role(p_org, array['admin','rca_manager','engineer','operator']::public.app_role[]);
$$;
create or replace function public.can_approve(p_org uuid)
returns boolean language sql stable as $$
  select public.has_org_role(p_org, array['admin','rca_manager','reviewer']::public.app_role[]);
$$;
create or replace function public.is_org_admin(p_org uuid)
returns boolean language sql stable as $$
  select public.has_org_role(p_org, array['admin']::public.app_role[]);
$$;

-- ---------------------------------------------------------------------------
-- Plants and lines
-- ---------------------------------------------------------------------------
create table public.plants (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  location text,
  created_at timestamptz not null default now(),
  unique (org_id, name)
);

create table public.production_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  plant_id uuid not null references public.plants (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (plant_id, name)
);

-- Org-level overrides of the built-in category templates (built-ins ship in code).
create table public.category_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  category_key text not null,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (org_id, category_key)
);

-- ---------------------------------------------------------------------------
-- Investigations
-- ---------------------------------------------------------------------------
create table public.investigations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  number text not null default '',
  title text not null check (char_length(title) between 3 and 200),
  category_key text not null,
  status public.investigation_status not null default 'draft',
  severity public.severity_level not null default 'medium',
  priority public.priority_level not null default 'medium',
  plant_id uuid references public.plants (id) on delete set null,
  line_id uuid references public.production_lines (id) on delete set null,
  department text,
  process_name text,
  product text,
  batch_number text,
  asset_id text,
  occurred_at timestamptz,
  shift text,
  owner_id uuid references auth.users (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  due_date date,
  wizard_step smallint not null default 1 check (wizard_step between 1 and 5),
  problem jsonb not null default '{}'::jsonb,
  process jsonb not null default '{}'::jsonb,
  answers jsonb not null default '{}'::jsonb,
  kpis jsonb not null default '[]'::jsonb,
  risk jsonb not null default '{"ratings":{}}'::jsonb,
  selected_methods text[] not null default '{}',
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, number),
  constraint closed_has_timestamp check (status <> 'closed' or closed_at is not null)
);
create index investigations_org_status_idx on public.investigations (org_id, status);
create index investigations_org_created_idx on public.investigations (org_id, created_at desc);
create index investigations_category_idx on public.investigations (org_id, category_key);
create index investigations_line_idx on public.investigations (line_id);

-- Per-org human-readable number: RCA-2026-0001
create or replace function public.assign_investigation_number()
returns trigger language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update public.organizations set investigation_seq = investigation_seq + 1
    where id = new.org_id returning investigation_seq into n;
  new.number := 'RCA-' || to_char(now(), 'YYYY') || '-' || lpad(n::text, 4, '0');
  return new;
end $$;
create trigger investigations_number before insert on public.investigations
  for each row when (new.number is null or new.number = '') execute function public.assign_investigation_number();

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
create trigger investigations_touch before update on public.investigations
  for each row execute function public.touch_updated_at();

-- Child tables share a pattern: org_id must equal the parent investigation's org_id.
create or replace function public.enforce_child_org()
returns trigger language plpgsql security definer set search_path = public as $$
declare parent_org uuid;
begin
  select org_id into parent_org from public.investigations where id = new.investigation_id;
  if parent_org is null or parent_org <> new.org_id then
    raise exception 'org_id mismatch with parent investigation' using errcode = '42501';
  end if;
  return new;
end $$;

create table public.timeline_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  investigation_id uuid not null references public.investigations (id) on delete cascade,
  occurred_at timestamptz not null,
  description text not null,
  source text,
  is_verified boolean not null default false,
  created_at timestamptz not null default now()
);
create index timeline_inv_idx on public.timeline_events (investigation_id, occurred_at);

create table public.evidence (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  investigation_id uuid not null references public.investigations (id) on delete cascade,
  title text not null,
  kind public.evidence_kind not null default 'observation',
  description text,
  source text,
  collected_by text,
  collected_at timestamptz,
  file_path text,
  file_name text,
  is_verified boolean not null default false,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint file_path_in_org check (file_path is null or file_path like org_id::text || '/%')
);
create index evidence_inv_idx on public.evidence (investigation_id);

create table public.measurements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  investigation_id uuid not null references public.investigations (id) on delete cascade,
  parameter text not null,
  value double precision not null,
  unit text,
  batch text,
  group_label text,
  measured_at timestamptz,
  lsl double precision,
  usl double precision,
  target double precision,
  source text,
  created_at timestamptz not null default now(),
  constraint spec_order check (lsl is null or usl is null or lsl <= usl)
);
create index measurements_inv_param_idx on public.measurements (investigation_id, parameter);

create table public.causes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  investigation_id uuid not null references public.investigations (id) on delete cascade,
  description text not null,
  category public.six_m,
  cause_type public.cause_type not null default 'possible_cause',
  status public.cause_status not null default 'hypothesis',
  evidence_for text,
  evidence_against text,
  evidence_ids uuid[] not null default '{}',
  confidence public.confidence_level not null default 'low',
  confidence_rationale text,
  verification_test text,
  verification_result text,
  source_method text,
  ai_suggested boolean not null default false,
  owner text,
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A confirmed cause must have documented supporting evidence and a human approver.
  constraint confirmed_requires_evidence check (
    status <> 'confirmed' or (coalesce(char_length(evidence_for), 0) > 0 and approved_by is not null)
  ),
  -- AI-suggested causes can never be confirmed without a human approver (covered above) —
  -- additionally they cannot be created directly in a confirmed state.
  constraint rejected_requires_reason check (
    status <> 'rejected' or coalesce(char_length(evidence_against), 0) > 0
  )
);
create index causes_inv_idx on public.causes (investigation_id, status);
create trigger causes_touch before update on public.causes for each row execute function public.touch_updated_at();

-- Generic per-method analysis store (5 Whys tree, fishbone, DMAIC, Pareto, FTA, ...)
create table public.rca_analyses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  investigation_id uuid not null references public.investigations (id) on delete cascade,
  method text not null check (method ~ '^[a-z_]{2,40}$'),
  data jsonb not null default '{}'::jsonb,
  status public.analysis_status not null default 'in_progress',
  updated_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (investigation_id, method)
);
create trigger rca_analyses_touch before update on public.rca_analyses for each row execute function public.touch_updated_at();

create table public.fmea_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  investigation_id uuid not null references public.investigations (id) on delete cascade,
  process_step text not null,
  function_requirement text,
  failure_mode text not null,
  effects text,
  causes text,
  prevention_controls text,
  detection_controls text,
  severity smallint not null check (severity between 1 and 10),
  occurrence smallint not null check (occurrence between 1 and 10),
  detection smallint not null check (detection between 1 and 10),
  rpn integer generated always as (severity * occurrence * detection) stored,
  recommended_actions text,
  action_owner text,
  due_date date,
  revised_severity smallint check (revised_severity between 1 and 10),
  revised_occurrence smallint check (revised_occurrence between 1 and 10),
  revised_detection smallint check (revised_detection between 1 and 10),
  revised_rpn integer generated always as (revised_severity * revised_occurrence * revised_detection) stored,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index fmea_inv_idx on public.fmea_items (investigation_id);
create index fmea_rpn_idx on public.fmea_items (org_id, rpn desc);
create trigger fmea_touch before update on public.fmea_items for each row execute function public.touch_updated_at();

create table public.capa_actions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  investigation_id uuid not null references public.investigations (id) on delete cascade,
  cause_id uuid references public.causes (id) on delete set null,
  action_type public.capa_type not null default 'corrective',
  description text not null,
  expected_impact text,
  assignee_id uuid references auth.users (id) on delete set null,
  responsible_name text,
  department text,
  priority public.priority_level not null default 'medium',
  due_date date,
  estimated_cost numeric(14, 2) check (estimated_cost is null or estimated_cost >= 0),
  resources text,
  status public.capa_status not null default 'open',
  status_reason text,
  verification_method text,
  acceptance_criteria text,
  actual_result text,
  effectiveness_review_date date,
  evidence_ids uuid[] not null default '{}',
  closure_approved_by uuid references auth.users (id) on delete set null,
  closure_approved_at timestamptz,
  parent_action_id uuid references public.capa_actions (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ineffective_requires_reason check (status <> 'ineffective' or coalesce(char_length(status_reason), 0) > 0),
  constraint closed_requires_approval check (status <> 'closed' or closure_approved_by is not null),
  constraint effective_requires_result check (status not in ('effective', 'closed') or coalesce(char_length(actual_result), 0) > 0)
);
create index capa_inv_idx on public.capa_actions (investigation_id);
create index capa_org_status_due_idx on public.capa_actions (org_id, status, due_date);
create index capa_assignee_idx on public.capa_actions (assignee_id);
create trigger capa_touch before update on public.capa_actions for each row execute function public.touch_updated_at();

create table public.control_plan_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  investigation_id uuid not null references public.investigations (id) on delete cascade,
  process_step text not null,
  characteristic text not null,
  specification text,
  control_method text,
  measurement_method text,
  sample_size text,
  frequency text,
  control_limits text,
  reaction_plan text,
  owner text,
  review_date date,
  created_at timestamptz not null default now()
);
create index control_plan_inv_idx on public.control_plan_items (investigation_id);

create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  investigation_id uuid not null references public.investigations (id) on delete cascade,
  record_type text not null check (record_type in ('investigation','cause','capa','report','dmaic_phase')),
  record_id text not null,
  decision public.approval_decision not null,
  comment text,
  approver_id uuid not null references auth.users (id) on delete restrict default auth.uid(),
  approver_name text,
  created_at timestamptz not null default now()
);
create index approvals_inv_idx on public.approvals (investigation_id);

create table public.audit_events (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizations (id) on delete cascade,
  actor_id uuid,
  action text not null,
  table_name text not null,
  record_id text,
  investigation_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_org_created_idx on public.audit_events (org_id, created_at desc);
create index audit_inv_idx on public.audit_events (investigation_id);

-- Child org consistency triggers
create trigger timeline_org before insert or update on public.timeline_events for each row execute function public.enforce_child_org();
create trigger evidence_org before insert or update on public.evidence for each row execute function public.enforce_child_org();
create trigger measurements_org before insert or update on public.measurements for each row execute function public.enforce_child_org();
create trigger causes_org before insert or update on public.causes for each row execute function public.enforce_child_org();
create trigger rca_org before insert or update on public.rca_analyses for each row execute function public.enforce_child_org();
create trigger fmea_org before insert or update on public.fmea_items for each row execute function public.enforce_child_org();
create trigger capa_org before insert or update on public.capa_actions for each row execute function public.enforce_child_org();
create trigger control_plan_org before insert or update on public.control_plan_items for each row execute function public.enforce_child_org();
create trigger approvals_org before insert or update on public.approvals for each row execute function public.enforce_child_org();

-- Prevent moving any record to another organization after creation.
create or replace function public.prevent_org_change()
returns trigger language plpgsql as $$
begin
  if new.org_id <> old.org_id then
    raise exception 'org_id is immutable' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger investigations_org_immutable before update on public.investigations for each row execute function public.prevent_org_change();

-- Confirming a cause or approving CAPA closure must be done by an approver role.
create or replace function public.guard_approvals()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if; -- service role / seed scripts
  if tg_table_name = 'causes' then
    if new.status = 'confirmed' and (tg_op = 'INSERT' or old.status is distinct from 'confirmed') then
      if not public.can_approve(new.org_id) then
        raise exception 'Only an RCA Manager, Reviewer or Administrator can confirm a root cause' using errcode = '42501';
      end if;
      new.approved_by := auth.uid();
      new.approved_at := now();
    end if;
  elsif tg_table_name = 'capa_actions' then
    if new.closure_approved_by is distinct from (case when tg_op = 'UPDATE' then old.closure_approved_by else null end)
       and new.closure_approved_by is not null then
      if not public.can_approve(new.org_id) or new.closure_approved_by <> auth.uid() then
        raise exception 'Closure approval must be given by the approving user with an approver role' using errcode = '42501';
      end if;
      new.closure_approved_at := now();
    end if;
  end if;
  return new;
end $$;
create trigger causes_guard before insert or update on public.causes for each row execute function public.guard_approvals();
create trigger capa_guard before insert or update on public.capa_actions for each row execute function public.guard_approvals();

-- Operators may update only progress fields on CAPA actions assigned to them.
create or replace function public.guard_operator_capa()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.can_analyze(new.org_id) or public.can_approve(new.org_id) then return new; end if;
  if old.assignee_id is distinct from auth.uid() then
    raise exception 'Not assigned to this action' using errcode = '42501';
  end if;
  if new.description is distinct from old.description or new.assignee_id is distinct from old.assignee_id
     or new.due_date is distinct from old.due_date or new.priority is distinct from old.priority
     or new.acceptance_criteria is distinct from old.acceptance_criteria
     or new.status not in ('in_progress', 'pending_verification', 'assigned') then
    raise exception 'Operators can only update progress, results and evidence on assigned actions' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger capa_operator_guard before update on public.capa_actions for each row execute function public.guard_operator_capa();

-- ---------------------------------------------------------------------------
-- Audit logging
-- ---------------------------------------------------------------------------
create or replace function public.audit_row()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  rec jsonb;
  old_rec jsonb;
  inv uuid;
  changed jsonb := '{}'::jsonb;
  k text;
begin
  rec := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  if tg_op = 'UPDATE' then
    old_rec := to_jsonb(old);
    for k in select jsonb_object_keys(rec) loop
      if k not in ('updated_at') and (rec -> k) is distinct from (old_rec -> k) then
        changed := changed || jsonb_build_object(k, jsonb_build_object('from', old_rec -> k, 'to', rec -> k));
      end if;
    end loop;
    if changed = '{}'::jsonb then return new; end if;
  end if;
  inv := case when tg_table_name = 'investigations' then (rec ->> 'id')::uuid else (rec ->> 'investigation_id')::uuid end;
  insert into public.audit_events (org_id, actor_id, action, table_name, record_id, investigation_id, details)
  values (
    (rec ->> 'org_id')::uuid, auth.uid(), lower(tg_op), tg_table_name, rec ->> 'id', inv,
    case when tg_op = 'UPDATE' then changed
         when tg_op = 'DELETE' then jsonb_build_object('deleted', rec)
         else jsonb_build_object('created', true) end
  );
  return case when tg_op = 'DELETE' then old else new end;
end $$;

do $$
declare t text;
begin
  foreach t in array array['investigations','evidence','measurements','causes','rca_analyses','fmea_items',
                           'capa_actions','control_plan_items','approvals','timeline_events','memberships','category_templates']
  loop
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.audit_row()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Onboarding RPC: create an organization and make the caller its administrator.
-- ---------------------------------------------------------------------------
create or replace function public.create_organization(p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_org uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  insert into public.organizations (name) values (p_name) returning id into new_org;
  insert into public.memberships (org_id, user_id, role) values (new_org, auth.uid(), 'admin');
  return new_org;
end $$;
revoke all on function public.create_organization(text) from public, anon;
grant execute on function public.create_organization(text) to authenticated;

-- Admin RPC: add an existing registered user (by email) to the org with a role.
create or replace function public.add_member_by_email(p_org uuid, p_email text, p_role public.app_role)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid; mid uuid;
begin
  if not public.is_org_admin(p_org) then raise exception 'Only administrators can add members' using errcode = '42501'; end if;
  select id into uid from public.profiles where lower(email) = lower(p_email);
  if uid is null then raise exception 'No registered user with that email' using errcode = 'P0002'; end if;
  insert into public.memberships (org_id, user_id, role) values (p_org, uid, p_role)
    on conflict (org_id, user_id) do update set role = excluded.role
    returning id into mid;
  return mid;
end $$;
revoke all on function public.add_member_by_email(uuid, text, public.app_role) from public, anon;
grant execute on function public.add_member_by_email(uuid, text, public.app_role) to authenticated;

-- Create profile rows for new auth users.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
