
  const BeatBoard = {
      // ----- ÉTAT (canvas + sélection) -----
      viewMode: 'sequencer', // 'sequencer' ou 'beatboard'
      zoom: 1,
      panX: 0,
      panY: 0,
      isPanning: false,
      panStartX: 0,
      panStartY: 0,
      isSelecting: false,
      selStartX: 0,
      selStartY: 0,
      draggedCard: null,
      showLine: true,
      showTagLines: false,
      activeTagLines: {}, // { tagId: true/false } pour toggle individuel
      selectedCards: [], // IDs des cartes sélectionnées
      
      // ===================== RENDU =====================
      setViewMode: (mode) => {
          BeatBoard.viewMode = mode;
          const seqView = document.getElementById('sequencer-view');
          const bbView = document.getElementById('beatboard-view');
          const seqOpts = document.getElementById('sequencer-options');
          const bbOpts = document.getElementById('beatboard-options');
          const btnSeq = document.getElementById('view-mode-sequencer');
          const btnBB = document.getElementById('view-mode-beatboard');
          
          if(mode === 'sequencer') {
              seqView.style.display = 'block';
              bbView.style.display = 'none';
              seqOpts.style.display = 'block';
              bbOpts.style.display = 'none';
              btnSeq.style.background = 'var(--primary)';
              btnSeq.style.color = 'white';
              btnBB.style.background = 'var(--bg)';
              btnBB.style.color = 'var(--text-main)';
              UI.renderBoard(); // Refresh les scènes quand on arrive sur le séquencier
          } else {
              seqView.style.display = 'none';
              bbView.style.display = 'block';
              seqOpts.style.display = 'none';
              bbOpts.style.display = 'block';
              btnSeq.style.background = 'var(--bg)';
              btnSeq.style.color = 'var(--text-main)';
              btnBB.style.background = 'var(--primary)';
              btnBB.style.color = 'white';
              BeatBoard.render();
          }
      },
      
      render: () => {
          const canvas = document.getElementById('beatboardCanvas');
          if(!canvas) return;
          
          // Supprimer les anciennes cartes et zones
          canvas.querySelectorAll('.beatboard-card, .beatboard-out-timeline-zone').forEach(c => c.remove());
          
          // S6 : filtrer par épisode actif pour les séries
          const scenesFiltered = UI.getScenesForCurrentView();
          
          // Séparer les scènes in/out timeline
          const inTimeline = scenesFiltered.filter(s => s.inTimeline !== false);
          const outTimeline = scenesFiltered.filter(s => s.inTimeline === false);
          
          // Initialiser positions si nécessaire
          inTimeline.forEach((scene, idx) => {
              if(!scene.beatboardX || !scene.beatboardY) {
                  scene.beatboardX = 50 + (idx % 6) * 220;
                  scene.beatboardY = 50 + Math.floor(idx / 6) * 160;
              }
          });
          
          // Positionner les scènes hors timeline en bas
          outTimeline.forEach((scene, idx) => {
              if(!scene.beatboardX || !scene.beatboardY) {
                  scene.beatboardX = 50 + (idx % 8) * 200;
                  scene.beatboardY = 800 + Math.floor(idx / 8) * 140;
              }
          });
          
          // Créer les cartes in timeline avec numéros
          inTimeline.forEach((scene, idx) => {
              const card = BeatBoard.createCard(scene, idx, true);
              canvas.appendChild(card);
          });
          
          // Créer les cartes out timeline sans numéros
          outTimeline.forEach((scene) => {
              const card = BeatBoard.createCard(scene, null, false);
              canvas.appendChild(card);
          });
          
          // Zone visuelle "Hors timeline" si il y a des scènes dedans
          if(outTimeline.length > 0) {
              const zone = document.createElement('div');
              zone.className = 'beatboard-out-timeline-zone';
              zone.innerHTML = '<span class="beatboard-out-timeline-label">📌 Hors timeline</span>';
              zone.style.bottom = '20px';
              zone.style.left = '20px';
              zone.style.transform = 'none';
              zone.style.position = 'absolute';
              zone.style.top = '750px';
              canvas.appendChild(zone);
          }
          
          // Dessiner le fil rouge (seulement les scènes in timeline)
          BeatBoard.drawLine();
          
          // Dessiner les lignes de tags
          BeatBoard.drawTagLines();
          
          // Mettre à jour la liste des tags
          BeatBoard.renderTagList();
          
          // Mettre à jour la liste des lignes de tags
          BeatBoard.renderTagLinesList();
          
          // Mettre à jour la minimap
          BeatBoard.updateMinimap();
          
          // Initialiser le pan
          BeatBoard.initPan();
          
          // Etat des boutons Annuler / Retablir de ce panneau
          UI.updateSceneOrderButtons();
      },
      
      createCard: (scene, idx, isInTimeline = true) => {
          const card = document.createElement('div');
          card.className = 'beatboard-card' + (isInTimeline ? '' : ' out-of-timeline');
          card.dataset.id = scene.id;
          card.dataset.inTimeline = isInTimeline;
          if(idx !== null) card.dataset.index = idx;
          card.style.left = scene.beatboardX + 'px';
          card.style.top = scene.beatboardY + 'px';
          
          // Marquer comme sélectionné si dans la liste
          if(BeatBoard.selectedCards.includes(scene.id)) {
              card.classList.add('selected');
          }
          
          const tag = state.data.tags.find(t => t.id === scene.tag_id) || {name:'', color: 'transparent'};
          const status = scene.status || 'not-verified';
          
          const numberBadge = isInTimeline ? `<div class="beatboard-card-number">${UI.formatSceneNumber(scene, idx)}</div>` : '';
          const timelineIcon = isInTimeline ? '' : '<span style="position:absolute;top:8px;right:28px;font-size:0.7rem;color:var(--text-sec);">📌</span>';
          const isView = state.currentRole === 'viewer';
          const isFinal = scene.isFinal === true;
          const actions = isView ? '' : `<div class="compact-card-actions">
              <button class="merge-btn" onmousedown="event.stopPropagation()" onclick="event.stopPropagation(); app.ScriptReview.open('${scene.id}')" title="Commentaires">💬</button>
              <button class="edit-btn" onmousedown="event.stopPropagation()" onclick="event.stopPropagation(); app.Actions.${isFinal ? 'unfinalizeScene' : 'finalizeScene'}('${scene.id}')" title="${isFinal ? 'Repasser en brouillon' : 'Finaliser'}">${isFinal ? '📝' : '✅'}</button>
              <button class="delete-btn" onmousedown="event.stopPropagation()" onclick="event.stopPropagation(); app.Actions.deleteScene('${scene.id}')" title="Supprimer">🗑️</button>
          </div>`;
          
          card.innerHTML = `
              <div class="beatboard-card-tag" style="background: ${tag.color !== 'transparent' ? tag.color : 'var(--border)'}"></div>
              ${numberBadge}
              ${timelineIcon}
              ${actions}
              <div class="beatboard-card-connector in"></div>
              <div class="beatboard-card-connector out"></div>
              <div class="beatboard-card-title">${Utils.escape(scene.title)}</div>
              <div class="beatboard-card-meta">${Utils.escape(scene.perso || '-')} • ${scene.time || '?'} min</div>
              <div class="beatboard-card-resume">${Utils.escape(scene.resume || '')}</div>
              <div class="seq-card-badges">
                  <span class="scene-status-badge ${isFinal ? 'final' : 'draft'}">${isFinal ? '✅ Finale' : '📝 Brouillon'}</span>
                  <span class="scene-status-badge ${status}" onmousedown="event.stopPropagation()" onclick="event.stopPropagation(); app.UI.toggleSceneStatus('${scene.id}', event)">${SCENE_STATUS_LABELS[status]}</span>
                  <span class="comment-badge d-none" data-scene="${scene.id}" onmousedown="event.stopPropagation()" onclick="event.stopPropagation(); app.ScriptReview.open('${scene.id}')" title="Commentaires">0</span>
              </div>
          `;
          
          // Clic avec Ctrl = sélection multiple
          card.addEventListener('click', (e) => {
              if(e.ctrlKey || e.metaKey) {
                  e.preventDefault();
                  e.stopPropagation();
                  BeatBoard.toggleSelection(scene.id);
              }
          });
          
          // Drag & Drop
          card.addEventListener('mousedown', (e) => {
              if(e.ctrlKey || e.metaKey) return; // Ctrl = sélection, pas drag
              BeatBoard.startDrag(e, card, scene);
          });
          card.addEventListener('dblclick', () => Actions.editScene(scene.id));
          card.addEventListener('contextmenu', (e) => Actions.openTagMenu(e, scene.id));
          
          return card;
      },
      
      // ===================== CARTES & SCÈNES =====================
      toggleSelection: (sceneId) => {
          const idx = BeatBoard.selectedCards.indexOf(sceneId);
          if(idx === -1) {
              BeatBoard.selectedCards.push(sceneId);
          } else {
              BeatBoard.selectedCards.splice(idx, 1);
          }
          // Mettre à jour visuellement
          const card = document.querySelector(`.beatboard-card[data-id="${sceneId}"]`);
          if(card) card.classList.toggle('selected');
      },

      // Vide la selection multiple (clic dans le vide du canvas).
      clearSelection: () => {
          if(!BeatBoard.selectedCards.length) return;
          BeatBoard.selectedCards = [];
          document.querySelectorAll('.beatboard-card.selected').forEach(c => c.classList.remove('selected'));
      },      
      createScene: () => {
          // La remise a zero de #edit-scene-form a ete retiree ici : ce
          // formulaire est parti le 26 aout avec la bande de saisie du
          // sequencier. Le bloc etait garde par un « if(form) » et ne
          // s'executait donc plus jamais.
          
          // Créer un modal pour le formulaire dans le beatboard
          const existingModal = document.getElementById('beatboard-scene-modal');
          if(existingModal) existingModal.remove();
          
          const modal = document.createElement('div');
          modal.id = 'beatboard-scene-modal';
          modal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); display:flex; justify-content:center; align-items:center; z-index: var(--z-modal);';
          modal.innerHTML = `
              <div style="background:var(--panel-bg); border-radius:12px; padding:25px; width:90%; max-width:500px; border:1px solid var(--border);">
                  <h3 style="margin:0 0 20px; display:flex; justify-content:space-between; align-items:center;">
                      ➕ Nouvelle scène (hors timeline)
                      <button onclick="document.getElementById('beatboard-scene-modal').remove()" style="background:none; border:none; font-size:1.5rem; cursor:pointer; color:var(--text-sec);">×</button>
                  </h3>
                  <div style="display:flex; gap:8px; margin-bottom:15px;">
                      <input id="bb-inpPre" placeholder="INT" data-tooltip="INT" value="INT" style="width:60px; padding:10px; border:1px solid var(--border); border-radius:6px; background:var(--input-bg); color:var(--text-main);">
                      <span style="display:flex; align-items:center;">.</span>
                      <input id="bb-inpLoc" placeholder="LIEU" data-tooltip="LIEU" style="flex:1; padding:10px; border:1px solid var(--border); border-radius:6px; background:var(--input-bg); color:var(--text-main);">
                      <button type="button" class="btn btn--primary btn--sm" title="Enregistrer ce lieu comme nouveau décor" onclick="app.FicheLinks.createDecorFromBeatBoard()">➕ Décor</button>
                      <span style="display:flex; align-items:center;">-</span>
                      <input id="bb-inpSuff" placeholder="JOUR" data-tooltip="JOUR" value="JOUR" style="width:80px; padding:10px; border:1px solid var(--border); border-radius:6px; background:var(--input-bg); color:var(--text-main);">
                  </div>
                  <input id="bb-inpTime" placeholder="Durée (min)" data-tooltip="Durée (min)" class="n8-input-8">
                  <input id="bb-inpPerso" placeholder="Personnages..." data-tooltip="Personnages..." class="n8-input-8">
                  <textarea id="bb-inpResume" rows="3" placeholder="Résumé..." data-tooltip="Résumé..." style="width:100%; padding:10px; border:1px solid var(--border); border-radius:6px; background:var(--input-bg); color:var(--text-main); resize:vertical; margin-bottom:20px;"></textarea>
                  <div class="flex-end">
                      <button onclick="document.getElementById('beatboard-scene-modal').remove()" class="btn btn--secondary">Annuler</button>
                      <button onclick="app.BeatBoard.addScene()" class="btn btn--primary">➕ Créer</button>
                  </div>
              </div>
          `;
          document.body.appendChild(modal);
          document.getElementById('bb-inpLoc').focus();
      },
      
      addScene: () => {
          const pre = document.getElementById('bb-inpPre').value.trim() || 'INT';
          const loc = document.getElementById('bb-inpLoc').value.trim();
          const suff = document.getElementById('bb-inpSuff').value.trim() || 'JOUR';
          
          if(!loc) {
              Utils.toast('Entrez un lieu', 'warning');
              return;
          }
          
          const title = `${pre}. ${loc} - ${suff}`;
          
          const newScene = {
              id: Utils.generateUniqueId(),
              title: title,
              perso: document.getElementById('bb-inpPerso').value.trim(),
              time: document.getElementById('bb-inpTime').value.trim(),
              resume: document.getElementById('bb-inpResume').value.trim(),
              scriptContent: "<div class='sc-action'><br></div>",
              breakdown: {},
              tag_id: 't1',
              inTimeline: false, // Hors timeline par défaut
              beatboardX: 50 + Math.random() * 200,
              beatboardY: 800 + Math.random() * 100,
              lastModified: Date.now(),
              lastModifiedBy: state.currentUser?.email || 'unknown'
          };
          
          state.data.scenes.push(newScene);
          // v580 : la scene nait avec ses liens — les noms saisis posent les
          // ids de personnages (creation a l'identique de la saisie en fiche)
          // et le decor du titre est resolu s'il existe deja en fiche.
          FicheLinks.syncIdsFromText(newScene);
          FicheLinks.refreshPerso(newScene);
          FicheLinks.resolveDecor(newScene);
          Store.save();
          
          document.getElementById('beatboard-scene-modal').remove();
          BeatBoard.render();
          UI.renderBoard();
          
          Utils.toast('Scène créée (hors timeline)', 'success');
      },
      
      // ===================== DRAG & DROP =====================
      startDrag: (e, card, scene) => {
          if(e.button !== 0) return;
          // 31 aout — CINQUIEME ANGLE MORT SOURIS : les cartes du beat board se
          // deplacent a la souris et leur position (comme leur ordre, avec
          // Shift) est ENREGISTREE dans la scene. Le droit est celui du
          // sequencier, auquel la scene appartient.
          if(typeof Permissions !== 'undefined' && Permissions.canEditFiche && !Permissions.canEditFiche('scene')) return;
          e.preventDefault();
          
          const isReorderMode = e.shiftKey;
          const inTimelineScenes = state.data.scenes.filter(s => s.inTimeline !== false);
          const sceneIndex = inTimelineScenes.findIndex(s => s.id === scene.id);
          const isCurrentlyInTimeline = scene.inTimeline !== false;
          
          // Multi-sélection : si la scène draggée est dans la sélection, on déplace tout le groupe
          const isMultiDrag = BeatBoard.selectedCards.length > 1 && BeatBoard.selectedCards.includes(scene.id);
          const selectedScenes = isMultiDrag 
              ? state.data.scenes.filter(s => BeatBoard.selectedCards.includes(s.id))
              : [scene];
          
          // Stocker les positions originales de toutes les cartes sélectionnées
          const originalPositions = selectedScenes.map(s => ({
              scene: s,
              origX: s.beatboardX,
              origY: s.beatboardY,
              card: document.querySelector(`.beatboard-card[data-id="${s.id}"]`)
          }));
          
          BeatBoard.draggedCard = { 
              card, 
              scene, 
              sceneIndex,
              startX: e.clientX, 
              startY: e.clientY, 
              origX: scene.beatboardX, 
              origY: scene.beatboardY,
              isReorderMode,
              isMultiDrag,
              originalPositions
          };
          
          // Ajouter la classe dragging à toutes les cartes sélectionnées
          originalPositions.forEach(p => {
              if(p.card) p.card.classList.add('dragging');
          });
          
          if(isReorderMode) {
              BeatBoard._reorderInsertIndex = null;
              card.style.zIndex = '2000';
              card.style.boxShadow = '0 20px 60px rgba(231, 76, 60, 0.4)';
              card.style.border = '3px solid #e74c3c';
              BeatBoard.showDropZones();
          }
          
          const onMove = (ev) => {
              const dx = (ev.clientX - BeatBoard.draggedCard.startX) / BeatBoard.zoom;
              const dy = (ev.clientY - BeatBoard.draggedCard.startY) / BeatBoard.zoom;
              
              // Déplacer toutes les cartes sélectionnées
              BeatBoard.draggedCard.originalPositions.forEach(p => {
                  const newX = Math.max(0, p.origX + dx);
                  const newY = Math.max(0, p.origY + dy);
                  if(p.card) {
                      p.card.style.left = newX + 'px';
                      p.card.style.top = newY + 'px';
                  }
                  if(!isReorderMode) {
                      p.scene.beatboardX = newX;
                      p.scene.beatboardY = newY;
                  }
              });
              
              if(isReorderMode) {
                  const dz = BeatBoard.getDropIndex(ev.clientX, ev.clientY);
                  BeatBoard._reorderInsertIndex = (dz && dz.type === 'insert') ? dz.index : null;
              }
              BeatBoard.drawLine();
              BeatBoard.drawTagLines();
              BeatBoard.updateMinimap();
              
              if(isReorderMode) {
                  BeatBoard.highlightDropZone(ev.clientX, ev.clientY);
              }
          };
          
          const onUp = (ev) => {
              // Retirer la classe dragging de toutes les cartes
              BeatBoard.draggedCard.originalPositions.forEach(p => {
                  if(p.card) {
                      p.card.classList.remove('dragging');
                      p.card.style.zIndex = '';
                      p.card.style.boxShadow = '';
                      p.card.style.border = '';
                  }
              });
              
              if(isReorderMode) {
                  const dropResult = BeatBoard.getDropIndex(ev.clientX, ev.clientY);
                  BeatBoard.hideDropZones();
                  
                  // Remettre toutes les fiches à leur position d'origine en mode reorder
                  BeatBoard.draggedCard.originalPositions.forEach(p => {
                      p.scene.beatboardX = p.origX;
                      p.scene.beatboardY = p.origY;
                  });
                  
                  if(dropResult.type === 'remove') {
                      BeatBoard.removeFromTimeline(scene);
                  } else if(dropResult.type === 'insert') {
                      const dropIndex = dropResult.index;
                      if(!isCurrentlyInTimeline || (dropIndex !== sceneIndex && dropIndex !== sceneIndex + 1)) {
                          BeatBoard.reorderScene(sceneIndex, dropIndex, scene);
                      } else {
                          BeatBoard.render();
                      }
                  } else {
                      BeatBoard.render();
                  }
              } else {
                  // Appliquer les nouvelles positions à toutes les cartes
                  BeatBoard.draggedCard.originalPositions.forEach(p => {
                      if(p.card) {
                          p.scene.beatboardX = parseFloat(p.card.style.left);
                          p.scene.beatboardY = parseFloat(p.card.style.top);
                      }
                  });
                  // Réordonner uniquement si Shift est maintenu au moment du lâcher
                  if(ev.shiftKey) {
                      BeatBoard.checkReorder();
                  }
              }
              
              BeatBoard.draggedCard = null;
              BeatBoard._reorderInsertIndex = null;
              document.removeEventListener('mousemove', onMove);
              document.removeEventListener('mouseup', onUp);
              Store.save();
              BeatBoard.drawLine();
              BeatBoard.drawTagLines();
          };
          
          document.addEventListener('mousemove', onMove);
          document.addEventListener('mouseup', onUp);
      },
      
      showDropZones: () => {
          const canvas = document.getElementById('beatboardCanvas');
          if(!canvas) return;
          
          // Supprimer les anciennes zones
          canvas.querySelectorAll('.beatboard-dropzone').forEach(z => z.remove());
          
          // Ne considérer que les scènes in timeline
          const inTimelineScenes = state.data.scenes.filter(s => s.inTimeline !== false);
          const draggedScene = BeatBoard.draggedCard?.scene;
          const draggedIndex = BeatBoard.draggedCard?.sceneIndex;
          const isCurrentlyInTimeline = draggedScene?.inTimeline !== false;
          
          // Créer une zone avant la première carte (si on n'est pas la première)
          if(inTimelineScenes.length > 0 && draggedIndex !== 0) {
              const firstScene = inTimelineScenes[0];
              const zone = BeatBoard.createDropZone(0, firstScene.beatboardX - 50, firstScene.beatboardY);
              canvas.appendChild(zone);
          }
          
          // Si aucune scène in timeline, créer une zone de départ
          if(inTimelineScenes.length === 0) {
              const zone = BeatBoard.createDropZone(0, 100, 100);
              canvas.appendChild(zone);
          }
          
          // Créer une zone après chaque carte in timeline
          inTimelineScenes.forEach((scene, idx) => {
              // Ne pas créer de zone autour de la carte qu'on déplace
              if(isCurrentlyInTimeline && (idx === draggedIndex || idx === draggedIndex - 1)) return;
              
              const nextScene = inTimelineScenes[idx + 1];
              let zoneX, zoneY;
              
              if(nextScene) {
                  zoneX = (scene.beatboardX + nextScene.beatboardX + 180) / 2 - 20;
                  zoneY = (scene.beatboardY + nextScene.beatboardY) / 2;
              } else {
                  zoneX = scene.beatboardX + 200;
                  zoneY = scene.beatboardY;
              }
              
              const zone = BeatBoard.createDropZone(idx + 1, zoneX, zoneY);
              canvas.appendChild(zone);
          });
          
          // Ajouter une zone "Retirer du fil rouge" si la scène est in timeline
          if(isCurrentlyInTimeline) {
              const removeZone = document.createElement('div');
              removeZone.className = 'beatboard-dropzone beatboard-dropzone-remove';
              removeZone.dataset.action = 'remove-from-timeline';
              removeZone.style.cssText = `
                  position: absolute;
                  left: 20px;
                  top: 700px;
                  width: 200px;
                  height: 80px;
                  background: rgba(150, 150, 150, 0.3);
                  border: 3px dashed #999;
                  border-radius: 10px;
                  z-index: 500;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  font-size: 0.85rem;
                  color: var(--text-sec);
                  transition: all 0.2s;
              `;
              removeZone.innerHTML = '📌 Retirer du fil rouge';
              canvas.appendChild(removeZone);
          }
      },
      
      createDropZone: (insertIndex, x, y) => {
          const zone = document.createElement('div');
          zone.className = 'beatboard-dropzone';
          zone.dataset.insertIndex = insertIndex;
          // Zone de DETECTION invisible : l'indicateur visible est la COUPURE du fil rouge.
          zone.style.cssText = `
              position: absolute;
              left: ${x}px;
              top: ${y}px;
              width: 60px;
              height: 120px;
              background: transparent;
              border: none;
              z-index: 500;
          `;
          return zone;
      },
      
      highlightDropZone: (clientX, clientY) => {
          const container = document.getElementById('beatboardContainer');
          const rect = container.getBoundingClientRect();
          const x = (clientX - rect.left - BeatBoard.panX) / BeatBoard.zoom;
          const y = (clientY - rect.top - BeatBoard.panY) / BeatBoard.zoom;
          
          document.querySelectorAll('.beatboard-dropzone').forEach(zone => {
              const isRemoveZone = zone.dataset.action === 'remove-from-timeline';
              if(!isRemoveZone) return; // zones d'insertion invisibles : seul le fil coupe indique
              const zoneX = parseFloat(zone.style.left);
              const zoneY = parseFloat(zone.style.top);
              const zoneW = parseFloat(zone.style.width) || 40;
              const zoneH = parseFloat(zone.style.height) || 100;
              const dist = Math.sqrt(Math.pow(x - zoneX - zoneW/2, 2) + Math.pow(y - zoneY - zoneH/2, 2));
              if(dist < 100) {
                  zone.style.background = 'rgba(150, 150, 150, 0.6)';
                  zone.style.borderColor = '#666';
                  zone.style.transform = 'scale(1.1)';
                  zone.style.borderStyle = 'solid';
              } else {
                  zone.style.background = 'rgba(150, 150, 150, 0.3)';
                  zone.style.borderColor = '#999';
                  zone.style.transform = 'scale(1)';
                  zone.style.borderStyle = 'dashed';
              }
          });
      },
      
      getDropIndex: (clientX, clientY) => {
          const container = document.getElementById('beatboardContainer');
          const rect = container.getBoundingClientRect();
          const x = (clientX - rect.left - BeatBoard.panX) / BeatBoard.zoom;
          const y = (clientY - rect.top - BeatBoard.panY) / BeatBoard.zoom;
          
          let closestZone = null;
          let closestDist = Infinity;
          
          document.querySelectorAll('.beatboard-dropzone').forEach(zone => {
              const zoneX = parseFloat(zone.style.left);
              const zoneY = parseFloat(zone.style.top);
              const zoneW = parseFloat(zone.style.width) || 40;
              const zoneH = parseFloat(zone.style.height) || 100;
              const dist = Math.sqrt(Math.pow(x - zoneX - zoneW/2, 2) + Math.pow(y - zoneY - zoneH/2, 2));
              
              if(dist < 120 && dist < closestDist) {
                  closestDist = dist;
                  closestZone = zone;
              }
          });
          
          if(!closestZone) return { type: null };
          
          if(closestZone.dataset.action === 'remove-from-timeline') {
              return { type: 'remove' };
          }
          
          return { type: 'insert', index: parseInt(closestZone.dataset.insertIndex) };
      },
      
      hideDropZones: () => {
          document.querySelectorAll('.beatboard-dropzone').forEach(z => z.remove());
      },
      
      reorderScene: (fromIndex, toIndex, scene) => {
          // Cran d'annulation pose AVANT toute modification, comme au séquencier.
          Actions.pushOrderSnapshot();
          // Récupérer les scènes in timeline
          const inTimelineScenes = state.data.scenes.filter(s => s.inTimeline !== false);
          const wasInTimeline = scene.inTimeline !== false;
          
          if(wasInTimeline && fromIndex !== -1) {
              // Retirer de sa position actuelle dans le tableau global
              // On doit trouver l'index global de cette scène
              const globalIndex = state.data.scenes.findIndex(s => s.id === scene.id);
              if(globalIndex !== -1) {
                  state.data.scenes.splice(globalIndex, 1);
              }
          }
          
          // Marquer comme in timeline
          scene.inTimeline = true;
          
          // Trouver où insérer dans le tableau global
          // On veut insérer après la scène qui est à toIndex-1 dans inTimeline
          if(toIndex === 0) {
              // Insérer au tout début
              state.data.scenes.unshift(scene);
          } else {
              const sceneBeforeInTimeline = inTimelineScenes[toIndex - 1];
              if(sceneBeforeInTimeline) {
                  const globalIndexBefore = state.data.scenes.findIndex(s => s.id === sceneBeforeInTimeline.id);
                  state.data.scenes.splice(globalIndexBefore + 1, 0, scene);
              } else {
                  state.data.scenes.push(scene);
              }
          }
          
          BeatBoard.render();
          Utils.toast(`Scène insérée en position ${toIndex + 1}`, 'success');
          UI.renderBoard();
          UI.updateSceneOrderButtons();
      },
      
      removeFromTimeline: (scene) => {
          Actions.pushOrderSnapshot();
          scene.inTimeline = false;
          // Déplacer visuellement vers la zone hors timeline
          scene.beatboardY = 800 + Math.random() * 50;
          Store.save();
          BeatBoard.render();
          UI.renderBoard();
          UI.updateSceneOrderButtons();
          Utils.toast('Scène retirée du fil rouge', 'info');
      },
      
      checkReorder: () => {
          // Réordonner les scènes selon leur position X puis Y
          const cards = Array.from(document.querySelectorAll('.beatboard-card'));
          if(cards.length === 0) return;
          
          const sorted = cards.map(c => ({
              id: c.dataset.id,
              x: parseFloat(c.style.left) || 0,
              y: parseFloat(c.style.top) || 0
          })).sort((a, b) => {
              const rowA = Math.floor(a.y / 140);
              const rowB = Math.floor(b.y / 140);
              if(rowA !== rowB) return rowA - rowB;
              return a.x - b.x;
          });
          
          const newOrder = sorted.map(s => s.id);
          const currentOrder = state.data.scenes.map(s => s.id);
          
          // Vérifier si l'ordre a changé
          if(JSON.stringify(newOrder) !== JSON.stringify(currentOrder)) {
              // Créer le nouveau tableau en s'assurant que toutes les scènes existent
              const reorderedScenes = [];
              for(const id of newOrder) {
                  const scene = state.data.scenes.find(s => s.id === id);
                  if(scene) reorderedScenes.push(scene);
              }
              
              // Ne mettre à jour que si on a toutes les scènes
              if(reorderedScenes.length === state.data.scenes.length) {
                  // Cran pose ici et pas plus haut : l'ordre peut avoir ete
                  // recalcule sans changer, et un cran vide ferait cliquer
                  // « annuler » pour rien.
                  Actions.pushOrderSnapshot();
                  state.data.scenes = reorderedScenes;
                  Utils.toast('Ordre mis à jour', 'success');
                  BeatBoard.render();
                  UI.renderBoard();
                  UI.updateSceneOrderButtons();
              }
          }
      },
      
      // ===================== LIGNES (connexions visuelles) =====================
      drawLine: () => {
          const svg = document.getElementById('beatboardSvg');
          if(!svg) return;
          svg.innerHTML = '';
          if(!BeatBoard.showLine) return;
          const SVGNS = 'http://www.w3.org/2000/svg';
          const dc = BeatBoard.draggedCard;
          const reorder = !!(dc && dc.isReorderMode);

          const inTimelineScenes = state.data.scenes.filter(s => s.inTimeline !== false);

          const ptOf = (scene) => {
              const card = document.querySelector(`.beatboard-card[data-id="${scene.id}"]`);
              if(!card) return null;
              const left = parseFloat(card.style.left);
              const top = parseFloat(card.style.top);
              const h = card.offsetHeight || 100;
              return { xIn: left - 2, xOut: left + 180 + 2, y: top + h / 2 };
          };
          const drawSeg = (prev, curr) => {
              const mx = (prev.xOut + curr.xIn) / 2;
              const my = (prev.y + curr.y) / 2;
              const segPath = `M ${prev.xOut} ${prev.y} Q ${mx} ${prev.y}, ${mx} ${my} Q ${mx} ${curr.y}, ${curr.xIn} ${curr.y}`;
              const bgLine = document.createElementNS(SVGNS, 'path');
              bgLine.setAttribute('d', segPath); bgLine.setAttribute('class', 'beatboard-line-bg'); svg.appendChild(bgLine);
              const line = document.createElementNS(SVGNS, 'path');
              line.setAttribute('d', segPath); line.setAttribute('class', 'beatboard-line'); svg.appendChild(line);
          };

          if(!reorder) {
              if(inTimelineScenes.length < 2) return;
              const points = inTimelineScenes.map(ptOf).filter(p => p);
              if(points.length < 2) return;
              for(let i = 0; i < points.length - 1; i++) drawSeg(points[i], points[i + 1]);
              return;
          }

          // ---- Mode reordonnancement (Shift+glisser) : le fil reste connecte sur
          // les cartes FIXES (scene deplacee exclue) ; la section VISEE s'ouvre et se
          // re-route A TRAVERS la fiche portee (deux bouts + ronds qui se snappent
          // a la fiche). Idem pour le fil du tag de la scene (drawTagLines). ----
          const draggedId = dc.scene.id;
          const others = inTimelineScenes.filter(s => s.id !== draggedId);
          const pts = others.map(ptOf).filter(p => p);
          const Xpt = ptOf(dc.scene);
          let othersK = null;
          if(BeatBoard._reorderInsertIndex != null && Xpt) {
              const di = inTimelineScenes.findIndex(s => s.id === draggedId);
              let k = BeatBoard._reorderInsertIndex;
              othersK = (k > di) ? k - 1 : k;
              othersK = Math.max(0, Math.min(othersK, pts.length));
          }
          for(let i = 0; i < pts.length - 1; i++) {
              if(othersK != null && i === othersK - 1) continue; // section ouverte
              drawSeg(pts[i], pts[i + 1]);
          }
          if(othersK != null && Xpt) {
              const numOf = (sc) => { if(!sc) return ''; const c = document.querySelector(`.beatboard-card[data-id="${sc.id}"] .beatboard-card-number`); return c ? (c.textContent || '').trim() : ''; };
              BeatBoard._routeThroughX(svg, pts[othersK - 1] || null, pts[othersK] || null, Xpt, { red: true, aLabel: numOf(others[othersK - 1]), bLabel: numOf(others[othersK]) });
          }
      },

      // Re-route un fil A TRAVERS la fiche portee X : bouts A->X et X->B, plus des
      // ronds de la couleur du fil "snappes" sur les deux cotes de la fiche.
      _routeThroughX: (svg, A, B, X, opts) => {
          const SVGNS = 'http://www.w3.org/2000/svg';
          const red = !!opts.red;
          const color = opts.color || '#e74c3c';
          const seg = (p, q) => {
              const mx = (p.xOut + q.xIn) / 2, my = (p.y + q.y) / 2;
              const d = `M ${p.xOut} ${p.y} Q ${mx} ${p.y}, ${mx} ${my} Q ${mx} ${q.y}, ${q.xIn} ${q.y}`;
              if(red) {
                  const bg = document.createElementNS(SVGNS, 'path'); bg.setAttribute('d', d); bg.setAttribute('class', 'beatboard-line-bg'); svg.appendChild(bg);
                  const ln = document.createElementNS(SVGNS, 'path'); ln.setAttribute('d', d); ln.setAttribute('class', 'beatboard-line'); svg.appendChild(ln);
              } else {
                  const bg = document.createElementNS(SVGNS, 'path'); bg.setAttribute('d', d); bg.setAttribute('class', 'beatboard-tag-line-bg'); bg.setAttribute('stroke', color); svg.appendChild(bg);
                  const ln = document.createElementNS(SVGNS, 'path'); ln.setAttribute('d', d); ln.setAttribute('class', 'beatboard-tag-line'); ln.setAttribute('stroke', color); svg.appendChild(ln);
              }
          };
          if(A) seg(A, X);
          if(B) seg(X, B);
          [[X.xIn, A], [X.xOut, B]].forEach(([cx, neighbor]) => {
              if(!neighbor) return;
              const dot = document.createElementNS(SVGNS, 'circle');
              dot.setAttribute('cx', cx); dot.setAttribute('cy', X.y); dot.setAttribute('r', 5);
              dot.setAttribute('class', 'beatboard-insert-dot');
              dot.style.fill = color;
              svg.appendChild(dot);
          });
          // Numeros des scenes voisines, de part et d'autre de la fiche portee
          // (utile quand les cartes sont serrees et que le fil se voit mal).
          const mkNum = (txt, x, anchor) => {
              if(!txt) return;
              const t = document.createElementNS(SVGNS, 'text');
              t.setAttribute('x', x); t.setAttribute('y', X.y);
              t.setAttribute('text-anchor', anchor);
              t.setAttribute('dominant-baseline', 'middle');
              t.setAttribute('class', 'beatboard-insert-num');
              t.textContent = txt;
              svg.appendChild(t);
          };
          if(A) mkNum(opts.aLabel, X.xIn - 9, 'end');
          if(B) mkNum(opts.bLabel, X.xOut + 9, 'start');
      },
      
      toggleLine: () => {
          BeatBoard.showLine = document.getElementById('beatboard-show-line').checked;
          BeatBoard.drawLine();
      },
      
      toggleTagLines: () => {
          BeatBoard.showTagLines = document.getElementById('beatboard-show-tag-lines').checked;
          if(BeatBoard.showTagLines) {
              // Activer toutes les lignes de tags par défaut à la première activation
              const hasAny = Object.keys(BeatBoard.activeTagLines).length > 0;
              if(!hasAny) {
                  state.data.tags.forEach(t => { BeatBoard.activeTagLines[t.id] = true; });
              }
          }
          BeatBoard.drawTagLines();
          BeatBoard.renderTagLinesList();
      },
      
      toggleSingleTagLine: (tagId) => {
          BeatBoard.activeTagLines[tagId] = !BeatBoard.activeTagLines[tagId];
          BeatBoard.drawTagLines();
          BeatBoard.renderTagLinesList();
      },
      
      // ===== LIGNES DE RECIT : UN COULOIR PAR TAG (26 aout, 2e version) =====
      // Premiere version : on n'ecartait que les segments reliant EXACTEMENT la
      // meme paire de fiches. Insuffisant — deux fils se recouvrent aussi quand
      // ils relient des fiches DIFFERENTES d'une meme rangee : les cartes y sont
      // alignees, donc tous les traits passent a la meme hauteur, celle du
      // milieu des cartes. C'est le cas visible a l'ecran.
      // Chaque tag a donc desormais son propre COULOIR : un decalage vertical
      // constant, attribue une fois pour toutes, applique a TOUS ses segments.
      // Deux tags ne peuvent plus partager une hauteur. Aucun couloir ne vaut
      // zero : la hauteur zero est celle du fil rouge, qui ne bouge pas.
      // Le decalage ne touche pas les extremites (les fils restent accroches a
      // leur connecteur) mais il tient sur toute la partie centrale du trace,
      // et non sur le seul point du milieu : c'est ce qui rend deux fils
      // parallèles lisibles sur toute leur longueur.
      drawTagLines: () => {
          const svg = document.getElementById('beatboardSvg');
          if(!svg) return;
          
          // Supprimer uniquement les lignes de tags (pas le fil rouge)
          svg.querySelectorAll('.beatboard-tag-line, .beatboard-tag-line-bg, .beatboard-tag-line-dot').forEach(el => el.remove());
          
          if(!BeatBoard.showTagLines) return;
          
          const _dcT = BeatBoard.draggedCard;
          const _draggedIdT = (_dcT && _dcT.isReorderMode) ? _dcT.scene.id : null;
          const inTimelineScenes = state.data.scenes.filter(s => s.inTimeline !== false && s.id !== _draggedIdT);
          const ptOf = (sceneId) => {
              const card = document.querySelector(`.beatboard-card[data-id="${sceneId}"]`);
              if(!card) return null;
              const left = parseFloat(card.style.left);
              const top = parseFloat(card.style.top);
              const h = card.offsetHeight || 100;
              return { xIn: left - 2, xOut: left + 180 + 2, y: top + h / 2 };
          };
          // Reordonnancement : re-router le fil du TAG de la scene portee a travers elle.
          const _XptT = _draggedIdT ? ptOf(_draggedIdT) : null;
          let _othersKT = null, _draggedTag = null;
          if(_draggedIdT && _XptT && BeatBoard._reorderInsertIndex != null) {
              const _fullT = state.data.scenes.filter(s => s.inTimeline !== false);
              const _diT = _fullT.findIndex(s => s.id === _draggedIdT);
              let _kT = BeatBoard._reorderInsertIndex;
              _othersKT = (_kT > _diT) ? _kT - 1 : _kT;
              _othersKT = Math.max(0, Math.min(_othersKT, inTimelineScenes.length));
              const _ds = _fullT.find(s => s.id === _draggedIdT);
              _draggedTag = _ds ? (_ds.tag_id || 't1') : null;
          }
          const _othersIdx = {};
          inTimelineScenes.forEach((s, i) => { _othersIdx[s.id] = i; });
          
          // --- 1er temps : recensement ---
          const segments = [];   // { tag, a, b, pa, pb, key }
          const dots = [];       // { x, y, color }
          state.data.tags.forEach(tag => {
              if(!BeatBoard.activeTagLines[tag.id]) return;
              if(tag.color === 'transparent') return;
              
              const tagScenes = inTimelineScenes.filter(s => s.tag_id === tag.id);
              if(tagScenes.length === 1) {
                  const p = ptOf(tagScenes[0].id);
                  if(p) dots.push({ x: p.xOut, y: p.y, color: tag.color });
                  return;
              }
              if(tagScenes.length < 2) return;
              
              const pts = tagScenes.map(sc => ({ id: sc.id, p: ptOf(sc.id) })).filter(x => x.p);
              if(pts.length < 2) return;
              for(let i = 0; i < pts.length - 1; i++) {
                  const a = pts[i], b = pts[i + 1];
                  segments.push({ tag, pa: a.p, pb: b.p, aId: a.id, bId: b.id });
              }
              pts.forEach((x, idx) => dots.push({ x: idx === 0 ? x.p.xOut : x.p.xIn, y: x.p.y, color: tag.color }));
          });
          
          // --- 2e temps : attribution d'un couloir a chaque tag ---
          // Couloirs alternes de part et d'autre du fil rouge : -PAS, +PAS,
          // -2 PAS, +2 PAS... Aucun ne vaut zero, sinon le premier tag se
          // superposerait au fil rouge, qui lui passe par le milieu des cartes.
          const PAS = 11;
          const couloirs = {};
          let rang = 0;
          segments.forEach(sg => {
              const k = String(sg.tag.id);
              if(couloirs[k] === undefined) {
                  couloirs[k] = (Math.floor(rang / 2) + 1) * PAS * (rang % 2 === 0 ? -1 : 1);
                  rang++;
              }
          });
          segments.forEach(sg => { sg.offset = couloirs[String(sg.tag.id)] || 0; });
          
          segments.forEach(sg => {
              // Section VISEE du fil du tag de la scene portee : elle s'ouvre et se
              // re-route a travers la fiche (comme le fil rouge).
              if(_XptT && _othersKT != null && _draggedTag != null && String(sg.tag.id) === String(_draggedTag)) {
                  const ai = _othersIdx[sg.aId], bi = _othersIdx[sg.bId];
                  if(ai != null && bi != null && ai < _othersKT && bi >= _othersKT) {
                      BeatBoard._routeThroughX(svg, sg.pa, sg.pb, _XptT, { color: sg.tag.color });
                      return;
                  }
              }
              const x0 = sg.pa.xOut, y0 = sg.pa.y, x1 = sg.pb.xIn, y1 = sg.pb.y;
              const my = (y0 + y1) / 2 + (sg.offset || 0);
              const dx = x1 - x0;
              let segPath;
              if(Math.abs(dx) < 70) {
                  // Cartes presque l'une au-dessus de l'autre : pas de place pour
                  // un plateau, on garde la courbe d'origine, decalee en son milieu.
                  const mx = (x0 + x1) / 2;
                  segPath = `M ${x0} ${y0} Q ${mx} ${y0}, ${mx} ${my} Q ${mx} ${y1}, ${x1} ${y1}`;
              } else {
                  // On quitte le connecteur a sa hauteur, on rejoint le couloir,
                  // on y reste sur la moitie centrale, puis on redescend sur le
                  // connecteur d'arrivee. Les proportions sont relatives a dx,
                  // donc valables aussi quand le fil repart vers la gauche.
                  const ax = x0 + dx * 0.30, bx = x0 + dx * 0.70, c = dx * 0.12;
                  segPath = `M ${x0} ${y0} C ${x0 + c} ${y0}, ${ax - c} ${my}, ${ax} ${my}`
                          + ` L ${bx} ${my} C ${bx + c} ${my}, ${x1 - c} ${y1}, ${x1} ${y1}`;
              }
              
              const bgLine = document.createElementNS('http://www.w3.org/2000/svg', 'path');
              bgLine.setAttribute('d', segPath);
              bgLine.setAttribute('class', 'beatboard-tag-line-bg');
              bgLine.setAttribute('stroke', sg.tag.color);
              svg.appendChild(bgLine);
              
              const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
              line.setAttribute('d', segPath);
              line.setAttribute('class', 'beatboard-tag-line');
              line.setAttribute('stroke', sg.tag.color);
              if(sg.tag.name) {
                  const t = document.createElementNS('http://www.w3.org/2000/svg', 'title');
                  t.textContent = sg.tag.name;
                  line.appendChild(t);
              }
              svg.appendChild(line);
          });
          
          // Les points restent sur les connecteurs, jamais decales : ils marquent
          // l'attache du fil a la carte.
          dots.forEach(d => {
              const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
              dot.setAttribute('cx', d.x);
              dot.setAttribute('cy', d.y);
              dot.setAttribute('r', 4);
              dot.setAttribute('fill', d.color);
              dot.setAttribute('class', 'beatboard-tag-line-dot');
              svg.appendChild(dot);
          });
      },
      
      renderTagLinesList: () => {
          const inTimelineScenes = state.data.scenes.filter(s => s.inTimeline !== false);
          
          // Compteur du fil rouge : il vit dans le meme bloc que les lignes de
          // suivi, il se rafraichit donc ici.
          const lineCount = document.getElementById('beatboard-line-count');
          if(lineCount) lineCount.textContent = inTimelineScenes.length + ' scène' + (inTimelineScenes.length > 1 ? 's' : '');
          
          const container = document.getElementById('beatboard-tag-lines-list');
          if(!container) return;
          
          if(!BeatBoard.showTagLines) {
              container.innerHTML = '';
              return;
          }
          
          container.innerHTML = state.data.tags
              .filter(t => t.color !== 'transparent')
              .map(t => {
                  const count = inTimelineScenes.filter(s => s.tag_id === t.id).length;
                  const isActive = BeatBoard.activeTagLines[t.id] !== false;
                  return `
                      <div class="bb-thread${isActive ? '' : ' is-off'}" onclick="app.BeatBoard.toggleSingleTagLine('${t.id}')">
                          <input type="checkbox" ${isActive ? 'checked' : ''} onclick="event.stopPropagation(); app.BeatBoard.toggleSingleTagLine('${t.id}')">
                          <span class="bb-thread-swatch" style="background: ${t.color}"></span>
                          <span class="bb-thread-name">${Utils.escape(t.name)}</span>
                          <span class="bb-thread-count">${count} scène${count > 1 ? 's' : ''}</span>
                      </div>
                  `;
              }).join('');
      },
      
      // ===================== LAYOUT & EXPORT =====================
      autoLayout: (type) => {
          const scenes = state.data.scenes;
          const cardW = 200, cardH = 140, gap = 30;
          
          if(type === 'horizontal') {
              scenes.forEach((s, i) => {
                  s.beatboardX = 50 + i * (cardW + gap);
                  s.beatboardY = 100;
              });
          } else if(type === 'grid') {
              const cols = Math.ceil(Math.sqrt(scenes.length));
              scenes.forEach((s, i) => {
                  s.beatboardX = 50 + (i % cols) * (cardW + gap);
                  s.beatboardY = 50 + Math.floor(i / cols) * (cardH + gap);
              });
          } else if(type === 'byTag') {
              const tagGroups = {};
              scenes.forEach(s => {
                  const tid = s.tag_id || 't1';
                  if(!tagGroups[tid]) tagGroups[tid] = [];
                  tagGroups[tid].push(s);
              });
              let row = 0;
              Object.keys(tagGroups).forEach(tid => {
                  tagGroups[tid].forEach((s, i) => {
                      s.beatboardX = 50 + i * (cardW + gap);
                      s.beatboardY = 50 + row * (cardH + gap + 50);
                  });
                  row++;
              });
          }
          
          Store.save();
          BeatBoard.render();
          Utils.toast('Disposition appliquée', 'success');
      },
      
      renderTagList: () => {
          const container = document.getElementById('beatboard-tag-list');
          if(!container) return;
          
          const usedTags = [...new Set(state.data.scenes.map(s => s.tag_id || 't1'))];
          container.innerHTML = state.data.tags
              .filter(t => usedTags.includes(t.id))
              .map(t => `
                  <div class="beatboard-group-label">
                      <span class="beatboard-group-dot" style="background: ${t.color !== 'transparent' ? t.color : 'var(--text-sec)'}"></span>
                      ${Utils.escape(t.name)} (${state.data.scenes.filter(s => (s.tag_id || 't1') === t.id).length})
                  </div>
              `).join('');
      },
      
      // ===================== PAN & ZOOM (navigation canvas) =====================
      initPan: () => {
          const container = document.getElementById('beatboardContainer');
          const canvas = document.getElementById('beatboardCanvas');
          if(!container || !canvas) return;
          
          // Le clic droit sert désormais à déplacer la vue : on bloque le menu
          // contextuel du navigateur qui apparaîtrait sinon au relâchement.
          container.oncontextmenu = (e) => e.preventDefault();
          
          container.onmousedown = (e) => {
              if(e.target.closest('.beatboard-card')) return;
              
              if(e.button === 2) {
                  // Clic droit = déplacement (comportement historique du clic gauche).
                  BeatBoard.isPanning = true;
                  BeatBoard.panStartX = e.clientX - BeatBoard.panX;
                  BeatBoard.panStartY = e.clientY - BeatBoard.panY;
                  canvas.classList.add('dragging');
                  return;
              }
              if(e.button !== 0) return;
              
              // Clic gauche = rectangle de sélection.
              BeatBoard.clearSelection();
              BeatBoard.isSelecting = true;
              const rect = container.getBoundingClientRect();
              BeatBoard.selStartX = e.clientX - rect.left;
              BeatBoard.selStartY = e.clientY - rect.top;
              let box = document.getElementById('beatboardSelectionBox');
              if(!box) {
                  box = document.createElement('div');
                  box.id = 'beatboardSelectionBox';
                  box.className = 'beatboard-selection-box';
                  container.appendChild(box);
              }
              box.style.left = BeatBoard.selStartX + 'px';
              box.style.top = BeatBoard.selStartY + 'px';
              box.style.width = '0px';
              box.style.height = '0px';
              box.style.display = 'block';
          };
          
          container.onmousemove = (e) => {
              if(BeatBoard.isPanning) {
                  BeatBoard.panX = e.clientX - BeatBoard.panStartX;
                  BeatBoard.panY = e.clientY - BeatBoard.panStartY;
                  BeatBoard.applyTransform();
                  return;
              }
              if(BeatBoard.isSelecting) {
                  const rect = container.getBoundingClientRect();
                  const curX = e.clientX - rect.left;
                  const curY = e.clientY - rect.top;
                  const box = document.getElementById('beatboardSelectionBox');
                  if(box) {
                      const x = Math.min(curX, BeatBoard.selStartX);
                      const y = Math.min(curY, BeatBoard.selStartY);
                      const w = Math.abs(curX - BeatBoard.selStartX);
                      const h = Math.abs(curY - BeatBoard.selStartY);
                      box.style.left = x + 'px';
                      box.style.top = y + 'px';
                      box.style.width = w + 'px';
                      box.style.height = h + 'px';
                      BeatBoard._applySelectionBox(x, y, w, h);
                  }
              }
          };
          
          const endSelection = () => {
              const box = document.getElementById('beatboardSelectionBox');
              if(box) box.style.display = 'none';
              BeatBoard.isSelecting = false;
          };
          
          container.onmouseup = () => {
              BeatBoard.isPanning = false;
              canvas.classList.remove('dragging');
              if(BeatBoard.isSelecting) endSelection();
          };
          
          container.onmouseleave = () => {
              BeatBoard.isPanning = false;
              canvas.classList.remove('dragging');
              if(BeatBoard.isSelecting) endSelection();
          };
          
          container.onwheel = (e) => {
              e.preventDefault();
              const delta = e.deltaY > 0 ? -0.1 : 0.1;
              BeatBoard.zoom = Math.max(0.3, Math.min(2, BeatBoard.zoom + delta));
              BeatBoard.applyTransform();
              document.getElementById('beatboardZoomLevel').textContent = Math.round(BeatBoard.zoom * 100) + '%';
          };
      },
      
      // Sélectionne toutes les fiches qui touchent le rectangle en cours de
      // tracé. Comparaison en coordonnées écran (getBoundingClientRect) : ça
      // marche telles quelles quel que soit le zoom/déplacement de la vue.
      _applySelectionBox: (x, y, w, h) => {
          const container = document.getElementById('beatboardContainer');
          if(!container) return;
          const cRect = container.getBoundingClientRect();
          const boxLeft = cRect.left + x, boxTop = cRect.top + y;
          const boxRight = boxLeft + w, boxBottom = boxTop + h;
          const selected = [];
          document.querySelectorAll('.beatboard-card').forEach(card => {
              const r = card.getBoundingClientRect();
              const intersects = r.left < boxRight && r.right > boxLeft && r.top < boxBottom && r.bottom > boxTop;
              card.classList.toggle('selected', intersects);
              if(intersects) selected.push(card.dataset.id);
          });
          BeatBoard.selectedCards = selected;
      },
      
      applyTransform: () => {
          const canvas = document.getElementById('beatboardCanvas');
          if(canvas) {
              canvas.style.transform = `translate(${BeatBoard.panX}px, ${BeatBoard.panY}px) scale(${BeatBoard.zoom})`;
          }
          BeatBoard.updateMinimap();
      },
      
      zoomIn: () => {
          BeatBoard.zoom = Math.min(2, BeatBoard.zoom + 0.1);
          BeatBoard.applyTransform();
          document.getElementById('beatboardZoomLevel').textContent = Math.round(BeatBoard.zoom * 100) + '%';
      },
      
      zoomOut: () => {
          BeatBoard.zoom = Math.max(0.3, BeatBoard.zoom - 0.1);
          BeatBoard.applyTransform();
          document.getElementById('beatboardZoomLevel').textContent = Math.round(BeatBoard.zoom * 100) + '%';
      },
      
      zoomReset: () => {
          BeatBoard.zoom = 1;
          BeatBoard.panX = 0;
          BeatBoard.panY = 0;
          BeatBoard.applyTransform();
          document.getElementById('beatboardZoomLevel').textContent = '100%';
      },
      
      fitToView: () => {
          const container = document.getElementById('beatboardContainer');
          if(!container || state.data.scenes.length === 0) return;
          
          const bounds = state.data.scenes.reduce((acc, s) => ({
              minX: Math.min(acc.minX, s.beatboardX || 0),
              maxX: Math.max(acc.maxX, (s.beatboardX || 0) + 180),
              minY: Math.min(acc.minY, s.beatboardY || 0),
              maxY: Math.max(acc.maxY, (s.beatboardY || 0) + 100)
          }), { minX: Infinity, maxX: 0, minY: Infinity, maxY: 0 });
          
          const contentW = bounds.maxX - bounds.minX + 100;
          const contentH = bounds.maxY - bounds.minY + 100;
          const containerW = container.clientWidth;
          const containerH = container.clientHeight;
          
          BeatBoard.zoom = Math.min(containerW / contentW, containerH / contentH, 1);
          BeatBoard.panX = -bounds.minX * BeatBoard.zoom + 20;
          BeatBoard.panY = -bounds.minY * BeatBoard.zoom + 20;
          BeatBoard.applyTransform();
          document.getElementById('beatboardZoomLevel').textContent = Math.round(BeatBoard.zoom * 100) + '%';
      },
      
      updateMinimap: () => {
          const minimap = document.getElementById('beatboardMinimap');
          const viewport = document.getElementById('beatboardMinimapViewport');
          const container = document.getElementById('beatboardContainer');
          if(!minimap || !viewport || !container) return;
          
          const scale = 0.05;
          const containerW = container.clientWidth;
          const containerH = container.clientHeight;
          
          viewport.style.width = (containerW * scale / BeatBoard.zoom) + 'px';
          viewport.style.height = (containerH * scale / BeatBoard.zoom) + 'px';
          viewport.style.left = (-BeatBoard.panX * scale / BeatBoard.zoom) + 'px';
          viewport.style.top = (-BeatBoard.panY * scale / BeatBoard.zoom) + 'px';
      },
      
      // [Lot 2] Sélecteur de saisons pour l'export PDF du séquencier (séries)
      _chooseSequencerSeasons: (onConfirm) => {
          const seasons = (state.data.seasons || []).slice().sort((a,b) => (a.number||0) - (b.number||0));
          const episodes = state.data.episodes || [];
          if(seasons.length === 0) { onConfirm(null); return; }
          const currentEp = episodes.find(e => e.id === state.currentEpisodeId);
          const currentSeasonId = currentEp ? currentEp.seasonId : null;
          const items = seasons.map(s => {
              const sNum = String(s.number).padStart(2, '0');
              const epCount = episodes.filter(e => e.seasonId === s.id).length;
              const checked = s.id === currentSeasonId ? 'checked' : '';
              const sTitle = s.title ? ' — ' + Utils.escape(s.title) : '';
              return `<tr style="cursor:pointer;" onclick="this.querySelector('input').click()"><td style="width:24px;padding:6px;"><input type="checkbox" class="seqexpchk" value="${s.id}" ${checked} onclick="event.stopPropagation()"></td><td style="padding:6px;">Saison ${sNum}${sTitle} <span style="color:var(--text-sec);font-size:0.8rem;">(${epCount} ép.)</span></td></tr>`;
          }).join('');
          const overlay = document.createElement('div');
          overlay.className = 'confirm-modal-overlay';
          overlay.innerHTML = `<div class="confirm-modal-box" style="max-width:420px;padding:20px;">
              <div style="font-size:1.05rem;font-weight:bold;margin-bottom:12px;">📄 Export PDF du séquencier</div>
              <div style="text-align:left;font-size:0.85rem;color:var(--text-sec);margin-bottom:8px;">Saisons à inclure :</div>
              <div style="max-height:200px;overflow-y:auto;border:1px solid var(--border);border-radius:6px;margin-bottom:10px;"><table style="width:100%;border-collapse:collapse;">${items}</table></div>
              <div style="display:flex;gap:6px;margin-bottom:14px;">
                  <button type="button" id="seqexp-all" style="flex:1;padding:5px;font-size:0.78rem;border:1px solid var(--border);border-radius:5px;background:transparent;cursor:pointer;">Tout</button>
                  <button type="button" id="seqexp-none" style="flex:1;padding:5px;font-size:0.78rem;border:1px solid var(--border);border-radius:5px;background:transparent;cursor:pointer;">Aucun</button>
              </div>
              <div style="display:flex;gap:8px;justify-content:flex-end;">
                  <button class="confirm-modal-btn cancel" id="seqexp-cancel" style="margin:0;">Annuler</button>
                  <button class="confirm-modal-btn confirm" id="seqexp-ok" style="margin:0;">Exporter</button>
              </div>
          </div>`;
          document.body.appendChild(overlay);
          overlay.querySelector('#seqexp-all').onclick = () => overlay.querySelectorAll('.seqexpchk').forEach(cb => cb.checked = true);
          overlay.querySelector('#seqexp-none').onclick = () => overlay.querySelectorAll('.seqexpchk').forEach(cb => cb.checked = false);
          overlay.querySelector('#seqexp-cancel').onclick = () => overlay.remove();
          overlay.onclick = (e) => { if(e.target === overlay) overlay.remove(); };
          overlay.querySelector('#seqexp-ok').onclick = () => {
              const seasonIds = Array.from(overlay.querySelectorAll('.seqexpchk:checked')).map(cb => cb.value);
              if(seasonIds.length === 0) { Utils.toast('Aucune saison sélectionnée', 'warning'); return; }
              const epIds = episodes.filter(e => seasonIds.includes(e.seasonId)).map(e => e.id);
              overlay.remove();
              onConfirm(epIds);
          };
      },
      
      // [Phase C.5.4] Export PDF du Séquencier (PAS le BeatBoard)
      exportSequencerPDF: async (opts = {}) => {
          await LazyLib.load('pdfexport'); const { jsPDF } = window.jspdf;
          const doc = new jsPDF('p', 'mm', 'a4');
          const pageWidth = doc.internal.pageSize.getWidth();
          const pageHeight = doc.internal.pageSize.getHeight();
          const margin = 15;
          
          let scenes = state.data.scenes || [];
          let episodes = state.data.episodes || [];
          let seasons = state.data.seasons || [];
          
          // [Lot 2] Choix des saisons/épisodes (séries, export interactif uniquement)
          if(state.currentProjectType === 'series' && opts.episodeIds === undefined && !opts.returnBlob && seasons.length > 0 && scenes.length > 0) {
              BeatBoard._chooseSequencerSeasons((epIds) => {
                  BeatBoard.exportSequencerPDF({ ...opts, episodeIds: epIds || [] });
              });
              return;
          }
          if(Array.isArray(opts.episodeIds)) {
              const _epSet = new Set(opts.episodeIds);
              episodes = episodes.filter(e => _epSet.has(e.id));
              const _keepSea = new Set(episodes.map(e => e.seasonId));
              seasons = seasons.filter(s => _keepSea.has(s.id));
              scenes = scenes.filter(s => _epSet.has(s.episodeId));
          }
          
          if(scenes.length === 0) {
              Utils.toast('Aucune scène à exporter', 'warning');
              return;
          }
          
          // Page de garde (optionnelle)
          let y;
          if(opts.includeCover !== false) {
              PdfTheme.coverPage(doc, { sectionName: 'Séquencier' });
              doc.addPage();
          }
          y = margin;
          
          // Stats
          doc.setFontSize(10);
          doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
          doc.setFont('helvetica', 'normal');
          let statLine = `${scenes.length} scène(s)`;
          if(episodes.length > 0) statLine += ` · ${episodes.length} épisode(s)`;
          if(seasons.length > 0) statLine += ` · ${seasons.length} saison(s)`;
          doc.text(statLine, pageWidth / 2, y + 4, { align: 'center' });
          y += 14;
          
          // Helper : afficher une scène (1 ligne par scène, compacte)
          const renderScene = (scene, sceneIdx) => {
              if(y > pageHeight - 24) { doc.addPage(); y = margin; }
              
              // Numéro (formaté) + titre
              const sceneNumber = UI.formatSceneNumber(scene, sceneIdx);
              doc.setFont('helvetica', 'bold');
              doc.setFontSize(9);
              doc.setTextColor(...PdfTheme.COLORS.BANNER_BLUE);
              doc.text(sceneNumber, margin, y);
              const _numW = Math.max(10, doc.getTextWidth(sceneNumber) + 3);
              
              const titleStr = PdfTheme.cleanText(scene.title || 'Sans titre').substring(0, 58);
              doc.setTextColor(...PdfTheme.COLORS.TEXT_DARK);
              doc.text(titleStr, margin + _numW, y);
              
              // Durée + statut à droite
              doc.setFont('helvetica', 'normal');
              doc.setFontSize(8);
              let _rightX = pageWidth - margin;
              if(scene.time) {
                  doc.setTextColor(...PdfTheme.COLORS.TEXT_LIGHT);
                  const _dur = PdfTheme.cleanText(`${scene.time} min`);
                  doc.text(_dur, _rightX, y, { align: 'right' });
                  _rightX -= (doc.getTextWidth(_dur) + 4);
              }
              const _isFinal = scene.isFinal === true;
              doc.setTextColor(...(_isFinal ? PdfTheme.COLORS.SUCCESS : PdfTheme.COLORS.TEXT_MUTED));
              doc.text(_isFinal ? 'FINALE' : 'BROUILLON', _rightX, y, { align: 'right' });
              y += 5;
              // Ligne méta : tag (pastille couleur + nom) + perso
              const _tag = (state.data.tags || []).find(t => t.id === scene.tag_id);
              const _perso = scene.perso ? PdfTheme.cleanText(scene.perso).substring(0, 70) : '';
              if((_tag && _tag.name) || _perso) {
                  let _mx = margin + _numW;
                  doc.setFontSize(8);
                  if(_tag && _tag.name) {
                      const _rgb = (_tag.color && _tag.color !== 'transparent' && typeof ColorWheel !== 'undefined' && ColorWheel.hexToRgb) ? ColorWheel.hexToRgb(_tag.color) : null;
                      if(_rgb) { doc.setFillColor(_rgb.r, _rgb.g, _rgb.b); doc.circle(_mx + 1, y - 1, 1.2, 'F'); _mx += 5; }
                      doc.setFont('helvetica', 'normal');
                      doc.setTextColor(...PdfTheme.COLORS.TEXT_MUTED);
                      const _tn = PdfTheme.cleanText(_tag.name);
                      doc.text(_tn, _mx, y);
                      _mx += doc.getTextWidth(_tn) + 5;
                  }
                  if(_perso) {
                      doc.setFont('helvetica', 'italic');
                      doc.setTextColor(...PdfTheme.COLORS.TEXT_MUTED);
                      doc.text(_perso, _mx, y);
                  }
                  y += 5;
              }
              
              // Résumé si présent
              if(scene.resume) {
                  doc.setFont('helvetica', 'normal');
                  doc.setFontSize(8);
                  doc.setTextColor(...PdfTheme.COLORS.TEXT_MUTED);
                  const synopLines = doc.splitTextToSize(PdfTheme.cleanText(scene.resume), pageWidth - margin * 2 - 10);
                  synopLines.slice(0, 5).forEach(line => {
                      if(y > pageHeight - 15) { doc.addPage(); y = margin; }
                      doc.text(line, margin + 10, y);
                      y += 4;
                  });
              }
              y += 3;
              // Trait fin
              doc.setDrawColor(...PdfTheme.COLORS.BORDER_LIGHT);
              doc.setLineWidth(0.2);
              doc.line(margin, y, pageWidth - margin, y);
              y += 4;
          };
          
          // Si saisons/épisodes : grouper
          if(seasons.length > 0 || episodes.length > 0) {
              seasons.forEach(season => {
                  if(y > pageHeight - 30) { doc.addPage(); y = margin; }
                  
                  // En-tête saison
                  y = PdfTheme.sectionBand(doc, { x: margin, y, width: pageWidth - margin * 2,
                                                  title: season.title || 'Saison',
                                                  accent: PdfTheme.accentFor('Séquencier') });
                  
                  // Épisodes de cette saison
                  const seasonEps = episodes.filter(e => e.seasonId === season.id);
                  seasonEps.forEach(ep => {
                      if(y > pageHeight - 20) { doc.addPage(); y = margin; }
                      doc.setTextColor(...PdfTheme.COLORS.TEXT_MUTED);
                      doc.setFontSize(9.5);
                      doc.setFont('helvetica', 'bold');
                      doc.text(PdfTheme.cleanText(ep.title || 'Épisode'), margin, y);
                      y += 6;
                      
                      // Scènes de cet épisode
                      const epScenes = scenes.filter(s => s.episodeId === ep.id);
                      epScenes.forEach((sc, i) => {
                          renderScene(sc, scenes.indexOf(sc));
                      });
                      y += 2;
                  });
              });
              
              // Épisodes sans saison
              const orphanEps = episodes.filter(e => !e.seasonId);
              orphanEps.forEach(ep => {
                  if(y > pageHeight - 20) { doc.addPage(); y = margin; }
                  doc.setFillColor(...PdfTheme.COLORS.TEXT_MUTED);
                  doc.rect(margin, y, pageWidth - margin * 2, 8, 'F');
                  doc.setTextColor(...PdfTheme.COLORS.WHITE);
                  doc.setFontSize(10);
                  doc.setFont('helvetica', 'bold');
                  doc.text(PdfTheme.cleanText(ep.title || 'Épisode'), margin + 4, y + 5.5);
                  y += 11;
                  const epScenes = scenes.filter(s => s.episodeId === ep.id);
                  epScenes.forEach(sc => renderScene(sc, scenes.indexOf(sc)));
              });
              
              // Scènes orphelines
              const orphanScenes = scenes.filter(s => !s.episodeId);
              if(orphanScenes.length > 0) {
                  if(y > pageHeight - 20) { doc.addPage(); y = margin; }
                  doc.setFillColor(...PdfTheme.COLORS.BORDER_DARK);
                  doc.rect(margin, y, pageWidth - margin * 2, 8, 'F');
                  doc.setTextColor(...PdfTheme.COLORS.WHITE);
                  doc.setFontSize(10);
                  doc.setFont('helvetica', 'bold');
                  doc.text('SCÈNES NON CLASSÉES', margin + 4, y + 5.5);
                  y += 11;
                  orphanScenes.forEach(sc => renderScene(sc, scenes.indexOf(sc)));
              }
          } else {
              // Pas de structure : liste simple
              scenes.forEach((sc, i) => renderScene(sc, i));
          }
          
          // Footers + filename
          PdfTheme.applyFooters(doc, { forDossier: !!opts.returnBlob });
          if(opts.returnBlob) return doc.output('blob');
          // Si un filtre saison(s) est actif (série), le nom le reflète — meme
          // logique que pour le Scenario, seasons est deja filtree plus haut.
          let sequencerSection = 'Séquencier';
          if(Array.isArray(opts.episodeIds) && seasons.length > 0) {
              const seasonLabels = seasons.slice().sort((a, b) => (a.number || 0) - (b.number || 0))
                  .map(s => 'S' + String(s.number || 0).padStart(2, '0'));
              sequencerSection = 'Séquencier - ' + seasonLabels.join('+');
          }
          doc.save(PdfTheme.filename(sequencerSection));
          Utils.toast('Séquencier PDF exporté !', 'success');
          History.log('EXPORT', 'Séquencier PDF généré');
      }
  };

  // ==================== MODULE LANDING ====================