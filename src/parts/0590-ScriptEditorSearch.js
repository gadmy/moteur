
  const ScriptEditorSearch = {
      // État interne du module (sera retiré de ScriptEditor à V7.5.e)
      searchResults: [],
      currentResultIndex: -1,
      backupScripts: null,
      
      clearHighlights: () => {
          document.querySelectorAll('.search-highlight').forEach(el => {
              const parent = el.parentNode;
              while(el.firstChild) {
                  parent.insertBefore(el.firstChild, el);
              }
              parent.removeChild(el);
              parent.normalize();
          });
      },
      
      saveBackup: () => {
          ScriptEditorSearch.backupScripts = state.data.scenes.map(s => ({
              id: s.id,
              scriptContent: s.scriptContent
          }));
      },
      
      // V7.5.b — helpers navigation et highlight
      findInElement: (element, query, caseSensitive, wholeWord, sceneId) => {
          const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
          let node;
          
          while(node = walker.nextNode()) {
              let text = node.textContent;
              let searchText = caseSensitive ? text : text.toLowerCase();
              let searchQuery = caseSensitive ? query : query.toLowerCase();
              
              let index = 0;
              while((index = searchText.indexOf(searchQuery, index)) !== -1) {
                  // Vérifier mot entier si nécessaire
                  if(wholeWord) {
                      const before = index > 0 ? searchText[index - 1] : ' ';
                      const after = index + searchQuery.length < searchText.length ? searchText[index + searchQuery.length] : ' ';
                      if(/\w/.test(before) || /\w/.test(after)) {
                          index++;
                          continue;
                      }
                  }
                  
                  ScriptEditorSearch.searchResults.push({
                      node: node,
                      index: index,
                      length: query.length,
                      sceneId: sceneId
                  });
                  index++;
              }
          }
      },
      
      highlightCurrentResult: () => {
          ScriptEditorSearch.clearHighlights();
          
          if(ScriptEditorSearch.searchResults.length === 0) return;
          
          const result = ScriptEditorSearch.searchResults[ScriptEditorSearch.currentResultIndex];
          if(!result) return;
          
          // Créer le highlight
          const range = document.createRange();
          range.setStart(result.node, result.index);
          range.setEnd(result.node, result.index + result.length);
          
          const highlight = document.createElement('span');
          highlight.className = 'search-highlight current';
          highlight.style.cssText = 'background: #fbbf24; color: #000; padding: 1px 2px; border-radius: 2px;';
          
          try {
              range.surroundContents(highlight);
              highlight.scrollIntoView({ behavior: 'smooth', block: 'center' });
          } catch(e) {
              console.error('Erreur highlight:', e);
          }
          
          // Mettre à jour l'info
          document.getElementById('search-results-info').textContent = 
              `Résultat ${ScriptEditorSearch.currentResultIndex + 1} / ${ScriptEditorSearch.searchResults.length}`;
      },
      
      searchNext: () => {
          if(ScriptEditorSearch.searchResults.length === 0) {
              ScriptEditorSearch.searchInScript();
              if(ScriptEditorSearch.searchResults.length === 0) return;
          }
          ScriptEditorSearch.clearHighlights();
          const savedIndex = ScriptEditorSearch.currentResultIndex;
          ScriptEditorSearch.searchInScript();
          ScriptEditorSearch.currentResultIndex = (savedIndex + 1) % ScriptEditorSearch.searchResults.length;
          ScriptEditorSearch.highlightCurrentResult();
      },
      
      searchPrev: () => {
          if(ScriptEditorSearch.searchResults.length === 0) {
              ScriptEditorSearch.searchInScript();
              if(ScriptEditorSearch.searchResults.length === 0) return;
          }
          ScriptEditorSearch.clearHighlights();
          const savedIndex = ScriptEditorSearch.currentResultIndex;
          ScriptEditorSearch.searchInScript();
          ScriptEditorSearch.currentResultIndex = savedIndex - 1;
          if(ScriptEditorSearch.currentResultIndex < 0) ScriptEditorSearch.currentResultIndex = ScriptEditorSearch.searchResults.length - 1;
          ScriptEditorSearch.highlightCurrentResult();
      },
      
      // V7.5.c — actions de recherche et remplacement
      searchInScript: () => {
          const query = document.getElementById('search-input').value;
          const caseSensitive = document.getElementById('search-case-sensitive').checked;
          const wholeWord = document.getElementById('search-whole-word').checked;
          
          ScriptEditorSearch.clearHighlights();
          ScriptEditorSearch.searchResults = [];
          ScriptEditorSearch.currentResultIndex = -1;
          
          if(query.length < 1) {
              document.getElementById('search-results-info').textContent = 'Tapez pour rechercher...';
              return;
          }
          
          // Chercher dans tous les éditeurs de scène (v620 : Vue Script uniquement)
          const editors = document.querySelectorAll('.script-continuous-content');
          
          editors.forEach(editor => {
              const sceneId = editor.closest('.script-continuous-scene')?.dataset.sceneId;
              ScriptEditorSearch.findInElement(editor, query, caseSensitive, wholeWord, sceneId);
          });
          
          const count = ScriptEditorSearch.searchResults.length;
          document.getElementById('search-results-info').textContent = count > 0 
              ? `${count} résultat(s) trouvé(s)` 
              : 'Aucun résultat';
          
          if(count > 0) {
              ScriptEditorSearch.currentResultIndex = 0;
              ScriptEditorSearch.highlightCurrentResult();
          }
      },
      
      replaceOne: () => {
          if(ScriptEditorSearch.searchResults.length === 0) return;
          
          const replaceText = document.getElementById('replace-input').value;
          const highlight = document.querySelector('.search-highlight.current');
          
          if(highlight) {
              const sceneId = highlight.closest('.script-continuous-scene')?.dataset.sceneId;
              highlight.replaceWith(document.createTextNode(replaceText));
              
              // Sauvegarder la scène
              if(sceneId) {
                  const editor = document.querySelector(`.script-continuous-scene[data-scene-id="${sceneId}"] .script-continuous-content`);
                  const scene = state.data.scenes.find(s => String(s.id) === String(sceneId));
                  if(scene && editor) {
                      scene.scriptContent = editor.innerHTML;
                      Store.save();
                  }
              }
              
              // Passer au suivant
              ScriptEditorSearch.searchInScript();
              if(ScriptEditorSearch.searchResults.length > 0) {
                  ScriptEditorSearch.highlightCurrentResult();
              }
          }
      },
      
      replaceAll: () => {
          const query = document.getElementById('search-input').value;
          const replaceText = document.getElementById('replace-input').value;
          const caseSensitive = document.getElementById('search-case-sensitive').checked;
          const wholeWord = document.getElementById('search-whole-word').checked;
          
          if(query.length < 1) return;
          
          // Sauvegarder avant remplacement
          ScriptEditorSearch.saveBackup();
          
          let totalReplaced = 0;
          
          // Remplacer dans chaque scène
          state.data.scenes.forEach(scene => {
              if(!scene.scriptContent) return;
              
              let content = scene.scriptContent;
              let flags = caseSensitive ? 'g' : 'gi';
              let pattern = wholeWord ? `\\b${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b` : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              
              const regex = new RegExp(pattern, flags);
              const matches = content.match(regex);
              
              if(matches) {
                  totalReplaced += matches.length;
                  scene.scriptContent = content.replace(regex, replaceText);
              }
          });
          
          Store.save();
          UI.renderScript();
          
          document.getElementById('search-results-info').textContent = `✅ ${totalReplaced} remplacement(s) effectué(s)`;
          ScriptEditorSearch.searchResults = [];
          ScriptEditorSearch.currentResultIndex = -1;
          
          // Afficher le bouton annuler
          if(totalReplaced > 0) {
              document.getElementById('undo-replace-btn').style.display = 'block';
          }
          
          Utils.toast(`${totalReplaced} remplacement(s) effectué(s)`, 'success');
      },
      
      undoReplace: () => {
          if(!ScriptEditorSearch.backupScripts) {
              Utils.toast('Aucun remplacement à annuler', 'error');
              return;
          }
          
          // Restaurer le contenu
          ScriptEditorSearch.backupScripts.forEach(backup => {
              const scene = state.data.scenes.find(s => String(s.id) === String(backup.id));
              if(scene) {
                  scene.scriptContent = backup.scriptContent;
              }
          });
          
          Store.save();
          UI.renderScript();
          
          ScriptEditorSearch.backupScripts = null;
          document.getElementById('undo-replace-btn').style.display = 'none';
          document.getElementById('search-results-info').textContent = '↩️ Remplacement annulé';
          
          Utils.toast('Remplacement annulé', 'success');
      },
      
      // V7.5.d — ouverture/fermeture modale + drag de la fenêtre
      openSearchReplace: () => {
          document.getElementById('search-replace-modal').style.display = 'block';
          document.getElementById('search-input').value = '';
          document.getElementById('replace-input').value = '';
          document.getElementById('search-results-info').textContent = 'Tapez pour rechercher...';
          ScriptEditorSearch.searchResults = [];
          ScriptEditorSearch.currentResultIndex = -1;
          ScriptEditorSearch.clearHighlights();
          document.getElementById('search-input').focus();
      },
      
      closeSearchReplace: () => {
          document.getElementById('search-replace-modal').style.display = 'none';
          ScriptEditorSearch.clearHighlights();
      },
      
      // Drag de la fenêtre Recherche/Remplacement
      initDrag: () => {
          const modal = document.getElementById('search-replace-modal');
          const header = document.getElementById('search-replace-header');
          let isDragging = false;
          let offsetX, offsetY;
          
          header.addEventListener('mousedown', (e) => {
              if(e.target.tagName === 'BUTTON') return;
              isDragging = true;
              offsetX = e.clientX - modal.offsetLeft;
              offsetY = e.clientY - modal.offsetTop;
              modal.style.transition = 'none';
          });
          
          document.addEventListener('mousemove', (e) => {
              if(!isDragging) return;
              let newX = e.clientX - offsetX;
              let newY = e.clientY - offsetY;
              
              // Limites de l'écran
              newX = Math.max(0, Math.min(newX, window.innerWidth - modal.offsetWidth));
              newY = Math.max(0, Math.min(newY, window.innerHeight - modal.offsetHeight));
              
              modal.style.left = newX + 'px';
              modal.style.top = newY + 'px';
              modal.style.right = 'auto';
          });
          
          document.addEventListener('mouseup', () => {
              isDragging = false;
              modal.style.transition = '';
          });
      }
  };

  // ScriptEditorAC — sous-module V7.6 : auto-complétion personnages/décors/ressources
  // (V7.6.a — squelette + hideAC + _getCaretOffsetInBlock. Cohabite avec les anciennes méthodes de ScriptEditor jusqu'à la bascule V7.6.e)