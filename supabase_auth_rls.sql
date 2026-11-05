-- ============================================================================
-- MODUGAL · Autenticación, aprobación de usuarios, RLS por rol y finanzas
-- ----------------------------------------------------------------------------
-- Ejecutar en Supabase > SQL Editor > New query > pegar todo > Run.
-- Es idempotente: se puede volver a ejecutar sin perder usuarios ni datos.
--
-- Roles (usuarios.rol) — solo cuentan si estado_aprobacion = 'aprobado':
--   administrativo = Gerencia            → todo, incluidas finanzas y usuarios
--   operativo      = Logística/Operativo → producción, asignaciones, pendientes
--   secretaria     = Secretaría          → prospectos, fichas, pendientes;
--                                          NO cambia fases ni asignaciones
--   arquitecto     = Arquitecto          → solo lectura
-- Sin sesión, o con cuenta pendiente/rechazada/suspendida → no ve nada.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0. TABLA usuarios (perfil ligado a auth.users)
-- ----------------------------------------------------------------------------
do $$
begin
  -- La tabla original (sin enlace a Auth) se recrea solo si está vacía.
  if to_regclass('public.usuarios') is not null
     and not exists (select 1 from information_schema.columns
                      where table_schema = 'public' and table_name = 'usuarios'
                        and column_name = 'cargo_solicitado') then
    if exists (select 1 from public.usuarios) then
      raise exception 'public.usuarios tiene datos sin migrar: revisa antes de continuar.';
    end if;
    execute 'drop table public.usuarios cascade';
  end if;
end $$;

create table if not exists public.usuarios (
  id                uuid primary key references auth.users (id) on delete cascade,
  email             text not null,
  nombre            text not null,
  rol               text not null default 'arquitecto'
                    check (rol in ('administrativo', 'operativo', 'secretaria', 'arquitecto')),
  cargo_solicitado  text
                    check (cargo_solicitado in ('administrativo', 'operativo', 'secretaria', 'arquitecto')),
  estado_aprobacion text not null default 'pendiente'
                    check (estado_aprobacion in ('pendiente', 'aprobado', 'rechazado', 'suspendido')),
  aprobado_por      uuid references auth.users (id) on delete set null,
  aprobado_en       timestamptz,
  created_at        timestamptz not null default now()
);

-- Por si una versión anterior de este script ya creó la tabla
alter table public.usuarios add column if not exists estado_aprobacion text not null default 'pendiente';
alter table public.usuarios add column if not exists aprobado_por uuid references auth.users (id) on delete set null;
alter table public.usuarios add column if not exists aprobado_en timestamptz;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'usuarios_estado_aprobacion_check') then
    alter table public.usuarios add constraint usuarios_estado_aprobacion_check
      check (estado_aprobacion in ('pendiente', 'aprobado', 'rechazado', 'suspendido'));
  end if;
end $$;


-- ----------------------------------------------------------------------------
-- 1. FUNCIONES DE APOYO (security definer: no quedan atrapadas en la RLS)
-- ----------------------------------------------------------------------------
create or replace function public.mi_rol()
returns text
language sql stable security definer set search_path = public
as $$
  select rol from public.usuarios
   where id = auth.uid() and estado_aprobacion = 'aprobado';
$$;

create or replace function public.tiene_rol(roles text[])
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select rol = any (roles) from public.usuarios
      where id = auth.uid() and estado_aprobacion = 'aprobado'),
    false
  );
$$;

revoke all on function public.mi_rol() from public, anon;
revoke all on function public.tiene_rol(text[]) from public, anon;
grant execute on function public.mi_rol() to authenticated;
grant execute on function public.tiene_rol(text[]) to authenticated;


