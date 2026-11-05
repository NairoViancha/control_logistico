-- ============================================================================
-- MODUGAL · Limpieza de datos de prueba (BORRADO PERMANENTE)
-- Ejecútalo tú mismo en Supabase > SQL Editor cuando estés seguro.
--
-- Borra:
--   - PRJ-006 "Cliente QA Supabase" con sus pendientes y tareas
--     (incluye la tarea "TRAZADO" de TEOFILO GUTIERREZ y "Mueble QA Reasignado")
--   - El carpintero "QA Carpintero"
--   - COM-005 y COM-006: tarjetas de prospecto ya convertidas en proyecto,
--     que duplicaban a Dr. Fernando López (PRJ-008) y Camila Reyes (PRJ-007).
--     Se conservan PRJ-007 y PRJ-008, que tienen los pendientes.
-- ============================================================================
begin;

delete from public.tareas_carpintero
 where proyecto_id in (select id from public.proyectos where codigo_prj in ('PRJ-006', 'COM-005', 'COM-006'))
    or carpintero_id in (select id from public.carpinteros where nombre = 'QA Carpintero');

delete from public.pendientes
 where proyecto_id in (select id from public.proyectos where codigo_prj in ('PRJ-006', 'COM-005', 'COM-006'));

delete from public.proyectos   where codigo_prj in ('PRJ-006', 'COM-005', 'COM-006');
delete from public.carpinteros where nombre = 'QA Carpintero';

commit;

select codigo_prj, cliente from public.proyectos order by codigo_prj;
