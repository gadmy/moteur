
  const UIDashboard = {
    showDashboard: async () => { 
        try { if(FocusMode.isActive) FocusMode.exit(); } catch(e) {}
        try { if(PresentMode.isActive) PresentMode.exit(); } catch(e) {}
        UI.hideAllViews();
        els.authView.style.display = 'none'; 
        els.dashboardView.style.display = 'flex';
        if(typeof DBPresence !== 'undefined') DBPresence.start(null);
        
        // Restauration du projet après F5 (capture AVANT de nettoyer NavMemory)
        const _lastProjectId = Router.suppressNavMemory ? null : NavMemory.getProject();
        Router.suppressNavMemory = false;
        const _savedNav = NavMemory.getTab();
        
        // On est de retour au dashboard : on oublie le projet précédent
        NavMemory.setProject(null);
        NavMemory.setTab(null, null);
        // v578 (cloisonnement) : la carte des droits appartient AU PROJET qu'on
        // vient de quitter. La laisser en place ferait juger le projet suivant
        // avec les droits du precedent — et, sur un projet dont on est
        // proprietaire, on se verrait refuser ses propres onglets.
        state.dataScope = null;
        state.dataMissingKeys = [];
        
        // Si on avait un projet en mémoire, le rouvrir après que le dashboard soit chargé
        if(_lastProjectId) {
            setTimeout(async () => {
                try {
                    await Store.loadProject(_lastProjectId);
                    // Restaurer l'onglet après l'ouverture du projet
                    if(_savedNav.tab) {
                        setTimeout(() => {
                            try {
                                if(_savedNav.tab) UI.switchCategory(_savedNav.tab);
                                if(_savedNav.subtab) {
                                    setTimeout(() => UI.switchTab(_savedNav.subtab), 150);
                                }
                            } catch(e) { console.warn('Restauration onglet échouée:', e); }
                        }, 300);
                    }
                } catch(e) {
                    console.warn('Impossible de restaurer le projet ' + _lastProjectId + ':', e);
                }
            }, 500);
        }
        
        // Fermer les fenetres flottantes du projet quitte (casting, sous-onglets
        // detaches) : sans ca, la fenetre casting restait ouverte sur le HUB.
        if(typeof WindowManager !== 'undefined' && WindowManager.closeAll) WindowManager.closeAll();
        // Nettoyer le mini-chat éphémère
        if(typeof MiniChat !== 'undefined') MiniChat.stop();
        // Nettoyer les locks de scène
        if(typeof LockManager !== 'undefined') await LockManager.cleanup();
        UIDashboard.renderUserWelcome(); 
        
        // Mettre à jour le bouton profil
        const profileBtn = document.getElementById('btn-my-profile');
        if(profileBtn) {
            const profileComplete = state.userProfile?.profileComplete;
            profileBtn.innerHTML = profileComplete ? '👤 Mon Profil' : '⚠️ Compléter mon profil';
            profileBtn.style.background = 'var(--panel-bg)';
        }
        
        await UIDashboard.renderDashboard(); 
        
        // Timer pour mettre à jour le countdown de l'essai
        if(UI.trialTimer) clearInterval(UI.trialTimer);
        if(Pricing.isInTrial()) {
            UI.trialTimer = setInterval(() => {
                if(Pricing.isInTrial()) {
                    UIDashboard.renderProjectList();
                } else {
                    clearInterval(UI.trialTimer);
                    UIDashboard.renderProjectList(); // Afficher que l'essai est terminé
                }
            }, 60000); // Mise à jour toutes les minutes
        }
    },

    // B6 : en-tête = email + intitulés des fiches du compte
    renderUserWelcome: () => {
        const el = document.getElementById('user-welcome');
        if(!el) return;
        const email = state.currentUser ? state.currentUser.email : '';
        el.textContent = email;
    },

    renderDashboard: async () => { 
        // B3 P1 : Projets d'abord
        document.getElementById('hub-content').style.display = '';
        await UIDashboard.renderProjectList();
    },
    
    // T6 : menu "Deplacer vers..." sur une carte projet (liste arborescente des dossiers).
    showMoveMenu: (e, projectId) => {
        e.stopPropagation();
        document.querySelectorAll('.priority-menu').forEach(m => m.remove());
        const current = ProjectFolders.folderOf(projectId);
        const items = [{ id: '', name: '🏠 Racine (aucun dossier)', depth: 0, color: '' }];
        const walk = (parentId, depth) => {
            ProjectFolders.children(parentId).forEach(f => { items.push({ id: f.id, name: f.name, depth: depth, color: f.color }); walk(f.id, depth + 1); });
        };
        walk(null, 0);
        const menu = document.createElement('div');
        menu.className = 'priority-menu';
        menu.style.maxHeight = '300px';
        menu.style.overflowY = 'auto';
        menu.innerHTML = items.map(it => `
            <div class="priority-menu-item" onclick="app.UIDashboard.moveToFolder('${projectId}', '${it.id}')">
                <span style="display:inline-block; width:${it.depth * 14}px;"></span>
                ${it.id ? `<span class="dot" style="background:${it.color || '#9E9E9E'}"></span>` : ''}
                ${Utils.escape(it.name)}${it.id === (current || '') ? ' ✓' : ''}
            </div>`).join('');
        const rect = e.target.getBoundingClientRect();
        menu.style.position = 'fixed';
        menu.style.top = (rect.bottom + 5) + 'px';
        menu.style.left = rect.left + 'px';
        document.body.appendChild(menu);
        setTimeout(() => {
            document.addEventListener('click', function closeMenu(ev) {
                if(!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('click', closeMenu); }
            });
        }, 10);
    },

    moveToFolder: (projectId, folderId) => {
        document.querySelectorAll('.priority-menu').forEach(m => m.remove());
        ProjectFolders.assign(projectId, folderId || null);
        const f = folderId ? ProjectFolders.get(folderId) : null;
        Utils.toast(f ? `Déplacé dans « ${f.name} »` : 'Sorti du dossier', 'success');
        UIDashboard.renderProjectList();
    },

    showPriorityMenu: (e, projectId) => {
        e.stopPropagation();
        // Fermer menu existant
        const existing = document.querySelector('.priority-menu');
        if(existing) existing.remove();
        
        const priorities = [
            { label: 'Principal', class: 'principal', color: '#4CAF50' },
            { label: 'Secondaire', class: 'secondaire', color: '#2196F3' },
            { label: 'Urgent', class: 'urgent', color: '#f44336' },
            { label: 'En attente', class: 'en-attente', color: '#9E9E9E' },
            { label: 'Une idée', class: 'une-idee', color: '#FF9800' },
            { label: 'Je sais pas trop', class: 'je-sais-pas-trop', color: '#9C27B0' },
            { label: 'Archivé', class: 'archive', color: '#795548' },
            { label: 'Aucune', class: '', color: 'transparent' }
        ];
        
        const menu = document.createElement('div');
        menu.className = 'priority-menu';
        menu.innerHTML = priorities.map(p => `
            <div class="priority-menu-item" onclick="app.UIDashboard.setPriority('${projectId}', '${p.label === 'Aucune' ? '' : p.label}')">
                <span class="dot" style="background:${p.color}"></span>
                ${p.label}
            </div>
        `).join('');
        
        const rect = e.target.getBoundingClientRect();
        menu.style.position = 'fixed';
        menu.style.top = (rect.bottom + 5) + 'px';
        menu.style.left = rect.left + 'px';
        
        document.body.appendChild(menu);
        
        // Fermer au clic ailleurs
        setTimeout(() => {
            document.addEventListener('click', function closeMenu(ev) {
                if(!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('click', closeMenu); }
            });
        }, 10);
    },
    
    setPriority: async (projectId, priority) => {
        const menu = document.querySelector('.priority-menu');
        if(menu) menu.remove();
        
        try {
            // v578 (cloisonnement) : on ecrivait la priorite en RELISANT tout le
            // projet puis en le REECRIVANT en entier. Deux defauts : on lisait la
            // colonne 'data' d'un projet dont on n'est peut-etre que membre, et la
            // reecriture complete pouvait ecraser le travail de quelqu'un d'autre
            // entre la lecture et l'ecriture. On ne pousse plus que la cle
            // concernee, par la fusion serveur.
            const { error: prioErr } = await supabase.rpc('patch_project_data', {
                p_id: projectId,
                p_patch: { priority: priority || null }
            });
            if(prioErr) throw prioErr;
            
            Utils.toast(priority ? `Priorité "${priority}" définie` : 'Priorité supprimée', 'success');
            UIDashboard.renderProjectList();
        } catch(e) {
            Utils.toast('Erreur lors de la mise à jour', 'error');
        }
    },
    
    reorderProjects: async (draggedId, targetId) => {
        const list = await Store.getProjectsList();
        
        // Trouver les index
        const draggedIdx = list.findIndex(p => p.id === draggedId);
        const targetIdx = list.findIndex(p => p.id === targetId);
        
        if(draggedIdx === -1 || targetIdx === -1) return;
        
        // Capturer les positions actuelles des cartes
        const cards = Array.from(document.querySelectorAll('.project-card'));
        const oldPositions = new Map();
        cards.forEach(card => {
            const rect = card.getBoundingClientRect();
            oldPositions.set(card.dataset.projectId, { left: rect.left, top: rect.top });
        });
        
        // Réorganiser
        const [dragged] = list.splice(draggedIdx, 1);
        list.splice(targetIdx, 0, dragged);
        
        // Sauvegarder l'ordre pour chaque projet
        try {
            for (let idx = 0; idx < list.length; idx++) {
                const p = list[idx];
                // v578 (cloisonnement) : meme correction que pour la priorite —
                // on ne relit plus le projet entier pour y reecrire un seul nombre.
                await supabase.rpc('patch_project_data', { p_id: p.id, p_patch: { order: idx } });
            }
            
            // Reconstruire la liste
            await UIDashboard.renderProjectList();
            
            // Animer vers les nouvelles positions (FLIP animation)
            const newCards = Array.from(document.querySelectorAll('.project-card'));
            newCards.forEach(card => {
                const projectId = card.dataset.projectId;
                const oldPos = oldPositions.get(projectId);
                if(oldPos) {
                    const newRect = card.getBoundingClientRect();
                    const deltaX = oldPos.left - newRect.left;
                    const deltaY = oldPos.top - newRect.top;
                    
                    if(deltaX !== 0 || deltaY !== 0) {
                        card.style.transition = 'none';
                        card.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
                        
                        requestAnimationFrame(() => {
                            requestAnimationFrame(() => {
                                card.style.transition = 'transform 0.7s cubic-bezier(0.25, 0.1, 0.25, 1)';
                                card.style.transform = 'translate(0, 0)';
                            });
                        });
                        
                        // Nettoyer après l'animation
                        setTimeout(() => {
                            card.style.transition = '';
                            card.style.transform = '';
                        }, 750);
                    }
                }
            });
            
        } catch(e) {
            Utils.toast('Erreur lors du réordonnancement', 'error');
        }
    },

    // ----- T6 : dossiers de classement du hub (UI) -----
    currentFolderId: null,

    _priorityList: () => ([
        { label: 'Principal', color: '#4CAF50' },
        { label: 'Secondaire', color: '#2196F3' },
        { label: 'Urgent', color: '#f44336' },
        { label: 'En attente', color: '#9E9E9E' },
        { label: 'Une idée', color: '#FF9800' },
        { label: 'Je sais pas trop', color: '#9C27B0' },
        { label: 'Archivé', color: '#795548' }
    ]),

    openFolder: (id) => { UIDashboard.currentFolderId = id || null; UIDashboard.renderProjectList(); },

    // Fil d'Ariane + tuiles des sous-dossiers du dossier courant + bouton Nouveau dossier.
    // ======================================================================
    //  GLISSER-DEPOSER DANS LE HUB : LES DOSSIERS AUSSI (v601)
    // ======================================================================
    //  Un projet se glissait deja dans un dossier. Un DOSSIER, lui, ne
    //  bougeait pas : le seul moyen d'en ranger un dans un autre aurait ete
    //  de le supprimer et de le refaire.
    //  DEUX CHARGEMENTS DIFFERENTS SUR LE MEME GESTE, donc deux etiquettes
    //  separees : un projet voyage en « text/plain » (c'etait deja le cas, on
    //  n'y touche pas), un dossier en « application/x-moteur-dossier ». Le
    //  navigateur laisse LIRE LES ETIQUETTES pendant le survol, mais pas leur
    //  contenu — c'est pour cela qu'on ne melange pas les deux dans la meme :
    //  sans etiquette distincte, une carte de projet ne saurait pas, au
    //  survol, si ce qui arrive est un projet ou un dossier.
    ETIQ_DOSSIER: 'application/x-moteur-dossier',
    //  « Est-ce un dossier qui arrive ? » — repondable PENDANT le survol.
    _dossierEnVol: (e) => {
        try { return Array.prototype.indexOf.call(e.dataTransfer.types, UIDashboard.ETIQ_DOSSIER) >= 0; }
        catch(err) { return false; }
    },
    //  Ranger un dossier ailleurs. cible = null : a la racine.
    _rangerDossier: (id, cibleId) => {
        const f = ProjectFolders.get(id);
        if(!f) return;
        if((f.parentId || null) === (cibleId || null)) return;        // deja la
        if(!ProjectFolders.accepte(id, cibleId)) {
            Utils.toast('Un dossier ne peut pas être rangé dans lui-même ni dans l’un des siens.', 'warning', 6000);
            return;
        }
        ProjectFolders.update(id, { parentId: cibleId || null });
        const cible = cibleId ? ProjectFolders.get(cibleId) : null;
        Utils.toast('« ' + f.name + ' » rangé dans ' + (cible ? '« ' + cible.name + ' »' : 'Tous'), 'success');
        UIDashboard.renderProjectList();
    },
    //  Le fil d'Ariane est LA SORTIE : sans lui, un dossier range dans un
    //  autre ne pourrait plus jamais en ressortir. Il accepte les deux
    //  chargements, projet comme dossier.
    _crumbAccueille: (el, cibleId) => {
        el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('crumb-drop'); });
        el.addEventListener('dragleave', () => el.classList.remove('crumb-drop'));
        el.addEventListener('drop', (e) => {
            e.preventDefault();
            el.classList.remove('crumb-drop');
            const fid = e.dataTransfer.getData(UIDashboard.ETIQ_DOSSIER);
            if(fid) { UIDashboard._rangerDossier(fid, cibleId); return; }
            const pid = e.dataTransfer.getData('text/plain');
            if(!pid) return;
            ProjectFolders.assign(pid, cibleId || null);
            const cible = cibleId ? ProjectFolders.get(cibleId) : null;
            Utils.toast('Déplacé dans ' + (cible ? '« ' + cible.name + ' »' : 'Tous'), 'success');
            UIDashboard.renderProjectList();
        });
    },

    _renderFolderArea: () => {
        const cur = UIDashboard.currentFolderId || null;
        const bar = document.createElement('div');
        bar.className = 'folder-bar';
        let crumbs = `<span class="folder-crumb" data-crumb-id="" onclick="app.UIDashboard.openFolder('')">🏠 Tous</span>`;
        ProjectFolders.path(cur).forEach(f => { crumbs += `<span class="folder-sep">▸</span><span class="folder-crumb" data-crumb-id="${f.id}" onclick="app.UIDashboard.openFolder('${f.id}')">${Utils.escape(f.name)}</span>`; });
        bar.innerHTML = `<div class="folder-crumbs">${crumbs}</div><div class="folder-bar-actions"><button class="btn btn--primary btn--sm" onclick="app.Store.createNewProject()">+ Nouveau projet</button><button class="btn btn--secondary btn--sm" onclick="app.UIDashboard.newFolder()">+ Nouveau dossier</button><button class="btn btn--secondary btn--sm" onclick="document.getElementById('importInput').click()">📂 Importer</button><button class="btn btn--secondary btn--sm" onclick="app.UIDashboard.openTrash()">🗑 Corbeille</button></div>`;
        els.projectList.appendChild(bar);
        bar.querySelectorAll('.folder-crumb').forEach(el => {
            UIDashboard._crumbAccueille(el, el.dataset.crumbId || null);
        });

        ProjectFolders.children(cur).forEach(f => {
            const count = ProjectFolders.projectsIn(f.id).length;
            const sub = ProjectFolders.children(f.id).length;
            const prClass = f.priority ? f.priority.replace(/\s+/g, '-').toLowerCase() : '';
            const prBadge = f.priority ? `<span class="priority-badge ${prClass}">${Utils.escape(f.priority)}</span>` : '';
            const tile = document.createElement('div');
            tile.className = 'folder-tile';
            tile.style.borderLeftColor = f.color || '#9E9E9E';
            tile.dataset.folderId = f.id;
            tile.innerHTML = `<div class="folder-tile-icon" style="color:${f.color || '#9E9E9E'}">📁</div>`
                + `<div class="folder-tile-body"><div class="folder-tile-name">${Utils.escape(f.name)} ${prBadge}</div>`
                + `<div class="folder-tile-meta">${sub} dossier${sub>1?'s':''} · ${count} projet${count>1?'s':''}</div></div>`
                + `<div class="folder-tile-actions"><button class="p-btn-priority" onclick="app.UIDashboard.editFolder('${f.id}')" title="Modifier">✏️</button>`
                + `<button class="p-btn-del" onclick="app.UIDashboard.deleteFolder('${f.id}')" title="Supprimer">🗑️</button></div>`;
            tile.onclick = (e) => { if(!e.target.closest('.folder-tile-actions')) UIDashboard.openFolder(f.id); };
            tile.setAttribute('role', 'button'); tile.setAttribute('tabindex', '0');
            // v601 : le dossier se prend et se pose, comme un projet.
            tile.draggable = true;
            tile.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData(UIDashboard.ETIQ_DOSSIER, f.id);
                e.dataTransfer.effectAllowed = 'move';
                tile.classList.add('dossier-en-vol');
            });
            tile.addEventListener('dragend', () => {
                tile.classList.remove('dossier-en-vol');
                document.querySelectorAll('.folder-drop, .crumb-drop')
                    .forEach(el => el.classList.remove('folder-drop', 'crumb-drop'));
            });
            tile.addEventListener('dragover', (e) => {
                // Un dossier pose sur lui-meme : on ne fait pas semblant
                // d'accepter. Le refus se voit AVANT de lacher.
                if(UIDashboard._dossierEnVol(e) && tile.classList.contains('dossier-en-vol')) {
                    e.dataTransfer.dropEffect = 'none';
                    return;
                }
                e.preventDefault();
                tile.classList.add('folder-drop');
            });
            tile.addEventListener('dragleave', (e) => { if(!tile.contains(e.relatedTarget)) tile.classList.remove('folder-drop'); });
            tile.addEventListener('drop', (e) => {
                e.preventDefault();
                tile.classList.remove('folder-drop');
                const fid = e.dataTransfer.getData(UIDashboard.ETIQ_DOSSIER);
                if(fid) { UIDashboard._rangerDossier(fid, f.id); return; }
                const pid = e.dataTransfer.getData('text/plain');
                if(pid) { ProjectFolders.assign(pid, f.id); Utils.toast('Déplacé dans « ' + f.name + ' »', 'success'); UIDashboard.renderProjectList(); }
            });
            els.projectList.appendChild(tile);
        });
    },

    newFolder: () => UIDashboard._folderModal(null),

    openTrash: async () => {
        const items = await Store.getTrashedProjects();
        const old = document.getElementById('trash-modal');
        if(old) old.remove();
        const overlay = document.createElement('div');
        overlay.id = 'trash-modal';
        overlay.className = 'confirm-modal-overlay';
        overlay.onclick = (e) => { if(e.target === overlay) overlay.remove(); };
        const rows = items.length ? items.map(it => {
            const purge = new Date(it.purgeAt);
            const days = Math.max(0, Math.ceil((purge.getTime() - Date.now()) / 86400000));
            return `<div style="display:flex; align-items:center; justify-content:space-between; gap:10px; padding:10px 0; border-bottom:1px solid var(--border);">
                <div style="min-width:0;">
                    <div style="font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${Utils.escape(it.title || 'Sans titre')}</div>
                    <div style="font-size:0.78rem; color:var(--text-sec);">Suppression définitive dans ${days} j (${purge.toLocaleDateString()})</div>
                </div>
                <button class="btn btn--primary btn--sm" onclick="app.UIDashboard.restoreFromTrash('${it.id}')">Restaurer</button>
            </div>`;
        }).join('') : '<div style="padding:20px 0; color:var(--text-sec); text-align:center;">Corbeille vide</div>';
        overlay.innerHTML = `<div class="confirm-modal-box" style="max-width:480px;">
            <h3 style="margin:0 0 4px;">🗑 Corbeille</h3>
            <p style="margin:0 0 14px; font-size:0.82rem; color:var(--text-sec);">Les projets supprimés sont conservés 30 jours puis effacés définitivement.</p>
            <div style="max-height:50vh; overflow-y:auto;">${rows}</div>
            <div style="display:flex; justify-content:flex-end; margin-top:16px;">
                <button class="btn btn--secondary btn--sm" onclick="document.getElementById('trash-modal').remove()">Fermer</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);
    },

    restoreFromTrash: async (id) => {
        const ok = await Store.restoreProject(id);
        if(!ok) return;
        await UI.renderProjectList();
        await UI.renderDashboard();
        UIDashboard.openTrash();
    },
    editFolder: (id) => UIDashboard._folderModal(ProjectFolders.get(id)),

    _folderModal: (folder) => {
        document.querySelectorAll('.folder-modal-overlay').forEach(m => m.remove());
        const isEdit = !!folder;
        const opts = UIDashboard._priorityList().map(pr =>
            `<option value="${pr.label}" ${folder && folder.priority === pr.label ? 'selected' : ''}>${pr.label}</option>`).join('');
        const ov = document.createElement('div');
        ov.className = 'folder-modal-overlay';
        ov.innerHTML = `
            <div class="folder-modal">
                <h3 style="margin:0 0 14px;">${isEdit ? 'Modifier le dossier' : 'Nouveau dossier'}</h3>
                <label class="folder-modal-label">Nom</label>
                <input id="folder-modal-name" type="text" class="folder-modal-input" maxlength="120" value="${isEdit ? Utils.escape(folder.name) : ''}" placeholder="Nom du dossier" data-tooltip="Nom du dossier">
                <div class="folder-modal-row">
                    <div><label class="folder-modal-label">Couleur</label><input id="folder-modal-color" type="color" value="${isEdit ? (folder.color || '#9E9E9E') : '#9E9E9E'}"></div>
                    <div style="flex:1;"><label class="folder-modal-label">Importance</label>
                        <select id="folder-modal-priority" class="folder-modal-input">
                            <option value="">Aucune</option>
                            ${opts}
                        </select>
                    </div>
                </div>
                <div class="folder-modal-actions">
                    <button class="btn btn--secondary btn--sm" onclick="this.closest('.folder-modal-overlay').remove()">Annuler</button>
                    <button class="btn btn--primary btn--sm" onclick="app.UIDashboard._saveFolder('${isEdit ? folder.id : ''}')">${isEdit ? 'Enregistrer' : 'Créer'}</button>
                </div>
            </div>`;
        ov.addEventListener('click', (e) => { if(e.target === ov) ov.remove(); });
        document.body.appendChild(ov);
        const nm = document.getElementById('folder-modal-name'); if(nm) nm.focus();
    },

    _saveFolder: (id) => {
        const name = (document.getElementById('folder-modal-name')?.value || '').trim();
        const color = document.getElementById('folder-modal-color')?.value || '#9E9E9E';
        const priority = document.getElementById('folder-modal-priority')?.value || '';
        if(!name) { Utils.toast('Donne un nom au dossier', 'error'); return; }
        if(id) ProjectFolders.update(id, { name, color, priority });
        else ProjectFolders.create({ name, color, priority, parentId: UIDashboard.currentFolderId || null });
        document.querySelectorAll('.folder-modal-overlay').forEach(m => m.remove());
        UIDashboard.renderProjectList();
    },

    deleteFolder: async (id) => {
        const f = ProjectFolders.get(id);
        if(!f) return;
        const ok = await ConfirmModal.show({ title: 'Supprimer le dossier ?', message: `« ${Utils.escape(f.name)} » sera supprimé. Ses sous-dossiers et projets remonteront d'un niveau (aucun projet n'est supprimé).`, icon: '🗑️', confirmText: 'Supprimer' });
        if(!ok) return;
        ProjectFolders.remove(id);
        UIDashboard.renderProjectList();
    },

    renderProjectList: async () => {
        els.projectList.innerHTML = '<div style="padding:20px; color:#999">Chargement...</div>'; 
        const list = await Store.getProjectsList(); 
        els.projectList.innerHTML = ''; 
        
        const accountType = state.userProfile?.accountType || 'crew';
        
        // Bannière d'essai (si en période d'essai)
        const trialBanner = Pricing.getTrialBanner();
        if(trialBanner) {
            const bannerDiv = document.createElement('div');
            bannerDiv.style.cssText = 'grid-column: 1 / -1;';
            bannerDiv.innerHTML = trialBanner;
            els.projectList.appendChild(bannerDiv);
        }
        
        // Widget de facturation (si abonné avec des projets)
        const billingWidget = await Pricing.getBillingWidget();
        if(billingWidget) {
            const billingDiv = document.createElement('div');
            billingDiv.style.cssText = 'grid-column: 1 / -1;';
            billingDiv.innerHTML = billingWidget;
            els.projectList.appendChild(billingDiv);
        }
        
        // T6 : zone dossiers (fil d'Ariane + sous-dossiers du dossier courant)
        UIDashboard._renderFolderArea();

        // v570 : invitations recues en attente — cartes grisees en tete, a la racine
        // (une invitation n'a pas encore de dossier de classement).
        try {
            if(typeof Invitations !== 'undefined' && !UIDashboard.currentFolderId) {
                Invitations.hidePreview();
                const pend = await Invitations.loadPending();
                pend.forEach(inv => els.projectList.appendChild(Invitations.buildCard(inv)));
            }
        } catch(e) { console.warn('[Dashboard] invitations en attente:', e && e.message); }
        
        // Nouveau projet / Importer : desormais des boutons dans la barre dossiers (voir _renderFolderArea).
        
       

        // Liste des projets
        if(list.length > 0) {
            // Trier par ordre personnalisé puis par date
            list.sort((a, b) => {
                const orderA = a.order !== undefined ? a.order : 9999;
                const orderB = b.order !== undefined ? b.order : 9999;
                if(orderA !== orderB) return orderA - orderB;
                return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
            });
            
            list.filter(p => (ProjectFolders.folderOf(p.id) || null) === (UIDashboard.currentFolderId || null)).forEach((p, idx) => { 
                const card = document.createElement('div'); 
                card.className = 'project-card'; 
                card.draggable = true;
                card.dataset.projectId = p.id;
                card.dataset.index = idx;
                let badgeColor = p.role==='owner'?'var(--primary)':(p.role==='editor'?'orange':'gray'); 
                let badgeText = p.role==='owner'?'PROPRIÉTAIRE':(p.role==='editor'?'ÉDITEUR':'LECTEUR');
                const priorityClass = p.priority ? p.priority.replace(/\s+/g, '-').toLowerCase() : '';
                const priorityBadge = p.priority ? `<span class="priority-badge ${priorityClass}">${p.priority}</span>` : '';
                // S3.5 : badge Série si project_type === 'series' (sur sa propre ligne)
                const seriesBadge = (p.project_type === 'series') 
                    ? `<div class="p-series-line"><span class="p-series-badge" title="Projet série">📺 ${p.episodeCount} épisode${p.episodeCount>1?'s':''}</span></div>`
                    : '';
                
                const ownerBtn = (p.role === 'owner')
                    ? `<button class="p-btn-del" title="Mettre à la corbeille" onclick="app.Store.deleteProject('${p.id}', '${p.role}', event)">🗑️</button>`
                    : `<button class="p-btn-del" title="Quitter ce projet" onclick="app.Store.leaveProject('${p.id}', '${p.role}', event)">🚪</button>`;
                card.innerHTML = `<span class="p-role-badge" style="color:${badgeColor}; border-color:${badgeColor}">${badgeText}</span><div><div class="p-title">${Utils.escape(p.title)}</div>${seriesBadge}<div class="p-meta">Modifié : ${p.date} ${priorityBadge}</div><div class="p-meta" style="margin-top:2px;" title="Poids des données du projet">💾 ${Utils.formatWeight(p.weightBytes)}</div></div><div class="p-actions"><button class="p-btn-priority" onclick="app.UIDashboard.showMoveMenu(event, '${p.id}')" title="Déplacer vers un dossier">📁</button><button class="p-btn-priority" onclick="app.UIDashboard.showPriorityMenu(event, '${p.id}')" title="Priorité">🏷️</button>${ownerBtn}</div>`; 
                card.onclick = (e) => { if(!e.target.closest('.p-actions')) Store.loadProject(p.id); };
                card.setAttribute('role', 'button'); card.setAttribute('tabindex', '0');
                
                // Drag & drop events
                card.addEventListener('dragstart', (e) => { 
                    card.classList.add('dragging'); 
                    e.dataTransfer.setData('text/plain', p.id);
                    e.dataTransfer.effectAllowed = 'move';
                    setTimeout(() => card.style.visibility = 'hidden', 0);
                });
                card.addEventListener('dragend', () => { 
                    card.classList.remove('dragging'); 
                    card.style.visibility = 'visible';
                    document.querySelectorAll('.project-card').forEach(c => { c.classList.remove('drag-over'); c.classList.remove('drag-over-left'); }); 
                });
                card.addEventListener('dragover', (e) => { 
                    // Un DOSSIER ne se range pas dans une carte de projet :
                    // on n'allume rien et on ne l'accepte pas.
                    if(UIDashboard._dossierEnVol(e)) { e.dataTransfer.dropEffect = 'none'; return; }
                    e.preventDefault(); 
                    if(!card.classList.contains('dragging')) {
                        document.querySelectorAll('.project-card').forEach(c => { if(c !== card) { c.classList.remove('drag-over'); c.classList.remove('drag-over-left'); }});
                        card.classList.add('drag-over');
                    }
                });
                card.addEventListener('dragleave', (e) => { 
                    if(!card.contains(e.relatedTarget)) {
                        card.classList.remove('drag-over'); 
                        card.classList.remove('drag-over-left'); 
                    }
                });
                card.addEventListener('drop', (e) => { e.preventDefault(); card.classList.remove('drag-over'); card.classList.remove('drag-over-left'); if(e.dataTransfer.getData(UIDashboard.ETIQ_DOSSIER)) return; const draggedId = e.dataTransfer.getData('text/plain'); if(draggedId && draggedId !== p.id) UIDashboard.reorderProjects(draggedId, p.id); });
                
                els.projectList.appendChild(card); 
            });
        }
        if(typeof GlobalPresence !== 'undefined') { try { GlobalPresence.renderBadges(); } catch(e) {} }
    },
  };
