
const DrawingEditor = {
    // ===================== ÉTAT =====================
    currentShotId: null,
    currentKind: 'original',  // Phase 1 Storyboard : zone éditée ('original'|'lighting'|'camera'|'actors')
    moodboardCallback: null,
    canvas: null,
    ctx: null,
    layers: [],
    currentLayerIndex: 0,
    isDrawing: false,
    lastX: 0,
    lastY: 0,
    currentTool: 'pencil',
    currentColor: '#000000',
    brushSize: 10,
    opacity: 100,
    history: [],
    historyStep: -1,
    transparentBg: false,
    
    colors: ['#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF', '#FFA500', '#800080'],
    
    // Phase 4A : couleurs récemment utilisées (max 10, persistées dans localStorage)
    recentColors: [],
    eyedropperActive: false,
    
    // ===================== OUVERTURE, CANVAS & COULEURS =====================
    toggleTransparent: (checked) => {
        DrawingEditor.transparentBg = checked;
        DrawingEditor.redraw();
    },
    
    open: (shotId, moodboardCallback = null, kind = 'original') => {
        // 31 aout — MEME ANGLE MORT QUE LE MOOD BOARD : on dessine a la SOURIS,
        // rien ici ne se declare cliquable, le verrou visuel ne voit donc rien.
        // La garde est posee a la porte, et elle depend de l'appelant : un plan
        // du storyboard (shotId renseigne) releve de la section Storyboard, une
        // planche du mood board (shotId nul) de la section Mood Board.
        const peutDessiner = shotId
            ? (typeof Permissions === 'undefined' || !Permissions.canEditFiche || Permissions.canEditFiche('shot'))
            : (typeof MoodBoard === 'undefined' || !MoodBoard.canWrite || MoodBoard.canWrite());
        if(!peutDessiner) {
            Utils.toast("Vous n'avez pas les droits de modification sur " + (shotId ? 'le storyboard' : 'le mood board') + '.', 'error');
            return;
        }
        DrawingEditor.currentShotId = shotId;
        DrawingEditor.currentKind = kind;
        // v601 — ON PREND LE VERROU A LA PORTE, PAS AU CURSEUR. Ici on dessine
        // a la SOURIS sur une toile : le curseur de texte ne se pose nulle
        // part, donc le declencheur habituel ne verrait jamais rien. Ouvrir
        // l'editeur sur un plan EST l'intention de le modifier — c'est donc
        // l'ouverture qui prend le verrou, et la fermeture qui le rend.
        // Meme raisonnement a tenir le jour ou l'on fera le mood board.
        // ET SI QUELQU'UN Y EST, ON N'OUVRE PAS DU TOUT. L'editeur compte des
        // dizaines de boutons : les neutraliser un par un serait une usine a
        // gaz, et un seul oubli suffirait a effacer le dessin d'un autre. La
        // porte fermee est la seule garde qu'on peut tenir — le cadenas, lui,
        // se voit DEHORS, sur la vignette du plan.
        if(shotId) {
            try { if(typeof FicheLock !== 'undefined'
                     && FicheLock.ouvrir('shot', shotId, 'Ce plan') === false) return; } catch(e) {}
        }
        DrawingEditor.moodboardCallback = moodboardCallback;
        const modal = document.getElementById('drawing-modal');
        // v601 — LA FENETRE DE DESSIN DIT QUEL PLAN ELLE TIENT. C'est ce qui
        // permet de rendre le verrou quand elle se ferme sans avoir a brancher
        // la fermeture : la vignette du plan, elle, reste affichee derriere et
        // ne peut donc pas servir de preuve.
        if(shotId) modal.dataset.fiche = 'shot:' + shotId; else delete modal.dataset.fiche;
        modal.style.display = 'flex';
        
        DrawingEditor.canvas = document.getElementById('drawingCanvas');
        DrawingEditor.ctx = DrawingEditor.canvas.getContext('2d');
        
        // Phase 1 Storyboard : récupère le drawingData de la zone demandée
        // Compat backwards : si kind='original' et `drawings.original` absent, on retombe sur shot.drawingData
        const _getZoneDrawingData = (shot) => {
            if(!shot) return null;
            if(shot.drawings && shot.drawings[kind]) {
                return shot.drawings[kind].drawingData || null;
            }
            // Fallback compat : shot ancien sans `drawings`, on lit shot.drawingData uniquement pour 'original'
            if(kind === 'original') return shot.drawingData || null;
            return null;
        };
        
        // Load existing drawing or create new
        if(shotId) {
            const shot = state.data.shots.find(s => s.id === shotId);
            const zoneDrawingData = _getZoneDrawingData(shot);
            if(zoneDrawingData) {
                DrawingEditor.layers = JSON.parse(JSON.stringify(zoneDrawingData.layers));
                DrawingEditor.currentLayerIndex = zoneDrawingData.currentLayer || 0;
                // Restaurer les calques depuis les données sauvegardées
                DrawingEditor.layers.forEach(layer => {
                    if(layer.imageData) {
                        const canvas = document.createElement('canvas');
                        canvas.width = 800;
                        canvas.height = 600;
                        const ctx = canvas.getContext('2d');
                        const img = new Image();
                        // Si l'imageData est une URL HTTP (Storage), activer CORS pour éviter le canvas tainted
                        if(typeof layer.imageData === 'string' && layer.imageData.startsWith('http')) {
                            img.crossOrigin = 'anonymous';
                        }
                        img.onload = () => {
                            ctx.drawImage(img, 0, 0);
                            DrawingEditor.redraw();
                        };
                        img.onerror = () => {
                            console.warn('[DrawingEditor] Erreur chargement calque depuis Storage:', layer.imageData?.substring(0, 80));
                        };
                        img.src = Utils.signedUrlFor(layer.imageData);
                        layer.canvas = canvas;
                    } else {
                        layer.canvas = document.createElement('canvas');
                        layer.canvas.width = 800;
                        layer.canvas.height = 600;
                    }
                });
            } else {
                DrawingEditor.layers = [DrawingEditor.createNewLayer()];
                DrawingEditor.currentLayerIndex = 0;
            }
        } else {
            // Mode MoodBoard : nouveau dessin vierge
            DrawingEditor.layers = [DrawingEditor.createNewLayer()];
            DrawingEditor.currentLayerIndex = 0;
        }
        
        // Phase 1 Storyboard : préparer l'arrière-plan "original" pour les zones sémantiques
        DrawingEditor.originalBgImage = null;
        if(shotId && kind !== 'original') {
            const shot = state.data.shots.find(s => s.id === shotId);
            if(shot) {
                // 1) Image importée dans la zone original ?
                let originalUrl = null;
                if(shot.drawings && shot.drawings.original && shot.drawings.original.imageType === 'upload' && shot.drawings.original.imageUrl) {
                    originalUrl = shot.drawings.original.imageUrl;
                }
                // 2) Compat backwards : image importée à la racine du shot
                else if((!shot.drawings || !shot.drawings.original) && shot.imageType === 'upload' && shot.imageUrl) {
                    originalUrl = shot.imageUrl;
                }
                
                // 3) Sinon, dessin à composer depuis les calques + objets de l'original
                if(!originalUrl) {
                    let originalDrawingData = null;
                    if(shot.drawings && shot.drawings.original && shot.drawings.original.drawingData) {
                        originalDrawingData = shot.drawings.original.drawingData;
                    } else if(shot.drawingData) {
                        originalDrawingData = shot.drawingData;
                    }
                    // v595 : les images insérées en objet dans le dessin original doivent
                    // aussi apparaître en arrière-plan des zones lumière/caméra/acteurs —
                    // avant, seuls les calques pixel étaient composés, les objets
                    // restaient invisibles derrière.
                    const originalObjects = (shot.drawings && shot.drawings.original && Array.isArray(shot.drawings.original.objects))
                        ? shot.drawings.original.objects : [];
                    const originalLayers = (originalDrawingData && Array.isArray(originalDrawingData.layers)) ? originalDrawingData.layers : [];
                    
                    if(originalLayers.length > 0 || originalObjects.length > 0) {
                        // Composer les calques visibles + leurs objets, dans l'ordre, dans un canvas temporaire
                        const tmpCanvas = document.createElement('canvas');
                        tmpCanvas.width = DrawingEditor.canvas.width;
                        tmpCanvas.height = DrawingEditor.canvas.height;
                        const tmpCtx = tmpCanvas.getContext('2d');
                        const layersToCompose = originalLayers.filter(l => l.visible !== false);
                        const layerIds = new Set(originalLayers.map(l => l.id));
                        const orphanObjects = originalObjects.filter(o => !o.layerId || !layerIds.has(o.layerId));
                        
                        const loadImg = (src, cors) => new Promise(resolve => {
                            if(!src) { resolve(null); return; }
                            const im = new Image();
                            // [Phase C.2.6 fix] crossOrigin obligatoire pour pouvoir convertir le canvas en PDF
                            if(cors) im.crossOrigin = 'anonymous';
                            im.onload = () => resolve(im);
                            im.onerror = () => resolve(null);
                            im.src = Utils.signedUrlFor(src);
                        });
                        
                        Promise.all(layersToCompose.map(l => loadImg(l.imageData, typeof l.imageData === 'string' && l.imageData.startsWith('http')))).then(loadedImgs => {
                            // Calque par calque, dans l'ordre : les pixels du calque, puis
                            // ses objets — même logique que le rendu live (DrawingEditor.redraw)
                            layersToCompose.forEach((layer, i) => {
                                if(loadedImgs[i]) tmpCtx.drawImage(loadedImgs[i], 0, 0);
                                const layerObjects = originalObjects.filter(o => o.layerId === layer.id);
                                if(layerObjects.length > 0) Storyboard.renderObjectsOnCanvas(tmpCtx, layerObjects);
                            });
                            if(orphanObjects.length > 0) Storyboard.renderObjectsOnCanvas(tmpCtx, orphanObjects);
                            
                            const dataUrl = tmpCanvas.toDataURL();
                            const img = new Image();
                            img.onload = () => { DrawingEditor.redraw(); };
                            img.src = dataUrl;
                            DrawingEditor.originalBgImage = img;
                        });
                    }
                }
                
                // Si on a une URL directe (image importée), la charger
                if(originalUrl) {
                    const img = new Image();
                    // [Phase C.2.6 fix] crossOrigin obligatoire pour pouvoir convertir le canvas en PDF
                    if(typeof originalUrl === 'string' && originalUrl.startsWith('http')) img.crossOrigin = 'anonymous';
                    img.onload = () => { DrawingEditor.redraw(); };
                    img.src = Utils.signedUrlFor(originalUrl);
                    DrawingEditor.originalBgImage = img;
                }
            }
        }
        
        DrawingEditor.setupCanvas();
        DrawingEditor.renderColorPalette();
        DrawingEditor.renderLayers();
        
        // Phase 4A : charger les couleurs récentes depuis localStorage
        try {
            const stored = localStorage.getItem('moteur_drawing_recent_colors');
            if(stored) {
                const parsed = JSON.parse(stored);
                if(Array.isArray(parsed)) {
                    DrawingEditor.recentColors = parsed.filter(c => typeof c === 'string').slice(0, 10);
                }
            }
        } catch(_) { /* localStorage indisponible ou JSON invalide, silent */ }
        
        // Phase 4A : reset du mode pipette à chaque ouverture
        DrawingEditor.eyedropperActive = false;
        
        // Phase 4A : charger les couleurs récentes depuis localStorage
        try {
            const stored = localStorage.getItem('moteur_drawing_recent_colors');
            if(stored) {
                const parsed = JSON.parse(stored);
                if(Array.isArray(parsed)) {
                    DrawingEditor.recentColors = parsed.filter(c => typeof c === 'string').slice(0, 10);
                }
            }
        } catch(_) { /* localStorage indisponible ou JSON invalide, silent */ }
        
        // Phase 4A : reset du mode pipette à chaque ouverture
        DrawingEditor.eyedropperActive = false;
        
        // Phase 4A : re-render de la palette pour afficher les récentes chargées
        DrawingEditor.renderColorPalette();
        
        // Phase 3B Storyboard : afficher la palette d'objets pour les zones sémantiques
        const paletteGroup = document.getElementById('objectsPaletteGroup');
        const showPalette = ['lighting', 'camera', 'actors'].includes(kind);
        if(paletteGroup) {
            paletteGroup.style.display = showPalette ? 'block' : 'none';
            if(showPalette) {
                DrawingEditor.renderObjectsPalette();
            }
        }
        // Phase 4B v2 : bouton "Insérer image" dans sidebar gauche, visible UNIQUEMENT pour Original
        // (pour les zones sémantiques, le bouton est déjà dans la colonne droite)
        const leftInsertGroup = document.getElementById('leftSidebarInsertImage');
        if(leftInsertGroup) {
            leftInsertGroup.style.display = showPalette ? 'none' : 'block';
        }
        // Phase 3C v3 : reset de l'état "objet sélectionné" (mode transform)
        DrawingEditor.selectedObjectIdx = -1;
        DrawingEditor.transformingHandle = null;
        if(DrawingEditor.canvas) DrawingEditor.canvas.style.cursor = '';
        
        DrawingEditor.redraw();
        DrawingEditor.saveState();
    },
    
    close: async () => {
        const shotId = DrawingEditor.currentShotId;
        const callback = DrawingEditor.moodboardCallback;
        
        // Dessiner DEPUIS la fenêtre "Édition Plan" (elle a déjà son propre
        // Fermer/Sauvegarder) ne doit pas redemander une deuxième fois : le
        // dessin s'enregistre tout seul, silencieusement, en refermant son
        // éditeur — la seule vraie question "sauvegarder ?" reste celle de
        // la fenêtre du plan. Dessiner depuis la grille du Storyboard (sans
        // passer par cette fenêtre) garde la confirmation : c'est alors le
        // seul moment où l'on peut demander.
        const insideEditModal = !callback && shotId && Storyboard.currentEditingShotId === shotId;
        // v601 — ON REND LE VERROU DU PLAN EN QUITTANT L'EDITEUR (voir open),
        // MAIS PAS DANS DEUX CAS.
        //  1) La fenetre « Edition Plan » est restee ouverte DERRIERE sur le
        //     meme plan : c'est elle qui le tient maintenant, et lacher ici
        //     laisserait sans verrou quelqu'un encore en train d'y travailler.
        //  2) On dessinait pour le MOOD BOARD (callback) : la porte ouverte
        //     est celle de la PLANCHE, pas d'un plan. La rendre ici aurait
        //     deverrouille la planche sous les doigts de son auteur.
        if(shotId && !insideEditModal) {
            try { if(typeof FicheLock !== 'undefined') FicheLock.rendreLaPorte(); } catch(e) {}
        }
        const shouldSave = insideEditModal || await ConfirmModal.show({ title: 'Sauvegarder ?', message: 'Voulez-vous sauvegarder les modifications apportées à ce dessin ?', icon: '💾', confirmText: 'Sauvegarder' });
        
        if(shouldSave) {
            if(callback) {
                // Mode MoodBoard : retourner l'image via callback
                const dataUrl = DrawingEditor.getCompositeImage();
                callback(dataUrl);
            } else if(insideEditModal) {
                // v616 : depuis "Édition Plan", on n'appelle plus Store.save() ici.
                // On committe le dessin (calques uploadés, shot.drawings à jour)
                // et on laisse la fenêtre du plan faire l'UNIQUE sauvegarde réseau,
                // comme pour ses autres champs. Deux sauvegardes indépendantes coup
                // sur coup (celle du dessin, puis celle du plan) créaient une
                // fenêtre de course avec le rechargement temps réel — cause
                // probable du calque qui reparaissait tout seul (v615).
                await DrawingEditor._commitDrawingData();
                Storyboard.markAsDirty();
                if(Storyboard.currentEditingShotId === shotId) {
                    setTimeout(() => Storyboard.refreshEditModal(shotId), 100);
                }
            } else {
                // Mode Storyboard classique (dessin ouvert seul, hors fenêtre
                // Édition Plan) : personne d'autre ne sauvegardera à notre place.
                // IMPORTANT : on attend la fin réelle de save() (un upload réseau
                // par calque) avant d'effacer l'état de l'éditeur ci-dessous —
                // sinon une fermeture rapide, ou une connexion un peu lente,
                // pouvait couper la sauvegarde en plein vol et faire perdre les
                // calques qu'on venait d'éditer.
                await DrawingEditor.save();
            }
        }
        const _dm = document.getElementById('drawing-modal');
        if(_dm) { delete _dm.dataset.fiche; _dm.style.display = 'none'; }
        DrawingEditor.currentShotId = null;
        DrawingEditor.moodboardCallback = null;
        DrawingEditor.layers = [];
        DrawingEditor.history = [];
        DrawingEditor.historyStep = -1;
    },
    
    getCompositeImage: () => {
        // Créer un canvas composite avec tous les calques visibles
        const composite = document.createElement('canvas');
        composite.width = 800;
        composite.height = 600;
        const ctx = composite.getContext('2d');
        
        // Fond blanc seulement si pas transparent
        if(!DrawingEditor.transparentBg) {
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, composite.width, composite.height);
        }
        
        // Superposer les calques visibles
        DrawingEditor.layers.forEach(layer => {
            if(layer.visible) {
                ctx.drawImage(layer.canvas, 0, 0);
            }
        });
        
        return composite.toDataURL('image/png');
    },
    
    setupCanvas: () => {
        DrawingEditor.canvas.addEventListener('mousedown', DrawingEditor.startDrawing);
        DrawingEditor.canvas.addEventListener('mousemove', DrawingEditor.draw);
        DrawingEditor.canvas.addEventListener('mouseup', DrawingEditor.stopDrawing);
        DrawingEditor.canvas.addEventListener('mouseout', DrawingEditor.stopDrawing);
        // Phase 3C Storyboard : clic droit sur un objet = menu contextuel custom
        DrawingEditor.canvas.addEventListener('contextmenu', DrawingEditor.handleContextMenu);
        // Phase 3C v2 Storyboard : drag-and-drop depuis la palette vers le canvas
        DrawingEditor.canvas.addEventListener('dragover', DrawingEditor.handleCanvasDragOver);
        DrawingEditor.canvas.addEventListener('drop', DrawingEditor.handleCanvasDrop);
        
        // Touch support
        DrawingEditor.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const mouseEvent = new MouseEvent('mousedown', {
                clientX: touch.clientX,
                clientY: touch.clientY
            });
            DrawingEditor.canvas.dispatchEvent(mouseEvent);
        });
        
        DrawingEditor.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const mouseEvent = new MouseEvent('mousemove', {
                clientX: touch.clientX,
                clientY: touch.clientY
            });
            DrawingEditor.canvas.dispatchEvent(mouseEvent);
        });
        
        DrawingEditor.canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            const mouseEvent = new MouseEvent('mouseup', {});
            DrawingEditor.canvas.dispatchEvent(mouseEvent);
        });
    },
    
    createNewLayer: () => {
        const canvas = document.createElement('canvas');
        canvas.width = 800;
        canvas.height = 600;
        return {
            id: Utils.generateUniqueId(),
            canvas: canvas,
            visible: true,
            name: 'Calque ' + (DrawingEditor.layers.length + 1)
        };
    },
    
    renderColorPalette: () => {
        const container = document.getElementById('colorPalette');
        if(!container) return;
        container.innerHTML = '';
        
        // Couleurs prédéfinies (toujours présentes)
        DrawingEditor.colors.forEach(color => {
            const swatch = document.createElement('div');
            swatch.className = 'color-swatch' + (DrawingEditor.currentColor.toLowerCase() === color.toLowerCase() ? ' active' : '');
            swatch.style.background = color;
            swatch.title = color;
            swatch.onclick = () => DrawingEditor.selectColor(color);
            container.appendChild(swatch);
        });
        
        // Phase 4A : couleurs récemment utilisées
        const recentContainer = document.getElementById('recentColorsPalette');
        const recentLabel = document.getElementById('recentColorsLabel');
        if(recentContainer && recentLabel) {
            const recents = DrawingEditor.recentColors || [];
            if(recents.length > 0) {
                recentLabel.style.display = 'block';
                recentContainer.innerHTML = '';
                recents.forEach(color => {
                    const swatch = document.createElement('div');
                    swatch.className = 'color-swatch' + (DrawingEditor.currentColor.toLowerCase() === color.toLowerCase() ? ' active' : '');
                    swatch.style.background = color;
                    swatch.title = color;
                    swatch.onclick = () => DrawingEditor.selectColor(color);
                    recentContainer.appendChild(swatch);
                });
            } else {
                recentLabel.style.display = 'none';
                recentContainer.innerHTML = '';
            }
        }
        
        // Synchroniser le picker natif sur la couleur actuelle
        const picker = document.getElementById('customColorPicker');
        if(picker && /^#[0-9a-f]{6}$/i.test(DrawingEditor.currentColor)) {
            picker.value = DrawingEditor.currentColor;
        }
    },
    
    // Phase 4A : sélectionne une couleur et l'ajoute aux récentes (sauf si elle est dans les prédéfinies)
    selectColor: (color) => {
        if(!color) return;
        DrawingEditor.currentColor = color;
        
        // Ne pas mémoriser dans "récentes" si la couleur est déjà dans les prédéfinies
        const isPredefined = DrawingEditor.colors.some(c => c.toLowerCase() === color.toLowerCase());
        if(!isPredefined) {
            DrawingEditor.recentColors = DrawingEditor.recentColors || [];
            // Retirer si elle existe déjà (pour la remonter en tête)
            DrawingEditor.recentColors = DrawingEditor.recentColors.filter(c => c.toLowerCase() !== color.toLowerCase());
            // Ajouter en tête
            DrawingEditor.recentColors.unshift(color);
            // Limiter à 10
            if(DrawingEditor.recentColors.length > 10) {
                DrawingEditor.recentColors = DrawingEditor.recentColors.slice(0, 10);
            }
            // Persister
            try {
                localStorage.setItem('moteur_drawing_recent_colors', JSON.stringify(DrawingEditor.recentColors));
            } catch(_) { /* localStorage indisponible (mode privé), silent */ }
        }
        
        DrawingEditor.renderColorPalette();
    },
    
    // Phase 4A : appelée par l'input color natif
    pickCustomColor: (color) => {
        DrawingEditor.selectColor(color);
    },
    
    // Phase 4A : active/désactive le mode pipette
    toggleEyedropper: () => {
        DrawingEditor.eyedropperActive = !DrawingEditor.eyedropperActive;
        const btn = document.getElementById('eyedropperBtn');
        if(btn) {
            if(DrawingEditor.eyedropperActive) {
                btn.style.background = 'var(--primary)';
                btn.style.color = 'white';
            } else {
                btn.style.background = 'var(--panel-bg)';
                btn.style.color = '';
            }
        }
        if(DrawingEditor.canvas) {
            DrawingEditor.canvas.style.cursor = DrawingEditor.eyedropperActive ? 'crosshair' : '';
        }
        if(DrawingEditor.eyedropperActive) {
            Utils.toast('💧 Pipette active : cliquez sur le canvas pour récupérer une couleur', 'info', 2500);
        }
    },
    
    // Phase 4A : récupère la couleur du pixel cliqué et sort du mode pipette
    pickColorFromCanvas: (canvasX, canvasY) => {
        try {
            const x = Math.max(0, Math.min(DrawingEditor.canvas.width - 1, Math.round(canvasX)));
            const y = Math.max(0, Math.min(DrawingEditor.canvas.height - 1, Math.round(canvasY)));
            const pixel = DrawingEditor.ctx.getImageData(x, y, 1, 1).data;
            const r = pixel[0], g = pixel[1], b = pixel[2], a = pixel[3];
            // Si pixel transparent (canvas vide à cet endroit), prendre la couleur de fond perçue (blanc)
            if(a === 0) {
                Utils.toast('Pixel transparent — couleur blanche prise par défaut', 'info', 2000);
                DrawingEditor.selectColor('#FFFFFF');
            } else {
                // Convertir en hex
                const toHex = (n) => n.toString(16).padStart(2, '0').toUpperCase();
                const hex = '#' + toHex(r) + toHex(g) + toHex(b);
                DrawingEditor.selectColor(hex);
            }
        } catch(err) {
            console.error('Pipette : impossible de lire le pixel', err);
            Utils.toast('Pipette : erreur de lecture', 'error');
        }
        // Sortir du mode pipette
        DrawingEditor.eyedropperActive = false;
        const btn = document.getElementById('eyedropperBtn');
        if(btn) {
            btn.style.background = 'var(--panel-bg)';
            btn.style.color = '';
        }
        DrawingEditor.canvas.style.cursor = '';
    },
    
    // Phase 4B v2 : insérer une image comme nouveau calque pixel de fond
    // (uniquement appelé depuis la zone Original ; idéal comme base de planche pour dessiner par-dessus)
    // - Crée un nouveau calque (taille canvas) en bas de la pile (unshift)
    // - Y dessine l'image compressée centrée + ratio préservé (letterbox transparent autour)
    // - Le calque actif courant n'est PAS changé (on continue à dessiner dans son calque)
    // ===================== IMAGES & CALQUES =====================
    // Phase 4B v2 : ouvrir un sélecteur de fichier et insérer l'image comme objet déplaçable
    insertImageFromFile: () => {
        if(!DrawingEditor.currentShotId || !DrawingEditor.currentKind) {
            Utils.toast('Aucune zone active', 'error');
            return;
        }
        
        // Créer un input file invisible
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.style.display = 'none';
        
        input.onchange = async (e) => {
            const file = e.target.files && e.target.files[0];
            if(!file) return;
            
            // Limite de taille (5 Mo) pour éviter de surcharger Supabase
            if(file.size > 5 * 1024 * 1024) {
                Utils.toast('Image trop volumineuse (max 5 Mo)', 'error');
                return;
            }
            
            // Charger l'image pour récupérer ses dimensions natives
            const reader = new FileReader();
            reader.onload = async (ev) => {
                const dataUrl = ev.target.result;
                const img = new Image();
                img.onload = async () => {
                    // Compression locale pour avoir les bonnes dimensions canvas
                    const compressed = DrawingEditor._compressImage(img, 1280, 720, 0.8);
                    const before = Math.round(dataUrl.length / 1024);
                    const after = Math.round(compressed.dataUrl.length / 1024);
                    
                    // === Upload vers Storage (au lieu de garder le base64 en state.data) ===
                    Utils.toast('Envoi de l\'image...', 'info', 2000);
                    const blob = await (await fetch(compressed.dataUrl)).blob();
                    const blobAsFile = new File([blob], 'storyboard_obj.jpg', { type: blob.type || 'image/jpeg' });
                    const url = await Utils.uploadProjectFile(blobAsFile, {
                        category: 'storyboard',
                        entityId: DrawingEditor.currentShotId || 'shot',
                        kind: 'gallery',  // multiple par shot
                        maxDimension: 1280, quality: 0.8, maxKb: 500
                    });
                    if(!url) return; // erreur déjà signalée
                    
                    // _addImageObject va recevoir l'URL Storage à la place du base64
                    DrawingEditor._addImageObject(url, compressed.width, compressed.height);
                };
                img.onerror = () => {
                    Utils.toast('Erreur de chargement de l\'image', 'error');
                };
                img.src = dataUrl;
            };
            reader.onerror = () => {
                Utils.toast('Erreur de lecture du fichier', 'error');
            };
            reader.readAsDataURL(file);
        };
        
        document.body.appendChild(input);
        input.click();
        // Nettoyer l'input après usage
        setTimeout(() => { input.remove(); }, 1000);
    },
    
    // Phase 4B v2 : ajouter un objet image à la zone courante (helper privé)
    _addImageObject: (dataUrl, naturalWidth, naturalHeight) => {
        const shot = state.data.shots.find(s => s.id === DrawingEditor.currentShotId);
        if(!shot) return;
        
        // S'assurer que la zone existe avec sa structure complète
        if(!shot.drawings) {
            shot.drawings = { original: null, lighting: null, camera: null, actors: null };
        }
        if(!shot.drawings[DrawingEditor.currentKind]) {
            shot.drawings[DrawingEditor.currentKind] = {
                imageType: 'drawing',
                imageUrl: null,
                drawingData: null,
                objects: []
            };
        }
        if(!Array.isArray(shot.drawings[DrawingEditor.currentKind].objects)) {
            shot.drawings[DrawingEditor.currentKind].objects = [];
        }
        
        // Calculer un scale par défaut : l'image fait au max 50% de la largeur/hauteur du canvas
        const canvas = DrawingEditor.canvas;
        const maxWidth = canvas.width * 0.5;
        const maxHeight = canvas.height * 0.5;
        let scale = 1;
        if(naturalWidth > maxWidth) scale = Math.min(scale, maxWidth / naturalWidth);
        if(naturalHeight > maxHeight) scale = Math.min(scale, maxHeight / naturalHeight);
        
        // Position : centre du canvas
        const x = canvas.width / 2;
        const y = canvas.height / 2;
        
        shot.drawings[DrawingEditor.currentKind].objects.push({
            id: Utils.generateUniqueId(),
            type: 'image',
            imageData: dataUrl,
            x: Math.round(x),
            y: Math.round(y),
            scale: scale,
            rotation: 0,
            width: naturalWidth,
            height: naturalHeight,
            // v595 : l'objet appartient au calque actif, pour se dessiner à sa place
            // dans la pile (et non plus systématiquement par-dessus tous les calques)
            layerId: (DrawingEditor.layers[DrawingEditor.currentLayerIndex] || {}).id || null
        });
        
        if(Storyboard.markAsDirty) Storyboard.markAsDirty();
        if(DrawingEditor.currentKind !== 'original') {
            DrawingEditor.renderObjectsPalette();  // Met à jour la liste "Placés"
        }
        DrawingEditor.renderLayers();
        DrawingEditor.redraw();
        Utils.toast('Image insérée — clic droit pour la transformer', 'success', 2500);
    },
    
    // Phase 4B v2 : compresse une image via canvas pour limiter la taille en base64
    // - imgElement : HTMLImageElement déjà chargé (img.onload résolu)
    // - maxWidth/maxHeight : dimensions cibles maximales (le ratio est conservé)
    // - quality : qualité JPEG entre 0 et 1 (ex. 0.8)
    // Retourne { dataUrl, width, height }
    _compressImage: (imgElement, maxWidth, maxHeight, quality) => {
        const srcW = imgElement.naturalWidth || imgElement.width;
        const srcH = imgElement.naturalHeight || imgElement.height;
        
        // Calcul du ratio de redimensionnement (on ne fait que réduire, jamais agrandir)
        let ratio = 1;
        if(srcW > maxWidth) ratio = Math.min(ratio, maxWidth / srcW);
        if(srcH > maxHeight) ratio = Math.min(ratio, maxHeight / srcH);
        
        const targetW = Math.round(srcW * ratio);
        const targetH = Math.round(srcH * ratio);
        
        // Canvas hors-écran pour le redimensionnement
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        // Lissage de qualité pour le downscale
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(imgElement, 0, 0, targetW, targetH);
        
        // Export JPEG (pas de canal alpha, mais bien plus compact que PNG pour des photos)
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        
        return { dataUrl: dataUrl, width: targetW, height: targetH };
    },
    
    // Phase 4B v3 : déplacer un calque de fromIdx vers toIdx (réordonnancement par drag-and-drop)
    _reorderLayers: (fromIdx, toIdx) => {
        const layers = DrawingEditor.layers;
        if(fromIdx < 0 || fromIdx >= layers.length || toIdx < 0 || toIdx >= layers.length) return;
        if(fromIdx === toIdx) return;
        
        // Retirer l'élément déplacé et l'insérer à sa nouvelle position
        const moved = layers.splice(fromIdx, 1)[0];
        layers.splice(toIdx, 0, moved);
        
        // Si le calque déplacé était le calque actif, mettre à jour l'index actif
        if(DrawingEditor.currentLayerIndex === fromIdx) {
            DrawingEditor.currentLayerIndex = toIdx;
        } else if(fromIdx < DrawingEditor.currentLayerIndex && toIdx >= DrawingEditor.currentLayerIndex) {
            DrawingEditor.currentLayerIndex -= 1;
        } else if(fromIdx > DrawingEditor.currentLayerIndex && toIdx <= DrawingEditor.currentLayerIndex) {
            DrawingEditor.currentLayerIndex += 1;
        }
        
        DrawingEditor.renderLayers();
        DrawingEditor.redraw();
        DrawingEditor.saveState();
    },
    
    renderLayers: () => {
        const container = document.getElementById('layersList');
        container.innerHTML = '';
        
        // v595 : les objets vivent visuellement dans leur calque (voir redraw) —
        // la vignette doit donc les inclure, sinon une image insérée n'apparaît
        // jamais dans la miniature du calque où elle vit.
        const shotForThumbs = (DrawingEditor.currentShotId) ? state.data.shots.find(s => s.id === DrawingEditor.currentShotId) : null;
        const zoneForThumbs = (shotForThumbs && DrawingEditor.currentKind) ? (shotForThumbs.drawings && shotForThumbs.drawings[DrawingEditor.currentKind]) : null;
        const allObjectsForThumbs = (zoneForThumbs && Array.isArray(zoneForThumbs.objects)) ? zoneForThumbs.objects : [];
        
        DrawingEditor.layers.forEach((layer, idx) => {
            const item = document.createElement('div');
            item.className = 'layer-item' + (idx === DrawingEditor.currentLayerIndex ? ' active' : '');
            // Phase 4B v3 : drag-and-drop pour réordonner les calques
            item.draggable = true;
            item.dataset.layerIdx = idx;
            item.title = 'Glisser pour réordonner — haut de liste = arrière-plan, bas = premier plan';
            let thumbSrc = '';
            try {
                const tmp = document.createElement('canvas');
                tmp.width = layer.canvas.width;
                tmp.height = layer.canvas.height;
                const tctx = tmp.getContext('2d');
                tctx.drawImage(layer.canvas, 0, 0);
                const layerObjects = allObjectsForThumbs.filter(o => o.layerId === layer.id);
                if(layerObjects.length > 0) Storyboard.renderObjectsOnCanvas(tctx, layerObjects);
                thumbSrc = tmp.toDataURL();
            } catch(e) { thumbSrc = ''; }
            item.innerHTML = `
                <div class="layer-item-header">
                    <span style="cursor: grab; opacity: 0.5; padding: 0 4px;" title="Glisser">⋮⋮</span>
                    <span class="layer-visibility" onclick="app.DrawingEditor.toggleLayerVisibility(${idx})">${layer.visible ? '👁️' : '👁️‍🗨️'}</span>
                    <span class="flex-1">${Utils.escape(layer.name)}</span>
                    ${DrawingEditor.layers.length > 1 ? `<button onclick="app.DrawingEditor.deleteLayer(${idx})" style="background: none; border: none; color: var(--danger); cursor: pointer;">🗑️</button>` : ''}
                </div>
                ${thumbSrc ? `<img class="layer-thumb" src="${thumbSrc}" alt="">` : '<div class="layer-thumb"></div>'}
            `;
            item.onclick = (e) => {
                if(!e.target.closest('button') && !e.target.closest('.layer-visibility')) {
                    DrawingEditor.currentLayerIndex = idx;
                    // v595 : changer de calque désélectionne l'objet en cours
                    // (sinon on pouvait encore le déplacer/transformer depuis un autre calque)
                    DrawingEditor.selectedObjectIdx = -1;
                    DrawingEditor.renderLayers();
                    DrawingEditor.redraw();
                }
            };
            // Listeners drag-and-drop
            item.ondragstart = (e) => {
                e.dataTransfer.setData('text/plain', 'layer:' + idx);
                e.dataTransfer.effectAllowed = 'move';
                item.style.opacity = '0.5';
            };
            item.ondragend = () => { item.style.opacity = ''; };
            item.ondragover = (e) => {
                const data = e.dataTransfer.types.includes('text/plain');
                if(data) { e.preventDefault(); item.style.borderTop = '2px solid var(--primary)'; }
            };
            item.ondragleave = () => { item.style.borderTop = ''; };
            item.ondrop = (e) => {
                e.preventDefault();
                item.style.borderTop = '';
                const data = e.dataTransfer.getData('text/plain');
                if(!data || !data.startsWith('layer:')) return;
                const fromIdx = parseInt(data.substring(6));
                if(isNaN(fromIdx) || fromIdx === idx) return;
                DrawingEditor._reorderLayers(fromIdx, idx);
            };
            container.appendChild(item);
        });
    },
    
    // ===================== DESSIN =====================
    startDrawing: (e) => {
        // Phase 3C v3 Storyboard : ignorer le clic droit (géré par handleContextMenu pour les poignées)
        if(e.button && e.button !== 0) return;
        
        const rect = DrawingEditor.canvas.getBoundingClientRect();
        const x = Math.floor(e.clientX - rect.left);
        const y = Math.floor(e.clientY - rect.top);
        
        // Phase 4A : mode pipette actif → récupérer la couleur du pixel et sortir du mode
        if(DrawingEditor.eyedropperActive) {
            const scaleX = DrawingEditor.canvas.width / rect.width;
            const scaleY = DrawingEditor.canvas.height / rect.height;
            const canvasX = (e.clientX - rect.left) * scaleX;
            const canvasY = (e.clientY - rect.top) * scaleY;
            DrawingEditor.pickColorFromCanvas(canvasX, canvasY);
            return;  // Bloquer tout le reste (dessin, drag, etc.)
        }
        
        // Phase 3C v2 Storyboard : si on clique gauche sur un objet existant (toutes zones, original inclus pour les images)
        if(DrawingEditor.currentKind) {
            const scaleX = DrawingEditor.canvas.width / rect.width;
            const scaleY = DrawingEditor.canvas.height / rect.height;
            const canvasX = (e.clientX - rect.left) * scaleX;
            const canvasY = (e.clientY - rect.top) * scaleY;
            
            // Phase 3C v3 : si un objet est sélectionné, prioriser la détection des poignées
            if(typeof DrawingEditor.selectedObjectIdx === 'number' && DrawingEditor.selectedObjectIdx >= 0) {
                const handle = DrawingEditor.findHandleAt(canvasX, canvasY);
                if(handle === 'delete') {
                    DrawingEditor.removePlacedObject(DrawingEditor.selectedObjectIdx);
                    return;  // Bloquer le dessin et le drag
                }
                if(handle) {
                    const shot = state.data.shots.find(s => s.id === DrawingEditor.currentShotId);
                    const obj = shot && shot.drawings[DrawingEditor.currentKind].objects[DrawingEditor.selectedObjectIdx];
                    if(obj) {
                        DrawingEditor.transformingHandle = handle;
                        DrawingEditor.transformStartX = canvasX;
                        DrawingEditor.transformStartY = canvasY;
                        DrawingEditor.transformInitialScale = obj.scale || 1;
                        DrawingEditor.transformInitialRotation = obj.rotation || 0;
                        DrawingEditor.transformObjectCx = obj.x;
                        DrawingEditor.transformObjectCy = obj.y;
                        DrawingEditor.canvas.style.cursor = (handle === 'rotate') ? 'grab' : 'nwse-resize';
                        return;  // Bloquer le dessin et le drag
                    }
                }
            }
            
            // Sinon, drag d'objet pour déplacer
            const objIdx = DrawingEditor.findObjectAt(canvasX, canvasY);
            if(objIdx >= 0) {
                DrawingEditor.draggingObjectIdx = objIdx;
                DrawingEditor.draggingStartX = canvasX;
                DrawingEditor.draggingStartY = canvasY;
                const shot = state.data.shots.find(s => s.id === DrawingEditor.currentShotId);
                const obj = shot.drawings[DrawingEditor.currentKind].objects[objIdx];
                DrawingEditor.draggingObjectInitialX = obj.x;
                DrawingEditor.draggingObjectInitialY = obj.y;
                DrawingEditor.canvas.style.cursor = 'grabbing';
                return;  // Bloquer le dessin
            }
        }
        
        DrawingEditor.isDrawing = true;
        DrawingEditor.lastX = x;
        DrawingEditor.lastY = y;
    },
    
    draw: (e) => {
        // Phase 3C v3 Storyboard : drag d'une poignée (transform : resize ou rotate)
        if(DrawingEditor.transformingHandle) {
            const rect = DrawingEditor.canvas.getBoundingClientRect();
            const scaleX = DrawingEditor.canvas.width / rect.width;
            const scaleY = DrawingEditor.canvas.height / rect.height;
            const canvasX = (e.clientX - rect.left) * scaleX;
            const canvasY = (e.clientY - rect.top) * scaleY;
            
            const shot = state.data.shots.find(s => s.id === DrawingEditor.currentShotId);
            const zone = shot && shot.drawings && shot.drawings[DrawingEditor.currentKind];
            const obj = zone && zone.objects && zone.objects[DrawingEditor.selectedObjectIdx];
            if(obj) {
                const cx = DrawingEditor.transformObjectCx;
                const cy = DrawingEditor.transformObjectCy;
                
                if(DrawingEditor.transformingHandle === 'rotate') {
                    // Angle entre le centre et la souris (en degrés, 0° = haut)
                    const dx = canvasX - cx;
                    const dy = canvasY - cy;
                    const angleDeg = Math.atan2(dy, dx) * 180 / Math.PI + 90;
                    obj.rotation = Math.round(angleDeg);
                } else {
                    // Resize : ratio de distance entre la souris et le centre vs. distance initiale
                    const initDx = DrawingEditor.transformStartX - cx;
                    const initDy = DrawingEditor.transformStartY - cy;
                    const initDist = Math.sqrt(initDx * initDx + initDy * initDy);
                    const curDx = canvasX - cx;
                    const curDy = canvasY - cy;
                    const curDist = Math.sqrt(curDx * curDx + curDy * curDy);
                    if(initDist > 1) {
                        const ratio = curDist / initDist;
                        const newScale = DrawingEditor.transformInitialScale * ratio;
                        obj.scale = Math.max(0.25, Math.min(5, newScale));
                    }
                }
                DrawingEditor.redraw();
            }
            return;  // Bloquer dessin et drag
        }
        
        // Phase 3C v2 Storyboard : drag d'un objet posé (déplacement)
        if(typeof DrawingEditor.draggingObjectIdx === 'number' && DrawingEditor.draggingObjectIdx >= 0) {
            const rect = DrawingEditor.canvas.getBoundingClientRect();
            const scaleX = DrawingEditor.canvas.width / rect.width;
            const scaleY = DrawingEditor.canvas.height / rect.height;
            const canvasX = (e.clientX - rect.left) * scaleX;
            const canvasY = (e.clientY - rect.top) * scaleY;
            const dx = canvasX - DrawingEditor.draggingStartX;
            const dy = canvasY - DrawingEditor.draggingStartY;
            
            const shot = state.data.shots.find(s => s.id === DrawingEditor.currentShotId);
            const zone = shot && shot.drawings && shot.drawings[DrawingEditor.currentKind];
            if(zone && Array.isArray(zone.objects)) {
                const obj = zone.objects[DrawingEditor.draggingObjectIdx];
                if(obj) {
                    obj.x = Math.round(DrawingEditor.draggingObjectInitialX + dx);
                    obj.y = Math.round(DrawingEditor.draggingObjectInitialY + dy);
                    DrawingEditor.redraw();
                }
            }
            return;  // Bloquer le dessin pendant le drag
        }
        
        if(!DrawingEditor.isDrawing) return;
        
        const rect = DrawingEditor.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const layer = DrawingEditor.layers[DrawingEditor.currentLayerIndex];
        const ctx = layer.canvas.getContext('2d');
        const tool = DrawingEditor.currentTool;
        
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        // Configuration selon l'outil
        if(tool === 'eraser') {
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = DrawingEditor.brushSize;
            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'destination-out';
        } else if(tool === 'pencil') {
            ctx.strokeStyle = DrawingEditor.currentColor;
            ctx.lineWidth = Math.max(1, DrawingEditor.brushSize * 0.5);
            ctx.globalAlpha = (DrawingEditor.opacity / 100) * 0.8;
            ctx.globalCompositeOperation = 'source-over';
        } else if(tool === 'pen') {
            ctx.strokeStyle = DrawingEditor.currentColor;
            ctx.lineWidth = Math.max(1, DrawingEditor.brushSize * 0.7);
            ctx.globalAlpha = DrawingEditor.opacity / 100;
            ctx.globalCompositeOperation = 'source-over';
        } else if(tool === 'marker') {
            ctx.strokeStyle = DrawingEditor.currentColor;
            ctx.lineWidth = DrawingEditor.brushSize;
            ctx.globalAlpha = DrawingEditor.opacity / 100;
            ctx.globalCompositeOperation = 'source-over';
        } else if(tool === 'highlighter') {
            ctx.strokeStyle = DrawingEditor.currentColor;
            ctx.lineWidth = DrawingEditor.brushSize * 2;
            ctx.globalAlpha = 0.3;
            ctx.globalCompositeOperation = 'multiply';
            ctx.lineCap = 'square';
        } else if(tool === 'brush') {
            ctx.strokeStyle = DrawingEditor.currentColor;
            const speed = Math.sqrt(Math.pow(x - DrawingEditor.lastX, 2) + Math.pow(y - DrawingEditor.lastY, 2));
            ctx.lineWidth = Math.max(1, DrawingEditor.brushSize * (1 + speed * 0.02));
            ctx.globalAlpha = DrawingEditor.opacity / 100;
            ctx.globalCompositeOperation = 'source-over';
        } else if(tool === 'airbrush') {
            ctx.globalAlpha = 0.1;
            ctx.globalCompositeOperation = 'source-over';
            ctx.fillStyle = DrawingEditor.currentColor;
            for(let i = 0; i < 20; i++) {
                const offsetX = (Math.random() - 0.5) * DrawingEditor.brushSize * 2;
                const offsetY = (Math.random() - 0.5) * DrawingEditor.brushSize * 2;
                ctx.beginPath();
                ctx.arc(x + offsetX, y + offsetY, Math.random() * 2, 0, Math.PI * 2);
                ctx.fill();
            }
            DrawingEditor.lastX = x;
            DrawingEditor.lastY = y;
            DrawingEditor.redraw();
            return;
        }
        
        ctx.beginPath();
        ctx.moveTo(DrawingEditor.lastX, DrawingEditor.lastY);
        ctx.lineTo(x, y);
        ctx.stroke();
        
        // Reset composite operation
        ctx.globalCompositeOperation = 'source-over';
        
        DrawingEditor.lastX = x;
        DrawingEditor.lastY = y;
        
        DrawingEditor.redraw();
    },
    
    stopDrawing: () => {
        // Phase 3C v3 Storyboard : terminer une transformation (resize/rotate via poignée)
        if(DrawingEditor.transformingHandle) {
            DrawingEditor.transformingHandle = null;
            DrawingEditor.transformStartX = 0;
            DrawingEditor.transformStartY = 0;
            DrawingEditor.transformInitialScale = 1;
            DrawingEditor.transformInitialRotation = 0;
            DrawingEditor.transformObjectCx = 0;
            DrawingEditor.transformObjectCy = 0;
            DrawingEditor.canvas.style.cursor = '';
            if(Storyboard.markAsDirty) Storyboard.markAsDirty();
            DrawingEditor.renderLayers();
            DrawingEditor.redraw();
            return;
        }
        
        // Phase 3C v2 Storyboard : terminer un drag d'objet posé
        if(typeof DrawingEditor.draggingObjectIdx === 'number' && DrawingEditor.draggingObjectIdx >= 0) {
            DrawingEditor.draggingObjectIdx = -1;
            DrawingEditor.draggingStartX = 0;
            DrawingEditor.draggingStartY = 0;
            DrawingEditor.draggingObjectInitialX = 0;
            DrawingEditor.draggingObjectInitialY = 0;
            DrawingEditor.canvas.style.cursor = '';
            if(Storyboard.markAsDirty) Storyboard.markAsDirty();
            DrawingEditor.renderObjectsPalette();
            DrawingEditor.renderLayers();
            DrawingEditor.redraw();
            return;
        }
        
        if(DrawingEditor.isDrawing) {
            DrawingEditor.isDrawing = false;
            DrawingEditor.saveState();
        }
    },
	
	redraw: () => {
        // Clear main canvas
        DrawingEditor.ctx.clearRect(0, 0, DrawingEditor.canvas.width, DrawingEditor.canvas.height);
        
        // Phase 1 Storyboard : si on édite une zone sémantique, afficher l'original en arrière-plan (lecture seule)
        if(DrawingEditor.currentKind && DrawingEditor.currentKind !== 'original' 
           && DrawingEditor.originalBgImage && DrawingEditor.originalBgImage.complete && DrawingEditor.originalBgImage.naturalWidth > 0) {
            DrawingEditor.ctx.save();
            DrawingEditor.ctx.globalAlpha = 0.4; // arrière-plan estompé pour distinguer du calque actif
            DrawingEditor.ctx.drawImage(DrawingEditor.originalBgImage, 0, 0, DrawingEditor.canvas.width, DrawingEditor.canvas.height);
            DrawingEditor.ctx.restore();
        }
        
        // v595 : les objets (images insérées, annotations) appartiennent désormais
        // à un calque (layerId) et se dessinent intercalés avec les calques pixel,
        // dans leur ordre — plus systématiquement par-dessus tout. Un objet sans
        // calque correspondant (ancien projet, calque supprimé depuis) se dessine
        // en dernier, par-dessus, comme avant.
        const shotForObjects = (DrawingEditor.currentShotId) ? state.data.shots.find(s => s.id === DrawingEditor.currentShotId) : null;
        const zoneForObjects = (shotForObjects && DrawingEditor.currentKind) ? (shotForObjects.drawings && shotForObjects.drawings[DrawingEditor.currentKind]) : null;
        const allObjects = (zoneForObjects && Array.isArray(zoneForObjects.objects)) ? zoneForObjects.objects : [];
        const layerIds = new Set(DrawingEditor.layers.map(l => l.id));
        const orphanObjects = allObjects.filter(o => !o.layerId || !layerIds.has(o.layerId));
        
        DrawingEditor.layers.forEach(layer => {
            if(!layer.visible) return;
            DrawingEditor.ctx.drawImage(layer.canvas, 0, 0);
            const layerObjects = allObjects.filter(o => o.layerId === layer.id);
            if(layerObjects.length > 0) Storyboard.renderObjectsOnCanvas(DrawingEditor.ctx, layerObjects);
        });
        
        if(orphanObjects.length > 0) Storyboard.renderObjectsOnCanvas(DrawingEditor.ctx, orphanObjects);
        
        // Phase 3C v3 Storyboard : poignées de sélection (mode transform via clic droit)
        DrawingEditor.drawSelectionHandles();
    },
    
    // Phase 3B Storyboard : remplit la palette d'objets selon le kind courant
    // Affiche les objets de la catégorie correspondante + ceux de la catégorie 'machinery' (commune)
    // ===================== OBJETS PLACÉS & INTERACTIONS =====================
    renderObjectsPalette: () => {
        const palette = document.getElementById('objectsPalette');
        const placedList = document.getElementById('objectsPlacedList');
        if(!palette) return;
        
        const kind = DrawingEditor.currentKind;
        const catalog = (CONFIG.annotationObjects || []);
        // Phase 4B v2 : filtre par catégorie selon le kind
        // - tools : visible sur Lumière et Caméra (pas Acteurs : pied/sandbag/etc. concernent surtout l'équipe technique)
        // - machinery : visible uniquement avec la caméra (mouvements caméra)
        // - lighting/camera/actors : leur propre catégorie
        const items = catalog.filter(o => {
            if(o.category === kind) return true;
            if(o.category === 'tools' && kind !== 'actors') return true;  // Outils sur Lumière + Caméra uniquement
            if(o.category === 'machinery' && kind === 'camera') return true;  // Machinerie uniquement sur caméra
            return false;
        });
        
        // Phase 4B v2 : grouper les items par catégorie pour pouvoir insérer des séparateurs visuels
        const categoryLabels = {
            lighting: '💡 Lumière',
            camera: '🎥 Caméra',
            actors: '🎭 Acteurs',
            tools: '🔧 Outils',
            machinery: '🛞 Machinerie'
        };
        // Ordre d'affichage : catégorie principale d'abord (= kind), puis tools, puis machinery
        const categoryOrder = [kind, 'tools', 'machinery'];
        // Grouper les items par catégorie en respectant l'ordre
        const groups = {};
        items.forEach(o => {
            if(!groups[o.category]) groups[o.category] = [];
            groups[o.category].push(o);
        });
        
        // Helper pour rendre un bouton drag (SVG inline)
        const renderButton = (o) => {
            const isMachinery = o.category === 'machinery';
            const isTools = o.category === 'tools';
            const borderColor = isMachinery ? 'var(--text-sec)' : (isTools ? 'var(--text-sec)' : 'var(--primary)');
            const visual = o.svg
                ? `<div style="width: 28px; height: 28px; color: var(--text-main); pointer-events: none;">${o.svg}</div>`
                : `<span style="font-size: 1.3rem; pointer-events: none;">${o.emoji}</span>`;
            return `<div 
                draggable="true"
                ondragstart="app.DrawingEditor.handlePaletteDragStart(event, '${o.type}')"
                title="Glissez sur le canvas — ${Utils.escape(o.label)}"
                data-obj-type="${o.type}"
                style="width: 38px; height: 38px; padding: 4px; border: 1.5px solid ${borderColor}; background: var(--panel-bg); border-radius: 6px; cursor: grab; line-height: 1; display: flex; align-items: center; justify-content: center; user-select: none;">
                ${visual}
            </div>`;
        };
        
        // Phase 4B v2 : rendre chaque catégorie comme un sous-groupe avec son label + séparateur
        const groupsHtml = categoryOrder
            .filter(cat => groups[cat] && groups[cat].length > 0)
            .map((cat, idx) => {
                const buttons = groups[cat].map(renderButton).join('');
                const separator = idx > 0 
                    ? `<div style="height: 1px; background: var(--border); margin: 8px 0 6px; opacity: 0.6;"></div>` 
                    : '';
                const label = `<div style="font-size: 0.7rem; text-transform: uppercase; opacity: 0.6; margin-bottom: 5px; letter-spacing: 0.5px;">${categoryLabels[cat] || cat}</div>`;
                return `${separator}${label}<div style="display: flex; flex-wrap: wrap; gap: 4px;">${buttons}</div>`;
            })
            .join('');
        palette.innerHTML = groupsHtml;
        
        // Mettre à jour le hint affiché au-dessus de la palette
        const hint = document.getElementById('objectsPaletteHint');
        if(hint) hint.textContent = 'Glissez un objet sur le canvas pour le placer.';
        
        // Phase 4B : rendre la liste des objets déjà placés avec mini SVG
        if(placedList) {
            const shot = state.data.shots.find(s => s.id === DrawingEditor.currentShotId);
            const zone = shot && shot.drawings && shot.drawings[kind];
            const objects = (zone && Array.isArray(zone.objects)) ? zone.objects : [];
            
            if(objects.length === 0) {
                placedList.innerHTML = `<div style="font-size: 0.75rem; color: var(--text-sec); font-style: italic;">Aucun objet placé</div>`;
            } else {
                // Phase 4B v3 : drag-and-drop pour réordonner les objets
                // (haut de liste = arrière-plan, bas de liste = premier plan, comme les calques)
                placedList.innerHTML = `
                    <div style="font-size: 0.8rem; font-weight: 600; margin-bottom: 6px;">Placés (${objects.length})</div>
                    <div style="font-size: 0.7rem; color: var(--text-sec); margin-bottom: 6px; font-style: italic;">Glisser pour réordonner</div>
                    ${objects.map((obj, idx) => {
                        // Phase 4B v2 : 3 cas pour la miniature et le label
                        let visual, label;
                        if(obj.type === 'image') {
                            visual = `<img src="${obj.imageData}" style="width: 16px; height: 16px; object-fit: cover; border-radius: 2px; flex-shrink: 0;" alt="">`;
                            label = 'Image';
                        } else {
                            const def = catalog.find(d => d.type === obj.type);
                            label = def ? def.label : obj.type;
                            visual = (def && def.svg)
                                ? `<div style="width: 16px; height: 16px; color: var(--text-main); flex-shrink: 0;">${def.svg}</div>`
                                : `<span style="font-size: 1rem; flex-shrink: 0;">${def ? def.emoji : '❓'}</span>`;
                        }
                        return `<div 
                            draggable="true"
                            data-placed-idx="${idx}"
                            ondragstart="app.DrawingEditor.onPlacedDragStart(event, ${idx})"
                            ondragend="app.DrawingEditor.onPlacedDragEnd(event)"
                            ondragover="app.DrawingEditor.onPlacedDragOver(event)"
                            ondragleave="app.DrawingEditor.onPlacedDragLeave(event)"
                            ondrop="app.DrawingEditor.onPlacedDrop(event, ${idx})"
                            style="display: flex; align-items: center; gap: 6px; padding: 4px 6px; background: var(--bg); border-radius: 4px; margin-bottom: 3px; font-size: 0.78rem; cursor: grab;">
                            <span style="opacity: 0.4; font-size: 0.7rem;">⋮⋮</span>
                            ${visual}
                            <span style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${Utils.escape(label)}">${Utils.escape(label)}</span>
                            <button onclick="event.stopPropagation(); app.DrawingEditor.removePlacedObject(${idx})" 
                                title="Supprimer cet objet" 
                                style="background: var(--danger); color: white; border: none; border-radius: 3px; padding: 2px 5px; cursor: pointer; font-size: 0.7rem;">🗑️</button>
                        </div>`;
                    }).join('')}
                `;
            }
        }
    },
    
    // Phase 3C Storyboard : dessine les poignées de sélection (8 carrés + flèche rotation) autour de l'objet sélectionné
    // Phase 3C Storyboard : retourne quelle poignée est sous le point (canvasX, canvasY) pour l'objet sélectionné
    // Renvoie : 'rotate' | 'nw' | 'n' | 'ne' | 'w' | 'e' | 'sw' | 's' | 'se' | null
    findHandleAt: (canvasX, canvasY) => {
        const idx = DrawingEditor.selectedObjectIdx;
        if(typeof idx !== 'number' || idx < 0) return null;
        if(!DrawingEditor.currentKind) return null;
        
        const shot = state.data.shots.find(s => s.id === DrawingEditor.currentShotId);
        if(!shot) return null;
        const zone = shot.drawings && shot.drawings[DrawingEditor.currentKind];
        if(!zone || !Array.isArray(zone.objects)) return null;
        const obj = zone.objects[idx];
        if(!obj) return null;
        
        // Phase 4B v2 : dimensions variables selon le type d'objet
        const scale = obj.scale || 1;
        let halfW, halfH;
        if(obj.type === 'image') {
            halfW = ((obj.width || 100) * scale) / 2 + 6;
            halfH = ((obj.height || 100) * scale) / 2 + 6;
        } else {
            halfW = (48 * scale) / 2 + 6;
            halfH = halfW;
        }
        const cx = obj.x || 0;
        const cy = obj.y || 0;
        
        // Convertir le point cliqué en coordonnées locales (rotation inverse appliquée)
        const dx = canvasX - cx;
        const dy = canvasY - cy;
        const angle = -((obj.rotation || 0) * Math.PI / 180);
        const localX = dx * Math.cos(angle) - dy * Math.sin(angle);
        const localY = dx * Math.sin(angle) + dy * Math.cos(angle);
        
        // Hit-test poignée rotation (cercle au-dessus du cadre, basé sur la moitié supérieure)
        const rotHandleY = -halfH - 22;
        const rotDist = Math.sqrt(localX * localX + (localY - rotHandleY) * (localY - rotHandleY));
        if(rotDist <= 10) return 'rotate';
        
        // Poignée suppression : petite croix rouge, juste en dehors du coin haut-droit du cadre
        const delHandleX = halfW + 14;
        const delHandleY = -halfH - 14;
        const delDist = Math.sqrt((localX - delHandleX) * (localX - delHandleX) + (localY - delHandleY) * (localY - delHandleY));
        if(delDist <= 10) return 'delete';
        
        // Hit-test des 8 poignées de redimensionnement
        const tol = 8;
        const handles = [
            { name: 'nw', x: -halfW, y: -halfH },
            { name: 'n',  x: 0,      y: -halfH },
            { name: 'ne', x: halfW,  y: -halfH },
            { name: 'w',  x: -halfW, y: 0 },
            { name: 'e',  x: halfW,  y: 0 },
            { name: 'sw', x: -halfW, y: halfH },
            { name: 's',  x: 0,      y: halfH },
            { name: 'se', x: halfW,  y: halfH }
        ];
        for(const h of handles) {
            if(Math.abs(localX - h.x) <= tol && Math.abs(localY - h.y) <= tol) {
                return h.name;
            }
        }
        
        return null;
    },
    
    drawSelectionHandles: () => {
        const idx = DrawingEditor.selectedObjectIdx;
        if(typeof idx !== 'number' || idx < 0) return;
        if(!DrawingEditor.currentKind) return;
        
        const shot = state.data.shots.find(s => s.id === DrawingEditor.currentShotId);
        if(!shot) return;
        const zone = shot.drawings && shot.drawings[DrawingEditor.currentKind];
        if(!zone || !Array.isArray(zone.objects)) return;
        const obj = zone.objects[idx];
        if(!obj) return;
        
        const ctx = DrawingEditor.ctx;
        // Phase 4B v2 : dimensions variables selon le type d'objet
        const scale = obj.scale || 1;
        let halfW, halfH;
        if(obj.type === 'image') {
            halfW = ((obj.width || 100) * scale) / 2 + 6;
            halfH = ((obj.height || 100) * scale) / 2 + 6;
        } else {
            halfW = (48 * scale) / 2 + 6;
            halfH = halfW;
        }
        const x = obj.x || 0;
        const y = obj.y || 0;
        
        ctx.save();
        ctx.translate(x, y);
        if(obj.rotation) ctx.rotate((obj.rotation || 0) * Math.PI / 180);
        
        // Cadre de sélection (rectangle pointillé bleu)
        ctx.strokeStyle = '#2b6ef6';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 3]);
        ctx.strokeRect(-halfW, -halfH, halfW * 2, halfH * 2);
        ctx.setLineDash([]);
        
        // Les 8 poignées de redimensionnement (4 coins + 4 milieux)
        const handleSize = 8;
        const positions = [
            [-halfW, -halfH], [0, -halfH], [halfW, -halfH],
            [-halfW, 0],                    [halfW, 0],
            [-halfW, halfH],  [0, halfH],  [halfW, halfH]
        ];
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = '#2b6ef6';
        ctx.lineWidth = 1.5;
        positions.forEach(([px, py]) => {
            ctx.fillRect(px - handleSize/2, py - handleSize/2, handleSize, handleSize);
            ctx.strokeRect(px - handleSize/2, py - handleSize/2, handleSize, handleSize);
        });
        
        // Flèche de rotation au-dessus du cadre
        const rotHandleY = -halfH - 22;
        // Ligne de connexion entre cadre et flèche rotation
        ctx.beginPath();
        ctx.moveTo(0, -halfH);
        ctx.lineTo(0, rotHandleY + 6);
        ctx.strokeStyle = '#2b6ef6';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        // Cercle de la poignée rotation
        ctx.beginPath();
        ctx.arc(0, rotHandleY, 8, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.stroke();
        // Symbole rotation dans le cercle
        ctx.fillStyle = '#2b6ef6';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('↻', 0, rotHandleY + 1);
        
        // Croix rouge de suppression, juste en dehors du coin haut-droit
        const delHandleX = halfW + 14;
        const delHandleY = -halfH - 14;
        ctx.beginPath();
        ctx.arc(delHandleX, delHandleY, 8, 0, Math.PI * 2);
        ctx.fillStyle = '#e53935';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('✕', delHandleX, delHandleY + 1);
        
        ctx.restore();
    },
    
    // Phase 3B Storyboard : supprime un objet placé (par son index dans le tableau)
    removePlacedObject: (idx) => {
        const shot = state.data.shots.find(s => s.id === DrawingEditor.currentShotId);
        if(!shot) return;
        const zone = shot.drawings && shot.drawings[DrawingEditor.currentKind];
        if(!zone || !Array.isArray(zone.objects)) return;
        if(idx < 0 || idx >= zone.objects.length) return;
        zone.objects.splice(idx, 1);
        // Si l'objet supprimé était sélectionné (mode transform), nettoyer la sélection
        if(DrawingEditor.selectedObjectIdx === idx) {
            DrawingEditor.selectedObjectIdx = -1;
        } else if(DrawingEditor.selectedObjectIdx > idx) {
            // Décaler l'index sélectionné si on a supprimé un élément avant lui
            DrawingEditor.selectedObjectIdx -= 1;
        }
        DrawingEditor.renderObjectsPalette();
        DrawingEditor.renderLayers();
        DrawingEditor.redraw();
    },
    
    // Phase 4B v2 : suppression d'un objet via la touche Suppr/Delete/Backspace
    handleKeyDown: (e) => {
        // Ignorer si la modale d'édition de dessin n'est pas visible (le DrawingEditor n'est pas actif)
        const modal = document.getElementById('drawing-modal');
        if(!modal || modal.style.display === 'none') return;
        
        // Ignorer si l'utilisateur tape dans un input/textarea/contenteditable
        const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
        if(tag === 'input' || tag === 'textarea' || tag === 'select' 
           || (e.target && e.target.isContentEditable)) return;
        
        // Touches gérées : Delete (Suppr) et Backspace
        if(e.key !== 'Delete' && e.key !== 'Backspace') return;
        
        // Ne supprimer que si un objet est sélectionné en mode transform
        const idx = DrawingEditor.selectedObjectIdx;
        if(typeof idx !== 'number' || idx < 0) return;
        
        // Vérifier qu'on a bien une zone et un shot actifs
        if(!DrawingEditor.currentKind || !DrawingEditor.currentShotId) return;
        
        e.preventDefault();
        DrawingEditor.removePlacedObject(idx);
    },
    
    // Phase 4B v3 : drag-and-drop pour réordonner les objets dans la liste "Placés"
    onPlacedDragStart: (e, idx) => {
        e.dataTransfer.setData('text/plain', 'placed:' + idx);
        e.dataTransfer.effectAllowed = 'move';
        if(e.currentTarget && e.currentTarget.style) e.currentTarget.style.opacity = '0.5';
    },
    
    onPlacedDragEnd: (e) => {
        if(e.currentTarget && e.currentTarget.style) e.currentTarget.style.opacity = '';
    },
    
    onPlacedDragOver: (e) => {
        const types = e.dataTransfer && e.dataTransfer.types;
        if(types && types.includes('text/plain')) {
            e.preventDefault();
            if(e.currentTarget && e.currentTarget.style) {
                e.currentTarget.style.borderTop = '2px solid var(--primary)';
            }
        }
    },
    
    onPlacedDragLeave: (e) => {
        if(e.currentTarget && e.currentTarget.style) e.currentTarget.style.borderTop = '';
    },
    
    onPlacedDrop: (e, toIdx) => {
        e.preventDefault();
        if(e.currentTarget && e.currentTarget.style) e.currentTarget.style.borderTop = '';
        const data = e.dataTransfer.getData('text/plain');
        if(!data || !data.startsWith('placed:')) return;
        const fromIdx = parseInt(data.substring(7));
        if(isNaN(fromIdx) || fromIdx === toIdx) return;
        DrawingEditor._reorderObjects(fromIdx, toIdx);
    },
    
    // Phase 4B v3 : déplacer un objet de fromIdx vers toIdx dans la liste objects[]
    _reorderObjects: (fromIdx, toIdx) => {
        const shot = state.data.shots.find(s => s.id === DrawingEditor.currentShotId);
        if(!shot) return;
        const zone = shot.drawings && shot.drawings[DrawingEditor.currentKind];
        if(!zone || !Array.isArray(zone.objects)) return;
        if(fromIdx < 0 || fromIdx >= zone.objects.length || toIdx < 0 || toIdx >= zone.objects.length) return;
        if(fromIdx === toIdx) return;
        
        // Retirer l'élément déplacé et l'insérer à sa nouvelle position
        const moved = zone.objects.splice(fromIdx, 1)[0];
        zone.objects.splice(toIdx, 0, moved);
        
        // Si l'objet déplacé était sélectionné en mode transform, mettre à jour son index
        if(DrawingEditor.selectedObjectIdx === fromIdx) {
            DrawingEditor.selectedObjectIdx = toIdx;
        } else if(fromIdx < DrawingEditor.selectedObjectIdx && toIdx >= DrawingEditor.selectedObjectIdx) {
            DrawingEditor.selectedObjectIdx -= 1;
        } else if(fromIdx > DrawingEditor.selectedObjectIdx && toIdx <= DrawingEditor.selectedObjectIdx) {
            DrawingEditor.selectedObjectIdx += 1;
        }
        
        if(Storyboard.markAsDirty) Storyboard.markAsDirty();
        DrawingEditor.renderObjectsPalette();
        DrawingEditor.redraw();
    },
    
    // Phase 3C v2 Storyboard : drag-and-drop natif depuis la palette vers le canvas
    handlePaletteDragStart: (e, type) => {
        e.dataTransfer.setData('text/plain', type);
        e.dataTransfer.effectAllowed = 'copy';
    },
    
    handleCanvasDragOver: (e) => {
        // Empêche le navigateur de bloquer le drop (comportement par défaut)
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    },
    
    handleCanvasDrop: (e) => {
        e.preventDefault();
        const type = e.dataTransfer.getData('text/plain');
        if(!type) return;
        // Vérifier qu'on est bien dans une zone sémantique
        if(!DrawingEditor.currentKind || DrawingEditor.currentKind === 'original') return;
        // Vérifier que le type existe dans le catalogue
        const def = (CONFIG.annotationObjects || []).find(o => o.type === type);
        if(!def) return;
        
        // Calculer les coordonnées canvas (avec scaling pour gérer un canvas affiché à taille différente)
        const rect = DrawingEditor.canvas.getBoundingClientRect();
        const scaleX = DrawingEditor.canvas.width / rect.width;
        const scaleY = DrawingEditor.canvas.height / rect.height;
        const canvasX = (e.clientX - rect.left) * scaleX;
        const canvasY = (e.clientY - rect.top) * scaleY;
        
        // Créer l'objet
        const shot = state.data.shots.find(s => s.id === DrawingEditor.currentShotId);
        if(!shot) return;
        if(!shot.drawings) shot.drawings = { original:null, lighting:null, camera:null, actors:null };
        if(!shot.drawings[DrawingEditor.currentKind]) {
            shot.drawings[DrawingEditor.currentKind] = {
                imageType: 'drawing',
                imageUrl: null,
                drawingData: null,
                objects: []
            };
        }
        if(!Array.isArray(shot.drawings[DrawingEditor.currentKind].objects)) {
            shot.drawings[DrawingEditor.currentKind].objects = [];
        }
        shot.drawings[DrawingEditor.currentKind].objects.push({
            id: Utils.generateUniqueId(),
            type: type,
            x: Math.round(canvasX),
            y: Math.round(canvasY),
            scale: 1,
            rotation: 0,
            layerId: (DrawingEditor.layers[DrawingEditor.currentLayerIndex] || {}).id || null
        });
        
        if(Storyboard.markAsDirty) Storyboard.markAsDirty();
        DrawingEditor.renderObjectsPalette();
        DrawingEditor.redraw();
    },
    
    // Phase 3C v3 Storyboard : clic droit sur un objet = activer le mode transform (poignées)
    // Clic droit dans le vide = désélectionner
    handleContextMenu: (e) => {
        e.preventDefault();  // Toujours bloquer le menu natif du navigateur sur le canvas
        if(!DrawingEditor.currentKind) return;
        
        const rect = DrawingEditor.canvas.getBoundingClientRect();
        const scaleX = DrawingEditor.canvas.width / rect.width;
        const scaleY = DrawingEditor.canvas.height / rect.height;
        const canvasX = (e.clientX - rect.left) * scaleX;
        const canvasY = (e.clientY - rect.top) * scaleY;
        
        const idx = DrawingEditor.findObjectAt(canvasX, canvasY);
        if(idx < 0) {
            // Clic droit dans le vide : désélectionner si une sélection existe
            if(typeof DrawingEditor.selectedObjectIdx === 'number' && DrawingEditor.selectedObjectIdx >= 0) {
                DrawingEditor.selectedObjectIdx = -1;
                DrawingEditor.redraw();
            }
            return;
        }
        
        // Activer le mode transform sur cet objet (les poignées apparaissent via drawSelectionHandles)
        DrawingEditor.selectedObjectIdx = idx;
        DrawingEditor.redraw();
    },
    
    // Phase 3C Storyboard : retourne l'index de l'objet (ou -1) sous le point (canvasX, canvasY) dans la zone courante
    // Parcourt à l'envers pour que les objets dessinés en dernier soient prioritaires (au-dessus)
    // v595 : un objet n'est manipulable (clic, drag, poignées) que depuis le
    // calque auquel il appartient. Un objet orphelin (calque d'origine
    // supprimé, ou ancien projet sans layerId) reste manipulable partout,
    // faute de calque à qui le rattacher.
    _isObjectOnActiveLayer: (obj) => {
        const activeLayer = DrawingEditor.layers[DrawingEditor.currentLayerIndex];
        if(!activeLayer) return false;
        if(!obj.layerId) return true;
        if(obj.layerId === activeLayer.id) return true;
        const stillExists = DrawingEditor.layers.some(l => l.id === obj.layerId);
        return !stillExists;
    },
    
    findObjectAt: (canvasX, canvasY) => {
        const shot = state.data.shots.find(s => s.id === DrawingEditor.currentShotId);
        if(!shot) return -1;
        const zone = shot.drawings && shot.drawings[DrawingEditor.currentKind];
        if(!zone || !Array.isArray(zone.objects)) return -1;
        
        for(let i = zone.objects.length - 1; i >= 0; i--) {
            const obj = zone.objects[i];
            if(!DrawingEditor._isObjectOnActiveLayer(obj)) continue;
            const x = obj.x || 0;
            const y = obj.y || 0;
            const scale = obj.scale || 1;
            const rotation = obj.rotation || 0;
            
            // Phase 4B v2 : dimensions selon le type
            // - SVG/emoji : 48×48 (baseSize)
            // - image : width×height natifs stockés sur l'objet
            let halfW, halfH;
            if(obj.type === 'image') {
                halfW = ((obj.width || 100) * scale) / 2 + 4;
                halfH = ((obj.height || 100) * scale) / 2 + 4;
            } else {
                halfW = (48 * scale) / 2 + 4;
                halfH = halfW;
            }
            
            // Si l'objet a une rotation, on transforme le point cliqué dans son repère local
            if(rotation) {
                const dx = canvasX - x;
                const dy = canvasY - y;
                const angle = -(rotation * Math.PI / 180);
                const localX = dx * Math.cos(angle) - dy * Math.sin(angle);
                const localY = dx * Math.sin(angle) + dy * Math.cos(angle);
                if(Math.abs(localX) <= halfW && Math.abs(localY) <= halfH) return i;
            } else {
                if(canvasX >= x - halfW && canvasX <= x + halfW 
                   && canvasY >= y - halfH && canvasY <= y + halfH) {
                    return i;
                }
            }
        }
        return -1;
    },
    
    // ===================== OUTILS, CALQUES & HISTORIQUE =====================
    setTool: (tool) => {
        DrawingEditor.currentTool = tool;
        document.querySelectorAll('.drawing-sidebar .brush-btn').forEach(btn => btn.classList.remove('active'));
        event.target.classList.add('active');
    },
    
    setBrushSize: (size) => {
        // Phase 4B v2 : clamp 1-100 et stocker
        const n = parseInt(size);
        DrawingEditor.brushSize = isNaN(n) ? 10 : Math.max(1, Math.min(100, n));
    },
    
    setOpacity: (value) => {
        // Phase 4B v2 : clamp 0-100 et stocker
        const n = parseInt(value);
        DrawingEditor.opacity = isNaN(n) ? 100 : Math.max(0, Math.min(100, n));
        // Mettre à jour le label legacy s'il existe
        const label = document.getElementById('opacityValue');
        if(label) label.innerText = DrawingEditor.opacity + '%';
    },
    
    // Phase 4B v2 : helper pour snapper à un multiple de 5 le plus proche dans la direction du delta
    // Exemple : value=33, delta=+5 → 35 (plus proche supérieur). value=33, delta=-5 → 30.
    // Exemple : value=35, delta=+5 → 40. value=35, delta=-5 → 30.
    _snapToFive: (value, delta) => {
        const v = parseInt(value) || 0;
        if(v % 5 === 0) {
            // Déjà un multiple de 5 : on ajoute simplement le delta
            return v + delta;
        }
        // Pas un multiple de 5 : on snappe au multiple supérieur ou inférieur selon la direction
        if(delta > 0) {
            return Math.ceil(v / 5) * 5;
        } else {
            return Math.floor(v / 5) * 5;
        }
    },
    
    // Phase 4B v2 : ajuste la taille du trait avec snap à 5 (clamp 1-100)
    adjustBrushSize: (delta) => {
        const input = document.getElementById('drawBrushSize');
        if(!input) return;
        const newValue = Math.max(1, Math.min(100, DrawingEditor._snapToFive(input.value, delta)));
        input.value = newValue;
        DrawingEditor.setBrushSize(newValue);
    },
    
    // Phase 4B v2 : ajuste l'opacité avec snap à 5 (clamp 0-100)
    adjustOpacity: (delta) => {
        const input = document.getElementById('opacitySlider');
        if(!input) return;
        const newValue = Math.max(0, Math.min(100, DrawingEditor._snapToFive(input.value, delta)));
        input.value = newValue;
        DrawingEditor.setOpacity(newValue);
    },
    
    addLayer: () => {
        const newLayer = DrawingEditor.createNewLayer();
        DrawingEditor.layers.push(newLayer);
        DrawingEditor.currentLayerIndex = DrawingEditor.layers.length - 1;
        DrawingEditor.selectedObjectIdx = -1;
        DrawingEditor.renderLayers();
        DrawingEditor.saveState();
    },
    
    deleteLayer: async (idx) => {
        if(DrawingEditor.layers.length === 1) {
            Utils.toast('Impossible de supprimer le dernier calque', 'warning');
            return;
        }
        
        if(await ConfirmModal.confirmDelete("Ce calque sera supprimé.")) {
            const removedLayerId = DrawingEditor.layers[idx].id;
            DrawingEditor.layers.splice(idx, 1);
            
            // Les objets (images insérées) qui appartenaient à ce calque doivent
            // disparaître avec lui — sinon ils restent affichés sans calque.
            const shot = state.data.shots.find(s => s.id === DrawingEditor.currentShotId);
            const zone = shot?.drawings?.[DrawingEditor.currentKind];
            if(zone && Array.isArray(zone.objects)) {
                zone.objects = zone.objects.filter(o => o.layerId !== removedLayerId);
            }
            
            if(DrawingEditor.currentLayerIndex >= DrawingEditor.layers.length) {
                DrawingEditor.currentLayerIndex = DrawingEditor.layers.length - 1;
            }
            DrawingEditor.selectedObjectIdx = -1;
            if(DrawingEditor.currentKind !== 'original') DrawingEditor.renderObjectsPalette();
            DrawingEditor.renderLayers();
            DrawingEditor.redraw();
            DrawingEditor.saveState();
        }
    },
    
    toggleLayerVisibility: (idx) => {
        DrawingEditor.layers[idx].visible = !DrawingEditor.layers[idx].visible;
        DrawingEditor.renderLayers();
        DrawingEditor.redraw();
    },
    
    clear: async () => {
        if(!await ConfirmModal.confirmDelete("Tout le dessin sera effacé.", "Effacer tout ?")) return;
        
        const layer = DrawingEditor.layers[DrawingEditor.currentLayerIndex];
        const ctx = layer.canvas.getContext('2d');
        ctx.clearRect(0, 0, layer.canvas.width, layer.canvas.height);
        
        // "Effacer tout" doit aussi retirer les objets (images insérées) posés
        // sur ce calque — sinon ils restent affichés alors que le calque est vide.
        const shot = state.data.shots.find(s => s.id === DrawingEditor.currentShotId);
        const zone = shot?.drawings?.[DrawingEditor.currentKind];
        if(zone && Array.isArray(zone.objects)) {
            zone.objects = zone.objects.filter(o => o.layerId !== layer.id);
        }
        DrawingEditor.selectedObjectIdx = -1;
        if(DrawingEditor.currentKind !== 'original') DrawingEditor.renderObjectsPalette();
        
        DrawingEditor.redraw();
        DrawingEditor.saveState();
    },
    
    saveState: () => {
        // Remove future history if we're not at the end
        if(DrawingEditor.historyStep < DrawingEditor.history.length - 1) {
            DrawingEditor.history = DrawingEditor.history.slice(0, DrawingEditor.historyStep + 1);
        }
        
        // Save current state
        const state = DrawingEditor.layers.map(layer => {
            return {
                id: layer.id,
                visible: layer.visible,
                name: layer.name,
                imageData: layer.canvas.toDataURL()
            };
        });
        
        DrawingEditor.history.push(state);
        DrawingEditor.historyStep++;
        
        // Limit history to 50 steps
        if(DrawingEditor.history.length > 50) {
            DrawingEditor.history.shift();
            DrawingEditor.historyStep--;
        }
        
        // v595 : rafraîchir les vignettes de la colonne calques
        DrawingEditor.renderLayers();
    },
    
    undo: () => {
        if(DrawingEditor.historyStep > 0) {
            DrawingEditor.historyStep--;
            DrawingEditor.restoreState(DrawingEditor.history[DrawingEditor.historyStep]);
        }
    },
    
    redo: () => {
        if(DrawingEditor.historyStep < DrawingEditor.history.length - 1) {
            DrawingEditor.historyStep++;
            DrawingEditor.restoreState(DrawingEditor.history[DrawingEditor.historyStep]);
        }
    },
    
    restoreState: (state) => {
        DrawingEditor.layers = state.map(layerState => {
            const canvas = document.createElement('canvas');
            canvas.width = 800;
            canvas.height = 600;
            const ctx = canvas.getContext('2d');
            
            const img = new Image();
            // [Phase C.2.6 fix] crossOrigin obligatoire sur images HTTP Storage
            if(typeof layerState.imageData === 'string' && layerState.imageData.startsWith('http')) {
                img.crossOrigin = 'anonymous';
            }
            img.src = Utils.signedUrlFor(layerState.imageData);
            img.onload = () => {
                ctx.drawImage(img, 0, 0);
                DrawingEditor.redraw();
            };
            
            return {
                id: layerState.id,
                canvas: canvas,
                visible: layerState.visible,
                name: layerState.name
            };
        });
        
        DrawingEditor.renderLayers();
    },
    
    // ===================== SAUVEGARDE & RENDU =====================
    // v616 : upload des calques + écriture dans shot.drawings, SANS toucher au
    // réseau projet (Store.save()). Isolé de save() pour pouvoir committer le
    // dessin en mémoire depuis la fenêtre "Édition Plan" sans déclencher une
    // deuxième sauvegarde réseau indépendante de la sienne (cf close()).
    _commitDrawingData: async () => {
        if(!DrawingEditor.currentShotId) return false;
        
        const shot = state.data.shots.find(s => s.id === DrawingEditor.currentShotId);
        if(!shot) return false;
        
        // Phase 2 Storyboard : garde-fou de permission au moment de la sauvegarde
        const kind = DrawingEditor.currentKind || 'original';
        const isOwner = state.currentRole === 'owner';
        const permKey = (kind === 'original') ? 'storyboard' : ('storyboard_' + kind);
        if(!isOwner && !Permissions.canEdit(permKey)) {
            const labels = { original: 'le dessin original', lighting: 'la zone Lumière', camera: 'la zone Caméra', actors: 'la zone Acteurs' };
            Utils.toast(`Permission insuffisante pour modifier ${labels[kind] || 'cette zone'}.`, 'error');
            return false;
        }
        
        // Convert layers to serializable format
        // Upload de chaque calque vers Storage (upsert : écrasement du même chemin)
        const shotId = DrawingEditor.currentShotId;
        const layerUploads = await Promise.all(DrawingEditor.layers.map(async (layer) => {
            const dataUrl = layer.canvas.toDataURL();
            const filePath = `${state.currentProjectId}/storyboard/${shotId}_${kind}_layer_${layer.id}.png`;
            const url = await Utils.uploadDataUrl(dataUrl, filePath, true);
            return {
                id: layer.id,
                visible: layer.visible,
                name: layer.name,
                imageData: url || dataUrl  // fallback base64 si upload échoue
            };
        }));
        const drawingData = {
            layers: layerUploads,
            currentLayer: DrawingEditor.currentLayerIndex
        };
        
        // Phase 1 Storyboard : écrire dans la zone correspondante
        if(!shot.drawings) {
            shot.drawings = { original: null, lighting: null, camera: null, actors: null };
        }
        // Phase 3 Storyboard : préserver les objets vectoriels existants dans la zone
        const existingObjects = (shot.drawings[kind] && Array.isArray(shot.drawings[kind].objects))
            ? shot.drawings[kind].objects
            : [];
        shot.drawings[kind] = {
            imageType: 'drawing',
            imageUrl: null,
            drawingData: drawingData,
            objects: existingObjects  // Phase 3 : tableau d'objets vectoriels persistés
        };
        
        // Compat backwards : pour 'original' on continue d'alimenter les champs racine
        // (utilisés par l'aperçu compact, l'export PDF, etc.)
        if(kind === 'original') {
            shot.imageType = 'drawing';
            shot.drawingData = drawingData;
        }
        shot.lastModified = Date.now();
        return true;
    },

    // Chemin autonome (dessin ouvert hors fenêtre "Édition Plan") : committer PUIS
    // pousser au serveur soi-même, personne d'autre ne le fera.
    save: async () => {
        Utils.toast('Sauvegarde en cours...', 'info', 2000);
        const kind = DrawingEditor.currentKind || 'original';
        const ok = await DrawingEditor._commitDrawingData();
        if(!ok) return;
        
        Store.save();
        Storyboard.renderShots();
        const zoneLabel = { original: 'Dessin', lighting: 'Lumière', camera: 'Caméra', actors: 'Acteurs' }[kind] || 'Dessin';
        Utils.toast(zoneLabel + ' sauvegardé !', 'success');
    },
    
    // v599 — DEUX DEFAUTS CORRIGES ICI, tous deux invisibles tant que les
    // calques arrivaient vite :
    //  1. CANVAS ORPHELIN. Le contexte etait capture a l'appel, mais les calques
    //     se dessinent APRES leur telechargement. Si la liste des plans est
    //     redessinee entre-temps — changement de scene, retour d'onglet, simple
    //     second rendu — la peinture atterrit dans un canvas retire du document :
    //     la vignette reste vide POUR TOUJOURS, jusqu'au prochain rendu. D'ou
    //     « les miniatures n'apparaissent qu'apres avoir clique sur une fiche ».
    //     On accepte donc un identifiant de canvas et on le RETROUVE au moment
    //     de peindre, jamais avant.
    //  2. ORDRE D'EMPILEMENT. Les calques partaient tous en parallele et se
    //     dessinaient dans leur ordre d'ARRIVEE : un calque lourd place dessous
    //     pouvait recouvrir ceux du dessus. Ils sont desormais dessines l'un
    //     apres l'autre, dans l'ordre du dessin.
    renderDrawingData: async (ctx, drawingData, canvasId) => {
        if(!drawingData || !Array.isArray(drawingData.layers)) return;
        const cible = () => {
            if(!canvasId) return ctx;
            const c = document.getElementById(canvasId);
            return c ? c.getContext('2d') : null;
        };
        for(const layerData of drawingData.layers) {
            if(!layerData || !layerData.visible) continue;
            const img = new Image();
            await StoryboardExport._loadPrintImg(img, layerData.imageData, () => {
                const c = cible();
                if(c) c.drawImage(img, 0, 0);
            });
        }
    }
};


  // Module Import Scénario (depuis l'onglet scénario)