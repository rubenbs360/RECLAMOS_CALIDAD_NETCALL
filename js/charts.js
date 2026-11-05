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
      backgroundColor: 'rgba(14, 46, 103, 0.95)',
      borderColor: '#3B5E96',
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
          color: '#0E2E67',
          borderRadius: 2
        },
        label: {
          show: true,
          position: 'right',
          formatter: '{c} %',
          color: '#0E2E67',
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
              color: isSelected ? '#0E2E67' : '#0D6ABF',
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
          color: '#1A3B78',
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
          color: (val) => (isSameFieldCF && cf.value === val) ? '#0E2E67' : '#64748B',
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
          color: '#E64A00',
          borderRadius: 2
        },
        label: {
          show: true,
          position: 'right',
          formatter: '{c} %',
          color: '#1A3B78',
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
              color: isSelected ? '#C2410C' : '#E64A00',
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
          color: '#1A3B78',
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
          color: isSelected ? '#0E2E67' : '#0D6ABF',
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
          color: (val) => (cf && cf.field === 'campana' && cf.value === val) ? '#0E2E67' : '#475569',
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
            color: '#1A3B78',
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
          itemStyle: { color: '#E64A00' },
          lineStyle: { width: 2.5, color: '#E64A00' },
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
        itemStyle: { color: '#0D6ABF', opacity: isDimmed ? 0.28 : 1 }
      });
      infundadoPcts.push({
        value: infPct,
        itemStyle: { color: '#E64A00', opacity: isDimmed ? 0.28 : 1 }
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
        itemStyle: { color: '#0D6ABF', opacity: isDimmed ? 0.28 : 1 }
      });
      infundados.push({
        value: tot > 0 ? +( (inf / tot) * 100 ).toFixed(2) : 0,
        itemStyle: { color: '#E64A00', opacity: isDimmed ? 0.28 : 1 }
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
        itemStyle: { color: '#0D6ABF', opacity: isDimmed ? 0.28 : 1 }
      });
      infundados.push({
        value: tot > 0 ? +( (inf / tot) * 100 ).toFixed(2) : 0,
        itemStyle: { color: '#E64A00', opacity: isDimmed ? 0.28 : 1 }
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
          color: '#0E2E67',
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
          color: '#1A3B78',
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
          color: (val) => (isSameFieldCF && cf.value === val) ? '#0E2E67' : '#64748B',
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
          color: '#1A3B78',
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
              color: isSelected ? '#C2410C' : '#E64A00',
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
          color: '#1A3B78',
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
          color: isSelected ? '#0E2E67' : '#0D6ABF',
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
          color: (val) => (isSameFieldCF && cf.value === val) ? '#0E2E67' : '#475569',
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
          label: { show: true, position: 'top', color: '#1A3B78', fontSize: 9, fontWeight: 700 }
        },
        {
          name: '%',
          type: 'line',
          yAxisIndex: 1,
          data: pctValues,
          symbol: 'circle',
          symbolSize: 5,
          itemStyle: { color: '#E64A00' },
          lineStyle: { width: 2, color: '#E64A00' },
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
                color: k === 'TELCEL' ? '#0284C7' : (k === 'ALTAN' ? '#E64A00' : '#6366F1'),
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
            color: '#0E2E67'
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
            color: '#0E2E67'
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
