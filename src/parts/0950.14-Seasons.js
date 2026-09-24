
// ============================================================
// Episodes — Gestion des épisodes d'une série (Phase S3)
// ============================================================
// ============================================================
// Seasons — Gestion des saisons (Phase S7.3)
// ============================================================
const Seasons = {
    
    // Rend la grille des saisons
    render: () => {
        const grid = document.getElementById('seasons-grid');
        const countLabel = document.getElementById('seasons-count-label');
        if(!grid) return;
        
        if(!state.data.seasons) state.data.seasons = [];
        
        const seasons = state.data.seasons;
        const episodes = state.data.episodes || [];
        const canEdit = state.currentRole === 'owner' || state.currentRole === 'editor';
        
        if(countLabel) {
            countLabel.textContent = seasons.length === 0 ? '0 saison' : (seasons.length === 1 ? '1 saison' : seasons.length + ' saisons');
        }
        
        const addCard = canEdit ? `
            <div class="season-add-card" onclick="app.Seasons.add()">
                <div class="episode-add-icon">➕</div>
                <div class="episode-add-label">Ajouter une saison</div>
            </div>
        ` : '';
        
        const cards = seasons.map((s, idx) => {
            const epCount = episodes.filter(ep => ep.seasonId === s.id).length;
            
            return `
                <div class="season-card" 
                     data-season-id="${s.id}"
                     draggable="${canEdit}"
                     ondragstart="app.Seasons._onDragStart(event, '${s.id}')"
                     ondragover="app.Seasons._onDragOver(event)"
                     ondragleave="app.Seasons._onDragLeave(event)"
                     ondrop="app.Seasons._onDrop(event, '${s.id}')"
                     ondragend="app.Seasons._onDragEnd(event)">
                    <div class="season-thumb">
                        📺
                        <div class="season-number-badge">S${String(s.number).padStart(2,'0')}</div>
                        <div class="season-episode-count">${epCount} épisode${epCount>1?'s':''}</div>
                    </div>
                    <div class="season-body">
                        <input type="text" class="season-title-input" 
                               value="${Utils.escape(s.title || '')}"
                               placeholder="Titre de la saison (optionnel)" data-tooltip="Titre de la saison (optionnel)"
                               ${canEdit ? `onchange="app.Seasons.setTitle('${s.id}', this.value)"` : 'readonly'}>
                    </div>
                    ${canEdit ? `
                        <div class="season-actions">
                            <button class="season-action-btn" onclick="app.Seasons.openSeason('${s.id}')">📂 Voir épisodes</button>
                            <button class="season-action-btn danger" onclick="app.Seasons.remove('${s.id}')">🗑️</button>
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');
        
        grid.innerHTML = cards + addCard;
    },
    
    // Ajoute une nouvelle saison
    add: () => {
        if(!state.data.seasons) state.data.seasons = [];
        const nextNumber = state.data.seasons.length + 1;
        const newSeason = {
            id: crypto.randomUUID(),
            number: nextNumber,
            title: '',
            description: ''
        };
        state.data.seasons.push(newSeason);
        History.log('ADD', `Ajout saison S${String(nextNumber).padStart(2,'0')}`, { target: { kind: 'season', id: newSeason.id, label: `S${String(nextNumber).padStart(2,'0')}` }, link: { kind: 'season', id: newSeason.id } });
        Store.save();
        Seasons.render();
        // Rafraîchir aussi le sélecteur du header
        ScriptEditor.initEpisodeSelector();
        Utils.toast('Saison ajoutée', 'success');
    },
    
    // Supprime une saison (avec confirmation, supprime aussi ses épisodes et leurs scènes)
    remove: async (seasonId) => {
        const seasons = state.data.seasons || [];
        if(seasons.length <= 1) {
            Utils.toast('Impossible de supprimer la dernière saison', 'warning');
            return;
        }
        
        const s = seasons.find(x => x.id === seasonId);
        if(!s) return;
        
        const linkedEpisodes = (state.data.episodes || []).filter(ep => ep.seasonId === seasonId);
        const linkedScenes = (state.data.scenes || []).filter(sc => linkedEpisodes.some(ep => ep.id === sc.episodeId));
        
        // v601 : supprimer une saison emporte ses scenes. On ne l'autorise pas
        // tant que quelqu'un en ecrit une (voir SceneLock).
        if(typeof SceneLock !== 'undefined' && !SceneLock.autoriseSuppressionScenes(linkedScenes)) return;
        
        let msg = `Supprimer la saison S${String(s.number).padStart(2,'0')}${s.title ? ' — ' + s.title : ''} ?`;
        if(linkedEpisodes.length > 0) {
            msg += `\n\n⚠️ ${linkedEpisodes.length} épisode${linkedEpisodes.length>1?'s':''} seront aussi supprimé${linkedEpisodes.length>1?'s':''}`;
            if(linkedScenes.length > 0) {
                msg += `\net ${linkedScenes.length} scène${linkedScenes.length>1?'s':''}`;
            }
            msg += '.';
        }
        
        const confirmed = await ConfirmModal.confirmDelete(msg);
        if(!confirmed) return;
        
        // [Phase D] Capturer le recoverable AVANT la cascade
        const seasonLogId = 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        const seasonRecoverable = await History.captureRecoverable(s, 'season', seasonLogId);
        // Enrichir avec les infos de cascade
        if(seasonRecoverable) {
            seasonRecoverable.metadata = seasonRecoverable.metadata || {};
            seasonRecoverable.metadata.episodesCount = linkedEpisodes.length;
            seasonRecoverable.metadata.scenesCount = linkedScenes.length;
            seasonRecoverable.metadata.episodeTitles = linkedEpisodes.map(ep => 
                `E${String(ep.number || '?').padStart(2,'0')}${ep.title ? ' — ' + ep.title : ''}`
            );
            seasonRecoverable.metadata.sceneTitles = linkedScenes.map(sc => sc.title || 'Sans titre');
        }
        
        // Supprimer les scènes liées
        const epIds = linkedEpisodes.map(e => e.id);
        state.data.scenes = (state.data.scenes || []).filter(sc => !epIds.includes(sc.episodeId));
        
        // Supprimer les épisodes
        state.data.episodes = (state.data.episodes || []).filter(ep => ep.seasonId !== seasonId);
        
        // Supprimer la saison
        state.data.seasons = seasons.filter(x => x.id !== seasonId);
        
        // Re-numéroter les saisons restantes
        state.data.seasons.forEach((s, i) => { s.number = i + 1; });
        
        // Si la saison supprimée était active, basculer sur la première
        if(state.currentSeasonId === seasonId) {
            state.currentSeasonId = state.data.seasons[0]?.id || null;
            state.currentEpisodeId = null; // sera réinitialisé par initEpisodeSelector
        }
        
        const seasonLabel = `S${String(s.number).padStart(2,'0')}${s.title ? ' — ' + s.title : ''}`;
        const sceneCountInfo = linkedScenes.length > 0 ? ` (avec ${linkedEpisodes.length} épisode${linkedEpisodes.length>1?'s':''} et ${linkedScenes.length} scène${linkedScenes.length>1?'s':''})` : (linkedEpisodes.length > 0 ? ` (avec ${linkedEpisodes.length} épisode${linkedEpisodes.length>1?'s':''})` : '');
        History.log('DELETE', `Suppression saison ${seasonLabel}${sceneCountInfo}`, {
            target: { kind: 'season', id: seasonId, label: seasonLabel },
            recoverable: seasonRecoverable
        });
        Store.save();
        Seasons.render();
        ScriptEditor.initEpisodeSelector();
        Utils.toast('Saison supprimée', 'success');
    },
    
    // Modifie le titre
    setTitle: (seasonId, title) => {
        const s = state.data.seasons.find(x => x.id === seasonId);
        if(!s) return;
        s.title = (title || '').trim();
        Store.saveDebounced();
        // Rafraîchir le sélecteur saison pour qu'il reflète le nouveau titre
        ScriptEditor.initEpisodeSelector();
    },
    
    // Ouvrir une saison : bascule vers l'onglet Épisodes avec cette saison sélectionnée
    openSeason: (seasonId) => {
        Episodes.switchSeason(seasonId);
        UI.switchTab('episodes');
    },
    
    // ---- Drag & Drop pour réordonner ----
    _draggedId: null,
    
    _onDragStart: (e, seasonId) => {
        Seasons._draggedId = seasonId;
        e.currentTarget.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
    },
    
    _onDragOver: (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        e.currentTarget.classList.add('drag-over');
    },
    
    _onDragLeave: (e) => {
        e.currentTarget.classList.remove('drag-over');
    },
    
    _onDrop: (e, targetId) => {
        e.preventDefault();
        e.currentTarget.classList.remove('drag-over');
        
        const sourceId = Seasons._draggedId;
        if(!sourceId || sourceId === targetId) return;
        
        const seasons = state.data.seasons;
        const sourceIdx = seasons.findIndex(s => s.id === sourceId);
        const targetIdx = seasons.findIndex(s => s.id === targetId);
        if(sourceIdx === -1 || targetIdx === -1) return;
        
        const [moved] = seasons.splice(sourceIdx, 1);
        seasons.splice(targetIdx, 0, moved);
        
        // Re-numéroter
        seasons.forEach((s, i) => { s.number = i + 1; });
        
        Store.save();
        Seasons.render();
        ScriptEditor.initEpisodeSelector();
    },
    
    _onDragEnd: (e) => {
        e.currentTarget.classList.remove('dragging');
        Seasons._draggedId = null;
        document.querySelectorAll('.season-card.drag-over').forEach(el => el.classList.remove('drag-over'));
    }
};
