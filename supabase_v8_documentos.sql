-- ============================================================================
-- MODUGAL · v8 · Fase 2 (parte 4): DOCUMENTOS REALES EN SUPABASE STORAGE
-- ----------------------------------------------------------------------------
-- Antes los adjuntos solo vivían en la memoria del navegador (se perdían al
-- recargar) y las carpetas "pública" y "privada" solo guardaban nombres.
--
-- 1. Dos buckets PRIVADOS (los archivos solo se abren con enlaces firmados
--    temporales, nunca con una URL pública):
--      documentos-proyecto     → planos, renders, contratos, fotos de avance
--      documentos-financieros  → cotizaciones, facturas (solo Gerencia)
-- 2. public.documentos: el registro de cada archivo (quién, cuándo, tipo...).
-- 3. Las referencias antiguas (solo nombre, sin archivo) se conservan como
--    "referencia sin archivo" para que nadie las pierda de vista.
-- Requiere v7. Publicar PRIMERO la app compatible y luego ejecutar esto.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. RESPALDO
-- ----------------------------------------------------------------------------
insert into public.respaldo_descripcion_venta (proyecto_id, codigo_prj, descripcion_venta, motivo)
select id, codigo_prj, descripcion_venta, 'v8 · antes de migrar documentos'
  from public.proyectos
 where not exists (select 1 from public.respaldo_descripcion_venta r
                    where r.motivo = 'v8 · antes de migrar documentos');


-- ----------------------------------------------------------------------------
-- 2. BUCKETS PRIVADOS (máx. 25 MB por archivo)
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('documentos-proyecto', 'documentos-proyecto', false, 26214400),
       ('documentos-financieros', 'documentos-financieros', false, 26214400)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit;

drop policy if exists "modugal_docs_proyecto_select" on storage.objects;
drop policy if exists "modugal_docs_proyecto_insert" on storage.objects;
drop policy if exists "modugal_docs_proyecto_delete" on storage.objects;
drop policy if exists "modugal_docs_financieros_all" on storage.objects;

-- Documentos del proyecto: los ve cualquier usuario aprobado
create policy "modugal_docs_proyecto_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'documentos-proyecto' and public.mi_rol() is not null);
create policy "modugal_docs_proyecto_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documentos-proyecto'
              and public.tiene_rol(array['administrativo', 'operativo', 'secretaria']));
create policy "modugal_docs_proyecto_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'documentos-proyecto' and public.tiene_rol(array['administrativo']));

-- Documentos financieros: todo exclusivamente Gerencia
create policy "modugal_docs_financieros_all" on storage.objects
  for all to authenticated
  using (bucket_id = 'documentos-financieros' and public.tiene_rol(array['administrativo']))
  with check (bucket_id = 'documentos-financieros' and public.tiene_rol(array['administrativo']));


