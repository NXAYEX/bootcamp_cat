-- 006 · Módulo B: procedimientos, auditorías contra el checklist y hallazgos con cita textual.
-- Acceso por país con proceso 'procedimientos'. Escritura solo por RPC.

create table public.procedures (
  id uuid primary key default gen_random_uuid(),
  country_code text not null references public.countries(code),
  site_id uuid references public.sites(id),
  title text not null,
  file_name text not null,
  file_path text,
  content_text text not null,
  uploaded_by uuid not null references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.procedures enable row level security;

create table public.procedure_audits (
  id uuid primary key default gen_random_uuid(),
  procedure_id uuid not null references public.procedures(id) on delete cascade,
  country_code text not null,
  method text not null check (method in ('keywords', 'ai')),
  score numeric not null check (score between 0 and 100),
  created_by uuid not null references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.procedure_audits enable row level security;
create index on public.procedure_audits (procedure_id);

create table public.procedure_findings (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.procedure_audits(id) on delete cascade,
  country_code text not null,
  item_code text not null,
  result text not null check (result in ('cumple', 'parcial', 'no_encontrado')),
  evidence_quote text,
  question text,
  suggested_text text,
  source text not null default 'keywords' check (source in ('keywords', 'ai')),
  confidence numeric check (confidence between 0 and 1),
  human_result text check (human_result in ('cumple', 'parcial', 'no_encontrado')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  -- Un hallazgo "cumple" o "parcial" sin cita no puede existir: la evidencia es obligatoria.
  check (result = 'no_encontrado' or length(coalesce(evidence_quote, '')) > 0)
);
alter table public.procedure_findings enable row level security;
create index on public.procedure_findings (audit_id);

create or replace function private.can_read_procedures(p_country text)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.user_role() in ('process_owner', 'central_analyst')
     and (private.has_any_country_access(p_country, 'procedimientos') or private.has_country_access(p_country, 'novedades'))
$$;
grant execute on function private.can_read_procedures to authenticated;

create policy "procedimientos del país asignado" on public.procedures for select to authenticated using (private.can_read_procedures(country_code));
create policy "auditorías del país asignado" on public.procedure_audits for select to authenticated using (private.can_read_procedures(country_code));
create policy "hallazgos de procedimiento del país asignado" on public.procedure_findings for select to authenticated using (private.can_read_procedures(country_code));

revoke all on public.procedures, public.procedure_audits, public.procedure_findings from anon;
revoke insert, update, delete on public.procedures, public.procedure_audits, public.procedure_findings from authenticated;

create or replace function public.create_procedure(p_country text, p_site_id uuid, p_title text, p_file_name text, p_file_path text, p_content text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if private.user_role() not in ('process_owner', 'central_analyst') or not private.can_read_procedures(p_country) then
    raise exception 'No puedes subir procedimientos de este país';
  end if;
  if length(coalesce(p_content, '')) < 20 then
    raise exception 'El procedimiento no tiene texto legible';
  end if;
  if p_file_path is not null and split_part(p_file_path, '/', 1) <> p_country then
    raise exception 'La ruta del archivo no corresponde al país';
  end if;
  insert into public.procedures (country_code, site_id, title, file_name, file_path, content_text)
  values (p_country, p_site_id, left(p_title, 200), p_file_name, p_file_path, left(p_content, 200000))
  returning id into v_id;
  perform private.write_audit('procedure.create', 'B', 'procedures', v_id::text, jsonb_build_object('country', p_country, 'file', p_file_name));
  return v_id;
end $$;

create or replace function public.save_procedure_audit(p_procedure_id uuid, p_method text, p_score numeric, p_findings jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_country text;
  v_audit_id uuid;
begin
  select country_code into v_country from public.procedures where id = p_procedure_id;
  if v_country is null or not private.can_read_procedures(v_country) then
    raise exception 'Procedimiento no encontrado';
  end if;
  insert into public.procedure_audits (procedure_id, country_code, method, score)
  values (p_procedure_id, v_country, p_method, p_score) returning id into v_audit_id;
  insert into public.procedure_findings (audit_id, country_code, item_code, result, evidence_quote, question, suggested_text, source, confidence)
  select v_audit_id, v_country, f.item_code, f.result, left(f.evidence_quote, 2000), f.question, left(f.suggested_text, 4000),
         coalesce(f.source, p_method), f.confidence
  from jsonb_to_recordset(p_findings) as f(item_code text, result text, evidence_quote text, question text, suggested_text text, source text, confidence numeric);
  perform private.write_audit('procedure.audit', 'B', 'procedure_audits', v_audit_id::text, jsonb_build_object('method', p_method, 'score', p_score));
  return v_audit_id;
end $$;

-- Revisión humana de un hallazgo: alimenta la métrica de concordancia.
create or replace function public.review_procedure_finding(p_finding_id uuid, p_human_result text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_country text;
begin
  select country_code into v_country from public.procedure_findings where id = p_finding_id;
  if v_country is null or not private.can_read_procedures(v_country) then
    raise exception 'Hallazgo no encontrado';
  end if;
  update public.procedure_findings set human_result = p_human_result, reviewed_by = auth.uid(), reviewed_at = now() where id = p_finding_id;
  perform private.write_audit('procedure.review', 'B', 'procedure_findings', p_finding_id::text, jsonb_build_object('human_result', p_human_result));
end $$;

revoke execute on function public.create_procedure, public.save_procedure_audit, public.review_procedure_finding from anon;

insert into storage.buckets (id, name, public, file_size_limit)
values ('procedures', 'procedures', false, 5242880)
on conflict (id) do update set public = false, file_size_limit = 5242880;

create policy "subir procedimientos del país asignado" on storage.objects for insert to authenticated
  with check (bucket_id = 'procedures' and private.can_read_procedures((storage.foldername(name))[1]));
create policy "leer procedimientos del país asignado" on storage.objects for select to authenticated
  using (bucket_id = 'procedures' and private.can_read_procedures((storage.foldername(name))[1]));
