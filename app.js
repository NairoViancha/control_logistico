/* ==========================================================================
   MODUGAL - espacios renovados · app.js
   --------------------------------------------------------------------------
   Plataforma SaaS B2B de fabricación de cocinas integrales y mobiliario
   de alta gama.

   Módulos:
     1. Estado global + datos mock + persistencia (localStorage)
     2. Stepper de 6 fases (PRODUCTION_PHASES)
     3. Tablero de Producción (KPIs + tarjetas + filtros)
     4. Equipo & Asignaciones
     5. Seguimiento Comercial (Kanban + trimestre)
     6. Estadísticas & Rendimiento
     7. Registro de Pedidos / Compras
     8. Modal Ficha de Proyecto (5 subpestañas)
     9. Asistente IA / Bot de WhatsApp
    10. Inicialización
   ========================================================================== */

'use strict';

/* ==========================================================================
   1. CONSTANTES DE NEGOCIO
   ========================================================================== */

const PRODUCTION_PHASES = ['Recepción', 'Asignación', 'Armado', 'Presentación', 'Embalaje', 'Despacho'];

const EST_PRODUCCION = { EN_PROCESO: 'En proceso', DETENIDO: 'Detenido', COMPLETADO: 'Completado' };

const ETAPAS_COMERCIAL = ['Prospectos', 'Cotizaciones', 'Aprobados', 'En Fabricación', 'Instalaciones', 'Garantías'];

