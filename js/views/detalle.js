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
