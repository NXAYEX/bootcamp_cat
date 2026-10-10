-- 005 · Lotes, filas normalizadas, hallazgos, exportaciones y bucket privado de archivos.
-- Lectura por RLS (plantas/países asignados). Escritura solo por funciones RPC que validan rol y alcance.

create table public.exports (
  id uuid primary key default gen_random_uuid(),
  country_code text not null references public.countries(code),
  period text not null,
  batch_ids uuid[] not null,
  row_count int not null default 0,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.exports enable row level security;

create table public.batches (
  id uuid primary key default gen_random_uuid(),
  country_code text not null references public.countries(code),
  site_id uuid not null references public.sites(id),
  period text not null check (period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  source text not null check (source in ('file', 'mobile')),
  file_name text,
  file_path text,
  fingerprint text,
  row_count int not null default 0,
  status text not null default 'validated' check (status in ('validated', 'approved', 'rejected', 'exported')),
  disposition text not null check (disposition in ('load', 'load_with_warnings', 'block')),
  initial_disposition text not null check (initial_disposition in ('load', 'load_with_warnings', 'block')),
  approved_disposition text check (approved_disposition in ('load', 'load_with_warnings')),
  decision_note text,
  created_by uuid not null references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  export_id uuid references public.exports(id)
);
alter table public.batches enable row level security;
create index on public.batches (site_id, period);
create index on public.batches (country_code, status);

create table public.batch_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.batches(id) on delete cascade,
  country_code text not null,
  site_id uuid not null,
  row_number int not null,
  employee_id uuid references public.employees(id),
  employee_code text,
  national_id_masked text,
  concept_code text,
  date date,
  quantity numeric,
  unit text,
  support_ref text,
  created_at timestamptz not null default now()
);
alter table public.batch_rows enable row level security;
create index on public.batch_rows (batch_id);
create index on public.batch_rows (site_id, date);

create table public.findings (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.batches(id) on delete cascade,
  country_code text not null,
  site_id uuid not null,
  row_number int,
  code text not null,
  severity text not null check (severity in ('blocking', 'warning', 'info')),
  owner text not null check (owner in ('site', 'central')),
  field text,
  value text,
  message text not null,
  status text not null default 'open' check (status in ('open', 'in_correction', 'resolved', 'accepted')),
  resolution_note text,
  resolved_by uuid references auth.users(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.findings enable row level security;
create index on public.findings (batch_id);
create index on public.findings (site_id, status);

-- ---------- RLS: solo lectura según planta asignada ----------
create policy "lotes de las plantas asignadas" on public.batches for select to authenticated
  using (private.user_role() in ('site_supervisor', 'central_analyst') and private.has_site_access(site_id));
create policy "filas de las plantas asignadas" on public.batch_rows for select to authenticated
  using (private.user_role() in ('site_supervisor', 'central_analyst') and private.has_site_access(site_id));
create policy "hallazgos de las plantas asignadas" on public.findings for select to authenticated
  using (private.user_role() in ('site_supervisor', 'central_analyst') and private.has_site_access(site_id));
create policy "exportaciones de los países asignados" on public.exports for select to authenticated
  using (private.user_role() = 'central_analyst' and private.has_country_access(country_code));

revoke all on public.batches, public.batch_rows, public.findings, public.exports from anon;
revoke insert, update, delete on public.batches, public.batch_rows, public.findings, public.exports from authenticated;

-- ---------- Disposición: la decide la base de datos con la misma regla que el motor ----------
create or replace function private.compute_disposition(p_batch_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select case
    when exists (select 1 from public.findings f where f.batch_id = p_batch_id and f.severity = 'blocking' and f.status in ('open', 'in_correction')) then 'block'
    when exists (select 1 from public.findings f where f.batch_id = p_batch_id and f.severity = 'warning' and f.status in ('open', 'in_correction')) then 'load_with_warnings'
    else 'load'
  end
$$;

-- ---------- RPC: enviar lote validado (atómico) ----------
create or replace function public.submit_batch(p_batch jsonb, p_rows jsonb, p_findings jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_site public.sites%rowtype;
  v_batch_id uuid;
  v_period text := p_batch ->> 'period';
  v_disposition text;
  v_rows int := coalesce(jsonb_array_length(p_rows), 0);
begin
  if private.user_role() not in ('site_supervisor', 'central_analyst') then
    raise exception 'Tu rol no puede enviar lotes';
  end if;
  select * into v_site from public.sites where id = (p_batch ->> 'site_id')::uuid;
  if not found or not private.has_site_access(v_site.id) then
    raise exception 'No tienes acceso a esa planta';
  end if;
  if v_rows > 20000 then
    raise exception 'El lote supera el máximo de 20.000 filas';
  end if;
  if p_batch ->> 'source' = 'mobile' and private.user_role() <> 'site_supervisor' then
    raise exception 'La captura móvil es solo para supervisores de planta';
  end if;
  if p_batch ->> 'file_path' is not null and split_part(p_batch ->> 'file_path', '/', 1) <> v_site.country_code
     or p_batch ->> 'file_path' is not null and split_part(p_batch ->> 'file_path', '/', 2) <> v_site.code then
    raise exception 'La ruta del archivo no corresponde a la planta';
  end if;

  insert into public.batches (country_code, site_id, period, source, file_name, file_path, fingerprint, row_count, disposition, initial_disposition)
  values (v_site.country_code, v_site.id, v_period, p_batch ->> 'source', p_batch ->> 'file_name', p_batch ->> 'file_path',
          p_batch ->> 'fingerprint', v_rows, 'block', 'block')
  returning id into v_batch_id;

  insert into public.batch_rows (batch_id, country_code, site_id, row_number, employee_id, employee_code, national_id_masked, concept_code, date, quantity, unit, support_ref)
  select v_batch_id, v_site.country_code, v_site.id, r.row_number,
         -- Solo se aceptan empleados del mismo país.
         (select e.id from public.employees e where e.id = r.employee_id and e.country_code = v_site.country_code),
         r.employee_code, r.national_id_masked, r.concept_code, r.date, r.quantity, r.unit, r.support_ref
  from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as r(row_number int, employee_id uuid, employee_code text, national_id_masked text,
       concept_code text, date date, quantity numeric, unit text, support_ref text);

  insert into public.findings (batch_id, country_code, site_id, row_number, code, severity, owner, field, value, message)
  select v_batch_id, v_site.country_code, v_site.id, f.row_number, f.code, f.severity, f.owner, f.field, left(f.value, 200), left(f.message, 500)
  from jsonb_to_recordset(coalesce(p_findings, '[]'::jsonb)) as f(row_number int, code text, severity text, owner text, field text, value text, message text);

  v_disposition := private.compute_disposition(v_batch_id);
  update public.batches set disposition = v_disposition, initial_disposition = v_disposition where id = v_batch_id;

  perform private.write_audit('batch.submit', 'A', 'batches', v_batch_id::text,
    jsonb_build_object('site', v_site.code, 'period', v_period, 'rows', v_rows, 'findings', coalesce(jsonb_array_length(p_findings), 0), 'disposition', v_disposition, 'source', p_batch ->> 'source'));
  return v_batch_id;
end $$;

-- ---------- RPC: ciclo de vida de un hallazgo ----------
create or replace function public.update_finding_status(p_finding_id uuid, p_status text, p_note text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_f public.findings%rowtype;
  v_batch_status text;
  v_role text := private.user_role();
  v_disposition text;
begin
  select * into v_f from public.findings where id = p_finding_id for update;
  if not found or not private.has_site_access(v_f.site_id) then
    raise exception 'Hallazgo no encontrado';
  end if;
  select status into v_batch_status from public.batches where id = v_f.batch_id;
  if v_batch_status <> 'validated' then
    raise exception 'El lote ya fue decidido; no se pueden cambiar sus hallazgos';
  end if;
  if p_status not in ('open', 'in_correction', 'resolved', 'accepted') then
    raise exception 'Estado no válido';
  end if;
  if p_status in ('resolved', 'accepted') and length(trim(coalesce(p_note, ''))) < 10 then
    raise exception 'Escribe una justificación de al menos 10 caracteres';
  end if;
  if p_status = 'accepted' then
    if v_f.severity = 'blocking' then
      raise exception 'Un hallazgo bloqueante no se puede aceptar: debe corregirse';
    end if;
    if v_role <> 'central_analyst' then
      raise exception 'Solo el centro de operaciones acepta advertencias';
    end if;
  elsif v_role = 'site_supervisor' and v_f.owner <> 'site' then
    raise exception 'Este hallazgo lo corrige el centro de operaciones';
  elsif v_role = 'central_analyst' and v_f.owner <> 'central' and p_status = 'resolved' then
    raise exception 'Este hallazgo lo corrige la planta';
  elsif v_role not in ('site_supervisor', 'central_analyst') then
    raise exception 'Tu rol no gestiona hallazgos';
  end if;

  update public.findings
     set status = p_status,
         resolution_note = case when p_status = 'open' then null else coalesce(nullif(trim(p_note), ''), resolution_note) end,
         resolved_by = case when p_status in ('resolved', 'accepted') then auth.uid() end,
         resolved_at = case when p_status in ('resolved', 'accepted') then now() end
   where id = p_finding_id;

  v_disposition := private.compute_disposition(v_f.batch_id);
  update public.batches set disposition = v_disposition where id = v_f.batch_id;

  perform private.write_audit('finding.' || p_status, 'A', 'findings', p_finding_id::text,
    jsonb_build_object('batch_id', v_f.batch_id, 'code', v_f.code, 'from', v_f.status, 'note', left(p_note, 300)));
  return v_disposition;
end $$;

-- ---------- RPC: aprobar / rechazar lote (centro de operaciones) ----------
create or replace function public.approve_batch(p_batch_id uuid, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_b public.batches%rowtype;
  v_disposition text;
begin
  select * into v_b from public.batches where id = p_batch_id for update;
  if not found or private.user_role() <> 'central_analyst' or not private.has_country_access(v_b.country_code) then
    raise exception 'Solo un analista del país puede aprobar este lote';
  end if;
  if v_b.status <> 'validated' then
    raise exception 'El lote ya fue decidido';
  end if;
  v_disposition := private.compute_disposition(p_batch_id);
  if v_disposition = 'block' then
    raise exception 'El lote tiene hallazgos bloqueantes abiertos y no puede cargarse';
  end if;
  if v_disposition = 'load_with_warnings' then
    if length(trim(coalesce(p_note, ''))) < 15 then
      raise exception 'Cargar con advertencias exige una justificación de al menos 15 caracteres';
    end if;
    update public.findings set status = 'accepted', resolution_note = trim(p_note), resolved_by = auth.uid(), resolved_at = now()
     where batch_id = p_batch_id and severity = 'warning' and status in ('open', 'in_correction');
  end if;
  update public.batches
     set status = 'approved', approved_disposition = v_disposition, disposition = private.compute_disposition(p_batch_id),
         decision_note = nullif(trim(coalesce(p_note, '')), ''), decided_by = auth.uid(), decided_at = now()
   where id = p_batch_id;
  perform private.write_audit('batch.approve', 'A', 'batches', p_batch_id::text,
    jsonb_build_object('disposition', v_disposition, 'note', left(p_note, 300)));
end $$;

create or replace function public.reject_batch(p_batch_id uuid, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_b public.batches%rowtype;
begin
  select * into v_b from public.batches where id = p_batch_id for update;
  if not found or private.user_role() <> 'central_analyst' or not private.has_country_access(v_b.country_code) then
    raise exception 'Solo un analista del país puede rechazar este lote';
  end if;
  if v_b.status <> 'validated' then
    raise exception 'El lote ya fue decidido';
  end if;
  if length(trim(coalesce(p_note, ''))) < 10 then
    raise exception 'Indica el motivo del rechazo (al menos 10 caracteres)';
  end if;
  update public.batches set status = 'rejected', decision_note = trim(p_note), decided_by = auth.uid(), decided_at = now() where id = p_batch_id;
  perform private.write_audit('batch.reject', 'A', 'batches', p_batch_id::text, jsonb_build_object('note', left(p_note, 300)));
end $$;

-- ---------- RPC: exportación canónica (único lugar donde sale el RUT completo) ----------
create or replace function private.canonical_rows(p_batch_ids uuid[])
returns table (country_code text, site_code text, period text, employee_id text, national_id text, concept_code text,
               date date, quantity numeric, unit text, source_batch_id uuid, approved_by text, approved_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select b.country_code, s.code, b.period, r.employee_code, e.national_id, r.concept_code, r.date, r.quantity, r.unit,
         b.id, p.email, b.decided_at
  from public.batches b
  join public.sites s on s.id = b.site_id
  join public.batch_rows r on r.batch_id = b.id
  left join public.employees e on e.id = r.employee_id
  left join public.profiles p on p.id = b.decided_by
  where b.id = any(p_batch_ids)
  order by s.code, r.employee_code, r.date, r.concept_code
$$;
revoke execute on function private.canonical_rows from authenticated, public;

create or replace function public.export_batches(p_batch_ids uuid[])
returns table (export_id uuid, country_code text, site_code text, period text, employee_id text, national_id text, concept_code text,
               date date, quantity numeric, unit text, source_batch_id uuid, approved_by text, approved_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_export_id uuid;
  v_country text;
  v_period text;
  v_count int;
begin
  if private.user_role() <> 'central_analyst' or coalesce(array_length(p_batch_ids, 1), 0) = 0 then
    raise exception 'Solo un analista puede exportar lotes';
  end if;
  if exists (select 1 from public.batches b where b.id = any(p_batch_ids)
             and (b.status <> 'approved' or not private.has_country_access(b.country_code))) then
    raise exception 'Solo se exportan lotes aprobados de tus países';
  end if;
  if (select count(*) from public.batches b where b.id = any(p_batch_ids)) <> array_length(p_batch_ids, 1) then
    raise exception 'Algún lote no existe';
  end if;
  if (select count(distinct (b.country_code, b.period)) from public.batches b where b.id = any(p_batch_ids)) > 1 then
    raise exception 'Una exportación debe ser de un solo país y periodo';
  end if;
  select b.country_code, b.period into v_country, v_period from public.batches b where b.id = p_batch_ids[1];
  select count(*) into v_count from public.batch_rows r where r.batch_id = any(p_batch_ids);

  insert into public.exports (country_code, period, batch_ids, row_count, created_by)
  values (v_country, v_period, p_batch_ids, v_count, auth.uid()) returning id into v_export_id;
  update public.batches b set status = 'exported', export_id = v_export_id where b.id = any(p_batch_ids);
  perform private.write_audit('export.create', 'A', 'exports', v_export_id::text,
    jsonb_build_object('batches', to_jsonb(p_batch_ids), 'rows', v_count, 'country', v_country, 'period', v_period));

  return query select v_export_id, c.* from private.canonical_rows(p_batch_ids) c;
end $$;

create or replace function public.export_rows(p_export_id uuid)
returns table (export_id uuid, country_code text, site_code text, period text, employee_id text, national_id text, concept_code text,
               date date, quantity numeric, unit text, source_batch_id uuid, approved_by text, approved_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare v_x public.exports%rowtype;
begin
  select * into v_x from public.exports where id = p_export_id;
  if not found or private.user_role() <> 'central_analyst' or not private.has_country_access(v_x.country_code) then
    raise exception 'Exportación no encontrada';
  end if;
  perform private.write_audit('export.download', 'A', 'exports', p_export_id::text, jsonb_build_object('rows', v_x.row_count));
  return query select v_x.id, c.* from private.canonical_rows(v_x.batch_ids) c;
end $$;

revoke execute on function public.submit_batch, public.update_finding_status, public.approve_batch, public.reject_batch,
  public.export_batches, public.export_rows from anon;

-- ---------- Storage: bucket privado batch-files, ruta <país>/<planta>/<periodo>/<uuid>.<ext> ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('batch-files', 'batch-files', false, 10485760, null)
on conflict (id) do update set public = false, file_size_limit = 10485760;

create or replace function private.has_site_access_by_code(p_country text, p_site_code text, p_process text default 'novedades')
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.sites s where s.code = p_site_code and s.country_code = p_country
                 and private.has_site_access(s.id, p_process))
$$;
grant execute on function private.has_site_access_by_code to authenticated;

create policy "subir archivos a plantas asignadas" on storage.objects for insert to authenticated
  with check (bucket_id = 'batch-files'
    and private.user_role() in ('site_supervisor', 'central_analyst')
    and private.has_site_access_by_code((storage.foldername(name))[1], (storage.foldername(name))[2]));
create policy "leer archivos de plantas asignadas" on storage.objects for select to authenticated
  using (bucket_id = 'batch-files'
    and private.user_role() in ('site_supervisor', 'central_analyst')
    and private.has_site_access_by_code((storage.foldername(name))[1], (storage.foldername(name))[2]));
