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
