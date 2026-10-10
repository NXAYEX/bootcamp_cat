-- 002 · Datos de referencia por país (conceptos, reglas legales con vigencia, reglas de validación,
-- alias de columnas, periodos, checklist de procedimientos) y maestro sintético de empleados.

create table public.concepts (
  id uuid primary key default gen_random_uuid(),
  country_code text not null references public.countries(code),
  code text not null,
  name text not null,
  unit text not null check (unit in ('hours', 'days')),
  category text not null check (category in ('overtime', 'vacation', 'absence', 'medical_leave', 'benefit')),
  requires_support boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (country_code, code)
);
alter table public.concepts enable row level security;

create table public.country_rules (
  id uuid primary key default gen_random_uuid(),
  country_code text not null references public.countries(code),
  rule_key text not null,
  value_numeric numeric,
  value_text text,
  unit text,
  description text not null,
  legal_reference text,
  procedure_keywords text[],
  valid_from date not null default '2000-01-01',
  valid_to date,
  created_at timestamptz not null default now(),
  check (valid_to is null or valid_to >= valid_from),
  check (value_numeric is not null or value_text is not null)
);
alter table public.country_rules enable row level security;
create index on public.country_rules (country_code, rule_key);

create table public.validation_rules (
  id uuid primary key default gen_random_uuid(),
  code text not null check (code ~ '^[A-Z]{3}-\d{3}$'),
  country_code text references public.countries(code),   -- null = aplica a todos los países
  name text not null,
  severity text not null check (severity in ('blocking', 'warning', 'info')),
  owner text not null check (owner in ('site', 'central')),
  message_template text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique nulls not distinct (code, country_code)
);
alter table public.validation_rules enable row level security;

create table public.column_aliases (
  id uuid primary key default gen_random_uuid(),
  country_code text references public.countries(code),
  field text not null check (field in ('national_id', 'employee_code', 'employee_name', 'concept_code', 'date', 'quantity', 'unit', 'support_ref', 'notes')),
  alias text not null,
  created_at timestamptz not null default now(),
  unique nulls not distinct (country_code, field, alias)
);
alter table public.column_aliases enable row level security;

