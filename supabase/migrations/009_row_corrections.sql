-- 009 · Corrección de filas dentro de la app.
-- - batch_rows guarda el identificador tal como lo informó la planta (national_id_input) en una columna
--   que la API NO puede leer: solo lo devuelven las funciones de abajo, a quien ya tiene acceso al lote.
-- - batch_row_edits registra cada cambio (identificador siempre enmascarado).
-- - correct_batch reemplaza filas y hallazgos con el resultado de volver a validar, conservando las
--   advertencias ya aceptadas, y recalcula la disposición.
-- - Un hallazgo bloqueante ya no se "resuelve" a mano: desaparece cuando el dato se corrige.

alter table public.batch_rows add column if not exists national_id_input text;

-- Privilegio por columna: se quita el select general y se vuelve a conceder sin national_id_input.
revoke select on public.batch_rows from authenticated;
grant select (id, batch_id, country_code, site_id, row_number, employee_id, employee_code, national_id_masked,
              concept_code, date, quantity, unit, support_ref, created_at)
  on public.batch_rows to authenticated;

create table if not exists public.batch_row_edits (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.batches(id) on delete cascade,
  country_code text not null,
  site_id uuid not null,
  row_number int not null,
  field text not null,
  old_value text,
  new_value text,
  edited_by uuid not null references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.batch_row_edits enable row level security;
create index if not exists batch_row_edits_batch_idx on public.batch_row_edits (batch_id);
create policy "ediciones de las plantas asignadas" on public.batch_row_edits for select to authenticated
  using (private.user_role() in ('site_supervisor', 'central_analyst') and private.has_site_access(site_id));
revoke all on public.batch_row_edits from anon;
revoke insert, update, delete on public.batch_row_edits from authenticated;

-- ---------- submit_batch: ahora también guarda el identificador informado ----------
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
  if p_batch ->> 'file_path' is not null and (split_part(p_batch ->> 'file_path', '/', 1) <> v_site.country_code
     or split_part(p_batch ->> 'file_path', '/', 2) <> v_site.code) then
    raise exception 'La ruta del archivo no corresponde a la planta';
  end if;

  insert into public.batches (country_code, site_id, period, source, file_name, file_path, fingerprint, row_count, disposition, initial_disposition)
  values (v_site.country_code, v_site.id, v_period, p_batch ->> 'source', p_batch ->> 'file_name', p_batch ->> 'file_path',
          p_batch ->> 'fingerprint', v_rows, 'block', 'block')
  returning id into v_batch_id;

  insert into public.batch_rows (batch_id, country_code, site_id, row_number, employee_id, employee_code, national_id_masked, national_id_input,
                                 concept_code, date, quantity, unit, support_ref)
  select v_batch_id, v_site.country_code, v_site.id, r.row_number,
         (select e.id from public.employees e where e.id = r.employee_id and e.country_code = v_site.country_code),
         r.employee_code, r.national_id_masked, left(r.national_id, 40), r.concept_code, r.date, r.quantity, r.unit, r.support_ref
  from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as r(row_number int, employee_id uuid, employee_code text, national_id text,
       national_id_masked text, concept_code text, date date, quantity numeric, unit text, support_ref text);

  insert into public.findings (batch_id, country_code, site_id, row_number, code, severity, owner, field, value, message)
  select v_batch_id, v_site.country_code, v_site.id, f.row_number, f.code, f.severity, f.owner, f.field, left(f.value, 200), left(f.message, 500)
  from jsonb_to_recordset(coalesce(p_findings, '[]'::jsonb)) as f(row_number int, code text, severity text, owner text, field text, value text, message text);

  v_disposition := private.compute_disposition(v_batch_id);
  update public.batches set disposition = v_disposition, initial_disposition = v_disposition where id = v_batch_id;

  perform private.write_audit('batch.submit', 'A', 'batches', v_batch_id::text,
    jsonb_build_object('site', v_site.code, 'period', v_period, 'rows', v_rows, 'findings', coalesce(jsonb_array_length(p_findings), 0), 'disposition', v_disposition, 'source', p_batch ->> 'source'));
  return v_batch_id;
end $$;

-- ---------- Leer las filas con el identificador completo (solo quien tiene acceso al lote) ----------
create or replace function public.get_batch_rows_editable(p_batch_id uuid, p_purpose text default 'edit')
returns table (row_number int, employee_id uuid, employee_code text, national_id text, national_id_masked text,
               concept_code text, date date, quantity numeric, unit text, support_ref text, edited boolean)
language plpgsql stable security definer set search_path = '' as $$
declare v_b public.batches%rowtype;
begin
  select * into v_b from public.batches where id = p_batch_id;
  if not found or private.user_role() not in ('site_supervisor', 'central_analyst') or not private.has_site_access(v_b.site_id) then
    raise exception 'Lote no encontrado';
  end if;
  if p_purpose not in ('edit', 'download') then
    raise exception 'Propósito no válido';
  end if;
  perform private.write_audit(case when p_purpose = 'download' then 'export.corrected_file' else 'read.batch_rows_full' end,
                              'A', 'batches', p_batch_id::text, jsonb_build_object('rows', v_b.row_count));
  return query
    select r.row_number, r.employee_id, r.employee_code, r.national_id_input, r.national_id_masked, r.concept_code, r.date,
           r.quantity, r.unit, r.support_ref,
           exists (select 1 from public.batch_row_edits e where e.batch_id = r.batch_id and e.row_number = r.row_number)
    from public.batch_rows r
    where r.batch_id = p_batch_id
    order by r.row_number;
end $$;

-- ---------- Aplicar correcciones: reemplaza filas y hallazgos con el resultado de volver a validar ----------
create or replace function public.correct_batch(p_batch_id uuid, p_rows jsonb, p_findings jsonb, p_fingerprint text, p_edits jsonb)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_b public.batches%rowtype;
  v_accepted jsonb;
  v_disposition text;
  v_rows int := coalesce(jsonb_array_length(p_rows), 0);
begin
  select * into v_b from public.batches where id = p_batch_id for update;
  if not found or private.user_role() not in ('site_supervisor', 'central_analyst') or not private.has_site_access(v_b.site_id) then
    raise exception 'Lote no encontrado';
  end if;
  if v_b.status <> 'validated' then
    raise exception 'El lote ya fue decidido; no se puede corregir';
  end if;
  if v_rows = 0 or v_rows > 20000 then
    raise exception 'El lote debe tener entre 1 y 20.000 filas';
  end if;
  if coalesce(jsonb_array_length(p_edits), 0) = 0 then
    raise exception 'No hay cambios que guardar';
  end if;

  -- Las advertencias ya aceptadas con justificación se conservan si el mismo hallazgo vuelve a aparecer.
  select coalesce(jsonb_agg(jsonb_build_object('code', code, 'row_number', row_number, 'note', resolution_note,
                                               'accepted_by', resolved_by, 'accepted_at', resolved_at)), '[]'::jsonb)
    into v_accepted
    from public.findings where batch_id = p_batch_id and status = 'accepted' and severity = 'warning';

  delete from public.findings where batch_id = p_batch_id;
  delete from public.batch_rows where batch_id = p_batch_id;

  insert into public.batch_rows (batch_id, country_code, site_id, row_number, employee_id, employee_code, national_id_masked, national_id_input,
                                 concept_code, date, quantity, unit, support_ref)
  select p_batch_id, v_b.country_code, v_b.site_id, r.row_number,
         (select e.id from public.employees e where e.id = r.employee_id and e.country_code = v_b.country_code),
         r.employee_code, r.national_id_masked, left(r.national_id, 40), r.concept_code, r.date, r.quantity, r.unit, r.support_ref
  from jsonb_to_recordset(p_rows) as r(row_number int, employee_id uuid, employee_code text, national_id text,
       national_id_masked text, concept_code text, date date, quantity numeric, unit text, support_ref text);

  insert into public.findings (batch_id, country_code, site_id, row_number, code, severity, owner, field, value, message)
  select p_batch_id, v_b.country_code, v_b.site_id, f.row_number, f.code, f.severity, f.owner, f.field, left(f.value, 200), left(f.message, 500)
  from jsonb_to_recordset(coalesce(p_findings, '[]'::jsonb)) as f(row_number int, code text, severity text, owner text, field text, value text, message text);

  update public.findings f
     set status = 'accepted', resolution_note = a.note, resolved_by = a.accepted_by, resolved_at = a.accepted_at
    from jsonb_to_recordset(v_accepted) as a(code text, row_number int, note text, accepted_by uuid, accepted_at timestamptz)
   where f.batch_id = p_batch_id and f.severity = 'warning' and f.code = a.code and f.row_number is not distinct from a.row_number;

  insert into public.batch_row_edits (batch_id, country_code, site_id, row_number, field, old_value, new_value)
  select p_batch_id, v_b.country_code, v_b.site_id, e.row_number, e.field, left(e.old_value, 200), left(e.new_value, 200)
  from jsonb_to_recordset(p_edits) as e(row_number int, field text, old_value text, new_value text);

  v_disposition := private.compute_disposition(p_batch_id);
  update public.batches set row_count = v_rows, fingerprint = p_fingerprint, disposition = v_disposition where id = p_batch_id;

  perform private.write_audit('batch.correct', 'A', 'batches', p_batch_id::text,
    jsonb_build_object('edits', p_edits, 'disposition', v_disposition, 'findings', coalesce(jsonb_array_length(p_findings), 0)));
  return v_disposition;
end $$;

-- ---------- Un bloqueante no se "resuelve" a mano: se corrige el dato ----------
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
  if p_status = 'resolved' and v_f.severity = 'blocking' then
    raise exception 'Un hallazgo bloqueante se resuelve corrigiendo el dato en la pestaña Filas';
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

revoke execute on function public.submit_batch, public.get_batch_rows_editable, public.correct_batch, public.update_finding_status from anon;
