
// ===== FILE: api.js =====
/**
 * api.js - Módulo de conexión a Google Apps Script, Supabase y Google Sheets CSV (Movistar)
 */

const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbw19j5ipG-X_92WyT4UgU1yTsXzXzpLIMv4fZdkx6n04Hi66Hc1CEoplfDVvd-6uf9BWw/exec";
const SUPABASE_URL = "https://pjlrutxmdjuezilcfhxe.supabase.co";
const SUPABASE_KEY = "sb_publishable_C9lR44aClxkAo8FjvDdsgw_GyCf1kJH";

const MOVISTAR_TRIPLETAS_CSV_URL = "https://docs.google.com/spreadsheets/d/17JqqhwyayDfo9RLpqlJNsGeZ8SFTApZnrjCjkwsasJM/export?format=csv&gid=275681800";
const MOVISTAR_REVERSAS_CSV_URL = "https://docs.google.com/spreadsheets/d/17JqqhwyayDfo9RLpqlJNsGeZ8SFTApZnrjCjkwsasJM/export?format=csv&gid=1317768651";

window.ApiService = {
  getSupabase() {
    if (!this._supabase && window.supabase) {
      try {
        this._supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      } catch (e) {
        console.warn("Error creando cliente Supabase:", e);
      }
    }
    return this._supabase;
  },

  /**
   * Parser CSV RFC-4180 (soporta saltos de línea y comas dentro de comillas)
   */
  parseCSV(text) {
    if (!text) return [];
    const cleanText = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
    const rows = [];
    let curRow = [];
    let curField = '';
    let inQuotes = false;

    for (let i = 0; i < cleanText.length; i++) {
      const c = cleanText[i];
      if (inQuotes) {
        if (c === '"') {
          if (i + 1 < cleanText.length && cleanText[i + 1] === '"') {
            curField += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          curField += c;
        }
      } else {
        if (c === '"') {
          inQuotes = true;
        } else if (c === ',') {
          curRow.push(curField.trim());
          curField = '';
        } else if (c === '\r' || c === '\n') {
          if (c === '\r' && i + 1 < cleanText.length && cleanText[i + 1] === '\n') i++;
          curRow.push(curField.trim());
          curField = '';
          rows.push(curRow);
          curRow = [];
        } else {
          curField += c;
        }
      }
    }
    if (curField.length > 0 || curRow.length > 0) {
      curRow.push(curField.trim());
      rows.push(curRow);
    }
    return rows;
  },

  /**
   * Obtiene la base de datos de Reclamos Entel (prioriza datos locales si falla o tarda la red)
   */
  async fetchReclamos() {
    try {
      const localRes = await fetch('./data_reclamos.json');
      if (localRes.ok) {
        const text = await localRes.text();
        const cleanText = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
        const data = JSON.parse(cleanText);
        if (Array.isArray(data) && data.length > 0) {
          return data;
        }
      }
    } catch (e) {
      console.warn("Fallo lectura local de reclamos, probando endpoint remoto...", e);
    }

    try {
      const response = await fetch(APPS_SCRIPT_URL);
      if (!response.ok) throw new Error("HTTP " + response.status);
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    } catch (err) {
      console.error("Fallo definitivo obteniendo Reclamos:", err);
      return [];
    }
  },

  /**
   * Obtiene la nómina de asesores desde Supabase o cache local
   */
  async fetchNomina() {
    try {
      const localRes = await fetch('./data_nomina.json');
      if (localRes.ok) {
        const text = await localRes.text();
        const cleanText = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
        const data = JSON.parse(cleanText);
        if (Array.isArray(data) && data.length > 0) {
          return data;
        }
      }
    } catch (e) {
      // continuar a supabase
    }

    const client = this.getSupabase();
    if (client) {
      try {
        const { data, error } = await client.from('nomina').select('*').limit(2000);
        if (!error && data) return data;
      } catch (err) {
        console.warn("Supabase fetch error:", err);
      }
    }
    return [];
  },

  /**
   * Obtiene la pestaña TRIPLETAS de Movistar (prioriza cache local instantáneo, con fallback a CSV remoto)
   */
  async fetchMovistarTripletas(forceRemote = false) {
    if (!forceRemote) {
      try {
        const localRes = await fetch('./data_movistar_tripletas.csv');
        if (localRes.ok) {
          const text = await localRes.text();
          const rows = this.parseCSV(text);
          if (rows.length > 2) return rows;
        }
      } catch (e) {
        // continuar a remoto
      }
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(MOVISTAR_TRIPLETAS_CSV_URL, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) {
        const text = await res.text();
        const rows = this.parseCSV(text);
        if (rows.length > 2) return rows;
      }
    } catch (e) {
      console.warn("Fallo CSV remoto Movistar Tripletas, usando cache local...", e);
    }

    try {
      const localRes = await fetch('./data_movistar_tripletas.csv');
      if (localRes.ok) {
        const text = await localRes.text();
        return this.parseCSV(text);
      }
    } catch (err) {
      console.error("Error cargando Movistar Tripletas:", err);
    }
    return [];
  },

  /**
   * Obtiene la pestaña REVERSAS de Movistar (prioriza cache local instantáneo, con fallback a CSV remoto)
   */
  async fetchMovistarReversas(forceRemote = false) {
    if (!forceRemote) {
      try {
        const localRes = await fetch('./data_movistar_reversas.csv');
        if (localRes.ok) {
          const text = await localRes.text();
          const rows = this.parseCSV(text);
          if (rows.length > 2) return rows;
        }
      } catch (e) {
        // continuar a remoto
      }
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(MOVISTAR_REVERSAS_CSV_URL, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) {
        const text = await res.text();
        const rows = this.parseCSV(text);
        if (rows.length > 2) return rows;
      }
    } catch (e) {
      console.warn("Fallo CSV remoto Movistar Reversas, usando cache local...", e);
    }

    try {
      const localRes = await fetch('./data_movistar_reversas.csv');
      if (localRes.ok) {
        const text = await localRes.text();
        return this.parseCSV(text);
      }
    } catch (err) {
      console.error("Error cargando Movistar Reversas:", err);
    }
    return [];
  }
};


// ===== FILE: store.js =====
/**
 * store.js - Manejador de estado reactivo, enriquecimiento y filtros globales (Entel & Movistar)
 */

const MONTH_NAMES = [
  'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
  'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'
];

window.Store = {
  // Campaña activa en el dashboard: 'entel' | 'movistar'
  activeBrand: 'entel',

  // Datos crudos y enriquecidos Entel
  rawReclamos: [],
  rawNomina: [],
  enrichedReclamos: [],

  // Datos enriquecidos Movistar (Tripletas y Reversas)
  movistarTripletas: [],
  movistarReversas: [],

  lastModifiedTimestamp: null,

  // Filtros globales Entel (Arrays vacíos = 'ALL' / Todas seleccionadas)
  filters: {
    year: '2025',
    campana: [],
    estado: [],
    responsabilidad: [],
    respuesta: [],
    mes: []
  },

  // Filtros globales Movistar (Arrays vacíos = 'ALL' / Todas seleccionadas)
  movFilters: {
    year: '2026',
    supervisor: [],
    estado: [],
    conclusion: [],
    penalidad: [],
    mes: []
  },

  // Filtro cruzado interactivo (Cross-Highlighting / Cross-Filtering estilo Power BI)
  crossFilter: null,

  // Suscriptores al cambio de estado
  listeners: [],

  subscribe(listener) {
    this.listeners.push(listener);
  },

  notify() {
    this.listeners.forEach(fn => fn());
  },

  /**
   * Normaliza nombres de supervisores en Movistar para evitar duplicados por segundo nombre o tildes
   */
  normalizeMovSupervisor(raw) {
    const s = String(raw || '').trim().toUpperCase();
    if (!s || s === '-' || s === 'NA') return 'POR ASIGNAR';
    if (s.includes('JAKELIN') || s.includes('SALAZAR')) return 'JAKELIN SALAZAR';
    if (s.includes('ANDR') || s.includes('CRUZ')) return 'ANDRÉS CRUZ';
    if (s.includes('MAR') && s.includes('ALTAMIRANO')) return 'MARÍA ALTAMIRANO';
    return s;
  },

  /**
   * Carga e indexa los datos de Entel
   */
  async initData(reclamosData, nominaData) {
    this.rawReclamos = reclamosData || [];
    this.rawNomina = nominaData || [];

    const nominaMap = new Map();
    this.rawNomina.forEach(nom => {
      const doc = String(nom.documento || '').trim();
      const name = String(nom.nombre || '').trim().toUpperCase();
      if (doc) nominaMap.set(doc, nom);
      if (name) nominaMap.set(name, nom);
    });

    this.enrichedReclamos = this.rawReclamos.map((row, idx) => {
      const rawDate = row['FECHA DE RECLAMO (RECEPCIÓN)'] || row['FECHA DE RECLAMO (RECEPCIN)'] || row['FECHA DE RESPUESTA'] || row['Marca temporal'] || '';
      let dateObj = new Date(rawDate);
      let year = '2025';
      let monthIndex = -1;
      let monthName = '';

      if (!isNaN(dateObj.getTime())) {
        year = String(dateObj.getUTCFullYear());
        monthIndex = dateObj.getUTCMonth();
        monthName = MONTH_NAMES[monthIndex];
      }

      const campana = String(row['CAMPAÑA '] || row['CAMPAA '] || row['CAMPAÑA'] || row['Campaña'] || 'SIN CAMPAÑA').trim().toUpperCase();
      const supervisor = String(row['SUPERVISOR'] || 'SIN SUPERVISOR').trim().toUpperCase();
      const asesor = String(row['ASESOR'] || 'SIN ASESOR').trim().toUpperCase();
      const estado = String(row['ESTADO'] || 'ACTIVO').trim().toUpperCase();
      const respuesta = String(row['RESPUESTA'] || 'NO DEFINIDO').trim().toUpperCase();
      const responsabilidad = String(row['RESPONSABILIDAD'] || 'CLIENTE').trim().toUpperCase();
      const tipoReclamo = String(row['TIPO DE RECLAMO'] || 'ENTEL').trim().toUpperCase();
      const motivo = String(row['MOTIVO'] || 'SIN MOTIVO').trim().toUpperCase();
      const subMotivo = String(row['SUB MOTIVO'] || 'SIN SUB MOTIVO').trim().toUpperCase();
      const cuartil = String(row['CUARTIL'] || 'NO TIENE').trim().toUpperCase();
      const dniAsesor = String(row['DNI ASESOR'] || '').trim();

      const nomMatch = nominaMap.get(dniAsesor) || nominaMap.get(asesor);
      const antiguedad = nomMatch ? String(nomMatch.antiguedad || 'NO IDENTIFICADO').toUpperCase() : 'NO IDENTIFICADO';

      return {
        id: idx + 1,
        fecha: rawDate,
        year,
        monthIndex,
        monthName,
        campana,
        supervisor,
        asesor,
        estado,
        respuesta,
        responsabilidad,
        tipoReclamo,
        motivo,
        subMotivo,
        cuartil,
        antiguedad,
        isFundado: respuesta === 'FUNDADO',
        isInfundado: respuesta === 'INFUNDADO'
      };
    });

    this.lastModifiedTimestamp = new Date().toLocaleString('es-PE', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });

    this.notify();
  },

  /**
   * Carga e indexa los datos de Movistar (Tripletas y Reversas desde filas CSV)
   * Nota: En ambas hojas la fila 0 tiene títulos de bloque y la fila 1 tiene los encabezados reales.
   */
  initMovistarData(tripletasRows, reversasRows) {
    // 1. Procesar TRIPLETAS (encabezados en fila 1, datos desde fila 2)
    const tList = [];
    if (Array.isArray(tripletasRows) && tripletasRows.length > 2) {
      for (let i = 2; i < tripletasRows.length; i++) {
        const r = tripletasRows[i];
        if (!r || r.length < 15) continue;
        // Verificar que tenga al menos fecha o folio o numero de tripleta
        const numTripleta = String(r[6] || r[5] || r[7] || '').trim();
        const fechaRaw = String(r[8] || r[0] || '').trim();
        if (!numTripleta && !fechaRaw) continue;

        let mesVenta = String(r[67] || '').trim().toUpperCase();
        const mesNum = parseInt(r[88], 10);
        if (!mesVenta && !isNaN(mesNum) && mesNum >= 1 && mesNum <= 12) {
          mesVenta = MONTH_NAMES[mesNum - 1];
        }
        if (!mesVenta && fechaRaw.includes('/')) {
          const parts = fechaRaw.split('/');
          if (parts.length >= 2) {
            const mIdx = parseInt(parts[1], 10) - 1;
            if (mIdx >= 0 && mIdx < 12) mesVenta = MONTH_NAMES[mIdx];
          }
        }
        if (!mesVenta) mesVenta = 'SIN MES';

        const penalidadRaw = String(r[2] || '').trim().toUpperCase();
        const penalidad = penalidadRaw === 'SI' || penalidadRaw === 'SÍ' ? 'SI' : 'NO';
        const factor = parseFloat(r[3]) || (penalidad === 'SI' ? 3 : 1);
        const montoPenalizado = parseFloat(String(r[4] || '0').replace(/[^0-9.-]/g, '')) || 0;

        const conclusionRaw = String(r[78] || '').trim().toUpperCase();
        let conclusion = 'PENDIENTE';
        if (conclusionRaw.includes('INFUNDADO')) conclusion = 'INFUNDADO';
        else if (conclusionRaw.includes('FUNDADO')) conclusion = 'FUNDADO';

        const regionRaw = String(r[28] || '').trim();
        const region = regionRaw ? `REGIÓN ${regionRaw}` : 'SIN REGIÓN';
        const cac = String(r[29] || r[13] || 'SIN CAC').trim().toUpperCase();
        const tipoCliente = String(r[12] || 'PREPAGO').trim().toUpperCase();
        const planAdquirido = String(r[34] || 'NO ESPECIFICADO').trim().toUpperCase();
        const tramiteQueja = String(r[36] || 'QUEJA DE PORTABILIDAD').trim().toUpperCase();
        let quejaParticular = String(r[37] || 'OTRO').trim().toUpperCase();
        if (quejaParticular.includes('OTRO')) quejaParticular = 'OTRO (COMENTARIOS)';

        const asesorRaw = String(r[49] || '').trim().toUpperCase();
        const asesor = (!asesorRaw || asesorRaw === '-') ? 'POR ASIGNAR' : asesorRaw;
        const validadorRaw = String(r[50] || '').trim().toUpperCase();
        const validador = (!validadorRaw || validadorRaw === '-') ? 'SIN VALIDADOR' : validadorRaw;
        const supervisor = this.normalizeMovSupervisor(r[83]);

        let antiguedad = String(r[84] || '').trim().toUpperCase();
        if (!antiguedad) antiguedad = 'NO IDENTIFICADO';
        if (antiguedad === '0 - 1 MES') antiguedad = '0 - 1 MESES';

        let estado = String(r[85] || '').trim().toUpperCase();
        if (!estado) estado = 'ACTIVO';

        const seguimiento = String(r[86] || 'NA').trim().toUpperCase() || 'NA';

        // Indicadores de Script de Calidad (Columnas 68, 69, 70 y 71 de TRIPLETAS)
        const indOfertaRaw = String(r[68] || r[61] || '').trim().toUpperCase();
        const indicaOferta = (indOfertaRaw === 'SI' || indOfertaRaw === 'SÍ') ? 'SI' : (indOfertaRaw === 'NO' ? 'NO' : '');
        const confEquipoRaw = String(r[69] || '').trim().toUpperCase();
        const confirmaEquipo = (confEquipoRaw === 'SI' || confEquipoRaw === 'SÍ') ? 'SI' : (confEquipoRaw === 'NO' ? 'NO' : '');
        const avPrivRaw = String(r[70] || r[72] || '').trim().toUpperCase();
        const avisoPrivacidad = (avPrivRaw === 'SI' || avPrivRaw === 'SÍ') ? 'SI' : (avPrivRaw === 'NO' ? 'NO' : '');
        const solCurpRaw = String(r[71] || '').trim().toUpperCase();
        const solicitaCurp = (solCurpRaw === 'SI' || solCurpRaw === 'SÍ') ? 'SI' : (solCurpRaw === 'NO' ? 'NO' : '');
        const mencionaOferta = indicaOferta;
        const usoScript = String(r[62] || r[75] || '').trim().toUpperCase();
        const evaluadaCalidad = String(r[80] || '').trim().toUpperCase();

        tList.push({
          id: i - 1,
          origen: 'TRIPLETAS',
          year: '2026',
          monthName: mesVenta,
          penalidad,
          factor,
          montoPenalizado,
          folio: numTripleta,
          dn: String(r[11] || '').trim(),
          tipoCliente,
          cac,
          region,
          clase: String(r[17] || 'INFORMACIÓN').trim().toUpperCase(),
          tipo: String(r[18] || 'ATENCIÓN').trim().toUpperCase(),
          subtipo: String(r[19] || 'PROMOCIÓN INFORMACIÓN INCORRECTA').trim().toUpperCase(),
          planAdquirido,
          tramiteQueja,
          quejaParticular,
          canal: String(r[38] || 'TELEMARKETING').trim().toUpperCase(),
          evidencia: String(r[39] || 'NO').trim().toUpperCase(),
          asesor,
          validador,
          supervisor,
          antiguedad,
          estado,
          seguimiento,
          conclusion,
          isFundado: conclusion === 'FUNDADO',
          isInfundado: conclusion === 'INFUNDADO',
          isPendiente: conclusion === 'PENDIENTE',
          isPenalizado: penalidad === 'SI',
          indicaOferta,
          confirmaEquipo,
          mencionaOferta,
          usoScript,
          avisoPrivacidad,
          solicitaCurp,
          evaluadaCalidad
        });
      }
    }

    // 2. Procesar REVERSAS (encabezados en fila 1, datos desde fila 2)
    const rList = [];
    if (Array.isArray(reversasRows) && reversasRows.length > 2) {
      for (let i = 2; i < reversasRows.length; i++) {
        const r = reversasRows[i];
        if (!r || r.length < 15) continue;
        const msisdn = String(r[6] || r[5] || '').trim();
        const mesRaw = String(r[24] || '').trim().toUpperCase();
        if (!msisdn && !mesRaw) continue;

        const penalidadRaw = String(r[2] || '').trim().toUpperCase();
        const penalidad = penalidadRaw === 'SI' || penalidadRaw === 'SÍ' ? 'SI' : 'NO';
        const factor = parseFloat(r[3]) || (penalidad === 'SI' ? 3 : 1);
        const montoPenalizado = parseFloat(String(r[4] || '0').replace(/[^0-9.-]/g, '')) || 0;

        let donador = String(r[9] || 'OTRO').trim().toUpperCase();
        if (donador.includes('AT&T')) donador = 'AT&T';

        const vendorPoint = String(r[12] || 'SIN PUNTO').trim().toUpperCase();
        const distribuidor = String(r[13] || r[14] || 'SIN DISTRIBUIDOR').trim().toUpperCase();
        const aplicaAudio = String(r[18] || 'NO').trim().toUpperCase();

        const conclusionRaw = String(r[19] || '').trim().toUpperCase();
        let conclusion = 'INFUNDADO';
        if (conclusionRaw.includes('INFUNDADO')) conclusion = 'INFUNDADO';
        else if (conclusionRaw.includes('FUNDADO')) conclusion = 'FUNDADO';
        else if (conclusionRaw) conclusion = conclusionRaw;

        const asesor = String(r[20] || 'POR ASIGNAR').trim().toUpperCase();
        const supervisor = this.normalizeMovSupervisor(r[21]);
        const estado = String(r[22] || 'ACTIVO').trim().toUpperCase();
        let antiguedad = String(r[23] || 'NO IDENTIFICADO').trim().toUpperCase();
        if (antiguedad === '0 - 1 MES') antiguedad = '0 - 1 MESES';

        rList.push({
          id: i - 1,
          origen: 'REVERSAS',
          year: '2026',
          monthName: mesRaw || 'JUNIO',
          penalidad,
          factor,
          montoPenalizado,
          msisdn,
          periodo: String(r[7] || '').trim(),
          fvc: String(r[8] || '').trim(),
          donador,
          vendorPoint,
          distribuidor,
          canal: String(r[15] || 'TELEFONICO').trim().toUpperCase(),
          subcanal: String(r[16] || 'CALL CENTER').trim().toUpperCase(),
          aplicaAudio,
          conclusion,
          asesor,
          supervisor,
          estado,
          antiguedad,
          isFundado: conclusion === 'FUNDADO',
          isInfundado: conclusion === 'INFUNDADO',
          isPenalizado: penalidad === 'SI',
          // Campos homologados para la matriz jerárquica unificada
          region: donador,
          cac: `${vendorPoint} (${distribuidor.includes('NETCALL') ? 'NETCALL PRE' : 'CALLMAST PRE'})`,
          quejaParticular: `APLICA: ${aplicaAudio}`,
          planAdquirido: distribuidor,
          tramiteQueja: 'REVERSA PORTABILIDAD'
        });
      }
    }

    this.movistarTripletas = tList;
    this.movistarReversas = rList;
    this.notify();
  },

  /**
   * Aplica filtros de los segmentadores superiores para Entel
   */
  getBaseFilteredData() {
    return this.enrichedReclamos.filter(row => {
      if (this.filters.year !== 'ALL' && row.year !== this.filters.year) return false;
      if (Array.isArray(this.filters.campana) && this.filters.campana.length > 0 && !this.filters.campana.includes(row.campana)) return false;
      if (Array.isArray(this.filters.estado) && this.filters.estado.length > 0 && !this.filters.estado.includes(row.estado)) return false;
      if (Array.isArray(this.filters.responsabilidad) && this.filters.responsabilidad.length > 0 && !this.filters.responsabilidad.includes(row.responsabilidad)) return false;
      if (Array.isArray(this.filters.respuesta) && this.filters.respuesta.length > 0 && !this.filters.respuesta.includes(row.respuesta)) return false;
      if (Array.isArray(this.filters.mes) && this.filters.mes.length > 0 && !this.filters.mes.includes(row.monthName)) return false;
      return true;
    });
  },

  getFilteredData(ignoreSourceId = null) {
    const base = this.getBaseFilteredData();
    if (!this.crossFilter) return base;
    if (ignoreSourceId && this.crossFilter.sourceId === ignoreSourceId) return base;

    const { field, value } = this.crossFilter;
    return base.filter(row => row[field] === value);
  },

  /**
   * Aplica filtros de los segmentadores superiores para Movistar Tripletas
   */
  getMovBaseTripletas() {
    return this.movistarTripletas.filter(row => {
      if (Array.isArray(this.movFilters.supervisor) && this.movFilters.supervisor.length > 0 && !this.movFilters.supervisor.includes(row.supervisor)) return false;
      if (Array.isArray(this.movFilters.estado) && this.movFilters.estado.length > 0 && !this.movFilters.estado.includes(row.estado)) return false;
      if (Array.isArray(this.movFilters.conclusion) && this.movFilters.conclusion.length > 0 && !this.movFilters.conclusion.includes(row.conclusion)) return false;
      if (Array.isArray(this.movFilters.penalidad) && this.movFilters.penalidad.length > 0 && !this.movFilters.penalidad.includes(row.penalidad)) return false;
      if (Array.isArray(this.movFilters.mes) && this.movFilters.mes.length > 0 && !this.movFilters.mes.includes(row.monthName)) return false;
      return true;
    });
  },

  getMovFilteredTripletas(ignoreSourceId = null) {
    const base = this.getMovBaseTripletas();
    if (!this.crossFilter) return base;
    if (ignoreSourceId && this.crossFilter.sourceId === ignoreSourceId) return base;
    const { field, value } = this.crossFilter;
    // Solo aplicar si el campo existe en Tripletas
    if (base.length > 0 && !(field in base[0])) return base;
    return base.filter(row => row[field] === value);
  },

  /**
   * Aplica filtros de los segmentadores superiores para Movistar Reversas
   */
  getMovBaseReversas() {
    return this.movistarReversas.filter(row => {
      if (Array.isArray(this.movFilters.supervisor) && this.movFilters.supervisor.length > 0 && !this.movFilters.supervisor.includes(row.supervisor)) return false;
      if (Array.isArray(this.movFilters.estado) && this.movFilters.estado.length > 0 && !this.movFilters.estado.includes(row.estado)) return false;
      if (Array.isArray(this.movFilters.conclusion) && this.movFilters.conclusion.length > 0 && !this.movFilters.conclusion.includes(row.conclusion)) return false;
      if (Array.isArray(this.movFilters.penalidad) && this.movFilters.penalidad.length > 0 && !this.movFilters.penalidad.includes(row.penalidad)) return false;
      if (Array.isArray(this.movFilters.mes) && this.movFilters.mes.length > 0 && !this.movFilters.mes.includes(row.monthName)) return false;
      return true;
    });
  },

  getMovFilteredReversas(ignoreSourceId = null) {
    const base = this.getMovBaseReversas();
    if (!this.crossFilter) return base;
    if (ignoreSourceId && this.crossFilter.sourceId === ignoreSourceId) return base;
    const { field, value } = this.crossFilter;
    if (base.length > 0 && !(field in base[0])) return base;
    return base.filter(row => row[field] === value);
  },

  /**
   * Activa o desactiva un filtro cruzado al hacer clic en una barra o fila
   */
  toggleCrossFilter(field, value, sourceId) {
    if (this.crossFilter && this.crossFilter.field === field && this.crossFilter.value === value) {
      this.crossFilter = null;
    } else {
      this.crossFilter = { field, value, sourceId };
    }
    this.notify();
  },

  clearCrossFilter() {
    if (this.crossFilter) {
      this.crossFilter = null;
      this.notify();
    }
  },

  /**
   * Extrae listas únicas para los dropdowns de filtrado según la campaña activa
   */
  getFilterOptions() {
    if (this.activeBrand === 'movistar') {
      const supervisors = new Set();
      const estados = new Set();
      const conclusiones = new Set();
      const penalidades = new Set();
      const meses = new Set();

      const allMov = [...this.movistarTripletas, ...this.movistarReversas];
      allMov.forEach(r => {
        if (r.supervisor) supervisors.add(r.supervisor);
        if (r.estado) estados.add(r.estado);
        if (r.conclusion) conclusiones.add(r.conclusion);
        if (r.penalidad) penalidades.add(r.penalidad);
        if (r.monthName && r.monthName !== 'SIN MES') meses.add(r.monthName);
      });

      return {
        years: ['2026'],
        campanas: Array.from(supervisors).sort(),       // Mapeado al slot 1 (Supervisor)
        estados: Array.from(estados).sort(),            // Mapeado al slot 2 (Estado)
        responsabilidades: Array.from(conclusiones).sort(), // Mapeado al slot 3 (Conclusión)
        respuestas: Array.from(penalidades).sort(),     // Mapeado al slot 4 (Penalidad)
        meses: MONTH_NAMES.filter(m => meses.has(m))
      };
    }

    const years = new Set();
    const campanas = new Set();
    const estados = new Set();
    const responsabilidades = new Set();
    const respuestas = new Set();
    const meses = new Set();

    this.enrichedReclamos.forEach(r => {
      if (r.year) years.add(r.year);
      if (r.campana) campanas.add(r.campana);
      if (r.estado) estados.add(r.estado);
      if (r.responsabilidad) responsabilidades.add(r.responsabilidad);
      if (r.respuesta) respuestas.add(r.respuesta);
      if (r.monthName) meses.add(r.monthName);
    });

    return {
      years: Array.from(years).sort(),
      campanas: Array.from(campanas).sort(),
      estados: Array.from(estados).sort(),
      responsabilidades: Array.from(responsabilidades).sort(),
      respuestas: Array.from(respuestas).sort(),
      meses: MONTH_NAMES.filter(m => meses.has(m))
    };
  },

  mapKeyForActiveBrand(key) {
    if (this.activeBrand !== 'movistar') return key;
    const map = {
      campana: 'supervisor',
      estado: 'estado',
      responsabilidad: 'conclusion',
      respuesta: 'penalidad',
      mes: 'mes'
    };
    return map[key] || key;
  },

  getActiveFilterArray(uiKey) {
    if (this.activeBrand === 'movistar') {
      const mKey = this.mapKeyForActiveBrand(uiKey);
      return Array.isArray(this.movFilters[mKey]) ? this.movFilters[mKey] : [];
    }
    return Array.isArray(this.filters[uiKey]) ? this.filters[uiKey] : [];
  },

  setFilter(key, value) {
    if (this.activeBrand === 'movistar') {
      this.movFilters[key] = value;
    } else {
      this.filters[key] = value;
    }
    this.notify();
  },

  toggleFilterOption(uiKey, optionVal) {
    const targetObj = this.activeBrand === 'movistar' ? this.movFilters : this.filters;
    const realKey = this.mapKeyForActiveBrand(uiKey);

    if (!Array.isArray(targetObj[realKey])) {
      targetObj[realKey] = [];
    }
    const arr = [...targetObj[realKey]];
    const idx = arr.indexOf(optionVal);
    if (idx >= 0) {
      arr.splice(idx, 1);
    } else {
      arr.push(optionVal);
    }
    targetObj[realKey] = arr;
    this.notify();
  },

  clearFilterKey(uiKey) {
    const targetObj = this.activeBrand === 'movistar' ? this.movFilters : this.filters;
    const realKey = this.mapKeyForActiveBrand(uiKey);
    targetObj[realKey] = [];
    this.notify();
  },

  resetFilters() {
    if (this.activeBrand === 'movistar') {
      this.movFilters = {
        year: '2026',
        supervisor: [],
        estado: [],
        conclusion: [],
        penalidad: [],
        mes: []
      };
    } else {
      this.filters = {
        year: this.filters.year,
        campana: [],
        estado: [],
        responsabilidad: [],
        respuesta: [],
        mes: []
      };
    }
    this.crossFilter = null;
    this.notify();
  }
};


