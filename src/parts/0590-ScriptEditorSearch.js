
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
                      if(/[\p{L}\p{N}_]/u.test(before) || /[\p{L}\p{N}_]/u.test(after)) {
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
      
      // REBRANCHE EN v602 (la fenetre n'avait plus de bouton). Avant de le
      // rendre, trois trous bouches :
      //  - DROITS ET VERROUS : le remplacement ecrivait meme en lecture seule,
      //    sur un scenario tenu par quelqu'un d'autre ou une scene verrouillee.
      //    Il ne touche plus qu'aux scenes AFFICHEES et MODIFIABLES ici
      //    (editeur ouvert en ecriture, domaine a moi, scene libre) ;
      //  - LA MISE EN FORME : « Tout remplacer » cherchait dans le HTML brut.
      //    Chercher « div » ou « class » cassait les blocs, et le texte de
      //    remplacement etait colle tel quel dans la page (du HTML tape la
      //    s'executait chez tous les membres). On ne remplace plus que dans
      //    le TEXTE, et le remplacement reste du texte ;
      //  - « Tout remplacer » touchait aussi les episodes non affiches.
      _peutRemplacer: (sceneId) => {
          if(state.currentRole === 'viewer') return false;
          if(typeof Permissions !== 'undefined' && !Permissions.canEdit('scenario')) return false;
          if(typeof LockManager !== 'undefined' && typeof LockDomains !== 'undefined'
              && !LockManager._editable(LockDomains.forTab('script'))) return false;
          if(sceneId && typeof SceneLock !== 'undefined' && !SceneLock.peutEcrire(sceneId)) return false;
          return true;
      },
      _refus: () => Utils.toast('Remplacement impossible : scénario en lecture seule ou verrouillé.', 'warning'),
      _editeurs: () => Array.from(document.querySelectorAll('.script-continuous-scene')).map(div => ({
          sceneId: div.dataset.sceneId,
          editor: div.querySelector('.script-continuous-content')
      })).filter(x => x.sceneId && x.editor && x.editor.isContentEditable),

      replaceOne: () => {
          if(ScriptEditorSearch.searchResults.length === 0) return;

          const replaceText = document.getElementById('replace-input').value;
          const highlight = document.querySelector('.search-highlight.current');

          if(highlight) {
              const sceneId = highlight.closest('.script-continuous-scene')?.dataset.sceneId;
              const ed = highlight.closest('.script-continuous-content');
              if(!sceneId || !ed || !ed.isContentEditable || !ScriptEditorSearch._peutRemplacer(sceneId)) { ScriptEditorSearch._refus(); return; }
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
          if(!ScriptEditorSearch._peutRemplacer()) { ScriptEditorSearch._refus(); return; }
          ScriptEditorSearch.clearHighlights();

          let totalReplaced = 0, bloquees = 0;
          const flags = caseSensitive ? 'gu' : 'giu';
          const echappe = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(wholeWord ? `(^|[^\\p{L}\\p{N}_])${echappe}(?=[^\\p{L}\\p{N}_]|$)` : echappe, flags);
          const backup = [];

          // Remplacer dans le TEXTE des scenes affichees et modifiables
          ScriptEditorSearch._editeurs().forEach(({ sceneId, editor }) => {
              const scene = state.data.scenes.find(s => String(s.id) === String(sceneId));
              if(!scene) return;
              if(!ScriptEditorSearch._peutRemplacer(sceneId)) { bloquees++; return; }
              const avant = editor.innerHTML;
              let n = 0;
              const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, null, false);
              const noeuds = [];
              let node;
              while(node = walker.nextNode()) noeuds.push(node);
              noeuds.forEach(t => {
                  const neuf = t.textContent.replace(regex, (m, pre) => {
                      n++;
                      return wholeWord ? (pre || '') + replaceText : replaceText;
                  });
                  if(neuf !== t.textContent) t.textContent = neuf;
              });
              if(n > 0) {
                  totalReplaced += n;
                  backup.push({ id: scene.id, scriptContent: avant, apres: editor.innerHTML });
                  scene.scriptContent = editor.innerHTML;
              }
          });
          ScriptEditorSearch.backupScripts = backup.length ? backup : null;

          if(totalReplaced > 0) Store.save();
          if(bloquees > 0) Utils.toast(bloquees + ' scène(s) verrouillée(s) laissée(s) telle(s) quelle(s).', 'info');
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
          
          // Restaurer le contenu. Une scene retouchee depuis (par moi ou par
          // un autre membre) n'est PAS ecrasee : on perdrait son travail.
          let sautees = 0;
          ScriptEditorSearch.backupScripts.forEach(backup => {
              const scene = state.data.scenes.find(s => String(s.id) === String(backup.id));
              if(!scene) return;
              if(scene.scriptContent !== backup.apres || !ScriptEditorSearch._peutRemplacer(scene.id)) { sautees++; return; }
              scene.scriptContent = backup.scriptContent;
          });
          if(sautees > 0) Utils.toast(sautees + ' scène(s) modifiée(s) depuis : non restaurée(s).', 'info');
          
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