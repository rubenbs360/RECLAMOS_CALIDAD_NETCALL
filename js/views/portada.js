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