// ===== FILE: charts.js =====
/**
 * charts.js - Gestor de instancias, renderizado de Apache ECharts y Cross-Highlighting Estilo Power BI
 */

window.ChartManager = {
  instances: {},

  initChart(elementId) {
    const el = document.getElementById(elementId);
    if (!el) return null;
    if (this.instances[elementId]) {
      this.instances[elementId].dispose();
    }
    const chart = echarts.init(el);
    this.instances[elementId] = chart;
    return chart;
  },

  get(elementId) {
    return this.instances[elementId] || this.initChart(elementId);
  },

  bindCrossFilter(chart, chartId, fieldName, categories = null) {
    if (!chart) return;
    chart.off('click');

    let clickedOnElement = false;

    // 1. Click directo sobre la barra, punto o etiqueta
    chart.on('click', (params) => {
      const catVal = params && (params.name || params.value);
      if (catVal && typeof catVal === 'string' && window.Store) {
        clickedOnElement = true;
        window.Store.toggleCrossFilter(fieldName, catVal, chartId);
      }
    });

    // 2. Click en cualquier parte de la fila/columna de sombra (ZRender) o en espacio vacío
    const zr = chart.getZr();
    if (zr) {
      zr.off('click');
      zr.on('click', (event) => {
        if (clickedOnElement) {
          clickedOnElement = false;
          return;
        }
        const pointInPixel = [event.offsetX, event.offsetY];
        if (categories && categories.length > 0 && chart.containPixel('grid', pointInPixel)) {
          try {
            const pointInGrid = chart.convertFromPixel({ seriesIndex: 0 }, pointInPixel);
            // Determinar si el eje de categorías es Y (horizontal) o X (vertical)
            const opt = chart.getOption();
            const isHorizontal = opt.yAxis && opt.yAxis[0] && opt.yAxis[0].type === 'category';
            const catIdx = Math.round(isHorizontal ? pointInGrid[1] : pointInGrid[0]);
            if (catIdx >= 0 && catIdx < categories.length && window.Store) {
              window.Store.toggleCrossFilter(fieldName, categories[catIdx], chartId);
              return;
            }
          } catch (e) {
            // ignorar error de conversión
          }
        }
        // Si hizo clic fuera del área de barras y hay un filtro activo, limpiarlo
        if (!event.target && window.Store && window.Store.crossFilter) {
          window.Store.clearCrossFilter();
        }
      });
    }
  },

  getTooltipTheme() {
    return {
      backgroundColor: 'rgba(15, 23, 42, 0.92)',
      borderColor: '#334155',
      borderWidth: 1,
      padding: [8, 12],
      textStyle: {
        color: '#F8FAFC',
        fontSize: 11,
        fontFamily: 'Inter, system-ui, sans-serif'
      },
      extraCssText: 'border-radius: 6px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25); backdrop-filter: blur(4px);'
    };
  },

  resizeAll() {
    Object.values(this.instances).forEach(chart => {
      if (chart && !chart.isDisposed()) {
        chart.resize();
      }
    });
  },

  // 1. Gráfico Horizontal: Reclamos Fundados por Mes (%) con Cross-Highlighting Power BI
  renderFundadosPorMes(chartId, data) {
    const chart = this.get(chartId);
    if (!chart) return;

    const baseData = window.Store ? window.Store.getBaseFilteredData() : data;
    const cf = window.Store ? window.Store.crossFilter : null;
    const isSource = cf && cf.sourceId === chartId;
    const isSameFieldCF = cf && cf.field === 'monthName';
    const hasCrossMeasure = cf && !isSameFieldCF;

    const months = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
    const revMonths = months.slice().reverse();

    const basePcts = [];
    const fgPcts = [];

    revMonths.forEach(m => {
      const bRows = baseData.filter(r => r.monthName === m);
      const bTot = bRows.length;
      const bFund = bRows.filter(r => r.isFundado).length;
      const bPct = bTot > 0 ? Math.round((bFund / bTot) * 100) : 0;
      basePcts.push(bPct);

      if (hasCrossMeasure) {
        const fRows = data.filter(r => r.monthName === m);
        const fTot = fRows.length;
        const fFund = fRows.filter(r => r.isFundado).length;
        const fPct = fTot > 0 ? Math.round((fFund / fTot) * 100) : 0;
        fgPcts.push(fPct);
      }
    });

    const series = [];

    if (hasCrossMeasure) {
      // Sombra de fondo (Total sin filtrar) estilo Power BI
      series.push({
        name: 'Total Mes',
        type: 'bar',
        data: basePcts,
        barWidth: 15,
        itemStyle: {
          color: 'rgba(75, 107, 148, 0.28)',
          borderRadius: 2
        },
        silent: true,
        tooltip: { show: false }
      });
      // Barra superpuesta resaltada (Dato filtrado)
      series.push({
        name: 'Seleccionado',
        type: 'bar',
        barGap: '-78%',
        data: fgPcts,
        barWidth: 9,
        z: 3,
        itemStyle: {
          color: '#1E3A8A',
          borderRadius: 2
        },
        label: {
          show: true,
          position: 'right',
          formatter: '{c} %',
          color: '#0F172A',
          fontSize: 10,
          fontWeight: 700
        }
      });
    } else {
      series.push({
        type: 'bar',
        data: revMonths.map((m, idx) => {
          const isSelected = isSameFieldCF && cf.value === m;
          const isDimmed = isSameFieldCF && cf.value !== m;
          return {
            value: basePcts[idx],
            itemStyle: {
              color: isSelected ? '#1E3A8A' : '#4B6B94',
              opacity: isDimmed ? 0.25 : 1,
              borderRadius: 2
            }
          };
        }),
        barWidth: 11,
        label: {
          show: true,
          position: 'right',
          formatter: '{c} %',
          color: '#1E293B',
          fontSize: 10,
          fontWeight: 600
        }
      });
    }

    const option = {
      grid: { top: 10, bottom: 20, left: 95, right: 45 },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        ...this.getTooltipTheme(),
        formatter: (params) => {
          const item = params[params.length - 1];
          const val = typeof item.value === 'object' ? item.value.value : item.value;
          return `<strong>${item.name}</strong><br/>% Fundados: <strong>${val}%</strong>`;
        }
      },
      xAxis: { type: 'value', max: 100, show: false },
      yAxis: {
        type: 'category',
        data: revMonths,
        triggerEvent: true,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: (val) => (isSameFieldCF && cf.value === val) ? '#0F172A' : '#64748B',
          fontWeight: (val) => (isSameFieldCF && cf.value === val) ? 800 : 600,
          fontSize: 10
        }
      },
      series
    };

    chart.setOption(option, true);
    this.bindCrossFilter(chart, chartId, 'monthName', revMonths);
  },

  // 2. Gráfico Horizontal Naranja: Top 5 - Reclamos Fundados con Sombra Superpuesta Power BI
  renderTop5Fundados(chartId, data) {
    const chart = this.get(chartId);
    if (!chart) return;

    const baseData = window.Store ? window.Store.getBaseFilteredData() : data;
    const cf = window.Store ? window.Store.crossFilter : null;
    const isSameFieldCF = cf && cf.field === 'monthName';
    const hasCrossMeasure = cf && !isSameFieldCF;

    const months = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];

    // Si hay cross-filter de otra dimensión (ej. Campaña o Supervisor), ordenamos por esa selección; si es por Mes, mantenemos los 5 meses base y resaltamos el elegido
    const activeSet = hasCrossMeasure ? data : baseData;
    const monthStats = months.map(m => {
      const fRows = activeSet.filter(r => r.monthName === m);
      const fTot = fRows.length;
      const fFund = fRows.filter(r => r.isFundado).length;
      const fPct = fTot > 0 ? Math.round((fFund / fTot) * 100) : 0;

      const bRows = baseData.filter(r => r.monthName === m);
      const bTot = bRows.length;
      const bFund = bRows.filter(r => r.isFundado).length;
      const bPct = bTot > 0 ? Math.round((bFund / bTot) * 100) : 0;

      return { month: m, pct: fPct, basePct: bPct, total: bTot };
    }).filter(s => s.total > 0);

    monthStats.sort((a, b) => b.pct - a.pct);
    const top5 = monthStats.slice(0, 5).reverse();
    const top5Months = top5.map(t => t.month);

    const series = [];

    if (hasCrossMeasure) {
      series.push({
        name: 'Base',
        type: 'bar',
        data: top5.map(t => t.basePct),
        barWidth: 18,
        itemStyle: {
          color: 'rgba(250, 100, 0, 0.25)',
          borderRadius: 2
        },
        silent: true,
        tooltip: { show: false }
      });
      series.push({
        name: 'Seleccionado',
        type: 'bar',
        barGap: '-78%',
        data: top5.map(t => t.pct),
        barWidth: 10,
        z: 3,
        itemStyle: {
          color: '#E05D26',
          borderRadius: 2
        },
        label: {
          show: true,
          position: 'right',
          formatter: '{c} %',
          color: '#1E293B',
          fontSize: 10,
          fontWeight: 700
        }
      });
    } else {
      series.push({
        type: 'bar',
        data: top5.map(t => {
          const isSelected = isSameFieldCF && cf.value === t.month;
          const isDimmed = isSameFieldCF && cf.value !== t.month;
          return {
            value: t.pct,
            itemStyle: {
              color: isSelected ? '#C2410C' : '#FA6400',
              opacity: isDimmed ? 0.25 : 1,
              borderColor: isSelected ? '#7C2D12' : 'transparent',
              borderWidth: isSelected ? 1.5 : 0,
              borderRadius: 2
            }
          };
        }),
        barWidth: 13,
        label: {
          show: true,
          position: 'right',
          formatter: '{c} %',
          color: '#1E293B',
          fontSize: 10,
          fontWeight: 700
        }
      });
    }

    const option = {
      grid: { top: 10, bottom: 20, left: 80, right: 45 },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        ...this.getTooltipTheme(),
        formatter: (params) => {
          const item = params[params.length - 1];
          const val = typeof item.value === 'object' ? item.value.value : item.value;
          return `<strong>${item.name}</strong><br/>% Fundados: <strong>${val}%</strong>`;
        }
      },
      xAxis: { type: 'value', max: 100, show: false },
      yAxis: {
        type: 'category',
        data: top5Months,
        triggerEvent: true,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: (val) => (isSameFieldCF && cf.value === val) ? '#9A3412' : '#64748B',
          fontWeight: (val) => (isSameFieldCF && cf.value === val) ? 800 : 600,
          fontSize: 10
        }
      },
      series
    };

    chart.setOption(option, true);
    this.bindCrossFilter(chart, chartId, 'monthName', top5Months);
  },

  // 3. Combo Chart: Reclamos Fundados por Campaña (Barras Q + Línea % con Resaltado al Clic)
  renderFundadosPorCampana(chartId, data) {
    const chart = this.get(chartId);
    if (!chart) return;

    const baseData = window.Store ? window.Store.getBaseFilteredData() : data;
    const cf = window.Store ? window.Store.crossFilter : null;
    const isSource = cf && cf.sourceId === chartId;
    const hasExternalCF = cf && !isSource;

    const sourceRows = isSource ? baseData : data;

    const campanaMap = new Map();
    sourceRows.forEach(r => {
      const c = r.campana || 'OTRO';
      if (!campanaMap.has(c)) {
        campanaMap.set(c, { total: 0, fundados: 0 });
      }
      const stat = campanaMap.get(c);
      stat.total++;
      if (r.isFundado) stat.fundados++;
    });

    const sortedEntries = Array.from(campanaMap.entries()).sort((a, b) => b[1].total - a[1].total);
    const categories = sortedEntries.map(e => e[0]).slice(0, 12);
    const qValues = categories.map(c => {
      const val = campanaMap.get(c).total;
      const isSelected = (isSource && cf.value === c) || (hasExternalCF && cf.field === 'campana' && cf.value === c);
      const isDimmed = (isSource && cf.value !== c) || (hasExternalCF && cf.field === 'campana' && cf.value !== c);
      return {
        value: val,
        itemStyle: {
          color: isSelected ? '#1E3A8A' : '#2563EB',
          opacity: isDimmed ? 0.25 : 1,
          borderRadius: [2, 2, 0, 0]
        }
      };
    });

    const pctValues = categories.map(c => {
      const s = campanaMap.get(c);
      return s.total > 0 ? Math.round((s.fundados / s.total) * 100) : 0;
    });

    const option = {
      grid: { top: 30, bottom: 42, left: 40, right: 45 },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' },
        ...this.getTooltipTheme(),
        formatter: (params) => {
          let s = `<strong>${params[0].name}</strong><br/>`;
          params.forEach(p => {
            const v = typeof p.value === 'object' ? p.value.value : p.value;
            if (p.seriesName === 'Q') {
              s += `Volumen Reclamos: <strong>${v}</strong><br/>`;
            } else {
              s += `% Fundados: <strong>${v}%</strong><br/>`;
            }
          });
          return s;
        }
      },
      xAxis: {
        type: 'category',
        data: categories,
        triggerEvent: true,
        axisLine: { lineStyle: { color: '#CBD5E1' } },
        axisLabel: {
          color: (val) => (cf && cf.field === 'campana' && cf.value === val) ? '#0F172A' : '#475569',
          fontWeight: (val) => (cf && cf.field === 'campana' && cf.value === val) ? 800 : 500,
          fontSize: 9,
          interval: 0,
          rotate: 20
        }
      },
      yAxis: [
        { type: 'value', show: false },
        {
          type: 'value',
          min: 0,
          max: 100,
          interval: 20,
          axisLabel: { formatter: '{value}%', color: '#64748B', fontSize: 9 },
          splitLine: { show: true, lineStyle: { type: 'dashed', color: '#F1F5F9' } }
        }
      ],
      series: [
        {
          name: 'Q',
          type: 'bar',
          data: qValues,
          barWidth: 26,
          label: {
            show: true,
            position: 'top',
            color: '#1E293B',
            fontSize: 9,
            fontWeight: 700,
            formatter: (p) => {
              const v = typeof p.value === 'object' ? p.value.value : p.value;
              return v >= 1000 ? (v / 1000).toFixed(1) + ' mil' : v;
            }
          }
        },
        {
          name: '%',
          type: 'line',
          yAxisIndex: 1,
          data: pctValues,
          symbol: 'circle',
          symbolSize: 6,
          itemStyle: { color: '#FA6400' },
          lineStyle: { width: 2.5, color: '#FA6400' },
          label: {
            show: true,
            position: 'top',
            formatter: '{c}%',
            color: '#C2410C',
            fontSize: 9,
            fontWeight: 700,
            backgroundColor: 'rgba(255,255,255,0.85)',
            padding: [1, 3],
            borderRadius: 2
          }
        }
      ]
    };

    chart.setOption(option, true);
    this.bindCrossFilter(chart, chartId, 'campana', categories);
  },

  // 4. Detalle: Respuesta por Cuartil (100% Apilado Horizontal con Cross-Filter)
  renderCuartil100(chartId, data) {
    const chart = this.get(chartId);
    if (!chart) return;

    const baseData = window.Store ? window.Store.getBaseFilteredData() : data;
    const cf = window.Store ? window.Store.crossFilter : null;
    const isSameFieldCF = cf && cf.field === 'cuartil';
    const activeData = isSameFieldCF ? baseData : data;

    const cuartiles = ['Q4', 'Q3', 'NO TIENE', 'Q1', 'Q2'];
    const fundadoPcts = [];
    const infundadoPcts = [];

    cuartiles.forEach(q => {
      const rows = activeData.filter(r => r.cuartil === q);
      const total = rows.length;
      const f = rows.filter(r => r.isFundado).length;
      const inf = rows.filter(r => r.isInfundado).length;
      const fPct = total > 0 ? +( (f / total) * 100 ).toFixed(2) : 0;
      const infPct = total > 0 ? +( (inf / total) * 100 ).toFixed(2) : 0;
      const isDimmed = isSameFieldCF && cf.value !== q;

      fundadoPcts.push({
        value: fPct,
        itemStyle: { color: '#4271B3', opacity: isDimmed ? 0.28 : 1 }
      });
      infundadoPcts.push({
        value: infPct,
        itemStyle: { color: '#E05D26', opacity: isDimmed ? 0.28 : 1 }
      });
    });

    const option = {
      grid: { top: 8, bottom: 8, left: 58, right: 10 },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        ...this.getTooltipTheme()
      },
      xAxis: { type: 'value', max: 100, show: false },
      yAxis: {
        type: 'category',
        data: cuartiles,
        triggerEvent: true,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: '#475569', fontSize: 9, fontWeight: 600 }
      },
      series: [
        {
          name: 'Fundado',
          type: 'bar',
          stack: 'total',
          data: fundadoPcts,
          label: {
            show: true,
            formatter: (p) => {
              const v = typeof p.value === 'object' ? p.value.value : p.value;
              return v > 8 ? v.toFixed(2).replace('.', ',') + '%' : '';
            },
            fontSize: 8,
            color: '#fff',
            position: 'inside'
          }
        },
        {
          name: 'Infundado',
          type: 'bar',
          stack: 'total',
          data: infundadoPcts,
          label: {
            show: true,
            formatter: (p) => {
              const v = typeof p.value === 'object' ? p.value.value : p.value;
              return v > 8 ? v.toFixed(2).replace('.', ',') + '%' : '';
            },
            fontSize: 8,
            color: '#fff',
            position: 'inside'
          }
        }
      ]
    };

    chart.setOption(option, true);
    this.bindCrossFilter(chart, chartId, 'cuartil', cuartiles);
    setTimeout(() => chart.resize(), 50);
  },

  // 5. Detalle: Reclamo por Responsabilidad (100% Apilado Vertical con Cross-Filter)
  renderResponsabilidad100(chartId, data) {
    const chart = this.get(chartId);
    if (!chart) return;

    const baseData = window.Store ? window.Store.getBaseFilteredData() : data;
    const cf = window.Store ? window.Store.crossFilter : null;
    const isSameFieldCF = cf && cf.field === 'responsabilidad';
    const activeData = isSameFieldCF ? baseData : data;

    const respSet = new Set();
    activeData.forEach(d => { if (d.responsabilidad) respSet.add(d.responsabilidad); });
    const resps = Array.from(respSet).sort();

    const fundados = [];
    const infundados = [];

    resps.forEach(r => {
      const rows = activeData.filter(d => d.responsabilidad === r);
      const tot = rows.length;
      const f = rows.filter(d => d.isFundado).length;
      const inf = rows.filter(d => d.isInfundado).length;
      const isDimmed = isSameFieldCF && cf.value !== r;

      fundados.push({
        value: tot > 0 ? +( (f / tot) * 100 ).toFixed(2) : 0,
        itemStyle: { color: '#4271B3', opacity: isDimmed ? 0.28 : 1 }
      });
      infundados.push({
        value: tot > 0 ? +( (inf / tot) * 100 ).toFixed(2) : 0,
        itemStyle: { color: '#E05D26', opacity: isDimmed ? 0.28 : 1 }
      });
    });

    const option = {
      grid: { top: 15, bottom: 25, left: 25, right: 25 },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        ...this.getTooltipTheme()
      },
      xAxis: {
        type: 'category',
        data: resps,
        triggerEvent: true,
        axisLine: { lineStyle: { color: '#CBD5E1' } },
        axisLabel: { color: '#475569', fontSize: 9, fontWeight: 600 }
      },
      yAxis: { type: 'value', max: 100, show: false },
      series: [
        {
          name: 'Fundado',
          type: 'bar',
          stack: 'total',
          barWidth: 36,
          data: fundados,
          label: {
            show: true,
            formatter: (p) => {
              const v = typeof p.value === 'object' ? p.value.value : p.value;
              return v > 8 ? v.toFixed(2).replace('.', ',') + '%' : '';
            },
            fontSize: 8,
            color: '#fff',
            position: 'inside'
          }
        },
        {
          name: 'Infundado',
          type: 'bar',
          stack: 'total',
          barWidth: 36,
          data: infundados,
          label: {
            show: true,
            formatter: (p) => {
              const v = typeof p.value === 'object' ? p.value.value : p.value;
              return v > 8 ? v.toFixed(2).replace('.', ',') + '%' : '';
            },
            fontSize: 8,
            color: '#fff',
            position: 'inside'
          }
        }
      ]
    };

    chart.setOption(option, true);
    this.bindCrossFilter(chart, chartId, 'responsabilidad', resps);
    setTimeout(() => chart.resize(), 50);
  },

  // 6. Detalle: Reclamo por Tipo de Respuesta - Mensual (100% Apilado Horizontal con Cross-Filter)
  renderDetalleMensual100(chartId, data) {
    const chart = this.get(chartId);
    if (!chart) return;

    const baseData = window.Store ? window.Store.getBaseFilteredData() : data;
    const cf = window.Store ? window.Store.crossFilter : null;
    const isSameFieldCF = cf && cf.field === 'monthName';
    const activeData = isSameFieldCF ? baseData : data;

    const months = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
    const revMonths = months.slice().reverse();
    const fundados = [];
    const infundados = [];

    revMonths.forEach(m => {
      const rows = activeData.filter(d => d.monthName === m);
      const tot = rows.length;
      const f = rows.filter(d => d.isFundado).length;
      const inf = rows.filter(d => d.isInfundado).length;
      const isDimmed = isSameFieldCF && cf.value !== m;

      fundados.push({
        value: tot > 0 ? +( (f / tot) * 100 ).toFixed(2) : 0,
        itemStyle: { color: '#4271B3', opacity: isDimmed ? 0.28 : 1 }
      });
      infundados.push({
        value: tot > 0 ? +( (inf / tot) * 100 ).toFixed(2) : 0,
        itemStyle: { color: '#E05D26', opacity: isDimmed ? 0.28 : 1 }
      });
    });

    const option = {
      grid: { top: 6, bottom: 6, left: 65, right: 10 },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        ...this.getTooltipTheme()
      },
      xAxis: { type: 'value', max: 100, show: false },
      yAxis: {
        type: 'category',
        data: revMonths,
        triggerEvent: true,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: '#475569', fontSize: 8, fontWeight: 600 }
      },
      series: [
        {
          name: 'Fundado',
          type: 'bar',
          stack: 'total',
          data: fundados,
          label: {
            show: true,
            formatter: (p) => {
              const v = typeof p.value === 'object' ? p.value.value : p.value;
              return v > 8 ? v.toFixed(2).replace('.', ',') + '%' : '';
            },
            fontSize: 7.5,
            color: '#fff',
            position: 'inside'
          }
        },
        {
          name: 'Infundado',
          type: 'bar',
          stack: 'total',
          data: infundados,
          label: {
            show: true,
            formatter: (p) => {
              const v = typeof p.value === 'object' ? p.value.value : p.value;
              return v > 8 ? v.toFixed(2).replace('.', ',') + '%' : '';
            },
            fontSize: 7.5,
            color: '#fff',
            position: 'inside'
          }
        }
      ]
    };

    chart.setOption(option, true);
    this.bindCrossFilter(chart, chartId, 'monthName', revMonths);
    setTimeout(() => chart.resize(), 50);
  },

  // =========================================================================
  // GRÁFICOS MOVISTAR (TRIPLETAS Y REVERSAS CON CROSS-HIGHLIGHTING POWER BI)
  // =========================================================================

  // M1. Evolutivo Mensual de Tripletas o Reversas (Barras Horizontales con Sombra Power BI)
  renderMovTripletasMes(chartId, data, mode = 'TRIPLETAS') {
    const chart = this.get(chartId);
    if (!chart) return;

    const isRev = mode === 'REVERSAS';
    const baseData = window.Store
      ? (isRev ? window.Store.getMovBaseReversas() : window.Store.getMovBaseTripletas())
      : data;
    const cf = window.Store ? window.Store.crossFilter : null;
    const isSameFieldCF = cf && cf.field === 'monthName';
    const hasCrossMeasure = cf && !isSameFieldCF;

    const allMonths = ['MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
    const presentMonths = allMonths.filter(m => baseData.some(r => r.monthName === m));
    const defaultMonths = isRev ? ['JULIO', 'AGOSTO', 'SEPTIEMBRE'] : ['MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE'];
    const revMonths = (presentMonths.length > 0 ? presentMonths : defaultMonths).slice().reverse();

    const baseTotals = [];
    const fgTotals = [];
    const fgPcts = [];
    const totalGlobalFg = (hasCrossMeasure ? data : baseData).length || 1;

    revMonths.forEach(m => {
      const bRows = baseData.filter(r => r.monthName === m);
      baseTotals.push(bRows.length);

      const fRows = (hasCrossMeasure ? data : baseData).filter(r => r.monthName === m);
      const fTot = fRows.length;
      if (isRev) {
        const sharePct = Math.round((fTot / totalGlobalFg) * 100);
        fgTotals.push(fTot);
        fgPcts.push(sharePct);
      } else {
        const fFund = fRows.filter(r => r.isFundado).length;
        const fPct = fTot > 0 ? Math.round((fFund / fTot) * 100) : 0;
        fgTotals.push(fTot);
        fgPcts.push(fPct);
      }
    });

    const maxVal = Math.max(...baseTotals, 5) * 1.25;
    const series = [];
    const mainColor = isRev ? '#0D9488' : '#0284C7';
    const activeColor = isRev ? '#0F766E' : '#0369A1';
    const shadowColor = isRev ? 'rgba(13, 148, 136, 0.22)' : 'rgba(14, 165, 233, 0.22)';
    const suffixText = isRev ? '% Total' : '% Fund.';

    if (hasCrossMeasure) {
      series.push({
        name: 'Total Mes',
        type: 'bar',
        data: baseTotals,
        barWidth: 16,
        itemStyle: { color: shadowColor, borderRadius: 2 },
        silent: true,
        tooltip: { show: false }
      });
      series.push({
        name: 'Seleccionado',
        type: 'bar',
        barGap: '-78%',
        data: fgTotals,
        barWidth: 10,
        z: 3,
        itemStyle: { color: mainColor, borderRadius: 2 },
        label: {
          show: true,
          position: 'right',
          formatter: (p) => `${p.value} (${fgPcts[p.dataIndex]}${suffixText})`,
          color: '#0F172A',
          fontSize: 9.5,
          fontWeight: 700
        }
      });
    } else {
      series.push({
        type: 'bar',
        data: revMonths.map((m, idx) => {
          const isSelected = isSameFieldCF && cf.value === m;
          const isDimmed = isSameFieldCF && cf.value !== m;
          return {
            value: baseTotals[idx],
            itemStyle: {
              color: isSelected ? activeColor : mainColor,
              opacity: isDimmed ? 0.25 : 1,
              borderRadius: 2
            }
          };
        }),
        barWidth: 13,
        label: {
          show: true,
          position: 'right',
          formatter: (p) => {
            const v = typeof p.value === 'object' ? p.value.value : p.value;
            return `${v} (${fgPcts[p.dataIndex]}${suffixText})`;
          },
          color: '#1E293B',
          fontSize: 9.5,
          fontWeight: 600
        }
      });
    }

    const option = {
      grid: { top: 8, bottom: 16, left: 85, right: 90 },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        ...this.getTooltipTheme(),
        formatter: (params) => {
          const item = params[params.length - 1];
          const v = typeof item.value === 'object' ? item.value.value : item.value;
          const pct = fgPcts[item.dataIndex] || 0;
          return isRev
            ? `<strong>${item.name}</strong><br/>Reversas: <strong>${v}</strong><br/>Participación: <strong>${pct}%</strong>`
            : `<strong>${item.name}</strong><br/>Tripletas: <strong>${v}</strong><br/>% Fundados: <strong>${pct}%</strong>`;
        }
      },
      xAxis: { type: 'value', max: maxVal, show: false },
      yAxis: {
        type: 'category',
        data: revMonths,
        triggerEvent: true,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: (val) => (isSameFieldCF && cf.value === val) ? '#0F172A' : '#64748B',
          fontWeight: (val) => (isSameFieldCF && cf.value === val) ? 800 : 600,
          fontSize: 9.5
        }
      },
      series
    };

    chart.setOption(option, true);
    this.bindCrossFilter(chart, chartId, 'monthName', revMonths);
  },

  // M2. Distribución por Queja en Particular / Subtipo (Barras Horizontales Naranjas)
  renderMovQuejasTop(chartId, data) {
    const chart = this.get(chartId);
    if (!chart) return;

    const baseData = window.Store ? window.Store.getMovBaseTripletas() : data;
    const cf = window.Store ? window.Store.crossFilter : null;
    const isSameFieldCF = cf && cf.field === 'quejaParticular';
    const hasCrossMeasure = cf && !isSameFieldCF;

    const activeSet = hasCrossMeasure ? data : baseData;
    const qMap = new Map();
    baseData.forEach(r => {
      const k = r.quejaParticular || 'OTRO';
      if (!qMap.has(k)) qMap.set(k, { baseTotal: 0, fgTotal: 0, fgFund: 0 });
      qMap.get(k).baseTotal++;
    });
    activeSet.forEach(r => {
      const k = r.quejaParticular || 'OTRO';
      if (!qMap.has(k)) qMap.set(k, { baseTotal: 0, fgTotal: 0, fgFund: 0 });
      qMap.get(k).fgTotal++;
      if (r.isFundado) qMap.get(k).fgFund++;
    });

    const sorted = Array.from(qMap.entries())
      .sort((a, b) => b[1].baseTotal - a[1].baseTotal)
      .slice(0, 6)
      .reverse();

    const categories = sorted.map(e => e[0]);
    const maxVal = Math.max(...sorted.map(e => e[1].baseTotal), 10) * 1.22;
    const series = [];

    if (hasCrossMeasure) {
      series.push({
        name: 'Base',
        type: 'bar',
        data: sorted.map(e => e[1].baseTotal),
        barWidth: 16,
        itemStyle: { color: 'rgba(250, 100, 0, 0.24)', borderRadius: 2 },
        silent: true,
        tooltip: { show: false }
      });
      series.push({
        name: 'Seleccionado',
        type: 'bar',
        barGap: '-78%',
        data: sorted.map(e => e[1].fgTotal),
        barWidth: 10,
        z: 3,
        itemStyle: { color: '#EA580C', borderRadius: 2 },
        label: {
          show: true,
          position: 'right',
          formatter: '{c}',
          color: '#1E293B',
          fontSize: 9.5,
          fontWeight: 700
        }
      });
    } else {
      series.push({
        type: 'bar',
        data: sorted.map(([k, stat]) => {
          const isSelected = isSameFieldCF && cf.value === k;
          const isDimmed = isSameFieldCF && cf.value !== k;
          return {
            value: stat.baseTotal,
            itemStyle: {
              color: isSelected ? '#C2410C' : '#FA6400',
              opacity: isDimmed ? 0.25 : 1,
              borderRadius: 2
            }
          };
        }),
        barWidth: 13,
        label: {
          show: true,
          position: 'right',
          formatter: (p) => {
            const v = typeof p.value === 'object' ? p.value.value : p.value;
            const tot = baseData.length || 1;
            return `${v} (${Math.round((v / tot) * 100)}%)`;
          },
          color: '#1E293B',
          fontSize: 9.5,
          fontWeight: 700
        }
      });
    }

    const option = {
      grid: { top: 8, bottom: 16, left: 135, right: 58 },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        ...this.getTooltipTheme()
      },
      xAxis: { type: 'value', max: maxVal, show: false },
      yAxis: {
        type: 'category',
        data: categories,
        triggerEvent: true,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: (val) => (isSameFieldCF && cf.value === val) ? '#9A3412' : '#475569',
          fontWeight: (val) => (isSameFieldCF && cf.value === val) ? 800 : 600,
          fontSize: 9,
          formatter: (v) => v.length > 20 ? v.slice(0, 19) + '…' : v
        }
      },
      series
    };

    chart.setOption(option, true);
    this.bindCrossFilter(chart, chartId, 'quejaParticular', categories);
  },

  // M3. Top Centros de Atención (CAC / Plazas): Combo Barras Q + Línea % Fundados
  renderMovTopCAC(chartId, data) {
    const chart = this.get(chartId);
    if (!chart) return;

    const baseData = window.Store ? window.Store.getMovBaseTripletas() : data;
    const cf = window.Store ? window.Store.crossFilter : null;
    const isSameFieldCF = cf && cf.field === 'cac';
    const sourceRows = isSameFieldCF ? baseData : data;

    const cacMap = new Map();
    sourceRows.forEach(r => {
      const c = r.cac || 'SIN CAC';
      if (!cacMap.has(c)) cacMap.set(c, { total: 0, fundados: 0 });
      const st = cacMap.get(c);
      st.total++;
      if (r.isFundado) st.fundados++;
    });

    const sorted = Array.from(cacMap.entries())
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 10);

    const categories = sorted.map(e => e[0]);
    const qValues = categories.map(c => {
      const val = cacMap.get(c).total;
      const isSelected = isSameFieldCF && cf.value === c;
      const isDimmed = isSameFieldCF && cf.value !== c;
      return {
        value: val,
        itemStyle: {
          color: isSelected ? '#1E3A8A' : '#2563EB',
          opacity: isDimmed ? 0.25 : 1,
          borderRadius: [2, 2, 0, 0]
        }
      };
    });

    const pctValues = categories.map(c => {
      const s = cacMap.get(c);
      return s.total > 0 ? Math.round((s.fundados / s.total) * 100) : 0;
    });

    const option = {
      grid: { top: 26, bottom: 48, left: 32, right: 38 },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' },
        ...this.getTooltipTheme(),
        formatter: (params) => {
          let s = `<strong>${params[0].name}</strong><br/>`;
          params.forEach(p => {
            const v = typeof p.value === 'object' ? p.value.value : p.value;
            s += p.seriesName === 'Q' ? `Tripletas: <strong>${v}</strong><br/>` : `% Fundados: <strong>${v}%</strong><br/>`;
          });
          return s;
        }
      },
      xAxis: {
        type: 'category',
        data: categories,
        triggerEvent: true,
        axisLine: { lineStyle: { color: '#CBD5E1' } },
        axisLabel: {
          color: (val) => (isSameFieldCF && cf.value === val) ? '#0F172A' : '#475569',
          fontWeight: (val) => (isSameFieldCF && cf.value === val) ? 800 : 500,
          fontSize: 8.5,
          interval: 0,
          rotate: 22,
          formatter: (v) => v.replace('CAC ', '').replace('MINI ', 'M.').slice(0, 14)
        }
      },
      yAxis: [
        { type: 'value', show: false },
        {
          type: 'value',
          min: 0,
          max: 100,
          interval: 25,
          axisLabel: { formatter: '{value}%', color: '#64748B', fontSize: 8.5 },
          splitLine: { show: true, lineStyle: { type: 'dashed', color: '#F1F5F9' } }
        }
      ],
      series: [
        {
          name: 'Q',
          type: 'bar',
          data: qValues,
          barWidth: 22,
          label: { show: true, position: 'top', color: '#1E293B', fontSize: 9, fontWeight: 700 }
        },
        {
          name: '%',
          type: 'line',
          yAxisIndex: 1,
          data: pctValues,
          symbol: 'circle',
          symbolSize: 5,
          itemStyle: { color: '#FA6400' },
          lineStyle: { width: 2, color: '#FA6400' },
          label: {
            show: true,
            position: 'top',
            formatter: '{c}%',
            color: '#C2410C',
            fontSize: 8.5,
            fontWeight: 700,
            backgroundColor: 'rgba(255,255,255,0.85)',
            padding: [1, 2],
            borderRadius: 2
          }
        }
      ]
    };

    chart.setOption(option, true);
    this.bindCrossFilter(chart, chartId, 'cac', categories);
  },

  // M4. Reversas por Operador Donador (TELCEL, ALTAN, AT&T)
  renderMovReversasDonador(chartId, data) {
    const chart = this.get(chartId);
    if (!chart) return;

    const baseData = window.Store ? window.Store.getMovBaseReversas() : data;
    const cf = window.Store ? window.Store.crossFilter : null;
    const isSameFieldCF = cf && cf.field === 'donador';
    const activeData = isSameFieldCF ? baseData : data;

    const donMap = new Map();
    activeData.forEach(r => {
      const d = r.donador || 'OTRO';
      donMap.set(d, (donMap.get(d) || 0) + 1);
    });

    const sorted = Array.from(donMap.entries()).sort((a, b) => b[1] - a[1]);
    const categories = sorted.map(e => e[0]);
    const totAll = activeData.length || 1;
    const maxVal = Math.max(...sorted.map(e => e[1]), 5) * 1.28;

    const option = {
      grid: { top: 6, bottom: 14, left: 72, right: 65 },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        ...this.getTooltipTheme()
      },
      xAxis: { type: 'value', max: maxVal, show: false },
      yAxis: {
        type: 'category',
        data: categories.slice().reverse(),
        triggerEvent: true,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: '#334155', fontSize: 9, fontWeight: 700 }
      },
      series: [
        {
          type: 'bar',
          barWidth: 14,
          data: sorted.slice().reverse().map(([k, val]) => {
            const isDimmed = isSameFieldCF && cf.value !== k;
            return {
              value: val,
              itemStyle: {
                color: k === 'TELCEL' ? '#0284C7' : (k === 'ALTAN' ? '#FA6400' : '#6366F1'),
                opacity: isDimmed ? 0.25 : 1,
                borderRadius: 3
              }
            };
          }),
          label: {
            show: true,
            position: 'right',
            formatter: (p) => {
              const v = typeof p.value === 'object' ? p.value.value : p.value;
              return `${v} (${Math.round((v / totAll) * 100)}%)`;
            },
            fontSize: 9,
            fontWeight: 700,
            color: '#0F172A'
          }
        }
      ]
    };

    const revCats = categories.slice().reverse();
    chart.setOption(option, true);
    this.bindCrossFilter(chart, chartId, 'donador', revCats);
  },

  // M5. Reversas por Punto de Venta (ID_VENDOR_POINT: TER00022, NTL00007, TER00021, NTL00006)
  renderMovReversasVendor(chartId, data) {
    const chart = this.get(chartId);
    if (!chart) return;

    const baseData = window.Store ? window.Store.getMovBaseReversas() : data;
    const cf = window.Store ? window.Store.crossFilter : null;
    const isSameFieldCF = cf && cf.field === 'vendorPoint';
    const activeData = isSameFieldCF ? baseData : data;

    const vpMap = new Map();
    activeData.forEach(r => {
      const vp = r.vendorPoint || 'OTRO';
      vpMap.set(vp, (vpMap.get(vp) || 0) + 1);
    });

    const sorted = Array.from(vpMap.entries()).sort((a, b) => b[1] - a[1]);
    const categories = sorted.map(e => e[0]);
    const maxVal = Math.max(...sorted.map(e => e[1]), 5) * 1.25;

    const option = {
      grid: { top: 20, bottom: 24, left: 25, right: 15 },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        ...this.getTooltipTheme()
      },
      xAxis: {
        type: 'category',
        data: categories,
        triggerEvent: true,
        axisLine: { lineStyle: { color: '#CBD5E1' } },
        axisLabel: { color: '#334155', fontSize: 9, fontWeight: 700 }
      },
      yAxis: { type: 'value', max: maxVal, show: false },
      series: [
        {
          type: 'bar',
          barWidth: 28,
          data: sorted.map(([k, val]) => {
            const isDimmed = isSameFieldCF && cf.value !== k;
            const isNetcall = k.startsWith('NTL');
            return {
              value: val,
              itemStyle: {
                color: isNetcall ? '#0EA5E9' : '#1E40AF',
                opacity: isDimmed ? 0.25 : 1,
                borderRadius: [3, 3, 0, 0]
              }
            };
          }),
          label: {
            show: true,
            position: 'top',
            formatter: (p) => {
              const v = typeof p.value === 'object' ? p.value.value : p.value;
              return v;
            },
            fontSize: 9.5,
            fontWeight: 700,
            color: '#0F172A'
          }
        }
      ]
    };

    chart.setOption(option, true);
    this.bindCrossFilter(chart, chartId, 'vendorPoint', categories);
  }
};

