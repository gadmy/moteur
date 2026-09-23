
  const ScriptEditorContinuous = {
      // handleSidebarDragStart / handleSidebarDragEnd retirées v569 :
      // orphelines en cascade depuis le retrait de leur façade ScriptEditor
      // (étape 3). reorderSceneContinuous et editSceneTitle restent vivantes.
      
      // Réordonner les scènes en vue continue
      reorderSceneContinuous: (draggedId, targetId) => {
          const scenes = state.data.scenes;
          const draggedIndex = scenes.findIndex(s => s.id === draggedId);
          const targetIndex = scenes.findIndex(s => s.id === targetId);
          
          if(draggedIndex === -1 || targetIndex === -1) return;
          
          // Retirer la scène de sa position actuelle
          const [draggedScene] = scenes.splice(draggedIndex, 1);
          
          // Calculer la nouvelle position (si on drag vers le bas, le targetIndex baisse de 1 après splice)
          const newIndex = draggedIndex < targetIndex ? targetIndex - 1 : targetIndex;
          
          // Insérer à la nouvelle position
          scenes.splice(newIndex, 0, draggedScene);
          
          // Sauvegarder et rafraîchir
          Store.save();
          History.log('REORDER', `Scène "${draggedScene.title}" déplacée`);
          
          // Notification de propagation
          Utils.notifyImpact('sequencer', ['scenario', 'breakdown'], 'réordonné');
          
          // Rafraîchir les vues
          UI.renderBoard();
          ScriptEditor.renderContinuous();
          
          // Remettre le focus sur la scène déplacée
          setTimeout(() => {
              ScriptEditor.setActiveScene(draggedId, newIndex);
              ScriptEditor.scrollToSceneInContinuous(draggedId);
          }, 100);
      },
      
      // V7.9.b — Édition inline du titre d'une scène (3 champs : INT/EXT, lieu, moment)
      editSceneTitle: (sceneId, element) => {
          const scene = state.data.scenes.find(s => s.id === sceneId);
          if(!scene) return;
          
          const currentTitle = scene.title || 'INT. LIEU - JOUR';
          
          // Parser le titre existant : "INT. LIEU - JOUR" ou "EXT. LIEU - NUIT"
          const match = currentTitle.match(/^(INT\.|EXT\.)\s*(.+?)\s*-\s*(JOUR|NUIT|AUBE|CRÉPUSCULE|MATIN|SOIR)$/i);
          let intExt = 'INT.';
          let lieu = 'LIEU';
          let moment = 'JOUR';
          
          if(match) {
              intExt = match[1].toUpperCase();
              lieu = match[2].toUpperCase();
              moment = match[3].toUpperCase();
          } else {
              // Essayer de parser autrement
              const parts = currentTitle.split(/[-–]/);
              if(parts.length >= 2) {
                  const firstPart = parts[0].trim();
                  moment = parts[parts.length - 1].trim().toUpperCase();
                  if(firstPart.toUpperCase().startsWith('INT')) {
                      intExt = 'INT.';
                      lieu = firstPart.replace(/^INT\.?\s*/i, '').toUpperCase();
                  } else if(firstPart.toUpperCase().startsWith('EXT')) {
                      intExt = 'EXT.';
                      lieu = firstPart.replace(/^EXT\.?\s*/i, '').toUpperCase();
                  } else {
                      lieu = firstPart.toUpperCase();
                  }
              }
          }
          
          // Créer le formulaire d'édition
          const form = document.createElement('div');
          form.style.cssText = 'display: flex; gap: 5px; align-items: center; flex-wrap: wrap; font-family: Arial, Helvetica, sans-serif; font-size: 0.9rem; font-weight: normal; text-transform: none;';
          form.innerHTML = `
              <select id="edit-intext" class="n8-badge-1" style="width:86px; flex:0 0 auto;">
                  <option value="INT." ${intExt === 'INT.' ? 'selected' : ''}>INT.</option>
                  <option value="EXT." ${intExt === 'EXT.' ? 'selected' : ''}>EXT.</option>
              </select>
              <input type="text" id="edit-lieu" value="${Utils.escape(lieu)}" style="flex: 1 1 140px; min-width: 120px; padding: 3px 5px; border: 1px solid var(--primary); border-radius: 3px; font-size: 0.9rem; font-weight: bold; background: var(--panel-bg); color: var(--text-main); text-transform: uppercase;" />
              <span class="fw-bold">-</span>
              <select id="edit-moment" class="n8-badge-1" style="width:122px; flex:0 0 auto;">
                  <option value="JOUR" ${moment === 'JOUR' ? 'selected' : ''}>JOUR</option>
                  <option value="NUIT" ${moment === 'NUIT' ? 'selected' : ''}>NUIT</option>
                  <option value="AUBE" ${moment === 'AUBE' ? 'selected' : ''}>AUBE</option>
                  <option value="MATIN" ${moment === 'MATIN' ? 'selected' : ''}>MATIN</option>
                  <option value="SOIR" ${moment === 'SOIR' ? 'selected' : ''}>SOIR</option>
                  <option value="CRÉPUSCULE" ${moment === 'CRÉPUSCULE' ? 'selected' : ''}>CRÉPUSCULE</option>
              </select>
              <button id="edit-save-btn" style="padding: 3px 8px; background: var(--primary); color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 0.85rem;">✓</button>
          `;
          
          const saveTitle = () => {
              const newIntExt = form.querySelector('#edit-intext').value;
              const newLieu = form.querySelector('#edit-lieu').value.trim().toUpperCase() || 'LIEU';
              const newMoment = form.querySelector('#edit-moment').value;
              const newTitle = `${newIntExt} ${newLieu} - ${newMoment}`;
              
              scene.title = newTitle;
              // v580 : le lien decor suit le titre.
              FicheLinks.resolveDecor(scene);
              element.textContent = newTitle;
              Store.save();
              
              // Mettre à jour partout
              UI.renderBoard();
              if(ScriptEditor.viewMode === 'continuous') {
                  ScriptEditor.updateContinuousSidebar(sceneId);
              }
              
              // Mettre à jour le heading dans la vue continue
              const headingSpan = document.querySelector(`.scene-title-text[data-scene-id="${sceneId}"]`);
              if(headingSpan) headingSpan.textContent = newTitle;
              // Vue Scenes : re-rendu pour que l'en-tete de la colonne d'ecriture suive aussi.
              if(ScriptEditor.viewMode === 'scenes' && UI.renderScript) UI.renderScript();
              
              Utils.toast('Titre mis à jour', 'success');
          };
          
          element.textContent = '';
          element.appendChild(form);
          
          // Events
          form.querySelector('#edit-save-btn').addEventListener('click', (e) => {
              e.stopPropagation();
              saveTitle();
          });
          
          form.querySelector('#edit-lieu').addEventListener('keydown', (e) => {
              if(e.key === 'Enter') {
                  e.preventDefault();
                  saveTitle();
              }
              if(e.key === 'Escape') {
                  element.textContent = currentTitle;
              }
          });
          
          // Focus sur le champ lieu
          setTimeout(() => {
              form.querySelector('#edit-lieu').focus();
              form.querySelector('#edit-lieu').select();
          }, 10);
      },
      
      // V7.9.c — Rendu de la vue script continu (toutes les scènes filtrées + DOM + events)
      renderContinuous: () => {
          const editor = document.getElementById('scriptContinuousEditor');
          const sidebar = document.getElementById('scriptContinuousSidebar');
          if(!editor || !sidebar) return;
          
          // v620 : les colonnes latérales sont collées (sticky) juste sous la
          // barre d'outils — dont la hauteur peut varier (elle repasse sur
          // deux lignes sur un écran étroit). Mesurée ici plutôt que fixée en
          // dur, pour que les colonnes ne passent jamais dessous.
          try {
              const bar = document.querySelector('.script-unified-bar');
              if(bar) document.documentElement.style.setProperty('--script-bar-height', bar.offsetHeight + 'px');
          } catch(e) {}
          if(!window._scriptBarHeightListenerAttached) {
              window._scriptBarHeightListenerAttached = true;
              window.addEventListener('resize', () => {
                  try {
                      const bar = document.querySelector('.script-unified-bar');
                      if(bar) document.documentElement.style.setProperty('--script-bar-height', bar.offsetHeight + 'px');
                  } catch(e) {}
              });
          }
          
          editor.innerHTML = '';
          
          // S4 : filtrer par épisode actif (séries uniquement)
          const scenesToRender = UI.getScenesForCurrentView();
          
          if(scenesToRender.length === 0) {
              const msg = (state.currentProjectType === 'series' && state.currentEpisodeId)
                  ? 'Aucune scène dans cet épisode. Créez-en une depuis le séquencier.'
                  : 'Ajoutez des scènes pour commencer.';
              editor.innerHTML = `<div style="text-align:center;padding:50px;color:var(--text-sec)">${msg}</div>`;
              sidebar.innerHTML = '';
              return;
          }
          
          const isView = state.currentRole === 'viewer' || !Permissions.canEdit('scenario');
          
          // Créer un conteneur pour chaque scène dans l'éditeur continu
          scenesToRender.forEach((scene, idx) => {
              const sceneDiv = document.createElement('div');
              sceneDiv.className = 'script-continuous-scene';
              sceneDiv.dataset.sceneId = scene.id;
              sceneDiv.dataset.sceneIndex = idx;
              
              // Heading de la scène (titre éditable). Drag-and-drop UX-2 : depuis la quick-nav uniquement.
              const heading = document.createElement('div');
              heading.className = 'script-continuous-heading';
              heading.innerHTML = `<span class="script-continuous-scene-number">${UI.formatSceneNumber(scene, idx)}</span><span class="scene-title-text" data-scene-id="${scene.id}">${Utils.escape(scene.title)}</span>`;
              
              // Clic sur le titre pour l'éditer
              const titleSpan = heading.querySelector('.scene-title-text');
              titleSpan.addEventListener('click', (e) => {
                  e.stopPropagation();
                  ScriptEditorContinuous.editSceneTitle(scene.id, titleSpan);
              });
              
              sceneDiv.appendChild(heading);
              
              // Contenu de la scène
              const content = document.createElement('div');
              content.className = 'script-continuous-content';
              content.contentEditable = !isView;
              content.spellcheck = true;
              content.lang = 'fr';
              content.innerHTML = scene.scriptContent || "<div class='sc-action'><br></div>";
              content.addEventListener('contextmenu', (e) => Breakdown.handleRightClickFromScript(e, scene.id));
              
              // Events
              if(!isView) {
                  content.addEventListener('input', () => {
                      const s = state.data.scenes.find(x => x.id === scene.id);
                      if(s) s.scriptContent = content.innerHTML;
                      ScriptEditor.checkAC(content);
                      Store.updateScene(scene.id, content.innerHTML);
                  });
                  
                  content.addEventListener('focus', () => {
                      // Ne changer la scène active que si on clique vraiment dedans
                      if(ScriptEditor.activeSceneId !== scene.id) {
                          ScriptEditor.activeSceneId = scene.id;
                          ScriptEditor.updateContinuousSidebar(scene.id, idx);
                          document.querySelectorAll('.script-continuous-scene').forEach(s => {
                              s.classList.toggle('active', s.dataset.sceneId == scene.id);
                          });
                      }
                      });
                  
                  content.addEventListener('keydown', (e) => {
                      ScriptEditor.handleKeyContinuous(e, content, scene.id);
                  });
                  
                  content.addEventListener('click', () => {
                      ScriptEditor.updateToolbarContinuous();
                      ScriptEditor.saveSelection();
                  });
                  
                  content.addEventListener('mouseup', () => {
                      ScriptEditor.updateToolbarContinuous();
                  });
                  
                  content.addEventListener('keyup', (e) => {
                      if(e.key === 'Shift') {
                          content.focus();
                          return;
                      }
                      // Mise à jour de la toolbar quand on bouge le curseur avec les flèches
                      // (les autres cas sont déjà couverts par handleKeyContinuous + click + mouseup)
                      if(e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End' || e.key === 'PageUp' || e.key === 'PageDown') {
                          ScriptEditor.updateToolbarContinuous();
                      }
                  });
              }
              
              sceneDiv.appendChild(content);
              editor.appendChild(sceneDiv);
          });
          
          // Initialiser avec la première scène de l'épisode actif
          if(scenesToRender.length > 0) {
              ScriptEditor.setActiveScene(scenesToRender[0].id, 0);
          }
          if(typeof RenameReview !== 'undefined') RenameReview.paint();
      },
      
      // UX-2 — Auto-scroll pendant un drag d'une scène depuis la quick-nav.
      // Surveille la position du curseur sur la fenêtre et scrolle la page quand on approche du haut/bas.
      _autoScrollState: null,
      
      startAutoScroll: () => {
          if(ScriptEditorContinuous._autoScrollState) return;
          // Auto-scroll dans #quick-nav (la mini-barre des numéros, qui a overflow-y:auto)
          const scrollEl = document.getElementById('quick-nav');
          if(!scrollEl) return;
          const stateObj = { rafId: null, mouseY: 0, listener: null, scrollEl };
          stateObj.listener = (e) => { stateObj.mouseY = e.clientY; };
          document.addEventListener('dragover', stateObj.listener);
          const tick = () => {
              const rect = stateObj.scrollEl.getBoundingClientRect();
              const threshold = 50;        // distance du bord (de la quick-nav) où l'auto-scroll s'active
              const maxSpeed = 12;         // pixels par frame
              let delta = 0;
              // Mesurer la distance verticale entre mouseY et les bords de la quick-nav
              const fromTop = stateObj.mouseY - rect.top;
              const fromBottom = rect.bottom - stateObj.mouseY;
              if(fromTop < threshold && fromTop > -threshold) {
                  // Près du haut de la quick-nav (ou juste au-dessus)
                  delta = -maxSpeed * Math.max(0, 1 - fromTop / threshold);
              } else if(fromBottom < threshold && fromBottom > -threshold) {
                  // Près du bas de la quick-nav (ou juste en-dessous)
                  delta = maxSpeed * Math.max(0, 1 - fromBottom / threshold);
              }
              if(delta !== 0) stateObj.scrollEl.scrollTop += delta;
              stateObj.rafId = requestAnimationFrame(tick);
          };
          stateObj.rafId = requestAnimationFrame(tick);
          ScriptEditorContinuous._autoScrollState = stateObj;
      },
      
      stopAutoScroll: () => {
          const s = ScriptEditorContinuous._autoScrollState;
          if(!s) return;
          if(s.rafId) cancelAnimationFrame(s.rafId);
          if(s.listener) document.removeEventListener('dragover', s.listener);
          ScriptEditorContinuous._autoScrollState = null;
      },
      
      // V7.9.d — Cœur de la saisie clavier dans l'éditeur (Tab/Enter/Shift+Tab/raccourcis Ctrl)
      handleKeyContinuous: (e, content, sceneId) => {
          const toolbar = document.getElementById('continuous-toolbar');
          const sel = window.getSelection();
          const currentBlock = ScriptEditor.getBlockNode(sel.anchorNode);
          const currentType = currentBlock?.className || 'sc-action';
          const isEmpty = ScriptEditor.isBlockEmpty(currentBlock);
          const now = Date.now();
          
          // v617 : la navigation clavier de l'autocomplétion (ScriptAC) est gérée
          // plus haut, en écoute globale sur document (voir près de FocusMode) —
          // plus fiable que d'attendre l'événement ici : elle intercepte les
          // flèches AVANT que le navigateur ne déplace le curseur dans le texte,
          // quel que soit l'éditeur (Vue Scène ou Vue Script) qui a le focus.
          
          // Ignorer Shift seul (éviter perte de focus)
          if(e.key === 'Shift') {
              e.preventDefault();
              e.stopPropagation();
              return;
          }
          
          // v619 : Maj+Espace = ajouter une scène après celle où on écrit (ou à
          // la fin si aucune scène n'a la main). Remplace le bouton "➕ Scène"
          // retiré avec la Vue Scènes.
          if(e.key === ' ' && e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
              e.preventDefault();
              e.stopPropagation();
              ScriptEditor.addSceneAtCursor();
              return;
          }
          
          // Raccourcis Ctrl/Cmd/Alt
          if(e.ctrlKey || e.metaKey || e.altKey) {
              // Ctrl+H : Rechercher / Remplacer (v602, la fenetre n'avait plus d'entree)
              if(e.ctrlKey && !e.altKey && !e.shiftKey && e.code === 'KeyH') { e.preventDefault(); e.stopPropagation(); ScriptEditor.openSearchReplace(); return; }
              // Ctrl+1-7 : changer le type du bloc
              const codeToType = { 'Digit1': 'sc-action', 'Digit2': 'sc-perso', 'Digit3': 'sc-dial', 'Digit4': 'sc-paren', 'Digit5': 'sc-trans', 'Digit6': 'sc-centered', 'Digit7': 'sc-note', 'Numpad1': 'sc-action', 'Numpad2': 'sc-perso', 'Numpad3': 'sc-dial', 'Numpad4': 'sc-paren', 'Numpad5': 'sc-trans', 'Numpad6': 'sc-centered', 'Numpad7': 'sc-note' };
              if(codeToType[e.code]) { e.preventDefault(); e.stopPropagation(); ScriptEditor.setFormatDirectContinuous(content, codeToType[e.code]); return; }
          }
          
          // === SHIFT+TAB (cycle inverse) ===
          if(e.key === 'Tab' && e.shiftKey) {
              e.preventDefault();
              e.stopPropagation();
              let prevType = 'sc-action';
              if(currentType === 'sc-action') prevType = 'sc-note';
              else if(currentType === 'sc-perso') prevType = 'sc-action';
              else if(currentType === 'sc-dial') prevType = 'sc-perso';
              else if(currentType === 'sc-paren') prevType = 'sc-dial';
              else if(currentType === 'sc-trans') prevType = 'sc-paren';
              else if(currentType === 'sc-centered') prevType = 'sc-trans';
              else if(currentType === 'sc-note') prevType = 'sc-centered';
              ScriptEditor.changeBlockType(currentBlock, prevType);
              ScriptEditor.updateToolbarContinuous();
              return;
          }
          
          // === TAB ===
          if(e.key === 'Tab') {
              e.preventDefault();
              e.stopPropagation();
              
              // Double Tab → Note (si activé dans les préférences)
              if(state.scriptPrefs.doubleTapTabToNote && now - ScriptEditor.lastTabTime < ScriptEditor.doubleTapDelay) {
                  ScriptEditor.changeBlockType(currentBlock, 'sc-note');
                  ScriptEditor.lastTabTime = 0;
                  ScriptEditor.updateToolbarContinuous();
                  return;
              }
              ScriptEditor.lastTabTime = now;
              
              // Tab simple : toggle selon le type (change le bloc actuel, jamais de nouvelle ligne)
              let nextType = 'sc-action';
              if(currentType === 'sc-action') nextType = 'sc-perso';
              else if(currentType === 'sc-perso') nextType = 'sc-paren';
              else if(currentType === 'sc-dial') nextType = state.scriptPrefs.tabFromDialog || 'sc-perso';
              else if(currentType === 'sc-paren') nextType = 'sc-dial';
              else if(currentType === 'sc-trans') nextType = 'sc-action';
              else if(currentType === 'sc-note') nextType = 'sc-action';
              else if(currentType === 'sc-centered') nextType = 'sc-action';
              
              ScriptEditor.changeBlockType(currentBlock, nextType);
              ScriptEditor.updateToolbarContinuous();
              return;
          }
          
          // === ENTER ===
          if(e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              e.stopPropagation();
              
              // Sync perso si besoin
              if(currentBlock && currentBlock.classList.contains('sc-perso')) {
                  const name = currentBlock.innerText.trim().replace(/\(.*\)/, '').trim();
                  if(name.length > 1) ScriptEditor.syncCharMeta(name, sceneId);
              }
              
              // Double Enter ?
              const isDoubleEnter = (now - ScriptEditor.lastEnterTime < ScriptEditor.doubleTapDelay);
              ScriptEditor.lastEnterTime = now;
              
              if(isDoubleEnter && state.scriptPrefs.doubleEnterToTransition) {
                  // Double Enter : change le type du bloc actuel (pas de nouvelle ligne)
                  if(currentType === 'sc-action') {
                      ScriptEditor.changeBlockType(currentBlock, 'sc-trans');
                      ScriptEditor.updateToolbarContinuous();
                      return;
                  } else if(currentType === 'sc-dial' || currentType === 'sc-paren') {
                      ScriptEditor.changeBlockType(currentBlock, 'sc-action');
                      ScriptEditor.updateToolbarContinuous();
                      return;
                  }
              }
              
              // Enter simple - logique selon si la ligne est vide ou non
              
              if(currentType === 'sc-action') {
                  // Action + Enter = si vide: reste Action, si rempli: nouveau paragraphe selon préférence
                  if(isEmpty) {
                      // Ligne vide : on ne fait rien (reste sur Action)
                  } else {
                      document.execCommand('insertParagraph', false);
                      const newBlock = ScriptEditor.getBlockNode(window.getSelection().anchorNode);
                      if(newBlock) newBlock.className = state.scriptPrefs.enterAfterAction || 'sc-action';
                  }
              } else if(currentType === 'sc-perso') {
                  // Perso + Enter = si vide: change en Dialogue, si rempli: nouvelle ligne Dialogue
                  if(isEmpty) {
                      ScriptEditor.changeBlockType(currentBlock, 'sc-dial');
                  } else {
                      document.execCommand('insertParagraph', false);
                      const newBlock = ScriptEditor.getBlockNode(window.getSelection().anchorNode);
                      if(newBlock) newBlock.className = 'sc-dial';
                  }
              } else if(currentType === 'sc-dial') {
                  // Dialogue + Enter = si vide: change en Perso, si rempli: nouvelle ligne selon préférence
                  if(isEmpty) {
                      ScriptEditor.changeBlockType(currentBlock, 'sc-perso');
                  } else {
                      document.execCommand('insertParagraph', false);
                      const newBlock = ScriptEditor.getBlockNode(window.getSelection().anchorNode);
                      if(newBlock) newBlock.className = state.scriptPrefs.enterAfterDialog || 'sc-perso';
                  }
              } else if(currentType === 'sc-paren') {
                  // Didas + Enter = si vide: change en Dial, si rempli: nouvelle ligne Dial
                  if(isEmpty) {
                      ScriptEditor.changeBlockType(currentBlock, 'sc-dial');
                  } else {
                      // Nettoyer le texte et fermer proprement les parenthèses
                      let txt = currentBlock.innerText.trim();
                      txt = txt.replace(/^\(\s*/, '').replace(/\s*\)$/, '').trim();
                      currentBlock.innerText = '( ' + txt + ' )';
                      // Créer nouvelle ligne Dial
                      const newBlock = document.createElement('div');
                      newBlock.className = 'sc-dial';
                      newBlock.innerHTML = '<br>';
                      currentBlock.after(newBlock);
                      const range = document.createRange();
                      range.setStart(newBlock, 0);
                      range.collapse(true);
                      sel.removeAllRanges();
                      sel.addRange(range);
                  }
              } else if(currentType === 'sc-trans') {
                  // Trans + Enter = si vide: change en Action, si rempli: nouvelle ligne Action
                  if(isEmpty) {
                      ScriptEditor.changeBlockType(currentBlock, 'sc-action');
                  } else {
                      document.execCommand('insertParagraph', false);
                      const newBlock = ScriptEditor.getBlockNode(window.getSelection().anchorNode);
                      if(newBlock) newBlock.className = 'sc-action';
                  }
              } else if(currentType === 'sc-note') {
                  // Note + Enter = si vide: change en Action, si rempli: nouvelle ligne Action
                  if(isEmpty) {
                      ScriptEditor.changeBlockType(currentBlock, 'sc-action');
                  } else {
                      let txt = currentBlock.innerText.trim();
                      txt = txt.replace(/^\{\s*/, '').replace(/\s*\}$/, '').trim();
                      currentBlock.innerText = '{ ' + txt + ' }';
                      const newBlock = document.createElement('div');
                      newBlock.className = 'sc-action';
                      newBlock.innerHTML = '<br>';
                      currentBlock.after(newBlock);
                      const range = document.createRange();
                      range.setStart(newBlock, 0);
                      range.collapse(true);
                      sel.removeAllRanges();
                      sel.addRange(range);
                  }
              } else if(currentType === 'sc-centered') {
                  // Centré + Enter = si vide: change en Action, si rempli: nouvelle ligne Action
                  if(isEmpty) {
                      ScriptEditor.changeBlockType(currentBlock, 'sc-action');
                  } else {
                      document.execCommand('insertParagraph', false);
                      const newBlock = ScriptEditor.getBlockNode(window.getSelection().anchorNode);
                      if(newBlock) newBlock.className = 'sc-action';
                  }
              } else {
                  // Défaut
                  if(!isEmpty) {
                      document.execCommand('insertParagraph', false);
                      const newBlock = ScriptEditor.getBlockNode(window.getSelection().anchorNode);
                      if(newBlock) newBlock.className = 'sc-action';
                  }
              }
              
              ScriptEditor.updateToolbarContinuous();
          }
      }
  };

  // ScriptEditorPrefs — sous-module V7.1 : préférences éditeur scénario (Tab/Enter customisables)