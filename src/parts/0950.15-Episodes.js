
const Episodes = {
    // ===================== SAISONS & ÉPISODES =====================
    
    // S7 : bascule de saison
    // Change la saison active, met à jour les dropdowns et rafraîchit toutes les vues
    switchSeason: (seasonId) => {
        if(!seasonId) return;
        state.currentSeasonId = seasonId;
        
        // Réinitialiser l'épisode actif sur le premier de la nouvelle saison
        const episodesOfSeason = (state.data.episodes || []).filter(ep => ep.seasonId === seasonId);
        state.currentEpisodeId = episodesOfSeason[0]?.id || null;
        
        // Re-rendre les dropdowns (saison + épisode)
        ScriptEditor.initEpisodeSelector();
        
        // Rafraîchir les vues filtrées par épisode
        if(ScriptEditor.viewMode === 'continuous') {
            ScriptEditor.renderContinuous();
        } else {
            UI.renderScript();
        }
        if(typeof UI.renderBoard === 'function') UI.renderBoard();
        if(typeof Storyboard !== 'undefined' && typeof Storyboard.renderScenesList === 'function') Storyboard.renderScenesList();
        if(typeof BeatBoard !== 'undefined' && typeof BeatBoard.render === 'function') BeatBoard.render();
        
        // Si on est sur l'onglet Épisodes, le re-rendre pour afficher ceux de la saison
        Episodes.render();
    },
    
    // Rend la grille d'épisodes
    render: () => {
        const grid = document.getElementById('episodes-grid');
        const countLabel = document.getElementById('episodes-count-label');
        if(!grid) return;
        
        // Init : si state.data.episodes n'existe pas, le créer
        if(!state.data.episodes) state.data.episodes = [];
        if(!state.data.seasons) state.data.seasons = [];
        
        const allEpisodes = state.data.episodes;
        const seasons = state.data.seasons;
        const canEdit = state.currentRole === 'owner' || state.currentRole === 'editor';
        
        // S7.4 : filtrer les épisodes par saison active
        const activeSeason = seasons.find(s => s.id === state.currentSeasonId) || seasons[0];
        const episodes = activeSeason 
            ? allEpisodes.filter(ep => ep.seasonId === activeSeason.id)
            : allEpisodes;
        
        // Compteur (affiche aussi le nom de la saison)
        if(countLabel) {
            const seasonLabel = activeSeason ? ` (S${String(activeSeason.number).padStart(2,'0')}${activeSeason.title ? ' — ' + Utils.escape(activeSeason.title) : ''})` : '';
            const countText = episodes.length === 0 ? '0 épisode' : (episodes.length === 1 ? '1 épisode' : episodes.length + ' épisodes');
            countLabel.innerHTML = countText + seasonLabel;
        }
        
        // Carte "Ajouter" à la fin (si canEdit)
        const addCard = canEdit ? `
            <div class="episode-add-card" onclick="app.Episodes.add()">
                <div class="episode-add-icon">➕</div>
                <div class="episode-add-label">Ajouter un épisode</div>
            </div>
        ` : '';
        
        // Rendu des cartes d'épisodes
        const cards = episodes.map((ep, idx) => {
            const statusLabels = { draft: '📝 Brouillon', 'in-progress': '🎬 En cours', done: '✅ Terminé' };
            const status = ep.status || 'draft';
            const thumb = ep.thumb 
                ? `<img src="${Utils.escape(ep.thumb)}" alt="Vignette">` 
                : '🎬';
            
            return `
                <div class="episode-card" 
                     data-episode-id="${ep.id}"
                     draggable="${canEdit}"
                     ondragstart="app.Episodes._onDragStart(event, '${ep.id}')"
                     ondragover="app.Episodes._onDragOver(event)"
                     ondragleave="app.Episodes._onDragLeave(event)"
                     ondrop="app.Episodes._onDrop(event, '${ep.id}')"
                     ondragend="app.Episodes._onDragEnd(event)">
                    <div class="episode-thumb">
                        ${thumb}
                        ${canEdit ? `<button class="episode-thumb-upload" onclick="event.stopPropagation(); app.Episodes.uploadThumb('${ep.id}')">📷 Changer</button>` : ''}
                        <div class="episode-number-badge">E${String(ep.number).padStart(2,'0')}</div>
                        <div class="episode-status-badge ${status}">${statusLabels[status] || status}</div>
                    </div>
                    <div class="episode-body">
                        <input type="text" class="episode-title-input" 
                               value="${Utils.escape(ep.title || '')}"
                               placeholder="Titre de l'épisode (optionnel)" data-tooltip="Titre de l'épisode (optionnel)"
                               ${canEdit ? `onchange="app.Episodes.setTitle('${ep.id}', this.value)"` : 'readonly'}>
                        ${canEdit ? `
                            <select class="episode-status-select" onchange="app.Episodes.setStatus('${ep.id}', this.value)">
                                <option value="draft" ${status==='draft'?'selected':''}>📝 Brouillon</option>
                                <option value="in-progress" ${status==='in-progress'?'selected':''}>🎬 En cours</option>
                                <option value="done" ${status==='done'?'selected':''}>✅ Terminé</option>
                            </select>
                        ` : ''}
                    </div>
                    ${canEdit ? `
                        <div class="episode-actions">
                            <button class="episode-action-btn" onclick="app.Episodes.openEpisode('${ep.id}')">📂 Ouvrir</button>
                            <button class="episode-action-btn danger" onclick="app.Episodes.remove('${ep.id}')">🗑️</button>
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');
        
        grid.innerHTML = cards + addCard;
    },
    
    // Ajoute un nouvel épisode à la fin (dans la saison active)
    add: () => {
        if(!state.data.episodes) state.data.episodes = [];
        if(!state.data.seasons) state.data.seasons = [];
        
        // S7.4 : rattacher à la saison active
        const activeSeasonId = state.currentSeasonId || state.data.seasons[0]?.id;
        if(!activeSeasonId) {
            Utils.toast('Créez d\'abord une saison', 'warning');
            return;
        }
        
        // Numéro = nombre d'épisodes dans cette saison + 1
        const episodesInSeason = state.data.episodes.filter(ep => ep.seasonId === activeSeasonId);
        const nextNumber = episodesInSeason.length + 1;
        
        const newEpisode = {
            id: crypto.randomUUID(),
            seasonId: activeSeasonId,
            number: nextNumber,
            title: '',
            synopsis: '',
            status: 'draft',
            thumb: ''
        };
        state.data.episodes.push(newEpisode);
        const seasonForLog = state.data.seasons.find(s => s.id === activeSeasonId);
        const seasonNumStr = seasonForLog ? `S${String(seasonForLog.number).padStart(2,'0')}` : '?';
        History.log('ADD', `Ajout épisode ${seasonNumStr}E${String(nextNumber).padStart(2,'0')}`, { target: { kind: 'episode', id: newEpisode.id, label: `${seasonNumStr}E${String(nextNumber).padStart(2,'0')}` }, link: { kind: 'episode', id: newEpisode.id } });
        Store.save();
        Episodes.render();
        // Rafraîchir aussi le sélecteur épisode du header
        ScriptEditor.initEpisodeSelector();
        Utils.toast('Épisode ajouté', 'success');
    },
    
    // Supprime un épisode (avec confirmation, supprime aussi ses scènes)
    remove: async (episodeId) => {
        const ep = state.data.episodes.find(e => e.id === episodeId);
        if(!ep) return;
        
        // Compter les scènes liées
        const linkedScenes = (state.data.scenes || []).filter(s => s.episodeId === episodeId);
        // v601 : meme garde que pour la saison — une scene tenue par quelqu'un
        // ne part pas dans la suppression de son episode.
        if(typeof SceneLock !== 'undefined' && !SceneLock.autoriseSuppressionScenes(linkedScenes)) return;
        const sceneCountMsg = linkedScenes.length > 0 
            ? `\n\n⚠️ ${linkedScenes.length} scène${linkedScenes.length>1?'s':''} seront aussi supprimée${linkedScenes.length>1?'s':''}.`
            : '';
        
        const confirmed = await ConfirmModal.confirmDelete(
            `Supprimer l'épisode E${String(ep.number).padStart(2,'0')}${ep.title ? ' — ' + ep.title : ''} ?${sceneCountMsg}`
        );
        if(!confirmed) return;
        
        // [Phase D] Capturer le recoverable AVANT la cascade
        const episodeLogId = 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        const episodeRecoverable = await History.captureRecoverable(ep, 'episode', episodeLogId);
        // Enrichir avec les infos de cascade
        if(episodeRecoverable) {
            episodeRecoverable.metadata = episodeRecoverable.metadata || {};
            episodeRecoverable.metadata.scenesCount = linkedScenes.length;
            episodeRecoverable.metadata.sceneTitles = linkedScenes.map(sc => sc.title || 'Sans titre');
        }
        
        // Supprimer les scènes liées
        state.data.scenes = (state.data.scenes || []).filter(s => s.episodeId !== episodeId);
        
        // Mémoriser la saison de l'épisode supprimé pour renumérotation
        const deletedSeasonId = ep.seasonId;
        
        // Supprimer l'épisode
        state.data.episodes = state.data.episodes.filter(e => e.id !== episodeId);
        
        // S7.4 : re-numéroter uniquement les épisodes de la même saison
        if(deletedSeasonId) {
            const sameSeasonEps = state.data.episodes.filter(e => e.seasonId === deletedSeasonId);
            sameSeasonEps.forEach((e, i) => { e.number = i + 1; });
        } else {
            // Fallback : anciens épisodes sans seasonId
            state.data.episodes.forEach((e, i) => { e.number = i + 1; });
        }
        
        const seasonForLog2 = state.data.seasons.find(s => s.id === deletedSeasonId);
        const seasonNumStr2 = seasonForLog2 ? `S${String(seasonForLog2.number).padStart(2,'0')}` : '?';
        const episodeLabel = `${seasonNumStr2}E${String(ep.number).padStart(2,'0')}${ep.title ? ' — ' + ep.title : ''}`;
        const sceneInfo = linkedScenes.length > 0 ? ` (avec ${linkedScenes.length} scène${linkedScenes.length>1?'s':''})` : '';
        History.log('DELETE', `Suppression épisode ${episodeLabel}${sceneInfo}`, {
            target: { kind: 'episode', id: episodeId, label: episodeLabel },
            recoverable: episodeRecoverable
        });
        Store.save();
        Episodes.render();
        // Rafraîchir le sélecteur épisode du header
        ScriptEditor.initEpisodeSelector();
        Utils.toast('Épisode supprimé', 'success');
    },
    
    // Modifie le titre
    setTitle: (episodeId, title) => {
        const ep = state.data.episodes.find(e => e.id === episodeId);
        if(!ep) return;
        ep.title = (title || '').trim();
        Store.saveDebounced();
        // Pas de re-render (on ne veut pas perdre le focus du champ)
    },
    
    // Change le statut
    setStatus: (episodeId, status) => {
        const ep = state.data.episodes.find(e => e.id === episodeId);
        if(!ep) return;
        if(!['draft','in-progress','done'].includes(status)) return;
        ep.status = status;
        Store.save();
        Episodes.render(); // Re-render pour mettre à jour le badge
    },
    
    // Upload d'une vignette (image en base64)
    uploadThumb: (episodeId) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if(!file) return;
            if(file.size > 2 * 1024 * 1024) {
                Utils.toast('Image trop lourde (max 2 Mo)', 'warning');
                return;
            }
            const reader = new FileReader();
            reader.onload = (ev) => {
                const ep = state.data.episodes.find(e => e.id === episodeId);
                if(!ep) return;
                ep.thumb = ev.target.result;
                Store.save();
                Episodes.render();
                Utils.toast('Vignette mise à jour', 'success');
            };
            reader.readAsDataURL(file);
        };
        input.click();
    },
    
    // Ouvrir un épisode : bascule vers l'onglet Scénario sur cet épisode
    // (pour l'instant juste un toast, la bascule arrivera en Phase S4)
    openEpisode: (episodeId) => {
        const ep = state.data.episodes.find(e => e.id === episodeId);
        if(!ep) return;
        Utils.toast(`Ouvrir E${String(ep.number).padStart(2,'0')} — fonctionnalité à venir (Phase S4)`, 'info');
    },
    
    // ---- Drag & Drop pour réordonner ----
    _draggedId: null,
    
    _onDragStart: (e, episodeId) => {
        Episodes._draggedId = episodeId;
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
        
        const sourceId = Episodes._draggedId;
        if(!sourceId || sourceId === targetId) return;
        
        const episodes = state.data.episodes;
        const source = episodes.find(ep => ep.id === sourceId);
        const target = episodes.find(ep => ep.id === targetId);
        if(!source || !target) return;
        
        // S7.4 : drag & drop uniquement dans la même saison
        if(source.seasonId !== target.seasonId) {
            Utils.toast('Les épisodes ne peuvent être réordonnés qu\'au sein d\'une même saison', 'warning');
            return;
        }
        
        const sourceIdx = episodes.findIndex(ep => ep.id === sourceId);
        const targetIdx = episodes.findIndex(ep => ep.id === targetId);
        
        // Déplacer dans le tableau global
        const [moved] = episodes.splice(sourceIdx, 1);
        const newTargetIdx = episodes.findIndex(ep => ep.id === targetId);
        episodes.splice(newTargetIdx, 0, moved);
        
        // Re-numéroter uniquement dans la saison concernée
        const sameSeasonEps = episodes.filter(ep => ep.seasonId === source.seasonId);
        sameSeasonEps.forEach((ep, i) => { ep.number = i + 1; });
        
        Store.save();
        Episodes.render();
        ScriptEditor.initEpisodeSelector();
    },
    
    _onDragEnd: (e) => {
        e.currentTarget.classList.remove('dragging');
        Episodes._draggedId = null;
        document.querySelectorAll('.episode-card.drag-over').forEach(el => el.classList.remove('drag-over'));
    }
};