window.addEventListener('resize', () => {
  ChartManager.resizeAll();
});


// ===== FILE: portada.js =====
/**
 * portada.js - Controlador de la Vista 2: Portada (Matrices y Gráficos Estilo Power BI con Semaforización e Interacción Cruzada)
 */

window.PortadaView = {
  init() {
    if (this._initialized) return;
    this._initialized = true;

    const bindTableClick = (tableId, fieldName) => {
      const tbl = document.getElementById(tableId);
      if (!tbl) return;
      tbl.addEventListener('click', (e) => {
        const tr = e.target.closest('tbody tr:not(.row-total)');
        if (!tr) return;
        const val = tr.dataset.cfVal;
        if (val && window.Store) {
          window.Store.toggleCrossFilter(fieldName, val, tableId);
        }
      });
    };

    bindTableClick('table-respuesta-mes', 'monthName');
    bindTableClick('table-tipo-mes', 'monthName');
    bindTableClick('table-respuesta-sup', 'supervisor');
  },

  render(data) {
    this.init();

    // 1. Gráficos
    if (window.ChartManager) {
      ChartManager.renderFundadosPorMes('chart-fundados-mes', data);
      ChartManager.renderTop5Fundados('chart-top5-fundados', data);
      ChartManager.renderFundadosPorCampana('chart-fundados-campana', data);
    }

    // 2. Matrices (Si una tabla es el origen del clic, mantiene todas sus filas resaltando la activa)
    const getTableData = (tableId) => window.Store ? window.Store.getFilteredData(tableId) : data;
    this.renderMatrizRespuestaMes(getTableData('table-respuesta-mes'));
    this.renderMatrizTipoMes(getTableData('table-tipo-mes'));
    this.renderMatrizRespuestaSup(getTableData('table-respuesta-sup'));
  },

  // Semaforización por iconos (Verde: <=20% favorable, Amarillo: 21-35% alerta, Rojo: >35% crítico)
  getSem(pct) {
    if (pct === undefined || pct === null || pct === '-' || isNaN(pct) || pct <= 0) return '';
    if (pct <= 20) {
      return '<span class="sem-icon sem-green" title="Controlado (<=20%)">&#9679;</span> ';
    } else if (pct <= 35) {
      return '<span class="sem-icon sem-yellow" title="Alerta (21-35%)">&#9679;</span> ';
    } else {
      return '<span class="sem-icon sem-red" title="Crítico (>35%)">&#9679;</span> ';
    }
  },

  // Matriz 1: Reclamo por Tipo de Respuesta - Mensual
  renderMatrizRespuestaMes(data) {
    const months = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
    const tbody = document.querySelector('#table-respuesta-mes tbody');
    if (!tbody) return;

    const cf = window.Store ? window.Store.crossFilter : null;
    const isSource = cf && cf.sourceId === 'table-respuesta-mes';

    let totF = 0, totInf = 0, totAll = 0;
    let html = '';

    months.forEach(m => {
      const rows = data.filter(r => r.monthName === m);
      const q = rows.length;
      if (q === 0) return;

      const f = rows.filter(r => r.isFundado).length;
      const inf = rows.filter(r => r.isInfundado).length;
      const fPct = q > 0 ? Math.round((f / q) * 100) : 0;
      const infPct = q > 0 ? Math.round((inf / q) * 100) : 0;

      totF += f;
      totInf += inf;
      totAll += q;

      const isSelected = cf && cf.field === 'monthName' && cf.value === m;
      const isDimmed = isSource && cf.value !== m;
      const rowClass = isSelected ? 'cf-selected' : (isDimmed ? 'cf-dimmed' : '');

      html += `
        <tr class="cf-row ${rowClass}" data-cf-val="${m}">
          <td class="col-nombre">${m}</td>
          <td class="col-num">${f > 0 ? f : '-'}</td>
          <td class="col-num pct-cell">${f > 0 ? this.getSem(fPct) + fPct + '%' : '-'}</td>
          <td class="col-num">${inf > 0 ? inf : '-'}</td>
          <td class="col-num pct-cell">${inf > 0 ? infPct + '%' : '-'}</td>
          <td class="col-num">${q}</td>
          <td class="col-num">100%</td>
        </tr>
      `;
    });

    const totFPct = totAll > 0 ? Math.round((totF / totAll) * 100) : 0;
    const totInfPct = totAll > 0 ? Math.round((totInf / totAll) * 100) : 0;

    html += `
      <tr class="row-total">
        <td class="col-nombre">Total</td>
        <td class="col-num">${totF > 0 ? totF : '-'}</td>
        <td class="col-num">${totAll > 0 ? this.getSem(totFPct) + totFPct + '%' : '-'}</td>
        <td class="col-num">${totInf > 0 ? totInf : '-'}</td>
        <td class="col-num">${totAll > 0 ? totInfPct + '%' : '-'}</td>
        <td class="col-num">${totAll}</td>
        <td class="col-num">100%</td>
      </tr>
    `;

    tbody.innerHTML = html;
  },

  // Matriz 2: Tipo de Reclamo por Mes (Entel, Indecopi, Osiptel)
  renderMatrizTipoMes(data) {
    const months = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
    const tbody = document.querySelector('#table-tipo-mes tbody');
    if (!tbody) return;

    const cf = window.Store ? window.Store.crossFilter : null;
    const isSource = cf && cf.sourceId === 'table-tipo-mes';

    let totEntel = 0, totIndecopi = 0, totOsiptel = 0, totAll = 0;
    let html = '';

    months.forEach(m => {
      const rows = data.filter(r => r.monthName === m);
      const q = rows.length;
      if (q === 0) return;

      const entel = rows.filter(r => r.tipoReclamo.includes('ENTEL')).length;
      const indecopi = rows.filter(r => r.tipoReclamo.includes('INDECOPI')).length;
      const osiptel = rows.filter(r => r.tipoReclamo.includes('OSIPTEL')).length;

      totEntel += entel;
      totIndecopi += indecopi;
      totOsiptel += osiptel;
      totAll += q;

      const entelPct = q > 0 ? Math.round((entel / q) * 100) : 0;
      const indecopiPct = q > 0 ? Math.round((indecopi / q) * 100) : 0;
      const osiptelPct = q > 0 ? Math.round((osiptel / q) * 100) : 0;

      const isSelected = cf && cf.field === 'monthName' && cf.value === m;
      const isDimmed = isSource && cf.value !== m;
      const rowClass = isSelected ? 'cf-selected' : (isDimmed ? 'cf-dimmed' : '');

      html += `
        <tr class="cf-row ${rowClass}" data-cf-val="${m}">
          <td class="col-nombre">${m}</td>
          <td class="col-num">${entel > 0 ? entel : '-'}</td>
          <td class="col-num pct-cell">${entel > 0 ? entelPct + '%' : '-'}</td>
          <td class="col-num">${indecopi > 0 ? indecopi : '-'}</td>
          <td class="col-num pct-cell">${indecopi > 0 ? indecopiPct + '%' : '-'}</td>
          <td class="col-num">${osiptel > 0 ? osiptel : '-'}</td>
          <td class="col-num pct-cell">${osiptel > 0 ? osiptelPct + '%' : '-'}</td>
          <td class="col-num">${q}</td>
          <td class="col-num">100%</td>
        </tr>
      `;
    });

    html += `
      <tr class="row-total">
        <td class="col-nombre">Total</td>
        <td class="col-num">${totEntel > 0 ? totEntel : '-'}</td>
        <td class="col-num">${totAll > 0 ? Math.round((totEntel / totAll) * 100) + '%' : '-'}</td>
        <td class="col-num">${totIndecopi > 0 ? totIndecopi : '-'}</td>
        <td class="col-num">${totAll > 0 ? Math.round((totIndecopi / totAll) * 100) + '%' : '-'}</td>
        <td class="col-num">${totOsiptel > 0 ? totOsiptel : '-'}</td>
        <td class="col-num">${totAll > 0 ? Math.round((totOsiptel / totAll) * 100) + '%' : '-'}</td>
        <td class="col-num">${totAll}</td>
        <td class="col-num">100%</td>
      </tr>
    `;

    tbody.innerHTML = html;
  },

  // Matriz 3: Tipo de Respuesta por Supervisor
  renderMatrizRespuestaSup(data) {
    const tbody = document.querySelector('#table-respuesta-sup tbody');
    if (!tbody) return;

    const cf = window.Store ? window.Store.crossFilter : null;
    const isSource = cf && cf.sourceId === 'table-respuesta-sup';

    const supMap = new Map();
    data.forEach(r => {
      const sup = r.supervisor || 'SIN ASIGNAR';
      if (!supMap.has(sup)) {
        supMap.set(sup, { fundado: 0, infundado: 0, total: 0 });
      }
      const s = supMap.get(sup);
      s.total++;
      if (r.isFundado) s.fundado++;
      if (r.isInfundado) s.infundado++;
    });

    const supervisors = Array.from(supMap.keys()).sort();
    let totF = 0, totInf = 0, totAll = 0;
    let html = '';

    supervisors.forEach(sup => {
      const s = supMap.get(sup);
      totF += s.fundado;
      totInf += s.infundado;
      totAll += s.total;

      const fPct = s.total > 0 ? Math.round((s.fundado / s.total) * 100) : 0;
      const infPct = s.total > 0 ? Math.round((s.infundado / s.total) * 100) : 0;

      const isSelected = cf && cf.field === 'supervisor' && cf.value === sup;
      const isDimmed = isSource && cf.value !== sup;
      const rowClass = isSelected ? 'cf-selected' : (isDimmed ? 'cf-dimmed' : '');

      html += `
        <tr class="cf-row ${rowClass}" data-cf-val="${sup}">
          <td class="col-nombre" title="${sup}">${sup}</td>
          <td class="col-num">${s.fundado > 0 ? s.fundado : '-'}</td>
          <td class="col-num pct-cell">${s.fundado > 0 ? this.getSem(fPct) + fPct + '%' : '-'}</td>
          <td class="col-num">${s.infundado > 0 ? s.infundado : '-'}</td>
          <td class="col-num pct-cell">${s.infundado > 0 ? infPct + '%' : '-'}</td>
          <td class="col-num">${s.total}</td>
          <td class="col-num">100%</td>
        </tr>
      `;
    });

    const totFPct = totAll > 0 ? Math.round((totF / totAll) * 100) : 0;
    const totInfPct = totAll > 0 ? Math.round((totInf / totAll) * 100) : 0;

    html += `
      <tr class="row-total">
        <td class="col-nombre">Total</td>
        <td class="col-num">${totF > 0 ? totF : '-'}</td>
        <td class="col-num">${totFPct > 0 ? this.getSem(totFPct) + totFPct + '%' : '-'}</td>
        <td class="col-num">${totInf > 0 ? totInf : '-'}</td>
        <td class="col-num">${totInfPct}%</td>
        <td class="col-num">${totAll}</td>
        <td class="col-num">100%</td>
      </tr>
    `;

    tbody.innerHTML = html;
  }
};


