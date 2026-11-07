/* ==========================================================================
   MODUGAL - espacios renovados · app.js
   --------------------------------------------------------------------------
   Plataforma B2B para producción de cocinas integrales y mobiliario de alta
   gama. Estado global reactivo persistido en Supabase (PostgreSQL) con
   sincronización en tiempo real y cache local de respaldo (localStorage).

   Módulos:
     1. Constantes, estado global y datos semilla
     2. Persistencia, migración y utilidades
     3. Autenticación, roles y matriz de permisos
     4. Pendientes unificados y fases bidireccionales
     5. Tablero de Producción y módulo Proyectos
     6. Equipo & Asignaciones (editar, reasignar, eliminar, fase por mueble)
     7. Seguimiento Comercial (drag & drop, ficha comercial, aprobar/rechazar)
     8. Centro de Control Logístico
     9. Tabla General y Estadísticas
    10. Ficha de Proyecto (edición, imagen, documentos)
    11. Registro de compras, asistente IA y eventos
   ========================================================================== */

'use strict';

/* ==========================================================================
   1. CONSTANTES DE NEGOCIO
   ========================================================================== */

const PRODUCTION_PHASES = ['Recepción', 'Armado', 'Presentación', 'Embalaje', 'Instalación'];
/* MÓDULO CONTABLE (finanzas del proyecto + carpeta financiera de documentos).
   Apagado por decisión de Gerencia (nov 2026): no se muestra, no se consulta y
   no se suscribe a cambios. Los datos y las tablas siguen intactos en la base;
   para volver a activarlo basta con poner true. */
const MODULO_CONTABLE = false;

/* "Despacho" se renombró a "Instalación" (v10) y "Asignación" se quitó (v12):
   los datos viejos se traducen al leer. */
const FASES_ANTERIORES = { Despacho: 'Instalación', 'Asignación': 'Recepción' };
function faseValida(fase, porDefecto) {
  const f = FASES_ANTERIORES[fase] || fase;
  return PRODUCTION_PHASES.includes(f) ? f : porDefecto;
}

const EST_PRODUCCION = { EN_PROCESO: 'En proceso', DETENIDO: 'Detenido', COMPLETADO: 'Completado' };

const ETAPAS_COMERCIAL = ['Prospectos', 'Cotizaciones', 'Aprobados', 'En Fabricación', 'Instalaciones', 'Garantías', 'Prospecto No Continuado'];

/* Personal de planta y actividades que puede estar haciendo cada persona.
   (Las fases Recepción/Instalación son del proyecto, no del operario.) */
const CARGOS_PERSONAL = ['Carpintero', 'Auxiliar de carpintería', 'Eléctrico'];
/* Estado del trabajo de cada tarea o mueble asignado (solo estos 3) */
const ESTADOS_TRABAJO = ['En proceso', 'Detenido', 'Completado'];
const ESTILO_ESTADO_TRABAJO = {
  'En proceso': 'bg-slate-100 text-slate-700 border-slate-200',
  Detenido: 'bg-red-100 text-red-800 border-red-200',
  Completado: 'bg-emerald-100 text-emerald-800 border-emerald-200',
};
function estadoTrabajoValido(v) {
  return ESTADOS_TRABAJO.includes(v) ? v : 'En proceso';
}

const ACTIVIDADES = [
  { v: 'Trazando', icon: 'fa-ruler-combined', cls: 'bg-sky-50 text-sky-800 border-sky-200' },
  { v: 'Escogiendo material', icon: 'fa-boxes-stacked', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  { v: 'Armando', icon: 'fa-hammer', cls: 'bg-slate-100 text-slate-800 border-slate-300' },
  { v: 'Añadiendo luces', icon: 'fa-lightbulb', cls: 'bg-yellow-50 text-yellow-800 border-yellow-200' },
  { v: 'Embalaje', icon: 'fa-box', cls: 'bg-violet-50 text-violet-800 border-violet-200' },
  { v: 'Instalación', icon: 'fa-screwdriver-wrench', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  { v: 'Otra', icon: 'fa-ellipsis', cls: 'bg-white text-slate-700 border-slate-200' },
];
const ACTIVIDAD_POR_NOMBRE = Object.fromEntries(ACTIVIDADES.map((a) => [a.v, a]));
const BUCKET_IMAGENES = 'proyectos-imagenes';
/* Documentos (v8): buckets PRIVADOS, se abren solo con enlaces firmados */
const BUCKET_DOCS = { proyecto: 'documentos-proyecto', financiera: 'documentos-financieros' };
const CATEGORIAS_DOC = {
  /* Lo que sube el arquitecto (y el resto del equipo) */
  proyecto: ['Planimetría', 'Renders', 'Presentación', 'Trazos'],
  financiera: ['Cotización', 'Factura', 'Contrato', 'Otro'],
};
const MAX_DOC_MB = 25;
const ICONO_CATEGORIA_DOC = { 'Planimetría': 'fa-ruler-combined', Renders: 'fa-cube', 'Presentación': 'fa-person-chalkboard', Trazos: 'fa-pen-ruler', Otros: 'fa-folder' };

/* Compras de material (tabla compras, v6) */
const ESTADOS_COMPRA = ['Solicitado', 'Confirmado', 'En tránsito', 'Recibido parcial', 'Recibido', 'Cancelado'];
const ESTADOS_COMPRA_CERRADOS = ['Recibido', 'Cancelado'];
const CALIDAD_COMPRA = ['Pendiente', 'Aprobado', 'Con novedad'];
const UNIDADES_COMPRA = ['und', 'm', 'm²', 'ml', 'láminas', 'kg', 'galones', 'juegos', 'cajas'];
/* Incidentes (tabla incidentes, v7) — antes "bloqueos" */
const TIPOS_INCIDENTE = ['Material faltante', 'Material defectuoso', 'Diseño / planos', 'Cliente', 'Personal', 'Maquinaria', 'Transporte / despacho', 'Otro'];
const GRAVEDADES_INCIDENTE = ['Baja', 'Media', 'Alta', 'Crítica'];
const ESTADOS_INCIDENTE = ['Abierto', 'En gestión', 'Resuelto'];
const ESTILO_GRAVEDAD = {
  Baja: 'bg-slate-100 text-slate-700 border-slate-200',
  Media: 'bg-amber-50 text-amber-800 border-amber-200',
  Alta: 'bg-orange-50 text-orange-800 border-orange-200',
  Crítica: 'bg-red-600 text-white border-red-600',
};

const ESTILO_ESTADO_COMPRA = {
  Solicitado: 'bg-slate-100 text-slate-700 border-slate-200',
  Confirmado: 'bg-sky-50 text-sky-800 border-sky-200',
  'En tránsito': 'bg-violet-50 text-violet-800 border-violet-200',
  'Recibido parcial': 'bg-amber-50 text-amber-800 border-amber-200',
  Recibido: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  Cancelado: 'bg-white text-slate-400 border-slate-200 line-through',
};

const ROLE_LABELS = {
  administrativo: 'Gerencia',
  operativo: 'Logística / Operativo',
  secretaria: 'Secretaría',
  arquitecto: 'Arquitecto',
};

const TIPO_PENDIENTE_LABEL = {
  material: 'Material',
  requerimiento: 'Requerimiento',
  bloqueo: 'Bloqueo',
  otro: 'Otro',
};

/* Cache local por usuario (se borra al cerrar sesión) */
const STORAGE_PREFIX = 'modugal_estado_v2_';
const TEMA_KEY = 'modugal_tema';
/* Claves del login simulado anterior: se eliminan del navegador al iniciar
   (guardaban usuarios y contraseñas en texto plano). */
const CLAVES_LEGADAS = ['modugal_estado_v1', 'modugal_rol', 'modugal_usuarios', 'modugal_sesion'];
const ROLES_VALIDOS = ['administrativo', 'operativo', 'secretaria', 'arquitecto'];

const VISTAS_KEY = 'modugal_vistas';
function leerVistas() {
  try {
    const v = JSON.parse(localStorage.getItem(VISTAS_KEY) || '{}');
    return { produccion: v.produccion === 'lista' ? 'lista' : 'tarjetas', proyectos: v.proyectos === 'lista' ? 'lista' : 'tarjetas' };
  } catch (e) {
    return { produccion: 'tarjetas', proyectos: 'tarjetas' };
  }
}

function storageKey() {
  return state.user?.id ? STORAGE_PREFIX + state.user.id : null;
}

const DEFAULT_IMAGE = 'https://images.unsplash.com/photo-1556910103-1c02745a872e?auto=format&fit=crop&w=1200&q=80';

/* --- Supabase · cliente oficial (CDN cargado en index.html) --------------- */
const SUPABASE_URL = 'https://ekhifrcnoqsqlkibajff.supabase.co';
const SUPABASE_KEY = 'sb_publishable_xoprTlOTu9q3uPATkGRQlw_85ul4zbb';
/* El SDK UMD ya expone `window.supabase`; usamos un alias local para no
   redeclarar el identificador global. */
/* Enlace de "olvidé mi contraseña": el correo trae una sesión temporal.
   Se detecta ANTES de crear el cliente (que limpia la URL) y se guarda en
   sessionStorage: hasta crear la nueva contraseña no se entra a la app. */
const CLAVE_RECUPERACION = 'mg-recuperacion-pendiente';
if (/type=recovery/.test(`${window.location.hash}${window.location.search}`)) {
  try { sessionStorage.setItem(CLAVE_RECUPERACION, '1'); } catch (e) { /* noop */ }
}
function enRecuperacion() {
  try { return sessionStorage.getItem(CLAVE_RECUPERACION) === '1'; } catch (e) { return false; }
}
function marcarRecuperacion(activa) {
  try {
    if (activa) sessionStorage.setItem(CLAVE_RECUPERACION, '1');
    else sessionStorage.removeItem(CLAVE_RECUPERACION);
  } catch (e) { /* noop */ }
}

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* Marcador para conservar los campos extendidos de la ficha dentro de la
   columna de texto `descripcion_venta` (el esquema relacional sólo guarda
   los campos núcleo: cliente, ciudad, fase, etapa, imagen y fecha). */
const MG_PREFIX = 'MGJSON:';

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MESES_TITULO = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

/* ==========================================================================
   2. ESTADO GLOBAL
   ========================================================================== */

const state = {
  proyectos: [],
  comercial: [],
  tareas: {},
  carpinteros: [],
  /* Finanzas por código de proyecto (solo se cargan para Gerencia) */
  finanzas: {},
  /* Lista de usuarios para el panel de Gerencia */
  usuarios: [],
  usuariosFiltro: 'pendiente',
  /* Vista de Producción y Proyectos: 'tarjetas' | 'lista' (se recuerda por navegador) */
  vistas: leerVistas(),
  /* Rol efectivo: viene SIEMPRE de public.usuarios (nunca del navegador).
     Sin sesión se usa el rol de menor privilegio. */
  rol: 'arquitecto',
  tab: 'produccion',
  fProduccion: 'todos',
  search: '',
  year: 'Todos',
  quarter: 'Todos los Trimestres',
  city: 'Todos',
  comercialTrimestre: 'Todos los Trimestres',
  proyectosEstado: 'activos',
  proyectosYear: 'Todos',
  proyectosQuarter: 'Todos los Trimestres',
  proyectosCity: 'Todos',
  fichaId: null,
  fichaSub: 'resumen',
  proyectoModalMode: 'crear',
  proyectoModalId: null,
  proyectoModalFocus: null,
  tareaCtx: null,
  pendienteCtx: null,
  comercialCtx: null,
  rechazoId: null,
  newOrderProjectId: null,
  tema: localStorage.getItem(TEMA_KEY) || 'claro',
  user: null,
};

/* ==========================================================================
   3. DATOS
   Los datos viven en Supabase. No hay datos semilla: los registros demo y
   de prueba (QA) se retiraron al activar la autenticación real.
   ========================================================================== */

/* ==========================================================================
   4. PERSISTENCIA, MIGRACIÓN Y UTILIDADES
   ========================================================================== */

function hoyISO() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function formatFechaLarga(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return 'Por definir';
  const day = String(d.getDate()).padStart(2, '0');
  return `${day} ${MESES_TITULO[d.getMonth()]} ${d.getFullYear()}`;
}

function parseFecha(str) {
  if (!str) return null;
  const value = String(str).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    const d = new Date(`${value.slice(0, 10)}T00:00:00`);
    return isNaN(d.getTime()) ? null : d;
  }
  const m = value.match(/(\d{1,2})\s+([A-Za-zÁÉÍÓÚáéíóú]+)\s+(\d{4})/);
  if (!m) return null;
  const MESES_MAP = {
    ene: 0, jan: 0, feb: 1, mar: 2, abr: 3, apr: 3, may: 4, jun: 5,
    jul: 6, ago: 7, aug: 7, sep: 8, oct: 9, nov: 10, dic: 11, dec: 11,
  };
  const mes = MESES_MAP[m[2].toLowerCase().slice(0, 3)];
  if (mes === undefined) return null;
  const d = new Date(parseInt(m[3], 10), mes, parseInt(m[1], 10));
  return isNaN(d.getTime()) ? null : d;
}

function esHoy(fecha) {
  const d = parseFecha(fecha);
  if (!d) return false;
  const hoy = new Date();
  return d.getFullYear() === hoy.getFullYear() && d.getMonth() === hoy.getMonth() && d.getDate() === hoy.getDate();
}

function esFechaVencida(fecha) {
  const d = parseFecha(fecha);
  if (!d) return false;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return d.getTime() < hoy.getTime();
}

function esc(str) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(str ?? '').replace(/[&<>"']/g, (c) => map[c]);
}

/* ==========================================================================
   0b. SEGURIDAD (auditoría nov 2026)
   --------------------------------------------------------------------------
   - Anti clickjacking: la app no se deja mostrar dentro de un marco ajeno
     (GitHub Pages no permite la cabecera frame-ancestors).
   - Mensajes de error para el usuario sin detalles internos de la base.
   - Política de contraseñas y lista blanca de archivos.
   - Cierre de sesión por inactividad (equipos compartidos del taller).
   ========================================================================== */

/* La app se mudó de GitHub Pages a Cloudflare Pages (nov 2026): quien abra el
   enlace viejo llega a la dirección nueva, con los mismos parámetros (p. ej. el
   enlace de recuperación de contraseña que viene en el #). */
(function redirigirDominioViejo() {
  if (location.hostname === 'nairoviancha.github.io') {
    location.replace('https://modugal-app.pages.dev/' + location.search + location.hash);
  }
})();

(function antiClickjacking() {
  try {
    if (window.top !== window.self) {
      document.documentElement.style.display = 'none';
      window.top.location.replace(window.self.location.href);
    }
  } catch (e) {
    /* Marco de otro dominio que bloquea la redirección: la página queda oculta */
    document.documentElement.style.display = 'none';
  }
}());

/* Error técnico → mensaje claro. El detalle queda solo en la consola. */
function mensajeError(error, porDefecto = 'No se pudo completar la acción. Intenta de nuevo.') {
  if (!error) return porDefecto;
  const codigo = String(error.code || error.statusCode || error.status || '');
  const texto = String(error.message || error.error || error || '');
  console.warn('[MODUGAL] Detalle del error:', error);
  if (/failed to fetch|network|load failed|timeout/i.test(texto)) return 'Sin conexión con el servidor. Revisa el internet e intenta de nuevo.';
  if (['42501', 'PGRST301', '401', '403'].includes(codigo) || /row-level security|permission denied|not authorized|unauthorized/i.test(texto)) {
    return 'No tienes permiso para hacer esto con tu rol.';
  }
  if (codigo === '23505' || /duplicate key|already exists/i.test(texto)) return 'Ya existe un registro igual.';
  if (codigo === '23503') return 'Este registro está relacionado con otros datos y no se puede cambiar así.';
  if (codigo === '23514' || codigo === '22001' || /check constraint|too long/i.test(texto)) return 'Algún dato no tiene el formato o el tamaño permitido.';
  if (codigo === '413' || /payload too large|exceeded the maximum/i.test(texto)) return 'El archivo es demasiado grande.';
  if (/mime type|invalid_mime|not supported/i.test(texto)) return 'Ese tipo de archivo no está permitido.';
  if (/jwt|expired|refresh token/i.test(texto)) return 'Tu sesión expiró. Vuelve a iniciar sesión.';
  return porDefecto;
}

/* Contraseñas nuevas: mínimo 8 caracteres, con letras y números, distinta del correo */
const CLAVE_MIN = 8;
function validarClaveNueva(clave, email = '') {
  const c = String(clave || '');
  if (c.length < CLAVE_MIN) return `La contraseña debe tener mínimo ${CLAVE_MIN} caracteres.`;
  if (c.length > 72) return 'La contraseña no puede pasar de 72 caracteres.';
  if (!/[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(c) || !/\d/.test(c)) return 'La contraseña debe combinar letras y números.';
  const usuario = String(email || '').split('@')[0].toLowerCase();
  if (usuario.length >= 4 && c.toLowerCase().includes(usuario)) return 'La contraseña no puede contener tu correo.';
  if (/^(.)\1+$/.test(c) || /^(12345678|123456789|password|contraseña|modugal)/i.test(c)) return 'Esa contraseña es muy fácil de adivinar.';
  return null;
}

/* Archivos permitidos en Documentos: extensión → tipo con el que se guarda.
   El tipo lo decide la app por la extensión (no el navegador), así un HTML o
   un SVG disfrazado nunca se guarda como página web. */
const TIPOS_DOC_PERMITIDOS = {
  pdf: 'application/pdf',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
  dwg: 'application/octet-stream', dxf: 'application/octet-stream', skp: 'application/octet-stream',
  glb: 'model/gltf-binary', gltf: 'model/gltf+json', obj: 'application/octet-stream',
  zip: 'application/zip', rar: 'application/vnd.rar',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  csv: 'text/csv',
};
const TIPOS_PREVISUALIZABLES = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp']);

function extensionDe(nombre) {
  const m = /\.([a-z0-9]{1,6})$/i.exec(String(nombre || '').trim());
  return m ? m[1].toLowerCase() : '';
}

/* null si el archivo se puede subir; si no, el motivo */
function tipoDocumentoSeguro(nombre) {
  return TIPOS_DOC_PERMITIDOS[extensionDe(nombre)] || null;
}

/* Cierre de sesión por inactividad */
const INACTIVIDAD_MAX_MS = 8 * 3600 * 1000;
const CLAVE_ACTIVIDAD = 'mg-ultima-actividad';
function registrarActividad() {
  try { localStorage.setItem(CLAVE_ACTIVIDAD, String(Date.now())); } catch (e) { /* noop */ }
}
function sesionInactiva(ahora = Date.now()) {
  let ultima = 0;
  try { ultima = Number(localStorage.getItem(CLAVE_ACTIVIDAD)) || 0; } catch (e) { return false; }
  return ultima > 0 && ahora - ultima > INACTIVIDAD_MAX_MS;
}
function vigilarInactividad() {
  let pendiente = false;
  const marcar = () => {
    if (pendiente) return;
    pendiente = true;
    setTimeout(() => { pendiente = false; registrarActividad(); }, 30000);
  };
  ['pointerdown', 'keydown', 'touchstart', 'visibilitychange'].forEach((ev) => document.addEventListener(ev, marcar, { passive: true }));
  setInterval(async () => {
    if (state.user && sesionInactiva()) {
      await supabaseClient.auth.signOut();
      showToast('Por seguridad se cerró la sesión tras 8 horas sin uso.');
    }
  }, 5 * 60 * 1000);
}

function nuevoUUID() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : ((r & 0x3) | 0x8);
    return v.toString(16);
  });
}

function esUUID(valor) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(valor || ''));
}

function uid() {
  return nuevoUUID();
}

function labelCargo(rol) {
  return ROLE_LABELS[rol] || 'Gerencia';
}

function labelPendiente(tipo) {
  return TIPO_PENDIENTE_LABEL[tipo] || 'Otro';
}

function normalizarPendiente(x, index) {
  if (typeof x === 'string') {
    return { id: nuevoUUID(), text: x, tipo: 'material', prioridad: 'media', estado: 'Pendiente', createdAt: hoyISO() };
  }
  const item = x && typeof x === 'object' ? x : {};
  return {
    id: esUUID(item.id) ? item.id : nuevoUUID(),
    text: String(item.text || item.descripcion || 'Pendiente sin descripción'),
    tipo: TIPO_PENDIENTE_LABEL[item.tipo] ? item.tipo : 'material',
    prioridad: ['alta', 'media', 'baja'].includes(item.prioridad) ? item.prioridad : 'media',
    estado: item.estado === 'Resuelto' ? 'Resuelto' : 'Pendiente',
    createdAt: item.createdAt || hoyISO(),
  };
}

function normalizarPedido(od, index) {
  const item = od || {};
  const legado = { Bodega: 'Recibido', Entregado: 'Recibido', 'En Tránsito': 'En tránsito' };
  const estado = ESTADOS_COMPRA.includes(item.status) ? item.status : (legado[item.status] || 'Solicitado');
  const fechaPrometida = item.fechaPrometida || fechaISODeTexto(item.expected) || null;
  const cantidad = Number(item.cantidad) > 0 ? Number(item.cantidad) : 1;
  return {
    id: item.id || `od-mig-${index}`,
    category: item.category || '',
    item: item.item || 'Material sin descripción',
    supplier: item.supplier || 'Proveedor por definir',
    guide: item.guide && item.guide !== 'Sin Guía' ? item.guide : '',
    cantidad,
    unidad: item.unidad || 'und',
    cantidadRecibida: Number(item.cantidadRecibida) >= 0 ? Number(item.cantidadRecibida) : 0,
    fechaSolicitud: item.fechaSolicitud || null,
    fechaPrometida,
    fechaRecibida: item.fechaRecibida || null,
    expected: fechaPrometida ? formatFechaLarga(parseFecha(fechaPrometida)) : (item.expected || 'Por definir'),
    status: estado,
    qc: CALIDAD_COMPRA.includes(item.qc) ? item.qc : 'Pendiente',
    notas: item.notas || '',
    pendienteId: item.pendienteId || null,
    dbVersion: Number.isInteger(item.dbVersion) ? item.dbVersion : null,
  };
}

/* Una compra está cerrada si se canceló o llegó completa SIN novedad de
   calidad. Con novedad sigue abierta (y su pendiente también) hasta resolverla. */
function compraCerrada(od) {
  return od?.status === 'Cancelado' || (od?.status === 'Recibido' && od?.qc !== 'Con novedad');
}

function compraAbierta(od) {
  return !compraCerrada(od);
}

/* Días de atraso respecto a la fecha prometida (0 si ya llegó o se canceló) */
function diasAtrasoCompra(od) {
  if (ESTADOS_COMPRA_CERRADOS.includes(od?.status) || !od.fechaPrometida) return 0;
  const prometida = parseFecha(od.fechaPrometida);
  if (!prometida) return 0;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((hoy - prometida) / 86400000));
}

function normalizarIncidente(x, index) {
  const item = x || {};
  const legado = 'reason' in item || 'solved' in item;
  const estado = ESTADOS_INCIDENTE.includes(item.estado) ? item.estado : (item.solved ? 'Resuelto' : 'Abierto');
  return {
    id: item.id || `inc-mig-${index}`,
    tipo: TIPOS_INCIDENTE.includes(item.tipo) ? item.tipo : 'Otro',
    gravedad: GRAVEDADES_INCIDENTE.includes(item.gravedad) ? item.gravedad : (legado ? 'Alta' : 'Media'),
    descripcion: item.descripcion || item.reason || 'Incidente sin descripción',
    accion: item.accion || item.action || '',
    responsable: item.responsable || '',
    detiene: Boolean(item.detiene),
    estado,
    fechaApertura: item.fechaApertura || new Date().toISOString(),
    fechaCompromiso: item.fechaCompromiso || null,
    fechaCierre: item.fechaCierre || null,
    solucion: item.solucion || (estado === 'Resuelto' && legado ? 'Resuelto antes de la migración' : ''),
    diasImpacto: Number.isInteger(Number(item.diasImpacto)) && Number(item.diasImpacto) > 0 ? Number(item.diasImpacto) : 0,
    compraId: item.compraId || null,
    dbVersion: Number.isInteger(item.dbVersion) ? item.dbVersion : null,
  };
}

function incidenteAbierto(x) {
  return x?.estado !== 'Resuelto';
}

function diasAbiertoIncidente(x) {
  const inicio = new Date(x.fechaApertura);
  const fin = x.fechaCierre ? new Date(x.fechaCierre) : new Date();
  if (isNaN(inicio)) return 0;
  return Math.max(0, Math.floor((fin - inicio) / 86400000));
}

function incidenteVencido(x) {
  if (!incidenteAbierto(x) || !x.fechaCompromiso) return false;
  const f = parseFecha(x.fechaCompromiso);
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return Boolean(f) && f < hoy;
}

function normalizarMueble(m, index) {
  const item = m || {};
  const fase = faseValida(item.manufacturingPhase, 'Recepción');
  return {
    id: item.id || `m-mig-${index}`,
    name: item.name || `Mueble ${index + 1}`,
    carpenter: item.carpenter || '',
    status: fase,
    manufacturingPhase: fase,
    /* Antes se descartaban al recargar: ahora se conservan */
    actividad: ACTIVIDAD_POR_NOMBRE[item.actividad] ? item.actividad : 'Armando',
    detalle: item.detalle || '',
    estadoTrabajo: estadoTrabajoValido(item.estadoTrabajo),
    asignadoEn: item.asignadoEn || null,
    completadoEn: item.completadoEn || null,
    dbVersion: Number.isInteger(item.dbVersion) ? item.dbVersion : null,
  };
}

function normalizarProyecto(p) {
  if (!p || typeof p !== 'object') return null;
  p.id = p.id || generarIdProyecto();
  p.name = p.name || p.client || p.id;
  p.client = p.client || p.name;
  p.city = p.city || 'Por definir';
  p.neighborhood = p.neighborhood || '';
  p.address = p.address || 'Por definir';
  p.phone = p.phone || '';
  p.manufacturingPhase = faseValida(p.manufacturingPhase, 'Recepción');
  p.phase = p.manufacturingPhase;
  p.status = [EST_PRODUCCION.EN_PROCESO, EST_PRODUCCION.DETENIDO, EST_PRODUCCION.COMPLETADO].includes(p.status) ? p.status : EST_PRODUCCION.EN_PROCESO;
  p.commercialStage = ETAPAS_COMERCIAL.includes(p.commercialStage) ? p.commercialStage : (p.status === EST_PRODUCCION.COMPLETADO ? 'Garantías' : 'En Fabricación');
  p.trimester = p.trimester || 'Q4 - 2026';
  p.image = p.image || DEFAULT_IMAGE;
  p.arquitecto = p.arquitecto || 'Felipe Mora';
  p.leadCarpenter = p.leadCarpenter || '';
  p.logisticOperator = p.logisticOperator || 'Wilyer';
  p.dateStart = p.dateStart || 'Por definir';
  p.dateExpected = p.dateExpected || 'Por definir';
  p.muebles = Array.isArray(p.muebles) ? p.muebles.map(normalizarMueble) : [];
  p.pedidos = Array.isArray(p.pedidos) ? p.pedidos.map(normalizarPedido) : [];
  const desdeBloqueos = !Array.isArray(p.incidentes) && Array.isArray(p.bloqueos);
  p.incidentes = (Array.isArray(p.incidentes) ? p.incidentes : (Array.isArray(p.bloqueos) ? p.bloqueos : []))
    .map(normalizarIncidente);
  /* Igual que la migración v7: un bloqueo abierto de un proyecto detenido lo detiene */
  if (desdeBloqueos && p.status === EST_PRODUCCION.DETENIDO) {
    p.incidentes.forEach((x) => { if (incidenteAbierto(x)) x.detiene = true; });
  }
  delete p.bloqueos;
  p.archivos = Array.isArray(p.archivos) ? p.archivos : [];
  p.dropboxFiles = {
    publicFiles: Array.isArray(p.dropboxFiles?.publicFiles) ? p.dropboxFiles.publicFiles : [],
  };

  if (!Array.isArray(p.pendientes)) {
    const derivados = [];
    const vistos = new Set();
    const push = (text, tipo, prioridad) => {
      const limpio = String(text || '').trim();
      if (!limpio || vistos.has(limpio)) return;
      vistos.add(limpio);
      derivados.push({ id: `pd-mig-${p.id}-${derivados.length}`, text: limpio, tipo, prioridad, createdAt: hoyISO() });
    };
    if (p.alert) push(p.alert, 'material', 'alta');
    (p.incidentes || []).forEach((b) => { if (incidenteAbierto(b)) push(b.descripcion, 'bloqueo', 'alta'); });
    (p.pedidos || []).forEach((pedido) => {
      if (compraAbierta(pedido)) push(`${pedido.item} (${pedido.supplier || 'proveedor'})`, 'material', 'media');
    });
    p.pendientes = derivados;
  }
  p.pendientes = p.pendientes.map(normalizarPendiente);
  p.alert = p.pendientes.length ? p.pendientes[0].text : '';
  p.commercialDetail = p.commercialDetail || detalleProyecto(p);
  return p;
}

function normalizarComercial(c) {
  if (!c || typeof c !== 'object') return null;
  c.id = c.id || generarIdComercial();
  c.cliente = c.cliente || 'Cliente sin nombre';
  c.etapa = ETAPAS_COMERCIAL.includes(c.etapa) ? c.etapa : 'Prospectos';
  c.trimester = c.trimester || 'Q4 - 2026';
  c.status = c.status || EST_PRODUCCION.EN_PROCESO;
  c.dateExpected = c.dateExpected || 'Por definir';
  c.proyectoId = c.proyectoId || null;
  c.alert = c.alert || '';
  c.detalle = c.detalle || `${c.cliente}: Pedido por definir.`;
  c.rechazado = Boolean(c.rechazado);
  c.motivo = c.motivo || '';
  return c;
}

/* --------------------------------------------------------------------------
   MAPEO APP <-> SUPABASE
   Tablas núcleo: proyectos, pendientes, carpinteros, tareas_carpintero.
   El esquema sólo expone los campos cabecera; el resto de la ficha viaja
   serializado en `descripcion_venta` con el prefijo MGJSON para no perder
   muebles, pedidos, bloqueos, documentos ni datos comerciales.
   -------------------------------------------------------------------------- */

const ETAPA_APP_A_DB = {
  'Prospectos': 'Prospecto',
  'Cotizaciones': 'Cotización',
  'Aprobados': 'Aprobado',
  'En Fabricación': 'En Fabricación',
  'Instalaciones': 'Instalación',
  'Garantías': 'Garantía',
  'Prospecto No Continuado': 'No Continuado',
};

const ETAPA_DB_A_APP = {
  'Prospecto': 'Prospectos',
  'Cotización': 'Cotizaciones',
  'Aprobado': 'Aprobados',
  'En Fabricación': 'En Fabricación',
  'Instalación': 'Instalaciones',
  'Garantía': 'Garantías',
  'No Continuado': 'Prospecto No Continuado',
};

function etapaAppADb(etapa) {
  return ETAPA_APP_A_DB[etapa] || 'Prospecto';
}

function etapaDbAApp(etapa) {
  return ETAPA_DB_A_APP[etapa] || null;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function fechaISODeTexto(str) {
  const d = parseFecha(str);
  if (!d) return null;
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function decodificarPayload(raw) {
  if (raw && typeof raw === 'object') return raw;
  const texto = String(raw || '');
  if (!texto.startsWith(MG_PREFIX)) return texto ? { detalle: texto } : {};
  try {
    return JSON.parse(texto.slice(MG_PREFIX.length)) || {};
  } catch (e) {
    return { detalle: texto.slice(MG_PREFIX.length) };
  }
}

function descripcionPendiente(x) {
  const base = String(x.text || '')
    .replace(/\s*\[(material|requerimiento|bloqueo|otro)\|(alta|media|baja)\]\s*$/i, '')
    .trim();
  const tipo = TIPO_PENDIENTE_LABEL[x.tipo] ? x.tipo : 'material';
  const prioridad = ['alta', 'media', 'baja'].includes(x.prioridad) ? x.prioridad : 'media';
  return `${base} [${tipo}|${prioridad}]`;
}

function filaAPendiente(row) {
  const raw = String(row.descripcion || '');
  const m = raw.match(/\s*\[(material|requerimiento|bloqueo|otro)\|(alta|media|baja)\]\s*$/i);
  const text = m ? raw.slice(0, m.index).trim() : raw.trim();
  return normalizarPendiente({
    id: row.id,
    text,
    tipo: m ? m[1].toLowerCase() : 'material',
    prioridad: m ? m[2].toLowerCase() : 'media',
    estado: row.estado,
    createdAt: row.created_at ? String(row.created_at).slice(0, 10) : hoyISO(),
  });
}

function filaDesdeProyecto(p) {
  const payload = {
    name: p.name,
    client: p.client,
    neighborhood: p.neighborhood,
    address: p.address,
    phone: p.phone,
    status: p.status,
    trimester: p.trimester,
    arquitecto: p.arquitecto,
    leadCarpenter: p.leadCarpenter,
    logisticOperator: p.logisticOperator,
    dateStart: p.dateStart,
    dateExpected: p.dateExpected,
    /* Con la tabla proyecto_muebles activa, los muebles ya no viajan en el JSON */
    muebles: mueblesEnTabla ? undefined : p.muebles,
    pedidos: comprasEnTabla ? undefined : p.pedidos,
    /* "bloqueos" se reemplazó por "incidentes" (tabla propia desde la v7) */
    incidentes: incidentesEnTabla ? undefined : p.incidentes,
    archivos: p.archivos,
    /* Solo la carpeta pública: lo financiero vive en proyectos_finanzas */
    dropboxFiles: { publicFiles: p.dropboxFiles?.publicFiles || [] },
    alert: p.alert,
    commercialStage: p.commercialStage,
    manufacturingPhase: p.manufacturingPhase,
    detalle: p.commercialDetail || detalleProyecto(p),
  };
  return {
    codigo_prj: p.id,
    cliente: p.client || p.name || 'Cliente sin nombre',
    ciudad: p.city || 'Por definir',
    descripcion_venta: MG_PREFIX + JSON.stringify(payload),
    fase_actual: faseValida(p.manufacturingPhase, 'Recepción'),
    etapa_comercial: etapaAppADb(p.commercialStage || 'En Fabricación'),
    motivo_rechazo: p.motivo || null,
    imagen_url: p.image || null,
    trazador_responsable: p.leadCarpenter || p.logisticOperator || null,
    fecha_entrega: fechaISODeTexto(p.dateExpected),
  };
}

function filaDesdeProspecto(c) {
  const payload = {
    esProspecto: true,
    cliente: c.cliente,
    trimester: c.trimester,
    status: c.status,
    dateExpected: c.dateExpected,
    proyectoId: c.proyectoId,
    alert: c.alert,
    detalle: c.detalle,
    rechazado: c.rechazado,
    motivo: c.motivo,
    etapa: c.etapa,
  };
  return {
    codigo_prj: c.id,
    cliente: c.cliente || 'Cliente sin nombre',
    ciudad: 'Por definir',
    descripcion_venta: MG_PREFIX + JSON.stringify(payload),
    fase_actual: 'Recepción',
    etapa_comercial: etapaAppADb(c.etapa),
    motivo_rechazo: c.motivo || null,
    imagen_url: null,
    trazador_responsable: null,
    fecha_entrega: fechaISODeTexto(c.dateExpected),
  };
}

function esFilaProspecto(row, ext) {
  const payload = ext || decodificarPayload(row?.descripcion_venta);
  return payload.esProspecto === true || /^COM-/i.test(String(row?.codigo_prj || ''));
}

function proyectoDesdeFila(row) {
  const ext = decodificarPayload(row.descripcion_venta);
  const proyecto = {
    ...ext,
    id: row.codigo_prj || row.id,
    dbId: row.id,
    name: ext.name || row.cliente || 'Proyecto sin nombre',
    client: row.cliente || ext.client || 'Cliente sin nombre',
    city: row.ciudad || ext.city || 'Por definir',
    image: row.imagen_url || ext.image || DEFAULT_IMAGE,
    manufacturingPhase: faseValida(row.fase_actual, faseValida(ext.manufacturingPhase, 'Recepción')),
    commercialStage: etapaDbAApp(row.etapa_comercial) || ext.commercialStage || 'En Fabricación',
    /* La columna fecha_entrega (tipo fecha) manda sobre el texto del JSON */
    dateExpected: row.fecha_entrega ? formatFechaLarga(parseFecha(row.fecha_entrega)) : (ext.dateExpected || 'Por definir'),
    leadCarpenter: ext.leadCarpenter || row.trazador_responsable || '',
    motivo: row.motivo_rechazo || ext.motivo || '',
    commercialDetail: ext.detalle || ext.commercialDetail || '',
    creadoEn: row.created_at || null,
  };
  if (!proyecto.commercialDetail) proyecto.commercialDetail = `${proyecto.client}: Pedido por definir.`;
  return normalizarProyecto(proyecto);
}

function comercialDesdeFila(row) {
  const ext = decodificarPayload(row.descripcion_venta);
  const etapa = etapaDbAApp(row.etapa_comercial) || ext.etapa || 'Prospectos';
  return normalizarComercial({
    id: row.codigo_prj || row.id,
    dbId: row.id,
    cliente: row.cliente || ext.cliente || 'Cliente sin nombre',
    etapa,
    trimester: ext.trimester || 'Q4 - 2026',
    status: ext.status || EST_PRODUCCION.EN_PROCESO,
    dateExpected: ext.dateExpected || (row.fecha_entrega ? formatFechaLarga(parseFecha(row.fecha_entrega)) : 'Por definir'),
    proyectoId: ext.proyectoId || null,
    alert: ext.alert || '',
    detalle: ext.detalle || `${row.cliente || 'Cliente'}: Pedido por definir.`,
    rechazado: Boolean(ext.rechazado || etapa === 'Prospecto No Continuado'),
    motivo: row.motivo_rechazo || ext.motivo || '',
  });
}

function tareasPlanas() {
  const planas = [];
  Object.entries(state.tareas || {}).forEach(([carpintero, lista]) => {
    (lista || []).forEach((t) => planas.push({ t, carpintero }));
  });
  return planas;
}

function idCarpinteroPorNombre(nombre) {
  const buscado = String(nombre || '').trim().toLowerCase();
  const encontrado = (state.carpinteros || []).find((c) => String(c.nombre || '').trim().toLowerCase() === buscado);
  return encontrado ? encontrado.id : null;
}

function dbIdProyecto(projectId) {
  const p = state.proyectos.find((x) => x.id === projectId);
  return p?.dbId || null;
}

function filaDesdeTarea(t, carpintero) {
  return {
    id: t.id,
    carpintero_id: idCarpinteroPorNombre(carpintero),
    proyecto_id: dbIdProyecto(t.projectId),
    nombre_mueble: t.text,
    fase_manual: faseValida(t.phase, 'Armado'),
    estado_tarea: estadoTrabajoValido(t.estado),
    actividad: ACTIVIDAD_POR_NOMBRE[t.actividad] ? t.actividad : 'Otra',
    detalle: t.detalle || null,
    grupo_id: t.grupoId || null,
    es_lider: Boolean(t.esLider),
  };
}

function hashFila(obj) {
  return JSON.stringify(Object.keys(obj || {}).sort().map((k) => [k, obj[k]]));
}

/* --------------------------------------------------------------------------
   LECTURA / ESCRITURA SUPABASE
   -------------------------------------------------------------------------- */

let sbListo = false;
let syncQueue = Promise.resolve();
/* Fase 2: los muebles viven en public.proyecto_muebles. Si la tabla aún no
   existe (script v5 sin ejecutar) se sigue usando el JSON del proyecto. */
let mueblesEnTabla = false;
/* Fase 2 (parte 2): compras en public.compras (v6); si no existe, JSON. */
let comprasEnTabla = false;
/* Fase 2 (parte 3): incidentes en public.incidentes (v7); si no existe, JSON. */
let incidentesEnTabla = false;
/* v9: estado del trabajo también en los muebles (columna estado_trabajo) */
let mueblesConEstado = false;
/* Fase 2 (parte 4): documentos reales en Storage + public.documentos (v8). */
let documentosEnTabla = false;

let syncSnapshot = {
  proyectos: new Map(),
  pendientes: new Map(),
  tareas: new Map(),
  carpinteros: new Map(),
  finanzas: new Map(),
  muebles: new Map(),
  compras: new Map(),
  incidentes: new Map(),
};

function filaDesdeIncidente(x, p) {
  const compraExiste = (p.pedidos || []).some((od) => od.id === x.compraId);
  return {
    id: x.id,
    proyecto_id: p.dbId || null,
    tipo: TIPOS_INCIDENTE.includes(x.tipo) ? x.tipo : 'Otro',
    gravedad: GRAVEDADES_INCIDENTE.includes(x.gravedad) ? x.gravedad : 'Media',
    descripcion: String(x.descripcion || '').trim() || 'Incidente sin descripción',
    accion: x.accion || null,
    responsable: x.responsable || null,
    detiene_produccion: Boolean(x.detiene),
    estado: ESTADOS_INCIDENTE.includes(x.estado) ? x.estado : 'Abierto',
    fecha_apertura: x.fechaApertura,
    fecha_compromiso: x.fechaCompromiso || null,
    solucion: x.solucion || null,
    dias_impacto: Number(x.diasImpacto) > 0 ? Math.round(Number(x.diasImpacto)) : 0,
    compra_id: compraExiste && esUUID(x.compraId) ? x.compraId : null,
  };
}

function filaDesdeCompra(od, p) {
  const pendienteExiste = (p.pendientes || []).some((x) => x.id === od.pendienteId);
  const fila = {
    id: od.id,
    proyecto_id: p.dbId || null,
    categoria: od.category || null,
    material: String(od.item || '').trim() || 'Material sin descripción',
    cantidad: Number(od.cantidad) > 0 ? Number(od.cantidad) : 1,
    unidad: od.unidad || 'und',
    cantidad_recibida: Number(od.cantidadRecibida) >= 0 ? Number(od.cantidadRecibida) : 0,
    proveedor: String(od.supplier || '').trim() || 'Proveedor por definir',
    numero_guia: od.guide || null,
    fecha_prometida: od.fechaPrometida || null,
    fecha_recibida: od.fechaRecibida || null,
    estado: ESTADOS_COMPRA.includes(od.status) ? od.status : 'Solicitado',
    control_calidad: CALIDAD_COMPRA.includes(od.qc) ? od.qc : 'Pendiente',
    notas: od.notas || null,
    pendiente_id: pendienteExiste && esUUID(od.pendienteId) ? od.pendienteId : null,
  };
  if (od.fechaSolicitud) fila.fecha_solicitud = od.fechaSolicitud;
  return fila;
}

/* Sincroniza filas hijas de proyectos (compras, …) con control de versión.
   items: [{ obj, fila, etiqueta }]. Devuelve los conflictos detectados. */
async function sincronizarHijos(tabla, items, snap) {
  const vistos = new Set();
  const conflictos = [];
  for (const { obj, fila, etiqueta } of items) {
    vistos.add(fila.id);
    const hash = hashFila(fila);
    const prev = snap.get(fila.id);
    if (prev && prev.hash === hash) continue;
    let res;
    if (prev) {
      const { id, ...cambios } = fila;
      let q = supabaseClient.from(tabla).update(cambios).eq('id', id);
      if (Number.isInteger(obj.dbVersion)) q = q.eq('version', obj.dbVersion);
      res = await q.select('id,version');
      if (!res.error && !(res.data || []).length) { conflictos.push(etiqueta); continue; }
    } else {
      res = await supabaseClient.from(tabla).insert(fila).select('id,version');
    }
    if (res.error) { registrarFallo(etiqueta, res.error); continue; }
    const row = (res.data || [])[0];
    if (Number.isInteger(row?.version)) obj.dbVersion = row.version;
    snap.set(fila.id, { hash });
  }
  for (const id of [...snap.keys()]) {
    if (vistos.has(id)) continue;
    const { error } = await supabaseClient.from(tabla).delete().eq('id', id);
    if (error) { registrarFallo(`el borrado en ${tabla}`, error); continue; }
    snap.delete(id);
  }
  return conflictos;
}

function filaDesdeMueble(m, p, orden) {
  return {
    id: m.id,
    proyecto_id: p.dbId || null,
    nombre: String(m.name || '').trim() || 'Mueble sin nombre',
    fase: faseValida(m.manufacturingPhase, 'Recepción'),
    responsable_id: m.carpenter ? idCarpinteroPorNombre(m.carpenter) : null,
    responsable_nombre: m.carpenter || null,
    actividad: ACTIVIDAD_POR_NOMBRE[m.actividad] ? m.actividad : 'Armando',
    detalle: m.detalle || null,
    orden,
    ...(mueblesConEstado ? { estado_trabajo: estadoTrabajoValido(m.estadoTrabajo) } : {}),
  };
}

function construirEstado(proyectos, pendientes, carpinteros, tareas, finanzasRows = [], mueblesRows = null, comprasRows = null, incidentesRows = null) {
  const proyectosApp = [];
  const comercial = [];
  const codigoPorDbId = new Map();

  proyectos.forEach((row) => {
    const ext = decodificarPayload(row.descripcion_venta);
    codigoPorDbId.set(row.id, row.codigo_prj || row.id);
    const item = esFilaProspecto(row, ext) ? comercialDesdeFila(row) : proyectoDesdeFila(row);
    /* Versión de la fila para el control de concurrencia (columna de la v4) */
    item.dbVersion = Number.isInteger(row.version) ? row.version : null;
    if (esFilaProspecto(row, ext)) comercial.push(item);
    else proyectosApp.push(item);
  });

  const pendientesPorProyecto = new Map();
  pendientes.forEach((row) => {
    if (!row.proyecto_id) return;
    if (!pendientesPorProyecto.has(row.proyecto_id)) pendientesPorProyecto.set(row.proyecto_id, []);
    pendientesPorProyecto.get(row.proyecto_id).push(filaAPendiente(row));
  });
  proyectosApp.forEach((p) => {
    p.pendientes = (pendientesPorProyecto.get(p.dbId) || []).map(normalizarPendiente);
    p.alert = p.pendientes[0]?.text || '';
  });

  const carpinterosApp = (carpinteros || []).map((c) => ({
    id: c.id,
    nombre: c.nombre,
    cargo: CARGOS_PERSONAL.includes(c.cargo) ? c.cargo : 'Carpintero',
    activo: c.activo !== false,
  }));
  const nombrePorId = new Map(carpinterosApp.map((c) => [c.id, c.nombre]));

  /* Incidentes desde la tabla (fuente de verdad cuando existe) */
  if (Array.isArray(incidentesRows)) {
    const porProyecto = new Map();
    incidentesRows.forEach((row) => {
      if (!porProyecto.has(row.proyecto_id)) porProyecto.set(row.proyecto_id, []);
      porProyecto.get(row.proyecto_id).push(row);
    });
    proyectosApp.forEach((p) => {
      p.incidentes = (porProyecto.get(p.dbId) || []).map((row, i) => normalizarIncidente({
        id: row.id,
        tipo: row.tipo,
        gravedad: row.gravedad,
        descripcion: row.descripcion,
        accion: row.accion,
        responsable: row.responsable,
        detiene: row.detiene_produccion,
        estado: row.estado,
        fechaApertura: row.fecha_apertura,
        fechaCompromiso: row.fecha_compromiso,
        fechaCierre: row.fecha_cierre,
        solucion: row.solucion,
        diasImpacto: row.dias_impacto,
        compraId: row.compra_id,
        dbVersion: row.version,
      }, i));
    });
  }

  /* Compras desde la tabla (fuente de verdad cuando existe) */
  if (Array.isArray(comprasRows)) {
    const porProyecto = new Map();
    comprasRows.forEach((row) => {
      if (!porProyecto.has(row.proyecto_id)) porProyecto.set(row.proyecto_id, []);
      porProyecto.get(row.proyecto_id).push(row);
    });
    proyectosApp.forEach((p) => {
      p.pedidos = (porProyecto.get(p.dbId) || []).map((row, i) => normalizarPedido({
        id: row.id,
        category: row.categoria,
        item: row.material,
        supplier: row.proveedor,
        guide: row.numero_guia,
        cantidad: Number(row.cantidad),
        unidad: row.unidad,
        cantidadRecibida: Number(row.cantidad_recibida),
        fechaSolicitud: row.fecha_solicitud,
        fechaPrometida: row.fecha_prometida,
        fechaRecibida: row.fecha_recibida,
        status: row.estado,
        qc: row.control_calidad,
        notas: row.notas,
        pendienteId: row.pendiente_id,
        dbVersion: row.version,
      }, i));
    });
  }

  /* Muebles desde la tabla (fuente de verdad cuando existe) */
  if (Array.isArray(mueblesRows)) {
    const porProyecto = new Map();
    mueblesRows.forEach((row) => {
      if (!porProyecto.has(row.proyecto_id)) porProyecto.set(row.proyecto_id, []);
      porProyecto.get(row.proyecto_id).push(row);
    });
    proyectosApp.forEach((p) => {
      p.muebles = (porProyecto.get(p.dbId) || [])
        .sort((a, b) => (a.orden - b.orden) || String(a.created_at).localeCompare(String(b.created_at)))
        .map((row, i) => normalizarMueble({
          id: row.id,
          name: row.nombre,
          carpenter: nombrePorId.get(row.responsable_id) || row.responsable_nombre || '',
          manufacturingPhase: row.fase,
          actividad: row.actividad,
          detalle: row.detalle,
          estadoTrabajo: row.estado_trabajo,
          asignadoEn: row.asignado_en || ((row.responsable_id || row.responsable_nombre) ? row.created_at : null) || null,
          completadoEn: row.completado_en || null,
          dbVersion: row.version,
        }, i));
    });
  }

  const tareasApp = {};
  (tareas || []).forEach((t) => {
    const nombre = nombrePorId.get(t.carpintero_id) || 'Sin asignar';
    if (!tareasApp[nombre]) tareasApp[nombre] = [];
    tareasApp[nombre].push({
      id: esUUID(t.id) ? t.id : nuevoUUID(),
      text: t.nombre_mueble || 'Tarea sin descripción',
      projectId: codigoPorDbId.get(t.proyecto_id) || null,
      phase: faseValida(t.fase_manual, 'Armado'),
      actividad: ACTIVIDAD_POR_NOMBRE[t.actividad] ? t.actividad : 'Otra',
      detalle: t.detalle || '',
      grupoId: t.grupo_id || null,
      esLider: Boolean(t.es_lider),
      estado: estadoTrabajoValido(t.estado_tarea),
      /* Tiempos (v11): los pone la base; antes de la v11 se usa created_at */
      asignadaEn: t.asignada_en || t.created_at || null,
      completadaEn: t.completada_en || null,
    });
  });

  const finanzas = {};
  (finanzasRows || []).forEach((row) => {
    const codigo = codigoPorDbId.get(row.proyecto_id);
    if (codigo) finanzas[codigo] = finanzasDesdeFila(row);
  });

  return { proyectos: proyectosApp, comercial, tareas: tareasApp, carpinteros: carpinterosApp, finanzas };
}

/* --------------------------------------------------------------------------
   FINANZAS (tabla proyectos_finanzas · RLS solo Gerencia)
   -------------------------------------------------------------------------- */

const CAMPOS_FINANZAS = ['valor_venta', 'costo_materiales', 'costo_mano_obra', 'otros_costos', 'anticipo'];

function numeroSeguro(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
}

function finanzasVacias() {
  return { valor_venta: 0, costo_materiales: 0, costo_mano_obra: 0, otros_costos: 0, anticipo: 0, notas: '', archivos_privados: [] };
}

function finanzasDesdeFila(row) {
  const f = finanzasVacias();
  CAMPOS_FINANZAS.forEach((c) => { f[c] = numeroSeguro(row?.[c]); });
  f.notas = row?.notas || '';
  f.archivos_privados = Array.isArray(row?.archivos_privados) ? row.archivos_privados : [];
  return f;
}

function finanzasDe(projectId) {
  return state.finanzas?.[projectId] || finanzasVacias();
}

function calcularFinanzas(f) {
  const costoTotal = numeroSeguro(f.costo_materiales) + numeroSeguro(f.costo_mano_obra) + numeroSeguro(f.otros_costos);
  const venta = numeroSeguro(f.valor_venta);
  const utilidad = venta - costoTotal;
  return {
    costoTotal,
    utilidad,
    margen: venta > 0 ? (utilidad / venta) * 100 : null,
    saldo: venta - numeroSeguro(f.anticipo),
  };
}

const formatoCOP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
function cop(n) {
  return formatoCOP.format(Number(n) || 0);
}

function filaDesdeFinanzas(f, dbId) {
  const fila = { proyecto_id: dbId };
  CAMPOS_FINANZAS.forEach((c) => { fila[c] = numeroSeguro(f[c]); });
  fila.notas = f.notas || null;
  fila.archivos_privados = Array.isArray(f.archivos_privados) ? f.archivos_privados : [];
  return fila;
}

async function leerSupabase() {
  const [prj, pen, car, tar] = await Promise.all([
    supabaseClient.from('proyectos').select('*').order('created_at', { ascending: true }),
    supabaseClient.from('pendientes').select('*').order('created_at', { ascending: true }),
    supabaseClient.from('carpinteros').select('*').order('created_at', { ascending: true }),
    supabaseClient.from('tareas_carpintero').select('*').order('created_at', { ascending: true }),
  ]);
  const error = [prj, pen, car, tar].find((r) => r.error);
  if (error) throw error.error;

  /* Muebles en tabla propia (v5). Si la tabla no existe todavía, se usa el JSON. */
  const mue = await supabaseClient.from('proyecto_muebles').select('*').order('orden', { ascending: true });
  let mueblesRows = null;
  if (mue.error) {
    if (!esTablaInexistente(mue.error)) throw mue.error;
    mueblesEnTabla = false;
  } else {
    mueblesEnTabla = true;
    if ((mue.data || []).length) {
      mueblesConEstado = Object.prototype.hasOwnProperty.call(mue.data[0], 'estado_trabajo');
    } else {
      const sonda = await supabaseClient.from('proyecto_muebles').select('estado_trabajo').limit(1);
      mueblesConEstado = !sonda.error;
    }
    mueblesRows = mue.data || [];
  }

  /* Compras en tabla propia (v6) */
  const com = await supabaseClient.from('compras').select('*').order('created_at', { ascending: true });
  let comprasRows = null;
  if (com.error) {
    if (!esTablaInexistente(com.error)) throw com.error;
    comprasEnTabla = false;
  } else {
    comprasEnTabla = true;
    comprasRows = com.data || [];
  }

  /* Incidentes en tabla propia (v7) */
  const inc = await supabaseClient.from('incidentes').select('*').order('fecha_apertura', { ascending: true });
  let incidentesRows = null;
  if (inc.error) {
    if (!esTablaInexistente(inc.error)) throw inc.error;
    incidentesEnTabla = false;
  } else {
    incidentesEnTabla = true;
    incidentesRows = inc.data || [];
  }

  /* Las finanzas solo se piden si el rol es Gerencia (la RLS igual las
     bloquea para los demás). */
  let finanzasRows = [];
  if (puedeVerFinanzas()) {
    const fin = await supabaseClient.from('proyectos_finanzas').select('*');
    if (fin.error) console.warn('[MODUGAL] No se pudieron leer las finanzas.', fin.error);
    else finanzasRows = fin.data || [];
  }
  const estado = construirEstado(prj.data || [], pen.data || [], car.data || [], tar.data || [], finanzasRows, mueblesRows, comprasRows, incidentesRows);

  /* Documentos (v8). La RLS ya oculta la carpeta financiera a quien no es Gerencia. */
  const doc = await supabaseClient.from('documentos').select('*').order('created_at', { ascending: false });
  if (doc.error) {
    if (!esTablaInexistente(doc.error)) console.warn('[MODUGAL] No se pudieron leer los documentos.', doc.error);
    documentosEnTabla = false;
  } else {
    documentosEnTabla = true;
    const codigoPorDbId = new Map((prj.data || []).map((r) => [r.id, r.codigo_prj]));
    estado.documentos = {};
    (doc.data || []).forEach((d) => {
      const codigo = codigoPorDbId.get(d.proyecto_id);
      if (!codigo) return;
      if (d.carpeta === 'financiera' && !puedeVerFinanzas()) return;
      (estado.documentos[codigo] = estado.documentos[codigo] || []).push(d);
    });
  }
  return estado;
}

function esTablaInexistente(error) {
  return ['42P01', 'PGRST205', 'PGRST200'].includes(error?.code) || /does not exist|could not find/i.test(error?.message || '');
}

function reconstruirSnapshot() {
  syncSnapshot = {
    proyectos: new Map(),
    pendientes: new Map(),
    tareas: new Map(),
    carpinteros: new Map(),
    finanzas: new Map(),
    muebles: new Map(),
    compras: new Map(),
    incidentes: new Map(),
  };
  if (incidentesEnTabla) {
    state.proyectos.forEach((p) => (p.incidentes || []).forEach((x) => {
      syncSnapshot.incidentes.set(x.id, { hash: hashFila(filaDesdeIncidente(x, p)) });
    }));
  }
  if (comprasEnTabla) {
    state.proyectos.forEach((p) => (p.pedidos || []).forEach((od) => {
      syncSnapshot.compras.set(od.id, { hash: hashFila(filaDesdeCompra(od, p)) });
    }));
  }
  if (mueblesEnTabla) {
    state.proyectos.forEach((p) => (p.muebles || []).forEach((m, i) => {
      syncSnapshot.muebles.set(m.id, { hash: hashFila(filaDesdeMueble(m, p, i)) });
    }));
  }
  Object.entries(state.finanzas || {}).forEach(([codigo, f]) => {
    syncSnapshot.finanzas.set(codigo, { hash: hashFila(filaDesdeFinanzas(f, null)) });
  });
  state.proyectos.forEach((p) => {
    syncSnapshot.proyectos.set(p.id, { hash: hashFila(filaDesdeProyecto(p)), dbId: p.dbId || null });
  });
  state.comercial.forEach((c) => {
    syncSnapshot.proyectos.set(c.id, { hash: hashFila(filaDesdeProspecto(c)), dbId: c.dbId || null });
  });
  state.proyectos.forEach((p) => {
    (p.pendientes || []).forEach((x) => {
      syncSnapshot.pendientes.set(x.id, {
        hash: hashFila({ id: x.id, proyecto_id: p.dbId || null, descripcion: descripcionPendiente(x), estado: x.estado || 'Pendiente' }),
      });
    });
  });
  tareasPlanas().forEach(({ t, carpintero }) => {
    syncSnapshot.tareas.set(t.id, { hash: hashFila(filaDesdeTarea(t, carpintero)) });
  });
  (state.carpinteros || []).forEach((c) => syncSnapshot.carpinteros.set(c.nombre, { id: c.id }));
}

async function sincronizarEstado() {
  if (!sbListo) return;
  ultimoErrorSync = null;

  const locales = [
    ...state.proyectos.map((item) => ({ item, esProspecto: false })),
    ...state.comercial.map((item) => ({ item, esProspecto: true })),
  ];
  const codigosVistos = new Set();

  /* 1. Proyectos y prospectos
        - Existentes: UPDATE condicionado a la versión que este usuario cargó.
          Si otra persona guardó antes, no se pisa: se marca conflicto.
        - Nuevos: INSERT; si el código ya lo tomó otra persona, se renombra. */
  const conflictos = [];
  for (const { item, esProspecto } of locales) {
    if (!item.id) continue;
    let fila = esProspecto ? filaDesdeProspecto(item) : filaDesdeProyecto(item);
    const hash = hashFila(fila);
    const prev = syncSnapshot.proyectos.get(item.id);
    codigosVistos.add(item.id);
    if (prev && prev.hash === hash && prev.dbId && !item._motivoCambio) {
      item.dbId = prev.dbId;
      continue;
    }
    const conMotivo = item._motivoCambio ? { ...fila, motivo_cambio: item._motivoCambio } : fila;
    const dbId = prev?.dbId || item.dbId;
    let res;
    if (dbId) {
      let q = supabaseClient.from('proyectos').update(conMotivo).eq('id', dbId);
      if (Number.isInteger(item.dbVersion)) q = q.eq('version', item.dbVersion);
      res = await q.select('id,codigo_prj,version');
      if (!res.error && !(res.data || []).length) {
        conflictos.push(item.id);
        continue;
      }
    } else {
      res = await supabaseClient.from('proyectos').insert(conMotivo).select('id,codigo_prj,version');
      if (res.error?.code === '23505') {
        /* Otra persona creó un proyecto con el mismo código: se toma el siguiente libre */
        const anterior = item.id;
        const nuevo = await siguienteCodigoLibre(esProspecto ? 'COM' : 'PRJ');
        renombrarCodigo(item, anterior, nuevo);
        codigosVistos.delete(anterior);
        codigosVistos.add(nuevo);
        fila = esProspecto ? filaDesdeProspecto(item) : filaDesdeProyecto(item);
        res = await supabaseClient.from('proyectos')
          .insert(item._motivoCambio ? { ...fila, motivo_cambio: item._motivoCambio } : fila)
          .select('id,codigo_prj,version');
        if (!res.error) showToast(`El código ${anterior} ya estaba en uso: tu registro quedó como ${nuevo}.`);
      }
    }
    if (res.error) {
      registrarFallo('el proyecto ' + item.id, res.error);
      continue;
    }
    const row = (res.data || [])[0];
    if (row?.id) item.dbId = row.id;
    if (Number.isInteger(row?.version)) item.dbVersion = row.version;
    delete item._motivoCambio;
    syncSnapshot.proyectos.set(item.id, { hash: hashFila(fila), dbId: item.dbId || null });
  }
  if (conflictos.length) {
    showToast(`${conflictos.join(', ')}: otra persona lo modificó (o no tienes permiso). Se cargó la versión más reciente; revisa y vuelve a aplicar tu cambio.`);
    setTimeout(() => recargarTrasConflicto(), 0);
  }

  /* 2. Proyectos eliminados */
  for (const [codigo, meta] of [...syncSnapshot.proyectos]) {
    if (codigosVistos.has(codigo)) continue;
    if (meta.dbId) {
      /* La base borra en cascada pendientes, tareas, muebles, compras, incidentes y documentos */
      const res = await supabaseClient.from('proyectos').delete().eq('id', meta.dbId).select('id');
      if (res.error || !(res.data || []).length) {
        syncSnapshot.proyectos.delete(codigo);
        showToast(`No se pudo eliminar ${codigo}: ${mensajeError(res.error, 'sin permiso')}. Se recargan los datos.`);
        setTimeout(() => recargarTrasConflicto(), 0);
        continue;
      }
    }
    syncSnapshot.proyectos.delete(codigo);
  }

  /* 3. Personal: solo Gerencia lo registra (módulo Equipo > Personal).
        La sincronización ya no crea carpinteros a partir de nombres libres. */

  /* 4. Pendientes: se resuelven por proyecto_id para refrescar todas las vistas */
  const pendientesActuales = [];
  state.proyectos.forEach((p) => (p.pendientes || []).forEach((x) => pendientesActuales.push({ p, x })));
  const idsPendientes = new Set();

  for (const { p, x } of pendientesActuales) {
    if (!p.dbId) continue;
    const fila = {
      id: x.id,
      proyecto_id: p.dbId,
      descripcion: descripcionPendiente(x),
      estado: x.estado === 'Resuelto' ? 'Resuelto' : 'Pendiente',
    };
    const hash = hashFila(fila);
    const prev = syncSnapshot.pendientes.get(x.id);
    idsPendientes.add(x.id);
    if (prev && prev.hash === hash) continue;
    const query = prev
      ? supabaseClient.from('pendientes').update({
        proyecto_id: fila.proyecto_id,
        descripcion: fila.descripcion,
        estado: fila.estado,
      }).eq('id', x.id)
      : supabaseClient.from('pendientes').insert(fila);
    const { error } = await query;
    if (error) {
      registrarFallo('el pendiente ' + x.id, error);
      continue;
    }
    syncSnapshot.pendientes.set(x.id, { hash });
  }

  for (const id of [...syncSnapshot.pendientes.keys()]) {
    if (idsPendientes.has(id)) continue;
    const { error } = await supabaseClient.from('pendientes').delete().eq('id', id);
    if (!error) syncSnapshot.pendientes.delete(id);
  }

  /* 5. Tareas de carpinteros */
  const tareasActuales = tareasPlanas();
  const idsTareas = new Set();

  for (const { t, carpintero } of tareasActuales) {
    const fila = filaDesdeTarea(t, carpintero);
    /* Se marca antes de cualquier "continue" para que nunca se borre de la
       base una tarea solo porque su personal no se encontró localmente. */
    idsTareas.add(t.id);
    if (!fila.carpintero_id) continue;
    const hash = hashFila(fila);
    const prev = syncSnapshot.tareas.get(t.id);
    if (prev && prev.hash === hash) continue;
    const query = prev
      ? supabaseClient.from('tareas_carpintero').update({
        carpintero_id: fila.carpintero_id,
        proyecto_id: fila.proyecto_id,
        nombre_mueble: fila.nombre_mueble,
        fase_manual: fila.fase_manual,
        estado_tarea: fila.estado_tarea,
        actividad: fila.actividad,
        detalle: fila.detalle,
        grupo_id: fila.grupo_id,
        es_lider: fila.es_lider,
      }).eq('id', t.id)
      : supabaseClient.from('tareas_carpintero').insert(fila);
    const { error } = await query;
    if (error) {
      registrarFallo('la tarea ' + t.id, error);
      continue;
    }
    syncSnapshot.tareas.set(t.id, { hash });
  }

  for (const id of [...syncSnapshot.tareas.keys()]) {
    if (idsTareas.has(id)) continue;
    const { error } = await supabaseClient.from('tareas_carpintero').delete().eq('id', id);
    if (!error) syncSnapshot.tareas.delete(id);
  }

  /* 5b. Muebles (tabla proyecto_muebles, con control de versión) */
  if (mueblesEnTabla) {
    const vistos = new Set();
    const conflictosMuebles = [];
    for (const p of state.proyectos) {
      if (!p.dbId) continue;
      for (const [i, m] of (p.muebles || []).entries()) {
        if (!esUUID(m.id)) m.id = nuevoUUID();
        vistos.add(m.id);
        const fila = filaDesdeMueble(m, p, i);
        const hash = hashFila(fila);
        const prev = syncSnapshot.muebles.get(m.id);
        if (prev && prev.hash === hash) continue;
        let res;
        if (prev) {
          const { id, ...cambios } = fila;
          let q = supabaseClient.from('proyecto_muebles').update(cambios).eq('id', id);
          if (Number.isInteger(m.dbVersion)) q = q.eq('version', m.dbVersion);
          res = await q.select('id,version');
          if (!res.error && !(res.data || []).length) { conflictosMuebles.push(`${p.id} · ${m.name}`); continue; }
        } else {
          res = await supabaseClient.from('proyecto_muebles').insert(fila).select('id,version');
        }
        if (res.error) { registrarFallo(`el mueble ${m.name}`, res.error); continue; }
        const row = (res.data || [])[0];
        if (Number.isInteger(row?.version)) m.dbVersion = row.version;
        syncSnapshot.muebles.set(m.id, { hash });
      }
    }
    for (const id of [...syncSnapshot.muebles.keys()]) {
      if (vistos.has(id)) continue;
      const { error } = await supabaseClient.from('proyecto_muebles').delete().eq('id', id);
      if (error) { registrarFallo('el borrado de un mueble', error); continue; }
      syncSnapshot.muebles.delete(id);
    }
    if (conflictosMuebles.length) {
      showToast(`${conflictosMuebles.join(', ')}: otra persona lo modificó. Se cargó la versión más reciente.`);
      setTimeout(() => recargarTrasConflicto(), 0);
    }
  }

  /* 5c. Compras de material (tabla compras, con control de versión) */
  if (comprasEnTabla) {
    const items = [];
    state.proyectos.forEach((p) => {
      if (!p.dbId) return;
      (p.pedidos || []).forEach((od) => {
        if (!esUUID(od.id)) od.id = nuevoUUID();
        items.push({ obj: od, fila: filaDesdeCompra(od, p), etiqueta: `${p.id} · ${od.item}` });
      });
    });
    const conflictosCompras = await sincronizarHijos('compras', items, syncSnapshot.compras);
    if (conflictosCompras.length) {
      showToast(`${conflictosCompras.join(', ')}: otra persona la actualizó. Se cargó la versión más reciente.`);
      setTimeout(() => recargarTrasConflicto(), 0);
    }
  }

  /* 5d. Incidentes (después de compras: pueden apuntar a una compra nueva) */
  if (incidentesEnTabla) {
    const items = [];
    state.proyectos.forEach((p) => {
      if (!p.dbId) return;
      (p.incidentes || []).forEach((x) => {
        if (!esUUID(x.id)) x.id = nuevoUUID();
        items.push({ obj: x, fila: filaDesdeIncidente(x, p), etiqueta: `${p.id} · incidente "${x.descripcion}"` });
      });
    });
    const conflictosInc = await sincronizarHijos('incidentes', items, syncSnapshot.incidentes);
    if (conflictosInc.length) {
      showToast(`${conflictosInc.join(', ')}: otra persona lo actualizó. Se cargó la versión más reciente.`);
      setTimeout(() => recargarTrasConflicto(), 0);
    }
  }

  /* 6. Finanzas (solo Gerencia; la RLS rechaza a cualquier otro rol) */
  if (puedeVerFinanzas()) {
    for (const [codigo, f] of Object.entries(state.finanzas || {})) {
      const dbId = dbIdProyecto(codigo);
      if (!dbId) continue;
      const hash = hashFila(filaDesdeFinanzas(f, null));
      if (syncSnapshot.finanzas.get(codigo)?.hash === hash) continue;
      const { error } = await supabaseClient
        .from('proyectos_finanzas')
        .upsert(filaDesdeFinanzas(f, dbId), { onConflict: 'proyecto_id' });
      if (error) {
        registrarFallo('las finanzas de ' + codigo, error);
        continue;
      }
      syncSnapshot.finanzas.set(codigo, { hash });
    }
  }
}

let ultimoErrorSync = null;

/* --------------------------------------------------------------------------
   ESTADO DE SINCRONIZACIÓN visible + reintentos seguros
   La sincronización compara contra el último estado confirmado (snapshot),
   así que reintentar solo reenvía lo que no se pudo guardar.
   -------------------------------------------------------------------------- */
let syncPendientes = 0;
let syncFallos = 0;
let syncConError = false;
let syncReintentos = 0;
let syncReintentoTimer = null;
let syncUltimoOk = null;
const ESPERAS_REINTENTO = [5, 15, 30, 60];

function registrarFallo(que, error) {
  syncFallos += 1;
  console.error(`[MODUGAL] No se pudo guardar ${que}`, error);
}

function encolarSync(fn) {
  if (!sbListo) return syncQueue;
  syncPendientes += 1;
  pintarEstadoSync();
  syncQueue = syncQueue
    .then(async () => {
      syncFallos = 0;
      await fn();
      if (syncFallos > 0) throw new Error(`${syncFallos} cambio(s) no se pudieron guardar`);
      syncConError = false;
      syncReintentos = 0;
      syncUltimoOk = new Date();
    })
    .catch((e) => {
      ultimoErrorSync = e;
      console.error('[MODUGAL] Error de sincronización con Supabase:', e);
      if (!syncConError && typeof showToast === 'function') {
        showToast('Hay cambios sin guardar en la nube. Se reintentará automáticamente.');
      }
      syncConError = true;
      programarReintento();
    })
    .finally(() => {
      syncPendientes -= 1;
      pintarEstadoSync();
    });
  return syncQueue;
}

function programarReintento() {
  clearTimeout(syncReintentoTimer);
  if (!navigator.onLine) return; /* se reintenta en el evento 'online' */
  const espera = ESPERAS_REINTENTO[Math.min(syncReintentos, ESPERAS_REINTENTO.length - 1)];
  syncReintentos += 1;
  syncReintentoTimer = setTimeout(reintentarSync, espera * 1000);
}

function reintentarSync() {
  clearTimeout(syncReintentoTimer);
  if (syncConError && sbListo && state.user) encolarSync(sincronizarEstado);
}

function pintarEstadoSync() {
  const el = document.getElementById('mg-sync');
  if (!el) return;
  let icono; let texto; let cls; let titulo;
  if (!state.user) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  if (!navigator.onLine) {
    icono = 'fa-wifi'; texto = 'Sin conexión'; cls = 'mg-sync--alerta';
    titulo = 'Sin internet. Tus cambios se guardarán al volver la conexión.';
  } else if (!sbListo) {
    icono = 'fa-database'; texto = 'Modo local'; cls = 'mg-sync--alerta';
    titulo = 'No hay conexión con la base de datos: los cambios no se están guardando en la nube.';
  } else if (syncPendientes > 0) {
    icono = 'fa-rotate fa-spin'; texto = 'Guardando…'; cls = 'mg-sync--trabajando';
    titulo = 'Sincronizando con la nube';
  } else if (syncConError) {
    icono = 'fa-triangle-exclamation'; texto = 'Sin guardar · Reintentar'; cls = 'mg-sync--error';
    titulo = 'Algunos cambios no se guardaron. Clic para reintentar ahora.';
  } else {
    icono = 'fa-check'; texto = 'Guardado'; cls = 'mg-sync--ok';
    titulo = syncUltimoOk ? `Último guardado: ${syncUltimoOk.toLocaleTimeString('es-CO')}` : 'Todo está guardado';
  }
  el.className = `mg-sync ${cls}`;
  el.title = titulo;
  el.innerHTML = `<i class="fas ${icono}" aria-hidden="true"></i><span class="hidden sm:inline">${texto}</span>`;
  el.setAttribute('aria-label', titulo);
}

function hayCambiosSinGuardar() {
  return Boolean(state.user) && (syncPendientes > 0 || syncConError);
}

function bindEstadoSync() {
  document.getElementById('mg-sync')?.addEventListener('click', () => {
    if (syncConError) reintentarSync();
  });
  window.addEventListener('online', () => {
    pintarEstadoSync();
    if (syncConError) reintentarSync();
    else if (state.user) programarRecargaRemota();
  });
  window.addEventListener('offline', pintarEstadoSync);
  /* Aviso del navegador si se intenta cerrar con cambios sin guardar */
  window.addEventListener('beforeunload', (e) => {
    if (!hayCambiosSinGuardar()) return;
    e.preventDefault();
    e.returnValue = '';
  });
}

/* Códigos únicos aunque dos personas creen registros al mismo tiempo */
async function siguienteCodigoLibre(prefijo) {
  const { data } = await supabaseClient.from('proyectos').select('codigo_prj').like('codigo_prj', `${prefijo}-%`);
  const nums = [...(data || []).map((r) => r.codigo_prj), ...state.proyectos.map((p) => p.id), ...state.comercial.map((c) => c.id)]
    .filter((c) => String(c || '').startsWith(`${prefijo}-`))
    .map((c) => parseInt(String(c).replace(/\D/g, ''), 10))
    .filter((n) => !isNaN(n));
  const max = nums.length ? Math.max(...nums) : 0;
  return `${prefijo}-${String(max + 1).padStart(3, '0')}`;
}

function renombrarCodigo(item, anterior, nuevo) {
  item.id = nuevo;
  Object.values(state.tareas || {}).forEach((lista) => (lista || []).forEach((t) => { if (t.projectId === anterior) t.projectId = nuevo; }));
  state.comercial.forEach((c) => { if (c.proyectoId === anterior) c.proyectoId = nuevo; });
  if (state.finanzas?.[anterior]) {
    state.finanzas[nuevo] = state.finanzas[anterior];
    delete state.finanzas[anterior];
  }
  if (state.fichaId === anterior) state.fichaId = nuevo;
  guardarCacheLocal();
  renderAll();
}

/* Tras un conflicto se descarta la copia local y se carga la de la base */
function recargarTrasConflicto() {
  encolarSync(async () => {
    const data = await leerSupabase();
    if (!state.user) return;
    aplicarDatos(data);
    reconstruirSnapshot();
    guardarCacheLocal();
    renderAll();
    refrescarFichaAbierta();
  });
}

/* --------------------------------------------------------------------------
   TIEMPO REAL · Supabase Realtime (postgres_changes)
   Cuando otro dispositivo modifica proyectos, pendientes, carpinteros o
   tareas, se recarga el estado completo desde la base y se re-renderiza.
   Requiere que las tablas estén en la publicación `supabase_realtime`.
   -------------------------------------------------------------------------- */

const RT_TABLAS = ['proyectos', 'pendientes', 'carpinteros', 'tareas_carpintero', 'proyecto_muebles', 'compras', 'incidentes', 'documentos']
  .concat(MODULO_CONTABLE ? ['proyectos_finanzas'] : []);
let rtCanal = null;
let rtTimer = null;
let rtVisibilidadLista = false;

function usuarioEditando() {
  const el = document.activeElement;
  if (!el) return false;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable;
}

function programarRecargaRemota() {
  clearTimeout(rtTimer);
  /* Agrupa ráfagas de eventos (un guardado toca varias tablas) */
  rtTimer = setTimeout(() => {
    /* No pisar lo que el usuario está escribiendo: reintentar luego */
    if (usuarioEditando()) return programarRecargaRemota();
    if (!sbListo || !state.user) return;
    /* Si hay cambios locales sin guardar, primero se reintenta guardarlos:
       recargar desde la base los borraría. */
    if (syncConError) { reintentarSync(); return; }
    encolarSync(async () => {
      const data = await leerSupabase();
      if (!state.user) return; /* la sesión se cerró mientras se leía */
      aplicarDatos(data);
      reconstruirSnapshot();
      guardarCacheLocal();
      renderAll();
      refrescarFichaAbierta();
    });
  }, 700);
}

function iniciarTiempoReal() {
  if (!sbListo || rtCanal) return;
  rtCanal = supabaseClient.channel('modugal-sync');
  RT_TABLAS.forEach((tabla) => {
    rtCanal.on('postgres_changes', { event: '*', schema: 'public', table: tabla }, programarRecargaRemota);
  });
  /* usuarios: Gerencia recibe todas las filas (panel de aprobación); los
     demás solo la suya (la RLS filtra), para enterarse si cambian su rol. */
  rtCanal.on('postgres_changes', { event: '*', schema: 'public', table: 'usuarios' }, (payload) => {
    const id = payload.new?.id || payload.old?.id;
    if (id && id === state.user?.id) refrescarPerfilPropio();
    if (esGerencia()) cargarUsuarios();
  });
  rtCanal.subscribe((status) => {
    if (status === 'SUBSCRIBED') console.info('[MODUGAL] Tiempo real activo.');
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      console.warn('[MODUGAL] Tiempo real no disponible:', status);
    }
  });

  /* Al volver a la pestaña (p. ej. celular que estuvo bloqueado) se refresca */
  if (!rtVisibilidadLista) {
    rtVisibilidadLista = true;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && sbListo && state.user) programarRecargaRemota();
    });
  }
}

function detenerTiempoReal() {
  clearTimeout(rtTimer);
  if (rtCanal) {
    supabaseClient.removeChannel(rtCanal);
    rtCanal = null;
  }
}

async function refrescarPendientesProyecto(projectId) {
  if (!sbListo) return;
  const p = state.proyectos.find((x) => x.id === projectId);
  if (!p?.dbId) return;
  const dbId = p.dbId;
  encolarSync(async () => {
    if (ultimoErrorSync) return;
    const { data, error } = await supabaseClient.from('pendientes').select('*').eq('proyecto_id', dbId).order('created_at', { ascending: true });
    if (error || !Array.isArray(data)) return;
    const actual = state.proyectos.find((x) => x.id === projectId);
    if (!actual) return;
    actual.pendientes = data.map(filaAPendiente);
    actual.alert = actual.pendientes[0]?.text || '';
    data.forEach((row) => {
      syncSnapshot.pendientes.set(row.id, {
        hash: hashFila({ id: row.id, proyecto_id: row.proyecto_id, descripcion: row.descripcion, estado: row.estado }),
      });
    });
    renderAll();
  });
}

/* --------------------------------------------------------------------------
   CARGA INICIAL · CACHE LOCAL DE RESPALDO
   -------------------------------------------------------------------------- */

function estadoVacio() {
  return { proyectos: [], comercial: [], tareas: {}, carpinteros: [], finanzas: {}, usuarios: [] };
}

function aplicarDatos(data) {
  state.proyectos = data.proyectos || [];
  state.comercial = data.comercial || [];
  state.tareas = data.tareas || {};
  state.carpinteros = data.carpinteros || [];
  state.finanzas = puedeVerFinanzas() ? (data.finanzas || {}) : {};
  if (data.documentos) state.documentos = data.documentos;
  registrarTiemposVistos();
}

function cargarEstadoLocal() {
  const key = storageKey();
  if (!key) return estadoVacio();
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const data = JSON.parse(raw);
      if (data && Array.isArray(data.proyectos) && Array.isArray(data.comercial)) {
        return {
          proyectos: data.proyectos.map(normalizarProyecto).filter(Boolean),
          comercial: data.comercial.map(normalizarComercial).filter(Boolean),
          tareas: data.tareas && typeof data.tareas === 'object' ? data.tareas : {},
          carpinteros: Array.isArray(data.carpinteros) ? data.carpinteros : [],
          finanzas: data.finanzas && typeof data.finanzas === 'object' ? data.finanzas : {},
        };
      }
    }
  } catch (e) {
    console.warn('[MODUGAL] Error leyendo el cache local.', e);
  }
  return estadoVacio();
}

async function cargarEstado() {
  try {
    const data = await leerSupabase();
    sbListo = true;
    return data;
  } catch (e) {
    console.error('[MODUGAL] Supabase no disponible; se usa el cache local.', e);
    sbListo = false;
    return cargarEstadoLocal();
  }
}

function guardarCacheLocal() {
  const key = storageKey();
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify({
      proyectos: state.proyectos,
      comercial: state.comercial,
      tareas: state.tareas,
      carpinteros: state.carpinteros,
      finanzas: puedeVerFinanzas() ? state.finanzas : {},
      savedAt: new Date().toISOString(),
    }));
  } catch (e) {
    console.warn('[MODUGAL] No se pudo escribir el cache local.', e);
  }
}

function commit() {
  actualizarTiemposLocales();
  guardarCacheLocal();
  renderAll();
  encolarSync(sincronizarEstado);
}

function generarIdProyecto() {
  const nums = state.proyectos
    .map((p) => parseInt(String(p.id || '').replace(/\D/g, ''), 10))
    .filter((n) => !isNaN(n));
  const max = nums.length ? Math.max(...nums) : 0;
  return `PRJ-${String(max + 1).padStart(3, '0')}`;
}

function generarIdComercial() {
  const nums = state.comercial
    .map((c) => parseInt(String(c.id || '').replace(/\D/g, ''), 10))
    .filter((n) => !isNaN(n));
  const max = nums.length ? Math.max(...nums, 4) : 4;
  return `COM-${String(max + 1).padStart(3, '0')}`;
}

function detalleProyecto(p) {
  if (p.commercialDetail) return p.commercialDetail;
  const muebles = (p.muebles || []).map((m) => m.name).filter(Boolean);
  return `${p.client || p.name || 'Cliente'}: ${muebles.length ? muebles.join(' + ') : 'Pedido por definir'}`;
}

function etapaComercialProyecto(p) {
  if (ETAPAS_COMERCIAL.includes(p.commercialStage) && p.commercialStage !== 'Prospecto No Continuado') return p.commercialStage;
  if (p.status === EST_PRODUCCION.COMPLETADO) return 'Garantías';
  return 'En Fabricación';
}

function completitudFicha(p) {
  const checks = [p.name, p.client, p.city, p.address, p.phone, p.leadCarpenter, p.dateExpected, p.manufacturingPhase, p.image];
  let ok = 0;
  checks.forEach((c) => { if (c !== undefined && c !== null && c !== '' && c !== 'Por definir') ok++; });
  if (Array.isArray(p.muebles) && p.muebles.length > 0) ok++;
  if (Array.isArray(p.pedidos) && p.pedidos.length > 0) ok++;
  return Math.round((ok / (checks.length + 2)) * 100);
}

/* Solo el personal registrado por Gerencia y activo */
function personalActivo() {
  return (state.carpinteros || [])
    .filter((c) => c.activo !== false && c.nombre)
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
}

function carpentersList() {
  return personalActivo().map((c) => c.nombre);
}

function cargoDe(nombre) {
  return (state.carpinteros || []).find((c) => c.nombre === nombre)?.cargo || null;
}

/* <option>s de personal; incluye el valor actual aunque ya no esté activo */
function opcionesPersonal(actual, vacio = 'Seleccionar personal...') {
  const lista = personalActivo();
  let html = `<option value="">${esc(vacio)}</option>`;
  CARGOS_PERSONAL.forEach((cargo) => {
    const grupo = lista.filter((c) => c.cargo === cargo);
    if (!grupo.length) return;
    html += `<optgroup label="${esc(cargo)}">${grupo.map((c) => `<option value="${esc(c.nombre)}" ${c.nombre === actual ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}</optgroup>`;
  });
  if (actual && !lista.some((c) => c.nombre === actual)) {
    html += `<option value="${esc(actual)}" selected>${esc(actual)} (no registrado)</option>`;
  }
  return html;
}

function proyectosActivos() {
  return state.proyectos.filter((p) => p.status !== EST_PRODUCCION.COMPLETADO);
}

function primerPendiente(p) {
  return (p.pendientes || [])[0] || null;
}

function showToast(mensaje) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = mensaje;
  el.classList.remove('is-hidden');
  requestAnimationFrame(() => el.classList.add('show'));
  clearTimeout(window.__mgToastTimer);
  window.__mgToastTimer = setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.classList.add('is-hidden'), 220);
  }, 2800);
}

/* ==========================================================================
   5. AUTENTICACIÓN · SESIÓN · TEMA · PERMISOS
   ========================================================================== */

/* --------------------------------------------------------------------------
   Supabase Auth
   - La sesión la guarda y renueva el SDK (no localStorage propio).
   - El rol se lee de public.usuarios (fila creada por un trigger al
     registrarse). El cargo elegido al registrarse queda como
     `cargo_solicitado`; Gerencia lo aprueba asignando `rol`.
   - Las políticas RLS de la base son las que realmente protegen los datos;
     los permisos de la UI solo ocultan lo que el rol no puede hacer.
   -------------------------------------------------------------------------- */

let sesionUserId = null;      /* usuario cuyo estado está cargado */
let entrandoSesion = null;    /* evita cargas dobles (getSession + onAuthStateChange) */

const MENSAJES_AUTH = {
  'Invalid login credentials': 'Correo o contraseña incorrectos.',
  'Email not confirmed': 'Debes confirmar tu correo antes de ingresar. Revisa tu bandeja de entrada.',
  'User already registered': 'Ese correo ya tiene una cuenta. Inicia sesión.',
  'Password should be at least 6 characters.': 'La contraseña debe tener mínimo 8 caracteres, con letras y números.',
};

function traducirErrorAuth(error) {
  const msg = String(error?.message || error || 'Error desconocido');
  if (MENSAJES_AUTH[msg]) return MENSAJES_AUTH[msg];
  if (/rate limit/i.test(msg)) return 'Demasiados intentos. Espera un momento e inténtalo de nuevo.';
  if (/password/i.test(msg) && /characters/i.test(msg)) return 'La contraseña es muy corta (mínimo 8 caracteres, con letras y números).';
  if (/fetch|network/i.test(msg)) return 'Sin conexión con el servidor. Revisa tu internet.';
  return msg;
}

function urlRetorno() {
  /* En la app nativa el origen es "localhost": los correos deben llevar a la web */
  if (esAppNativa()) return URL_WEB_PUBLICA;
  return window.location.origin + window.location.pathname;
}

async function iniciarSesion(email, password) {
  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, msg: traducirErrorAuth(error) };
  /* onAuthStateChange(SIGNED_IN) se encarga de cargar perfil y datos */
  return { ok: true };
}

async function registrar(email, password, cargo, nombre, confirmacion) {
  const mail = String(email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) return { ok: false, msg: 'Correo electrónico inválido.' };
  const problemaClave = validarClaveNueva(password, mail);
  if (problemaClave) return { ok: false, msg: problemaClave };
  if (password !== confirmacion) return { ok: false, msg: 'Las contraseñas no coinciden.' };
  if (!String(nombre || '').trim()) return { ok: false, msg: 'Escribe tu nombre completo.' };
  const { data, error } = await supabaseClient.auth.signUp({
    email: mail,
    password,
    options: {
      data: { nombre: String(nombre).trim(), cargo: ROLES_VALIDOS.includes(cargo) ? cargo : 'arquitecto' },
      emailRedirectTo: urlRetorno(),
    },
  });
  if (error) return { ok: false, msg: traducirErrorAuth(error) };
  /* Supabase no devuelve error si el correo ya existe (protección contra
     enumeración); en ese caso `identities` llega vacío. */
  if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    return { ok: false, msg: 'Ese correo ya tiene una cuenta. Inicia sesión o recupera tu contraseña.' };
  }
  if (!data?.session) {
    return { ok: true, pendienteConfirmacion: true, msg: `Te enviamos un correo a ${mail}. Confírmalo; luego Gerencia aprobará tu acceso.` };
  }
  return { ok: true };
}

async function cargarPerfil(authUser) {
  const { data, error } = await supabaseClient
    .from('usuarios')
    .select('id,email,nombre,rol,cargo_solicitado,estado_aprobacion')
    .eq('id', authUser.id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

function motivoBloqueoPerfil(perfil) {
  if (!perfil) return 'Tu cuenta no tiene perfil en MODUGAL. Pide a Gerencia que revise la tabla de usuarios.';
  switch (perfil.estado_aprobacion) {
    case 'aprobado': return null;
    case 'pendiente':
      return `Tu cuenta está pendiente de aprobación. Gerencia revisará tu solicitud como ${labelCargo(perfil.cargo_solicitado || 'arquitecto')} y podrás ingresar cuando la apruebe.`;
    case 'rechazado': return 'Tu solicitud de acceso fue rechazada. Comunícate con Gerencia.';
    case 'suspendido': return 'Tu cuenta está suspendida. Comunícate con Gerencia.';
    default: return 'Tu cuenta no está habilitada. Comunícate con Gerencia.';
  }
}

/* Gerencia cambió mi rol o mi estado mientras tenía la app abierta */
async function refrescarPerfilPropio() {
  if (!state.user) return;
  let perfil;
  try {
    perfil = await cargarPerfil({ id: state.user.id });
  } catch (e) {
    return;
  }
  const bloqueo = motivoBloqueoPerfil(perfil);
  if (bloqueo) {
    await cerrarSesion();
    mostrarErrorLogin(bloqueo, 'error');
    return;
  }
  const nuevoRol = ROLES_VALIDOS.includes(perfil.rol) ? perfil.rol : 'arquitecto';
  state.user.nombre = perfil.nombre || state.user.nombre;
  if (nuevoRol !== state.rol) {
    state.rol = nuevoRol;
    state.user.cargo = nuevoRol;
    aplicarPermisosUI();
    switchTab(state.tab);
    showToast(`Gerencia actualizó tu perfil: ahora eres ${labelCargo(nuevoRol)}.`);
    programarRecargaRemota();
  }
  updateUserChip();
}

async function entrarConSesion(authUser) {
  if (!authUser) return;
  if (enRecuperacion()) { exigirNuevaContrasena(); return; }
  if (sesionUserId === authUser.id) return;
  if (entrandoSesion) return entrandoSesion;

  entrandoSesion = (async () => {
    let perfil = null;
    try {
      perfil = await cargarPerfil(authUser);
    } catch (e) {
      console.error('[MODUGAL] No se pudo leer el perfil.', e);
      mostrarErrorLogin('No se pudo verificar tu perfil (la base de datos no está configurada o no hay conexión). Intenta de nuevo en un momento.');
      await supabaseClient.auth.signOut();
      return;
    }
    const bloqueo = motivoBloqueoPerfil(perfil);
    if (bloqueo) {
      mostrarErrorLogin(bloqueo, perfil?.estado_aprobacion === 'pendiente' ? 'aviso' : 'error');
      await supabaseClient.auth.signOut();
      return;
    }

    sesionUserId = authUser.id;
    state.user = {
      id: authUser.id,
      email: perfil.email || authUser.email,
      nombre: perfil.nombre || authUser.email,
      cargo: perfil.rol,
      cargoSolicitado: perfil.cargo_solicitado,
    };
    state.rol = ROLES_VALIDOS.includes(perfil.rol) ? perfil.rol : 'arquitecto';

    /* Llegó el aviso de recuperación mientras se cargaba el perfil */
    if (enRecuperacion()) { exigirNuevaContrasena(); return; }
    ocultarLogin();
    aplicarPermisosUI();
    updateUserChip();
    switchTab(tabsPermitidos().includes(state.tab) ? state.tab : 'produccion');

    const cargado = await cargarEstado();
    aplicarDatos(cargado);
    reconstruirSnapshot();
    guardarCacheLocal();
    renderAll();

    if (sbListo) iniciarTiempoReal();
    else showToast('Sin conexión con la base de datos: mostrando la última copia guardada.');
    pintarEstadoSync();

    showToast(`Bienvenido, ${state.user.nombre} · ${labelCargo(state.rol)}`);
    if (esGerencia()) cargarUsuarios();
  })();

  try {
    await entrandoSesion;
  } finally {
    entrandoSesion = null;
  }
}

function salirDeSesion() {
  detenerTiempoReal();
  clearTimeout(syncReintentoTimer);
  syncConError = false;
  syncReintentos = 0;
  const key = storageKey();
  if (key) { try { localStorage.removeItem(key); } catch (e) { /* noop */ } }
  sesionUserId = null;
  sbListo = false;
  state.user = null;
  state.rol = 'arquitecto';
  state.fichaId = null;
  Object.assign(state, estadoVacio());
  reconstruirSnapshot();
  aplicarPermisosUI();
  updateUserChip();
  renderAll();
  pintarEstadoSync();
  mostrarLogin();
}

async function cerrarSesion() {
  /* Se espera a que terminen los guardados pendientes antes de salir */
  try { await syncQueue; } catch (e) { /* noop */ }
  if (syncConError && !window.confirm('Hay cambios que no se han guardado en la nube y se perderán al cerrar sesión. ¿Cerrar sesión de todos modos?')) {
    reintentarSync();
    return;
  }
  const { error } = await supabaseClient.auth.signOut();
  if (error) console.warn('[MODUGAL] signOut:', error);
  salirDeSesion();
}

async function enviarRecuperacion(email) {
  const mail = String(email || '').trim().toLowerCase();
  if (!mail) return { ok: false, msg: 'Escribe tu correo.' };
  const { error } = await supabaseClient.auth.resetPasswordForEmail(mail, { redirectTo: urlRetorno() });
  if (error) return { ok: false, msg: traducirErrorAuth(error) };
  return { ok: true };
}

async function cambiarContrasena(nueva, confirmacion) {
  const problemaClave = validarClaveNueva(nueva, state.user?.email || '');
  if (problemaClave) return { ok: false, msg: problemaClave };
  if (nueva !== confirmacion) return { ok: false, msg: 'Las contraseñas no coinciden.' };
  const { error } = await supabaseClient.auth.updateUser({ password: nueva });
  if (error) return { ok: false, msg: traducirErrorAuth(error) };
  return { ok: true };
}

function escucharAuth() {
  supabaseClient.auth.onAuthStateChange((event, session) => {
    /* No se llama al SDK con await dentro del callback (puede bloquearse);
       el trabajo se difiere al siguiente ciclo. */
    setTimeout(() => {
      if (event === 'PASSWORD_RECOVERY') {
        marcarRecuperacion(true);
        exigirNuevaContrasena();
        return;
      }
      if (event === 'SIGNED_OUT') {
        if (sesionUserId) salirDeSesion();
        return;
      }
      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session?.user) {
        /* Con el enlace de recuperación NO se entra: primero la nueva contraseña */
        if (enRecuperacion()) { exigirNuevaContrasena(); return; }
        entrarConSesion(session.user);
      }
    }, 0);
  });
}

function limpiarClavesLegadas() {
  CLAVES_LEGADAS.forEach((k) => { try { localStorage.removeItem(k); } catch (e) { /* noop */ } });
}

function updateUserChip() {
  const userEl = document.getElementById('mg-user');
  const info = document.getElementById('mg-user-info');
  if (!userEl || !info) return;
  if (state.user) {
    userEl.classList.remove('hidden');
    info.textContent = `${state.user.nombre || state.user.email} · ${labelCargo(state.rol)}`;
  } else {
    userEl.classList.add('hidden');
  }
}

function aplicarTema() {
  const oscuro = state.tema === 'oscuro';
  document.documentElement.classList.toggle('tema-oscuro', oscuro);
  const btn = document.getElementById('btn-tema');
  if (btn) btn.innerHTML = oscuro ? '<i class="fas fa-sun w-4 h-4"></i>' : '<i class="fas fa-moon w-4 h-4"></i>';
  /* Color de la barra del navegador / barra de estado del celular */
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', oscuro ? '#0e0f11' : '#f8fafc');
  document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.setAttribute('content', oscuro ? 'black' : 'default');
}

function toggleTema() {
  state.tema = state.tema === 'oscuro' ? 'claro' : 'oscuro';
  try { localStorage.setItem(TEMA_KEY, state.tema); } catch (_) { /* sin almacenamiento: dura la sesión */ }
  /* Transición suave solo durante el cambio (no afecta el resto del uso) */
  const raiz = document.documentElement;
  raiz.classList.add('cambiando-tema');
  aplicarTema();
  setTimeout(() => raiz.classList.remove('cambiando-tema'), 320);
}

function mostrarLogin() {
  document.getElementById('login-screen')?.classList.remove('is-hidden');
}

function ocultarLogin() {
  document.getElementById('login-screen')?.classList.add('is-hidden');
}

function mostrarErrorLogin(msg, tipo = 'error') {
  const el = document.getElementById('login-error');
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle('text-red-600', tipo === 'error');
  el.classList.toggle('text-emerald-700', tipo === 'ok');
  el.classList.toggle('text-amber-700', tipo === 'aviso');
  el.classList.remove('hidden');
}

/* ---- Matriz de permisos de la UI (espejo de las políticas RLS) ---- */

function esGerencia() {
  return state.rol === 'administrativo';
}

function puedeAvanzar() {
  return state.rol === 'operativo' || state.rol === 'administrativo';
}

function puedeAsignar() {
  return puedeAvanzar();
}

function puedeGestionarPendientes() {
  return puedeAvanzar();
}

function puedeEditarFicha() {
  return ['administrativo', 'operativo', 'secretaria'].includes(state.rol);
}

function puedeCrearProyecto() {
  return ['administrativo', 'operativo', 'secretaria'].includes(state.rol);
}

function puedeGestionarComercial() {
  return ['administrativo', 'operativo', 'secretaria'].includes(state.rol);
}

function puedeCrearProspecto() {
  return ['administrativo', 'secretaria'].includes(state.rol);
}

function puedeAprobarProspecto() {
  return ['administrativo', 'secretaria'].includes(state.rol);
}

function puedeGestionarCompras() {
  return state.rol === 'administrativo' || state.rol === 'operativo';
}

function puedeVerFinanzas() {
  return MODULO_CONTABLE && esGerencia();
}

function tabsPermitidos() {
  const mapa = {
    administrativo: ['produccion', 'equipo', 'comercial', 'tabla', 'proyectos', 'centro', 'stats', 'usuarios', 'new-order'],
    operativo: ['produccion', 'equipo', 'comercial', 'tabla', 'proyectos', 'centro', 'new-order'],
    secretaria: ['produccion', 'comercial', 'tabla', 'proyectos'],
    arquitecto: ['produccion', 'comercial', 'tabla', 'proyectos'],
  };
  return mapa[state.rol] || ['produccion'];
}

function aplicarPermisosUI() {
  const permitidos = tabsPermitidos();
  document.querySelectorAll('#mg-tabs [data-tab]').forEach((btn) => {
    btn.classList.toggle('hidden', !permitidos.includes(btn.dataset.tab));
  });
  const rolLabel = document.getElementById('mg-rol-label');
  if (rolLabel) rolLabel.textContent = labelCargo(state.rol);
  document.getElementById('mg-role-selector')?.classList.toggle('hidden', !state.user);

  document.querySelectorAll('[data-accion="nuevo-proyecto"]').forEach((btn) => {
    const permitido = puedeCrearProyecto();
    btn.classList.toggle('hidden', !permitido);
    btn.style.display = permitido ? '' : 'none';
  });
  document.querySelectorAll('[data-accion="nuevo-prospecto"]').forEach((btn) => {
    const permitido = puedeCrearProspecto();
    btn.classList.toggle('hidden', !permitido);
    btn.style.display = permitido ? '' : 'none';
  });
  const btnTarea = document.getElementById('equipo-nueva-tarea');
  if (btnTarea) btnTarea.classList.toggle('hidden', !puedeAsignar());
  updateUserChip();
}
/* ==========================================================================
   6. ASISTENTE IA / BOT DE WHATSAPP
   ========================================================================== */

function pushMensaje(autor, texto) {
  const container = document.getElementById('chat-messages');
  if (!container) return;
  const msg = document.createElement('div');
  msg.className = `chat-msg ${autor === 'user' ? 'chat-msg--user' : 'chat-msg--bot'}`;
  msg.textContent = texto;
  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;
}

function generarRespuestaBot(texto) {
  const q = texto.toLowerCase();

  if (/hoy|entrega|entregar|despacho|despachar|entregas/i.test(q)) {
    const entregasHoy = state.proyectos.filter((p) => esHoy(p.dateExpected));
    if (entregasHoy.length === 0) return '📭 No hay entregas programadas para hoy. ¡Buen ritmo! 🎉';
    const lines = entregasHoy.map((p) => `• ${p.name} · ${p.client} · ${p.id}`);
    return `📦 Proyectos con entregas programadas para hoy:\n${lines.join('\n')}\n\n¿Necesitas despacho o instalación?`;
  }

  if (/material|falta|faltan|herraje|madecor|vidrio|insumo|blum|cuarzo|pendiente/i.test(q)) {
    const conPendientes = state.proyectos.filter((p) => (p.pendientes || []).length);
    if (conPendientes.length === 0) return '✅ ¡Sin faltantes de materiales! Todo en orden. 🎉';
    const lines = conPendientes.map((p) => `• ${p.name} · ${p.pendientes.map((x) => x.text).join(' / ')}`);
    return `⚠️ Proyectos con pendientes o materiales faltantes:\n${lines.join('\n')}`;
  }

  if (/detenido|detenidos|paralizo|paralizada/i.test(q)) {
    const detenidos = state.proyectos.filter((p) => p.status === EST_PRODUCCION.DETENIDO);
    if (detenidos.length === 0) return '✅ Sin proyectos detenidos actualmente.';
    const lines = detenidos.map((p) => `• ${p.name} · ${primerPendiente(p)?.text || 'Bloqueo activo'}`);
    return `⚠️ Proyectos detenidos:\n${lines.join('\n')}`;
  }

  const term = texto.toLowerCase().split(/[^a-z0-9áéíóúñ]+/).filter((t) => t.length > 1).join(' ').trim();
  if (term) {
    const resultados = state.proyectos.filter((p) => `${p.id} ${p.client} ${p.name} ${p.city}`.toLowerCase().includes(term));
    if (resultados.length > 0) {
      const lines = resultados.map((p) => `• ${p.name} · ${p.client} · Estado: ${p.status}`);
      return `🔎 Proyectos encontrados para "${term}":\n${lines.join('\n')}`;
    }
    return `🔍 No encontré proyectos para "${term}".`;
  }

  return '🤖 Soy el Asistente IA de MODUGAL. Puedo consultar entregas de hoy, proyectos con materiales faltantes o clientes. Prueba: "¿Qué entregas hay para hoy?"';
}

function enviarMensaje(texto) {
  const input = document.getElementById('chat-input');
  const msg = String(texto ?? input?.value ?? '').trim();
  if (!msg) return;
  pushMensaje('user', msg);
  if (input) input.value = '';
  setTimeout(() => pushMensaje('bot', generarRespuestaBot(msg)), 450);
}

function abrirChat() {
  const panel = document.getElementById('chat-panel');
  if (!panel) return;
  panel.classList.add('open');
  if (document.querySelectorAll('#chat-messages .chat-msg').length === 0) {
    pushMensaje('bot', '¡Hola! 👋 Soy el Asistente IA de MODUGAL.\nPuedo consultar entregas de hoy, proyectos con materiales faltantes o clientes. Prueba: "¿Qué entregas hay para hoy?"');
  }
}

function cerrarChat() {
  document.getElementById('chat-panel')?.classList.remove('open');
}

/* ==========================================================================
   7. PENDIENTES UNIFICADOS · SINCRONIZACIÓN GLOBAL
   ========================================================================== */

function pendientesHTML(p, opts = {}) {
  const lista = p.pendientes || [];
  const puede = puedeGestionarPendientes();
  const compact = opts.compact ? 'pendientes-box--compact' : '';
  return `
    <div class="pendientes-box ${compact}">
      <div class="pendientes-head">
        <span class="pendientes-title"><i class="fas fa-clipboard-list" aria-hidden="true"></i> Pendientes o Requerimientos <span class="pendientes-count">${lista.length}</span></span>
        ${puede ? `<button type="button" class="pendientes-add" data-pend-add="${esc(p.id)}"><i class="fas fa-plus" aria-hidden="true"></i> Agregar</button>` : ''}
      </div>
      <div class="pendientes-list">
        ${lista.length ? lista.map((x) => `
          <div class="pendiente-item" title="Prioridad ${esc(x.prioridad)}">
            <span class="pendiente-tipo pendiente-tipo--${esc(x.tipo)}">${esc(labelPendiente(x.tipo))}</span>
            <span class="pendiente-text">${esc(x.text)}</span>
            <span class="pendiente-prio pendiente-prio--${esc(x.prioridad)}" aria-label="Prioridad ${esc(x.prioridad)}"></span>
            ${puede ? `<span class="pendiente-actions">
              <button type="button" data-pend-edit="${esc(x.id)}" data-pend-project="${esc(p.id)}" title="Editar pendiente" aria-label="Editar pendiente"><i class="fas fa-pen" aria-hidden="true"></i></button>
              <button type="button" data-pend-del="${esc(x.id)}" data-pend-project="${esc(p.id)}" title="Eliminar pendiente" aria-label="Eliminar pendiente"><i class="fas fa-trash" aria-hidden="true"></i></button>
            </span>` : ''}
          </div>`).join('') : '<p class="pendiente-empty"><i class="fas fa-circle-check" aria-hidden="true"></i> Sin pendientes registrados.</p>'}
      </div>
    </div>`;
}

function abrirPendienteModal(projectId, pendienteId) {
  const p = state.proyectos.find((x) => x.id === projectId);
  if (!p || !puedeGestionarPendientes()) return;
  const item = pendienteId ? (p.pendientes || []).find((x) => x.id === pendienteId) : null;
  state.pendienteCtx = { projectId, pendienteId: pendienteId || null };
  document.getElementById('pendiente-modal-title').textContent = item ? 'Editar Pendiente' : 'Agregar Pendiente';
  document.getElementById('pendiente-modal-sub').textContent = `${p.id} · ${p.client}`;
  document.getElementById('pendiente-texto').value = item ? item.text : '';
  document.getElementById('pendiente-tipo').value = item ? item.tipo : 'material';
  document.getElementById('pendiente-prioridad').value = item ? item.prioridad : 'media';
  document.getElementById('pendiente-modal').classList.remove('is-hidden');
  setTimeout(() => document.getElementById('pendiente-texto')?.focus(), 40);
}

function cerrarPendienteModal() {
  document.getElementById('pendiente-modal')?.classList.add('is-hidden');
  state.pendienteCtx = null;
}

function guardarPendiente(e) {
  e.preventDefault();
  const ctx = state.pendienteCtx;
  if (!ctx) return;
  const p = state.proyectos.find((x) => x.id === ctx.projectId);
  if (!p) return;
  const texto = document.getElementById('pendiente-texto').value.trim();
  if (!texto) return;
  const tipo = document.getElementById('pendiente-tipo').value;
  const prioridad = document.getElementById('pendiente-prioridad').value;
  if (ctx.pendienteId) {
    const item = p.pendientes.find((x) => x.id === ctx.pendienteId);
    if (item) {
      item.text = texto;
      item.tipo = tipo;
      item.prioridad = prioridad;
    }
  } else {
    p.pendientes.push({ id: uid('pd'), text: texto, tipo, prioridad, createdAt: hoyISO() });
  }
  p.alert = p.pendientes.length ? p.pendientes[0].text : '';
  commit();
  refrescarPendientesProyecto(ctx.projectId);
  cerrarPendienteModal();
  showToast('Pendiente sincronizado en todas las vistas.');
}

function eliminarPendiente(projectId, pendienteId) {
  const p = state.proyectos.find((x) => x.id === projectId);
  if (!p || !puedeGestionarPendientes()) return;
  const item = (p.pendientes || []).find((x) => x.id === pendienteId);
  if (!item) return;
  if (!window.confirm(`¿Eliminar el pendiente "${item.text}"?`)) return;
  p.pendientes = p.pendientes.filter((x) => x.id !== pendienteId);
  p.alert = p.pendientes.length ? p.pendientes[0].text : '';
  commit();
  refrescarPendientesProyecto(projectId);
  showToast('Pendiente eliminado.');
}

/* ==========================================================================
   8. FASES BIDIRECCIONALES (PROYECTO, MUEBLE Y TAREA)
   ========================================================================== */

function clampFase(idx) {
  return Math.max(0, Math.min(PRODUCTION_PHASES.length - 1, idx));
}

function cambiarFaseProyecto(id, delta) {
  if (!puedeAvanzar()) { showToast('Tu rol no puede modificar fases de producción.'); return; }
  const p = state.proyectos.find((x) => x.id === id);
  if (!p) return;
  const actual = Math.max(0, PRODUCTION_PHASES.indexOf(p.manufacturingPhase));
  const nuevo = clampFase(actual + delta);
  if (nuevo === actual) return;
  p.manufacturingPhase = PRODUCTION_PHASES[nuevo];
  p.phase = p.manufacturingPhase;
  commit();
  showToast(`${p.name}: fase ${p.manufacturingPhase}.`);
}

function cambiarFaseMueble(projectId, muebleId, delta) {
  if (!puedeAsignar()) { showToast('Tu rol no puede modificar fases de producción.'); return; }
  const p = state.proyectos.find((x) => x.id === projectId);
  const m = (p?.muebles || []).find((x) => x.id === muebleId);
  if (!p || !m) return;
  const actual = Math.max(0, PRODUCTION_PHASES.indexOf(m.manufacturingPhase));
  const nuevo = clampFase(actual + delta);
  if (nuevo === actual) return;
  m.manufacturingPhase = PRODUCTION_PHASES[nuevo];
  m.status = m.manufacturingPhase;
  commit();
  showToast(`${m.name}: fase ${m.manufacturingPhase}.`);
}

function cambiarFaseTarea(carpenter, tareaId, delta) {
  if (!puedeAsignar()) { showToast('Tu rol no puede modificar fases de producción.'); return; }
  const t = (state.tareas[carpenter] || []).find((x) => x.id === tareaId);
  if (!t) return;
  const actual = Math.max(0, PRODUCTION_PHASES.indexOf(faseValida(t.phase, 'Armado')));
  const nuevo = clampFase(actual + delta);
  if (nuevo === actual) return;
  t.phase = PRODUCTION_PHASES[nuevo];
  commit();
  showToast(`${t.text}: fase ${t.phase}.`);
}

function stepperBarras(fase) {
  const actual = Math.max(0, PRODUCTION_PHASES.indexOf(fase));
  return PRODUCTION_PHASES.map((phase, idx) => {
    const color = idx === actual ? 'bg-red-600' : (idx < actual ? 'bg-emerald-500' : 'bg-slate-200');
    return `<div class="h-1.5 flex-1 rounded-full ${color}" title="${phase}"></div>`;
  }).join('');
}

function controlesFaseProyecto(p) {
  if (!puedeAvanzar()) return '';
  const idx = Math.max(0, PRODUCTION_PHASES.indexOf(p.manufacturingPhase));
  const atras = idx <= 0 ? 'disabled' : '';
  const adelante = idx >= PRODUCTION_PHASES.length - 1 ? 'disabled' : '';
  return `
    <div class="flex items-center gap-1">
      <button type="button" class="fase-btn" data-fase-proyecto="${esc(p.id)}" data-delta="-1" ${atras} title="Retroceder fase" aria-label="Retroceder fase"><i class="fas fa-arrow-left" aria-hidden="true"></i></button>
      <span class="text-[10px] font-black text-slate-500 px-1 whitespace-nowrap">${esc(p.manufacturingPhase)}</span>
      <button type="button" class="fase-btn fase-btn--next" data-fase-proyecto="${esc(p.id)}" data-delta="1" ${adelante} title="Avanzar fase" aria-label="Avanzar fase"><i class="fas fa-arrow-right" aria-hidden="true"></i></button>
    </div>`;
}

/* ==========================================================================
   9. TABLERO DE PRODUCCIÓN Y MÓDULO PROYECTOS
   ========================================================================== */

function crearTarjetaProduccion(p) {
  const card = document.createElement('div');
  const detenido = p.status === EST_PRODUCCION.DETENIDO;
  card.className = `bg-white rounded-2xl border transition-all duration-300 overflow-hidden shadow-sm hover:shadow-xl hover:-translate-y-1 flex flex-col ${detenido ? 'border-red-300 ring-2 ring-red-500/20' : 'border-slate-200/80 hover:border-slate-300'} ${state.recienCreado === p.id ? 'tarjeta-recien-creada' : ''}`;
  card.dataset.proyectoId = p.id;

  const badgeStatus = detenido
    ? '<span class="bg-red-600 text-white px-2.5 py-1 rounded-lg text-xs font-black shadow-md flex items-center"><i class="fas fa-triangle-exclamation w-3.5 h-3.5 mr-1" aria-hidden="true"></i>DETENIDO</span>'
    : (p.status === EST_PRODUCCION.COMPLETADO
      ? '<span class="bg-emerald-600 text-white px-2.5 py-1 rounded-lg text-xs font-black shadow-md flex items-center"><i class="fas fa-check-circle w-3.5 h-3.5 mr-1" aria-hidden="true"></i>ENTREGADO</span>'
      : '<span class="bg-slate-900 text-white px-2.5 py-1 rounded-lg text-xs font-black shadow-md flex items-center"><i class="fas fa-clock w-3.5 h-3.5 mr-1" aria-hidden="true"></i>EN PROCESO</span>');

  card.innerHTML = `
    <div class="relative h-52 w-full bg-slate-100 overflow-hidden border-b border-slate-100">
      <img src="${esc(p.image || DEFAULT_IMAGE)}" alt="${esc(p.name)}" class="w-full h-full object-cover hover:scale-105 transition-all duration-500" />
      <div class="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-slate-950/10 to-transparent"></div>
      <div class="absolute top-3 left-3 flex items-center gap-1.5">${badgeNuevo(p)}</div>
      <div class="absolute top-3 right-3">${badgeStatus}</div>
      <div class="absolute bottom-3 left-4 right-4 text-white">
        <h3 class="text-xl font-black drop-shadow-md">${esc(p.name)}</h3>
        <p class="text-xs text-slate-200 flex items-center mt-0.5 drop-shadow"><i class="fas fa-map-marker-alt w-3.5 h-3.5 text-red-500 mr-1" aria-hidden="true"></i>${esc(p.neighborhood ? `${p.neighborhood}, ${p.city}` : p.city)}</p>
      </div>
    </div>
    <div class="p-5 flex-1 flex flex-col justify-between gap-4">
      ${pendientesHTML(p, { compact: true })}
      <div>
        <div class="flex justify-between items-center text-xs mb-2 font-bold gap-2">
          <span class="text-slate-500">Etapa de Producción: <strong class="text-slate-900 uppercase">${esc(p.manufacturingPhase)}</strong></span>
          ${controlesFaseProyecto(p)}
        </div>
        <div class="flex items-center w-full space-x-1">${stepperBarras(p.manufacturingPhase)}</div>
        <div class="flex justify-between text-[9px] font-bold text-slate-400 mt-1.5 uppercase"><span>Recepción</span><span>Instalación</span></div>
      </div>
      <div class="grid grid-cols-2 gap-2 text-xs border-t border-slate-100 pt-3">
        <div><span class="text-slate-400 block">Trazador Responsable</span><span class="font-bold text-slate-800 mt-0.5 block">${esc(p.leadCarpenter || 'Por asignar')}</span></div>
        <div><span class="text-slate-400 block">Entrega Estimada</span><span class="font-bold text-slate-800 mt-0.5 block">${esc(p.dateExpected || 'Por definir')}</span></div>
      </div>
      <div class="pt-2 flex flex-wrap gap-2">
        <button type="button" class="flex-1 bg-slate-900 hover:bg-slate-800 text-white font-bold py-2.5 px-3 rounded-xl text-xs transition-all shadow-sm flex items-center justify-center space-x-1" data-open-ficha="${esc(p.id)}">
          <span>Ficha del Proyecto</span><i class="fas fa-chevron-right w-4 h-4" aria-hidden="true"></i>
        </button>
        <button type="button" class="bg-slate-100 hover:bg-slate-200 text-slate-700 p-2.5 rounded-xl border border-slate-200 transition-colors" data-open-ficha="${esc(p.id)}" data-sub="dropbox" title="Archivos del proyecto" aria-label="Archivos del proyecto">
          <i class="fas fa-folder w-4 h-4 text-blue-600" aria-hidden="true"></i>
        </button>
        ${puedeEditarFicha() ? `<button type="button" class="bg-slate-100 hover:bg-slate-200 text-slate-700 p-2.5 rounded-xl border border-slate-200 transition-colors" data-edit-proyecto="${esc(p.id)}" title="Editar ficha" aria-label="Editar ficha"><i class="fas fa-pen w-4 h-4" aria-hidden="true"></i></button>` : ''}
        ${botonEliminarProyecto(p, 'p-2.5 rounded-xl')}
      </div>
    </div>`;

  const img = card.querySelector('img');
  if (img) img.addEventListener('error', () => { img.src = DEFAULT_IMAGE; }, { once: true });
  return card;
}

/* Los proyectos más recientes van primero; los creados hace menos de 3 días
   llevan la etiqueta NUEVO. */
const HORAS_NUEVO = 72;

function numeroCodigo(p) {
  return parseInt(String(p.id || '').replace(/\D/g, ''), 10) || 0;
}

function ordenarRecientes(lista) {
  return lista.sort((a, b) => {
    const ta = a.creadoEn ? Date.parse(a.creadoEn) : 0;
    const tb = b.creadoEn ? Date.parse(b.creadoEn) : 0;
    return (tb - ta) || (numeroCodigo(b) - numeroCodigo(a));
  });
}

function esProyectoNuevo(p) {
  if (!p?.creadoEn) return false;
  return Date.now() - Date.parse(p.creadoEn) < HORAS_NUEVO * 3600 * 1000;
}

function badgeNuevo(p, clases = '') {
  return esProyectoNuevo(p) ? `<span class="badge-nuevo ${clases}">NUEVO</span>` : '';
}

function filtrarProduccion() {
  let lista = state.proyectos.slice();
  if (state.fProduccion !== 'todos') lista = lista.filter((p) => p.status === state.fProduccion);
  if (state.search) {
    const q = state.search.toLowerCase();
    lista = lista.filter((p) => `${p.id} ${p.client} ${p.name} ${p.city} ${p.leadCarpenter || ''}`.toLowerCase().includes(q));
  }
  if (state.year !== 'Todos') lista = lista.filter((p) => String(p.trimester || '').includes(state.year));
  if (state.quarter !== 'Todos los Trimestres') lista = lista.filter((p) => p.trimester === state.quarter);
  if (state.city !== 'Todos') lista = lista.filter((p) => p.city === state.city);
  return ordenarRecientes(lista);
}

/* ---- Vista en lista (alternativa a las tarjetas) ---- */

const CLASES_VISTA = {
  tarjetas: 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6',
  lista: 'flex flex-col gap-2',
};

function prepararContenedorVista(el, clave, extra = '') {
  const vista = state.vistas?.[clave] === 'lista' ? 'lista' : 'tarjetas';
  el.className = `${CLASES_VISTA[vista]} ${extra}`.trim();
  document.querySelectorAll(`[data-vista-para="${clave}"] [data-vista]`).forEach((b) => {
    const activo = b.dataset.vista === vista;
    b.classList.toggle('active', activo);
    b.setAttribute('aria-pressed', String(activo));
  });
  return vista;
}

function crearFilaProyecto(p) {
  const fila = document.createElement('article');
  const detenido = p.status === EST_PRODUCCION.DETENIDO;
  const completado = p.status === EST_PRODUCCION.COMPLETADO;
  const pendientes = (p.pendientes || []).filter((x) => x.estado !== 'Resuelto').length;
  const estado = detenido
    ? '<span class="bg-red-600 text-white px-2 py-0.5 rounded-md text-[10px] font-black">DETENIDO</span>'
    : completado
      ? '<span class="bg-emerald-600 text-white px-2 py-0.5 rounded-md text-[10px] font-black">ENTREGADO</span>'
      : '<span class="bg-slate-900 text-white px-2 py-0.5 rounded-md text-[10px] font-black">EN PROCESO</span>';
  fila.className = `bg-white border rounded-xl p-3 flex items-center gap-3 shadow-sm hover:shadow-md transition-shadow ${detenido ? 'border-red-300' : 'border-slate-200'} ${state.recienCreado === p.id ? 'tarjeta-recien-creada' : ''}`;
  fila.dataset.proyectoId = p.id;
  fila.innerHTML = `
    <img src="${esc(p.image || DEFAULT_IMAGE)}" alt="" class="w-16 h-12 sm:w-20 sm:h-14 object-cover rounded-lg border border-slate-200 bg-slate-100 shrink-0" />
    <div class="min-w-0 flex-1 grid grid-cols-1 md:grid-cols-12 gap-x-4 gap-y-1 items-center text-xs">
      <div class="md:col-span-4 min-w-0">
        <p class="font-black text-slate-900 truncate">${badgeNuevo(p, 'mr-1')}${esc(p.name)}</p>
        <p class="text-slate-500 truncate">${esc(p.client)} · ${esc(p.city)}</p>
      </div>
      <div class="md:col-span-3 min-w-0">
        <p class="font-bold text-slate-700 uppercase text-[10px] mb-1">${esc(p.manufacturingPhase)}</p>
        <div class="flex items-center w-full space-x-1">${stepperBarras(p.manufacturingPhase)}</div>
      </div>
      <div class="hidden md:block md:col-span-2">
        <p class="text-[10px] text-slate-400 uppercase font-bold">Entrega</p>
        <p class="font-bold text-slate-800 truncate">${esc(p.dateExpected || 'Por definir')}</p>
      </div>
      <div class="hidden md:block md:col-span-1">
        <p class="text-[10px] text-slate-400 uppercase font-bold">Pend.</p>
        <p class="font-black ${pendientes ? 'text-amber-700' : 'text-slate-400'}">${pendientes}</p>
      </div>
      <div class="md:col-span-2 flex md:justify-end">${estado}</div>
    </div>
    ${botonEliminarProyecto(p, 'w-9 h-9 rounded-lg shrink-0')}
    <button type="button" class="bg-slate-900 hover:bg-slate-800 text-white w-9 h-9 rounded-lg shrink-0" data-open-ficha="${esc(p.id)}" title="Ficha del proyecto" aria-label="Abrir ficha de ${esc(p.name)}">
      <i class="fas fa-chevron-right" aria-hidden="true"></i>
    </button>`;
  const img = fila.querySelector('img');
  if (img) img.addEventListener('error', () => { img.src = DEFAULT_IMAGE; }, { once: true });
  return fila;
}

function renderProduccion() {
  const grid = document.getElementById('proyectos-grid');
  if (!grid) return;
  grid.innerHTML = '';
  pintarChipsProduccion();
  const vista = prepararContenedorVista(grid, 'produccion', 'mt-5');
  const lista = filtrarProduccion();
  if (lista.length === 0) {
    grid.innerHTML = '<div class="bg-white border border-slate-200 rounded-2xl shadow-sm p-8 text-center text-slate-500 text-sm md:col-span-2 lg:col-span-3">No hay proyectos para el filtro seleccionado.</div>';
    return;
  }
  lista.forEach((p) => grid.appendChild(vista === 'lista' ? crearFilaProyecto(p) : crearTarjetaProduccion(p)));
}

function renderProyectos() {
  const grid = document.getElementById('proyectos-cards');
  if (!grid) return;
  grid.innerHTML = '';
  let lista = state.proyectos.slice();
  if (state.proyectosEstado === 'activos') lista = lista.filter((p) => p.status !== EST_PRODUCCION.COMPLETADO);
  if (state.proyectosEstado === 'completados') lista = lista.filter((p) => p.status === EST_PRODUCCION.COMPLETADO);
  if (state.proyectosYear !== 'Todos') lista = lista.filter((p) => String(p.trimester || '').includes(state.proyectosYear));
  if (state.proyectosQuarter !== 'Todos los Trimestres') lista = lista.filter((p) => p.trimester === state.proyectosQuarter);
  if (state.proyectosCity !== 'Todos') lista = lista.filter((p) => p.city === state.proyectosCity);
  if (state.search) {
    const q = state.search.toLowerCase();
    lista = lista.filter((p) => `${p.id} ${p.client} ${p.name} ${p.city}`.toLowerCase().includes(q));
  }
  ordenarRecientes(lista);
  const vista = prepararContenedorVista(grid, 'proyectos');
  const count = document.getElementById('proyectos-count');
  if (count) count.textContent = `${lista.length} proyecto${lista.length === 1 ? '' : 's'}`;
  if (lista.length === 0) {
    grid.innerHTML = '<div class="bg-white border border-slate-200 rounded-2xl shadow-sm p-8 text-center text-slate-500 text-sm md:col-span-2 lg:col-span-3">No hay proyectos para los filtros seleccionados.</div>';
    return;
  }
  lista.forEach((p) => grid.appendChild(vista === 'lista' ? crearFilaProyecto(p) : crearTarjetaProduccion(p)));
}

function renderKpis() {
  const detenidos = state.proyectos.filter((p) => p.status === EST_PRODUCCION.DETENIDO).length;
  const activos = state.proyectos.filter((p) => p.status !== EST_PRODUCCION.COMPLETADO).length;
  const set = new Set();
  state.proyectos.forEach((p) => (p.muebles || []).forEach((m) => { if (m.carpenter) set.add(m.carpenter); }));
  Object.keys(state.tareas || {}).forEach((k) => { if ((state.tareas[k] || []).length) set.add(k); });
  const elActivos = document.getElementById('kpi-activos');
  const elDetenidos = document.getElementById('kpi-detenidos');
  const elOperarios = document.getElementById('kpi-operarios');
  if (elActivos) elActivos.textContent = String(activos);
  if (elDetenidos) elDetenidos.textContent = String(detenidos);
  if (elOperarios) elOperarios.textContent = `${set.size} Operarios`;
  document.getElementById('kpi-detenidos')?.closest('.kpi-card')?.classList.toggle('kpi-alert', detenidos > 0);
  document.getElementById('kpi-operarios')?.closest('.kpi-card')?.classList.toggle('kpi-success', true);
}
/* ==========================================================================
   10. EQUIPO & ASIGNACIONES · EDITAR / REASIGNAR / ELIMINAR / FASE
   ========================================================================== */

function puedeGestionarPersonal() {
  return esGerencia();
}

function badgeActividad(actividad) {
  const a = ACTIVIDAD_POR_NOMBRE[actividad] || ACTIVIDAD_POR_NOMBRE.Otra;
  return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-black ${a.cls}"><i class="fas ${a.icon}" aria-hidden="true"></i>${esc(a.v)}</span>`;
}

/* Líder de un grupo de instalación (por grupo_id) */
function liderDeGrupo(grupoId) {
  if (!grupoId) return null;
  for (const [nombre, lista] of Object.entries(state.tareas || {})) {
    if ((lista || []).some((t) => t.grupoId === grupoId && t.esLider)) return nombre;
  }
  return null;
}

function equipoDeGrupo(grupoId) {
  if (!grupoId) return [];
  return Object.entries(state.tareas || {})
    .filter(([, lista]) => (lista || []).some((t) => t.grupoId === grupoId))
    .map(([nombre]) => nombre);
}

function asignacionesPorPersona() {
  const assignments = {};
  state.proyectos.forEach((p) => {
    if (p.status === EST_PRODUCCION.COMPLETADO) return;
    (p.muebles || []).forEach((m) => {
      if (!m.carpenter) return;
      if (!assignments[m.carpenter]) assignments[m.carpenter] = [];
      assignments[m.carpenter].push({
        kind: 'mueble',
        muebleId: m.id,
        taskId: null,
        text: m.name,
        actividad: m.actividad || 'Armando',
        detalle: m.detalle || '',
        estado: estadoTrabajoValido(m.estadoTrabajo),
        inicio: m.asignadoEn || null,
        fin: m.completadoEn || null,
        projectId: p.id,
        projectName: p.name,
        carpenter: m.carpenter,
        detenido: p.status === EST_PRODUCCION.DETENIDO,
      });
    });
  });
  Object.entries(state.tareas || {}).forEach(([carpenter, tareas]) => {
    (tareas || []).forEach((t) => {
      const p = state.proyectos.find((x) => x.id === t.projectId);
      if (p?.status === EST_PRODUCCION.COMPLETADO) return;
      if (!assignments[carpenter]) assignments[carpenter] = [];
      assignments[carpenter].push({
        kind: 'tarea',
        muebleId: null,
        taskId: t.id,
        text: t.text,
        actividad: t.actividad || 'Otra',
        detalle: t.detalle || '',
        grupoId: t.grupoId || null,
        esLider: Boolean(t.esLider),
        projectId: t.projectId,
        projectName: p?.name || 'Sin proyecto',
        carpenter,
        estado: estadoTrabajoValido(t.estado),
        inicio: t.asignadaEn || null,
        fin: t.completadaEn || null,
        detenido: p?.status === EST_PRODUCCION.DETENIDO,
      });
    });
  });
  return assignments;
}

/* ==========================================================================
   21h. TIEMPOS DE TRABAJO (v11)
   --------------------------------------------------------------------------
   Cada tarea y cada mueble asignado guarda cuándo se asignó y cuándo se
   completó. La base de datos pone las horas oficiales (trigger); aquí se
   llenan al momento para que la pantalla responda sin esperar.
   ========================================================================== */

const tiemposVistos = new Map();

function recorrerTrabajos(fn) {
  Object.entries(state.tareas || {}).forEach(([persona, lista]) => (lista || []).forEach((t) => fn('t', t, persona)));
  state.proyectos.forEach((p) => (p.muebles || []).forEach((m) => fn('m', m, m.carpenter || '')));
}

function registrarTiemposVistos() {
  tiemposVistos.clear();
  recorrerTrabajos((tipo, x, persona) => {
    tiemposVistos.set(`${tipo}:${x.id}`, { persona, estado: tipo === 't' ? x.estado : x.estadoTrabajo });
  });
}

function actualizarTiemposLocales() {
  const ahora = new Date().toISOString();
  recorrerTrabajos((tipo, x, persona) => {
    const clave = `${tipo}:${x.id}`;
    const antes = tiemposVistos.get(clave);
    const estado = tipo === 't' ? x.estado : x.estadoTrabajo;
    const campoIni = tipo === 't' ? 'asignadaEn' : 'asignadoEn';
    const campoFin = tipo === 't' ? 'completadaEn' : 'completadoEn';
    /* Solo se marca hora en cambios reales hechos ahora: trabajo nuevo, cambio de
       persona o paso a Completado. Los datos viejos sin hora se dejan sin hora. */
    if (!persona) x[campoIni] = null;
    else if (!antes || antes.persona !== persona) x[campoIni] = ahora;
    if (estado !== 'Completado') x[campoFin] = null;
    else if (!x[campoFin] && (!antes || antes.estado !== 'Completado' || antes.persona !== persona)) x[campoFin] = ahora;
    tiemposVistos.set(clave, { persona, estado });
  });
}

/* "2 d 5 h", "3 h 20 min", "15 min" */
function formatoDuracion(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const min = Math.round(ms / 60000);
  if (min < 60) return `${Math.max(min, 1)} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h${min % 60 ? ` ${min % 60} min` : ''}`;
  const d = Math.floor(h / 24);
  return `${d} d${h % 24 ? ` ${h % 24} h` : ''}`;
}

function duracionTrabajo(task, ahora = Date.now()) {
  const ini = task.inicio ? Date.parse(task.inicio) : NaN;
  if (!Number.isFinite(ini)) return null;
  const fin = task.fin ? Date.parse(task.fin) : (task.estado === 'Completado' ? NaN : ahora);
  return Number.isFinite(fin) ? Math.max(fin - ini, 0) : null;
}

function lineaTiempoTrabajo(task) {
  if (!task.inicio) return '';
  const fecha = new Date(task.inicio).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  const dur = duracionTrabajo(task);
  if (task.estado === 'Completado') {
    return `<p class="tiempo-trabajo tiempo-trabajo--ok" title="Asignada el ${esc(fecha)}"><i class="fas fa-flag-checkered" aria-hidden="true"></i>Completada en ${esc(dur === null ? '—' : formatoDuracion(dur))}</p>`;
  }
  return `<p class="tiempo-trabajo ${task.estado === 'Detenido' ? 'tiempo-trabajo--alerta' : ''}" title="Asignada el ${esc(fecha)}"><i class="fas fa-stopwatch" aria-hidden="true"></i>Asignada hace ${esc(formatoDuracion(dur))} · ${esc(fecha)}</p>`;
}

function resumenTiemposPersona(tasks) {
  const hechas = tasks.filter((t) => t.estado === 'Completado').map((t) => duracionTrabajo(t)).filter((d) => d !== null);
  const abiertas = tasks.filter((t) => t.estado !== 'Completado' && t.inicio);
  if (!hechas.length && !abiertas.length) return '';
  const prom = hechas.length ? hechas.reduce((a, b) => a + b, 0) / hechas.length : null;
  const masAntigua = abiertas.length ? Math.max(...abiertas.map((t) => duracionTrabajo(t) || 0)) : null;
  return `
    <div class="px-4 py-2 border-b border-slate-200 bg-white grid grid-cols-2 gap-2 text-[10px]">
      <div><p class="uppercase font-bold text-slate-400 tracking-wide">Promedio por tarea</p><p class="font-black text-slate-900 text-xs">${prom === null ? '—' : esc(formatoDuracion(prom))} <span class="font-bold text-slate-400">(${hechas.length} hecha${hechas.length === 1 ? '' : 's'})</span></p></div>
      <div><p class="uppercase font-bold text-slate-400 tracking-wide">Más antigua abierta</p><p class="font-black text-xs ${masAntigua > 7 * 864e5 ? 'text-red-700' : 'text-slate-900'}">${masAntigua === null ? '—' : esc(formatoDuracion(masAntigua))}</p></div>
    </div>`;
}

function tarjetaTareaHTML(task) {
  const instalacion = task.actividad === 'Instalación';
  const lider = instalacion ? (task.esLider ? task.carpenter : liderDeGrupo(task.grupoId)) : null;
  const companeros = instalacion ? equipoDeGrupo(task.grupoId).filter((n) => n !== task.carpenter && n !== lider) : [];
  const datos = `data-task-kind="${task.kind}" data-project="${esc(task.projectId || '')}" data-mueble="${esc(task.muebleId || '')}" data-task="${esc(task.taskId || '')}" data-carpenter="${esc(task.carpenter)}"`;
  return `
    <div class="p-3 rounded-xl border text-xs ${task.estado === 'Completado' ? 'bg-emerald-50/60 border-emerald-200 opacity-80' : (task.detenido || task.estado === 'Detenido') ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200 shadow-sm'}">
      <div class="flex justify-between items-start gap-2 mb-2">
        <div class="flex flex-wrap items-center gap-1.5">
          ${badgeActividad(task.actividad)}
          <span class="inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-black ${ESTILO_ESTADO_TRABAJO[task.estado] || ESTILO_ESTADO_TRABAJO['En proceso']}">${esc(task.estado || 'En proceso')}</span>
          ${task.esLider ? '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-900 text-white text-[10px] font-black"><i class="fas fa-crown" aria-hidden="true"></i>Líder</span>' : ''}
        </div>
        ${puedeAsignar() ? `
          <div class="flex items-center gap-1 shrink-0">
            <button type="button" class="task-icon-btn" data-task-edit ${datos} title="Editar tarea" aria-label="Editar tarea"><i class="fas fa-pen" aria-hidden="true"></i></button>
            <button type="button" class="task-icon-btn task-icon-btn--danger" data-task-del ${datos} title="${task.kind === 'tarea' ? 'Eliminar tarea' : 'Quitar a esta persona del mueble'}" aria-label="${task.kind === 'tarea' ? 'Eliminar tarea' : 'Quitar asignación del mueble'}"><i class="fas ${task.kind === 'tarea' ? 'fa-trash' : 'fa-user-minus'}" aria-hidden="true"></i></button>
          </div>` : ''}
      </div>
      <p class="font-bold text-slate-900 leading-tight">${esc(task.text)}</p>
      ${task.detalle ? `<p class="text-slate-700 mt-1"><i class="fas fa-arrow-right text-[9px] text-slate-400 mr-1" aria-hidden="true"></i>${esc(task.detalle)}</p>` : ''}
      <p class="text-slate-500 mt-1 truncate">Proyecto: ${esc(task.projectName)}</p>
      ${lineaTiempoTrabajo(task)}
      ${instalacion && (lider || companeros.length) ? `
        <p class="text-[10px] text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-lg px-2 py-1 mt-2">
          ${lider && !task.esLider ? `Líder: <strong>${esc(lider)}</strong>` : ''}${lider && !task.esLider && companeros.length ? ' · ' : ''}${companeros.length ? `Con: ${esc(companeros.join(', '))}` : ''}
        </p>` : ''}
    </div>`;
}

/* Vista en lista de Equipo: una fila por tarea, agrupadas por persona */
function filaTareaHTML(task, persona, cargo) {
  const datos = `data-task-kind="${task.kind}" data-project="${esc(task.projectId || '')}" data-mueble="${esc(task.muebleId || '')}" data-task="${esc(task.taskId || '')}" data-carpenter="${esc(task.carpenter)}"`;
  const dur = duracionTrabajo(task);
  const tiempo = !task.inicio ? '<span class="text-slate-300">—</span>'
    : task.estado === 'Completado' ? `<span class="text-emerald-700 font-bold">Hecha en ${esc(formatoDuracion(dur))}</span>`
      : `<span class="${task.estado === 'Detenido' ? 'text-red-700' : 'text-slate-700'} font-bold">Hace ${esc(formatoDuracion(dur))}</span>`;
  return `
    <tr class="${task.estado === 'Completado' ? 'opacity-70' : ''}">
      <td><p class="font-bold text-slate-900">${esc(persona)}</p><p class="text-[10px] text-slate-400">${esc(cargo || '')}</p></td>
      <td><p class="font-bold text-slate-900">${esc(task.text)}</p><p class="text-[10px] text-slate-400 truncate max-w-[14rem]">${esc(task.projectName)}${task.detalle ? ` · ${esc(task.detalle)}` : ''}</p></td>
      <td>${badgeActividad(task.actividad)}</td>
      <td><span class="inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-black ${ESTILO_ESTADO_TRABAJO[task.estado] || ESTILO_ESTADO_TRABAJO['En proceso']}">${esc(task.estado || 'En proceso')}</span></td>
      <td>${tiempo}</td>
      <td class="text-right whitespace-nowrap">${puedeAsignar() ? `
        <button type="button" class="task-icon-btn" data-task-edit ${datos} title="Editar" aria-label="Editar"><i class="fas fa-pen" aria-hidden="true"></i></button>
        <button type="button" class="task-icon-btn task-icon-btn--danger" data-task-del ${datos} title="${task.kind === 'tarea' ? 'Eliminar tarea' : 'Quitar asignación'}" aria-label="${task.kind === 'tarea' ? 'Eliminar tarea' : 'Quitar asignación'}"><i class="fas ${task.kind === 'tarea' ? 'fa-trash' : 'fa-user-minus'}" aria-hidden="true"></i></button>` : ''}</td>
    </tr>`;
}

function renderEquipo() {
  const contenedor = document.getElementById('equipo-grid');
  if (!contenedor) return;
  contenedor.innerHTML = '';
  document.getElementById('equipo-personal')?.classList.toggle('hidden', !puedeGestionarPersonal());
  const vista = prepararContenedorVista(contenedor, 'equipo');

  const assignments = asignacionesPorPersona();
  /* Una tarjeta por cada persona activa, aunque no tenga tareas */
  const personas = personalActivo().map((c) => ({ nombre: c.nombre, cargo: c.cargo, registrado: true }));
  Object.keys(assignments).forEach((nombre) => {
    if (!personas.some((x) => x.nombre === nombre)) personas.push({ nombre, cargo: cargoDe(nombre), registrado: false });
  });

  if (personas.length === 0) {
    contenedor.innerHTML = `<div class="bg-white border border-slate-200 rounded-2xl shadow-sm p-8 text-center text-slate-500 text-sm md:col-span-2 lg:col-span-3">
      No hay personal registrado. ${puedeGestionarPersonal() ? 'Usa el botón <strong>Personal</strong> para registrar carpinteros, auxiliares y eléctricos.' : 'Gerencia debe registrar el personal de planta.'}
    </div>`;
    return;
  }

  personas.sort((a, b) => (CARGOS_PERSONAL.indexOf(a.cargo) - CARGOS_PERSONAL.indexOf(b.cargo)) || a.nombre.localeCompare(b.nombre));

  if (vista === 'lista') {
    const filas = personas.flatMap(({ nombre, cargo }) => (assignments[nombre] || []).slice()
      .sort((a, b) => Number(a.estado === 'Completado') - Number(b.estado === 'Completado'))
      .map((t) => filaTareaHTML(t, nombre, cargo)));
    const sinTareas = personas.filter((x) => !(assignments[x.nombre] || []).length).map((x) => x.nombre);
    contenedor.innerHTML = `
      <div class="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div class="stat-scroll">
          <table class="stat-tabla equipo-tabla">
            <thead><tr><th>Persona</th><th>Tarea / mueble</th><th>Actividad</th><th>Estado</th><th>Tiempo</th><th class="text-right">Acciones</th></tr></thead>
            <tbody>${filas.join('') || '<tr><td colspan="6" class="text-center text-slate-400 py-6">Sin tareas asignadas.</td></tr>'}</tbody>
          </table>
        </div>
        ${sinTareas.length ? `<p class="text-[11px] text-slate-500 border-t border-slate-100 px-4 py-3"><strong>Sin tareas:</strong> ${sinTareas.map(esc).join(', ')}</p>` : ''}
      </div>`;
    return;
  }

  personas.forEach(({ nombre, cargo, registrado }) => {
    const tasks = (assignments[nombre] || []).slice()
      .sort((a, b) => Number(a.estado === 'Completado') - Number(b.estado === 'Completado'));
    const card = document.createElement('div');
    card.className = 'bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col';
    card.innerHTML = `
      <div class="bg-slate-50 p-4 border-b border-slate-200 flex items-center justify-between gap-2">
        <div class="flex items-center space-x-3 min-w-0">
          <div class="w-10 h-10 rounded-full bg-slate-200 border border-slate-300 flex items-center justify-center text-slate-600 font-black shrink-0">${esc(String(nombre).charAt(0).toUpperCase())}</div>
          <div class="min-w-0">
            <h3 class="font-bold text-slate-900 truncate">${esc(nombre)}</h3>
            <p class="text-[10px] uppercase font-bold tracking-wider ${registrado ? 'text-slate-500' : 'text-amber-700'}">${esc(registrado ? cargo : 'No registrado · revisar en Personal')}</p>
          </div>
        </div>
        <span class="bg-slate-900 text-white text-xs font-black px-3 py-1 rounded-lg shadow-sm shrink-0">${tasks.length} ${tasks.length === 1 ? 'Tarea' : 'Tareas'}</span>
      </div>
      ${resumenTiemposPersona(tasks)}
      <div class="p-4 flex-1 overflow-y-auto space-y-3">
        ${tasks.length ? tasks.map(tarjetaTareaHTML).join('') : '<p class="text-xs text-slate-400 text-center py-3">Sin tareas asignadas.</p>'}
        ${puedeAsignar() && registrado ? `
          <button type="button" class="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 px-4 rounded-xl text-xs transition-colors border border-slate-200" data-tarea-add="${esc(nombre)}">
            <i class="fas fa-plus w-3.5 h-3.5 mr-1" aria-hidden="true"></i>Asignar Tarea
          </button>` : ''}
      </div>`;
    contenedor.appendChild(card);
  });
}

/* ---- Modal de tarea: personal + proyecto + actividad + detalle ---- */

function pintarModoTarea() {
  const actividad = document.getElementById('tarea-actividad')?.value;
  const creando = !state.tareaCtx;
  const esInstalacion = actividad === 'Instalación';
  const esMueble = state.tareaCtx?.kind === 'mueble';
  document.getElementById('tarea-persona-label').textContent = esInstalacion && creando ? 'Líder de instalación' : 'Personal';
  document.getElementById('tarea-equipo-box').classList.toggle('hidden', !(esInstalacion && creando));
  document.getElementById('tarea-lider-box').classList.toggle('hidden', !(esInstalacion && !creando && !esMueble));
  if (esInstalacion && creando) pintarEquipoInstalacion();
}

function pintarEquipoInstalacion() {
  const box = document.getElementById('tarea-equipo');
  if (!box) return;
  const lider = document.getElementById('tarea-carpintero-input').value;
  const marcados = new Set(Array.from(box.querySelectorAll('input:checked')).map((i) => i.value));
  const lista = personalActivo().filter((c) => c.nombre !== lider);
  box.innerHTML = lista.length
    ? lista.map((c) => `
        <label class="flex items-center gap-2 p-2 rounded-lg border border-slate-200 bg-white cursor-pointer hover:bg-slate-50">
          <input type="checkbox" value="${esc(c.nombre)}" ${marcados.has(c.nombre) ? 'checked' : ''} class="accent-red-600" />
          <span class="font-bold text-slate-800">${esc(c.nombre)}</span>
          <span class="text-[10px] text-slate-400 ml-auto">${esc(c.cargo)}</span>
        </label>`).join('')
    : '<p class="text-[11px] text-slate-400">No hay más personal registrado.</p>';
}

function abrirModalTarea(carpenter, ctx) {
  if (!puedeAsignar()) { showToast('Solo Gerencia u Operaciones pueden gestionar asignaciones.'); return; }
  if (!personalActivo().length) {
    showToast(puedeGestionarPersonal() ? 'Primero registra el personal en Equipo > Personal.' : 'Gerencia debe registrar el personal antes de asignar tareas.');
    return;
  }
  state.tareaCtx = ctx || null;
  const editando = Boolean(ctx);
  document.getElementById('tarea-title').textContent = editando ? 'Editar Tarea' : 'Asignar Tarea';
  document.getElementById('tarea-carpintero-input').innerHTML = opcionesPersonal(carpenter || '');
  document.getElementById('tarea-texto').value = ctx?.text || '';
  document.getElementById('tarea-detalle').value = ctx?.detalle || '';
  document.getElementById('tarea-actividad').innerHTML = ACTIVIDADES
    .map((a) => `<option value="${esc(a.v)}" ${a.v === (ctx?.actividad || 'Armando') ? 'selected' : ''}>${esc(a.v)}</option>`).join('');
  document.getElementById('tarea-es-lider').checked = Boolean(ctx?.esLider);
  const selEstado = document.getElementById('tarea-estado');
  selEstado.innerHTML = ESTADOS_TRABAJO.map((x) => `<option value="${esc(x)}">${esc(x)}</option>`).join('');
  selEstado.value = estadoTrabajoValido(ctx?.estado);
  /* En muebles el estado necesita la v9 de la base */
  document.getElementById('tarea-estado-box').classList.toggle('hidden', ctx?.kind === 'mueble' && !mueblesConEstado);
  document.getElementById('tarea-equipo').innerHTML = '';
  document.getElementById('tarea-info').textContent = ctx?.kind === 'mueble'
    ? 'Mueble del proyecto: puedes cambiar la persona, la actividad y el detalle. La fase del mueble se controla en la ficha del proyecto.'
    : 'Escoge qué está haciendo la persona y describe el detalle (ej. Escogiendo material → Material Ámbar).';

  const sel = document.getElementById('tarea-proyecto');
  sel.innerHTML = '<option value="">Seleccionar proyecto...</option>' + state.proyectos
    .filter((p) => p.status !== EST_PRODUCCION.COMPLETADO || p.id === ctx?.projectId)
    .map((p) => `<option value="${esc(p.id)}">${esc(p.id)} · ${esc(p.name)} (${esc(p.client)})</option>`).join('');
  sel.value = ctx?.projectId || '';
  sel.disabled = ctx?.kind === 'mueble';

  const btnEliminar = document.getElementById('tarea-eliminar');
  btnEliminar.classList.toggle('hidden', !editando);
  btnEliminar.textContent = ctx?.kind === 'mueble' ? 'Quitar asignación' : 'Eliminar tarea';
  pintarModoTarea();
  document.getElementById('tarea-modal').classList.remove('is-hidden');
  setTimeout(() => document.getElementById('tarea-carpintero-input')?.focus(), 40);
}

function cerrarModalTarea() {
  document.getElementById('tarea-modal')?.classList.add('is-hidden');
  state.tareaCtx = null;
}

function guardarTarea() {
  if (!puedeAsignar()) { showToast('Tu rol no puede modificar asignaciones.'); return; }
  const persona = document.getElementById('tarea-carpintero-input').value.trim();
  const actividad = document.getElementById('tarea-actividad').value;
  const detalle = document.getElementById('tarea-detalle').value.trim();
  const projectId = document.getElementById('tarea-proyecto').value;
  const texto = document.getElementById('tarea-texto').value.trim() || actividad;
  const estado = estadoTrabajoValido(document.getElementById('tarea-estado')?.value);
  const ctx = state.tareaCtx;
  if (!persona) { showToast('Selecciona el personal.'); return; }
  if (!ACTIVIDAD_POR_NOMBRE[actividad]) { showToast('Selecciona la actividad.'); return; }

  const agregar = (nombre, tarea) => {
    if (!state.tareas[nombre]) state.tareas[nombre] = [];
    state.tareas[nombre].push(tarea);
  };

  if (!ctx) {
    if (!projectId) { showToast('Selecciona un proyecto para la tarea.'); return; }
    if (actividad === 'Instalación') {
      const apoyo = Array.from(document.querySelectorAll('#tarea-equipo input:checked')).map((i) => i.value).filter((n) => n !== persona);
      const grupoId = nuevoUUID();
      agregar(persona, { id: uid(), text: texto, projectId, phase: 'Armado', actividad, detalle, grupoId, esLider: true, estado });
      apoyo.forEach((n) => agregar(n, { id: uid(), text: texto, projectId, phase: 'Armado', actividad, detalle, grupoId, esLider: false, estado }));
      commit();
      cerrarModalTarea();
      showToast(`Instalación asignada: ${persona} (líder)${apoyo.length ? ` + ${apoyo.length} persona${apoyo.length === 1 ? '' : 's'}` : ''}.`);
      return;
    }
    agregar(persona, { id: uid(), text: texto, projectId, phase: 'Armado', actividad, detalle, grupoId: null, esLider: false, estado });
  } else if (ctx.kind === 'mueble') {
    const p = state.proyectos.find((x) => x.id === ctx.projectId);
    const m = (p?.muebles || []).find((x) => x.id === ctx.muebleId);
    if (!m) return;
    m.carpenter = persona;
    m.name = document.getElementById('tarea-texto').value.trim() || m.name;
    m.actividad = actividad;
    m.detalle = detalle;
    if (mueblesConEstado) m.estadoTrabajo = estado;
  } else {
    const lista = state.tareas[ctx.carpenter] || [];
    const idx = lista.findIndex((t) => t.id === ctx.taskId);
    if (idx < 0) return;
    const [t] = lista.splice(idx, 1);
    if (!lista.length) delete state.tareas[ctx.carpenter];
    t.text = texto;
    t.projectId = projectId || t.projectId;
    t.actividad = actividad;
    t.detalle = detalle;
    t.estado = estado;
    if (actividad === 'Instalación') {
      t.grupoId = t.grupoId || nuevoUUID();
      t.esLider = document.getElementById('tarea-es-lider').checked;
      /* Solo un líder por instalación */
      if (t.esLider) {
        Object.values(state.tareas).forEach((ls) => (ls || []).forEach((x) => { if (x.grupoId === t.grupoId) x.esLider = false; }));
      }
    } else {
      t.grupoId = null;
      t.esLider = false;
    }
    agregar(persona, t);
  }
  commit();
  cerrarModalTarea();
  showToast('Tarea guardada y sincronizada.');
}

function eliminarTarea(carpenter, ctx) {
  if (!puedeAsignar()) { showToast('Tu rol no puede eliminar asignaciones.'); return; }
  if (ctx.kind === 'mueble') {
    const p = state.proyectos.find((x) => x.id === ctx.projectId);
    const m = (p?.muebles || []).find((x) => x.id === ctx.muebleId);
    if (!m) return;
    if (!window.confirm(`¿Quitar a ${m.carpenter || 'esta persona'} del mueble "${m.name}"?\nEl mueble sigue en el proyecto ${p.id}, sin responsable.`)) return;
    m.carpenter = '';
    commit();
    cerrarModalTarea();
    showToast('Asignación quitada. El mueble quedó sin responsable.');
    return;
  }
  if (!window.confirm(`¿Eliminar la tarea "${ctx.text || 'asignada'}" de ${ctx.carpenter || carpenter}?`)) return;
  const owner = ctx.carpenter || carpenter;
  state.tareas[owner] = (state.tareas[owner] || []).filter((t) => t.id !== ctx.taskId);
  if (state.tareas[owner].length === 0) delete state.tareas[owner];
  commit();
  cerrarModalTarea();
  showToast('Tarea eliminada.');
}

/* ---- Personal de planta (solo Gerencia) ---- */

function abrirPersonal() {
  if (!puedeGestionarPersonal()) { showToast('Solo Gerencia registra el personal.'); return; }
  document.getElementById('personal-nombre').value = '';
  document.getElementById('personal-cargo').innerHTML = CARGOS_PERSONAL.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
  renderPersonal();
  document.getElementById('personal-modal').classList.remove('is-hidden');
  setTimeout(() => document.getElementById('personal-nombre')?.focus(), 40);
}

function cerrarPersonal() {
  document.getElementById('personal-modal')?.classList.add('is-hidden');
}

function renderPersonal() {
  const box = document.getElementById('personal-lista');
  if (!box) return;
  const lista = (state.carpinteros || []).slice()
    .sort((a, b) => (Number(b.activo !== false) - Number(a.activo !== false)) || a.nombre.localeCompare(b.nombre));
  if (!lista.length) {
    box.innerHTML = '<p class="text-xs text-slate-400 text-center py-4">Aún no hay personal registrado.</p>';
    return;
  }
  box.innerHTML = lista.map((c) => {
    const activo = c.activo !== false;
    const tareas = (state.tareas[c.nombre] || []).length;
    return `
      <div class="flex flex-wrap items-center gap-2 p-3 rounded-xl border ${activo ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-200 opacity-70'}" data-personal-row="${esc(c.id)}">
        <div class="min-w-0 flex-1">
          <p class="text-sm font-bold text-slate-900 truncate">${esc(c.nombre)}</p>
          <p class="text-[10px] text-slate-500">${tareas} tarea${tareas === 1 ? '' : 's'} · ${activo ? 'Activo' : 'Inactivo'}</p>
        </div>
        <select class="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-900" data-personal-cargo="${esc(c.id)}" aria-label="Cargo de ${esc(c.nombre)}">
          ${CARGOS_PERSONAL.map((x) => `<option value="${esc(x)}" ${x === c.cargo ? 'selected' : ''}>${esc(x)}</option>`).join('')}
        </select>
        <button type="button" class="text-xs font-bold px-3 py-1.5 rounded-lg border ${activo ? 'border-slate-300 text-slate-700 hover:bg-slate-100' : 'border-emerald-300 text-emerald-700 hover:bg-emerald-50'}" data-personal-toggle="${esc(c.id)}">${activo ? 'Desactivar' : 'Reactivar'}</button>
        <button type="button" class="task-icon-btn task-icon-btn--danger" data-personal-eliminar="${esc(c.id)}" title="Eliminar a ${esc(c.nombre)}" aria-label="Eliminar a ${esc(c.nombre)}"><i class="fas fa-trash" aria-hidden="true"></i></button>
      </div>`;
  }).join('');
}

async function recargarDesdeBase() {
  if (!sbListo || !state.user) return;
  await encolarSync(async () => {
    const data = await leerSupabase();
    if (!state.user) return;
    aplicarDatos(data);
    reconstruirSnapshot();
    guardarCacheLocal();
    renderAll();
  });
}

async function agregarPersonal() {
  if (!puedeGestionarPersonal()) return;
  const nombre = document.getElementById('personal-nombre').value.trim().replace(/\s+/g, ' ');
  const cargo = document.getElementById('personal-cargo').value;
  if (!nombre) { showToast('Escribe el nombre de la persona.'); return; }
  if ((state.carpinteros || []).some((c) => c.nombre.toLowerCase() === nombre.toLowerCase())) {
    showToast('Ya existe una persona con ese nombre.');
    return;
  }
  const btn = document.getElementById('personal-agregar');
  btn.disabled = true;
  const { data, error } = await supabaseClient.from('carpinteros').insert({ nombre, cargo, activo: true }).select('*');
  btn.disabled = false;
  if (error || !data?.length) { showToast(`No se pudo registrar: ${mensajeError(error, 'sin permiso')}`); return; }
  state.carpinteros.push({ id: data[0].id, nombre: data[0].nombre, cargo: data[0].cargo, activo: true });
  document.getElementById('personal-nombre').value = '';
  renderPersonal();
  renderEquipo();
  showToast(`${nombre} registrado como ${cargo}.`);
}

async function actualizarPersonal(id, cambios) {
  if (!puedeGestionarPersonal()) return;
  const c = (state.carpinteros || []).find((x) => x.id === id);
  if (!c) return;
  const { data, error } = await supabaseClient.from('carpinteros').update(cambios).eq('id', id).select('*');
  if (error || !data?.length) { showToast(`No se pudo actualizar: ${mensajeError(error, 'sin permiso')}`); renderPersonal(); return; }
  Object.assign(c, { cargo: data[0].cargo, activo: data[0].activo !== false });
  renderPersonal();
  renderEquipo();
  showToast(`${c.nombre}: ${'activo' in cambios ? (c.activo ? 'reactivado' : 'desactivado') : `ahora es ${c.cargo}`}.`);
}

/* Eliminar a una persona: se borran sus tareas y los muebles que tenía
   quedan sin responsable. (Desactivar la conserva en el historial.) */
async function eliminarPersonal(id) {
  if (!puedeGestionarPersonal()) return;
  const c = (state.carpinteros || []).find((x) => x.id === id);
  if (!c) return;
  const tareas = (state.tareas[c.nombre] || []).length;
  const muebles = state.proyectos.reduce((n, p) => n + (p.muebles || []).filter((m) => m.carpenter === c.nombre).length, 0);
  const aviso = `¿Eliminar a ${c.nombre} (${c.cargo})?\n\n`
    + `${tareas ? `Se borrarán sus ${tareas} tarea${tareas === 1 ? '' : 's'}. ` : ''}`
    + `${muebles ? `${muebles} mueble${muebles === 1 ? '' : 's'} quedará${muebles === 1 ? '' : 'n'} sin responsable. ` : ''}`
    + 'Si solo dejó de trabajar temporalmente, usa "Desactivar".';
  if (!window.confirm(aviso)) return;
  if (!sbListo) { showToast('Sin conexión con la base de datos.'); return; }

  /* Al instante en pantalla; la base se actualiza en segundo plano (en orden,
     así varias eliminaciones seguidas no se estorban ni recargan todo). */
  delete state.tareas[c.nombre];
  state.proyectos.forEach((p) => (p.muebles || []).forEach((m) => { if (m.carpenter === c.nombre) m.carpenter = ''; }));
  state.carpinteros = state.carpinteros.filter((x) => x.id !== id);
  renderPersonal();
  commit(); // el guardado borra sus tareas y deja los muebles sin responsable
  showToast(`${c.nombre} eliminado del personal.`);
  encolarSync(async () => {
    const r = await supabaseClient.from('carpinteros').delete().eq('id', id).select('id');
    if (r.error || !(r.data || []).length) {
      showToast(`No se pudo eliminar a ${c.nombre}: ${mensajeError(r.error, 'sin permiso')}. Se recargan los datos.`);
      setTimeout(() => recargarDesdeBase().then(renderPersonal), 0);
    }
  });
}

function bindEquipoEvents() {
  document.getElementById('equipo-personal')?.addEventListener('click', abrirPersonal);
  document.getElementById('personal-close')?.addEventListener('click', cerrarPersonal);
  document.getElementById('personal-agregar')?.addEventListener('click', agregarPersonal);
  document.getElementById('personal-nombre')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); agregarPersonal(); } });
  document.getElementById('personal-lista')?.addEventListener('change', (e) => {
    const sel = e.target.closest('[data-personal-cargo]');
    if (sel) actualizarPersonal(sel.dataset.personalCargo, { cargo: sel.value });
  });
  document.getElementById('personal-lista')?.addEventListener('click', (e) => {
    const borrar = e.target.closest('[data-personal-eliminar]');
    if (borrar) { eliminarPersonal(borrar.dataset.personalEliminar); return; }
    const btn = e.target.closest('[data-personal-toggle]');
    if (!btn) return;
    const c = state.carpinteros.find((x) => x.id === btn.dataset.personalToggle);
    if (c) actualizarPersonal(c.id, { activo: c.activo === false });
  });
  document.getElementById('tarea-actividad')?.addEventListener('change', pintarModoTarea);
  document.getElementById('tarea-carpintero-input')?.addEventListener('change', () => {
    if (!state.tareaCtx && document.getElementById('tarea-actividad').value === 'Instalación') pintarEquipoInstalacion();
  });
}

/* ==========================================================================
   11. SEGUIMIENTO COMERCIAL · DRAG & DROP · FICHA COMERCIAL
   ========================================================================== */

function itemsComercial() {
  const comerciales = state.comercial
    .filter((c) => !c.proyectoId)
    .filter((c) => state.comercialTrimestre === 'Todos los Trimestres' || c.trimester === state.comercialTrimestre)
    .map((c) => ({
      kind: 'comercial',
      id: c.id,
      cliente: c.cliente,
      etapa: c.etapa,
      trimester: c.trimester,
      detalle: c.detalle,
      alert: c.alert,
      motivo: c.motivo,
      pendientes: 0,
      proyectoId: c.proyectoId,
      raw: c,
    }));
  const proyectos = state.proyectos
    .filter((p) => state.comercialTrimestre === 'Todos los Trimestres' || p.trimester === state.comercialTrimestre)
    .map((p) => ({
      kind: 'proyecto',
      id: p.id,
      cliente: p.client || p.name,
      etapa: etapaComercialProyecto(p),
      trimester: p.trimester,
      detalle: detalleProyecto(p),
      alert: primerPendiente(p)?.text || '',
      motivo: '',
      pendientes: (p.pendientes || []).length,
      proyectoId: p.id,
      raw: p,
    }));
  return [...comerciales, ...proyectos];
}

function opcionesEtapa(kind, actual) {
  const etapas = kind === 'proyecto'
    ? ETAPAS_COMERCIAL.filter((e) => !['Prospectos', 'Prospecto No Continuado'].includes(e))
    : ETAPAS_COMERCIAL.slice();
  return etapas.map((e) => `<option value="${esc(e)}" ${e === actual ? 'selected' : ''}>${esc(e)}</option>`).join('');
}

function crearTarjetaComercial(item) {
  const card = document.createElement('div');
  card.className = 'comercial-card bg-white p-3 rounded-xl border border-slate-200 shadow-sm cursor-pointer hover:shadow-md hover:border-red-300 transition-all group';
  card.draggable = true;
  card.dataset.ccKind = item.kind;
  card.dataset.ccId = item.id;
  const prospecto = item.kind === 'comercial' && item.etapa === 'Prospectos';
  card.innerHTML = `
    <div class="flex justify-between items-start mb-2 gap-2">
      <span class="text-[9px] font-black font-mono text-slate-400 group-hover:text-red-600 transition-colors">${esc(item.id)}</span>
      <span class="w-2 h-2 rounded-full ${item.motivo ? 'bg-red-500' : 'bg-emerald-500'}"></span>
    </div>
    <h4 class="font-bold text-slate-900 text-sm leading-tight mb-1">${esc(item.cliente)}</h4>
    <p class="text-xs text-slate-500 comercial-detalle mb-2">${esc(item.detalle)}</p>
    ${item.motivo ? `<p class="text-[10px] text-red-700 bg-red-50 border border-red-100 rounded-lg p-1.5 mb-2"><strong>Motivo:</strong> ${esc(item.motivo)}</p>` : ''}
    ${item.pendientes ? `<p class="text-[10px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1 mb-2"><i class="fas fa-triangle-exclamation mr-1" aria-hidden="true"></i>${item.pendientes} pendiente${item.pendientes === 1 ? '' : 's'}</p>` : ''}
    <div class="flex items-center gap-1 border-t border-slate-100 pt-2">
      <select class="min-w-0 flex-1 bg-slate-50 border border-slate-200 rounded-lg px-1.5 py-1 text-[10px] font-bold text-slate-700" data-com-stage data-cc-kind="${item.kind}" data-cc-id="${esc(item.id)}" draggable="false" aria-label="Cambiar etapa comercial">
        ${opcionesEtapa(item.kind, item.etapa)}
      </select>
      <span class="text-[9px] text-slate-400" title="Arrastra la tarjeta para moverla"><i class="fas fa-grip-vertical" aria-hidden="true"></i></span>
    </div>
    ${prospecto && puedeAprobarProspecto() ? `
      <div class="mt-2 pt-2 border-t border-slate-100 flex items-center gap-2">
        <button type="button" class="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black py-1.5 rounded-lg" data-cc-aprobar="${esc(item.id)}">Aprobar</button>
        <button type="button" class="flex-1 bg-red-600 hover:bg-red-700 text-white text-[10px] font-black py-1.5 rounded-lg" data-cc-rechazar="${esc(item.id)}">Rechazar</button>
      </div>` : ''}`;
  return card;
}

function renderComercial() {
  const board = document.getElementById('comercial-board');
  if (!board) return;
  board.innerHTML = '';
  const items = itemsComercial();

  ETAPAS_COMERCIAL.forEach((stage) => {
    const stageItems = items.filter((i) => i.etapa === stage);
    const col = document.createElement('div');
    col.className = 'w-72 shrink-0 flex flex-col bg-slate-100/50 border border-slate-200 rounded-2xl';
    col.dataset.stageCol = stage;
    col.innerHTML = `
      <div class="p-3 border-b border-slate-200 flex justify-between items-center bg-white/50 rounded-t-2xl">
        <h3 class="font-bold text-slate-800 text-sm">${esc(stage)}</h3>
        <span class="bg-slate-200 text-slate-700 text-[10px] font-black px-2 py-0.5 rounded-full">${stageItems.length}</span>
      </div>`;
    const body = document.createElement('div');
    body.className = 'p-3 flex-1 overflow-y-auto space-y-3 min-h-[10rem]';
    stageItems.forEach((i) => body.appendChild(crearTarjetaComercial(i)));
    if (stageItems.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'h-20 border-2 border-dashed border-slate-200 rounded-xl flex items-center justify-center';
      empty.innerHTML = '<span class="text-xs text-slate-400 font-medium">Arrastra aquí</span>';
      body.appendChild(empty);
    }
    col.appendChild(body);
    board.appendChild(col);
  });
}

function abrirComercialModal(kind, id) {
  const raw = kind === 'proyecto'
    ? state.proyectos.find((x) => x.id === id)
    : state.comercial.find((x) => x.id === id);
  if (!raw) return;
  state.comercialCtx = { kind, id };

  const etapa = kind === 'proyecto' ? etapaComercialProyecto(raw) : raw.etapa;
  const cliente = kind === 'proyecto' ? (raw.client || raw.name) : raw.cliente;
  const detalle = kind === 'proyecto' ? detalleProyecto(raw) : raw.detalle;

  document.getElementById('comercial-modal-id').textContent = raw.id;
  document.getElementById('comercial-modal-tipo').textContent = kind === 'proyecto' ? 'Proyecto en producción' : (raw.rechazado ? 'Prospecto No Continuado' : 'Prospecto comercial');
  document.getElementById('comercial-modal-title').textContent = cliente;
  document.getElementById('comercial-modal-sub').textContent = `${raw.trimester || 'Sin trimestre'} · Etapa: ${etapa}`;
  document.getElementById('comercial-modal-etapa').innerHTML = opcionesEtapa(kind, etapa);
  document.getElementById('comercial-modal-detalle').value = detalle;
  document.getElementById('comercial-modal-trimestre').value = raw.trimester || 'Q4 - 2026';

  const alerta = document.getElementById('comercial-modal-alerta');
  if (raw.alert) {
    alerta.classList.remove('hidden');
    alerta.textContent = `Requiere atención: ${raw.alert}`;
  } else {
    alerta.classList.add('hidden');
  }

  const motivo = document.getElementById('comercial-modal-motivo');
  if (kind === 'comercial' && raw.motivo) {
    motivo.classList.remove('hidden');
    motivo.textContent = `Motivo del rechazo: ${raw.motivo}`;
  } else {
    motivo.classList.add('hidden');
  }

  const pendientes = kind === 'proyecto' ? (raw.pendientes || []) : [];
  document.getElementById('comercial-modal-pendientes').innerHTML = kind === 'proyecto'
    ? (pendientes.length
      ? `<div class="space-y-1.5">${pendientes.map((x) => `<div class="flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-lg p-2"><span class="text-[9px] font-black uppercase text-amber-700">${esc(labelPendiente(x.tipo))}</span><span class="text-slate-800 font-semibold">${esc(x.text)}</span></div>`).join('')}</div>`
      : '<p class="text-xs text-slate-400">Sin pendientes registrados.</p>')
    : '<p class="text-xs text-slate-400">Al aprobar el prospecto se crea la ficha de producción y aquí aparecerán sus pendientes.</p>';

  const esProspecto = kind === 'comercial' && etapa === 'Prospectos';
  document.getElementById('comercial-modal-aprobar').classList.toggle('hidden', !(esProspecto && puedeAprobarProspecto()));
  document.getElementById('comercial-modal-rechazar').classList.toggle('hidden', !(esProspecto && puedeAprobarProspecto()));
  document.getElementById('comercial-modal-ficha').classList.toggle('hidden', !(kind === 'proyecto' || raw.proyectoId));
  document.getElementById('comercial-modal-guardar').classList.toggle('hidden', !puedeGestionarComercial());
  document.getElementById('comercial-modal').classList.remove('is-hidden');
}

function cerrarComercialModal() {
  document.getElementById('comercial-modal')?.classList.add('is-hidden');
  state.comercialCtx = null;
}

function guardarComercialModal() {
  if (!puedeGestionarComercial()) { showToast('Tu rol no puede modificar la ficha comercial.'); return; }
  const ctx = state.comercialCtx;
  if (!ctx) return;
  const detalle = document.getElementById('comercial-modal-detalle').value.trim();
  const trimester = document.getElementById('comercial-modal-trimestre').value;
  if (ctx.kind === 'proyecto') {
    const p = state.proyectos.find((x) => x.id === ctx.id);
    if (!p) return;
    p.commercialDetail = detalle || detalleProyecto(p);
    p.trimester = trimester;
  } else {
    const c = state.comercial.find((x) => x.id === ctx.id);
    if (!c) return;
    c.detalle = detalle || c.detalle;
    c.trimester = trimester;
  }
  commit();
  abrirComercialModal(ctx.kind, ctx.id);
  showToast('Ficha comercial actualizada.');
}

function cambiarEtapaComercial(kind, id, stage) {
  if (!puedeGestionarComercial()) { showToast('Tu rol no puede mover proyectos entre etapas.'); renderComercial(); return; }
  if (kind === 'comercial') {
    const item = state.comercial.find((x) => x.id === id);
    if (!item) return;
    if (stage === 'Prospecto No Continuado') {
      if (!puedeAprobarProspecto()) {
        showToast('Solo Gerencia o Secretaría pueden rechazar prospectos.');
        renderComercial();
        return;
      }
      abrirRechazo(id);
      return;
    }
    if (stage === 'Aprobados' && !item.proyectoId) {
      if (!puedeAprobarProspecto()) { showToast('Solo Gerencia o Secretaría pueden aprobar prospectos.'); renderComercial(); return; }
      aprobarProspecto(id);
      return;
    }
    item.etapa = stage;
    item.rechazado = false;
    item.motivo = '';
    commit();
    if (state.comercialCtx?.kind === 'comercial' && state.comercialCtx.id === id) abrirComercialModal(kind, id);
    showToast(`${item.cliente}: etapa ${stage}.`);
  } else {
    const p = state.proyectos.find((x) => x.id === id);
    if (!p) return;
    const etapasProyecto = ETAPAS_COMERCIAL.filter((e) => !['Prospectos', 'Prospecto No Continuado'].includes(e));
    if (!etapasProyecto.includes(stage)) {
      showToast('Un proyecto en producción no puede volver a Prospectos ni marcarse como No Continuado.');
      renderComercial();
      return;
    }
    p.commercialStage = stage;
    commit();
    if (state.comercialCtx?.kind === 'proyecto' && state.comercialCtx.id === id) abrirComercialModal(kind, id);
    showToast(`${p.name}: etapa ${stage}.`);
  }
}

function aprobarProspecto(id) {
  if (!puedeAprobarProspecto()) { showToast('Solo Gerencia o Secretaría pueden aprobar prospectos.'); return; }
  const item = state.comercial.find((x) => x.id === id);
  if (!item || item.proyectoId) return;
  const nuevoId = generarIdProyecto();
  const pendientes = item.alert
    ? [{ id: uid('pd'), text: item.alert, tipo: 'requerimiento', prioridad: 'media', createdAt: hoyISO() }]
    : [];
  state.proyectos.push(normalizarProyecto({
    id: nuevoId,
    name: item.cliente,
    client: item.cliente,
    city: 'Por definir',
    neighborhood: '',
    address: 'Por definir',
    phone: '',
    phase: 'Recepción',
    manufacturingPhase: 'Recepción',
    status: EST_PRODUCCION.EN_PROCESO,
    commercialStage: 'Aprobados',
    trimester: item.trimester || 'Q4 - 2026',
    commercialDetail: item.detalle || `${item.cliente}: Pedido por definir.`,
    leadCarpenter: '',
    logisticOperator: 'Por asignar',
    dateStart: hoyISO(),
    dateExpected: item.dateExpected || 'Por definir',
    image: DEFAULT_IMAGE,
    arquitecto: state.user?.nombre || 'Felipe Mora',
    pendientes,
    muebles: [],
    pedidos: [],
    incidentes: [],
    archivos: [],
    dropboxFiles: { publicFiles: [] },
  }));
  item.etapa = 'Aprobados';
  item.proyectoId = nuevoId;
  item.rechazado = false;
  item.motivo = '';
  commit();
  cerrarComercialModal();
  showToast(`Prospecto aprobado. Proyecto ${nuevoId} creado.`);
}

function abrirRechazo(id) {
  if (!puedeAprobarProspecto()) { showToast('Solo Gerencia o Secretaría pueden rechazar prospectos.'); return; }
  const item = state.comercial.find((x) => x.id === id);
  if (!item) return;
  state.rechazoId = id;
  document.getElementById('rechazo-cliente').textContent = item.cliente;
  document.getElementById('rechazo-motivo').value = '';
  document.getElementById('rechazo-error').classList.add('hidden');
  document.getElementById('rechazo-modal').classList.remove('is-hidden');
  setTimeout(() => document.getElementById('rechazo-motivo')?.focus(), 40);
}

function cerrarRechazo() {
  document.getElementById('rechazo-modal')?.classList.add('is-hidden');
  state.rechazoId = null;
  renderComercial();
  const modal = document.getElementById('comercial-modal');
  if (state.comercialCtx && modal && !modal.classList.contains('is-hidden')) {
    abrirComercialModal(state.comercialCtx.kind, state.comercialCtx.id);
  }
}

function confirmarRechazo() {
  if (!puedeAprobarProspecto()) { showToast('Tu rol no puede rechazar prospectos.'); return; }
  const id = state.rechazoId;
  const item = state.comercial.find((x) => x.id === id);
  if (!item) return;
  const motivo = document.getElementById('rechazo-motivo').value.trim();
  if (!motivo) {
    document.getElementById('rechazo-error').classList.remove('hidden');
    return;
  }
  item.etapa = 'Prospecto No Continuado';
  item.rechazado = true;
  item.motivo = motivo;
  commit();
  document.getElementById('rechazo-modal').classList.add('is-hidden');
  state.rechazoId = null;
  cerrarComercialModal();
  showToast(`${item.cliente}: Prospecto No Continuado.`);
}

function guardarProspecto(e) {
  e.preventDefault();
  if (!puedeCrearProspecto()) { showToast('Tu rol no puede crear prospectos.'); return; }
  const cliente = document.getElementById('prospecto-cliente').value.trim();
  const detalle = document.getElementById('prospecto-detalle').value.trim();
  if (!cliente || !detalle) return;
  state.comercial.push(normalizarComercial({
    id: generarIdComercial(),
    cliente,
    etapa: document.getElementById('prospecto-etapa').value,
    trimester: document.getElementById('prospecto-trimestre').value,
    status: EST_PRODUCCION.EN_PROCESO,
    dateExpected: 'Por definir',
    proyectoId: null,
    alert: document.getElementById('prospecto-alerta').value.trim(),
    detalle,
    rechazado: false,
    motivo: '',
  }));
  commit();
  document.getElementById('prospecto-form').reset();
  document.getElementById('prospecto-modal').classList.add('is-hidden');
  showToast('Prospecto creado y visible en el flujo comercial.');
}
/* ==========================================================================
   12. CENTRO DE CONTROL LOGÍSTICO
   ========================================================================== */

function tareasAgrupadas() {
  const mapa = {};
  state.proyectos.forEach((p) => {
    if (p.status === EST_PRODUCCION.COMPLETADO) return;
    (p.muebles || []).forEach((m) => {
      if (!m.carpenter) return;
      if (!mapa[m.carpenter]) mapa[m.carpenter] = [];
      mapa[m.carpenter].push({ text: m.name, projectId: p.id, projectName: p.name, phase: m.manufacturingPhase });
    });
  });
  Object.entries(state.tareas || {}).forEach(([carpenter, tareas]) => {
    (tareas || []).forEach((t) => {
      const p = state.proyectos.find((x) => x.id === t.projectId);
      if (p?.status === EST_PRODUCCION.COMPLETADO) return;
      if (!mapa[carpenter]) mapa[carpenter] = [];
      mapa[carpenter].push({ text: t.text, projectId: t.projectId, projectName: p?.name || 'Sin proyecto', phase: t.actividad || 'Otra' });
    });
  });
  return mapa;
}

function materialesFaltantes() {
  const lista = [];
  state.proyectos.forEach((p) => {
    if (p.status === EST_PRODUCCION.COMPLETADO) return;
    (p.pendientes || []).forEach((x) => {
      if (['material', 'requerimiento', 'bloqueo'].includes(x.tipo)) lista.push({ proyecto: p, pendiente: x });
    });
  });
  return lista;
}

function incidentesAbiertosGlobal() {
  const lista = [];
  state.proyectos.forEach((p) => {
    if (p.status === EST_PRODUCCION.COMPLETADO) return;
    (p.incidentes || []).forEach((x) => { if (incidenteAbierto(x)) lista.push({ p, x }); });
  });
  return lista.sort((a, b) => (Number(incidenteVencido(b.x)) - Number(incidenteVencido(a.x)))
    || (ORDEN_GRAVEDAD[a.x.gravedad] - ORDEN_GRAVEDAD[b.x.gravedad]));
}

function novedadesUrgentes() {
  const novedades = [];
  incidentesAbiertosGlobal().forEach(({ p, x }) => {
    if (x.gravedad === 'Crítica' || incidenteVencido(x)) {
      novedades.push({
        severity: 'alta',
        titulo: `${p.id} · Incidente ${x.gravedad.toLowerCase()}${incidenteVencido(x) ? ' (compromiso vencido)' : ''}`,
        detalle: `${x.descripcion} · Responsable: ${x.responsable || 'sin asignar'}`,
        projectId: p.id,
      });
    }
  });
  todasLasCompras().forEach(({ p, od }) => {
    const atraso = diasAtrasoCompra(od);
    if (atraso >= 3 && p.status !== EST_PRODUCCION.COMPLETADO) {
      novedades.push({ severity: 'media', titulo: `${p.id} · Compra atrasada ${atraso} días`, detalle: `${od.item} · ${od.supplier}`, projectId: p.id });
    }
  });
  state.proyectos.forEach((p) => {
    if (p.status === EST_PRODUCCION.DETENIDO) {
      novedades.push({
        severity: 'alta',
        titulo: `${p.id} · Proyecto detenido`,
        detalle: primerPendiente(p)?.text || 'Requiere revisión de Gerencia',
        projectId: p.id,
      });
    }
    if (p.status !== EST_PRODUCCION.COMPLETADO && esHoy(p.dateExpected)) {
      novedades.push({
        severity: 'media',
        titulo: `${p.id} · Entrega programada para hoy`,
        detalle: `${p.client} · ${p.city} · ${p.manufacturingPhase}`,
        projectId: p.id,
      });
    }
    (p.pendientes || []).forEach((x) => {
      if (x.prioridad === 'alta' && p.status !== EST_PRODUCCION.COMPLETADO) {
        novedades.push({
          severity: 'alta',
          titulo: `${p.id} · ${labelPendiente(x.tipo)} crítico`,
          detalle: x.text,
          projectId: p.id,
        });
      }
    });
  });
  state.comercial.forEach((c) => {
    if (c.etapa === 'Prospecto No Continuado' && c.motivo) {
      novedades.push({ severity: 'baja', titulo: `${c.id} · Prospecto no continuado`, detalle: `${c.cliente}: ${c.motivo}`, projectId: null });
    }
  });
  return novedades.slice(0, 10);
}

function reportarGerencia() {
  const entregas = state.proyectos.filter((p) => esHoy(p.dateExpected));
  const retrasos = state.proyectos.filter((p) => p.status === EST_PRODUCCION.DETENIDO || (p.status !== EST_PRODUCCION.COMPLETADO && esFechaVencida(p.dateExpected)));
  const materiales = materialesFaltantes();
  const lineas = [
    `REPORTE LOGÍSTICO MODUGAL · ${formatFechaLarga(new Date())}`,
    '',
    `Entregas de hoy (${entregas.length}):`,
    ...(entregas.length ? entregas.map((p) => `- ${p.id} · ${p.client} · ${p.city} · ${p.manufacturingPhase}`) : ['- Sin entregas programadas']),
    '',
    `Proyectos retrasados/detenidos (${retrasos.length}):`,
    ...(retrasos.length ? retrasos.map((p) => `- ${p.id} · ${p.client} · ${p.status} · ${primerPendiente(p)?.text || 'Sin detalle'}`) : ['- Ninguno']),
    '',
    `Materiales/requerimientos faltantes (${materiales.length}):`,
    ...(materiales.length ? materiales.slice(0, 12).map(({ proyecto, pendiente }) => `- ${proyecto.id} · ${pendiente.text}`) : ['- Ninguno']),
    '',
    `Incidentes abiertos (${incidentesAbiertosGlobal().length}):`,
    ...(incidentesAbiertosGlobal().length
      ? incidentesAbiertosGlobal().slice(0, 12).map(({ p, x }) => `- ${p.id} · [${x.gravedad}] ${x.descripcion} · Resp.: ${x.responsable || 'sin asignar'} · ${diasAbiertoIncidente(x)} d${incidenteVencido(x) ? ' · VENCIDO' : ''}${x.detiene ? ' · DETIENE PRODUCCIÓN' : ''}`)
      : ['- Ninguno']),
    '',
    `Compras atrasadas (${todasLasCompras().filter(({ od }) => diasAtrasoCompra(od) > 0).length}):`,
    ...(todasLasCompras().filter(({ od }) => diasAtrasoCompra(od) > 0).map(({ p, od }) => `- ${p.id} · ${od.item} · ${od.supplier} · ${diasAtrasoCompra(od)} d de atraso`)),
  ];
  const texto = lineas.join('\n');
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(texto).then(() => showToast('Reporte copiado. Listo para enviar a Gerencia.'))
      .catch(() => window.alert(texto));
  } else {
    window.alert(texto);
  }
}

function centroCard(icon, title, count, tone, body) {
  const tonos = {
    red: 'bg-red-50 text-red-600 border-red-100',
    amber: 'bg-amber-50 text-amber-600 border-amber-100',
    blue: 'bg-blue-50 text-blue-600 border-blue-100',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    slate: 'bg-slate-100 text-slate-600 border-slate-200',
  };
  return `
    <div class="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
      <div class="p-4 border-b border-slate-200 flex items-center justify-between gap-3">
        <div class="flex items-center gap-3">
          <div class="p-2.5 rounded-xl border ${tonos[tone] || tonos.slate}"><i class="fas ${icon} w-5 h-5" aria-hidden="true"></i></div>
          <h3 class="font-black text-slate-900 text-sm">${title}</h3>
        </div>
        <span class="bg-slate-900 text-white text-xs font-black px-2.5 py-1 rounded-lg">${count}</span>
      </div>
      <div class="p-4 flex-1 space-y-2 max-h-72 overflow-y-auto">${body}</div>
    </div>`;
}

function renderCentro() {
  const grid = document.getElementById('centro-grid');
  if (!grid) return;
  const fecha = document.getElementById('centro-fecha');
  if (fecha) fecha.textContent = formatFechaLarga(new Date());

  const entregas = state.proyectos.filter((p) => esHoy(p.dateExpected));
  const retrasos = state.proyectos.filter((p) => p.status === EST_PRODUCCION.DETENIDO || (p.status !== EST_PRODUCCION.COMPLETADO && esFechaVencida(p.dateExpected)));
  const tareas = tareasAgrupadas();
  const totalTareas = Object.values(tareas).reduce((acc, arr) => acc + arr.length, 0);
  const materiales = materialesFaltantes();
  const urgentes = novedadesUrgentes();
  const incidentes = incidentesAbiertosGlobal();

  const incidentesBody = incidentes.length ? incidentes.slice(0, 10).map(({ p, x }) => `
    <div class="border rounded-xl p-2.5 ${x.gravedad === 'Crítica' || incidenteVencido(x) ? 'border-red-200 bg-red-50' : 'border-slate-200'}">
      <div class="flex items-center justify-between gap-2">
        <p class="text-[9px] font-black uppercase text-slate-500">${esc(p.id)} · ${esc(x.tipo)}</p>
        ${badgeGravedad(x.gravedad)}
      </div>
      <p class="text-[11px] font-bold text-slate-900 mt-1">${esc(x.descripcion)}</p>
      <p class="text-[10px] text-slate-500 mt-0.5">${esc(x.responsable || 'Sin responsable')} · ${diasAbiertoIncidente(x)} d abierto${x.detiene ? ' · <strong class="text-red-700">detiene producción</strong>' : ''}${incidenteVencido(x) ? ' · <strong class="text-red-700">vencido</strong>' : ''}</p>
      <button type="button" class="mt-1 text-[10px] font-black underline text-red-700" data-open-ficha="${esc(p.id)}" data-sub="incidentes">Ver</button>
    </div>`).join('') : '<p class="text-xs text-slate-400">Sin incidentes abiertos.</p>';

  const entregasBody = entregas.length ? entregas.map((p) => `
    <div class="flex items-start justify-between gap-2 border border-slate-200 rounded-xl p-2.5">
      <div class="min-w-0">
        <p class="font-bold text-slate-900 truncate">${esc(p.client)}</p>
        <p class="text-[10px] text-slate-500">${esc(p.city)} · ${esc(p.manufacturingPhase)} · ${esc(p.dateExpected)}</p>
      </div>
      <button type="button" class="shrink-0 text-[10px] font-black text-red-600 bg-red-50 border border-red-100 rounded-lg px-2 py-1" data-open-ficha="${esc(p.id)}">Ver</button>
    </div>`).join('') : '<p class="text-xs text-slate-400">Sin entregas programadas para hoy.</p>';

  const retrasosBody = retrasos.length ? retrasos.map((p) => `
    <div class="border border-red-200 bg-red-50 rounded-xl p-2.5">
      <div class="flex items-center justify-between gap-2">
        <p class="font-bold text-red-900 text-xs">${esc(p.id)} · ${esc(p.client)}</p>
        <span class="text-[9px] font-black uppercase text-red-700">${esc(p.status)}</span>
      </div>
      <p class="text-[10px] text-red-700 mt-1">${esc(primerPendiente(p)?.text || `Fecha prometida: ${p.dateExpected}`)}</p>
      <button type="button" class="mt-1.5 text-[10px] font-black text-red-700 underline" data-open-ficha="${esc(p.id)}">Abrir ficha</button>
    </div>`).join('') : '<p class="text-xs text-slate-400">Sin proyectos retrasados o detenidos.</p>';

  const tareasBody = Object.keys(tareas).length ? Object.entries(tareas).map(([carpenter, arr]) => `
    <div class="flex items-center justify-between gap-2 border border-slate-200 rounded-xl p-2.5">
      <div class="min-w-0">
        <p class="font-bold text-slate-900 text-xs">${esc(carpenter)}</p>
        <p class="text-[10px] text-slate-500 truncate">${esc(arr.slice(0, 2).map((t) => t.text).join(' · '))}</p>
      </div>
      <span class="shrink-0 bg-slate-100 border border-slate-200 text-slate-700 text-[10px] font-black px-2 py-1 rounded-lg">${arr.length}</span>
    </div>`).join('') : '<p class="text-xs text-slate-400">Sin tareas activas asignadas.</p>';

  const materialesBody = materiales.length ? materiales.slice(0, 12).map(({ proyecto, pendiente }) => `
    <div class="flex items-start justify-between gap-2 border border-amber-200 bg-amber-50 rounded-xl p-2.5">
      <div class="min-w-0">
        <p class="text-[9px] font-black uppercase text-amber-700">${esc(proyecto.id)} · ${esc(labelPendiente(pendiente.tipo))}</p>
        <p class="text-[11px] font-semibold text-amber-900">${esc(pendiente.text)}</p>
      </div>
      <button type="button" class="shrink-0 text-[10px] font-black text-amber-800 bg-white border border-amber-200 rounded-lg px-2 py-1" data-open-ficha="${esc(proyecto.id)}" data-sub="pendientes">Ver</button>
    </div>`).join('') : '<p class="text-xs text-slate-400">Sin materiales ni requerimientos faltantes.</p>';

  const urgentesBody = urgentes.length ? urgentes.map((n) => `
    <div class="border rounded-xl p-2.5 ${n.severity === 'alta' ? 'border-red-200 bg-red-50' : (n.severity === 'media' ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-50')}">
      <p class="font-bold text-xs ${n.severity === 'alta' ? 'text-red-900' : (n.severity === 'media' ? 'text-amber-900' : 'text-slate-800')}">${esc(n.titulo)}</p>
      <p class="text-[10px] mt-0.5 ${n.severity === 'alta' ? 'text-red-700' : (n.severity === 'media' ? 'text-amber-700' : 'text-slate-500')}">${esc(n.detalle)}</p>
      ${n.projectId ? `<button type="button" class="mt-1 text-[10px] font-black underline text-red-700" data-open-ficha="${esc(n.projectId)}">Revisar</button>` : ''}
    </div>`).join('') : '<p class="text-xs text-slate-400">Sin novedades urgentes. Todo bajo control.</p>';

  grid.innerHTML = [
    centroCard('fa-truck-fast', 'Entregas programadas para HOY', entregas.length, 'blue', entregasBody),
    centroCard('fa-triangle-exclamation', 'Proyectos retrasados o detenidos', retrasos.length, 'red', retrasosBody),
    centroCard('fa-helmet-safety', `Tareas pendientes por carpintero`, totalTareas, 'emerald', `${tareasBody}<button type="button" class="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-2 rounded-xl text-[11px]" data-centro-tab="equipo">Gestionar en Equipo &amp; Asignaciones</button>`),
    centroCard('fa-triangle-exclamation', 'Incidentes abiertos', incidentes.length, 'red', incidentesBody),
    centroCard('fa-boxes-stacked', 'Materiales / requerimientos faltantes', materiales.length, 'amber', materialesBody),
    centroCard('fa-bullhorn', 'Novedades urgentes para Gerencia', urgentes.length, 'red', `${urgentesBody}<button type="button" class="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 rounded-xl text-[11px]" data-reporte-gerencia>Copiar reporte para Gerencia</button>`),
    centroCard('fa-chart-simple', 'Resumen operativo del día', state.proyectos.filter((p) => p.status !== EST_PRODUCCION.COMPLETADO).length, 'slate', `
      <div class="grid grid-cols-2 gap-2">
        <div class="border border-slate-200 rounded-xl p-2.5"><p class="text-[9px] uppercase font-black text-slate-500">Activos</p><p class="text-xl font-black text-slate-900">${state.proyectos.filter((p) => p.status !== EST_PRODUCCION.COMPLETADO).length}</p></div>
        <div class="border border-slate-200 rounded-xl p-2.5"><p class="text-[9px] uppercase font-black text-slate-500">Detenidos</p><p class="text-xl font-black text-red-600">${state.proyectos.filter((p) => p.status === EST_PRODUCCION.DETENIDO).length}</p></div>
        <div class="border border-slate-200 rounded-xl p-2.5"><p class="text-[9px] uppercase font-black text-slate-500">Pendientes</p><p class="text-xl font-black text-amber-600">${materiales.length}</p></div>
        <div class="border border-slate-200 rounded-xl p-2.5"><p class="text-[9px] uppercase font-black text-slate-500">Carpinteros</p><p class="text-xl font-black text-emerald-600">${Object.keys(tareas).length}</p></div>
      </div>`),
  ].join('');
}

/* ==========================================================================
   13. TABLA GENERAL DE PROYECTOS
   ========================================================================== */

function renderTabla() {
  const tbody = document.getElementById('tabla-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  const lista = state.proyectos.slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const count = document.getElementById('tabla-count');
  if (count) count.textContent = `${lista.length} proyecto${lista.length === 1 ? '' : 's'}`;
  if (lista.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="p-6 text-center text-slate-500">No hay proyectos registrados.</td></tr>';
    return;
  }
  lista.forEach((p) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="p-3 align-top"><button type="button" class="font-mono font-bold text-red-600 hover:underline" data-open-ficha="${esc(p.id)}">${esc(p.id)}</button></td>
      <td class="p-3 align-top"><span class="font-bold text-slate-900">${esc(p.client)}</span><span class="block text-[10px] text-slate-400">${esc(p.name)}</span></td>
      <td class="p-3 align-top text-slate-600">${esc(p.city)}</td>
      <td class="p-3 align-top">
        <span class="font-bold text-slate-800 uppercase text-[10px] block mb-1">${esc(p.manufacturingPhase)}</span>
        ${puedeAvanzar() ? `<div class="flex items-center gap-1">
          <button type="button" class="fase-btn" data-fase-proyecto="${esc(p.id)}" data-delta="-1" title="Retroceder fase" aria-label="Retroceder fase"><i class="fas fa-arrow-left" aria-hidden="true"></i></button>
          <button type="button" class="fase-btn fase-btn--next" data-fase-proyecto="${esc(p.id)}" data-delta="1" title="Avanzar fase" aria-label="Avanzar fase"><i class="fas fa-arrow-right" aria-hidden="true"></i></button>
        </div>` : ''}
      </td>
      <td class="p-3 align-top text-slate-600">${esc(p.leadCarpenter || '—')}</td>
      <td class="p-3 align-top min-w-[22rem]">${pendientesHTML(p)}</td>
      <td class="p-3 align-top text-slate-600">${esc(p.dateExpected || 'Por definir')}</td>`;
    tbody.appendChild(tr);
  });
}

/* ==========================================================================
   14. ESTADÍSTICAS & RENDIMIENTO
   ========================================================================== */

/* ==========================================================================
   14. ESTADÍSTICAS · Medición de tiempos por etapa (v11)
   --------------------------------------------------------------------------
   Etapas que se miden (por proyecto y en promedio):
     1. Esperando material  → compras: fecha de solicitud → fecha de recibido
     2. Escogiendo material → tareas/muebles con esa actividad
     3. Armando             → tareas/muebles con actividad "Armando"
     4. Instalando          → tareas/muebles con actividad "Instalación"
   Duración de una etapa en un proyecto = desde que empezó el primer trabajo
   hasta que terminó el último. Si alguno sigue abierto, la etapa está "en curso".
   El año/trimestre se toma de la fecha en que terminó la etapa.
   ========================================================================== */

const ETAPAS_TIEMPO = [
  { id: 'material', nombre: 'Esperando material', ayuda: 'Desde que se pide hasta que llega todo', porDias: true },
  { id: 'seleccion', nombre: 'Escogiendo material', ayuda: 'Actividad "Escogiendo material"', actividad: 'Escogiendo material' },
  { id: 'armado', nombre: 'Armando', ayuda: 'Actividad "Armando"', actividad: 'Armando' },
  { id: 'instalacion', nombre: 'Instalando', ayuda: 'Actividad "Instalación"', actividad: 'Instalación' },
];
const DIA_MS = 864e5;

function formatoEtapa(ms, porDias) {
  if (ms === null || ms === undefined) return '—';
  if (porDias) {
    const d = Math.round(ms / DIA_MS);
    return d <= 0 ? 'Mismo día' : `${d} d`;
  }
  return formatoDuracion(ms);
}

function trimestreDeFecha(ms) {
  const d = new Date(ms);
  return { anio: d.getFullYear(), q: Math.floor(d.getMonth() / 3) + 1 };
}

/* Trabajos (tareas + muebles asignados) con su etapa */
function trabajosConTiempo() {
  const lista = [];
  Object.entries(state.tareas || {}).forEach(([persona, ts]) => (ts || []).forEach((t) => {
    lista.push({ persona, proyectoId: t.projectId, actividad: t.actividad, estado: t.estado, inicio: t.asignadaEn, fin: t.completadaEn, texto: t.text });
  }));
  state.proyectos.forEach((p) => (p.muebles || []).forEach((m) => {
    if (!m.carpenter) return;
    lista.push({ persona: m.carpenter, proyectoId: p.id, actividad: m.actividad, estado: m.estadoTrabajo, inicio: m.asignadoEn, fin: m.completadoEn, texto: m.name });
  }));
  return lista;
}

/* Medición de una etapa en un proyecto: { ms, terminadaEn, enCurso, n } o null */
function medirEtapa(p, etapa, trabajos, ahora) {
  if (etapa.porDias) {
    const compras = (p.pedidos || []).filter((od) => od.status !== 'Cancelado' && od.fechaSolicitud);
    if (!compras.length) return null;
    const ini = Math.min(...compras.map((od) => parseFecha(od.fechaSolicitud)?.getTime()).filter(Number.isFinite));
    if (!Number.isFinite(ini)) return null;
    const pendientes = compras.filter((od) => !(od.status === 'Recibido' && od.fechaRecibida));
    if (pendientes.length) return { ms: ahora - ini, enCurso: true, n: compras.length };
    const fin = Math.max(...compras.map((od) => parseFecha(od.fechaRecibida)?.getTime()).filter(Number.isFinite));
    return { ms: Math.max(fin - ini, 0), terminadaEn: fin, enCurso: false, n: compras.length };
  }
  const propios = trabajos.filter((w) => w.proyectoId === p.id && w.actividad === etapa.actividad && w.inicio);
  if (!propios.length) return null;
  const ini = Math.min(...propios.map((w) => Date.parse(w.inicio)));
  const abiertos = propios.filter((w) => w.estado !== 'Completado' || !w.fin);
  if (abiertos.length) return { ms: ahora - ini, enCurso: true, n: propios.length };
  const fin = Math.max(...propios.map((w) => Date.parse(w.fin)));
  return { ms: Math.max(fin - ini, 0), terminadaEn: fin, enCurso: false, n: propios.length };
}

function enPeriodo(ms, anio, q) {
  if (!Number.isFinite(ms)) return false;
  const t = trimestreDeFecha(ms);
  return (anio === 'Todos' || t.anio === Number(anio)) && (q === 'Todos' || t.q === Number(q));
}

function promedio(nums) {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}

function calcularEstadisticas() {
  const ahora = Date.now();
  const f = state.statsFiltro || { anio: 'Todos', q: 'Todos', proyecto: 'Todos' };
  const trabajos = trabajosConTiempo();
  const proyectos = state.proyectos.filter((p) => f.proyecto === 'Todos' || p.id === f.proyecto);

  const porProyecto = proyectos.map((p) => ({
    p,
    etapas: Object.fromEntries(ETAPAS_TIEMPO.map((e) => [e.id, medirEtapa(p, e, trabajos, ahora)])),
  })).filter((x) => Object.values(x.etapas).some(Boolean));

  const resumen = ETAPAS_TIEMPO.map((e) => {
    const hechas = porProyecto.map((x) => x.etapas[e.id]).filter((m) => m && !m.enCurso && enPeriodo(m.terminadaEn, f.anio, f.q));
    const enCurso = porProyecto.map((x) => x.etapas[e.id]).filter((m) => m && m.enCurso);
    const valores = hechas.map((m) => m.ms);
    return {
      etapa: e,
      prom: promedio(valores),
      min: valores.length ? Math.min(...valores) : null,
      max: valores.length ? Math.max(...valores) : null,
      n: valores.length,
      enCurso: enCurso.length,
    };
  });

  /* Trimestres del año elegido (o del actual) */
  const anioQ = f.anio === 'Todos' ? new Date().getFullYear() : Number(f.anio);
  const trimestres = [1, 2, 3, 4].map((q) => ({
    q,
    valores: Object.fromEntries(ETAPAS_TIEMPO.map((e) => {
      const ms = porProyecto.map((x) => x.etapas[e.id]).filter((m) => m && !m.enCurso && enPeriodo(m.terminadaEn, anioQ, q)).map((m) => m.ms);
      return [e.id, { prom: promedio(ms), n: ms.length }];
    })),
  }));

  /* Por persona: tareas completadas en el periodo */
  const personas = {};
  trabajos.filter((w) => f.proyecto === 'Todos' || w.proyectoId === f.proyecto).forEach((w) => {
    const r = personas[w.persona] || (personas[w.persona] = { nombre: w.persona, hechas: [], porEtapa: {}, abiertas: [] });
    const ini = Date.parse(w.inicio);
    if (!Number.isFinite(ini)) return;
    if (w.estado === 'Completado' && w.fin) {
      const fin = Date.parse(w.fin);
      if (!enPeriodo(fin, f.anio, f.q)) return;
      r.hechas.push(fin - ini);
      const et = ETAPAS_TIEMPO.find((e) => e.actividad && e.actividad === w.actividad);
      if (et) (r.porEtapa[et.id] = r.porEtapa[et.id] || []).push(fin - ini);
    } else {
      r.abiertas.push(ahora - ini);
    }
  });

  return { f, porProyecto, resumen, trimestres, anioQ, personas: Object.values(personas) };
}

function barraTiempo(ms, max, texto) {
  const pct = ms && max ? Math.max(4, Math.round((ms / max) * 100)) : 0;
  return `<div class="stat-barra" title="${esc(texto)}"><span style="width:${pct}%"></span></div>`;
}

function renderStats() {
  const cont = document.getElementById('stats-view');
  if (!cont) return;
  if (!state.statsFiltro) state.statsFiltro = { anio: 'Todos', q: 'Todos', proyecto: 'Todos' };
  const d = calcularEstadisticas();

  /* Filtros: años con datos */
  const anios = new Set([new Date().getFullYear()]);
  d.porProyecto.forEach((x) => Object.values(x.etapas).forEach((m) => { if (m?.terminadaEn) anios.add(trimestreDeFecha(m.terminadaEn).anio); }));
  const selAnio = document.getElementById('stats-anio');
  const selQ = document.getElementById('stats-q');
  const selP = document.getElementById('stats-proyecto');
  selAnio.innerHTML = '<option value="Todos">Todos los años</option>' + [...anios].sort((a, b) => b - a).map((a) => `<option value="${a}">${a}</option>`).join('');
  selAnio.value = d.f.anio;
  selQ.value = d.f.q;
  selP.innerHTML = '<option value="Todos">Todos los proyectos</option>' + ordenarRecientes(state.proyectos.slice())
    .map((p) => `<option value="${esc(p.id)}">${esc(p.name)} · ${esc(p.client)}</option>`).join('');
  selP.value = state.proyectos.some((p) => p.id === d.f.proyecto) ? d.f.proyecto : 'Todos';

  const periodo = `${d.f.q === 'Todos' ? '' : `T${d.f.q} `}${d.f.anio === 'Todos' ? 'todo el historial' : d.f.anio}`;

  /* 1. Tarjetas por etapa */
  const tarjetas = d.resumen.map((r, i) => `
    <div class="stat-etapa">
      <p class="stat-etapa__num">${i + 1}</p>
      <p class="text-[10px] font-black uppercase tracking-wide text-slate-500">${esc(r.etapa.nombre)}</p>
      <p class="text-3xl font-black text-slate-900 mt-1 leading-none">${esc(formatoEtapa(r.prom, r.etapa.porDias))}</p>
      <p class="text-[11px] text-slate-500 mt-1">${r.n ? `Promedio de ${r.n} proyecto${r.n === 1 ? '' : 's'} · ${esc(formatoEtapa(r.min, r.etapa.porDias))} a ${esc(formatoEtapa(r.max, r.etapa.porDias))}` : 'Sin etapas terminadas en el periodo'}</p>
      ${r.enCurso ? `<p class="stat-etapa__curso">${r.enCurso} en curso ahora</p>` : ''}
      <p class="text-[10px] text-slate-400 mt-2">${esc(r.etapa.ayuda)}</p>
    </div>`).join('');

  /* 2. Por trimestre */
  const maxQ = Math.max(1, ...d.trimestres.flatMap((t) => ETAPAS_TIEMPO.map((e) => t.valores[e.id].prom || 0)));
  const tablaQ = `
    <table class="stat-tabla">
      <thead><tr><th>Trimestre ${d.anioQ}</th>${ETAPAS_TIEMPO.map((e) => `<th>${esc(e.nombre)}</th>`).join('')}</tr></thead>
      <tbody>${d.trimestres.map((t) => `
        <tr><td class="font-black">T${t.q}</td>${ETAPAS_TIEMPO.map((e) => {
          const v = t.valores[e.id];
          return `<td>${v.n ? `<span class="font-bold">${esc(formatoEtapa(v.prom, e.porDias))}</span> <span class="text-slate-400">(${v.n})</span>${barraTiempo(v.prom, maxQ, `${e.nombre} T${t.q}: ${formatoEtapa(v.prom, e.porDias)}`)}` : '<span class="text-slate-300">—</span>'}</td>`;
        }).join('')}</tr>`).join('')}
      </tbody>
    </table>`;

  /* 3. Por proyecto */
  const filasP = d.porProyecto.map((x) => `
    <tr><td><p class="font-bold text-slate-900">${esc(x.p.name)}</p><p class="text-[10px] text-slate-400">${esc(x.p.client)} · ${esc(x.p.city)}</p></td>
      ${ETAPAS_TIEMPO.map((e) => {
        const m = x.etapas[e.id];
        if (!m) return '<td><span class="text-slate-300">—</span></td>';
        return m.enCurso
          ? `<td><span class="stat-chip-curso">En curso · ${esc(formatoEtapa(m.ms, e.porDias))}</span></td>`
          : `<td class="font-bold">${esc(formatoEtapa(m.ms, e.porDias))}</td>`;
      }).join('')}</tr>`).join('');
  const tablaP = filasP
    ? `<table class="stat-tabla"><thead><tr><th>Proyecto</th>${ETAPAS_TIEMPO.map((e) => `<th>${esc(e.nombre)}</th>`).join('')}</tr></thead><tbody>${filasP}</tbody></table>`
    : '<p class="text-xs text-slate-400 p-4 text-center">Aún no hay compras ni tareas con tiempos registrados.</p>';

  /* 4. Por persona */
  const filasPer = d.personas.filter((r) => r.hechas.length || r.abiertas.length)
    .sort((a, b) => b.hechas.length - a.hechas.length || a.nombre.localeCompare(b.nombre))
    .map((r) => `
      <tr><td><p class="font-bold text-slate-900">${esc(r.nombre)}</p><p class="text-[10px] text-slate-400">${esc(cargoDe(r.nombre) || '')}</p></td>
        <td class="font-bold">${r.hechas.length}</td>
        <td>${esc(formatoDuracion(promedio(r.hechas) ?? NaN))}</td>
        ${ETAPAS_TIEMPO.filter((e) => e.actividad).map((e) => `<td>${r.porEtapa[e.id] ? esc(formatoDuracion(promedio(r.porEtapa[e.id]))) : '<span class="text-slate-300">—</span>'}</td>`).join('')}
        <td>${r.abiertas.length ? `${r.abiertas.length} · <span class="${Math.max(...r.abiertas) > 7 * DIA_MS ? 'text-red-700 font-bold' : ''}">la más antigua ${esc(formatoDuracion(Math.max(...r.abiertas)))}</span>` : '0'}</td></tr>`).join('');
  const tablaPer = filasPer
    ? `<table class="stat-tabla"><thead><tr><th>Persona</th><th>Hechas</th><th>Promedio por tarea</th>${ETAPAS_TIEMPO.filter((e) => e.actividad).map((e) => `<th>${esc(e.nombre)}</th>`).join('')}<th>Abiertas</th></tr></thead><tbody>${filasPer}</tbody></table>`
    : '<p class="text-xs text-slate-400 p-4 text-center">Sin tareas con tiempos en el periodo.</p>';

  cont.innerHTML = `
    <div class="stat-etapas">${tarjetas}</div>
    <section class="stat-bloque"><h3>Comparativo por trimestre</h3><p>Promedio de cada etapa según el trimestre en que terminó (entre paréntesis, cuántos proyectos).</p><div class="stat-scroll">${tablaQ}</div></section>
    <section class="stat-bloque"><h3>Por proyecto · ${esc(periodo)}</h3><p>Duración de cada etapa en cada proyecto. "En curso" cuenta hasta hoy.</p><div class="stat-scroll">${tablaP}</div></section>
    <section class="stat-bloque"><h3>Por persona · ${esc(periodo)}</h3><p>Tiempo desde que se asignó cada tarea hasta que se marcó como Completado.</p><div class="stat-scroll">${tablaPer}</div></section>`;
}

/* ==========================================================================
   15. COMPRAS DE MATERIAL · registro y seguimiento
   ========================================================================== */

function todasLasCompras() {
  const lista = [];
  state.proyectos.forEach((p) => (p.pedidos || []).forEach((od) => lista.push({ p, od })));
  return lista;
}

function proveedoresConocidos() {
  const set = new Map();
  todasLasCompras().forEach(({ od }) => {
    const nombre = String(od.supplier || '').trim();
    if (nombre && nombre !== 'Proveedor por definir') set.set(nombre.toLowerCase(), nombre);
  });
  return [...set.values()].sort((a, b) => a.localeCompare(b));
}

function badgeEstadoCompra(od) {
  return `<span class="inline-block px-2 py-0.5 rounded-full border text-[10px] font-black ${ESTILO_ESTADO_COMPRA[od.status] || ESTILO_ESTADO_COMPRA.Solicitado}">${esc(od.status)}</span>`;
}

function textoCantidad(n) {
  const v = Number(n) || 0;
  return Number.isInteger(v) ? String(v) : v.toLocaleString('es-CO', { maximumFractionDigits: 2 });
}

function cantidadCompraHTML(od) {
  const recibida = Number(od.cantidadRecibida) || 0;
  const parcial = recibida > 0 && recibida < od.cantidad;
  return `${esc(textoCantidad(od.cantidad))} ${esc(od.unidad)}${parcial || od.status === 'Recibido parcial' ? ` <span class="text-amber-700 font-bold">(${esc(textoCantidad(recibida))} recib.)</span>` : ''}`;
}

function fechaPrometidaHTML(od) {
  const atraso = diasAtrasoCompra(od);
  if (!od.fechaPrometida) return '<span class="text-slate-400">Sin fecha</span>';
  const fecha = esc(formatFechaLarga(parseFecha(od.fechaPrometida)));
  return atraso
    ? `<span class="text-red-700 font-bold">${fecha}</span> <span class="inline-block bg-red-600 text-white text-[10px] font-black px-1.5 py-0.5 rounded">${atraso} d atraso</span>`
    : fecha;
}

function renderNewOrder() {
  const select = document.getElementById('pedido-proyecto');
  if (select) {
    const actual = select.value || state.newOrderProjectId || '';
    select.innerHTML = '<option value="">Seleccionar proyecto...</option>' + state.proyectos
      .filter((p) => p.status !== EST_PRODUCCION.COMPLETADO || p.id === actual)
      .map((p) => `<option value="${esc(p.id)}">${esc(p.id)} · ${esc(p.name)} (${esc(p.client)})</option>`).join('');
    if (actual) select.value = actual;
  }
  const unidad = document.getElementById('pedido-unidad');
  if (unidad && !unidad.options.length) unidad.innerHTML = UNIDADES_COMPRA.map((u) => `<option value="${esc(u)}">${esc(u)}</option>`).join('');
  const dl = document.getElementById('proveedores-list');
  if (dl) dl.innerHTML = proveedoresConocidos().map((n) => `<option value="${esc(n)}"></option>`).join('');
  const form = document.getElementById('pedido-form');
  if (form) form.closest('.bg-white')?.classList.toggle('hidden', !puedeGestionarCompras());
  renderSeguimientoCompras();
}

function renderSeguimientoCompras() {
  const box = document.getElementById('compras-lista');
  if (!box) return;
  const todas = todasLasCompras();
  const abiertas = todas.filter(({ od }) => compraAbierta(od));
  const atrasadas = abiertas.filter(({ od }) => diasAtrasoCompra(od) > 0);

  const resumen = document.getElementById('compras-resumen');
  if (resumen) {
    resumen.innerHTML = `
      <span class="bg-slate-100 border border-slate-200 rounded-lg px-2.5 py-1 font-bold text-slate-700">${abiertas.length} abiertas</span>
      <span class="${atrasadas.length ? 'bg-red-50 border-red-200 text-red-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'} border rounded-lg px-2.5 py-1 font-bold">${atrasadas.length} atrasadas</span>`;
  }
  /* Proveedores con entregas atrasadas, de más a menos */
  const porProveedor = new Map();
  atrasadas.forEach(({ od }) => {
    const k = od.supplier;
    const prev = porProveedor.get(k) || { n: 0, max: 0 };
    porProveedor.set(k, { n: prev.n + 1, max: Math.max(prev.max, diasAtrasoCompra(od)) });
  });
  const prov = document.getElementById('compras-proveedores');
  if (prov) {
    prov.innerHTML = porProveedor.size
      ? `<p class="text-[11px] text-red-800 bg-red-50 border border-red-100 rounded-lg px-3 py-2"><i class="fas fa-truck-ramp-box mr-1" aria-hidden="true"></i><strong>Proveedores con atraso:</strong> ${[...porProveedor.entries()]
        .sort((a, b) => b[1].max - a[1].max)
        .map(([n, v]) => `${esc(n)} (${v.n} · hasta ${v.max} d)`).join(' · ')}</p>`
      : '';
  }

  const filtro = state.comprasFiltro || 'abiertas';
  document.querySelectorAll('[data-compra-filtro]').forEach((b) => {
    const activo = b.dataset.compraFiltro === filtro;
    b.classList.toggle('active', activo);
    b.setAttribute('aria-pressed', String(activo));
  });
  let lista = todas;
  if (filtro === 'abiertas') lista = abiertas;
  if (filtro === 'atrasadas') lista = atrasadas;
  if (filtro === 'recibidas') lista = todas.filter(({ od }) => od.status === 'Recibido');
  lista = lista.slice().sort((a, b) => (diasAtrasoCompra(b.od) - diasAtrasoCompra(a.od))
    || String(a.od.fechaPrometida || '9999').localeCompare(String(b.od.fechaPrometida || '9999')));

  if (!lista.length) {
    box.innerHTML = `<p class="text-xs text-slate-400 text-center py-8 border border-dashed border-slate-300 rounded-xl">${
      filtro === 'atrasadas' ? 'No hay compras atrasadas.' : 'No hay compras en esta categoría.'}</p>`;
    return;
  }
  box.innerHTML = lista.map(({ p, od }) => `
    <article class="border ${diasAtrasoCompra(od) ? 'border-red-200 bg-red-50/40' : 'border-slate-200 bg-white'} rounded-xl p-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
      <div class="min-w-0 flex-1 basis-56">
        <p class="font-black text-slate-900 truncate">${esc(od.item)}</p>
        <p class="text-slate-500 truncate"><span class="font-mono text-red-600 font-bold">${esc(p.id)}</span> · ${esc(p.client)}${od.category ? ` · ${esc(od.category)}` : ''}</p>
      </div>
      <div class="basis-28"><p class="text-[10px] text-slate-400 uppercase font-bold">Cantidad</p><p class="font-bold text-slate-800">${cantidadCompraHTML(od)}</p></div>
      <div class="basis-32 min-w-0"><p class="text-[10px] text-slate-400 uppercase font-bold">Proveedor</p><p class="font-bold text-slate-800 truncate">${esc(od.supplier)}</p></div>
      <div class="basis-40"><p class="text-[10px] text-slate-400 uppercase font-bold">Prometida</p><p>${fechaPrometidaHTML(od)}</p></div>
      <div class="flex items-center gap-2 ml-auto">
        ${badgeEstadoCompra(od)}
        ${od.qc === 'Con novedad' ? '<span class="text-[10px] font-black text-amber-800 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">Con novedad</span>' : ''}
        ${puedeGestionarCompras() ? `<button type="button" class="bg-slate-900 hover:bg-slate-800 text-white font-bold px-3 py-1.5 rounded-lg" data-compra-editar="${esc(od.id)}" data-compra-proyecto="${esc(p.id)}">Actualizar</button>` : ''}
      </div>
    </article>`).join('');
}

function onPedidoGuardar(e) {
  e.preventDefault();
  if (!puedeGestionarCompras()) { showToast('Solo Gerencia y Logística registran compras.'); return; }
  const projectId = document.getElementById('pedido-proyecto').value;
  const item = document.getElementById('pedido-item').value.trim().replace(/\s+/g, ' ');
  const supplier = document.getElementById('pedido-proveedor').value.trim().replace(/\s+/g, ' ');
  const cantidad = Number(document.getElementById('pedido-cantidad').value);
  if (!projectId || !item || !supplier) { showToast('Completa proyecto, material y proveedor.'); return; }
  if (!(cantidad > 0)) { showToast('La cantidad debe ser mayor que cero.'); return; }
  const p = state.proyectos.find((x) => x.id === projectId);
  if (!p) return;
  /* Mismo proveedor escrito distinto (mayúsculas/espacios) → se unifica */
  const proveedor = proveedoresConocidos().find((n) => n.toLowerCase() === supplier.toLowerCase()) || supplier;
  const unidad = document.getElementById('pedido-unidad').value || 'und';
  const pendiente = { id: uid(), text: `${item} · ${textoCantidad(cantidad)} ${unidad} (${proveedor})`, tipo: 'material', prioridad: 'media', estado: 'Pendiente', createdAt: hoyISO() };
  p.pendientes.push(pendiente);
  p.pedidos.push(normalizarPedido({
    id: uid(),
    category: document.getElementById('pedido-categoria').value,
    item,
    supplier: proveedor,
    guide: document.getElementById('pedido-guia').value.trim(),
    cantidad,
    unidad,
    fechaSolicitud: hoyISO(),
    fechaPrometida: document.getElementById('pedido-fecha').value || null,
    notas: document.getElementById('pedido-notas').value.trim(),
    status: 'Solicitado',
    pendienteId: pendiente.id,
  }, p.pedidos.length));
  p.alert = p.pendientes[0]?.text || '';
  state.newOrderProjectId = null;
  commit();
  refrescarPendientesProyecto(projectId);
  const sel = document.getElementById('pedido-proyecto').value;
  document.getElementById('pedido-form').reset();
  document.getElementById('pedido-proyecto').value = sel; /* se mantiene el proyecto para registrar varias */
  renderNewOrder();
  showToast(`Compra registrada: ${item} para ${p.id}.`);
}

/* ---- Modal de actualización ---- */

function abrirCompraModal(projectId, compraId) {
  if (!puedeGestionarCompras()) { showToast('Solo Gerencia y Logística actualizan compras.'); return; }
  const p = state.proyectos.find((x) => x.id === projectId);
  const od = (p?.pedidos || []).find((x) => x.id === compraId);
  if (!od) return;
  state.compraCtx = { projectId, compraId };
  const opts = (lista, actual) => lista.map((v) => `<option value="${esc(v)}" ${v === actual ? 'selected' : ''}>${esc(v)}</option>`).join('');
  document.getElementById('compra-sub').textContent = `${od.item} · ${p.id} ${p.name}`;
  document.getElementById('compra-estado').innerHTML = opts(ESTADOS_COMPRA, od.status);
  document.getElementById('compra-calidad').innerHTML = opts(CALIDAD_COMPRA, od.qc);
  document.getElementById('compra-recibida').value = od.cantidadRecibida || 0;
  document.getElementById('compra-recibida-de').textContent = `de ${textoCantidad(od.cantidad)} ${od.unidad}`;
  document.getElementById('compra-fecha-recibida').value = od.fechaRecibida || '';
  document.getElementById('compra-guia').value = od.guide || '';
  document.getElementById('compra-fecha-prometida').value = od.fechaPrometida || '';
  document.getElementById('compra-notas').value = od.notas || '';
  document.getElementById('compra-material').value = od.item;
  document.getElementById('compra-cantidad').value = od.cantidad;
  document.getElementById('compra-unidad').innerHTML = opts([...new Set([...UNIDADES_COMPRA, od.unidad])], od.unidad);
  document.getElementById('compra-proveedor').value = od.supplier;
  document.getElementById('compra-modal').classList.remove('is-hidden');
}

function cerrarCompraModal() {
  document.getElementById('compra-modal')?.classList.add('is-hidden');
  state.compraCtx = null;
}

/* Al marcar "Recibido" se completa la cantidad y la fecha de llegada */
function alCambiarEstadoCompra() {
  const estado = document.getElementById('compra-estado').value;
  const cantidad = Number(document.getElementById('compra-cantidad').value) || 0;
  const recibida = document.getElementById('compra-recibida');
  const fecha = document.getElementById('compra-fecha-recibida');
  if (estado === 'Recibido' && Number(recibida.value) < cantidad) recibida.value = cantidad;
  if (['Recibido', 'Recibido parcial'].includes(estado) && !fecha.value) fecha.value = hoyISO();
}

function guardarCompra() {
  const ctx = state.compraCtx;
  const p = state.proyectos.find((x) => x.id === ctx?.projectId);
  const od = (p?.pedidos || []).find((x) => x.id === ctx?.compraId);
  if (!od) return;
  const cantidad = Number(document.getElementById('compra-cantidad').value);
  const recibida = Number(document.getElementById('compra-recibida').value) || 0;
  const material = document.getElementById('compra-material').value.trim();
  const proveedor = document.getElementById('compra-proveedor').value.trim();
  let estado = document.getElementById('compra-estado').value;
  if (!material || !proveedor) { showToast('Material y proveedor no pueden quedar vacíos.'); return; }
  if (!(cantidad > 0)) { showToast('La cantidad pedida debe ser mayor que cero.'); return; }
  if (recibida < 0) { showToast('La cantidad recibida no puede ser negativa.'); return; }
  /* Coherencia entre cantidad recibida y estado */
  if (estado === 'Recibido' && recibida > 0 && recibida < cantidad) estado = 'Recibido parcial';
  if (['Solicitado', 'Confirmado', 'En tránsito'].includes(estado) && recibida > 0) estado = recibida >= cantidad ? 'Recibido' : 'Recibido parcial';

  const antesCerrada = compraCerrada(od);
  const qcAntes = od.qc;
  Object.assign(od, {
    status: estado,
    qc: document.getElementById('compra-calidad').value,
    cantidadRecibida: recibida,
    fechaRecibida: document.getElementById('compra-fecha-recibida').value || null,
    guide: document.getElementById('compra-guia').value.trim(),
    fechaPrometida: document.getElementById('compra-fecha-prometida').value || null,
    notas: document.getElementById('compra-notas').value.trim(),
    item: material,
    cantidad,
    unidad: document.getElementById('compra-unidad').value,
    supplier: proveedor,
  });
  od.expected = od.fechaPrometida ? formatFechaLarga(parseFecha(od.fechaPrometida)) : 'Por definir';

  /* El pendiente ligado se cierra/reabre igual que en la base (v7): con
     novedad de calidad queda ABIERTO hasta que se resuelva. */
  sincronizarPendienteCompraLocal(p, od, antesCerrada);

  /* Novedad de calidad → incidente ligado a la compra (si no hay uno abierto) */
  let incidenteNuevo = null;
  if (od.qc === 'Con novedad' && qcAntes !== 'Con novedad'
      && !(p.incidentes || []).some((x) => x.compraId === od.id && incidenteAbierto(x))) {
    incidenteNuevo = normalizarIncidente({
      id: uid(),
      tipo: 'Material defectuoso',
      gravedad: 'Media',
      descripcion: `${od.item}: ${od.notas || 'novedad de calidad en la recepción'}`,
      responsable: od.supplier,
      accion: 'Solicitar reposición o solución al proveedor',
      estado: 'Abierto',
      fechaApertura: new Date().toISOString(),
      compraId: od.id,
    }, (p.incidentes || []).length);
    p.incidentes = [...(p.incidentes || []), incidenteNuevo];
  }
  /* Calidad aprobada a mano → se cierra el incidente ligado */
  if (qcAntes === 'Con novedad' && od.qc === 'Aprobado') {
    (p.incidentes || []).forEach((x) => {
      if (x.compraId === od.id && incidenteAbierto(x)) {
        x.estado = 'Resuelto';
        x.solucion = x.solucion || 'Calidad aprobada en la recepción de la compra';
        x.fechaCierre = new Date().toISOString();
      }
    });
  }
  commit();
  refrescarPendientesProyecto(p.id);
  cerrarCompraModal();
  renderSeguimientoCompras();
  if (state.fichaId === p.id) { openFicha(p.id); mostrarSubFicha('pedidos'); }
  showToast(incidenteNuevo
    ? `${od.item}: ${od.status} con novedad. Se abrió un incidente y el pendiente sigue abierto hasta resolverlo.`
    : `${od.item}: ${od.status}${od.qc === 'Con novedad' ? ' · con novedad (pendiente abierto)' : ''}.`);
}

function bindComprasEvents() {
  document.querySelectorAll('[data-compra-filtro]').forEach((b) => b.addEventListener('click', () => {
    state.comprasFiltro = b.dataset.compraFiltro;
    renderSeguimientoCompras();
  }));
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-compra-editar]');
    if (btn) abrirCompraModal(btn.dataset.compraProyecto, btn.dataset.compraEditar);
  });
  document.getElementById('compra-estado')?.addEventListener('change', alCambiarEstadoCompra);
  document.getElementById('compra-guardar')?.addEventListener('click', guardarCompra);
  document.getElementById('compra-cancelar')?.addEventListener('click', cerrarCompraModal);
}

/* ==========================================================================
   16. MODAL · FICHA DE PROYECTO
   ========================================================================== */

function mostrarSubFicha(sub) {
  if (sub === 'finanzas' && !puedeVerFinanzas()) sub = 'resumen';
  if (sub === 'historial' && !puedeVerHistorial()) sub = 'resumen';
  state.fichaSub = sub;
  document.querySelectorAll('#ficha-subtabs [data-sub]').forEach((b) => {
    b.classList.toggle('active', b.dataset.sub === sub);
    if (b.dataset.sub === 'finanzas') b.classList.toggle('hidden', !puedeVerFinanzas());
    if (b.dataset.sub === 'historial') b.classList.toggle('hidden', !puedeVerHistorial());
  });
  if (sub === 'bloqueos') sub = 'incidentes';
  const panes = ['resumen', 'muebles', 'pendientes', 'pedidos', 'incidentes', 'dropbox', 'finanzas', 'historial'];
  panes.forEach((nombre) => {
    const el = document.getElementById(`ficha-${nombre}`);
    if (el) el.classList.toggle('is-hidden', nombre !== sub);
  });
  if (sub === 'historial' && state.fichaId) cargarHistorial(state.fichaId);
}

function openFicha(id) {
  const p = state.proyectos.find((x) => x.id === id);
  if (!p) return;
  state.fichaId = id;

  document.getElementById('ficha-nombre').textContent = p.name;
  document.getElementById('ficha-id-badge').textContent = p.id;
  document.getElementById('ficha-phase').textContent = p.manufacturingPhase;
  document.getElementById('ficha-direccion').textContent = p.address;
  document.getElementById('ficha-direccion-2').textContent = p.address;
  document.getElementById('ficha-telefono').textContent = p.phone || 'Sin registrar';
  document.getElementById('ficha-operador').textContent = p.logisticOperator || 'Sin asignar';
  document.getElementById('ficha-responsable').textContent = p.leadCarpenter || 'Sin asignar';
  document.getElementById('ficha-arquitecto').textContent = p.arquitecto || 'Sin asignar';
  document.getElementById('ficha-fase').textContent = p.manufacturingPhase;
  document.getElementById('ficha-estado').textContent = p.status;
  const estadoSelect = document.getElementById('ficha-estado-select');
  estadoSelect.value = p.status;
  estadoSelect.disabled = !puedeAsignar();
  estadoSelect.classList.toggle('opacity-60', !puedeAsignar());
  document.getElementById('ficha-fecha-prom').textContent = p.dateExpected || 'Por definir';
  document.getElementById('ficha-pend-count').textContent = String((p.pendientes || []).length);
  document.getElementById('ficha-alerta').textContent = primerPendiente(p)?.text || 'Sin requerimientos pendientes';
  document.getElementById('ficha-maps').href = `https://maps.google.com/?q=${encodeURIComponent(p.address || p.city || '')}`;

  const btnEditar = document.getElementById('ficha-editar');
  btnEditar.classList.toggle('hidden', !puedeEditarFicha());
  const btnEliminar = document.getElementById('ficha-eliminar');
  btnEliminar.classList.toggle('hidden', !puedeEliminarProyecto());
  btnEliminar.dataset.eliminarProyecto = p.id;
  document.getElementById('ficha-cambiar-imagen').classList.toggle('hidden', !puedeEditarFicha());
  document.getElementById('ficha-pedido-add').classList.toggle('hidden', !puedeGestionarCompras());
  document.getElementById('ficha-adjuntar-box').classList.toggle('hidden', !puedeEditarFicha());

  const idx = Math.max(0, PRODUCTION_PHASES.indexOf(p.manufacturingPhase));
  const back = document.getElementById('ficha-fase-back');
  const next = document.getElementById('ficha-fase-next');
  back.disabled = !puedeAvanzar() || idx <= 0;
  next.disabled = !puedeAvanzar() || idx >= PRODUCTION_PHASES.length - 1;
  back.classList.toggle('opacity-50', back.disabled);
  next.classList.toggle('opacity-50', next.disabled);

  const nota = document.getElementById('ficha-permiso-nota');
  if (state.rol === 'secretaria') {
    nota.classList.remove('hidden');
    nota.textContent = 'Secretaría: las asignaciones y fases de producción están bloqueadas. Solicita autorización a Gerencia u Operaciones.';
  } else if (state.rol === 'arquitecto') {
    nota.classList.remove('hidden');
    nota.textContent = 'Modo consulta: no puedes modificar fases, asignaciones ni datos financieros.';
  } else {
    nota.classList.add('hidden');
    nota.textContent = '';
  }

  const img = document.getElementById('ficha-imagen');
  img.src = p.image || DEFAULT_IMAGE;
  img.alt = p.name;
  img.onerror = () => { img.onerror = null; img.src = DEFAULT_IMAGE; };

  const pct = completitudFicha(p);
  document.getElementById('ficha-completitud-pct').textContent = `${pct}%`;
  document.getElementById('ficha-completitud-bar').style.width = `${pct}%`;
  const alerta = document.getElementById('ficha-completitud-alerta');
  alerta.classList.toggle('hidden', pct >= 100);
  alerta.textContent = pct >= 100
    ? 'Ficha 100% completa.'
    : `La ficha aún no está 100% completa (${pct}%). Faltan datos, muebles o pedidos por registrar.`;

  document.getElementById('mueble-agregar')?.classList.toggle('hidden', !puedeAsignar());
  const mueblesDiv = document.getElementById('ficha-muebles-list');
  const muebles = p.muebles || [];
  mueblesDiv.innerHTML = muebles.length === 0
    ? `<p class="text-xs text-slate-400 text-center py-6">Sin muebles registrados.${puedeAsignar() ? ' Usa «Agregar mueble» para crear el primero.' : ''}</p>`
    : muebles.map((m) => `
      <div class="p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-col sm:flex-row justify-between sm:items-center gap-3 text-xs">
        <div>
          <h5 class="font-bold text-slate-900">${esc(m.name)}</h5>
          <p class="text-slate-500 mt-0.5">Responsable: ${esc(m.carpenter || 'Por asignar')}${m.carpenter && cargoDe(m.carpenter) ? ` · ${esc(cargoDe(m.carpenter))}` : ''}</p>
          <div class="flex flex-wrap items-center gap-1.5 mt-1.5">${badgeActividad(m.actividad)}${m.detalle ? `<span class="text-slate-600">${esc(m.detalle)}</span>` : ''}</div>
        </div>
        <div class="flex flex-col items-start sm:items-end gap-2">
          <span class="bg-white text-slate-800 font-bold px-3 py-1 rounded-lg border border-slate-200 shadow-sm">Fase: ${esc(m.manufacturingPhase)}</span>
          <div class="flex space-x-1 w-28">${stepperBarras(m.manufacturingPhase)}</div>
          ${puedeAsignar() ? `
            <div class="flex items-center gap-1">
              <button type="button" class="fase-btn" data-task-phase="-1" data-task-kind="mueble" data-project="${esc(p.id)}" data-mueble="${esc(m.id)}" title="Retroceder fase"><i class="fas fa-arrow-left" aria-hidden="true"></i></button>
              <button type="button" class="fase-btn fase-btn--next" data-task-phase="1" data-task-kind="mueble" data-project="${esc(p.id)}" data-mueble="${esc(m.id)}" title="Avanzar fase"><i class="fas fa-arrow-right" aria-hidden="true"></i></button>
              <button type="button" class="task-icon-btn" data-mueble-edit="${esc(m.id)}" title="Editar mueble" aria-label="Editar ${esc(m.name)}"><i class="fas fa-pen" aria-hidden="true"></i></button>
            </div>` : ''}
        </div>
      </div>`).join('');

  document.getElementById('ficha-pedidos-tbody').innerHTML = (p.pedidos || []).map((od) => `
    <tr class="${diasAtrasoCompra(od) ? 'bg-red-50/50' : ''}">
      <td class="p-3"><p class="font-bold text-slate-900">${esc(od.item)}</p>${od.category ? `<p class="text-[10px] text-slate-400">${esc(od.category)}</p>` : ''}</td>
      <td class="p-3 text-slate-700 whitespace-nowrap">${cantidadCompraHTML(od)}</td>
      <td class="p-3 text-slate-600">${esc(od.supplier)}${od.guide ? `<p class="font-mono text-[10px] text-slate-400">${esc(od.guide)}</p>` : ''}</td>
      <td class="p-3 whitespace-nowrap">${fechaPrometidaHTML(od)}</td>
      <td class="p-3">${badgeEstadoCompra(od)}${od.qc === 'Con novedad' ? '<p class="text-[10px] font-black text-amber-700 mt-1">Con novedad</p>' : ''}</td>
      <td class="p-3 text-right">${puedeGestionarCompras() ? `<button type="button" class="task-icon-btn" data-compra-editar="${esc(od.id)}" data-compra-proyecto="${esc(p.id)}" title="Actualizar compra" aria-label="Actualizar ${esc(od.item)}"><i class="fas fa-pen" aria-hidden="true"></i></button>` : ''}</td>
    </tr>`).join('') || '<tr><td colspan="6" class="p-4 text-center text-slate-400">Sin compras registradas.</td></tr>';

  document.getElementById('ficha-pendientes-list').innerHTML = pendientesHTML(p);

  renderIncidentesFicha(p);

  document.getElementById('docs-v8')?.classList.toggle('hidden', !documentosEnTabla);
  document.getElementById('docs-legacy')?.classList.toggle('hidden', documentosEnTabla);
  if (documentosEnTabla) renderDocumentos(p);

  document.getElementById('dropbox-publico-list').innerHTML = (p.dropboxFiles?.publicFiles || []).map((f) => `
    <div class="p-3 bg-slate-50 border border-slate-200 rounded-xl flex justify-between items-center gap-2">
      <span class="text-slate-800 font-bold break-all">${esc(f.name)}</span>
      <span class="text-blue-600 font-bold cursor-pointer hover:underline shrink-0">Descargar</span>
    </div>`).join('') || '<p class="text-xs text-slate-400">Sin archivos públicos.</p>';

  const privList = document.getElementById('dropbox-privado-list');
  if (puedeVerFinanzas()) {
    privList.innerHTML = (finanzasDe(p.id).archivos_privados || []).map((f) => `
      <div class="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex justify-between items-center gap-2">
        <span class="text-emerald-900 font-bold break-all">${esc(f.name)}</span>
        <span class="text-emerald-700 font-bold shrink-0">Ver Archivo</span>
      </div>`).join('') || '<p class="text-xs text-slate-400">Sin archivos privados.</p>';
    document.getElementById('dropbox-privado-restringido').classList.add('hidden');
  } else {
    privList.innerHTML = '';
    document.getElementById('dropbox-privado-restringido').classList.remove('hidden');
    document.getElementById('dropbox-privado-rol').textContent = labelCargo(state.rol);
  }
  document.getElementById('ficha-proxy-rol').textContent = labelCargo(state.rol);

  renderArchivos(p);
  renderFinanzasFicha(p);
  document.getElementById('modal-ficha').classList.remove('is-hidden');
  mostrarSubFicha(state.fichaSub);
}

function renderArchivos(p) {
  const list = document.getElementById('dropbox-archivos-list');
  if (!list) return;
  const archivos = p.archivos || [];
  list.innerHTML = archivos.length === 0
    ? '<p class="text-xs text-slate-400 text-center py-4">Sin documentos adjuntos.</p>'
    : archivos.map((f) => `
      <div class="dropbox-archivo-item">
        <span class="flex items-center space-x-2 min-w-0">
          <i class="fas ${f.tipo === '3d' ? 'fa-cube' : (f.tipo === '2d' || f.tipo === 'image' ? 'fa-ruler-combined' : 'fa-file-pdf')} text-red-600 w-4 h-4 flex-shrink-0" aria-hidden="true"></i>
          <span class="font-bold text-slate-900 truncate">${esc(f.name)}</span>
          <span class="text-slate-400 text-[10px]">${esc(f.size || '')} · ${esc(f.date || '')}</span>
        </span>
        <button type="button" class="bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-black px-3 py-1.5 rounded-lg flex-shrink-0" data-ver-doc="${esc(f.id)}">
          ${f.tipo === '3d' ? 'Ver 3D' : (f.tipo === '2d' || f.tipo === 'image' ? 'Ver Plano' : 'Ver PDF')}
        </button>
      </div>`).join('');
}

function verDocumento(id) {
  const p = state.proyectos.find((x) => x.id === state.fichaId);
  const f = (p?.archivos || []).find((x) => x.id === id);
  const visual = document.getElementById('dropbox-visual');
  if (!f || !visual) return;
  if (f.tipo === '3d') {
    visual.classList.remove('hidden');
    visual.innerHTML = `<div class="visor-3d"><i class="fas fa-cube w-10 h-10 text-slate-400" aria-hidden="true"></i><p>Visor 3D · ${esc(f.name)}</p><p class="text-[10px]">Render 3D asociado al plano (demo)</p></div>`;
  } else if (f.tipo === '2d' || f.tipo === 'image') {
    visual.classList.remove('hidden');
    visual.innerHTML = `<img src="${esc(f.url || '')}" alt="${esc(f.name)}" />`;
  } else if (f.tipo === 'pdf') {
    visual.classList.remove('hidden');
    visual.innerHTML = `<iframe src="${esc(f.url || '')}" title="${esc(f.name)}"></iframe>`;
  }
}

/* ==========================================================================
   21g. DOCUMENTOS (v8) · archivos reales en Supabase Storage
   --------------------------------------------------------------------------
   - Dos buckets privados: documentos-proyecto y documentos-financieros.
   - Los archivos se abren con enlaces firmados de 10 minutos (nunca públicos).
   - La carpeta financiera solo existe para Gerencia (RLS en tabla y Storage).
   - Subir/eliminar es una operación directa (no pasa por la cola de guardado).
   ========================================================================== */

function documentosDe(codigo) {
  return (state.documentos && state.documentos[codigo]) || [];
}

function puedeSubirDocumento(carpeta) {
  /* El arquitecto también sube planos, renders, presentaciones y trazos */
  return carpeta === 'financiera' ? puedeVerFinanzas() : (puedeEditarFicha() || state.rol === 'arquitecto');
}

function puedeEliminarDocumento() {
  return esGerencia();
}

function tamanoLegible(bytes) {
  if (bytes === null || bytes === undefined) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function iconoDocumento(d) {
  const mime = d.tipo_mime || '';
  const nombre = (d.nombre || '').toLowerCase();
  if (mime.startsWith('image/')) return 'fa-file-image';
  if (mime === 'application/pdf' || nombre.endsWith('.pdf')) return 'fa-file-pdf';
  if (/\.(dwg|dxf)$/.test(nombre) || ['Plano 2D', 'Planimetría', 'Trazos'].includes(d.categoria)) return 'fa-ruler-combined';
  if (/\.(glb|gltf|skp|3ds|obj)$/.test(nombre) || ['Render 3D', 'Renders'].includes(d.categoria)) return 'fa-cube';
  if (/\.(pptx?|key)$/.test(nombre) || d.categoria === 'Presentación') return 'fa-person-chalkboard';
  if (/\.(xlsx?|csv)$/.test(nombre)) return 'fa-file-excel';
  if (/\.(docx?)$/.test(nombre)) return 'fa-file-word';
  if (/\.(zip|rar|7z)$/.test(nombre)) return 'fa-file-zipper';
  return 'fa-file';
}

function sePuedePrevisualizar(d) {
  /* Solo PDF e imágenes, y que el tipo coincida con la extensión del nombre */
  return TIPOS_PREVISUALIZABLES.has(d.tipo_mime) && tipoDocumentoSeguro(d.nombre) === d.tipo_mime;
}

function documentoHTML(d) {
  const sinArchivo = !d.ruta;
  const fecha = d.created_at ? formatFechaLarga(new Date(d.created_at)) : '';
  const meta = [d.categoria, tamanoLegible(d.tamano_bytes), fecha].filter(Boolean).join(' · ');
  const acciones = sinArchivo ? '' : `
      ${sePuedePrevisualizar(d) ? `<button type="button" class="doc-btn doc-btn--dark" data-doc-ver="${esc(d.id)}">Ver</button>` : ''}
      <button type="button" class="doc-btn" data-doc-descargar="${esc(d.id)}" aria-label="Descargar ${esc(d.nombre)}"><i class="fas fa-download" aria-hidden="true"></i></button>`;
  return `
    <div class="doc-item ${sinArchivo ? 'doc-item--sin-archivo' : ''}" data-doc-id="${esc(d.id)}">
      <i class="fas ${iconoDocumento(d)} doc-icono" aria-hidden="true"></i>
      <div class="min-w-0 flex-1">
        <p class="font-bold text-slate-900 break-all">${esc(d.nombre)}</p>
        <p class="text-[10px] text-slate-500">${esc(meta)}</p>
        ${sinArchivo ? '<p class="text-[10px] font-bold text-amber-700 mt-0.5"><i class="fas fa-triangle-exclamation mr-1" aria-hidden="true"></i>Referencia antigua sin archivo: súbelo de nuevo.</p>' : ''}
        ${d.notas && !sinArchivo ? `<p class="text-[10px] text-slate-500 mt-0.5">${esc(d.notas)}</p>` : ''}
      </div>
      <div class="flex items-center gap-1 shrink-0">
        ${acciones}
        ${puedeEliminarDocumento() ? `<button type="button" class="doc-btn doc-btn--peligro" data-doc-eliminar="${esc(d.id)}" aria-label="Eliminar ${esc(d.nombre)}" title="Eliminar"><i class="fas fa-trash" aria-hidden="true"></i></button>` : ''}
      </div>
    </div>`;
}

function renderDocumentos(p) {
  const visor = document.getElementById('docs-visor');
  if (visor && visor.dataset.proyecto !== p.id) cerrarVisorDocumento();
  const docs = documentosDe(p.id);
  const delProyecto = docs.filter((d) => d.carpeta === 'proyecto');
  const financieros = docs.filter((d) => d.carpeta === 'financiera');

  /* Subcarpetas: Planimetría, Renders, Presentación, Trazos (+ Otros para lo anterior) */
  const grupos = CATEGORIAS_DOC.proyecto.map((cat) => ({ cat, docs: delProyecto.filter((d) => d.categoria === cat) }));
  const otros = delProyecto.filter((d) => !CATEGORIAS_DOC.proyecto.includes(d.categoria));
  if (otros.length) grupos.push({ cat: 'Otros', docs: otros });
  const puedeSubirAqui = puedeSubirDocumento('proyecto');
  document.getElementById('docs-proyecto-list').innerHTML = grupos.map((g) => `
    <section class="doc-grupo" aria-label="${esc(g.cat)}">
      <header class="doc-grupo__cab">
        <h6><i class="fas ${ICONO_CATEGORIA_DOC[g.cat] || 'fa-folder'}" aria-hidden="true"></i>${esc(g.cat)} <span class="doc-contador">${g.docs.length}</span></h6>
        ${puedeSubirAqui && g.cat !== 'Otros' ? `<button type="button" class="doc-btn" data-doc-subir-a="${esc(g.cat)}">+ Subir</button>` : ''}
      </header>
      <div class="space-y-2">${g.docs.map(documentoHTML).join('') || `<p class="doc-grupo__vacio">Sin archivos de ${esc(g.cat.toLowerCase())}.</p>`}</div>
    </section>`).join('');
  document.getElementById('docs-proyecto-count').textContent = delProyecto.length;

  const finBox = document.getElementById('docs-financiera-box');
  finBox.classList.toggle('hidden', !puedeVerFinanzas());
  if (puedeVerFinanzas()) {
    document.getElementById('docs-financiera-list').innerHTML = financieros.map(documentoHTML).join('')
      || '<p class="text-xs text-slate-400 p-3 text-center border border-dashed border-emerald-200 rounded-xl">Sin documentos financieros.</p>';
    document.getElementById('docs-financiera-count').textContent = financieros.length;
  }

  /* Formulario de subida: solo con los permisos y carpetas del rol */
  const form = document.getElementById('docs-subir-box');
  const puede = puedeSubirDocumento('proyecto') || puedeSubirDocumento('financiera');
  form.classList.toggle('hidden', !puede);
  const selCarpeta = document.getElementById('doc-carpeta');
  const actual = selCarpeta.value;
  selCarpeta.innerHTML = ['proyecto', 'financiera'].filter(puedeSubirDocumento)
    .map((c) => `<option value="${c}">${c === 'proyecto' ? 'Documentos del proyecto' : 'Carpeta financiera (solo Gerencia)'}</option>`).join('');
  if ([...selCarpeta.options].some((o) => o.value === actual)) selCarpeta.value = actual;
  llenarCategoriasDoc();
}

function llenarCategoriasDoc() {
  const carpeta = document.getElementById('doc-carpeta')?.value || 'proyecto';
  const sel = document.getElementById('doc-categoria');
  if (!sel) return;
  const actual = sel.value;
  sel.innerHTML = (CATEGORIAS_DOC[carpeta] || CATEGORIAS_DOC.proyecto).map((c) => `<option>${esc(c)}</option>`).join('');
  if ([...sel.options].some((o) => o.value === actual)) sel.value = actual;
}

function nombreSeguroArchivo(nombre) {
  const limpio = String(nombre || 'archivo').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_').replace(/_+/g, '_').slice(-80);
  return limpio || 'archivo';
}

function separarRuta(ruta) {
  const i = String(ruta || '').indexOf('/');
  return i < 0 ? null : { bucket: ruta.slice(0, i), path: ruta.slice(i + 1) };
}

async function subirDocumentos() {
  const p = state.proyectos.find((x) => x.id === state.fichaId);
  const input = document.getElementById('doc-archivo');
  const carpeta = document.getElementById('doc-carpeta').value;
  const categoria = document.getElementById('doc-categoria').value;
  const notas = document.getElementById('doc-notas').value.trim();
  const archivos = Array.from(input?.files || []);
  if (!p) return;
  if (!archivos.length) { showToast('Escoge uno o varios archivos para subir.'); return; }
  if (!puedeSubirDocumento(carpeta)) { showToast('Tu rol no puede subir documentos a esa carpeta.'); return; }
  if (!sbListo || !documentosEnTabla) { showToast('Sin conexión con la base de datos: no se pueden subir documentos.'); return; }
  if (!p.dbId) { showToast('El proyecto aún se está guardando. Intenta de nuevo en unos segundos.'); return; }
  const noPermitidos = archivos.filter((f) => !tipoDocumentoSeguro(f.name));
  if (noPermitidos.length) {
    showToast(`Tipo de archivo no permitido: ${noPermitidos.map((f) => f.name).join(', ')}. Se aceptan PDF, imágenes, planos (DWG/DXF/SKP), modelos 3D, Office y ZIP.`);
    return;
  }
  const grandes = archivos.filter((f) => f.size > MAX_DOC_MB * 1024 * 1024);
  if (grandes.length) { showToast(`${grandes.map((f) => f.name).join(', ')} supera ${MAX_DOC_MB} MB.`); return; }

  const btn = document.getElementById('doc-subir');
  const textoBtn = btn.innerHTML;
  btn.disabled = true;
  const bucket = BUCKET_DOCS[carpeta];
  const nuevos = [];
  const fallos = [];
  for (let i = 0; i < archivos.length; i += 1) {
    const f = archivos[i];
    btn.innerHTML = `<i class="fas fa-spinner fa-spin mr-1" aria-hidden="true"></i>Subiendo ${i + 1} de ${archivos.length}…`;
    const path = `${p.dbId}/${Date.now()}-${nuevoUUID().slice(0, 8)}-${nombreSeguroArchivo(f.name)}`;
    const tipoSeguro = tipoDocumentoSeguro(f.name);
    const subida = await supabaseClient.storage.from(bucket).upload(path, f, {
      contentType: tipoSeguro,
      upsert: false,
    });
    if (subida.error) { fallos.push(`${f.name}: ${mensajeError(subida.error)}`); continue; }
    const { data, error } = await supabaseClient.from('documentos').insert({
      proyecto_id: p.dbId,
      carpeta,
      categoria,
      nombre: f.name,
      ruta: `${bucket}/${path}`,
      tipo_mime: tipoSeguro,
      tamano_bytes: f.size,
      notas: notas || null,
    }).select().single();
    if (error) {
      /* Sin registro el archivo quedaría huérfano: se retira del bucket */
      await supabaseClient.storage.from(bucket).remove([path]);
      fallos.push(`${f.name}: ${mensajeError(error)}`);
      continue;
    }
    nuevos.push(data);
  }
  btn.disabled = false;
  btn.innerHTML = textoBtn;

  if (nuevos.length) {
    if (!state.documentos) state.documentos = {};
    state.documentos[p.id] = [...nuevos.reverse(), ...documentosDe(p.id)];
    input.value = '';
    document.getElementById('doc-notas').value = '';
    renderDocumentos(p);
    const destino = carpeta === 'financiera' ? 'la carpeta financiera' : 'los documentos del proyecto';
    showToast(nuevos.length === 1 ? `"${nuevos[0].nombre}" se subió a ${destino}.` : `${nuevos.length} archivos subidos a ${destino}.`);
  }
  if (fallos.length) showToast(`No se pudo subir: ${fallos.join(' · ')}`);
}

async function abrirDocumento(id, descargar) {
  const p = state.proyectos.find((x) => x.id === state.fichaId);
  const d = documentosDe(p?.id).find((x) => x.id === id);
  const partes = separarRuta(d?.ruta);
  if (!d || !partes) { showToast('Este documento no tiene archivo asociado.'); return; }
  if (!descargar && !sePuedePrevisualizar(d)) descargar = true; /* nada que no sea PDF/imagen se abre dentro de la app */
  const opciones = descargar ? { download: d.nombre } : undefined;
  const { data, error } = await supabaseClient.storage.from(partes.bucket).createSignedUrl(partes.path, 600, opciones);
  if (error || !data?.signedUrl) { showToast(`No se pudo abrir el documento: ${mensajeError(error, 'sin enlace')}`); return; }
  const esPdf = !(d.tipo_mime || '').startsWith('image/');
  if (esAppNativa() && (descargar || esPdf)) { abrirEnlaceExterno(data.signedUrl); return; }
  if (descargar) {
    const a = document.createElement('a');
    a.href = data.signedUrl;
    a.download = d.nombre;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    return;
  }
  const visor = document.getElementById('docs-visor');
  const cuerpo = (d.tipo_mime || '').startsWith('image/')
    ? `<img src="${esc(data.signedUrl)}" alt="${esc(d.nombre)}" />`
    : `<iframe src="${esc(data.signedUrl)}" title="${esc(d.nombre)}"></iframe>`;
  visor.innerHTML = `
    <div class="flex items-center justify-between gap-2 mb-2">
      <p class="font-bold text-slate-900 truncate">${esc(d.nombre)}</p>
      <div class="flex gap-1 shrink-0">
        <a class="doc-btn" href="${esc(data.signedUrl)}" target="_blank" rel="noopener">Abrir aparte</a>
        <button type="button" class="doc-btn" data-doc-cerrar-visor aria-label="Cerrar visor"><i class="fas fa-xmark" aria-hidden="true"></i></button>
      </div>
    </div>
    <div class="dropbox-visual">${cuerpo}</div>`;
  visor.dataset.proyecto = p.id;
  visor.classList.remove('hidden');
  visor.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function cerrarVisorDocumento() {
  const visor = document.getElementById('docs-visor');
  if (!visor) return;
  visor.innerHTML = '';
  visor.classList.add('hidden');
}

async function eliminarDocumento(id) {
  const p = state.proyectos.find((x) => x.id === state.fichaId);
  const d = documentosDe(p?.id).find((x) => x.id === id);
  if (!d) return;
  if (!puedeEliminarDocumento()) { showToast('Solo Gerencia puede eliminar documentos.'); return; }
  const aviso = d.ruta
    ? `¿Eliminar "${d.nombre}"? El archivo se borra del servidor y queda registrado en el historial.`
    : `¿Quitar la referencia antigua "${d.nombre}"?`;
  if (!window.confirm(aviso)) return;
  const partes = separarRuta(d.ruta);
  if (partes) {
    const { error } = await supabaseClient.storage.from(partes.bucket).remove([partes.path]);
    if (error) { showToast(`No se pudo eliminar el archivo: ${mensajeError(error)}`); return; }
  }
  const { error } = await supabaseClient.from('documentos').delete().eq('id', d.id);
  if (error) { showToast(`No se pudo eliminar el registro: ${mensajeError(error)}`); return; }
  state.documentos[p.id] = documentosDe(p.id).filter((x) => x.id !== d.id);
  cerrarVisorDocumento();
  renderDocumentos(p);
  showToast(`"${d.nombre}" eliminado.`);
}

function closeFicha() {
  document.getElementById('modal-ficha')?.classList.add('is-hidden');
  state.fichaId = null;
  state.fichaSub = 'resumen';
}
/* ==========================================================================
   17b. ELIMINAR PROYECTO (solo Gerencia)
   Borra el proyecto y, en cascada en la base, sus pendientes, tareas,
   muebles, compras, incidentes, documentos y finanzas. Los archivos de
   documentos se retiran también del almacenamiento.
   ========================================================================== */

function puedeEliminarProyecto() {
  return esGerencia();
}

function botonEliminarProyecto(p, clases = '') {
  if (!puedeEliminarProyecto()) return '';
  return `<button type="button" class="btn-eliminar-proyecto ${clases}" data-eliminar-proyecto="${esc(p.id)}" title="Eliminar proyecto" aria-label="Eliminar el proyecto ${esc(p.name)}"><i class="fas fa-trash" aria-hidden="true"></i></button>`;
}

async function eliminarProyecto(id) {
  if (!puedeEliminarProyecto()) { showToast('Solo Gerencia puede eliminar proyectos.'); return; }
  const p = state.proyectos.find((x) => x.id === id);
  if (!p) return;
  const tareas = Object.values(state.tareas || {}).flat().filter((t) => t.projectId === id).length;
  const docs = documentosDe(id);
  const resumen = [
    `${(p.muebles || []).length} muebles`,
    `${(p.pedidos || []).length} compras`,
    `${(p.incidentes || []).length} incidentes`,
    `${(p.pendientes || []).length} pendientes`,
    `${tareas} tareas`,
    `${docs.length} documentos`,
  ].join(', ');
  const ok = window.confirm(`¿Eliminar definitivamente el proyecto "${p.name}" (${p.client})?\n\nTambién se borran: ${resumen} y sus datos financieros.\nEsta acción no se puede deshacer.`);
  if (!ok) return;

  /* 1. Archivos de documentos en Storage (la fila se borra en cascada) */
  if (sbListo && documentosEnTabla && docs.length) {
    const porBucket = {};
    docs.forEach((d) => {
      const partes = separarRuta(d.ruta);
      if (partes) (porBucket[partes.bucket] = porBucket[partes.bucket] || []).push(partes.path);
    });
    for (const [bucket, rutas] of Object.entries(porBucket)) {
      const { error } = await supabaseClient.storage.from(bucket).remove(rutas);
      if (error) console.warn('[MODUGAL] No se pudieron borrar archivos del proyecto', bucket, error);
    }
  }

  /* 2. Estado local: el guardado borra la fila en la base (cascada) */
  state.proyectos = state.proyectos.filter((x) => x.id !== id);
  Object.keys(state.tareas || {}).forEach((nombre) => {
    state.tareas[nombre] = (state.tareas[nombre] || []).filter((t) => t.projectId !== id);
    if (!state.tareas[nombre].length) delete state.tareas[nombre];
  });
  (state.comercial || []).forEach((c) => { if (c.proyectoId === id) c.proyectoId = null; });
  if (state.finanzas) delete state.finanzas[id];
  if (state.documentos) delete state.documentos[id];
  if (state.fichaId === id) closeFicha();
  commit();
  showToast(`Proyecto "${p.name}" eliminado.`);
}

/* ==========================================================================
   17. MODAL · CREAR / EDITAR PROYECTO
   ========================================================================== */

function abrirProyectoModal(id, focus) {
  if (!puedeCrearProyecto() && !puedeEditarFicha()) { showToast('Tu rol no puede crear o editar proyectos.'); return; }
  const p = id ? state.proyectos.find((x) => x.id === id) : null;
  state.proyectoModalMode = p ? 'editar' : 'crear';
  state.proyectoModalId = p?.id || null;
  state.proyectoModalFocus = focus || null;
  limpiarErroresProyecto();

  document.getElementById('proyecto-modal-title').textContent = p ? 'Editar Ficha del Proyecto' : 'Nuevo Proyecto';
  document.getElementById('proyecto-modal-sub').textContent = p
    ? `${p.id} · los cambios se sincronizan en Producción, Comercial, Tabla General y Proyectos.`
    : 'Crea la ficha base; aparecerá de inmediato en Producción, Comercial, Tabla General y Proyectos.';

  const set = (idEl, valor) => { const el = document.getElementById(idEl); if (el) el.value = valor ?? ''; };
  set('proyecto-nombre', p?.name || '');
  set('proyecto-cliente', p?.client || '');
  set('proyecto-barrio', p?.neighborhood || '');
  set('proyecto-direccion', p?.address || '');
  set('proyecto-telefono', telefonoParaCampo(p?.phone));
  set('proyecto-arquitecto', p?.arquitecto || state.user?.nombre || 'Felipe Mora');
  document.getElementById('proyecto-carpintero').innerHTML = opcionesPersonal(p?.leadCarpenter || '', 'Sin asignar');
  set('proyecto-operador', p?.logisticOperator || 'Wilyer');
  set('proyecto-fecha-inicio', p ? isoParaInput(p.dateStart) : fechaISODeTexto(formatFechaLarga(new Date())));
  set('proyecto-fecha-entrega', isoParaInput(p?.dateExpected));
  /* Se compara en el formato que se guarda ("16 Dic 2027") */
  state.fechaEntregaOriginal = p ? textoDesdeInputFecha(isoParaInput(p.dateExpected)) : null;
  set('proyecto-motivo', '');
  document.getElementById('proyecto-motivo-wrap')?.classList.add('hidden');
  set('proyecto-imagen', p?.image && p.image !== DEFAULT_IMAGE ? p.image : '');
  const fileImg = document.getElementById('proyecto-imagen-file');
  if (fileImg) fileImg.value = '';
  pintarPreviewImagen(p?.image || DEFAULT_IMAGE);
  set('proyecto-detalle', p?.commercialDetail || '');

  fijarCiudadProyecto(p?.city || 'Por definir');
  document.getElementById('proyecto-trimestre').value = p?.trimester || 'Q4 - 2026';
  document.getElementById('proyecto-fase').value = p?.manufacturingPhase || 'Recepción';
  document.getElementById('proyecto-estado').value = p?.status || EST_PRODUCCION.EN_PROCESO;
  document.getElementById('proyecto-etapa-comercial').value = p?.commercialStage || 'Cotizaciones';

  const puedeProduccion = puedeAsignar();
  ['proyecto-carpintero', 'proyecto-operador', 'proyecto-fase', 'proyecto-estado'].forEach((idEl) => {
    const el = document.getElementById(idEl);
    if (el) {
      el.disabled = !puedeProduccion;
      el.classList.toggle('opacity-60', !puedeProduccion);
    }
  });
  const nota = document.getElementById('proyecto-permiso-nota');
  nota.classList.toggle('hidden', puedeProduccion);
  nota.textContent = 'Secretaría: puedes registrar clientes, documentación, imagen y prospectos, pero las asignaciones y fases de producción requieren autorización de Gerencia u Operaciones.';

  document.getElementById('proyecto-modal').classList.remove('is-hidden');
  const foco = focus === 'imagen' ? 'proyecto-imagen-file' : 'proyecto-nombre';
  setTimeout(() => document.getElementById(foco)?.focus(), 50);
}

/* --------------------------------------------------------------------------
   IMÁGENES DE PROYECTO · Supabase Storage (bucket proyectos-imagenes)
   La foto se reduce a máx. 1600 px y se guarda como JPG antes de subir.
   -------------------------------------------------------------------------- */

const TIPOS_IMAGEN = ['image/jpeg', 'image/png', 'image/webp'];

function pintarPreviewImagen(url) {
  const img = document.getElementById('proyecto-imagen-preview');
  if (img) img.src = url || DEFAULT_IMAGE;
}

async function comprimirImagen(file, maxLado = 1600, calidad = 0.82) {
  try {
    const bitmap = await createImageBitmap(file);
    const escala = Math.min(1, maxLado / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * escala);
    canvas.height = Math.round(bitmap.height * escala);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', calidad));
    return blob || file;
  } catch (e) {
    return file;
  }
}

async function subirImagenProyecto(file, codigo) {
  if (!file) throw new Error('No se escogió ninguna imagen.');
  if (!TIPOS_IMAGEN.includes(file.type)) throw new Error('La imagen debe ser JPG, PNG o WEBP.');
  if (!sbListo) throw new Error('Sin conexión con la base de datos: no se puede subir la imagen.');
  const blob = await comprimirImagen(file);
  if (blob.size > 5 * 1024 * 1024) throw new Error('La imagen supera 5 MB incluso optimizada.');
  const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
  const ruta = `${String(codigo || 'sin-codigo').replace(/[^A-Za-z0-9_-]/g, '')}/${Date.now()}-${nuevoUUID().slice(0, 8)}.${ext}`;
  const { error } = await supabaseClient.storage.from(BUCKET_IMAGENES).upload(ruta, blob, {
    contentType: blob.type || 'image/jpeg',
    cacheControl: '31536000',
    upsert: false,
  });
  if (error) throw new Error(`No se pudo subir la imagen: ${mensajeError(error)}`);
  return supabaseClient.storage.from(BUCKET_IMAGENES).getPublicUrl(ruta).data.publicUrl;
}

async function cambiarImagenDesdeFicha(file) {
  const p = state.proyectos.find((x) => x.id === state.fichaId);
  if (!p || !file) return;
  if (!puedeEditarFicha()) { showToast('Tu rol no puede cambiar la imagen.'); return; }
  const btn = document.getElementById('ficha-cambiar-imagen');
  const texto = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1" aria-hidden="true"></i>Subiendo imagen...';
  try {
    p.image = await subirImagenProyecto(file, p.id);
    commit();
    openFicha(p.id);
    showToast('Imagen actualizada.');
  } catch (err) {
    showToast(err.message || 'No se pudo subir la imagen.');
  } finally {
    btn.disabled = false;
    btn.innerHTML = texto;
  }
}

function cerrarProyectoModal() {
  document.getElementById('proyecto-modal')?.classList.add('is-hidden');
  state.proyectoModalMode = 'crear';
  state.proyectoModalId = null;
  state.proyectoModalFocus = null;
}

async function guardarProyecto(e) {
  e.preventDefault();
  if (!puedeCrearProyecto() && !puedeEditarFicha()) { showToast('Tu rol no puede guardar proyectos.'); return; }
  const nombre = document.getElementById('proyecto-nombre').value.trim();
  const cliente = document.getElementById('proyecto-cliente').value.trim();
  limpiarErroresProyecto();
  const errores = validarFormularioProyecto();
  if (errores.length) {
    document.getElementById(errores[0].campo)?.focus();
    return;
  }

  /* Cambiar la fecha prometida exige un motivo (queda en el historial) */
  const editando = state.proyectoModalMode === 'editar' && state.proyectoModalId;
  const nuevaFecha = textoDesdeInputFecha(document.getElementById('proyecto-fecha-entrega').value);
  const fechaInicio = textoDesdeInputFecha(document.getElementById('proyecto-fecha-inicio').value);
  const dIni = parseFecha(fechaInicio);
  const dFin = parseFecha(nuevaFecha);
  void dIni; void dFin; /* ya validadas arriba */
  const cambiaFecha = editando && state.fechaEntregaOriginal !== null && nuevaFecha !== state.fechaEntregaOriginal;
  const motivoFecha = document.getElementById('proyecto-motivo')?.value.trim() || '';
  if (cambiaFecha && !motivoFecha) {
    document.getElementById('proyecto-motivo-wrap')?.classList.remove('hidden');
    document.getElementById('proyecto-motivo')?.focus();
    showToast('Escribe el motivo del cambio de fecha de entrega.');
    mostrarErroresFormulario('proyecto-errores', [{ campo: 'proyecto-motivo', mensaje: 'Cambiaste la fecha de entrega: escribe el motivo (queda en el historial).' }]);
    return;
  }

  /* Imagen: si se escogió un archivo, se sube a Supabase Storage primero */
  const codigo = editando ? state.proyectoModalId : generarIdProyecto();
  const archivo = document.getElementById('proyecto-imagen-file')?.files?.[0];
  if (archivo) {
    const btn = document.getElementById('proyecto-guardar');
    const texto = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2" aria-hidden="true"></i>Subiendo imagen...';
    try {
      document.getElementById('proyecto-imagen').value = await subirImagenProyecto(archivo, codigo);
    } catch (err) {
      showToast(err.message || 'No se pudo subir la imagen.');
      return;
    } finally {
      btn.disabled = false;
      btn.innerHTML = texto;
    }
  }

  const fase = document.getElementById('proyecto-fase').value;
  const datos = {
    name: nombre,
    client: cliente,
    city: document.getElementById('proyecto-ciudad').value,
    neighborhood: document.getElementById('proyecto-barrio').value.trim(),
    address: document.getElementById('proyecto-direccion').value.trim() || 'Por definir',
    phone: telefonoParaGuardar(document.getElementById('proyecto-telefono').value),
    arquitecto: document.getElementById('proyecto-arquitecto').value.trim() || 'Felipe Mora',
    leadCarpenter: document.getElementById('proyecto-carpintero').value.trim(),
    logisticOperator: document.getElementById('proyecto-operador').value.trim() || 'Por asignar',
    trimester: document.getElementById('proyecto-trimestre').value,
    manufacturingPhase: faseValida(fase, 'Recepción'),
    phase: faseValida(fase, 'Recepción'),
    status: document.getElementById('proyecto-estado').value,
    commercialStage: document.getElementById('proyecto-etapa-comercial').value,
    dateStart: fechaInicio,
    dateExpected: nuevaFecha,
    image: document.getElementById('proyecto-imagen').value.trim() || DEFAULT_IMAGE,
    commercialDetail: document.getElementById('proyecto-detalle').value.trim(),
  };

  if (state.proyectoModalMode === 'editar' && state.proyectoModalId) {
    const p = state.proyectos.find((x) => x.id === state.proyectoModalId);
    if (!p) return;
    const originalProduccion = {
      leadCarpenter: p.leadCarpenter,
      logisticOperator: p.logisticOperator,
      status: p.status,
      manufacturingPhase: p.manufacturingPhase,
      phase: p.phase,
    };
    Object.assign(p, datos);
    if (!puedeAsignar()) Object.assign(p, originalProduccion);
    if (cambiaFecha) p._motivoCambio = `Fecha de entrega: ${state.fechaEntregaOriginal || 'Por definir'} → ${nuevaFecha}. Motivo: ${motivoFecha}`;
    p.commercialDetail = p.commercialDetail || detalleProyecto(p);
    p.alert = primerPendiente(p)?.text || '';
    commit();
    cerrarProyectoModal();
    showToast('Ficha actualizada y sincronizada.');
    return;
  }

  const nuevo = normalizarProyecto({
    ...datos,
    id: codigo,
    creadoEn: new Date().toISOString(),
    pendientes: [],
    muebles: [],
    pedidos: [],
    incidentes: [],
    archivos: [],
    dropboxFiles: { publicFiles: [] },
  });
  state.proyectos.push(nuevo);
  state.fProduccion = 'todos';
  state.year = 'Todos';
  state.quarter = 'Todos los Trimestres';
  state.city = 'Todos';
  state.proyectosEstado = 'activos';
  state.proyectosYear = 'Todos';
  state.proyectosQuarter = 'Todos los Trimestres';
  state.proyectosCity = 'Todos';
  state.recienCreado = nuevo.id;
  commit();
  cerrarProyectoModal();
  /* Se muestra de una vez: primero en la lista y resaltado */
  if (!['produccion', 'proyectos'].includes(state.tab)) switchTab('produccion');
  requestAnimationFrame(() => {
    document.querySelector(`.tab-panel:not(.is-hidden) [data-proyecto-id="${CSS.escape(nuevo.id)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  setTimeout(() => { if (state.recienCreado === nuevo.id) { state.recienCreado = null; document.querySelectorAll('.tarjeta-recien-creada').forEach((el) => el.classList.remove('tarjeta-recien-creada')); } }, 6000);
  showToast(`"${nuevo.name}" creado: aparece de primero en Producción y Proyectos.`);
}

/* ==========================================================================
   16b. CIUDADES (buscador de municipios) Y FECHAS (calendario)
   ========================================================================== */

function sinTildes(texto) {
  return String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/* Índice de búsqueda: nombre + departamento sin tildes */
let indiceCiudades = null;
function ciudadesColombia() {
  if (!indiceCiudades) {
    indiceCiudades = (window.MG_CIUDADES || []).map(([nombre, depto]) => ({
      nombre, depto, clave: sinTildes(`${nombre} ${depto}`), claveNombre: sinTildes(nombre),
    }));
  }
  return indiceCiudades;
}

function buscarCiudades(texto, max = 80) {
  const q = sinTildes(texto).trim();
  const todas = ciudadesColombia();
  if (!q) return todas.slice(0, max);
  /* Primero las que empiezan por lo escrito, luego las que lo contienen */
  const empiezan = [];
  const contienen = [];
  for (const c of todas) {
    if (c.claveNombre.startsWith(q)) empiezan.push(c);
    else if (c.clave.includes(q)) contienen.push(c);
    if (empiezan.length >= max) break;
  }
  return empiezan.concat(contienen).slice(0, max);
}

function ciudadValida(nombre) {
  return nombre === 'Por definir' || ciudadesColombia().some((c) => c.nombre === nombre);
}

function iniciarComboCiudad() {
  const input = document.getElementById('proyecto-ciudad-buscar');
  const oculto = document.getElementById('proyecto-ciudad');
  const lista = document.getElementById('proyecto-ciudad-lista');
  if (!input || !oculto || !lista) return;
  let activo = -1;
  let resultados = [];

  const abrir = (abierta) => {
    lista.classList.toggle('hidden', !abierta);
    input.setAttribute('aria-expanded', abierta ? 'true' : 'false');
  };
  const pintar = () => {
    resultados = buscarCiudades(input.value === oculto.value ? '' : input.value);
    activo = resultados.length ? 0 : -1;
    lista.innerHTML = resultados.length
      ? resultados.map((c, i) => `
          <li role="option" id="ciudad-op-${i}" data-ciudad="${esc(c.nombre)}" class="ciudad-combo__op ${i === activo ? 'activa' : ''}" aria-selected="${i === activo}">
            <span class="font-bold text-slate-900">${esc(c.nombre)}</span><span class="text-[10px] text-slate-400 ml-2">${esc(c.depto)}</span>
          </li>`).join('')
        + (input.value && input.value !== oculto.value ? '' : '<li class="ciudad-combo__nota">Escribe para ver más municipios…</li>')
      : '<li class="ciudad-combo__nota">Ningún municipio coincide. Revisa la ortografía.</li>';
    input.setAttribute('aria-activedescendant', activo >= 0 ? `ciudad-op-${activo}` : '');
    abrir(true);
  };
  const marcar = (i) => {
    activo = i;
    lista.querySelectorAll('[data-ciudad]').forEach((li, j) => {
      li.classList.toggle('activa', j === i);
      li.setAttribute('aria-selected', String(j === i));
      if (j === i) li.scrollIntoView({ block: 'nearest' });
    });
    input.setAttribute('aria-activedescendant', i >= 0 ? `ciudad-op-${i}` : '');
  };
  const elegir = (nombre) => {
    oculto.value = nombre;
    input.value = nombre;
    input.classList.remove('campo-invalido');
    abrir(false);
  };

  input.addEventListener('focus', () => { input.select(); pintar(); });
  input.addEventListener('input', pintar);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (lista.classList.contains('hidden')) pintar(); else marcar(Math.min(activo + 1, resultados.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); marcar(Math.max(activo - 1, 0)); }
    else if (e.key === 'Enter') { if (!lista.classList.contains('hidden') && resultados[activo]) { e.preventDefault(); elegir(resultados[activo].nombre); } }
    else if (e.key === 'Escape') { if (!lista.classList.contains('hidden')) { e.preventDefault(); e.stopPropagation(); abrir(false); input.value = oculto.value; } }
  });
  /* mousedown (no click) para elegir antes de que el campo pierda el foco */
  lista.addEventListener('mousedown', (e) => {
    const li = e.target.closest('[data-ciudad]');
    if (!li) return;
    e.preventDefault();
    elegir(li.dataset.ciudad);
  });
  input.addEventListener('blur', () => {
    setTimeout(() => {
      abrir(false);
      /* Si escribió el nombre exacto, se acepta; si no, vuelve a la última ciudad válida */
      const exacta = ciudadesColombia().find((c) => sinTildes(c.nombre) === sinTildes(input.value.trim()));
      if (exacta) elegir(exacta.nombre);
      else input.value = oculto.value === 'Por definir' ? '' : oculto.value;
    }, 120);
  });
}

function fijarCiudadProyecto(nombre) {
  const oculto = document.getElementById('proyecto-ciudad');
  const input = document.getElementById('proyecto-ciudad-buscar');
  const valor = nombre && nombre !== 'Por definir' ? nombre : 'Por definir';
  if (oculto) oculto.value = valor;
  if (input) input.value = valor === 'Por definir' ? '' : valor;
}

/* Filtros de ciudad: solo las ciudades que tienen proyectos, en orden alfabético */
function poblarFiltrosCiudad() {
  const ciudades = [...new Set(state.proyectos.map((p) => p.city).filter((c) => c && c !== 'Por definir'))]
    .sort((a, b) => a.localeCompare(b, 'es'));
  [['filtro-city', 'city'], ['proyectos-city', 'proyectosCity']].forEach(([id, clave]) => {
    const sel = document.getElementById(id);
    if (!sel) return;
    if (state[clave] !== 'Todos' && !ciudades.includes(state[clave])) state[clave] = 'Todos';
    sel.innerHTML = '<option value="Todos">Todas las ciudades</option>'
      + ciudades.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    sel.value = state[clave];
  });
}

/* Fechas: el calendario entrega AAAA-MM-DD; en la app se muestran como "16 Dic 2027"
   y en la base se guardan como fecha (AAAA-MM-DD). Nunca texto libre. */
function isoParaInput(textoFecha) {
  return fechaISODeTexto(textoFecha) || '';
}

function textoDesdeInputFecha(valorIso) {
  const d = parseFecha(valorIso);
  return d ? formatFechaLarga(d) : 'Por definir';
}

/* ==========================================================================
   16c. FORMULARIOS · mayúscula inicial, teléfono de Colombia y validación
   ========================================================================== */

/* Mayúscula inicial al escribir ("a" → "A"), sin forzar el resto. La búsqueda
   y los filtros no distinguen mayúsculas, así que se encuentra igual. */
function capitalizarInicial(el) {
  const v = el.value;
  const i = v.search(/\S/);
  if (i < 0) return;
  const c = v[i];
  const mayus = c.toLocaleUpperCase('es-CO');
  if (c === mayus || c.toLocaleLowerCase('es-CO') === mayus) return;
  const ini = el.selectionStart;
  const fin = el.selectionEnd;
  el.value = v.slice(0, i) + mayus + v.slice(i + 1);
  try { el.setSelectionRange(ini, fin); } catch (e) { /* noop */ }
}

/* Teléfono colombiano: 10 dígitos (celular 3XX… o fijo 60X…). El +57 lo pone la app. */
function digitosTelefonoCO(valor) {
  let d = String(valor || '').replace(/\D/g, '');
  /* En Colombia ningún número empieza por 57 (celulares 3…, fijos 60…): si
     empieza así es el indicativo del país escrito o pegado. */
  if (d.startsWith('57')) d = d.slice(2);
  return d.slice(0, 10);
}

function agruparTelefonoCO(d) {
  return [d.slice(0, 3), d.slice(3, 6), d.slice(6, 10)].filter(Boolean).join(' ');
}

function telefonoCOValido(d) {
  return /^(3\d{9}|60\d{8})$/.test(d);
}

/* Lo que se guarda: "+57 300 123 4567" (o vacío) */
function telefonoParaGuardar(valorCampo) {
  const d = digitosTelefonoCO(valorCampo);
  return d ? `+57 ${agruparTelefonoCO(d)}` : '';
}

function telefonoParaCampo(guardado) {
  return agruparTelefonoCO(digitosTelefonoCO(guardado));
}

function iniciarCampoTelefono(input) {
  if (!input) return;
  input.addEventListener('input', () => {
    const tecleado = input.value;
    const traeLetras = /[^\d\s+()-]/.test(tecleado);
    input.value = agruparTelefonoCO(digitosTelefonoCO(tecleado));
    if (traeLetras) marcarCampoError(input, 'Este campo solo permite números. Ej. 300 123 4567');
    else limpiarCampoError(input);
  });
  input.addEventListener('blur', () => {
    const d = digitosTelefonoCO(input.value);
    if (d && !telefonoCOValido(d)) {
      marcarCampoError(input, d.length < 10
        ? `Faltan ${10 - d.length} dígito${10 - d.length === 1 ? '' : 's'}: el número tiene 10 (ej. 300 123 4567).`
        : 'Debe empezar por 3 (celular) o por 60 (fijo).');
    }
  });
}

/* Mensaje en rojo debajo del campo */
function marcarCampoError(el, mensaje) {
  el.classList.add('campo-invalido');
  el.setAttribute('aria-invalid', 'true');
  const contenedor = el.closest('.campo-telefono') || el;
  let p = contenedor.parentElement.querySelector(`.campo-error[data-para="${el.id}"]`);
  if (!p) {
    p = document.createElement('p');
    p.className = 'campo-error';
    p.dataset.para = el.id;
    p.id = `${el.id}-error`;
    contenedor.insertAdjacentElement('afterend', p);
  }
  p.textContent = mensaje;
  el.setAttribute('aria-errormessage', p.id);
}

function limpiarCampoError(el) {
  el.classList.remove('campo-invalido');
  el.removeAttribute('aria-invalid');
  const contenedor = el.closest('.campo-telefono') || el;
  contenedor.parentElement?.querySelector(`.campo-error[data-para="${el.id}"]`)?.remove();
}

/* Resumen de errores junto al botón Guardar */
function mostrarErroresFormulario(boxId, errores) {
  const box = document.getElementById(boxId);
  if (!box) return;
  if (!errores.length) { box.classList.add('hidden'); box.innerHTML = ''; return; }
  box.innerHTML = `<p class="font-black"><i class="fas fa-circle-exclamation mr-1" aria-hidden="true"></i>No se pudo guardar. Corrige ${errores.length === 1 ? 'esto' : `estos ${errores.length} puntos`}:</p>
    <ul>${errores.map((e) => `<li><button type="button" data-ir-campo="${esc(e.campo)}">${esc(e.mensaje)}</button></li>`).join('')}</ul>`;
  box.classList.remove('hidden');
}

function validarFormularioProyecto() {
  const errores = [];
  const campo = (id) => document.getElementById(id);
  const req = (id, mensaje) => {
    if (!campo(id).value.trim()) { errores.push({ campo: id, mensaje }); marcarCampoError(campo(id), mensaje); }
  };
  req('proyecto-nombre', 'Escribe el nombre del proyecto (ej. Cocina Martha Pinos).');
  req('proyecto-cliente', 'Escribe el nombre del cliente.');
  const tel = digitosTelefonoCO(campo('proyecto-telefono').value);
  if (/[^\d\s]/.test(campo('proyecto-telefono').value)) {
    const m = 'Teléfono: este campo solo permite números (ej. 300 123 4567).';
    errores.push({ campo: 'proyecto-telefono', mensaje: m }); marcarCampoError(campo('proyecto-telefono'), m);
  } else if (tel && !telefonoCOValido(tel)) {
    const m = 'Teléfono: ingresa un número colombiano de 10 dígitos (celular 300 123 4567 o fijo 601 234 5678). Si es de otro país, escríbelo en las notas.';
    errores.push({ campo: 'proyecto-telefono', mensaje: m }); marcarCampoError(campo('proyecto-telefono'), m);
  }
  const dIni = parseFecha(campo('proyecto-fecha-inicio').value);
  const dFin = parseFecha(campo('proyecto-fecha-entrega').value);
  if (dIni && dFin && dFin < dIni) {
    const m = 'La fecha de entrega no puede ser anterior a la fecha de inicio.';
    errores.push({ campo: 'proyecto-fecha-entrega', mensaje: m }); marcarCampoError(campo('proyecto-fecha-entrega'), m);
  }
  mostrarErroresFormulario('proyecto-errores', errores);
  return errores;
}

function iniciarValidacionFormularios() {
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (el.matches?.('[data-capitalizar]')) capitalizarInicial(el);
    if (el.classList?.contains('campo-invalido') && el.id !== 'proyecto-telefono') limpiarCampoError(el);
  });
  iniciarCampoTelefono(document.getElementById('proyecto-telefono'));
  document.getElementById('proyecto-errores')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ir-campo]');
    if (!b) return;
    const el = document.getElementById(b.dataset.irCampo);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el?.focus();
  });
}

function limpiarErroresProyecto() {
  document.querySelectorAll('#proyecto-form .campo-invalido').forEach(limpiarCampoError);
  mostrarErroresFormulario('proyecto-errores', []);
}

/* ==========================================================================
   18. MODAL · NUEVO PROSPECTO
   ========================================================================== */

function abrirProspectoModal() {
  if (!puedeCrearProspecto()) { showToast('Solo Gerencia o Secretaría pueden crear prospectos.'); return; }
  document.getElementById('prospecto-form').reset();
  document.getElementById('prospecto-modal').classList.remove('is-hidden');
  setTimeout(() => document.getElementById('prospecto-cliente')?.focus(), 50);
}

function cerrarProspectoModal() {
  document.getElementById('prospecto-modal')?.classList.add('is-hidden');
}

/* ==========================================================================
   19. RENDER GLOBAL Y NAVEGACIÓN
   ========================================================================== */

function renderAll() {
  poblarFiltrosCiudad();
  renderKpis();
  renderProduccion();
  renderEquipo();
  renderComercial();
  renderTabla();
  renderProyectos();
  renderCentro();
  renderNewOrder();
  if (state.tab === 'stats') renderStats();
  if (state.fichaId) {
    const modal = document.getElementById('modal-ficha');
    if (modal && !modal.classList.contains('is-hidden')) openFicha(state.fichaId);
  }
}

function switchTab(tab) {
  const permitidos = tabsPermitidos();
  const destino = permitidos.includes(tab) ? tab : permitidos[0];
  state.tab = destino;
  document.querySelectorAll('#mg-tabs [data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === destino));
  document.querySelectorAll('.tab-panel').forEach((el) => {
    el.classList.toggle('is-hidden', el.id !== `tab-${destino}`);
  });

  if (destino === 'produccion') { renderKpis(); renderProduccion(); }
  if (destino === 'equipo') renderEquipo();
  if (destino === 'comercial') renderComercial();
  if (destino === 'tabla') renderTabla();
  if (destino === 'proyectos') renderProyectos();
  if (destino === 'centro') renderCentro();
  if (destino === 'stats') renderStats();
  if (destino === 'usuarios') { renderUsuarios(); cargarUsuarios(); }
  if (destino === 'new-order') renderNewOrder();
}
/* ==========================================================================
   20. EVENTOS · LOGIN, HEADER, FILTROS Y MÓDULOS
   ========================================================================== */

function bindLoginEvents() {
  const form = document.getElementById('login-form');
  const modoLogin = { value: 'login' };
  const btnToggle = document.getElementById('login-toggle');
  const btnSubmit = document.getElementById('login-submit');
  if (!form || !btnToggle || !btnSubmit) return;

  const camposRegistro = document.querySelectorAll('[data-solo-registro]');
  const pintarModo = () => {
    const esLogin = modoLogin.value === 'login';
    btnSubmit.innerHTML = esLogin
      ? '<i class="fas fa-lock mr-2" aria-hidden="true"></i> Iniciar Sesión'
      : '<i class="fas fa-user-plus mr-2" aria-hidden="true"></i> Crear Cuenta';
    btnToggle.textContent = esLogin ? 'Crear cuenta' : 'Ya tengo cuenta · Iniciar Sesión';
    camposRegistro.forEach((el) => el.classList.toggle('hidden', esLogin));
    const nombre = document.getElementById('login-nombre');
    if (nombre) nombre.required = !esLogin;
    const pass2 = document.getElementById('login-password2');
    if (pass2) pass2.required = !esLogin;
    document.getElementById('login-password')?.setAttribute('autocomplete', esLogin ? 'current-password' : 'new-password');
    document.getElementById('login-error')?.classList.add('hidden');
  };
  pintarModo();

  btnToggle.addEventListener('click', () => {
    modoLogin.value = modoLogin.value === 'login' ? 'registro' : 'login';
    pintarModo();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const cargo = document.getElementById('login-cargo')?.value || 'arquitecto';
    const nombre = document.getElementById('login-nombre')?.value || '';
    document.getElementById('login-error')?.classList.add('hidden');

    const textoBoton = btnSubmit.innerHTML;
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = '<i class="fas fa-spinner fa-spin mr-2" aria-hidden="true"></i> Procesando...';
    let res;
    try {
      res = modoLogin.value === 'login'
        ? await iniciarSesion(email, password)
        : await registrar(email, password, cargo, nombre, document.getElementById('login-password2')?.value || '');
    } catch (err) {
      res = { ok: false, msg: traducirErrorAuth(err) };
    } finally {
      btnSubmit.disabled = false;
      btnSubmit.innerHTML = textoBoton;
    }

    if (!res.ok) {
      mostrarErrorLogin(res.msg);
      return;
    }
    document.getElementById('login-password').value = '';
    const pass2 = document.getElementById('login-password2');
    if (pass2) pass2.value = '';
    if (res.pendienteConfirmacion) {
      modoLogin.value = 'login';
      pintarModo();
      mostrarErrorLogin(res.msg, 'ok');
    }
    /* Si hay sesión, onAuthStateChange(SIGNED_IN) carga perfil y datos */
  });

  document.getElementById('login-forgot')?.addEventListener('click', () => {
    const email = document.getElementById('login-email')?.value.trim() || '';
    abrirRecuperacion('correo', email);
  });

  document.getElementById('forgot-close')?.addEventListener('click', cancelarRecuperacion);

  document.getElementById('forgot-reset')?.addEventListener('click', async () => {
    const modal = document.getElementById('login-forgot-modal');
    const modo = modal?.dataset.modo || 'correo';
    const msgEl = document.getElementById('forgot-msg');
    const btn = document.getElementById('forgot-reset');
    btn.disabled = true;
    const res = modo === 'nueva'
      ? await cambiarContrasena(document.getElementById('forgot-pass').value, document.getElementById('forgot-pass2').value)
      : await enviarRecuperacion(document.getElementById('forgot-email').value);
    btn.disabled = false;
    if (!res.ok) {
      msgEl.textContent = res.msg;
      msgEl.className = 'text-xs font-bold text-red-600 mt-3';
      return;
    }
    if (modo === 'nueva') {
      const veniaDelCorreo = enRecuperacion();
      marcarRecuperacion(false);
      cerrarRecuperacion();
      document.getElementById('forgot-close').textContent = 'Cancelar';
      showToast('Contraseña actualizada.');
      if (veniaDelCorreo) {
        const { data } = await supabaseClient.auth.getSession();
        if (data?.session?.user) await entrarConSesion(data.session.user);
      }
    } else {
      msgEl.textContent = 'Si el correo está registrado, recibirás un enlace para crear una nueva contraseña.';
      msgEl.className = 'text-xs font-bold text-emerald-700 mt-3';
    }
  });
}

function abrirRecuperacion(modo, email = '') {
  const modal = document.getElementById('login-forgot-modal');
  if (!modal) return;
  modal.dataset.modo = modo;
  const esNueva = modo === 'nueva';
  document.getElementById('forgot-title').textContent = esNueva ? 'Crea tu nueva contraseña' : 'Recuperar contraseña';
  document.getElementById('forgot-sub').textContent = esNueva
    ? 'Escribe la nueva contraseña para tu cuenta (mínimo 8 caracteres, con letras y números).'
    : 'Te enviaremos un enlace a tu correo para crear una nueva contraseña.';
  document.getElementById('forgot-email-wrap').classList.toggle('hidden', esNueva);
  document.getElementById('forgot-pass-wrap').classList.toggle('hidden', !esNueva);
  document.getElementById('forgot-email').value = email;
  document.getElementById('forgot-pass').value = '';
  document.getElementById('forgot-pass2').value = '';
  document.getElementById('forgot-reset').textContent = esNueva ? 'Guardar contraseña' : 'Enviar enlace';
  const msgEl = document.getElementById('forgot-msg');
  msgEl.textContent = '';
  msgEl.className = 'hidden';
  modal.classList.remove('is-hidden');
}

function cerrarRecuperacion() {
  document.getElementById('login-forgot-modal')?.classList.add('is-hidden');
}

/* Pantalla obligatoria tras abrir el enlace del correo: no deja ver la app */
function exigirNuevaContrasena() {
  if (sesionUserId) salirDeSesion();
  else mostrarLogin();
  abrirRecuperacion('nueva');
  document.getElementById('forgot-close').textContent = 'Cancelar y salir';
  document.getElementById('forgot-sub').textContent = 'Por seguridad, crea tu nueva contraseña antes de entrar (mínimo 8 caracteres, con letras y números).';
  try { history.replaceState(null, '', window.location.pathname); } catch (e) { /* noop */ }
}

async function cancelarRecuperacion() {
  const modo = document.getElementById('login-forgot-modal')?.dataset.modo;
  cerrarRecuperacion();
  document.getElementById('forgot-close').textContent = 'Cancelar';
  if (modo === 'nueva' && enRecuperacion()) {
    marcarRecuperacion(false);
    await supabaseClient.auth.signOut();
    salirDeSesion();
    showToast('No se cambió la contraseña. Inicia sesión con tu contraseña actual o vuelve a pedir el enlace.');
  }
}

function bindHeaderEvents() {
  document.getElementById('btn-tema')?.addEventListener('click', toggleTema);
  document.getElementById('btn-logout')?.addEventListener('click', cerrarSesion);

  document.getElementById('mg-search-input')?.addEventListener('input', (e) => {
    state.search = e.target.value.trim();
    if (state.tab === 'produccion') renderProduccion();
    if (state.tab === 'tabla') renderTabla();
    if (state.tab === 'proyectos') renderProyectos();
  });
}

function bindTabsEvents() {
  document.getElementById('mg-tabs')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tab]');
    if (!btn) return;
    switchTab(btn.dataset.tab);
  });
}

function pintarChipsProduccion() {
  document.querySelectorAll('#filtros-produccion [data-filtro]').forEach((b) => {
    const activo = b.dataset.filtro === state.fProduccion;
    b.classList.toggle('active', activo);
    b.setAttribute('aria-pressed', String(activo));
  });
}

function bindProduccionEvents() {
  document.getElementById('filtros-produccion')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-filtro]');
    if (!btn) return;
    state.fProduccion = btn.dataset.filtro;
    pintarChipsProduccion();
    renderProduccion();
  });

  document.querySelectorAll('[data-vista-para]').forEach((grupo) => {
    grupo.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-vista]');
      if (!btn) return;
      const clave = grupo.dataset.vistaPara;
      state.vistas[clave] = btn.dataset.vista === 'lista' ? 'lista' : 'tarjetas';
      try { localStorage.setItem(VISTAS_KEY, JSON.stringify(state.vistas)); } catch (err) { /* noop */ }
      if (clave === 'produccion') renderProduccion();
      else if (clave === 'equipo') renderEquipo();
      else renderProyectos();
    });
  });

  document.getElementById('filtro-year')?.addEventListener('change', (e) => { state.year = e.target.value; renderProduccion(); });
  document.getElementById('filtro-quarter')?.addEventListener('change', (e) => { state.quarter = e.target.value; renderProduccion(); });
  document.getElementById('filtro-city')?.addEventListener('change', (e) => { state.city = e.target.value; renderProduccion(); });
}

function bindProyectosEvents() {
  document.getElementById('proyectos-estado')?.addEventListener('change', (e) => { state.proyectosEstado = e.target.value; renderProyectos(); });
  document.getElementById('proyectos-year')?.addEventListener('change', (e) => { state.proyectosYear = e.target.value; renderProyectos(); });
  document.getElementById('proyectos-quarter')?.addEventListener('change', (e) => { state.proyectosQuarter = e.target.value; renderProyectos(); });
  document.getElementById('proyectos-city')?.addEventListener('change', (e) => { state.proyectosCity = e.target.value; renderProyectos(); });
}

function bindComercialEvents() {
  document.getElementById('comercial-trimestre')?.addEventListener('change', (e) => {
    state.comercialTrimestre = e.target.value;
    renderComercial();
  });

  const board = document.getElementById('comercial-board');
  board?.addEventListener('click', (e) => {
    const card = e.target.closest('[data-cc-id]');
    if (!card) return;
    if (e.target.closest('button, select, option, input, textarea, a')) return;
    abrirComercialModal(card.dataset.ccKind, card.dataset.ccId);
  });
}

function bindCentroEvents() {
  document.getElementById('centro-refresh')?.addEventListener('click', () => {
    renderCentro();
    showToast('Centro de control actualizado.');
  });
}

function bindFichaEvents() {
  document.getElementById('ficha-close')?.addEventListener('click', closeFicha);
  document.getElementById('ficha-close-footer')?.addEventListener('click', closeFicha);

  document.getElementById('ficha-editar')?.addEventListener('click', () => {
    if (state.fichaId) abrirProyectoModal(state.fichaId);
  });
  document.getElementById('ficha-cambiar-imagen')?.addEventListener('click', () => {
    if (state.fichaId) document.getElementById('ficha-imagen-file')?.click();
  });
  document.getElementById('ficha-imagen-file')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) cambiarImagenDesdeFicha(file);
  });
  document.getElementById('proyecto-imagen-file')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!TIPOS_IMAGEN.includes(file.type)) { showToast('La imagen debe ser JPG, PNG o WEBP.'); e.target.value = ''; return; }
    pintarPreviewImagen(URL.createObjectURL(file));
  });
  document.getElementById('proyecto-fecha-entrega')?.addEventListener('input', (e) => {
    const editando = state.proyectoModalMode === 'editar' && state.fechaEntregaOriginal !== null;
    const cambia = editando && textoDesdeInputFecha(e.target.value) !== state.fechaEntregaOriginal;
    document.getElementById('proyecto-motivo-wrap')?.classList.toggle('hidden', !cambia);
  });
  document.getElementById('proyecto-imagen-quitar')?.addEventListener('click', () => {
    document.getElementById('proyecto-imagen').value = '';
    document.getElementById('proyecto-imagen-file').value = '';
    pintarPreviewImagen(DEFAULT_IMAGE);
  });

  document.getElementById('ficha-estado-select')?.addEventListener('change', (e) => {
    const p = state.proyectos.find((x) => x.id === state.fichaId);
    if (!p) return;
    if (!puedeAsignar()) {
      e.target.value = p.status;
      showToast('Tu rol no puede modificar el estado de producción.');
      return;
    }
    p.status = e.target.value;
    commit();
    showToast(`${p.name}: estado ${p.status}.`);
  });

  document.getElementById('ficha-subtabs')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-sub]');
    if (!btn) return;
    mostrarSubFicha(btn.dataset.sub);
    const cuerpo = document.getElementById('ficha-cuerpo');
    if (cuerpo) cuerpo.scrollTop = 0;
    btn.scrollIntoView({ block: 'nearest', inline: 'center' });
  });

  document.getElementById('ficha-fase-back')?.addEventListener('click', () => {
    if (state.fichaId) cambiarFaseProyecto(state.fichaId, -1);
  });
  document.getElementById('ficha-fase-next')?.addEventListener('click', () => {
    if (state.fichaId) cambiarFaseProyecto(state.fichaId, 1);
  });

  document.getElementById('ficha-pedido-add')?.addEventListener('click', () => {
    const id = state.fichaId;
    if (!id) return;
    if (!puedeGestionarCompras()) { showToast('Solo Gerencia y Logística registran compras.'); return; }
    closeFicha();
    state.newOrderProjectId = id;
    switchTab('new-order');
    renderNewOrder();
    const select = document.getElementById('pedido-proyecto');
    if (select) select.value = id;
  });

  document.getElementById('doc-carpeta')?.addEventListener('change', llenarCategoriasDoc);
  document.getElementById('doc-subir')?.addEventListener('click', subirDocumentos);
  /* Desde "+ Subir" de una subcarpeta: al elegir los archivos se suben de una vez */
  document.getElementById('doc-archivo')?.addEventListener('change', (e) => {
    if (e.target.dataset.autoSubir === '1' && e.target.files.length) { delete e.target.dataset.autoSubir; subirDocumentos(); }
  });

  document.getElementById('archivo-add')?.addEventListener('click', () => document.getElementById('archivo-input')?.click());
  document.getElementById('archivo-input')?.addEventListener('change', (e) => {
    const input = e.target;
    if (!puedeEditarFicha()) { input.value = ''; return; }
    const files = Array.from(input.files || []);
    const p = state.proyectos.find((x) => x.id === state.fichaId);
    if (!p) { input.value = ''; return; }
    if (!p.archivos) p.archivos = [];
    files.forEach((f) => {
      const lower = f.name.toLowerCase();
      const tipo = lower.endsWith('.pdf') ? 'pdf'
        : (/\.(png|jpe?g|gif|webp|svg)$/.test(lower) ? '2d' : '3d');
      const url = (tipo === 'pdf' || tipo === '2d') ? URL.createObjectURL(f) : null;
      p.archivos.push({ id: uid('f'), name: f.name, tipo, size: `${(f.size / 1024 / 1024).toFixed(1)} MB`, date: hoyISO(), url });
    });
    input.value = '';
    commit();
    renderArchivos(p);
    showToast('Documentación adjuntada a la ficha y sincronizada.');
  });
}

function bindModalsEvents() {
  document.getElementById('proyecto-modal-close')?.addEventListener('click', cerrarProyectoModal);
  document.getElementById('proyecto-cancelar')?.addEventListener('click', cerrarProyectoModal);
  document.getElementById('proyecto-form')?.addEventListener('submit', guardarProyecto);

  document.getElementById('prospecto-cancelar')?.addEventListener('click', cerrarProspectoModal);
  document.getElementById('prospecto-form')?.addEventListener('submit', guardarProspecto);

  document.getElementById('pendiente-cancelar')?.addEventListener('click', cerrarPendienteModal);
  document.getElementById('pendiente-form')?.addEventListener('submit', guardarPendiente);

  document.getElementById('comercial-modal-close')?.addEventListener('click', cerrarComercialModal);
  document.getElementById('comercial-modal-cancelar')?.addEventListener('click', cerrarComercialModal);
  document.getElementById('comercial-modal-guardar')?.addEventListener('click', guardarComercialModal);
  document.getElementById('comercial-modal-aprobar')?.addEventListener('click', () => {
    if (state.comercialCtx?.kind === 'comercial') aprobarProspecto(state.comercialCtx.id);
  });
  document.getElementById('comercial-modal-rechazar')?.addEventListener('click', () => {
    if (state.comercialCtx?.kind === 'comercial') abrirRechazo(state.comercialCtx.id);
  });
  document.getElementById('comercial-modal-ficha')?.addEventListener('click', () => {
    const ctx = state.comercialCtx;
    if (!ctx) return;
    const id = ctx.kind === 'proyecto' ? ctx.id : state.comercial.find((x) => x.id === ctx.id)?.proyectoId;
    if (!id) return;
    cerrarComercialModal();
    openFicha(id);
  });
  document.getElementById('comercial-modal-etapa')?.addEventListener('change', (e) => {
    const ctx = state.comercialCtx;
    if (!ctx) return;
    cambiarEtapaComercial(ctx.kind, ctx.id, e.target.value);
  });

  document.getElementById('rechazo-cancelar')?.addEventListener('click', cerrarRechazo);
  document.getElementById('rechazo-confirmar')?.addEventListener('click', confirmarRechazo);

  document.getElementById('tarea-close')?.addEventListener('click', cerrarModalTarea);
  document.getElementById('tarea-guardar')?.addEventListener('click', guardarTarea);
  document.getElementById('tarea-eliminar')?.addEventListener('click', () => {
    const ctx = state.tareaCtx;
    if (ctx) eliminarTarea(ctx.carpenter, ctx);
  });

  document.getElementById('pedido-form')?.addEventListener('submit', onPedidoGuardar);
}

/* ==========================================================================
   21. DELEGACIÓN GLOBAL Y DRAG & DROP
   ========================================================================== */

function contextoDesdeDataset(el) {
  const kind = el.dataset.taskKind;
  const projectId = el.dataset.project || '';
  const muebleId = el.dataset.mueble || '';
  const taskId = el.dataset.task || '';
  const carpenter = el.dataset.carpenter || '';
  if (kind === 'mueble') {
    const p = state.proyectos.find((x) => x.id === projectId);
    const m = (p?.muebles || []).find((x) => x.id === muebleId);
    if (!m) return null;
    return { kind, projectId, muebleId, taskId: null, carpenter: m.carpenter || carpenter, text: m.name, actividad: m.actividad || 'Armando', detalle: m.detalle || '', estado: estadoTrabajoValido(m.estadoTrabajo) };
  }
  const t = (state.tareas[carpenter] || []).find((x) => x.id === taskId);
  if (!t) return null;
  return { kind: 'tarea', projectId: t.projectId, muebleId: null, taskId: t.id, carpenter, text: t.text, actividad: t.actividad || 'Otra', detalle: t.detalle || '', esLider: Boolean(t.esLider), grupoId: t.grupoId || null, estado: estadoTrabajoValido(t.estado) };
}

function bindGlobalDelegation() {
  document.addEventListener('click', (e) => {
    const pendAdd = e.target.closest('[data-pend-add]');
    if (pendAdd) { abrirPendienteModal(pendAdd.dataset.pendAdd, null); return; }

    const pendEdit = e.target.closest('[data-pend-edit]');
    if (pendEdit) { abrirPendienteModal(pendEdit.dataset.pendProject, pendEdit.dataset.pendEdit); return; }

    const pendDel = e.target.closest('[data-pend-del]');
    if (pendDel) { eliminarPendiente(pendDel.dataset.pendProject, pendDel.dataset.pendDel); return; }

    const ficha = e.target.closest('[data-open-ficha]');
    if (ficha) {
      if (ficha.dataset.sub) state.fichaSub = ficha.dataset.sub;
      else state.fichaSub = 'resumen';
      openFicha(ficha.dataset.openFicha);
      const cuerpo = document.getElementById('ficha-cuerpo');
      if (cuerpo) cuerpo.scrollTop = 0;
      return;
    }

    const editProyecto = e.target.closest('[data-edit-proyecto]');
    if (editProyecto) { abrirProyectoModal(editProyecto.dataset.editProyecto); return; }

    const faseProyecto = e.target.closest('[data-fase-proyecto]');
    if (faseProyecto) { cambiarFaseProyecto(faseProyecto.dataset.faseProyecto, Number(faseProyecto.dataset.delta)); return; }

    const taskPhase = e.target.closest('[data-task-phase]');
    if (taskPhase) {
      const delta = Number(taskPhase.dataset.taskPhase);
      if (taskPhase.dataset.taskKind === 'mueble') cambiarFaseMueble(taskPhase.dataset.project, taskPhase.dataset.mueble, delta);
      else cambiarFaseTarea(taskPhase.dataset.carpenter, taskPhase.dataset.task, delta);
      return;
    }

    const taskEdit = e.target.closest('[data-task-edit]');
    if (taskEdit) {
      const ctx = contextoDesdeDataset(taskEdit);
      if (ctx) abrirModalTarea(ctx.carpenter, ctx);
      return;
    }

    const taskDel = e.target.closest('[data-task-del]');
    if (taskDel) {
      const ctx = contextoDesdeDataset(taskDel);
      if (ctx) eliminarTarea(ctx.carpenter, ctx);
      return;
    }

    const tareaAdd = e.target.closest('[data-tarea-add]');
    if (tareaAdd) { abrirModalTarea(tareaAdd.dataset.tareaAdd, null); return; }

    const accion = e.target.closest('[data-accion]');
    if (accion) {
      if (accion.dataset.accion === 'nuevo-proyecto') abrirProyectoModal();
      if (accion.dataset.accion === 'nuevo-prospecto') abrirProspectoModal();
      if (accion.dataset.accion === 'nueva-tarea') abrirModalTarea('', null);
      return;
    }

    const aprobar = e.target.closest('[data-cc-aprobar]');
    if (aprobar) { aprobarProspecto(aprobar.dataset.ccAprobar); return; }

    const rechazar = e.target.closest('[data-cc-rechazar]');
    if (rechazar) { abrirRechazo(rechazar.dataset.ccRechazar); return; }

    const reporte = e.target.closest('[data-reporte-gerencia]');
    if (reporte) { reportarGerencia(); return; }

    const centroTab = e.target.closest('[data-centro-tab]');
    if (centroTab) { switchTab(centroTab.dataset.centroTab); return; }

    const verDoc = e.target.closest('[data-ver-doc]');
    if (verDoc) { verDocumento(verDoc.dataset.verDoc); return; }

    const borrarPrj = e.target.closest('[data-eliminar-proyecto]');
    if (borrarPrj) { eliminarProyecto(borrarPrj.dataset.eliminarProyecto); return; }

    const docVer = e.target.closest('[data-doc-ver]');
    if (docVer) { abrirDocumento(docVer.dataset.docVer, false); return; }
    const docBajar = e.target.closest('[data-doc-descargar]');
    if (docBajar) { abrirDocumento(docBajar.dataset.docDescargar, true); return; }
    const docBorrar = e.target.closest('[data-doc-eliminar]');
    if (docBorrar) { eliminarDocumento(docBorrar.dataset.docEliminar); return; }
    const subirA = e.target.closest('[data-doc-subir-a]');
    if (subirA) {
      const selC = document.getElementById('doc-carpeta');
      if (selC) { selC.value = 'proyecto'; llenarCategoriasDoc(); }
      document.getElementById('doc-categoria').value = subirA.dataset.docSubirA;
      document.getElementById('docs-subir-box')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const inp = document.getElementById('doc-archivo');
      if (inp) { inp.dataset.autoSubir = '1'; inp.click(); }
      return;
    }
    const docCerrar = e.target.closest('[data-doc-cerrar-visor]');
    if (docCerrar) { cerrarVisorDocumento(); return; }

    const tabBtn = e.target.closest('[data-tab]');
    if (tabBtn && !tabBtn.closest('#mg-tabs')) { switchTab(tabBtn.dataset.tab); return; }
  });

  document.addEventListener('change', (e) => {
    const select = e.target.closest('[data-com-stage]');
    if (!select) return;
    cambiarEtapaComercial(select.dataset.ccKind, select.dataset.ccId, select.value);
  });
}

function bindDragAndDrop() {
  document.addEventListener('dragstart', (e) => {
    const card = e.target.closest('[data-cc-id]');
    if (!card) return;
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify({ kind: card.dataset.ccKind, id: card.dataset.ccId }));
  });

  document.addEventListener('dragend', () => {
    document.querySelectorAll('.comercial-card.dragging').forEach((el) => el.classList.remove('dragging'));
    document.querySelectorAll('[data-stage-col].drag-over').forEach((el) => el.classList.remove('drag-over'));
  });

  document.addEventListener('dragover', (e) => {
    const col = e.target.closest('[data-stage-col]');
    if (!col) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    document.querySelectorAll('[data-stage-col].drag-over').forEach((el) => { if (el !== col) el.classList.remove('drag-over'); });
    col.classList.add('drag-over');
  });

  document.addEventListener('dragleave', (e) => {
    const col = e.target.closest('[data-stage-col]');
    if (col && !col.contains(e.relatedTarget)) col.classList.remove('drag-over');
  });

  document.addEventListener('drop', (e) => {
    const col = e.target.closest('[data-stage-col]');
    if (!col) return;
    e.preventDefault();
    col.classList.remove('drag-over');
    try {
      const data = JSON.parse(e.dataTransfer.getData('text/plain') || '{}');
      if (data.kind && data.id) cambiarEtapaComercial(data.kind, data.id, col.dataset.stageCol);
    } catch (err) {
      console.warn('[MODUGAL] No se pudo interpretar el arrastre.', err);
    }
  });
}

function bindChatEvents() {
  document.getElementById('chat-fab')?.addEventListener('click', abrirChat);
  document.getElementById('chat-close')?.addEventListener('click', cerrarChat);
  document.getElementById('chat-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    enviarMensaje(document.getElementById('chat-input').value);
  });
  document.getElementById('chat-quick')?.addEventListener('click', (e) => {
    const chip = e.target.closest('.chat-chip');
    if (chip) enviarMensaje(chip.dataset.q);
  });
}

/* ==========================================================================
   21b. USUARIOS & ACCESOS (solo Gerencia)
   Lista public.usuarios; Gerencia aprueba el cargo solicitado, cambia el
   rol, rechaza o suspende. La base (trigger + RLS) valida cada cambio.
   ========================================================================== */

const ESTADOS_USUARIO = {
  pendiente: { label: 'Pendiente', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  aprobado: { label: 'Aprobado', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  rechazado: { label: 'Rechazado', cls: 'bg-red-50 text-red-700 border-red-200' },
  suspendido: { label: 'Suspendido', cls: 'bg-slate-100 text-slate-600 border-slate-300' },
};

let cargandoUsuarios = null;

async function cargarUsuarios() {
  if (!esGerencia() || !sbListo) return;
  if (cargandoUsuarios) return cargandoUsuarios;
  cargandoUsuarios = (async () => {
    const { data, error } = await supabaseClient
      .from('usuarios')
      .select('id,email,nombre,rol,cargo_solicitado,estado_aprobacion,aprobado_en,created_at')
      .order('created_at', { ascending: false });
    if (error) {
      console.error('[MODUGAL] No se pudo cargar la lista de usuarios.', error);
      const box = document.getElementById('usuarios-lista');
      if (box) box.innerHTML = `<p class="text-xs font-bold text-red-600 p-4">No se pudo cargar la lista de usuarios: ${esc(mensajeError(error))}</p>`;
      return;
    }
    state.usuarios = data || [];
    actualizarBadgeUsuarios();
    if (state.tab === 'usuarios') renderUsuarios();
  })();
  try { await cargandoUsuarios; } finally { cargandoUsuarios = null; }
}

function actualizarBadgeUsuarios() {
  const btn = document.querySelector('#mg-tabs [data-tab="usuarios"]');
  if (!btn) return;
  const n = (state.usuarios || []).filter((u) => u.estado_aprobacion === 'pendiente').length;
  let badge = btn.querySelector('[data-badge-usuarios]');
  if (!badge) {
    badge = document.createElement('span');
    badge.dataset.badgeUsuarios = '';
    badge.className = 'ml-2 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-red-600 text-white text-[10px] font-black';
    btn.appendChild(badge);
  }
  badge.textContent = String(n);
  badge.classList.toggle('hidden', n === 0);
}

function fechaCorta(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  return `${d.getDate()} ${MESES_CORTOS[d.getMonth()]} ${d.getFullYear()}`;
}

function opcionesRol(seleccionado) {
  return ROLES_VALIDOS.map((r) => `<option value="${r}" ${r === seleccionado ? 'selected' : ''}>${esc(labelCargo(r))}</option>`).join('');
}

function renderUsuarios() {
  const box = document.getElementById('usuarios-lista');
  if (!box) return;
  const lista = state.usuarios || [];
  const conteo = { todos: lista.length, pendiente: 0, aprobado: 0, rechazado: 0, suspendido: 0 };
  lista.forEach((u) => { if (conteo[u.estado_aprobacion] !== undefined) conteo[u.estado_aprobacion] += 1; });

  document.querySelectorAll('[data-usr-filtro]').forEach((b) => {
    const f = b.dataset.usrFiltro;
    b.classList.toggle('bg-slate-900', state.usuariosFiltro === f);
    b.classList.toggle('text-white', state.usuariosFiltro === f);
    b.classList.toggle('bg-white', state.usuariosFiltro !== f);
    b.classList.toggle('text-slate-700', state.usuariosFiltro !== f);
    const c = b.querySelector('[data-usr-count]');
    if (c) c.textContent = String(conteo[f] ?? 0);
  });

  const visibles = state.usuariosFiltro === 'todos' ? lista : lista.filter((u) => u.estado_aprobacion === state.usuariosFiltro);
  if (!visibles.length) {
    box.innerHTML = `<div class="p-8 text-center text-xs text-slate-400 bg-white border border-dashed border-slate-300 rounded-2xl">${
      state.usuariosFiltro === 'pendiente' ? 'No hay solicitudes pendientes.' : 'No hay usuarios en esta categoría.'
    }</div>`;
    return;
  }

  box.innerHTML = visibles.map((u) => {
    const est = ESTADOS_USUARIO[u.estado_aprobacion] || ESTADOS_USUARIO.pendiente;
    const yo = u.id === state.user?.id;
    const rolPropuesto = u.estado_aprobacion === 'pendiente' ? (u.cargo_solicitado || u.rol) : u.rol;
    const iniciales = String(u.nombre || u.email || '?').split(/\s+/).map((x) => x[0]).slice(0, 2).join('').toUpperCase();
    let acciones;
    if (yo) {
      acciones = '<p class="text-[11px] font-bold text-slate-400">Tu cuenta · no puedes cambiar tu propio acceso</p>';
    } else if (u.estado_aprobacion === 'pendiente') {
      acciones = `
        <button type="button" class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-2 rounded-xl text-xs" data-usr-accion="aprobar" data-usr-id="${esc(u.id)}"><i class="fas fa-check mr-1" aria-hidden="true"></i>Aprobar</button>
        <button type="button" class="bg-white border border-red-200 text-red-700 hover:bg-red-50 font-bold px-3 py-2 rounded-xl text-xs" data-usr-accion="rechazar" data-usr-id="${esc(u.id)}">Rechazar</button>`;
    } else if (u.estado_aprobacion === 'aprobado') {
      acciones = `
        <button type="button" class="bg-slate-900 hover:bg-slate-800 text-white font-bold px-3 py-2 rounded-xl text-xs" data-usr-accion="guardar-rol" data-usr-id="${esc(u.id)}">Guardar rol</button>
        <button type="button" class="bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 font-bold px-3 py-2 rounded-xl text-xs" data-usr-accion="suspender" data-usr-id="${esc(u.id)}">Suspender</button>`;
    } else {
      acciones = `
        <button type="button" class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-2 rounded-xl text-xs" data-usr-accion="aprobar" data-usr-id="${esc(u.id)}">${u.estado_aprobacion === 'suspendido' ? 'Reactivar' : 'Aprobar'}</button>`;
    }
    return `
      <article class="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col lg:flex-row lg:items-center gap-4" data-usr-card="${esc(u.id)}">
        <div class="flex items-center gap-3 min-w-0 lg:w-80">
          <div class="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-xs font-black text-slate-600 shrink-0">${esc(iniciales)}</div>
          <div class="min-w-0">
            <p class="text-sm font-black text-slate-900 truncate">${esc(u.nombre || '—')}${yo ? ' <span class="text-[10px] text-slate-400">(tú)</span>' : ''}</p>
            <p class="text-xs text-slate-500 truncate">${esc(u.email)}</p>
          </div>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs flex-1">
          <div>
            <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Solicitó</p>
            <p class="font-bold text-slate-800">${esc(labelCargo(u.cargo_solicitado || 'arquitecto'))}</p>
          </div>
          <div>
            <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Estado</p>
            <span class="inline-block mt-0.5 px-2 py-0.5 rounded-full border text-[10px] font-black ${est.cls}">${est.label}</span>
          </div>
          <div class="col-span-2 sm:col-span-1">
            <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Registro</p>
            <p class="font-bold text-slate-800">${fechaCorta(u.created_at)}</p>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-2 lg:justify-end lg:w-[22rem]">
          ${yo ? '' : `<label class="sr-only" for="usr-rol-${esc(u.id)}">Rol asignado</label>
          <select id="usr-rol-${esc(u.id)}" data-usr-rol="${esc(u.id)}" class="bg-slate-50 border border-slate-200 rounded-xl px-2 py-2 text-xs font-bold text-slate-900">${opcionesRol(rolPropuesto)}</select>`}
          ${acciones}
        </div>
      </article>`;
  }).join('');
}

async function accionUsuario(accion, id) {
  if (!esGerencia()) { showToast('Solo Gerencia gestiona usuarios.'); return; }
  const u = (state.usuarios || []).find((x) => x.id === id);
  if (!u) return;
  const rolSel = document.querySelector(`[data-usr-rol="${CSS.escape(id)}"]`)?.value;
  let cambios;
  if (accion === 'aprobar') cambios = { estado_aprobacion: 'aprobado', rol: ROLES_VALIDOS.includes(rolSel) ? rolSel : (u.cargo_solicitado || 'arquitecto') };
  else if (accion === 'guardar-rol') cambios = { rol: ROLES_VALIDOS.includes(rolSel) ? rolSel : u.rol };
  else if (accion === 'rechazar') cambios = { estado_aprobacion: 'rechazado' };
  else if (accion === 'suspender') cambios = { estado_aprobacion: 'suspendido' };
  else return;

  const card = document.querySelector(`[data-usr-card="${CSS.escape(id)}"]`);
  card?.querySelectorAll('button,select').forEach((el) => { el.disabled = true; });
  const { data, error } = await supabaseClient.from('usuarios').update(cambios).eq('id', id).select();
  if (error || !data?.length) {
    card?.querySelectorAll('button,select').forEach((el) => { el.disabled = false; });
    showToast(`No se pudo actualizar a ${u.nombre}: ${mensajeError(error, 'sin permiso')}`);
    return;
  }
  Object.assign(u, data[0]);
  actualizarBadgeUsuarios();
  renderUsuarios();
  const textos = {
    aprobar: `${u.nombre} aprobado como ${labelCargo(u.rol)}.`,
    'guardar-rol': `${u.nombre} ahora es ${labelCargo(u.rol)}.`,
    rechazar: `Solicitud de ${u.nombre} rechazada.`,
    suspender: `${u.nombre} fue suspendido.`,
  };
  showToast(textos[accion]);
}

function bindUsuariosEvents() {
  const panel = document.getElementById('tab-usuarios');
  if (!panel) return;
  panel.addEventListener('click', (e) => {
    const filtro = e.target.closest('[data-usr-filtro]');
    if (filtro) {
      state.usuariosFiltro = filtro.dataset.usrFiltro;
      renderUsuarios();
      return;
    }
    const btn = e.target.closest('[data-usr-accion]');
    if (btn) accionUsuario(btn.dataset.usrAccion, btn.dataset.usrId);
    if (e.target.closest('#usuarios-recargar')) cargarUsuarios();
  });
}

/* ==========================================================================
   21c. FINANZAS DEL PROYECTO (subpestaña de la ficha · solo Gerencia)
   ========================================================================== */

function renderFinanzasFicha(p) {
  const pane = document.getElementById('ficha-finanzas');
  if (!pane || !p) return;
  /* Para otros roles no se muestra ni se rellena nada */
  const f = puedeVerFinanzas() ? finanzasDe(p.id) : finanzasVacias();
  CAMPOS_FINANZAS.forEach((c) => {
    const el = document.getElementById(`fin-${c}`);
    if (el) el.value = f[c] ? String(f[c]) : '';
  });
  const notas = document.getElementById('fin-notas');
  if (notas) notas.value = f.notas || '';
  pintarResumenFinanzas(leerFormularioFinanzas());
}

function leerFormularioFinanzas() {
  const f = finanzasVacias();
  CAMPOS_FINANZAS.forEach((c) => { f[c] = numeroSeguro(document.getElementById(`fin-${c}`)?.value); });
  f.notas = document.getElementById('fin-notas')?.value.trim() || '';
  return f;
}

function pintarResumenFinanzas(f) {
  const r = calcularFinanzas(f);
  const set = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
  set('fin-costo-total', cop(r.costoTotal));
  set('fin-utilidad', cop(r.utilidad));
  set('fin-margen', r.margen === null ? '—' : `${r.margen.toFixed(1)}%`);
  set('fin-saldo', cop(r.saldo));
  const util = document.getElementById('fin-utilidad');
  if (util) {
    util.classList.toggle('text-red-600', r.utilidad < 0);
    util.classList.toggle('text-emerald-700', r.utilidad >= 0);
  }
}

function guardarFinanzas() {
  if (!puedeVerFinanzas()) { showToast('Solo Gerencia puede editar las finanzas.'); return; }
  const p = state.proyectos.find((x) => x.id === state.fichaId);
  if (!p) return;
  const actual = finanzasDe(p.id);
  const nuevo = { ...leerFormularioFinanzas(), archivos_privados: actual.archivos_privados || [] };
  state.finanzas = { ...(state.finanzas || {}), [p.id]: nuevo };
  commit();
  showToast(`Finanzas de ${p.name} guardadas.`);
}

function bindFinanzasEvents() {
  const pane = document.getElementById('ficha-finanzas');
  if (!pane) return;
  pane.addEventListener('input', () => pintarResumenFinanzas(leerFormularioFinanzas()));
  document.getElementById('fin-guardar')?.addEventListener('click', guardarFinanzas);
}

function refrescarFichaAbierta() {
  const modal = document.getElementById('modal-ficha');
  if (!state.fichaId || !modal || modal.classList.contains('is-hidden')) return;
  /* Si el usuario está escribiendo en la ficha, no se repinta */
  if (usuarioEditando()) return;
  openFicha(state.fichaId);
}

/* ==========================================================================
   21d. HISTORIAL DEL PROYECTO (tabla historial_eventos · solo lectura)
   ========================================================================== */

function puedeVerHistorial() {
  return ['administrativo', 'operativo', 'secretaria'].includes(state.rol);
}

const ETIQUETAS_CAMPO = {
  cliente: 'Cliente', ciudad: 'Ciudad', fase_actual: 'Fase de producción', etapa_comercial: 'Etapa comercial',
  fecha_entrega: 'Fecha de entrega (BD)', imagen_url: 'Imagen', trazador_responsable: 'Responsable',
  motivo_rechazo: 'Motivo de rechazo', codigo_prj: 'Código', descripcion: 'Descripción', estado: 'Estado',
  actividad: 'Actividad', detalle: 'Detalle', nombre_mueble: 'Mueble / trabajo', carpintero_id: 'Personal',
  es_lider: 'Líder de instalación', nombre: 'Nombre', fase: 'Fase', responsable_id: 'Responsable',
  material: 'Material', categoria: 'Categoría', cantidad: 'Cantidad', unidad: 'Unidad', cantidad_recibida: 'Cantidad recibida',
  proveedor: 'Proveedor', numero_guia: 'Guía', fecha_prometida: 'Fecha prometida', fecha_recibida: 'Fecha de llegada',
  fecha_solicitud: 'Fecha de solicitud', control_calidad: 'Control de calidad',
  tipo: 'Tipo', gravedad: 'Gravedad', accion: 'Plan de acción', responsable: 'Responsable', detiene_produccion: 'Detiene producción',
  fecha_compromiso: 'Fecha compromiso', fecha_cierre: 'Fecha de cierre', solucion: 'Solución', dias_impacto: 'Días de impacto',
  'ficha.incidentes': 'Incidentes', cargo: 'Cargo', activo: 'Activo',
  valor_venta: 'Valor de venta', costo_materiales: 'Costo materiales', costo_mano_obra: 'Costo mano de obra',
  otros_costos: 'Otros costos', anticipo: 'Anticipo', notas: 'Notas', utilidad: 'Utilidad', margen_pct: 'Margen %',
  'ficha.name': 'Nombre del proyecto', 'ficha.muebles': 'Muebles', 'ficha.pedidos': 'Pedidos de material',
  'ficha.bloqueos': 'Bloqueos (antiguo)', 'ficha.dateExpected': 'Fecha de entrega', 'ficha.dateStart': 'Fecha de inicio',
  'ficha.status': 'Estado', 'ficha.detalle': 'Detalle comercial', 'ficha.leadCarpenter': 'Carpintero líder',
  'ficha.arquitecto': 'Arquitecto', 'ficha.logisticOperator': 'Operador logístico', 'ficha.neighborhood': 'Barrio',
  'ficha.address': 'Dirección', 'ficha.phone': 'Teléfono', 'ficha.trimester': 'Trimestre',
  'ficha.archivos': 'Archivos', 'ficha.dropboxFiles': 'Carpeta pública',
  carpeta: 'Carpeta', tipo_mime: 'Formato', tamano_bytes: 'Tamaño',
};
/* Campos técnicos o duplicados que no aportan al lector */
const CAMPOS_OCULTOS = new Set(['id', 'proyecto_id', 'grupo_id', 'fase_manual', 'estado_tarea', 'ficha.alert',
  'ficha.manufacturingPhase', 'ficha.commercialStage', 'ficha.client', 'ficha.image', 'ficha.city', 'archivos_privados',
  'activo_desde', 'descripcion_venta', 'orden', 'legacy_id', 'responsable_nombre', 'pendiente_id', 'creado_por', 'compra_id', 'fecha_apertura', 'ruta', 'subido_por']);
const TABLAS_HIST = {
  proyectos: { label: 'Proyecto', icon: 'fa-folder-open', color: 'bg-slate-900' },
  pendientes: { label: 'Pendiente', icon: 'fa-clipboard-list', color: 'bg-amber-600' },
  tareas_carpintero: { label: 'Tarea', icon: 'fa-hammer', color: 'bg-sky-700' },
  carpinteros: { label: 'Personal', icon: 'fa-id-badge', color: 'bg-violet-700' },
  proyectos_finanzas: { label: 'Finanzas', icon: 'fa-lock', color: 'bg-red-600' },
  proyecto_muebles: { label: 'Mueble', icon: 'fa-couch', color: 'bg-orange-600' },
  compras: { label: 'Compra', icon: 'fa-truck', color: 'bg-teal-700' },
  incidentes: { label: 'Incidente', icon: 'fa-triangle-exclamation', color: 'bg-red-700' },
  documentos: { label: 'Documento', icon: 'fa-file-lines', color: 'bg-indigo-700' },
  usuarios: { label: 'Usuario', icon: 'fa-user-shield', color: 'bg-emerald-700' },
};

function valorHist(clave, v) {
  if (v === null || v === undefined || v === '') return '—';
  if (clave === 'carpintero_id' || clave === 'responsable_id') return (state.carpinteros || []).find((c) => c.id === v)?.nombre || 'Personal eliminado';
  if (clave === 'descripcion') return String(v).replace(/\s*\[[^\]]*\]\s*$/, '');
  if (typeof v === 'boolean') return v ? 'Sí' : 'No';
  if (clave === 'tamano_bytes') return tamanoLegible(Number(v));
  if (typeof v === 'number' && ['valor_venta', 'costo_materiales', 'costo_mano_obra', 'otros_costos', 'anticipo', 'utilidad'].includes(clave)) return cop(v);
  if (Array.isArray(v)) return `${v.length} elemento${v.length === 1 ? '' : 's'}`;
  if (typeof v === 'object') return 'actualizado';
  const t = String(v);
  return t.length > 90 ? `${t.slice(0, 90)}…` : t;
}

/* Muebles, pedidos y bloqueos: qué se agregó, quitó o cambió */
function diffLista(antes, despues) {
  const a = Array.isArray(antes) ? antes : [];
  const d = Array.isArray(despues) ? despues : [];
  const nombre = (x) => x?.name || x?.material || x?.text || x?.descripcion || x?.motivo || x?.id || 'elemento';
  const porId = (lista) => new Map(lista.filter((x) => x && x.id).map((x) => [x.id, x]));
  const ma = porId(a);
  const md = porId(d);
  const lineas = [];
  md.forEach((x, id) => { if (!ma.has(id)) lineas.push(`+ ${nombre(x)}`); });
  ma.forEach((x, id) => { if (!md.has(id)) lineas.push(`− ${nombre(x)}`); });
  md.forEach((x, id) => {
    const y = ma.get(id);
    if (!y) return;
    const cambios = Object.keys({ ...x, ...y })
      .filter((k) => k !== 'id' && JSON.stringify(x[k]) !== JSON.stringify(y[k]) && typeof (x[k] ?? y[k]) !== 'object')
      .map((k) => `${k === 'carpenter' ? 'responsable' : k === 'manufacturingPhase' ? 'fase' : k}: ${valorHist(k, y[k])} → ${valorHist(k, x[k])}`);
    if (cambios.length) lineas.push(`${nombre(x)} · ${cambios.join(', ')}`);
  });
  if (!lineas.length && a.length !== d.length) lineas.push(`${a.length} → ${d.length} elementos`);
  return lineas.slice(0, 8);
}

function lineasCambio(ev) {
  const cambios = ev.cambios || {};
  const claves = Object.keys(cambios).filter((k) => !CAMPOS_OCULTOS.has(k));
  if (ev.accion === 'crear' || ev.accion === 'eliminar') {
    const lado = ev.accion === 'crear' ? 'despues' : 'antes';
    const principal = ['descripcion', 'nombre_mueble', 'material', 'ficha.name', 'nombre', 'cliente']
      .find((k) => cambios[k]?.[lado]);
    const extra = ['tipo', 'gravedad', 'fase', 'actividad', 'detalle', 'carpintero_id', 'responsable_id', 'cantidad', 'proveedor', 'fecha_prometida', 'estado', 'cargo']
      .filter((k) => cambios[k]?.[lado] !== undefined && cambios[k]?.[lado] !== null && cambios[k]?.[lado] !== '')
      .map((k) => `${ETIQUETAS_CAMPO[k] || k}: ${valorHist(k, cambios[k][lado])}`);
    return [principal ? valorHist(principal, cambios[principal][lado]) : '', ...extra].filter(Boolean);
  }
  const out = [];
  claves.forEach((k) => {
    const { antes, despues } = cambios[k] || {};
    if (Array.isArray(antes) || Array.isArray(despues)) {
      diffLista(antes, despues).forEach((l) => out.push(`${ETIQUETAS_CAMPO[k] || k}: ${l}`));
    } else {
      out.push(`${ETIQUETAS_CAMPO[k] || k}: ${valorHist(k, antes)} → ${valorHist(k, despues)}`);
    }
  });
  return out;
}

function fechaHoraHist(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return d.toLocaleString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

async function cargarHistorial(codigo) {
  const lista = document.getElementById('historial-lista');
  if (!lista) return;
  if (!puedeVerHistorial()) { lista.innerHTML = ''; return; }
  if (!sbListo) {
    lista.innerHTML = '<li class="text-slate-400 p-4 text-center">El historial requiere conexión con la base de datos.</li>';
    return;
  }
  lista.innerHTML = '<li class="text-slate-400 p-4 text-center"><i class="fas fa-spinner fa-spin mr-1" aria-hidden="true"></i>Cargando historial…</li>';
  const { data, error } = await supabaseClient
    .from('historial_eventos')
    .select('id,tabla,accion,cambios,motivo,usuario_nombre,usuario_rol,creado_en')
    .eq('codigo_prj', codigo)
    .order('creado_en', { ascending: false })
    .limit(150);
  if (state.fichaId !== codigo) return; /* el usuario ya cambió de ficha */
  if (error) {
    lista.innerHTML = `<li class="text-red-600 font-bold p-4">No se pudo cargar el historial: ${esc(mensajeError(error))}</li>`;
    return;
  }
  const eventos = (data || []).map((ev) => ({ ...ev, lineas: lineasCambio(ev) }))
    .filter((ev) => ev.accion !== 'modificar' || ev.lineas.length || ev.motivo)
    /* Con el módulo contable apagado no se muestran sus movimientos */
    .filter((ev) => MODULO_CONTABLE || (ev.tabla !== 'proyectos_finanzas'
      && !(ev.tabla === 'documentos' && [ev.cambios?.carpeta?.antes, ev.cambios?.carpeta?.despues].includes('financiera'))));
  if (!eventos.length) {
    lista.innerHTML = '<li class="text-slate-400 p-6 text-center border border-dashed border-slate-300 rounded-xl">Aún no hay cambios registrados para este proyecto.</li>';
    return;
  }
  const verbos = { crear: 'creó', modificar: 'modificó', eliminar: 'eliminó' };
  lista.innerHTML = eventos.map((ev) => {
    const t = TABLAS_HIST[ev.tabla] || { label: ev.tabla, icon: 'fa-circle', color: 'bg-slate-500' };
    return `
      <li class="hist-item">
        <span class="hist-dot ${t.color}"><i class="fas ${t.icon}" aria-hidden="true"></i></span>
        <div class="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
          <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <p class="text-slate-800"><strong>${esc(ev.usuario_nombre || 'Desconocido')}</strong>
              <span class="text-slate-500">${esc(verbos[ev.accion] || ev.accion)} ${esc(t.label.toLowerCase())}</span></p>
            <time class="text-[10px] text-slate-400 font-bold" datetime="${esc(ev.creado_en)}">${esc(fechaHoraHist(ev.creado_en))}</time>
          </div>
          ${ev.usuario_rol ? `<p class="text-[10px] text-slate-400 uppercase font-bold">${esc(labelCargo(ev.usuario_rol))}</p>` : ''}
          ${ev.motivo ? `<p class="mt-2 bg-amber-50 border border-amber-200 text-amber-900 rounded-lg px-2 py-1"><i class="fas fa-quote-left text-[9px] mr-1" aria-hidden="true"></i>${esc(ev.motivo)}</p>` : ''}
          ${ev.lineas.length ? `<ul class="mt-2 space-y-0.5 text-slate-700">${ev.lineas.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}
        </div>
      </li>`;
  }).join('');
}

function bindHistorialEvents() {
  document.getElementById('historial-recargar')?.addEventListener('click', () => {
    if (state.fichaId) cargarHistorial(state.fichaId);
  });
}

/* ==========================================================================
   21e. MUEBLES DEL PROYECTO (ficha → Muebles) · Gerencia y Logística
   ========================================================================== */

function abrirMuebleModal(projectId, muebleId) {
  if (!puedeAsignar()) { showToast('Solo Gerencia y Logística gestionan los muebles.'); return; }
  const p = state.proyectos.find((x) => x.id === projectId);
  if (!p) return;
  const m = muebleId ? (p.muebles || []).find((x) => x.id === muebleId) : null;
  state.muebleCtx = { projectId, muebleId: m?.id || null };
  document.getElementById('mueble-title').textContent = m ? 'Editar mueble' : 'Agregar mueble';
  document.getElementById('mueble-sub').textContent = `${p.id} · ${p.name}`;
  document.getElementById('mueble-nombre').value = m?.name || '';
  document.getElementById('mueble-responsable').innerHTML = opcionesPersonal(m?.carpenter || '', 'Sin asignar');
  document.getElementById('mueble-fase').innerHTML = PRODUCTION_PHASES
    .map((f) => `<option value="${esc(f)}" ${f === (m?.manufacturingPhase || 'Recepción') ? 'selected' : ''}>${esc(f)}</option>`).join('');
  document.getElementById('mueble-actividad').innerHTML = ACTIVIDADES
    .map((a) => `<option value="${esc(a.v)}" ${a.v === (m?.actividad || 'Armando') ? 'selected' : ''}>${esc(a.v)}</option>`).join('');
  document.getElementById('mueble-detalle').value = m?.detalle || '';
  document.getElementById('mueble-eliminar').classList.toggle('hidden', !m);
  document.getElementById('mueble-modal').classList.remove('is-hidden');
  setTimeout(() => document.getElementById('mueble-nombre')?.focus(), 40);
}

function cerrarMuebleModal() {
  document.getElementById('mueble-modal')?.classList.add('is-hidden');
  state.muebleCtx = null;
}

function guardarMueble() {
  if (!puedeAsignar()) return;
  const ctx = state.muebleCtx;
  const p = state.proyectos.find((x) => x.id === ctx?.projectId);
  if (!p) return;
  const nombre = document.getElementById('mueble-nombre').value.trim().replace(/\s+/g, ' ');
  if (!nombre) { showToast('Escribe el nombre del mueble.'); document.getElementById('mueble-nombre').focus(); return; }
  const datos = {
    name: nombre,
    carpenter: document.getElementById('mueble-responsable').value,
    manufacturingPhase: document.getElementById('mueble-fase').value,
    actividad: document.getElementById('mueble-actividad').value,
    detalle: document.getElementById('mueble-detalle').value.trim(),
  };
  datos.status = datos.manufacturingPhase;
  p.muebles = p.muebles || [];
  if (ctx.muebleId) {
    const m = p.muebles.find((x) => x.id === ctx.muebleId);
    if (!m) return;
    Object.assign(m, datos);
  } else {
    p.muebles.push(normalizarMueble({ id: nuevoUUID(), ...datos }, p.muebles.length));
  }
  p.commercialDetail = detalleProyecto(p);
  commit();
  cerrarMuebleModal();
  openFicha(p.id);
  mostrarSubFicha('muebles');
  showToast(ctx.muebleId ? `${nombre} actualizado.` : `${nombre} agregado a ${p.id}.`);
}

function eliminarMueble() {
  if (!puedeAsignar()) return;
  const ctx = state.muebleCtx;
  const p = state.proyectos.find((x) => x.id === ctx?.projectId);
  const m = (p?.muebles || []).find((x) => x.id === ctx?.muebleId);
  if (!p || !m) return;
  if (!window.confirm(`¿Eliminar el mueble "${m.name}" de ${p.id}? Quedará registrado en el historial.`)) return;
  p.muebles = p.muebles.filter((x) => x.id !== m.id);
  commit();
  cerrarMuebleModal();
  openFicha(p.id);
  mostrarSubFicha('muebles');
  showToast(`${m.name} eliminado.`);
}

function bindMueblesEvents() {
  document.getElementById('mueble-agregar')?.addEventListener('click', () => {
    if (state.fichaId) abrirMuebleModal(state.fichaId, null);
  });
  document.getElementById('mueble-guardar')?.addEventListener('click', guardarMueble);
  document.getElementById('mueble-eliminar')?.addEventListener('click', eliminarMueble);
  document.getElementById('mueble-cancelar')?.addEventListener('click', cerrarMuebleModal);
  document.getElementById('mueble-nombre')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); guardarMueble(); } });
  document.getElementById('ficha-muebles-list')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-mueble-edit]');
    if (btn && state.fichaId) abrirMuebleModal(state.fichaId, btn.dataset.muebleEdit);
  });
}

/* ==========================================================================
   21f. INCIDENTES (ficha → Incidentes) · antes "Bloqueos"
   Reportan y gestionan Gerencia, Logística y Secretaría; Arquitecto consulta.
   ========================================================================== */

function puedeGestionarIncidentes() {
  return ['administrativo', 'operativo', 'secretaria'].includes(state.rol);
}

const ORDEN_GRAVEDAD = { Crítica: 0, Alta: 1, Media: 2, Baja: 3 };

function ordenarIncidentes(lista) {
  return lista.slice().sort((a, b) => (Number(incidenteAbierto(b)) - Number(incidenteAbierto(a)))
    || (Number(incidenteVencido(b)) - Number(incidenteVencido(a)))
    || (ORDEN_GRAVEDAD[a.gravedad] - ORDEN_GRAVEDAD[b.gravedad])
    || String(a.fechaApertura).localeCompare(String(b.fechaApertura)));
}

function badgeGravedad(g) {
  return `<span class="inline-block px-2 py-0.5 rounded-full border text-[10px] font-black ${ESTILO_GRAVEDAD[g] || ESTILO_GRAVEDAD.Media}">${esc(g)}</span>`;
}

function tarjetaIncidenteHTML(p, x) {
  const abierto = incidenteAbierto(x);
  const vencido = incidenteVencido(x);
  const compra = x.compraId ? (p.pedidos || []).find((od) => od.id === x.compraId) : null;
  const borde = !abierto ? 'border-slate-200 bg-slate-50' : (x.gravedad === 'Crítica' || vencido ? 'border-red-300 bg-red-50' : 'border-amber-200 bg-amber-50/60');
  return `
    <article class="p-4 border rounded-xl text-xs ${borde}">
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div class="flex flex-wrap items-center gap-1.5">
          ${badgeGravedad(x.gravedad)}
          <span class="text-[10px] font-black uppercase text-slate-500">${esc(x.tipo)}</span>
          ${x.detiene && abierto ? '<span class="text-[10px] font-black uppercase bg-slate-900 text-white rounded px-1.5 py-0.5"><i class="fas fa-hand mr-1" aria-hidden="true"></i>Detiene producción</span>' : ''}
          ${vencido ? '<span class="text-[10px] font-black uppercase text-red-700">Compromiso vencido</span>' : ''}
        </div>
        <div class="flex items-center gap-2">
          <span class="text-[10px] font-black uppercase ${abierto ? 'text-amber-800' : 'text-emerald-700'}">${esc(x.estado)}</span>
          ${puedeGestionarIncidentes() ? `<button type="button" class="task-icon-btn" data-incidente-editar="${esc(x.id)}" title="Actualizar incidente" aria-label="Actualizar incidente"><i class="fas fa-pen" aria-hidden="true"></i></button>` : ''}
        </div>
      </div>
      <p class="font-bold text-slate-900 mt-2 ${abierto ? '' : 'line-through decoration-slate-400'}">${esc(x.descripcion)}</p>
      ${compra ? `<p class="text-[10px] text-teal-800 mt-1"><i class="fas fa-truck mr-1" aria-hidden="true"></i>Compra: ${esc(compra.item)} · ${esc(compra.supplier)}</p>` : ''}
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2 text-[11px]">
        <div><p class="text-[9px] uppercase font-black text-slate-400">Responsable</p><p class="font-bold text-slate-800">${esc(x.responsable || 'Sin asignar')}</p></div>
        <div><p class="text-[9px] uppercase font-black text-slate-400">Compromiso</p><p class="font-bold ${vencido ? 'text-red-700' : 'text-slate-800'}">${x.fechaCompromiso ? esc(formatFechaLarga(parseFecha(x.fechaCompromiso))) : '—'}</p></div>
        <div><p class="text-[9px] uppercase font-black text-slate-400">${abierto ? 'Abierto hace' : 'Duró'}</p><p class="font-bold text-slate-800">${diasAbiertoIncidente(x)} d</p></div>
        <div><p class="text-[9px] uppercase font-black text-slate-400">Impacto entrega</p><p class="font-bold ${x.diasImpacto ? 'text-red-700' : 'text-slate-800'}">${x.diasImpacto ? `+${esc(Number(x.diasImpacto) || 0)} d` : '—'}</p></div>
      </div>
      ${x.accion ? `<p class="mt-2 text-slate-700"><span class="font-bold">Plan:</span> ${esc(x.accion)}</p>` : ''}
      ${!abierto && x.solucion ? `<p class="mt-2 text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-lg px-2 py-1"><span class="font-bold">Solución:</span> ${esc(x.solucion)}</p>` : ''}
    </article>`;
}

function renderIncidentesFicha(p) {
  const box = document.getElementById('ficha-incidentes-list');
  if (!box) return;
  document.getElementById('incidente-agregar')?.classList.toggle('hidden', !puedeGestionarIncidentes());
  const lista = ordenarIncidentes(p.incidentes || []);
  const abiertos = lista.filter(incidenteAbierto).length;
  const badge = document.getElementById('ficha-incidentes-badge');
  if (badge) { badge.textContent = String(abiertos); badge.classList.toggle('hidden', !abiertos); }
  const impacto = lista.filter(incidenteAbierto).reduce((acc, x) => acc + (x.diasImpacto || 0), 0);
  box.innerHTML = (impacto ? `<p class="text-xs font-bold text-red-800 bg-red-50 border border-red-200 rounded-xl px-3 py-2"><i class="fas fa-calendar-xmark mr-1" aria-hidden="true"></i>Los incidentes abiertos podrían retrasar la entrega unos ${impacto} días (fecha actual: ${esc(p.dateExpected)}).</p>` : '')
    + (lista.length ? lista.map((x) => tarjetaIncidenteHTML(p, x)).join('')
      : '<p class="text-xs text-slate-400 text-center py-6">Sin incidentes registrados.</p>');
}

/* El proyecto queda "Detenido" mientras haya incidentes abiertos que lo detengan */
function aplicarDetencion(p, habiaDetencion) {
  const hayDetencion = (p.incidentes || []).some((x) => incidenteAbierto(x) && x.detiene);
  if (hayDetencion && p.status !== EST_PRODUCCION.COMPLETADO && p.status !== EST_PRODUCCION.DETENIDO) {
    p.status = EST_PRODUCCION.DETENIDO;
    return 'El proyecto quedó DETENIDO hasta resolver el incidente.';
  }
  if (habiaDetencion && !hayDetencion && p.status === EST_PRODUCCION.DETENIDO) {
    p.status = EST_PRODUCCION.EN_PROCESO;
    return 'Sin incidentes que lo detengan: el proyecto vuelve a En proceso.';
  }
  return '';
}

/* Resolver/reabrir un incidente ligado a una compra mueve la calidad de la
   compra y su pendiente (igual que los triggers de la v7). */
function reflejarIncidenteEnCompra(p, x, estabaAbierto) {
  const od = x.compraId ? (p.pedidos || []).find((c) => c.id === x.compraId) : null;
  if (!od) return;
  const antesCerrada = compraCerrada(od);
  if (estabaAbierto && !incidenteAbierto(x) && od.qc === 'Con novedad') od.qc = 'Aprobado';
  if (!estabaAbierto && incidenteAbierto(x) && od.qc !== 'Con novedad') od.qc = 'Con novedad';
  sincronizarPendienteCompraLocal(p, od, antesCerrada);
}

function sincronizarPendienteCompraLocal(p, od, antesCerrada) {
  const pend = (p.pendientes || []).find((x) => x.id === od.pendienteId);
  if (!pend) return;
  const ahoraCerrada = compraCerrada(od);
  if (ahoraCerrada && !antesCerrada) pend.estado = 'Resuelto';
  if (!ahoraCerrada && antesCerrada) pend.estado = 'Pendiente';
}

function responsablesSugeridos() {
  const set = new Set([...personalActivo().map((c) => c.nombre), ...proveedoresConocidos(), 'Gerencia', 'Logística', 'Secretaría', 'Arquitecto', 'Cliente']);
  return [...set];
}

function abrirIncidenteModal(projectId, incidenteId, prefill = null) {
  if (!puedeGestionarIncidentes()) { showToast('Tu rol solo puede consultar los incidentes.'); return; }
  const p = state.proyectos.find((x) => x.id === projectId);
  if (!p) return;
  const x = incidenteId ? (p.incidentes || []).find((i) => i.id === incidenteId) : null;
  const d = x || prefill || {};
  state.incidenteCtx = { projectId, incidenteId: x?.id || null, compraId: d.compraId || null };
  const opts = (lista, actual) => lista.map((v) => `<option value="${esc(v)}" ${v === actual ? 'selected' : ''}>${esc(v)}</option>`).join('');
  document.getElementById('incidente-title').textContent = x ? 'Actualizar incidente' : 'Reportar incidente';
  document.getElementById('incidente-sub').textContent = `${p.id} · ${p.name}`;
  document.getElementById('incidente-tipo').innerHTML = opts(TIPOS_INCIDENTE, d.tipo || 'Otro');
  document.getElementById('incidente-gravedad').innerHTML = opts(GRAVEDADES_INCIDENTE, d.gravedad || 'Media');
  document.getElementById('incidente-descripcion').value = d.descripcion || '';
  document.getElementById('incidente-detiene').checked = Boolean(d.detiene);
  document.getElementById('incidente-responsable').value = d.responsable || '';
  document.getElementById('incidente-responsables-list').innerHTML = responsablesSugeridos().map((n) => `<option value="${esc(n)}"></option>`).join('');
  document.getElementById('incidente-compromiso').value = d.fechaCompromiso || '';
  document.getElementById('incidente-accion').value = d.accion || '';
  document.getElementById('incidente-impacto').value = d.diasImpacto || 0;
  document.getElementById('incidente-estado').innerHTML = opts(ESTADOS_INCIDENTE, d.estado || 'Abierto');
  document.getElementById('incidente-solucion').value = d.solucion || '';
  document.getElementById('incidente-estado-box').classList.toggle('hidden', !x);
  pintarSolucionIncidente();
  document.getElementById('incidente-modal').classList.remove('is-hidden');
  setTimeout(() => document.getElementById('incidente-descripcion')?.focus(), 40);
}

function pintarSolucionIncidente() {
  const resuelto = document.getElementById('incidente-estado').value === 'Resuelto';
  document.getElementById('incidente-solucion-box').classList.toggle('hidden', !resuelto);
}

function cerrarIncidenteModal() {
  document.getElementById('incidente-modal')?.classList.add('is-hidden');
  state.incidenteCtx = null;
}

function guardarIncidente() {
  const ctx = state.incidenteCtx;
  const p = state.proyectos.find((x) => x.id === ctx?.projectId);
  if (!p) return;
  const descripcion = document.getElementById('incidente-descripcion').value.trim();
  const estado = ctx.incidenteId ? document.getElementById('incidente-estado').value : 'Abierto';
  const solucion = document.getElementById('incidente-solucion').value.trim();
  const impacto = Math.max(0, Math.round(Number(document.getElementById('incidente-impacto').value) || 0));
  if (!descripcion) { showToast('Describe qué pasó.'); document.getElementById('incidente-descripcion').focus(); return; }
  if (estado === 'Resuelto' && !solucion) { showToast('Escribe cómo se resolvió el incidente.'); document.getElementById('incidente-solucion').focus(); return; }

  const habiaDetencion = (p.incidentes || []).some((x) => incidenteAbierto(x) && x.detiene);
  const datos = {
    tipo: document.getElementById('incidente-tipo').value,
    gravedad: document.getElementById('incidente-gravedad').value,
    descripcion,
    detiene: document.getElementById('incidente-detiene').checked,
    responsable: document.getElementById('incidente-responsable').value.trim(),
    fechaCompromiso: document.getElementById('incidente-compromiso').value || null,
    accion: document.getElementById('incidente-accion').value.trim(),
    diasImpacto: impacto,
    estado,
    solucion: estado === 'Resuelto' ? solucion : (solucion || ''),
  };
  p.incidentes = p.incidentes || [];
  let x;
  let estabaAbierto = true;
  if (ctx.incidenteId) {
    x = p.incidentes.find((i) => i.id === ctx.incidenteId);
    if (!x) return;
    estabaAbierto = incidenteAbierto(x);
    Object.assign(x, datos);
    x.fechaCierre = estado === 'Resuelto' ? (x.fechaCierre || new Date().toISOString()) : null;
  } else {
    x = normalizarIncidente({ id: uid(), ...datos, fechaApertura: new Date().toISOString(), compraId: ctx.compraId }, p.incidentes.length);
    p.incidentes.push(x);
  }
  reflejarIncidenteEnCompra(p, x, estabaAbierto);
  const avisoDetencion = aplicarDetencion(p, habiaDetencion);
  commit();
  refrescarPendientesProyecto(p.id);
  cerrarIncidenteModal();
  if (state.fichaId === p.id) { openFicha(p.id); mostrarSubFicha('incidentes'); }
  renderSeguimientoCompras();
  showToast(`${ctx.incidenteId ? 'Incidente actualizado' : 'Incidente reportado'}${avisoDetencion ? `. ${avisoDetencion}` : '.'}`);
}

function bindIncidentesEvents() {
  document.getElementById('incidente-agregar')?.addEventListener('click', () => {
    if (state.fichaId) abrirIncidenteModal(state.fichaId, null);
  });
  document.getElementById('ficha-incidentes-list')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-incidente-editar]');
    if (btn && state.fichaId) abrirIncidenteModal(state.fichaId, btn.dataset.incidenteEditar);
  });
  document.getElementById('incidente-estado')?.addEventListener('change', pintarSolucionIncidente);
  document.getElementById('incidente-guardar')?.addEventListener('click', guardarIncidente);
  document.getElementById('incidente-cancelar')?.addEventListener('click', cerrarIncidenteModal);
}

/* ==========================================================================
   22. INICIALIZACIÓN
   ========================================================================== */

/* ==========================================================================
   22. APP MÓVIL · PWA (web instalable) y Capacitor (iOS / Android)
   --------------------------------------------------------------------------
   Capacitor inyecta window.Capacitor en la app nativa; en el navegador no
   existe, así que todo esto es inofensivo en la versión web.
   ========================================================================== */

const URL_WEB_PUBLICA = 'https://modugal-app.pages.dev/';

function esAppNativa() {
  return !!window.Capacitor?.isNativePlatform?.();
}

function pluginNativo(nombre) {
  return esAppNativa() ? window.Capacitor?.Plugins?.[nombre] : null;
}

/* Enlaces externos y archivos: en la app nativa se abren en el navegador del
   sistema (el visor interno de Android no muestra PDF ni descarga archivos). */
async function abrirEnlaceExterno(url) {
  const browser = pluginNativo('Browser');
  if (browser) {
    try { await browser.open({ url }); return; } catch (e) { console.warn('[MODUGAL] Browser.open', e); }
  }
  window.open(url, '_blank', 'noopener');
}

/* Cierra el modal o panel visible de más arriba. Devuelve true si cerró algo. */
function cerrarCapaSuperior() {
  const visibles = [...document.querySelectorAll('#modal-ficha, [id$="-modal"].fixed')]
    .filter((m) => !m.classList.contains('is-hidden') && getComputedStyle(m).display !== 'none')
    .map((m, i) => ({ m, i, z: parseInt(getComputedStyle(m).zIndex, 10) || 0 }))
    /* Arriba = mayor z-index; si empatan, el que está después en la página */
    .sort((a, b) => (b.z - a.z) || (b.i - a.i));
  const capa = visibles[0]?.m;
  if (capa) {
    const boton = capa.querySelector('[id$="-cancelar"], [id$="-close"], [id$="-cerrar"]');
    if (boton) boton.click(); else capa.classList.add('is-hidden');
    return true;
  }
  const chat = document.getElementById('chat-panel');
  if (chat?.classList.contains('open')) { document.getElementById('chat-close')?.click(); return true; }
  return false;
}

function iniciarAppMovil() {
  const nativa = esAppNativa();
  document.documentElement.classList.toggle('app-nativa', nativa);

  /* Tecla Esc en escritorio = botón atrás en Android: cierran la capa de arriba */
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !e.defaultPrevented) cerrarCapaSuperior();
  });

  if (nativa) {
    const app = pluginNativo('App');
    app?.addListener?.('backButton', () => {
      if (cerrarCapaSuperior()) return;
      if (state.tab && state.tab !== 'produccion' && tabsPermitidos().includes('produccion')) { switchTab('produccion'); return; }
      app.minimizeApp?.();
    });
    /* Al volver a la app después de un rato, se traen los cambios de otros */
    app?.addListener?.('appStateChange', ({ isActive }) => {
      if (isActive && sbListo && state.user) programarRecargaRemota();
    });
    /* Enlaces que abrirían otra pestaña → navegador del sistema */
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a[target="_blank"]');
      if (!a || !a.href) return;
      e.preventDefault();
      abrirEnlaceExterno(a.href);
    });
    return;
  }

  /* Versión web: service worker para poder instalarla como app (PWA) */
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || local)) {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('[MODUGAL] Service worker:', e));
  }
}

async function init() {
  limpiarClavesLegadas();
  state.tema = localStorage.getItem(TEMA_KEY) || 'claro';
  aplicarTema();

  bindLoginEvents();
  bindHeaderEvents();
  bindTabsEvents();
  bindProduccionEvents();
  bindProyectosEvents();
  bindComercialEvents();
  bindCentroEvents();
  bindFichaEvents();
  bindModalsEvents();
  bindGlobalDelegation();
  bindDragAndDrop();
  bindChatEvents();
  bindUsuariosEvents();
  bindEquipoEvents();
  bindEstadoSync();
  bindHistorialEvents();
  bindMueblesEvents();
  bindComprasEvents();
  bindIncidentesEvents();
  bindFinanzasEvents();
  iniciarAppMovil();
  iniciarComboCiudad();
  iniciarValidacionFormularios();
  if (sesionInactiva()) await supabaseClient.auth.signOut();
  registrarActividad();
  vigilarInactividad();
  /* Filtros de Estadísticas */
  [['stats-anio', 'anio'], ['stats-q', 'q'], ['stats-proyecto', 'proyecto']].forEach(([id, clave]) => {
    document.getElementById(id)?.addEventListener('change', (e) => {
      state.statsFiltro = { ...(state.statsFiltro || { anio: 'Todos', q: 'Todos', proyecto: 'Todos' }), [clave]: e.target.value };
      renderStats();
    });
  });
  /* Los relojes ("asignada hace…") se refrescan cada minuto en la pestaña visible */
  setInterval(() => {
    if (document.hidden || !state.user) return;
    if (state.tab === 'equipo') renderEquipo();
    if (state.tab === 'stats') renderStats();
  }, 60000);

  /* Sin sesión no se muestra ni se consulta ningún dato */
  aplicarPermisosUI();
  updateUserChip();
  renderAll();
  switchTab('produccion');
  mostrarLogin();

  escucharAuth();

  /* Sesión activa (el SDK la guarda y la renueva sola) */
  const { data, error } = await supabaseClient.auth.getSession();
  if (error) console.warn('[MODUGAL] getSession:', error);
  if (data?.session?.user) {
    if (enRecuperacion()) exigirNuevaContrasena();
    else await entrarConSesion(data.session.user);
  }
}

document.addEventListener('DOMContentLoaded', init);