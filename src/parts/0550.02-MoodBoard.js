
const MoodBoard = {
    // ===================== ÉTAT =====================
    currentBoardId: null,
    selectedElementId: null,
    zoom: 1,
    panX: 0,
    panY: 0,
    isPanning: false,
    panStartX: 0,
    panStartY: 0,
    isDraggingElement: false,
    isResizingElement: false,
    resizeHandle: null,
    dragOffsetX: 0,
    dragOffsetY: 0,
    
    // ===================== INIT, CANVAS & VIEWPORT =====================
    init: () => {
        MoodBoard.renderBoardsList();
        MoodBoard.setupCanvasEvents();
        MoodBoard.updateEmptyState();
    },
    
    // 31 aout — LE VERROU DE LECTURE SEULE DU MOOD BOARD. La zone centrale
    // echappe entierement au verrou CSS : elle ne fonctionne pas au clic mais a
    // la SOURIS (mousedown / deplacement / poignees), et rien de tout cela ne
    // porte d'attribut onclick. On pouvait donc deplacer, redimensionner,
    // tourner, editer le texte et ouvrir le clic droit sur un onglet en 👁️.
    // Une seule reponse, interrogee par tous les points d'entree.
    canWrite: () => {
        if(typeof Permissions === 'undefined' || !Permissions.canEdit) return true;
        if(state.currentRole === 'viewer') return false;
        return Permissions.canEdit('moodboard');
    },
    
    // Initialiser les événements du canvas
    setupCanvasEvents: () => {
        const wrapper = document.getElementById('moodboardCanvasWrapper');
        const canvas = document.getElementById('moodboardCanvas');
        if(!wrapper || !canvas) return;
        
        // Clic sur la vignette : amener ce point au centre. Ecouteur pose en
        // JS (voir le commentaire de minimapGoTo) et une seule fois, d'ou le
        // drapeau : setupCanvasEvents peut etre rappelee.
        const vignette = document.getElementById('moodboardMinimapContent');
        if(vignette && !vignette.dataset.bound) {
            vignette.dataset.bound = '1';
            vignette.addEventListener('click', (e) => MoodBoard.minimapGoTo(e));
        }
        
        // Menu radial au clic droit
        wrapper.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            // Le clic droit n'ouvre QUE des commandes d'ecriture (ajouter,
            // dupliquer, supprimer, modifier le texte) : rien a montrer en
            // lecture seule.
            if(!MoodBoard.canWrite()) return;
            const board = MoodBoard.getCurrentBoard();
            if(!board) return;
            
            // Position du clic relative au canvas
            const rect = canvas.getBoundingClientRect();
            MoodBoard.contextX = (e.clientX - rect.left - MoodBoard.panX) / MoodBoard.zoom;
            MoodBoard.contextY = (e.clientY - rect.top - MoodBoard.panY) / MoodBoard.zoom;
            
            // Vérifier si on clique sur un élément
            const clickedElement = e.target.closest('.moodboard-element');
            if(clickedElement) {
                const el = board.elements.find(o => o.id === clickedElement.dataset.id);
                if(!el || !MoodBoard._canInteract(board, el)) return;
                MoodBoard.showElementContextMenu(e.clientX, e.clientY, clickedElement.dataset.id);
            } else {
                MoodBoard.showRadialMenu(e.clientX, e.clientY);
            }
        });
        
        // Pan avec clic milieu ou espace + clic
        wrapper.addEventListener('mousedown', (e) => {
            if(e.target === canvas || e.target === wrapper) {
                if(e.button === 1 || (e.button === 0 && e.target === canvas)) {
                    MoodBoard.isPanning = true;
                    MoodBoard.panStartX = e.clientX - MoodBoard.panX;
                    MoodBoard.panStartY = e.clientY - MoodBoard.panY;
                    canvas.classList.add('dragging');
                    e.preventDefault();
                }
                // Désélectionner si clic sur canvas vide
                if(e.target === canvas) {
                    MoodBoard.selectElement(null);
                }
            }
        });
        
        wrapper.addEventListener('mousemove', (e) => {
            if(MoodBoard.isPanning) {
                MoodBoard.panX = e.clientX - MoodBoard.panStartX;
                MoodBoard.panY = e.clientY - MoodBoard.panStartY;
                MoodBoard.updateCanvasTransform();
            }
        });
        
        wrapper.addEventListener('mouseup', () => {
            MoodBoard.isPanning = false;
            canvas.classList.remove('dragging');
        });
        
        wrapper.addEventListener('mouseleave', () => {
            MoodBoard.isPanning = false;
            canvas.classList.remove('dragging');
        });
        
        // Zoom avec molette — centre sur le curseur, pas sur le coin de la planche
        wrapper.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -0.1 : 0.1;
            const newZoom = Math.max(0.1, Math.min(3, MoodBoard.zoom + delta));
            if(newZoom === MoodBoard.zoom) return;
            const rect = wrapper.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            // Point de la planche actuellement sous le curseur (avant le zoom).
            const cx = (mouseX - MoodBoard.panX) / MoodBoard.zoom;
            const cy = (mouseY - MoodBoard.panY) / MoodBoard.zoom;
            // Repositionner pour que ce meme point reste sous le curseur.
            MoodBoard.panX = mouseX - cx * newZoom;
            MoodBoard.panY = mouseY - cy * newZoom;
            MoodBoard.zoom = newZoom;
            MoodBoard.updateCanvasTransform();
            MoodBoard.updateZoomDisplay();
        });
        
        // Drag & drop fichiers
        wrapper.addEventListener('dragover', (e) => {
            e.preventDefault();
            wrapper.style.background = 'rgba(59, 130, 246, 0.1)';
        });
        
        wrapper.addEventListener('dragleave', () => {
            wrapper.style.background = '';
        });
        
        wrapper.addEventListener('drop', (e) => {
            e.preventDefault();
            wrapper.style.background = '';
            if(!MoodBoard.canWrite()) return;
            const files = e.dataTransfer.files;
            if(files.length > 0) {
                const rect = canvas.getBoundingClientRect();
                const x = (e.clientX - rect.left) / MoodBoard.zoom;
                const y = (e.clientY - rect.top) / MoodBoard.zoom;
                Array.from(files).forEach((file, i) => {
                    if(file.type.startsWith('image/')) {
                        MoodBoard.addImageFromFile(file, x + i * 20, y + i * 20);
                    }
                });
            }
        });
    },
    
    updateCanvasTransform: () => {
        const canvas = document.getElementById('moodboardCanvas');
        if(canvas) {
            canvas.style.transform = `translate(${MoodBoard.panX}px, ${MoodBoard.panY}px) scale(${MoodBoard.zoom})`;
        }
        MoodBoard.updateMinimap();
    },
    
    updateZoomDisplay: () => {
        const display = document.getElementById('moodboardZoomLevel');
        if(display) {
            display.textContent = Math.round(MoodBoard.zoom * 100) + '%';
        }
    },
    
    zoomIn: () => {
        MoodBoard.zoom = Math.min(3, MoodBoard.zoom + 0.1);
        MoodBoard.updateCanvasTransform();
        MoodBoard.updateZoomDisplay();
    },
    
    zoomOut: () => {
        MoodBoard.zoom = Math.max(0.1, MoodBoard.zoom - 0.1);
        MoodBoard.updateCanvasTransform();
        MoodBoard.updateZoomDisplay();
    },
    
    zoomReset: () => {
        MoodBoard.zoom = 1;
        MoodBoard.panX = 0;
        MoodBoard.panY = 0;
        MoodBoard.updateCanvasTransform();
        MoodBoard.updateZoomDisplay();
    },
    
    // ===== MINIMAP (1er septembre) =====
    // Elle existait en HTML et en CSS depuis le debut, mais son unique
    // fonction etait un TODO vide : on voyait un rectangle blanc dans le coin,
    // qui ne montrait jamais rien. Deux fonctions plutot qu'une, parce que les
    // deux besoins n'ont pas le meme cout :
    //   - renderMinimap() redessine les vignettes. Appelee quand le CONTENU
    //     change (rendu de la planche, fin d'un deplacement).
    //   - updateMinimap() ne fait que deplacer le cadre bleu. Appelee a chaque
    //     mouvement de souris pendant un deplacement de la planche : y
    //     reconstruire tout le HTML aurait rame sur une planche chargee.

    // Geometrie commune : ou et a quelle echelle la planche tient dans la
    // vignette. Renvoie null si l'ecran n'est pas la ou s'il n'y a pas de
    // planche ouverte.
    minimapGeometry: () => {
        const box = document.getElementById('moodboardMinimap');
        const board = MoodBoard.getCurrentBoard();
        if(!box || !board) return null;
        const bw = box.clientWidth, bh = box.clientHeight;
        if(!bw || !bh) return null;
        const dims = MoodBoard.FORMATS[board.format || 'free'] || MoodBoard.FORMATS['free'];
        const s = Math.min(bw / dims.w, bh / dims.h);
        return { board, dims, s, bw, bh, pw: dims.w * s, ph: dims.h * s,
                 ox: (bw - dims.w * s) / 2, oy: (bh - dims.h * s) / 2 };
    },

    renderMinimap: () => {
        const content = document.getElementById('moodboardMinimapContent');
        if(!content) return;
        const g = MoodBoard.minimapGeometry();

        // La page et le message d'attente sont crees une fois puis reutilises.
        // On ne touche PAS a content.innerHTML : le cadre bleu est un enfant de
        // content, le reecrire l'effacerait a chaque rendu.
        let page = document.getElementById('moodboardMinimapPage');
        if(!page) {
            page = document.createElement('div');
            page.id = 'moodboardMinimapPage';
            page.className = 'moodboard-minimap-page';
            content.insertBefore(page, content.firstChild);
        }
        let vide = document.getElementById('moodboardMinimapEmpty');
        if(!vide) {
            vide = document.createElement('div');
            vide.id = 'moodboardMinimapEmpty';
            vide.className = 'moodboard-minimap-empty';
            vide.textContent = 'Planche vide';
            content.appendChild(vide);
        }

        if(!g) { page.style.display = 'none'; vide.style.display = 'none'; return; }

        page.style.display = 'block';
        page.style.left = g.ox + 'px';
        page.style.top = g.oy + 'px';
        page.style.width = g.pw + 'px';
        page.style.height = g.ph + 'px';

        const elements = g.board.elements || [];
        vide.style.display = elements.length ? 'none' : 'flex';

        page.innerHTML = elements.map(el => {
            const x = (el.x || 0) * g.s, y = (el.y || 0) * g.s;
            // Plancher a 2 px : sous cette taille une vignette disparait, et
            // un element invisible sur la carte revient a ne pas l'avoir mis.
            const w = Math.max(2, (el.width || 0) * g.s);
            const h = Math.max(2, (el.height || 0) * g.s);
            let fond = 'background:#9ca3af;';
            if(el.type === 'image' || el.type === 'drawing') {
                // Une source contenant guillemet ou parenthese casserait le
                // url() de la feuille de style : dans ce cas on retombe sur un
                // aplat gris plutot que d'ecrire du CSS invalide.
                const src = String(el.src || '');
                fond = /["'()]/.test(src) || !src
                    ? 'background:#9ca3af;'
                    : `background-image:url(${Utils.escape(src)});background-color:#e5e7eb;`;
            } else if(el.type === 'palette') {
                const cols = (el.colors || ['#9ca3af']).filter(x => /^#[0-9a-fA-F]{3,8}$/.test(String(x)));
                fond = cols.length
                    ? `background:linear-gradient(90deg, ${cols.map((cc, i) => `${cc} ${Math.round(i * 100 / cols.length)}%, ${cc} ${Math.round((i + 1) * 100 / cols.length)}%`).join(', ')});`
                    : 'background:#9ca3af;';
            } else if(el.type === 'shape') {
                const col = String(el.color || '#374151');
                fond = /^#[0-9a-fA-F]{3,8}$/.test(col) ? `background:${col};` : 'background:#374151;';
            } else if(el.type === 'text') {
                fond = 'background:#d1d5db;';
            }
            const sel = el.id === MoodBoard.selectedElementId ? ' is-selected' : '';
            const rot = el.rotation ? `transform:rotate(${parseFloat(el.rotation) || 0}deg);` : '';
            return `<div class="moodboard-minimap-el${sel}" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px;${fond}${rot}"></div>`;
        }).join('');

        MoodBoard.updateMinimap();
    },

    updateMinimap: () => {
        const viewport = document.getElementById('moodboardMinimapViewport');
        const wrapper = document.getElementById('moodboardCanvasWrapper');
        if(!viewport || !wrapper) return;
        const g = MoodBoard.minimapGeometry();
        if(!g) { viewport.style.display = 'none'; return; }
        viewport.style.display = 'block';

        // Le canvas est pose en haut a gauche du wrapper puis transforme par
        // translate(panX, panY) scale(zoom), origine 0 0. Un point (cx, cy) de
        // la planche s'affiche donc en (panX + cx*zoom, panY + cy*zoom). La
        // zone visible va de 0 a la largeur du wrapper : on inverse.
        const z = MoodBoard.zoom || 1;
        const vx = -(MoodBoard.panX || 0) / z;
        const vy = -(MoodBoard.panY || 0) / z;
        const vw = wrapper.clientWidth / z;
        const vh = wrapper.clientHeight / z;

        viewport.style.left = (g.ox + vx * g.s) + 'px';
        viewport.style.top = (g.oy + vy * g.s) + 'px';
        viewport.style.width = Math.max(4, vw * g.s) + 'px';
        viewport.style.height = Math.max(4, vh * g.s) + 'px';
    },

    // Clic sur la vignette : on amene ce point au centre de l'ecran. C'est une
    // NAVIGATION, pas une modification — elle reste donc ouverte aux lecteurs.
    // L'ecouteur est pose en JS et non en attribut onclick : la regle de
    // lecture seule ne vise que les attributs, un onclick ici aurait rendu la
    // vignette morte pour qui n'a que le droit de regarder.
    minimapGoTo: (e) => {
        const content = document.getElementById('moodboardMinimapContent');
        const wrapper = document.getElementById('moodboardCanvasWrapper');
        const g = MoodBoard.minimapGeometry();
        if(!content || !wrapper || !g) return;
        const r = content.getBoundingClientRect();
        const cx = (e.clientX - r.left - g.ox) / g.s;
        const cy = (e.clientY - r.top - g.oy) / g.s;
        const z = MoodBoard.zoom || 1;
        MoodBoard.panX = wrapper.clientWidth / 2 - cx * z;
        MoodBoard.panY = wrapper.clientHeight / 2 - cy * z;
        MoodBoard.updateCanvasTransform();
    },
    
    updateEmptyState: () => {
        const empty = document.getElementById('moodboardEmpty');
        const canvas = document.getElementById('moodboardCanvas');
        const boards = state.data.moodboards || [];
        
        if(boards.length === 0) {
            if(empty) empty.style.display = 'flex';
            if(canvas) canvas.style.display = 'none';
        } else {
            if(empty) empty.style.display = 'none';
            if(canvas) canvas.style.display = 'block';
        }
    },
    
    // ===== GESTION DES PLANCHES =====
    createBoard: async () => {
        if(!MoodBoard.canWrite()) { Utils.toast("Vous n'avez pas les droits de modification sur le mood board.", 'error'); return; }
        // Créer une modale personnalisée avec nom + liaison
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'confirm-modal-overlay';
            modal.onclick = (e) => { if(e.target === modal) { modal.remove(); resolve(); } };
            
            // Construire les options de liaison par catégories
            let linkOptionsHtml = '<option value="project">🎬 Projet entier</option>';
            
            // Scènes
            if((state.data.scenes || []).length > 0) {
                linkOptionsHtml += '<optgroup label="📄 Scènes">';
                (state.data.scenes || []).forEach((scene, i) => {
                    linkOptionsHtml += `<option value="scene_${scene.id}">Scène ${i+1}: ${Utils.escape(scene.title || 'Sans titre')}</option>`;
                });
                linkOptionsHtml += '</optgroup>';
            }
            
            // Personnages
            if((state.data.characters || []).length > 0) {
                linkOptionsHtml += '<optgroup label="👤 Personnages">';
                (state.data.characters || []).forEach(char => {
                    linkOptionsHtml += `<option value="character_${char.id}">${Utils.escape(char.name)}</option>`;
                });
                linkOptionsHtml += '</optgroup>';
            }
            
            // Comédiens
            if((state.data.actors || []).length > 0) {
                linkOptionsHtml += '<optgroup label="🎭 Comédiens">';
                (state.data.actors || []).forEach(actor => {
                    linkOptionsHtml += `<option value="actor_${actor.id}">${Utils.escape(actor.name)}</option>`;
                });
                linkOptionsHtml += '</optgroup>';
            }
            
            // Décors
            if((state.data.locations || []).length > 0) {
                linkOptionsHtml += '<optgroup label="📍 Décors">';
                (state.data.locations || []).forEach(loc => {
                    linkOptionsHtml += `<option value="location_${loc.id}">${Utils.escape(loc.name)}</option>`;
                });
                linkOptionsHtml += '</optgroup>';
            }
            
            // Ressources
            if((state.data.resources || []).length > 0) {
                linkOptionsHtml += '<optgroup label="📦 Ressources">';
                (state.data.resources || []).forEach(res => {
                    linkOptionsHtml += `<option value="resource_${res.id}">${Utils.escape(res.name)}</option>`;
                });
                linkOptionsHtml += '</optgroup>';
            }
            
            modal.innerHTML = `
                <div class="confirm-modal-box" style="max-width: 450px;">
                    <div class="confirm-modal-icon">🎨</div>
                    <div class="confirm-modal-title">Nouvelle planche</div>
                    <div style="text-align: left; margin: 15px 0;">
                        <label class="label-500">Nom de la planche :</label>
                        <input type="text" id="mbNewBoardName" class="n8-badge-12" value="Planche ${(state.data.moodboards || []).length + 1}" placeholder="Ex: Ambiance générale..." data-tooltip="Ex: Ambiance générale...">
                    </div>
                    <div style="text-align: left; margin: 15px 0;">
                        <label class="label-500">Lier à :</label>
                        <select id="mbNewBoardLink" class="n8-badge-12">
                            ${linkOptionsHtml}
                        </select>
                    </div>
                    <div class="confirm-modal-buttons">
                        <button class="confirm-modal-btn cancel" onclick="this.closest('.confirm-modal-overlay').remove()">Annuler</button>
                        <button class="confirm-modal-btn confirm" id="mbCreateBoardBtn">Créer</button>
                    </div>
                </div>
            `;
            
            document.body.appendChild(modal);
            
            const nameInput = modal.querySelector('#mbNewBoardName');
            const linkSelect = modal.querySelector('#mbNewBoardLink');
            const createBtn = modal.querySelector('#mbCreateBoardBtn');
            
            nameInput.focus();
            nameInput.select();
            
            nameInput.onkeydown = (e) => { if(e.key === 'Enter') createBtn.click(); if(e.key === 'Escape') modal.remove(); };
            
            createBtn.onclick = () => {
                const name = nameInput.value.trim();
                if(!name) {
                    Utils.toast('Entrez un nom pour la planche', 'warning');
                    return;
                }
                
                const linkValue = linkSelect.value;
                let linkedTo = { type: 'project' };
                if(linkValue !== 'project') {
                    const [type, ...idParts] = linkValue.split('_');
                    linkedTo = { type, id: idParts.join('_') };
                }
                
                if(!state.data.moodboards) state.data.moodboards = [];
                
                const board = {
                    id: 'mb_' + Utils.generateUniqueId(),
                    name: name,
                    format: 'a4-portrait',
                    linkedTo: linkedTo,
                    elements: [],
                    createdAt: Date.now(),
                    modifiedAt: Date.now()
                };
                
                state.data.moodboards.push(board);
                Store.save();
                
                modal.remove();
                
                MoodBoard.renderBoardsList();
                MoodBoard.selectBoard(board.id);
                MoodBoard.updateEmptyState();
                
                Utils.toast('Planche "' + name + '" créée', 'success');
                resolve(board);
            };
        });
    },
    
    renderBoardsList: () => {
        const container = document.getElementById('moodboardBoardsList');
        if(!container) return;
        
        const boards = state.data.moodboards || [];
        
        if(boards.length === 0) {
            container.innerHTML = '<span style="color: var(--text-sec); font-style: italic; padding: 5px;">Aucune planche</span>';
            return;
        }
        
        container.innerHTML = boards.map(board => {
            const isActive = board.id === MoodBoard.currentBoardId;
            const linkedIcon = board.linkedTo ? '🔗 ' : '';
            return `
                <div class="moodboard-board-tab ${isActive ? 'active' : ''}" data-fiche="board:${Utils.escape(String(board.id))}" onclick="app.MoodBoard.selectBoard('${board.id}')">
                    ${linkedIcon}${Utils.escape(board.name)}
                    <span class="tab-close" onclick="event.stopPropagation(); app.MoodBoard.deleteBoard('${board.id}')">×</span>
                </div>
            `;
        }).join('');
        
        // Bouton ajouter
        container.innerHTML += `
            <div class="moodboard-board-tab moodboard-board-add" onclick="app.MoodBoard.createBoard()" style="border-style: dashed;">
                + Nouvelle
            </div>
        `;
    },
    
    // La toile dit quelle planche elle montre : c'est elle qui portera le
    // cadenas et la mention « verrouillée » quand la planche est tenue par
    // quelqu'un d'autre. Repose apres chaque changement de planche.
    _marquerToile: () => {
        const toile = document.getElementById('moodboardCanvasWrapper');
        if(!toile) return;
        if(MoodBoard.currentBoardId) toile.dataset.fiche = 'board:' + MoodBoard.currentBoardId;
        else delete toile.dataset.fiche;
        try { if(typeof VerrouFin !== 'undefined') VerrouFin.marquerTout(); } catch(e) {}
    },

    selectBoard: (boardId) => {
        // v601 — ON PREVIENT AVANT D'ENTRER : une planche tenue par quelqu'un
        // d'autre ne s'ouvre pas du tout. On reste sur celle qu'on regardait.
        try {
            const peutEcrire0 = (typeof MoodBoard.canWrite !== 'function') || MoodBoard.canWrite();
            if(boardId && peutEcrire0 && typeof FicheLock !== 'undefined'
               && FicheLock.occupeePar('board', boardId)) {
                FicheLock.ouvrir('board', boardId, 'Cette planche');   // affiche le refus
                return;
            }
        } catch(e) {}
        MoodBoard.currentBoardId = boardId;
        MoodBoard.selectedElementId = null;
        // v601 — VERROU PAR PLANCHE. Une planche n'est pas une carte dans une
        // liste : c'est une TOILE qu'on selectionne, et une seule est ouverte a
        // la fois. On y compose a la SOURIS, le curseur de texte ne s'y pose
        // jamais — le declencheur habituel ne verrait donc rien. Le verrou se
        // prend A LA PORTE, comme pour l'editeur de dessin : choisir une
        // planche, c'est venir y travailler. Et comme on n'en tient qu'un a la
        // fois, choisir la suivante rend la precedente sans rien de plus.
        // ON NE PREND RIEN EN LECTURE SEULE : consulter ne bloque personne.
        try {
            const peutEcrire = (typeof MoodBoard.canWrite !== 'function') || MoodBoard.canWrite();
            if(boardId && peutEcrire && typeof FicheLock !== 'undefined') FicheLock.ouvrir('board', boardId);
            MoodBoard._marquerToile();
        } catch(e) {}
        
        // S'assurer que la planche a un tableau elements
        const board = MoodBoard.getCurrentBoard();
        if(board && !board.elements) {
            board.elements = [];
            // 31 aout : ne pas enregistrer pour qui n'a pas le droit d'ecrire —
            // changer de planche est une consultation, elle ne doit rien pousser.
            const peut = (typeof Permissions === 'undefined' || !Permissions.canEdit) ? true : Permissions.canEdit('moodboard');
            if(peut) Store.save();
        }
        
        MoodBoard.renderBoardsList();
        MoodBoard.renderCanvas();
        
        // Mettre à jour le format
        if(board) {
            const formatSelect = document.getElementById('moodboardFormat');
            if(formatSelect) formatSelect.value = board.format || 'free';
        }
    },
    
    getCurrentBoard: () => {
        if(!MoodBoard.currentBoardId) return null;
        const board = (state.data.moodboards || []).find(b => b.id === MoodBoard.currentBoardId);
        if(board && !board.elements) {
            board.elements = [];
        }
        if(board && (!board.layers || board.layers.length === 0)) {
            board.layers = [{ id: 'layer_' + Date.now(), name: 'Calque 1', visible: true, locked: false }];
        }
        if(board && (!board.activeLayerId || !board.layers.some(l => l.id === board.activeLayerId))) {
            board.activeLayerId = board.layers[0].id;
        }
        return board;
    },
    
    // Calque où atterrissent les nouveaux éléments : le calque actif, ou le
    // premier calque si l'actif a été supprimé entre-temps.
    _activeLayerId: (board) => {
        if(board.layers.some(l => l.id === board.activeLayerId)) return board.activeLayerId;
        return board.layers[0].id;
    },
    
    // Calque d'un élément existant : son propre layerId, ou le premier calque
    // si l'élément vient d'avant l'introduction des calques.
    _elementLayerId: (board, el) => {
        if(el.layerId && board.layers.some(l => l.id === el.layerId)) return el.layerId;
        return board.layers[0].id;
    },
    
    _layerLocked: (board, el) => {
        const layerId = MoodBoard._elementLayerId(board, el);
        const layer = board.layers.find(l => l.id === layerId);
        return !!(layer && layer.locked);
    },
    
    // Un élément n'est manipulable (sélection comprise) que s'il est sur le
    // calque ACTIF et que ce calque n'est pas verrouillé. Le contenu des
    // autres calques reste visible mais intouchable.
    _canInteract: (board, el) => {
        return MoodBoard._elementLayerId(board, el) === MoodBoard._activeLayerId(board) && !MoodBoard._layerLocked(board, el);
    },
    
    addLayer: () => {
        if(!MoodBoard.canWrite()) return;
        const board = MoodBoard.getCurrentBoard();
        if(!board) return;
        const name = prompt('Nom du calque :', 'Calque ' + (board.layers.length + 1));
        if(!name) return;
        const layer = { id: 'layer_' + Date.now(), name: name.trim() || 'Calque ' + (board.layers.length + 1), visible: true, locked: false };
        board.layers.push(layer);
        board.activeLayerId = layer.id;
        board.modifiedAt = Date.now();
        Store.save();
        MoodBoard.renderCanvas();
        Utils.toast('Calque créé', 'success');
    },
    
    renameLayer: (layerId) => {
        if(!MoodBoard.canWrite()) return;
        const board = MoodBoard.getCurrentBoard();
        if(!board) return;
        const layer = board.layers.find(l => l.id === layerId);
        if(!layer) return;
        const name = prompt('Nom du calque :', layer.name);
        if(!name || !name.trim()) return;
        layer.name = name.trim();
        board.modifiedAt = Date.now();
        Store.save();
        MoodBoard.renderLayersList();
    },
    
    deleteLayer: async (layerId) => {
        if(!MoodBoard.canWrite()) return;
        const board = MoodBoard.getCurrentBoard();
        if(!board) return;
        if(board.layers.length <= 1) { Utils.toast('Il faut garder au moins un calque', 'warning'); return; }
        const layer = board.layers.find(l => l.id === layerId);
        if(!layer) return;
        const count = board.elements.filter(el => MoodBoard._elementLayerId(board, el) === layerId).length;
        const msg = count > 0
            ? `Ses ${count} élément${count > 1 ? 's' : ''} seront déplacés vers un autre calque.`
            : `Ce calque est vide.`;
        if(!await ConfirmModal.show({ title: `Supprimer le calque « ${layer.name} » ?`, message: msg, icon: '🗑️', confirmText: 'Supprimer' })) return;
        
        board.layers = board.layers.filter(l => l.id !== layerId);
        const fallbackId = board.layers[0].id;
        board.elements.forEach(el => { if(el.layerId === layerId) el.layerId = fallbackId; });
        if(board.activeLayerId === layerId) board.activeLayerId = fallbackId;
        
        board.modifiedAt = Date.now();
        Store.save();
        MoodBoard.renderCanvas();
        Utils.toast('Calque supprimé', 'success');
    },
    
    toggleLayerVisibility: (layerId) => {
        const board = MoodBoard.getCurrentBoard();
        if(!board) return;
        const layer = board.layers.find(l => l.id === layerId);
        if(!layer) return;
        layer.visible = layer.visible === false ? true : false;
        board.modifiedAt = Date.now();
        Store.save();
        MoodBoard.renderCanvas();
    },
    
    toggleLayerLock: (layerId) => {
        if(!MoodBoard.canWrite()) return;
        const board = MoodBoard.getCurrentBoard();
        if(!board) return;
        const layer = board.layers.find(l => l.id === layerId);
        if(!layer) return;
        layer.locked = !layer.locked;
        board.modifiedAt = Date.now();
        Store.save();
        MoodBoard.renderLayersList();
        Utils.toast(layer.locked ? 'Calque verrouillé' : 'Calque déverrouillé', 'info');
    },
    
    setActiveLayer: (layerId) => {
        const board = MoodBoard.getCurrentBoard();
        if(!board) return;
        board.activeLayerId = layerId;
        MoodBoard.selectedElementId = null;
        Store.save();
        MoodBoard.renderCanvas();
    },
    
    // Déplace un élément vers un autre calque (menu de l'élément dans la liste).
    moveElementToLayer: (elementId, layerId) => {
        if(!MoodBoard.canWrite()) return;
        const board = MoodBoard.getCurrentBoard();
        if(!board) return;
        const el = board.elements.find(e => e.id === elementId);
        if(!el || !board.layers.some(l => l.id === layerId)) return;
        el.layerId = layerId;
        board.modifiedAt = Date.now();
        Store.save();
        MoodBoard.renderCanvas();
    },
    
    renderLayersList: () => {
        const container = document.getElementById('moodboardLayersList');
        if(!container) return;
        const board = MoodBoard.getCurrentBoard();
        if(!board) { container.innerHTML = ''; return; }
        
        // Du dessus vers le dessous : on affiche board.layers à l'envers.
        const rows = board.layers.slice().reverse().map(layer => {
            const isActive = layer.id === board.activeLayerId;
            const count = board.elements.filter(el => MoodBoard._elementLayerId(board, el) === layer.id).length;
            const hidden = layer.visible === false;
            return `
                <div class="moodboard-layer-item ${isActive ? 'selected' : ''}" draggable="true"
                     onclick="app.MoodBoard.setActiveLayer('${layer.id}')"
                     ondragstart="app.MoodBoard._layerDragStart(event, '${layer.id}')"
                     ondragover="app.MoodBoard._layerDragOver(event)"
                     ondragleave="app.MoodBoard._layerDragLeave(event)"
                     ondrop="app.MoodBoard._layerDrop(event, '${layer.id}')"
                     ondragend="app.MoodBoard._layerDragEnd(event)">
                    <span class="ml-handle" title="Glisser pour réordonner">⋮⋮</span>
                    <button class="ml-eye" onclick="event.stopPropagation(); app.MoodBoard.toggleLayerVisibility('${layer.id}')" title="${hidden ? 'Afficher' : 'Masquer'}">${hidden ? '🙈' : '👁️'}</button>
                    <button class="ml-lock" onclick="event.stopPropagation(); app.MoodBoard.toggleLayerLock('${layer.id}')" title="${layer.locked ? 'Déverrouiller' : 'Verrouiller'}">${layer.locked ? '🔒' : '🔓'}</button>
                    <div class="ml-name" ondblclick="event.stopPropagation(); app.MoodBoard.renameLayer('${layer.id}')" title="Double-clic pour renommer">${Utils.escape(layer.name)}</div>
                    <div class="ml-count">${count}</div>
                    <button class="ml-delete" onclick="event.stopPropagation(); app.MoodBoard.deleteLayer('${layer.id}')" title="Supprimer">🗑️</button>
                </div>`;
        }).join('');
        container.innerHTML = rows;
    },
    
    // ===== Glisser-déposer pour réordonner les calques (remplace les boutons
    // monter/descendre). L'ordre visuel est inversé par rapport au stockage
    // (haut de liste = premier plan = fin du tableau board.layers), mais on
    // travaille par identifiant donc ça n'a pas d'importance ici. =====
    _dragLayerId: null,
    _layerDragStart: (e, layerId) => {
        MoodBoard._dragLayerId = layerId;
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', layerId); } catch(err) {}
        e.currentTarget.style.opacity = '0.5';
    },
    _layerDragOver: (e) => {
        if(!MoodBoard._dragLayerId) return;
        e.preventDefault();
        e.currentTarget.style.borderTop = '2px solid var(--primary)';
    },
    _layerDragLeave: (e) => {
        e.currentTarget.style.borderTop = '';
    },
    _layerDrop: (e, targetLayerId) => {
        e.preventDefault();
        e.currentTarget.style.borderTop = '';
        const draggedId = MoodBoard._dragLayerId;
        MoodBoard._dragLayerId = null;
        if(!draggedId || draggedId === targetLayerId) return;
        if(!MoodBoard.canWrite()) return;
        const board = MoodBoard.getCurrentBoard();
        if(!board) return;
        const layers = board.layers;
        const fromIdx = layers.findIndex(l => l.id === draggedId);
        const toIdx = layers.findIndex(l => l.id === targetLayerId);
        if(fromIdx === -1 || toIdx === -1) return;
        const [moved] = layers.splice(fromIdx, 1);
        layers.splice(toIdx, 0, moved);
        board.modifiedAt = Date.now();
        Store.save();
        MoodBoard.renderCanvas();
    },
    _layerDragEnd: (e) => {
        e.currentTarget.style.opacity = '';
        MoodBoard._dragLayerId = null;
    },
    
    deleteBoard: async (boardId) => {
        if(!MoodBoard.canWrite()) { Utils.toast("Vous n'avez pas les droits de modification sur le mood board.", 'error'); return; }
        const board = (state.data.moodboards || []).find(b => b.id === boardId);
        if(!board) return;
        
        const confirmed = await ConfirmModal.show({
            title: 'Supprimer la planche ?',
            message: `Voulez-vous vraiment supprimer "${Utils.escape(board.name)}" et tous ses éléments ?`,
            type: 'danger',
            confirmText: 'Supprimer'
        });
        
        if(!confirmed) return;
        
        state.data.moodboards = state.data.moodboards.filter(b => b.id !== boardId);
        
        if(MoodBoard.currentBoardId === boardId) {
            MoodBoard.currentBoardId = state.data.moodboards.length > 0 ? state.data.moodboards[0].id : null;
        }
        
        Store.save();
        MoodBoard.renderBoardsList();
        MoodBoard.renderCanvas();
        MoodBoard.updateEmptyState();
        
        Utils.toast('Planche supprimée', 'success');
    },
    
    FORMATS: {
        'free':         { w: 5000, h: 5000 },
        'a4-landscape': { w: 1190, h: 842 },
        'a4-portrait':  { w: 842,  h: 1190 },
        'a3-landscape': { w: 1684, h: 1190 },
        'a3-portrait':  { w: 1190, h: 1684 },
        'a2-landscape': { w: 2384, h: 1684 },
        'a2-portrait':  { w: 1684, h: 2384 },
        'a0-landscape': { w: 4768, h: 3370 },
        'a0-portrait':  { w: 3370, h: 4768 }
    },
    
    applyCanvasFormat: (canvas, format) => {
        if(!canvas) return;
        canvas.className = 'moodboard-canvas format-' + (format || 'a4-portrait');
        const d = MoodBoard.FORMATS[format] || MoodBoard.FORMATS['a4-portrait'];
        canvas.style.width = d.w + 'px';
        canvas.style.height = d.h + 'px';
    },
    
    changeFormat: (format) => {
        const board = MoodBoard.getCurrentBoard();
        if(!board) return;
        
        board.format = format;
        board.modifiedAt = Date.now();
        Store.save();
        
        // Mettre à jour la classe + dimensions du canvas
        MoodBoard.applyCanvasFormat(document.getElementById('moodboardCanvas'), format);
        // Le format commande l'echelle de la vignette : A4 portrait et A0
        // paysage ne se reduisent pas de la meme facon.
        MoodBoard.renderMinimap();
        
        // Synchroniser tous les selects de format
        const formatSelect = document.getElementById('moodboardFormat');
        if(formatSelect) formatSelect.value = format;
        
        // Mettre à jour le panneau info si ouvert
        MoodBoard.updateInfoPanel();
        
        // Recentrer la vue
        MoodBoard.zoomReset();
        
        Utils.toast('Format: ' + format.replace('-', ' ').toUpperCase(), 'success');
    },
    
    // ===== GESTION DES ÉLÉMENTS =====
    addImageFromFile: (file, x, y) => {
        const boardId = MoodBoard.currentBoardId;
        if(!boardId) {
            Utils.toast('Sélectionnez d\'abord une planche', 'warning');
            return;
        }
        
        const reader = new FileReader();
        reader.onload = (e) => {
            const dataUrl = e.target.result;
            const img = new Image();
            img.onload = () => {
                // Récupérer la planche au moment de l'ajout (pas avant)
                const board = MoodBoard.getCurrentBoard();
                if(!board) {
                    Utils.toast('Erreur: planche non trouvée', 'error');
                    return;
                }
                
                // Calculer les dimensions proportionnelles
                let width = img.width;
                let height = img.height;
                const maxSize = 400;
                
                if(width > maxSize || height > maxSize) {
                    if(width > height) {
                        height = (height / width) * maxSize;
                        width = maxSize;
                    } else {
                        width = (width / height) * maxSize;
                        height = maxSize;
                    }
                }
                
                const element = {
                    id: 'el_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                    type: 'image',
                    x: x || 100,
                    y: y || 100,
                    width: Math.round(width),
                    height: Math.round(height),
                    src: dataUrl,
                    fileName: file.name,
                    linkedTo: null,
                    layerId: MoodBoard._activeLayerId(board),
                    createdAt: Date.now()
                };
                
                board.elements.push(element);
                board.modifiedAt = Date.now();
                Store.save();
                
                MoodBoard.renderCanvas();
                Utils.toast('Image ajoutée: ' + file.name, 'success');
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
    },
    
    renderElementsList: () => {
        const container = document.getElementById('moodboardElementsList');
        const countEl = document.getElementById('moodboardElementsCount');
        if(!container) return;
        
        const board = MoodBoard.getCurrentBoard();
        if(!board || !board.elements || board.elements.length === 0) {
            container.innerHTML = '<p style="color: var(--text-sec); text-align: center; padding: 20px; font-size: 0.85rem;">Aucun élément<br><small>Clic droit sur le canvas pour ajouter</small></p>';
            if(countEl) countEl.textContent = '0';
            return;
        }
        
        if(countEl) countEl.textContent = board.elements.length;
        
        const typeIcons = {
            'image': '🖼️',
            'drawing': '✏️',
            'text': '📝',
            'palette': '🎨',
            'link': '🔗',
            'file': '📁'
        };
        
        const typeLabels = {
            'image': 'Image',
            'drawing': 'Dessin',
            'text': 'Texte',
            'palette': 'Palette',
            'link': 'Lien',
            'file': 'Fichier'
        };
        
        container.innerHTML = board.elements.map(el => {
            const isSelected = el.id === MoodBoard.selectedElementId;
            const icon = typeIcons[el.type] || '📄';
            const typeLabel = typeLabels[el.type] || el.type;
            
            let name = '';
            if(el.type === 'text') name = (el.content || '').substring(0, 25) + (el.content?.length > 25 ? '...' : '');
            else if(el.type === 'image' || el.type === 'file') name = el.fileName || 'Sans nom';
            else if(el.type === 'palette') name = el.paletteName || 'Palette';
            else if(el.type === 'link') name = el.title || 'Lien';
            else if(el.type === 'drawing') name = 'Dessin';
            else name = typeLabel;
            
            let linkedHtml = '';
            if(el.linkedTo) {
                const linkedLabel = MoodBoard.getLinkLabel(el.linkedTo);
                linkedHtml = `<div class="el-linked">🔗 ${linkedLabel}</div>`;
            }
            
            const layerOptions = board.layers.map(l => `<option value="${l.id}"${l.id === MoodBoard._elementLayerId(board, el) ? ' selected' : ''}>${Utils.escape(l.name)}</option>`).join('');
            const layerSelectHtml = board.layers.length > 1
                ? `<select class="el-layer-select" onclick="event.stopPropagation()" onchange="event.stopPropagation(); app.MoodBoard.moveElementToLayer('${el.id}', this.value)" title="Déplacer vers un autre calque">${layerOptions}</select>`
                : '';
            
            return `
                <div class="moodboard-element-item ${isSelected ? 'selected' : ''}" 
                     onclick="app.MoodBoard.selectElement('${el.id}')"
                     ondblclick="app.MoodBoard.focusElement('${el.id}')">
                    <span class="el-icon">${icon}</span>
                    <div class="el-info">
                        <div class="el-type">${typeLabel}</div>
                        <div class="el-name">${Utils.escape(name)}</div>
                        ${linkedHtml}
                        ${layerSelectHtml}
                    </div>
                    <div class="el-actions">
                        <button onclick="event.stopPropagation(); app.MoodBoard.editElement('${el.id}')" title="Modifier">✏️</button>
                        <button onclick="event.stopPropagation(); app.MoodBoard.deleteElement('${el.id}')" title="Supprimer">🗑️</button>
                    </div>
                </div>
            `;
        }).join('');
    },
    
    getLinkLabel: (linkedTo) => {
        if(!linkedTo) return '';
        if(linkedTo.type === 'project') return 'Projet';
        
        const collections = {
            'scene': state.data.scenes,
            'character': state.data.characters,
            'actor': state.data.actors,
            'location': state.data.locations,
            'resource': state.data.resources
        };
        
        const labels = {
            'scene': 'Scène',
            'character': 'Personnage',
            'actor': 'Comédien',
            'location': 'Décor',
            'resource': 'Ressource'
        };
        
        const collection = collections[linkedTo.type] || [];
        const item = collection.find(i => i.id === linkedTo.id);
        
        if(item) {
            return `${labels[linkedTo.type]}: ${item.name || item.title || linkedTo.id}`;
        }
        return labels[linkedTo.type] || linkedTo.type;
    },
    
    moveElementUp: (elementId) => {
        if(!MoodBoard.canWrite()) return;
        const board = MoodBoard.getCurrentBoard();
        if(!board) return;
        const el = board.elements.find(e => e.id === elementId);
        if(!el || !MoodBoard._canInteract(board, el)) return;
        
        const layerId = MoodBoard._elementLayerId(board, el);
        const sameLayerIdx = [];
        board.elements.forEach((e, i) => { if(MoodBoard._elementLayerId(board, e) === layerId) sameLayerIdx.push(i); });
        const pos = sameLayerIdx.indexOf(board.elements.indexOf(el));
        
        if(pos < sameLayerIdx.length - 1) {
            const a = sameLayerIdx[pos], b = sameLayerIdx[pos + 1];
            const temp = board.elements[a];
            board.elements[a] = board.elements[b];
            board.elements[b] = temp;
            
            board.modifiedAt = Date.now();
            Store.save();
            MoodBoard.renderCanvas();
            Utils.toast('Élément monté', 'success');
        } else {
            Utils.toast('Déjà au premier plan de son calque', 'info');
        }
    },
    
    moveElementDown: (elementId) => {
        if(!MoodBoard.canWrite()) return;
        const board = MoodBoard.getCurrentBoard();
        if(!board) return;
        const el = board.elements.find(e => e.id === elementId);
        if(!el || !MoodBoard._canInteract(board, el)) return;
        
        const layerId = MoodBoard._elementLayerId(board, el);
        const sameLayerIdx = [];
        board.elements.forEach((e, i) => { if(MoodBoard._elementLayerId(board, e) === layerId) sameLayerIdx.push(i); });
        const pos = sameLayerIdx.indexOf(board.elements.indexOf(el));
        
        if(pos > 0) {
            const a = sameLayerIdx[pos], b = sameLayerIdx[pos - 1];
            const temp = board.elements[a];
            board.elements[a] = board.elements[b];
            board.elements[b] = temp;
            
            board.modifiedAt = Date.now();
            Store.save();
            MoodBoard.renderCanvas();
            Utils.toast('Élément descendu', 'success');
        } else {
            Utils.toast('Déjà en arrière-plan de son calque', 'info');
        }
    },
    
    focusElement: (elementId) => {
        const board = MoodBoard.getCurrentBoard();
        const element = board?.elements.find(el => el.id === elementId);
        if(!element) return;
        
        // Centrer la vue sur l'élément
        const wrapper = document.getElementById('moodboardCanvasWrapper');
        if(!wrapper) return;
        
        const wrapperRect = wrapper.getBoundingClientRect();
        const centerX = wrapperRect.width / 2;
        const centerY = wrapperRect.height / 2;
        
        MoodBoard.panX = centerX - (element.x + element.width / 2) * MoodBoard.zoom;
        MoodBoard.panY = centerY - (element.y + element.height / 2) * MoodBoard.zoom;
        
        MoodBoard.updateCanvasTransform();
        MoodBoard.selectElement(elementId);
    },
    
    renderCanvas: () => {
        const canvas = document.getElementById('moodboardCanvas');
        if(!canvas) return;
        
        const board = MoodBoard.getCurrentBoard();
        if(!board) {
            canvas.innerHTML = '';
            MoodBoard.renderElementsList();
            return;
        }
        
        // Appliquer le format (classe + dimensions)
        MoodBoard.applyCanvasFormat(canvas, board.format || 'free');
        
        // Rendre les éléments, groupés par calque (ordre des calques = ordre
        // d'empilement), en sautant les calques masqués.
        const visibleOrdered = MoodBoard._orderedVisibleElements(board);
        canvas.innerHTML = visibleOrdered.map(el => MoodBoard.renderElement(el)).join('');
        
        // Attacher les événements
        visibleOrdered.forEach(el => {
            MoodBoard.attachElementEvents(el.id);
        });
        
        // Mettre à jour la liste des éléments et des calques dans la sidebar
        MoodBoard.renderElementsList();
        MoodBoard.renderLayersList();
        // La vignette suit le contenu. Branchee ICI et nulle part ailleurs :
        // renderCanvas est le passage oblige des trente et quelques endroits
        // qui ajoutent, suppriment ou rechargent des elements.
        MoodBoard.renderMinimap();
    },
    
    // Éléments dans l'ordre d'empilement réel (par calque, calques masqués
    // exclus). Les éléments d'un même calque gardent leur ordre relatif.
    // Tout ce qui est visible s'affiche — seule l'INTERACTION (sélection,
    // déplacement...) est restreinte au calque actif, voir _canInteract.
    _orderedVisibleElements: (board) => {
        const out = [];
        board.layers.forEach(layer => {
            if(layer.visible === false) return;
            board.elements.forEach(el => {
                if(MoodBoard._elementLayerId(board, el) === layer.id) out.push(el);
            });
        });
        return out;
    },
    
    renderElement: (el) => {
        const isSelected = el.id === MoodBoard.selectedElementId;
        const linkedBadge = el.linkedTo ? `<div class="element-linked-badge" title="Lié à: ${el.linkedTo.type}">🔗</div>` : '';
        let content = '';
        
        if(el.type === 'image' || el.type === 'drawing') {
            content = `<img class="moodboard-element-image" src="${el.src}" alt="">`;
        }
        
        if(el.type === 'text') {
            const bg = (el.bgColor && el.bgColor !== 'transparent') ? el.bgColor : 'transparent';
            const style = `
                font-family: ${el.fontFamily || 'Inter, sans-serif'};
                font-size: ${el.fontSize || 18}px;
                text-align: ${el.textAlign || 'left'};
                color: ${el.textColor || '#333333'};
                font-weight: ${el.fontBold ? 'bold' : 'normal'};
                font-style: ${el.fontItalic ? 'italic' : 'normal'};
                text-decoration: ${el.fontUnderline ? 'underline' : 'none'};
                background: ${bg};
            `;
            content = `<div class="moodboard-element-text" style="${style}">${Utils.escape(el.content || '').replace(/\n/g, '<br>')}</div>`;
        }
        
        if(el.type === 'palette') {
            const colors = el.colors || ['#000000'];
            content = `<div class="moodboard-element-palette">
                ${el.paletteName ? `<div class="palette-title">${Utils.escape(el.paletteName)}</div>` : ''}
                <div class="palette-colors">
                    ${colors.map(c => `<div class="color-swatch" title="${c}">
                        <div class="color-swatch-box" style="background: ${c};"></div>
                        <span>${c}</span>
                    </div>`).join('')}
                </div>
            </div>`;
        }
        
        if(el.type === 'shape') {
            const shape = MoodBoard.shapes.find(s => s.id === el.shapeId);
            if(shape) {
                content = `<div class="moodboard-element-shape" style="color: ${el.color || '#000000'}; transform: rotate(${el.rotation || 0}deg);">
                    <svg viewBox="0 0 100 100" preserveAspectRatio="none">${shape.svg}</svg>
                </div>`;
            }
        }
        
        if(el.type === 'link') {
            content = `<div class="moodboard-element-link" ondblclick="window.open(${Utils.jsArg(Utils.safeUrl(el.url))}, '_blank')">
                <div class="link-icon">🔗</div>
                <div class="link-title">${Utils.escape(el.title || 'Lien')}</div>
                <div class="link-url">${Utils.escape(el.url || '').substring(0, 40)}...</div>
            </div>`;
        }
        
        if(el.type === 'file') {
            const icon = el.fileType.includes('pdf') ? '📄' : 
                        el.fileType.includes('word') || el.fileType.includes('doc') ? '📝' : '📁';
            const size = el.fileSize > 1024*1024 ? (el.fileSize/1024/1024).toFixed(1) + ' MB' : (el.fileSize/1024).toFixed(0) + ' KB';
            content = `<div class="moodboard-element-file" ondblclick="app.MoodBoard.openFile('${el.id}')">
                <div class="file-icon">${icon}</div>
                <div class="file-name">${Utils.escape(el.fileName || 'Fichier')}</div>
                <div class="file-size">${size}</div>
            </div>`;
        }
        
        const rotateHandle = (el.type === 'shape' || el.type === 'image' || el.type === 'drawing') ? '<div class="rotate-handle" data-action="rotate"></div>' : '';
        
        const board = MoodBoard.getCurrentBoard();
        const inert = board ? !MoodBoard._canInteract(board, el) : false;
        return `
            <div class="moodboard-element ${isSelected ? 'selected' : ''} ${inert ? 'layer-inert' : ''}" 
                 id="mb-el-${el.id}"
                 data-id="${el.id}"
                 style="left: ${el.x}px; top: ${el.y}px; width: ${el.width}px; height: ${el.height}px; transform: rotate(${el.rotation || 0}deg); opacity: ${el.opacity == null ? 1 : el.opacity};">
                ${linkedBadge}
                ${rotateHandle}
                ${content}
                <div class="resize-handle se"></div>
                <div class="resize-handle sw"></div>
                <div class="resize-handle ne"></div>
                <div class="resize-handle nw"></div>
            </div>
        `;
    },
    
    attachElementEvents: (elementId) => {
        const el = document.getElementById('mb-el-' + elementId);
        if(!el) return;
        
        // Sélection au clic
        el.addEventListener('mousedown', (e) => {
            const board = MoodBoard.getCurrentBoard();
            const element = board?.elements.find(o => o.id === elementId);
            // Élément d'un autre calque (ou calque verrouillé) : visible, mais
            // ni sélectionnable ni manipulable tant que ce n'est pas le calque actif.
            if(!element || !board || !MoodBoard._canInteract(board, element)) return;
            
            // En lecture seule on garde la SELECTION (elle sert au panneau
            // d'information, qui est une lecture) mais aucune des trois
            // transformations : deplacer, redimensionner, tourner.
            if(MoodBoard.canWrite()) {
                if(e.target.classList.contains('resize-handle')) {
                    MoodBoard.startResize(elementId, e);
                } else if(e.target.classList.contains('rotate-handle')) {
                    MoodBoard.startRotate(elementId, e);
                } else {
                    MoodBoard.startDrag(elementId, e);
                }
            }
            MoodBoard.selectElement(elementId);
            e.stopPropagation();
        });
        
        // Édition du texte
        const textEl = el.querySelector('.moodboard-element-text');
        if(textEl) {
            textEl.addEventListener('blur', () => {
                MoodBoard.updateElementContent(elementId, textEl.innerText);
            });
        }
    },
    
    selectElement: (elementId) => {
        const board = MoodBoard.getCurrentBoard();
        const element = board?.elements.find(el => el.id === elementId);
        if(!element || !board || !MoodBoard._canInteract(board, element)) return;
        
        MoodBoard.selectedElementId = elementId;
        
        // Mettre à jour les classes
        document.querySelectorAll('.moodboard-element').forEach(el => {
            el.classList.toggle('selected', el.dataset.id === elementId);
        });
        
        // Mettre à jour le panneau d'info
        MoodBoard.updateInfoPanel();
        // Le lisere bleu de la vignette suit la selection : c'est ce qui
        // permet de retrouver un element perdu au bout de la planche.
        MoodBoard.renderMinimap();
    },
    
    startRotate: (elementId, e) => {
        if(!MoodBoard.canWrite()) return;
        const board = MoodBoard.getCurrentBoard();
        const element = board?.elements.find(el => el.id === elementId);
        if(!element || !MoodBoard._canInteract(board, element)) return;
        
        const domEl = document.getElementById('mb-el-' + elementId);
        if(!domEl) return;
        
        const rect = domEl.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        
        const startAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * 180 / Math.PI;
        const startRotation = element.rotation || 0;
        
        const onMouseMove = (e) => {
            const currentAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * 180 / Math.PI;
            let newRotation = startRotation + (currentAngle - startAngle);
            
            // Snap à 15° si Shift est pressé
            if(e.shiftKey) {
                newRotation = Math.round(newRotation / 15) * 15;
            }
            
            element.rotation = newRotation;
            domEl.style.transform = `rotate(${newRotation}deg)`;
        };
        
        const onMouseUp = () => {
            board.modifiedAt = Date.now();
            MoodBoard.renderMinimap();
            Store.save();
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };
        
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        e.preventDefault();
    },
    
    startDrag: (elementId, e) => {
        if(!MoodBoard.canWrite()) return;
        const board = MoodBoard.getCurrentBoard();
        const element = board?.elements.find(el => el.id === elementId);
        if(!element || !MoodBoard._canInteract(board, element)) return;
        
        MoodBoard.isDraggingElement = true;
        MoodBoard.dragOffsetX = (e.clientX / MoodBoard.zoom) - element.x;
        MoodBoard.dragOffsetY = (e.clientY / MoodBoard.zoom) - element.y;
        
        // Alignement (v594) : bords/centres des AUTRES elements de la planche,
        // pour aimanter la position pendant le glisser et tracer un repere.
        const others = board.elements.filter(o => o.id !== elementId);
        const linesX = [], linesY = [];
        others.forEach(o => {
            linesX.push(o.x, o.x + o.width / 2, o.x + o.width);
            linesY.push(o.y, o.y + o.height / 2, o.y + o.height);
        });
        const SNAP = 8 / MoodBoard.zoom;
        
        const onMouseMove = (e) => {
            if(!MoodBoard.isDraggingElement) return;
            
            let newX = (e.clientX / MoodBoard.zoom) - MoodBoard.dragOffsetX;
            let newY = (e.clientY / MoodBoard.zoom) - MoodBoard.dragOffsetY;
            newX = Math.max(0, newX);
            newY = Math.max(0, newY);
            
            let snapLineX = null, snapLineY = null;
            for(const cx of [newX, newX + element.width / 2, newX + element.width]) {
                const match = linesX.find(lx => Math.abs(lx - cx) <= SNAP);
                if(match != null) { newX += (match - cx); snapLineX = match; break; }
            }
            for(const cy of [newY, newY + element.height / 2, newY + element.height]) {
                const match = linesY.find(ly => Math.abs(ly - cy) <= SNAP);
                if(match != null) { newY += (match - cy); snapLineY = match; break; }
            }
            
            element.x = newX;
            element.y = newY;
            
            const domEl = document.getElementById('mb-el-' + elementId);
            if(domEl) {
                domEl.style.left = element.x + 'px';
                domEl.style.top = element.y + 'px';
            }
            MoodBoard.showSnapGuides(snapLineX, snapLineY);
        };
        
        const onMouseUp = () => {
            MoodBoard.isDraggingElement = false;
            MoodBoard.hideSnapGuides();
            board.modifiedAt = Date.now();
            // A la FIN du deplacement, pas pendant : redessiner la vignette a
            // chaque mouvement de souris ferait ramer une planche chargee.
            MoodBoard.renderMinimap();
            Store.save();
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };
        
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    },

    // Trace/efface les deux reperes d'aimantation (vertical + horizontal).
    showSnapGuides: (x, y) => {
        const canvas = document.getElementById('moodboardCanvas');
        if(!canvas) return;
        let vLine = document.getElementById('mbSnapLineV');
        if(x != null) {
            if(!vLine) { vLine = document.createElement('div'); vLine.id = 'mbSnapLineV'; vLine.className = 'mb-snap-line mb-snap-line-v'; canvas.appendChild(vLine); }
            vLine.style.left = x + 'px';
        } else if(vLine) vLine.remove();
        let hLine = document.getElementById('mbSnapLineH');
        if(y != null) {
            if(!hLine) { hLine = document.createElement('div'); hLine.id = 'mbSnapLineH'; hLine.className = 'mb-snap-line mb-snap-line-h'; canvas.appendChild(hLine); }
            hLine.style.top = y + 'px';
        } else if(hLine) hLine.remove();
    },

    hideSnapGuides: () => {
        const vLine = document.getElementById('mbSnapLineV'); if(vLine) vLine.remove();
        const hLine = document.getElementById('mbSnapLineH'); if(hLine) hLine.remove();
    },
    
    startResize: (elementId, e) => {
        if(!MoodBoard.canWrite()) return;
        const board = MoodBoard.getCurrentBoard();
        const element = board?.elements.find(el => el.id === elementId);
        if(!element || !MoodBoard._canInteract(board, element)) return;
        
        MoodBoard.isResizingElement = true;
        MoodBoard.resizeHandle = e.target.classList.contains('se') ? 'se' :
                                 e.target.classList.contains('sw') ? 'sw' :
                                 e.target.classList.contains('ne') ? 'ne' : 'nw';
        
        const startX = e.clientX;
        const startY = e.clientY;
        const startWidth = element.width;
        const startHeight = element.height;
        const startElX = element.x;
        const startElY = element.y;
        
        const onMouseMove = (e) => {
            if(!MoodBoard.isResizingElement) return;
            
            const dx = (e.clientX - startX) / MoodBoard.zoom;
            const dy = (e.clientY - startY) / MoodBoard.zoom;
            
            if(MoodBoard.resizeHandle === 'se') {
                element.width = Math.max(80, startWidth + dx);
                element.height = Math.max(80, startHeight + dy);
            } else if(MoodBoard.resizeHandle === 'sw') {
                element.width = Math.max(80, startWidth - dx);
                element.height = Math.max(80, startHeight + dy);
                element.x = startElX + (startWidth - element.width);
            } else if(MoodBoard.resizeHandle === 'ne') {
                element.width = Math.max(80, startWidth + dx);
                element.height = Math.max(80, startHeight - dy);
                element.y = startElY + (startHeight - element.height);
            } else if(MoodBoard.resizeHandle === 'nw') {
                element.width = Math.max(80, startWidth - dx);
                element.height = Math.max(80, startHeight - dy);
                element.x = startElX + (startWidth - element.width);
                element.y = startElY + (startHeight - element.height);
            }
            
            const domEl = document.getElementById('mb-el-' + elementId);
            if(domEl) {
                domEl.style.left = element.x + 'px';
                domEl.style.top = element.y + 'px';
                domEl.style.width = element.width + 'px';
                domEl.style.height = element.height + 'px';
            }
        };
        
        const onMouseUp = () => {
            MoodBoard.isResizingElement = false;
            board.modifiedAt = Date.now();
            MoodBoard.renderMinimap();
            Store.save();
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };
        
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    },
    
    updateElementContent: (elementId, content) => {
        if(!MoodBoard.canWrite()) return;
        const board = MoodBoard.getCurrentBoard();
        const element = board?.elements.find(el => el.id === elementId);
        if(!element) return;
        
        element.content = content;
        board.modifiedAt = Date.now();
        Store.save();
    },
    
    editElement: async (elementId) => {
        const board = MoodBoard.getCurrentBoard();
        const element = board?.elements.find(el => el.id === elementId);
        if(!element) return;
        if(!MoodBoard._canInteract(board, element)) { Utils.toast('Élément sur un autre calque', 'warning'); return; }
        
        if(element.type === 'text') {
            MoodBoard.showTextPanel(element);
        }
        
        if(element.type === 'palette') {
            // Ouvrir l'éditeur de palette avec les couleurs existantes
            ColorWheel.open((colors, name) => {
                if(colors && colors.length > 0) {
                    element.colors = colors;
                    if(name) element.paletteName = name;
                    board.modifiedAt = Date.now();
                    Store.save();
                    MoodBoard.renderCanvas();
                    Utils.toast('Palette modifiée', 'success');
                }
            }, element.colors, element.paletteName);
        }
        
        if(element.type === 'link') {
            const url = await ConfirmModal.prompt('URL du lien :', 'Modifier le lien', 'https://...', element.url || '');
            if(url === null) return;
            
            element.url = url;
            try { element.title = new URL(url).hostname; } catch(e) { element.title = 'Lien'; }
            board.modifiedAt = Date.now();
            Store.save();
            MoodBoard.renderCanvas();
            Utils.toast('Lien modifié', 'success');
        }
        
        if(element.type === 'drawing') {
            // Réouvrir l'éditeur de dessin avec l'image existante
            MoodBoard.editDrawing(element);
        }
        
        if(element.type === 'image') {
            // Permettre de remplacer l'image
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.onchange = (e) => {
                const file = e.target.files[0];
                if(!file) return;
                
                const reader = new FileReader();
                reader.onload = (ev) => {
                    element.src = ev.target.result;
                    element.fileName = file.name;
                    board.modifiedAt = Date.now();
                    Store.save();
                    MoodBoard.renderCanvas();
                    Utils.toast('Image remplacée', 'success');
                };
                reader.readAsDataURL(file);
            };
            input.click();
        }
        
        if(element.type === 'file') {
            Utils.toast('Double-cliquez pour ouvrir le fichier', 'info');
        }
    },
    
    linkElement: async (elementId) => {
        if(!MoodBoard.canWrite()) return;
        const board = MoodBoard.getCurrentBoard();
        const element = board?.elements.find(el => el.id === elementId);
        if(!element) return;
        
        MoodBoard.showLinkModal(element, (linkedTo) => {
            element.linkedTo = linkedTo;
            board.modifiedAt = Date.now();
            Store.save();
            MoodBoard.renderCanvas();
            Utils.toast('Liaison mise à jour', 'success');
        });
    },
    
    showLinkModal: (target, callback) => {
        const modal = document.createElement('div');
        modal.className = 'confirm-modal-overlay';
        modal.onclick = (e) => { if(e.target === modal) modal.remove(); };
        
        // Construire les catégories
        const categories = [
            { id: 'project', icon: '🎬', label: 'Projet', items: [{ id: 'project', name: 'Projet entier' }] },
            { id: 'scene', icon: '📄', label: 'Scènes', items: (state.data.scenes || []).map((s, i) => ({ id: s.id, name: `Scène ${i+1}: ${s.title || 'Sans titre'}` })) },
            { id: 'character', icon: '👤', label: 'Personnages', items: (state.data.characters || []).map(c => ({ id: c.id, name: c.name })) },
            { id: 'actor', icon: '🎭', label: 'Comédiens', items: (state.data.actors || []).map(a => ({ id: a.id, name: a.name })) },
            { id: 'location', icon: '📍', label: 'Décors', items: (state.data.locations || []).map(l => ({ id: l.id, name: l.name })) },
            { id: 'resource', icon: '📦', label: 'Ressources', items: (state.data.resources || []).map(r => ({ id: r.id, name: r.name })) }
        ];
        
        // Valeur actuelle
        const currentType = target.linkedTo?.type || '';
        const currentId = target.linkedTo?.id || '';
        
        let categoriesHtml = categories.map(cat => {
            if(cat.items.length === 0) return '';
            const isActive = cat.id === currentType || (cat.id === 'project' && currentType === 'project');
            return `<button class="mb-link-cat-btn ${isActive ? 'active' : ''}" data-cat="${cat.id}" style="padding: 10px 15px; border: 1px solid var(--border); border-radius: 8px; background: ${isActive ? 'var(--primary)' : 'var(--bg)'}; color: ${isActive ? 'white' : 'var(--text-main)'}; cursor: pointer; display: flex; align-items: center; gap: 8px;">
                <span>${cat.icon}</span>
                <span>${cat.label}</span>
                <span style="opacity: 0.6; font-size: 0.8rem;">(${cat.items.length})</span>
            </button>`;
        }).join('');
        
        modal.innerHTML = `
            <div class="confirm-modal-box" style="max-width: 550px; max-height: 80vh; display: flex; flex-direction: column;">
                <div class="confirm-modal-icon">🔗</div>
                <div class="confirm-modal-title">Lier à un élément</div>
                
                <div style="display: flex; flex-wrap: wrap; gap: 8px; margin: 15px 0; justify-content: center;">
                    ${categoriesHtml}
                    <button class="mb-link-cat-btn ${!currentType ? 'active' : ''}" data-cat="" style="padding: 10px 15px; border: 1px solid var(--border); border-radius: 8px; background: ${!currentType ? 'var(--primary)' : 'var(--bg)'}; color: ${!currentType ? 'white' : 'var(--text-main)'}; cursor: pointer;">
                        ❌ Aucune liaison
                    </button>
                </div>
                
                <div id="mbLinkItemsList" style="flex: 1; overflow-y: auto; max-height: 300px; border: 1px solid var(--border); border-radius: 8px; padding: 10px; margin-bottom: 15px;">
                    <p style="text-align: center; color: var(--text-sec);">Sélectionnez une catégorie</p>
                </div>
                
                <div class="confirm-modal-buttons">
                    <button class="confirm-modal-btn cancel" onclick="this.closest('.confirm-modal-overlay').remove()">Annuler</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        const itemsList = modal.querySelector('#mbLinkItemsList');
        const catButtons = modal.querySelectorAll('.mb-link-cat-btn');
        
        const showItems = (catId) => {
            catButtons.forEach(btn => {
                btn.style.background = btn.dataset.cat === catId ? 'var(--primary)' : 'var(--bg)';
                btn.style.color = btn.dataset.cat === catId ? 'white' : 'var(--text-main)';
            });
            
            if(!catId) {
                // Aucune liaison
                callback(null);
                modal.remove();
                return;
            }
            
            const cat = categories.find(c => c.id === catId);
            if(!cat) return;
            
            if(catId === 'project') {
                callback({ type: 'project' });
                modal.remove();
                return;
            }
            
            itemsList.innerHTML = cat.items.map(item => {
                const isSelected = currentType === catId && currentId === item.id;
                return `<div class="mb-link-item" data-type="${catId}" data-id="${item.id}" style="padding: 12px; border-radius: 6px; cursor: pointer; margin-bottom: 5px; background: ${isSelected ? 'var(--primary)' : 'var(--bg)'}; color: ${isSelected ? 'white' : 'var(--text-main)'}; transition: background 0.2s;">
                    ${cat.icon} ${Utils.escape(item.name)}
                </div>`;
            }).join('');
            
            itemsList.querySelectorAll('.mb-link-item').forEach(item => {
                item.onmouseenter = () => { if(!item.style.background.includes('primary')) item.style.background = 'var(--border)'; };
                item.onmouseleave = () => { if(!item.style.background.includes('primary')) item.style.background = 'var(--bg)'; };
                item.onclick = () => {
                    callback({ type: item.dataset.type, id: item.dataset.id });
                    modal.remove();
                };
            });
        };
        
        catButtons.forEach(btn => {
            btn.onclick = () => showItems(btn.dataset.cat);
        });
        
        // Afficher la catégorie actuelle si elle existe
        if(currentType && currentType !== 'project') {
            showItems(currentType);
        }
    },
    
    duplicateElement: (elementId) => {
        if(!MoodBoard.canWrite()) return;
        const board = MoodBoard.getCurrentBoard();
        const element = board?.elements.find(el => el.id === elementId);
        if(!element) return;
        
        const newElement = JSON.parse(JSON.stringify(element));
        newElement.id = 'el_' + Utils.generateUniqueId();
        newElement.x += 30;
        newElement.y += 30;
        newElement.createdAt = Date.now();
        
        board.elements.push(newElement);
        board.modifiedAt = Date.now();
        Store.save();
        
        MoodBoard.renderCanvas();
        MoodBoard.selectElement(newElement.id);
        Utils.toast('Élément dupliqué', 'success');
    },
    
    deleteElement: async (elementId) => {
        if(!MoodBoard.canWrite()) { Utils.toast("Vous n'avez pas les droits de modification sur le mood board.", 'error'); return; }
        const board = MoodBoard.getCurrentBoard();
        if(!board) return;
        const target = board.elements.find(el => el.id === elementId);
        if(target && !MoodBoard._canInteract(board, target)) { Utils.toast('Élément sur un autre calque', 'warning'); return; }
        
        board.elements = board.elements.filter(el => el.id !== elementId);
        board.modifiedAt = Date.now();
        Store.save();
        
        if(MoodBoard.selectedElementId === elementId) {
            MoodBoard.selectedElementId = null;
        }
        
        MoodBoard.renderCanvas();
        Utils.toast('Élément supprimé', 'success');
    },
    
    // ===== PANNEAU D'INFO =====
    toggleInfoPanel: () => {
        const panel = document.getElementById('moodboardInfoPanel');
        if(panel) {
            panel.classList.toggle('active');
            MoodBoard.updateInfoPanel();
        }
    },
    
    updateInfoPanel: () => {
        const panel = document.getElementById('moodboardInfoPanel');
        const content = document.getElementById('moodboardInfoContent');
        const title = document.getElementById('moodboardInfoTitle');
        if(!panel || !content || !panel.classList.contains('active')) return;
        
        const board = MoodBoard.getCurrentBoard();
        const element = board?.elements.find(el => el.id === MoodBoard.selectedElementId);
        
        if(element) {
            title.textContent = 'Élément: ' + element.type;
            content.innerHTML = `
                <div class="info-row">
                    <label>Position X</label>
                    <input type="number" value="${Math.round(element.x)}" onchange="app.MoodBoard.updateElementProp('${element.id}', 'x', parseFloat(this.value))">
                </div>
                <div class="info-row">
                    <label>Position Y</label>
                    <input type="number" value="${Math.round(element.y)}" onchange="app.MoodBoard.updateElementProp('${element.id}', 'y', parseFloat(this.value))">
                </div>
                <div class="info-row">
                    <label>Largeur</label>
                    <input type="number" value="${Math.round(element.width)}" onchange="app.MoodBoard.updateElementProp('${element.id}', 'width', parseFloat(this.value))">
                </div>
                <div class="info-row">
                    <label>Hauteur</label>
                    <input type="number" value="${Math.round(element.height)}" onchange="app.MoodBoard.updateElementProp('${element.id}', 'height', parseFloat(this.value))">
                </div>
                <div class="info-row">
                    <label>Opacité (%)</label>
                    <input type="number" min="0" max="100" value="${Math.round((element.opacity == null ? 1 : element.opacity) * 100)}" onchange="app.MoodBoard.updateElementProp('${element.id}', 'opacity', Math.max(0, Math.min(100, parseFloat(this.value) || 0)) / 100)">
                </div>
                <div class="info-row">
                    <label>Lié à</label>
                    <input type="text" value="${element.linkedTo ? element.linkedTo.type + (element.linkedTo.id ? ': ' + element.linkedTo.id : '') : 'Aucun'}" readonly style="cursor: pointer;" onclick="app.MoodBoard.linkElement('${element.id}')">
                </div>
            `;
        } else if(board) {
            title.textContent = 'Planche: ' + board.name;
            content.innerHTML = `
                <div class="info-row">
                    <label>Nom</label>
                    <input type="text" value="${Utils.escape(board.name)}" onchange="app.MoodBoard.updateBoardName(this.value)">
                </div>
                <div class="info-row">
                    <label>Format</label>
                    <select onchange="app.MoodBoard.changeFormat(this.value)">
                        <option value="a4-landscape" ${board.format === 'a4-landscape' ? 'selected' : ''}>A4 Paysage</option>
                        <option value="a4-portrait" ${board.format === 'a4-portrait' ? 'selected' : ''}>A4 Portrait</option>
                        <option value="a3-landscape" ${board.format === 'a3-landscape' ? 'selected' : ''}>A3 Paysage</option>
                        <option value="a3-portrait" ${board.format === 'a3-portrait' ? 'selected' : ''}>A3 Portrait</option>
                        <option value="a2-landscape" ${board.format === 'a2-landscape' ? 'selected' : ''}>A2 Paysage</option>
                        <option value="a2-portrait" ${board.format === 'a2-portrait' ? 'selected' : ''}>A2 Portrait</option>
                        <option value="a0-landscape" ${board.format === 'a0-landscape' ? 'selected' : ''}>A0 Paysage</option>
                        <option value="a0-portrait" ${board.format === 'a0-portrait' ? 'selected' : ''}>A0 Portrait</option>
                    </select>
                </div>
                <div class="info-row">
                    <label>Éléments</label>
                    <input type="text" value="${board.elements.length}" readonly>
                </div>
                <div class="info-row">
                    <label>Lier la planche à</label>
                    <button onclick="app.MoodBoard.linkBoard()" style="width: 100%; padding: 8px; cursor: pointer;">🔗 Configurer...</button>
                </div>
            `;
        } else {
            title.textContent = 'Propriétés';
            content.innerHTML = '<p class="text-sec">Sélectionnez une planche ou un élément</p>';
        }
    },
    
    updateElementProp: (elementId, prop, value) => {
        const board = MoodBoard.getCurrentBoard();
        const element = board?.elements.find(el => el.id === elementId);
        if(!element) return;
        
        element[prop] = value;
        board.modifiedAt = Date.now();
        Store.save();
        MoodBoard.renderCanvas();
    },
    
    updateBoardName: (name) => {
        const board = MoodBoard.getCurrentBoard();
        if(!board) return;
        
        board.name = name;
        board.modifiedAt = Date.now();
        Store.save();
        MoodBoard.renderBoardsList();
    },
    
    linkBoard: async () => {
        const board = MoodBoard.getCurrentBoard();
        if(!board) return;
        
        // Similaire à linkElement mais pour la planche
        const options = [
            { value: '', label: '— Aucune liaison —' },
            { value: 'project', label: '🎬 Projet global' }
        ];
        
        (state.data.scenes || []).forEach((scene, i) => {
            options.push({ value: `scene_${scene.id}`, label: `📄 Scène ${i+1}: ${scene.title}` });
        });
        
        (state.data.characters || []).forEach(char => {
            options.push({ value: `character_${char.id}`, label: `👤 ${char.name}` });
        });
        
        (state.data.actors || []).forEach(actor => {
            options.push({ value: `actor_${actor.id}`, label: `🎭 ${actor.name}` });
        });
        
        (state.data.locations || []).forEach(loc => {
            options.push({ value: `location_${loc.id}`, label: `📍 ${loc.name}` });
        });
        
        const currentValue = board.linkedTo ? `${board.linkedTo.type}_${board.linkedTo.id || ''}` : '';
        
        const result = await ConfirmModal.prompt({
            title: 'Lier cette planche',
            message: 'Associer cette planche à :',
            defaultValue: currentValue,
            type: 'select',
            options: options
        });
        
        if(result === null) return;
        
        if(result === '') {
            board.linkedTo = null;
        } else if(result === 'project') {
            board.linkedTo = { type: 'project' };
        } else {
            const [type, id] = result.split('_');
            board.linkedTo = { type, id };
        }
        
        board.modifiedAt = Date.now();
        Store.save();
        MoodBoard.renderBoardsList();
        MoodBoard.updateInfoPanel();
        Utils.toast('Liaison mise à jour', 'success');
    },
    
    // ===== MENU RADIAL =====
    
    contextX: 0,
    contextY: 0,
    
    showRadialMenu: (x, y) => {
        MoodBoard.hideRadialMenu();
        
        const items = [
            { icon: '✏️', label: 'Dessiner', action: 'draw', angle: 0 },
            { icon: '📝', label: 'Texte', action: 'text', angle: 60 },
            { icon: '🎨', label: 'Palette', action: 'palette', angle: 120 },
            { icon: '⬡', label: 'Formes', action: 'shapes', angle: 180 },
            { icon: '📁', label: 'Image / Fichier', action: 'file', angle: 240 },
            { icon: '🔗', label: 'Lien web', action: 'link', angle: 300 }
        ];
        
        const radius = 80;
        
        const overlay = document.createElement('div');
        overlay.className = 'moodboard-radial-overlay';
        overlay.onclick = () => MoodBoard.hideRadialMenu();
        document.body.appendChild(overlay);
        
        const menu = document.createElement('div');
        menu.className = 'moodboard-radial-menu';
        menu.id = 'moodboardRadialMenu';
        menu.style.left = x + 'px';
        menu.style.top = y + 'px';
        
        // Centre du menu
        const center = document.createElement('div');
        center.className = 'moodboard-radial-center';
        center.innerHTML = '✕';
        center.onclick = () => MoodBoard.hideRadialMenu();
        menu.appendChild(center);
        
        // Items du menu
        items.forEach((item, i) => {
            const el = document.createElement('div');
            el.className = 'moodboard-radial-item';
            el.innerHTML = `${item.icon}<span class="radial-tooltip">${item.label}</span>`;
            
            const angleRad = (item.angle - 90) * Math.PI / 180;
            const itemX = Math.cos(angleRad) * radius;
            const itemY = Math.sin(angleRad) * radius;
            
            el.style.left = itemX + 'px';
            el.style.top = itemY + 'px';
            el.style.transitionDelay = (i * 0.03) + 's';
            
            el.onclick = () => {
                MoodBoard.hideRadialMenu();
                MoodBoard.handleRadialAction(item.action);
            };
            
            menu.appendChild(el);
        });
        
        document.body.appendChild(menu);
        
        // Activer l'animation
        requestAnimationFrame(() => menu.classList.add('active'));
    },
    
    hideRadialMenu: () => {
        const menu = document.getElementById('moodboardRadialMenu');
        const overlay = document.querySelector('.moodboard-radial-overlay');
        // 31 aout : .moodboard-palette-submenu n'est jamais cree nulle part —
        // seul le panneau texte existe reellement.
        const submenu = document.querySelector('.moodboard-text-panel');
        if(menu) menu.remove();
        if(overlay) overlay.remove();
        if(submenu) submenu.remove();
    },
    
    handleRadialAction: (action) => {
        switch(action) {
            case 'draw':
                MoodBoard.openDrawingTool();
                break;
            case 'text':
                MoodBoard.showTextPanel();
                break;
            case 'palette':
                ColorWheel.open((colors, name) => MoodBoard.addPaletteToBoard(colors, name));
                break;
            case 'shapes':
                MoodBoard.showShapesMenu();
                break;
            case 'file':
                MoodBoard.uploadFile();
                break;
            case 'link':
                MoodBoard.addWebLink();
                break;
        }
    },
    
    showElementContextMenu: (x, y, elementId) => {
        MoodBoard.hideRadialMenu();
        MoodBoard.selectElement(elementId);
        
        const board = MoodBoard.getCurrentBoard();
        const element = board?.elements.find(el => el.id === elementId);
        
        const overlay = document.createElement('div');
        overlay.className = 'moodboard-radial-overlay';
        overlay.onclick = () => MoodBoard.hideRadialMenu();
        document.body.appendChild(overlay);
        
        const menu = document.createElement('div');
        menu.className = 'moodboard-radial-menu';
        menu.id = 'moodboardRadialMenu';
        menu.style.left = x + 'px';
        menu.style.top = y + 'px';
        
        let items = [
            { icon: '⬆️', label: 'Monter', action: () => MoodBoard.moveElementUp(elementId) },
            { icon: '⬇️', label: 'Descendre', action: () => MoodBoard.moveElementDown(elementId) },
            { icon: '🔗', label: 'Lier à...', action: () => MoodBoard.linkElement(elementId) },
            { icon: '📋', label: 'Dupliquer', action: () => MoodBoard.duplicateElement(elementId) },
            { icon: '✏️', label: 'Modifier', action: () => MoodBoard.editElement(elementId) },
            { icon: '🗑️', label: 'Supprimer', action: () => MoodBoard.deleteElement(elementId) }
        ];
        
        // Ajouter option couleur pour les formes
        if(element && element.type === 'shape') {
            items.splice(4, 0, { icon: '🎨', label: 'Couleur', action: () => MoodBoard.changeShapeColor(elementId) });
        }
        
        // Ajouter option renommer pour les palettes
        if(element && element.type === 'palette') {
            items.splice(4, 0, { icon: '✏️', label: 'Renommer', action: () => MoodBoard.renamePalette(elementId) });
        }
        
        // Extraire une palette de couleurs depuis une photo posée sur la planche
        if(element && (element.type === 'image' || element.type === 'drawing')) {
            items.splice(4, 0, { icon: '🎨', label: 'Extraire palette', action: () => MoodBoard.extractPaletteFromImage(elementId) });
        }
        
        const radius = 85;
        
        const center = document.createElement('div');
        center.className = 'moodboard-radial-center';
        center.innerHTML = '✕';
        center.onclick = () => MoodBoard.hideRadialMenu();
        menu.appendChild(center);
        
        items.forEach((item, i) => {
            const el = document.createElement('div');
            el.className = 'moodboard-radial-item';
            el.innerHTML = `${item.icon}<span class="radial-tooltip">${item.label}</span>`;
            
            const angle = (i * 60);  // 6 items = 60° entre chaque
            const angleRad = (angle - 90) * Math.PI / 180;
            const itemX = Math.cos(angleRad) * radius;
            const itemY = Math.sin(angleRad) * radius;
            
            el.style.left = itemX + 'px';
            el.style.top = itemY + 'px';
            el.style.transitionDelay = (i * 0.03) + 's';
            
            el.onclick = () => {
                MoodBoard.hideRadialMenu();
                item.action();
            };
            
            menu.appendChild(el);
        });
        
        document.body.appendChild(menu);
        requestAnimationFrame(() => menu.classList.add('active'));
    },
    
    // ===== OUTILS DU MENU RADIAL =====
    editDrawing: (element) => {
        const board = MoodBoard.getCurrentBoard();
        if(!board || !element) return;
        
        // Charger l'image existante dans le DrawingEditor
        DrawingEditor.open(null, (dataUrl) => {
            if(dataUrl) {
                element.src = dataUrl;
                board.modifiedAt = Date.now();
                Store.save();
                MoodBoard.renderCanvas();
                Utils.toast('Dessin modifié', 'success');
            }
        });
        
        // Charger l'image existante dans le premier calque après ouverture
        setTimeout(() => {
            if(element.src && DrawingEditor.layers.length > 0) {
                const img = new Image();
                img.onload = () => {
                    const ctx = DrawingEditor.layers[0].canvas.getContext('2d');
                    ctx.clearRect(0, 0, 800, 600);
                    ctx.drawImage(img, 0, 0, 800, 600);
                    DrawingEditor.redraw();
                };
                img.src = Utils.signedUrlFor(element.src);
            }
        }, 100);
    },
    
    openDrawingTool: () => {
        const board = MoodBoard.getCurrentBoard();
        if(!board) return;
        
        // Utiliser le DrawingEditor du Storyboard avec callback
        DrawingEditor.open(null, (dataUrl) => {
            if(dataUrl) {
                const element = {
                    id: 'el_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                    type: 'drawing',
                    x: MoodBoard.contextX,
                    y: MoodBoard.contextY,
                    width: 400,
                    height: 300,
                    src: dataUrl,
                    linkedTo: null,
                    layerId: MoodBoard._activeLayerId(board),
                    createdAt: Date.now()
                };
                
                board.elements.push(element);
                board.modifiedAt = Date.now();
                Store.save();
                MoodBoard.renderCanvas();
                Utils.toast('Dessin ajouté', 'success');
            }
        });
    },
    
    showTextPanel: (existingElement = null) => {
        const isEdit = !!existingElement;
        const board = MoodBoard.getCurrentBoard();
        if(!board) return;
        
        const modal = document.createElement('div');
        modal.className = 'confirm-modal-overlay';
        modal.onclick = (e) => { if(e.target === modal) modal.remove(); };
        
        const currentContent = isEdit ? existingElement.content || '' : '';
        const currentFont = isEdit ? existingElement.fontFamily || 'Inter, sans-serif' : 'Inter, sans-serif';
        const currentSize = isEdit ? existingElement.fontSize || 18 : 18;
        const currentColor = isEdit ? existingElement.textColor || '#333333' : '#333333';
        const currentBold = isEdit ? existingElement.fontBold || false : false;
        const currentItalic = isEdit ? existingElement.fontItalic || false : false;
        const currentUnderline = isEdit ? existingElement.fontUnderline || false : false;
        const currentAlign = isEdit ? existingElement.textAlign || 'left' : 'left';
        const currentBgColor = isEdit ? existingElement.bgColor || 'transparent' : 'transparent';
        
        modal.innerHTML = `
            <div class="confirm-modal-box" style="max-width: 550px;">
                <div class="confirm-modal-icon">📝</div>
                <div class="confirm-modal-title">${isEdit ? 'Modifier le texte' : 'Ajouter du texte'}</div>
                
                <!-- Ligne 1: Police et taille -->
                <div style="display: flex; gap: 10px; margin: 15px 0; flex-wrap: wrap; align-items: center;">
                    <select id="mbTextFont" style="flex: 1; padding: 8px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--text-main); min-width: 130px;">
                        <option value="Inter, sans-serif" ${currentFont.includes('Inter') ? 'selected' : ''}>Inter</option>
                        <option value="Georgia, serif" ${currentFont.includes('Georgia') ? 'selected' : ''}>Georgia</option>
                        <option value="'Courier New', monospace" ${currentFont.includes('Courier') ? 'selected' : ''}>Courier New</option>
                        <option value="'Comic Sans MS', cursive" ${currentFont.includes('Comic') ? 'selected' : ''}>Comic Sans</option>
                        <option value="Impact, sans-serif" ${currentFont.includes('Impact') ? 'selected' : ''}>Impact</option>
                        <option value="'Times New Roman', serif" ${currentFont.includes('Times') ? 'selected' : ''}>Times New Roman</option>
                        <option value="Arial, sans-serif" ${currentFont.includes('Arial') ? 'selected' : ''}>Arial</option>
                        <option value="Verdana, sans-serif" ${currentFont.includes('Verdana') ? 'selected' : ''}>Verdana</option>
                        <option value="'Trebuchet MS', sans-serif" ${currentFont.includes('Trebuchet') ? 'selected' : ''}>Trebuchet</option>
                        <option value="'Lucida Console', monospace" ${currentFont.includes('Lucida') ? 'selected' : ''}>Lucida Console</option>
                    </select>
                    <select id="mbTextSize" style="padding: 8px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--text-main); width: 75px;">
                        <option value="10" ${currentSize == 10 ? 'selected' : ''}>10px</option>
                        <option value="12" ${currentSize == 12 ? 'selected' : ''}>12px</option>
                        <option value="14" ${currentSize == 14 ? 'selected' : ''}>14px</option>
                        <option value="16" ${currentSize == 16 ? 'selected' : ''}>16px</option>
                        <option value="18" ${currentSize == 18 ? 'selected' : ''}>18px</option>
                        <option value="24" ${currentSize == 24 ? 'selected' : ''}>24px</option>
                        <option value="32" ${currentSize == 32 ? 'selected' : ''}>32px</option>
                        <option value="48" ${currentSize == 48 ? 'selected' : ''}>48px</option>
                        <option value="64" ${currentSize == 64 ? 'selected' : ''}>64px</option>
                        <option value="72" ${currentSize == 72 ? 'selected' : ''}>72px</option>
                    </select>
                </div>
                
                <!-- Ligne 2: Style et alignement -->
                <div style="display: flex; gap: 8px; margin: 10px 0; flex-wrap: wrap; align-items: center;">
                    <div class="n8-flex-7">
                        <button type="button" id="mbTextBold" class="mb-text-style-btn ${currentBold ? 'active' : ''}" title="Gras" style="width: 32px; height: 32px; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; background: ${currentBold ? 'var(--primary)' : 'transparent'}; color: ${currentBold ? 'white' : 'var(--text-main)'};">B</button>
                        <button type="button" id="mbTextItalic" class="mb-text-style-btn ${currentItalic ? 'active' : ''}" title="Italique" style="width: 32px; height: 32px; border: none; border-radius: 4px; cursor: pointer; font-style: italic; background: ${currentItalic ? 'var(--primary)' : 'transparent'}; color: ${currentItalic ? 'white' : 'var(--text-main)'};">I</button>
                        <button type="button" id="mbTextUnderline" class="mb-text-style-btn ${currentUnderline ? 'active' : ''}" title="Souligné" style="width: 32px; height: 32px; border: none; border-radius: 4px; cursor: pointer; text-decoration: underline; background: ${currentUnderline ? 'var(--primary)' : 'transparent'}; color: ${currentUnderline ? 'white' : 'var(--text-main)'};">U</button>
                    </div>
                    <div class="n8-flex-7">
                        <button type="button" id="mbTextAlignLeft" class="mb-text-align-btn ${currentAlign === 'left' ? 'active' : ''}" title="Aligner à gauche" style="width: 32px; height: 32px; border: none; border-radius: 4px; cursor: pointer; background: ${currentAlign === 'left' ? 'var(--primary)' : 'transparent'}; color: ${currentAlign === 'left' ? 'white' : 'var(--text-main)'};">⬛</button>
                        <button type="button" id="mbTextAlignCenter" class="mb-text-align-btn ${currentAlign === 'center' ? 'active' : ''}" title="Centrer" style="width: 32px; height: 32px; border: none; border-radius: 4px; cursor: pointer; background: ${currentAlign === 'center' ? 'var(--primary)' : 'transparent'}; color: ${currentAlign === 'center' ? 'white' : 'var(--text-main)'};">⬛</button>
                        <button type="button" id="mbTextAlignRight" class="mb-text-align-btn ${currentAlign === 'right' ? 'active' : ''}" title="Aligner à droite" style="width: 32px; height: 32px; border: none; border-radius: 4px; cursor: pointer; background: ${currentAlign === 'right' ? 'var(--primary)' : 'transparent'}; color: ${currentAlign === 'right' ? 'white' : 'var(--text-main)'};">⬛</button>
                    </div>
                    <div style="display: flex; gap: 6px; align-items: center; margin-left: auto;">
                        <label class="text-sec-sm">Texte:</label>
                        <input type="color" id="mbTextColor" value="${currentColor}" class="n8-misc-2">
                        <label class="text-sec-sm">Fond:</label>
                        <input type="color" id="mbTextBgColor" value="${currentBgColor === 'transparent' ? '#ffffff' : currentBgColor}" class="n8-misc-2">
                        <label style="font-size: 0.75rem; display: flex; align-items: center; gap: 3px;"><input type="checkbox" id="mbTextBgTransparent" ${currentBgColor === 'transparent' ? 'checked' : ''}> Transparent</label>
                    </div>
                </div>
                
                <!-- Zone de texte -->
                <div style="margin: 15px 0;">
                    <textarea id="mbTextContent" placeholder="Votre texte ici..." data-tooltip="Votre texte ici..." style="width: 100%; height: 130px; padding: 12px; border: 1px solid var(--border); border-radius: 6px; background: ${currentBgColor === 'transparent' ? 'var(--bg)' : currentBgColor}; color: ${currentColor}; resize: vertical; font-family: ${currentFont}; font-size: ${currentSize}px; font-weight: ${currentBold ? 'bold' : 'normal'}; font-style: ${currentItalic ? 'italic' : 'normal'}; text-decoration: ${currentUnderline ? 'underline' : 'none'}; text-align: ${currentAlign};">${Utils.escape(currentContent)}</textarea>
                </div>
                
                <div class="confirm-modal-buttons">
                    <button class="confirm-modal-btn cancel" onclick="this.closest('.confirm-modal-overlay').remove()">Annuler</button>
                    <button class="confirm-modal-btn confirm" id="mbSaveTextBtn">${isEdit ? 'Enregistrer' : 'Ajouter'}</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        const textarea = document.getElementById('mbTextContent');
        const fontSelect = document.getElementById('mbTextFont');
        const sizeSelect = document.getElementById('mbTextSize');
        const colorInput = document.getElementById('mbTextColor');
        const bgColorInput = document.getElementById('mbTextBgColor');
        const bgTransparentCb = document.getElementById('mbTextBgTransparent');
        const boldBtn = document.getElementById('mbTextBold');
        const italicBtn = document.getElementById('mbTextItalic');
        const underlineBtn = document.getElementById('mbTextUnderline');
        const alignLeftBtn = document.getElementById('mbTextAlignLeft');
        const alignCenterBtn = document.getElementById('mbTextAlignCenter');
        const alignRightBtn = document.getElementById('mbTextAlignRight');
        
        let isBold = currentBold;
        let isItalic = currentItalic;
        let isUnderline = currentUnderline;
        let textAlign = currentAlign;
        
        // Prévisualisation en direct
        const updatePreview = () => {
            textarea.style.fontFamily = fontSelect.value;
            textarea.style.fontSize = sizeSelect.value + 'px';
            textarea.style.color = colorInput.value;
            textarea.style.fontWeight = isBold ? 'bold' : 'normal';
            textarea.style.fontStyle = isItalic ? 'italic' : 'normal';
            textarea.style.textDecoration = isUnderline ? 'underline' : 'none';
            textarea.style.textAlign = textAlign;
            textarea.style.background = bgTransparentCb.checked ? 'var(--bg)' : bgColorInput.value;
        };
        
        const updateStyleBtn = (btn, active) => {
            btn.style.background = active ? 'var(--primary)' : 'transparent';
            btn.style.color = active ? 'white' : 'var(--text-main)';
        };
        
        const updateAlignBtns = () => {
            updateStyleBtn(alignLeftBtn, textAlign === 'left');
            updateStyleBtn(alignCenterBtn, textAlign === 'center');
            updateStyleBtn(alignRightBtn, textAlign === 'right');
        };
        
        fontSelect.onchange = updatePreview;
        sizeSelect.onchange = updatePreview;
        colorInput.oninput = updatePreview;
        bgColorInput.oninput = updatePreview;
        bgTransparentCb.onchange = updatePreview;
        
        boldBtn.onclick = () => { isBold = !isBold; updateStyleBtn(boldBtn, isBold); updatePreview(); };
        italicBtn.onclick = () => { isItalic = !isItalic; updateStyleBtn(italicBtn, isItalic); updatePreview(); };
        underlineBtn.onclick = () => { isUnderline = !isUnderline; updateStyleBtn(underlineBtn, isUnderline); updatePreview(); };
        
        alignLeftBtn.onclick = () => { textAlign = 'left'; updateAlignBtns(); updatePreview(); };
        alignCenterBtn.onclick = () => { textAlign = 'center'; updateAlignBtns(); updatePreview(); };
        alignRightBtn.onclick = () => { textAlign = 'right'; updateAlignBtns(); updatePreview(); };
        
        document.getElementById('mbSaveTextBtn').onclick = () => {
            const content = textarea.value.trim();
            if(!content) {
                Utils.toast('Entrez du texte', 'warning');
                return;
            }
            
            const textData = {
                content: content,
                fontFamily: fontSelect.value,
                fontSize: parseInt(sizeSelect.value),
                textColor: colorInput.value,
                fontBold: isBold,
                fontItalic: isItalic,
                fontUnderline: isUnderline,
                textAlign: textAlign,
                bgColor: bgTransparentCb.checked ? 'transparent' : bgColorInput.value
            };
            
            if(isEdit) {
                Object.assign(existingElement, textData);
            } else {
                const element = {
                    id: 'el_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                    type: 'text',
                    x: MoodBoard.contextX,
                    y: MoodBoard.contextY,
                    width: 280,
                    height: 160,
                    ...textData,
                    linkedTo: null,
                    layerId: MoodBoard._activeLayerId(board),
                    createdAt: Date.now()
                };
                board.elements.push(element);
            }
            
            board.modifiedAt = Date.now();
            Store.save();
            modal.remove();
            MoodBoard.renderCanvas();
            Utils.toast(isEdit ? 'Texte modifié' : 'Texte ajouté', 'success');
        };
        
        textarea.focus();
    },
    
    shapes: [
        // Formes de base
        { id: 'rect', icon: '⬜', name: 'Rectangle', svg: '<rect x="5" y="5" width="90" height="90" fill="currentColor"/>' },
        { id: 'rect-rounded', icon: '▢', name: 'Rectangle arrondi', svg: '<rect x="5" y="5" width="90" height="90" fill="currentColor" rx="15"/>' },
        { id: 'circle', icon: '⬤', name: 'Cercle', svg: '<circle cx="50" cy="50" r="45" fill="currentColor"/>' },
        { id: 'ellipse', icon: '⬭', name: 'Ellipse', svg: '<ellipse cx="50" cy="50" rx="45" ry="30" fill="currentColor"/>' },
        { id: 'triangle', icon: '▲', name: 'Triangle', svg: '<polygon points="50,5 95,95 5,95" fill="currentColor"/>' },
        { id: 'triangle-down', icon: '▼', name: 'Triangle inversé', svg: '<polygon points="5,5 95,5 50,95" fill="currentColor"/>' },
        { id: 'diamond', icon: '◆', name: 'Losange', svg: '<polygon points="50,5 95,50 50,95 5,50" fill="currentColor"/>' },
        { id: 'pentagon', icon: '⬠', name: 'Pentagone', svg: '<polygon points="50,5 97,38 79,95 21,95 3,38" fill="currentColor"/>' },
        { id: 'hexagon', icon: '⬡', name: 'Hexagone', svg: '<polygon points="50,5 93,25 93,75 50,95 7,75 7,25" fill="currentColor"/>' },
        { id: 'octagon', icon: '⯃', name: 'Octogone', svg: '<polygon points="30,5 70,5 95,30 95,70 70,95 30,95 5,70 5,30" fill="currentColor"/>' },
        { id: 'star', icon: '★', name: 'Étoile 5', svg: '<polygon points="50,5 61,35 95,35 68,57 79,91 50,70 21,91 32,57 5,35 39,35" fill="currentColor"/>' },
        { id: 'star4', icon: '✦', name: 'Étoile 4', svg: '<polygon points="50,5 60,40 95,50 60,60 50,95 40,60 5,50 40,40" fill="currentColor"/>' },
        // Flèches
        { id: 'arrow-right', icon: '➡️', name: 'Flèche droite', svg: '<polygon points="5,30 55,30 55,10 95,50 55,90 55,70 5,70" fill="currentColor"/>' },
        { id: 'arrow-left', icon: '⬅️', name: 'Flèche gauche', svg: '<polygon points="95,30 45,30 45,10 5,50 45,90 45,70 95,70" fill="currentColor"/>' },
        { id: 'arrow-up', icon: '⬆️', name: 'Flèche haut', svg: '<polygon points="30,95 30,45 10,45 50,5 90,45 70,45 70,95" fill="currentColor"/>' },
        { id: 'arrow-down', icon: '⬇️', name: 'Flèche bas', svg: '<polygon points="30,5 30,55 10,55 50,95 90,55 70,55 70,5" fill="currentColor"/>' },
        { id: 'arrow-double', icon: '↔️', name: 'Flèche double', svg: '<polygon points="5,50 25,30 25,42 75,42 75,30 95,50 75,70 75,58 25,58 25,70" fill="currentColor"/>' },
        { id: 'chevron-right', icon: '›', name: 'Chevron droite', svg: '<polygon points="25,5 75,50 25,95 35,95 85,50 35,5" fill="currentColor"/>' },
        { id: 'chevron-left', icon: '‹', name: 'Chevron gauche', svg: '<polygon points="75,5 25,50 75,95 65,95 15,50 65,5" fill="currentColor"/>' },
        // Bulles et communication
        { id: 'bubble', icon: '💬', name: 'Bulle parole', svg: '<path d="M5,5 L95,5 Q98,5 98,8 L98,65 Q98,68 95,68 L35,68 L20,90 L20,68 L5,68 Q2,68 2,65 L2,8 Q2,5 5,5 Z" fill="currentColor"/>' },
        { id: 'bubble-round', icon: '🗨️', name: 'Bulle ronde', svg: '<ellipse cx="50" cy="40" rx="45" ry="35" fill="currentColor"/><polygon points="25,65 35,90 45,68" fill="currentColor"/>' },
        { id: 'bubble-thought', icon: '💭', name: 'Bulle pensée', svg: '<ellipse cx="50" cy="35" rx="40" ry="30" fill="currentColor"/><circle cx="25" cy="75" r="8" fill="currentColor"/><circle cx="15" cy="90" r="5" fill="currentColor"/>' },
        // Symboles
        { id: 'heart', icon: '❤️', name: 'Cœur', svg: '<path d="M50,90 C15,60 5,35 20,20 C35,5 50,15 50,30 C50,15 65,5 80,20 C95,35 85,60 50,90 Z" fill="currentColor"/>' },
        { id: 'cross', icon: '✚', name: 'Croix', svg: '<polygon points="35,5 65,5 65,35 95,35 95,65 65,65 65,95 35,95 35,65 5,65 5,35 35,35" fill="currentColor"/>' },
        { id: 'x-mark', icon: '✕', name: 'X', svg: '<polygon points="20,5 50,35 80,5 95,20 65,50 95,80 80,95 50,65 20,95 5,80 35,50 5,20" fill="currentColor"/>' },
        { id: 'check', icon: '✓', name: 'Check', svg: '<polygon points="10,50 20,40 40,60 80,20 90,30 40,85" fill="currentColor"/>' },
        { id: 'plus', icon: '＋', name: 'Plus', svg: '<rect x="40" y="10" width="20" height="80" fill="currentColor"/><rect x="10" y="40" width="80" height="20" fill="currentColor"/>' },
        { id: 'minus', icon: '−', name: 'Moins', svg: '<rect x="10" y="40" width="80" height="20" fill="currentColor" rx="3"/>' },
        // Lignes
        { id: 'line-h', icon: '─', name: 'Ligne horizontale', svg: '<rect x="5" y="45" width="90" height="10" fill="currentColor"/>' },
        { id: 'line-v', icon: '│', name: 'Ligne verticale', svg: '<rect x="45" y="5" width="10" height="90" fill="currentColor"/>' },
        { id: 'line-diag', icon: '╱', name: 'Ligne diagonale', svg: '<polygon points="90,5 95,10 10,95 5,90" fill="currentColor"/>' },
        // Cadres
        { id: 'frame', icon: '☐', name: 'Cadre', svg: '<rect x="5" y="5" width="90" height="90" fill="none" stroke="currentColor" stroke-width="8"/>' },
        { id: 'frame-rounded', icon: '⃞', name: 'Cadre arrondi', svg: '<rect x="5" y="5" width="90" height="90" fill="none" stroke="currentColor" stroke-width="8" rx="15"/>' },
        { id: 'circle-frame', icon: '○', name: 'Cercle vide', svg: '<circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" stroke-width="8"/>' }
    ],
    
    showShapesMenu: () => {
        MoodBoard.hideRadialMenu();
        
        const menu = document.createElement('div');
        menu.className = 'moodboard-shape-submenu';
        menu.id = 'moodboardShapeMenu';
        
        MoodBoard.shapes.forEach(shape => {
            const btn = document.createElement('div');
            btn.className = 'moodboard-shape-option';
            btn.innerHTML = shape.icon;
            btn.title = shape.name;
            btn.onclick = () => {
                MoodBoard.addShape(shape.id);
                menu.remove();
            };
            menu.appendChild(btn);
        });
        
        document.body.appendChild(menu);
        
        // Positionner près du clic mais toujours visible
        const wrapper = document.getElementById('moodboardCanvasWrapper');
        const rect = wrapper.getBoundingClientRect();
        let posX = MoodBoard.contextX * MoodBoard.zoom + MoodBoard.panX + rect.left;
        let posY = MoodBoard.contextY * MoodBoard.zoom + MoodBoard.panY + rect.top;
        
        // Ajuster si le menu dépasse à droite
        const menuRect = menu.getBoundingClientRect();
        if(posX + menuRect.width > window.innerWidth - 20) {
            posX = window.innerWidth - menuRect.width - 20;
        }
        // Ajuster si le menu dépasse en bas
        if(posY + menuRect.height > window.innerHeight - 20) {
            posY = window.innerHeight - menuRect.height - 20;
        }
        // Ajuster si le menu dépasse en haut ou à gauche
        if(posX < 20) posX = 20;
        if(posY < 20) posY = 20;
        
        menu.style.left = posX + 'px';
        menu.style.top = posY + 'px';
        
        // Fermer si clic ailleurs
        setTimeout(() => {
            const closeHandler = (e) => {
                if(!menu.contains(e.target)) {
                    menu.remove();
                    document.removeEventListener('click', closeHandler);
                }
            };
            document.addEventListener('click', closeHandler);
        }, 100);
    },
    
    renamePalette: async (elementId) => {
        if(!MoodBoard.canWrite()) return;
        const board = MoodBoard.getCurrentBoard();
        const element = board?.elements.find(el => el.id === elementId);
        if(!element) return;
        
        MoodBoard.hideRadialMenu();
        
        const newName = await ConfirmModal.prompt('Nom de la palette :', 'Renommer la palette', 'Nom...', element.paletteName || 'Sans nom');
        if(newName !== null && newName.trim()) {
            element.paletteName = newName.trim();
            board.modifiedAt = Date.now();
            Store.save();
            MoodBoard.renderCanvas();
            Utils.toast('Palette renommée', 'success');
        }
    },
    
    changeShapeColor: async (elementId) => {
        if(!MoodBoard.canWrite()) return;
        const board = MoodBoard.getCurrentBoard();
        const element = board?.elements.find(el => el.id === elementId);
        if(!element) return;
        
        MoodBoard.hideRadialMenu();
        
        const modal = document.createElement('div');
        modal.className = 'confirm-modal-overlay';
        modal.onclick = (e) => { if(e.target === modal) modal.remove(); };
        
        modal.innerHTML = `
            <div class="confirm-modal-box" style="max-width: 350px;">
                <div class="confirm-modal-icon">🎨</div>
                <div class="confirm-modal-title">Couleur de la forme</div>
                <div style="display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; margin: 20px 0;">
                    ${['#000000', '#FFFFFF', '#FF0000', '#FF6B00', '#FFD700', '#00C853', '#2196F3', '#9C27B0', '#E91E63', '#795548', '#607D8B', '#00BCD4'].map(c => 
                        `<div onclick="document.getElementById('shapeColorInput').value='${c}'; document.getElementById('shapeColorPreview').style.background='${c}';" 
                             style="width: 40px; height: 40px; background: ${c}; border-radius: 8px; cursor: pointer; border: 2px solid ${c === '#FFFFFF' ? '#ddd' : 'transparent'}; box-shadow: 0 2px 5px rgba(0,0,0,0.2);"></div>`
                    ).join('')}
                </div>
                <div style="display: flex; align-items: center; gap: 10px; margin: 15px 0;">
                    <div id="shapeColorPreview" style="width: 50px; height: 50px; background: ${element.color || '#000000'}; border-radius: 8px; border: 1px solid #ddd;"></div>
                    <input type="color" id="shapeColorInput" value="${element.color || '#000000'}" 
                           onchange="document.getElementById('shapeColorPreview').style.background=this.value"
                           style="flex: 1; height: 50px; cursor: pointer; border: none; border-radius: 8px;">
                </div>
                <div class="confirm-modal-buttons">
                    <button class="confirm-modal-btn cancel" onclick="this.closest('.confirm-modal-overlay').remove()">Annuler</button>
                    <button class="confirm-modal-btn confirm" id="applyShapeColorBtn">Appliquer</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        document.getElementById('applyShapeColorBtn').onclick = () => {
            element.color = document.getElementById('shapeColorInput').value;
            board.modifiedAt = Date.now();
            Store.save();
            MoodBoard.renderCanvas();
            modal.remove();
            Utils.toast('Couleur modifiée', 'success');
        };
    },
    
    addShape: (shapeId) => {
        const board = MoodBoard.getCurrentBoard();
        if(!board) return;
        
        const shape = MoodBoard.shapes.find(s => s.id === shapeId);
        if(!shape) return;
        
        const element = {
            id: 'el_' + Utils.generateUniqueId(),
            type: 'shape',
            shapeId: shapeId,
            x: MoodBoard.contextX,
            y: MoodBoard.contextY,
            width: 150,
            height: 150,
            color: '#000000',
            rotation: 0,
            linkedTo: null,
            layerId: MoodBoard._activeLayerId(board),
            createdAt: Date.now()
        };
        
        board.elements.push(element);
        board.modifiedAt = Date.now();
        Store.save();
        
        MoodBoard.renderCanvas();
        Utils.toast('Forme ajoutée', 'success');
    },
    
    // Extrait une palette depuis une image posee sur la planche : ouvre le
    // meme outil que la creation normale de palette (la roue teinte/
    // harmonie), avec la photo affichee a cote et un bouton "Auto" qui relance
    // l'extraction. Reutilise le chargeur d'image de StoryboardExport : les
    // images du bucket prive doivent passer par un blob telecharge, jamais
    // par crossOrigin sur l'URL signee (sinon le canvas est "tainte" et
    // illisible).
    extractPaletteFromImage: (elementId) => {
        const board = MoodBoard.getCurrentBoard();
        const element = board?.elements.find(el => el.id === elementId);
        if(!element || !element.src) return;
        if(typeof StoryboardExport === 'undefined' || !StoryboardExport._loadPrintImg) { Utils.toast('Extraction indisponible.', 'error'); return; }
        Utils.toast('Analyse de la photo...', 'info', 2000);
        const img = new Image();
        StoryboardExport._loadPrintImg(img, element.src, () => {
            try {
                const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
                if(!w || !h) throw new Error('image vide');
                const maxDim = 300; // suffisant pour l'analyse et l'aperçu dans la fenetre
                const scale = Math.min(1, maxDim / Math.max(w, h));
                const canvas = document.createElement('canvas');
                canvas.width = Math.max(1, Math.round(w * scale));
                canvas.height = Math.max(1, Math.round(h * scale));
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                const photoSrc = canvas.toDataURL();
                const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
                const sample = (x, y) => {
                    const px = Math.max(0, Math.min(canvas.width - 1, Math.round(x)));
                    const py = Math.max(0, Math.min(canvas.height - 1, Math.round(y)));
                    const i = (py * canvas.width + px) * 4;
                    return '#' + [pixels[i], pixels[i + 1], pixels[i + 2]].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
                };
                // Retrouve, dans la photo, le pixel le plus proche d'une couleur
                // donnee — utilise pour replacer le point quand la couleur change
                // sans venir d'un clic sur la photo (harmonie, luminosite, hex saisi).
                const findNearestPixel = (hex) => {
                    const rgb = ColorWheel.hexToRgb(hex) || { r: 0, g: 0, b: 0 };
                    let best = null, bestDist = Infinity;
                    const step = 2; // un pixel sur deux : largement assez fin, deux fois plus rapide
                    for(let y = 0; y < canvas.height; y += step) {
                        for(let x = 0; x < canvas.width; x += step) {
                            const i = (y * canvas.width + x) * 4;
                            if(pixels[i + 3] < 100) continue;
                            const dr = pixels[i] - rgb.r, dg = pixels[i + 1] - rgb.g, db = pixels[i + 2] - rgb.b;
                            const d = dr * dr + dg * dg + db * db;
                            if(d < bestDist) { bestDist = d; best = { x, y }; }
                        }
                    }
                    return best || { x: canvas.width / 2, y: canvas.height / 2 };
                };
                const scan = MoodBoard._scanPhoto(canvas, ctx);
                const initialPoints = MoodBoard._computeHarmonyPalette(scan, 'analogous', null);
                ColorWheel.open((colors, name) => {
                    MoodBoard.contextX = element.x;
                    MoodBoard.contextY = element.y + element.height + 20;
                    MoodBoard.addPaletteToBoard(colors, name);
                }, initialPoints.map(c => c.hex), 'Palette extraite', {
                    photoSrc, canvasW: canvas.width, canvasH: canvas.height,
                    initialPoints, sample, findNearestPixel,
                    // Calcule les 5 couleurs pour une harmonie donnee, avec ou
                    // sans case verrouillee (glissee/tapee) — voir
                    // MoodBoard._computeHarmonyPalette pour le detail.
                    computePalette: (harmonyKey, lock) => MoodBoard._computeHarmonyPalette(scan, harmonyKey, lock)
                });
            } catch(e) {
                console.warn('[MoodBoard] extractPaletteFromImage:', e);
                Utils.toast("Impossible d'analyser cette image (protégée par le navigateur).", 'error');
            }
        });
    },

    // Scanne la photo et construit la liste des couleurs candidates (une par
    // bucket de teinte proche), avec teinte/saturation/luminosite calculees.
    // Calcule UNE FOIS a l'ouverture, puis reutilise par Auto et par le
    // glisser en direct — rescanner toute l'image a chaque mouvement de
    // souris serait trop lent.
    // Scanne la photo une seule fois et construit deux choses :
    //  - candidates : couleurs reelles moyennes par petit bucket de pixels
    //    (pour ancrer chaque case de la palette a un vrai pixel de la photo)
    //  - hueBins : le poids total de chaque famille de teinte sur l'ENSEMBLE
    //    de la photo (tous les verts ensemble, tous les oranges ensemble...),
    //    qui sert a reperer les plus grands regroupements de couleur.
    _scanPhoto: (canvas, ctx) => {
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        const buckets = {};
        const NBINS = 24; // pas de 15 degres
        const bins = Array.from({ length: NBINS }, () => ({ weight: 0 }));
        for(let y = 0; y < canvas.height; y++) {
            for(let x = 0; x < canvas.width; x++) {
                const i = (y * canvas.width + x) * 4;
                if(data[i + 3] < 100) continue; // pixel transparent ignore
                const r = data[i], g = data[i + 1], b = data[i + 2];
                const key = (r >> 4) + ',' + (g >> 4) + ',' + (b >> 4);
                const bkt = buckets[key] || (buckets[key] = { r: 0, g: 0, b: 0, n: 0, sampleX: x, sampleY: y });
                bkt.r += r; bkt.g += g; bkt.b += b; bkt.n++;

                const max = Math.max(r, g, b), min = Math.min(r, g, b);
                if(max === min) continue; // gris pur : pas de teinte fiable
                const sat = (max - min) / (255 - Math.abs(max + min - 255));
                if(sat < 0.15) continue; // trop peu sature pour compter dans une famille de teinte
                let h;
                const d = max - min;
                if(max === r) h = ((g - b) / d + (g < b ? 6 : 0));
                else if(max === g) h = (b - r) / d + 2;
                else h = (r - g) / d + 4;
                h = (h * 60 + 360) % 360;
                bins[Math.floor(h / (360 / NBINS)) % NBINS].weight++;
            }
        }
        const candidates = Object.values(buckets).map(c => {
            const r = Math.round(c.r / c.n), g = Math.round(c.g / c.n), b = Math.round(c.b / c.n);
            const hex = '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
            const hsl = ColorWheel.hexToHsl(hex);
            return { r, g, b, n: c.n, x: c.sampleX, y: c.sampleY, hex, hue: hsl.h, sat: hsl.s, light: hsl.l };
        }).sort((a, b) => b.n - a.n).slice(0, 200);

        const hueBins = bins.map((bk, i) => ({ hue: (i + 0.5) * (360 / NBINS), weight: bk.weight })).filter(b => b.weight > 0);
        return { candidates, hueBins };
    },

    // Cherche la rotation de l'harmonie qui capture le mieux les plus gros
    // regroupements de teinte de la photo : essaie chaque famille de teinte
    // importante a la place de chacun des angles de l'harmonie, et garde la
    // rotation qui fait correspondre le plus de poids reel a l'ensemble des
    // angles.
    _findBestAnchor: (hueBins, harmonyKey) => {
        const def = (ColorWheel.harmonies[harmonyKey]) || { angles: [-30, -15, 0, 15, 30] };
        const hueDist = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
        const major = hueBins.slice().sort((a, b) => b.weight - a.weight).slice(0, 12);
        if(!major.length) return 0;

        let bestAnchor = major[0].hue, bestScore = -1;
        major.forEach(candidate => {
            def.angles.forEach(angleAsThisSlot => {
                const anchor = (candidate.hue - angleAsThisSlot + 360) % 360;
                let score = 0;
                def.angles.forEach(a => {
                    const target = (anchor + a + 360) % 360;
                    let closest = hueBins[0];
                    hueBins.forEach(b => { if(hueDist(b.hue, target) < hueDist(closest.hue, target)) closest = b; });
                    score += closest.weight * Math.max(0, 1 - hueDist(closest.hue, target) / 40);
                });
                if(score > bestScore) { bestScore = score; bestAnchor = anchor; }
            });
        });
        return bestAnchor;
    },

    // Coeur du systeme : calcule les 5 couleurs de la palette pour une
    // harmonie donnee, sans jamais deformer sa forme (les ecarts de teinte
    // entre les 5 cases restent EXACTEMENT ceux de l'harmonie — comme les
    // coins d'un carre qui peut tourner et grossir/reduire mais jamais se
    // deformer). Deux modes :
    //  - lock=null (Auto) : la forme est posee la ou elle capture le mieux
    //    les grands regroupements de teinte de la photo (_findBestAnchor).
    //  - lock={idx, hue, sat, light, exact} : l'utilisateur a lui-meme fixe
    //    la case idx (glisser sur la roue/la photo, ou hex tape a la main) —
    //    la forme entiere tourne/change de taille autour de CE point-la.
    // Chaque case (sauf celle verrouillee avec une couleur exacte) est
    // ensuite ancree au vrai pixel de la photo le plus proche de sa cible
    // theorique, pour que la palette reste credible par rapport a l'image.
    _computeHarmonyPalette: (scan, harmonyKey, lock) => {
        const { candidates, hueBins } = scan;
        const def = (ColorWheel.harmonies[harmonyKey]) || { angles: [-30, -15, 0, 15, 30] };
        const hueDist = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

        let anchorHue, baseSat, baseLight;
        if(lock) {
            anchorHue = (lock.hue - def.angles[lock.idx] + 360) % 360;
            baseSat = lock.sat;
            baseLight = lock.light;
        } else {
            anchorHue = MoodBoard._findBestAnchor(hueBins, harmonyKey);
            const near = candidates.filter(c => hueDist(c.hue, anchorHue) < 25 && c.sat > 12);
            const pool = near.length ? near : candidates;
            baseSat = pool.length ? pool.reduce((s, c) => s + c.sat, 0) / pool.length : 60;
            baseLight = pool.length ? pool.reduce((s, c) => s + c.light, 0) / pool.length : 50;
            baseLight = Math.max(20, Math.min(80, baseLight));
        }

        const theoretical = def.angles.map((angle, j) => ({
            hue: (anchorHue + angle + 360) % 360,
            saturation: Math.round(def.saturations ? def.saturations[j] : baseSat),
            lightness: Math.round(def.lightnesses ? def.lightnesses[j] : baseLight)
        }));

        return theoretical.map((t, j) => {
            if(lock && j === lock.idx && lock.exact) {
                return { ...t, hex: lock.exact.hex, x: lock.exact.x, y: lock.exact.y };
            }
            // N'accepter qu'un pixel assez sature : un gris/presque-neutre a une
            // teinte instable et pouvait sinon "gagner" par erreur au score.
            const saturated = candidates.filter(c => c.sat > 15);
            const pool = saturated.length ? saturated : candidates;
            let best = null, bestHueDist = Infinity, bestScore = Infinity;
            pool.forEach(c => {
                const hd = hueDist(c.hue, t.hue);
                const score = hd * 2 + Math.abs(c.light - t.lightness) * 0.5;
                if(score < bestScore) { bestScore = score; bestHueDist = hd; best = c; }
            });
            // Au-dela de cet ecart de teinte, ce n'est plus vraiment "cette
            // couleur" — mieux vaut le dire franchement que d'en inventer une.
            if(!best || bestHueDist > 30) {
                return { ...t, hex: null, x: null, y: null, notFound: true };
            }
            return { ...t, hex: best.hex, x: best.x, y: best.y };
        });
    },

    addPaletteToBoard: (colors, name) => {
        const board = MoodBoard.getCurrentBoard();
        if(!board) return;
        
        const element = {
            id: 'el_' + Utils.generateUniqueId(),
            type: 'palette',
            x: MoodBoard.contextX,
            y: MoodBoard.contextY,
            width: 500,
            height: 200,
            colors: colors,
            paletteName: name,
            linkedTo: null,
            layerId: MoodBoard._activeLayerId(board),
            createdAt: Date.now()
        };
        
        board.elements.push(element);
        board.modifiedAt = Date.now();
        Store.save();
        
        MoodBoard.renderCanvas();
        Utils.toast('Palette "' + name + '" ajoutée', 'success');
    },
    
    uploadFile: () => {
        const board = MoodBoard.getCurrentBoard();
        if(!board) {
            Utils.toast('Sélectionnez d\'abord une planche', 'warning');
            return;
        }
        
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.pdf,.doc,.docx,.txt,.rtf,.xls,.xlsx,.ppt,.pptx,image/*';
        input.multiple = true;
        input.onchange = async (e) => {
            Array.from(e.target.files).forEach((file, i) => {
                const offsetX = MoodBoard.contextX + i * 30;
                const offsetY = MoodBoard.contextY + i * 30;
                
                if(file.type.startsWith('image/')) {
                    MoodBoard.addImageFromFile(file, offsetX, offsetY);
                    return;
                }
                
                // Pour les documents, créer un élément fichier
                const reader = new FileReader();
                reader.onload = (ev) => {
                    const currentBoard = MoodBoard.getCurrentBoard();
                    if(!currentBoard) return;
                    
                    const element = {
                        id: 'el_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                        type: 'file',
                        x: offsetX,
                        y: offsetY,
                        width: 180,
                        height: 140,
                        fileName: file.name,
                        fileType: file.type || MoodBoard.getFileType(file.name),
                        fileSize: file.size,
                        fileData: ev.target.result,
                        linkedTo: null,
                        layerId: MoodBoard._activeLayerId(currentBoard),
                        createdAt: Date.now()
                    };
                    
                    currentBoard.elements.push(element);
                    currentBoard.modifiedAt = Date.now();
                    Store.save();
                    
                    MoodBoard.renderCanvas();
                    Utils.toast('Fichier ajouté: ' + file.name, 'success');
                };
                reader.readAsDataURL(file);
            });
        };
        input.click();
    },
    
    getFileType: (fileName) => {
        const ext = fileName.split('.').pop().toLowerCase();
        const types = {
            'pdf': 'application/pdf',
            'doc': 'application/msword',
            'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'xls': 'application/vnd.ms-excel',
            'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'ppt': 'application/vnd.ms-powerpoint',
            'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'txt': 'text/plain',
            'rtf': 'application/rtf'
        };
        return types[ext] || 'application/octet-stream';
    },
    
    openFile: (elementId) => {
        const board = MoodBoard.getCurrentBoard();
        const element = board?.elements.find(el => el.id === elementId);
        if(!element || !element.fileData) return;
        
        // Ouvrir le fichier dans un nouvel onglet
        const win = window.open();
        if(element.fileType.includes('pdf')) {
            const pdfSrc = String(element.fileData);
            const safePdf = /^(data:application\/pdf[;,]|https:\/\/)/i.test(pdfSrc) ? pdfSrc.replace(/"/g, '%22') : '';
            if(safePdf) {
                win.document.write(`<iframe src="${safePdf}" style="width:100%;height:100%;border:none;"></iframe>`);
            } else {
                win.document.write('<p style="font-family:sans-serif;padding:20px;">Aperçu PDF indisponible.</p>');
            }
        } else {
            win.document.write(`<html><head><title>${Utils.escape(element.fileName)}</title></head><body>
                <p>Fichier: <strong>${Utils.escape(element.fileName)}</strong></p>
                <p><a href="${Utils.escape(element.fileData)}" download="${Utils.escape(element.fileName)}">📥 Télécharger</a></p>
            </body></html>`);
        }
    },
    
    addWebLink: async () => {
        const url = await ConfirmModal.prompt({
            title: 'Ajouter un lien web',
            message: 'URL du lien (page web, image, vidéo...) :',
            placeholder: 'https://...'
        });
        
        if(!url) return;
        
        const board = MoodBoard.getCurrentBoard();
        if(!board) return;
        
        const element = {
            id: 'el_' + Utils.generateUniqueId(),
            type: 'link',
            x: MoodBoard.contextX,
            y: MoodBoard.contextY,
            width: 200,
            height: 120,
            url: url,
            title: new URL(url).hostname || 'Lien',
            linkedTo: null,
            layerId: MoodBoard._activeLayerId(board),
            createdAt: Date.now()
        };
        
        board.elements.push(element);
        board.modifiedAt = Date.now();
        Store.save();
        
        MoodBoard.renderCanvas();
        Utils.toast('Lien ajouté', 'success');
    },
    
    // ===== EXPORT =====
    
    // Convertir un SVG en image pour l'export
    svgToImage: (svgContent, color, width, height) => {
        return new Promise((resolve) => {
            const svgString = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${width}" height="${height}">${svgContent.replace(/currentColor/g, color)}</svg>`;
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
            img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgString)));
        });
    },
    
    exportPNG: (...a) => MoodBoardExport.exportPNG(...a),
    exportPDF: (...a) => MoodBoardExport.exportPDF(...a),

    // Modale d'options d'export (meme modele que les autres onglets : page de
    // garde + choix de ce qu'on exporte + Generer le PDF).
    openPdfModal: () => {
        const boards = state.data.moodboards || [];
        if(boards.length === 0) { Utils.toast('Aucune planche à exporter', 'warning'); return; }
        Actions.openExportModal('moodboard');
        document.querySelectorAll('#export-modal .exp-section-chk').forEach(cb => {
            cb.checked = (cb.dataset.section === 'moodboard');
        });
    },
};
