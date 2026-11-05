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
