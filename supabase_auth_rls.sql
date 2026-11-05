-- ============================================================================
-- MODUGAL · Autenticación real + seguridad por rol (RLS)
-- ----------------------------------------------------------------------------
-- Ejecutar en Supabase > SQL Editor > New query > pegar todo > Run.
-- Se puede volver a ejecutar sin problema: no borra usuarios ya creados.
--
-- Roles (columna usuarios.rol):
--   administrativo = Gerencia            → todo
--   operativo      = Logística/Operativo → producción, asignaciones, pendientes
--   secretaria     = Secretaría          → prospectos, fichas, pendientes;
--                                          NO cambia fases ni asignaciones
--   arquitecto     = Arquitecto          → solo lectura
-- Sin sesión (llave anon/publishable sola) → no ve ni modifica nada.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0. TABLA usuarios (perfil ligado a auth.users)
--    La tabla actual está vacía y no está ligada a Supabase Auth, así que se
--    recrea. Si ya fue migrada se conserva; si tiene datos sin migrar, el
--    script se detiene para no borrar nada.
-- ----------------------------------------------------------------------------
do $$
begin
  -- Ya migrada en una ejecución anterior: se conserva tal cual.
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'usuarios'
                and column_name = 'cargo_solicitado') then
    raise notice 'public.usuarios ya está ligada a Auth: se conserva.';
    return;
  end if;

  if to_regclass('public.usuarios') is not null then
    if exists (select 1 from public.usuarios) then
      raise exception 'public.usuarios tiene datos: revisa antes de recrearla.';
    end if;
    execute 'drop table public.usuarios cascade';
  end if;

  execute $ddl$
    create table public.usuarios (
      id               uuid primary key references auth.users (id) on delete cascade,
      email            text not null,
      nombre           text not null,
      rol              text not null default 'arquitecto'
                       check (rol in ('administrativo', 'operativo', 'secretaria', 'arquitecto')),
      cargo_solicitado text
                       check (cargo_solicitado in ('administrativo', 'operativo', 'secretaria', 'arquitecto')),
      activo           boolean not null default true,
      created_at       timestamptz not null default now()
    )
  $ddl$;
end $$;


-- ----------------------------------------------------------------------------
-- 1. FUNCIONES DE APOYO
--    security definer: leen usuarios sin quedar atrapadas en su propia RLS.
-- ----------------------------------------------------------------------------
create or replace function public.mi_rol()
returns text
language sql stable security definer set search_path = public
as $$
  select rol from public.usuarios where id = auth.uid() and activo;
$$;

create or replace function public.tiene_rol(roles text[])
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select rol = any (roles) from public.usuarios where id = auth.uid() and activo),
    false
  );
$$;

revoke all on function public.mi_rol() from public, anon;
revoke all on function public.tiene_rol(text[]) from public, anon;
grant execute on function public.mi_rol() to authenticated;
grant execute on function public.tiene_rol(text[]) to authenticated;


-- ----------------------------------------------------------------------------
-- 2. PERFIL AUTOMÁTICO AL REGISTRARSE
--    signUp({ options: { data: { nombre, cargo } } }) llega aquí.
--    El cargo elegido se guarda como "solicitado"; el rol real empieza como
--    arquitecto (solo lectura) hasta que Gerencia lo apruebe. Así nadie se
--    puede auto-asignar Gerencia desde la pantalla de registro.
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
  insert into public.usuarios (id, email, nombre, rol, cargo_solicitado)
  values (new.id, new.email, coalesce(v_nombre, split_part(new.email, '@', 1)), 'arquitecto', v_cargo)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.crear_perfil_usuario();


-- ----------------------------------------------------------------------------
-- 3. PROTECCIONES EXTRA (lo que una política RLS no puede expresar)
-- ----------------------------------------------------------------------------

-- 3a. Solo Gerencia cambia rol / activo / email de un usuario.
--     (Desde el SQL Editor auth.uid() es NULL y se permite: así apruebas
--     el primer administrador.)
create or replace function public.proteger_usuarios()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if not public.tiene_rol(array['administrativo']) and (
       new.rol    is distinct from old.rol or
       new.activo is distinct from old.activo or
       new.email  is distinct from old.email or
       new.id     is distinct from old.id or
       new.cargo_solicitado is distinct from old.cargo_solicitado
     ) then
    raise exception 'Solo Gerencia puede cambiar roles o el estado de una cuenta';
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
-- 4. ACTIVAR RLS Y BORRAR POLÍTICAS ANTERIORES
-- ----------------------------------------------------------------------------
alter table public.usuarios          enable row level security;
alter table public.proyectos         enable row level security;
alter table public.pendientes        enable row level security;
alter table public.carpinteros       enable row level security;
alter table public.tareas_carpintero enable row level security;

do $$
declare r record;
begin
  for r in
    select policyname, tablename from pg_policies
    where schemaname = 'public'
      and tablename in ('usuarios', 'proyectos', 'pendientes', 'carpinteros', 'tareas_carpintero')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;


