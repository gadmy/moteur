
  const LazyLib = {
    _cache: {},
    _defs: {
      chart: { js: [{ src: 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js', integrity: 'sha384-9nhczxUqK87bcKHh20fSQcTGD4qq5GhayNYSYWqwBkINBhOfQLg/P5HG5lF1urn4', crossorigin: 'anonymous' }], css: [], ready: () => typeof Chart !== 'undefined' },
      leaflet: {
        css: ['https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', 'https://unpkg.com/leaflet.markercluster@1.4.1/dist/MarkerCluster.css', 'https://unpkg.com/leaflet.markercluster@1.4.1/dist/MarkerCluster.Default.css'],
        js: [
          { src: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', integrity: 'sha384-cxOPjt7s7Iz04uaHJceBmS+qpjv2JkIHNVcuOrM+YHwZOmJGBXI00mdUXEq65HTH', crossorigin: 'anonymous' },
          { src: 'https://unpkg.com/leaflet.markercluster@1.4.1/dist/leaflet.markercluster.js', integrity: 'sha384-RLIyj5q1b5XJTn0tqUhucRZe40nFTocRP91R/NkRJHwAe4XxnTV77FXy/vGLiec2', crossorigin: 'anonymous' }
        ],
        ready: () => typeof L !== 'undefined' && !!L.markerClusterGroup
      },
      pdfjs: {
        js: [{ src: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', integrity: 'sha512-q+4liFwdPC/bNdhUpZx6aXDx/h77yEQtn4I1slHydcbZK34nLaR3cAeYSJshoxIOq3mjEf7xJE8YWIUHMn+oCQ==', crossorigin: 'anonymous' }],
        css: [],
        ready: () => typeof pdfjsLib !== 'undefined',
        after: () => { if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; }
      },
      pdfexport: {
        js: [
          { src: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', integrity: 'sha512-qZvrmS2ekKPF2mSznTQsxqPgnpkI4DNTlrdUmTzrDgektczlKNRRhy5X5AAOnx5S09ydFYWWNSfcEqDTTHgtNA==', crossorigin: 'anonymous' },
          { src: 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js', integrity: 'sha384-weMABwrltA6jWR8DDe9Jp5blk+tZQh7ugpCsF3JwSA53WZM9/14PjS5LAJNHNjAI', crossorigin: 'anonymous' },
          { src: 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', integrity: 'sha512-BNaRQnYJYiPSqHHDb58B0yaPfCu+Wgds8Gp/gU33kqBtgNS4tSPHuGibyoeqMV/TJlSKda6FXzoEyYGjTe+vXA==', crossorigin: 'anonymous' }
        ],
        css: [],
        ready: () => !!(window.jspdf && window.jspdf.jsPDF) && typeof PDFLib !== 'undefined' && typeof html2canvas !== 'undefined',
        after: () => { if (window.__patchJsPDF) window.__patchJsPDF(); }
      }
    },
    _loadScript(s) {
      return new Promise((resolve, reject) => {
        const el = document.createElement('script');
        el.src = s.src;
        if (s.integrity) el.integrity = s.integrity;
        if (s.crossorigin) el.crossOrigin = s.crossorigin;
        el.onload = () => resolve();
        el.onerror = () => reject(new Error('LazyLib echec ' + s.src));
        document.head.appendChild(el);
      });
    },
    _loadCss(href) {
      return new Promise((resolve, reject) => {
        const el = document.createElement('link');
        el.rel = 'stylesheet'; el.href = href;
        el.onload = () => resolve();
        el.onerror = () => reject(new Error('LazyLib echec css ' + href));
        document.head.appendChild(el);
      });
    },
    load(key) {
      if (this._cache[key]) return this._cache[key];
      const def = this._defs[key];
      if (!def) return Promise.reject(new Error('LazyLib cle inconnue ' + key));
      const runAfter = () => { if (def.after) { try { def.after(); } catch(e) { console.warn('LazyLib after', key, e); } } };
      if (def.ready && def.ready()) { runAfter(); this._cache[key] = Promise.resolve(); return this._cache[key]; }
      let chain = Promise.all((def.css || []).map(h => this._loadCss(h)));
      (def.js || []).forEach(s => { chain = chain.then(() => this._loadScript(s)); });
      chain = chain.then(runAfter);
      this._cache[key] = chain;
      return chain;
    }
  };