// ===== FILE: detalle.js =====
window.DetalleView = {
  expandedMotivos: new Set(),
  expandedCampanas: new Set(),

  init() {
    this.setupListeners();
  },

  setupListeners() {
    const tableMotivo = document.getElementById('table-motivo-submotivo');
    if (tableMotivo) {
      tableMotivo.addEventListener('click', (e) => {
        const toggle = e.target.closest('.tree-toggle');
        if (toggle) {
          e.stopPropagation();
          const key = toggle.dataset.key;
          if (this.expandedMotivos.has(key)) {
            this.expandedMotivos.delete(key);
          } else {
            this.expandedMotivos.add(key);
          }
          if (window.App) window.App.renderActiveTab();
          return;
        }
        const tr = e.target.closest('tbody tr:not(.row-total)');
        if (tr && tr.dataset.cfField && tr.dataset.cfVal && window.Store) {
          window.Store.toggleCrossFilter(tr.dataset.cfField, tr.dataset.cfVal, 'table-motivo-submotivo');
        }
      });
    }

    const tableCampana = document.getElementById('table-campana-asesor');
    if (tableCampana) {
      tableCampana.addEventListener('click', (e) => {
        const toggle = e.target.closest('.tree-toggle');
        if (toggle) {
          e.stopPropagation();
          const key = toggle.dataset.key;
          if (this.expandedCampanas.has(key)) {
            this.expandedCampanas.delete(key);
          } else {
            this.expandedCampanas.add(key);
          }
          if (window.App) window.App.renderActiveTab();
          return;
        }
        const tr = e.target.closest('tbody tr:not(.row-total)');
        if (tr && tr.dataset.cfField && tr.dataset.cfVal && window.Store) {
          window.Store.toggleCrossFilter(tr.dataset.cfField, tr.dataset.cfVal, 'table-campana-asesor');
        }
      });
    }

    const tableResp = document.getElementById('table-responsabilidad');
    if (tableResp) {
      tableResp.addEventListener('click', (e) => {
        const tr = e.target.closest('tbody tr:not(.row-total)');
        if (tr && tr.dataset.cfVal && window.Store) {
          window.Store.toggleCrossFilter('responsabilidad', tr.dataset.cfVal, 'table-responsabilidad');
        }
      });
    }

    const tableMensual = document.getElementById('table-detalle-mensual');
    if (tableMensual) {
      tableMensual.addEventListener('click', (e) => {
        const tr = e.target.closest('tbody tr:not(.row-total)');
        if (tr && tr.dataset.cfVal && window.Store) {
          window.Store.toggleCrossFilter('monthName', tr.dataset.cfVal, 'table-detalle-mensual');
        }
      });
    }
  },

  render(data) {
    if (!this._initialized) {
      this.init();
      this._initialized = true;
    }

    // 1. Gráficos 100% Apilados Power BI
    if (window.ChartManager) {
      ChartManager.renderCuartil100('chart-cuartil', data);
      ChartManager.renderResponsabilidad100('chart-responsabilidad', data);
      ChartManager.renderDetalleMensual100('chart-detalle-mensual', data);
    }

    // 2. Matrices Power BI (respetando tabla origen en Cross-Filter)
    const getTableData = (tableId) => window.Store ? window.Store.getFilteredData(tableId) : data;
    this.renderMatrizResponsabilidad(getTableData('table-responsabilidad'));
    this.renderMatrizDetalleMensual(getTableData('table-detalle-mensual'));
    this.renderMatrizMotivoSubmotivo(getTableData('table-motivo-submotivo'));
    this.renderMatrizCampanaAsesor(getTableData('table-campana-asesor'));
  },

  // Matriz Responsabilidad (Fundado / Infundado)
  renderMatrizResponsabilidad(data) {
    const tbody = document.querySelector('#table-responsabilidad tbody');
    if (!tbody) return;

    const cf = window.Store ? window.Store.crossFilter : null;
    const isSource = cf && cf.sourceId === 'table-responsabilidad';

    const respSet = new Set();
    data.forEach(r => { if (r.responsabilidad) respSet.add(r.responsabilidad); });
    const resps = Array.from(respSet).sort();
    let totF = 0, totInf = 0, totAll = 0;
    let html = '';

    resps.forEach(rName => {
      const rows = data.filter(r => r.responsabilidad === rName);
      const f = rows.filter(r => r.isFundado).length;
      const inf = rows.filter(r => r.isInfundado).length;
      const total = rows.length;

      totF += f;
      totInf += inf;
      totAll += total;

      if (total === 0) return;

      const isSelected = cf && cf.field === 'responsabilidad' && cf.value === rName;
      const isDimmed = isSource && cf.value !== rName;
      const rowClass = isSelected ? 'cf-selected' : (isDimmed ? 'cf-dimmed' : '');

      html += `
        <tr class="cf-row ${rowClass}" data-cf-val="${rName}">
          <td class="col-nombre">${rName}</td>
          <td class="col-num">${f > 0 ? f : '-'}</td>
          <td class="col-num pct-cell">${f > 0 ? Math.round((f / total) * 100) + '%' : '-'}</td>
          <td class="col-num">${inf > 0 ? inf : '-'}</td>
          <td class="col-num pct-cell">${inf > 0 ? Math.round((inf / total) * 100) + '%' : '-'}</td>
          <td class="col-num">${total}</td>
          <td class="col-num">100%</td>
        </tr>
      `;
    });

    html += `
      <tr class="row-total">
        <td class="col-nombre">Total</td>
        <td class="col-num">${totF > 0 ? totF : '-'}</td>
        <td class="col-num">${totAll > 0 ? Math.round((totF / totAll) * 100) + '%' : '-'}</td>
        <td class="col-num">${totInf > 0 ? totInf : '-'}</td>
        <td class="col-num">${totAll > 0 ? Math.round((totInf / totAll) * 100) + '%' : '-'}</td>
        <td class="col-num">${totAll}</td>
        <td class="col-num">100%</td>
      </tr>
    `;

    tbody.innerHTML = html;
  },

  // Matriz Detalle Mensual
  renderMatrizDetalleMensual(data) {
    const months = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
    const tbody = document.querySelector('#table-detalle-mensual tbody');
    if (!tbody) return;

    const cf = window.Store ? window.Store.crossFilter : null;
    const isSource = cf && cf.sourceId === 'table-detalle-mensual';

    let totF = 0, totInf = 0, totAll = 0;
    let html = '';

    months.forEach(m => {
      const rows = data.filter(r => r.monthName === m);
      const q = rows.length;
      if (q === 0) return;

      const f = rows.filter(r => r.isFundado).length;
      const inf = rows.filter(r => r.isInfundado).length;

      totF += f;
      totInf += inf;
      totAll += q;

      const isSelected = cf && cf.field === 'monthName' && cf.value === m;
      const isDimmed = isSource && cf.value !== m;
      const rowClass = isSelected ? 'cf-selected' : (isDimmed ? 'cf-dimmed' : '');

      html += `
        <tr class="cf-row ${rowClass}" data-cf-val="${m}">
          <td class="col-nombre">${m}</td>
          <td class="col-num">${f > 0 ? f : '-'}</td>
          <td class="col-num pct-cell">${f > 0 ? Math.round((f / q) * 100) + '%' : '-'}</td>
          <td class="col-num">${inf > 0 ? inf : '-'}</td>
          <td class="col-num pct-cell">${inf > 0 ? Math.round((inf / q) * 100) + '%' : '-'}</td>
          <td class="col-num">${q}</td>
          <td class="col-num">100%</td>
        </tr>
      `;
    });

    html += `
      <tr class="row-total">
        <td class="col-nombre">Total</td>
        <td class="col-num">${totF > 0 ? totF : '-'}</td>
        <td class="col-num">${totAll > 0 ? Math.round((totF / totAll) * 100) + '%' : '-'}</td>
        <td class="col-num">${totInf > 0 ? totInf : '-'}</td>
        <td class="col-num">${totAll > 0 ? Math.round((totInf / totAll) * 100) + '%' : '-'}</td>
        <td class="col-num">${totAll}</td>
        <td class="col-num">100%</td>
      </tr>
    `;

    tbody.innerHTML = html;
  },

  // Matriz Motivo y Sub Motivo Jerárquica Desplegable
  renderMatrizMotivoSubmotivo(data) {
    const tbody = document.querySelector('#table-motivo-submotivo tbody');
    if (!tbody) return;

    const cf = window.Store ? window.Store.crossFilter : null;
    const isSource = cf && cf.sourceId === 'table-motivo-submotivo';

    const motivoMap = new Map();
    data.forEach(r => {
      const mot = r.motivo || 'SIN MOTIVO';
      const sub = r.subMotivo || r.submotivo || 'SIN SUBMOTIVO';

      if (!motivoMap.has(mot)) {
        motivoMap.set(mot, { f: 0, inf: 0, total: 0, subs: new Map() });
      }
      const mStat = motivoMap.get(mot);
      mStat.total++;
      if (r.isFundado) mStat.f++;
      if (r.isInfundado) mStat.inf++;

      if (!mStat.subs.has(sub)) {
        mStat.subs.set(sub, { f: 0, inf: 0, total: 0 });
      }
      const sStat = mStat.subs.get(sub);
      sStat.total++;
      if (r.isFundado) sStat.f++;
      if (r.isInfundado) sStat.inf++;
    });

    let totF = 0, totInf = 0, totAll = 0;
    let html = '';

    Array.from(motivoMap.keys()).sort().forEach(mot => {
      const s = motivoMap.get(mot);
      totF += s.f;
      totInf += s.inf;
      totAll += s.total;

      const isExpanded = this.expandedMotivos.has(mot);
      const hasSubs = s.subs.size > 0;
      const toggle = hasSubs ? `<span class="tree-toggle" data-key="${mot}">${isExpanded ? '&minus;' : '+'}</span>` : '';

      const isSelected = cf && cf.field === 'motivo' && cf.value === mot;
      const isDimmed = isSource && !(cf.field === 'motivo' && cf.value === mot);
      const rowClass = isSelected ? 'cf-selected' : (isDimmed ? 'cf-dimmed' : '');

      html += `
        <tr class="tree-level-0 cf-row ${rowClass}" data-cf-field="motivo" data-cf-val="${mot}">
          <td class="col-nombre">${toggle} ${mot}</td>
          <td class="col-num">${s.f > 0 ? s.f : '-'}</td>
          <td class="col-num pct-cell">${s.f > 0 ? Math.round((s.f / s.total) * 100) + '%' : '-'}</td>
          <td class="col-num">${s.inf > 0 ? s.inf : '-'}</td>
          <td class="col-num pct-cell">${s.inf > 0 ? Math.round((s.inf / s.total) * 100) + '%' : '-'}</td>
          <td class="col-num">${s.total}</td>
          <td class="col-num">100%</td>
        </tr>
      `;

      if (isExpanded && hasSubs) {
        Array.from(s.subs.keys()).sort().forEach(sub => {
          const subStat = s.subs.get(sub);
          const subSelected = cf && cf.field === 'subMotivo' && cf.value === sub;
          const subDimmed = isSource && !(cf.field === 'subMotivo' && cf.value === sub);
          const subRowClass = subSelected ? 'cf-selected' : (subDimmed ? 'cf-dimmed' : '');

          html += `
            <tr class="tree-level-1 cf-row ${subRowClass}" data-cf-field="subMotivo" data-cf-val="${sub}">
              <td class="col-nombre" style="padding-left: 20px;">${sub}</td>
              <td class="col-num">${subStat.f > 0 ? subStat.f : '-'}</td>
              <td class="col-num pct-cell">${subStat.f > 0 ? Math.round((subStat.f / subStat.total) * 100) + '%' : '-'}</td>
              <td class="col-num">${subStat.inf > 0 ? subStat.inf : '-'}</td>
              <td class="col-num pct-cell">${subStat.inf > 0 ? Math.round((subStat.inf / subStat.total) * 100) + '%' : '-'}</td>
              <td class="col-num">${subStat.total}</td>
              <td class="col-num">100%</td>
            </tr>
          `;
        });
      }
    });

    html += `
      <tr class="row-total">
        <td class="col-nombre">Total</td>
        <td class="col-num">${totF > 0 ? totF : '-'}</td>
        <td class="col-num">${totAll > 0 ? Math.round((totF / totAll) * 100) + '%' : '-'}</td>
        <td class="col-num">${totInf > 0 ? totInf : '-'}</td>
        <td class="col-num">${totAll > 0 ? Math.round((totInf / totAll) * 100) + '%' : '-'}</td>
        <td class="col-num">${totAll}</td>
        <td class="col-num">100%</td>
      </tr>
    `;

    tbody.innerHTML = html;
  },

  // Matriz Campaña y Asesor Jerárquica Desplegable
  renderMatrizCampanaAsesor(data) {
    const tbody = document.querySelector('#table-campana-asesor tbody');
    if (!tbody) return;

    const cf = window.Store ? window.Store.crossFilter : null;
    const isSource = cf && cf.sourceId === 'table-campana-asesor';

    const campMap = new Map();
    data.forEach(r => {
      const c = r.campana || 'SIN CAMPAÑA';
      const a = r.asesor || 'SIN ASESOR';

      if (!campMap.has(c)) {
        campMap.set(c, { f: 0, inf: 0, total: 0, ases: new Map() });
      }
      const cStat = campMap.get(c);
      cStat.total++;
      if (r.isFundado) cStat.f++;
      if (r.isInfundado) cStat.inf++;

      if (!cStat.ases.has(a)) {
        cStat.ases.set(a, { f: 0, inf: 0, total: 0 });
      }
      const aStat = cStat.ases.get(a);
      aStat.total++;
      if (r.isFundado) aStat.f++;
      if (r.isInfundado) aStat.inf++;
    });

    let totF = 0, totInf = 0, totAll = 0;
    let html = '';

    Array.from(campMap.keys()).sort().forEach(c => {
      const s = campMap.get(c);
      totF += s.f;
      totInf += s.inf;
      totAll += s.total;

      const isExpanded = this.expandedCampanas.has(c);
      const hasAses = s.ases.size > 0;
      const toggle = hasAses ? `<span class="tree-toggle" data-key="${c}">${isExpanded ? '&minus;' : '+'}</span>` : '';

      const isSelected = cf && cf.field === 'campana' && cf.value === c;
      const isDimmed = isSource && !(cf.field === 'campana' && cf.value === c);
      const rowClass = isSelected ? 'cf-selected' : (isDimmed ? 'cf-dimmed' : '');

      html += `
        <tr class="tree-level-0 cf-row ${rowClass}" data-cf-field="campana" data-cf-val="${c}">
          <td class="col-nombre">${toggle} ${c}</td>
          <td class="col-num">${s.f > 0 ? s.f : '-'}</td>
          <td class="col-num pct-cell">${s.f > 0 ? Math.round((s.f / s.total) * 100) + '%' : '-'}</td>
          <td class="col-num">${s.inf > 0 ? s.inf : '-'}</td>
          <td class="col-num pct-cell">${s.inf > 0 ? Math.round((s.inf / s.total) * 100) + '%' : '-'}</td>
          <td class="col-num">${s.total}</td>
          <td class="col-num">100%</td>
        </tr>
      `;

      if (isExpanded && hasAses) {
        Array.from(s.ases.keys()).sort().forEach(a => {
          const aStat = s.ases.get(a);
          const aSelected = cf && cf.field === 'asesor' && cf.value === a;
          const aDimmed = isSource && !(cf.field === 'asesor' && cf.value === a);
          const aRowClass = aSelected ? 'cf-selected' : (aDimmed ? 'cf-dimmed' : '');

          html += `
            <tr class="tree-level-1 cf-row ${aRowClass}" data-cf-field="asesor" data-cf-val="${a}">
              <td class="col-nombre" style="padding-left: 20px;">${a}</td>
              <td class="col-num">${aStat.f > 0 ? aStat.f : '-'}</td>
              <td class="col-num pct-cell">${aStat.f > 0 ? Math.round((aStat.f / aStat.total) * 100) + '%' : '-'}</td>
              <td class="col-num">${aStat.inf > 0 ? aStat.inf : '-'}</td>
              <td class="col-num pct-cell">${aStat.inf > 0 ? Math.round((aStat.inf / aStat.total) * 100) + '%' : '-'}</td>
              <td class="col-num">${aStat.total}</td>
              <td class="col-num">100%</td>
            </tr>
          `;
        });
      }
    });

    html += `
      <tr class="row-total">
        <td class="col-nombre">Total</td>
        <td class="col-num">${totF > 0 ? totF : '-'}</td>
        <td class="col-num">${totAll > 0 ? Math.round((totF / totAll) * 100) + '%' : '-'}</td>
        <td class="col-num">${totInf > 0 ? totInf : '-'}</td>
        <td class="col-num">${totAll > 0 ? Math.round((totInf / totAll) * 100) + '%' : '-'}</td>
        <td class="col-num">${totAll}</td>
        <td class="col-num">100%</td>
      </tr>
    `;

    tbody.innerHTML = html;
  }
};


