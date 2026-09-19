
  const ScriptEditorToolbar = {
      wrapNote: (block) => { let txt = block.innerText.trim(); if(!txt.startsWith('{')) { block.innerText = '{ ' + txt + ' }'; ScriptEditorToolbar.placeCursorInside(block, '{', '}'); } },
      wrapParen: (block) => { let txt = block.innerText.trim(); if(!txt.startsWith('(')) { block.innerText = '( ' + txt + ' )'; ScriptEditorToolbar.placeCursorInside(block, '(', ')'); } },
      placeCursorInside: (block, openChar, closeChar) => { const text = block.innerText; const startPos = text.indexOf(openChar) + 2; const endPos = text.lastIndexOf(closeChar) - 1; if(block.firstChild) { const range = document.createRange(); const sel = window.getSelection(); try { const textNode = block.firstChild; const safeStart = Math.min(startPos, textNode.length); range.setStart(textNode, safeStart); range.collapse(true); sel.removeAllRanges(); sel.addRange(range); } catch(e) { console.warn('Cursor placement error', e); } } },
      
      // V7.8.b — Mise à jour visuelle des toolbars + sauvegarde/restauration de la sélection
      // État local (sera retiré de ScriptEditor à V7.8.e)
      savedSelection: null,
      
      updateToolbar: (editor, toolbar) => { const sel = window.getSelection(); if(!sel.rangeCount) return; let block = ScriptEditor.getBlockNode(sel.anchorNode); if(!block && editor.children.length > 0) block = editor.firstElementChild; toolbar.querySelectorAll('.fmt-btn').forEach(b => b.classList.remove('active')); const topToolbar = document.getElementById('continuous-toolbar'); if(topToolbar) topToolbar.querySelectorAll('.fmt-btn').forEach(b => b.classList.remove('active')); if(!block) return; const type = block.className || 'sc-action'; const btn = toolbar.querySelector(`[data-type="${type}"]`); if(btn) btn.classList.add('active'); if(topToolbar) { const topBtn = topToolbar.querySelector(`[data-type="${type}"]`); if(topBtn) topBtn.classList.add('active'); } },
      
      saveSelection: () => {
          const sel = window.getSelection();
          if(sel.rangeCount > 0) {
              ScriptEditorToolbar.savedSelection = sel.getRangeAt(0).cloneRange();
          }
      },
      
      restoreSelection: () => {
          if(ScriptEditorToolbar.savedSelection) {
              const sel = window.getSelection();
              sel.removeAllRanges();
              sel.addRange(ScriptEditorToolbar.savedSelection);
          }
      },
      
      updateToolbarContinuous: () => {
          const toolbar = document.getElementById('continuous-toolbar');
          if(!toolbar) return;
          
          const sel = window.getSelection();
          if(!sel.rangeCount) return;
          
          const block = ScriptEditor.getBlockNode(sel.anchorNode);
          toolbar.querySelectorAll('.fmt-btn').forEach(b => b.classList.remove('active'));
          
          if(!block) return;
          const type = block.className || 'sc-action';
          const btn = toolbar.querySelector(`[data-type="${type}"]`);
          if(btn) btn.classList.add('active');
      },
      
      // V7.8.c — changement de type de bloc + format direct via raccourci clavier
      changeBlockType: (block, newType) => {
          if(!block) return;
          // Nettoyer les caractères spéciaux des notes/parenthèses
          if(block.classList.contains('sc-note')) block.innerText = block.innerText.replace(/^\{\s*/, '').replace(/\s*\}$/, '').trim();
          if(block.classList.contains('sc-paren')) block.innerText = block.innerText.replace(/^\(\s*/, '').replace(/\s*\)$/, '').trim();
          block.className = newType;
          if(newType === 'sc-note') ScriptEditorToolbar.wrapNote(block);
          if(newType === 'sc-paren') ScriptEditorToolbar.wrapParen(block);
      },
      
      setFormatDirectContinuous: (content, className) => {
          const sel = window.getSelection();
          let block = ScriptEditor.getBlockNode(sel.anchorNode);
          if(!block && content.children.length > 0) block = content.firstElementChild;
          if(!block) return;
          if(block.classList.contains('sc-note')) block.innerText = block.innerText.replace(/^\{\s*/, '').replace(/\s*\}$/, '');
          if(block.classList.contains('sc-paren')) block.innerText = block.innerText.replace(/^\(\s*/, '').replace(/\s*\)$/, '');
          block.className = className;
          if(className === 'sc-note') ScriptEditorToolbar.wrapNote(block);
          if(className === 'sc-paren') ScriptEditorToolbar.wrapParen(block);
          ScriptEditorToolbar.updateToolbarContinuous();
      },
      
      // V7.8.d — formatage du bloc actif via les boutons toolbar
      formatContinuous: (className, e) => {
          if(e) e.preventDefault();
          
          // Restaurer la sélection si elle a été perdue
          if(ScriptEditorToolbar.savedSelection) {
              ScriptEditorToolbar.restoreSelection();
          }
          
          const sel = window.getSelection();
          
          const activeScene = document.querySelector('.script-continuous-scene.active');
          if(!activeScene) {
              Utils.toast('Cliquez d\'abord dans une scène', 'warning');
              return;
          }
          
          const content = activeScene.querySelector('.script-continuous-content');
          if(!content) return;
          
          if(!sel.anchorNode || !content.contains(sel.anchorNode)) {
              if(content.firstElementChild) {
                  const range = document.createRange();
                  range.selectNodeContents(content.firstElementChild);
                  range.collapse(true);
                  sel.removeAllRanges();
                  sel.addRange(range);
              } else {
                  return;
              }
          }
          
          const block = ScriptEditor.getBlockNode(sel.anchorNode);
          if(block) {
              ScriptEditorToolbar.changeBlockType(block, className);
              
              const sceneId = activeScene.dataset.sceneId;
              const scene = state.data.scenes.find(x => x.id === sceneId);
              if(scene) {
                  scene.scriptContent = content.innerHTML;
                  Store.updateScene(sceneId, content.innerHTML);
              }
              
              ScriptEditorToolbar.updateToolbarContinuous();
              content.focus();
          }
      }
  };

  // ScriptEditorContinuous — sous-module V7.9 : vue script continu (rendu + saisie + drag + édition titre)
  // (V7.9.a — squelette + drag sidebar : handleSidebarDragStart, handleSidebarDragEnd, reorderSceneContinuous.
  //  Cohabite avec les anciennes méthodes de ScriptEditor jusqu'à la bascule V7.9.e)