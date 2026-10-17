-- 010 · Arreglos de la corrección de filas (revisión de código):
-- 1. get_batch_rows_editable deja de ser "stable": escribe en audit_log y una función stable corre en
--    modo solo lectura.
-- 2. batches.revision: número de versión del lote. correct_batch exige la versión que el usuario abrió;
--    si otra persona guardó antes, rechaza el cambio en vez de pisarlo.
-- 3. Una advertencia aceptada solo se conserva si su fila no se editó y el mensaje es idéntico
--    (mismos valores). Si el dato cambió, alguien debe volver a justificarla.
-- 4. Los lotes enviados antes de la migración 009 no guardaron el identificador completo:
--    no se pueden corregir en la app (se vuelve a subir el archivo).

alter table public.batches add column if not exists revision int not null default 0;

create or replace function public.get_batch_rows_editable(p_batch_id uuid, p_purpose text default 'edit')
returns table (row_number int, employee_id uuid, employee_code text, national_id text, national_id_masked text,
               concept_code text, date date, quantity numeric, unit text, support_ref text, edited boolean)
language plpgsql volatile security definer set search_path = '' as $$
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

-- La firma cambia (se agrega p_revision): se elimina la versión anterior para no dejar dos funciones.
drop function if exists public.correct_batch(uuid, jsonb, jsonb, text, jsonb);

create or replace function public.correct_batch(p_batch_id uuid, p_revision int, p_rows jsonb, p_findings jsonb, p_fingerprint text, p_edits jsonb)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_b public.batches%rowtype;
  v_accepted jsonb;
  v_edited int[];
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
  if v_b.revision <> p_revision then
    raise exception 'Otra persona corrigió este lote mientras lo editabas. Recarga la página y vuelve a aplicar tu cambio.';
  end if;
  if exists (select 1 from public.batch_rows r where r.batch_id = p_batch_id and r.national_id_input is null and r.national_id_masked is not null) then
    raise exception 'Este lote se envió antes de habilitar la corrección en la app. Descarga el archivo original, corrígelo y vuelve a subirlo.';
  end if;
  if v_rows = 0 or v_rows > 20000 then
    raise exception 'El lote debe tener entre 1 y 20.000 filas';
  end if;
  if v_rows <> v_b.row_count then
    raise exception 'La corrección no puede agregar ni quitar filas';
  end if;
  if coalesce(jsonb_array_length(p_edits), 0) = 0 then
    raise exception 'No hay cambios que guardar';
  end if;

  select coalesce(array_agg(distinct e.row_number), '{}') into v_edited
    from jsonb_to_recordset(p_edits) as e(row_number int);

  -- Solo se conservan aceptaciones de filas que no se editaron y cuyo mensaje (con sus valores) no cambió.
  select coalesce(jsonb_agg(jsonb_build_object('code', code, 'row_number', row_number, 'message', message, 'note', resolution_note,
                                               'accepted_by', resolved_by, 'accepted_at', resolved_at)), '[]'::jsonb)
    into v_accepted
    from public.findings
   where batch_id = p_batch_id and status = 'accepted' and severity = 'warning'
     and (row_number is null or not (row_number = any(v_edited)));

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
    from jsonb_to_recordset(v_accepted) as a(code text, row_number int, message text, note text, accepted_by uuid, accepted_at timestamptz)
   where f.batch_id = p_batch_id and f.severity = 'warning' and f.code = a.code
     and f.row_number is not distinct from a.row_number and f.message = left(a.message, 500);

  insert into public.batch_row_edits (batch_id, country_code, site_id, row_number, field, old_value, new_value)
  select p_batch_id, v_b.country_code, v_b.site_id, e.row_number, e.field, left(e.old_value, 200), left(e.new_value, 200)
  from jsonb_to_recordset(p_edits) as e(row_number int, field text, old_value text, new_value text);

  v_disposition := private.compute_disposition(p_batch_id);
  update public.batches
     set fingerprint = p_fingerprint, disposition = v_disposition, revision = revision + 1
   where id = p_batch_id;

  perform private.write_audit('batch.correct', 'A', 'batches', p_batch_id::text,
    jsonb_build_object('edits', p_edits, 'disposition', v_disposition, 'revision', v_b.revision + 1,
                       'findings', coalesce(jsonb_array_length(p_findings), 0)));
  return v_disposition;
end $$;

revoke execute on function public.get_batch_rows_editable, public.correct_batch from anon;