// ===== FILE: reincidencia.js =====
/**
 * reincidencia.js - Controlador de la Vista 4: Reincidencia (Matriz Jerarquica Dinamica Estilo Power BI)
 */

const MONTHS = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];

window.ReincidenciaView = {
  // Lista de dimensiones en orden activo con identificadores limpios
  dimensionOrder: [
    'CAMPANA',
    'SUPERVISOR',
    'ASESOR',
    'CUARTIL',
    'ANTIGUEDAD',
    'TIPO_RECLAMO',
    'RESPUESTA',
    'RESPONSABILIDAD',
    'MOTIVO',
    'SUB_MOTIVO'
  ],

  // Dimensiones seleccionadas (por defecto Campaña y Supervisor como en Power BI)
  selectedDimensions: ['CAMPANA', 'SUPERVISOR'],

  // Nodos abiertos / colapsados
  expandedNodes: new Set(['BLINDAJE', 'ATC', 'MIGRACIONES']),

  dimFieldMap: {
    'CAMPANA': { field: 'campana', label: 'Campaña' },
    'SUPERVISOR': { field: 'supervisor', label: 'Supervisor' },
    'ASESOR': { field: 'asesor', label: 'Asesor' },
    'CUARTIL': { field: 'cuartil', label: 'Cuartil' },
    'ANTIGUEDAD': { field: 'antiguedad', label: 'Antigüedad' },
    'TIPO_RECLAMO': { field: 'tipoReclamo', label: 'Tipo de Reclamo' },
    'RESPUESTA': { field: 'respuesta', label: 'Respuesta' },
    'RESPONSABILIDAD': { field: 'responsabilidad', label: 'Responsabilidad' },
    'MOTIVO': { field: 'motivo', label: 'Motivo' },
    'SUB_MOTIVO': { field: 'subMotivo', label: 'Sub Motivo' }
  },

  init() {
    if (this._initialized) return;
    this._initialized = true;
    this.setupListeners();
  },

  setupListeners() {
    const container = document.getElementById('dimension-options');
    if (container) {
      // Checkbox toggles
      container.addEventListener('change', (e) => {
        if (e.target.classList.contains('dim-check')) {
          this.updateSelectedDimensionsFromUI();
          if (window.App) window.App.renderActiveTab();
        }
      });

      // Flechas arriba / abajo
      container.addEventListener('click', (e) => {
        const btnUp = e.target.closest('.btn-move-up');
        const btnDown = e.target.closest('.btn-move-down');
        if (btnUp || btnDown) {
          const item = e.target.closest('.dim-item');
          if (!item) return;
          if (btnUp && item.previousElementSibling) {
            container.insertBefore(item, item.previousElementSibling);
          } else if (btnDown && item.nextElementSibling) {
            container.insertBefore(item.nextElementSibling, item);
          }
          this.updateOrderFromDOM();
          this.updateSelectedDimensionsFromUI();
          if (window.App) window.App.renderActiveTab();
        }
      });
    }

    // Expandir todo / Colapsar todo / Reset
    const btnExpand = document.getElementById('btn-expand-all');
    if (btnExpand) {
      btnExpand.addEventListener('click', () => {
        this.expandAll();
      });
    }

    const btnCollapse = document.getElementById('btn-collapse-all');
    if (btnCollapse) {
      btnCollapse.addEventListener('click', () => {
        this.expandedNodes.clear();
        if (window.App) window.App.renderActiveTab();
      });
    }

    const btnReset = document.getElementById('btn-reset-order');
    if (btnReset) {
      btnReset.addEventListener('click', () => {
        this.resetDimensions();
      });
    }

    // Event delegation en la tabla de Reincidencia Entel para abrir/cerrar nodos
    const tblReincidencia = document.getElementById('table-reincidencia-evolutivo');
    if (tblReincidencia) {
      tblReincidencia.addEventListener('click', (e) => {
        const toggleBtn = e.target.closest('.tree-toggle');
        if (toggleBtn) {
          e.preventDefault();
          e.stopPropagation();
          const path = toggleBtn.dataset.path;
          if (path) {
            this.toggleNode(path);
          }
          return;
        }

        // Si hace click en la celda de nombre que tiene toggle
        const colNombre = e.target.closest('.col-nombre');
        if (colNombre) {
          const btn = colNombre.querySelector('.tree-toggle:not(.empty)');
          if (btn && btn.dataset.path) {
            e.preventDefault();
            this.toggleNode(btn.dataset.path);
          }
        }
      });
    }
  },

  toggleNode(path) {
    if (this.expandedNodes.has(path)) {
      this.expandedNodes.delete(path);
    } else {
      this.expandedNodes.add(path);
    }
    if (window.App) window.App.renderActiveTab();
  },

  updateOrderFromDOM() {
    const items = document.querySelectorAll('#dimension-options .dim-item');
    this.dimensionOrder = Array.from(items).map(el => el.dataset.val);
  },

  updateSelectedDimensionsFromUI() {
    const items = document.querySelectorAll('#dimension-options .dim-item');
    const selected = [];
    items.forEach(el => {
      const chk = el.querySelector('.dim-check');
      if (chk && chk.checked) {
        selected.push(el.dataset.val);
      }
    });
    // Si no selecciona ninguna, forzar al menos la primera
    if (selected.length === 0 && items.length > 0) {
      const firstItem = items[0];
      const chk = firstItem.querySelector('.dim-check');
      if (chk) chk.checked = true;
      selected.push(firstItem.dataset.val);
    }
    this.selectedDimensions = selected;

    // Actualizar titulo
    const titleEl = document.getElementById('reincidencia-table-title');
    if (titleEl) {
      const names = this.selectedDimensions.map(d => this.dimFieldMap[d] ? this.dimFieldMap[d].label : d);
      titleEl.textContent = `Evolutivo de Reincidencia Por: ${names.join(' > ')}`;
    }
  },

  resetDimensions() {
    this.dimensionOrder = [
      'CAMPANA', 'SUPERVISOR', 'ASESOR', 'CUARTIL', 'ANTIGUEDAD',
      'TIPO_RECLAMO', 'RESPUESTA', 'RESPONSABILIDAD', 'MOTIVO', 'SUB_MOTIVO'
    ];
    this.selectedDimensions = ['CAMPANA', 'SUPERVISOR'];
    this.expandedNodes = new Set(['BLINDAJE', 'ATC', 'MIGRACIONES']);

    const container = document.getElementById('dimension-options');
    if (container) {
      const itemsMap = new Map();
      container.querySelectorAll('.dim-item').forEach(el => itemsMap.set(el.dataset.val, el));
      this.dimensionOrder.forEach(val => {
        const el = itemsMap.get(val);
        if (el) {
          container.appendChild(el);
          const chk = el.querySelector('.dim-check');
          if (chk) {
            chk.checked = this.selectedDimensions.includes(val);
          }
        }
      });
    }
    const titleEl = document.getElementById('reincidencia-table-title');
    if (titleEl) {
      titleEl.textContent = 'Evolutivo de Reincidencia Por: Campaña > Supervisor';
    }
    if (window.App) window.App.renderActiveTab();
  },

  expandAll() {
    if (this._allPaths) {
      this._allPaths.forEach(p => this.expandedNodes.add(p));
    }
    if (window.App) window.App.renderActiveTab();
  },

  render(data) {
    const table = document.getElementById('table-reincidencia-evolutivo');
    if (!table) return;

    const thead = table.querySelector('thead');
    const tbody = table.querySelector('tbody');

    const activeLevels = this.selectedDimensions.map(d => {
      const cfg = this.dimFieldMap[d] || { field: 'campana', label: d };
      return { id: d, name: cfg.label, field: cfg.field };
    });

    if (activeLevels.length === 0) {
      activeLevels.push({ id: 'CAMPANA', name: 'Campaña', field: 'campana' });
    }

    // 1. Encabezado de 12 Meses
    const headerLabel = activeLevels.map(l => l.name).join(' / ');
    let theadHtml = `
      <tr>
        <th rowspan="2" class="th-main">${headerLabel}<br><small>MES</small></th>
        ${MONTHS.map(m => `<th colspan="2" class="th-sub">${m}</th>`).join('')}
        <th colspan="2" class="th-sub total">Total</th>
      </tr>
      <tr class="sub-cols">
        ${MONTHS.map(() => `<th>Q</th><th>%</th>`).join('')}
        <th>Q</th><th>%</th>
      </tr>
    `;
    thead.innerHTML = theadHtml;

    // 2. Totales Mensuales de la Base
    const monthTotals = {};
    MONTHS.forEach(m => { monthTotals[m] = 0; });
    let grandTotal = 0;

    data.forEach(r => {
      if (r.monthName && monthTotals[r.monthName] !== undefined) {
        monthTotals[r.monthName]++;
      }
      grandTotal++;
    });

    // 3. Construir Arbol Jerarquico Recursivo
    const root = { children: new Map(), months: {}, total: 0 };
    MONTHS.forEach(m => { root.months[m] = 0; });

    data.forEach(r => {
      let current = root;
      current.total++;
      if (r.monthName) current.months[r.monthName] = (current.months[r.monthName] || 0) + 1;

      activeLevels.forEach(lvl => {
        const val = String(r[lvl.field] || 'NO ASIGNADO').trim() || 'NO ASIGNADO';
        if (!current.children.has(val)) {
          const nodeMonths = {};
          MONTHS.forEach(m => { nodeMonths[m] = 0; });
          current.children.set(val, {
            name: val,
            children: new Map(),
            months: nodeMonths,
            total: 0
          });
        }
        current = current.children.get(val);
        current.total++;
        if (r.monthName) {
          current.months[r.monthName] = (current.months[r.monthName] || 0) + 1;
        }
      });
    });

    // Recolectar paths
    this._allPaths = new Set();
    let tbodyHtml = '';

    const renderLevel = (node, levelIndex, pathPrefix) => {
      const isLeaf = levelIndex >= activeLevels.length - 1;
      const sortedKeys = Array.from(node.children.keys()).sort((a, b) => a.localeCompare(b));

      sortedKeys.forEach(key => {
        const child = node.children.get(key);
        const currentPath = pathPrefix ? `${pathPrefix}:::${key}` : key;
        this._allPaths.add(currentPath);

        const hasChildren = child.children.size > 0 && !isLeaf;
        const isExpanded = this.expandedNodes.has(currentPath);
        const indentPx = levelIndex * 18;

        let toggleHtml = '';
        if (hasChildren) {
          toggleHtml = `<button type="button" class="tree-toggle" data-path="${currentPath}" title="${isExpanded ? 'Colapsar' : 'Expandir'}">${isExpanded ? '&minus;' : '+'}</button>`;
        } else {
          toggleHtml = `<span class="tree-toggle empty"></span>`;
        }

        tbodyHtml += `<tr class="tree-level-${Math.min(levelIndex, 3)}">`;
        tbodyHtml += `<td class="col-nombre" style="padding-left: ${indentPx + 6}px; cursor: ${hasChildren ? 'pointer' : 'default'};" title="${child.name}">${toggleHtml} <span>${child.name}</span></td>`;

        MONTHS.forEach(m => {
          const count = child.months[m] || 0;
          const mTot = monthTotals[m] || 0;
          const pct = mTot > 0 && count > 0 ? Math.round((count / mTot) * 100) : 0;
          tbodyHtml += `
            <td class="col-num">${count > 0 ? count : '-'}</td>
            <td class="col-num pct-cell">${count > 0 ? pct + '%' : '-'}</td>
          `;
        });

        const rowPct = grandTotal > 0 ? Math.round((child.total / grandTotal) * 100) : 0;
        tbodyHtml += `
          <td class="col-num">${child.total > 0 ? child.total : '-'}</td>
          <td class="col-num pct-cell">${rowPct > 0 ? rowPct + '%' : '-'}</td>
        </tr>`;

        // Si esta expandido y tiene hijos, procesar siguiente nivel
        if (hasChildren && isExpanded) {
          renderLevel(child, levelIndex + 1, currentPath);
        }
      });
    };

    renderLevel(root, 0, '');

    // Fila Total General
    tbodyHtml += `<tr class="row-total"><td class="col-nombre">Total</td>`;
    MONTHS.forEach(m => {
      const mTot = monthTotals[m] || 0;
      tbodyHtml += `
        <td class="col-num">${mTot > 0 ? mTot : '-'}</td>
        <td class="col-num">${mTot > 0 ? '100%' : '-'}</td>
      `;
    });
    tbodyHtml += `
      <td class="col-num">${grandTotal > 0 ? grandTotal : '-'}</td>
      <td class="col-num">100%</td>
    </tr>`;

    tbody.innerHTML = tbodyHtml;
  }
};


