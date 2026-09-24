  
const Stats = {
      render: () => {
          // Init/refresh du sélecteur de scope (affiché uniquement pour les séries)
          Stats.initScopeSelector();
          Stats.refreshScopeBadges();
          
          const scenes = Stats.getFilteredScenes();
          document.getElementById('stat-total-scenes').innerText = scenes.length;
          let totalTime = 0; 
          scenes.forEach(s => totalTime += parseFloat(s.time||0));
          document.getElementById('stat-total-time').innerText = Math.round(totalTime) + " min";
          
          let totalDial = 0; 
          const charCounts = {}; 
          const tagCounts = {};
          
          scenes.forEach(s => {
              const tid = s.tag_id || 't1'; 
              tagCounts[tid] = (tagCounts[tid] || 0) + 1;
              const div = document.createElement('div'); 
              div.innerHTML = s.scriptContent;
              const dials = div.querySelectorAll('.sc-dial'); 
              totalDial += dials.length;
              dials.forEach(d => {
                 const text = d.innerText.trim(); 
                 const words = text.split(/\s+/).filter(w => w.length > 0).length;
                 let prev = d.previousElementSibling; 
                 while(prev && !prev.classList.contains('sc-perso')) prev = prev.previousElementSibling;
                 if(prev) { 
                     const name = prev.innerText.trim().replace(/\(.*\)/,'').trim().toUpperCase(); 
                     charCounts[name] = (charCounts[name] || 0) + words; 
                 }
              });
          });
          
          document.getElementById('stat-total-dials').innerText = totalDial;
          Stats.drawBarChart('chart-chars', charCounts, 100);
          
          const tagData = {}; 
          state.data.tags.forEach(t => { 
              if(tagCounts[t.id]) tagData[t.name] = tagCounts[t.id]; 
          });
          Stats.drawBarChart('chart-tags', tagData, 10);
          
          // Lieux stats
          Stats.renderLieuxStats();
          
          // Crew stats
          Stats.renderCrewStats();
          
          // Shots stats
          Stats.renderShotsStats();
          
          // Actor days stats
          Stats.renderActorDaysStats();
          
          // Stats avancées V1.4.3
          Stats.renderAdvanced();
          
          // Stats par saison (séries uniquement)
          Stats.renderSeasonsStats();
      },
      
      // Retourne les scènes filtrées selon state.statsFilter
      getFilteredScenes: () => {
          const allScenes = state.data.scenes || [];
          // Films ou pas de filtre actif → toutes les scènes
          if(state.currentProjectType !== 'series') return allScenes;
          if(!state.statsFilter) return allScenes;
          
          const f = state.statsFilter;
          if(f.scope === 'all') return allScenes;
          
          if(f.scope === 'season' && f.seasonId) {
              const epIds = (state.data.episodes || [])
                  .filter(ep => ep.seasonId === f.seasonId)
                  .map(ep => ep.id);
              return allScenes.filter(sc => epIds.includes(sc.episodeId));
          }
          
          if(f.scope === 'episode' && f.episodeId) {
              return allScenes.filter(sc => sc.episodeId === f.episodeId);
          }
          
          return allScenes;
      },
      
      // Retourne un libellé court du scope actif (pour affichage)
      getScopeLabel: () => {
          if(state.currentProjectType !== 'series' || !state.statsFilter) return '';
          const f = state.statsFilter;
          if(f.scope === 'all') return '';
          
          if(f.scope === 'season' && f.seasonId) {
              const s = (state.data.seasons || []).find(x => x.id === f.seasonId);
              if(!s) return '';
              return `S${String(s.number).padStart(2,'0')}${s.title ? ' — ' + s.title : ''}`;
          }
          
          if(f.scope === 'episode' && f.episodeId) {
              const ep = (state.data.episodes || []).find(x => x.id === f.episodeId);
              if(!ep) return '';
              const s = (state.data.seasons || []).find(x => x.id === ep.seasonId);
              const sNum = s ? String(s.number).padStart(2,'0') : '01';
              const eNum = String(ep.number || 0).padStart(2,'0');
              return `S${sNum}E${eNum}${ep.title ? ' — ' + ep.title : ''}`;
          }
          return '';
      },
      
      // Change le scope du filtre
      setScope: (scope) => {
          if(!state.statsFilter) state.statsFilter = { scope: 'all', seasonId: null, episodeId: null };
          state.statsFilter.scope = scope;
          
          // Auto-sélection de la première saison/premier épisode si nécessaire
          if(scope === 'season' && !state.statsFilter.seasonId) {
              const firstSeason = (state.data.seasons || [])[0];
              if(firstSeason) state.statsFilter.seasonId = firstSeason.id;
          }
          if(scope === 'episode' && !state.statsFilter.episodeId) {
              const firstEp = (state.data.episodes || [])[0];
              if(firstEp) {
                  state.statsFilter.episodeId = firstEp.id;
                  state.statsFilter.seasonId = firstEp.seasonId;
              }
          }
          
          Stats.initScopeSelector();
          Stats.render();
      },
      
      // Change la saison filtrée
      setSeasonFilter: (seasonId) => {
          if(!state.statsFilter) state.statsFilter = { scope: 'all', seasonId: null, episodeId: null };
          state.statsFilter.seasonId = seasonId;
          Stats.render();
      },
      
      // Change l'épisode filtré
      setEpisodeFilter: (episodeId) => {
          if(!state.statsFilter) state.statsFilter = { scope: 'all', seasonId: null, episodeId: null };
          state.statsFilter.episodeId = episodeId;
          // Synchroniser seasonId avec l'épisode choisi
          const ep = (state.data.episodes || []).find(x => x.id === episodeId);
          if(ep) state.statsFilter.seasonId = ep.seasonId;
          Stats.render();
      },
      
      // Initialise (ou rafraîchit) le sélecteur de scope dans l'UI
      initScopeSelector: () => {
          const wrapper = document.getElementById('stats-scope-selector');
          if(!wrapper) return;
          
          // Films : sélecteur masqué, comportement inchangé
          if(state.currentProjectType !== 'series') {
              wrapper.style.display = 'none';
              return;
          }
          
          if(!state.statsFilter) state.statsFilter = { scope: 'all', seasonId: null, episodeId: null };
          const f = state.statsFilter;
          
          wrapper.style.display = 'block';
          
          // Style des boutons radio
          wrapper.querySelectorAll('.stats-scope-btn').forEach(btn => {
              const isActive = btn.dataset.scope === f.scope;
              btn.style.background = isActive ? 'var(--primary)' : 'transparent';
              btn.style.color = isActive ? 'white' : 'var(--text-main)';
              btn.classList.toggle('active', isActive);
          });
          
          // Afficher / masquer les selects selon scope
          const seasonWrap = document.getElementById('stats-scope-season-wrap');
          const episodeWrap = document.getElementById('stats-scope-episode-wrap');
          if(seasonWrap) seasonWrap.style.display = (f.scope === 'season') ? 'flex' : 'none';
          if(episodeWrap) episodeWrap.style.display = (f.scope === 'episode') ? 'flex' : 'none';
          
          // Remplir le select des saisons
          const seasonSelect = document.getElementById('stats-scope-season-select');
          if(seasonSelect && f.scope === 'season') {
              const seasons = [...(state.data.seasons || [])].sort((a,b) => (a.number||0) - (b.number||0));
              seasonSelect.innerHTML = seasons.map(s => 
                  `<option value="${s.id}" ${s.id === f.seasonId ? 'selected' : ''}>S${String(s.number).padStart(2,'0')}${s.title ? ' — ' + Utils.escape(s.title) : ''}</option>`
              ).join('');
          }
          
          // Remplir le select des épisodes
          const episodeSelect = document.getElementById('stats-scope-episode-select');
          if(episodeSelect && f.scope === 'episode') {
              const seasons = state.data.seasons || [];
              const episodes = [...(state.data.episodes || [])].sort((a,b) => {
                  const sA = seasons.find(x => x.id === a.seasonId);
                  const sB = seasons.find(x => x.id === b.seasonId);
                  const nA = (sA?.number || 0) * 1000 + (a.number || 0);
                  const nB = (sB?.number || 0) * 1000 + (b.number || 0);
                  return nA - nB;
              });
              episodeSelect.innerHTML = episodes.map(ep => {
                  const s = seasons.find(x => x.id === ep.seasonId);
                  const sNum = s ? String(s.number).padStart(2,'0') : '01';
                  const eNum = String(ep.number || 0).padStart(2,'0');
                  return `<option value="${ep.id}" ${ep.id === f.episodeId ? 'selected' : ''}>S${sNum}E${eNum}${ep.title ? ' — ' + Utils.escape(ep.title) : ''}</option>`;
              }).join('');
          }
          
          // Libellé contextuel à droite
          const labelEl = document.getElementById('stats-scope-label');
          if(labelEl) {
              const scopeLabel = Stats.getScopeLabel();
              labelEl.textContent = scopeLabel ? `Filtré sur ${scopeLabel}` : '';
          }
      },
      
      // Ajoute/retire le badge "niveau projet" sur les sections non-filtrables
      refreshScopeBadges: () => {
          const tab = document.getElementById('tab-stats');
          if(!tab) return;
          
          const f = state.statsFilter;
          const filterActive = (state.currentProjectType === 'series') 
              && f && f.scope !== 'all';
          
          tab.querySelectorAll('[data-stats-scope="project"]').forEach(el => {
              // Retirer un éventuel badge précédent
              const oldBadge = el.querySelector('.stats-scope-badge');
              if(oldBadge) oldBadge.remove();
              
              if(!filterActive) return;
              
              // Ajouter le badge
              const badge = document.createElement('span');
              badge.className = 'stats-scope-badge';
              badge.textContent = '— niveau projet';
              badge.style.cssText = 'margin-left: 8px; font-size: 0.75em; font-weight: normal; opacity: 0.6; font-style: italic;';
              el.appendChild(badge);
          });
      },
      
      renderSeasonsStats: () => {
          const section = document.getElementById('stats-seasons-section');
          const tbody = document.getElementById('seasons-stats-tbody');
          if(!section || !tbody) return;
          
          // Visible uniquement pour les séries
          if(state.currentProjectType !== 'series') {
              section.style.display = 'none';
              return;
          }
          
          // Masquée si un filtre saison/épisode est actif (info redondante avec les autres stats)
          const f = state.statsFilter;
          if(f && f.scope !== 'all') {
              section.style.display = 'none';
              return;
          }
          
          const seasons = state.data.seasons || [];
          const episodes = state.data.episodes || [];
          const scenes = state.data.scenes || [];
          
          if(seasons.length === 0) {
              section.style.display = 'none';
              return;
          }
          
          section.style.display = 'block';
          
          // Trier les saisons par numéro
          const sortedSeasons = [...seasons].sort((a, b) => (a.number || 0) - (b.number || 0));
          
          const rows = sortedSeasons.map(s => {
              const seasonEpisodes = episodes.filter(ep => ep.seasonId === s.id);
              const epIds = seasonEpisodes.map(ep => ep.id);
              const seasonScenes = scenes.filter(sc => epIds.includes(sc.episodeId));
              const totalTime = seasonScenes.reduce((sum, sc) => sum + (parseFloat(sc.time) || 0), 0);
              
              return `
                  <tr style="border-bottom: 1px solid var(--border);">
                      <td style="padding: 10px; font-weight: 600;">S${String(s.number).padStart(2, '0')}</td>
                      <td style="padding: 10px; opacity: 0.85;">${Utils.escape(s.title || '—')}</td>
                      <td style="padding: 10px; text-align: right;">${seasonEpisodes.length}</td>
                      <td style="padding: 10px; text-align: right;">${seasonScenes.length}</td>
                      <td style="padding: 10px; text-align: right;">${Math.round(totalTime)} min</td>
                  </tr>
              `;
          }).join('');
          
          // Ligne de total
          const totalEpisodes = episodes.length;
          const totalScenes = scenes.filter(sc => sc.episodeId).length;
          const grandTotalTime = scenes
              .filter(sc => sc.episodeId)
              .reduce((sum, sc) => sum + (parseFloat(sc.time) || 0), 0);
          
          const totalRow = `
              <tr style="border-top: 2px solid var(--border); font-weight: 600; background: rgba(127,127,127,0.05);">
                  <td style="padding: 10px;" colspan="2">TOTAL (${seasons.length} saison${seasons.length>1?'s':''})</td>
                  <td style="padding: 10px; text-align: right;">${totalEpisodes}</td>
                  <td style="padding: 10px; text-align: right;">${totalScenes}</td>
                  <td style="padding: 10px; text-align: right;">${Math.round(grandTotalTime)} min</td>
              </tr>
          `;
          
          tbody.innerHTML = rows + totalRow;
      },
      
      renderCrewStats: () => {
          const container = document.getElementById('chart-crew');
          if(!container) return;
          
          if(!state.data.crew || state.data.crew.length === 0) {
              container.innerHTML = '<div class="text-muted-center">Aucun technicien</div>';
              document.getElementById('stat-total-crew').innerText = '0';
              document.getElementById('stat-total-budget').innerText = '0 €';
              return;
          }
          
          document.getElementById('stat-total-crew').innerText = state.data.crew.length;
          
          let totalBudget = 0;
          state.data.crew.forEach(m => {
              const mRate = Pay.cost(m);
              if(mRate > 0) {
                  totalBudget += mRate;
              }
          });
          document.getElementById('stat-total-budget').innerText = totalBudget.toLocaleString() + ' €/jour';
          
          const crewGroups = state.data.groups.filter(g => g.type === 'crew');
          const deptCounts = {};
          
          crewGroups.forEach(grp => {
              const count = state.data.crew.filter(m => m.group_id === grp.id).length;
              if(count > 0) {
                  deptCounts[grp.name] = count;
              }
          });
          
          const unassigned = state.data.crew.filter(m => !m.group_id).length;
          if(unassigned > 0) {
              deptCounts['Non classé'] = unassigned;
          }
          
          Stats.drawBarChart('chart-crew', deptCounts, 15);
      },
      
	  renderActorDaysStats: () => {
          const container = document.getElementById('chart-actor-days');
          if(!container) return;
          
          const shootingDays = state.data.shootingDays || [];
          const actors = state.data.actors || [];
          
          if(actors.length === 0) {
              container.innerHTML = '<div class="text-muted-center">Aucun comédien</div>';
              return;
          }
          
          if(shootingDays.length === 0) {
              container.innerHTML = '<div class="text-muted-center">Aucun jour de tournage planifié</div>';
              return;
          }
          
          // Compter les jours par comédien
          const daysByActor = {};
          
          shootingDays.forEach(day => {
              if(!day.callSheet || day.callSheet.length === 0) return;
              
              day.callSheet.forEach(call => {
                  if(call.type === 'actor') {
                      const actor = actors.find(a => a.id === call.personId);
                      if(actor) {
                          const name = actor.name || 'Sans nom';
                          daysByActor[name] = (daysByActor[name] || 0) + 1;
                      }
                  }
              });
          });
          
          if(Object.keys(daysByActor).length === 0) {
              container.innerHTML = '<div class="text-muted-center">Aucun comédien convoqué</div>';
              return;
          }
          
          Stats.drawBarChart('chart-actor-days', daysByActor, 20);
      },
      
	  renderLieuxStats: () => {
          const container = document.getElementById('chart-lieux');
          if(!container) return;
          
          const lieuxCounts = {};
          Stats.getFilteredScenes().forEach(s => {
              if(!s.title) return;
              const locMatch = s.title.match(/^(?:INT\.|EXT\.|I\/E)\s*([^\-]+)/i);
              if(locMatch && locMatch[1]) {
                  const lieu = locMatch[1].trim().toUpperCase();
                  lieuxCounts[lieu] = (lieuxCounts[lieu] || 0) + 1;
              }
          });
          
          Stats.drawBarChart('chart-lieux', lieuxCounts, 100);
      },
	  
      renderShotsStats: () => {
          const container = document.getElementById('chart-shots');
          if(!container) return;
          
          if(!state.data.shots || state.data.shots.length === 0) {
              container.innerHTML = '<div class="text-muted-center">Aucun plan</div>';
              document.getElementById('stat-total-shots').innerText = '0';
              return;
          }
          
          document.getElementById('stat-total-shots').innerText = state.data.shots.length;
          
          const shotTypeCounts = {};
          state.data.shots.forEach(s => {
              if(s.shotType) {
                  shotTypeCounts[s.shotType] = (shotTypeCounts[s.shotType] || 0) + 1;
              }
          });
          
          Stats.drawBarChart('chart-shots', shotTypeCounts, 10);
      },
      
      drawBarChart: (id, dataObj, limit) => {
          const container = document.getElementById(id); 
          container.innerHTML = '';
          const sorted = Object.entries(dataObj).sort((a,b) => b[1] - a[1]).slice(0, limit);
          if(sorted.length === 0) { 
              container.innerHTML = '<div class="text-muted-center">Pas de données</div>'; 
              return; 
          }
          const max = sorted[0][1];
          sorted.forEach(([label, val]) => {
              const pct = (val / max) * 100; 
              const row = document.createElement('div'); 
              row.className = 'bar-row';
              row.innerHTML = `<div class="bar-label">${Utils.escape(label)}</div><div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div><div class="bar-val">${val}</div>`;
              
              // Rendre cliquable selon le type de chart
              if(id === 'chart-chars') {
                  row.style.cursor = 'pointer';
                  row.title = 'Cliquer pour voir les personnages';
                  row.onclick = () => {
                      app.UI.switchTab('personnages');
                  };
              } else if(id === 'chart-lieux') {
                  row.style.cursor = 'pointer';
                  row.title = 'Cliquer pour voir les lieux';
                  row.onclick = () => {
                      app.UI.switchTab('lieux');
                  };
              } else if(id === 'chart-crew') {
                  row.style.cursor = 'pointer';
                  row.title = 'Cliquer pour voir l\'équipe';
                  row.onclick = () => {
                      app.UI.switchTab('equipe');
                  };
              }
              
              container.appendChild(row);
          });
      },
      
      // ===== STATISTIQUES AVANCÉES V1.4.3 =====
      chartInstances: {},
      
      renderAdvanced: async () => {
          await LazyLib.load('chart');
          Stats.renderProgressScenes();
          Stats.renderIntExtChart();
          Stats.renderJourNuitChart();
          Stats.renderPariteCharts();
          Stats.renderBudgetChart();
          Stats.renderTimeTagsChart();
      },
      
      destroyChart: (chartId) => {
          if(Stats.chartInstances[chartId]) {
              Stats.chartInstances[chartId].destroy();
              delete Stats.chartInstances[chartId];
          }
      },
      
      // Barre de progression scènes planifiées
      renderProgressScenes: () => {
          const totalScenes = state.data.scenes?.length || 0;
          const shootingDays = state.data.shootingDays || [];
          const plannedSceneIds = new Set();
          shootingDays.forEach(day => {
              (day.scenes || []).forEach(s => plannedSceneIds.add(s.sceneId));
          });
          const plannedCount = plannedSceneIds.size;
          const pct = totalScenes > 0 ? Math.round((plannedCount / totalScenes) * 100) : 0;
          
          const bar = document.getElementById('progress-scenes-planned');
          if(bar) {
              bar.style.width = pct + '%';
              bar.textContent = pct + '%';
          }
          
          const legend = document.getElementById('legend-scenes-planned');
          if(legend) {
              legend.innerHTML = `
                  <div class="stats-legend-item"><span class="stats-legend-color" style="background:#4CAF50"></span> Planifiées: ${plannedCount}</div>
                  <div class="stats-legend-item"><span class="stats-legend-color" style="background:#ddd"></span> Total: ${totalScenes}</div>
              `;
          }
      },
      
      // Camembert INT/EXT
      renderIntExtChart: () => {
          const canvas = document.getElementById('chart-int-ext');
          if(!canvas) return;
          
          Stats.destroyChart('intExt');
          
          let intCount = 0, extCount = 0;
          Stats.getFilteredScenes().forEach(s => {
              const title = (s.title || '').toUpperCase();
              if(title.startsWith('INT')) intCount++;
              else if(title.startsWith('EXT')) extCount++;
          });
          
          if(intCount === 0 && extCount === 0) {
              canvas.parentElement.innerHTML = '<div class="empty-state-lg">Pas de données</div>';
              return;
          }
          
          Stats.chartInstances['intExt'] = new Chart(canvas, {
              type: 'doughnut',
              data: {
                  labels: ['Intérieur', 'Extérieur'],
                  datasets: [{
                      data: [intCount, extCount],
                      backgroundColor: ['#2196F3', '#FF9800'],
                      borderWidth: 0
                  }]
              },
              options: {
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                      legend: { position: 'bottom' }
                  }
              }
          });
      },
      
      // Camembert JOUR/NUIT
      renderJourNuitChart: () => {
          const canvas = document.getElementById('chart-jour-nuit');
          if(!canvas) return;
          
          Stats.destroyChart('jourNuit');
          
          let jourCount = 0, nuitCount = 0, aubeCount = 0;
          Stats.getFilteredScenes().forEach(s => {
              const title = (s.title || '').toUpperCase();
              if(title.includes('JOUR')) jourCount++;
              else if(title.includes('NUIT')) nuitCount++;
              else if(title.includes('AUBE') || title.includes('CRÉPUSCULE')) aubeCount++;
          });
          
          if(jourCount === 0 && nuitCount === 0 && aubeCount === 0) {
              canvas.parentElement.innerHTML = '<div class="empty-state-lg">Pas de données</div>';
              return;
          }
          
          const labels = ['Jour', 'Nuit'];
          const data = [jourCount, nuitCount];
          const colors = ['#FFC107', '#3F51B5'];
          
          if(aubeCount > 0) {
              labels.push('Aube/Crépuscule');
              data.push(aubeCount);
              colors.push('#FF5722');
          }
          
          Stats.chartInstances['jourNuit'] = new Chart(canvas, {
              type: 'doughnut',
              data: {
                  labels: labels,
                  datasets: [{
                      data: data,
                      backgroundColor: colors,
                      borderWidth: 0
                  }]
              },
              options: {
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                      legend: { position: 'bottom' }
                  }
              }
          });
      },
      
      // ===== PARITÉ =====
      _pariteBucket: (g) => {
          if(g === 'homme') return 'Homme';
          if(g === 'femme') return 'Femme';
          if(g === 'non-binaire') return 'Non-binaire';
          return 'Non renseigné';
      },
      
      _paritePie: (canvasId, chartKey, counts) => {
          const canvas = document.getElementById(canvasId);
          if(!canvas) return;
          Stats.destroyChart(chartKey);
          const colorMap = { 'Homme': '#2196F3', 'Femme': '#E91E63', 'Non-binaire': '#9C27B0', 'Non renseigné': '#9E9E9E' };
          const labels = Object.keys(counts).filter(k => counts[k] > 0);
          if(labels.length === 0) {
              canvas.parentElement.innerHTML = '<div class="empty-state-lg">Pas de données</div>';
              return;
          }
          Stats.chartInstances[chartKey] = new Chart(canvas, {
              type: 'doughnut',
              data: {
                  labels: labels,
                  datasets: [{
                      data: labels.map(l => counts[l]),
                      backgroundColor: labels.map(l => colorMap[l] || '#607D8B'),
                      borderWidth: 0
                  }]
              },
              options: {
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                      legend: { position: 'bottom' }
                  }
              }
          });
      },
      
      renderPariteCharts: () => {
          const chars = state.data.characters || [];
          const actors = state.data.actors || [];
          const bucketOf = Stats._pariteBucket;
          // Genre effectif d'un personnage : son champ Sexe, sinon celui du comédien lié
          const charGender = (c) => {
              if(c.gender) return bucketOf(c.gender);
              const a = c.actor_id ? actors.find(x => x.id === c.actor_id) : null;
              return bucketOf(a ? a.gender : '');
          };
          const newCounts = () => ({ 'Homme': 0, 'Femme': 0, 'Non-binaire': 0, 'Non renseigné': 0 });
          
          // 1. Parité des personnages
          const charCounts = newCounts();
          chars.forEach(c => charCounts[charGender(c)]++);
          Stats._paritePie('chart-parite-chars', 'pariteChars', charCounts);
          
          // Index nom → genre (même matching que charScenes)
          const genderByName = {};
          chars.forEach(c => { if(c.name) genderByName[c.name.trim().toUpperCase()] = charGender(c); });
          
          const scenes = Stats.getFilteredScenes();
          
          // 2. Répliques de dialogue par genre
          const dialCounts = newCounts();
          scenes.forEach(s => {
              if(!s.scriptContent) return;
              const div = document.createElement('div');
              div.innerHTML = s.scriptContent;
              div.querySelectorAll('.sc-dial').forEach(d => {
                  let prev = d.previousElementSibling;
                  while(prev && !prev.classList.contains('sc-perso')) prev = prev.previousElementSibling;
                  if(prev) {
                      const name = prev.innerText.trim().replace(/\(.*\)/,'').trim().toUpperCase();
                      dialCounts[genderByName[name] || 'Non renseigné']++;
                  }
              });
          });
          Stats._paritePie('chart-parite-dialogues', 'pariteDialogues', dialCounts);
          
          // 3-4. Rôles principaux / secondaires (via le groupe du comédien lié : ga1 / ga2)
          const principCounts = newCounts();
          const secondCounts = newCounts();
          chars.forEach(c => {
              if(!c.actor_id) return;
              const a = actors.find(x => x.id === c.actor_id);
              if(!a) return;
              if(a.group_id === 'ga1') principCounts[charGender(c)]++;
              else if(a.group_id === 'ga2') secondCounts[charGender(c)]++;
          });
          Stats._paritePie('chart-parite-principaux', 'paritePrincipaux', principCounts);
          Stats._paritePie('chart-parite-secondaires', 'pariteSecondaires', secondCounts);
          
          // 5. Apparitions en scène par genre
          const appearCounts = newCounts();
          // v580 : apparitions comptees par identifiant de fiche.
          scenes.forEach(s => {
              FicheLinks.charsOfScene(s).forEach(ch => {
                  appearCounts[genderByName[String(ch.name || '').trim().toUpperCase()] || 'Non renseigné']++;
              });
          });
          Stats._paritePie('chart-parite-scenes', 'pariteScenes', appearCounts);
          
          // 6. Technicien·nes par genre
          const crewCounts = newCounts();
          (state.data.crew || []).forEach(m => crewCounts[bucketOf(m.gender)]++);
          Stats._paritePie('chart-parite-crew', 'pariteCrew', crewCounts);
      },
      
      // Budget par catégorie + comparaison
      renderBudgetChart: () => {
          const canvas = document.getElementById('chart-budget-cat');
          if(!canvas) return;
          
          Stats.destroyChart('budgetCat');
          
          const expenses = state.data.expenses || [];
          const categories = {};
          let totalDepense = 0;
          
          expenses.forEach(exp => {
              if(exp.status === 'validated' || exp.status === 'pending') {
                  const cat = exp.category || 'Autre';
                  const amount = parseFloat(exp.amount) || 0;
                  categories[cat] = (categories[cat] || 0) + amount;
                  totalDepense += amount;
              }
          });
          
          // Budget prévu (depuis présentation ou estimé)
          // Source canonique : Budget.total (nombre). Repli : presentation.budget
          // assaini (pouvait être une string "1 800 000" -> parseFloat donnait 1).
          const budgetPrevu = parseFloat(state.data.budget?.total)
              || parseFloat(String(state.data.presentation?.budget ?? '').replace(/[^\d,.-]/g, '').replace(',', '.'))
              || 0;
          const reste = budgetPrevu - totalDepense;
          
          // Mise à jour des valeurs
          document.getElementById('budget-prevu').textContent = budgetPrevu.toLocaleString('fr-FR') + ' €';
          document.getElementById('budget-depense').textContent = totalDepense.toLocaleString('fr-FR') + ' €';
          
          const resteEl = document.getElementById('budget-reste');
          resteEl.textContent = reste.toLocaleString('fr-FR') + ' €';
          resteEl.className = 'budget-item-value ' + (reste >= 0 ? 'positive' : 'negative');
          
          // Barre de progression budget
          const pctBudget = budgetPrevu > 0 ? Math.min(100, Math.round((totalDepense / budgetPrevu) * 100)) : 0;
          const barBudget = document.getElementById('progress-budget');
          if(barBudget) {
              barBudget.style.width = pctBudget + '%';
              barBudget.textContent = pctBudget + '% utilisé';
              barBudget.style.background = pctBudget > 90 ? 'linear-gradient(90deg, #f44336, #E91E63)' : 'linear-gradient(90deg, #2196F3, #03A9F4)';
          }
          
          // Camembert catégories
          const catLabels = Object.keys(categories);
          const catData = Object.values(categories);
          
          if(catLabels.length === 0) {
              canvas.parentElement.innerHTML = '<div class="empty-state-lg">Aucune dépense</div>';
              return;
          }
          
          const catColors = ['#4CAF50', '#2196F3', '#FF9800', '#9C27B0', '#f44336', '#00BCD4', '#795548', '#607D8B'];
          
          Stats.chartInstances['budgetCat'] = new Chart(canvas, {
              type: 'pie',
              data: {
                  labels: catLabels,
                  datasets: [{
                      data: catData,
                      backgroundColor: catColors.slice(0, catLabels.length),
                      borderWidth: 0
                  }]
              },
              options: {
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                      legend: { position: 'bottom' }
                  }
              }
          });
      },
      
      // Temps par tag (barres horizontales)
      renderTimeTagsChart: () => {
          const canvas = document.getElementById('chart-time-tags');
          if(!canvas) return;
          
          Stats.destroyChart('timeTags');
          
          const tagTimes = {};
          const tagColors = {};
          
          (state.data.tags || []).forEach(t => {
              tagTimes[t.name] = 0;
              tagColors[t.name] = t.color || '#999';
          });
          
          Stats.getFilteredScenes().forEach(s => {
              const tag = (state.data.tags || []).find(t => t.id === s.tag_id);
              if(tag) {
                  tagTimes[tag.name] += parseFloat(s.time) || 0;
              }
          });
          
          const labels = Object.keys(tagTimes).filter(k => tagTimes[k] > 0);
          const data = labels.map(l => Math.round(tagTimes[l]));
          const colors = labels.map(l => tagColors[l]);
          
          if(labels.length === 0) {
              canvas.parentElement.innerHTML = '<div class="empty-state-lg">Pas de données</div>';
              return;
          }
          
          Stats.chartInstances['timeTags'] = new Chart(canvas, {
              type: 'bar',
              data: {
                  labels: labels,
                  datasets: [{
                      label: 'Minutes',
                      data: data,
                      backgroundColor: colors,
                      borderWidth: 0,
                      borderRadius: 5
                  }]
              },
              options: {
                  indexAxis: 'y',
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                      legend: { display: false }
                  },
                  scales: {
                      x: {
                          beginAtZero: true,
                          title: { display: true, text: 'Minutes' }
                      }
                  }
              }
          });
      },
    
    // ============================================================
    // ===== EXPORT PDF STATS (jsPDF natif) =====
    // ============================================================
    // Stratégie hybride :
    // 1. Force un Stats.render() pour s'assurer que tous les canvas Chart.js sont à jour
    // 2. Capture les canvas Chart.js en PNG via toDataURL
    // 3. Recompute les bar-charts "maison" et le tableau saisons en jsPDF natif
    // 4. Une seule modale : page de garde oui/non
    
    openExportModal: () => {
        Actions.openExportModal('stats');
        document.querySelectorAll('#export-modal .exp-section-chk').forEach(cb => {
            cb.checked = (cb.dataset.section === 'stats');
        });
    },
    
    exportPDF: async (opts = {}) => {
        await LazyLib.load('pdfexport'); const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 25;
        const usableWidth = pageWidth - margin * 2;
        
        // ========= S'assurer que les canvas Chart.js sont à jour =========
        Utils.toast('Préparation des graphiques...', 'info');
        try {
            Stats.render();
            // Laisser le temps à Chart.js de finir le rendu
            await new Promise(r => setTimeout(r, 400));
        } catch(e) {
            console.warn('[Stats.exportPDF] render failed :', e);
        }
        
        // ========= Page de garde =========
        if(opts.includeCover !== false && typeof FichesPDF !== 'undefined' && FichesPDF._drawCoverPage) {
            FichesPDF._drawCoverPage(doc, 'Statistiques');
            doc.addPage();
        }
        let y = margin;
        
        // ========= Helpers internes =========
        const isSeries = state.currentProjectType === 'series';
        const scopeLabel = Stats.getScopeLabel();
        
        const ensureSpace = (space) => {
            if(y + space > pageHeight - margin - 5) {
                doc.addPage();
                y = margin;
            }
        };
        
        const drawSectionHeader = (title) => {
            ensureSpace(14);
            doc.setFillColor(...PdfTheme.COLORS.TEXT_PRIMARY);
            doc.rect(margin, y, usableWidth, 8, 'F');
            doc.setFillColor(...PdfTheme.accentFor('Statistiques'));
            doc.rect(margin, y, 1.8, 8, 'F');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10);
            doc.setTextColor(...PdfTheme.COLORS.WHITE);
            doc.text(title.toUpperCase(), margin + 5, y + 5.5);
            y += 8 + 4;
        };
        
        // Capture d'un canvas Chart.js → dataURL PNG
        const captureCanvas = (canvasId) => {
            try {
                const cv = document.getElementById(canvasId);
                if(!cv || cv.width === 0 || cv.height === 0) return null;
                if(!cv.toDataURL) return null;
                return { dataUrl: cv.toDataURL('image/png'), w: cv.width, h: cv.height };
            } catch(e) {
                console.warn('[Stats.exportPDF] capture failed for', canvasId, e);
                return null;
            }
        };
        
        // Insère une image Chart.js capturée, redimensionnée pour le PDF
        const insertChartImage = (img, maxWidthMm, maxHeightMm) => {
            if(!img) return false;
            const ratio = img.w / img.h;
            let w = maxWidthMm;
            let h = w / ratio;
            if(h > maxHeightMm) {
                h = maxHeightMm;
                w = h * ratio;
            }
            ensureSpace(h + 4);
            const x = margin + (usableWidth - w) / 2;
            try {
                doc.addImage(img.dataUrl, 'PNG', x, y, w, h);
                y += h + 4;
                return true;
            } catch(e) {
                console.warn('[Stats.exportPDF] addImage failed :', e);
                return false;
            }
        };
        
        // Dessine un bar-chart horizontal natif jsPDF
        const drawHBarChart = (dataObj, limit) => {
            const sorted = Object.entries(dataObj).sort((a, b) => b[1] - a[1]).slice(0, limit);
            if(sorted.length === 0) {
                doc.setFont('helvetica', 'italic');
                doc.setFontSize(9);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_FAINT);
                ensureSpace(6);
                doc.text('Pas de données', margin, y + 4);
                y += 8;
                return;
            }
            const max = sorted[0][1];
            const labelW = 50;
            const valW = 12;
            const barAreaW = usableWidth - labelW - valW - 4;
            const rowH = 5.5;
            
            sorted.forEach(([label, val]) => {
                ensureSpace(rowH);
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(8.5);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_BODY);
                // Nettoyer les emojis (jsPDF latin1 only) - les noms de groupes crew/types de plans en contiennent
                let txtLabel = (typeof PdfTheme !== 'undefined' && PdfTheme.cleanText)
                    ? PdfTheme.cleanText(String(label)).trim() || String(label)
                    : String(label);
                while(doc.getTextWidth(txtLabel) > labelW - 2 && txtLabel.length > 4) {
                    txtLabel = txtLabel.substring(0, txtLabel.length - 2) + '…';
                }
                doc.text(txtLabel, margin, y + 3.8);
                
                doc.setFillColor(...PdfTheme.COLORS.BORDER_LIGHT);
                doc.rect(margin + labelW, y + 1.5, barAreaW, rowH - 2, 'F');
                
                const pct = max > 0 ? val / max : 0;
                doc.setFillColor(...PdfTheme.COLORS.STAT_GREEN);
                doc.rect(margin + labelW, y + 1.5, barAreaW * pct, rowH - 2, 'F');
                
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(8.5);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_BODY);
                doc.text(String(val), margin + usableWidth, y + 3.8, { align: 'right' });
                
                y += rowH;
            });
            y += 2;
        };
        
        // Carte stat (compteur)
        const drawStatCard = (x, y, w, h, label, value) => {
            const accent = PdfTheme.accentFor('Statistiques');
            doc.setFillColor(246, 246, 246);
            doc.rect(x, y, w, h, 'F');
            doc.setFillColor(...accent);
            doc.rect(x, y, w, 1.2, 'F');
            doc.setDrawColor(...PdfTheme.COLORS.BORDER_LIGHT);
            doc.setLineWidth(0.2);
            doc.rect(x, y, w, h);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
            doc.text(PdfTheme.cleanText(String(label)).toUpperCase(), x + w/2, y + 5, { align: 'center' });
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(16);
            doc.setTextColor(...accent);
            doc.text(PdfTheme.cleanText(String(value)), x + w/2, y + h - 4, { align: 'center' });
        };
        
        // ========= EN-TÊTE EN BANDEAU GRIS (cohérent avec les autres sections) =========
        y = PdfTheme.sectionBand(doc, { x: margin, y, width: usableWidth,
                                        title: 'Rapport de statistiques',
                                        accent: PdfTheme.accentFor('Statistiques') });
        if(scopeLabel) {
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(9.5);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_LIGHT);
            doc.text('Périmètre : ' + scopeLabel, margin, y + 4);
            y += 8;
        } else {
            y += 2;
        }
        
        // ========= CARTES COMPTEURS =========
        const readStat = (id) => {
            const el = document.getElementById(id);
            return el ? (el.innerText || el.textContent || '—').trim() : '—';
        };
        const counters = [
            { label: 'Total Scènes',     value: readStat('stat-total-scenes') },
            { label: 'Total Dialogues',  value: readStat('stat-total-dials') },
            { label: 'Durée Estimée',    value: readStat('stat-total-time') },
            { label: 'Total Plans',      value: readStat('stat-total-shots') }
        ];
        const isProjectScope = !state.statsFilter || state.statsFilter.scope === 'all';
        if(isProjectScope) {
            counters.push({ label: 'Équipe Technique', value: readStat('stat-total-crew') });
            counters.push({ label: 'Budget Équipe',    value: readStat('stat-total-budget') });
        }
        
        const perRow = 3;
        const cardH = 18;
        const cardGap = 4;
        const cardW = (usableWidth - cardGap * (perRow - 1)) / perRow;
        const rowCount = Math.ceil(counters.length / perRow);
        ensureSpace(rowCount * (cardH + cardGap));
        counters.forEach((c, i) => {
            const col = i % perRow;
            const row = Math.floor(i / perRow);
            const cx = margin + col * (cardW + cardGap);
            const cy = y + row * (cardH + cardGap);
            drawStatCard(cx, cy, cardW, cardH, c.label, c.value);
        });
        y += rowCount * (cardH + cardGap) + 2;
        
        // ========= SECTION : AVANCEMENT =========
        if(isProjectScope) {
            drawSectionHeader('Avancement du projet');
            
            const totalScenes = state.data.scenes?.length || 0;
            const plannedSceneIds = new Set();
            (state.data.shootingDays || []).forEach(day => {
                (day.scenes || []).forEach(s => plannedSceneIds.add(s.sceneId));
            });
            const plannedCount = plannedSceneIds.size;
            const pctPlanned = totalScenes > 0 ? Math.round((plannedCount / totalScenes) * 100) : 0;
            
            ensureSpace(16);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9.5);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_BODY);
            doc.text('Scènes planifiées', margin, y + 4);
            y += 6;
            const barH = 6;
            doc.setFillColor(...PdfTheme.COLORS.BORDER_LIGHT);
            doc.rect(margin, y, usableWidth, barH, 'F');
            doc.setFillColor(...PdfTheme.COLORS.STAT_GREEN);
            doc.rect(margin, y, usableWidth * (pctPlanned / 100), barH, 'F');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8.5);
            doc.setTextColor(...PdfTheme.COLORS.BANNER_DARK);
            doc.text(`${pctPlanned}%  —  ${plannedCount} / ${totalScenes} scènes`, margin + usableWidth/2, y + 4.2, { align: 'center' });
            y += barH + 4;
        }
        
        // Camemberts INT/EXT et Jour/Nuit côte à côte
        drawSectionHeader('Répartition INT/EXT  et  JOUR/NUIT');
        const chartIntExt = captureCanvas('chart-int-ext');
        const chartJourNuit = captureCanvas('chart-jour-nuit');
        if(chartIntExt || chartJourNuit) {
            const halfW = (usableWidth - 8) / 2;
            const targetH = 60;
            ensureSpace(targetH + 4);
            const yStart = y;
            if(chartIntExt) {
                const ratio = chartIntExt.w / chartIntExt.h;
                let h = targetH;
                let w = h * ratio;
                if(w > halfW) { w = halfW; h = w / ratio; }
                const x = margin + (halfW - w) / 2;
                try { doc.addImage(chartIntExt.dataUrl, 'PNG', x, yStart, w, h); } catch(e){}
            }
            if(chartJourNuit) {
                const ratio = chartJourNuit.w / chartJourNuit.h;
                let h = targetH;
                let w = h * ratio;
                if(w > halfW) { w = halfW; h = w / ratio; }
                const x = margin + halfW + 8 + (halfW - w) / 2;
                try { doc.addImage(chartJourNuit.dataUrl, 'PNG', x, yStart, w, h); } catch(e){}
            }
            y = yStart + targetH + 4;
        } else {
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(9);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_FAINT);
            doc.text('Pas de données disponibles', margin, y + 4);
            y += 8;
        }
        
        // ========= SECTION : PARITÉ =========
        drawSectionHeader('Parité');
        const pariteCharts = [
            { id: 'chart-parite-chars', label: 'Personnages' },
            { id: 'chart-parite-dialogues', label: 'Répliques de dialogue' },
            { id: 'chart-parite-principaux', label: 'Rôles principaux' },
            { id: 'chart-parite-secondaires', label: 'Rôles secondaires' },
            { id: 'chart-parite-scenes', label: 'Apparitions en scène' },
            { id: 'chart-parite-crew', label: 'Technicien·nes' }
        ].map(p => ({ label: p.label, img: captureCanvas(p.id) })).filter(p => p.img);
        if(pariteCharts.length) {
            const halfWP = (usableWidth - 8) / 2;
            const targetHP = 55;
            for(let i = 0; i < pariteCharts.length; i += 2) {
                const pair = pariteCharts.slice(i, i + 2);
                ensureSpace(targetHP + 12);
                const yStartP = y;
                pair.forEach((p, col) => {
                    const xBase = margin + col * (halfWP + 8);
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(9);
                    doc.setTextColor(...PdfTheme.COLORS.TEXT_BODY);
                    doc.text(p.label, xBase + halfWP / 2, yStartP + 3, { align: 'center' });
                    const ratio = p.img.w / p.img.h;
                    let h = targetHP;
                    let w = h * ratio;
                    if(w > halfWP) { w = halfWP; h = w / ratio; }
                    const x = xBase + (halfWP - w) / 2;
                    try { doc.addImage(p.img.dataUrl, 'PNG', x, yStartP + 5, w, h); } catch(e){}
                });
                y = yStartP + targetHP + 12;
            }
        } else {
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(9);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_FAINT);
            ensureSpace(6);
            doc.text('Pas de données', margin, y + 4);
            y += 8;
        }
        
        // ========= SECTION : BUDGET =========
        if(isProjectScope) {
            drawSectionHeader('Budget');
            
            const budgetPrevu = readStat('budget-prevu');
            const budgetDepense = readStat('budget-depense');
            const budgetReste = readStat('budget-reste');
            
            ensureSpace(20);
            const bCardH = 16;
            const bCardW = (usableWidth - 8) / 3;
            drawStatCard(margin, y, bCardW, bCardH, 'Budget prévu', budgetPrevu);
            drawStatCard(margin + bCardW + 4, y, bCardW, bCardH, 'Dépensé', budgetDepense);
            drawStatCard(margin + (bCardW + 4) * 2, y, bCardW, bCardH, 'Reste', budgetReste);
            y += bCardH + 4;
            
            const chartBudget = captureCanvas('chart-budget-cat');
            if(chartBudget) {
                insertChartImage(chartBudget, usableWidth * 0.7, 70);
            } else {
                doc.setFont('helvetica', 'italic');
                doc.setFontSize(9);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_FAINT);
                ensureSpace(6);
                doc.text('Aucune dépense enregistrée', margin, y + 4);
                y += 8;
            }
        }
        
        // ========= SECTION : TEMPS PAR TAG =========
        drawSectionHeader('Temps par tag/acte');
        const chartTimeTags = captureCanvas('chart-time-tags');
        if(chartTimeTags) {
            insertChartImage(chartTimeTags, usableWidth, 80);
        } else {
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(9);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_FAINT);
            ensureSpace(6);
            doc.text('Pas de données', margin, y + 4);
            y += 8;
        }
        
        // ========= SECTION : PERSONNAGES & LIEUX & TAGS =========
        drawSectionHeader('Personnages — Nombre de mots prononcés');
        const charCounts = {};
        const tagCounts = {};
        Stats.getFilteredScenes().forEach(s => {
            const tid = s.tag_id || 't1';
            tagCounts[tid] = (tagCounts[tid] || 0) + 1;
            const div = document.createElement('div');
            div.innerHTML = s.scriptContent || '';
            const dials = div.querySelectorAll('.sc-dial');
            dials.forEach(d => {
                const text = d.innerText.trim();
                const words = text.split(/\s+/).filter(w => w.length > 0).length;
                let prev = d.previousElementSibling;
                while(prev && !prev.classList.contains('sc-perso')) prev = prev.previousElementSibling;
                if(prev) {
                    const name = prev.innerText.trim().replace(/\(.*\)/, '').trim().toUpperCase();
                    charCounts[name] = (charCounts[name] || 0) + words;
                }
            });
        });
        drawHBarChart(charCounts, 15);
        
        drawSectionHeader('Répartition par axe (tags)');
        const tagData = {};
        (state.data.tags || []).forEach(t => {
            if(tagCounts[t.id]) tagData[t.name] = tagCounts[t.id];
        });
        drawHBarChart(tagData, 10);
        
        drawSectionHeader('Lieux — Nombre de scènes');
        const lieuxCounts = {};
        Stats.getFilteredScenes().forEach(s => {
            if(!s.title) return;
            const m = s.title.match(/^(?:INT\.|EXT\.|I\/E)\s*([^\-]+)/i);
            if(m && m[1]) {
                const lieu = m[1].trim().toUpperCase();
                lieuxCounts[lieu] = (lieuxCounts[lieu] || 0) + 1;
            }
        });
        drawHBarChart(lieuxCounts, 15);
        
        // ========= SECTION : ÉQUIPE & STORYBOARD =========
        if(isProjectScope) {
            drawSectionHeader('Équipe par département');
            const crewGroups = (state.data.groups || []).filter(g => g.type === 'crew');
            const deptCounts = {};
            crewGroups.forEach(grp => {
                const count = (state.data.crew || []).filter(m => m.group_id === grp.id).length;
                if(count > 0) deptCounts[grp.name] = count;
            });
            const unassigned = (state.data.crew || []).filter(m => !m.group_id).length;
            if(unassigned > 0) deptCounts['Non classé'] = unassigned;
            drawHBarChart(deptCounts, 15);
            
            drawSectionHeader('Plans par type');
            const shotTypeCounts = {};
            (state.data.shots || []).forEach(s => {
                if(s.shotType) shotTypeCounts[s.shotType] = (shotTypeCounts[s.shotType] || 0) + 1;
            });
            drawHBarChart(shotTypeCounts, 15);
            
            drawSectionHeader('Jours de tournage par comédien');
            const daysByActor = {};
            (state.data.shootingDays || []).forEach(day => {
                if(!day.callSheet || day.callSheet.length === 0) return;
                day.callSheet.forEach(call => {
                    if(call.type === 'actor') {
                        const actor = (state.data.actors || []).find(a => a.id === call.personId);
                        if(actor) {
                            const name = actor.name || 'Sans nom';
                            daysByActor[name] = (daysByActor[name] || 0) + 1;
                        }
                    }
                });
            });
            drawHBarChart(daysByActor, 20);
        }
        
        // ========= TABLEAU SAISONS (séries, scope projet uniquement) =========
        if(isSeries && isProjectScope) {
            const seasons = state.data.seasons || [];
            if(seasons.length > 0) {
                drawSectionHeader('Statistiques par saison');
                const sortedSeasons = [...seasons].sort((a, b) => (a.number || 0) - (b.number || 0));
                const episodes = state.data.episodes || [];
                const allScenes = state.data.scenes || [];
                
                const colSx = [margin, margin + 18, margin + 90, margin + 120, margin + 150];
                ensureSpace(8);
                doc.setFillColor(...PdfTheme.COLORS.BANNER_DARK);
                doc.rect(margin, y, usableWidth, 6, 'F');
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(8.5);
                doc.setTextColor(...PdfTheme.COLORS.WHITE);
                doc.text('Saison', colSx[0] + 1, y + 4);
                doc.text('Titre',  colSx[1] + 1, y + 4);
                doc.text('Épisodes', colSx[2], y + 4);
                doc.text('Scènes',   colSx[3], y + 4);
                doc.text('Durée',    colSx[4], y + 4);
                y += 6;
                
                let totalEpisodes = 0, totalScenesCount = 0, grandTotalTime = 0;
                sortedSeasons.forEach((s, idx) => {
                    const seasonEpisodes = episodes.filter(ep => ep.seasonId === s.id);
                    const epIds = seasonEpisodes.map(ep => ep.id);
                    const seasonScenes = allScenes.filter(sc => epIds.includes(sc.episodeId));
                    const totalTime = seasonScenes.reduce((sum, sc) => sum + (parseFloat(sc.time) || 0), 0);
                    totalEpisodes += seasonEpisodes.length;
                    totalScenesCount += seasonScenes.length;
                    grandTotalTime += totalTime;
                    
                    ensureSpace(6);
                    if(idx % 2 === 0) {
                        doc.setFillColor(...PdfTheme.COLORS.BORDER_LIGHT);
                        doc.rect(margin, y, usableWidth, 5.5, 'F');
                    }
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(8.5);
                    doc.setTextColor(...PdfTheme.COLORS.BANNER_DARK);
                    doc.text('S' + String(s.number).padStart(2, '0'), colSx[0] + 1, y + 3.8);
                    doc.setFont('helvetica', 'normal');
                    let title = s.title || '—';
                    while(doc.getTextWidth(title) > 70 && title.length > 4) title = title.substring(0, title.length - 2) + '…';
                    doc.text(title, colSx[1] + 1, y + 3.8);
                    doc.text(String(seasonEpisodes.length), colSx[2], y + 3.8);
                    doc.text(String(seasonScenes.length), colSx[3], y + 3.8);
                    doc.text(Math.round(totalTime) + ' min', colSx[4], y + 3.8);
                    y += 5.5;
                });
                
                ensureSpace(6);
                doc.setFillColor(...PdfTheme.COLORS.BORDER_LIGHT);
                doc.rect(margin, y, usableWidth, 6, 'F');
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(8.5);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_DARK);
                doc.text(`TOTAL (${seasons.length} saison${seasons.length > 1 ? 's' : ''})`, colSx[0] + 1, y + 4);
                doc.text(String(totalEpisodes), colSx[2], y + 4);
                doc.text(String(totalScenesCount), colSx[3], y + 4);
                doc.text(Math.round(grandTotalTime) + ' min', colSx[4], y + 4);
                y += 6 + 4;
            }
        }
        
        // ========= Footer =========
        if(typeof FichesPDF !== 'undefined' && FichesPDF._drawFooters) {
            FichesPDF._drawFooters(doc, opts.includeCover !== false, !!opts.returnBlob);
        }
        
        // ========= Sauvegarde =========
        if(opts.returnBlob) return doc.output('blob');
        const filename = (typeof PdfTheme !== 'undefined' && PdfTheme.filename)
            ? PdfTheme.filename('Statistiques')
            : `${state.data.title || 'Projet'} - Statistiques - moteur.studio.pdf`;
        doc.save(filename);
        Utils.toast('Statistiques PDF exporté !', 'success');
        if(typeof History !== 'undefined' && History.log) History.log('EXPORT', 'Statistiques PDF généré');
    }
  };
  
 // ====================================================================
 // === PdfTheme [Phase C.1] : helper unifié pour tous les exports PDF ===
 // ====================================================================
 // - coverPage(doc, opts) : génère une page de garde façon Final Draft
 // - footer(doc, pageNum, totalPages) : footer minimaliste (n° page en bas droite)
 // - filename(section) : nom de fichier standardisé "{projet} - {section} - moteur.studio.pdf"
 // - cleanText(str) : retire les emojis qui plantent en latin-1 (jsPDF)
 // - getAuthorForSection(section) : récupère l'auteur contextuel selon le type de document
 //
 // Tous les exports PDF de l'app doivent passer par ces helpers pour uniformité.
 const PdfTheme = {
    // ============================================================
    // PALETTE DE COULEURS (R4) - Source de vérité unique pour les PDFs
    // ============================================================
    // Format : [r, g, b] - utilisable via doc.setFillColor(...PdfTheme.COLORS.TEXT_DARK)
    // Ou en destructuring : const [r,g,b] = PdfTheme.COLORS.BANNER_DARK;
    COLORS: {
        // Texte (du plus foncé au plus clair)
        TEXT_DARK:      [30, 30, 30],     // titres principaux, accentué
        TEXT_PRIMARY:   [50, 50, 50],     // texte normal sombre (le plus utilisé)
        TEXT_BODY:      [60, 60, 60],     // texte body courant
        TEXT_MUTED:     [80, 80, 80],     // texte un peu effacé
        TEXT_SECONDARY: [100, 100, 100],  // texte secondaire (sous-titres, dates)
        TEXT_LIGHT:     [120, 120, 120],  // texte légèrement effacé
        TEXT_FAINT:     [150, 150, 150],  // texte très clair (placeholders, mentions)
        
        // Fonds (bandeaux et zones colorées)
        BANNER_DARK:    [40, 40, 40],     // bandeaux gris foncé identitaires (Dossier Prod)
        BANNER_BLUE:    [43, 110, 246],   // bandeau d'en-tête bleu identitaire
        BG_LIGHT:       [240, 240, 240],  // fond gris très clair (alternance lignes)
        BG_LIGHTER:     [245, 245, 245],  // fond gris extra-clair
        
        // Bordures
        BORDER:         [200, 200, 200],  // bordure standard
        BORDER_LIGHT:   [225, 225, 225],  // bordure très claire
        BORDER_DARK:    [180, 180, 180],  // bordure plus foncée
        
        // Couleurs de base
        WHITE:          [255, 255, 255],
        BLACK:          [0, 0, 0],
        
        // Statuts (badges, alertes)
        SUCCESS:        [40, 167, 69],    // vert "Validé"
        WARNING:        [255, 193, 7],    // jaune "En attente"
        STAT_GREEN:     [76, 175, 80]     // vert Material (utilisé dans Stats, jauges)
    },
    
    // ============================================================
    // COULEURS PAR SECTION (V558) — code couleur du Dossier de Production
    // ============================================================
    SECTION_COLORS: {
        'Synopsis': [43, 110, 246], 'Séquencier': [43, 110, 246], 'Scénario': [43, 110, 246],
        'Présentation': [43, 110, 246], 'Page de titre': [43, 110, 246],
        'Mood Board': [124, 77, 255], 'Storyboard': [124, 77, 255],
        'Personnages': [67, 160, 71], 'Comédiens': [67, 160, 71], 'Équipe': [67, 160, 71], 'Figuration': [67, 160, 71],
        'Lieux': [121, 85, 72], 'Décors': [121, 85, 72], 'Ressources': [121, 85, 72], 'Asso / Entreprises': [121, 85, 72],
        'Planning': [230, 110, 0], 'Dépouillement': [230, 110, 0],
        'Budget': [0, 137, 123], 'Statistiques': [0, 137, 123], 'Production': [0, 137, 123], 'Rapport de production': [0, 137, 123], 'Rapports script': [0, 137, 123]
    },
    // Couleur d'accent d'une section (repli : bleu identitaire)
    accentFor: (sectionName) => PdfTheme.SECTION_COLORS[sectionName] || PdfTheme.COLORS.BANNER_BLUE,

    // Eclaircit une couleur vers le blanc. f = 0 rend la couleur, f = 1 le blanc.
    tint: (c, f) => [Math.round(c[0] + (255 - c[0]) * f),
                     Math.round(c[1] + (255 - c[1]) * f),
                     Math.round(c[2] + (255 - c[2]) * f)],

    // ============================================================
    // TITRE DE SECTION (v601) — UNE SEULE PORTE
    // ============================================================
    // Remplace le bandeau gris fonce pleine largeur, juge trop lourd : une page
    // de dossier en comptait parfois cinq, et le noir plein mange l'encre a
    // l'impression sans rien apporter a la lecture.
    // Le dessin reprend le vocabulaire DEJA pose sur les pages de garde : une
    // barre a la couleur de la section, le titre en gris tres fonce, un filet
    // fin dessous. Rien de neuf a apprendre en feuilletant le dossier.
    // TOUS LES EXPORTS PASSENT PAR ICI : changer le style se fait en un endroit,
    // au lieu des quinze copies du bandeau qui existaient avant.
    // Renvoie le y SUIVANT (apres le titre et son espace), pour que l'appelant
    // ecrive « y = PdfTheme.sectionBand(...) » sans recalculer l'avance.
    HEADER_H: 13.5,
    sectionBand: (doc, o = {}) => {
        const x = (o.x !== undefined) ? o.x : 25;
        const y = o.y || 0;
        const w = o.width || (doc.internal.pageSize.getWidth() - x * 2);
        const accent = o.accent || PdfTheme.COLORS.BANNER_BLUE;
        const clean = (t) => PdfTheme.cleanText ? PdfTheme.cleanText(t || '') : (t || '');
        const titre = clean(o.title).toUpperCase();

        // Barre d'accent, a gauche du titre
        doc.setFillColor(...accent);
        doc.rect(x, y, 2.4, 7.4, 'F');

        // Texte secondaire a droite (date, effectif...), mesure D'ABORD : il
        // decide de la place qui reste au titre.
        const droite = o.right ? clean(o.right) : '';
        let largeurDroite = 0;
        if(droite) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            largeurDroite = doc.getTextWidth(droite) + 4;
        }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(o.size || 11.5);
        doc.setTextColor(...PdfTheme.COLORS.TEXT_DARK);
        // TITRE TRONQUE SI BESOIN, et ici plutot que chez chaque appelant : un
        // titre de scene un peu long debordait de sa bande et venait s'imprimer
        // PAR-DESSUS le badge « BROUILLON » place a cote. On raccourcit d'un
        // caractere a la fois, suite comprise dans la mesure (meme regle que les
        // deux troncatures du recapitulatif, pour la meme raison : retirer n
        // caracteres pour en rajouter autant tourne en rond).
        const placeTitre = w - 5.4 - largeurDroite;
        let titreAffiche = titre;
        if(doc.getTextWidth(titreAffiche) > placeTitre) {
            while(titreAffiche.length > 2 && doc.getTextWidth(titreAffiche + '…') > placeTitre) titreAffiche = titreAffiche.slice(0, -1);
            titreAffiche += '…';
        }
        doc.text(titreAffiche, x + 5.4, y + 5.6);

        if(droite) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
            doc.text(droite, x + w, y + 5.6, { align: 'right' });
        }

        // Filet fin sous toute la largeur, a la couleur de la section eclaircie
        doc.setDrawColor(...PdfTheme.tint(accent, 0.55));
        doc.setLineWidth(0.4);
        doc.line(x, y + 8.6, x + w, y + 8.6);

        // On rend au suivant un etat neutre : sans cela, le premier appelant qui
        // oubliait de reposer sa couleur ecrivait son paragraphe en gris clair.
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...PdfTheme.COLORS.TEXT_BODY);
        doc.setDrawColor(...PdfTheme.COLORS.BORDER);
        doc.setLineWidth(0.2);
        return y + PdfTheme.HEADER_H;
    },
    
    // Mapping section → rôles à chercher dans state.data.crew (par ordre de priorité)
    AUTHOR_ROLES: {
        'Scénario':       ['Scénariste', 'Co-scénariste', 'Dialoguiste'],
        'Séquencier':     ['Scénariste', 'Co-scénariste'],
        'Storyboard':     ['Story-boarder', 'Storyboardeur', 'Réalisateur·rice'],
        'Dépouillement':  ['1er·ère assistant·e réalisateur·rice', 'Réalisateur·rice'],
        'Budget':         ['Producteur·rice', 'Producteur·rice exécutif·ve', 'Directeur·rice de production', 'Administrateur·rice de production'],
        'Équipe':         ['Producteur·rice', 'Directeur·rice de production', 'Régisseur·euse général·e'],
        'Production':     ['Producteur·rice', 'Producteur·rice exécutif·ve', 'Directeur·rice de production'],
        'Planning':       ['1er·ère assistant·e réalisateur·rice', 'Régisseur·euse général·e'],
        'Ressources':     ['Régisseur·euse général·e', 'Chef·fe décorateur·rice', 'Accessoiriste'],
        'Mood Board':     ['Réalisateur·rice', 'Directeur·rice de la photographie'],
        'Page de titre':  ['Scénariste', 'Réalisateur·rice'],
        'Présentation':   ['Producteur·rice', 'Réalisateur·rice']
    },
    
    // Alias vers Utils.stripPdfUnsafe (source de vérité unique pour le nettoyage texte PDF).
    // Conservé pour rétrocompat avec les 20+ appels PdfTheme.cleanText(...) dans le code.
    // Idempotente : cleanText(cleanText(x)) === cleanText(x). Trim final inclus.
    cleanText: (str) => Utils.stripPdfUnsafe(str).trim(),
    
    // Récupère l'auteur contextuel selon le type de document
    // Cherche dans state.data.crew le premier technicien avec un rôle qui matche
    // Retourne { name, role } ou null
    getAuthorForSection: (sectionName) => {
        if(!state.data || !state.data.crew) return null;
        const roles = PdfTheme.AUTHOR_ROLES[sectionName] || [];
        if(roles.length === 0) return null;
        
        // Chercher par ordre de priorité dans les rôles
        for(const wantedRole of roles) {
            const member = state.data.crew.find(m => {
                if(!m.role) return false;
                // Match sans accents, sans majuscules, sans points
                const r1 = String(m.role).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[·.]/g, '');
                const r2 = wantedRole.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[·.]/g, '');
                return r1 === r2 || r1.includes(r2) || r2.includes(r1);
            });
            if(member) return { name: member.name, role: member.role };
        }
        
        // Fallback : pour les sections autre que Page de titre, on prend le scriptMeta.author
        if(state.data.scriptMeta && state.data.scriptMeta.author) {
            return { name: state.data.scriptMeta.author, role: 'Auteur' };
        }
        
        // Dernier fallback : le réalisateur même s'il n'est pas dans la liste prioritaire
        const director = state.data.crew.find(m => {
            if(!m.role) return false;
            const r = String(m.role).toLowerCase();
            return r.includes('réalisateur') || r.includes('realisateur');
        });
        if(director) return { name: director.name, role: director.role };
        
        return null;
    },
    
    // Construit un nom de fichier propre : "{titre projet} - {section} - moteur.studio.pdf"
    filename: (sectionName) => {
        const title = (state.data && state.data.title) ? state.data.title : 'Projet';
        // Nettoyer les caractères problématiques pour les noms de fichiers
        const safeTitle = title.replace(/[\\/:*?"<>|]/g, '_').trim();
        const safeSec = sectionName.replace(/[\\/:*?"<>|]/g, '_').trim();
        return `${safeTitle} - ${safeSec} - moteur.studio.pdf`;
    },
    
    // Page de garde façon Final Draft
    // opts: { doc, sectionName, customAuthor?, customSubtitle? }
    coverPage: (doc, opts = {}) => {
        // Page de garde unifiée — Modèle B (label SECTION en majuscules + "Établi par X")
        // Pour cohérence avec toutes les sections du Dossier de Production.
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 25;
        const sectionName = opts.sectionName || 'Document';
        const projectTitle = (state.data && state.data.title) ? state.data.title : 'Projet sans titre';
        const meta = (state.data && state.data.scriptMeta) ? state.data.scriptMeta : {};
        
        // Auteur contextuel : opts.customAuthor a priorité, sinon PdfTheme.getAuthorForSection
        let author = opts.customAuthor;
        if(!author) {
            const found = PdfTheme.getAuthorForSection(sectionName);
            author = found ? found.name : null;
        }
        if(!author && meta.author) author = meta.author;
        
        // === Bande verticale à la couleur de la section ===
        doc.setFillColor(...PdfTheme.accentFor(sectionName));
        doc.rect(0, 0, 5, pageHeight, 'F');
        
        // === Titre projet centré au tiers supérieur, souligné ===
        const titleY = pageHeight * 0.35;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(28);
        doc.setTextColor(...PdfTheme.COLORS.TEXT_DARK);
        const titleUpper = PdfTheme.cleanText(projectTitle).toUpperCase();
        // Rétrécir la police jusqu'à tenir dans la page (évite le titre tronqué)
        let coverFs = 28;
        while(doc.getTextWidth(titleUpper) > pageWidth - margin * 2 && coverFs > 14) {
            coverFs -= 1;
            doc.setFontSize(coverFs);
        }
        doc.text(titleUpper, pageWidth / 2, titleY, { align: 'center' });
        const titleWidth = doc.getTextWidth(titleUpper);
        doc.setLineWidth(0.5);
        doc.line(pageWidth/2 - titleWidth/2, titleY + 2, pageWidth/2 + titleWidth/2, titleY + 2);
        
        // === Label section en majuscules, à la couleur de la section ===
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.setTextColor(...PdfTheme.accentFor(sectionName));
        doc.text(PdfTheme.cleanText(sectionName).toUpperCase(), pageWidth / 2, titleY + 14, { align: 'center' });
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...PdfTheme.COLORS.TEXT_BODY);
        
        // === "Établi par X" (ou customSubtitle) ===
        if(opts.customSubtitle) {
            doc.setFontSize(13);
            doc.text(PdfTheme.cleanText(opts.customSubtitle), pageWidth / 2, titleY + 28, { align: 'center' });
        } else if(author) {
            doc.setFontSize(13);
            doc.text('Établi par ' + PdfTheme.cleanText(author), pageWidth / 2, titleY + 28, { align: 'center' });
        }
        
        // === "Basé sur X" en italique ===
        if(meta.source) {
            doc.setFontSize(11);
            doc.setFont('helvetica', 'italic');
            doc.text('Basé sur ' + PdfTheme.cleanText(meta.source), pageWidth / 2, titleY + 42, { align: 'center' });
            doc.setFont('helvetica', 'normal');
        }
        
        // === Date de génération en bas centré ===
        const today = new Date();
        const dateLong = today.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
        doc.setFontSize(10);
        doc.setTextColor(...PdfTheme.COLORS.TEXT_LIGHT);
        doc.text('Document établi le ' + dateLong, pageWidth / 2, pageHeight - 50, { align: 'center' });
        
        // === Contact / copyright en bas à gauche ===
        let cy = pageHeight - 35;
        doc.setFontSize(10);
        doc.setTextColor(...PdfTheme.COLORS.TEXT_MUTED);
        if(meta.contact)   { doc.text(PdfTheme.cleanText(meta.contact), margin, cy); cy += 5; }
        if(meta.copyright) { doc.text(PdfTheme.cleanText(meta.copyright), margin, cy); cy += 5; }
    },
    
    // Footer minimaliste : numéro de page seul, en bas à droite
    // À appeler en boucle après génération du document
    // doc.internal.pages.length - 1 = nombre total de pages
    // Hauteur de la zone réservée au footer unifié (en mm)
    // Tous les modules doivent considérer cette zone comme "interdite au contenu"
    FOOTER_ZONE_MM: 14,
    
    /**
     * Footer unifié minimaliste : "X / N" centré en bas, gris discret.
     * À appeler à la fin de chaque export PDF, juste avant le save/blob.
     * 
     * En mode Dossier de Production fusionné (forDossier:true), la fonction
     * NE DESSINE RIEN : la phase 7ter de buildDossierProd écrira la pagination
     * globale. Évite les superpositions et les masquages incertains via pdf-lib.
     *
     * @param {jsPDF} doc - instance jsPDF
     * @param {object} opts - { 
     *     skipFirstPage: true|false (par défaut true, saute la cover),
     *     forDossier: true|false (par défaut false, pas de footer si true)
     *   }
     */
    applyFooters: (doc, opts = {}) => {
        // En mode Dossier de Production : ne rien dessiner.
        // La pagination globale sera dessinée par buildDossierProd phase 7ter.
        if(opts.forDossier) return;
        
        const pageCount = doc.internal.pages.length - 1;
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const skipFirstPage = opts.skipFirstPage !== false; // par défaut on saute la page de garde
        
        for(let i = 1; i <= pageCount; i++) {
            if(skipFirstPage && i === 1) continue;
            
            doc.setPage(i);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_LIGHT);
            // Pagination locale "X / N" centrée en bas
            doc.text(`${i} / ${pageCount}`, pageWidth / 2, pageHeight - 6, { align: 'center' });
        }
    },
    
    /**
     * Post-traite un blob PDF pour tourner les pages paysage à 270°.
     * Toutes les pages paysage (largeur > hauteur) sont tournées dans le sens horaire
     * pour qu'à l'impression, le lecteur garde la feuille en portrait et tourne juste
     * la tête vers la droite. Idem que phase 7quater de buildDossierProd.
     * 
     * @param {Blob} blob - blob PDF d'entrée
     * @returns {Promise<Blob>} blob PDF avec les paysages tournés (ou blob initial si échec)
     */
    rotateLandscapePages: async (blob) => {
        try {
            if(typeof PDFLib === 'undefined' && typeof window.PDFLib === 'undefined') {
                console.warn('[PdfTheme.rotateLandscapePages] pdf-lib non chargé, blob retourné tel quel');
                return blob;
            }
            const lib = typeof PDFLib !== 'undefined' ? PDFLib : window.PDFLib;
            const { PDFDocument, degrees } = lib;
            const arrayBuffer = await blob.arrayBuffer();
            const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
            const pages = pdfDoc.getPages();
            for(let i = 0; i < pages.length; i++) {
                const p = pages[i];
                const { width: w, height: h } = p.getSize();
                if(w > h) {
                    p.setRotation(degrees(270));
                }
            }
            const bytes = await pdfDoc.save();
            return new Blob([bytes], { type: 'application/pdf' });
        } catch(e) {
            console.warn('[PdfTheme.rotateLandscapePages] échec :', e);
            return blob;
        }
    },
    
    // Helper pour récupérer un libellé propre d'un groupe (technique ou perso)
    // Ex: 'gc3' → '🎬 Réalisation' (ou juste 'Réalisation' si stripEmoji = true)
    getGroupLabel: (groupId, stripEmoji = false) => {
        if(!groupId) return '';
        const allGroups = (state.data && state.data.groups) ? state.data.groups : [];
        const grp = allGroups.find(g => g.id === groupId);
        if(!grp) return groupId; // fallback : afficher l'id si rien trouvé
        const name = grp.name || '';
        return stripEmoji ? PdfTheme.cleanText(name) : name;
    },
    
    // ============================================================
    // R6 - MODE DEBUG PDF (outil dev pour visualiser positions/zones)
    // ============================================================
    // Activation : dans la console, faire `PdfTheme.DEBUG = true` avant
    // de déclencher un export PDF. Les helpers debugRect/debugText/debugGrid
    // deviennent alors actifs et dessinent des bordures rouges pointillées
    // avec labels de coordonnées. Désactivation : `PdfTheme.DEBUG = false`.
    //
    // En production (DEBUG = false), tous les helpers sont des no-ops : aucun
    // surcoût. On peut donc les insérer sans crainte dans les fonctions de
    // dessin PDF (Synopsis, Crew, Storyboard, etc.) pour les debugger plus tard.
    DEBUG: false,
    
    // Dessine un rectangle rouge pointillé autour d'une zone, avec label optionnel.
    // Utile pour visualiser l'emprise d'un bloc : `PdfTheme.debugRect(doc, x, y, w, h, 'titre')`
    debugRect: (doc, x, y, w, h, label = '') => {
        if(!PdfTheme.DEBUG) return;
        const prevDraw = doc.getDrawColor();
        const prevLine = doc.getLineWidth();
        try {
            doc.setDrawColor(255, 0, 0);
            doc.setLineWidth(0.2);
            if(typeof doc.setLineDashPattern === 'function') {
                doc.setLineDashPattern([1, 1], 0);
            }
            doc.rect(x, y, w, h, 'S');
            if(typeof doc.setLineDashPattern === 'function') {
                doc.setLineDashPattern([], 0); // reset
            }
            if(label) {
                doc.setFontSize(6);
                doc.setTextColor(255, 0, 0);
                doc.text(`${label} (${x.toFixed(1)},${y.toFixed(1)} ${w.toFixed(1)}x${h.toFixed(1)})`, x, y - 0.5);
            }
        } catch(e) {
            console.warn('[PdfTheme.debugRect]', e);
        }
        // Reset
        try {
            doc.setDrawColor(prevDraw);
            doc.setLineWidth(prevLine);
        } catch(_) {}
    },
    
    // Dessine un marqueur de position (croix rouge + label coordonnées).
    // Utile pour visualiser un point précis : `PdfTheme.debugText(doc, x, y, 'titre Y')`
    debugText: (doc, x, y, label = '') => {
        if(!PdfTheme.DEBUG) return;
        try {
            doc.setDrawColor(255, 0, 0);
            doc.setLineWidth(0.15);
            // Petite croix de 2mm
            doc.line(x - 1, y, x + 1, y);
            doc.line(x, y - 1, x, y + 1);
            doc.setFontSize(6);
            doc.setTextColor(255, 0, 0);
            doc.text(`${label} (${x.toFixed(1)},${y.toFixed(1)})`, x + 1.5, y - 0.5);
        } catch(e) {
            console.warn('[PdfTheme.debugText]', e);
        }
    },
    
    // Dessine une grille de coordonnées (pas en mm) sur la page courante.
    // Utile pour repérer rapidement les zones : `PdfTheme.debugGrid(doc, 10)`
    // step : pas en mm (10 = grille tous les cm, 5 = tous les 5mm)
    debugGrid: (doc, step = 10) => {
        if(!PdfTheme.DEBUG) return;
        try {
            const pageW = doc.internal.pageSize.getWidth();
            const pageH = doc.internal.pageSize.getHeight();
            doc.setDrawColor(255, 200, 200);
            doc.setLineWidth(0.05);
            doc.setFontSize(5);
            doc.setTextColor(255, 100, 100);
            // Lignes verticales + labels X
            for(let x = 0; x <= pageW; x += step) {
                doc.line(x, 0, x, pageH);
                if(x > 0) doc.text(String(x), x + 0.3, 3);
            }
            // Lignes horizontales + labels Y
            for(let y = 0; y <= pageH; y += step) {
                doc.line(0, y, pageW, y);
                if(y > 0) doc.text(String(y), 0.5, y - 0.3);
            }
        } catch(e) {
            console.warn('[PdfTheme.debugGrid]', e);
        }
    }
};

// ============================================================================
// === Patch jsPDF.getTextWidth() pour cohérence avec PdfTheme.cleanText ======
// ============================================================================
// Le rendu PDF utilise cleanText sur le texte affiché. Si on mesurait la
// largeur du texte BRUT (avec emojis), le soulignement / cadre dessiné autour
// serait trop large par rapport au texte effectivement rendu (vide à droite).
// On patche donc getTextWidth pour qu'il mesure le texte post-cleanText.
// (Pas de PubSub interne sur getTextWidth, contrairement à text() — patch safe.)
window.__patchJsPDF = function patchJsPDFGetTextWidth() {
    try {
        const jsPDFLib = (typeof window !== 'undefined' && window.jspdf && window.jspdf.jsPDF) ? window.jspdf.jsPDF : null;
        if(!jsPDFLib) {
            console.warn('[PdfTheme] jsPDF non détecté, patch getTextWidth non installé.');
            return;
        }
        if(jsPDFLib.__getTextWidthPatched) return; // idempotent
        
        // Dans jsPDF 2.5.1, getTextWidth peut être une propriété d'instance OU sur le prototype.
        // On parcourt toute la chaîne de prototypes pour trouver où il vit réellement.
        const probe = new jsPDFLib('p', 'mm', 'a4');
        let targetObj = null;
        let originalGetTextWidth = null;
        
        // 1) Direct sur l'instance ?
        if(Object.prototype.hasOwnProperty.call(probe, 'getTextWidth') && typeof probe.getTextWidth === 'function') {
            targetObj = probe;
            originalGetTextWidth = probe.getTextWidth;
        } else {
            // 2) Remonter la chaîne de prototypes
            let proto = Object.getPrototypeOf(probe);
            while(proto && proto !== Object.prototype) {
                if(Object.prototype.hasOwnProperty.call(proto, 'getTextWidth') && typeof proto.getTextWidth === 'function') {
                    targetObj = proto;
                    originalGetTextWidth = proto.getTextWidth;
                    break;
                }
                proto = Object.getPrototypeOf(proto);
            }
        }
        
        if(!originalGetTextWidth) {
            console.warn('[PdfTheme] getTextWidth introuvable dans la chaîne de prototypes, patch annulé.');
            return;
        }
        
        // Patch : appeler cleanText avant la mesure
        const cleanWrapper = function(text) {
            const clean = (PdfTheme && PdfTheme.cleanText) ? PdfTheme.cleanText : (s => s);
            const cleaned = Array.isArray(text) ? text.map(t => clean(t)) : clean(text);
            return originalGetTextWidth.call(this, cleaned);
        };
        
        // Si on a trouvé sur l'instance, on doit patcher le CONSTRUCTEUR pour intercepter
        // toutes les futures instances. Sinon (prototype), on patche directement.
        if(targetObj === probe) {
            // Solution : wrapper le constructeur pour ajouter le patch à chaque nouvelle instance
            const OriginalCtor = window.jspdf.jsPDF;
            window.jspdf.jsPDF = function(...args) {
                const instance = new OriginalCtor(...args);
                if(typeof instance.getTextWidth === 'function' && !instance.__getTextWidthWrapped) {
                    const _orig = instance.getTextWidth.bind(instance);
                    instance.getTextWidth = function(text) {
                        const clean = (PdfTheme && PdfTheme.cleanText) ? PdfTheme.cleanText : (s => s);
                        const cleaned = Array.isArray(text) ? text.map(t => clean(t)) : clean(text);
                        return _orig(cleaned);
                    };
                    instance.__getTextWidthWrapped = true;
                }
                return instance;
            };
            // Préserver le prototype et les propriétés statiques
            window.jspdf.jsPDF.prototype = OriginalCtor.prototype;
            Object.setPrototypeOf(window.jspdf.jsPDF, OriginalCtor);
        } else {
            // Patch direct sur le prototype trouvé
            targetObj.getTextWidth = cleanWrapper;
        }
        
        jsPDFLib.__getTextWidthPatched = true;
    } catch(e) {
        console.warn('[PdfTheme] Erreur patch getTextWidth:', e);
    }
};
