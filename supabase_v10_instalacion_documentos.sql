-- ============================================================================
-- MODUGAL · v10 · Fase "Despacho" → "Instalación" y documentos del arquitecto
-- ----------------------------------------------------------------------------
-- 1. La última fase de producción se llama "Instalación" (antes "Despacho").
--    Se actualizan proyectos, muebles, tareas y el JSON de cada proyecto. Si
--    una versión vieja de la app (o el celular con caché) escribe "Despacho",
--    la base lo convierte sola a "Instalación".
-- 2. Documentos: categorías Planimetría, Renders, Presentación y Trazos
--    (Plano 2D → Planimetría, Render 3D → Renders). El rol Arquitecto ya puede
--    subir documentos del proyecto.
-- 3. La carpeta financiera queda intacta en la base (la app la oculta).
-- Se puede ejecutar antes o después del push.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. FASE INSTALACIÓN
-- ----------------------------------------------------------------------------
-- 1a. Si alguna columna de fase es de tipo enum, se pasa a texto (para poder
--     usar el nuevo nombre) y se quitan los checks que mencionen "Despacho".
do $$
declare
  obj record;
  chk record;
begin
  for obj in
    select * from (values ('proyectos', 'fase_actual'),
                          ('proyecto_muebles', 'fase'),
                          ('tareas_carpintero', 'fase_manual')) as t(tabla, columna)
  loop
    if exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = obj.tabla
                  and column_name = obj.columna and data_type = 'USER-DEFINED') then
      execute format('alter table public.%I alter column %I type text using %I::text', obj.tabla, obj.columna, obj.columna);
    end if;
    for chk in
      select c.conname
        from pg_constraint c
       where c.conrelid = format('public.%I', obj.tabla)::regclass
         and c.contype = 'c'
         and pg_get_constraintdef(c.oid) ilike '%despacho%'
    loop
      execute format('alter table public.%I drop constraint %I', obj.tabla, chk.conname);
    end loop;
  end loop;
end $$;

-- 1b. Traductor automático: "Despacho" → "Instalación" al guardar
create or replace function public.fase_despacho_a_instalacion()
returns trigger
language plpgsql
as $$
begin
  if tg_table_name = 'proyectos' then
    if new.fase_actual = 'Despacho' then new.fase_actual := 'Instalación'; end if;
    if new.descripcion_venta like '%"Despacho"%' then
      new.descripcion_venta := replace(new.descripcion_venta, '"Despacho"', '"Instalación"');
    end if;
  elsif tg_table_name = 'proyecto_muebles' then
    if new.fase = 'Despacho' then new.fase := 'Instalación'; end if;
  elsif tg_table_name = 'tareas_carpintero' then
    if new.fase_manual = 'Despacho' then new.fase_manual := 'Instalación'; end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_fase_instalacion on public.proyectos;
create trigger trg_fase_instalacion before insert or update on public.proyectos
  for each row execute function public.fase_despacho_a_instalacion();
drop trigger if exists trg_fase_instalacion on public.proyecto_muebles;
create trigger trg_fase_instalacion before insert or update on public.proyecto_muebles
  for each row execute function public.fase_despacho_a_instalacion();
drop trigger if exists trg_fase_instalacion on public.tareas_carpintero;
create trigger trg_fase_instalacion before insert or update on public.tareas_carpintero
  for each row execute function public.fase_despacho_a_instalacion();

-- 1c. Datos existentes
update public.proyectos
   set fase_actual = 'Instalación'
 where fase_actual = 'Despacho' or descripcion_venta like '%"Despacho"%';   -- el trigger corrige también el JSON
update public.proyecto_muebles  set fase = 'Instalación'        where fase = 'Despacho';
update public.tareas_carpintero set fase_manual = 'Instalación' where fase_manual = 'Despacho';

-- 1d. Nuevo check de la fase de los muebles (el que tenía "Despacho")
alter table public.proyecto_muebles drop constraint if exists proyecto_muebles_fase_check;
alter table public.proyecto_muebles add constraint proyecto_muebles_fase_check
  check (fase in ('Recepción', 'Asignación', 'Armado', 'Presentación', 'Embalaje', 'Instalación'));


-- ----------------------------------------------------------------------------
-- 2. DOCUMENTOS DEL ARQUITECTO
-- ----------------------------------------------------------------------------
alter table public.documentos drop constraint if exists documentos_categoria_check;
update public.documentos set categoria = 'Planimetría' where categoria = 'Plano 2D';
update public.documentos set categoria = 'Renders'     where categoria = 'Render 3D';
alter table public.documentos add constraint documentos_categoria_check
  check (categoria in ('Planimetría', 'Renders', 'Presentación', 'Trazos',
                       -- anteriores, se conservan para no perder nada
                       'Contrato', 'Cotización', 'Factura', 'Foto de avance', 'Acta de entrega', 'Otro'));
alter table public.documentos alter column categoria set default 'Planimetría';

drop policy if exists documentos_insert on public.documentos;
create policy documentos_insert on public.documentos
  for insert to authenticated
  with check (case carpeta when 'financiera' then public.tiene_rol(array['administrativo'])
                           else public.tiene_rol(array['administrativo', 'operativo', 'secretaria', 'arquitecto']) end);

drop policy if exists "modugal_docs_proyecto_insert" on storage.objects;
create policy "modugal_docs_proyecto_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documentos-proyecto'
              and public.tiene_rol(array['administrativo', 'operativo', 'secretaria', 'arquitecto']));

commit;


-- ----------------------------------------------------------------------------
-- RESUMEN
-- ----------------------------------------------------------------------------
select 'proyectos en Instalación' as chequeo, count(*)::text as resultado
  from public.proyectos where fase_actual = 'Instalación'
union all
select 'quedan con "Despacho"',
       ((select count(*) from public.proyectos where fase_actual = 'Despacho' or descripcion_venta like '%"Despacho"%')
      + (select count(*) from public.proyecto_muebles where fase = 'Despacho')
      + (select count(*) from public.tareas_carpintero where fase_manual = 'Despacho'))::text
union all
select 'documentos por categoría',
       coalesce((select string_agg(categoria || ': ' || n, ', ' order by categoria)
                   from (select categoria, count(*) n from public.documentos group by 1) x), 'sin documentos');
