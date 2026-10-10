-- 001 · Modelo de acceso: países, plantas, perfiles, accesos por usuario y registro de auditoría.
-- RLS activo en cada tabla en este mismo archivo. Solo admin cambia roles y accesos.

create extension if not exists pgcrypto;
create schema if not exists private;

-- ---------- Tablas ----------
create table public.countries (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z]{2}$'),
  name text not null,
  national_id_label text not null default 'Identificador',
  national_id_validator text not null default 'regex' check (national_id_validator in ('rut_mod11', 'regex')),
  national_id_regex text,
  timezone text not null default 'America/Santiago',
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.countries enable row level security;

create table public.sites (
  id uuid primary key default gen_random_uuid(),
  country_code text not null references public.countries(code),
  code text not null unique,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.sites enable row level security;
create index on public.sites (country_code);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role text check (role in ('site_supervisor', 'central_analyst', 'process_owner', 'admin')),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create table public.user_access (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  country_code text not null references public.countries(code),
  site_id uuid references public.sites(id),           -- null = todo el país
  process text not null default 'novedades' check (process in ('novedades', 'procedimientos')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique nulls not distinct (user_id, country_code, site_id, process)
);
alter table public.user_access enable row level security;
create index on public.user_access (user_id);

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  action text not null,
  module text,
  entity text,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.audit_log enable row level security;
create index on public.audit_log (created_at desc);

-- ---------- Funciones auxiliares (security definer en esquema no expuesto) ----------
-- Se usan en las políticas para no repetir lógica y para leer user_access sin caer en recursión de RLS.
create or replace function private.user_role()
returns text language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function private.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false)
$$;

create or replace function private.has_site_access(p_site_id uuid, p_process text default 'novedades')
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.user_access ua
    join public.sites s on s.id = p_site_id
    where ua.user_id = auth.uid()
      and ua.process = p_process
      and ua.country_code = s.country_code
      and (ua.site_id is null or ua.site_id = p_site_id)
  )
$$;

-- Acceso a TODO el país (fila sin planta). Lo tienen los analistas, no los supervisores.
create or replace function private.has_country_access(p_country_code text, p_process text default 'novedades')
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_access ua
    where ua.user_id = auth.uid()
      and ua.process = p_process
      and ua.country_code = p_country_code
      and ua.site_id is null
  )
$$;

-- Cualquier acceso en el país (incluye supervisores de una planta).
create or replace function private.has_any_country_access(p_country_code text, p_process text default 'novedades')
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_access ua
    where ua.user_id = auth.uid()
      and ua.process = p_process
      and ua.country_code = p_country_code
  )
$$;

create or replace function private.write_audit(p_action text, p_module text, p_entity text, p_entity_id text, p_details jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_log (user_id, action, module, entity, entity_id, details)
  values (auth.uid(), p_action, p_module, p_entity, p_entity_id, coalesce(p_details, '{}'::jsonb))
$$;

grant usage on schema private to authenticated;
grant execute on all functions in schema private to authenticated;

-- RPC pública para registrar lecturas sensibles y llamadas a IA (sin contenido sensible).
create or replace function public.log_event(p_action text, p_module text, p_entity text default null, p_entity_id text default null, p_details jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'Se requiere sesión';
  end if;
  if p_action !~ '^(read|ai|export|view)\.' then
    raise exception 'Acción de auditoría no permitida: %', p_action;
  end if;
  perform private.write_audit(p_action, p_module, p_entity, p_entity_id, p_details);
end $$;
revoke execute on function public.log_event from anon;

-- ---------- Perfil automático al crear un usuario (sin rol: no ve nada hasta que admin lo asigne) ----------
create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email) on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------- Auditoría automática de cambios de configuración y accesos ----------
create or replace function private.audit_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_row jsonb := to_jsonb(coalesce(new, old));
begin
  -- Nunca se copia el identificador nacional al registro de auditoría.
  v_row := v_row - 'national_id';
  insert into public.audit_log (user_id, action, module, entity, entity_id, details)
  values (auth.uid(), 'config.' || lower(tg_op), 'config', tg_table_name, v_row ->> 'id', jsonb_build_object('row', v_row));
  return coalesce(new, old);
end $$;

create trigger audit_profiles after insert or update or delete on public.profiles for each row execute function private.audit_change();
create trigger audit_user_access after insert or update or delete on public.user_access for each row execute function private.audit_change();
create trigger audit_countries after insert or update or delete on public.countries for each row execute function private.audit_change();
create trigger audit_sites after insert or update or delete on public.sites for each row execute function private.audit_change();

-- ---------- Políticas RLS ----------
create policy "países visibles para autenticados" on public.countries for select to authenticated using (true);
create policy "admin gestiona países" on public.countries for all to authenticated using (private.is_admin()) with check (private.is_admin());

create policy "plantas visibles para autenticados" on public.sites for select to authenticated using (true);
create policy "admin gestiona plantas" on public.sites for all to authenticated using (private.is_admin()) with check (private.is_admin());

create policy "cada usuario ve su perfil" on public.profiles for select to authenticated using (id = auth.uid() or private.is_admin());
create policy "solo admin edita perfiles" on public.profiles for update to authenticated using (private.is_admin()) with check (private.is_admin());

create policy "cada usuario ve sus accesos" on public.user_access for select to authenticated using (user_id = auth.uid() or private.is_admin());
create policy "solo admin crea accesos" on public.user_access for insert to authenticated with check (private.is_admin());
create policy "solo admin edita accesos" on public.user_access for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy "solo admin borra accesos" on public.user_access for delete to authenticated using (private.is_admin());

-- audit_log: solo admin lee; nadie inserta, edita ni borra directamente (solo funciones security definer).
create policy "admin lee auditoría" on public.audit_log for select to authenticated using (private.is_admin());
revoke insert, update, delete, truncate on public.audit_log from anon, authenticated;

-- anon no lee nada de este proyecto.
revoke all on public.countries, public.sites, public.profiles, public.user_access, public.audit_log from anon;