// ===== FILE: movistar.js =====
/**
 * movistar.js - Controlador de las 2 Vistas de Movistar (Vista 1: Portada Tripletas | Vista 2: Reversas & Matriz Jerárquica)
 */

const MOV_MONTHS = ['MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE'];

window.MovistarView = {
  portadaMesSource: 'TRIPLETAS', // 'TRIPLETAS' | 'REVERSAS'
  expandedRegions: new Set(['JAKELIN SALAZAR', 'ANDRÉS CRUZ']),
  expandedSups: new Set(),

  // Configuración para la Matriz Jerárquica de la Vista 2
  matrixSource: 'TRIPLETAS', // 'TRIPLETAS' | 'REVERSAS'
  dimensionOrder: [
    'SUPERVISOR',
    'ASESOR',
    'REGION',
    'CAC',
    'QUEJA',
    'PLAN',
    'ANTIGUEDAD',
    'ESTADO',
    'CONCLUSION'
  ],
  selectedDimensions: ['SUPERVISOR', 'ASESOR'],
  expandedTreeNodes: new Set(['JAKELIN SALAZAR', 'ANDRÉS CRUZ']),

  dimFieldMap: {
    'SUPERVISOR': { field: 'supervisor', label: 'Supervisor' },
    'ASESOR': { field: 'asesor', label: 'Asesor' },
    'REGION': { field: 'region', label: 'Región / Donador' },
    'CAC': { field: 'cac', label: 'CAC / Punto Venta' },
    'QUEJA': { field: 'quejaParticular', label: 'Queja / Audio' },
    'PLAN': { field: 'planAdquirido', label: 'Plan / Distribuidor' },
    'ANTIGUEDAD': { field: 'antiguedad', label: 'Antigüedad' },
    'ESTADO': { field: 'estado', label: 'Estado Asesor' },
    'CONCLUSION': { field: 'conclusion', label: 'Conclusión' }
  },

  init() {
    if (this._initialized) return;
    this._initialized = true;
    this.setupPortadaListeners();
    this.setupReversasListeners();
  },

  getSem(pct) {
    if (pct === undefined || pct === null || pct === '-' || isNaN(pct) || pct < 0) return '';
    if (pct <= 15) {
      return '<span class="sem-icon sem-green" title="Controlado (<=15%)">&#9679;</span> ';
    } else if (pct <= 30) {
      return '<span class="sem-icon sem-yellow" title="Alerta (16-30%)">&#9679;</span> ';
    } else {
      return '<span class="sem-icon sem-red" title="Crítico (>30%)">&#9679;</span> ';
    }
  },

  setupPortadaListeners() {
    // Selector (Tripletas / Reversas) en el gráfico de Evolutivo Mensual de Portada
    const toggleMes = document.getElementById('toggle-chart-mov-mes');
    if (toggleMes) {
      const btns = toggleMes.querySelectorAll('.mov-chart-btn');
      btns.forEach(btn => {
        btn.addEventListener('click', (e) => {
          btns.forEach(b => b.classList.remove('active'));
          e.currentTarget.classList.add('active');
          this.portadaMesSource = e.currentTarget.dataset.type || 'TRIPLETAS';
          const titleEl = document.getElementById('title-chart-mov-mes');
          if (titleEl) {
            titleEl.textContent = this.portadaMesSource === 'REVERSAS'
              ? 'Evolutivo Mensual de Reversas (Q y % Total)'
              : 'Evolutivo Mensual de Tripletas (Q y % Fund.)';
          }
          if (window.App) window.App.renderActiveTab();
        });
      });
    }

    // Tabla 1: Conclusión y Penalidad por Mes
    const tblMes = document.getElementById('table-mov-mes');
    if (tblMes) {
      tblMes.addEventListener('click', (e) => {
        const tr = e.target.closest('tbody tr:not(.row-total)');
        if (tr && tr.dataset.cfVal && window.Store) {
          window.Store.toggleCrossFilter('monthName', tr.dataset.cfVal, 'table-mov-mes');
        }
      });
    }

    // Tabla 2: Región > CAC desplegable
    const tblReg = document.getElementById('table-mov-region-cac');
    if (tblReg) {
      tblReg.addEventListener('click', (e) => {
        const toggle = e.target.closest('.mov-reg-toggle');
        if (toggle) {
          e.stopPropagation();
          const key = toggle.dataset.key;
          if (this.expandedRegions.has(key)) this.expandedRegions.delete(key);
          else this.expandedRegions.add(key);
          if (window.App) window.App.renderActiveTab();
          return;
        }
        const tr = e.target.closest('tbody tr:not(.row-total)');
        if (tr && tr.dataset.cfField && tr.dataset.cfVal && window.Store) {
          window.Store.toggleCrossFilter(tr.dataset.cfField, tr.dataset.cfVal, 'table-mov-region-cac');
        }
      });
    }

    // Tabla 3: Supervisor > Asesor desplegable
    const tblSup = document.getElementById('table-mov-sup-asesor');
    if (tblSup) {
      tblSup.addEventListener('click', (e) => {
        const toggle = e.target.closest('.mov-sup-toggle');
        if (toggle) {
          e.stopPropagation();
          const key = toggle.dataset.key;
          if (this.expandedSups.has(key)) this.expandedSups.delete(key);
          else this.expandedSups.add(key);
          if (window.App) window.App.renderActiveTab();
          return;
        }
        const tr = e.target.closest('tbody tr:not(.row-total)');
        if (tr && tr.dataset.cfField && tr.dataset.cfVal && window.Store) {
          window.Store.toggleCrossFilter(tr.dataset.cfField, tr.dataset.cfVal, 'table-mov-sup-asesor');
        }
      });
    }
  },

  setupReversasListeners() {
    // Tabla Resumen Reversas por Mes y Supervisor
    const tblRevSup = document.getElementById('table-mov-rev-sup');
    if (tblRevSup) {
      tblRevSup.addEventListener('click', (e) => {
        const tr = e.target.closest('tbody tr:not(.row-total)');
        if (tr && tr.dataset.cfField && tr.dataset.cfVal && window.Store) {
          window.Store.toggleCrossFilter(tr.dataset.cfField, tr.dataset.cfVal, 'table-mov-rev-sup');
        }
      });
    }

    // Selector de origen en Matriz Dinámica (Tripletas vs Reversas)
    const srcBtns = document.querySelectorAll('.mov-src-btn');
    srcBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        srcBtns.forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        this.matrixSource = e.currentTarget.dataset.src || 'TRIPLETAS';
        if (window.App) window.App.renderActiveTab();
      });
    });

    // Opciones de Jerarquía Movistar
    const container = document.getElementById('mov-dimension-options');
    if (container) {
      container.addEventListener('change', (e) => {
        if (e.target.classList.contains('mov-dim-check')) {
          this.updateSelectedDimensionsFromUI();
          if (window.App) window.App.renderActiveTab();
        }
      });

      container.addEventListener('click', (e) => {
        const btnUp = e.target.closest('.btn-move-up');
        const btnDown = e.target.closest('.btn-move-down');
        if (btnUp || btnDown) {
          const item = e.target.closest('.dim-item');
          if (!item) return;
          if (btnUp && item.previousElementSibling) {
            container.insertBefore(item, item.previousElementSibling);
          } else if (btnDown && item.nextElementSibling) {
            container.insertBefore(item.nextElementSibling, item);
          }
          this.updateOrderFromDOM();
          this.updateSelectedDimensionsFromUI();
          if (window.App) window.App.renderActiveTab();
        }
      });
    }

    // Botones + / - / Reset en Matriz Movistar
    const btnExpand = document.getElementById('btn-mov-expand-all');
    if (btnExpand) {
      btnExpand.addEventListener('click', () => {
        if (this._allTreePaths) {
          this._allTreePaths.forEach(p => this.expandedTreeNodes.add(p));
          if (window.App) window.App.renderActiveTab();
        }
      });
    }

    const btnCollapse = document.getElementById('btn-mov-collapse-all');
    if (btnCollapse) {
      btnCollapse.addEventListener('click', () => {
        this.expandedTreeNodes.clear();
        if (window.App) window.App.renderActiveTab();
      });
    }

    const btnReset = document.getElementById('btn-mov-reset-order');
    if (btnReset) {
      btnReset.addEventListener('click', () => {
        this.resetDimensions();
      });
    }

    // Abrir/cerrar nodos en la tabla evolutiva de Movistar
    const tblTree = document.getElementById('table-mov-evolutivo');
    if (tblTree) {
      tblTree.addEventListener('click', (e) => {
        const toggleBtn = e.target.closest('.mov-tree-toggle');
        if (toggleBtn && toggleBtn.dataset.path) {
          e.preventDefault();
          e.stopPropagation();
          this.toggleTreeNode(toggleBtn.dataset.path);
          return;
        }
        const colNombre = e.target.closest('.col-nombre');
        if (colNombre) {
          const btn = colNombre.querySelector('.mov-tree-toggle:not(.empty)');
          if (btn && btn.dataset.path) {
            e.preventDefault();
            this.toggleTreeNode(btn.dataset.path);
          }
        }
      });
    }
  },

  toggleTreeNode(path) {
    if (this.expandedTreeNodes.has(path)) this.expandedTreeNodes.delete(path);
    else this.expandedTreeNodes.add(path);
    if (window.App) window.App.renderActiveTab();
  },

  updateOrderFromDOM() {
    const items = document.querySelectorAll('#mov-dimension-options .dim-item');
    this.dimensionOrder = Array.from(items).map(el => el.dataset.val);
  },

  updateSelectedDimensionsFromUI() {
    const items = document.querySelectorAll('#mov-dimension-options .dim-item');
    const selected = [];
    items.forEach(el => {
      const chk = el.querySelector('.mov-dim-check');
      if (chk && chk.checked) selected.push(el.dataset.val);
    });
    if (selected.length === 0 && items.length > 0) {
      const first = items[0];
      const chk = first.querySelector('.mov-dim-check');
      if (chk) chk.checked = true;
      selected.push(first.dataset.val);
    }
    this.selectedDimensions = selected;
  },

  resetDimensions() {
    this.dimensionOrder = ['SUPERVISOR', 'ASESOR', 'REGION', 'CAC', 'QUEJA', 'PLAN', 'ANTIGUEDAD', 'ESTADO', 'CONCLUSION'];
    this.selectedDimensions = ['SUPERVISOR', 'ASESOR'];
    this.expandedTreeNodes = new Set(['JAKELIN SALAZAR', 'ANDRÉS CRUZ']);

    const container = document.getElementById('mov-dimension-options');
    if (container) {
      const map = new Map();
      container.querySelectorAll('.dim-item').forEach(el => map.set(el.dataset.val, el));
      this.dimensionOrder.forEach(val => {
        const el = map.get(val);
        if (el) {
          container.appendChild(el);
          const chk = el.querySelector('.mov-dim-check');
          if (chk) chk.checked = this.selectedDimensions.includes(val);
        }
      });
    }
    if (window.App) window.App.renderActiveTab();
  },

  // =========================================================================
  // RENDER VISTA 1: PORTADA - TRIPLETAS (4 KPIs + 3 Gráficos + 3 Matrices)
  // =========================================================================
  renderPortada() {
    this.init();
    const data = window.Store ? window.Store.getMovFilteredTripletas() : [];
    const revData = window.Store ? window.Store.getMovFilteredReversas() : [];

    // 1. Renderizar Strip de 4 KPIs
    this.renderPortadaKPIs(data);

    // 2. Renderizar 3 Gráficos ECharts
    if (window.ChartManager) {
      const mesData = this.portadaMesSource === 'REVERSAS' ? revData : data;
      ChartManager.renderMovTripletasMes('chart-mov-mes', mesData, this.portadaMesSource);
      ChartManager.renderMovQuejasTop('chart-mov-quejas', data);
      ChartManager.renderMovTopCAC('chart-mov-cac', data);
    }

    // 3. Renderizar 3 Matrices Inferiores
    const getTblData = (id) => window.Store ? window.Store.getMovFilteredTripletas(id) : data;
    this.renderMatrizMes(getTblData('table-mov-mes'));
    this.renderMatrizRegionCAC(getTblData('table-mov-region-cac'));
    this.renderMatrizSupAsesor(getTblData('table-mov-sup-asesor'));
  },

  renderPortadaKPIs(data) {
    const total = data.length;
    const fundados = data.filter(r => r.isFundado).length;
    const infundados = data.filter(r => r.isInfundado).length;
    const pendientes = data.filter(r => r.isPendiente).length;
    const evaluados = fundados + infundados;
    const fundPct = evaluados > 0 ? Math.round((fundados / evaluados) * 100) : 0;
    const infPct = evaluados > 0 ? Math.round((infundados / evaluados) * 100) : 0;
    const penalizados = data.filter(r => r.isPenalizado).length;
    const montoTotal = data.reduce((acc, r) => acc + (r.montoPenalizado || 0), 0);

    const setEl = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setEl('kpi-mov-total', total.toLocaleString());
    setEl('kpi-mov-total-sub', `${pendientes} en revisión actual`);
    setEl('kpi-mov-fundados', `${fundados} (${fundPct}%)`);
    setEl('kpi-mov-fundados-sub', `Sobre ${evaluados} casos concluidos`);
    setEl('kpi-mov-infundados', `${infundados} (${infPct}%)`);
    setEl('kpi-mov-infundados-sub', `Defendidos favorablemente`);
    setEl('kpi-mov-penalizados', `${penalizados} casos`);
    setEl('kpi-mov-monto', `$ ${montoTotal.toLocaleString()} MXN`);
  },

  renderMatrizMes(data) {
    const tbody = document.querySelector('#table-mov-mes tbody');
    if (!tbody) return;

    const cf = window.Store ? window.Store.crossFilter : null;
    const isSource = cf && cf.sourceId === 'table-mov-mes';

    let totF = 0, totInf = 0, totPend = 0, totMonto = 0, totAll = 0;
    let html = '';

    MOV_MONTHS.forEach(m => {
      const rows = data.filter(r => r.monthName === m);
      const q = rows.length;
      if (q === 0) return;

      const f = rows.filter(r => r.isFundado).length;
      const inf = rows.filter(r => r.isInfundado).length;
      const pend = rows.filter(r => r.isPendiente).length;
      const monto = rows.reduce((s, r) => s + (r.montoPenalizado || 0), 0);
      const evalTot = f + inf;
      const fPct = evalTot > 0 ? Math.round((f / evalTot) * 100) : 0;

      totF += f;
      totInf += inf;
      totPend += pend;
      totMonto += monto;
      totAll += q;

      const isSelected = cf && cf.field === 'monthName' && cf.value === m;
      const isDimmed = isSource && cf.value !== m;
      const rowClass = isSelected ? 'cf-selected' : (isDimmed ? 'cf-dimmed' : '');

      html += `
        <tr class="cf-row ${rowClass}" data-cf-val="${m}">
          <td class="col-nombre">${m}</td>
          <td class="col-num">${f > 0 ? f : '-'}</td>
          <td class="col-num pct-cell">${f > 0 ? this.getSem(fPct) + fPct + '%' : '-'}</td>
          <td class="col-num">${inf > 0 ? inf : '-'}</td>
          <td class="col-num">${pend > 0 ? pend : '-'}</td>
          <td class="col-num">${monto > 0 ? '$' + monto.toLocaleString() : '-'}</td>
          <td class="col-num"><strong>${q}</strong></td>
        </tr>
      `;
    });

    const totEval = totF + totInf;
    const totFPct = totEval > 0 ? Math.round((totF / totEval) * 100) : 0;

    html += `
      <tr class="row-total">
        <td class="col-nombre">Total</td>
        <td class="col-num">${totF > 0 ? totF : '-'}</td>
        <td class="col-num">${totEval > 0 ? this.getSem(totFPct) + totFPct + '%' : '-'}</td>
        <td class="col-num">${totInf > 0 ? totInf : '-'}</td>
        <td class="col-num">${totPend > 0 ? totPend : '-'}</td>
        <td class="col-num">${totMonto > 0 ? '$' + totMonto.toLocaleString() : '$0'}</td>
        <td class="col-num">${totAll}</td>
      </tr>
    `;

    tbody.innerHTML = html;
  },

  renderMatrizRegionCAC(data) {
    const tbody = document.querySelector('#table-mov-region-cac tbody');
    if (!tbody) return;

    const cf = window.Store ? window.Store.crossFilter : null;
    const isSource = cf && cf.sourceId === 'table-mov-region-cac';

    const supMap = new Map();
    data.forEach(r => {
      const sup = r.supervisor || 'POR ASIGNAR';
      const ase = r.asesor || 'POR ASIGNAR';
      if (!supMap.has(sup)) {
        supMap.set(sup, { c1: 0, c2: 0, c3: 0, c4: 0, total: 0, ases: new Map() });
      }
      const st = supMap.get(sup);
      st.total++;
      if (r.indicaOferta === 'SI') st.c1++;
      if (r.confirmaEquipo === 'SI') st.c2++;
      if (r.avisoPrivacidad === 'SI') st.c3++;
      if (r.solicitaCurp === 'SI') st.c4++;

      if (!st.ases.has(ase)) {
        st.ases.set(ase, { c1: 0, c2: 0, c3: 0, c4: 0, total: 0 });
      }
      const aSt = st.ases.get(ase);
      aSt.total++;
      if (r.indicaOferta === 'SI') aSt.c1++;
      if (r.confirmaEquipo === 'SI') aSt.c2++;
      if (r.avisoPrivacidad === 'SI') aSt.c3++;
      if (r.solicitaCurp === 'SI') aSt.c4++;
    });

    const sortedSups = Array.from(supMap.entries()).sort((a, b) => b[1].total - a[1].total);
    let totC1 = 0, totC2 = 0, totC3 = 0, totC4 = 0, totAll = 0;
    let html = '';

    const fmtCell = (cnt, tot) => {
      if (cnt <= 0) return '-';
      const pct = tot > 0 ? Math.round((cnt / tot) * 100) : 0;
      return `${cnt} <small class="pct-cell">(${pct}%)</small>`;
    };

    sortedSups.forEach(([sup, st]) => {
      totC1 += st.c1;
      totC2 += st.c2;
      totC3 += st.c3;
      totC4 += st.c4;
      totAll += st.total;

      const isExpanded = this.expandedRegions.has(sup);
      const toggle = `<span class="tree-toggle mov-reg-toggle" data-key="${sup}">${isExpanded ? '&minus;' : '+'}</span>`;

      const isSelected = cf && cf.field === 'supervisor' && cf.value === sup;
      const isDimmed = isSource && !(cf.field === 'supervisor' && cf.value === sup);
      const rowClass = isSelected ? 'cf-selected' : (isDimmed ? 'cf-dimmed' : '');

      html += `
        <tr class="tree-level-0 cf-row ${rowClass}" data-cf-field="supervisor" data-cf-val="${sup}">
          <td class="col-nombre" title="${sup}">${toggle} ${sup}</td>
          <td class="col-num">${fmtCell(st.c1, st.total)}</td>
          <td class="col-num">${fmtCell(st.c2, st.total)}</td>
          <td class="col-num">${fmtCell(st.c3, st.total)}</td>
          <td class="col-num">${fmtCell(st.c4, st.total)}</td>
          <td class="col-num"><strong>${st.total}</strong></td>
        </tr>
      `;

      if (isExpanded) {
        Array.from(st.ases.entries())
          .sort((a, b) => b[1].total - a[1].total)
          .forEach(([ase, aSt]) => {
            const aSel = cf && cf.field === 'asesor' && cf.value === ase;
            const aDim = isSource && !(cf.field === 'asesor' && cf.value === ase);
            const aClass = aSel ? 'cf-selected' : (aDim ? 'cf-dimmed' : '');

            html += `
              <tr class="tree-level-1 cf-row ${aClass}" data-cf-field="asesor" data-cf-val="${ase}">
                <td class="col-nombre" style="padding-left: 20px;" title="${ase}">${ase}</td>
                <td class="col-num">${fmtCell(aSt.c1, aSt.total)}</td>
                <td class="col-num">${fmtCell(aSt.c2, aSt.total)}</td>
                <td class="col-num">${fmtCell(aSt.c3, aSt.total)}</td>
                <td class="col-num">${fmtCell(aSt.c4, aSt.total)}</td>
                <td class="col-num">${aSt.total}</td>
              </tr>
            `;
          });
      }
    });

    html += `
      <tr class="row-total">
        <td class="col-nombre">Total</td>
        <td class="col-num">${fmtCell(totC1, totAll)}</td>
        <td class="col-num">${fmtCell(totC2, totAll)}</td>
        <td class="col-num">${fmtCell(totC3, totAll)}</td>
        <td class="col-num">${fmtCell(totC4, totAll)}</td>
        <td class="col-num">${totAll}</td>
      </tr>
    `;

    tbody.innerHTML = html;
  },

  renderMatrizSupAsesor(data) {
    const tbody = document.querySelector('#table-mov-sup-asesor tbody');
    if (!tbody) return;

    const cf = window.Store ? window.Store.crossFilter : null;
    const isSource = cf && cf.sourceId === 'table-mov-sup-asesor';

    const supMap = new Map();
    data.forEach(r => {
      const sup = r.supervisor || 'POR ASIGNAR';
      const ase = r.asesor || 'POR ASIGNAR';
      if (!supMap.has(sup)) supMap.set(sup, { f: 0, inf: 0, monto: 0, total: 0, ases: new Map() });
      const st = supMap.get(sup);
      st.total++;
      if (r.isFundado) st.f++;
      if (r.isInfundado) st.inf++;
      st.monto += (r.montoPenalizado || 0);

      if (!st.ases.has(ase)) st.ases.set(ase, { f: 0, inf: 0, monto: 0, total: 0 });
      const aSt = st.ases.get(ase);
      aSt.total++;
      if (r.isFundado) aSt.f++;
      if (r.isInfundado) aSt.inf++;
      aSt.monto += (r.montoPenalizado || 0);
    });

    const sortedSups = Array.from(supMap.entries()).sort((a, b) => b[1].total - a[1].total);
    let totF = 0, totInf = 0, totMonto = 0, totAll = 0;
    let html = '';

    sortedSups.forEach(([sup, st]) => {
      totF += st.f;
      totInf += st.inf;
      totMonto += st.monto;
      totAll += st.total;

      const isExpanded = this.expandedSups.has(sup);
      const toggle = `<span class="tree-toggle mov-sup-toggle" data-key="${sup}">${isExpanded ? '&minus;' : '+'}</span>`;
      const fPct = st.total > 0 ? Math.round((st.f / st.total) * 100) : 0;

      const isSelected = cf && cf.field === 'supervisor' && cf.value === sup;
      const isDimmed = isSource && !(cf.field === 'supervisor' && cf.value === sup);
      const rowClass = isSelected ? 'cf-selected' : (isDimmed ? 'cf-dimmed' : '');

      html += `
        <tr class="tree-level-0 cf-row ${rowClass}" data-cf-field="supervisor" data-cf-val="${sup}">
          <td class="col-nombre" title="${sup}">${toggle} ${sup}</td>
          <td class="col-num">${st.f > 0 ? st.f : '-'}</td>
          <td class="col-num pct-cell">${st.f > 0 ? this.getSem(fPct) + fPct + '%' : '-'}</td>
          <td class="col-num">${st.inf > 0 ? st.inf : '-'}</td>
          <td class="col-num">${st.monto > 0 ? '$' + st.monto.toLocaleString() : '-'}</td>
          <td class="col-num">${st.total}</td>
        </tr>
      `;

      if (isExpanded) {
        Array.from(st.ases.entries())
          .sort((a, b) => b[1].total - a[1].total)
          .forEach(([ase, aSt]) => {
            const afPct = aSt.total > 0 ? Math.round((aSt.f / aSt.total) * 100) : 0;
            const aSel = cf && cf.field === 'asesor' && cf.value === ase;
            const aDim = isSource && !(cf.field === 'asesor' && cf.value === ase);
            const aClass = aSel ? 'cf-selected' : (aDim ? 'cf-dimmed' : '');

            html += `
              <tr class="tree-level-1 cf-row ${aClass}" data-cf-field="asesor" data-cf-val="${ase}">
                <td class="col-nombre" style="padding-left: 20px;" title="${ase}">${ase}</td>
                <td class="col-num">${aSt.f > 0 ? aSt.f : '-'}</td>
                <td class="col-num pct-cell">${aSt.f > 0 ? afPct + '%' : '-'}</td>
                <td class="col-num">${aSt.inf > 0 ? aSt.inf : '-'}</td>
                <td class="col-num">${aSt.monto > 0 ? '$' + aSt.monto.toLocaleString() : '-'}</td>
                <td class="col-num">${aSt.total}</td>
              </tr>
            `;
          });
      }
    });

    const totFPct = totAll > 0 ? Math.round((totF / totAll) * 100) : 0;

    html += `
      <tr class="row-total">
        <td class="col-nombre">Total</td>
        <td class="col-num">${totF > 0 ? totF : '-'}</td>
        <td class="col-num">${totFPct > 0 ? this.getSem(totFPct) + totFPct + '%' : '-'}</td>
        <td class="col-num">${totInf > 0 ? totInf : '-'}</td>
        <td class="col-num">${totMonto > 0 ? '$' + totMonto.toLocaleString() : '$0'}</td>
        <td class="col-num">${totAll}</td>
      </tr>
    `;

    tbody.innerHTML = html;
  },

  // =========================================================================
  // RENDER VISTA 2: REVERSAS & MATRIZ JERÁRQUICA DINÁMICA
  // =========================================================================
  renderReversasYMatriz() {
    this.init();
    const revData = window.Store ? window.Store.getMovFilteredReversas() : [];
    const tripData = window.Store ? window.Store.getMovFilteredTripletas() : [];

    // 1. Renderizar KPIs y Gráficos Superiores de Reversas
    this.renderReversasKPIs(revData);

    if (window.ChartManager) {
      ChartManager.renderMovReversasDonador('chart-mov-rev-donador', revData);
      ChartManager.renderMovReversasVendor('chart-mov-rev-vendor', revData);
    }

    const revTblData = window.Store ? window.Store.getMovFilteredReversas('table-mov-rev-sup') : revData;
    this.renderTablaReversasSup(revTblData);

    // 2. Renderizar Matriz Jerárquica Evolutiva en la mitad inferior
    const treeDataset = this.matrixSource === 'REVERSAS' ? revData : tripData;
    this.renderMatrizEvolutivaMovistar(treeDataset);
  },

  renderReversasKPIs(revData) {
    const total = revData.length;
    const infundados = revData.filter(r => r.isInfundado).length;
    const fundados = revData.filter(r => r.isFundado).length;
    const infPct = total > 0 ? Math.round((infundados / total) * 100) : 0;
    const sinAudio = revData.filter(r => r.aplicaAudio.includes('SIN AUDIO') || r.aplicaAudio === 'SI').length;
    const monto = revData.reduce((s, r) => s + (r.montoPenalizado || 0), 0);

    const setEl = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setEl('kpi-rev-total', total.toLocaleString());
    setEl('kpi-rev-infundados', `${infundados} (${infPct}%)`);
    setEl('kpi-rev-fundados', `${fundados} Fund. / ${sinAudio} Aplica`);
    setEl('kpi-rev-monto', `$ ${monto.toLocaleString()} MXN`);
  },

  renderTablaReversasSup(revData) {
    const tbody = document.querySelector('#table-mov-rev-sup tbody');
    if (!tbody) return;

    const cf = window.Store ? window.Store.crossFilter : null;
    const isSource = cf && cf.sourceId === 'table-mov-rev-sup';

    const supMap = new Map();
    revData.forEach(r => {
      const sup = r.supervisor || 'POR ASIGNAR';
      if (!supMap.has(sup)) supMap.set(sup, { telcel: 0, altan: 0, att: 0, inf: 0, total: 0 });
      const st = supMap.get(sup);
      st.total++;
      if (r.donador === 'TELCEL') st.telcel++;
      else if (r.donador === 'ALTAN') st.altan++;
      else st.att++;
      if (r.isInfundado) st.inf++;
    });

    const sorted = Array.from(supMap.entries()).sort((a, b) => b[1].total - a[1].total);
    let totTel = 0, totAlt = 0, totAtt = 0, totInf = 0, totAll = 0;
    let html = '';

    sorted.forEach(([sup, st]) => {
      totTel += st.telcel;
      totAlt += st.altan;
      totAtt += st.att;
      totInf += st.inf;
      totAll += st.total;

      const isSelected = cf && cf.field === 'supervisor' && cf.value === sup;
      const isDimmed = isSource && cf.value !== sup;
      const rowClass = isSelected ? 'cf-selected' : (isDimmed ? 'cf-dimmed' : '');

      html += `
        <tr class="cf-row ${rowClass}" data-cf-field="supervisor" data-cf-val="${sup}">
          <td class="col-nombre" title="${sup}">${sup}</td>
          <td class="col-num">${st.telcel > 0 ? st.telcel : '-'}</td>
          <td class="col-num">${st.altan > 0 ? st.altan : '-'}</td>
          <td class="col-num">${st.att > 0 ? st.att : '-'}</td>
          <td class="col-num">${st.inf}</td>
          <td class="col-num"><strong>${st.total}</strong></td>
        </tr>
      `;
    });

    html += `
      <tr class="row-total">
        <td class="col-nombre">Total</td>
        <td class="col-num">${totTel > 0 ? totTel : '-'}</td>
        <td class="col-num">${totAlt > 0 ? totAlt : '-'}</td>
        <td class="col-num">${totAtt > 0 ? totAtt : '-'}</td>
        <td class="col-num">${totInf}</td>
        <td class="col-num">${totAll}</td>
      </tr>
    `;

    tbody.innerHTML = html;
  },

  renderMatrizEvolutivaMovistar(data) {
    const table = document.getElementById('table-mov-evolutivo');
    if (!table) return;

    const thead = table.querySelector('thead');
    const tbody = table.querySelector('tbody');

    const activeLevels = this.selectedDimensions.map(d => {
      const cfg = this.dimFieldMap[d] || { field: 'supervisor', label: d };
      return { id: d, name: cfg.label, field: cfg.field };
    });

    if (activeLevels.length === 0) {
      activeLevels.push({ id: 'SUPERVISOR', name: 'Supervisor', field: 'supervisor' });
    }

    const titleEl = document.getElementById('mov-evolutivo-title');
    if (titleEl) {
      const names = activeLevels.map(l => l.name).join(' > ');
      titleEl.textContent = `Matriz Jerárquica (${this.matrixSource}): ${names}`;
    }

    const headerLabel = activeLevels.map(l => l.name).join(' / ');
    thead.innerHTML = `
      <tr>
        <th rowspan="2" class="th-main">${headerLabel}<br><small>MES (${this.matrixSource})</small></th>
        ${MOV_MONTHS.map(m => `<th colspan="2" class="th-sub">${m}</th>`).join('')}
        <th colspan="2" class="th-sub total">Total</th>
      </tr>
      <tr class="sub-cols">
        ${MOV_MONTHS.map(() => `<th>Q</th><th>%</th>`).join('')}
        <th>Q</th><th>%</th>
      </tr>
    `;

    const monthTotals = {};
    MOV_MONTHS.forEach(m => { monthTotals[m] = 0; });
    let grandTotal = 0;

    data.forEach(r => {
      if (r.monthName && monthTotals[r.monthName] !== undefined) {
        monthTotals[r.monthName]++;
      }
      grandTotal++;
    });

    const root = { children: new Map(), months: {}, total: 0 };
    MOV_MONTHS.forEach(m => { root.months[m] = 0; });

    data.forEach(r => {
      let current = root;
      current.total++;
      if (r.monthName) current.months[r.monthName] = (current.months[r.monthName] || 0) + 1;

      activeLevels.forEach(lvl => {
        const val = String(r[lvl.field] || 'NO ASIGNADO').trim() || 'NO ASIGNADO';
        if (!current.children.has(val)) {
          const nodeMonths = {};
          MOV_MONTHS.forEach(m => { nodeMonths[m] = 0; });
          current.children.set(val, {
            name: val,
            children: new Map(),
            months: nodeMonths,
            total: 0
          });
        }
        current = current.children.get(val);
        current.total++;
        if (r.monthName) {
          current.months[r.monthName] = (current.months[r.monthName] || 0) + 1;
        }
      });
    });

    this._allTreePaths = new Set();
    let tbodyHtml = '';

    const renderLevel = (node, levelIndex, pathPrefix) => {
      const isLeaf = levelIndex >= activeLevels.length - 1;
      const sortedKeys = Array.from(node.children.keys()).sort((a, b) => a.localeCompare(b));

      sortedKeys.forEach(key => {
        const child = node.children.get(key);
        const currentPath = pathPrefix ? `${pathPrefix}:::${key}` : key;
        this._allTreePaths.add(currentPath);

        const hasChildren = child.children.size > 0 && !isLeaf;
        const isExpanded = this.expandedTreeNodes.has(currentPath);
        const indentPx = levelIndex * 18;

        const toggleHtml = hasChildren
          ? `<button type="button" class="tree-toggle mov-tree-toggle" data-path="${currentPath}">${isExpanded ? '&minus;' : '+'}</button>`
          : `<span class="tree-toggle empty"></span>`;

        tbodyHtml += `<tr class="tree-level-${Math.min(levelIndex, 3)}">`;
        tbodyHtml += `<td class="col-nombre" style="padding-left: ${indentPx + 6}px; cursor: ${hasChildren ? 'pointer' : 'default'};" title="${child.name}">${toggleHtml} <span>${child.name}</span></td>`;

        MOV_MONTHS.forEach(m => {
          const count = child.months[m] || 0;
          const mTot = monthTotals[m] || 0;
          const pct = mTot > 0 && count > 0 ? Math.round((count / mTot) * 100) : 0;
          tbodyHtml += `
            <td class="col-num">${count > 0 ? count : '-'}</td>
            <td class="col-num pct-cell">${count > 0 ? pct + '%' : '-'}</td>
          `;
        });

        const rowPct = grandTotal > 0 ? Math.round((child.total / grandTotal) * 100) : 0;
        tbodyHtml += `
          <td class="col-num">${child.total > 0 ? child.total : '-'}</td>
          <td class="col-num pct-cell">${rowPct > 0 ? rowPct + '%' : '-'}</td>
        </tr>`;

        if (hasChildren && isExpanded) {
          renderLevel(child, levelIndex + 1, currentPath);
        }
      });
    };

    renderLevel(root, 0, '');

    tbodyHtml += `<tr class="row-total"><td class="col-nombre">Total</td>`;
    MOV_MONTHS.forEach(m => {
      const mTot = monthTotals[m] || 0;
      tbodyHtml += `
        <td class="col-num">${mTot > 0 ? mTot : '-'}</td>
        <td class="col-num">${mTot > 0 ? '100%' : '-'}</td>
      `;
    });
    tbodyHtml += `
      <td class="col-num">${grandTotal > 0 ? grandTotal : '-'}</td>
      <td class="col-num">100%</td>
    </tr>`;

    tbody.innerHTML = tbodyHtml;
  }
};


