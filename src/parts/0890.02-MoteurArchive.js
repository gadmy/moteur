
// ============================================================================
// === MoteurArchive [Phase B] : helper d'export/import ZIP "moteur" complet ===
// ============================================================================
// Crée des archives ZIP signées (.moteur.zip) contenant :
//   - moteur-manifest.json : signature, version, date, hash
//   - project.json         : tout state.data (avec URLs Storage RÉÉCRITES en chemins relatifs)
//   - storage/             : toutes les images Storage downloadées en local
//
// Une archive est dite "moteur" si elle contient un moteur-manifest.json
// avec la clé "signature" === "MOTEUR_PROJECT_ARCHIVE_V1"
const MoteurArchive = {
    SIGNATURE: 'MOTEUR_PROJECT_ARCHIVE_V1',
    VERSION: '1.0',
    EXTENSION: '.moteur.zip',
    
    // === Charge JSZip à la demande ===
    ensureJSZip: () => {
        return new Promise((resolve, reject) => {
            if(typeof JSZip !== 'undefined') { resolve(); return; }
            const script = document.createElement('script');
            // v602 : empreinte verifiee (SRI) — si le fichier du CDN change,
            // le navigateur refuse de l'executer. jsDelivr sert le fichier
            // exact du paquet npm, dont l'empreinte a ete calculee.
            script.src = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
            script.integrity = 'sha384-+mbV2IY1Zk/X1p/nWllGySJSUN8uMs+gUAN10Or95UBH0fpj6GfKgPmgC5EXieXG';
            script.crossOrigin = 'anonymous';
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('JSZip introuvable'));
            document.head.appendChild(script);
        });
    },
    
    // === Trouve récursivement toutes les URLs Storage dans state.data ===
    // Retourne [{ path: 'chemin.dans.objet', url: 'https://...' }, ...]
    findAllStorageUrls: (obj, pathPrefix = '') => {
        const results = [];
        if(!obj) return results;
        
        const isStorageUrl = (s) => {
            if(typeof s !== 'string') return false;
            // URLs Supabase Storage publiques
            return s.startsWith('http') && (s.includes('/storage/v1/object/public/') || s.includes('.supabase.co'));
        };
        
        if(typeof obj === 'string') {
            if(isStorageUrl(obj)) results.push({ path: pathPrefix, url: obj });
            return results;
        }
        
        if(Array.isArray(obj)) {
            obj.forEach((item, idx) => {
                results.push(...MoteurArchive.findAllStorageUrls(item, `${pathPrefix}[${idx}]`));
            });
            return results;
        }
        
        if(typeof obj === 'object') {
            Object.entries(obj).forEach(([key, val]) => {
                const newPath = pathPrefix ? `${pathPrefix}.${key}` : key;
                results.push(...MoteurArchive.findAllStorageUrls(val, newPath));
            });
        }
        
        return results;
    },
    
    // === Génère un nom de fichier local depuis une URL ===
    // ex: "https://xxx.supabase.co/storage/v1/object/public/projects/abc/photo.jpg"
    //     → "storage/abc/photo.jpg"
    urlToLocalPath: (url) => {
        try {
            const u = new URL(url);
            // Extraire la partie après /public/<bucket>/
            const match = u.pathname.match(/\/public\/[^/]+\/(.+)$/);
            if(match) return 'storage/' + decodeURIComponent(match[1]);
            // Fallback : juste le nom de fichier
            const fn = u.pathname.split('/').pop();
            return 'storage/' + (fn || 'unknown.bin');
        } catch(e) {
            return 'storage/' + Date.now() + '.bin';
        }
    },
    
    // === Calcule un hash simple du JSON (pour vérification d'intégrité) ===
    simpleHash: (str) => {
        let h = 0;
        for(let i = 0; i < str.length; i++) {
            h = ((h << 5) - h) + str.charCodeAt(i);
            h |= 0;
        }
        return 'h' + Math.abs(h).toString(36);
    },
    
    // === Modal de progression ===
    // Retourne un objet { update, close, isCancelled }
    showProgressModal: (titleText) => {
        // Supprimer toute modale précédente
        const existing = document.getElementById('moteurArchiveProgress');
        if(existing) existing.remove();
        
        const overlay = document.createElement('div');
        overlay.id = 'moteurArchiveProgress';
        overlay.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.6); z-index: var(--z-modal); display:flex; align-items:center; justify-content:center;';
        overlay.innerHTML = `
            <div style="background:var(--panel-bg, #fff); color:var(--text-main, #222); border-radius:12px; padding:30px; min-width:420px; max-width:90vw; box-shadow:0 10px 40px rgba(0,0,0,0.3);">
                <h3 style="margin:0 0 20px 0; font-size:1.2rem;">${titleText}</h3>
                <div id="moteurArchiveCurrent" style="font-size:0.9rem; color:var(--text-sec, #666); margin-bottom:10px; min-height:1.2em; word-break:break-all;">Initialisation…</div>
                <div style="background:#e0e0e0; height:10px; border-radius:5px; overflow:hidden; margin-bottom:8px;">
                    <div id="moteurArchiveBar" style="background:var(--primary, #2b6ef6); height:100%; width:0%; transition:width 0.2s;"></div>
                </div>
                <div style="display:flex; justify-content:space-between; font-size:0.85rem; color:var(--text-sec, #666); margin-bottom:20px;">
                    <span id="moteurArchivePct">0%</span>
                    <span id="moteurArchiveCount"></span>
                </div>
                <div style="text-align:right;">
                    <button id="moteurArchiveCancel" style="padding:8px 18px; background:#dc3545; color:#fff; border:none; border-radius:6px; cursor:pointer; font-weight:600;">Annuler</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        
        const state = { cancelled: false };
        document.getElementById('moteurArchiveCancel').onclick = () => {
            state.cancelled = true;
            document.getElementById('moteurArchiveCurrent').textContent = 'Annulation en cours…';
        };
        
        return {
            update: (current, done, total) => {
                const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                const bar = document.getElementById('moteurArchiveBar');
                const pctEl = document.getElementById('moteurArchivePct');
                const countEl = document.getElementById('moteurArchiveCount');
                const curEl = document.getElementById('moteurArchiveCurrent');
                if(bar) bar.style.width = pct + '%';
                if(pctEl) pctEl.textContent = pct + '%';
                if(countEl && total > 0) countEl.textContent = `${done} / ${total}`;
                if(curEl && current) curEl.textContent = current;
            },
            close: () => { 
                const o = document.getElementById('moteurArchiveProgress'); 
                if(o) o.remove(); 
            },
            isCancelled: () => state.cancelled
        };
    }
};

 const Exporter = {
    toPDF: (opts) => { 
        // [FIX state-not-defined] Fallback automatique : si opts.author absent, lire depuis scriptMeta
        opts = opts || {};
        const meta = (state.data && state.data.scriptMeta) ? state.data.scriptMeta : {};
        if(!opts.author && meta.author) {
            opts.author = meta.author;
        }
        document.body.className = state.currentRole === 'viewer' ? 'read-only' : ''; 
        if(document.body.classList.contains('dark-mode')) document.body.classList.remove('dark-mode'); 
        
        // [Scénario PDF] Page de garde enrichie style Final Draft / Celtx
        const _esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        document.getElementById('pc-title').innerText = state.data.title || '';
        
        // Ligne auteur : "Auteur : Prénom Nom" + co-auteur éventuel
        let authorLine = '';
        if(opts.author || meta.author) {
            authorLine = 'Auteur : ' + _esc(opts.author || meta.author);
            if(meta.coAuthor) authorLine += ' & ' + _esc(meta.coAuthor);
        }
        document.getElementById('pc-author').innerText = authorLine;
        
        // Source : "Adapté de ..."
        const pcSource = document.getElementById('pc-source');
        if(pcSource) pcSource.innerText = meta.source ? 'Adapté de : ' + meta.source : '';
        
        // Brouillon + date : "Premier jet — 12/03/2026"
        const pcDraft = document.getElementById('pc-draft');
        if(pcDraft) {
            let draftLine = '';
            if(meta.draft) draftLine = meta.draft;
            if(meta.draftDate) {
                const d = new Date(meta.draftDate);
                if(!isNaN(d)) draftLine += (draftLine ? ' — ' : '') + d.toLocaleDateString('fr-FR');
            }
            pcDraft.innerText = draftLine;
        }
        
        // Numéro CNC / dépôt (depuis opts.reg si fourni via modale, sinon depuis copyright si formaté)
        const pcCnc = document.getElementById('pc-cnc');
        if(pcCnc) {
            let cncLine = '';
            if(opts.reg) cncLine = 'N° de dépôt CNC : ' + opts.reg;
            pcCnc.innerText = cncLine;
        }
        
        // Bloc contact bas-gauche : reproduit une page de garde Celtx/Final Draft
        // Affiche TOUJOURS les libellés (même vides) sauf si tout est absent
        let contactHtml = '';
        const contactValue = opts.phone || meta.contact || '';
        const webValue = opts.web || '';
        const copyrightValue = meta.copyright || '';
        const notesValue = meta.notes || '';
        contactHtml += '<p>Contact auteur : ' + _esc(contactValue) + '</p>';
        if(webValue) contactHtml += '<p>Web : ' + _esc(webValue) + '</p>';
        if(copyrightValue) contactHtml += '<p>' + _esc(copyrightValue) + '</p>';
        if(notesValue) contactHtml += '<p>' + _esc(notesValue) + '</p>';
        document.getElementById('pc-contact').innerHTML = contactHtml;
        
        // [Scénario PDF] Footer en bas à droite de chaque page
        // Stratégie : @page @bottom-right natif pour Chromium (date + X/Y), 
        // overlay HTML simple pour Firefox/Safari (date seule, plus fiable que la pagination JS)
        const today = new Date();
        const dateFr = String(today.getDate()).padStart(2, '0') + '/' + String(today.getMonth() + 1).padStart(2, '0') + '/' + today.getFullYear();
        
        // Nettoyer anciens styles
        const _oldStyle = document.getElementById('dynamic-print-footer');
        if(_oldStyle) _oldStyle.remove();
        const _oldOverlayStyle = document.getElementById('dynamic-print-footer-overlay');
        if(_oldOverlayStyle) _oldOverlayStyle.remove();
        
        // ── Couche 1 : @page @bottom-right natif (Chromium 131+ : Chrome/Edge/Opera/Brave) ──
        const _printStyle = document.createElement('style');
        _printStyle.id = 'dynamic-print-footer';
        _printStyle.textContent = `
            @media print {
                @page {
                    @bottom-right {
                        content: "${dateFr} — " counter(page) "/" counter(pages);
                        font-family: 'Courier Prime', 'Courier', monospace;
                        font-size: 9pt;
                        color: #555;
                        margin-bottom: 10mm;
                    }
                }
            }
        `;
        document.head.appendChild(_printStyle);
        
        // ── Couche 2 : Overlay HTML "date seule" pour Firefox/Safari (date sans pagination, fiable) ──
        // Position fixed à l'impression : répété automatiquement sur chaque page par le navigateur.
        // En Chromium, cet overlay sera caché car @bottom-right occupe déjà la place.
        const _overlayStyle = document.createElement('style');
        _overlayStyle.id = 'dynamic-print-footer-overlay';
        _overlayStyle.textContent = `
            @media screen { .print-footer-overlay { display: none !important; } }
            @media print {
                .print-footer-overlay {
                    position: fixed;
                    bottom: 10mm;
                    right: 25mm;
                    font-family: 'Courier Prime', 'Courier', monospace;
                    font-size: 9pt;
                    color: #555 !important;
                    background: transparent !important;
                    z-index: 9999;
                }
                /* Masquer l'overlay en Chromium 131+ : il a déjà @page @bottom-right */
                @supports (page-orientation: portrait) {
                    .print-footer-overlay { display: none !important; }
                }
            }
        `;
        document.head.appendChild(_overlayStyle);
        
        // Injecter l'élément overlay (un seul, le navigateur le répète sur chaque page via position:fixed)
        document.querySelectorAll('.print-footer-overlay').forEach(el => el.remove());
        if(opts.script) {
            const _footerEl = document.createElement('div');
            _footerEl.className = 'print-footer-overlay';
            _footerEl.textContent = dateFr;
            document.body.appendChild(_footerEl);
        }
        
        // Modale d'information avant impression (uniquement pour le scénario)
        // → Confirme à l'utilisateur ce qui va se passer et donne les conseils navigateur
        if(opts.script) {
            const _isChromiumBrowser = /Chrome|Chromium|Edg|OPR|Brave/.test(navigator.userAgent) && !/Firefox/.test(navigator.userAgent);
            const _footerDescription = _isChromiumBrowser
                ? `Footer : <strong>Date + numéro de page</strong> (ex : ${dateFr} — 3/33)`
                : `Footer : <strong>Date</strong> uniquement (Date + numérotation des pages n'est supportée que sur Chrome/Edge)`;
            
            const _confirmHtml = `
                <div id="print-confirm-modal" style="position:fixed; inset:0; background:rgba(0,0,0,0.6); z-index: var(--z-modal); display:flex; align-items:center; justify-content:center;">
                    <div style="background:var(--panel-bg, #fff); color:var(--text-main, #222); border-radius:12px; padding:30px; max-width:520px; width:90vw; box-shadow:0 10px 40px rgba(0,0,0,0.3); font-family:system-ui,-apple-system,sans-serif;">
                        <h2 style="margin:0 0 16px 0; font-size:1.3rem;">📄 Export PDF du scénario</h2>
                        <p style="margin:0 0 12px 0; line-height:1.5;">Une fenêtre d'impression va s'ouvrir. Pour un PDF propre style Final Draft :</p>
                        <ul style="margin:0 0 16px 0; padding-left:24px; line-height:1.7;">
                            <li><strong>Destination</strong> : « Enregistrer au format PDF »</li>
                            <li><strong>Décochez</strong> « En-têtes et pieds de page »</li>
                            <li><strong>Marges</strong> : « Par défaut » (le CSS gère la mise en page)</li>
                        </ul>
                        <div style="background:rgba(0,0,0,0.04); border-left:3px solid var(--primary, #2b6ef6); padding:10px 14px; margin:0 0 16px 0; font-size:0.9rem; border-radius:4px;">
                            ${_footerDescription}
                        </div>
                        <div style="display:flex; gap:10px; justify-content:flex-end;">
                            <button id="print-confirm-cancel" style="padding:10px 20px; background:transparent; color:var(--text-main, #222); border:1px solid var(--border, #ccc); border-radius:6px; cursor:pointer; font-weight:500;">Annuler</button>
                            <button id="print-confirm-ok" style="padding:10px 20px; background:var(--primary, #2b6ef6); color:#fff; border:none; border-radius:6px; cursor:pointer; font-weight:600;">Imprimer</button>
                        </div>
                    </div>
                </div>
            `;
            
            // Injecter et attendre la décision utilisateur
            const _wrapper = document.createElement('div');
            _wrapper.innerHTML = _confirmHtml;
            document.body.appendChild(_wrapper.firstElementChild);
            
            // Cleanup function pour rétablir l'UI si Annuler
            const _cleanupPrint = () => {
                const _modal = document.getElementById('print-confirm-modal');
                if(_modal) _modal.remove();
                document.body.classList.remove('print-script');
                document.querySelectorAll('.print-footer-overlay').forEach(el => el.remove());
                const _s1 = document.getElementById('dynamic-print-footer');
                if(_s1) _s1.remove();
                const _s2 = document.getElementById('dynamic-print-footer-overlay');
                if(_s2) _s2.remove();
                try { if(localStorage.getItem(CONFIG.themeKey) === 'dark') document.body.classList.add('dark-mode'); } catch(e) {}
            };
            
            return new Promise((resolve) => {
                document.getElementById('print-confirm-cancel').onclick = () => {
                    _cleanupPrint();
                    resolve();
                };
                document.getElementById('print-confirm-ok').onclick = () => {
                    document.getElementById('print-confirm-modal').remove();
                    // Continuer le flow normal : ajouter print-script et déclencher l'impression
                    document.body.classList.add('print-script');
                    const _origTitle = document.title;
                    document.title = `${state.data.title || 'Projet'} - Scénario - moteur.studio`;
                    setTimeout(() => {
                        window.print();
                        document.title = _origTitle;
                        try { if(localStorage.getItem(CONFIG.themeKey) === 'dark') document.body.classList.add('dark-mode'); } catch(e) {}
                        if(state.currentRole === 'viewer') document.body.classList.add('read-only');
                        document.body.className = document.body.className.replace(/print-\w+/g, "").trim();
                        document.querySelectorAll('.print-footer-overlay').forEach(el => el.remove());
                        resolve();
                    }, 100);
                };
            });
        }
        
        if(opts.synop) document.body.classList.add('print-synopsis'); 
        if(opts.board) { setTimeout(() => UI.printBoard(), 100); return; } 
        if(opts.script) document.body.classList.add('print-script'); 
        if(opts.chars) { setTimeout(() => UI.printChars(), 100); return; } 
        if(opts.actors) { setTimeout(() => UI.printActors(), 100); return; }
        if(opts.locs) { setTimeout(() => UI.printLocations(), 100); return; } 
        const _origTitle = document.title;
        if(opts.storyboard) { setTimeout(() => Storyboard.exportPDF(), 100); return; }
        if(opts.scriptreports) { setTimeout(() => ScriptReport.openPrintChooser(), 100); return; }
        if(opts.crew) document.body.classList.add('print-crew');
        if(opts.breakdown) document.body.classList.add('print-breakdown'); 
        if(opts.stats) { setTimeout(() => UI.printStats(), 100); return; }
        
        // [Phase C.2.5] Changer le titre HTML pour que le header navigateur soit propre
        // (au lieu de "Moteur - Logiciel d'écriture...")
        let sectionLabel = 'Scénario';
        if(opts.synop) sectionLabel = 'Synopsis';
        else if(opts.crew) sectionLabel = 'Équipe';
        else if(opts.breakdown) sectionLabel = 'Dépouillement';
        document.title = `${state.data.title || 'Projet'} - ${sectionLabel} - moteur.studio`;
        
        window.print(); 
        document.title = _origTitle;
        try { if(localStorage.getItem(CONFIG.themeKey) === 'dark') document.body.classList.add('dark-mode'); } catch(e) {} 
        if(state.currentRole === 'viewer') document.body.classList.add('read-only'); 
        document.body.className = document.body.className.replace(/print-\w+/g, "").trim();
    },
    
    // ========== [Phase Scénario jsPDF] EXPORT PDF SCÉNARIO STYLE FINAL DRAFT ==========
    // Police Courier Prime via CDN (320Ko, chargée 1× par session)
    // Spec : A4, marges 25mm haut/bas/droite, 35mm gauche, Courier 12pt, line-height 1.0
    // Format Final Draft : page de garde + scènes avec heading souligné, perso/dial/paren/trans
    
    _courierPrimeLoaded: false,
    _courierPrimeLoading: null,
    
    // Charge Courier Prime depuis CDN et l'enregistre dans une instance jsPDF
    // Retourne true si OK, false si échec → fallback sur Courier built-in
    loadCourierPrime: async (doc) => {
        // Si déjà chargée dans cette session, on enregistre juste dans le doc passé
        if(Exporter._courierPrimeFonts) {
            try {
                doc.addFileToVFS('CourierPrime-Regular.ttf', Exporter._courierPrimeFonts.regular);
                doc.addFont('CourierPrime-Regular.ttf', 'CourierPrime', 'normal');
                doc.addFileToVFS('CourierPrime-Bold.ttf', Exporter._courierPrimeFonts.bold);
                doc.addFont('CourierPrime-Bold.ttf', 'CourierPrime', 'bold');
                doc.addFileToVFS('CourierPrime-Italic.ttf', Exporter._courierPrimeFonts.italic);
                doc.addFont('CourierPrime-Italic.ttf', 'CourierPrime', 'italic');
                doc.addFileToVFS('CourierPrime-BoldItalic.ttf', Exporter._courierPrimeFonts.boldItalic);
                doc.addFont('CourierPrime-BoldItalic.ttf', 'CourierPrime', 'bolditalic');
                return true;
            } catch(e) {
                console.warn('[Scenario PDF] Échec injection police déjà téléchargée :', e);
                return false;
            }
        }
        
        // Si un chargement est déjà en cours, on l'attend
        if(Exporter._courierPrimeLoading) {
            try { await Exporter._courierPrimeLoading; return Exporter.loadCourierPrime(doc); }
            catch(e) { return false; }
        }
        
        // Premier chargement : on télécharge les 4 variantes en base64 via fetch
        const urls = {
            regular:    'https://cdn.jsdelivr.net/fontsource/fonts/courier-prime@latest/latin-400-normal.ttf',
            bold:       'https://cdn.jsdelivr.net/fontsource/fonts/courier-prime@latest/latin-700-normal.ttf',
            italic:     'https://cdn.jsdelivr.net/fontsource/fonts/courier-prime@latest/latin-400-italic.ttf',
            boldItalic: 'https://cdn.jsdelivr.net/fontsource/fonts/courier-prime@latest/latin-700-italic.ttf'
        };
        
        const ttfToBase64 = async (url) => {
            const res = await fetch(url);
            if(!res.ok) throw new Error('HTTP ' + res.status + ' on ' + url);
            const buf = await res.arrayBuffer();
            // ArrayBuffer → base64 (sans utiliser btoa avec chaîne longue qui plante en stack overflow)
            let binary = '';
            const bytes = new Uint8Array(buf);
            const chunk = 0x8000;
            for(let i = 0; i < bytes.length; i += chunk) {
                binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
            }
            return btoa(binary);
        };
        
        const downloadCourierPrime = async () => {
            const fonts = {};
            await Promise.all(Object.entries(urls).map(async ([variant, url]) => {
                fonts[variant] = await ttfToBase64(url);
            }));
            Exporter._courierPrimeFonts = fonts;
            Exporter._courierPrimeLoaded = true;
        };
        Exporter._courierPrimeLoading = downloadCourierPrime();
        
        try {
            await Exporter._courierPrimeLoading;
            return Exporter.loadCourierPrime(doc); // recurse pour injecter dans le doc
        } catch(e) {
            console.warn('[Scenario PDF] Échec téléchargement Courier Prime, fallback Courier built-in :', e);
            Exporter._courierPrimeLoading = null;
            return false;
        }
    },
    
    // Ouvre la modale de configuration du PDF scénario.
    // Pour les séries multi-épisodes : popup choix saisons d'abord.
    openScenarioPdfModal: () => {
        if(!state.data.scenes || state.data.scenes.length === 0) {
            Utils.toast('Aucune scène à exporter', 'warning');
            return;
        }
        const isSeries = state.currentProjectType === 'series';
        if(isSeries) {
            Exporter._openScenarioSeasonChooser();
        } else {
            Exporter._openScenarioOptionsModal(null);
        }
    },
    
    // Étape série : choix des saisons à inclure (modèle identique à openBoardPrintEpisodeChooser)
    _openScenarioSeasonChooser: () => {
        const seasons = (state.data.seasons || []).slice().sort((a,b) => (a.number||0) - (b.number||0));
        const episodes = state.data.episodes || [];
        if(seasons.length === 0) { Exporter._openScenarioOptionsModal(null); return; }
        const currentEp = episodes.find(e => e.id === state.currentEpisodeId);
        const currentSeasonId = currentEp ? currentEp.seasonId : null;
        const items = seasons.map(s => {
            const sNum = String(s.number).padStart(2, '0');
            const epCount = episodes.filter(e => e.seasonId === s.id).length;
            const checked = s.id === currentSeasonId ? 'checked' : '';
            const sTitle = s.title ? ' — ' + Utils.escape(s.title) : '';
            return `<tr style="cursor:pointer;" onclick="this.querySelector('input').click()"><td style="width:24px;padding:4px 8px;vertical-align:middle;"><input type="checkbox" class="scenseachk" value="${s.id}" ${checked} style="margin:0;cursor:pointer;" onclick="event.stopPropagation()"></td><td style="padding:4px 8px;font-size:0.88rem;line-height:1.3;vertical-align:middle;"><strong>Saison ${sNum}</strong>${sTitle} <span style="color:var(--text-sec);font-size:0.78rem;">(${epCount} ép.)</span></td></tr>`;
        }).join('');
        const overlay = document.createElement('div');
        overlay.className = 'confirm-modal-overlay';
        overlay.innerHTML = `<div class="confirm-modal-box" style="max-width:420px;padding:20px;">
            <div style="font-size:1.05rem;font-weight:bold;margin-bottom:12px;">📄 Scénario PDF — Choix des saisons</div>
            <div style="text-align:left;font-size:0.85rem;color:var(--text-sec);margin-bottom:8px;">Saisons à inclure :</div>
            <div style="max-height:200px;overflow-y:auto;border:1px solid var(--border);border-radius:6px;margin-bottom:10px;"><table style="width:100%;border-collapse:collapse;">${items}</table></div>
            <div style="display:flex;gap:6px;margin-bottom:14px;">
                <button type="button" id="scen-sea-all" style="flex:1;padding:5px;font-size:0.78rem;border:1px solid var(--border);background:var(--bg);border-radius:4px;cursor:pointer;">Tout cocher</button>
                <button type="button" id="scen-sea-none" style="flex:1;padding:5px;font-size:0.78rem;border:1px solid var(--border);background:var(--bg);border-radius:4px;cursor:pointer;">Tout décocher</button>
            </div>
            <div style="display:flex;gap:8px;justify-content:flex-end;">
                <button class="confirm-modal-btn cancel" id="scen-sea-cancel" style="margin:0;">Annuler</button>
                <button class="confirm-modal-btn confirm" id="scen-sea-ok" style="margin:0;">Suivant →</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);
        overlay.querySelector('#scen-sea-all').onclick = () => overlay.querySelectorAll('.scenseachk').forEach(cb => cb.checked = true);
        overlay.querySelector('#scen-sea-none').onclick = () => overlay.querySelectorAll('.scenseachk').forEach(cb => cb.checked = false);
        overlay.querySelector('#scen-sea-cancel').onclick = () => overlay.remove();
        overlay.onclick = (e) => { if(e.target === overlay) overlay.remove(); };
        overlay.querySelector('#scen-sea-ok').onclick = () => {
            const seasonIds = Array.from(overlay.querySelectorAll('.scenseachk:checked')).map(cb => cb.value);
            if(seasonIds.length === 0) { Utils.toast('Aucune saison sélectionnée', 'warning'); return; }
            const epIds = episodes.filter(e => seasonIds.includes(e.seasonId)).map(e => e.id);
            overlay.remove();
            setTimeout(() => Exporter._openScenarioOptionsModal(epIds), 100);
        };
    },
    
    // Étape commune : options de mise en forme (numérotation scènes, etc.)
    _openScenarioOptionsModal: (episodeIds) => {
        const meta = state.data.scriptMeta || {};
        const overlay = document.createElement('div');
        overlay.className = 'confirm-modal-overlay';
        // Style "toggle bouton bleu en surbrillance" — réutilise .fmt-btn / .fmt-btn.active de la barre scénario
        // Chaque option a son propre <button class="fmt-btn"> avec data-active="0|1" qu'on toggle au clic
        overlay.innerHTML = `<div class="confirm-modal-box" style="max-width:520px;padding:20px;">
            <div style="font-size:1.05rem;font-weight:bold;margin-bottom:14px;">📄 Scénario PDF — Options</div>
            <div style="display:flex;flex-direction:column;gap:8px;text-align:left;margin-bottom:14px;">
                <button type="button" class="fmt-btn active" id="scen-opt-cover" data-active="1" style="padding:10px 14px;font-size:0.85rem;text-align:left;">📋 Inclure la page de titre</button>
                <button type="button" class="fmt-btn" id="scen-opt-numbers" data-active="0" style="padding:10px 14px;font-size:0.85rem;text-align:left;">🔢 Numéroter les scènes (#1, #2…) — style production</button>
                <button type="button" class="fmt-btn" id="scen-opt-notes" data-active="0" style="padding:10px 14px;font-size:0.85rem;text-align:left;">📝 Inclure les notes de production (sc-note)</button>
            </div>
            <div style="text-align:left;font-size:0.78rem;color:var(--text-sec);margin-bottom:14px;font-style:italic;">
                💡 Police Courier Prime téléchargée au 1ᵉʳ usage (~320 Ko, mis en cache ensuite)
            </div>
            <div style="display:flex;gap:8px;justify-content:space-between;align-items:center;">
                <button type="button" class="confirm-modal-btn" id="scen-opt-share" style="margin:0;">🔗 Partager le scénario</button>
                <div style="display:flex;gap:8px;">
                    <button class="confirm-modal-btn cancel" id="scen-opt-cancel" style="margin:0;">Annuler</button>
                    <button class="confirm-modal-btn confirm" id="scen-opt-ok" style="margin:0;">📄 Générer le PDF</button>
                </div>
            </div>
        </div>`;
        document.body.appendChild(overlay);
        
        // Toggle des options : clic sur un .fmt-btn bascule sa classe .active et son data-active
        ['scen-opt-cover', 'scen-opt-numbers', 'scen-opt-notes'].forEach(id => {
            overlay.querySelector('#' + id).onclick = (e) => {
                const btn = e.currentTarget;
                const isActive = btn.classList.toggle('active');
                btn.dataset.active = isActive ? '1' : '0';
            };
        });
        
        overlay.querySelector('#scen-opt-cancel').onclick = () => overlay.remove();
        overlay.onclick = (e) => { if(e.target === overlay) overlay.remove(); };
        const _shareBtn = overlay.querySelector('#scen-opt-share');
        if(_shareBtn) _shareBtn.onclick = () => { overlay.remove(); setTimeout(() => ScriptShare.openShareModal('scenario', episodeIds), 100); };
        overlay.querySelector('#scen-opt-ok').onclick = async () => {
            const sceneNumbers = overlay.querySelector('#scen-opt-numbers').dataset.active === '1';
            const includeCover = overlay.querySelector('#scen-opt-cover').dataset.active === '1';
            const includeNotes = overlay.querySelector('#scen-opt-notes').dataset.active === '1';
            overlay.remove();
            await Exporter.scenarioToPDF({ sceneNumbers, includeCover, includeNotes, episodeIds });
        };
    },
    
    // === GÉNÉRATION JSPDF DU SCÉNARIO ===
    // opts = { returnBlob, sceneNumbers, includeCover, includeNotes, episodeIds }
    scenarioToPDF: async (opts = {}) => {
        await LazyLib.load('pdfexport'); const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.getWidth();   // 210 mm
        const pageHeight = doc.internal.pageSize.getHeight(); // 297 mm
        
        // Marges Final Draft : 25mm haut/droite/bas, 35mm gauche (reliure)
        const marginLeft = 35;
        const marginRight = 25;
        const marginTop = 25;
        const marginBottom = 25;
        const usableWidth = pageWidth - marginLeft - marginRight; // 150 mm
        
        // Toast pendant le téléchargement de la police
        let toast = null;
        if(!Exporter._courierPrimeLoaded && !opts.returnBlob) {
            toast = Utils.toast('Téléchargement de la police Courier Prime…', 'info');
        }
        
        // Charger Courier Prime (ou fallback Courier built-in)
        const usingPrime = await Exporter.loadCourierPrime(doc);
        const FONT = usingPrime ? 'CourierPrime' : 'courier';
        
        // Métriques Final Draft : Courier 12pt → 10 char/inch → 2.54mm par char
        // 60 caractères de largeur action = 152mm → tient dans 150mm utile (avec petite tolérance)
        const fontSize = 12;
        const lineHeight = 5.0; // mm — équivaut à line-height 1.0 en 12pt
        doc.setFontSize(fontSize);
        doc.setFont(FONT, 'normal');
        
        // ===== HELPERS =====
        let y = marginTop;
        let pageNum = 0; // sera incrémenté à chaque addPage
        const projectTitle = state.data.title || 'Projet sans titre';
        // Lecture des métadonnées du film : priorité à titlePage (onglet "Titre"),
        // fallback sur scriptMeta. Mapping : tp.coauthor → meta.coAuthor, tp.date → meta.draftDate
        const _sm = state.data.scriptMeta || {};
        const _tp = state.data.titlePage || {};
        const meta = {
            author:    _tp.author    || _sm.author    || '',
            coAuthor:  _tp.coauthor  || _sm.coAuthor  || '',
            contact:   _tp.contact   || _sm.contact   || '',
            draft:     _tp.draft     || _sm.draft     || '',
            draftDate: _tp.date      || _sm.draftDate || '',
            source:    _tp.source    || _sm.source    || '',
            copyright: _tp.copyright || _sm.copyright || '',
            notes:     _tp.notes     || _sm.notes     || ''
        };
        
        // Ajoute un saut de page et inscrit le numéro en bas à droite
        // (skipFirstPage : la page de garde n'a pas de numéro)
        const newPage = (firstPage = false) => {
            if(!firstPage) doc.addPage();
            pageNum++;
            y = marginTop;
        };
        
        // Footer "Date — N/Total" en bas à droite (style production)
        // Pas de footer sur la page de garde (Final Draft)
        const drawPageNumbers = () => {
            // Délègue au footer unifié PdfTheme pour cohérence avec les autres exports
            if(typeof PdfTheme !== 'undefined' && PdfTheme.applyFooters) {
                PdfTheme.applyFooters(doc, { 
                    skipFirstPage: opts.includeCover !== false,
                    forDossier: !!opts.returnBlob
                });
                return;
            }
            // Fallback si PdfTheme indisponible
            const totalPages = doc.internal.getNumberOfPages();
            for(let i = 1; i <= totalPages; i++) {
                if(opts.includeCover !== false && i === 1) continue;
                doc.setPage(i);
                doc.setFont(FONT, 'normal');
                doc.setFontSize(9);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_MUTED);
                doc.text(`${i} / ${totalPages}`, pageWidth / 2, pageHeight - 6, { align: 'center' });
            }
        };
        
        // Assure qu'on a la place pour `linesNeeded` lignes ; sinon nouvelle page
        const ensureSpace = (linesNeeded) => {
            const required = linesNeeded * lineHeight;
            if(y + required > pageHeight - marginBottom) {
                newPage();
                return true;
            }
            return false;
        };
        
        // Écrit un bloc texte multilignes à une indentation donnée, avec wrapping
        // indentMm : décalage horizontal en mm depuis marginLeft
        // widthMm : largeur de wrap en mm
        // align : 'left' | 'right' | 'center'
        // style : 'normal' | 'bold' | 'italic' | 'bolditalic'
        // returns true si le bloc a été coupé en deux pages (utile pour widows/orphans)
        const writeBlock = (text, opts2 = {}) => {
            const indent = opts2.indent || 0;
            const width = opts2.width || (usableWidth - indent);
            const align = opts2.align || 'left';
            const style = opts2.style || 'normal';
            const upper = opts2.upper || false;
            const underline = opts2.underline || false;
            const spaceBefore = opts2.spaceBefore || 0;
            const spaceAfter = opts2.spaceAfter || 0;
            const avoidBreakBefore = opts2.avoidBreakBefore || false; // ne pas casser AVANT la 1ère ligne
            
            let txt = String(text || '');
            if(upper) txt = txt.toUpperCase();
            
            doc.setFont(FONT, style);
            doc.setFontSize(fontSize);
            doc.setTextColor(...PdfTheme.COLORS.BLACK);
            
            // Espace avant (sauf en début de page)
            if(spaceBefore > 0 && y > marginTop) y += spaceBefore;
            
            // Wrapping
            const lines = doc.splitTextToSize(txt, width);
            if(lines.length === 0) return;
            
            // Vérifie le saut de page anticipé (pour heading/perso : on ne veut pas qu'ils soient isolés en bas)
            if(avoidBreakBefore) {
                // S'il ne reste pas la place pour cette ligne + au moins 1 ligne suivante
                if(y + (Math.max(2, lines.length + 1)) * lineHeight > pageHeight - marginBottom) {
                    newPage();
                }
            }
            
            const x = marginLeft + indent;
            lines.forEach((line, idx) => {
                // Si on déborde, saut de page
                if(y + lineHeight > pageHeight - marginBottom) {
                    newPage();
                }
                
                let drawX = x;
                if(align === 'right') drawX = marginLeft + indent + width;
                else if(align === 'center') drawX = marginLeft + indent + (width / 2);
                
                doc.text(line, drawX, y, { align });
                
                if(underline) {
                    const txtWidth = doc.getTextWidth(line);
                    let underlineX = drawX;
                    if(align === 'right') underlineX = drawX - txtWidth;
                    else if(align === 'center') underlineX = drawX - (txtWidth / 2);
                    doc.setLineWidth(0.2);
                    doc.line(underlineX, y + 0.8, underlineX + txtWidth, y + 0.8);
                }
                
                y += lineHeight;
            });
            
            if(spaceAfter > 0) y += spaceAfter;
        };
        
        // ===== PAGE DE GARDE FINAL DRAFT (optionnelle) =====
        if(opts.includeCover !== false) {
            newPage(true); // 1ère page sans addPage
            
            // Titre centré au tiers supérieur, gras MAJUSCULES souligné
            const titleY = pageHeight * 0.35;
            doc.setFont(FONT, 'bold');
            doc.setFontSize(28);
            doc.setTextColor(...PdfTheme.COLORS.BLACK);
            const titleUpper = projectTitle.toUpperCase();
            doc.text(titleUpper, pageWidth / 2, titleY, { align: 'center' });
            // Souligné sous le titre
            const titleWidth = doc.getTextWidth(titleUpper);
            doc.setLineWidth(0.5);
            doc.line(pageWidth/2 - titleWidth/2, titleY + 2, pageWidth/2 + titleWidth/2, titleY + 2);
            
            // Sous-titre "Un scénario de" + auteur
            doc.setFont(FONT, 'normal');
            doc.setFontSize(14);
            doc.text('Un scénario de', pageWidth / 2, titleY + 18, { align: 'center' });
            if(meta.author) {
                doc.text(PdfTheme.cleanText(meta.author), pageWidth / 2, titleY + 28, { align: 'center' });
                if(meta.coAuthor) {
                    doc.text(PdfTheme.cleanText('& ' + meta.coAuthor), pageWidth / 2, titleY + 38, { align: 'center' });
                }
            }
            
            // Source / Basé sur (si présent)
            if(meta.source) {
                doc.setFontSize(12);
                doc.text(PdfTheme.cleanText('Basé sur ' + meta.source), pageWidth / 2, titleY + 55, { align: 'center' });
            }
            
            // Brouillon / Date (centré bas)
            doc.setFontSize(11);
            const draftY = pageHeight - 50;
            if(meta.draft) doc.text(PdfTheme.cleanText(meta.draft), pageWidth / 2, draftY, { align: 'center' });
            if(meta.draftDate) doc.text(PdfTheme.cleanText(meta.draftDate), pageWidth / 2, draftY + 6, { align: 'center' });
            
            // Contact bas-gauche
            doc.setFontSize(10);
            const contactY = pageHeight - 35;
            let contactLine = 0;
            const writeContact = (txt) => { if(txt) { doc.text(txt, marginLeft, contactY + (contactLine++ * 5)); } };
            writeContact(meta.contact || '');
            writeContact(meta.copyright || '');
            writeContact(meta.notes || '');
        }
        
        // ===== SCÈNES =====
        // Filtrer par épisodes si demandé (séries)
        let scenes = state.data.scenes || [];
        if(opts.episodeIds && Array.isArray(opts.episodeIds) && opts.episodeIds.length > 0) {
            scenes = scenes.filter(s => opts.episodeIds.includes(s.episodeId));
        }
        
        if(scenes.length === 0) {
            if(toast && toast.remove) toast.remove();
            Utils.toast('Aucune scène à exporter dans la sélection', 'warning');
            return;
        }
        
        // 1ère page de contenu
        if(opts.includeCover === false) {
            newPage(true);
        } else {
            newPage();
        }
        
        scenes.forEach((scene, sceneIdx) => {
            const sceneNum = sceneIdx + 1;
            
            // Heading de scène : INT./EXT. ... — JOUR/NUIT
            // Format Final Draft : gras MAJUSCULES souligné, espace 24pt avant, 12pt après, page-break-after avoid
            const headingText = scene.title || `SCÈNE ${sceneNum}`;
            
            // Numérotation optionnelle en marge (à gauche et à droite)
            if(opts.sceneNumbers && y > marginTop) {
                // ensureSpace pour la ligne suivante avant d'inscrire les marqueurs
                if(y + lineHeight * 3 > pageHeight - marginBottom) {
                    newPage();
                }
            }
            
            // Avoid break before heading + au moins 2 lignes après
            writeBlock(headingText, {
                style: 'bold',
                upper: true,
                underline: true,
                spaceBefore: sceneIdx === 0 ? 0 : 10, // 10mm ≈ 24pt
                spaceAfter: 5,                         // 5mm ≈ 12pt
                avoidBreakBefore: true
            });
            
            // Numéros de scène inscrits en marge SI option activée
            if(opts.sceneNumbers) {
                // Position de la 1ère ligne du heading qu'on vient d'écrire
                const headingY = y - 5 - lineHeight; // remonter pour pointer la ligne du heading
                doc.setFont(FONT, 'normal');
                doc.setFontSize(10);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_MUTED);
                const numLabel = '#' + sceneNum;
                // Marge gauche (sur la marge de reliure)
                doc.text(numLabel, marginLeft - 8, headingY, { align: 'right' });
                // Marge droite
                doc.text(numLabel, pageWidth - marginRight + 2, headingY, { align: 'left' });
                doc.setTextColor(...PdfTheme.COLORS.BLACK);
            }
            
            // Parse le scriptContent pour obtenir les blocs typés
            const blocks = ScriptExport.parseScriptContent(scene.scriptContent || '');
            
            blocks.forEach((blk, blkIdx) => {
                const txt = blk.text;
                if(!txt) return;
                
                switch(blk.type) {
                    case 'action':
                        // Indent 0, largeur pleine, espace 12pt avant/après
                        writeBlock(txt, {
                            indent: 0,
                            width: usableWidth,
                            spaceBefore: 5,
                            spaceAfter: 0
                        });
                        break;
                    
                    case 'character':
                        // Indent 40% de la largeur utile, MAJUSCULES, espace 12pt avant, avoid break (perso ne doit pas être isolé)
                        writeBlock(txt, {
                            indent: usableWidth * 0.40,
                            width: usableWidth * 0.50,
                            upper: true,
                            spaceBefore: 5,
                            spaceAfter: 0,
                            avoidBreakBefore: true
                        });
                        break;
                    
                    case 'dialogue':
                        // Indent 20%, largeur 60%
                        writeBlock(txt, {
                            indent: usableWidth * 0.20,
                            width: usableWidth * 0.60,
                            spaceBefore: 0,
                            spaceAfter: 0
                        });
                        break;
                    
                    case 'parenthetical':
                        // Indent 30%, largeur 40%, italique, avoid break
                        // Wrapper avec ( ) si pas déjà présent
                        const parenTxt = txt.replace(/^\(\s*/, '').replace(/\s*\)$/, '');
                        writeBlock('(' + parenTxt + ')', {
                            indent: usableWidth * 0.30,
                            width: usableWidth * 0.40,
                            style: 'italic',
                            spaceBefore: 0,
                            spaceAfter: 0,
                            avoidBreakBefore: true
                        });
                        break;
                    
                    case 'transition':
                        // Aligné à droite, MAJUSCULES, espace 12pt avant et après
                        writeBlock(txt, {
                            indent: 0,
                            width: usableWidth,
                            align: 'right',
                            upper: true,
                            spaceBefore: 5,
                            spaceAfter: 5
                        });
                        break;
                    
                    case 'centered':
                        // Centré, MAJUSCULES, espace 24pt
                        writeBlock(txt, {
                            indent: 0,
                            width: usableWidth,
                            align: 'center',
                            upper: true,
                            spaceBefore: 10,
                            spaceAfter: 10
                        });
                        break;
                    
                    case 'general':
                        // Italique gris, espace 12pt
                        doc.setTextColor(...PdfTheme.COLORS.TEXT_MUTED);
                        writeBlock(txt, {
                            indent: 0,
                            width: usableWidth,
                            style: 'italic',
                            spaceBefore: 5,
                            spaceAfter: 0
                        });
                        doc.setTextColor(...PdfTheme.COLORS.BLACK);
                        break;
                    
                    case 'note':
                        // Optionnel : si opts.includeNotes, on imprime en gris encadré ; sinon on saute
                        if(!opts.includeNotes) break;
                        const noteTxt = txt.replace(/^\{\s*/, '').replace(/\s*\}$/, '');
                        doc.setTextColor(...PdfTheme.COLORS.WARNING);
                        writeBlock('[NOTE] ' + noteTxt, {
                            indent: 0,
                            width: usableWidth,
                            style: 'italic',
                            spaceBefore: 3,
                            spaceAfter: 3
                        });
                        doc.setTextColor(...PdfTheme.COLORS.BLACK);
                        break;
                    
                    default:
                        // Fallback action
                        writeBlock(txt, {
                            indent: 0,
                            width: usableWidth,
                            spaceBefore: 5,
                            spaceAfter: 0
                        });
                }
            });
        });
        
        // ===== FOOTERS / NUMÉROS DE PAGE =====
        drawPageNumbers();
        
        // Toast d'achèvement
        if(toast && toast.remove) toast.remove();
        
        // ===== SORTIE =====
        if(opts.returnBlob) return doc.output('blob');
        
        // Nom de fichier : utiliser PdfTheme si dispo, sinon fallback.
        // Si un filtre saison(s) est actif (série), le nom le reflète — sinon
        // deux exports de saisons différentes portaient le même nom.
        let scenarioSection = 'Scénario';
        if(opts.episodeIds && Array.isArray(opts.episodeIds) && opts.episodeIds.length > 0) {
            const epIdSet = new Set(opts.episodeIds);
            const seasonIdSet = new Set((state.data.episodes || []).filter(e => epIdSet.has(e.id)).map(e => e.seasonId));
            const seasonLabels = (state.data.seasons || [])
                .filter(s => seasonIdSet.has(s.id))
                .sort((a, b) => (a.number || 0) - (b.number || 0))
                .map(s => 'S' + String(s.number || 0).padStart(2, '0'));
            if(seasonLabels.length > 0) scenarioSection = 'Scénario - ' + seasonLabels.join('+');
        }
        const filename = (typeof PdfTheme !== 'undefined' && PdfTheme.filename)
            ? PdfTheme.filename(scenarioSection)
            : `${projectTitle} - ${scenarioSection} - moteur.studio.pdf`;
        doc.save(filename);
        Utils.toast('Scénario PDF exporté !', 'success');
        if(typeof History !== 'undefined' && History.log) History.log('EXPORT', 'Scénario PDF (Final Draft) généré');
    },
    
    // ========== RAPPORT DE PRODUCTION PDF ==========
    productionReport: async (opts = {}) => {
        await LazyLib.load('pdfexport'); const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 15;
        let y = margin;
        
        const projectTitle = state.data.title || 'Projet sans titre';
        
        // Helper formatage : évite les espaces insécables qui s'affichent en "/"
        const fmt = (n) => {
            const num = parseFloat(n) || 0;
            return num.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
        };
        
        // ===== PAGE DE GARDE (Phase C.1) — optionnelle =====
        if(opts.includeCover !== false) {
            PdfTheme.coverPage(doc, { sectionName: 'Production' });
        }
        
        // ===== FONCTION UTILITAIRES =====
        const addSection = (title, yPos) => {
            if(yPos > pageHeight - 40) {
                doc.addPage();
                yPos = margin;
            }
            const yApres = PdfTheme.sectionBand(doc, { x: margin, y: yPos, width: pageWidth - margin * 2,
                                                      title, size: 12,
                                                      accent: PdfTheme.accentFor('Rapport de production') });
            doc.setTextColor(...PdfTheme.COLORS.TEXT_PRIMARY);
            return yApres + 1.5;
        };
        
        const addKeyValue = (key, value, yPos) => {
            if(yPos > pageHeight - 20) {
                doc.addPage();
                yPos = margin;
            }
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            const keyText = key + ' :';
            doc.text(keyText, margin, yPos);
            // Largeur réelle du texte clé pour éviter le chevauchement de la valeur
            const keyW = doc.getTextWidth(keyText);
            const valueX = margin + Math.max(45, keyW + 3);
            doc.setFont('helvetica', 'normal');
            doc.text(String(value || '-'), valueX, yPos);
            return yPos + 6;
        };
        
        const addTable = (headers, rows, yPos, colWidths) => {
            const totalWidth = pageWidth - margin * 2;
            const rowHeight = 7;
            
            if(yPos > pageHeight - 40) {
                doc.addPage();
                yPos = margin;
            }
            
            // Header
            doc.setFillColor(...PdfTheme.COLORS.BG_LIGHT);
            doc.rect(margin, yPos, totalWidth, rowHeight, 'F');
            doc.setFontSize(8);
            doc.setFont('helvetica', 'bold');
            let xPos = margin + 2;
            headers.forEach((h, i) => {
                doc.text(h, xPos, yPos + 5);
                xPos += colWidths[i];
            });
            yPos += rowHeight;
            
            // Rows
            doc.setFont('helvetica', 'normal');
            rows.forEach((row, idx) => {
                if(yPos > pageHeight - 20) {
                    doc.addPage();
                    yPos = margin;
                }
                if(idx % 2 === 1) {
                    doc.setFillColor(...PdfTheme.COLORS.BG_LIGHTER);
                    doc.rect(margin, yPos, totalWidth, rowHeight, 'F');
                }
                xPos = margin + 2;
                row.forEach((cell, i) => {
                    const text = String(cell || '-').substring(0, 40);
                    doc.text(text, xPos, yPos + 5);
                    xPos += colWidths[i];
                });
                yPos += rowHeight;
            });
            
            return yPos + 5;
        };
        
        // ===== PAGE 2 : RÉSUMÉ GÉNÉRAL =====
        if(opts.includeCover !== false) doc.addPage();
        y = margin;
        
        y = addSection('RÉSUMÉ GÉNÉRAL', y);
        
        const scenes = state.data.scenes || [];
        const characters = state.data.characters || [];
        const actors = state.data.actors || [];
        const locations = state.data.locations || [];
        const crew = state.data.crew || [];
        const shots = state.data.shots || [];
        const expenses = state.data.expenses || [];
        const shootingDays = state.data.shootingDays || [];
        
        y = addKeyValue('Titre du projet', PdfTheme.cleanText(projectTitle), y);
        y = addKeyValue('Nombre de scènes', scenes.length, y);
        y = addKeyValue('Nombre de plans (storyboard)', shots.length, y);
        y = addKeyValue('Personnages', characters.length, y);
        y = addKeyValue('Comédiens', actors.length, y);
        y = addKeyValue('Décors', locations.length, y);
        y = addKeyValue('Techniciens', crew.length, y);
        y = addKeyValue('Jours de tournage prévus', shootingDays.length, y);
        
        // Durée estimée
        const totalMinutes = scenes.reduce((sum, s) => sum + (parseFloat(s.time) || 0), 0);
        y = addKeyValue('Durée estimée', `${Math.floor(totalMinutes)} min`, y);
        
        // Budget (Phase C.2.4 : fix [object Object] — budget est un objet, pas un nombre)
        const budgetObj = state.data.budget || {};
        const budgetTotal = parseFloat(budgetObj.total) || 0;
        const currency = budgetObj.currency || '€';
        const totalExpenses = expenses.reduce((sum, e) => sum + (parseFloat(e.amountTTC) || parseFloat(e.amount) || 0), 0);
        y = addKeyValue('Budget prévu', `${fmt(budgetTotal)} ${currency}`, y);
        y = addKeyValue('Dépenses engagées', `${fmt(totalExpenses)} ${currency}`, y);
        y = addKeyValue('Reste disponible', `${fmt(budgetTotal - totalExpenses)} ${currency}`, y);
        
        // Statistiques scènes
        y += 5;
        y = addSection('STATISTIQUES SCÈNES', y);
        
        const intScenes = scenes.filter(s => s.title && s.title.toUpperCase().startsWith('INT')).length;
        const extScenes = scenes.filter(s => s.title && s.title.toUpperCase().startsWith('EXT')).length;
        const dayScenes = scenes.filter(s => s.title && s.title.toUpperCase().includes('JOUR')).length;
        const nightScenes = scenes.filter(s => s.title && s.title.toUpperCase().includes('NUIT')).length;
        const finalizedScenes = scenes.filter(s => s.isFinal).length;
        
        y = addKeyValue('Intérieur / Extérieur', `${intScenes} INT / ${extScenes} EXT`, y);
        y = addKeyValue('Jour / Nuit', `${dayScenes} JOUR / ${nightScenes} NUIT`, y);
        y = addKeyValue('Scènes finalisées', `${finalizedScenes} / ${scenes.length}`, y);
        
        // ===== PERSONNAGES =====
        // Phase C.2.4 : fix doublon "Nora" — utiliser characterId proprement
        if(characters.length > 0) {
            y += 5;
            y = addSection('PERSONNAGES', y);
            const charRows = characters.map(c => {
                // Chercher le comédien qui joue ce personnage (peut être plusieurs : prendre le premier)
                const actorPlaying = actors.find(a => a.characterId === c.id);
                return [
                    PdfTheme.cleanText(c.name || '-'),
                    c.age || '-',
                    c.gender || '-',
                    actorPlaying ? PdfTheme.cleanText(actorPlaying.name) : '(non casté)'
                ];
            });
            y = addTable(['Personnage', 'Âge', 'Genre', 'Comédien'], charRows, y, [50, 25, 25, 60]);
        }
        
        // ===== COMÉDIENS =====
        // Phase C.2.4 : utilise le bon champ "role" du comédien (pas le perso lié)
        if(actors.length > 0) {
            y += 5;
            y = addSection('COMÉDIENS', y);
            const actorRows = actors.map(a => {
                // Le rôle peut être : (1) un personnage lié via characterId, (2) un texte libre dans a.role
                const char = characters.find(c => c.id === a.characterId);
                const roleLabel = char ? char.name : (a.role || '-');
                return [
                    PdfTheme.cleanText(a.name || '-'),
                    PdfTheme.cleanText(roleLabel),
                    a.phone || '-',
                    a.email || '-'
                ];
            });
            y = addTable(['Nom', 'Rôle', 'Téléphone', 'Email'], actorRows, y, [45, 40, 40, 55]);
        }
        
        // ===== ÉQUIPE TECHNIQUE =====
        // Phase C.2.4 : fix département (group_id au lieu de department inexistant)
        if(crew.length > 0) {
            y += 5;
            y = addSection('ÉQUIPE TECHNIQUE', y);
            const crewRows = crew.map(c => [
                PdfTheme.cleanText(c.name || '-'),
                PdfTheme.cleanText(c.role || '-'),
                PdfTheme.getGroupLabel(c.group_id, true) || '-',
                c.phone || '-'
            ]);
            y = addTable(['Nom', 'Poste', 'Département', 'Téléphone'], crewRows, y, [45, 45, 40, 50]);
        }
        
        // ===== DÉCORS =====
        if(locations.length > 0) {
            y += 5;
            y = addSection('DÉCORS', y);
            const locRows = locations.map(l => {
                const sceneCount = scenes.filter(s => s.locationId === l.id).length;
                return [
                    PdfTheme.cleanText(l.name || '-'),
                    PdfTheme.cleanText(l.realLocation || '-'),
                    PdfTheme.cleanText(l.address || '-'),
                    sceneCount + ' scène(s)'
                ];
            });
            y = addTable(['Décor', 'Lieu réel', 'Adresse', 'Scènes'], locRows, y, [40, 45, 55, 30]);
        }
        
        // ===== PLANNING =====
        if(shootingDays.length > 0) {
            y += 5;
            y = addSection('PLANNING DE TOURNAGE', y);
            const planRows = shootingDays.map(d => {
                const date = d.startDate ? new Date(d.startDate).toLocaleDateString('fr-FR') : '-';
                const scenesList = (d.scenes || []).map(ref => {
                    // Phase C.2.4 : ref est { sceneId, ... } pas un id direct
                    const sId = typeof ref === 'string' ? ref : ref.sceneId;
                    const scene = scenes.find(s => s.id === sId);
                    return scene ? `#${scenes.indexOf(scene) + 1}` : '';
                }).filter(Boolean).join(', ');
                return [
                    PdfTheme.cleanText(d.name || 'Jour'),
                    date,
                    PdfTheme.cleanText(d.location || '-'),
                    scenesList || '-'
                ];
            });
            y = addTable(['Nom', 'Date', 'Lieu', 'Scènes'], planRows, y, [40, 30, 50, 50]);
        }
        
        // ===== BUDGET DÉTAILLÉ =====
        // Phase C.2.4 : fix "61 /150" (espace insécable) avec fmt()
        if(expenses.length > 0) {
            y += 5;
            y = addSection('BUDGET & DÉPENSES', y);
            
            // Par catégorie
            const byCategory = {};
            expenses.forEach(e => {
                const cat = e.category || 'Autre';
                if(!byCategory[cat]) byCategory[cat] = 0;
                byCategory[cat] += parseFloat(e.amountTTC) || parseFloat(e.amount) || 0;
            });
            
            const budgetRows = Object.entries(byCategory).map(([cat, amount]) => [
                PdfTheme.cleanText(cat),
                `${fmt(amount)} ${currency}`
            ]);
            budgetRows.push(['TOTAL', `${fmt(totalExpenses)} ${currency}`]);
            y = addTable(['Catégorie', 'Montant'], budgetRows, y, [100, 70]);
        }
        
        // ===== FOOTERS UNIFIÉS (Phase C.1) =====
        PdfTheme.applyFooters(doc, { forDossier: !!opts.returnBlob });
        
        // ===== TÉLÉCHARGEMENT (nom unifié) =====
        if(opts.returnBlob) return doc.output('blob');
        doc.save(PdfTheme.filename('Rapport de production'));
        
        Utils.toast('Rapport de production exporté !', 'success');
        History.log('EXPORT', 'Rapport de production PDF généré');
    },
    
    // ========== [Phase D Dossier Prod] Fusion PDF avec page de garde + sommaire ==========
    // sections = [{ label: 'Synopsis', blob: Blob }, ...]  (ordre = ordre de fusion)
    // Génère un PDF unique :
    //   1. Cover "DOSSIER DE PRODUCTION" (1 page)
    //   2. Sommaire avec n° de pages (1+ pages)
    //   3. Pages fusionnées de chaque section
    buildDossierProd: async (sections) => {
        if(!window.PDFLib) {
            Utils.toast('Erreur : pdf-lib non chargée', 'error');
            return;
        }
        if(!sections || sections.length === 0) {
            Utils.toast('Aucun PDF à fusionner', 'warning');
            return;
        }
        
        const { PDFDocument, StandardFonts, rgb, PDFName, PDFArray, PDFDict, degrees } = window.PDFLib;
        
        // Filtrer les sections sans blob (erreurs lors de la génération individuelle)
        const validSections = sections.filter(s => s.blob);
        if(validSections.length === 0) {
            Utils.toast('Aucun PDF valide à fusionner', 'error');
            return;
        }
        
        // ===== 1. Charger tous les PDFs et noter le nombre de pages de chacun =====
        const loadedSections = [];
        for(const s of validSections) {
            try {
                const arrayBuffer = await s.blob.arrayBuffer();
                const srcDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
                loadedSections.push({ label: s.label, srcDoc, pageCount: srcDoc.getPageCount() });
            } catch(e) {
                console.error(`[Dossier Prod] Échec chargement ${s.label} :`, e);
            }
        }
        if(loadedSections.length === 0) {
            Utils.toast('Échec du chargement des PDFs', 'error');
            return;
        }
        
        // ===== 2. Calculer le nombre de pages du sommaire =====
        // Approximation : ~25 sections par page de sommaire. Pour < 25 on prévoit 1 page,
        // sinon ceil(count/25). En pratique 1 page suffit largement.
        const summaryPageCount = Math.max(1, Math.ceil(loadedSections.length / 25));
        const coverPageCount = 1;
        const prefixPages = coverPageCount + summaryPageCount;
        
        // ===== 3. Calculer les n° de pages de chaque section =====
        let currentPage = prefixPages + 1; // la 1ère section commence après cover + sommaire
        const toc = loadedSections.map(s => {
            const entry = { label: s.label, startPage: currentPage };
            currentPage += s.pageCount;
            return entry;
        });
        
        // ===== 4. Créer le PDF maître =====
        const masterDoc = await PDFDocument.create();
        const fontHelv = await masterDoc.embedFont(StandardFonts.Helvetica);
        const fontHelvBold = await masterDoc.embedFont(StandardFonts.HelveticaBold);
        const fontHelvOblique = await masterDoc.embedFont(StandardFonts.HelveticaOblique);
        
        const A4_W = 595.28; // points = 210mm
        const A4_H = 841.89; // points = 297mm
        
        // ===== 5. PAGE DE GARDE "DOSSIER DE PRODUCTION" =====
        const projectTitle = state.data.title || 'Projet sans titre';
        const tp = state.data.titlePage || {};
        const authorCombined = [tp.author, tp.coauthor].filter(Boolean).join(' & ');
        const cleanStr = (s) => (typeof PdfTheme !== 'undefined' && PdfTheme.cleanText) ? PdfTheme.cleanText(s || '') : (s || '');
        
        const cover = masterDoc.addPage([A4_W, A4_H]);
        
        // Bande de couleur en haut
        cover.drawRectangle({ x: 0, y: A4_H - 12, width: A4_W, height: 12, color: rgb(43/255, 110/255, 246/255) });
        
        // Mention "DOSSIER DE PRODUCTION"
        const tagline = 'DOSSIER DE PRODUCTION';
        const taglineW = fontHelvBold.widthOfTextAtSize(tagline, 18);
        cover.drawText(tagline, { x: (A4_W - taglineW) / 2, y: A4_H * 0.66, size: 18, font: fontHelvBold, color: rgb(0.2, 0.2, 0.2) });
        
        // Trait de séparation
        cover.drawLine({ start: { x: A4_W / 2 - 90, y: A4_H * 0.66 - 14 }, end: { x: A4_W / 2 + 90, y: A4_H * 0.66 - 14 }, thickness: 0.6, color: rgb(0.7, 0.7, 0.7) });
        
        // Titre du projet (XXL)
        const titleStr = cleanStr(projectTitle).toUpperCase();
        let titleSize = titleStr.length > 30 ? 28 : (titleStr.length > 18 ? 36 : 44);
        let titleW = fontHelvBold.widthOfTextAtSize(titleStr, titleSize);
        // Rétrécir jusqu'à tenir dans la page (évitait un titre tronqué à droite)
        while(titleW > A4_W - 80 && titleSize > 14) {
            titleSize -= 2;
            titleW = fontHelvBold.widthOfTextAtSize(titleStr, titleSize);
        }
        cover.drawText(titleStr, { x: (A4_W - titleW) / 2, y: A4_H * 0.50, size: titleSize, font: fontHelvBold, color: rgb(0.1, 0.1, 0.1) });
        
        // Auteur (si renseigné)
        if(authorCombined) {
            const authorStr = `Un projet de ${cleanStr(authorCombined)}`;
            const authorW = fontHelv.widthOfTextAtSize(authorStr, 14);
            cover.drawText(authorStr, { x: (A4_W - authorW) / 2, y: A4_H * 0.40, size: 14, font: fontHelv, color: rgb(0.35, 0.35, 0.35) });
        }
        
        // Date de génération
        const today = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
        const dateStr = `Document généré le ${today}`;
        const dateW = fontHelvOblique.widthOfTextAtSize(dateStr, 10);
        cover.drawText(dateStr, { x: (A4_W - dateW) / 2, y: A4_H * 0.32, size: 10, font: fontHelvOblique, color: rgb(0.5, 0.5, 0.5) });
        
        // Récap nombre de sections
        const recap = `${loadedSections.length} section${loadedSections.length > 1 ? 's' : ''} — ${toc[toc.length-1].startPage + loadedSections[loadedSections.length-1].pageCount - prefixPages - 1} pages de contenu`;
        const recapW = fontHelv.widthOfTextAtSize(recap, 10);
        cover.drawText(recap, { x: (A4_W - recapW) / 2, y: A4_H * 0.18, size: 10, font: fontHelv, color: rgb(0.5, 0.5, 0.5) });
        
        // (Mention "moteur.studio" retirée pour uniformiser les pages de garde)
        
        // Bande de couleur en bas
        cover.drawRectangle({ x: 0, y: 0, width: A4_W, height: 6, color: rgb(43/255, 110/255, 246/255) });
        
        // ===== 6. PAGE(S) DE SOMMAIRE =====
        const marginX = 60;
        const titleSomY = A4_H - 80;
        let sumPage = masterDoc.addPage([A4_W, A4_H]);
        const summaryFirstPageRef = sumPage.ref; // référence pour le lien "Sommaire" en bas de chaque page
        
        // Titre "SOMMAIRE"
        sumPage.drawText('SOMMAIRE', { x: marginX, y: titleSomY, size: 22, font: fontHelvBold, color: rgb(0.15, 0.15, 0.15) });
        sumPage.drawLine({ start: { x: marginX, y: titleSomY - 8 }, end: { x: A4_W - marginX, y: titleSomY - 8 }, thickness: 0.6, color: rgb(0.7, 0.7, 0.7) });
        const sumSubtitle = cleanStr(projectTitle) + ' — Dossier de production';
        sumPage.drawText(sumSubtitle, { x: marginX, y: titleSomY - 24, size: 10, font: fontHelvOblique, color: rgb(0.45, 0.45, 0.45) });
        
        // Lignes du sommaire + zones cliquables (liens hypertextes ajoutés en étape 7bis)
        let sumY = titleSomY - 46;
        const lineH = 18;
        const maxY = 60;
        const tocLinkAreas = []; // { page, x1, y1, x2, y2, sectionIndex }
        
        toc.forEach((entry, sectionIndex) => {
            if(sumY < maxY) {
                // Nouvelle page de sommaire
                sumPage = masterDoc.addPage([A4_W, A4_H]);
                sumY = A4_H - 60;
            }
            const labelStr = cleanStr(entry.label);
            const pageStr = String(entry.startPage);
            
            // Couleur bleu liens hypertextes pour le label (indique cliquable)
            const linkColor = rgb(0.16, 0.43, 0.96);
            
            // Label à gauche (sombre — le n° de page reste en bleu lien)
            sumPage.drawText(labelStr, { x: marginX, y: sumY, size: 11, font: fontHelv, color: rgb(0.18, 0.18, 0.18) });
            
            // Points de remplissage entre label et numéro
            const labelW = fontHelv.widthOfTextAtSize(labelStr, 11);
            const pageW = fontHelv.widthOfTextAtSize(pageStr, 11);
            const dotStart = marginX + labelW + 4;
            const dotEnd = A4_W - marginX - pageW - 4;
            const dotCount = Math.floor((dotEnd - dotStart) / 4);
            if(dotCount > 0) {
                let dots = '';
                for(let i = 0; i < dotCount; i++) dots += '.';
                sumPage.drawText(dots, { x: dotStart, y: sumY, size: 11, font: fontHelv, color: rgb(0.7, 0.7, 0.7) });
            }
            
            // Numéro de page à droite (en bleu liens)
            sumPage.drawText(pageStr, { x: A4_W - marginX - pageW, y: sumY, size: 11, font: fontHelvBold, color: linkColor });
            
            // Mémoriser la zone cliquable de toute la ligne (de marginX à A4_W - marginX)
            // Coords PDF : x1/y1 = bas-gauche, x2/y2 = haut-droite
            tocLinkAreas.push({
                page: sumPage,
                x1: marginX - 2,
                y1: sumY - 3,
                x2: A4_W - marginX + 2,
                y2: sumY + 13, // hauteur ≈ taille de police 11
                sectionIndex: sectionIndex
            });
            
            sumY -= lineH;
        });
        
        // Si le sommaire a moins de pages prévues que summaryPageCount, ajouter des pages blanches
        // (pour que les n° de pages restent cohérents même si peu de sections)
        while(masterDoc.getPageCount() < prefixPages) {
            masterDoc.addPage([A4_W, A4_H]);
        }
        
        // ===== 7. FUSIONNER TOUS LES PDFs SOURCES =====
        // On mémorise la référence de la 1ère page de chaque section pour les liens du sommaire
        const sectionFirstPageRefs = {}; // { sectionIndex: pageRef }
        for(let i = 0; i < loadedSections.length; i++) {
            const s = loadedSections[i];
            try {
                const pageIndices = s.srcDoc.getPageIndices();
                const copiedPages = await masterDoc.copyPages(s.srcDoc, pageIndices);
                copiedPages.forEach((p, idx) => {
                    const added = masterDoc.addPage(p);
                    if(idx === 0) {
                        // Mémoriser la référence à la première page ajoutée pour cette section
                        sectionFirstPageRefs[i] = added.ref;
                    }
                });
            } catch(e) {
                console.error(`[Dossier Prod] Échec copie pages ${s.label} :`, e);
            }
        }
        
        // ===== 7bis. AJOUTER LES LIENS HYPERTEXTES AU SOMMAIRE =====
        // Pour chaque ligne enregistrée dans tocLinkAreas, créer une annotation Link
        // qui pointe vers la première page de la section correspondante.
        try {
            tocLinkAreas.forEach(area => {
                const targetRef = sectionFirstPageRefs[area.sectionIndex];
                if(!targetRef) return;
                
                // Construire la destination : [pageRef, /Fit] (ouvre la page entière)
                const destArray = masterDoc.context.obj([
                    targetRef,
                    PDFName.of('Fit')
                ]);
                
                // Construire l'action GoTo
                const action = masterDoc.context.obj({
                    Type: PDFName.of('Action'),
                    S: PDFName.of('GoTo'),
                    D: destArray
                });
                
                // Construire l'annotation Link
                const linkAnnot = masterDoc.context.obj({
                    Type: PDFName.of('Annot'),
                    Subtype: PDFName.of('Link'),
                    Rect: masterDoc.context.obj([area.x1, area.y1, area.x2, area.y2]),
                    Border: masterDoc.context.obj([0, 0, 0]), // pas de bordure visible
                    A: action
                });
                const linkAnnotRef = masterDoc.context.register(linkAnnot);
                
                // Ajouter l'annotation à la page de sommaire concernée
                const pageNode = area.page.node;
                let annots = pageNode.lookup(PDFName.of('Annots'), PDFArray);
                if(!annots) {
                    annots = masterDoc.context.obj([]);
                    pageNode.set(PDFName.of('Annots'), annots);
                }
                annots.push(linkAnnotRef);
            });
        } catch(e) {
            console.warn('[Dossier Prod] Échec ajout liens hypertextes au sommaire :', e);
        }
        
        // ===== 7ter. NUMÉROTATION GLOBALE + LIEN "Sommaire" sur toutes les pages =====
        // Pour chaque page après la cover et le sommaire :
        // - Dessiner un rectangle blanc sur la bande du bas (masque les footers individuels)
        // - Réécrire le numéro de page global "X / N"
        // - Ajouter un lien "← Sommaire" en bas à droite (clic = retour au sommaire)
        try {
            const allPages = masterDoc.getPages();
            const totalPages = allPages.length;
            const linkSommaireText = 'Sommaire';
            const linkSommaireSize = 9;
            const linkSommaireW = fontHelv.widthOfTextAtSize(linkSommaireText, linkSommaireSize);
            
            for(let i = 0; i < totalPages; i++) {
                // Skip la cover (i=0) et les pages de sommaire (i < prefixPages)
                if(i < prefixPages) continue;
                
                const pg = allPages[i];
                const { width: pw, height: ph } = pg.getSize();
                const isLandscape = pw > ph;
                
                const pageStr = `${i + 1} / ${totalPages}`;
                const pageStrW = fontHelv.widthOfTextAtSize(pageStr, 9);
                
                let linkX, linkY;
                
                if(!isLandscape) {
                    // ===== PAGE PORTRAIT (cas normal) =====
                    // Tous les modules réservent désormais 14mm (~40pt) en bas pour le footer
                    // unifié et y dessinent "X / N" à pageHeight - 6mm (~17pt du bas).
                    // Une bande blanche de 40pt masque ce footer local pour pouvoir
                    // réécrire la pagination GLOBALE (par rapport au Dossier de Production).
                    pg.drawRectangle({
                        x: 0, y: 0, width: pw, height: 40,
                        color: rgb(1, 1, 1), opacity: 1
                    });
                    
                    // Numéro de page global centré en bas
                    pg.drawText(pageStr, {
                        x: (pw - pageStrW) / 2,
                        y: 14,
                        size: 9,
                        font: fontHelv,
                        color: rgb(0.5, 0.5, 0.5)
                    });
                    
                    // Nom de la section courante en bas à gauche
                    const curSect = toc.filter(t => t.startPage <= i + 1).pop();
                    if(curSect) {
                        const [ar, ag, ab] = PdfTheme.accentFor(curSect.label);
                        pg.drawText(cleanStr(curSect.label), { x: 40, y: 14, size: 8, font: fontHelvBold, color: rgb(ar / 255, ag / 255, ab / 255) });
                    }
                    
                    // Lien "Sommaire" en bas à droite
                    linkX = pw - 40 - linkSommaireW;
                    linkY = 14;
                    pg.drawText(linkSommaireText, {
                        x: linkX,
                        y: linkY,
                        size: linkSommaireSize,
                        font: fontHelv,
                        color: rgb(0.16, 0.43, 0.96)
                    });
                } else {
                    // ===== PAGE PAYSAGE (sera tournée 270° à la phase 7quater) =====
                    // Pour qu'après rotation 270°, le footer apparaisse en bas centré,
                    // on le dessine sur le BORD GAUCHE, texte tourné 90° (anti-trigo).
                    // Bande blanche de 40pt sur le bord gauche (= bas après rotation 270°)
                    pg.drawRectangle({
                        x: 0, y: 0, width: 40, height: ph,
                        color: rgb(1, 1, 1), opacity: 1
                    });
                    
                    // Texte tourné 270° (= -90°) pour qu'après rotation 270° de la
                    // page entière, le footer apparaisse droit (lisible normalement).
                    // Avec rotate:270°, le texte part vers le BAS depuis le point
                    // d'ancrage (x,y) ; on positionne donc y au-dessus de la zone visée.
                    const rotFooter = degrees(270);
                    
                    // Numéro de page : centré verticalement sur la page logique
                    // (= centre horizontal visuel après rotation 270° de la page)
                    pg.drawText(pageStr, {
                        x: 14,
                        y: (ph + pageStrW) / 2,
                        size: 9,
                        font: fontHelv,
                        color: rgb(0.5, 0.5, 0.5),
                        rotate: rotFooter
                    });
                    
                    // Lien "Sommaire" : positionné vers le bas du bord gauche logique
                    // (= bas droit visuel après rotation 270°)
                    linkX = 14;
                    linkY = 40 + linkSommaireW;
                    pg.drawText(linkSommaireText, {
                        x: linkX,
                        y: linkY,
                        size: linkSommaireSize,
                        font: fontHelv,
                        color: rgb(0.16, 0.43, 0.96),
                        rotate: rotFooter
                    });
                }
                
                // Annotation Link sur cette zone
                if(summaryFirstPageRef) {
                    const destArr = masterDoc.context.obj([summaryFirstPageRef, PDFName.of('Fit')]);
                    const act = masterDoc.context.obj({
                        Type: PDFName.of('Action'),
                        S: PDFName.of('GoTo'),
                        D: destArr
                    });
                    const linkAnnot = masterDoc.context.obj({
                        Type: PDFName.of('Annot'),
                        Subtype: PDFName.of('Link'),
                        Rect: masterDoc.context.obj([linkX - 2, linkY - 2, linkX + linkSommaireW + 2, linkY + linkSommaireSize + 2]),
                        Border: masterDoc.context.obj([0, 0, 0]),
                        A: act
                    });
                    const linkRef = masterDoc.context.register(linkAnnot);
                    let annots = pg.node.lookup(PDFName.of('Annots'), PDFArray);
                    if(!annots) {
                        annots = masterDoc.context.obj([]);
                        pg.node.set(PDFName.of('Annots'), annots);
                    }
                    annots.push(linkRef);
                }
            }
        } catch(e) {
            console.warn('[Dossier Prod] Échec numérotation globale + lien sommaire :', e);
        }
        
        // ===== 7quater. ROTATION DES PAGES PAYSAGE pour impression cohérente =====
        // Toutes les pages paysage (Mood Board large, Storyboard, Planning, etc.) sont
        // tournées de 90° pour qu'à l'impression, l'utilisateur garde la feuille en
        // portrait et tourne juste la tête pour lire le contenu paysage.
        // L'orientation logique du contenu n'est PAS modifiée, seul l'attribut /Rotate du PDF.
        try {
            const { degrees } = window.PDFLib;
            const rotPages = masterDoc.getPages();
            for(let i = 0; i < rotPages.length; i++) {
                const p = rotPages[i];
                const { width: w, height: h } = p.getSize();
                if(w > h) {
                    // Page paysage : rotation 270° (= -90°) pour impression portrait
                    // L'utilisateur tourne la tête vers la droite pour lire
                    p.setRotation(degrees(270));
                }
            }
        } catch(e) {
            console.warn('[Dossier Prod] Échec rotation pages paysage :', e);
        }
        
        // ===== 8. SAUVEGARDER ET TÉLÉCHARGER =====
        const pdfBytes = await masterDoc.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = (typeof PdfTheme !== 'undefined' && PdfTheme.filename)
            ? PdfTheme.filename('Dossier de production')
            : `${cleanStr(projectTitle) || 'Projet'} - Dossier de production - moteur.studio.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        
        Utils.toast(`Dossier de production généré ! (${masterDoc.getPageCount()} pages)`, 'success');
        if(typeof History !== 'undefined' && History.log) History.log('EXPORT', `Dossier de Production PDF généré (${loadedSections.length} sections, ${masterDoc.getPageCount()} pages)`);
    },
    
    // ========== [Phase B] EXPORT ZIP MOTEUR COMPLET ==========
    // Génère un fichier .moteur.zip qui peut être réimporté pour restaurer le projet complet.
    // Inclut : project.json + toutes les images Storage + manifest signé.
    exportMoteurZip: async () => {
        // v578 (cloisonnement) : cette archive se presente comme une sauvegarde
        // COMPLETE, « en cas de crash ». Sur un projet transmis partiellement elle
        // serait silencieusement amputee — et c'est le pire des cas, parce qu'on ne
        // s'en apercevrait qu'au moment de restaurer, quand il est trop tard.
        // Mieux vaut ne rien donner qu'une sauvegarde qui ment.
        if(typeof Store !== 'undefined' && Store.isPartial && Store.isPartial()) {
            Utils.toast("Ce projet vous est transmis partiellement : l'archive serait incomplète. Seul le propriétaire peut en faire une sauvegarde complète.", 'error', 9000);
            return;
        }
        try {
            await MoteurArchive.ensureJSZip();
        } catch(e) {
            Utils.toast('Impossible de charger JSZip', 'error');
            return;
        }
        
        const progress = MoteurArchive.showProgressModal('📦 Téléchargement Moteur complet');
        
        try {
            // 1. Cloner state.data pour ne pas le polluer
            progress.update('Préparation des données…', 0, 100);
            await new Promise(r => setTimeout(r, 50));
            const dataClone = JSON.parse(JSON.stringify(state.data));
            
            // 2. Trouver toutes les URLs Storage
            progress.update('Inventaire des images…', 5, 100);
            await new Promise(r => setTimeout(r, 50));
            const urlsFound = MoteurArchive.findAllStorageUrls(dataClone);
            // Dédupliquer par URL (une même image peut être référencée plusieurs fois)
            const uniqueUrls = [];
            const seenUrls = new Set();
            urlsFound.forEach(item => {
                if(!seenUrls.has(item.url)) {
                    seenUrls.add(item.url);
                    uniqueUrls.push(item);
                }
            });
            
            // 3. Préparer mapping URL → chemin local
            const urlToLocal = {};
            uniqueUrls.forEach(item => {
                urlToLocal[item.url] = MoteurArchive.urlToLocalPath(item.url);
            });
            
            // 4. Télécharger toutes les images
            const zip = new JSZip();
            const totalImages = uniqueUrls.length;
            let downloaded = 0;
            let failed = 0;
            
            for(const item of uniqueUrls) {
                if(progress.isCancelled()) {
                    progress.close();
                    Utils.toast('Export annulé', 'info');
                    return;
                }
                
                const localPath = urlToLocal[item.url];
                const fileName = localPath.split('/').pop();
                progress.update(`Téléchargement: ${fileName}`, downloaded, totalImages);
                
                try {
                    const response = await fetch(Utils.signedUrlFor(item.url));
                    if(!response.ok) throw new Error('HTTP ' + response.status);
                    const blob = await response.blob();
                    zip.file(localPath, blob);
                    downloaded++;
                } catch(e) {
                    console.warn('Échec download:', item.url, e.message);
                    failed++;
                }
            }
            
            // 5. Réécrire les URLs dans le clone vers les chemins locaux relatifs
            // On parcourt l'objet et on remplace toute string qui est une URL Storage par son chemin local
            progress.update('Réécriture des chemins…', totalImages, totalImages + 3);
            await new Promise(r => setTimeout(r, 50));
            const rewriteUrls = (obj) => {
                if(typeof obj === 'string') {
                    return urlToLocal[obj] ? './' + urlToLocal[obj] : obj;
                }
                if(Array.isArray(obj)) return obj.map(rewriteUrls);
                if(obj && typeof obj === 'object') {
                    const out = {};
                    Object.entries(obj).forEach(([k, v]) => { out[k] = rewriteUrls(v); });
                    return out;
                }
                return obj;
            };
            const dataRewritten = rewriteUrls(dataClone);
            
            // 6. Écrire project.json
            const projectJson = JSON.stringify(dataRewritten, null, 2);
            zip.file('project.json', projectJson);
            
            // 7. Écrire manifest signé
            progress.update('Génération du manifest…', totalImages + 1, totalImages + 3);
            await new Promise(r => setTimeout(r, 50));
            const manifest = {
                signature: MoteurArchive.SIGNATURE,
                version: MoteurArchive.VERSION,
                generatedAt: new Date().toISOString(),
                generatedBy: state.currentUser?.email || 'unknown',
                projectTitle: state.data.title || 'Sans titre',
                projectId: state.currentProjectId || null,
                stats: {
                    imagesTotal: totalImages,
                    imagesDownloaded: downloaded,
                    imagesFailed: failed
                },
                checksum: MoteurArchive.simpleHash(projectJson)
            };
            zip.file('moteur-manifest.json', JSON.stringify(manifest, null, 2));
            
            // 8. README
            zip.file('README.txt', 
                `Archive Moteur — ${state.data.title || 'Sans titre'}\n` +
                `Générée le : ${new Date().toLocaleString('fr-FR')}\n\n` +
                `Cette archive contient une sauvegarde complète de votre projet, ` +
                `incluant toutes les images. Elle ne peut être réouverte que dans moteur.studio.\n\n` +
                `Pour la restaurer : Menu Fichier > Importer un projet > sélectionnez ce fichier.\n\n` +
                `⚠️ Ne modifiez pas le contenu de ce ZIP, l'import vérifiera la signature.\n`
            );
            
            // 9. Générer le ZIP
            progress.update('Compression du ZIP…', totalImages + 2, totalImages + 3);
            await new Promise(r => setTimeout(r, 50));
            const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
            
            // 10. Téléchargement
            const safeTitle = (state.data.title || 'projet').replace(/[\\/:*?"<>|]/g, '_').trim();
            const filename = `${safeTitle}${MoteurArchive.EXTENSION}`;
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = filename;
            link.click();
            URL.revokeObjectURL(link.href);
            
            progress.close();
            
            // Message final
            const summary = failed > 0 
                ? `Export terminé. ${downloaded} images sauvegardées, ${failed} échouées.`
                : `Export complet ! ${downloaded} image(s) sauvegardée(s).`;
            Utils.toast(summary, failed > 0 ? 'warning' : 'success');
            History.log('EXPORT', 'Téléchargement Moteur complet généré');
            
        } catch(err) {
            console.error('Erreur export Moteur ZIP:', err);
            progress.close();
            Utils.toast('Erreur : ' + (err.message || 'inconnu'), 'error');
        }
    }
};
