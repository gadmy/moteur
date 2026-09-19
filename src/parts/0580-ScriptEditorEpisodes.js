
  const ScriptEditorEpisodes = {
      // S4 + S7 : gestion des sélecteurs globaux de saison et d'épisode dans le header (séries uniquement)
      initSelector: () => {
          const selEp = document.getElementById('header-episode-selector');
          const selSeason = document.getElementById('header-season-selector');
          const wrapper = document.getElementById('header-episode-wrapper');
          
          // Pour les films : masquer le wrapper, pas d'épisode actif
          if(state.currentProjectType !== 'series') {
              if(wrapper) wrapper.style.display = 'none';
              state.currentEpisodeId = null;
              state.currentSeasonId = null;
              return;
          }
          
          const seasons = state.data.seasons || [];
          const episodes = state.data.episodes || [];
          
          if(seasons.length === 0 || episodes.length === 0) {
              if(wrapper) wrapper.style.display = 'none';
              return;
          }
          
          // Peupler le dropdown des saisons
          if(selSeason) {
              selSeason.innerHTML = seasons.map(s => {
                  const num = String(s.number).padStart(2,'0');
                  const title = s.title ? ' — ' + Utils.escape(s.title) : '';
                  return `<option value="${s.id}">S${num}${title}</option>`;
              }).join('');
              
              // Sélectionner la saison courante (active, ou déduite de l'épisode actif, ou première)
              let seasonId = state.currentSeasonId;
              if(!seasonId || !seasons.find(s => s.id === seasonId)) {
                  // Essayer de déduire depuis l'épisode actif
                  if(state.currentEpisodeId) {
                      const currentEp = episodes.find(e => e.id === state.currentEpisodeId);
                      seasonId = currentEp?.seasonId || seasons[0].id;
                  } else {
                      seasonId = seasons[0].id;
                  }
              }
              state.currentSeasonId = seasonId;
              selSeason.value = seasonId;
          }
          
          // Peupler le dropdown des épisodes en filtrant par saison active
          if(selEp) {
              const episodesOfSeason = episodes.filter(ep => ep.seasonId === state.currentSeasonId);
              selEp.innerHTML = episodesOfSeason.map(ep => {
                  const num = String(ep.number).padStart(2,'0');
                  const title = ep.title ? ' — ' + Utils.escape(ep.title) : '';
                  return `<option value="${ep.id}">E${num}${title}</option>`;
              }).join('');
              
              // Sélectionner l'épisode courant (s'il est dans cette saison) ou le premier de la saison
              if(!state.currentEpisodeId || !episodesOfSeason.find(e => e.id === state.currentEpisodeId)) {
                  state.currentEpisodeId = episodesOfSeason[0]?.id || null;
              }
              if(state.currentEpisodeId) selEp.value = state.currentEpisodeId;
          }
          
          if(wrapper) wrapper.style.display = 'inline-flex';
      },
      
      // Bascule sur un autre épisode : change l'épisode actif et re-rend les vues
      switch: (episodeId) => {
          if(!episodeId) return;
          state.currentEpisodeId = episodeId;
          
          // Re-render de la vue courante
          if(ScriptEditor.viewMode === 'continuous') {
              ScriptEditor.renderContinuous();
          } else {
              UI.renderScript();
          }
          // Re-render aussi le séquencier, le storyboard et le beatboard
          if(typeof UI.renderBoard === 'function') UI.renderBoard();
          if(typeof Storyboard !== 'undefined' && typeof Storyboard.renderScenesList === 'function') Storyboard.renderScenesList();
          if(typeof BeatBoard !== 'undefined' && typeof BeatBoard.render === 'function') BeatBoard.render();
      }
  };

  // ScriptEditorSearch — sous-module V7.5 : recherche/remplacement dans le scénario
  // (V7.5.a — squelette + clearHighlights + saveBackup. Cohabite avec les anciennes méthodes de ScriptEditor jusqu'à la bascule V7.5.e)