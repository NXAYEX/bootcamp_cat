-- 007 · Métricas de calidad agregadas (sin datos personales) para /reportes.
-- Analista: solo sus países. Admin: agregados de cualquier país, sin acceso a las novedades individuales.

create or replace function public.quality_metrics(p_country text, p_period text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_result jsonb;
begin
  if not (private.is_admin() or (private.user_role() = 'central_analyst' and private.has_country_access(p_country))) then
    raise exception 'Sin acceso a las métricas de %', p_country;
  end if;

  with b as (
    select * from public.batches where country_code = p_country and (p_period is null or period = p_period)
  ), f as (
    select f.*, s.code as site_code, b.period from public.findings f join b on b.id = f.batch_id join public.sites s on s.id = f.site_id
  ), pf as (
    select pf.* from public.procedure_findings pf where pf.country_code = p_country
  )
  select jsonb_build_object(
    'batches', (select count(*) from b),
    'by_status', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) n from b group by status) t), '{}'),
    'by_initial_disposition', coalesce((select jsonb_object_agg(initial_disposition, n) from (select initial_disposition, count(*) n from b group by initial_disposition) t), '{}'),
    'loaded_without_intervention_pct', (select round(100.0 * count(*) filter (where initial_disposition = 'load' and status in ('approved', 'exported')) / nullif(count(*), 0), 1) from b),
    'avg_hours_to_decision', (select round(extract(epoch from avg(decided_at - created_at)) / 3600.0, 2) from b where decided_at is not null),
    'findings', (select count(*) from f),
    'findings_by_code', coalesce((select jsonb_agg(jsonb_build_object('code', code, 'severity', severity, 'n', n) order by n desc) from (select code, severity, count(*) n from f group by code, severity) t), '[]'),
    'findings_by_group', coalesce((select jsonb_object_agg(grp, n) from (select split_part(code, '-', 1) grp, count(*) n from f group by 1) t), '{}'),
    'findings_by_site', coalesce((select jsonb_agg(jsonb_build_object('site', site_code, 'blocking', bl, 'warning', wa, 'info', inf) order by site_code) from (
        select site_code, count(*) filter (where severity = 'blocking') bl, count(*) filter (where severity = 'warning') wa, count(*) filter (where severity = 'info') inf from f group by site_code) t), '[]'),
    'findings_by_period', coalesce((select jsonb_agg(jsonb_build_object('period', period, 'n', n) order by period) from (select period, count(*) n from f group by period) t), '[]'),
    'findings_by_status', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) n from f group by status) t), '{}'),
    'procedure_audits', (select count(*) from public.procedure_audits where country_code = p_country),
    'procedure_findings', (select count(*) from pf),
    'procedure_findings_with_quote_pct', (select round(100.0 * count(*) filter (where length(coalesce(evidence_quote, '')) > 0) / nullif(count(*) filter (where result <> 'no_encontrado'), 0), 1) from pf),
    'procedure_unsupported_findings', (select count(*) from pf where result <> 'no_encontrado' and length(coalesce(evidence_quote, '')) = 0),
    'procedure_reviewed', (select count(*) from pf where human_result is not null),
    'procedure_concordance_pct', (select round(100.0 * count(*) filter (where human_result = result) / nullif(count(*) filter (where human_result is not null), 0), 1) from pf)
  ) into v_result;

  return v_result;
end $$;
revoke execute on function public.quality_metrics from anon;
