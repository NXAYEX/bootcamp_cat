-- Usuarios de prueba: asigna rol y accesos a usuarios YA creados en Supabase > Authentication > Users.
-- Ejecutar después de las migraciones 001 a 008. Es idempotente: se puede ejecutar más de una vez.
-- No contiene contraseñas: se definen al crear cada usuario en el panel.

insert into public.profiles (id, email)
select id, email from auth.users
where email in ('admin@validador.test', 'sup.stg@validador.test', 'sup.anf@validador.test',
                'analista.cl@validador.test', 'analista.vd@validador.test', 'proceso.cl@validador.test')
on conflict (id) do nothing;

update public.profiles p set role = v.role, full_name = v.full_name
from (values
  ('admin@validador.test', 'admin', 'Administración del validador'),
  ('sup.stg@validador.test', 'site_supervisor', 'Supervisión Planta Santiago'),
  ('sup.anf@validador.test', 'site_supervisor', 'Supervisión Planta Antofagasta'),
  ('analista.cl@validador.test', 'central_analyst', 'Analista centro de operaciones · Chile'),
  ('analista.vd@validador.test', 'central_analyst', 'Analista centro de operaciones · Valdoria'),
  ('proceso.cl@validador.test', 'process_owner', 'Dueño de proceso · Chile')
) as v(email, role, full_name)
where p.email = v.email;

-- Accesos: país + planta (null = todo el país) + proceso.
insert into public.user_access (user_id, country_code, site_id, process)
select u.id, v.country_code, s.id, v.process
from (values
  ('sup.stg@validador.test', 'CL', 'CL-STG', 'novedades'),
  ('sup.anf@validador.test', 'CL', 'CL-ANF', 'novedades'),
  ('analista.cl@validador.test', 'CL', null, 'novedades'),
  ('analista.cl@validador.test', 'CL', null, 'procedimientos'),
  ('analista.vd@validador.test', 'VD', null, 'novedades'),
  ('analista.vd@validador.test', 'VD', null, 'procedimientos'),
  ('proceso.cl@validador.test', 'CL', null, 'procedimientos')
) as v(email, country_code, site_code, process)
join auth.users u on u.email = v.email
left join public.sites s on s.code = v.site_code
on conflict do nothing;

-- Verificación: debe listar 6 usuarios con su rol y 7 accesos.
select p.email, p.role, ua.country_code, s.code as site, ua.process
from public.profiles p
left join public.user_access ua on ua.user_id = p.id
left join public.sites s on s.id = ua.site_id
where p.email like '%@validador.test'
order by p.email, ua.process;
