
  const Importer = {
      // ===================== ÉTAT & PARSING =====================
      rawLines: [],
      marginMap: {}, 
      steps: [
          { key: 'sc-heading', label: "1. Surlignez une EN-TÊTE DE SCÈNE (ex: INT. SALON - JOUR)" },
          { key: 'sc-action', label: "2. Surlignez une ligne d'ACTION" },
          { key: 'sc-perso', label: "3. Surlignez un NOM DE PERSONNAGE" },
          { key: 'sc-dial', label: "4. Surlignez un DIALOGUE ou une DIDASCALIE (distinction automatique par les parenthèses)" },
          { key: 'sc-trans', label: "5. Surlignez une TRANSITION (ex: CUT TO:)" },
          { key: 'cleanup', label: "6. NETTOYAGE : Sélectionnez du texte indésirable (numéro de page, '(SUITE)') pour le supprimer partout." }
      ],
      currentStepIndex: 0,
      selectedCleanupText: "", 

      handleFileSelect: (e) => {
          const file = e.target.files[0];
          if(!file) return;
          if (file.name.toLowerCase().endsWith('.pdf')) { Importer.parsePDF(file); } 
          else if (file.name.toLowerCase().endsWith('.fdx') || file.name.toLowerCase().endsWith('.xml')) { 
             const reader = new FileReader(); reader.onload = (ev) => Importer.parseFDX(ev.target.result); reader.readAsText(file); 
          } else { Utils.toast("Format non supporté.", "error"); }
          e.target.value = ''; 
      },

      parsePDF: async (file) => {
          try {
              await LazyLib.load('pdfjs');
              els.projectList.innerHTML = '<div class="p-20">Lecture PDF (Patience, chargement complet)...</div>';
              const arrayBuffer = await file.arrayBuffer();
              // v593 : isEvalSupported:false ferme la faille connue de pdf.js 3.x (exécution
              // de code par un PDF piégé). Sans effet sur l'extraction du texte.
              const pdf = await pdfjsLib.getDocument({ data: arrayBuffer, isEvalSupported: false }).promise;
              let allLines = [];
              
              for (let i = 1; i <= pdf.numPages; i++) {
                  const page = await pdf.getPage(i);
                  const content = await page.getTextContent();
                  let items = content.items.map(item => ({ str: item.str, x: Math.round(item.transform[4]), y: Math.round(item.transform[5]) }));
                  items.sort((a, b) => (b.y - a.y) || (a.x - b.x));
                  
                  let currentY = null, lineText = [], lineX = 0;
                  items.forEach(item => {
                      if (currentY === null || Math.abs(item.y - currentY) < 4) {
                          lineText.push(item.str);
                          if(lineX === 0) lineX = item.x; 
                      } else {
                          if (lineText.length > 0) allLines.push({ text: lineText.join('').trim(), x: lineX });
                          lineText = [item.str]; lineX = item.x; currentY = item.y;
                      }
                      currentY = item.y;
                  });
                  if (lineText.length > 0) allLines.push({ text: lineText.join('').trim(), x: lineX });
              }
              
              Importer.rawLines = allLines;
              Importer.startVisualWizard();

          } catch (err) { console.error(err); Utils.toast("Erreur PDF : " + err.message, "error"); location.reload(); }
      },

      // ===================== ASSISTANT VISUEL =====================
      startVisualWizard: () => {
          els.visualWizard.style.display = 'flex';
          Importer.marginMap = {};
          Importer.currentStepIndex = 0;
          
          if(!window.cleanerListenerAttached) {
             document.addEventListener('mouseup', Importer.handleSelection);
             els.cleanupToast.addEventListener('click', Importer.performCleanup);
             window.cleanerListenerAttached = true;
          }
          
          Importer.renderWizardLines();
          Importer.updateWizardUI();
      },

      renderWizardLines: () => {
          els.wizPageView.innerHTML = '';
          Importer.rawLines.slice(0, 2000).forEach((l, idx) => {
              if(!l.text) return;
              const div = document.createElement('div');
              div.className = 'wiz-line';
              div.innerText = l.text;
              div.style.paddingLeft = (l.x / 2) + 'px';
              div.dataset.x = l.x;
              div.dataset.idx = idx;
              div.onclick = (e) => {
                  const sel = window.getSelection();
                  if(sel.toString().length > 0) return;
                  Importer.handleLineClick(l.x);
              };
              els.wizPageView.appendChild(div);
          });
      },

      handleSelection: () => {
          const step = Importer.steps[Importer.currentStepIndex];
          if (!step || step.key !== 'cleanup') {
              els.cleanupToast.style.display = 'none';
              return;
          }

          const sel = window.getSelection();
          const text = sel.toString().trim();
          const wizard = document.getElementById('visual-wizard');
          
          if (wizard.style.display === 'flex' && text.length > 0 && wizard.contains(sel.anchorNode)) {
              Importer.selectedCleanupText = text;
              
              // Détection des patterns de numéros de page
              const pagePatterns = [
                  /^\d+\.?$/,           // "1" ou "1."
                  /^\d+\s*\/\s*\d+$/,   // "1/20" ou "1 / 20"
                  /^-\s*\d+\s*-$/,      // "- 1 -"
                  /^Page\s*\d+$/i,      // "Page 1"
                  /^\[\d+\]$/,          // "[1]"
                  /^\(\d+\)$/           // "(1)"
              ];
              
              const isPageNumber = pagePatterns.some(p => p.test(text));
              
              if(isPageNumber) {
                  Importer.cleanupMode = 'pageNumbers';
                  els.cleanupToast.innerHTML = `🗑️ Supprimer <b>TOUS les numéros de page</b> du document`;
              } else {
                  Importer.cleanupMode = 'exact';
                  els.cleanupToast.innerHTML = `🗑️ Supprimer partout : "<b>${Utils.escape(text.substring(0, 20))}${text.length>20?'...':''}</b>"`;
              }
              els.cleanupToast.style.display = 'block';
          } else {
              els.cleanupToast.style.display = 'none';
          }
      },
      
      cleanupMode: 'exact', // 'exact' ou 'pageNumbers'

      performCleanup: () => {
          if(!Importer.selectedCleanupText) return;
          
          let count = 0;
          
          if(Importer.cleanupMode === 'pageNumbers') {
              // Supprimer toutes les lignes qui ressemblent à des numéros de page
              const pageRegex = /^(\d+\.?|\d+\s*\/\s*\d+|-\s*\d+\s*-|Page\s*\d+|\[\d+\]|\(\d+\))$/i;
              Importer.rawLines = Importer.rawLines.filter(line => {
                  if(pageRegex.test(line.text.trim())) {
                      count++;
                      return false; // Supprimer cette ligne
                  }
                  return true;
              });
              Utils.toast(`${count} numéros de page supprimés !`, 'success');
          } else {
              // Suppression exacte (comportement original)
              const target = Importer.selectedCleanupText;
              const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              const regex = new RegExp(escaped, 'g');
              
              Importer.rawLines = Importer.rawLines.map(line => {
                  if(line.text.includes(target)) {
                      const newText = line.text.replace(regex, '').trim();
                      if(newText !== line.text) count++;
                      return { ...line, text: newText };
                  }
                  return line;
              }).filter(line => line.text.length > 0);
              
              Utils.toast(`${count} occurrences supprimées !`, 'success');
          }
          
          els.cleanupToast.style.display = 'none';
          window.getSelection().removeAllRanges();
          Importer.renderWizardLines();
      },

      updateWizardUI: () => {
          const step = Importer.steps[Importer.currentStepIndex];
          
          if(!step) { Importer.finishImport(); return; }
          
          els.wizTitle.innerText = `Étape ${Importer.currentStepIndex + 1}/${Importer.steps.length}`;
          els.wizTitle.style.color = "var(--primary)";
          els.wizDesc.innerText = step.label;
          els.wizDesc.style.fontWeight = "bold";
          els.wizDesc.style.fontSize = "1.1rem";
          
          document.querySelectorAll('.wiz-line').forEach(l => l.classList.remove('selected-ref'));

          if (step.key === 'cleanup') {
              els.wizSkip.innerText = "✅ Terminer l'importation";
              els.wizSkip.style.background = "var(--success)";
              els.wizSkip.style.color = "white";
              els.wizSkip.style.fontWeight = "bold";
          } else {
              els.wizSkip.innerText = "Sauter cette étape";
              els.wizSkip.style.background = "var(--border)";
              els.wizSkip.style.color = "var(--text-main)";
              els.wizSkip.style.fontWeight = "normal";
          }
      },

      handleLineClick: (xVal) => {
          const step = Importer.steps[Importer.currentStepIndex];
          if(!step) return;

          if(step.key === 'cleanup') return;

          Importer.marginMap[xVal] = step.key;
          const matches = document.querySelectorAll(`.wiz-line[data-x="${xVal}"]`);
          matches.forEach(el => el.classList.add('selected-ref'));
          setTimeout(() => { Importer.nextStep(); }, 400);
      },

      nextStep: (skip = false) => {
          Importer.currentStepIndex++;
          Importer.updateWizardUI();
      },
      
      cancel: () => { els.visualWizard.style.display = 'none'; UI.renderDashboard(); },

      // ===================== IMPORT FINAL =====================
      finishImport: () => {
          els.visualWizard.style.display = 'none';
          const newData = Store.getEmpty();
          newData.title = "Import Complet";
          
          let currentScene = null;
          
          // Pour la fusion des lignes consécutives
          let pendingType = null;
          let pendingText = [];
          
          const getType = (x) => {
             const definedMargins = Object.keys(Importer.marginMap).map(Number);
             if(definedMargins.length === 0) return 'sc-action'; 
             const closest = definedMargins.reduce((prev, curr) => Math.abs(curr - x) < Math.abs(prev - x) ? curr : prev);
             if(Math.abs(closest - x) > 20) return 'sc-action'; 
             return Importer.marginMap[closest];
          };
          
          // Fonction pour écrire le paragraphe accumulé
          const flushPending = () => {
              if(!currentScene || !pendingType || pendingText.length === 0) return;
              const mergedText = pendingText.join(' ');
              currentScene.scriptContent += `<div class="${pendingType}">${Utils.escape(mergedText)}</div>`;
              pendingType = null;
              pendingText = [];
          };

          Importer.rawLines.forEach((l, globalIdx) => {
              const text = l.text;
              if(!text) return; 

              let type = getType(l.x);
              
              // Distinction dialogue/didascalie : les parenthèses font foi
              // Si la marge correspond à dialogue OU didascalie, on utilise les parenthèses pour trancher
              if (type === 'sc-dial' || type === 'sc-paren') {
                  if (/^\(.*\)$/.test(text.trim())) {
                      type = 'sc-paren'; // Entre parenthèses = didascalie
                  } else {
                      type = 'sc-dial'; // Pas de parenthèses = dialogue
                  }
              }
              
              if(/^(INT\.|EXT\.|I\/E)/i.test(text)) type = 'sc-heading';

              if (type === 'sc-heading') {
                  // Écrire le paragraphe en attente avant de changer de scène
                  flushPending();
                  
                  if (currentScene) {
                      currentScene.time = Utils.estimateTime(currentScene.scriptContent);
                      newData.scenes.push(currentScene);
                  }
                  
                  let cleanTitle = text.replace(/^\d+[\.\-\s]*/, '').toUpperCase();

                  currentScene = { 
                      id: Utils.generateUniqueId(),
                      title: cleanTitle, 
                      time: "0", 
                      perso: "", 
                      resume: "", 
                      scriptContent: "", 
                      breakdown: {}, 
                      tag_id: 't1' 
                  };
                  
                  let rawLoc = cleanTitle.replace(/^(\d+)?\s*(INT\.|EXT\.|I\/E)\s*/i, '').split(/[-–]/)[0].trim();
                  if(rawLoc && !newData.locations.find(x=>x.name===rawLoc)) newData.locations.push({name: rawLoc, desc:"", group_id:""});
                  
              } else if (currentScene) {
                  let htmlClass = type || 'sc-action';
                  
                  // Gestion des personnages (pas de fusion pour eux)
                  if(htmlClass === 'sc-perso') {
                      flushPending(); // Écrire ce qui est en attente
                      const rawName = text.replace(/\(.*\)/, '').trim().toUpperCase();
                      if(rawName.length > 1) {
                          if(!newData.characters.find(c=>c.name===rawName)) newData.characters.push({name: rawName, bio:"", group_id:""});
                          
                          const currentPersos = currentScene.perso.split(',').map(s => s.trim()).filter(s => s);
                          if(!currentPersos.includes(rawName)) {
                              currentPersos.push(rawName);
                              currentScene.perso = currentPersos.join(', ');
                          }
                      }
                      currentScene.scriptContent += `<div class="${htmlClass}">${Utils.escape(text)}</div>`;
                  }
                  // Fusion des lignes consécutives pour action, dialogue, didascalie, transition
                  else if (htmlClass === pendingType) {
                      // Même type que le précédent : on accumule
                      pendingText.push(text);
                  } else {
                      // Type différent : écrire ce qui est en attente et démarrer un nouveau groupe
                      flushPending();
                      pendingType = htmlClass;
                      pendingText = [text];
                  }
              }
          });
          
          // Écrire le dernier paragraphe en attente
          flushPending();
          
          if(currentScene) {
              currentScene.time = Utils.estimateTime(currentScene.scriptContent);
              newData.scenes.push(currentScene);
          }
          
          Store.createNewProjectFromImport(newData);
      },

      parseFDX: (xmlText) => {
          const parser = new DOMParser(); const xmlDoc = parser.parseFromString(xmlText, "text/xml"); const newData = Store.getEmpty();
          const titleTag = xmlDoc.querySelector('Title Page Title'); newData.title = (titleTag && titleTag.textContent) ? "Import: " + titleTag.textContent.trim() : "Projet FDX";
          const paragraphs = xmlDoc.getElementsByTagName("Paragraph"); let currentScene = null;
          for (let i = 0; i < paragraphs.length; i++) {
              const p = paragraphs[i]; const type = p.getAttribute("Type");
              let text = ""; const texts = p.getElementsByTagName("Text"); for(let t=0; t<texts.length; t++) text += texts[t].textContent; text = text.trim(); if(!text) continue;
              if (type === "Scene Heading") {
                  if (currentScene) newData.scenes.push(currentScene);
                  let cleanTitle = text.replace(/^\d+[\.\-\s]*/, '').toUpperCase();
                  currentScene = { id: Utils.generateUniqueId(), title: cleanTitle, time: "0", perso: "", resume: "", scriptContent: "", breakdown: {}, tag_id: 't1' };
              } else if (currentScene) {
                  let htmlClass = "sc-action";
                  if (type === "Character") htmlClass = "sc-perso"; else if (type === "Dialogue") htmlClass = "sc-dial"; else if (type === "Parenthetical") htmlClass = "sc-paren"; else if (type === "Transition") htmlClass = "sc-trans";
                  if(htmlClass === "sc-perso") {
                       const charName = text.replace(/\(.*\)/, '').trim().toUpperCase();
                       if (!currentScene.perso.includes(charName)) currentScene.perso = currentScene.perso ? currentScene.perso + ", " + charName : charName;
                  }
                  currentScene.scriptContent += `<div class="${htmlClass}">${Utils.escape(text)}</div>`;
              }
          }
          if (currentScene) newData.scenes.push(currentScene);
          Store.createNewProjectFromImport(newData);
      }
  };