// ===== FILE: app.js =====
/**
 * app.js - Orquestador principal, Router SPA y Event Listeners (Entel & Movistar)
 */

window.App = {
  activeView: 'landing', // 'landing' | 'dashboard'
  activeTab: 'portada',  // 'portada' | 'detalle' | 'reincidencia' | 'mov-portada' | 'mov-reversas'

  async init() {
    this.setupIcons();
    this.setupEventListeners();
    ReincidenciaView.init();
    MovistarView.init();

    // Suscribirse a cambios en el Store
    Store.subscribe(() => {
      this.updateFilterDropdowns();
      this.renderActiveTab();
      this.updateRecordsCounter();
    });

    // Cargar datos de Entel y Movistar
    await this.loadData();
  },

  setupIcons() {
    if (window.lucide) {
      window.lucide.createIcons();
    }
  },

  showLoading(show, title = 'Cargando BI de Reclamos...', sub = 'Sincronizando Google Sheets y Supabase') {
    const overlay = document.getElementById('loading-overlay');
    const tEl = document.getElementById('loader-title');
    const sEl = document.getElementById('loader-sub');
    if (!overlay) return;

    if (show) {
      if (tEl) tEl.textContent = title;
      if (sEl) sEl.textContent = sub;
      overlay.classList.remove('hidden');
    } else {
      overlay.classList.add('hidden');
    }
  },

  showToast(msg, type = 'success') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.className = `toast ${type} show`;
    setTimeout(() => {
      toast.classList.remove('show');
    }, 3500);
  },

  async loadData() {
    this.showLoading(true);
    try {
      // Peticiones en paralelo a Entel y Movistar con tolerancia a fallos individuales
      const [reclamosData, nominaData, movTripletasRows, movReversasRows] = await Promise.all([
        ApiService.fetchReclamos().catch(() => []),
        ApiService.fetchNomina().catch(() => []),
        ApiService.fetchMovistarTripletas().catch(() => []),
        ApiService.fetchMovistarReversas().catch(() => [])
      ]);

      await Store.initData(reclamosData, nominaData);
      try {
        Store.initMovistarData(movTripletasRows, movReversasRows);
      } catch (movErr) {
        console.warn("Advertencia procesando Movistar:", movErr);
      }

      const tsEl = document.getElementById('landing-timestamp');
      if (tsEl) tsEl.textContent = Store.lastModifiedTimestamp || 'Actualizado recientemente';

      this.showToast(`Sincronizado: Entel (${Store.enrichedReclamos.length}) | Movistar (${Store.movistarTripletas.length + Store.movistarReversas.length})`, 'success');
    } catch (err) {
      console.error("Error al cargar datos:", err);
      this.showToast('Error de sincronización con origen de datos', 'error');
    } finally {
      this.showLoading(false);
      this.setupIcons();
    }
  },

  setupEventListeners() {
    // 1. Selector de Campaña ENTEL (Landing -> Dashboard Entel)
    const btnEntel = document.getElementById('btn-entel');
    if (btnEntel) {
      btnEntel.addEventListener('click', () => {
        this.openBrandDashboard('entel');
      });
    }

    // 2. Selector de Campaña MOVISTAR (Landing -> Dashboard Movistar)
    const btnMovistar = document.getElementById('btn-movistar');
    if (btnMovistar) {
      btnMovistar.addEventListener('click', () => {
        this.openBrandDashboard('movistar');
      });
    }

    // 3. Volver al Landing
    const btnBackHome = document.getElementById('btn-back-home');
    if (btnBackHome) {
      btnBackHome.addEventListener('click', () => {
        this.switchView('landing');
      });
    }

    // 4. Navegación por pestañas
    const navTabs = document.querySelectorAll('.nav-tab');
    navTabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        const targetTab = e.currentTarget.dataset.tab;
        this.switchTab(targetTab);
      });
    });

    // 5. Segmentador de Años (2023, 2024, 2025, 2026)
    const yearBtns = document.querySelectorAll('.year-btn');
    yearBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        if (Store.activeBrand === 'movistar') return; // Movistar trabaja sobre periodo actual 2026
        yearBtns.forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        const year = e.currentTarget.dataset.year;
        Store.setFilter('year', year);
      });
    });

    // 6. Botón Refresh en vivo
    const btnRefresh = document.getElementById('btn-refresh');
    if (btnRefresh) {
      btnRefresh.addEventListener('click', () => {
        this.loadData();
      });
    }

    // 7. Inicializar Contenedores de Segmentadores Multi-Select (Global y Detalle)
    this.initMultiSelects();

    // 8. Botón Limpiar Filtros
    const btnReset = document.getElementById('btn-reset-filters');
    if (btnReset) {
      btnReset.addEventListener('click', () => {
        Store.resetFilters();
      });
    }
  },

  openBrandDashboard(brand) {
    Store.activeBrand = brand;
    Store.crossFilter = null;

    // Mostrar/ocultar pestañas según marca
    document.querySelectorAll('.entel-tab').forEach(el => {
      el.style.display = (brand === 'entel') ? 'inline-block' : 'none';
    });
    document.querySelectorAll('.movistar-tab').forEach(el => {
      el.style.display = (brand === 'movistar') ? 'inline-block' : 'none';
    });

    // Actualizar etiquetas de la barra superior de filtros
    const setLbl = (id, txt) => {
      const el = document.getElementById(id);
      if (el) el.textContent = txt;
    };

    const yearSlicers = document.getElementById('year-slicers');

    if (brand === 'movistar') {
      setLbl('lbl-filter-campana', 'Supervisor');
      setLbl('lbl-filter-estado', 'Estado');
      setLbl('lbl-filter-responsabilidad', 'Conclusión');
      setLbl('lbl-filter-respuesta', 'Penalidad');
      setLbl('lbl-filter-mes', 'Mes');
      if (yearSlicers) {
        yearSlicers.querySelectorAll('.year-btn').forEach(b => {
          const is2026 = b.dataset.year === '2026';
          b.classList.toggle('active', is2026);
          b.style.display = is2026 ? 'inline-block' : 'none';
        });
      }
      this.switchView('dashboard');
      this.switchTab('mov-portada');
    } else {
      setLbl('lbl-filter-campana', 'Campaña');
      setLbl('lbl-filter-estado', 'Estado');
      setLbl('lbl-filter-responsabilidad', 'Responsabilidad');
      setLbl('lbl-filter-respuesta', 'Respuesta');
      setLbl('lbl-filter-mes', 'Mes');
      if (yearSlicers) {
        yearSlicers.querySelectorAll('.year-btn').forEach(b => {
          b.style.display = 'inline-block';
          b.classList.toggle('active', b.dataset.year === Store.filters.year);
        });
      }
      this.switchView('dashboard');
      this.switchTab('portada');
    }

    this.updateFilterDropdowns();
    this.updateRecordsCounter();
  },

  initMultiSelects() {
    if (this._msInitialized) return;
    this._msInitialized = true;

    const filterConfig = [
      { id: 'filter-campana', key: 'campana' },
      { id: 'filter-estado', key: 'estado' },
      { id: 'filter-responsabilidad', key: 'responsabilidad' },
      { id: 'filter-respuesta', key: 'respuesta' },
      { id: 'filter-mes', key: 'mes' },
      { id: 'filter-campana-detalle', key: 'campana' },
      { id: 'filter-estado-detalle', key: 'estado' },
      { id: 'filter-responsabilidad-detalle', key: 'responsabilidad' },
      { id: 'filter-mes-detalle', key: 'mes' }
    ];

    this._msElements = [];

    filterConfig.forEach(cfg => {
      const origSelect = document.getElementById(cfg.id);
      if (!origSelect) return;

      origSelect.style.display = 'none';

      const wrapper = document.createElement('div');
      wrapper.className = 'ms-dropdown';
      wrapper.dataset.filterKey = cfg.key;
      wrapper.dataset.selectId = cfg.id;

      wrapper.innerHTML = `
        <button type="button" class="ms-trigger">
          <span class="ms-label">Todas</span>
          <span class="ms-caret">&#9662;</span>
        </button>
        <div class="ms-menu">
          <div class="ms-Search-wrap">
            <label class="ms-item ms-item-all">
              <input type="checkbox" class="ms-check-all" checked>
              <span>Seleccionar todas</span>
            </label>
          </div>
          <div class="ms-options-list"></div>
        </div>
      `;

      origSelect.parentNode.insertBefore(wrapper, origSelect.nextSibling);
      this._msElements.push({ wrapper, key: cfg.key, id: cfg.id });

      const trigger = wrapper.querySelector('.ms-trigger');
      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = wrapper.classList.contains('open');
        document.querySelectorAll('.ms-dropdown.open').forEach(el => el.classList.remove('open'));
        if (!isOpen) {
          wrapper.classList.add('open');
        }
      });

      const menu = wrapper.querySelector('.ms-menu');
      menu.addEventListener('click', (e) => {
        e.stopPropagation();
      });

      const checkAll = wrapper.querySelector('.ms-check-all');
      checkAll.addEventListener('change', () => {
        Store.clearFilterKey(cfg.key);
      });
    });

    document.addEventListener('click', () => {
      document.querySelectorAll('.ms-dropdown.open').forEach(el => el.classList.remove('open'));
    });
  },

  switchView(viewName) {
    this.activeView = viewName;
    const viewLanding = document.getElementById('view-landing');
    const viewDashboard = document.getElementById('view-dashboard');

    if (viewName === 'dashboard') {
      viewLanding.classList.remove('active');
      viewDashboard.classList.add('active');
      this.renderActiveTab();
      setTimeout(() => ChartManager.resizeAll(), 80);
    } else {
      viewDashboard.classList.remove('active');
      viewLanding.classList.add('active');
    }
    this.setupIcons();
  },

  switchTab(tabName) {
    this.activeTab = tabName;
    Store.crossFilter = null;

    document.querySelectorAll('.nav-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === tabName);
    });

    document.querySelectorAll('.tab-pane').forEach(p => {
      p.classList.toggle('active', p.id === `tab-${tabName}`);
    });

    const breadcrumb = document.getElementById('header-breadcrumb');
    if (breadcrumb) {
      if (tabName === 'mov-portada') {
        breadcrumb.textContent = 'MOVISTAR — PORTADA TRIPLETAS';
      } else if (tabName === 'mov-reversas') {
        breadcrumb.textContent = 'MOVISTAR — REVERSAS & MATRIZ';
      } else {
        breadcrumb.textContent = `${tabName.toUpperCase()} - RECLAMOS`;
      }
    }

    // Mostrar el 4to filtro en Reincidencia (Respuesta) y en Movistar (Penalidad)
    const filterRespWrap = document.getElementById('filter-respuesta-wrap');
    if (filterRespWrap) {
      const showFourth = (tabName === 'reincidencia' || Store.activeBrand === 'movistar');
      filterRespWrap.style.display = showFourth ? 'flex' : 'none';
    }

    this.renderActiveTab();
    this.updateRecordsCounter();
    setTimeout(() => ChartManager.resizeAll(), 60);
    this.setupIcons();
  },

  renderActiveTab() {
    if (this.activeView !== 'dashboard') return;

    if (this.activeTab === 'mov-portada') {
      MovistarView.renderPortada();
      return;
    }
    if (this.activeTab === 'mov-reversas') {
      MovistarView.renderReversasYMatriz();
      return;
    }

    const filteredData = Store.getFilteredData();
    if (this.activeTab === 'portada') {
      PortadaView.render(filteredData);
    } else if (this.activeTab === 'detalle') {
      DetalleView.render(filteredData);
    } else if (this.activeTab === 'reincidencia') {
      ReincidenciaView.render(filteredData);
    }
  },

  updateFilterDropdowns() {
    const opts = Store.getFilterOptions();
    const keyOptionsMap = {
      campana: opts.campanas,
      estado: opts.estados,
      responsabilidad: opts.responsabilidades,
      respuesta: opts.respuestas,
      mes: opts.meses
    };

    if (!this._msElements) return;

    this._msElements.forEach(item => {
      const { wrapper, key } = item;
      const values = keyOptionsMap[key] || [];
      const selectedArr = Store.getActiveFilterArray(key);
      const isAllSelected = selectedArr.length === 0;

      const labelEl = wrapper.querySelector('.ms-label');
      if (labelEl) {
        if (isAllSelected) {
          labelEl.textContent = 'Todas';
          wrapper.classList.remove('has-selection');
        } else if (selectedArr.length === 1) {
          labelEl.textContent = selectedArr[0];
          wrapper.classList.add('has-selection');
        } else if (selectedArr.length === 2) {
          labelEl.textContent = `${selectedArr[0]}, ${selectedArr[1]}`;
          wrapper.classList.add('has-selection');
        } else {
          labelEl.textContent = `${selectedArr.length} seleccionados`;
          wrapper.classList.add('has-selection');
        }
        labelEl.title = isAllSelected ? 'Todas' : selectedArr.join(', ');
      }

      const checkAll = wrapper.querySelector('.ms-check-all');
      if (checkAll) {
        checkAll.checked = isAllSelected;
      }

      const listEl = wrapper.querySelector('.ms-options-list');
      if (listEl) {
        let html = '';
        values.forEach(val => {
          const isChecked = !isAllSelected && selectedArr.includes(val);
          html += `
            <label class="ms-item ${isChecked ? 'checked' : ''}">
              <input type="checkbox" class="ms-opt-check" value="${val}" ${isChecked ? 'checked' : ''}>
              <span>${val}</span>
            </label>
          `;
        });
        listEl.innerHTML = html;

        listEl.querySelectorAll('.ms-opt-check').forEach(chk => {
          chk.addEventListener('change', (e) => {
            const val = e.target.value;
            Store.toggleFilterOption(key, val);
          });
        });
      }
    });
  },

  updateRecordsCounter() {
    const countEl = document.getElementById('records-counter');
    if (!countEl) return;

    if (Store.activeBrand === 'movistar') {
      if (this.activeTab === 'mov-reversas') {
        const revCount = Store.getMovFilteredReversas().length;
        const tripCount = Store.getMovFilteredTripletas().length;
        countEl.textContent = `${revCount} Reversas | ${tripCount} Tripletas`;
      } else {
        const count = Store.getMovFilteredTripletas().length;
        countEl.textContent = `${count.toLocaleString()} Tripletas`;
      }
    } else {
      const count = Store.getFilteredData().length;
      countEl.textContent = `${count.toLocaleString()} registros`;
    }
  }
};


// Bootstrap
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { window.App.init(); });
} else {
  window.App.init();
}
