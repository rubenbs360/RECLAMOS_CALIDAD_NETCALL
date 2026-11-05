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