-- ----------------------------------------------------------------------------
-- 3. TABLA documentos
-- ----------------------------------------------------------------------------
create table if not exists public.documentos (
  id           uuid primary key default gen_random_uuid(),
  proyecto_id  uuid not null references public.proyectos (id) on delete cascade,
  carpeta      text not null default 'proyecto' check (carpeta in ('proyecto', 'financiera')),
  categoria    text not null default 'Otro'
               check (categoria in ('Plano 2D', 'Render 3D', 'Contrato', 'Cotización', 'Factura',
                                    'Foto de avance', 'Acta de entrega', 'Otro')),
  nombre       text not null check (length(trim(nombre)) > 0),
  ruta         text unique,          -- ruta en Storage; null = referencia antigua sin archivo
  tipo_mime    text,
  tamano_bytes bigint check (tamano_bytes is null or tamano_bytes >= 0),
  notas        text,
  legacy_id    text,
  subido_por   uuid references auth.users (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  unique (proyecto_id, legacy_id),
  -- La carpeta y el bucket deben coincidir (un financiero nunca va al bucket general)
  check (ruta is null
         or (carpeta = 'proyecto'   and ruta like 'documentos-proyecto/%')
         or (carpeta = 'financiera' and ruta like 'documentos-financieros/%'))
);

create index if not exists documentos_proyecto_idx on public.documentos (proyecto_id, carpeta, created_at desc);

drop trigger if exists trg_historial on public.documentos;
create trigger trg_historial
  after insert or update or delete on public.documentos
  for each row execute function public.registrar_evento();

alter table public.documentos enable row level security;

drop policy if exists documentos_select on public.documentos;
drop policy if exists documentos_insert on public.documentos;
drop policy if exists documentos_update on public.documentos;
drop policy if exists documentos_delete on public.documentos;

create policy documentos_select on public.documentos
  for select to authenticated
  using (case carpeta when 'financiera' then public.tiene_rol(array['administrativo'])
                      else public.mi_rol() is not null end);
create policy documentos_insert on public.documentos
  for insert to authenticated
  with check (case carpeta when 'financiera' then public.tiene_rol(array['administrativo'])
                           else public.tiene_rol(array['administrativo', 'operativo', 'secretaria']) end);
create policy documentos_update on public.documentos
  for update to authenticated
  using (case carpeta when 'financiera' then public.tiene_rol(array['administrativo'])
                      else public.tiene_rol(array['administrativo', 'operativo', 'secretaria']) end)
  with check (case carpeta when 'financiera' then public.tiene_rol(array['administrativo'])
                           else public.tiene_rol(array['administrativo', 'operativo', 'secretaria']) end);
create policy documentos_delete on public.documentos
  for delete to authenticated using (public.tiene_rol(array['administrativo']));

-- Un documento no cambia de carpeta ni de archivo una vez registrado
-- (así un financiero nunca termina visible para otros roles por error).
create or replace function public.documento_inmutable()
returns trigger
language plpgsql
as $$
begin
  if new.carpeta is distinct from old.carpeta
     or (old.ruta is not null and new.ruta is distinct from old.ruta)
     or new.proyecto_id is distinct from old.proyecto_id then
    raise exception 'Un documento no puede cambiar de carpeta, proyecto ni archivo: súbelo de nuevo.';
  end if;
  return new;
end $$;

drop trigger if exists trg_documento_inmutable on public.documentos;
create trigger trg_documento_inmutable
  before update on public.documentos
  for each row execute function public.documento_inmutable();

-- Historial: operativo/secretaria ven los movimientos de documentos del
-- proyecto, nunca los de la carpeta financiera.
drop policy if exists historial_select on public.historial_eventos;
create policy historial_select on public.historial_eventos
  for select to authenticated
  using (
    public.tiene_rol(array['administrativo'])
    or (public.tiene_rol(array['operativo', 'secretaria'])
        and (tabla in ('proyectos', 'pendientes', 'tareas_carpintero', 'carpinteros',
                       'proyecto_muebles', 'compras', 'incidentes')
             or (tabla = 'documentos'
                 and (cambios -> 'carpeta' ->> 'despues' = 'proyecto'
                      or cambios -> 'carpeta' ->> 'antes' = 'proyecto'
                      or exists (select 1 from public.documentos d
                                  where d.id::text = historial_eventos.registro_id
                                    and d.carpeta = 'proyecto')))))
  );

do $$
begin
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'documentos') then
    alter publication supabase_realtime add table public.documentos;
  end if;
end $$;


-- ----------------------------------------------------------------------------
-- 4. MIGRACIÓN (una sola vez): referencias antiguas, sin archivo real
--    - archivos               (adjuntos que solo vivían en el navegador)
--    - dropboxFiles.publicFiles (carpeta pública)
--    - proyectos_finanzas.archivos_privados (carpeta privada financiera)
-- ----------------------------------------------------------------------------
do $$
declare
  insertados integer;
  faltantes  integer;
  detalle    text;
