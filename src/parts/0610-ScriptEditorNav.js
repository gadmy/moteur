
  const ScriptEditorNav = {
      // Vue continue : scroll vers une scène + focus son contenu
      scrollToSceneInContinuous: (sceneId) => {
          const sceneDiv = document.querySelector(`.script-continuous-scene[data-scene-id="${sceneId}"]`);
          if(sceneDiv) {
              sceneDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
              const content = sceneDiv.querySelector('.script-continuous-content');
              if(content) {
                  setTimeout(() => content.focus(), 300);
              }
          }
      },
      
      // V7.7.b — navigation entre scènes en vue continue + tracking scène active
      goToSceneContinuous: (index) => {
          if(index < 0 || index >= state.data.scenes.length) {
              Utils.toast(index < 0 ? 'Première scène atteinte' : 'Dernière scène atteinte', 'info');
              return;
          }
          const scene = state.data.scenes[index];
          ScriptEditorNav.scrollToSceneInContinuous(scene.id);
          // Mettre à jour la sidebar avec la nouvelle scène
          ScriptEditorNav.setActiveScene(scene.id, index);
      },
      
      setActiveScene: (sceneId, index) => {
          if(ScriptEditor.activeSceneId === sceneId) return;
          ScriptEditor.activeSceneId = sceneId;
          
          // Highlight la scène active
          document.querySelectorAll('.script-continuous-scene').forEach(s => {
              s.classList.toggle('active', s.dataset.sceneId === sceneId);
          });
          
          // Mettre à jour la sidebar
          ScriptEditorNav.updateContinuousSidebar(sceneId, index);
      },
      
      // V7.7.c — sidebar de la vue continue + insertion de scène
      updateContinuousSidebar: (sceneId, index) => {
          const sidebar = document.getElementById('scriptContinuousSidebar');
          if(!sidebar) return;
          const sidebarRight = document.getElementById('scriptContinuousSidebarRight');
          
          const scene = state.data.scenes.find(s => s.id === sceneId);
          if(!scene) return;
          
          const idx = index !== undefined ? index : state.data.scenes.findIndex(s => s.id === sceneId);
          const tag = state.data.tags.find(t => t.id === scene.tag_id) || {name:'', color: 'transparent'};
          const infoStyle = tag.color !== 'transparent' ? `border-left-color:${tag.color}` : '';
          const badge = tag.color !== 'transparent' ? `<span class="tag-badge" style="background:${tag.color}" title="${Utils.escape(tag.name)}"></span>` : '';
          
          const shotCount = state.data.shots ? state.data.shots.filter(s => s.sceneId === scene.id).length : 0;
          const versionCount = scene.versions ? scene.versions.length : 0;
          const sceneStatus = scene.status || 'not-verified';
          const statusBadge = `<span class="scene-status-badge ${sceneStatus}" onclick="app.UI.toggleSceneStatus('${scene.id}', event)">${SCENE_STATUS_LABELS[sceneStatus]}</span>`;
          const isView = state.currentRole === 'viewer';
          const isFinal = scene.isFinal === true;
          const finalBadge = isFinal ? `<span class="scene-status-badge final">✅ Finale</span>` : `<span class="scene-status-badge draft">📝 Brouillon</span>`;
          const finalizeBtn = isView ? '' : (isFinal 
              ? `<button class="unfinalize-btn w-full" onclick="app.Actions.unfinalizeScene('${scene.id}')">📝 Repasser en brouillon</button>`
              : `<button class="finalize-btn w-full" onclick="app.Actions.finalizeScene('${scene.id}')">✅ Finaliser cette scène</button>`);
          
          // v620 : compteur global en tout premier (demandé en haut de la
          // colonne de gauche), puis identité de la scène (titre, statut,
          // résumé) + navigation entre scènes. Le reste (actions, réglages)
          // part dans la colonne de droite, ajoutée pour désengorger la
          // gauche qui était devenue trop haute pour tenir sur un écran.
          sidebar.innerHTML = `
              <div class="script-count" id="script-count" title="Nombre de scènes et estimation de la pagination">—</div>
              <div class="script-info-col" style="${infoStyle}">
                  <h3 style="display:flex; align-items:center; flex-wrap:wrap; gap:8px;">
                      ${badge}${Utils.escape(scene.title)}
                      <div style="margin-left:auto;">${statusBadge}</div>
                  </h3>
                  <div style="margin-bottom:10px;font-size:0.8em">#${idx+1} / ${state.data.scenes.length} • ${Utils.escape(scene.time)} min</div>
                  <div style="margin-bottom:10px; font-size:0.85rem; color:var(--text-main);">${Utils.escape(scene.perso) || '-'}</div>
                  <strong>Résumé:</strong>
                  <p class="mt-5">${Utils.escape(scene.resume) || '-'}</p>
                  
                  <div class="script-sidebar-btns">
                      <button onclick="app.ScriptEditor.goToSceneContinuous(${idx - 1})">⬅️ Scène précédente</button>
                      <button onclick="app.ScriptEditor.goToSceneContinuous(${idx + 1})">➡️ Scène suivante</button>
                  </div>
              </div>
          `;
          // Le compteur vient d'être recréé (innerHTML ci-dessus) : on le
          // repeuple tout de suite, sinon il reste sur "—" jusqu'au prochain
          // rendu complet du scénario.
          if(typeof ScriptEditor !== 'undefined' && ScriptEditor.updateCount) ScriptEditor.updateCount();
          
          if(sidebarRight) {
              sidebarRight.innerHTML = `
                  <div class="script-sidebar-btns">
                      <!-- Statut de la scène -->
                      <div style="text-align:center; margin-bottom:5px;">${finalBadge}</div>
                      ${finalizeBtn}
                      <hr class="hr-subtle">
                      <!-- Actions -->
                      <button onclick="app.StoryboardPreview.open('${scene.id}')">📷 Storyboard (${shotCount})</button>
                      <button onclick="app.ScriptReview.open('${scene.id}')">💬 Commentaires</button>
                      <hr class="hr-subtle">
                      <button onclick="app.SceneVersions.save('${scene.id}')">📸 Sauvegarder version</button>
                      <button onclick="app.SceneVersions.openModal('${scene.id}')">📜 Historique${versionCount > 0 ? ' (' + versionCount + ')' : ''}</button>
                      <hr class="hr-subtle">
                      <!-- Réglages -->
                      <button onclick="app.ScriptEditor.toggleAC()" title="Active ou désactive les suggestions automatiques pendant l'écriture (personnages, décors, ressources)">${state.scriptAC.enabled ? '🟢' : '⚪'} Autocomplétion</button>
                      <button onclick="app.ScriptEditor.toggleScriptBd()" title="Active le clic droit pour dépouiller du texte sélectionné dans le scénario. Si désactivé, le clic droit reste celui du navigateur (copier/coller, correction orthographique).">${state.scriptBdEnabled ? '🟢' : '⚪'} Dépouillement</button>
                      <div style="font-size:0.7rem;color:var(--text-sec);font-style:italic;text-align:center;padding:4px 6px;line-height:1.3;">💡 <strong>Shift + clic droit</strong> = menu navigateur (correction orthographique, copier/coller)</div>
                  </div>
              `;
          }
      },
      
      // v619 : remplace le bouton "➕ Scène" de la Vue Scènes (retirée) — insère
      // après ScriptEditor.activeSceneId (la scène où l'utilisateur écrivait
      // en dernier, en Vue Script) ou à la fin si aucune scène n'a la main.
      addSceneAtCursor: () => {
          if(state.currentRole === 'viewer') return;
          const scenes = state.data.scenes || [];
          let index = scenes.findIndex(s => s.id === ScriptEditor.activeSceneId);
          if(index === -1) index = scenes.length - 1; // aucune scène active (ou introuvable) : à la fin
          
          const newScene = {
              id: Utils.generateUniqueId(),
              title: 'INT. LIEU - JOUR',
              time: '1',
              resume: '',
              perso: '',
              persoIds: [], locationId: null,
              color: '#808080',
              scriptContent: '<div class="sc-action">Description de l\'action...</div>'
          };
          
          scenes.splice(index + 1, 0, newScene);
          
          History.log('ADD', `Nouvelle scène insérée après Sc.${index + 1}`, { target: { kind: 'scene', id: newScene.id, label: newScene.title || 'Nouvelle scène' }, link: { kind: 'scene', id: newScene.id } });
          
          Store.save();
          UI.renderScript();
          UI.renderBoard();
          
          setTimeout(() => {
              ScriptEditorNav.scrollToSceneInContinuous(newScene.id);
              ScriptEditorNav.setActiveScene(newScene.id, index + 1);
              Utils.toast(`Nouvelle scène insérée (Sc.${index + 2})`, 'success');
          }, 100);
      }
  };

  // ScriptEditorToolbar — sous-module V7.8 : barre d'outils + formatage des blocs scénario
  // (V7.8.a — squelette + wrapNote + wrapParen + placeCursorInside. Cohabite avec les anciennes méthodes de ScriptEditor jusqu'à la bascule V7.8.e)