-- ----------------------------------------------------------------------------
-- 5. POLÍTICAS POR TABLA
--    Todas son "to authenticated": la llave anon sin sesión no pasa ninguna.
-- ----------------------------------------------------------------------------

-- usuarios ---------------------------------------------------------------
create policy usuarios_select on public.usuarios
  for select to authenticated
  using (id = auth.uid() or public.tiene_rol(array['administrativo']));

create policy usuarios_update on public.usuarios
  for update to authenticated
  using (id = auth.uid() or public.tiene_rol(array['administrativo']))
  with check (id = auth.uid() or public.tiene_rol(array['administrativo']));
-- (insert lo hace el trigger; delete ocurre al borrar el usuario en Auth)

-- proyectos (incluye prospectos COM-xxx) ---------------------------------
create policy proyectos_select on public.proyectos
  for select to authenticated
  using (public.mi_rol() is not null);

create policy proyectos_insert on public.proyectos
  for insert to authenticated
  with check (public.tiene_rol(array['administrativo', 'operativo', 'secretaria']));

create policy proyectos_update on public.proyectos
  for update to authenticated
  using (public.tiene_rol(array['administrativo', 'operativo', 'secretaria']))
  with check (public.tiene_rol(array['administrativo', 'operativo', 'secretaria']));

create policy proyectos_delete on public.proyectos
  for delete to authenticated
  using (public.tiene_rol(array['administrativo']));

-- pendientes ---------------------------------------------------------------
create policy pendientes_select on public.pendientes
  for select to authenticated
  using (public.mi_rol() is not null);

create policy pendientes_insert on public.pendientes
  for insert to authenticated
  with check (public.tiene_rol(array['administrativo', 'operativo', 'secretaria']));

create policy pendientes_update on public.pendientes
  for update to authenticated
  using (public.tiene_rol(array['administrativo', 'operativo', 'secretaria']))
  with check (public.tiene_rol(array['administrativo', 'operativo', 'secretaria']));

create policy pendientes_delete on public.pendientes
  for delete to authenticated
  using (public.tiene_rol(array['administrativo', 'operativo']));

-- carpinteros ---------------------------------------------------------------
create policy carpinteros_select on public.carpinteros
  for select to authenticated
  using (public.mi_rol() is not null);

create policy carpinteros_write on public.carpinteros
  for all to authenticated
  using (public.tiene_rol(array['administrativo', 'operativo']))
  with check (public.tiene_rol(array['administrativo', 'operativo']));

-- tareas_carpintero (asignaciones) ----------------------------------------
create policy tareas_select on public.tareas_carpintero
  for select to authenticated
  using (public.mi_rol() is not null);

create policy tareas_write on public.tareas_carpintero
  for all to authenticated
  using (public.tiene_rol(array['administrativo', 'operativo']))
  with check (public.tiene_rol(array['administrativo', 'operativo']));


-- ----------------------------------------------------------------------------
-- 6. LIMPIEZA DE DATOS DE PRUEBA
--    - PRJ-006 "Cliente QA Supabase" (con sus pendientes y tareas, incluida
--      la tarea "TRAZADO" de TEOFILO GUTIERREZ y "Mueble QA Reasignado")
--    - "QA Carpintero"
--    - COM-005 y COM-006: tarjetas de prospecto ya aprobadas que duplicaban
--      a Dr. Fernando López (PRJ-008) y Camila Reyes (PRJ-007). Se conservan
--      los proyectos PRJ-007/PRJ-008, que son los que tienen los pendientes.
-- ----------------------------------------------------------------------------
begin;

delete from public.tareas_carpintero
 where proyecto_id in (select id from public.proyectos where codigo_prj in ('PRJ-006', 'COM-005', 'COM-006'))
    or carpintero_id in (select id from public.carpinteros where nombre = 'QA Carpintero');

delete from public.pendientes
 where proyecto_id in (select id from public.proyectos where codigo_prj in ('PRJ-006', 'COM-005', 'COM-006'));

delete from public.proyectos  where codigo_prj in ('PRJ-006', 'COM-005', 'COM-006');
delete from public.carpinteros where nombre = 'QA Carpintero';

commit;


-- ----------------------------------------------------------------------------
-- 7. COMPROBACIÓN
-- ----------------------------------------------------------------------------
select tablename, rowsecurity as rls_activo
  from pg_tables
 where schemaname = 'public'
   and tablename in ('usuarios', 'proyectos', 'pendientes', 'carpinteros', 'tareas_carpintero');


-- ============================================================================
-- DESPUÉS DE REGISTRARTE EN LA APP (paso manual, una sola vez):
-- conviértete en Gerencia cambiando el correo y ejecutando solo esta línea.
--
--   update public.usuarios set rol = 'administrativo' where email = 'TU_CORREO@AQUI.com';
--
-- Para aprobar a otra persona (o hacerlo luego desde Table Editor > usuarios):
--   update public.usuarios set rol = cargo_solicitado where email = 'persona@correo.com';
-- ============================================================================
