
  const ScriptEditorAC = {
      hideAC: () => {
          state.scriptAC.active = false;
          els.scriptACList.style.display = 'none';
      },
      
      // Helper : retourne l'offset (en caractères) du curseur dans le bloc texte
      _getCaretOffsetInBlock: (block, range) => {
          const preRange = document.createRange();
          preRange.selectNodeContents(block);
          preRange.setEnd(range.endContainer, range.endOffset);
          return preRange.toString().length;
      },
      
      // V7.6.b — helpers de rendu et navigation verticale
      _setCaretAtOffset: (block, offset) => {
          const sel = window.getSelection();
          const range = document.createRange();
          let charCount = 0; let found = false;
          const walk = (node) => {
              if(found) return;
              if(node.nodeType === 3) {
                  const len = node.textContent.length;
                  if(charCount + len >= offset) { range.setStart(node, offset - charCount); range.collapse(true); found = true; return; }
                  charCount += len;
              } else { for(const c of node.childNodes) walk(c); }
          };
          walk(block);
          if(found) { sel.removeAllRanges(); sel.addRange(range); }
      },
      
      renderScriptACList: () => {
          els.scriptACList.innerHTML = '';
          els.scriptACList.style.width = 'auto';
          els.scriptACList.style.padding = '0';
          els.scriptACList.style.display = 'flex';
          els.scriptACList.style.alignItems = 'flex-start';
          state.scriptAC.columns.forEach((col, ci) => {
              const colDiv = document.createElement('div');
              colDiv.style.cssText = 'display:flex;flex-direction:column;border-right:1px solid var(--border);min-width:180px;max-width:240px;';
              if(ci === state.scriptAC.columns.length - 1) colDiv.style.borderRight = 'none';
              if(col.showHeader !== false) {
                  const head = document.createElement('div');
                  head.style.cssText = 'padding:6px 12px;font-size:0.75rem;font-weight:bold;color:var(--text-sec);background:var(--bg);border-bottom:1px solid var(--border);text-transform:uppercase;letter-spacing:0.5px;';
                  head.innerText = `${col.icon} ${col.label}`;
                  colDiv.appendChild(head);
              }
              col.items.forEach((m, i) => {
                  const div = document.createElement('div');
                  div.style.cssText = 'padding:8px 12px;cursor:pointer;border-bottom:1px solid var(--border);font-size:0.88rem;';
                  if(ci === state.scriptAC.colIndex && i === state.scriptAC.index) {
                      div.classList.add('active');
                      div.style.background = 'var(--bg)';
                      div.style.color = 'var(--primary)';
                  }
                  div.innerText = m.name;
                  div.onmousedown = (e) => {
                      e.preventDefault();
                      state.scriptAC.colIndex = ci;
                      state.scriptAC.index = i;
                      state.scriptAC.items = col.items;
                      ScriptEditorAC.selectAC();
                  };
                  colDiv.appendChild(div);
              });
              els.scriptACList.appendChild(colDiv);
          });
      },
      
      highlightAC: () => { 
          const cols = state.scriptAC.columns || [];
          if(cols.length === 0) return;
          // Wrap vertical dans la colonne courante
          const curCol = cols[state.scriptAC.colIndex];
          if(!curCol || !curCol.items || curCol.items.length === 0) return;
          if(state.scriptAC.index >= curCol.items.length) state.scriptAC.index = 0;
          if(state.scriptAC.index < 0) state.scriptAC.index = curCol.items.length - 1;
          state.scriptAC.items = curCol.items;
          // Re-render pour mettre à jour la mise en surbrillance (plus simple que de manipuler les classes)
          ScriptEditorAC.renderScriptACList();
      },
      
      // V7.6.c — navigation horizontale entre colonnes + sélection
      switchACColumn: (delta) => {
          const cols = state.scriptAC.columns || [];
          if(cols.length === 0) return;
          let newIdx = state.scriptAC.colIndex + delta;
          if(newIdx >= cols.length) newIdx = 0;
          if(newIdx < 0) newIdx = cols.length - 1;
          state.scriptAC.colIndex = newIdx;
          state.scriptAC.index = 0;
          state.scriptAC.items = cols[newIdx].items;
          ScriptEditorAC.renderScriptACList();
      },
      
      selectAC: () => {
          const cols = state.scriptAC.columns || [];
          const curCol = cols[state.scriptAC.colIndex];
          if(!curCol || state.scriptAC.index < 0 || !curCol.items[state.scriptAC.index]) { ScriptEditorAC.hideAC(); return; }
          const chosen = curCol.items[state.scriptAC.index].name;
          const sel = window.getSelection();
          const block = ScriptEditor.getBlockNode(sel.anchorNode);
          if(block) {
              // v618 : reprendre la main sur l'éditeur AVANT de repositionner le
              // curseur — sans ça, le focus pouvait rester ailleurs (bouton
              // cliqué, etc.) et l'utilisateur devait recliquer dans le texte
              // pour continuer à écrire après une sélection.
              const editorEl = block.closest('.script-continuous-content');
              if(editorEl && document.activeElement !== editorEl) editorEl.focus();
              if(block.classList.contains('sc-perso')) {
                  // Bloc perso : remplacer tout le contenu par le nom en majuscules
                  block.innerText = chosen.toUpperCase();
                  const range = document.createRange(); range.selectNodeContents(block); range.collapse(false); sel.removeAllRanges(); sel.addRange(range);
              } else {
                  // Bloc action/dial : remplacer uniquement le dernier mot par le nom choisi
                  const range = sel.getRangeAt(0);
                  const offset = ScriptEditorAC._getCaretOffsetInBlock(block, range);
                  const fullText = block.innerText;
                  const before = fullText.substring(0, offset);
                  const after = fullText.substring(offset);
                  const lastWordMatch = before.match(/[\wÀ-ÿ]+$/);
                  if(lastWordMatch) {
                      const newBefore = before.substring(0, before.length - lastWordMatch[0].length) + chosen + ' ';
                      block.innerText = newBefore + after;
                      // Replacer le curseur après le mot inséré
                      const newRange = document.createRange();
                      const newOffset = newBefore.length;
                      ScriptEditorAC._setCaretAtOffset(block, newOffset);
                  }
              }
              // v618 : le remplacement ci-dessus ne touche QUE le DOM — jamais
              // state.data ni le serveur, puisqu'on écrit innerText par code et non
              // au clavier (aucun évènement input natif ne part tout seul). Le nom
              // choisi restait donc non sauvegardé : au moindre rafraîchissement
              // (temps réel, changement d'onglet...), l'éditeur revenait à l'ancien
              // texte et perdait le focus au passage. On déclenche l'évènement
              // input nous-mêmes sur l'éditeur concerné, qui sait déjà, via son
              // propre écouteur, sauvegarder sur la bonne scène.
              if(editorEl) editorEl.dispatchEvent(new Event('input', { bubbles: true }));
          }
          ScriptEditorAC.hideAC();
      },
      
      // V7.6.d — détection contextuelle (entry point) + toggle global
      checkAC: (editor) => { 
          if(!state.scriptAC.enabled) { ScriptEditorAC.hideAC(); return; }
          const sel = window.getSelection(); 
          const block = ScriptEditor.getBlockNode(sel.anchorNode); 
          if(!block) { ScriptEditorAC.hideAC(); return; }
          const blockType = block.className || '';
          // Déterminer le contexte de recherche selon le bloc
          const columns = [];
          if(blockType.includes('sc-perso')) {
              // Bloc perso : recherche sur le texte entier du bloc, juste personnages.
              // showHeader:false — inutile de préciser "Personnages" ici, on est déjà
              // dans le champ "qui parle", contrairement au bloc action/dialogue plus
              // bas où plusieurs catégories peuvent se mélanger.
              const text = block.innerText.trim().toUpperCase();
              if(text.length < 1) { ScriptEditorAC.hideAC(); return; }
              const matches = (state.data.characters || []).filter(c => c.name.toUpperCase().startsWith(text) && c.name.toUpperCase() !== text);
              if(matches.length > 0) columns.push({ type: 'perso', icon: '🎭', label: 'Personnages', showHeader: false, items: matches.map(m => ({ name: m.name })) });
          } else if(blockType.includes('sc-action') || blockType.includes('sc-dial')) {
              // Bloc action ou dialogue : recherche sur le dernier mot, multi-catégories, min 3 chars
              const range = sel.getRangeAt(0);
              const textBefore = block.innerText.substring(0, ScriptEditorAC._getCaretOffsetInBlock(block, range));
              const lastWordMatch = textBefore.match(/[\wÀ-ÿ]+$/);
              if(!lastWordMatch) { ScriptEditorAC.hideAC(); return; }
              const lastWord = lastWordMatch[0];
              if(lastWord.length < 3) { ScriptEditorAC.hideAC(); return; }
              const lwLower = lastWord.toLowerCase();
              // Personnages
              const persoMatches = (state.data.characters || []).filter(c => c.name.toLowerCase().startsWith(lwLower) && c.name.toLowerCase() !== lwLower);
              if(persoMatches.length > 0) columns.push({ type: 'perso', icon: '🎭', label: 'Personnages', items: persoMatches.map(m => ({ name: m.name })) });
              // Décors
              const lieuMatches = (state.data.locations || []).filter(l => l.name.toLowerCase().startsWith(lwLower) && l.name.toLowerCase() !== lwLower);
              if(lieuMatches.length > 0) columns.push({ type: 'lieu', icon: '🏠', label: 'Décors', items: lieuMatches.map(m => ({ name: m.name })) });
              // Ressources
              const resMatches = (state.data.resources || []).filter(r => r.name && r.name.toLowerCase().startsWith(lwLower) && r.name.toLowerCase() !== lwLower);
              if(resMatches.length > 0) columns.push({ type: 'res', icon: '📦', label: 'Ressources', items: resMatches.map(m => ({ name: m.name })) });
          } else { ScriptEditorAC.hideAC(); return; }
          if(columns.length === 0) { ScriptEditorAC.hideAC(); return; }
          state.scriptAC.columns = columns;
          state.scriptAC.colIndex = 0;
          state.scriptAC.index = 0;
          state.scriptAC.items = columns[0].items;
          state.scriptAC.active = true;
          const range = sel.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          els.scriptACList.style.display = 'block';
          els.scriptACList.style.top = (rect.bottom + 5) + 'px';
          els.scriptACList.style.left = rect.left + 'px';
          ScriptEditorAC.renderScriptACList();
      },
      
      toggleAC: () => {
          state.scriptAC.enabled = !state.scriptAC.enabled;
          localStorage.setItem('moteur_scriptAC_enabled', state.scriptAC.enabled ? 'true' : 'false');
          if(!state.scriptAC.enabled) ScriptEditorAC.hideAC();
          Utils.toast(`Autocomplétion ${state.scriptAC.enabled ? 'activée' : 'désactivée'}`, 'success');
          UI.renderScript();
          if(ScriptEditor.viewMode === 'continuous' && ScriptEditor.activeSceneId) ScriptEditor.updateContinuousSidebar(ScriptEditor.activeSceneId);
      }
  };

  // ScriptEditorNav — sous-module V7.7 : navigation entre scènes (vue continue)