create table public.payroll_periods (
  id uuid primary key default gen_random_uuid(),
  country_code text not null references public.countries(code),
  period text not null check (period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  status text not null default 'open' check (status in ('open', 'closed')),
  cutoff_date date,
  created_at timestamptz not null default now(),
  unique (country_code, period)
);
alter table public.payroll_periods enable row level security;

create table public.procedure_checklist_items (
  id uuid primary key default gen_random_uuid(),
  country_code text references public.countries(code),
  code text not null,
  title text not null,
  description text,
  weight numeric not null default 1 check (weight > 0),
  keywords text[] not null default '{}',
  min_hits_full int not null default 3,
  min_hits_partial int not null default 1,
  uses_country_rules boolean not null default false,
  question text,
  suggested_text text,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique nulls not distinct (country_code, code)
);
alter table public.procedure_checklist_items enable row level security;

-- Lectura para todo usuario autenticado; escritura solo admin. Todo cambio queda auditado.
do $$
declare t text;
begin
  foreach t in array array['concepts', 'country_rules', 'validation_rules', 'column_aliases', 'payroll_periods', 'procedure_checklist_items'] loop
    execute format('create policy "referencia visible para autenticados" on public.%I for select to authenticated using (true)', t);
    execute format('create policy "admin gestiona referencia" on public.%I for all to authenticated using (private.is_admin()) with check (private.is_admin())', t);
    execute format('create trigger audit_%s after insert or update or delete on public.%I for each row execute function private.audit_change()', t, t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- ---------- Maestro sintético de empleados (simula Workday) ----------
create table public.employees (
  id uuid primary key default gen_random_uuid(),
  country_code text not null references public.countries(code),
  site_id uuid not null references public.sites(id),
  employee_code text not null,
  national_id text not null,
  national_id_masked text generated always as (left(national_id, 2) || '.***.***-' || right(national_id, 1)) stored,
  first_name text not null,
  last_name text not null,
  hire_date date not null,
  termination_date date,
  leave_balance_days numeric not null default 0,
  weekly_hours numeric not null default 42,
  active boolean generated always as (termination_date is null) stored,
  created_at timestamptz not null default now(),
  unique (country_code, employee_code),
  unique (country_code, national_id)
);
alter table public.employees enable row level security;
create index on public.employees (site_id);

create policy "empleados de las plantas asignadas" on public.employees for select to authenticated
  using (private.user_role() in ('site_supervisor', 'central_analyst') and private.has_site_access(site_id));

-- Seguridad a nivel de columna: el identificador nacional completo NO es legible por la API.
revoke all on public.employees from anon, authenticated;
grant select (id, country_code, site_id, employee_code, national_id_masked, first_name, last_name, hire_date,
              termination_date, leave_balance_days, weekly_hours, active, created_at)
  on public.employees to authenticated;

create table public.employee_history (
  id uuid primary key default gen_random_uuid(),
  country_code text not null references public.countries(code),
  site_id uuid not null references public.sites(id),
  employee_id uuid not null references public.employees(id) on delete cascade,
  period text not null,
  category text not null,
  total numeric not null,
  created_at timestamptz not null default now()
);
alter table public.employee_history enable row level security;
create index on public.employee_history (employee_id);
create policy "historial de las plantas asignadas" on public.employee_history for select to authenticated
  using (private.user_role() in ('site_supervisor', 'central_analyst') and private.has_site_access(site_id));
revoke all on public.employee_history from anon;
revoke insert, update, delete on public.employee_history from authenticated;

-- Vista de directorio (RUT enmascarado). security_invoker: aplica el RLS de quien consulta.
create view public.employees_directory with (security_invoker = true) as
  select e.id, e.country_code, e.site_id, s.code as site_code, e.employee_code, e.national_id_masked,
         e.first_name, e.last_name, e.hire_date, e.termination_date, e.leave_balance_days, e.weekly_hours, e.active
  from public.employees e
  join public.sites s on s.id = e.site_id;

-- Estadísticas de historial para detectar valores atípicos (RNG-001 / RNG-002).
create view public.employee_history_stats with (security_invoker = true) as
  select e.employee_code, s.code as site_code, h.category,
         avg(h.total)::numeric(10,2) as mean, coalesce(stddev_samp(h.total), 0)::numeric(10,2) as sd, count(*)::int as n
  from public.employee_history h
  join public.employees e on e.id = h.employee_id
  join public.sites s on s.id = h.site_id
  group by e.employee_code, s.code, h.category;

create view public.site_history_stats with (security_invoker = true) as
  select site_code, category, avg(total)::numeric(10,2) as mean, coalesce(stddev_samp(total), 0)::numeric(10,2) as sd, count(*)::int as n
  from (
    select s.code as site_code, h.category, h.period, sum(h.total) as total
    from public.employee_history h join public.sites s on s.id = h.site_id
    group by s.code, h.category, h.period
  ) t
  group by site_code, category;

revoke all on public.employees_directory, public.employee_history_stats, public.site_history_stats from anon;

-- Cruce contra el maestro: devuelve solo los empleados cuyos RUT o códigos el usuario ya trae en su archivo.
-- El RUT completo solo se devuelve si el usuario lo envió (no revela RUT nuevos).
create or replace function public.match_employees(p_country_code text, p_national_ids text[], p_employee_codes text[])
returns table (id uuid, employee_code text, national_id text, site_code text, hire_date date,
               termination_date date, leave_balance_days numeric, weekly_hours numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  if private.user_role() not in ('site_supervisor', 'central_analyst')
     or not private.has_any_country_access(p_country_code) then
    raise exception 'Sin acceso al maestro de empleados de %', p_country_code;
  end if;
  if coalesce(array_length(p_national_ids, 1), 0) + coalesce(array_length(p_employee_codes, 1), 0) > 40000 then
    raise exception 'Demasiados identificadores en una consulta';
  end if;
  return query
    select e.id, e.employee_code,
           case when e.national_id = any(coalesce(p_national_ids, '{}')) then e.national_id end,
           s.code, e.hire_date, e.termination_date, e.leave_balance_days, e.weekly_hours
    from public.employees e
    join public.sites s on s.id = e.site_id
    where e.country_code = p_country_code
      and (e.national_id = any(coalesce(p_national_ids, '{}')) or e.employee_code = any(coalesce(p_employee_codes, '{}')));
end $$;
revoke execute on function public.match_employees from anon;
