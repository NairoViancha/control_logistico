-- ============================================================================
-- MODUGAL · v3 · Personal de planta, actividades de tareas, instalación con
-- líder e imágenes de proyectos (Supabase Storage)
-- ----------------------------------------------------------------------------
-- Requiere haber ejecutado antes supabase_auth_rls.sql (usa tiene_rol/mi_rol).
-- Idempotente: se puede ejecutar varias veces.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. PERSONAL DE PLANTA (tabla carpinteros)
--    Solo Gerencia registra, edita o desactiva personal. Los demás roles
--    únicamente pueden escoger personal ya registrado.
-- ----------------------------------------------------------------------------
alter table public.carpinteros add column if not exists activo boolean not null default true;

-- Cargos válidos: los antiguos ("OPERARIO DE PLANTA", vacío...) pasan a Carpintero
update public.carpinteros
   set cargo = 'Carpintero'
 where cargo is null or cargo not in ('Carpintero', 'Auxiliar de carpintería', 'Eléctrico');

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'carpinteros_cargo_check') then
    alter table public.carpinteros add constraint carpinteros_cargo_check
      check (cargo in ('Carpintero', 'Auxiliar de carpintería', 'Eléctrico'));
  end if;
end $$;

alter table public.carpinteros alter column cargo set default 'Carpintero';

drop policy if exists carpinteros_write on public.carpinteros;
drop policy if exists carpinteros_insert on public.carpinteros;
drop policy if exists carpinteros_update on public.carpinteros;
drop policy if exists carpinteros_delete on public.carpinteros;

create policy carpinteros_insert on public.carpinteros
  for insert to authenticated with check (public.tiene_rol(array['administrativo']));
create policy carpinteros_update on public.carpinteros
  for update to authenticated
  using (public.tiene_rol(array['administrativo']))
  with check (public.tiene_rol(array['administrativo']));
create policy carpinteros_delete on public.carpinteros
  for delete to authenticated using (public.tiene_rol(array['administrativo']));


-- ----------------------------------------------------------------------------
-- 2. TAREAS: actividad + detalle en lugar de "fase manual"
--    Actividades: Trazando, Escogiendo material, Armando, Añadiendo luces,
--    Embalaje, Instalación, Otra. Las instalaciones agrupan a varias personas
--    (grupo_id) y una de ellas es la líder (es_lider).
-- ----------------------------------------------------------------------------
alter table public.tareas_carpintero add column if not exists actividad text;
alter table public.tareas_carpintero add column if not exists detalle   text;
alter table public.tareas_carpintero add column if not exists grupo_id  uuid;
alter table public.tareas_carpintero add column if not exists es_lider  boolean not null default false;

-- Migración de las tareas existentes según su fase / descripción
update public.tareas_carpintero
   set actividad = case
         when nombre_mueble ilike 'traz%'    then 'Trazando'
         when fase_manual = 'Armado'         then 'Armando'
         when fase_manual = 'Embalaje'       then 'Embalaje'
         when fase_manual = 'Presentación'   then 'Añadiendo luces'
         else 'Otra'
       end
 where actividad is null;

alter table public.tareas_carpintero alter column actividad set default 'Otra';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tareas_actividad_check') then
    alter table public.tareas_carpintero add constraint tareas_actividad_check
      check (actividad in ('Trazando', 'Escogiendo material', 'Armando', 'Añadiendo luces',
                           'Embalaje', 'Instalación', 'Otra'));
  end if;
end $$;

-- fase_manual deja de usarse: se vuelve opcional
alter table public.tareas_carpintero alter column fase_manual drop not null;

create index if not exists tareas_carpintero_grupo_idx on public.tareas_carpintero (grupo_id);


-- ----------------------------------------------------------------------------
-- 3. IMÁGENES DE PROYECTOS (Supabase Storage)
--    Bucket público de lectura (las fotos se muestran con su URL, que lleva
--    un nombre aleatorio). Solo suben/cambian imágenes Gerencia, Logística
--    y Secretaría. Máximo 5 MB; JPG, PNG o WEBP.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('proyectos-imagenes', 'proyectos-imagenes', true, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "modugal_imagenes_insert" on storage.objects;
drop policy if exists "modugal_imagenes_update" on storage.objects;
drop policy if exists "modugal_imagenes_delete" on storage.objects;

create policy "modugal_imagenes_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'proyectos-imagenes'
              and public.tiene_rol(array['administrativo', 'operativo', 'secretaria']));

create policy "modugal_imagenes_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'proyectos-imagenes'
         and public.tiene_rol(array['administrativo', 'operativo', 'secretaria']));

create policy "modugal_imagenes_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'proyectos-imagenes'
         and public.tiene_rol(array['administrativo']));


-- ----------------------------------------------------------------------------
-- 4. COMPROBACIÓN
-- ----------------------------------------------------------------------------
select 'personal' as chequeo,
       (select string_agg(nombre || ' (' || cargo || ')', ', ' order by nombre) from public.carpinteros) as resultado
union all
select 'tareas por actividad',
       (select string_agg(actividad || ': ' || n, ', ') from
          (select actividad, count(*) n from public.tareas_carpintero group by actividad) x)
union all
select 'bucket imágenes',
       (select id || ' · público=' || public from storage.buckets where id = 'proyectos-imagenes');