const STAGES_STATS = [
  { phase: 'Diseño & Trazos', days: '3.2 Días', label: 'Óptimo', color: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  { phase: 'Corte de Tableros', days: '2.5 Días', label: 'Óptimo', color: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  { phase: 'Fabricación & Armado', days: '8.4 Días', label: 'Cuello de Botella', color: 'border-red-200 bg-red-50 text-red-800' },
  { phase: 'Instalación Final', days: '4.1 Días', label: 'Normal', color: 'border-slate-200 bg-slate-50 text-slate-800' },
];

const ROLES = ['gerencia', 'arquitecto', 'carpintero'];
const STORAGE_KEY = 'modugal_estado_v1';
const ROL_KEY = 'modugal_rol';

/* ==========================================================================
   2. ESTADO GLOBAL
   ========================================================================== */

const state = {
  proyectos: [],
  comercial: [],
  rol: 'gerencia',
  tab: 'produccion',
  fProduccion: 'todos',
  search: '',
  quarter: 'Q4 - 2026',
  fichaId: null,
  fichaSub: 'resumen',
  newOrder: { projectId: '', category: '', item: '', supplier: '', guide: '', expectedDate: '' },
};

/* ==========================================================================
   3. DATOS MOCK (PROYECTOS + PROSPECTOS COMERCIALES)
   ========================================================================== */

function seed() {
  return {
    proyectos: [
      {
        id: 'PRJ-001',
        name: 'Martha Pinos',
        client: 'Martha Pinos',
        city: 'Floridablanca',
        neighborhood: 'Ruitoque Condominio',
        address: 'Calle de los Caracoles, Casa 14',
        phone: '+57 315 890 1234',
        phase: 'Fabricación',
        manufacturingPhase: 'Armado',
        status: 'Detenido',
        commercialStage: 'En Fabricación',
        trimester: 'Q4 - 2026',
        budget: 18500000,
        alert: 'Falta Herrajes Blum y Mesón Quarztone',
        leadCarpenter: 'Edwin San Gil',
        logisticOperator: 'Wilyer',
        dateStart: '15 Oct 2026',
        dateExpected: '20 Nov 2026',
        image: 'https://images.unsplash.com/photo-1556910103-1c02745a872e?auto=format&fit=crop&w=1200&q=80',
        muebles: [
          { id: 'm1', name: 'Cocina - Mueble Bajo e Isla', carpenter: 'Edwin San Gil', status: 'Fabricación', manufacturingPhase: 'Armado' },
          { id: 'm2', name: 'Cocina - Alacena y Mueble Alto', carpenter: 'Faber Contreras', status: 'Corte', manufacturingPhase: 'Recepción' },
          { id: 'm3', name: 'Mueble de Baño Principal', carpenter: 'Carlos Martinez', status: 'Completado', manufacturingPhase: 'Despacho' },
        ],
        pedidos: [
          { id: 'p1', category: 'Herrajes', item: 'Sistema de correderas integradas Blum', supplier: 'Serviherrajes', guide: 'GUI-88912', expected: '05 Nov 2026', status: 'En tránsito', qc: 'Pendiente' },
          { id: 'p2', category: 'Mesón', item: 'Cuarzo Blanco Estelar 2cm', supplier: 'Marmolería del Norte', guide: 'GUI-99210', expected: '02 Nov 2026', status: 'Solicitado', qc: 'Pendiente' },
          { id: 'p3', category: 'Madecor', item: 'Madecor Roble Cava 15mm 10 tableros', supplier: 'Pelíkano / Primadera', guide: 'GUI-44120', expected: '28 Oct 2026', status: 'Bodega', qc: 'Aprobado' },
        ],
        bloqueos: [
          { id: 'b1', reason: 'Retraso en importación de herrajes Blum por el proveedor', responsible: 'Serviherrajes', date: '01 Nov 2026', solved: false, action: 'Se contactó a proveedor secundario para préstamo de stock' },
        ],
        dropboxFiles: {
          publicFiles: [
            { name: 'Render_Cocina_MarthaPinos_v3.jpg', type: 'image', size: '4.2 MB', date: '16 Oct 2026' },
            { name: 'Plano_Arquitectonico_Despieces_v2.pdf', type: 'pdf', size: '12.8 MB', date: '18 Oct 2026' },
            { name: 'Presentacion_Cliente_Acabados.pdf', type: 'pdf', size: '8.1 MB', date: '15 Oct 2026' },
          ],
          privateFiles: [
            { name: 'Cotizacion_Final_Aprobada_Precios.pdf', type: 'pdf', size: '1.2 MB', date: '14 Oct 2026' },
            { name: 'Margen_Rentabilidad_y_Costos_Materiales.xlsx', type: 'excel', size: '540 KB', date: '15 Oct 2026' },
            { name: 'Comprobantes_Pago_Nomina_Carpinteros.pdf', type: 'pdf', size: '2.4 MB', date: '30 Oct 2026' },
          ],
        },
      },
      {
        id: 'PRJ-002',
        name: 'Edwin San Gil',
        client: 'Familia San Gil',
        city: 'San Gil',
        neighborhood: 'Zona Centro',
        address: 'Carrera 9 #11-45',
        phone: '+57 318 456 7890',
        phase: 'Trazos',
        manufacturingPhase: 'Asignación',
        status: 'En proceso',
        commercialStage: 'En Fabricación',
        trimester: 'Q4 - 2026',
        budget: 12000000,
        alert: '',
        leadCarpenter: 'Faber Contreras',
        logisticOperator: 'Wilyer',
        dateStart: '25 Oct 2026',
        dateExpected: '10 Dec 2026',
        image: 'https://images.unsplash.com/photo-1556909212-d5b604d0c14d?auto=format&fit=crop&w=1200&q=80',
        muebles: [
          { id: 'm4', name: 'Cocina Integral Lineal', carpenter: 'Faber Contreras', status: 'Trazos', manufacturingPhase: 'Asignación' },
        ],
        pedidos: [
          { id: 'p4', category: 'Madecor', item: 'Madecor Gris Nube 18mm', supplier: 'Districondor', guide: 'GUI-11029', expected: '08 Nov 2026', status: 'Bodega', qc: 'Aprobado' },
        ],
        bloqueos: [],
        dropboxFiles: {
          publicFiles: [
            { name: 'Render_Cocina_SanGil.jpg', type: 'image', size: '3.8 MB', date: '26 Oct 2026' },
            { name: 'Planimetria_Trazos.pdf', type: 'pdf', size: '9.4 MB', date: '27 Oct 2026' },
          ],
          privateFiles: [
            { name: 'Presupuesto_Interno_SanGil.xlsx', type: 'excel', size: '410 KB', date: '25 Oct 2026' },
          ],
        },
      },
      {
        id: 'PRJ-003',
        name: 'Silvia Carrara',
        client: 'Silvia Carrara',
        city: 'Bucaramanga',
        neighborhood: 'Cabecera del Llano',
        address: 'Calle 48 #34-12, Apto 802',
        phone: '+57 300 123 4567',
        phase: 'Despacho',
        manufacturingPhase: 'Embalaje',
        status: 'En proceso',
        commercialStage: 'En Fabricación',
        trimester: 'Q4 - 2026',
        budget: 8200000,
        alert: 'Coordinar flete especial',
        leadCarpenter: 'Edwin San Gil',
        logisticOperator: 'Wilyer',
        dateStart: '01 Oct 2026',
        dateExpected: '08 Nov 2026',
        image: 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=1200&q=80',
        muebles: [
          { id: 'm5', name: 'Mueble de Televisión Sala', carpenter: 'Edwin San Gil', status: 'Embalado', manufacturingPhase: 'Embalaje' },
          { id: 'm6', name: 'Juego de Puertas Entambadas (6 un)', carpenter: 'Carlos Martinez', status: 'Despacho', manufacturingPhase: 'Despacho' },
        ],
        pedidos: [
          { id: 'p5', category: 'Vidrios', item: 'Espejos bronce 4mm con bisel', supplier: 'Vidrios Santander', guide: 'GUI-77123', expected: '30 Oct 2026', status: 'Entregado', qc: 'Aprobado' },
        ],
        bloqueos: [],
        dropboxFiles: {
          publicFiles: [
            { name: 'Diseño_Mobiliario_SilviaCarrara.pdf', type: 'pdf', size: '15.1 MB', date: '02 Oct 2026' },
          ],
          privateFiles: [
            { name: 'Facturacion_y_Pagos_Recibidos.pdf', type: 'pdf', size: '2.1 MB', date: '01 Oct 2026' },
          ],
        },
      },
      {
        id: 'PRJ-004',
        name: 'Cocina Claudia',
        client: 'Claudia Ruitoque',
        city: 'Floridablanca',
        neighborhood: 'Ruitoque Country Club',
        address: 'Condominio El Roble, Lote 45',
        phone: '+57 316 777 8899',
        phase: 'Instalación',
        manufacturingPhase: 'Despacho',
        status: 'Completado',
        commercialStage: 'Instalaciones',
        trimester: 'Q3 - 2026',
        budget: 24000000,
        alert: '',
        leadCarpenter: 'Carlos Martinez',
        logisticOperator: 'Wilyer',
        dateStart: '10 Sep 2026',
        dateExpected: '30 Oct 2026',
        image: 'https://images.unsplash.com/photo-1556912172-45b73e51f847?auto=format&fit=crop&w=1200&q=80',
        muebles: [
          { id: 'm7', name: 'Cocina Integral Premium + Torre de Calores', carpenter: 'Carlos Martinez', status: 'Completado', manufacturingPhase: 'Despacho' },
        ],
        pedidos: [],
        bloqueos: [],
        dropboxFiles: {
          publicFiles: [
            { name: 'Fotos_Finales_Instalacion.pdf', type: 'pdf', size: '22.4 MB', date: '30 Oct 2026' },
          ],
          privateFiles: [
            { name: 'Liquidacion_Proyecto_Claudia.pdf', type: 'pdf', size: '1.8 MB', date: '30 Oct 2026' },
          ],
        },
      },
    ],
    comercial: [
      { id: 'COM-005', cliente: 'Dr. Fernando Lopez', etapa: 'Cotizaciones', trimester: 'Q4 - 2026', budget: 35000000, status: 'En proceso', dateExpected: 'Por definir', proyectoId: null, alert: 'Esperando aprobación de diseño 3D' },
      { id: 'COM-006', cliente: 'Camila Reyes', etapa: 'Prospectos', trimester: 'Q1 - 2027', budget: 14500000, status: 'En proceso', dateExpected: 'Por definir', proyectoId: null, alert: 'Visita técnica programada para el viernes' },
    ],
  };
}

function cargarEstado() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data && Array.isArray(data.proyectos) && Array.isArray(data.comercial)) {
        return { proyectos: data.proyectos, comercial: data.comercial };
      }
    }
  } catch (e) {
    console.warn('[MODUGAL] Error leyendo localStorage, se usa datos semilla.', e);
  }
  const s = seed();
  return { proyectos: s.proyectos, comercial: s.comercial };
}

