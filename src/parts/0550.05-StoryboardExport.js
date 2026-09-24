
const StoryboardExport = {
    _printCapturing: false,
    _printImgPromises: [],
    _exportSceneIds: null, // null = toutes ; sinon liste d'ids de scenes a exporter

    // [Fix images PDF] Telecharge les octets de l'image via le client Supabase
    // (deja autorise cote CORS) et renvoie une URL blob locale (same-origin).
    // Utilise seulement pour les images STOCKEES (chemin projet). Les images en
    // data: URL (cas courant du storyboard) sont dessinees directement.
    // ===== CACHE DES BLOBS DE DESSIN (v599) =====
    // Les dessins du storyboard ne passent PAS par le cache d'images du
    // navigateur : ils sont telecharges en blob par le SDK. Or l'URL blob
    // etait revoquee juste apres avoir ete dessinee — chaque rendu de la liste
    // des plans retelechargeait donc TOUT, et les vignettes restaient vides le
    // temps des telechargements. C'est ce qui donnait l'impression que les
    // images n'apparaissaient qu'apres avoir ouvert puis referme une fiche :
    // le second rendu, lui, retrouvait la reponse dans le cache HTTP.
    // On garde donc les URL blob, bornees et videes au changement de projet.
    _blobCache: new Map(),
    _blobEnCours: new Map(),
    // v601 — ON MESURE EN OCTETS, PAS EN NOMBRE D'IMAGES. « 150 images » ne
    // veut rien dire : 150 vignettes de 50 Ko pesent 7 Mo, 150 planches de 2 Mo
    // en pesent 300. C'est le poids qui fait ramer le navigateur, c'est donc le
    // poids qu'on borne. Le nombre reste en second garde-fou, pour qu'un projet
    // fait de minuscules images n'accumule pas des milliers d'entrees.
    BLOB_CACHE_OCTETS: 50 * 1024 * 1024,
    BLOB_CACHE_MAX: 400,
    _blobPoids: new Map(),   // chemin -> octets
    _blobTotal: 0,

    // VRAI CLASSEMENT PAR USAGE. Avant, on jetait la plus ANCIENNEMENT CHARGEE
    // — qui pouvait etre celle qu'on regarde tout le temps, pendant qu'une
    // image jamais revue restait. Une Map garde l'ordre d'insertion : reposer
    // une entree deja presente la remet donc en queue, et le premier element
    // est bien le moins recemment SERVI.
    _blobToucher: (path) => {
        const c = StoryboardExport._blobCache;
        if(!c.has(path)) return;
        const u = c.get(path);
        c.delete(path);
        c.set(path, u);
    },

    _blobFaireDeLaPlace: () => {
        const c = StoryboardExport._blobCache;
        while(c.size && (StoryboardExport._blobTotal > StoryboardExport.BLOB_CACHE_OCTETS
                         || c.size > StoryboardExport.BLOB_CACHE_MAX)) {
            const vieux = c.keys().next().value;
            const u = c.get(vieux);
            c.delete(vieux);
            StoryboardExport._blobTotal -= (StoryboardExport._blobPoids.get(vieux) || 0);
            StoryboardExport._blobPoids.delete(vieux);
            try { URL.revokeObjectURL(u); } catch(e) {}
        }
        if(StoryboardExport._blobTotal < 0) StoryboardExport._blobTotal = 0;
    },

    // A taper dans la console : combien de place prennent les dessins gardes.
    blobInfo: () => ({
        images: StoryboardExport._blobCache.size,
        poids_mo: +(StoryboardExport._blobTotal / 1048576).toFixed(2),
        plafond_mo: +(StoryboardExport.BLOB_CACHE_OCTETS / 1048576).toFixed(0)
    }),

    // ---- FILE D'ATTENTE DES TELECHARGEMENTS (v601) ----
    // Une planche de storyboard peint ses dessins dans un CANVAS : il n'y a pas
    // de balise image, donc rien que le navigateur puisse mettre en file. Tout
    // partait d'un coup — une douzaine de pages a quatre plans font une
    // cinquantaine de telechargements simultanes — et chacun avait 8 secondes
    // pour repondre. Passe ce delai on dessine quand meme : d'ou des vignettes
    // VIDES, sans la moindre erreur affichee. Le mood board n'a jamais eu le
    // probleme parce qu'il passe par des balises image, que le navigateur
    // limite lui-meme a quelques connexions.
    // QUATRE A LA FOIS, donc, comme le ferait le navigateur.
    TELECHARGEMENTS_PARALLELES: 4,
    _imagesRatees: 0,
    _enVol: 0,
    _fileAttente: [],
    _place: () => new Promise(libre => {
        if(StoryboardExport._enVol < StoryboardExport.TELECHARGEMENTS_PARALLELES) {
            StoryboardExport._enVol++;
            libre();
        } else {
            StoryboardExport._fileAttente.push(libre);
        }
    }),
    _rendLaPlace: () => {
        const suivant = StoryboardExport._fileAttente.shift();
        if(suivant) suivant();
        else StoryboardExport._enVol = Math.max(0, StoryboardExport._enVol - 1);
    },
    videBlobCache: () => {
        StoryboardExport._blobPoids.clear();
        StoryboardExport._blobTotal = 0;
        StoryboardExport._blobCache.forEach(u => { try { URL.revokeObjectURL(u); } catch(e) {} });
        StoryboardExport._blobCache.clear();
        StoryboardExport._blobEnCours.clear();
    },
    _resolveBlobUrl: async (storedUrl) => {
        try {
            const path = Utils._projPathFrom(storedUrl);
            if(!path) return null;
            const cache = StoryboardExport._blobCache;
            const dejaLa = cache.get(path);
            if(dejaLa) { StoryboardExport._blobToucher(path); return dejaLa; }
            // Deux vignettes peuvent demander le meme dessin en meme temps :
            // sans cela, on le telechargerait deux fois.
            const enCours = StoryboardExport._blobEnCours.get(path);
            if(enCours) return enCours;
            const p = (async () => {
                await StoryboardExport._place();
                let data = null, error = null;
                try { ({ data, error } = await supabase.storage.from('projects').download(path)); }
                finally { StoryboardExport._rendLaPlace(); }
                if(error || !data) { console.warn('[Storyboard] telechargement echoue :', path, error); return null; }
                const url = URL.createObjectURL(data);
                cache.set(path, url);
                StoryboardExport._blobPoids.set(path, data.size || 0);
                StoryboardExport._blobTotal += (data.size || 0);
                StoryboardExport._blobFaireDeLaPlace();
                return url;
            })();
            StoryboardExport._blobEnCours.set(path, p);
            const r = await p;
            StoryboardExport._blobEnCours.delete(path);
            return r;
        } catch(e) { StoryboardExport._blobEnCours.delete(Utils._projPathFrom(storedUrl)); return null; }
    },

    // Charge une image de print puis appelle draw(). Regles :
    //  - data:/blob: -> utilisee TELLE QUELLE (surtout PAS de cache-buster, qui
    //    corromprait la data URL et ferait echouer le chargement) ;
    //  - chemin de stockage -> telecharge en blob (same-origin, insensible au CORS) ;
    //  - autre URL -> URL signee.
    // Si une capture PDF est en cours, la promesse est trackee pour qu'exportPDF
    // attende le dessin reel avant de rasteriser.
    _loadPrintImg: (img, storedUrl, draw) => {
        const isData = typeof storedUrl === 'string' && (storedUrl.startsWith('data:') || storedUrl.startsWith('blob:'));
        const resolve = isData ? Promise.resolve(null) : StoryboardExport._resolveBlobUrl(storedUrl);
        const p = resolve.then(objUrl => new Promise(res => {
            // v599 : plus de revocation ici. L'URL blob vient desormais du cache
            // ci-dessus et sert a tous les rendus suivants ; la detruire apres le
            // premier dessin etait la cause du retelechargement systematique.
            // TRACE NOMMEE (v601). Une vignette vide ne disait RIEN : ni erreur,
            // ni message, la page sortait juste blanche. On nomme desormais ce
            // qui n'a pas pu etre dessine, et pourquoi — c'est la seule chose
            // qu'on puisse lire apres coup quand le defaut ne se reproduit pas.
            let fait = false;
            const fini = (pourquoi) => {
                if(fait) return;
                fait = true;
                if(pourquoi) { StoryboardExport._imagesRatees++; console.warn('[Storyboard] image non dessinee (' + pourquoi + ') :', storedUrl); }
                res();
            };
            img.onload = () => { try { draw(); } catch(e) { console.warn('[Storyboard] dessin impossible :', e); } fini(); };
            img.onerror = () => fini('chargement refuse');
            img.src = objUrl || (isData ? storedUrl : Utils.signedUrlFor(storedUrl));
            setTimeout(() => fini('delai depasse (8 s)'), 8000);
        }));
        if(StoryboardExport._printCapturing) StoryboardExport._printImgPromises.push(p);
        return p;
    },
    
    renderPrintPreview: (containerId) => {
        const container = document.getElementById(containerId);
        container.innerHTML = '';
        
        if(!state.data.shots || state.data.shots.length === 0) {
            container.innerHTML = '<div style="text-align: center; color: #999; padding: 50px;">Aucun plan à afficher</div>';
            return;
        }
        
        // Group shots by scene
        const onlyScenes = StoryboardExport._exportSceneIds; // null = toutes (apercu ecran)
        const sceneGroups = {};
        state.data.scenes.forEach(scene => {
            if(onlyScenes && !onlyScenes.includes(scene.id)) return;
            const sceneShots = state.data.shots
                .filter(s => s.sceneId === scene.id)
                .sort((a, b) => a.order - b.order);
            
            if(sceneShots.length > 0) {
                sceneGroups[scene.id] = {
                    scene: scene,
                    shots: sceneShots
                };
            }
        });
        
        // Calcul plage de scènes pour titre PDF
        const sceneNums = Object.values(sceneGroups).map(g => state.data.scenes.indexOf(g.scene) + 1);
        Storyboard._printSceneRange = sceneNums.length === 0 ? '' : (sceneNums.length === 1 ? `Sc ${sceneNums[0]}` : `Sc ${Math.min(...sceneNums)} à ${Math.max(...sceneNums)}`);
        // Render pages — flux continu : chaque page est remplie jusqu'à perPage plans,
        // toutes scènes confondues (fini les pages quasi vides à 1-2 plans). Un bandeau
        // de scène est inséré dans le flux à chaque changement de scène.
        const layout = (Storyboard.printConfig && Storyboard.printConfig.layout) || 'standard';
        const perPage = layout === 'large' ? 1 : (layout === 'compact' ? 16 : 4);
        let page = null, grid = null, used = 0;
        const newPage = () => {
            page = document.createElement('div');
            page.className = 'sb-print-page sb-print-page--' + layout;
            grid = document.createElement('div');
            grid.className = 'sb-print-grid';
            page.appendChild(grid);
            container.appendChild(page);
            used = 0;
        };
        const addSceneTitle = (sceneIndex, scene, suite) => {
            if(!Storyboard.printConfig.sceneTitle) return;
            const h = document.createElement('h2');
            h.innerText = `Scène ${sceneIndex} - ${scene.title}` + (suite ? ' (suite)' : '');
            if(layout === 'large') page.insertBefore(h, grid);
            else grid.appendChild(h);
        };
        newPage();
        Object.values(sceneGroups).forEach(group => {
            const { scene, shots } = group;
            const sceneIndex = state.data.scenes.indexOf(scene) + 1;
            let titled = false;
            shots.forEach((shot, idx) => {
                if(used >= perPage) { newPage(); titled = false; }
                if(!titled) { addSceneTitle(sceneIndex, scene, idx > 0); titled = true; }
                grid.appendChild(Storyboard.createPrintShot(shot, sceneIndex, idx + 1));
                used++;
            });
        });
    },
    
    // v595 : précharge (et attend) les images des objets (photos insérées,
    // icônes SVG d'annotation) avant de les dessiner sur un canvas d'export.
    // Sans ça, renderObjectsOnCanvas dessine un placeholder "Chargement…" si
    // l'image n'est pas déjà en cache — placeholder qui reste figé dans le
    // PDF puisque ce canvas hors-écran n'est jamais redessiné après coup.
    _preloadObjectImages: (objects) => {
        if(!Array.isArray(objects) || objects.length === 0) return Promise.resolve();
        const catalog = CONFIG.annotationObjects || [];
        const waits = [];
        objects.forEach(o => {
            if(!o || !o.type) return;
            let cacheKey, trigger;
            if(o.type === 'image') {
                if(!o.imageData) return;
                cacheKey = 'uploaded|' + o.id;
                trigger = () => Storyboard.getOrCreateUploadedImage(o.id, o.imageData);
            } else {
                const def = catalog.find(d => d.type === o.type);
                if(!def || !def.svg) return; // pas de SVG -> fallback emoji, rien à précharger
                cacheKey = o.type + '|currentColor';
                trigger = () => Storyboard.getOrCreateSvgImage(o.type);
            }
            const existing = Storyboard._svgImageCache[cacheKey];
            if(existing && existing.ready) return;
            trigger();
            waits.push(new Promise(resolve => {
                const check = () => {
                    const entry = Storyboard._svgImageCache[cacheKey];
                    if(entry && entry.ready) { resolve(); return; }
                    setTimeout(check, 60);
                };
                check();
                setTimeout(resolve, 8000);
            }));
        });
        return Promise.all(waits);
    },
    
    // [Phase C.2.6] Helper : dessine un calque technique (lighting/camera/actors) PAR-DESSUS un canvas
    // existant. Utilisé par createPrintShot pour superposer dans un seul canvas (pas 2 séparés).
    _drawTechLayerOnTop: async (ctx, shot, techLayer, wantsTechLayer) => {
        if(!wantsTechLayer || !shot.drawings || !shot.drawings[techLayer]) return;
        const techZone = shot.drawings[techLayer];
        
        // 3 cas : image uploadée, drawingData (calques de dessin), objects (objets vectoriels)
        if(techZone.imageType === 'upload' && techZone.imageUrl) {
            const layerImg = new Image();
            await StoryboardExport._loadPrintImg(layerImg, techZone.imageUrl, () => { ctx.drawImage(layerImg, 0, 0, ctx.canvas.width, ctx.canvas.height); });
        } else if(techZone.drawingData) {
            // Dessine les calques DrawingEditor du zone tech par dessus (renderDrawingData fait drawImage async)
            DrawingEditor.renderDrawingData(ctx, techZone.drawingData);
        }
        
        // Objets vectoriels du zone tech par-dessus — attend que leurs images soient prêtes
        if(Array.isArray(techZone.objects) && techZone.objects.length > 0) {
            await StoryboardExport._preloadObjectImages(techZone.objects);
            Storyboard.renderObjectsOnCanvas(ctx, techZone.objects);
        }
    },
    
    createPrintShot: (shot, sceneIndex, shotIndex) => {
        const card = document.createElement('div');
        card.className = 'sb-print-shot';
        const imageOnlyMode = !!(Storyboard.printConfig && Storyboard.printConfig.imageOnly);
        
        // Mode "image uniquement" : pas de colonne d'info à côté (elle resterait
        // vide) — l'image prend toute la largeur, avec juste le titre/numéro
        // du plan au-dessus, sur une ligne fine.
        if(imageOnlyMode) {
            card.classList.add('sb-print-shot--imageonly');
            const headerParts = [];
            if(Storyboard.printConfig.shotNumber) headerParts.push(`<strong>Plan ${sceneIndex}.${shotIndex}</strong>`);
            if(shot.name) headerParts.push(Utils.escape(shot.name));
            if(headerParts.length > 0) {
                const topHeader = document.createElement('div');
                topHeader.className = 'sb-print-shot-header sb-print-shot-header--top';
                topHeader.innerHTML = headerParts.join(' - ');
                card.appendChild(topHeader);
            }
        }
        
        // Image
        const imageDiv = document.createElement('div');
        imageDiv.className = 'sb-print-shot-image';
        
        // [Phase C.2.6] Tout est rendu dans UN SEUL canvas pour garantir la superposition
        // (l'ancien système avec 2 canvas overlay s'imprimait côte à côte au lieu de superposé)
        const techLayer = (Storyboard.printConfig && Storyboard.printConfig.techLayer) || 'none';
        const wantsTechLayer = (techLayer !== 'none');
        
        const composedCanvas = document.createElement('canvas');
        composedCanvas.width = 800;
        composedCanvas.height = 600;
        const composedCtx = composedCanvas.getContext('2d');
        let hasContent = false;
        
        // ====================================================================
        // DEUX RANGEMENTS, ET L'EXPORT N'EN LISAIT QU'UN (v601)
        // ====================================================================
        // Un plan peut porter son image a DEUX endroits :
        //   - A LA RACINE (shot.imageType / imageUrl / drawingData) : l'ancien
        //     format, celui que la vignette de l'onglet lit encore ;
        //   - DANS LA ZONE « original » (shot.drawings.original) : le format des
        //     quatre calques, celui que l'EDITEUR DE DESSIN ecrit depuis qu'il
        //     existe. Une image inseree dans l'editeur y devient un OBJET
        //     (objects[]), pas une imageUrl.
        // L'export ne lisait que la RACINE, et pire : il n'allait chercher les
        // objets de la zone QUE si la racine portait deja un drawingData. Un plan
        // dessine ou illustre uniquement dans l'editeur n'avait donc aucune de ces
        // deux conditions — « Pas d'image », page blanche, et pas la moindre
        // erreur pour le dire.
        // On compose desormais dans l'ordre naturel : image de fond (racine OU
        // zone), calques de dessin (zone d'abord, racine en repli), puis objets.
        // L'EDITEUR GAGNE, ET C'EST TOUTE LA REGLE (v601). Un plan peut porter une
        // image a la RACINE (ancien format, souvent une esquisse de depart) ET un
        // contenu dans la zone « original », celle qu'ecrit l'editeur de dessin.
        // Les composer tous les deux faisait reapparaitre l'esquisse EN FOND,
        // derriere le travail reel, des que celui-ci ne couvrait pas tout le
        // cadre. Des que la zone a quelque chose a elle — un calque, un objet, une
        // image — elle est la SEULE source ; la racine ne sert plus que de repli
        // pour les plans jamais ouverts dans l'editeur.
        // RIEN N'EST EFFACE : l'ancienne image dort dans les donnees et
        // reapparaitrait si on vidait la zone. On choisit ce qu'on REGARDE, pas
        // ce qu'on garde.
        const contenu = Storyboard.contenuPlan(shot);
        const fondUrl = contenu.fond;
        const calques = contenu.calques;
        const objets = contenu.objets;

        if(fondUrl || calques || objets.length > 0) {
            let etape = Promise.resolve();
            if(fondUrl) {
                const img = new Image();
                etape = StoryboardExport._loadPrintImg(img, fondUrl, () => {
                    // Garder l'aspect ratio : dessiner centre dans le canvas
                    const ratio = Math.min(composedCanvas.width / img.naturalWidth, composedCanvas.height / img.naturalHeight);
                    const w = img.naturalWidth * ratio;
                    const h = img.naturalHeight * ratio;
                    composedCtx.drawImage(img, (composedCanvas.width - w) / 2, (composedCanvas.height - h) / 2, w, h);
                });
            }
            if(calques) etape = etape.then(() => DrawingEditor.renderDrawingData(composedCtx, calques) || Promise.resolve());
            if(objets.length > 0) {
                etape = etape.then(() => StoryboardExport._preloadObjectImages(objets))
                             .then(() => Storyboard.renderObjectsOnCanvas(composedCtx, objets));
            }
            const techP = etape.then(() => Storyboard._drawTechLayerOnTop(composedCtx, shot, techLayer, wantsTechLayer));
            if(StoryboardExport._printCapturing) StoryboardExport._printImgPromises.push(techP);
            hasContent = true;
        }


if(hasContent) {
            imageDiv.appendChild(composedCanvas);
        } else {
            imageDiv.innerHTML = '<div style="color: #999;">Pas d\'image</div>';
        }
        
        card.appendChild(imageDiv);
        
        if(imageOnlyMode) return card;
        
        // Info
        const infoDiv = document.createElement('div');
        infoDiv.className = 'sb-print-shot-info';
        
        let infoHTML = '';
        
        // Header line
        const headerParts = [];
        if(Storyboard.printConfig.shotNumber) {
            headerParts.push(`<strong>Plan ${sceneIndex}.${shotIndex}</strong>`);
        }
        if(shot.name) {
            headerParts.push(shot.name);
        }
        if(headerParts.length > 0) {
            infoHTML += `<div class="sb-print-shot-header">${headerParts.join(' - ')}</div>`;
        }
        
        // Meta line (avec acronymes)
        const metaParts = [];
        if(Storyboard.printConfig.shotType && shot.shotType) {
            metaParts.push(Storyboard.extractAcronym(shot.shotType));
        }
        if(Storyboard.printConfig.cameraMove && shot.cameraMove) {
            metaParts.push(Storyboard.extractAcronym(shot.cameraMove));
        }
        if(Storyboard.printConfig.cameraMode && shot.cameraMode) {
            metaParts.push(Storyboard.extractAcronym(shot.cameraMode));
        }
        if(metaParts.length > 0) {
            infoHTML += `<div class="sb-print-shot-meta">${metaParts.join(' • ')}</div>`;
        }
        
        // Description section
        if(Storyboard.printConfig.description && shot.description) {
            infoHTML += `<div class="sb-print-shot-desc"><strong>Description :</strong> ${Utils.escape(shot.description)}</div>`;
        }
        
        if(Storyboard.printConfig.actorDirection && shot.actorDirection) {
            infoHTML += `<div class="sb-print-shot-desc"><strong>Direction acteurs :</strong> ${Utils.escape(shot.actorDirection)}</div>`;
        }
        
        if(Storyboard.printConfig.techDirection && shot.technicalDirection) {
            infoHTML += `<div class="sb-print-shot-desc"><strong>Direction technique :</strong> ${Utils.escape(shot.technicalDirection)}</div>`;
        }
        
        infoDiv.innerHTML = infoHTML;
        card.appendChild(infoDiv);
        
        return card;
    },
    
    // ========== EXPORT PDF STORYBOARD ==========
    // opts = { includeCover, returnBlob, imageOnly, techLayer ('none'|'lighting'|'camera'|'actors') }
    // [Phase D refonte v2] Export Storyboard par rasterisation HORS-ÉCRAN
    // - Utilise renderPrintPreview qui sait déjà rendre toutes les pages
    // - html2canvas rasterise chaque page (.sb-print-page)
    // - Marche depuis n'importe quel onglet, capture images + calques techniques
    exportPDF: async (opts = {}) => {
        const shots = state.data.shots || [];
        
        if(shots.length === 0) {
            if(!opts.returnBlob) Utils.toast('Aucun plan à exporter', 'warning');
            return;
        }
        
        if(!opts.returnBlob) Utils.toast('Génération du PDF Storyboard...', 'info');
        
        await LazyLib.load('pdfexport'); const { jsPDF } = window.jspdf;
        
        if(typeof html2canvas === 'undefined') {
            Utils.toast('html2canvas non chargé', 'error');
            return;
        }
        const projectTitle = state.data.title || 'Projet sans titre';
        const cleanT = (t) => (typeof PdfTheme !== 'undefined' && PdfTheme.cleanText) ? PdfTheme.cleanText(t || '') : (t || '');
        
        // ===== 1. Créer un container HORS-ÉCRAN pour rendre les pages HTML =====
        const offscreen = document.createElement('div');
        offscreen.id = 'storyboardOffscreenPreview';
        offscreen.style.position = 'absolute';
        offscreen.style.left = '-99999px';
        offscreen.style.top = '0';
        offscreen.style.pointerEvents = 'none';
        offscreen.style.background = 'white';
        // Largeur cohérente avec le CSS de .sb-print-page (max-width: 210mm = 794px à 96dpi)
        offscreen.style.width = '794px';
        document.body.appendChild(offscreen);
        
        // ===== 2. Appeler renderPrintPreview qui sait déjà tout rendre =====
        // [Modal Export global] opts.imageOnly / opts.techLayer surchargent temporairement
        // printConfig le temps du rendu (sans opts, la config du panneau de l'onglet s'applique)
        const prevPrintConfig = Storyboard.printConfig;
        if(opts.imageOnly || opts.techLayer !== undefined || opts.layout !== undefined) {
            const pc = { ...prevPrintConfig };
            if(opts.techLayer !== undefined) pc.techLayer = opts.techLayer;
            if(opts.layout !== undefined) pc.layout = opts.layout;
            if(opts.imageOnly) {
                pc.imageOnly = true;
                pc.shotType = false;
                pc.cameraMove = false;
                pc.cameraMode = false;
                pc.description = false;
                pc.actorDirection = false;
                pc.techDirection = false;
            } else if(opts.layout !== undefined) {
                // Même règle que l'ancien modal dédié : mise en page "Compact" = infos minimales.
                const fullText = (opts.layout === 'standard' || opts.layout === 'large');
                pc.imageOnly = false;
                pc.shotNumber = true;
                pc.shotType = true;
                pc.cameraMove = true;
                pc.cameraMode = true;
                pc.description = fullText;
                pc.actorDirection = fullText;
                pc.techDirection = fullText;
                pc.sceneTitle = true;
            }
            Storyboard.printConfig = pc;
        }
        StoryboardExport._printCapturing = true;
        StoryboardExport._printImgPromises = [];
        StoryboardExport._imagesRatees = 0;
        StoryboardExport._exportSceneIds = (opts.sceneIds && opts.sceneIds.length) ? opts.sceneIds : null;
        try {
            Storyboard.renderPrintPreview('storyboardOffscreenPreview');
        } catch(e) {
            console.warn('[Storyboard PDF] Échec renderPrintPreview:', e);
            Storyboard.printConfig = prevPrintConfig;
            StoryboardExport._exportSceneIds = null;
            try { document.body.removeChild(offscreen); } catch(_) {}
            return;
        }
        Storyboard.printConfig = prevPrintConfig;
        StoryboardExport._exportSceneIds = null;
        
        // Laisser le temps au DOM de se mettre à jour ET aux images async
        await new Promise(r => setTimeout(r, 600));
        
        // Attendre toutes les images du container
        const allImgs = offscreen.querySelectorAll('img');
        await Promise.all(Array.from(allImgs).map(img => {
            if(img.complete && img.naturalWidth > 0) return Promise.resolve();
            return new Promise(resolve => {
                img.onload = () => resolve();
                img.onerror = () => resolve();
                setTimeout(() => resolve(), 5000);
            });
        }));
        // [2b] Attendre le dessin reel de toutes les images de print (calques, image
        // televersee, calque technique) avant la rasterisation : les canvas sont
        // peints via img.onload async, un delai fixe ne suffit pas — sans ca les
        // vignettes ressortent vides.
        // ON VIDE LA FILE, ON NE LA PHOTOGRAPHIE PAS (v601). Promise.all fige la
        // liste au moment de l'appel ; or un dessin a plusieurs CALQUES n'empile le
        // deuxieme qu'une fois le premier telecharge, donc APRES cette photo. Les
        // calques suivants n'etaient pas attendus, et une planche a deux calques
        // pouvait partir a moitie peinte. On recommence tant que la file grossit.
        try {
            for(let tour = 0; tour < 12; tour++) {
                const enCours = StoryboardExport._printImgPromises.slice();
                if(!enCours.length) break;
                await Promise.all(enCours);
                if(StoryboardExport._printImgPromises.length === enCours.length) break;
            }
        } catch(e) { console.warn('[Storyboard PDF] attente des images :', e); }
        StoryboardExport._printCapturing = false;
        // ON LE DIT. Une planche vide passait inapercue jusqu'a l'ouverture du
        // PDF ; mieux vaut l'annoncer au moment ou on peut encore recommencer.
        if(StoryboardExport._imagesRatees > 0) {
            Utils.toast(StoryboardExport._imagesRatees + ' image(s) du storyboard n\'ont pas pu être chargées — voir la console (F12).', 'warning', 9000);
        }
        // Laisser le temps aux objets vectoriels (setTimeout) de finir leur composition
        await new Promise(r => setTimeout(r, 500));
        
        // ===== 3. Récupérer toutes les pages générées =====
        const pages = offscreen.querySelectorAll('.sb-print-page');
        if(pages.length === 0) {
            if(!opts.returnBlob) Utils.toast('Aucune page à exporter', 'warning');
            try { document.body.removeChild(offscreen); } catch(_) {}
            return;
        }
        
        const A4 = { w: 210, h: 297 };
        let doc = null;
        
        // ===== 4. Rasteriser chaque page et l'ajouter au PDF =====
        try {
            for(let i = 0; i < pages.length; i++) {
                const pageEl = pages[i];
                const isLarge = pageEl.classList.contains('sb-print-page--large');
                const orientation = isLarge ? 'landscape' : 'portrait';
                const pageW = orientation === 'landscape' ? A4.h : A4.w;
                const pageH = orientation === 'landscape' ? A4.w : A4.h;
                
                // Rasteriser
                let dataUrl = null;
                try {
                    const rendered = await html2canvas(pageEl, {
                        scale: 1.5,
                        useCORS: true,
                        allowTaint: false,
                        backgroundColor: '#ffffff',
                        logging: false
                    });
                    dataUrl = rendered.toDataURL('image/jpeg', 0.85);
                } catch(err) {
                    console.warn('[Storyboard PDF] html2canvas fail page', i, err);
                    continue;
                }
                if(!dataUrl) continue;
                
                // Créer la page PDF
                if(!doc) {
                    doc = new jsPDF(orientation === 'landscape' ? 'l' : 'p', 'mm', 'a4');
                    if(opts.includeCover !== false && typeof PdfTheme !== 'undefined' && PdfTheme.coverPage) {
                        PdfTheme.coverPage(doc, { sectionName: 'Storyboard' });
                        doc.addPage(orientation === 'landscape' ? [A4.h, A4.w] : [A4.w, A4.h], orientation);
                    }
                } else {
                    doc.addPage(orientation === 'landscape' ? [A4.h, A4.w] : [A4.w, A4.h], orientation);
                }
                
                // Insérer l'image plein page (avec petite marge)
                // Zone réservée au footer unifié en bas = PdfTheme.FOOTER_ZONE_MM (14mm)
                const footerZone = (typeof PdfTheme !== 'undefined' && PdfTheme.FOOTER_ZONE_MM) ? PdfTheme.FOOTER_ZONE_MM : 14;
                const m = 5;
                const availW = pageW - m * 2;
                const availH = pageH - m - footerZone; // marge haute + zone footer
                const rect = pageEl.getBoundingClientRect();
                const ratio = rect.width / rect.height;
                let imgW = availW;
                let imgH = imgW / ratio;
                if(imgH > availH) {
                    imgH = availH;
                    imgW = imgH * ratio;
                }
                const imgX = (pageW - imgW) / 2;
                const imgY = m;
                
                try {
                    doc.addImage(dataUrl, 'JPEG', imgX, imgY, imgW, imgH);
                } catch(err) {
                    console.warn('[Storyboard PDF] addImage fail:', err);
                }
                
                // Footer ad-hoc supprimé : géré uniformément par PdfTheme.applyFooters en fin d'export
            }
        } finally {
            // ===== 5. Cleanup =====
            try { document.body.removeChild(offscreen); } catch(_) {}
        }
        
        if(!doc) {
            if(!opts.returnBlob) Utils.toast('Échec génération Storyboard PDF', 'error');
            return;
        }
        
        // ===== Footer unifié sur toutes les pages =====
        if(typeof PdfTheme !== 'undefined' && PdfTheme.applyFooters) {
            PdfTheme.applyFooters(doc, { 
                skipFirstPage: opts.includeCover !== false,
                forDossier: !!opts.returnBlob
            });
        }
        
        // ===== 6. Téléchargement / blob =====
        // Pour returnBlob (mode Dossier de Production), la rotation paysage est
        // déjà gérée par buildDossierProd phase 7quater. On renvoie sans rotation.
        if(opts.returnBlob) return doc.output('blob');
        
        // En export solo : tourner les pages paysage 270° pour cohérence avec le Dossier
        let outBlob = doc.output('blob');
        if(typeof PdfTheme !== 'undefined' && PdfTheme.rotateLandscapePages) {
            outBlob = await PdfTheme.rotateLandscapePages(outBlob);
        }
        const filename = (typeof PdfTheme !== 'undefined' && PdfTheme.filename)
            ? PdfTheme.filename('Storyboard')
            : `${cleanT(projectTitle) || 'Projet'} - Storyboard - moteur.studio.pdf`;
        const url = URL.createObjectURL(outBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        
        Utils.toast(`Storyboard exporté ! (${pages.length} page(s))`, 'success');
        if(typeof History !== 'undefined' && History.log) History.log('EXPORT', `Storyboard PDF généré (${pages.length} pages)`);
    }
};
