-- ============================================================================
-- MODUGAL · v13 · Endurecimiento de seguridad (auditoría nov 2026)
-- ----------------------------------------------------------------------------
-- H-03  Compras ↔ incidentes: un incidente solo puede ligarse a una compra del
--       MISMO proyecto, y solo Gerencia/Logística pueden cambiar ese vínculo.
-- H-04  Documentos: lista blanca de tipos de archivo en los buckets (sin HTML,
--       SVG ni ejecutables).
-- H-05  usuarios: nadie edita a mano quién lo aprobó ni cuándo; nombre ≤ 120.
-- H-08  Límites de tamaño en los textos (solo para datos nuevos: NOT VALID).
-- H-07  Funciones con search_path fijo (recomendación del linter de Supabase).
-- H-12  Defensa en profundidad: la llave pública (anon) no puede leer/escribir
--       tablas ni ejecutar funciones; toda tabla pública queda con RLS.
-- Se puede ejecutar antes o después del push y repetir sin problema.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- H-12a. RLS en TODAS las tablas públicas (las que no tengan políticas quedan
--        cerradas para la app, que es lo seguro por defecto)
-- ----------------------------------------------------------------------------
do $$
declare t record;
begin
  for t in
    select c.relname
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
  loop
    execute format('alter table public.%I enable row level security', t.relname);
    raise notice 'RLS activada en public.%', t.relname;
  end loop;
end $$;

-- H-12b. La llave anon no toca tablas, vistas ni funciones (la app siempre
--        trabaja con sesión iniciada; el registro usa Auth, no la API REST)
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
-- Las funciones se pueden ejecutar por "public" (todos) por defecto: se quita
-- a todos y se devuelve solo a los usuarios con sesión y a los roles internos.
revoke execute on all functions in schema public from public, anon;
grant  execute on all functions in schema public to authenticated, service_role;
alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from public, anon;
alter default privileges in schema public grant  execute on functions to authenticated, service_role;


-- ----------------------------------------------------------------------------
-- H-03. Vínculo compra ↔ incidente
-- ----------------------------------------------------------------------------
create or replace function public.validar_compra_incidente()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.compra_id is not null then
    if not exists (select 1 from public.compras c
                    where c.id = new.compra_id and c.proyecto_id = new.proyecto_id) then
      raise exception 'La compra ligada no pertenece a este proyecto.' using errcode = '23514';
    end if;
  end if;
  if auth.uid() is not null
     and (tg_op = 'INSERT' and new.compra_id is not null
          or tg_op = 'UPDATE' and new.compra_id is distinct from old.compra_id)
     and not public.tiene_rol(array['administrativo', 'operativo']) then
    raise exception 'Solo Gerencia o Logística pueden ligar un incidente a una compra.' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists trg_validar_compra_incidente on public.incidentes;
create trigger trg_validar_compra_incidente
  before insert or update on public.incidentes
  for each row execute function public.validar_compra_incidente();


-- ----------------------------------------------------------------------------
-- H-04. Tipos de archivo permitidos en los buckets de documentos
-- ----------------------------------------------------------------------------
update storage.buckets
   set allowed_mime_types = array[
         'application/pdf', 'image/png', 'image/jpeg', 'image/webp',
         'application/octet-stream', 'model/gltf-binary', 'model/gltf+json',
         'application/zip', 'application/vnd.rar', 'application/x-rar-compressed',
         'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
         'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
         'text/csv'],
       file_size_limit = 26214400
 where id in ('documentos-proyecto', 'documentos-financieros');

-- La tabla tampoco acepta tipos peligrosos aunque alguien llame la API directo
alter table public.documentos drop constraint if exists documentos_tipo_mime_check;
alter table public.documentos add constraint documentos_tipo_mime_check
  check (tipo_mime is null or tipo_mime !~* '(html|svg|xml|javascript|ecmascript|x-sh|x-msdownload)') not valid;


