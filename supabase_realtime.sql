-- MODUGAL · Activar sincronización en tiempo real
-- Ejecutar una sola vez en Supabase > SQL Editor > New query > Run
alter publication supabase_realtime add table public.proyectos;
alter publication supabase_realtime add table public.pendientes;
alter publication supabase_realtime add table public.carpinteros;
alter publication supabase_realtime add table public.tareas_carpintero;

-- Comprobación: debe listar las 4 tablas
select tablename from pg_publication_tables where pubname = 'supabase_realtime';
