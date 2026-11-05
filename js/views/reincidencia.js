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