-- ----------------------------------------------------------------------------
-- H-05. usuarios: aprobado_por / aprobado_en solo los pone la base
-- ----------------------------------------------------------------------------
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
  if auth.uid() is null then
    return new;                      -- SQL Editor (administrador de la base)
  end if;
  -- Nadie escribe estos dos campos a mano
  new.aprobado_por := old.aprobado_por;
  new.aprobado_en  := old.aprobado_en;
  if not cambia_acceso then
    return new;
  end if;
  if not public.tiene_rol(array['administrativo']) then
    raise exception 'Solo Gerencia puede aprobar usuarios o cambiar roles' using errcode = '42501';
  end if;
  if old.id = auth.uid() then
    raise exception 'No puedes cambiar tu propio rol ni tu estado de acceso' using errcode = '42501';
  end if;
  if new.estado_aprobacion is distinct from old.estado_aprobacion or new.rol is distinct from old.rol then
    new.aprobado_por := auth.uid();
    new.aprobado_en  := now();
  end if;
  return new;
end $$;


-- ----------------------------------------------------------------------------
-- H-08. Límites de tamaño (NOT VALID: no revisa lo que ya existe, sí lo nuevo)
-- ----------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('usuarios',          'nombre',             120),
      ('proyectos',         'codigo_prj',          40),
      ('proyectos',         'cliente',            200),
      ('proyectos',         'ciudad',             120),
      ('proyectos',         'trazador_responsable', 200),
      ('proyectos',         'motivo_rechazo',    2000),
      ('proyectos',         'descripcion_venta', 1000000),
      ('proyectos',         'imagen_url',        2048),
      ('pendientes',        'descripcion',       1000),
      ('carpinteros',       'nombre',             120),
      ('tareas_carpintero', 'nombre_mueble',      300),
      ('tareas_carpintero', 'detalle',           1000),
      ('proyecto_muebles',  'nombre',             300),
      ('proyecto_muebles',  'detalle',           1000),
      ('compras',           'material',           300),
      ('compras',           'proveedor',          200),
      ('compras',           'numero_guia',        100),
      ('compras',           'notas',             2000),
      ('incidentes',        'descripcion',       2000),
      ('incidentes',        'accion',            2000),
      ('incidentes',        'responsable',        200),
      ('incidentes',        'solucion',          2000),
      ('documentos',        'nombre',             255),
      ('documentos',        'notas',              500)
    ) as t(tabla, columna, maximo)
  loop
    if exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = r.tabla and column_name = r.columna) then
      execute format('alter table public.%I drop constraint if exists %I', r.tabla, r.tabla || '_' || r.columna || '_largo');
      execute format('alter table public.%I add constraint %I check (char_length(%I) <= %s) not valid',
                     r.tabla, r.tabla || '_' || r.columna || '_largo', r.columna, r.maximo);
    end if;
  end loop;
end $$;


-- ----------------------------------------------------------------------------
-- H-07. search_path fijo en las funciones propias del esquema public
-- ----------------------------------------------------------------------------
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as firma
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
       and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
  loop
    execute format('alter function %s set search_path = public, pg_temp', f.firma);
  end loop;
end $$;

commit;


-- ----------------------------------------------------------------------------
-- RESUMEN
-- ----------------------------------------------------------------------------
select 'tablas públicas sin RLS' as chequeo,
       coalesce((select string_agg(c.relname, ', ') from pg_class c join pg_namespace n on n.oid = c.relnamespace
                  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity), 'ninguna') as resultado
union all
select 'tablas que anon puede leer',
       coalesce((select string_agg(distinct table_name, ', ') from information_schema.role_table_grants
                  where grantee = 'anon' and table_schema = 'public'), 'ninguna')
union all
select 'funciones sin search_path fijo',
       (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.prokind = 'f'
           and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
           and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%'))
union all
select 'tipos permitidos en documentos',
       (select count(*)::text || ' tipos' from storage.buckets, unnest(allowed_mime_types)
         where id = 'documentos-proyecto');