-- ----------------------------------------------------------------------------
-- 2. PERFIL AUTOMÁTICO AL REGISTRARSE
--    signUp({ options: { data: { nombre, cargo } } }) dispara este trigger.
--    Toda cuenta nueva queda: rol 'arquitecto' + estado 'pendiente'.
--    El cargo elegido queda en cargo_solicitado para que Gerencia decida.
-- ----------------------------------------------------------------------------
create or replace function public.crear_perfil_usuario()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_cargo  text := coalesce(new.raw_user_meta_data ->> 'cargo', 'arquitecto');
  v_nombre text := nullif(trim(new.raw_user_meta_data ->> 'nombre'), '');
begin
  if v_cargo not in ('administrativo', 'operativo', 'secretaria', 'arquitecto') then
    v_cargo := 'arquitecto';
  end if;
  insert into public.usuarios (id, email, nombre, rol, cargo_solicitado, estado_aprobacion)
  values (new.id, new.email, coalesce(v_nombre, split_part(new.email, '@', 1)),
          'arquitecto', v_cargo, 'pendiente')
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.crear_perfil_usuario();

-- Sincronización forzada: cuentas que ya existían en auth.users sin perfil
insert into public.usuarios (id, email, nombre, rol, cargo_solicitado, estado_aprobacion)
select u.id,
       u.email,
       coalesce(nullif(trim(u.raw_user_meta_data ->> 'nombre'), ''), split_part(u.email, '@', 1)),
       'arquitecto',
       case when u.raw_user_meta_data ->> 'cargo' in ('administrativo', 'operativo', 'secretaria', 'arquitecto')
            then u.raw_user_meta_data ->> 'cargo' else 'arquitecto' end,
       'pendiente'
  from auth.users u
 where not exists (select 1 from public.usuarios p where p.id = u.id);


-- ----------------------------------------------------------------------------
-- 3. PROTECCIONES QUE LA RLS SOLA NO PUEDE EXPRESAR
-- ----------------------------------------------------------------------------

-- 3a. Solo Gerencia aprueba/cambia roles; nadie cambia su propio rol/estado
--     (evita que Gerencia se bloquee a sí misma). Desde el SQL Editor
--     auth.uid() es NULL y se permite todo.
create or replace function public.proteger_usuarios()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  cambia_acceso boolean :=
       new.rol               is distinct from old.rol
    or new.estado_aprobacion is distinct from old.estado_aprobacion
    or new.cargo_solicitado  is distinct from old.cargo_solicitado
    or new.email             is distinct from old.email
    or new.id                is distinct from old.id;
begin
  if auth.uid() is null or not cambia_acceso then
    return new;
  end if;
  if not public.tiene_rol(array['administrativo']) then
    raise exception 'Solo Gerencia puede aprobar usuarios o cambiar roles';
  end if;
  if old.id = auth.uid() then
    raise exception 'No puedes cambiar tu propio rol ni tu estado de acceso';
  end if;
  if new.estado_aprobacion is distinct from old.estado_aprobacion
     or new.rol is distinct from old.rol then
    new.aprobado_por := auth.uid();
    new.aprobado_en  := now();
  end if;
  return new;
end $$;

drop trigger if exists trg_proteger_usuarios on public.usuarios;
create trigger trg_proteger_usuarios
  before update on public.usuarios
  for each row execute function public.proteger_usuarios();

-- 3b. Secretaría no puede mover la fase de producción de un proyecto.
create or replace function public.proteger_fase_proyecto()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is not null
     and public.mi_rol() = 'secretaria'
     and new.fase_actual is distinct from old.fase_actual then
    raise exception 'Secretaría no puede cambiar la fase de producción';
  end if;
  return new;
end $$;

drop trigger if exists trg_proteger_fase_proyecto on public.proyectos;
create trigger trg_proteger_fase_proyecto
  before update on public.proyectos
  for each row execute function public.proteger_fase_proyecto();