begin
  if exists (select 1 from public.migraciones_aplicadas where nombre = 'v8_documentos') then
    raise notice 'La migración de documentos ya se había aplicado: no se repite.';
    return;
  end if;

  with origen as (
    select p.id as proyecto_id, a.valor, 'proyecto' as carpeta, 'a:' || coalesce(a.valor ->> 'id', '') || '#' || a.ord as legacy_id
      from public.proyectos p
      cross join lateral jsonb_array_elements(
             case when jsonb_typeof(public.mg_json(p.descripcion_venta) -> 'archivos') = 'array'
                  then public.mg_json(p.descripcion_venta) -> 'archivos' else '[]'::jsonb end
           ) with ordinality as a(valor, ord)
    union all
    select p.id, f.valor, 'proyecto', 'pub:' || f.ord
      from public.proyectos p
      cross join lateral jsonb_array_elements(
             case when jsonb_typeof(public.mg_json(p.descripcion_venta) -> 'dropboxFiles' -> 'publicFiles') = 'array'
                  then public.mg_json(p.descripcion_venta) -> 'dropboxFiles' -> 'publicFiles' else '[]'::jsonb end
           ) with ordinality as f(valor, ord)
    union all
    select fz.proyecto_id, f.valor, 'financiera', 'priv:' || f.ord
      from public.proyectos_finanzas fz
      cross join lateral jsonb_array_elements(
             case when jsonb_typeof(fz.archivos_privados) = 'array' then fz.archivos_privados else '[]'::jsonb end
           ) with ordinality as f(valor, ord)
  )
  insert into public.documentos (proyecto_id, carpeta, categoria, nombre, ruta, notas, legacy_id, subido_por)
  select o.proyecto_id,
         o.carpeta,
         case when o.carpeta = 'financiera' then 'Cotización'
              when o.valor ->> 'tipo' = '3d' then 'Render 3D'
              when o.valor ->> 'tipo' in ('2d', 'image') then 'Plano 2D'
              else 'Otro' end,
         coalesce(nullif(trim(case jsonb_typeof(o.valor) when 'string' then o.valor #>> '{}' else o.valor ->> 'name' end), ''),
                  'Documento sin nombre'),
         null,
         'Referencia antigua: el archivo nunca se subió al servidor. Súbelo de nuevo o elimina esta referencia.',
         o.legacy_id,
         null
    from origen o
  on conflict (proyecto_id, legacy_id) do nothing;
  get diagnostics insertados = row_count;

  -- Verificación de conteos
  select count(*), string_agg(codigo_prj || ' (' || en_origen || ' / ' || en_tabla || ')', ', ')
    into faltantes, detalle
    from (
      select p.codigo_prj,
             coalesce(case when jsonb_typeof(public.mg_json(p.descripcion_venta) -> 'archivos') = 'array'
                           then jsonb_array_length(public.mg_json(p.descripcion_venta) -> 'archivos') end, 0)
           + coalesce(case when jsonb_typeof(public.mg_json(p.descripcion_venta) -> 'dropboxFiles' -> 'publicFiles') = 'array'
                           then jsonb_array_length(public.mg_json(p.descripcion_venta) -> 'dropboxFiles' -> 'publicFiles') end, 0)
           + coalesce((select case when jsonb_typeof(fz.archivos_privados) = 'array' then jsonb_array_length(fz.archivos_privados) end
                         from public.proyectos_finanzas fz where fz.proyecto_id = p.id), 0) as en_origen,
             (select count(*) from public.documentos d where d.proyecto_id = p.id and d.legacy_id is not null) as en_tabla
        from public.proyectos p
    ) x
   where en_tabla < en_origen;
  if faltantes > 0 then
    raise exception 'Migración incompleta, no se aplicó ningún cambio: %', detalle;
  end if;

  insert into public.migraciones_aplicadas (nombre, detalle)
  values ('v8_documentos', insertados || ' referencias antiguas registradas (sin archivo)');
end $$;

commit;


-- ----------------------------------------------------------------------------
-- 5. RESUMEN
-- ----------------------------------------------------------------------------
select 'buckets privados' as chequeo,
       (select string_agg(id || ' (público=' || public || ')', ', ') from storage.buckets
         where id in ('documentos-proyecto', 'documentos-financieros')) as resultado
union all
select 'documentos registrados', count(*)::text from public.documentos
union all
select 'referencias sin archivo', count(*)::text from public.documentos where ruta is null
union all
select 'migración', coalesce((select detalle from public.migraciones_aplicadas where nombre = 'v8_documentos'), 'NO APLICADA');
