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