-- ----------------------------------------------------------------------------
-- 4. FINANZAS AISLADAS (solo Gerencia)
--    Valores, costos y márgenes viven aquí, NO en proyectos.descripcion_venta.
-- ----------------------------------------------------------------------------
create table if not exists public.proyectos_finanzas (
  proyecto_id       uuid primary key references public.proyectos (id) on delete cascade,
  valor_venta       numeric(14, 2) not null default 0 check (valor_venta >= 0),
  costo_materiales  numeric(14, 2) not null default 0 check (costo_materiales >= 0),
  costo_mano_obra   numeric(14, 2) not null default 0 check (costo_mano_obra >= 0),
  otros_costos      numeric(14, 2) not null default 0 check (otros_costos >= 0),
  anticipo          numeric(14, 2) not null default 0 check (anticipo >= 0),
  utilidad          numeric(14, 2) generated always as
                    (valor_venta - costo_materiales - costo_mano_obra - otros_costos) stored,
  margen_pct        numeric(7, 2) generated always as
                    (case when valor_venta > 0
                          then round((valor_venta - costo_materiales - costo_mano_obra - otros_costos)
                                     / valor_venta * 100, 2)
                     end) stored,
  notas             text,
  archivos_privados jsonb not null default '[]'::jsonb,
  updated_at        timestamptz not null default now(),
  updated_by        uuid references auth.users (id) on delete set null default auth.uid()
);

create or replace function public.tocar_finanzas()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end $$;

drop trigger if exists trg_tocar_finanzas on public.proyectos_finanzas;
create trigger trg_tocar_finanzas
  before insert or update on public.proyectos_finanzas
  for each row execute function public.tocar_finanzas();

-- Migración: la "Carpeta Privada Financiera" que viajaba dentro del JSON
-- público (dropboxFiles.privateFiles) pasa a la tabla protegida y se quita
-- del JSON.
create or replace function public.mg_json(raw text)
returns jsonb
language plpgsql immutable
as $$
begin
  if raw is null or left(raw, 7) <> 'MGJSON:' then return null; end if;
  return substr(raw, 8)::jsonb;
exception when others then
  return null;
end $$;

insert into public.proyectos_finanzas (proyecto_id, archivos_privados)
select p.id, public.mg_json(p.descripcion_venta) -> 'dropboxFiles' -> 'privateFiles'
  from public.proyectos p
 where jsonb_typeof(public.mg_json(p.descripcion_venta) -> 'dropboxFiles' -> 'privateFiles') = 'array'
   and jsonb_array_length(public.mg_json(p.descripcion_venta) -> 'dropboxFiles' -> 'privateFiles') > 0
on conflict (proyecto_id) do update
  set archivos_privados = excluded.archivos_privados;

