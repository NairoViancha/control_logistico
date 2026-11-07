-- ============================================================================
-- MODUGAL · v12 · Se quita la fase "Asignación"
-- ----------------------------------------------------------------------------
-- Fases de producción: Recepción → Armado → Presentación → Embalaje → Instalación
-- - Proyectos y muebles que estaban en "Asignación" pasan a "Recepción".
-- - Si una versión vieja de la app (o un celular con caché) guarda "Asignación"
--   o "Despacho", la base lo traduce sola.
-- Requiere v10. Se puede ejecutar antes o después del push y repetir sin problema.
-- ============================================================================

begin;

create or replace function public.fase_despacho_a_instalacion()
returns trigger
language plpgsql
as $$
begin
  if tg_table_name = 'proyectos' then
    if new.fase_actual = 'Despacho' then new.fase_actual := 'Instalación'; end if;
    if new.fase_actual = 'Asignación' then new.fase_actual := 'Recepción'; end if;
    if new.descripcion_venta like '%"Despacho"%' then
      new.descripcion_venta := replace(new.descripcion_venta, '"Despacho"', '"Instalación"');
    end if;
  elsif tg_table_name = 'proyecto_muebles' then
    if new.fase = 'Despacho' then new.fase := 'Instalación'; end if;
    if new.fase = 'Asignación' then new.fase := 'Recepción'; end if;
  elsif tg_table_name = 'tareas_carpintero' then
    if new.fase_manual = 'Despacho' then new.fase_manual := 'Instalación'; end if;
    if new.fase_manual = 'Asignación' then new.fase_manual := 'Armado'; end if;
  end if;
  return new;
end $$;

-- Datos existentes (el trigger hace la traducción)
update public.proyectos         set fase_actual = 'Recepción' where fase_actual = 'Asignación';
update public.proyecto_muebles  set fase = 'Recepción'        where fase = 'Asignación';
update public.tareas_carpintero set fase_manual = 'Armado'    where fase_manual = 'Asignación';

alter table public.proyecto_muebles drop constraint if exists proyecto_muebles_fase_check;
alter table public.proyecto_muebles add constraint proyecto_muebles_fase_check
  check (fase in ('Recepción', 'Armado', 'Presentación', 'Embalaje', 'Instalación'));

commit;

select 'proyectos por fase' as chequeo,
       coalesce((select string_agg(fase_actual || ': ' || n, ', ' order by fase_actual)
                   from (select fase_actual, count(*) n from public.proyectos group by 1) x), 'sin proyectos') as resultado
union all
select 'quedan en "Asignación"',
       ((select count(*) from public.proyectos where fase_actual = 'Asignación')
      + (select count(*) from public.proyecto_muebles where fase = 'Asignación'))::text;
