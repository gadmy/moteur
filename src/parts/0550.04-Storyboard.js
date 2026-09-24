
const Storyboard = {
    // ===================== ÉTAT, SCÈNES & PLANS =====================
    currentSceneId: null,
    
    init: () => {
        Storyboard.renderScenesList();
        document.getElementById('sbNoScene').style.display = 'flex';
        document.getElementById('sbShotsContainer').style.display = 'none';
        // Recalcul auto de l'alignement des plans au redimensionnement (lié une seule fois)
        if(!Storyboard._resizeBound) {
            Storyboard._resizeBound = true;
            window.addEventListener('resize', () => {
                clearTimeout(Storyboard._resizeTimer);
                Storyboard._resizeTimer = setTimeout(() => {
                    if(Storyboard.currentSceneId) Storyboard.alignShotsToScene();
                }, 150);
            });
        }
    },
    
    renderScenesList: () => {
        const container = document.getElementById('sbScenesList');
        container.innerHTML = '';
        
        // S4 : filtrer par épisode actif pour les séries
        const scenesToRender = UI.getScenesForCurrentView();
        
        if(scenesToRender.length === 0) {
            const msg = (state.currentProjectType === 'series' && state.currentEpisodeId)
                ? 'Aucune scène dans cet épisode pour l\'instant. Ajoutez-en depuis le séquencier.'
                : 'Créez votre première scène pour commencer à construire votre séquencier. Chaque scène peut avoir un titre, un résumé et des personnages.';
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">🎬</div>
                    <div class="empty-state-title">Aucune scène</div>
                    <div class="empty-state-desc">${msg}</div>
                    <button class="empty-state-btn" onclick="app.Actions.addScene()">+ Ajouter une scène</button>
                    <div class="empty-state-tips">💡 <strong>Astuce :</strong> Importez un scénario existant pour générer automatiquement les scènes.</div>
                </div>
            `;
            return;
        }
        
        scenesToRender.forEach((scene, idx) => {
            const shotCount = state.data.shots.filter(s => s.sceneId === scene.id).length;
            const sceneStatus = scene.status || 'not-verified';
            const isFinal = scene.isFinal === true;
            const div = document.createElement('div');
            div.className = 'sb-scene-item' + (Storyboard.currentSceneId === scene.id ? ' active' : '') + (isFinal ? '' : ' is-draft');
            // [Phase D - Bug 3] Badge brouillon/final pour signaler les scènes non validées
            const finalIcon = isFinal ? '✅' : '📝';
            const finalTitle = isFinal ? 'Scène validée' : 'Scène en brouillon (à valider avant storyboard)';
            div.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: space-between;">
                    <div class="sb-scene-title"><span title="${finalTitle}" style="margin-right:4px;">${finalIcon}</span>${UI.formatSceneNumber(scene, idx)} ${Utils.escape(scene.title)}</div>
                    <div class="scene-status-container"><span class="scene-status-badge ${sceneStatus}" onclick="event.stopPropagation(); app.UI.toggleSceneStatus('${scene.id}', event)">${SCENE_STATUS_LABELS[sceneStatus]}</span></div>
                </div>
                <div class="sb-scene-meta">${shotCount} plan(s)${!isFinal ? ' • <span style="color:#ff9800;">brouillon</span>' : ''}</div>
            `;
            div.onclick = () => Storyboard.selectScene(scene.id);
            container.appendChild(div);
        });
    },
    
    selectScene: (sceneId) => {
        Storyboard.currentSceneId = sceneId;
        Storyboard.renderScenesList();
        document.getElementById('sbNoScene').style.display = 'none';
        document.getElementById('sbShotsContainer').style.display = 'block';
        Storyboard.renderShots();
        Storyboard.alignShotsToScene();
    },

    // Aligne le haut de la colonne des plans sur la scène sélectionnée
    // (évite de devoir remonter quand on choisit une scène en bas de liste)
    alignShotsToScene: () => {
        const list = document.getElementById('sbScenesList');
        const shots = document.getElementById('sbShotsContainer');
        if(!list || !shots) return;
        const active = list.querySelector('.sb-scene-item.active');
        if(!active) { shots.style.marginTop = '0'; return; }
        const col = shots.parentElement;
        const padTop = parseFloat(getComputedStyle(col).paddingTop) || 0;
        const offset = active.getBoundingClientRect().top - col.getBoundingClientRect().top - padTop;
        shots.style.marginTop = Math.max(0, offset) + 'px';
    },
    
    // v599 — DIAGNOSTIC DES VIGNETTES, a taper dans la console du navigateur :
    //   app.Storyboard.diagVignettes()
    // Dit, plan par plan, ce que la liste a REELLEMENT de quoi dessiner. Sert a
    // trancher entre trois causes qui donnent le meme symptome a l'ecran :
    // le dessin n'est pas la / il est la mais ne se telecharge pas / il se
    // telecharge mais n'arrive pas jusqu'au canvas affiche.
    diagVignettes: () => {
        const shots = (state.data.shots || []).filter(s => s.sceneId === Storyboard.currentSceneId);
        const lignes = shots.map((s, i) => {
            const couches = (s.drawingData && Array.isArray(s.drawingData.layers))
                ? s.drawingData.layers.filter(l => l && l.visible) : [];
            const stockees = couches.filter(l => Utils._projPathFrom(l.imageData));
            const zone = s.drawings && s.drawings.original;
            const objets = (zone && Array.isArray(zone.objects)) ? zone.objects : [];
            const img = objets.filter(o => o && o.type === 'image');
            const cache = Storyboard._svgImageCache || {};
            const c = document.getElementById('compact-preview-' + s.id);
            return {
                plan: i + 1,
                type: s.imageType || '(aucun)',
                drawingData_racine: !!s.drawingData,
                calques_visibles: couches.length,
                calques_stockes: stockees.length,
                blobs_deja_en_cache: stockees.filter(l => StoryboardExport._blobCache.has(Utils._projPathFrom(l.imageData))).length,
                zone_original: !!(zone && zone.drawingData),
                objets_vectoriels: objets.length,
                // v599 : etat des OBJETS IMAGE inseres — c'est eux, et non les
                // calques, qui manquaient a l'appel. « non_signee » veut dire
                // que l'URL n'etait pas prete : l'image sera retentee au rendu
                // suivant. « echouee » veut dire que le chargement a echoue.
                objets_image: img.length,
                img_pretes: img.filter(o => { const e = cache['uploaded|' + o.id]; return e && e.ready && !e.failed; }).length,
                img_en_cours: img.filter(o => { const e = cache['uploaded|' + o.id]; return e && !e.ready; }).length,
                img_echouees: img.filter(o => { const e = cache['uploaded|' + o.id]; return e && e.failed; }).length,
                img_non_signees: img.filter(o => { const u = Utils.signedUrlFor(o.imageData); return !(typeof u === 'string' && /^(https?|data|blob):/.test(u)); }).length,
                // v599 : la valeur BRUTE et ce qu'en fait signedUrlFor — c'est
                // ce qui manquait pour trancher sans deviner.
                exemple_valeur: img.length ? String(img[0].imageData || '').slice(0, 70) : '',
                exemple_url: img.length ? String(Utils.signedUrlFor(img[0].imageData) || '').slice(0, 70) : '',
                exemple_chemin: img.length ? String(Utils._projPathFrom(img[0].imageData) || '(aucun)') : '',
                canvas_present: !!c,
                canvas_dans_le_document: !!(c && document.body.contains(c))
            };
        });
        console.log('repeintes de la liste depuis le chargement :', Storyboard._repeintes);
        try { console.table(lignes); } catch(e) { console.log(lignes); }
        return lignes;
    },

    renderShots: () => {
        const container = document.getElementById('sbShotsList');
        container.innerHTML = '';
        
        if(!state.data.shots) state.data.shots = [];
        
        // [Phase D - Bug 3] Si la scène n'est pas finalisée, afficher un appel à validation
        const currentScene = state.data.scenes.find(s => s.id === Storyboard.currentSceneId);
        if(currentScene && currentScene.isFinal !== true) {
            const addBtn = document.querySelector('#sbShotsContainer > button');
            if(addBtn) addBtn.style.display = 'none'; // masquer "Ajouter un Plan"
            container.innerHTML = `
                <div style="text-align:center; padding:50px 20px; max-width:500px; margin:30px auto; background:var(--panel-bg); border:2px dashed #ff9800; border-radius:12px;">
                    <div style="font-size:3rem; margin-bottom:15px;">📝</div>
                    <h3 style="color:#ff9800; margin:0 0 10px 0;">Scène non validée</h3>
                    <p style="color:var(--text-sec); margin:0 0 20px 0; line-height:1.5;">
                        Avant de créer un storyboard pour <strong>"${Utils.escape(currentScene.title)}"</strong>, 
                        vous devez valider la scène. Cela garantit que le texte est définitif avant d'investir du temps en illustration.
                    </p>
                    <button onclick="app.Actions.finalizeScene('${currentScene.id}')" style="padding:12px 24px; background:var(--success); color:white; border:none; border-radius:8px; font-weight:bold; cursor:pointer; font-size:1rem;">
                        ✅ Valider cette scène
                    </button>
                    <div style="margin-top:15px; font-size:0.85rem; color:var(--text-sec);">
                        💡 Vous pouvez aussi valider depuis le Séquencier ou le Scénario.
                    </div>
                </div>
            `;
            return;
        }
        // Scène finalisée : on s'assure que le bouton "Ajouter un Plan" est visible
        const addBtn = document.querySelector('#sbShotsContainer > button');
        if(addBtn) addBtn.style.display = '';
        
        const shots = state.data.shots
            .filter(s => s.sceneId === Storyboard.currentSceneId)
            .sort((a, b) => a.order - b.order);
        
        if(shots.length === 0) {
            container.innerHTML = '<div class="empty-state">Aucun plan créé</div>';
            return;
        }
        
        // Create compact grid
        const grid = document.createElement('div');
        grid.className = 'shots-compact-grid';
        
        shots.forEach((shot, idx) => {
            const card = Storyboard.createCompactCard(shot, idx);
            grid.appendChild(card);
        });
        
        container.appendChild(grid);
        
        // Setup drag and drop
        if(state.currentRole !== 'viewer') {
            Storyboard.setupDragDrop(grid);
        }
    },
    
    createCompactCard: (shot, idx) => {
        const sceneIndex = state.data.scenes.findIndex(s => s.id === Storyboard.currentSceneId) + 1;
        const card = document.createElement('div');
        card.className = 'shot-compact-card';
        card.draggable = state.currentRole !== 'viewer';
        card.dataset.shotId = shot.id;
        // v601 — LA VIGNETTE DIT DE QUEL PLAN ELLE PARLE. C'est elle qu'on
        // regarde dans la grille du storyboard : sans cet identifiant, le
        // cadenas n'avait nulle part ou se poser, et l'on n'apprenait qu'un
        // plan etait occupe qu'en essayant de l'ouvrir. (La carte detaillee,
        // createShotCard, ne sert QUE dans la fenetre d'edition — c'est ce
        // qui m'avait fait croire la grille couverte.)
        card.dataset.fiche = 'shot:' + shot.id;
        
        let imageHTML = '';
        const contenu = Storyboard.contenuPlan(shot);
        if(contenu.fond) {
            imageHTML = `<img src="${Utils.safeMediaUrl(contenu.fond)}" alt="Plan ${sceneIndex}.${idx + 1}">`;
        } else if(!contenu.vide) {
            imageHTML = `<canvas id="compact-preview-${shot.id}" width="800" height="600" style="max-width: 100%; max-height: 100%; object-fit: contain;"></canvas>`;
        } else {
            imageHTML = `<div style="color: #999; font-size: 2rem;">🎨</div>`;
        }
        
        const dirtyIndicator = shot.isDirty ? '<div class="shot-dirty-indicator">●</div>' : '';
        
        // Construire les infos techniques (acronymes)
        const techParts = [];
        if(shot.shotType) techParts.push(Storyboard.extractAcronym(shot.shotType));
        if(shot.cameraMove) techParts.push(Storyboard.extractAcronym(shot.cameraMove));
        if(shot.cameraMode) techParts.push(Storyboard.extractAcronym(shot.cameraMode));
        const techInfo = techParts.length > 0 ? `<div class="shot-compact-tech">${techParts.join(' • ')}</div>` : '';
        const nameInfo = shot.name ? `<div class="shot-compact-name">${Utils.escape(shot.name)}</div>` : '';
        
        // Phase 1 Storyboard : déterminer quelles zones sémantiques sont visibles
        const vis = shot.drawingsVisibility || { original: true, lighting: false, camera: false, actors: false };
        const hasZone = (k) => {
            const z = shot.drawings && shot.drawings[k];
            if(!z) return false;
            // Phase 3 : une zone est considérée "non vide" si elle a un dessin/image OU au moins 1 objet vectoriel
            return !!(z.drawingData || z.imageUrl || (Array.isArray(z.objects) && z.objects.length > 0));
        };
        const zoneHas = { lighting: hasZone('lighting'), camera: hasZone('camera'), actors: hasZone('actors') };
        const showAnyOverlay = (vis.lighting && zoneHas.lighting) || (vis.camera && zoneHas.camera) || (vis.actors && zoneHas.actors);
        
        // Petit indicateur visuel des zones disponibles (icônes sur la vignette)
        const indicators = [];
        if(zoneHas.lighting) indicators.push(`<span title="Annotation Lumière disponible" style="opacity:${vis.lighting ? 1 : 0.4};">💡</span>`);
        if(zoneHas.camera) indicators.push(`<span title="Annotation Caméra disponible" style="opacity:${vis.camera ? 1 : 0.4};">🎥</span>`);
        if(zoneHas.actors) indicators.push(`<span title="Annotation Acteurs disponible" style="opacity:${vis.actors ? 1 : 0.4};">🎭</span>`);
        const indicatorsHtml = indicators.length > 0 
            ? `<div style="position: absolute; top: 4px; right: 4px; display: flex; gap: 3px; background: rgba(0,0,0,0.55); padding: 3px 6px; border-radius: 6px; font-size: 0.85em; z-index: 2;">${indicators.join('')}</div>` 
            : '';
        
        const overlayHtml = `<canvas id="compact-overlay-${shot.id}" width="800" height="600" 
            style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; object-fit: contain; ${showAnyOverlay ? '' : 'display: none;'}"></canvas>`;
        
        card.innerHTML = `
            ${dirtyIndicator}
            <div class="shot-compact-image" style="position: relative;" onclick="app.Storyboard.openEditModal('${shot.id}')">
                ${imageHTML}
                ${overlayHtml}
                ${indicatorsHtml}
            </div>
            <div class="shot-compact-footer">
                <span>Plan ${sceneIndex}.${idx + 1}</span>
                ${state.currentRole !== 'viewer' ? `
                <div style="display: flex; gap: 4px;">
                    <button class="shot-compact-duplicate" onclick="event.stopPropagation(); app.Storyboard.duplicateShot('${shot.id}')" title="Dupliquer ce plan">📋</button>
                    <button class="shot-compact-delete" onclick="app.Storyboard.deleteShot('${shot.id}', event)">🗑️</button>
                </div>` : ''}
            </div>
            ${nameInfo}
            ${techInfo}
        `;
        
        // Render drawing preview + overlay
        setTimeout(() => {
            const c0 = Storyboard.contenuPlan(shot);
            if(c0.calques) {
                const canvas = document.getElementById(`compact-preview-${shot.id}`);
                if(canvas) {
                    const ctx = canvas.getContext('2d');
                    DrawingEditor.renderDrawingData(ctx, c0.calques, `compact-preview-${shot.id}`);
                }
            }
            
            // Phase 4B v2 : rendre les objets de la zone Original (images insérées + autres)
            // Délai léger pour laisser le temps aux Image.onload des SVG/images de s'amorcer
            setTimeout(() => {
                const previewCanvas = document.getElementById(`compact-preview-${shot.id}`);
                if(previewCanvas) {
                    const pctx = previewCanvas.getContext('2d');
                    const originalZone = shot.drawings && shot.drawings.original;
                    if(originalZone && Array.isArray(originalZone.objects) && originalZone.objects.length > 0) {
                        Storyboard.renderObjectsOnCanvas(pctx, originalZone.objects);
                        // v599 : les objets IMAGE par le chemin de l'apercu, seul
                        // a savoir atteindre un media du bucket prive.
                        Storyboard.dessinerObjetsImage('compact-preview-' + shot.id, originalZone.objects);
                    }
                }
            }, 150);
            
            // Phase 1 Storyboard : rendu de l'overlay compact (zones sémantiques visibles)
            const overlayCanvas = document.getElementById(`compact-overlay-${shot.id}`);
            if(overlayCanvas) {
                const octx = overlayCanvas.getContext('2d');
                octx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
                const compactKinds = ['lighting', 'camera', 'actors'];
                compactKinds.forEach(k => {
                    if(!vis[k] || !zoneHas[k]) return;
                    const zone = shot.drawings && shot.drawings[k];
                    if(!zone) return;
                    if(zone.imageType === 'upload' && zone.imageUrl) {
                        const im = new Image();
                        // [Phase C.2.6 fix] crossOrigin obligatoire pour pouvoir convertir le canvas en PDF
                        if(typeof zone.imageUrl === 'string' && zone.imageUrl.startsWith('http')) im.crossOrigin = 'anonymous';
                        im.onload = () => { octx.drawImage(im, 0, 0, overlayCanvas.width, overlayCanvas.height); };
                        im.src = Utils.signedUrlFor(zone.imageUrl);
                    } else if(zone.drawingData) {
                        DrawingEditor.renderDrawingData(octx, zone.drawingData);
                    }
                });
                
                // Phase 3 Storyboard : rendre les objets vectoriels par-dessus les images pixel
                setTimeout(() => {
                    compactKinds.forEach(k => {
                        if(!vis[k] || !zoneHas[k]) return;
                        const zone = shot.drawings && shot.drawings[k];
                        if(zone && Array.isArray(zone.objects) && zone.objects.length > 0) {
                            Storyboard.renderObjectsOnCanvas(octx, zone.objects);
                        }
                    });
                }, 150);
            }
        }, 100);
        
        return card;
    },
    
    setupDragDrop: (container) => {
        const cards = container.querySelectorAll('.shot-compact-card');
        
        cards.forEach(card => {
            card.addEventListener('dragstart', () => {
                card.classList.add('dragging');
            });
            
            card.addEventListener('dragend', () => {
                card.classList.remove('dragging');
                Storyboard.updateShotOrder();
            });
        });
        
        container.addEventListener('dragover', (e) => {
            e.preventDefault();
            const afterElement = Storyboard.getDragAfterElement(container, e.clientX, e.clientY);
            const dragging = document.querySelector('.shot-compact-card.dragging');
            
            if(afterElement == null) {
                container.appendChild(dragging);
            } else {
                container.insertBefore(dragging, afterElement);
            }
        });
    },
    
    getDragAfterElement: (container, x, y) => {
        const draggableElements = [...container.querySelectorAll('.shot-compact-card:not(.dragging)')];
        
        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offsetX = x - box.left - box.width / 2;
            const offsetY = y - box.top - box.height / 2;
            const offset = Math.sqrt(offsetX * offsetX + offsetY * offsetY);
            
            if(offset < closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.POSITIVE_INFINITY }).element;
    },
    
    updateShotOrder: () => {
        const cards = document.querySelectorAll('.shot-compact-card');
        const newOrder = [];
        
        cards.forEach((card, idx) => {
            const shotId = card.dataset.shotId;
            const shot = state.data.shots.find(s => s.id === shotId);
            if(shot) {
                shot.order = idx;
                newOrder.push(shot);
            }
        });
        
        Store.save();
    },
    
    // ====================================================================
    // SOURCE UNIQUE D'UNE VIGNETTE DE PLAN (v601)
    // ====================================================================
    // Un plan portait son image a DEUX endroits : la RACINE (ancien format) et
    // la zone « original », celle qu'ecrit l'editeur de dessin. Trois ecrans les
    // lisaient differemment — l'onglet la racine, l'editeur la zone, l'export
    // tantot l'une tantot l'autre — d'ou des images visibles ici et absentes la.
    // DESORMAIS UNE SEULE SOURCE : LA ZONE. Ce que montre l'editeur de dessin
    // est ce qui s'affiche partout et ce qui sort au PDF. Rien dans l'editeur =
    // case vide, ce qui est la reponse honnete.
    // LA RACINE N'EST PLUS LUE DU TOUT. Elle reste dans les donnees, et les
    // projets d'avant ne perdent rien : au chargement, Store recopie deja la
    // racine dans la zone quand celle-ci n'existe pas (migration « drawings »).
    // Les seuls plans qui deviennent vides sont ceux ou la zone existait DEJA en
    // restant vide a cote d'une image de racine — cas qu'aucun ecran de
    // l'application ne sait produire.
    contenuPlan: (shot) => {
        const z = (shot && shot.drawings && shot.drawings.original) || null;
        const objets = (z && Array.isArray(z.objects)) ? z.objects : [];
        const fond = (z && z.imageType === 'upload' && z.imageUrl) ? z.imageUrl : null;
        const calques = (z && z.drawingData) || null;
        return { fond, calques, objets, vide: !fond && !calques && objets.length === 0 };
    },

    createShotCard: (shot, idx) => {
        const card = document.createElement('div');
        card.className = 'shot-card';
        card.dataset.shotId = shot.id;
        card.dataset.fiche = 'shot:' + shot.id;   // v601 : verrou par fiche
        
        let imagePreview = '';
        const contenu = Storyboard.contenuPlan(shot);
        if(contenu.fond) {
            imagePreview = `<img src="${Utils.safeMediaUrl(contenu.fond)}" alt="Plan ${idx + 1}">`;
        } else if(!contenu.vide) {
            imagePreview = `<canvas id="preview-${shot.id}" width="800" height="600"></canvas>`;
        } else {
            imagePreview = `<div class="shot-upload-zone">
                <div style="font-size: 3rem; margin-bottom: 10px;">🎨</div>
                <div>Utilisez "Dessiner" à gauche pour ajouter une image</div>
            </div>`;
        }
        
        const isView = state.currentRole === 'viewer';
        
        // Phase 1 Storyboard : déterminer quelles zones sémantiques ont du contenu
        const vis = shot.drawingsVisibility || { original: true, lighting: false, camera: false, actors: false };
        const hasZone = (k) => {
            const z = shot.drawings && shot.drawings[k];
            if(!z) return false;
            // Phase 3 : une zone est considérée "non vide" si elle a un dessin/image OU au moins 1 objet vectoriel
            return !!(z.drawingData || z.imageUrl || (Array.isArray(z.objects) && z.objects.length > 0));
        };
        const zoneHas = { lighting: hasZone('lighting'), camera: hasZone('camera'), actors: hasZone('actors') };
        const showAnyOverlay = (vis.lighting && zoneHas.lighting) || (vis.camera && zoneHas.camera) || (vis.actors && zoneHas.actors);
        
        // Bouton toggle générique
        const toggleBtn = (kind, label, emoji, color) => {
            const has = zoneHas[kind];
            const isOn = vis[kind] && has;
            const opacity = has ? 1 : 0.35;
            const bg = isOn ? color : 'transparent';
            const txtColor = isOn ? 'white' : 'var(--text-main)';
            const title = has ? (isOn ? `Masquer ${label}` : `Afficher ${label}`) : `${label} (vide)`;
            return `<button onclick="event.stopPropagation(); app.Storyboard.toggleDrawingVisibility('${shot.id}', '${kind}')" 
                title="${title}"
                style="padding: 4px 10px; border: 1px solid var(--border); border-radius: 6px; background: ${bg}; color: ${txtColor}; cursor: pointer; font-size: 0.85em; opacity: ${opacity};">
                ${emoji} ${label}
            </button>`;
        };
        const togglesHtml = `
            <div class="shot-overlay-toggles" style="display: flex; gap: 6px; padding: 6px 10px; flex-wrap: wrap; background: var(--bg); border-bottom: 1px solid var(--border);">
                ${toggleBtn('lighting', 'Lumière', '💡', 'linear-gradient(135deg, #ffd54f, #ffb300)')}
                ${toggleBtn('camera', 'Caméra', '🎥', 'linear-gradient(135deg, #64b5f6, #1976d2)')}
                ${toggleBtn('actors', 'Acteurs', '🎭', 'linear-gradient(135deg, #ce93d8, #8e24aa)')}
            </div>
        `;
        
        // Overlay canvas (par-dessus l'image originale)
        const overlayHtml = `<canvas id="overlay-${shot.id}" width="800" height="600" 
            style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; ${showAnyOverlay ? '' : 'display: none;'}"></canvas>`;
        
        // Boutons Dessiner / Lumière / Caméra / Acteurs, à gauche de l'image :
        // avant, il fallait cliquer sur l'image pour faire apparaître ce menu
        // en popup ; les boutons sont maintenant toujours visibles là.
        const isOwner = state.currentRole === 'owner';
        const canEditOriginal = isView ? false : (isOwner || Permissions.canEdit('storyboard'));
        const canEditAnnotation = (kind) => isView ? false : (isOwner || Permissions.canEdit('storyboard_' + kind));
        const sideBtn = (onclick, bg, txtColor, label, locked) => `
            <button ${locked ? 'disabled title="Permission insuffisante"' : `onclick="${onclick}"`}
                style="padding: 10px 8px; background: ${bg}; color: ${txtColor}; border: none; border-radius: 8px; cursor: ${locked ? 'not-allowed' : 'pointer'}; font-size: 0.8rem; font-weight: 600; width: 100%; text-align: center; ${locked ? 'opacity: 0.4; filter: grayscale(60%);' : ''}">
                ${label}${locked ? ' 🔒' : ''}
            </button>`;
        const sideButtonsHtml = isView ? '' : `
            <div class="shot-side-buttons" style="display: flex; flex-direction: column; gap: 6px; width: 84px; flex-shrink: 0;">
                ${sideBtn(`app.Storyboard.chooseDrawing('${shot.id}')`, 'var(--primary)', 'white', '🎨 Dessiner', !canEditOriginal)}
                ${sideBtn(`app.Storyboard.chooseAnnotation('${shot.id}', 'lighting')`, 'linear-gradient(135deg, #ffd54f, #ffb300)', '#3e2723', '💡 Lumière', !canEditAnnotation('lighting'))}
                ${sideBtn(`app.Storyboard.chooseAnnotation('${shot.id}', 'camera')`, 'linear-gradient(135deg, #64b5f6, #1976d2)', 'white', '🎥 Caméra', !canEditAnnotation('camera'))}
                ${sideBtn(`app.Storyboard.chooseAnnotation('${shot.id}', 'actors')`, 'linear-gradient(135deg, #ce93d8, #8e24aa)', 'white', '🎭 Acteurs', !canEditAnnotation('actors'))}
            </div>`;
        
        card.innerHTML = `
            <div class="shot-header">
                <h3 class="m-0">Plan ${idx + 1}</h3>
                ${!isView ? `
                <div style="display: flex; gap: 6px;">
                    <button onclick="app.Storyboard.deleteShot('${shot.id}')" style="background: var(--danger); color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer;">🗑️ Supprimer</button>
                </div>` : ''}
            </div>
            
            ${togglesHtml}
            
            <div style="display: flex; gap: 10px; align-items: stretch;">
                ${sideButtonsHtml}
                <div class="shot-preview" style="position: relative; flex: 1;">
                    ${imagePreview}
                    ${overlayHtml}
                </div>
            </div>
            
            <div class="shot-meta-grid">
                <span class="shot-field-nom">Nom du plan</span>
                <input type="text" class="shot-input" placeholder="Nom du plan" data-tooltip="Nom du plan" value="${Utils.escape(shot.name || '')}" 
                    onchange="app.Storyboard.updateShot('${shot.id}', 'name', this.value)" ${isView ? 'disabled' : ''}>
                
                <span class="shot-field-nom">Type de plan</span>
                <select class="shot-input" onchange="app.Storyboard.updateShot('${shot.id}', 'shotType', this.value)" ${isView ? 'disabled' : ''}>
                    <option value="">Type de plan...</option>
                    ${CONFIG.shotTypes.map(t => `<option value="${t}" ${shot.shotType === t ? 'selected' : ''}>${t}</option>`).join('')}
                </select>
                
                <span class="shot-field-nom" title="Mouvement de caméra">Mvt de caméra</span>
                <select class="shot-input" onchange="app.Storyboard.updateShot('${shot.id}', 'cameraMove', this.value)" ${isView ? 'disabled' : ''}>
                    <option value="">Mouvement...</option>
                    ${CONFIG.cameraMoves.map(m => `<option value="${m}" ${shot.cameraMove === m ? 'selected' : ''}>${m}</option>`).join('')}
                </select>
                
                <span class="shot-field-nom">Prise de vue</span>
                <select class="shot-input" onchange="app.Storyboard.updateShot('${shot.id}', 'cameraMode', this.value)" ${isView ? 'disabled' : ''}>
                    <option value="">Mode caméra...</option>
                    ${CONFIG.cameraModes.map(m => `<option value="${m}" ${shot.cameraMode === m ? 'selected' : ''}>${m}</option>`).join('')}
                </select>
            </div>
            
            <span class="shot-field-nom">Description du plan</span>
            <textarea class="shot-textarea" placeholder="Description du plan..." data-tooltip="Description du plan..." 
                onchange="app.Storyboard.updateShot('${shot.id}', 'description', this.value)" ${isView ? 'disabled' : ''}>${shot.description || ''}</textarea>
            
            <span class="shot-field-nom">Direction des acteurs</span>
            <textarea class="shot-textarea" placeholder="Direction des acteurs..." data-tooltip="Direction des acteurs..." 
                onchange="app.Storyboard.updateShot('${shot.id}', 'actorDirection', this.value)" ${isView ? 'disabled' : ''}>${shot.actorDirection || ''}</textarea>
            
            <span class="shot-field-nom">Direction technique</span>
            <textarea class="shot-textarea" placeholder="Direction technique..." data-tooltip="Direction technique..." 
                onchange="app.Storyboard.updateShot('${shot.id}', 'technicalDirection', this.value)" ${isView ? 'disabled' : ''}>${shot.technicalDirection || ''}</textarea>
        `;
        
        // Render drawing preview if exists
        setTimeout(() => {
            const c1 = Storyboard.contenuPlan(shot);
            if(c1.calques) {
                const canvas = document.getElementById(`preview-${shot.id}`);
                if(canvas) {
                    const ctx = canvas.getContext('2d');
                    DrawingEditor.renderDrawingData(ctx, c1.calques, `preview-${shot.id}`);
                }
            }
            
            // Phase 4B v2 : rendre les objets de la zone Original (images insérées + autres)
            // Délai léger pour laisser le temps aux Image.onload des SVG/images de s'amorcer
            setTimeout(() => {
                const previewCanvas = document.getElementById(`preview-${shot.id}`);
                if(previewCanvas) {
                    const pctx = previewCanvas.getContext('2d');
                    const originalZone = shot.drawings && shot.drawings.original;
                    if(originalZone && Array.isArray(originalZone.objects) && originalZone.objects.length > 0) {
                        Storyboard.renderObjectsOnCanvas(pctx, originalZone.objects);
                        // v599 : les objets IMAGE par le chemin de l'apercu, seul
                        // a savoir atteindre un media du bucket prive.
                        Storyboard.dessinerObjetsImage('preview-' + shot.id, originalZone.objects);
                    }
                }
            }, 150);
            
            // Phase 1 Storyboard : rendu de l'overlay (zones sémantiques visibles)
            const overlayCanvas = document.getElementById(`overlay-${shot.id}`);
            if(overlayCanvas) {
                const octx = overlayCanvas.getContext('2d');
                octx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
                const overlayKinds = ['lighting', 'camera', 'actors'];
                overlayKinds.forEach(k => {
                    if(!vis[k] || !zoneHas[k]) return;
                    const zone = shot.drawings && shot.drawings[k];
                    if(!zone) return;
                    if(zone.imageType === 'upload' && zone.imageUrl) {
                        const im = new Image();
                        // [Phase C.2.6 fix] crossOrigin obligatoire pour pouvoir convertir le canvas en PDF
                        if(typeof zone.imageUrl === 'string' && zone.imageUrl.startsWith('http')) im.crossOrigin = 'anonymous';
                        im.onload = () => { octx.drawImage(im, 0, 0, overlayCanvas.width, overlayCanvas.height); };
                        im.src = Utils.signedUrlFor(zone.imageUrl);
                    } else if(zone.drawingData) {
                        DrawingEditor.renderDrawingData(octx, zone.drawingData);
                    }
                });
                
                // Phase 3 Storyboard : rendre les objets vectoriels par-dessus les images pixel
                // (délai léger pour laisser le temps aux Image.onload de s'exécuter)
                setTimeout(() => {
                    overlayKinds.forEach(k => {
                        if(!vis[k] || !zoneHas[k]) return;
                        const zone = shot.drawings && shot.drawings[k];
                        if(zone && Array.isArray(zone.objects) && zone.objects.length > 0) {
                            Storyboard.renderObjectsOnCanvas(octx, zone.objects);
                        }
                    });
                }, 150);
            }
        }, 100);
        
        return card;
    },
    
    addShot: () => {
        if(state.currentRole === 'viewer') return;
        if(state.currentRole !== 'owner' && !Permissions.canEdit('storyboard')) {
            Utils.toast('Vous n\'avez pas la permission de modifier le storyboard.', 'error');
            return;
        }
        if(!Storyboard.currentSceneId) return;
        
        // [Phase D - Bug 3] Sécurité : empêcher l'ajout de plans pour une scène non validée
        const targetScene = state.data.scenes.find(s => s.id === Storyboard.currentSceneId);
        if(targetScene && targetScene.isFinal !== true) {
            Utils.toast('Validez la scène avant d\'ajouter des plans', 'warning');
            return;
        }
        
        const existingShots = state.data.shots.filter(s => s.sceneId === Storyboard.currentSceneId);
        const maxOrder = existingShots.length > 0 ? Math.max(...existingShots.map(s => s.order)) : -1;
        
        const newShot = {
            id: Utils.generateUniqueId(),
            sceneId: Storyboard.currentSceneId,
            order: maxOrder + 1,
            name: '',
            imageType: null,
            imageUrl: null,
            drawingData: null,
            // Nouvelles zones d'annotation indépendantes (Phase 1)
            // Chaque zone : null OU { imageType: 'drawing'|'upload', imageUrl: ..., drawingData: {...} }
            drawings: {
                original: null,  // dessin du réa (clone de drawingData/imageUrl à la migration)
                lighting: null,  // 💡 chef op
                camera: null,    // 🎥 cadreur
                actors: null     // 🎭 réa/chorégraphe
            },
            // Visibilité par défaut des calques (vue lecture)
            drawingsVisibility: {
                original: true,
                lighting: false,
                camera: false,
                actors: false
            },
            shotType: '',
            cameraMove: '',
            cameraMode: '',
            description: '',
            actorDirection: '',
            technicalDirection: '',
            isDirty: false,
            lastModified: Date.now()
        };
        
        state.data.shots.push(newShot);
        const scene = state.data.scenes.find(s => s.id === Storyboard.currentSceneId);
        History.log('ADD', `Ajout plan storyboard : ${scene?.title || 'Scène inconnue'}`, { target: { kind: 'shot', id: newShot.id, label: scene?.title || 'Plan' }, link: { kind: 'shot', id: newShot.id, sceneId: Storyboard.currentSceneId } });
        Store.save();
        Storyboard.renderShots();
        Storyboard.renderScenesList();
    },
    
    // Duplique un plan existant (calques, objets, textes) — placé à la fin de
    // la même scène plutôt qu'immédiatement après l'original, pour éviter de
    // devoir décaler l'ordre de tous les plans suivants.
    duplicateShot: (shotId) => {
        if(state.currentRole === 'viewer' || !Permissions.canEdit('storyboard')) return;
        const original = state.data.shots.find(s => s.id === shotId);
        if(!original) return;
        
        const existingShots = state.data.shots.filter(s => s.sceneId === original.sceneId);
        const maxOrder = existingShots.length > 0 ? Math.max(...existingShots.map(s => s.order)) : -1;
        
        const copy = JSON.parse(JSON.stringify(original));
        copy.id = Utils.generateUniqueId();
        copy.order = maxOrder + 1;
        copy.lastModified = Date.now();
        
        state.data.shots.push(copy);
        const scene = state.data.scenes.find(s => s.id === original.sceneId);
        History.log('ADD', `Duplication plan storyboard : ${scene?.title || 'Scène inconnue'}`, { target: { kind: 'shot', id: copy.id, label: scene?.title || 'Plan' }, link: { kind: 'shot', id: copy.id, sceneId: original.sceneId } });
        Store.save();
        Storyboard.renderShots();
        Storyboard.renderScenesList();
        Utils.toast('Plan dupliqué', 'success');
    },
    
    // v595 : petit filet de rattrapage apres suppression d'un plan — le plan
    // complet (calques, objets dessines) reste en memoire 8s, avec un toast
    // "Annuler". Passe ce delai, seul le journal (recoverable, partiel) permet
    // de recuperer manuellement le contenu.
    _lastDeletedShot: null,
    _lastDeletedShotTimer: null,
    undoDeleteShot: () => {
        const pending = Storyboard._lastDeletedShot;
        if(!pending) return;
        clearTimeout(Storyboard._lastDeletedShotTimer);
        Storyboard._lastDeletedShot = null;
        const idx = (pending.index >= 0 && pending.index <= state.data.shots.length) ? pending.index : state.data.shots.length;
        state.data.shots.splice(idx, 0, pending.shot);
        Store.save();
        Storyboard.renderShots();
        Storyboard.renderScenesList();
        const toastEl = document.getElementById('shot-undo-toast');
        if(toastEl) toastEl.remove();
        Utils.toast('Plan restauré', 'success');
    },
    
    deleteShot: async (shotId, event) => {
        if(event) event.stopPropagation();
        if(state.currentRole === 'viewer' || !Permissions.canEdit('storyboard')) return;
        if(!await ConfirmModal.confirmDelete("Ce plan sera définitivement supprimé.")) return;
        
        const shot = state.data.shots.find(s => s.id === shotId);
        const shotIndex = state.data.shots.findIndex(s => s.id === shotId);
        const scene = state.data.scenes.find(s => s.id === shot?.sceneId);
        
        // [Phase D] Capturer le contenu récupérable AVANT suppression (médias gardés dans le journal)
        // On ne supprime plus immédiatement les fichiers Storage : ils seront nettoyés via cleanupExpiredEntry
        const logId = 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        const recoverable = shot ? await History.captureRecoverable(shot, 'shot', logId) : null;
        // Compléter avec le contexte de la scène
        if(recoverable && scene) {
            recoverable.metadata = recoverable.metadata || {};
            recoverable.metadata.sceneTitle = scene.title;
        }
        
        state.data.shots = state.data.shots.filter(s => s.id !== shotId);
        History.log('DELETE', `Suppression plan storyboard : ${scene?.title || 'Scène inconnue'}`, {
            target: { kind: 'shot', id: shotId, label: scene?.title || 'Plan' },
            recoverable: recoverable
        });
        Store.save();
        Storyboard.renderShots();
        Storyboard.renderScenesList();
        
        // Petit toast "Annuler" (8s) — voir undoDeleteShot ci-dessus
        Storyboard._lastDeletedShot = shot ? { shot: JSON.parse(JSON.stringify(shot)), index: shotIndex } : null;
        clearTimeout(Storyboard._lastDeletedShotTimer);
        const existingToast = document.getElementById('shot-undo-toast');
        if(existingToast) existingToast.remove();
        if(Storyboard._lastDeletedShot) {
            const container = document.getElementById('toast-container');
            if(container) {
                const toast = document.createElement('div');
                toast.id = 'shot-undo-toast';
                toast.className = 'toast info';
                toast.innerHTML = `
                    <span class="toast-icon">🗑️</span>
                    <span class="toast-message">Plan supprimé</span>
                    <button onclick="app.Storyboard.undoDeleteShot()" style="padding:3px 10px; background:var(--primary); color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:0.85rem; margin-left:6px;">↩️ Annuler</button>
                    <button class="toast-close" onclick="this.parentElement.remove()">✖</button>
                `;
                container.appendChild(toast);
            }
            Storyboard._lastDeletedShotTimer = setTimeout(() => {
                Storyboard._lastDeletedShot = null;
                const t = document.getElementById('shot-undo-toast');
                if(t) t.remove();
            }, 8000);
        }
    },
    
    updateShot: (shotId, field, value) => {
        if(state.currentRole === 'viewer' || !Permissions.canEdit('storyboard')) return;
        
        const shot = state.data.shots.find(s => s.id === shotId);
        if(shot) {
            shot[field] = value;
            shot.lastModified = Date.now();
            Store.save();
        }
    },
    
    // ===================== IMAGES & OBJETS CANVAS =====================
    // Phase 3 Storyboard : dessine les objets vectoriels (emojis pré-remplis) sur un canvas context
    // Phase 4B : cache d'images SVG pour le rendu canvas
    // Convertir un SVG en Image() coûte ~5ms, donc on le fait une fois et on réutilise.
    // Map type → { img: HTMLImageElement, ready: boolean }
    _svgImageCache: {},
    
    // Phase 4B : retourne l'image SVG d'un type d'objet (lazy-loaded, déclenche redraw quand prête)
    // Stratégie :
    //  - Si déjà chargée : retourne l'image
    //  - Si en cours de chargement : retourne null (l'image apparaîtra au prochain redraw)
    //  - Si jamais demandée : lance le chargement et retourne null
    getOrCreateSvgImage: (type, color) => {
        // Clé de cache = type + couleur (au cas où on veut différentes couleurs plus tard)
        const cacheKey = type + '|' + (color || 'currentColor');
        let entry = Storyboard._svgImageCache[cacheKey];
        if(entry && entry.ready) return entry.img;
        if(entry && !entry.ready) return null;  // En cours de chargement
        
        // Trouver le SVG dans le catalogue
        const def = (CONFIG.annotationObjects || []).find(o => o.type === type);
        if(!def || !def.svg) return null;
        
        // Préparer le SVG : remplacer "currentColor" par la couleur souhaitée si fournie
        let svgString = def.svg;
        if(color && color !== 'currentColor') {
            svgString = svgString.replace(/currentColor/g, color);
        } else {
            // Par défaut, on utilise une couleur visible (noir ou blanc selon le contexte)
            svgString = svgString.replace(/currentColor/g, '#222');
        }
        
        // Phase 4B fix : certains navigateurs exigent xmlns sur la balise <svg> pour rendre
        // un blob SVG en image. On l'injecte si absent (compatibilité Firefox stricte).
        if(!svgString.includes('xmlns=')) {
            svgString = svgString.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
        }
        
        // Créer l'image et déclencher le chargement
        const blob = new Blob([svgString], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const img = new Image();
        Storyboard._svgImageCache[cacheKey] = { img: img, ready: false };
        
        img.onload = () => {
            Storyboard._svgImageCache[cacheKey].ready = true;
            URL.revokeObjectURL(url);
            // Déclencher un redraw pour afficher l'image maintenant qu'elle est prête
            // (DrawingEditor + Storyboard listings)
            try {
                if(typeof DrawingEditor !== 'undefined' && DrawingEditor.redraw) DrawingEditor.redraw();
                Storyboard.planifierRepeinteVignettes();
            } catch(_) { /* silent */ }
        };
        img.onerror = () => {
            console.warn('[Storyboard] Erreur chargement SVG pour type:', type);
            URL.revokeObjectURL(url);
            // Marquer comme prêt mais avec une image cassée pour éviter de re-tenter en boucle
            Storyboard._svgImageCache[cacheKey].ready = true;
            Storyboard._svgImageCache[cacheKey].failed = true;
        };
        img.src = url;
        
        return null;  // L'image n'est pas encore prête, retour null
    },
    
    // Phase 4B v2 : retourne l'image d'un objet de type 'image' (lazy-loaded)
    // Identique à getOrCreateSvgImage mais utilise imageData (data URL base64) au lieu d'un type SVG.
    // La clé du cache est l'ID de l'objet pour éviter d'utiliser le data URL géant comme clé.
    // v599 — REPEINTE DIFFEREE DES VIGNETTES. Une image-objet qui finit de
    // charger doit faire redessiner la liste des plans : sans cela, le
    // remplacant en pointilles dessine a sa place y reste POUR TOUJOURS.
    // Le declencheur existait, mais il etait garde par
    // « state.currentShotId === null ». Or state.currentShotId N'EXISTE PAS :
    // seuls DrawingEditor.currentShotId et ScriptReport.currentShotId sont
    // poses quelque part dans le code. La condition valait donc
    // undefined === null, soit FAUX en permanence, et la repeinte ne partait
    // JAMAIS. D'ou des miniatures vides jusqu'a ce qu'un autre evenement
    // redessine la liste — typiquement l'ouverture puis la fermeture d'une
    // fiche de plan, apres quoi toutes les images apparaissaient d'un coup.
    // La bonne condition est : ne pas redessiner la liste pendant qu'on EDITE
    // un plan. Et on coalesce, sinon dix images arrivant ensemble
    // provoqueraient dix redessins complets.
    _repeinteTimer: null,
    _repeintes: 0,
    planifierRepeinteVignettes: () => {
        // v599 : la condition « pas pendant l'edition d'un plan », ajoutee au
        // passage precedent, est retiree. Redessiner la liste pendant qu'une
        // fenetre de dessin est ouverte est sans consequence — elle vit dans
        // une autre partie de la page — alors qu'une condition de trop est un
        // frein possible de plus, et c'est exactement ce genre de garde qui
        // avait deja desactive cette repeinte en silence.
        if(!document.getElementById('sbShotsList')) return;
        if(Storyboard._repeinteTimer) return;
        Storyboard._repeinteTimer = setTimeout(() => {
            Storyboard._repeinteTimer = null;
            Storyboard._repeintes++;
            try { Storyboard.renderShots(); } catch(e) {}
        }, 120);
    },

    getOrCreateUploadedImage: (objectId, imageData) => {
        const cacheKey = 'uploaded|' + objectId;
        let entry = Storyboard._svgImageCache[cacheKey];
        if(entry && entry.ready) return entry.failed ? null : entry.img;
        if(entry && !entry.ready) return null;
        
        if(!imageData) return null;

        // v599 — NE PAS BRULER L'UNIQUE TENTATIVE. signedUrlFor rend le CHEMIN
        // BRUT tant que l'URL n'est pas signee. Le poser en src depuis une page
        // ouverte en local donne une adresse relative, qui echoue — et l'echec
        // etait memorise DEFINITIVEMENT (failed: true), si bien que l'image ne
        // s'affichait plus jamais, meme une fois la signature disponible. On
        // s'abstient donc, sans rien mettre en cache : le rendu suivant
        // reessaiera, cette fois avec une vraie URL.
        // v599 — DEUX CHEMINS, car le diagnostic a montre que l'URL signee
        // n'etait PAS disponible pour ces images : aucune entree n'apparaissait
        // dans le cache, et la liste n'etait jamais repeinte.
        //  1. URL directement utilisable (http, data:, blob:) -> on la pose ;
        //  2. sinon, si c'est un chemin de projet, on TELECHARGE le fichier par
        //     le SDK (authentifie, sans passer par une signature) et on dessine
        //     depuis une URL blob locale. C'est le meme chemin que celui des
        //     calques de dessin, qui eux s'affichaient correctement — d'ou
        //     l'idee de ne plus dependre de la signature ici non plus.
        // Rien d'exploitable du tout -> on rend null SANS mettre en cache, le
        // rendu suivant reessaiera (ne jamais bruler l'unique tentative).
        const chemin = Utils._projPathFrom(imageData);
        const url = Utils.signedUrlFor(imageData);
        // v599 — UNE URL DE MEDIA PROJET N'EST JAMAIS POSEE TELLE QUELLE.
        // Le bucket 'projects' est PRIVE : une adresse de forme
        // /object/public/ y est toujours refusee. Or signedUrlFor rend la
        // valeur stockee inchangee quand la signature n'est pas en cache — un
        // repli qui, ici, est garanti de rater. On brulait l'unique tentative
        // dessus, et l'image etait marquee ratee DEFINITIVEMENT.
        // Donc : media projet -> URL signee si le cache a repondu, sinon
        // telechargement par le SDK. Les autres adresses (data:, blob:, site
        // externe) restent posees directement.
        // v601 — UN MEDIA DE PROJET PASSE TOUJOURS PAR LE TELECHARGEMENT, PLUS
        // JAMAIS PAR L'URL SIGNEE. C'est ce qui empechait les images inserees
        // dans l'editeur de sortir a l'export, alors que les CALQUES de dessin
        // sortaient : les calques passent par _loadPrintImg, donc par une URL
        // blob de MEME ORIGINE ; les images-objets, elles, etaient posees depuis
        // l'URL signee du stockage, une autre origine.
        // Dessiner une image d'une autre origine dans un canvas ne rate PAS —
        // l'image s'affiche tres bien a l'ecran — mais elle SOUILLE le canvas :
        // le navigateur interdit ensuite d'en RELIRE le contenu. Or c'est
        // exactement ce que fait html2canvas pour fabriquer la page du PDF. D'ou
        // une planche vide, sans erreur visible, alors que la vignette de
        // l'onglet, elle, s'affichait parfaitement.
        // Une URL blob vient de la page elle-meme : elle ne souille rien.
        const utilisable = chemin
            ? false
            : (typeof url === 'string' && (url.startsWith('http') || url.startsWith('data:') || url.startsWith('blob:')));
        if(!utilisable && !chemin) return null;

        const img = new Image();
        // Adresse EXTERIEURE (image posee par un outil tiers) : on demande le
        // partage d'origine, sans quoi elle souillerait le canvas comme
        // ci-dessus. Si le serveur refuse, l'image ne se chargera pas du tout —
        // c'est un echec franc, prefere a une planche vide inexpliquee.
        if(utilisable && typeof url === 'string' && url.startsWith('http')) {
            img.crossOrigin = 'anonymous';
        }
        Storyboard._svgImageCache[cacheKey] = { img: img, ready: false };
        
        img.onload = () => {
            Storyboard._svgImageCache[cacheKey].ready = true;
            try {
                if(typeof DrawingEditor !== 'undefined' && DrawingEditor.redraw) DrawingEditor.redraw();
                Storyboard.planifierRepeinteVignettes();
            } catch(_) { /* silent */ }
        };
        img.onerror = () => {
            console.warn('[Storyboard] Erreur chargement image-objet pour id:', objectId);
            Storyboard._svgImageCache[cacheKey].ready = true;
            Storyboard._svgImageCache[cacheKey].failed = true;
        };
        if(utilisable) {
            img.src = url;
        } else {
            // Pas d'URL signee : on telecharge le fichier par le SDK et on
            // dessine depuis une URL blob locale — le chemin qui fonctionne
            // deja pour les calques de dessin.
            StoryboardExport._resolveBlobUrl(imageData).then(blobUrl => {
                if(blobUrl) { img.src = blobUrl; return; }
                // Telechargement impossible : on RETIRE l'entree plutot que de
                // la marquer ratee, pour laisser sa chance au rendu suivant.
                delete Storyboard._svgImageCache[cacheKey];
            }).catch(() => { delete Storyboard._svgImageCache[cacheKey]; });
        }
        
        return null;
    },
    
    // Phase 4B : rendu canvas des objets via SVG (avec fallback emoji si SVG pas encore chargé)
    // Chaque objet : { type, x, y, scale?, rotation? } — type doit correspondre à un CONFIG.annotationObjects[].type
    // v599 — DESSIN DES OBJETS IMAGE PAR LE CHEMIN EPROUVE.
    // Constat de l'utilisateur, decisif : « Mini Apercu » et « Apercu Plein
    // Ecran » affichent bien ces images. Or l'apercu passe par
    // StoryboardExport._loadPrintImg, qui telecharge les medias du bucket PRIVE
    // en blob via le SDK. Les vignettes, elles, passaient par
    // getOrCreateUploadedImage et son cache, qui dependait d'une URL signee —
    // et echouaient. Plutot que de continuer a reparer ce second chemin, on
    // reprend ici EXACTEMENT celui de l'apercu.
    // Le canvas est retrouve au moment de peindre (et non capture avant), pour
    // survivre a un redessin de la liste entre le depart du telechargement et
    // son arrivee. La transformation reproduit celle de renderObjectsOnCanvas :
    // translation au centre de l'objet, rotation, puis dessin centre.
    dessinerObjetsImage: (canvasId, objects) => {
        const images = (objects || []).filter(o => o && o.type === 'image' && o.imageData);
        if(!images.length || typeof StoryboardExport === 'undefined' || !StoryboardExport._loadPrintImg) return;
        images.forEach(obj => {
            const img = new Image();
            StoryboardExport._loadPrintImg(img, obj.imageData, () => {
                const c = document.getElementById(canvasId);
                if(!c) return;
                const ctx = c.getContext('2d');
                const scale = obj.scale || 1;
                const w = (obj.width || 100) * scale;
                const h = (obj.height || 100) * scale;
                ctx.save();
                ctx.translate(obj.x || 0, obj.y || 0);
                if(obj.rotation) ctx.rotate(obj.rotation * Math.PI / 180);
                ctx.drawImage(img, -w / 2, -h / 2, w, h);
                ctx.restore();
            });
        });
    },

    renderObjectsOnCanvas: (ctx, objects) => {
        if(!ctx || !Array.isArray(objects) || objects.length === 0) return;
        const catalog = CONFIG.annotationObjects || [];
        const baseSize = 48;  // Taille de référence d'un objet à scale=1 (en px sur canvas 800x600)
        
        objects.forEach(obj => {
            if(!obj || !obj.type) return;
            const def = catalog.find(d => d.type === obj.type);
            const x = obj.x || 0;
            const y = obj.y || 0;
            const scale = obj.scale || 1;
            const rotation = obj.rotation || 0;
            
            ctx.save();
            ctx.translate(x, y);
            if(rotation) ctx.rotate(rotation * Math.PI / 180);
            
            // Phase 4B v2 : type 'image' = objet image utilisateur (avec width/height natives stockées)
            if(obj.type === 'image') {
                const img = Storyboard.getOrCreateUploadedImage(obj.id, obj.imageData);
                if(img) {
                    const w = (obj.width || 100) * scale;
                    const h = (obj.height || 100) * scale;
                    ctx.drawImage(img, -w / 2, -h / 2, w, h);
                } else {
                    // Image en cours de chargement : afficher un placeholder discret
                    ctx.strokeStyle = '#888';
                    ctx.lineWidth = 1;
                    ctx.setLineDash([4, 4]);
                    const w = (obj.width || 100) * scale;
                    const h = (obj.height || 100) * scale;
                    ctx.strokeRect(-w / 2, -h / 2, w, h);
                    ctx.setLineDash([]);
                    ctx.fillStyle = '#888';
                    ctx.font = '12px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('Chargement…', 0, 0);
                }
            } else {
                // Phase 4B : SVG en priorité, fallback emoji
                const size = baseSize * scale;
                const img = (def && def.svg) ? Storyboard.getOrCreateSvgImage(obj.type) : null;
                if(img) {
                    ctx.drawImage(img, -size / 2, -size / 2, size, size);
                } else {
                    const emoji = def ? def.emoji : '❓';
                    ctx.font = size + 'px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(emoji, 0, 0);
                }
            }
            
            ctx.restore();
        });
    },
    
    // Phase 1 Storyboard : inverse l'état de visibilité d'une zone sémantique sur un plan
    toggleDrawingVisibility: (shotId, kind) => {
        const validKinds = ['lighting', 'camera', 'actors'];
        if(!validKinds.includes(kind)) return;
        
        const shot = state.data.shots.find(s => s.id === shotId);
        if(!shot) return;
        
        // Si la zone est vide, ne rien faire (le bouton est désactivé visuellement)
        // Phase 4B v2 : aussi considérer la présence d'objets/images insérées comme une annotation
        const zone = shot.drawings && shot.drawings[kind];
        const hasPixels = !!(zone && (zone.drawingData || zone.imageUrl));
        const hasObjects = !!(zone && Array.isArray(zone.objects) && zone.objects.length > 0);
        if(!hasPixels && !hasObjects) {
            Utils.toast(`Aucune annotation ${kind} pour ce plan`, 'info');
            return;
        }
        
        if(!shot.drawingsVisibility) {
            shot.drawingsVisibility = { original: true, lighting: false, camera: false, actors: false };
        }
        shot.drawingsVisibility[kind] = !shot.drawingsVisibility[kind];
        
        Store.save();
        
        // Rafraîchir l'affichage : on re-render la grille storyboard et la modale d'édition si ouverte
        Storyboard.renderShots();
        if(Storyboard.currentEditingShotId === shotId) {
            Storyboard.refreshEditModal(shotId);
        }
    },
    
    chooseDrawing: (shotId) => {
        const menuEl = document.getElementById('image-menu-modal');
        if(menuEl) menuEl.remove();
        // v616 : plus de callback ici. Avec un callback, DrawingEditor.close()
        // prenait la branche "retourner l'image via callback" (prévue pour le
        // Mood Board) au lieu de committer le dessin par calques — le callback
        // ne faisait qu'un rafraîchissement d'affichage, sans jamais écrire
        // shot.drawings. Un calque supprimé n'était donc RÉELLEMENT retiré
        // nulle part : à la réouverture, l'ancien dessin revenait toujours.
        // Sans callback, close() reconnaît qu'on est dans "Édition Plan" (via
        // Storyboard.currentEditingShotId) et committe correctement.
        DrawingEditor.open(shotId, null, 'original');
    },
    
    // Phase 1 Storyboard : ouvre l'éditeur sur une zone sémantique (lumière/caméra/acteurs)
    // Phase 2 Storyboard : vérifie la permission storyboard_<kind> avant d'ouvrir
    chooseAnnotation: (shotId, kind) => {
        const menuEl = document.getElementById('image-menu-modal');
        if(menuEl) menuEl.remove();
        
        const validKinds = ['lighting', 'camera', 'actors'];
        if(!validKinds.includes(kind)) return;
        
        // Phase 2 : vérification de permission avant ouverture
        const permKey = 'storyboard_' + kind;
        if(state.currentRole !== 'owner' && !Permissions.canEdit(permKey)) {
            const labels = { lighting: 'Lumière', camera: 'Caméra', actors: 'Acteurs' };
            Utils.toast(`Permission insuffisante pour éditer la zone ${labels[kind]}.`, 'error');
            return;
        }
        
        // Activer automatiquement la visibilité de cette zone après édition
        const shot = state.data.shots.find(s => s.id === shotId);
        if(shot) {
            if(!shot.drawingsVisibility) {
                shot.drawingsVisibility = { original: true, lighting: false, camera: false, actors: false };
            }
            shot.drawingsVisibility[kind] = true;
        }
        
        // v616 : voir le commentaire de chooseDrawing ci-dessus — plus de callback.
        DrawingEditor.open(shotId, null, kind);
    },
    
    // ===================== MODALE D'ÉDITION DE PLAN =====================
    currentEditingShotId: null,
    
    openEditModal: (shotId) => {
        // 31 aout — meme correction que la fiche Ressource : le refus sec
        // « viewer » empechait de REGARDER un plan. On ouvre, et c'est le droit
        // de la section Storyboard qui decide si l'on peut y ecrire.
        if(typeof Permissions !== 'undefined' && Permissions.canOpenFiche && !Permissions.canOpenFiche('shot')) return;
        const roShot = (typeof Permissions !== 'undefined' && Permissions.canEditFiche)
            ? !Permissions.canEditFiche('shot') : (state.currentRole === 'viewer');
        
        const shot = state.data.shots.find(s => s.id === shotId);
        if(!shot) return;
        // v601 — ON PREVIENT AVANT D'ENTRER. Un plan tenu par quelqu'un d'autre
        // ne s'ouvre pas : le cadenas se voit DEHORS, sur la vignette.
        // En lecture seule (roShot) on ouvre quand meme : regarder ne gene rien.
        if(!roShot) {
            try { if(typeof FicheLock !== 'undefined'
                     && FicheLock.ouvrir('shot', shot.id, 'Ce plan') === false) return; } catch(e) {}
        }
        Storyboard.currentEditingShotId = shotId;
        
        const sceneIndex = state.data.scenes.findIndex(s => s.id === shot.sceneId) + 1;
        const shotIndex = state.data.shots.filter(s => s.sceneId === shot.sceneId && s.order <= shot.order).length;
        
        document.getElementById('shotEditTitle').innerText = roShot
            ? `\u{1F441} Plan ${sceneIndex}.${shotIndex} (lecture seule)`
            : `Édition Plan ${sceneIndex}.${shotIndex}`;
        
        const content = document.getElementById('shotEditContent');
        content.innerHTML = Storyboard.createShotCard(shot, shotIndex - 1).innerHTML;
        // v601 — LA FENETRE D'EDITION D'UN PLAN PORTE SON IDENTIFIANT, et le
        // verrou se prend en l'OUVRANT. Elle reprend le dessin de la vignette
        // par son CONTENU (.innerHTML) : l'enveloppe de la vignette, qui
        // portait l'identifiant, restait donc dehors. Deux personnes pouvaient
        // ouvrir le meme plan sans que rien ne s'allume — c'est ce que le
        // developpeur a vu.
        content.dataset.fiche = 'shot:' + shot.id;
        // Verrou visuel + bouton de sauvegarde masque : un bouton qui ne peut
        // rien enregistrer vaut mieux cache qu'affiche.
        content.classList.add('perm-ro-scope');
        content.classList.toggle('is-perm-readonly', roShot);
        const saveBtn = document.getElementById('shotEditSaveBtn');
        if(saveBtn) saveBtn.style.display = roShot ? 'none' : '';
        
        // Setup change detection
        content.querySelectorAll('input, textarea, select').forEach(input => {
            input.addEventListener('change', () => {
                Storyboard.markAsDirty();
            });
        });
        
        document.getElementById('shot-edit-modal').classList.add('active');
    },
    
    closeEditModal: async () => {
        const saveBtn = document.getElementById('shotEditSaveBtn');
        
        if(saveBtn.classList.contains('visible')) {
            if(!await ConfirmModal.show({ title: 'Modifications non sauvegardées', message: 'Vous avez des modifications non sauvegardées.\n\nFermer quand même ?', icon: '⚠️', dangerous: true, confirmText: 'Fermer sans sauvegarder', cancelText: 'Annuler' })) {
                return;
            }
        }
        
        Utils.fermetureDouce(document.getElementById('shot-edit-modal'), 'active');
        Storyboard.currentEditingShotId = null;
        Storyboard.renderShots();
    },
    
    refreshEditModal: (shotId) => {
        const shot = state.data.shots.find(s => s.id === shotId);
        if(!shot) return;
        
        const sceneIndex = state.data.scenes.findIndex(s => s.id === shot.sceneId) + 1;
        const shotIndex = state.data.shots.filter(s => s.sceneId === shot.sceneId && s.order <= shot.order).length;
        
        const content = document.getElementById('shotEditContent');
        content.innerHTML = Storyboard.createShotCard(shot, shotIndex - 1).innerHTML;
        content.dataset.fiche = 'shot:' + shot.id;   // v601 : le redessin garde la marque
        
        // Re-setup change detection
        content.querySelectorAll('input, textarea, select').forEach(input => {
            input.addEventListener('change', () => {
                Storyboard.markAsDirty();
            });
        });
    },
    
    markAsDirty: () => {
        const shot = state.data.shots.find(s => s.id === Storyboard.currentEditingShotId);
        if(shot) {
            shot.isDirty = true;
        }
        
        document.getElementById('shotEditSaveBtn').classList.add('visible');
    },
    
    saveCurrentShot: () => {
        // Griser n'est qu'un affichage : l'enregistrement verifie lui aussi.
        if(typeof Permissions !== 'undefined' && Permissions.canEditFiche && !Permissions.canEditFiche('shot')) {
            Utils.toast("Vous n'avez pas les droits de modification sur le storyboard.", 'error');
            return;
        }
        const shot = state.data.shots.find(s => s.id === Storyboard.currentEditingShotId);
        if(!shot) return;
        
        shot.isDirty = false;
        shot.lastModified = Date.now();
        
        Store.save();
        
        document.getElementById('shotEditSaveBtn').classList.remove('visible');
        
        Utils.toast('Plan sauvegardé !', 'success');
        
        Storyboard.closeEditModal();
    },
	
	// ===================== VUES & CONFIG D'IMPRESSION =====================
	currentView: 'edit',
    printConfig: {
        layout: 'standard',
        shotNumber: true,
        shotType: true,
        cameraMove: true,
        cameraMode: true,
        description: true,
        actorDirection: true,
        techDirection: true,
        sceneTitle: true,
        techLayer: 'none' // [Phase C.2.6] 'none' | 'lighting' | 'camera' | 'actors'
    },
    
    // Extraire l'acronyme entre parenthèses, ex: "Gros plan (GP)" → "GP"
    extractAcronym: (value) => {
        if(!value) return '';
        const match = value.match(/\(([^)]+)\)/);
        return match ? match[1] : value;
    },
    
    switchView: (view) => {
        Storyboard.currentView = view;
        
        document.querySelectorAll('.sb-toggle-btn').forEach(btn => btn.classList.remove('active'));
        event.target.classList.add('active');
        
        if(view === 'edit') {
            document.getElementById('sbEditView').style.display = 'flex';
            document.getElementById('sbPrintPreview').classList.remove('active');
        } else if(view === 'preview') {
            document.getElementById('sbEditView').style.display = 'none';
            document.getElementById('sbPrintPreview').classList.add('active');
            Storyboard.renderPrintPreview('sbPrintPreview');
        }
    },
    
    // Modale d'options d'export (meme modele que les autres onglets) : page de
    // garde + mise en page + calque technique + choix des scenes + Generer.
    // Renvoie vers le hub d'export global (Fichier > Export), en ne cochant que
    // la section Storyboard : un clic ici garde le geste "export rapide de cet
    // onglet" d'avant, sans dupliquer la fenêtre d'options du hub.
    openPdfModal: () => {
        const shots = state.data.shots || [];
        if(shots.length === 0) { Utils.toast('Aucun plan à exporter', 'warning'); return; }
        Actions.openExportModal('storyboard');
        document.querySelectorAll('#export-modal .exp-section-chk').forEach(cb => {
            cb.checked = (cb.dataset.section === 'storyboard');
        });
    },
    
    openFullscreen: () => {
        document.getElementById('sbFullscreenModal').classList.add('active');
        Storyboard.renderPrintPreview('sbFullscreenContent');
    },
    
    closeFullscreen: () => {
        document.getElementById('sbFullscreenModal').classList.remove('active');
    },
    
    // ===================== IMPRESSION & EXPORT (délégué à StoryboardExport) =====================
    renderPrintPreview: (...a) => StoryboardExport.renderPrintPreview(...a),
    _drawTechLayerOnTop: (...a) => StoryboardExport._drawTechLayerOnTop(...a),
    createPrintShot: (...a) => StoryboardExport.createPrintShot(...a),
    exportPDF: (...a) => StoryboardExport.exportPDF(...a),
};