update public.proyectos p
   set descripcion_venta = 'MGJSON:' || (public.mg_json(p.descripcion_venta) #- '{dropboxFiles,privateFiles}')::text
 where public.mg_json(p.descripcion_venta) -> 'dropboxFiles' ? 'privateFiles';


-- ----------------------------------------------------------------------------
-- 5. ACTIVAR RLS Y BORRAR POLÍTICAS ANTERIORES
-- ----------------------------------------------------------------------------
alter table public.usuarios           enable row level security;
alter table public.proyectos          enable row level security;
alter table public.pendientes         enable row level security;
alter table public.carpinteros        enable row level security;
alter table public.tareas_carpintero  enable row level security;
alter table public.proyectos_finanzas enable row level security;

do $$
declare r record;
begin
  for r in
    select policyname, tablename from pg_policies
     where schemaname = 'public'
       and tablename in ('usuarios', 'proyectos', 'pendientes', 'carpinteros',
                         'tareas_carpintero', 'proyectos_finanzas')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;


-- ----------------------------------------------------------------------------
-- 6. POLÍTICAS (todas "to authenticated": la llave anon sola no pasa ninguna)
-- ----------------------------------------------------------------------------

-- usuarios: cada quien ve su fila; Gerencia ve y gestiona todas
create policy usuarios_select on public.usuarios
  for select to authenticated
  using (id = auth.uid() or public.tiene_rol(array['administrativo']));

create policy usuarios_update on public.usuarios
  for update to authenticated
  using (id = auth.uid() or public.tiene_rol(array['administrativo']))
  with check (id = auth.uid() or public.tiene_rol(array['administrativo']));

-- proyectos (incluye prospectos COM-xxx)
create policy proyectos_select on public.proyectos
  for select to authenticated using (public.mi_rol() is not null);
create policy proyectos_insert on public.proyectos
  for insert to authenticated
  with check (public.tiene_rol(array['administrativo', 'operativo', 'secretaria']));
create policy proyectos_update on public.proyectos
  for update to authenticated
  using (public.tiene_rol(array['administrativo', 'operativo', 'secretaria']))
  with check (public.tiene_rol(array['administrativo', 'operativo', 'secretaria']));
create policy proyectos_delete on public.proyectos
  for delete to authenticated using (public.tiene_rol(array['administrativo']));

-- pendientes
create policy pendientes_select on public.pendientes
  for select to authenticated using (public.mi_rol() is not null);
create policy pendientes_insert on public.pendientes
  for insert to authenticated
  with check (public.tiene_rol(array['administrativo', 'operativo', 'secretaria']));
create policy pendientes_update on public.pendientes
  for update to authenticated
  using (public.tiene_rol(array['administrativo', 'operativo', 'secretaria']))
  with check (public.tiene_rol(array['administrativo', 'operativo', 'secretaria']));
create policy pendientes_delete on public.pendientes
  for delete to authenticated using (public.tiene_rol(array['administrativo', 'operativo']));

-- carpinteros
create policy carpinteros_select on public.carpinteros
  for select to authenticated using (public.mi_rol() is not null);
create policy carpinteros_write on public.carpinteros
  for all to authenticated
  using (public.tiene_rol(array['administrativo', 'operativo']))
  with check (public.tiene_rol(array['administrativo', 'operativo']));

-- tareas_carpintero (asignaciones)
create policy tareas_select on public.tareas_carpintero
  for select to authenticated using (public.mi_rol() is not null);
create policy tareas_write on public.tareas_carpintero
  for all to authenticated
  using (public.tiene_rol(array['administrativo', 'operativo']))
  with check (public.tiene_rol(array['administrativo', 'operativo']));

-- proyectos_finanzas: exclusivamente Gerencia (leer y escribir)
create policy finanzas_gerencia on public.proyectos_finanzas
  for all to authenticated
  using (public.tiene_rol(array['administrativo']))
  with check (public.tiene_rol(array['administrativo']));


-- ----------------------------------------------------------------------------
-- 7. TIEMPO REAL (respeta la RLS: cada quien solo recibe lo que puede ver)
-- ----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['proyectos', 'pendientes', 'carpinteros', 'tareas_carpintero',
                           'usuarios', 'proyectos_finanzas']
  loop
    if not exists (select 1 from pg_publication_tables
                    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;


-- ----------------------------------------------------------------------------
-- 8. GERENCIA PRINCIPAL
-- ----------------------------------------------------------------------------
update public.usuarios
   set nombre = 'Nairo Viancha',
       rol = 'administrativo',
       estado_aprobacion = 'aprobado',
       aprobado_en = coalesce(aprobado_en, now())
 where lower(email) = 'nairovianchacortes@gmail.com';


-- ----------------------------------------------------------------------------
-- 9. COMPROBACIÓN
-- ----------------------------------------------------------------------------
select 'perfil gerencia' as chequeo,
       coalesce((select rol || ' / ' || estado_aprobacion from public.usuarios
                  where lower(email) = 'nairovianchacortes@gmail.com'), 'NO EXISTE en auth.users') as resultado
union all
select 'cuentas sin perfil', (select count(*)::text from auth.users u
                               where not exists (select 1 from public.usuarios p where p.id = u.id))
union all
select 'tablas con RLS', (select string_agg(tablename, ', ' order by tablename) from pg_tables
                           where schemaname = 'public' and rowsecurity
                             and tablename in ('usuarios', 'proyectos', 'pendientes', 'carpinteros',
                                               'tareas_carpintero', 'proyectos_finanzas'))
union all
select 'proyectos con finanzas privadas', (select count(*)::text from public.proyectos_finanzas);