function guardarEstado() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ proyectos: state.proyectos, comercial: state.comercial }));
}

function generarId(prefix) {
  const nums = state.proyectos.map((p) => parseInt(String(p.id).replace(/\D/g, ''), 10)).filter((n) => !isNaN(n));
  const max = nums.length ? Math.max(...nums) : 1000;
  return `${prefix}-${max + 1}`;
}

/* ==========================================================================
   4. UTILIDADES
   ========================================================================== */

function hoyStr() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function parseFecha(str) {
  if (!str) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    const d = new Date(`${str}T00:00:00`);
    return isNaN(d.getTime()) ? null : d;
  }
  const m = String(str).match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (!m) return null;
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const mes = meses.indexOf(m[2].toLowerCase());
  if (mes < 0) return null;
  const d = new Date(parseInt(m[3], 10), mes, parseInt(m[1], 10));
  return isNaN(d.getTime()) ? null : d;
}

function fmtMoney(m) {
  return '$' + Number(m || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function esc(str) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(str ?? '').replace(/[&<>"']/g, (c) => map[c]);
}

/* ==========================================================================
   5. ASISTENTE IA / BOT DE WHATSAPP
   ========================================================================== */

function pushMensaje(autor, texto) {
  const container = document.getElementById('chat-messages');
  const msg = document.createElement('div');
  msg.className = `chat-msg ${autor === 'user' ? 'chat-msg--user' : 'chat-msg--bot'}`;
  msg.textContent = texto;
  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;
}

function generarRespuestaBot(texto) {
  const q = texto.toLowerCase();

  if (/hoy|entrega|entregar|despacho|despachar|entregas/i.test(q)) {
    const hoy = new Date();
    const entregasHoy = state.proyectos.filter((p) => {
      const d = parseFecha(p.dateExpected);
      return d && d.getFullYear() === hoy.getFullYear() && d.getMonth() === hoy.getMonth() && d.getDate() === hoy.getDate();
    });
    if (entregasHoy.length === 0) return '📭 No hay entregas programadas para hoy. ¡Buen ritmo! 🎉';
    const lines = entregasHoy.map((p) => `• ${p.name} · ${p.client} · ${p.id}`);
    return `📦 Proyectos con entregas programadas para hoy:\n${lines.join('\n')}\n\n¿Necesitas despacho o instalación?`;
  }

  if (/material|falta|faltan|herraje|madecor|vidrio|insumo|blum|cuarzo/i.test(q)) {
    const conAlerta = state.proyectos.filter((p) => p.alert);
    if (conAlerta.length === 0) return '✅ ¡Sin faltantes de materiales! Todo en orden. 🎉';
    const lines = conAlerta.map((p) => `• ${p.name} · ${p.alert}`);
    return `⚠️ Proyectos con materiales faltantes:\n${lines.join('\n')}`;
  }

  if (/detenido|detenidos|paralizo|paralizada/i.test(q)) {
    const detenidos = state.proyectos.filter((p) => p.status === EST_PRODUCCION.DETENIDO);
    if (detenidos.length === 0) return '✅ Sin proyectos detenidos actualmente.';
    const lines = detenidos.map((p) => `• ${p.name} · ${p.bloqueos[0]?.reason || 'Bloqueo activo'}`);
    return `⚠️ Proyectos detenidos:\n${lines.join('\n')}`;
  }

  const tokens = texto.toLowerCase().split(/[^a-z0-9]+/).map((t) => t.trim()).filter((t) => t.length > 1);
  const term = tokens.join(' ').trim();
  if (term) {
    const resultados = state.proyectos.filter((p) => `${p.id} ${p.client} ${p.name}`.toLowerCase().includes(term.toLowerCase()));
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
  const msg = String(texto ?? input.value ?? '').trim();
  if (!msg) return;
  pushMensaje('user', msg);
  input.value = '';
  setTimeout(() => pushMensaje('bot', generarRespuestaBot(msg)), 450);
}

function abrirChat() {
  const panel = document.getElementById('chat-panel');
  panel.classList.add('open');
  if (document.querySelectorAll('#chat-messages .chat-msg').length === 0) {
    pushMensaje('bot', '¡Hola! 👋 Soy el Asistente IA de MODUGAL.\nPuedo consultar entregas de hoy, proyectos con materiales faltantes o clientes. Prueba: "¿Qué entregas hay para hoy?"');
  }
}

function cerrarChat() {
  document.getElementById('chat-panel').classList.remove('open');
}

/* ==========================================================================
   6. RENDER · TABLERO DE PRODUCCIÓN
   ========================================================================== */

function stepColor(p, idx, currentIdx) {
  if (p.status === 'Detenido') {
    if (idx === currentIdx) return 'bg-red-600';
    if (idx < currentIdx) return 'bg-red-300';
    return 'bg-slate-100';
  }
  if (idx === currentIdx) return 'bg-slate-900';
  if (idx < currentIdx) return 'bg-emerald-500';
  return 'bg-slate-100';
}

function crearTarjetaProduccion(p) {
  const card = document.createElement('div');
  card.className = `bg-white rounded-2xl border transition-all duration-300 overflow-hidden shadow-sm hover:shadow-xl hover:-translate-y-1 flex flex-col ${p.status === 'Detenido' ? 'border-red-300 ring-2 ring-red-500/20' : 'border-slate-200/80 hover:border-slate-300'}`;

  const header = document.createElement('div');
  header.className = 'relative h-56 w-full bg-slate-100 overflow-hidden border-b border-slate-100';
  const img = document.createElement('img');
  img.src = p.image;
  img.alt = p.name;
  img.className = 'w-full h-full object-cover hover:scale-105 transition-all duration-500';
  header.appendChild(img);
  const overlay = document.createElement('div');
  overlay.className = 'absolute inset-0 bg-gradient-to-t from-slate-950/70 via-slate-950/10 to-transparent';
  header.appendChild(overlay);
  const badgeId = document.createElement('div');
  badgeId.className = 'absolute top-3 left-3 bg-white/90 backdrop-blur-md px-2.5 py-1 rounded-lg border border-slate-200 text-[11px] font-mono font-bold text-slate-800 shadow-sm';
  badgeId.textContent = p.id;
  header.appendChild(badgeId);
  const badgeStatus = document.createElement('div');
  badgeStatus.className = 'absolute top-3 right-3';
  if (p.status === 'Detenido') {
    badgeStatus.innerHTML = `<span class="bg-red-600 text-white px-2.5 py-1 rounded-lg text-xs font-black shadow-md flex items-center"><i class="fas fa-triangle-exclamation w-3.5 h-3.5 mr-1" aria-hidden="true"></i>DETENIDO</span>`;
  } else if (p.status === 'En proceso') {
    badgeStatus.innerHTML = `<span class="bg-slate-900 text-white px-2.5 py-1 rounded-lg text-xs font-black shadow-md flex items-center"><i class="fas fa-clock w-3.5 h-3.5 mr-1" aria-hidden="true"></i>EN PROCESO</span>`;
  } else {
    badgeStatus.innerHTML = `<span class="bg-emerald-600 text-white px-2.5 py-1 rounded-lg text-xs font-black shadow-md flex items-center"><i class="fas fa-check-circle w-3.5 h-3.5 mr-1" aria-hidden="true"></i>ENTREGADO</span>`;
  }
  header.appendChild(badgeStatus);
  const overlayBottom = document.createElement('div');
  overlayBottom.className = 'absolute bottom-3 left-4 right-4 text-white';
  overlayBottom.innerHTML = `<h3 class="text-xl font-black drop-shadow-md">${p.name}</h3><p class="text-xs text-slate-200 flex items-center mt-0.5 drop-shadow"><i class="fas fa-map-marker-alt w-3.5 h-3.5 text-red-500 mr-1" aria-hidden="true"></i>${p.neighborhood}, ${p.city}</p>`;
  header.appendChild(overlayBottom);
  card.appendChild(header);

  const body = document.createElement('div');
  body.className = 'p-5 flex-1 flex flex-col justify-between space-y-4';

  if (p.alert) {
    const alerta = document.createElement('div');
    alerta.className = 'bg-red-50 border border-red-200 p-3 rounded-xl flex items-start space-x-2 text-xs';
    alerta.innerHTML = `<i class="fas fa-triangle-exclamation w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" aria-hidden="true"></i><div><span class="font-bold text-red-800 block">Falta Material / Bloqueo:</span><span class="text-red-700">${p.alert}</span></div>`;
    body.appendChild(alerta);
  }

  const stageWrap = document.createElement('div');
  stageWrap.innerHTML = `<div class="flex justify-between text-xs mb-2 font-bold"><span class="text-slate-500">Etapa de Producción: <strong class="text-slate-900 uppercase">${p.manufacturingPhase}</strong></span></div>`;
  const barRow = document.createElement('div');
  barRow.className = 'flex items-center w-full space-x-1';
  const currentIdx = Math.max(0, PRODUCTION_PHASES.indexOf(p.manufacturingPhase));
  PRODUCTION_PHASES.forEach((phase, idx) => {
    const bar = document.createElement('div');
    bar.className = `group relative flex-1 h-2 rounded-full border border-slate-200/50 transition-all ${stepColor(p, idx, currentIdx)}`;
    bar.title = phase;
    barRow.appendChild(bar);
  });
  stageWrap.appendChild(barRow);
  const labels = document.createElement('div');
  labels.className = 'flex justify-between text-[9px] font-bold text-slate-400 mt-1.5 uppercase';
  labels.innerHTML = '<span>Recepción</span><span>Despacho</span>';
  stageWrap.appendChild(labels);
  body.appendChild(stageWrap);

  const details = document.createElement('div');
  details.className = 'grid grid-cols-2 gap-2 text-xs border-t border-slate-100 pt-3';
  details.innerHTML = `
    <div>
      <span class="text-slate-400 block">Trazador Responsable</span>
      <span class="font-bold text-slate-800 mt-0.5 block">${p.leadCarpenter}</span>
    </div>
    <div>
      <span class="text-slate-400 block">Entrega Estimada</span>
      <span class="font-bold text-slate-800 mt-0.5 block">${p.dateExpected}</span>
    </div>
  `;
  body.appendChild(details);

  const btns = document.createElement('div');
  btns.className = 'pt-2 flex space-x-2';
  const fichaBtn = document.createElement('button');
  fichaBtn.type = 'button';
  fichaBtn.className = 'flex-1 bg-slate-900 hover:bg-slate-800 text-white font-bold py-2.5 px-4 rounded-xl text-xs transition-all shadow-sm flex items-center justify-center space-x-1';
  fichaBtn.innerHTML = '<span>Ficha del Proyecto</span><i class="fas fa-chevron-right w-4 h-4" aria-hidden="true"></i>';
  fichaBtn.addEventListener('click', () => openFicha(p.id));
  const dropBtn = document.createElement('button');
  dropBtn.type = 'button';
  dropBtn.className = 'bg-slate-100 hover:bg-slate-200 text-slate-700 p-2.5 rounded-xl border border-slate-200 transition-colors';
  dropBtn.title = 'Dropbox Seguro';
  dropBtn.innerHTML = '<i class="fas fa-folder w-4 h-4 text-blue-600" aria-hidden="true"></i>';
  dropBtn.addEventListener('click', () => { state.fichaSub = 'dropbox'; openFicha(p.id); });
  btns.appendChild(fichaBtn);
  btns.appendChild(dropBtn);
  body.appendChild(btns);

  card.appendChild(body);
  return card;
}

function renderProduccion() {
  const grid = document.getElementById('proyectos-grid');
  grid.innerHTML = '';
  let lista = state.proyectos;
  if (state.fProduccion !== 'todos') lista = lista.filter((p) => p.status === state.fProduccion);
  if (state.search) {
    const q = state.search.toLowerCase();
    lista = lista.filter((p) => `${p.id} ${p.client} ${p.name} ${p.city}`.toLowerCase().includes(q));
  }
  if (lista.length === 0) {
    grid.innerHTML = '<div class="bg-white border border-slate-200 rounded-2xl shadow-sm p-8 text-center text-slate-500 text-sm">No hay proyectos para el filtro seleccionado.</div>';
    return;
  }
  lista.forEach((p) => grid.appendChild(crearTarjetaProduccion(p)));
}

/* ==========================================================================
   7. RENDER · KPI DEL TABLERO DE PRODUCCIÓN
   ========================================================================== */

function renderKpis() {
  const detenidos = state.proyectos.filter((p) => p.status === EST_PRODUCCION.DETENIDO).length;
  document.getElementById('kpi-activos').textContent = String(state.proyectos.length);
  document.getElementById('kpi-detenidos').textContent = String(detenidos);
  document.getElementById('kpi-bodega').textContent = '2 Bodegas';
  document.getElementById('kpi-operarios').textContent = '10 Operarios';
  const cardDetenidos = document.getElementById('kpi-detenidos').closest('.kpi-card');
  cardDetenidos.classList.toggle('kpi-alert', detenidos > 0);
  const cardOperarios = document.getElementById('kpi-operarios').closest('.kpi-card');
  cardOperarios.classList.toggle('kpi-success', true);
}

/* ==========================================================================
   8. RENDER · EQUIPO & ASIGNACIONES
   ========================================================================== */

function renderEquipo() {
  const contenedor = document.getElementById('equipo-grid');
  contenedor.innerHTML = '';

  const assignments = {};
  state.proyectos.forEach((p) => {
    if (p.status === EST_PRODUCCION.COMPLETADO || p.phase === 'Comercial') return;
    (p.muebles || []).forEach((m) => {
      if (!m.carpenter) return;
      if (!assignments[m.carpenter]) assignments[m.carpenter] = [];
      assignments[m.carpenter].push({
        projectId: p.id,
        projectName: p.name,
        muebleName: m.name,
        status: m.status,
        manufacturingPhase: m.manufacturingPhase,
        projectStatus: p.status,
      });
    });
  });

  const entries = Object.entries(assignments);
  if (entries.length === 0) {
    contenedor.innerHTML = '<div class="bg-white border border-slate-200 rounded-2xl shadow-sm p-8 text-center text-slate-500 text-sm">No hay tareas activas asignadas a carpinteros en este momento.</div>';
    return;
  }

  entries.forEach(([carpenter, tasks]) => {
    const card = document.createElement('div');
    card.className = 'bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col';
    const header = document.createElement('div');
    header.className = 'bg-slate-50 p-4 border-b border-slate-200 flex items-center justify-between';
    const left = document.createElement('div');
    left.className = 'flex items-center space-x-3';
    const avatar = document.createElement('div');
    avatar.className = 'w-10 h-10 rounded-full bg-slate-200 border border-slate-300 flex items-center justify-center text-slate-600 font-black';
    avatar.textContent = String(carpenter).charAt(0).toUpperCase();
    const nameWrap = document.createElement('div');
    const name = document.createElement('h3');
    name.className = 'font-bold text-slate-900';
    name.textContent = carpenter;
    const sub = document.createElement('p');
    sub.className = 'text-[10px] uppercase font-bold text-slate-500 tracking-wider';
    sub.textContent = 'Operario de Planta';
    nameWrap.appendChild(name);
    nameWrap.appendChild(sub);
    left.appendChild(avatar);
    left.appendChild(nameWrap);
    const badge = document.createElement('span');
    badge.className = 'bg-slate-900 text-white text-xs font-black px-3 py-1 rounded-lg shadow-sm';
    badge.textContent = `${tasks.length} Tareas`;
    header.appendChild(left);
    header.appendChild(badge);
    card.appendChild(header);

    const body = document.createElement('div');
    body.className = 'p-4 flex-1 overflow-y-auto space-y-3';
    tasks.forEach((task) => {
      const taskEl = document.createElement('div');
      taskEl.className = `p-3 rounded-xl border text-xs ${task.projectStatus === 'Detenido' ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200 shadow-sm'}`;
      const row = document.createElement('div');
      row.className = 'flex justify-between items-start mb-1.5';
      const idBadge = document.createElement('span');
      idBadge.className = 'text-[10px] font-black text-red-600 bg-red-50 px-1.5 py-0.5 rounded uppercase';
      idBadge.textContent = task.projectId;
      const status = document.createElement('span');
      status.className = `font-bold ${task.manufacturingPhase === 'Despacho' ? 'text-emerald-600' : 'text-slate-500'}`;
      status.textContent = task.status;
      row.appendChild(idBadge);
      row.appendChild(status);
      taskEl.appendChild(row);
      const tName = document.createElement('p');
      tName.className = 'font-bold text-slate-900 leading-tight mb-1';
      tName.textContent = task.muebleName;
      taskEl.appendChild(tName);
      const tProj = document.createElement('p');
      tProj.className = 'text-slate-500 mb-3 truncate';
      tProj.textContent = `Proyecto: ${task.projectName}`;
      taskEl.appendChild(tProj);
      const fase = document.createElement('div');
      fase.className = 'flex items-center justify-between text-[10px] font-bold text-slate-500 mb-1.5';
      const faseTxt = document.createElement('span');
      faseTxt.innerHTML = `Fase del Manual: <span class="text-slate-900">${task.manufacturingPhase}</span>`;
      const faseVal = document.createElement('span');
      faseVal.className = 'text-slate-900';
      faseVal.textContent = task.manufacturingPhase;
      fase.appendChild(faseTxt);
      taskEl.appendChild(fase);
      const stepper = document.createElement('div');
      stepper.className = 'flex space-x-1';
      const currentIdx = Math.max(0, PRODUCTION_PHASES.indexOf(task.manufacturingPhase));
      PRODUCTION_PHASES.forEach((phase, idx) => {
        const bar = document.createElement('div');
        bar.className = `h-1.5 flex-1 rounded-full ${idx === currentIdx ? 'bg-red-600' : (idx < currentIdx ? 'bg-emerald-500' : 'bg-slate-200')}`;
        bar.title = phase;
        stepper.appendChild(bar);
      });
      taskEl.appendChild(stepper);
      body.appendChild(taskEl);
    });
    card.appendChild(body);
    contenedor.appendChild(card);
  });
}

/* ==========================================================================
   9. RENDER · SEGUIMIENTO COMERCIAL (KANBAN)
   ========================================================================== */

function renderComercial() {
  const board = document.getElementById('comercial-board');
  board.innerHTML = '';
  const items = state.comercial.filter((i) => state.quarter === 'Todos los Trimestres' || i.trimester === state.quarter);

  ETAPAS_COMERCIAL.forEach((stage) => {
    const stageItems = items.filter((i) => i.etapa === stage);
    const col = document.createElement('div');
    col.className = 'w-72 flex flex-col bg-slate-100/50 border border-slate-200 rounded-2xl';
    const colHeader = document.createElement('div');
    colHeader.className = 'p-3 border-b border-slate-200 flex justify-between items-center bg-white/50 rounded-t-2xl';
    colHeader.innerHTML = `<h3 class="font-bold text-slate-800 text-sm">${stage}</h3><span class="bg-slate-200 text-slate-700 text-[10px] font-black px-2 py-0.5 rounded-full">${stageItems.length}</span>`;
    const colBody = document.createElement('div');
    colBody.className = 'p-3 flex-1 overflow-y-auto space-y-3';
    stageItems.forEach((i) => {
      const card = document.createElement('div');
      card.className = 'bg-white p-3 rounded-xl border border-slate-200 shadow-sm cursor-pointer hover:shadow-md hover:border-red-300 transition-all group';
      card.innerHTML = `
        <div class="flex justify-between items-start mb-2">
          <span class="text-[9px] font-black font-mono text-slate-400 group-hover:text-red-600 transition-colors">${i.id}</span>
          <span class="w-2 h-2 rounded-full ${i.status === 'Detenido' ? 'bg-red-500' : 'bg-emerald-500'}"></span>
        </div>
        <h4 class="font-bold text-slate-900 text-sm leading-tight mb-1">${i.nombre || i.cliente}</h4>
        <p class="text-xs text-slate-500 mb-3">${i.cliente}</p>
        <div class="flex justify-between items-center text-xs border-t border-slate-100 pt-2">
          <div class="flex items-center text-emerald-700 font-bold">
            <i class="fas fa-dollar-sign w-3 h-3 mr-0.5" aria-hidden="true"></i>
            ${fmtMoney(i.budget)}
          </div>
        </div>`;
      card.addEventListener('click', () => {
        if (i.proyectoId) openFicha(i.proyectoId);
      });
      colBody.appendChild(card);
    });
    if (stageItems.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'h-20 border-2 border-dashed border-slate-200 rounded-xl flex items-center justify-center';
      const span = document.createElement('span');
      span.className = 'text-xs text-slate-400 font-medium';
      span.textContent = 'Vacío';
      empty.appendChild(span);
      colBody.appendChild(empty);
    }
    col.appendChild(colHeader);
    col.appendChild(colBody);
    board.appendChild(col);
  });
}

/* ==========================================================================
   10. RENDER · ESTADÍSTICAS & RENDIMIENTO
   ========================================================================== */

function renderStats() {
  const contenedor = document.getElementById('stats-view');
  contenedor.innerHTML = `
    <div class="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm">
      <h2 class="text-xl font-black text-slate-900 mb-1">Medición de Tiempos por Fase</h2>
      <p class="text-xs text-slate-500 mb-6">Promedio de duración en días por etapa de carpintería</p>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        ${STAGES_STATS.map((s) => `
          <div class="p-4 rounded-xl border ${s.color}">
            <span class="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-white border border-slate-200 shadow-sm">${s.label}</span>
            <h4 class="font-bold text-slate-900 mt-2 text-sm">${s.phase}</h4>
            <p class="text-3xl font-black mt-1">${s.days}</p>
          </div>`).join('')}
      </div>
    </div>
  `;
}

/* ==========================================================================
   11. RENDER · REGISTRO DE PEDIDOS / COMPRAS
   ========================================================================== */

function renderNewOrder() {
  const select = document.getElementById('pedido-proyecto');
  select.innerHTML = '<option value="">Seleccionar proyecto...</option>';
  state.proyectos.forEach((p) => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = `${p.name} - (${p.client})`;
    select.appendChild(opt);
  });
}

function onPedidoGuardar(e) {
  e.preventDefault();
  const projectId = document.getElementById('pedido-proyecto').value;
  const category = document.getElementById('pedido-categoria').value;
  const item = document.getElementById('pedido-item').value.trim();
  const supplier = document.getElementById('pedido-proveedor').value.trim();
  const guide = document.getElementById('pedido-guia')?.value?.trim() || 'Sin Guía';
  const expectedDate = document.getElementById('pedido-fecha')?.value || 'Por definir';

  if (!projectId || !item || !supplier) return;

  const p = state.proyectos.find((x) => x.id === projectId);
  p.pedidos.push({ id: generarId('p'), category, item, supplier, guide, expected: expectedDate, status: 'Solicitado', qc: 'Pendiente' });
  guardarEstado();

  document.getElementById('pedido-form').reset();
  renderNewOrder();
}

/* ==========================================================================
   12. MODAL · FICHA DE PROYECTO (5 SUBPESTAÑAS)
   ========================================================================== */

function openFicha(id) {
  state.fichaId = id;
  const p = state.proyectos.find((x) => x.id === id);
  if (!p) return;

  document.getElementById('ficha-nombre').textContent = p.name;
  document.getElementById('ficha-id-badge').textContent = p.id;
  document.getElementById('ficha-phase').textContent = p.phase;
  document.getElementById('ficha-direccion').textContent = p.address;
  document.getElementById('ficha-direccion-2').textContent = p.address;
  document.getElementById('ficha-telefono').textContent = p.phone;
  document.getElementById('ficha-operador').textContent = p.logisticOperator;
  document.getElementById('ficha-responsable').textContent = p.leadCarpenter;
  document.getElementById('ficha-fase').textContent = p.manufacturingPhase;
  document.getElementById('ficha-estado').textContent = p.status;
  document.getElementById('ficha-fecha-prom').textContent = p.dateExpected;
  document.getElementById('ficha-presupuesto').textContent = fmtMoney(p.budget);
  document.getElementById('ficha-alerta').textContent = p.alert || 'Sin alertas activas';

  const img = document.getElementById('ficha-imagen');
  img.src = p.image;
  img.alt = p.name;
  const maps = document.getElementById('ficha-maps');
  maps.href = `https://maps.google.com/?q=${encodeURIComponent(p.address)}`;

  const mueblesDiv = document.getElementById('ficha-muebles-list');
  mueblesDiv.innerHTML = (p.muebles || []).map((m) => {
    const currentIdx = Math.max(0, PRODUCTION_PHASES.indexOf(m.manufacturingPhase));
    const bars = PRODUCTION_PHASES.map((phase, idx) => {
      const color = idx === currentIdx ? 'bg-red-600' : (idx < currentIdx ? 'bg-emerald-500' : 'bg-slate-200');
      return `<div class="h-1 flex-1 rounded-full ${color}" title="${phase}"></div>`;
    }).join('');
    return `
      <div class="p-4 bg-slate-50 border border-slate-200 rounded-xl flex justify-between items-center text-xs">
        <div>
          <h5 class="font-bold text-slate-900">${m.name}</h5>
          <p class="text-slate-500 mt-0.5">Carpintero: ${m.carpenter}</p>
        </div>
        <div class="flex flex-col items-end">
          <span class="bg-white text-slate-800 font-bold px-3 py-1 rounded-lg border border-slate-200 shadow-sm mb-2">Fase: ${m.manufacturingPhase}</span>
          <div class="flex space-x-1 w-24">${bars}</div>
        </div>
      </div>`;
  }).join('');

  const tbody = document.getElementById('ficha-pedidos-tbody');
  tbody.innerHTML = (p.pedidos || []).map((od) => `
    <tr>
      <td class="p-3 font-bold text-slate-900">${od.category}</td>
      <td class="p-3 text-slate-700">${od.item}</td>
      <td class="p-3 text-slate-500">${od.supplier}</td>
      <td class="p-3 font-mono text-slate-500">${od.guide}</td>
      <td class="p-3 font-bold text-emerald-600">${od.status}</td>
    </tr>`).join('');

  const bloqueosDiv = document.getElementById('ficha-bloqueos-list');
  bloqueosDiv.innerHTML = (p.bloqueos || []).length === 0
    ? '<p class="text-xs text-slate-400 text-center py-6">Sin bloqueos registrados.</p>'
    : (p.bloqueos || []).map((b) => `
      <div class="p-4 bg-red-50 border border-red-200 rounded-xl flex justify-between items-center text-xs">
        <div>
          <p class="font-bold text-red-900">${b.reason}</p>
          <p class="text-red-700 mt-1">${b.action}</p>
        </div>
        ${b.solved ? '' : `<button type="button" class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-lg shadow-sm" data-resolver="${b.id}">Resolver</button>`}
      </div>`).join('');

  const publicList = document.getElementById('dropbox-publico-list');
  publicList.innerHTML = (p.dropboxFiles?.publicFiles || []).map((f) => `
    <div class="p-3 bg-slate-50 border border-slate-200 rounded-xl flex justify-between items-center">
      <span class="text-slate-800 font-bold">${f.name}</span>
      <span class="text-blue-600 font-bold cursor-pointer hover:underline">Descargar</span>
    </div>`).join('');

  const privList = document.getElementById('dropbox-privado-list');
  const esGerencia = state.rol === 'gerencia';
  if (esGerencia) {
    privList.innerHTML = (p.dropboxFiles?.privateFiles || []).map((f) => `
      <div class="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex justify-between items-center">
        <span class="text-emerald-900 font-bold">${f.name}</span>
        <span class="text-emerald-700 font-bold">Ver Archivo</span>
      </div>`).join('');
    document.getElementById('dropbox-privado-restringido').classList.add('hidden');
  } else {
    privList.innerHTML = '';
    document.getElementById('dropbox-privado-restringido').classList.remove('hidden');
    document.getElementById('dropbox-privado-rol').textContent = state.rol;
  }
  document.getElementById('ficha-proxy-rol').textContent = state.rol;

  document.getElementById('modal-ficha').classList.remove('is-hidden');
  document.getElementById('ficha-subtabs').querySelectorAll('[data-sub]').forEach((b) => {
    b.classList.toggle('active', b.dataset.sub === state.fichaSub);
  });
  document.querySelectorAll('#ficha-resumen, #ficha-muebles, #ficha-pedidos, #ficha-bloqueos, #ficha-dropbox').forEach((el) => {
    el.classList.toggle('is-hidden', el.id !== `ficha-${state.fichaSub}`);
  });
}

function closeFicha() {
  document.getElementById('modal-ficha').classList.add('is-hidden');
  state.fichaId = null;
}

function bindFichaEvents() {
  document.getElementById('ficha-close').addEventListener('click', closeFicha);
  document.getElementById('ficha-close-footer').addEventListener('click', closeFicha);
  document.getElementById('ficha-subtabs').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-sub]');
    if (!btn) return;
    state.fichaSub = btn.dataset.sub;
    document.getElementById('ficha-subtabs').querySelectorAll('[data-sub]').forEach((b) => b.classList.toggle('active', b.dataset.sub === state.fichaSub));
    document.querySelectorAll('#ficha-resumen, #ficha-muebles, #ficha-pedidos, #ficha-bloqueos, #ficha-dropbox').forEach((el) => {
      el.classList.toggle('is-hidden', el.id !== `ficha-${state.fichaSub}`);
    });
  });
  document.addEventListener('click', (e) => {
    const resolver = e.target.closest('[data-resolver]');
    if (resolver) {
      const id = resolver.dataset.resolver;
      const p = state.proyectos.find((x) => x.id === state.fichaId);
      const b = p?.bloqueos?.find((x) => x.id === id);
      if (b) b.solved = true;
      guardarEstado();
      if (state.fichaId) openFicha(state.fichaId);
      return;
    }
    const fId = e.target.closest('[data-f-id]');
    if (fId) openFicha(fId.dataset.fId);
  });
}

/* ==========================================================================
   13. NAVEGACIÓN ENTRE MÓDULOS
   ========================================================================== */

function switchTab(tab) {
  state.tab = tab;
  document.querySelectorAll('#mg-tabs [data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-panel').forEach((el) => {
    el.classList.toggle('is-hidden', el.id !== `tab-${tab}`);
  });

  if (tab === 'produccion') { renderKpis(); renderProduccion(); }
  if (tab === 'equipo') renderEquipo();
  if (tab === 'comercial') renderComercial();
  if (tab === 'stats') renderStats();
  if (tab === 'new-order') renderNewOrder();
}

/* ==========================================================================
   14. EVENTOS · INICIALIZACIÓN
   ========================================================================== */

function init() {
  const cargado = cargarEstado();
  state.proyectos = cargado.proyectos;
  state.comercial = cargado.comercial;
  state.rol = localStorage.getItem(ROL_KEY) || 'gerencia';

  renderKpis();
  renderProduccion();
  switchTab('produccion');

  // Buscador global (módulo Producción)
  document.getElementById('mg-search-input').addEventListener('input', (e) => {
    state.search = e.target.value.trim().toLowerCase();
    renderProduccion();
  });

  // Selector de rol
  const rolSelect = document.getElementById('mg-rol-select');
  rolSelect.addEventListener('change', (e) => {
    state.rol = e.target.value;
    localStorage.setItem(ROL_KEY, state.rol);
  });

  // Botón Nuevo Pedido
  document.getElementById('btn-nuevo-pedido').addEventListener('click', () => switchTab('new-order'));

  // Tabs
  document.getElementById('mg-tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tab]');
    if (!btn) return;
    switchTab(btn.dataset.tab);
  });

  // Filtros producción
  document.getElementById('filtros-produccion').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-filtro]');
    if (!btn) return;
    state.fProduccion = btn.dataset.filtro;
    document.querySelectorAll('#filtros-produccion [data-filtro]').forEach((b) => b.classList.toggle('active', b.dataset.filtro === state.fProduccion));
    renderProduccion();
  });

  // Trimestre comercial
  document.getElementById('comercial-trimestre').addEventListener('change', (e) => {
    state.quarter = e.target.value;
    renderComercial();
  });

  // Formulario pedidos
  document.getElementById('pedido-form').addEventListener('submit', onPedidoGuardar);

  // Asistente IA
  document.getElementById('chat-fab').addEventListener('click', abrirChat);
  document.getElementById('chat-close').addEventListener('click', cerrarChat);
  document.getElementById('chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    enviarMensaje(document.getElementById('chat-input').value);
  });
  document.getElementById('chat-quick').addEventListener('click', (e) => {
    const chip = e.target.closest('.chat-chip');
    if (chip) enviarMensaje(chip.dataset.q);
  });

  bindFichaEvents();
}

document.addEventListener('DOMContentLoaded', init);
