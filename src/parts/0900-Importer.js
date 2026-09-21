
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

// --- MODULE EXPENSES V88 ---

// ========== HISTORIQUE DES MODIFICATIONS ==========
// ========== GESTION DES CONTRATS ==========
// Orgs — structures (associations / entreprises) rattachees au projet, assignables a un departement / une fonction.
const Orgs = {
    _list: () => {
        if(!Array.isArray(state.data.orgs)) state.data.orgs = [];
        return state.data.orgs;
    },

    // Instantane complet et normalise de la fiche structure (affichage lecture seule + autocompletion contrats).
    // b = sac de champs a plat (data du profil OU JSON contact) ; facets = pour le siege (hqAddress).
    _ficheFrom: (b, facets, kind) => {
        b = b || {};
        const f = (facets || {})[kind] || {};
        const sList = (obj, map) => Object.keys(map).filter(k => obj && obj[k]).map(k => map[k]).join(', ');
        if(kind === 'asso') {
            return {
                kind: 'asso',
                name: b.assoName || b.name || '', logo: b.assoLogo || b.logo || b.photo || '', type: b.assoType || '',
                siret: b.assoSiret || '', legalForm: '', year: b.assoYear || '',
                size: b.assoMembers || '', leader: b.assoPresident || '', contactPerson: b.assoContact || '',
                email: b.assoEmail || b.email || '', phone: b.assoPhone || b.phone || '', website: b.assoWebsite || b.website || '',
                hq: f.hqAddress || b.assoSiege || b.address || b.city || '',
                mission: b.assoMission || b.bio || b.description || '', activities: b.assoActivities || '',
                services: sList(b.assoServices, { formation:'Formation', ateliers:'Ateliers', networking:'Networking', casting:'Casting', materiel:'Prêt de matériel', production:'Production', diffusion:'Diffusion' }),
                facebook: b.assoFacebook || '', instagram: b.assoInstagram || '', youtube: b.assoYoutube || '', linkedin: b.assoLinkedin || '', vimeo: '', imdb: '',
                demoreel: b.assoDemoreel || (b.assoDemoreels && b.assoDemoreels[0]) || ''
            };
        }
        return {
            kind: 'ent',
            name: b.entName || b.name || '', logo: b.entLogo || b.logo || b.photo || '', type: b.entType || '',
            siret: b.entSiret || '', legalForm: b.entLegal || '', year: b.entYear || '',
            size: b.entEmployees || '', leader: b.entDirector || '', contactPerson: b.entContact || '',
            email: b.entEmail || b.email || '', phone: b.entPhone || b.phone || '', website: b.entWebsite || b.website || '',
            hq: f.hqAddress || b.entSiege || b.address || b.city || '',
            mission: b.entDescription || b.bio || b.description || '', activities: b.entServices || '',
            services: sList(b.entSpecialties, { fiction:'Fiction', doc:'Documentaire', pub:'Publicité', corporate:'Corporate', clip:'Clip', event:'Événementiel', web:'Web' }),
            facebook: b.entFacebook || '', instagram: b.entInstagram || '', youtube: b.entYoutube || '', linkedin: b.entLinkedin || '', vimeo: b.entVimeo || '', imdb: b.entImdb || '',
            demoreel: b.entDemoreel || (b.entDemoreels && b.entDemoreels[0]) || ''
        };
    },

    // Fiche normalisee a afficher : l'instantane o.fiche, ou repli depuis les anciens champs a plat (donnees legacy).
    _fiche: (o) => {
        if(o && o.fiche) return o.fiche;
        const kind = (o && o.type === 'asso') ? 'asso' : 'ent';
        return { kind: kind, name: (o && o.name) || '', logo: '', type: '', siret: '', legalForm: '', year: '', size: '', leader: '', contactPerson: '',
            email: (o && o.contact) || '', phone: (o && o.phone) || '', website: (o && o.site) || '', hq: (o && o.address) || '',
            mission: (o && o.desc) || '', activities: '', services: '', facebook: '', instagram: '', youtube: '', linkedin: '', vimeo: '', imdb: '' };
    },

    // Edition d'un champ de la fiche (structures NON liees a l'Univers uniquement).
    updateFiche: (idx, key, value) => {
        // FUSION profil (volet 2) : en mode moteur, on ecrit sur la copie jetable, sans notifier ni sauvegarder le projet.
        if(typeof PublicProfile !== 'undefined' && PublicProfile._engineMode) {
            const l = Orgs._list();
            if(!l[idx]) return;
            if(!l[idx].fiche) l[idx].fiche = Orgs._fiche(l[idx]);
            l[idx].fiche[key] = value;
            if(key === 'name') l[idx].name = value;
            return;
        }
        if(!Permissions.canEditFiche('org')) return;
        const list = Orgs._list();
        if(!list[idx]) return;
        if(list[idx].profileId) return; // P1 (audit) : structure liee a l'Univers = identite en lecture seule
        if(!list[idx].fiche) list[idx].fiche = Orgs._fiche(list[idx]);
        list[idx].fiche[key] = value;
        if(key === 'name') list[idx].name = value;
        if(key === 'email') list[idx].contact = value;
        Store.save();
        if(key === 'email' && value && value.indexOf('@') !== -1) Orgs._maybeNotify(list[idx], value.trim());
    },

    // Fonctions disponibles selon le departement (meme taxonomie que technicien : CONFIG.crewRoles + Financeurs).
    _rolesFor: (deptId) => {
        if(deptId === 'fin') return ['Financeur principal', 'Co-financeur', 'Subvention', 'Mécénat', 'Préachat', 'Partenaire', 'Autre'];
        return (typeof CONFIG !== 'undefined' && CONFIG.crewRoles && CONFIG.crewRoles[deptId]) ? CONFIG.crewRoles[deptId] : ['Autre'];
    },

    // Options du select departement : groupes crew du projet + Financeurs (+ valeur legacy eventuelle).
    _deptOptions: (selected) => {
        const groups = (state.data.groups || []).filter(g => g.type === 'crew');
        let html = '<option value="">— Département —</option>';
        groups.forEach(g => { html += `<option value="${Utils.escape(g.id)}"${g.id === selected ? ' selected' : ''}>${Utils.escape(g.name)}</option>`; });
        html += `<option value="fin"${selected === 'fin' ? ' selected' : ''}>💰 Financeurs</option>`;
        if(selected && selected !== 'fin' && !groups.some(g => g.id === selected)) html += `<option value="${Utils.escape(selected)}" selected>${Utils.escape(selected)}</option>`;
        return html;
    },

    // Changement de departement : la fonction depend du departement -> on la reinitialise.
    setDept: (idx, value) => {
        const list = Orgs._list();
        if(!list[idx]) return;
        list[idx].department = value;
        list[idx].role = '';
        list[idx].roleCustom = false;
        Store.save();
        Orgs.render();
    },

    // Choix de fonction : 'Autre' -> champ libre (comme technicien).
    onRoleChange: (idx, value) => {
        const list = Orgs._list();
        if(!list[idx]) return;
        if(value === 'Autre') { list[idx].roleCustom = true; }
        else { list[idx].roleCustom = false; list[idx].role = value; }
        Store.save();
        Orgs.render();
    },

    // Resynchronise les fiches liees a l'Univers (lecture seule), comme comedien/technicien : 1 requete groupee a l'ouverture de l'onglet.
    // Ne touche jamais a la section « Sur ce projet » (department / role / notes).
    syncFromUniverse: async () => {
        const list = Orgs._list();
        const ids = [...new Set(list.filter(o => o.profileId).map(o => o.profileId))];
        if(!ids.length) return;
        try {
            const { data, error } = await supabase.from('user_profiles').select('*').in('id', ids);
            if(error || !data) return;
            const byId = {};
            data.forEach(p => { byId[p.id] = p; });
            let changed = false;
            list.forEach(o => {
                if(!o.profileId) return;
                const p = byId[o.profileId];
                if(!p) return; // fiche introuvable (supprimee/privee) : on garde l'instantane existant
                const kind = (o.type === 'asso') ? 'asso' : 'ent';
                const fct = ((p.data || {}).facets || {})[kind] || {};
                // Casquette masquee/desactivee : on GARDE le dernier instantane et on marque hors ligne.
                const offline = fct.visible === false || fct.enabled === false;
                o._offline = offline;
                if(!offline) o.fiche = Orgs._ficheFrom(Object.assign({}, p, p.data || {}), (p.data || {}).facets, kind);
                changed = true;
            });
            if(changed) Store.save();
        } catch(e) { console.warn('[Orgs] sync Univers:', e); }
    },

    add: () => {
        Orgs._list().push({ id: Utils.generateUniqueId(), type: 'ent', name: '', address: '', phone: '', site: '', desc: '', department: '', role: '', contact: '', notes: '', srcId: null });
        Store.save();
        Orgs.render();
        Orgs.edit(Orgs._list().length - 1);
    },

    // Import depuis Mes contacts (structures enregistrees dans tes contacts)
    importFromContacts: async () => {
        try {
            const email = (state.currentUser && state.currentUser.email || '').toLowerCase();
            if(!email) return;
            const { data, error } = await supabase.from('contacts').select('*').eq('owner_email', email);
            if(error) { console.warn('[Orgs] importFromContacts:', error); Utils.toast('Impossible de lire tes contacts pour le moment.', 'error'); return; }
            const orgContacts = (data || []).filter(c => ['org', 'association', 'enterprise', 'asso', 'ent'].indexOf(c.contact_type) !== -1);
            if(!orgContacts.length) {
                Utils.toast('Aucune structure dans tes contacts pour le moment. Utilise « 🔍 Rechercher une structure » pour passer par l\u2019Univers.', 'info', 6000);
                return;
            }
            const list = Orgs._list();
            let added = 0;
            orgContacts.forEach(c => {
                if(list.some(o => (o.name || '').toLowerCase() === (c.name || '').toLowerCase())) return;
                const t = (c.contact_type === 'association' || c.contact_type === 'asso') ? 'asso' : 'ent';
                // La fiche complete est stockee en JSON dans le contact : on la copie comme depuis la recherche
                let prof = {};
                try { prof = JSON.parse(c.notes || '{}'); } catch(_) {}
                const fx = (o, keys) => { for(const k of keys) { if(o && o[k]) return o[k]; } return ''; };
                const f = ((prof.facets || {})[t === 'asso' ? 'asso' : 'ent']) || {};
                const email = (c.contact_email && c.contact_email.indexOf('@') !== -1) ? c.contact_email : (f.email || prof.email || '');
                list.push({ id: Utils.generateUniqueId(), type: t, name: c.name || '',
                    address: fx(f, ['siege', 'siegeAddress', 'address']) || prof.city || '',
                    phone: fx(f, ['phone', 'tel']) || prof.phone || '',
                    site: fx(f, ['site', 'website', 'web']) || prof.site || '',
                    desc: fx(f, ['description', 'desc', 'bio']) || '',
                    department: '', role: '', contact: email, notes: '', srcId: null,
                    fiche: Orgs._ficheFrom(prof, prof.facets, t),
                    profileId: prof.publicProfileId || c.publicProfileId || null });
                added++;
            });
            if(added) { Store.save(); Orgs.render(); }
            Utils.toast(added ? (added + ' structure(s) importée(s) de tes contacts.') : 'Toutes tes structures de contacts sont déjà dans le projet.', added ? 'success' : 'info');
        } catch(e) { console.warn('[Orgs] contacts:', e); }
    },

    // Apercu de la fiche de presentation d'une structure de l'Univers
    preview: (i) => {
        const r = Orgs._searchResults[i];
        if(!r) return;
        const old = document.getElementById('orgs-preview-modal'); if(old) old.remove();
        const modal = document.createElement('div');
        modal.id = 'orgs-preview-modal';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.85); display: flex; justify-content: center; align-items: center; z-index: var(--z-modal);';
        modal.onclick = (e) => { if(e.target === modal) modal.remove(); };
        const line = (ico, val) => val ? ('<div style="display:flex; gap:8px; font-size:0.9rem;"><span>' + ico + '</span><span>' + Utils.escape(val) + '</span></div>') : '';
        modal.innerHTML = '<div style="background: var(--panel-bg); border-radius: 12px; width: 90%; max-width: 460px; max-height: 80vh; overflow-y:auto; display: flex; flex-direction: column;">'
            + '<div style="display:flex; align-items:center; justify-content:space-between; padding:15px 20px; border-bottom:1px solid var(--border);">'
            + '<h3 style="margin:0;">' + (r.t === 'asso' ? '🏛️ ' : '🏢 ') + Utils.escape(r.name) + '</h3>'
            + '<button onclick="document.getElementById(\'orgs-preview-modal\').remove()" class="icon-btn-sec">✖</button>'
            + '</div>'
            + '<div style="padding:20px; display:flex; flex-direction:column; gap:10px;">'
            + '<div style="color:var(--text-sec); font-size:0.85rem;">' + (r.t === 'asso' ? 'Association' : 'Entreprise') + ' — fiche publique de l\u2019Univers</div>'
            + line('📍', r.address || r.city)
            + line('📧', r.email)
            + line('☎️', r.phone)
            + line('🌐', r.site)
            + (r.desc ? '<div style="font-size:0.9rem; color:var(--text-sec); white-space:pre-wrap; border-top:1px solid var(--border); padding-top:10px;">' + Utils.escape(r.desc) + '</div>' : '')
            + '<button onclick="app.Orgs.addFromUniverse(' + i + '); document.getElementById(\'orgs-preview-modal\').remove();" style="margin-top:6px; padding:10px; background:var(--primary); color:#fff; border:none; border-radius:6px; cursor:pointer;">➕ Ajouter au projet</button>'
            + '</div></div>';
        document.body.appendChild(modal);
    },

    // Recherche d'une structure dans l'Univers (fiches publiques asso / entreprise)
    _searchResults: [],
    openSearch: () => {
        const modal = document.createElement('div');
        modal.id = 'orgs-search-modal';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); display: flex; justify-content: center; align-items: center; z-index: var(--z-modal);';
        modal.onclick = (e) => { if(e.target === modal) modal.remove(); };
        modal.innerHTML = '<div style="background: var(--panel-bg); border-radius: 12px; width: 90%; max-width: 560px; max-height: 80vh; display: flex; flex-direction: column;">'
            + '<div style="display:flex; align-items:center; justify-content:space-between; padding:15px 20px; border-bottom:1px solid var(--border);">'
            + '<h3 style="margin:0;">🔍 Rechercher une structure</h3>'
            + '<button onclick="document.getElementById(\'orgs-search-modal\').remove()" class="icon-btn-sec">✖</button>'
            + '</div>'
            + '<div style="display:flex; flex-direction:column; gap:8px; padding:12px 20px;">'
            + '<input type="text" id="orgs-search-name" placeholder="Nom, ville..." data-tooltip="Nom, ville..." oninput="app.Orgs.runSearch()" style="flex:1 1 auto; min-width:0; padding:8px; border:1px solid var(--border); border-radius:6px; background:var(--bg); color:var(--text-main);">'
            + '<select id="orgs-search-type" onchange="app.Orgs.runSearch()" style="width:100%; box-sizing:border-box; padding:8px; border:1px solid var(--border); border-radius:6px; background:var(--bg); color:var(--text-main);">'
            + '<option value="">Tous types</option><option value="asso">🏛️ Associations</option><option value="ent">🏢 Entreprises</option>'
            + '</select>'
            + '</div>'
            + '<div id="orgs-search-results" style="padding: 0 20px 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 10px;"><div style="text-align:center; color:var(--text-sec); padding:20px;">🔄 Chargement...</div></div>'
            + '</div>';
        document.body.appendChild(modal);
        Orgs.runSearch();
    },

    runSearch: async () => {
        const box = document.getElementById('orgs-search-results');
        if(!box) return;
        try {
            // v578 (audit) : fonction serveur, regle du telephone appliquee en base.
            const { data, error } = await supabase.rpc('public_profiles_for_me', { p_type: null });
            if(error) { box.innerHTML = '<div style="color:var(--text-sec); text-align:center; padding:20px;">Recherche indisponible pour le moment.</div>'; return; }
            const out = [];
            (data || []).forEach(p => {
                const d = p.data || {};
                const f = d.facets || {};
                const entries = [];
                const fx = (o, keys) => { for(const k of keys) { if(o && o[k]) return o[k]; } return ''; };
                const fa = f.asso || {}, fe = f.ent || {};
                if(fa.enabled || p.profile_type === 'association') entries.push({ t: 'asso',
                    name: d.assoName || fa.name || p.name,
                    email: fa.email || d.assoEmail || '',
                    phone: fx(fa, ['phone', 'tel']) || d.assoPhone || '',
                    site: fx(fa, ['site', 'website', 'web']) || d.assoSite || '',
                    address: fx(fa, ['siege', 'siegeAddress', 'address']) || d.assoSiege || '',
                    desc: fx(fa, ['description', 'desc', 'bio']) || d.assoDesc || '',
                    fiche: Orgs._ficheFrom(Object.assign({}, p, d), f, 'asso') });
                if(fe.enabled || p.profile_type === 'enterprise') entries.push({ t: 'ent',
                    name: d.entName || fe.name || p.name,
                    email: fe.email || d.entEmail || '',
                    phone: fx(fe, ['phone', 'tel']) || d.entPhone || '',
                    site: fx(fe, ['site', 'website', 'web']) || d.entSite || '',
                    address: fx(fe, ['siege', 'siegeAddress', 'address']) || d.entSiege || '',
                    desc: fx(fe, ['description', 'desc', 'bio']) || d.entDesc || '',
                    fiche: Orgs._ficheFrom(Object.assign({}, p, d), f, 'ent') });
                entries.forEach(en => { if(en.name) out.push({ pid: p.id, t: en.t, name: en.name, city: d.city || p.city || '', email: en.email, phone: en.phone, site: en.site, address: en.address, desc: en.desc, fiche: en.fiche }); });
            });
            const q = (document.getElementById('orgs-search-name')?.value || '').toLowerCase();
            const tf = document.getElementById('orgs-search-type')?.value || '';
            let res = out;
            if(tf) res = res.filter(r => r.t === tf);
            if(q) res = res.filter(r => (r.name || '').toLowerCase().includes(q) || (r.city || '').toLowerCase().includes(q));
            Orgs._searchResults = res;
            if(!res.length) { box.innerHTML = '<div style="color:var(--text-sec); text-align:center; padding:20px;">Aucune structure trouvée dans l\u2019Univers. Tu peux en créer une vierge avec « ➕ Ajouter une structure ».</div>'; return; }
            box.innerHTML = res.map((r, i) => '<div onclick="app.Orgs.preview(' + i + ')" style="display:flex; align-items:center; gap:12px; padding:12px; background:var(--bg); border:1px solid var(--border); border-radius:8px; cursor:pointer;">'
                + '<div style="font-size:1.4rem;">' + (r.t === 'asso' ? '🏛️' : '🏢') + '</div>'
                + '<div style="flex:1;"><div style="font-weight:600;">' + Utils.escape(r.name) + '</div>'
                + (r.city ? '<div style="font-size:0.8rem; color:var(--text-sec);">📍 ' + Utils.escape(r.city) + '</div>' : '')
                + '<div style="font-size:0.75rem; color:var(--text-sec);">Clique pour voir la fiche</div>'
                + '</div><button onclick="event.stopPropagation(); app.Orgs.addFromUniverse(' + i + ')" class="chub-btn">➕ Ajouter</button></div>').join('');
        } catch(e) { box.innerHTML = '<div style="color:var(--text-sec); text-align:center; padding:20px;">Erreur de recherche.</div>'; }
    },

    addFromUniverse: (i) => {
        const r = Orgs._searchResults[i];
        if(!r) return;
        const list = Orgs._list();
        if(list.some(o => (o.profileId && o.profileId === r.pid && o.type === r.t) || ((o.name || '').toLowerCase() === (r.name || '').toLowerCase())) ) {
            Utils.toast('Cette structure est déjà dans le projet.', 'warning');
            return;
        }
        // La fiche structure de la casquette est COPIEE dans le projet (comme une fiche comedien)
        list.push({ id: Utils.generateUniqueId(), type: r.t, name: r.name || '', address: r.address || r.city || '', phone: r.phone || '', site: r.site || '', desc: r.desc || '', department: '', role: '', contact: r.email || '', notes: '', srcId: null, profileId: r.pid, fiche: r.fiche || null });
        Store.save();
        Orgs.render();
        const modal = document.getElementById('orgs-search-modal'); if(modal) modal.remove();
        Utils.toast(Utils.escape(r.name) + ' ajoutée au projet !', 'success');
        if(r.email) {
            setTimeout(() => { Orgs._maybeNotify(list[list.length - 1], r.email); }, 300);
        }
    },

    update: (idx, field, value) => {
        // FUSION profil (volet 2) : en mode moteur, ecriture sur la copie jetable, aucun effet projet.
        if(typeof PublicProfile !== 'undefined' && PublicProfile._engineMode) {
            const l = Orgs._list();
            if(l[idx]) l[idx][field] = value;
            return;
        }
        if(!Permissions.canEditFiche('org')) return;
        const list = Orgs._list();
        if(!list[idx]) return;
        const before = list[idx][field];
        list[idx][field] = value;
        Store.save();
        if(field === 'type') { if(list[idx].fiche) list[idx].fiche.kind = (value === 'asso' ? 'asso' : 'ent'); Orgs.render(); }
        // Meme logique que comediens/techniciens : email saisi -> si un compte existe, proposer de prevenir
        if(field === 'contact' && value && value !== before && value.indexOf('@') !== -1) {
            Orgs._maybeNotify(list[idx], value.trim());
        }
    },

    _maybeNotify: async (org, email) => {
        try {
            const { data, error } = await supabase.from('user_profiles').select('id, name').ilike('email', email).limit(1);
            if(error) { console.warn('[Orgs] _maybeNotify:', error); return; }
            if(!data || !data.length) return; // pas de compte : rien a envoyer
            const ok = await ConfirmModal.show({ title: 'Prévenir cette structure ?', message: 'Un compte existe pour ' + email + '. Lui envoyer une notification pour l\u2019informer que sa structure a été ajoutée au projet ?', icon: '📧', confirmText: 'Envoyer' });
            if(!ok) return;
            const projectTitle = document.getElementById('projectTitle')?.value || 'Un projet';
            const senderName = state.userProfile?.displayName || state.currentUser?.email?.split('@')[0] || 'Quelqu\u2019un';
            await Notifications.send(email, 'invite', senderName + ' a ajouté votre structure au projet "' + projectTitle + '"', state.currentProjectId);
            await Messages.sendEmailPing(email, org.name || email.split('@')[0], 'invitation', { senderName: senderName, projectTitle: projectTitle, role: 'structure partenaire' });
            Utils.toast('Notification envoyée !', 'success');
        } catch(e) { console.warn('[Orgs] notification structure:', e); }
    },

    // Suppression DEFINITIVE : cet onglet est le pole des structures. Supprimer ici retire
    // aussi la structure des Partenaires de la Presentation (la Presentation n'est qu'une vitrine).
    remove: async (idx) => {
        // FUSION profil (volet 2) : pas de suppression depuis la fiche profil.
        if(typeof PublicProfile !== 'undefined' && PublicProfile._engineMode) return;
        const list = Orgs._list();
        if(!list[idx]) return;
        const o = list[idx];
        const name = o.name || 'cette structure';
        const pres = state.data.presentation || {};
        const isPartner = !!(o.srcId && (
            (pres.associations || []).some(p => p && p.id === o.srcId)
            || (pres.enterprises || []).some(p => p && p.id === o.srcId)
        ));
        const msg = isPartner
            ? 'Supprimer définitivement ' + name + ' ? Elle sera aussi retirée des Partenaires du Projet (Présentation).'
            : 'Supprimer définitivement ' + name + ' du projet ?';
        if(!(await ConfirmModal.confirmDelete(msg))) return;
        if(isPartner) {
            if(Array.isArray(pres.associations)) pres.associations = pres.associations.filter(p => !p || p.id !== o.srcId);
            if(Array.isArray(pres.enterprises)) pres.enterprises = pres.enterprises.filter(p => !p || p.id !== o.srcId);
            state.data.presentation = pres;
            try { if(typeof Presentation !== 'undefined' && typeof Presentation.renderPartners === 'function') Presentation.renderPartners(); } catch(_) {}
        }
        list.splice(idx, 1);
        Store.save();
        Orgs.render();
    },

    render: () => {
        const host = document.getElementById('orgs-list');
        if(!host) return;
        GroupDnD.init();
        const list = Orgs._list();

        // Datalist des departements : ceux de l'equipe + classiques
        const deps = {};
        (state.data.crew || []).forEach(c => { if(c.department) deps[c.department] = true; });
        ['Réalisation', 'Image', 'Son', 'Lumière', 'Régie', 'Décors', 'Costumes', 'Maquillage', 'Montage', 'Post-production', 'Production', 'Communication', 'Financeurs'].forEach(d => { deps[d] = true; });
        const dl = '<datalist id="orgs-deps">' + Object.keys(deps).sort((a, b) => a.localeCompare(b, 'fr')).map(d => '<option value="' + Utils.escape(d) + '"></option>').join('') + '</datalist>';

        // REGLE : tout partenaire de la Presentation est AUTOMATIQUEMENT present ici.
        // (L'inverse n'est pas vrai : on peut avoir des structures hors partenaires.)
        const pres = state.data.presentation || {};
        const already = {};
        list.forEach(o => { if(o.srcId) already[o.srcId] = true; already[o.id] = true; });
        let autoAdded = false;
        const considerAuto = (p, t) => {
            if(!p || !p.id || already[p.id]) return;
            list.push({ id: Utils.generateUniqueId(), type: t, name: p.name || '', department: '', role: '', contact: '', notes: '', srcId: p.id });
            already[p.id] = true;
            autoAdded = true;
        };
        (pres.associations || []).forEach(p => considerAuto(p, 'asso'));
        (pres.enterprises || []).forEach(p => considerAuto(p, 'ent'));
        if(autoAdded) { try { Store.save(); } catch(_) {} }
        const importHtml = '';

        if(!list.length && !importHtml) {
            host.innerHTML = dl + '<div style="padding:40px; text-align:center; color:var(--text-sec);">Aucune structure pour le moment — « ➕ Ajouter une structure », ou déclare des partenaires dans Présentation.</div>';
            return;
        }

const orgGroups = (state.data.groups || []).filter(g => g.type === 'org');
        const esc = Utils.escape;
        const isView = state.currentRole === 'viewer';
        const cardHtml = (o, i) => {
            const fc = Orgs._fiche(o);
            const icon = (fc.kind === 'asso') ? '🏛️' : '🏢';
            const typeLabel = (fc.kind === 'asso') ? 'Association' : 'Entreprise';
            const logo = fc.logo ? `<img src="${esc(fc.logo)}" alt="">` : icon;
            let opts = '<option value="">-- Groupe --</option>';
            orgGroups.forEach(g => { opts += `<option value="${g.id}" ${o.group_id === g.id ? 'selected' : ''}>${esc(g.name)}</option>`; });
            const actions = isView ? '' : `
                <div class="compact-card-actions">
                    <button class="edit-btn" onclick="event.stopPropagation(); app.Orgs.edit(${i})" title="Modifier">✏️</button>
                    <button class="delete-btn" onclick="event.stopPropagation(); app.Orgs.remove(${i})" title="Supprimer">🗑️</button>
                    <div class="group-round-wrap" title="Changer de groupe"><button class="group-btn" type="button" tabindex="-1">👥</button><select class="group-round-select" onclick="event.stopPropagation();" onchange="event.stopPropagation(); app.Actions.changeGroup('orgs', ${i}, this.value)">${opts}</select></div>
                    <button class="web-btn" onclick="event.stopPropagation(); app.Web.open('org', '${o.id}')" title="Voir dans la toile">🕸️</button>
                </div>`;
            const dnd = isView ? '' : ` draggable="true" data-dnd-coll="orgs" data-dnd-idx="${i}"`;
            return `<div class="compact-card" data-fiche="org:${Utils.escape(String(o.id || ''))}"${dnd} onclick="app.Orgs.edit(${i})">${actions}${o._offline ? '<div class="compact-card-badge card-offline" title="Hors ligne — masqué de l’Univers">🚧</div>' : ''}<div class="compact-card-photo">${logo}</div><div class="compact-card-name">${esc(fc.name || o.name || 'Sans nom')}</div><div class="compact-card-role">${typeLabel}</div></div>`;
        };
        const idxPairs = list.map((o, i) => [o, i]);
        let sections = '';
        orgGroups.forEach(grp => {
            const inG = idxPairs.filter(p => p[0].group_id === grp.id);
            if(inG.length || !isView) sections += `<div class="group-section${inG.length ? '' : ' dnd-empty-target'}"><div class="group-header">${esc(grp.name)}${GroupDnD.delBtnHtml('orgs', grp.id, isView)}</div><div class="compact-cards-grid" data-dnd-coll="orgs" data-dnd-group="${grp.id}">` + inG.map(p => cardHtml(p[0], p[1])).join('') + `</div></div>`;
        });
        const noG = idxPairs.filter(p => !p[0].group_id || !orgGroups.find(g => g.id === p[0].group_id));
        if(noG.length) sections += `<div class="group-section"><div class="group-header text-sec">Non classé</div><div class="compact-cards-grid" data-dnd-coll="orgs" data-dnd-group="">` + noG.map(p => cardHtml(p[0], p[1])).join('') + `</div></div>`;
        host.innerHTML = dl + importHtml + sections;
    },
    edit: (i) => {
        const o = Orgs._list()[i]; if(!o) return;
        const modal = document.getElementById('card-edit-modal');
        const body = document.getElementById('card-edit-modal-body');
        const titleEl = document.getElementById('card-edit-modal-title');
        const fc = Orgs._fiche(o);
        const ic = (fc.kind === 'asso') ? '🏛️' : '🏢';
        if(titleEl) titleEl.textContent = ic + ' ' + ((fc.kind === 'asso') ? 'Association' : 'Entreprise');
        // v601 : voir Resources.edit — la structure se modifie dans cette
        // fenetre, pas sur sa carte. L'identifiant se pose donc ici.
        if(body) body.innerHTML = '<div class="fiche-fenetre" data-fiche="org:'
            + Utils.escape(String(o.id || '')) + '">' + Orgs._detailHtml(o, i) + '</div>';
        CardModal.applyRights('org');
        if(modal) modal.classList.add('visible');
        if(body) requestAnimationFrame(() => { try { FicheBlocks.balance(body); } catch(e) {} });
    },
    // Upload du logo de la structure (bucket avatars public, compression 800px), cote projet ET profil.
    uploadLogo: async (idx, input) => {
        if(!input || !input.files || !input.files[0]) return;
        const file = input.files[0]; input.value = '';
        if(!file.type.startsWith('image/')) { Utils.toast('Fichier image invalide.', 'warning'); return; }
        if(file.size > 5 * 1024 * 1024) { Utils.toast('Fichier trop volumineux (max 5 Mo).', 'warning'); return; }
        Utils.toast('Envoi du logo…', 'info', 1500);
        try {
            const blob = await PublicProfile.compressImageToBlob(file, 800, 0.8);
            const userId = state.currentUser.id;
            const filePath = userId + '/orglogo_' + Date.now() + '.jpg';
            const { error } = await supabase.storage.from('avatars').upload(filePath, blob, { contentType: 'image/jpeg', upsert: true });
            if(error) throw error;
            const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
            const url = (urlData && urlData.publicUrl) ? urlData.publicUrl : '';
            if(!url) throw new Error('URL vide');
            const list = Orgs._list();
            if(!list[idx]) return;
            if(!list[idx].fiche) list[idx].fiche = Orgs._fiche(list[idx]);
            list[idx].fiche.logo = url;
            if(typeof PublicProfile !== 'undefined' && PublicProfile._engineMode) {
                PublicProfile._orgEngineRerenderCard();
            } else {
                Store.save();
                Orgs.edit(idx);
            }
            Utils.toast('Logo mis à jour.', 'success');
        } catch(e) { console.warn('[Orgs] logo:', e); Utils.toast('Erreur envoi logo : ' + ((e && e.message) || 'inconnue'), 'error'); }
    },

    _detailHtml: (o, i) => {
            const esc = Utils.escape;
            const linked = !!o.profileId;
            const fc = Orgs._fiche(o);
            const icon = (fc.kind === 'asso') ? '🏛️' : '🏢';
            const typeLabel = (fc.kind === 'asso') ? 'Association' : 'Entreprise';

            // En-tete au gabarit fiche d'identite universelle (v581).
            const avatarInner = fc.logo ? `<img src="${Utils.safeMediaUrl(fc.logo)}" alt="">` : icon;
            const avatarHtml = linked
                ? `<div class="fid-avatar">${avatarInner}</div>`
                : `<div class="fid-avatar" style="cursor:pointer; position:relative;" onclick="event.stopPropagation(); document.getElementById('org-logo-input-${esc(String(i))}').click()" title="Changer le logo">${avatarInner}<span style="position:absolute; right:-2px; bottom:-2px; font-size:0.85rem;">🖼️</span><input type="file" id="org-logo-input-${esc(String(i))}" accept="image/*" style="display:none;" onchange="app.Orgs.uploadLogo(${i}, this)"></div>`;
            const nameHtml = linked
                ? `<div class="fid-name">${esc(fc.name || o.name || 'Sans nom')}</div>`
                : `<input type="text" class="fid-name" value="${esc(fc.name || o.name || '')}" placeholder="Nom de la structure" data-tooltip="Nom de la structure" onclick="event.stopPropagation()" onchange="app.Orgs.updateFiche(${i}, 'name', this.value)">`;
            const delTitle = linked ? 'Retirer du projet' : 'Supprimer définitivement';
            const roBadge = linked ? FicheUI.badge('🔒 lecture seule') : '';
            const head = `<div class="fid-head">
                ${avatarHtml}
                <div class="fid-head-main">${nameHtml}<div class="fid-sub">${typeLabel} · fiche n° ${esc(String(o.id || ''))}</div></div>
                <div class="fid-head-side">${o._offline ? FicheUI.badge('🚧 Hors ligne') : ''}${roBadge}<button onclick="app.Orgs.remove(${i})" title="${delTitle}" style="background:none; border:none; cursor:pointer; font-size:1.1rem; color:var(--text-sec);">🗑</button></div>
            </div>`;

            // Colonne gauche : IDENTITE (type + fiche structure).
            let typeField = '';
            if(!linked) {
                typeField = FicheUI.field('Type de structure', `<select onchange="app.Orgs.update(${i}, 'type', this.value)" class="actor-input">
                    <option value="ent"${o.type !== 'asso' ? ' selected' : ''}>🏢 Entreprise</option>
                    <option value="asso"${o.type === 'asso' ? ' selected' : ''}>🏛️ Association</option></select>`);
            }
            const st = 'width:100%; box-sizing:border-box; padding:8px; border:1px solid var(--border); border-radius:6px; background:var(--bg); color:var(--text-main);';
            const inp = (key) => `<input type="text" value="${esc(fc[key] || '')}" onchange="app.Orgs.updateFiche(${i}, '${key}', this.value)" style="${st}">`;
            const F = FicheUI.field;
            let idHtml, ctHtml, rxHtml;
            if(linked) {
                const roRow = (ic, label, val) => val ? `<div style="display:flex; gap:8px; font-size:0.88rem; padding:2px 0;"><span style="opacity:0.7; flex:0 0 18px;">${ic}</span><span style="color:var(--text-sec); flex:0 0 96px;">${label}</span><span style="color:var(--text-main); word-break:break-word;">${esc(val)}</span></div>` : '';
                const href = (u) => esc(u.indexOf('http') === 0 ? u : 'https://' + u);
                const link = (ic, label, u) => u ? `<div style="display:flex; gap:8px; font-size:0.88rem; padding:2px 0;"><span style="opacity:0.7; flex:0 0 18px;">${ic}</span><span style="color:var(--text-sec); flex:0 0 96px;">${label}</span><a href="${href(u)}" target="_blank" rel="noopener" style="color:var(--primary); word-break:break-all;">${esc(u)}</a></div>` : '';
                const social = [['Facebook', fc.facebook], ['Instagram', fc.instagram], ['LinkedIn', fc.linkedin], ['YouTube', fc.youtube], ['Vimeo', fc.vimeo], ['IMDb', fc.imdb]].filter(sx => sx[1]);
                const box = (inner) => inner ? `<div style="background:var(--bg); border:1px solid var(--border); border-radius:8px; padding:10px 12px;">${inner}</div>` : '';
                idHtml = box(roRow('🏷\uFE0F', 'Type', fc.type) + roRow('🔢', (fc.kind === 'asso' ? 'RNA / SIRET' : 'SIRET'), fc.siret) + roRow('\u2696\uFE0F', 'Forme', fc.legalForm) + roRow('📅', 'Ann\u00e9e', fc.year) + roRow('👥', (fc.kind === 'asso' ? 'Membres' : 'Effectif'), fc.size) + roRow('👤', (fc.kind === 'asso' ? 'Pr\u00e9sident\u00b7e' : 'Dirigeant\u00b7e'), fc.leader) + (fc.mission ? `<div style="font-size:0.88rem; color:var(--text-main); white-space:pre-wrap; margin-top:4px;">${esc(fc.mission)}</div>` : '') + roRow('🛠\uFE0F', 'Activit\u00e9s', fc.activities) + roRow('\u2728', 'Services', fc.services));
                ctHtml = box(roRow('🧑', 'Contact', fc.contactPerson) + roRow('📧', 'Email', fc.email) + roRow('\u260E\uFE0F', 'T\u00e9l\u00e9phone', fc.phone) + roRow('📍', 'Si\u00e8ge', fc.hq) + link('🌐', 'Site', fc.website));
                rxHtml = box(link('🎬', 'D\u00e9mo', fc.demoreel) + (social.length ? `<div style="border-top:1px solid var(--border); margin-top:6px; padding-top:6px; font-size:0.82rem;">` + social.map(sx => `<a href="${href(sx[1])}" target="_blank" rel="noopener" style="color:var(--primary);">${sx[0]}</a>`).join(' \u00b7 ') + `</div>` : ''));
            } else {
                idHtml = typeField
                       + F((fc.kind === 'asso' ? '🔢 RNA / SIRET' : '🔢 SIRET'), inp('siret'))
                       + (fc.kind === 'ent' ? F('\u2696\uFE0F Forme juridique', inp('legalForm')) : '')
                       + F('📅 Ann\u00e9e de cr\u00e9ation', inp('year'))
                       + F((fc.kind === 'asso' ? '👥 Nb de membres' : '👥 Effectif'), inp('size'))
                       + F((fc.kind === 'asso' ? '👤 Pr\u00e9sident\u00b7e' : '👤 Dirigeant\u00b7e'), inp('leader'))
                       + F((fc.kind === 'asso' ? 'Mission / objet' : 'Description'), `<textarea onchange="app.Orgs.updateFiche(${i}, 'mission', this.value)" style="${st} min-height:44px; resize:vertical;">${esc(fc.mission || '')}</textarea>`)
                       + F('🛠\uFE0F Activit\u00e9s / prestations', `<textarea onchange="app.Orgs.updateFiche(${i}, 'activities', this.value)" style="${st} min-height:40px; resize:vertical;">${esc(fc.activities || '')}</textarea>`);
                ctHtml = F('📧 Email de contact', inp('email'))
                       + F('\u260E\uFE0F T\u00e9l\u00e9phone', inp('phone'))
                       + F('🌐 Site internet', inp('website'))
                       + F('📍 Si\u00e8ge / adresse', inp('hq'))
                       + F('🧑 Personne \u00e0 contacter', inp('contactPerson'));
                rxHtml = F('🎬 Bande d\u00e9mo (URL YouTube / Vimeo)', inp('demoreel'))
                       + (fc.demoreel ? `<div style="margin:2px 0 8px;"><iframe src="${ProfileRenderer.getEmbedUrl(fc.demoreel)}" width="100%" height="180" frameborder="0" allowfullscreen style="border-radius:8px;"></iframe></div>` : '')
                       + F('📘 Facebook', inp('facebook')) + F('📷 Instagram', inp('instagram')) + F('\u25B6\uFE0F YouTube', inp('youtube')) + F('💼 LinkedIn', inp('linkedin'))
                       + (fc.kind === 'ent' ? F('🎞\uFE0F Vimeo', inp('vimeo')) + F('🎬 IMDb', inp('imdb')) : '');
            }

            // Colonne droite : SUR CE PROJET (departement -> fonction + notes) + couts.
            const deptId = o.department || '';
            const roles = Orgs._rolesFor(deptId);
            const showFree = !!o.roleCustom || (!!o.role && roles.indexOf(o.role) === -1);
            const roleSel = showFree ? 'Autre' : (o.role || '');
            const roleOpts = `<option value="">— Fonction —</option>` + roles.map(r => `<option value="${esc(r)}"${r === roleSel ? ' selected' : ''}>${esc(r)}</option>`).join('');
            const project = F('Département', `<select onchange="app.Orgs.setDept(${i}, this.value)" style="${st}">${Orgs._deptOptions(deptId)}</select>`)
                + F('Fonction', `<select onchange="app.Orgs.onRoleChange(${i}, this.value)" style="${st}">${roleOpts}</select>`)
                + (showFree ? F('Préciser la fonction', `<input type="text" value="${esc(o.role || '')}" onchange="app.Orgs.update(${i}, 'role', this.value)" style="${st}">`) : '')
                + F('Notes projet', `<textarea placeholder="Périmètre, devis, dates..." data-tooltip="Périmètre, devis, dates..." onchange="app.Orgs.update(${i}, 'notes', this.value)" style="${st} min-height:50px; resize:vertical;">${esc(o.notes || '')}</textarea>`);

            const footer = `<div style="font-size:0.78rem; color:var(--text-sec);">${icon} ${o.srcId ? 'Importée des partenaires de la Présentation' : (linked ? 'Fiche liée à l\u2019Univers' : 'Structure ajoutée manuellement')}</div>`;

            const oblocks = [];
            // Brique « Sur ce projet » — epinglee a droite (une structure
            // n'apparait pas dans des scenes, c'est le lien projet qui prime).
            oblocks.push(FicheUI.block('org', 'projet', '🎬 Sur ce projet', project + UI.renderCost('org', o.id), { pin: 'right' }));
            // Briques structure splittees en onglets (comme comedien/technicien).
            oblocks.push(FicheUI.block('org', 'fiche', '🏛️ Identité', idHtml));
            if(ctHtml) oblocks.push(FicheUI.block('org', 'contact', '📇 Contact', ctHtml));
            if(rxHtml) oblocks.push(FicheUI.block('org', 'reseaux', '🔗 Présence & réseaux', rxHtml));
            // Brique « Origine » (petite ligne d'info).
            oblocks.push(FicheUI.block('org', 'origine', 'ℹ️ Origine', footer));

            return `<div class="data-card fid-card chub-card" style="max-width:none; margin:0; box-shadow:none; padding:0;">
                ${head}
                ${FicheBlocks.renderTabbed(oblocks, 'org')}
            </div>`;
    },
    openExportModal: () => {
        const list = Orgs._list();
        if(!list.length) { Utils.toast('Aucune structure à exporter', 'warning'); return; }
        Actions.openExportModal('orgs');
        document.querySelectorAll('#export-modal .exp-section-chk').forEach(cb => {
            cb.checked = (cb.dataset.section === 'orgs');
        });
    },
    exportPDF: async (opts = {}) => {
        await LazyLib.load('pdfexport'); const { jsPDF } = window.jspdf;
        opts.mode = opts.mode || 'list';
        const isCard = opts.mode === 'card';
        const doc = new jsPDF(isCard ? 'l' : 'p', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 20;
        const usableWidth = pageWidth - margin * 2;
        const cleanT = (t) => (typeof PdfTheme !== 'undefined' && PdfTheme.cleanText) ? PdfTheme.cleanText(t || '') : (t || '');

        const list = Orgs._list();
        if(!list.length) { Utils.toast('Aucune structure à exporter', 'warning'); return; }
        const orgGroups = (state.data.groups || []).filter(g => g.type === 'org');

        let photoMap = {};
        if(opts.mode !== 'list' && typeof FichesPDF !== 'undefined' && FichesPDF._preloadImages) {
            photoMap = await FichesPDF._preloadImages(list.map(o => Orgs._fiche(o).logo).filter(Boolean));
        }

        if(opts.includeCover !== false) {
            if(typeof FichesPDF !== 'undefined' && FichesPDF._drawCoverPage) FichesPDF._drawCoverPage(doc, 'Asso / Entreprises');
            else if(typeof PdfTheme !== 'undefined' && PdfTheme.coverPage) PdfTheme.coverPage(doc, { sectionName: 'Asso / Entreprises' });
            doc.addPage();
        }
        let y = margin;
        const ensureSpace = (h) => { if(y + h > pageHeight - margin) { doc.addPage(); y = margin; } };

        const grouped = {};
        list.forEach(o => { const gid = (o.group_id && orgGroups.find(g => g.id === o.group_id)) ? o.group_id : 'orphan'; (grouped[gid] = grouped[gid] || []).push(o); });
        const groupOrder = orgGroups.map(g => g.id).filter(id => grouped[id]);
        if(grouped['orphan']) groupOrder.push('orphan');

        const drawGroupHeader = (name, count) => {
            ensureSpace(14);
            y = PdfTheme.sectionBand(doc, { x: margin, y, width: usableWidth,
                                            title: cleanT(name), right: String(count),
                                            accent: PdfTheme.accentFor('Asso / Entreprises') });
        };

        const drawPhoto = (url, x, py, w, h) => {
            if(typeof FichesPDF !== 'undefined' && FichesPDF._drawPhotoOrPlaceholder) FichesPDF._drawPhotoOrPlaceholder(doc, url, x, py, w, h);
            else { doc.setFillColor(...PdfTheme.COLORS.BORDER_LIGHT); doc.rect(x, py, w, h, 'F'); }
        };

        const renderDetailed = (o) => {
            const fc = Orgs._fiche(o);
            ensureSpace(48);
            const photoW = 28, photoH = 36;
            drawPhoto(fc.logo ? photoMap[fc.logo] : null, margin, y, photoW, photoH);
            const textX = margin + photoW + 5;
            const textWidth = usableWidth - photoW - 7;
            let ty = y + 5;
            doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_DARK);
            doc.text(cleanT(fc.name || o.name) || '(sans nom)', textX, ty);
            ty += 5;
            doc.setFont('helvetica', 'italic'); doc.setFontSize(9.5);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_MUTED);
            doc.text([orgType(o), cleanT(fc.type)].filter(Boolean).join('  ·  '), textX, ty); ty += 4.4;
            const legalBits = [];
            if(fc.siret) legalBits.push((fc.kind === 'asso' ? 'RNA/SIRET : ' : 'SIRET : ') + cleanT(fc.siret));
            if(fc.legalForm) legalBits.push('Forme : ' + cleanT(fc.legalForm));
            if(fc.year) legalBits.push('Année : ' + cleanT(fc.year));
            if(fc.size) legalBits.push((fc.kind === 'asso' ? 'Membres : ' : 'Effectif : ') + cleanT(fc.size));
            if(fc.leader) legalBits.push((fc.kind === 'asso' ? 'Président·e : ' : 'Dirigeant·e : ') + cleanT(fc.leader));
            if(legalBits.length) {
                doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
                doc.splitTextToSize(legalBits.join('   ·   '), textWidth).slice(0, 2).forEach(line => { doc.text(line, textX, ty); ty += 3.6; });
            }
            const contactBits = [];
            if(fc.email) contactBits.push('Email : ' + fc.email);
            if(fc.phone) contactBits.push('Tél : ' + fc.phone);
            if(fc.hq) contactBits.push('Siège : ' + cleanT(fc.hq));
            if(contactBits.length) {
                doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
                doc.splitTextToSize(contactBits.join('   ·   '), textWidth).slice(0, 2).forEach(line => { doc.text(line, textX, ty); ty += 3.8; });
            }
            if(fc.mission) {
                doc.setFont('helvetica', 'italic'); doc.setFontSize(8);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
                doc.splitTextToSize(cleanT(fc.mission), textWidth).slice(0, 2).forEach(line => { doc.text(line, textX, ty); ty += 3.4; });
            }
            if(o.role) {
                doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_DARK);
                doc.text('Sur le projet : ' + cleanT(o.role), textX, ty); ty += 3.6;
            }
            const actualH = Math.max(photoH + 4, ty - y + 2);
            doc.setDrawColor(...PdfTheme.COLORS.BORDER);
            doc.setLineWidth(0.2);
            doc.rect(margin - 2, y - 2, usableWidth + 4, actualH);
            y += actualH + 3;
        };

        const renderCard = (o) => {
            const fc = Orgs._fiche(o);
            const photoUrl = fc.logo ? photoMap[fc.logo] : null;
            doc.setFillColor(...PdfTheme.COLORS.BANNER_DARK);
            doc.rect(0, 0, pageWidth, 16, 'F');
            doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
            doc.setTextColor(...PdfTheme.COLORS.WHITE);
            doc.text(orgType(o).toUpperCase(), margin, 11);
            doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
            doc.text(cleanT(state.data.title || ''), pageWidth - margin, 11, { align: 'right' });
            const photoW2 = 75, photoH2 = 100;
            const photoX = margin, photoY = 28;
            drawPhoto(photoUrl, photoX, photoY, photoW2, photoH2);
            const infoX = photoX + photoW2 + 12;
            const infoW = pageWidth - infoX - margin;
            let iy = photoY + 6;
            doc.setFont('helvetica', 'bold'); doc.setFontSize(22);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_DARK);
            doc.splitTextToSize(cleanT(fc.name || o.name) || '(sans nom)', infoW).forEach(l => { doc.text(l, infoX, iy); iy += 8; });
            iy += 2;
            if(fc.type) {
                doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
                doc.text('ACTIVITÉ', infoX, iy); iy += 4;
                doc.setFont('helvetica', 'normal'); doc.setFontSize(12);
                doc.setTextColor(...PdfTheme.COLORS.BANNER_DARK);
                doc.text(cleanT(fc.type), infoX, iy); iy += 7;
            }
            const idBits = [];
            if(fc.siret) idBits.push((fc.kind === 'asso' ? 'RNA/SIRET : ' : 'SIRET : ') + cleanT(fc.siret));
            if(fc.legalForm) idBits.push('Forme : ' + cleanT(fc.legalForm));
            if(fc.year) idBits.push('Année : ' + cleanT(fc.year));
            if(fc.size) idBits.push((fc.kind === 'asso' ? 'Membres : ' : 'Effectif : ') + cleanT(fc.size));
            if(fc.leader) idBits.push((fc.kind === 'asso' ? 'Président·e : ' : 'Dirigeant·e : ') + cleanT(fc.leader));
            if(idBits.length) {
                doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
                doc.text('IDENTIFICATION', infoX, iy); iy += 4;
                doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_PRIMARY);
                idBits.forEach(b => { doc.splitTextToSize(b, infoW).forEach(l => { doc.text(l, infoX, iy); iy += 4.2; }); });
                iy += 3;
            }
            const contactBits = [];
            if(fc.email) contactBits.push('Email : ' + fc.email);
            if(fc.phone) contactBits.push('Tél : ' + fc.phone);
            if(fc.contactPerson) contactBits.push('Contact : ' + cleanT(fc.contactPerson));
            if(fc.hq) contactBits.push('Siège : ' + cleanT(fc.hq));
            if(fc.website) contactBits.push('Site : ' + fc.website);
            if(contactBits.length) {
                doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
                doc.text('CONTACT', infoX, iy); iy += 4;
                doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_PRIMARY);
                contactBits.forEach(b => { doc.splitTextToSize(b, infoW).slice(0, 2).forEach(l => { doc.text(l, infoX, iy); iy += 4.2; }); });
                iy += 3;
            }
            if(fc.mission) {
                doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
                doc.text(fc.kind === 'asso' ? 'MISSION / OBJET' : 'DESCRIPTION', infoX, iy); iy += 4;
                doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_PRIMARY);
                doc.splitTextToSize(cleanT(fc.mission), infoW).forEach(l => { if(iy < pageHeight - 40) { doc.text(l, infoX, iy); iy += 4.2; } });
            }
            const bottomY = pageHeight - 30;
            doc.setLineWidth(0.3);
            doc.setDrawColor(...PdfTheme.COLORS.BORDER_DARK);
            doc.line(margin, bottomY - 4, pageWidth - margin, bottomY - 4);
            doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
            doc.text('SUR LE PROJET', margin, bottomY);
            doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_PRIMARY);
            doc.text(cleanT(o.role) || '—', margin, bottomY + 5);
            const rightX = pageWidth / 2 + 5;
            doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
            doc.text('GROUPE', rightX, bottomY);
            doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_PRIMARY);
            const grp = orgGroups.find(g => g.id === o.group_id);
            doc.text(grp ? cleanT(grp.name) : 'Non classé', rightX, bottomY + 5);
        };

        const orgType = (o) => (Orgs._fiche(o).kind === 'asso') ? 'Association' : 'Entreprise';
        const orgContact = (o) => { const fc = Orgs._fiche(o); return fc.email || fc.phone || fc.contactPerson || ''; };

        const renderList = (items) => {
            const lineH = 5.5;
            ensureSpace(lineH);
            doc.setFillColor(...PdfTheme.COLORS.BORDER_LIGHT);
            doc.rect(margin, y, usableWidth, lineH, 'F');
            doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_MUTED);
            const colsW = [usableWidth * 0.30, usableWidth * 0.18, usableWidth * 0.32, usableWidth * 0.20];
            const colsX = [margin];
            for(let i = 1; i < colsW.length; i++) colsX.push(colsX[i-1] + colsW[i-1]);
            doc.text('Nom', colsX[0] + 1, y + 3.8);
            doc.text('Type', colsX[1] + 1, y + 3.8);
            doc.text('Contact', colsX[2] + 1, y + 3.8);
            doc.text('Fonction', colsX[3] + 1, y + 3.8);
            y += lineH + 1;
            items.forEach(o => {
                ensureSpace(lineH);
                const fc = Orgs._fiche(o);
                doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_DARK);
                let txtName = cleanT(fc.name || o.name) || '(sans nom)';
                while(doc.getTextWidth(txtName) > colsW[0] - 2 && txtName.length > 4) txtName = txtName.substring(0, txtName.length - 2) + '…';
                doc.text(txtName, colsX[0] + 1, y + 3.8);
                doc.setFont('helvetica', 'normal'); doc.setTextColor(...PdfTheme.COLORS.TEXT_MUTED);
                doc.text(orgType(o), colsX[1] + 1, y + 3.8);
                let txtContact = cleanT(orgContact(o)) || '—';
                while(doc.getTextWidth(txtContact) > colsW[2] - 2 && txtContact.length > 5) txtContact = txtContact.substring(0, txtContact.length - 2) + '…';
                doc.text(txtContact, colsX[2] + 1, y + 3.8);
                let txtRole = cleanT(o.role) || '—';
                while(doc.getTextWidth(txtRole) > colsW[3] - 2 && txtRole.length > 3) txtRole = txtRole.substring(0, txtRole.length - 2) + '…';
                doc.text(txtRole, colsX[3] + 1, y + 3.8);
                doc.setDrawColor(...PdfTheme.COLORS.BORDER_LIGHT); doc.setLineWidth(0.1);
                doc.setLineDashPattern([0.5, 0.5], 0);
                doc.line(margin, y + lineH, margin + usableWidth, y + lineH);
                doc.setLineDashPattern([], 0);
                y += lineH;
            });
            y += 2;
        };

        if(opts.mode === 'card') {
            list.forEach((o, idx) => { if(idx > 0) doc.addPage(); renderCard(o); });
        } else {
        groupOrder.forEach((gid) => {
            const grp = orgGroups.find(g => g.id === gid);
            drawGroupHeader(grp ? grp.name : 'Non classé', grouped[gid].length);
            if(opts.mode === 'list') renderList(grouped[gid]);
            else grouped[gid].forEach(o => renderDetailed(o));
            y += 2;
        });
        }

        if(typeof FichesPDF !== 'undefined' && FichesPDF._drawFooters) FichesPDF._drawFooters(doc, opts.includeCover !== false, !!opts.returnBlob);
        else if(typeof PdfTheme !== 'undefined' && PdfTheme.applyFooters) PdfTheme.applyFooters(doc, { forDossier: !!opts.returnBlob });

        if(opts.returnBlob) return doc.output('blob');
        doc.save((typeof PdfTheme !== 'undefined' && PdfTheme.filename) ? PdfTheme.filename('Asso Entreprises') : `${state.data.title || 'Projet'} - Asso Entreprises - moteur.studio.pdf`);
    }
};
if(typeof window !== 'undefined') window.Orgs = Orgs;

const Contracts = {
    // ===================== STORE CONTRATS (Lot 0 : modèle + persistance) =====================
    // Un contrat = { id, partyType, partyId, partyName, type, status, title, blocks[], createdAt, updatedAt }
    // partyType : 'actor' | 'crew' | 'org'   —   type : 'image' | 'cddu' | 'prestation' | 'benevole'
    // status : 'draft' | 'to_sign' | 'signed' | 'archived'
    store: {
        all: () => { if(!Array.isArray(state.data.contracts)) state.data.contracts = []; return state.data.contracts; },
        get: (id) => Contracts.store.all().find(ct => ct.id === id) || null,
        forParty: (partyType, partyId) => Contracts.store.all().filter(ct => ct.partyType === partyType && ct.partyId === partyId),
        create: (data) => {
            const ct = {
                id: 'ctr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9),
                partyType: data.partyType || null, partyId: data.partyId || null, partyName: data.partyName || '',
                type: data.type || 'image', status: data.status || 'draft', title: data.title || '',
                blocks: Array.isArray(data.blocks) ? data.blocks : [],
                createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
            };
            Contracts.store.all().push(ct); Store.save(); return ct;
        },
        upsert: (ct) => {
            if(!ct || !ct.id) return null;
            const list = Contracts.store.all();
            const idx = list.findIndex(x => x.id === ct.id);
            ct.updatedAt = new Date().toISOString();
            if(idx === -1) list.push(ct); else list[idx] = ct;
            Store.save(); return ct;
        },
        remove: (id) => {
            const list = Contracts.store.all();
            const idx = list.findIndex(x => x.id === id);
            if(idx === -1) return false;
            list.splice(idx, 1); Store.save(); return true;
        },
        setStatus: (id, status) => {
            const ct = Contracts.store.get(id);
            if(!ct) return null;
            ct.status = status; ct.updatedAt = new Date().toISOString(); Store.save(); return ct;
        }
    },

    // ===================== MES MODÈLES (Chantier 3) =====================
    // Scope projet : state.data.contractTemplates (sync Store) — scope global :
    // localStorage moteur_contract_templates, sync multi-appareils via PreferencesSync.
    // Suppression locale d'un modèle global = masquage via contractTemplatesHidden.
    tpl: {
        KEY: 'moteur_contract_templates',
        proj: () => { if(!Array.isArray(state.data.contractTemplates)) state.data.contractTemplates = []; return state.data.contractTemplates; },
        hidden: () => { if(!Array.isArray(state.data.contractTemplatesHidden)) state.data.contractTemplatesHidden = []; return state.data.contractTemplatesHidden; },
        glob: () => { try { return JSON.parse(localStorage.getItem(Contracts.tpl.KEY) || '[]') || []; } catch(e) { return []; } },
        saveGlob: (list) => {
            const json = JSON.stringify(list || []);
            const PS = (typeof window !== 'undefined' && window.app && window.app.PreferencesSync) ? window.app.PreferencesSync : (typeof PreferencesSync !== 'undefined' ? PreferencesSync : null);
            if(PS && PS.save) PS.save(Contracts.tpl.KEY, json);
            else { try { localStorage.setItem(Contracts.tpl.KEY, json); } catch(e) {} }
        },
        list: () => {
            const hid = Contracts.tpl.hidden();
            return Contracts.tpl.glob().filter(t => hid.indexOf(t.id) === -1).map(t => ({ t: t, scope: 'glob' }))
                .concat(Contracts.tpl.proj().map(t => ({ t: t, scope: 'proj' })));
        }
    },
    _tplPendingSave: null,
    _tplOpts: null,
    saveAsTemplate: () => {
        if(!Contracts._editing) return;
        Contracts._persist();
        const ct = Contracts.store.get(Contracts._editing); if(!ct) return;
        const name = prompt('Nom du modèle :', ct.title || '');
        if(!name || !name.trim()) return;
        Contracts._tplPendingSave = { name: name.trim(), type: ct.type || 'image', body: ct.body || '' };
        Contracts._tplModal('Enregistrer le modèle « ' + Utils.escape(name.trim()) + ' » :', [
            { label: '📁 Que pour ce projet', fn: () => Contracts.tplCommitSave('proj') },
            { label: '🌐 Pour tous mes projets', fn: () => Contracts.tplCommitSave('glob') }
        ]);
    },
    tplCommitSave: (scope) => {
        const p = Contracts._tplPendingSave; Contracts._tplPendingSave = null;
        if(!p) return;
        const t = { id: 'tpl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), name: p.name, type: p.type, body: p.body, createdAt: new Date().toISOString() };
        if(scope === 'glob') { const l = Contracts.tpl.glob(); l.push(t); Contracts.tpl.saveGlob(l); }
        else { Contracts.tpl.proj().push(t); Store.save(); }
        Utils.toast(scope === 'glob' ? 'Modèle enregistré pour tous tes projets' : 'Modèle enregistré pour ce projet', 'success');
    },
    newFromTemplate: (scope, id) => {
        if(!Contracts._sel) return;
        const arr = scope === 'glob' ? Contracts.tpl.glob() : Contracts.tpl.proj();
        const t = arr.find(x => x.id === id); if(!t) return;
        Contracts._pickerOpen = false;
        Contracts.openEditor(Contracts._sel.partyType, Contracts._sel.idx, t.type || 'image', t.body || '', t.name || '');
        Contracts.renderHub();
    },
    removeTemplate: async (scope, id) => {
        if(scope === 'proj') {
            if(!(await ConfirmModal.confirmDelete('Ce modèle sera supprimé de ce projet. Cette action est définitive.', 'Supprimer ce modèle ?'))) return;
            const l = Contracts.tpl.proj(); const i = l.findIndex(x => x.id === id);
            if(i > -1) { l.splice(i, 1); Store.save(); }
            Contracts.renderHub();
        } else {
            Contracts._tplModal('Ce modèle est disponible dans tous tes projets. Le supprimer :', [
                { label: '📁 Que pour ce projet', fn: () => { const h = Contracts.tpl.hidden(); if(h.indexOf(id) === -1) { h.push(id); Store.save(); } Contracts.renderHub(); } },
                { label: '🌐 Pour tous mes projets', fn: () => { const l = Contracts.tpl.glob(); const i = l.findIndex(x => x.id === id); if(i > -1) { l.splice(i, 1); Contracts.tpl.saveGlob(l); } Contracts.renderHub(); } }
            ]);
        }
    },
    _tplModal: (msg, opts) => {
        const old = document.getElementById('ctr-tpl-modal'); if(old) old.remove();
        Contracts._tplOpts = opts;
        const m = document.createElement('div');
        m.className = 'contracts-modal'; m.id = 'ctr-tpl-modal';
        m.onclick = (e) => { if(e.target === m) m.remove(); };
        m.innerHTML = '<div class="contracts-box" style="max-width:420px;">'
            + '<div class="contracts-header"><h3>📑 Modèle de contrat</h3><button class="history-close-btn" onclick="document.getElementById(\'ctr-tpl-modal\').remove()">✕</button></div>'
            + '<div style="padding:18px;"><p style="margin:0 0 14px;">' + msg + '</p>'
            + opts.map((o, i) => '<button class="ctr-pal-btn" style="display:block; width:100%; margin-bottom:8px;" onclick="app.Contracts._tplPick(' + i + ')">' + o.label + '</button>').join('')
            + '</div></div>';
        document.body.appendChild(m);
    },
    _tplPick: (i) => {
        const o = (Contracts._tplOpts || [])[i];
        const m = document.getElementById('ctr-tpl-modal'); if(m) m.remove();
        Contracts._tplOpts = null;
        if(o && o.fn) o.fn();
    },

    // ===================== DEUX VUES DANS L'ONGLET (8e, 25 aout) =====================
    // L'onglet melangeait deux usages dans un seul ecran : consulter les contrats
    // existants (qui vivait dans une FENETRE, donc invisible tant qu'on ne
    // cliquait pas un bouton perdu dans la barre de tri) et en fabriquer un
    // (les trois colonnes). Ce sont deux moments de travail differents, ils ont
    // desormais chacun leur sous-onglet. « Mes contrats » ouvre en premier :
    // arriver dans l'onglet, c'est le plus souvent venir relire ou reprendre un
    // contrat, pas en creer un de zero.
    _view: 'list',
    setView: (v) => {
        if(Contracts._editing) Contracts._persist();
        Contracts._view = (v === 'hub') ? 'hub' : 'list';
        Contracts.renderTab();
    },
    renderTab: () => {
        const isHub = Contracts._view === 'hub';
        const bl = document.getElementById('ctr-viewbtn-list');
        const bh = document.getElementById('ctr-viewbtn-hub');
        if(bl) bl.classList.toggle('fds-tabbtn-active', !isHub);
        if(bh) bh.classList.toggle('fds-tabbtn-active', isHub);
        const sub = document.getElementById('contracts-subtitle');
        if(sub) sub.textContent = isHub
            ? 'Toutes les personnes du projet (comédien·nes, technicien·nes et structures), une carte par personne avec l\u2019ensemble de ses fonctions. Choisis le contrat à générer.'
            : 'Tous les contrats de ce projet. Clique sur une carte pour l\u2019ouvrir dans l\u2019éditeur.';
        const hostList = document.getElementById('contracts-list');
        const hostHub = document.getElementById('contracts-hub');
        if(hostList) hostList.style.display = isHub ? 'none' : 'block';
        if(hostHub) hostHub.style.display = isHub ? 'block' : 'none';
        if(isHub) Contracts.renderHub();
        else Contracts.renderList();
    },
    // Grille de toutes les fiches contrat du projet. Meme format compact que
    // Comediens / Techniciens / Ressources. Clic = ouvrir dans l'editeur, ce qui
    // bascule sur l'autre sous-onglet.
    // TROIS CLASSEMENTS (25 aout) : par nom de personne, par type de contrat, par
    // statut. Le tri par defaut etait « le plus recemment modifie en premier »,
    // pratique pour reprendre son travail mais inutilisable pour retrouver un
    // contrat precis dans une liste de trente. Les sections reprennent le format
    // des groupes des autres onglets (.group-section / .group-header), et un
    // classement vide n'affiche pas de section vide.
    _listSort: 'alpha',
    setListSort: (mode) => { Contracts._listSort = mode; Contracts.renderList(); },
    // Categorie de metier d'un contrat, deduite de la personne signataire, avec
    // les memes regles que la colonne de gauche du sous-onglet de creation :
    // un contrat n'a pas de metier a lui, il herite de celui de sa partie.
    // Une partie supprimee depuis tombe dans « Autres » plutot que de faire
    // disparaitre son contrat de la liste.
    _partyCategory: (ct) => {
        const t = ct.partyType;
        if(t === 'org') return 'Structures';
        if(t === 'figurant') return 'Figurants';
        if(t === 'actor') {
            const a = (state.data.actors || []).find(x => x && x.id === ct.partyId);
            if(!a) return 'Autres';
            const figIds = (state.data.groups || []).filter(g => g.type === 'actor' && /figuration/i.test(g.name || '')).map(g => g.id);
            return figIds.includes(a.group_id) ? 'Figurants' : 'Comédien·ne';
        }
        if(t === 'crew') {
            const c = (state.data.crew || []).find(x => x && x.id === ct.partyId);
            if(!c) return 'Autres';
            if(!c.department) return 'Équipe technique';
            const g = (state.data.groups || []).find(x => x.id === c.department);
            return g ? g.name : 'Équipe technique';
        }
        return 'Autres';
    },
    _cardHTML: (ct) => {
        const esc = Utils.escape;
        const typeIcon = { image: '📸', cddu: '📋', prestation: '📄', benevole: '❤️' };
        const tlabel = Contracts._typeLabel[ct.type] || ct.type;
        const slabel = Contracts._statusLabel[ct.status] || ct.status;
        const title = ct.title ? esc(ct.title) : tlabel;
        const actions = '<div class="compact-card-actions">'
            + '<button class="edit-btn" title="Exporter en PDF" onclick="event.stopPropagation(); app.Contracts.exportPDF(\'' + ct.id + '\')">📄</button>'
            + '<button class="merge-btn" title="Dupliquer" onclick="event.stopPropagation(); app.Contracts.duplicate(\'' + ct.id + '\')">📋</button>'
            + '<button class="delete-btn" title="Supprimer" onclick="event.stopPropagation(); app.Contracts.removeContract(\'' + ct.id + '\')">🗑️</button>'
            + '</div>';
        return '<div class="compact-card" onclick="app.Contracts.openFromList(\'' + ct.id + '\')">'
            + actions
            + '<div class="compact-card-photo">' + (typeIcon[ct.type] || '📄') + '</div>'
            + '<div class="compact-card-name">' + title + '</div>'
            + '<div class="compact-card-role">' + esc(ct.partyName || '—') + '</div>'
            + '<div class="ctr-card-badge"><span class="ctr-badge ctr-badge-' + (ct.status || 'draft') + '">' + slabel + '</span></div>'
            + '</div>';
    },
    renderList: () => {
        const host = document.getElementById('contracts-list');
        if(!host) return;
        const esc = Utils.escape;
        const all = (Contracts.store.all() || []).slice();
        if(!all.length) {
            host.innerHTML = '<div class="ccol-empty" style="padding:50px 20px;">Aucun contrat sur ce projet. Passe par « ✏️ Créer un contrat » pour en fabriquer un.</div>';
            return;
        }
        const mode = Contracts._listSort || 'alpha';
        const toolbar = '<div class="chub-toolbar"><span class="chub-toolbar-label">Classer :</span>'
            + '<button class="chub-sort-btn ' + (mode === 'alpha' ? 'active' : '') + '" title="Par nom de la personne ou de la structure" onclick="app.Contracts.setListSort(\'alpha\')">A → Z</button>'
            + '<button class="chub-sort-btn ' + (mode === 'type' ? 'active' : '') + '" title="Par nature du contrat" onclick="app.Contracts.setListSort(\'type\')">Par catégorie</button>'
            + '<button class="chub-sort-btn ' + (mode === 'metier' ? 'active' : '') + '" title="Par métier de la personne signataire" onclick="app.Contracts.setListSort(\'metier\')">Par métier</button>'
            + '<button class="chub-sort-btn ' + (mode === 'status' ? 'active' : '') + '" title="Brouillon, à signer, signé, archivé" onclick="app.Contracts.setListSort(\'status\')">Par statut</button>'
            + '<span class="chub-toolbar-label" style="margin-left:auto;">' + all.length + ' contrat' + (all.length > 1 ? 's' : '') + '</span></div>';
        
        const byName = (a, b) => String(a.partyName || '').localeCompare(String(b.partyName || ''), 'fr')
            || String(a.title || '').localeCompare(String(b.title || ''), 'fr');
        let body;
        if(mode === 'alpha') {
            body = '<div class="compact-cards-grid">' + all.sort(byName).map(Contracts._cardHTML).join('') + '</div>';
        } else if(mode === 'metier') {
            // Les metiers ne sont pas une liste fermee (les groupes d'equipe sont
            // crees par l'utilisateur) : les sections sont donc alphabetiques,
            // « Autres » repousse en fin de liste.
            const groups = {};
            all.forEach(ct => { const k = Contracts._partyCategory(ct); (groups[k] = groups[k] || []).push(ct); });
            const cats = Object.keys(groups).sort((a, b) => {
                if(a === 'Autres') return 1;
                if(b === 'Autres') return -1;
                return a.localeCompare(b, 'fr');
            });
            body = cats.map(k =>
                '<div class="group-section"><div class="group-header">' + esc(k)
                    + '<span class="ccol-group-count">' + groups[k].length + '</span></div>'
                + '<div class="compact-cards-grid">' + groups[k].sort(byName).map(Contracts._cardHTML).join('') + '</div></div>'
            ).join('');
        } else {
            // L'ordre des sections est fixe et voulu : les categories suivent
            // l'ordre de la palette de creation, les statuts suivent le cycle de
            // vie d'un contrat (on ecrit, on fait signer, on archive).
            const keys = mode === 'type'
                ? ['image', 'cddu', 'prestation', 'benevole']
                : ['draft', 'to_sign', 'signed', 'archived'];
            const labels = mode === 'type' ? Contracts._typeLabel : Contracts._statusLabel;
            const field = mode === 'type' ? 'type' : 'status';
            const fallback = mode === 'type' ? 'image' : 'draft';
            const groups = {};
            all.forEach(ct => { const k = keys.indexOf(ct[field]) > -1 ? ct[field] : fallback; (groups[k] = groups[k] || []).push(ct); });
            body = keys.filter(k => groups[k] && groups[k].length).map(k =>
                '<div class="group-section"><div class="group-header">' + esc(labels[k] || k)
                    + '<span class="ccol-group-count">' + groups[k].length + '</span></div>'
                + '<div class="compact-cards-grid">' + groups[k].sort(byName).map(Contracts._cardHTML).join('') + '</div></div>'
            ).join('');
        }
        host.innerHTML = toolbar + body;
    },
    // La fenetre « Mes contrats » n'existe plus : le nom est conserve parce que
    // duplicate() et le reste du module l'appellent, il renvoie maintenant vers
    // le sous-onglet.
    openList: () => { Contracts._view = 'list'; Contracts.renderTab(); },

    // ===================== HUB ADMIN > CONTRATS =====================
    // Grille de toutes les personnes du projet, dedupliquees, avec toutes leurs fonctions.
    renderHub: () => {
        const host = document.getElementById('contracts-hub');
        if(!host) return;
        const esc = Utils.escape;
        const characters = state.data.characters || [];
        const people = [];
        const byKey = {};
        const add = (key, name, func, ref, category, avatar, icon, id) => {
            if(!byKey[key]) { byKey[key] = { key: key, name: name, funcs: [], ref: ref, category: category || 'Autres', avatar: avatar || '', icon: icon || '👤', id: id || null }; people.push(byKey[key]); }
            else if(!byKey[key].avatar && avatar) byKey[key].avatar = avatar;
            if(func && byKey[key].funcs.indexOf(func) === -1) byKey[key].funcs.push(func);
        };
        const figGroupIds = (state.data.groups || []).filter(g => g.type === 'actor' && /figuration/i.test(g.name || '')).map(g => g.id);
        (state.data.actors || []).forEach((a, i) => {
            if(!a.name) return;
            const roles = characters.filter(c => c.actor_id === a.id).map(c => c.name).filter(Boolean);
            add('actor:' + (a.id || a.name), a.name, '🎭 Comédien·ne' + (roles.length ? ' — ' + roles.join(', ') : ''), { t: 'actor', i: i }, 'Comédien·ne', a.photo, '🎭', a.id);
            if(figGroupIds.includes(a.group_id)) add('figurant:' + (a.id || a.name), a.name, '🎭 Figurant·e', { t: 'figurant', i: i }, 'Figurants', a.photo, '🎭', a.id);
        });
        const groupName = (gid) => { const g = (state.data.groups || []).find(x => x.id === gid); return g ? g.name : (gid || 'Équipe technique'); };
        (state.data.crew || []).forEach((c, i) => {
            if(!c.name) return;
            add('crew:' + (c.id || c.name), c.name, '🎥 ' + (c.role || 'Technicien·ne'), { t: 'crew', i: i }, (c.department ? groupName(c.department) : 'Équipe technique'), c.photo, '🎥', c.id);
        });
        (state.data.orgs || []).forEach((o, i) => {
            const fc = (typeof Orgs !== 'undefined' && Orgs._fiche) ? Orgs._fiche(o) : (o.fiche || o);
            const nm = (fc && fc.name) || o.name || '';
            if(!nm) return;
            const icon = o.type === 'asso' ? '🏛️' : '🏢';
            add('org:' + (o.id || nm), nm, icon + ' ' + (o.type === 'asso' ? 'Association' : 'Entreprise'), { t: 'org', i: i }, 'Structures', (fc && fc.logo) || '', icon, o.id);
        });
       
        people.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
        const sortMode = Contracts._hubSort || 'alpha';
        const toolbar = '<div class="chub-toolbar"><span class="chub-toolbar-label">Trier :</span>'
            + '<button class="chub-sort-btn ' + (sortMode === 'alpha' ? 'active' : '') + '" onclick="app.Contracts.setHubSort(\'alpha\')">A → Z</button>'
            + '<button class="chub-sort-btn ' + (sortMode === 'metier' ? 'active' : '') + '" onclick="app.Contracts.setHubSort(\'metier\')">Par métier</button></div>';
        const dotHTML = (p) => {
            const cs = (Contracts.store.forParty(p.ref.t, p.id) || []);
            if(!cs.length) return '<span class="ccol-dots"><span class="ccol-dot ccol-dot-none" title="Aucun contrat">0</span></span>';
            const order = ['draft','to_sign','signed','archived'];
            const counts = {};
            cs.forEach(c => { const s = c.status || 'draft'; counts[s] = (counts[s] || 0) + 1; });
            return '<span class="ccol-dots">' + order.filter(s => counts[s]).map(s => '<span class="ccol-dot ccol-dot-' + s + '" title="' + (Contracts._statusLabel[s] || s) + ' : ' + counts[s] + '">' + counts[s] + '</span>').join('') + '</span>';
        };
        const itemHTML = (p) => {
            const sel = Contracts._sel && Contracts._sel.key === p.key;
            const av = p.avatar ? '<img src="' + esc(p.avatar) + '" alt="Photo de profil" class="ccol-av">' : '<span class="ccol-av ccol-av-ph">' + p.icon + '</span>';
            return '<div class="ccol-item' + (sel ? ' ccol-item-sel' : '') + '" onclick="app.Contracts.selectParty(\'' + p.ref.t + '\',' + p.ref.i + ',\'' + encodeURIComponent(p.key) + '\')">' + av + '<span class="ccol-item-name">' + esc(p.name) + '</span>' + dotHTML(p) + '</div>';
        };
        let listHTML;
        if(!people.length) {
            listHTML = '<div class="ccol-empty">Aucune personne ni structure sur ce projet.</div>';
        } else if(sortMode === 'metier') {
            const groups = {};
            people.forEach(p => { (groups[p.category] = groups[p.category] || []).push(p); });
            listHTML = Object.keys(groups).sort((a, b) => a.localeCompare(b, 'fr')).map(cat => {
                const collapsed = !!Contracts._metierCollapsed[cat];
                const items = groups[cat].map(itemHTML).join('');
                return '<div class="ccol-group">'
                    + '<div class="ccol-group-head" onclick="app.Contracts.toggleGroup(\'' + encodeURIComponent(cat) + '\')"><span>' + (collapsed ? '▸' : '▾') + ' ' + esc(cat) + '</span><span class="ccol-group-count">' + groups[cat].length + '</span></div>'
                    + (collapsed ? '' : '<div class="ccol-group-body">' + items + '</div>')
                    + '</div>';
            }).join('');
        } else {
            listHTML = people.map(itemHTML).join('');
        }
        let col2;
        if(Contracts._sel) {
            const contracts = (Contracts.store.forParty(Contracts._sel.partyType, Contracts._sel.partyId) || []).slice().sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
            const allowedTypes = Contracts._sel.partyType === 'org' ? ['prestation', 'benevole'] : ['image', 'cddu', 'prestation', 'benevole'];
            const tpls = Contracts.tpl.list().filter(x => allowedTypes.indexOf(x.t.type || 'image') !== -1);
            const tplHTML = tpls.length ? '<div class="ctr-pal-title" style="margin-top:4px;">Mes modèles</div>' + tpls.map(x => '<div class="ctr-tpl-row"><button class="ctr-pal-btn" onclick="app.Contracts.newFromTemplate(\'' + x.scope + '\',\'' + x.t.id + '\')">' + (x.scope === 'glob' ? '🌐 ' : '📁 ') + esc(x.t.name || 'Sans nom') + '</button><button class="ctr-tpl-del" title="Supprimer ce modèle" onclick="app.Contracts.removeTemplate(\'' + x.scope + '\',\'' + x.t.id + '\')">×</button></div>').join('') : '';
            const picker = Contracts._pickerOpen ? '<div class="ccol-picker">'
                + allowedTypes.map(t => '<button class="ctr-pal-btn" onclick="app.Contracts.newContract(\'' + t + '\')">' + (Contracts._typeLabel[t] || t) + '</button>').join('')
                + tplHTML + '</div>' : '';
            const rows = contracts.length ? contracts.map(ct => {
                const tlabel = Contracts._typeLabel[ct.type] || ct.type;
                const slabel = Contracts._statusLabel[ct.status] || ct.status;
                const open = Contracts._editing === ct.id;
                return '<div class="ccol-ctr' + (open ? ' ccol-ctr-open' : '') + '" data-fiche="contract:' + esc(String(ct.id)) + '" onclick="app.Contracts.openExisting(\'' + ct.id + '\')">'
                    + '<button class="ccol-ctr-del" title="Supprimer ce contrat" onclick="event.stopPropagation(); app.Contracts.removeContract(\'' + ct.id + '\')">×</button>'
                    + '<div class="ccol-ctr-title">' + (ct.title ? esc(ct.title) : tlabel) + '</div>'
                    + '<div class="ccol-ctr-meta">' + tlabel + ' <span class="ctr-badge ctr-badge-' + (ct.status || 'draft') + '">' + slabel + '</span></div></div>';
            }).join('') : '<div class="ccol-empty">Aucun contrat. Crée-en un avec « + Nouveau ».</div>';
            col2 = '<div class="ccol-head"><span class="ccol-head-name">' + esc(Contracts._sel.name) + '</span>'
                + '<button class="chub-sort-btn" onclick="app.Contracts.togglePicker()">' + (Contracts._pickerOpen ? '× Fermer' : '+ Nouveau') + '</button></div>'
                + picker + '<div class="ccol-ctrs">' + rows + '</div>';
        } else {
            col2 = '<div class="ccol-empty">Sélectionne une fiche à gauche pour voir ou créer ses contrats.</div>';
        }
        host.innerHTML = '<div class="ccol-wrap' + (Contracts._editing ? ' ccol-wrap-editing' : '') + '">'
            + '<div class="ccol ccol-1">' + toolbar + '<div class="ccol-list">' + listHTML + '</div></div>'
            + '<div class="ccol ccol-2">' + col2 + '</div>'
            + '<div class="ccol ccol-3" id="ccol-3"></div>'
            + '</div>';
        const ed = Contracts._editing ? Contracts.store.get(Contracts._editing) : null;
        Contracts._bindWide(host);
        if(ed && Contracts._ctx) Contracts.renderEditor(ed);
        else { const c3 = document.getElementById('ccol-3'); if(c3) c3.innerHTML = '<div class="ccol-empty" style="padding:50px 20px;">Sélectionne un contrat (ou crée-en un) pour l\u2019éditer ici.</div>'; }
    },

    _hubSort: 'alpha',
    // Mode large : le contrat occupe presque toute la page pendant qu'on
    // travaille dessus. Bascule au survol (ou au curseur) de la 3e colonne ;
    // revient a la normale des qu'on survole la bande de gauche.
    _wide: false,
    _setWide: (on) => {
        if(Contracts._wide === on) return;
        Contracts._wide = on;
        const w = document.querySelector('#contracts-hub .ccol-wrap');
        if(w) w.classList.toggle('ccol-wrap-wide', on);
    },
    _bindWide: (host) => {
        // Etat conserve d'un rendu a l'autre (renderHub reconstruit le HTML)
        const w = host.querySelector('.ccol-wrap');
        if(w && Contracts._wide && Contracts._editing) w.classList.add('ccol-wrap-wide');
        if(!Contracts._editing) Contracts._wide = false;
        if(host._wideBound) return;
        host._wideBound = true;
        const inEditor = (el) => !!(el && el.closest && el.closest('.ccol-3'));
        const inSides = (el) => !!(el && el.closest && (el.closest('.ccol-1') || el.closest('.ccol-2')));
        host.addEventListener('mouseover', (e) => {
            if(!Contracts._editing) return;
            if(inEditor(e.target)) Contracts._setWide(true);
            else if(inSides(e.target)) Contracts._setWide(false);
        });
        host.addEventListener('focusin', (e) => {
            if(Contracts._editing && inEditor(e.target)) Contracts._setWide(true);
        });
    },
    setHubSort: (mode) => { if(Contracts._editing) Contracts._persist(); Contracts._hubSort = mode; Contracts.renderHub(); },
    _sel: null,
    _pickerOpen: false,
    _metierCollapsed: {},
    selectParty: (t, i, keyEnc) => {
        const key = decodeURIComponent(keyEnc);
        const same = Contracts._sel && Contracts._sel.key === key;
        if(Contracts._editing) { Contracts._persist(); Contracts._editing = null; Contracts._ctx = null; }
        if(same) { Contracts.renderHub(); return; }
        const list = t === 'actor' ? state.data.actors : (t === 'org' ? state.data.orgs : (t === 'figurant' ? state.data.actors : state.data.crew));
        const obj = (list && list[i]) || {};
        let name = '';
        if(t === 'org') { const fc = (typeof Orgs !== 'undefined' && Orgs._fiche) ? Orgs._fiche(obj) : (obj.fiche || obj); name = (fc && fc.name) || obj.name || ''; }
        else name = obj.name || '';
        Contracts._sel = { partyType: t, idx: i, partyId: obj.id || null, name: name, key: key };
        Contracts._pickerOpen = false;
        Contracts.renderHub();
    },
    toggleGroup: (catEnc) => { if(Contracts._editing) Contracts._persist(); const cat = decodeURIComponent(catEnc); Contracts._metierCollapsed[cat] = !Contracts._metierCollapsed[cat]; Contracts.renderHub(); },
    togglePicker: () => { if(Contracts._editing) Contracts._persist(); Contracts._pickerOpen = !Contracts._pickerOpen; Contracts.renderHub(); },
    newContract: (type) => { if(!Contracts._sel) return; Contracts._pickerOpen = false; Contracts.openEditor(Contracts._sel.partyType, Contracts._sel.idx, type); Contracts.renderHub(); },

    // ===================== ÉDITEUR DE CONTRAT (Lot 2a) =====================
    fields: {
        'prod.name':    { label: 'Production — nom',        resolve: (x) => x.project.producer },
        'prod.address': { label: 'Production — adresse',    resolve: (x) => x.project.addressLegal || x.project.city },
        'prod.siret':   { label: 'Production — SIRET',      resolve: (x) => x.project.siret },
        'prod.ape':     { label: 'Production — APE/NAF',    resolve: (x) => x.project.ape },
        'prod.licence': { label: 'Production — licence',    resolve: (x) => x.project.licence },
        'prod.rep':     { label: 'Production — représentant·e', resolve: (x) => x.project.director },
        'prod.repTitle':{ label: 'Production — qualité',    resolve: (x) => x.project.directorTitle },
        'party.name':   { label: 'Partie — nom',            resolve: (x) => x.party.name },
        'party.address':{ label: 'Partie — adresse',        resolve: (x) => x.party.address },
        'party.email':  { label: 'Partie — email',          resolve: (x) => x.party.email },
        'party.phone':  { label: 'Partie — téléphone',      resolve: (x) => x.party.phone },
        'party.role':   { label: 'Partie — fonction',       resolve: (x) => x.party.role },
        'party.siret':  { label: 'Partie — SIRET',          resolve: (x) => x.party.siret },
        'party.legalForm': { label: 'Partie — forme juridique', resolve: (x) => x.party.legalForm },
        'party.rep':    { label: 'Partie — représentant·e',     resolve: (x) => x.party.rep },
        'party.secu':   { label: 'Partie — n° Sécu',        resolve: (x) => x.party.numSecu },
        'party.conges': { label: 'Partie — Congés Spectacles', resolve: (x) => x.party.numCongesSpectacles },
        'project.title':{ label: 'Projet — titre',          resolve: (x) => x.projectTitle },
        'period.range': { label: 'Feuille de service — période', resolve: () => { const cs = Contracts._callsheet(Contracts._editingParty()); return cs.count ? ('du ' + cs.start + ' au ' + cs.end + ' (' + cs.count + ' jour' + (cs.count > 1 ? 's' : '') + ' de tournage)') : ''; } }
    },
    _snippets: {
        date:  'le <span class="ctr-blank">_____________</span>',
        lieu:  'à <span class="ctr-blank">_____________</span>',
        remu:  '<span class="ctr-blank">_____________ €</span>',
        heuresSup: '<p><strong>Heures supplémentaires :</strong> au-delà de <span class="ctr-blank">___</span> heures de travail effectif par jour, les heures supplémentaires sont rémunérées au taux horaire majoré de <span class="ctr-blank">___ %</span> (25 % pour les 8 premières heures, 50 % au-delà, sauf accord collectif plus favorable).</p>',
        sign:  '<p>Fait à <span class="ctr-blank">__________</span>, le <span class="ctr-blank">__________</span>, en deux exemplaires.</p><table class="ctr-sign"><tr><td>La Production<br><small>(signature)</small></td><td>La Partie<br><small>(« Bon pour accord » + signature)</small></td></tr></table>',
        legal: '<p class="ctr-legal" contenteditable="false">Modèle de contrat fourni à titre purement indicatif. Il ne constitue pas un conseil juridique. Avant toute signature, vérifiez sa conformité au droit applicable (Code du travail, convention collective, etc.) auprès d\u2019un professionnel du droit. moteur.studio décline toute responsabilité quant à l\u2019usage de ce document.</p>'
    },
    _escapeAttr: (s) => (s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'),
    _sanitizeBody: (html) => {
        const okTag = ['P','DIV','SPAN','BR','STRONG','B','EM','I','U','H1','H2','H3','TABLE','THEAD','TBODY','TR','TD','TH','SMALL','UL','OL','LI','A','IMG'];
        const okAttr = ['class','contenteditable','alt','colspan','rowspan','data-field','data-snippet','data-hash'];
        const drop = ['SCRIPT','STYLE','IFRAME','OBJECT','EMBED','NOSCRIPT','LINK','META'];
        const root = new DOMParser().parseFromString('<div>' + (html || '') + '</div>', 'text/html').body.firstChild;
        const walk = (node) => {
            [...node.children].forEach(child => {
                if(drop.includes(child.tagName)) { child.remove(); return; }
                walk(child);
                if(!okTag.includes(child.tagName)) { child.replaceWith(...child.childNodes); return; }
                [...child.attributes].forEach(a => {
                    const n = a.name.toLowerCase();
                    if(n === 'src') { const u = Utils.safeMediaUrl(a.value); if(u) { child.setAttribute('src', u); } else { child.removeAttribute('src'); } }
                    else if(n === 'href') { const u = Utils.safeUrl(a.value); if(u) { child.setAttribute('href', u); } else { child.removeAttribute('href'); } }
                    else if(!okAttr.includes(n)) { child.removeAttribute(a.name); }
                });
            });
        };
        walk(root);
        return root.innerHTML;
    },

    // Agrégat de la feuille de service (jours triés, période, lieux, convocations)
    _callsheet: (party) => {
        const all = (state.data.shootingDays || []).filter(d => d.startDate || d.date);
        let raw = all;
        if(party && party.id) raw = all.map(d => { const c = (d.callSheet || []).find(x => x.personId === party.id); return c ? Object.assign({ _pCall: c.callTime || '' }, d) : null; }).filter(Boolean);
        const days = raw.slice().sort((a,b) => new Date(a.startDate||a.date) - new Date(b.startDate||b.date));
        const fmt = (s) => { try { return s ? Utils.formatDate(s) : ''; } catch(e){ return s || ''; } };
        const norm = days.map((d, i) => ({ n: d.dayNumber || (i+1), start: d.startDate || d.date || '', end: d.endDate || d.startDate || d.date || '', location: d.location || '', call: d._pCall || d.crewCall || '', wrap: d.estimatedWrap || '' }));
        return { count: norm.length, total: all.length, scoped: !!(party && party.id), start: norm.length ? fmt(norm[0].start) : '', end: norm.length ? fmt(norm[norm.length-1].end) : '', days: norm, fmt: fmt };
    },
    // Partie du contrat en cours d'edition, pour scoper la feuille de service a ses convocations (null pour les structures)
    _editingParty: () => { const ct = Contracts.store.get(Contracts._editing); return (ct && ct.partyId && ct.partyType !== 'org') ? { type: ct.partyType, id: ct.partyId } : null; },
    // Blocs HTML construits dynamiquement à l'insertion (instantané, non re-résolu)
    _snippetBuilders: {
        clauses: () => { const ct = Contracts.store.get(Contracts._editing); const type = (ct && ct.type) || 'image'; if(type === 'prestation' && ct && ct.partyType === 'org') return Contracts._clauses.prestation_org; return Contracts._clauses[type] || Contracts._clauses.image; },
        callsheet: (party) => {
            const cs = Contracts._callsheet(party !== undefined ? party : Contracts._editingParty());
            let inner;
            if(!cs.count) inner = (cs.scoped && cs.total) ? '<p><em>Aucune convocation pour cette personne dans la feuille de service.</em></p>' : '<p><em>Aucun jour de tournage saisi dans la feuille de service.</em></p>';
            else {
                const rows = cs.days.map(d => '<tr><td>J'+d.n+'</td><td>'+(d.start===d.end ? cs.fmt(d.start) : cs.fmt(d.start)+' → '+cs.fmt(d.end))+'</td><td>'+Utils.escape(d.location||'—')+'</td><td>'+Utils.escape(d.call||'—')+'</td><td>'+Utils.escape(d.wrap||'—')+'</td></tr>').join('');
                inner = '<h2>Période &amp; horaires (feuille de service)</h2><table class="ctr-cs"><thead><tr><th>Jour</th><th>Date</th><th>Lieu</th><th>Convocation</th><th>Fin (estimée)</th></tr></thead><tbody>'+rows+'</tbody></table>';
            }
            return '<div data-snippet="callsheet">' + inner + '</div>';
        },
        remuTable: () => '<h2>Rémunération</h2><table class="ctr-cs"><tbody>'
            + '<tr><td>Base</td><td><span class="ctr-blank">cachet / journalier / forfait</span></td></tr>'
            + '<tr><td>Montant brut</td><td><span class="ctr-blank">_________ €</span></td></tr>'
            + '<tr><td>Congés spectacles (10 %)</td><td><span class="ctr-blank">_________ €</span></td></tr>'
            + '<tr><td>Net estimé</td><td><span class="ctr-blank">_________ €</span></td></tr>'
            + '<tr><td>Modalités de paiement</td><td><span class="ctr-blank">virement, sous 30 jours…</span></td></tr>'
            + '</table>'
    },

    _clauses: {
        cddu: `
<h2>Préambule — motif de recours</h2>
<p>Le présent contrat est conclu dans le cadre d'un emploi à caractère temporaire pour lequel il est d'usage constant, dans le secteur de la production cinématographique et audiovisuelle, de ne pas recourir au contrat à durée indéterminée en raison de la nature de l'activité exercée et du caractère par nature temporaire de cet emploi (article D.1242-1 du Code du travail). Ce contrat n'a pas pour objet de pourvoir durablement un emploi lié à l'activité normale et permanente de l'entreprise.</p>
<h2>Nature du contrat</h2>
<p>Le/la salarié·e est engagé·e dans le cadre d'un contrat à durée déterminée d'usage (CDDU), conformément aux articles L.1242-2 et suivants du Code du travail, spécifiques aux professions du spectacle.</p>
<h2>Convention collective</h2>
<p>Le présent contrat est régi par la convention collective de la <span class="ctr-blank">_____________</span>.</p>
<h2>Caisse de retraite et prévoyance</h2>
<p>Caisse de retraite complémentaire : AUDIENS — 74 rue Jean Bleuzen, 92170 Vanves.</p>
<h2>Congés spectacles</h2>
<p>Les congés payés seront versés par la Caisse des Congés Spectacles. N° d'affiliation employeur : <span class="ctr-blank">_____________</span>.</p>
<h2>Abattement pour frais professionnels</h2>
<p>L'emploi occupé ouvre droit à la déduction forfaitaire spécifique pour frais professionnels prévue par l'arrêté du 20 décembre 2002. Le/la salarié·e déclare :<br>☐ Accepter l'application de cet abattement<br>☐ Refuser l'application de cet abattement<br><em>Note : l'application de cet abattement minore l'assiette des cotisations sociales et donc les droits sociaux (retraite, indemnités journalières, allocations chômage).</em></p>
<h2>Fin de contrat</h2>
<p>À l'issue du contrat, l'employeur remettra au/à la salarié·e : un certificat de travail, une attestation Pôle emploi (AEM), un reçu pour solde de tout compte, le dernier bulletin de salaire et un certificat congés spectacles.</p>
<h2>Juridiction compétente</h2>
<p>En cas de litige, les parties conviennent de rechercher une solution amiable. À défaut, le Conseil de Prud'hommes compétent sera celui du lieu de travail ou du domicile du/de la salarié·e.</p>
`,
        image: `
<h2>Supports et modes d'exploitation</h2>
<p>Supports autorisés :<br>☐ Exploitation cinématographique (salles)<br>☐ Diffusion télévisuelle (hertzienne, câble, satellite, TNT)<br>☐ Supports vidéo (DVD, Blu-ray, VOD, SVOD)<br>☐ Internet et réseaux sociaux<br>☐ Supports promotionnels (affiches, bandes-annonces, making-of)<br>☐ Festivals et projections publiques<br>☐ Usage pédagogique et culturel<br>☐ Tous supports connus ou inconnus à ce jour</p>
<h2>Étendue territoriale et durée</h2>
<p>Territoire : Monde entier / ou limité à : <span class="ctr-blank">_____________</span>.<br>Durée : <span class="ctr-blank">_____________</span>.<br><em>En cas de durée illimitée, l'autorisation est consentie pour toute la durée légale de protection des droits de propriété intellectuelle et de leurs éventuelles prolongations.</em></p>
<h2>Engagements du bénéficiaire</h2>
<p>Le bénéficiaire s'engage à ce que l'exploitation de l'image ne porte pas atteinte à la dignité, à l'honneur ou à la réputation du/de la signataire, ne dénature pas le contexte de captation, ne soit pas utilisée dans un contexte pornographique, diffamatoire ou contraire aux bonnes mœurs, et respecte le droit moral du/de la signataire.</p>
<h2>Droit de retrait</h2>
<p>Conformément à l'article 9 du Code civil, le/la signataire conserve le droit de retirer son autorisation à tout moment, par lettre recommandée avec accusé de réception. Ce retrait ne pourra affecter les exploitations déjà réalisées ou en cours, ni ouvrir droit à indemnisation.</p>
<h2>Protection des données (RGPD)</h2>
<p>Conformément au Règlement Général sur la Protection des Données (UE 2016/679) et à la loi Informatique et Libertés, le/la signataire dispose d'un droit d'accès, de rectification, d'effacement, de limitation, d'opposition et de portabilité de ses données. Les données collectées seront conservées pour la durée nécessaire à l'exploitation autorisée.</p>
<h2>Déclarations</h2>
<p>Le/la signataire déclare :<br>☐ Avoir pris connaissance de l'intégralité du présent document<br>☐ Avoir pu poser des questions et obtenir des réponses<br>☐ Ne pas être lié·e par un contrat exclusif relatif à l'utilisation de son image<br>☐ Donner son consentement libre, spécifique, éclairé et univoque</p>
`,
        prestation: `
<h2>Modalités de paiement</h2>
<p>Le paiement sera effectué par virement bancaire sous 30 jours à réception de la facture.</p>
<h2>Indépendance</h2>
<p>Le/la prestataire exerce son activité de manière indépendante et n'est soumis·e à aucun lien de subordination. Il/elle organise librement son travail dans le respect des délais convenus.</p>
<h2>Assurance</h2>
<p>Le/la prestataire déclare être assuré·e au titre de sa responsabilité civile professionnelle (n° de police : <span class="ctr-blank">_____________</span>, compagnie : <span class="ctr-blank">_____________</span>) et s'engage à maintenir cette assurance pendant toute la durée de la mission.</p>
<h2>Propriété intellectuelle</h2>
<p>Sauf accord contraire écrit, les créations réalisées dans le cadre de la mission (images, sons, textes, graphismes, etc.) sont la propriété exclusive du/de la client·e dès leur création et leur paiement intégral. Le/la prestataire cède au/à la client·e, à titre exclusif, l'ensemble des droits patrimoniaux attachés aux créations, pour tous supports et tous modes d'exploitation, pour le monde entier et pour toute la durée légale de protection des droits d'auteur (reproduction, représentation, adaptation, traduction, exploitation commerciale).</p>
<h2>Confidentialité</h2>
<p>Le/la prestataire s'engage à garder strictement confidentielles toutes les informations relatives au projet et au/à la client·e. Cette obligation reste en vigueur pendant 2 ans après la fin du contrat.</p>
<h2>Résiliation</h2>
<p><strong>Pour convenance :</strong> chaque partie peut résilier moyennant un préavis de <span class="ctr-blank">___</span> jours ouvrés notifié par écrit.<br><strong>Pour faute :</strong> en cas de manquement grave, l'autre partie pourra résilier de plein droit, 8 jours après mise en demeure restée infructueuse.<br><strong>Conséquences :</strong> le/la prestataire sera rémunéré·e pour les prestations déjà réalisées et acceptées.</p>
<h2>Sous-traitance</h2>
<p>Le/la prestataire ne pourra sous-traiter tout ou partie de la mission sans l'accord préalable et écrit du/de la client·e.</p>
<h2>Litige et droit applicable</h2>
<p>Le présent contrat est soumis au droit français. En cas de litige, les parties rechercheront une solution amiable ; à défaut d'accord dans un délai de 30 jours, le litige sera soumis aux tribunaux compétents du ressort du siège social du/de la client·e.</p>
<h2>Déclarations du/de la prestataire</h2>
<p>Le/la prestataire déclare :<br>☐ Être régulièrement inscrit·e au RCS ou au Répertoire des Métiers<br>☐ Être à jour de ses obligations fiscales et sociales<br>☐ Ne pas être en situation de dépendance économique vis-à-vis du/de la client·e</p>
<p class="ctr-legal">Attention : le recours à un·e prestataire auto-entrepreneur·e est licite uniquement si celui/celle-ci exerce son activité de manière réellement indépendante, sans lien de subordination. À défaut, le contrat pourrait être requalifié en contrat de travail.</p>
`,
        prestation_org: `
<h2>Indépendance des parties</h2>
<p>Le Prestataire exécute la mission en toute indépendance, avec ses propres moyens humains et matériels. Le présent contrat n'établit aucun lien de subordination entre le personnel du Prestataire et le Client, ni aucune société de fait entre les parties.</p>
<h2>Obligations du Prestataire</h2>
<p>Le Prestataire est tenu à une obligation de moyens. Il s'engage à exécuter la mission conformément aux règles de l'art, dans le respect du calendrier convenu, et à informer sans délai le Client de toute difficulté.</p>
<h2>Réception des livrables</h2>
<p>Le Client dispose d'un délai de <span class="ctr-blank">___</span> jours à compter de la remise des livrables pour formuler ses réserves par écrit. Passé ce délai, les livrables sont réputés acceptés. Nombre de séries de corrections incluses : <span class="ctr-blank">___</span>.</p>
<h2>Assurance</h2>
<p>Le Prestataire déclare être titulaire d'une assurance responsabilité civile professionnelle (compagnie : <span class="ctr-blank">_____________</span>, police n° <span class="ctr-blank">_____________</span>) couvrant l'ensemble de la mission.</p>
<h2>Propriété intellectuelle</h2>
<p>Les droits patrimoniaux attachés aux créations réalisées dans le cadre de la mission sont cédés au Client au fur et à mesure de leur création, sous condition du paiement intégral du prix, pour tous supports, tous modes d'exploitation, pour le monde entier et pour la durée légale de protection des droits d'auteur. Le Prestataire garantit que les livrables ne portent atteinte à aucun droit de tiers.</p>
<h2>Confidentialité</h2>
<p>Chaque partie s'engage à garder confidentielles les informations échangées dans le cadre du contrat, pendant sa durée et pendant 2 ans après son terme.</p>
<h2>Sous-traitance</h2>
<p>Le Prestataire ne peut sous-traiter tout ou partie de la mission sans l'accord préalable et écrit du Client. Il demeure en toute hypothèse seul responsable de la bonne exécution.</p>
<h2>Résiliation</h2>
<p><strong>Pour convenance :</strong> chaque partie peut résilier moyennant un préavis de <span class="ctr-blank">___</span> jours notifié par écrit.<br><strong>Pour faute :</strong> en cas de manquement grave non réparé dans les 8 jours suivant une mise en demeure, l'autre partie peut résilier de plein droit.<br><strong>Conséquences :</strong> les prestations réalisées et acceptées à la date d'effet restent dues.</p>
<h2>Litige et droit applicable</h2>
<p>Le contrat est soumis au droit français. Les parties rechercheront une solution amiable ; à défaut d'accord dans un délai de 30 jours, le litige sera porté devant le tribunal compétent du ressort du siège du défendeur.</p>
`,
        benevole: `
<h2>Préambule</h2>
<p>Le présent accord définit les conditions d'une collaboration bénévole dans le cadre d'un projet audiovisuel à but non lucratif ou à budget limité. Il n'établit aucun lien de subordination et ne constitue pas un contrat de travail. Chaque partie s'engage librement et de bonne foi.</p>
<h2>Nature bénévole</h2>
<p>Les parties reconnaissent expressément que cette collaboration est bénévole : aucune rémunération ne sera versée ; aucun lien de subordination n'existe ; le/la collaborateur·rice est libre d'organiser sa participation et peut y mettre fin à tout moment.</p>
<h2>Défraiements</h2>
<p>Le/la porteur·se de projet s'engage, dans la mesure du possible, à prendre en charge :<br>☐ Les repas sur le lieu de tournage/travail<br>☐ Les frais de transport (sur justificatifs)<br>☐ L'hébergement si nécessaire<br><em>Les modalités précises seront définies avant chaque journée de collaboration.</em></p>
<h2>Engagements mutuels</h2>
<p><strong>Le/la porteur·se de projet s'engage à :</strong> traiter le/la collaborateur·rice avec respect, fournir les informations nécessaires, assurer des conditions de travail sécurisées, et le/la mentionner au générique (sauf demande contraire).<br><strong>Le/la collaborateur·rice s'engage à :</strong> participer de bonne foi et avec professionnalisme, respecter les consignes de sécurité, prévenir en cas d'absence, et respecter la confidentialité du projet.</p>
<h2>Crédits et reconnaissance</h2>
<p>☐ Je souhaite apparaître au générique<br>☐ Je ne souhaite pas apparaître au générique</p>
<h2>Propriété intellectuelle</h2>
<p>Le/la collaborateur·rice accepte que sa contribution soit intégrée au projet final. En contrepartie de cette collaboration bénévole et de la mention au générique, il/elle cède gracieusement les droits d'exploitation de sa contribution pour ce projet uniquement.</p>
<h2>Assurance</h2>
<p>Le/la porteur·se de projet déclare :<br>☐ Disposer d'une assurance responsabilité civile couvrant les collaborateurs<br>☐ Ne pas disposer d'assurance spécifique (participation aux risques du/de la collaborateur·rice)</p>
<h2>Esprit de l'accord</h2>
<p><em>Cet accord repose sur la confiance mutuelle, le respect et l'envie commune de réaliser un projet créatif. Les parties s'engagent à communiquer ouvertement et à résoudre tout différend à l'amiable.</em></p>
`
    },

    buildContext: (obj, partyType) => {
        const project = state.data.presentation || {};
        const projectTitle = state.data.title || 'Sans titre';
        let party = {};
        if(partyType === 'org') {
            const fc = (typeof Orgs !== 'undefined' && Orgs._fiche) ? Orgs._fiche(obj) : (obj.fiche || obj);
            party = { name: (fc && fc.name) || obj.name || '', address: (fc && (fc.hq || fc.address || fc.siege)) || '', email: (fc && fc.email) || '', phone: (fc && fc.phone) || '', role: [obj.department, (obj.roleCustom || obj.role)].filter(Boolean).join(' — '), numSecu: '', numCongesSpectacles: '', siret: (fc && fc.siret) || '', legalForm: (fc && fc.legalForm) || '', rep: (fc && fc.leader) || '', isOrg: true };
        } else {
            party = { name: obj.name || '', address: obj.address || '', email: obj.email || '', phone: obj.phone || '', role: obj.role || (partyType === 'actor' ? 'Comédien·ne' : (partyType === 'figurant' ? 'Figurant·e' : 'Technicien·ne')), numSecu: obj.numSecu || '', numCongesSpectacles: obj.numCongesSpectacles || '', siret: '', id: obj.id || null };
        }
        return { project: project, projectTitle: projectTitle, party: party };
    },

    // Modele B2B : la Production (Client) commande une prestation a une structure (Prestataire)
    _orgPrestationBody: (tok) => {
        const blank = (hint) => '<span class="ctr-blank">' + hint + '</span>';
        const client = '<p><strong>Le Client (la Production) :</strong><br>'+tok('prod.name')+'<br>Adresse : '+tok('prod.address')+'<br>SIRET : '+tok('prod.siret')+'<br>Représenté par '+tok('prod.rep')+', '+tok('prod.repTitle')+'.</p>';
        const presta = '<p><strong>Le Prestataire :</strong><br>'+tok('party.name')+' ('+tok('party.legalForm')+')<br>Siège : '+tok('party.address')+'<br>SIRET : '+tok('party.siret')+'<br>Représenté·e par '+tok('party.rep')+'<br>Contact : '+tok('party.email')+' — '+tok('party.phone')+'</p>';
        const objet = '<h2>Objet</h2><p>Le Prestataire s\u2019engage à réaliser pour le Client, dans le cadre du projet « '+tok('project.title')+' », la prestation suivante : '+blank('description de la mission')+'.</p>'
            + '<p>Livrables attendus : '+blank('liste des livrables, formats, quantités')+'.</p>'
            + '<p>La prestation est réalisée conformément au devis n° '+blank('________')+' du '+blank('________')+', accepté par le Client, qui fait partie intégrante du présent contrat.</p>';
        const duree = '<h2>Durée et délais</h2><p>La prestation est exécutée du '+blank('__________')+' au '+blank('__________')+'. Les livrables seront remis au plus tard le '+blank('__________')+'.</p>';
        const prix = '<h2>Prix et facturation</h2><table class="ctr-cs"><tbody>'
            + '<tr><td>Montant HT</td><td>'+blank('_________ €')+'</td></tr>'
            + '<tr><td>TVA</td><td>'+blank('20 % / non applicable, art. 293 B du CGI')+'</td></tr>'
            + '<tr><td>Montant TTC</td><td>'+blank('_________ €')+'</td></tr>'
            + '<tr><td>Acompte à la signature</td><td>'+blank('____ %')+'</td></tr>'
            + '<tr><td>Solde</td><td>'+blank('à la livraison / réception de facture')+'</td></tr>'
            + '</tbody></table><p>Paiement par virement bancaire sous 30 jours à compter de la réception de la facture.</p>';
        const penalites = '<h2>Pénalités de retard</h2><p>Tout retard de paiement entraîne de plein droit l\u2019application de pénalités calculées sur la base de trois fois le taux d\u2019intérêt légal, ainsi qu\u2019une indemnité forfaitaire de 40 € pour frais de recouvrement (articles L.441-10 et D.441-5 du Code de commerce).</p>';
        const sign = '<p>Fait à '+blank('__________')+', le '+blank('__________')+', en deux exemplaires.</p><table class="ctr-sign"><tr><td>Pour le Client<br><small>(signature)</small></td><td>Pour le Prestataire<br><small>(cachet + signature)</small></td></tr></table>';
        return '<h1>CONTRAT DE PRESTATION DE SERVICES</h1>'
            + '<h2>Entre les soussignés</h2>' + client + presta
            + objet + duree + prix + penalites + sign + Contracts._snippets.legal;
    },

    defaultBody: (type, ctx) => {
        const tok = (id) => '<span class="ctr-field" contenteditable="false" data-field="'+id+'">___________</span>';
        if(type === 'prestation' && ctx && ctx.party && ctx.party.isOrg) return Contracts._orgPrestationBody(tok);
        const titles = { image: 'AUTORISATION D\u2019EXPLOITATION DU DROIT À L\u2019IMAGE', cddu: 'CONTRAT À DURÉE DÉTERMINÉE D\u2019USAGE (CDDU)', prestation: 'CONTRAT DE PRESTATION DE SERVICES', benevole: 'ACCORD DE COLLABORATION BÉNÉVOLE' };
        const partiesProd = '<p><strong>La Production :</strong><br>'+tok('prod.name')+'<br>Adresse : '+tok('prod.address')+'<br>SIRET : '+tok('prod.siret')+'<br>Représentée par '+tok('prod.rep')+', '+tok('prod.repTitle')+'.</p>';
        const partyLabel = type === 'prestation' ? 'Le Prestataire' : (type === 'cddu' ? 'Le/La Salarié·e' : 'La Partie');
        const partiesParty = '<p><strong>'+partyLabel+' :</strong><br>'+tok('party.name')+'<br>Adresse : '+tok('party.address')+'<br>Contact : '+tok('party.email')+' — '+tok('party.phone')+'<br>Fonction : '+tok('party.role')+'</p>';
        let extra = '';
        if(type === 'cddu') extra = '<p>N° Sécurité sociale : '+tok('party.secu')+' — N° Congés Spectacles : '+tok('party.conges')+'</p>';
        if(type === 'prestation') extra = '<p>SIRET du prestataire : '+tok('party.siret')+'</p>';
        let objet = '';
        if(type === 'image') objet = '<h2>Objet</h2><p>La Partie autorise la Production à fixer, reproduire et exploiter son image dans le cadre du projet « '+tok('project.title')+' ».</p>';
        else if(type === 'cddu') objet = '<h2>Objet</h2><p>La Production engage le/la salarié·e en qualité de '+tok('party.role')+' pour le projet « '+tok('project.title')+' ».</p>';
        else if(type === 'prestation') objet = '<h2>Objet</h2><p>Le Prestataire réalise pour la Production la prestation suivante dans le cadre du projet « '+tok('project.title')+' » : <span class="ctr-blank">_____________</span>.</p>';
        else objet = '<h2>Objet</h2><p>La Partie participe bénévolement au projet « '+tok('project.title')+' ».</p>';
        const party = (ctx && ctx.party && ctx.party.id && !ctx.party.isOrg) ? { id: ctx.party.id } : null;
        const auto = (type !== 'image' && party && Contracts._callsheet(party).count) ? Contracts._snippetBuilders.callsheet(party) : '';
        const remu = (type === 'cddu' || type === 'prestation') ? Contracts._snippetBuilders.remuTable() : '';
        const dates = '<h2>Période &amp; lieu</h2><p>Du '+Contracts._snippets.date+' au '+Contracts._snippets.date+', '+Contracts._snippets.lieu+'.</p>';
        return '<h1>'+titles[type]+'</h1>'
            + '<h2>Entre les soussigné·e·s</h2>' + partiesProd + partiesParty + extra
            + objet + dates + auto + remu
            + Contracts._snippets.sign
            + Contracts._snippets.legal;
    },

    openEditor: (partyType, idx, type, tplBody, tplTitle) => {
        if(!state.currentProjectId) { Utils.toast('Ouvrez un projet d\u2019abord', 'warning'); return; }
        const list = partyType === 'actor' ? state.data.actors : (partyType === 'org' ? state.data.orgs : (partyType === 'figurant' ? state.data.actors : state.data.crew));
        const obj = (list && list[idx]) || {};
        let partyName = '';
        if(partyType === 'org') { const fc = (typeof Orgs !== 'undefined' && Orgs._fiche) ? Orgs._fiche(obj) : (obj.fiche || obj); partyName = (fc && fc.name) || obj.name || ''; }
        else partyName = obj.name || '';
        Contracts._ctx = Contracts.buildContext(obj, partyType);
        const ct = Contracts.store.create({ partyType: partyType, partyId: obj.id || null, partyName: partyName, type: type, status: 'draft', title: tplTitle || '' });
        ct.body = tplBody || Contracts.defaultBody(type, Contracts._ctx);
        Contracts.store.upsert(ct);
        Contracts._editing = ct.id;
        Contracts.renderHub();
    },

    renderEditor: (ct) => {
        const old = document.getElementById('ctr-editor'); if(old) old.remove();
        const palette = [
            { g: 'Production', items: [['prod.name','Nom'],['prod.address','Adresse'],['prod.siret','SIRET'],['prod.ape','APE/NAF'],['prod.licence','Licence'],['prod.rep','Représentant·e'],['prod.repTitle','Qualité']] },
            { g: 'Personne / Structure', items: [['party.name','Nom'],['party.address','Adresse'],['party.email','Email'],['party.phone','Téléphone'],['party.role','Fonction'],['party.secu','N° Sécu'],['party.conges','Congés Spect.'],['party.siret','SIRET'],['party.legalForm','Forme jur.'],['party.rep','Représentant·e']] },
            { g: 'Projet', items: [['project.title','Titre du projet']] }
        ];
        let paletteHTML = palette.map(grp => '<div class="ctr-pal-group"><div class="ctr-pal-title">'+grp.g+'</div>'+grp.items.map(it => '<button class="ctr-pal-btn" onclick="app.Contracts.insertField(\''+it[0]+'\')">'+it[1]+'</button>').join('')+'</div>').join('');
        paletteHTML += '<div class="ctr-pal-group"><div class="ctr-pal-title">Saisie libre</div>'
            + '<button class="ctr-pal-btn" onclick="app.Contracts.insertSnippet(\'date\')">Date</button>'
            + '<button class="ctr-pal-btn" onclick="app.Contracts.insertSnippet(\'lieu\')">Lieu</button>'
            + '<button class="ctr-pal-btn" onclick="app.Contracts.insertSnippet(\'remu\')">Rémunération</button>'
            + '<button class="ctr-pal-btn" onclick="app.Contracts.insertSnippet(\'sign\')">Signatures</button>'
            + '<button class="ctr-pal-btn" onclick="app.Contracts.insertSnippet(\'legal\')">Mention légale</button>'
            + '</div>';
        paletteHTML += '<div class="ctr-pal-group"><div class="ctr-pal-title">Feuille de service &amp; paie</div>'
            + '<button class="ctr-pal-btn" onclick="app.Contracts.insertField(\'period.range\')">Période (du…au…)</button>'
            + '<button class="ctr-pal-btn" onclick="app.Contracts.insertSnippet(\'callsheet\')">Tableau jours/horaires</button>'
            + '<button class="ctr-pal-btn" onclick="app.Contracts.insertSnippet(\'remuTable\')">Rémunération détaillée</button>'
            + '<button class="ctr-pal-btn" onclick="app.Contracts.insertSnippet(\'heuresSup\')">Heures sup</button>'
            + '</div>';
        paletteHTML += '<div class="ctr-pal-group"><div class="ctr-pal-title">Clauses juridiques</div>'
            + '<button class="ctr-pal-btn" onclick="app.Contracts.insertSnippet(\'clauses\')">Clauses-types (selon le contrat)</button>'
            + '</div>';
        const col3 = document.getElementById('ccol-3'); if(!col3) return;
        // v601 — VERROU PAR CONTRAT. Chaque contrat est une fiche : il a un
        // identifiant, une liste, et un editeur a lui. Il etait reste sur un
        // verrou d'onglet parce que j'avais range « Contrats » avec le Planning
        // et les Depenses, sous « travail qui touche plusieurs elements a la
        // fois » — ce qui etait faux, et le developpeur l'a vu tout de suite.
        // C'est ICI que se trouvent les champs (titre, statut, et le document
        // lui-meme, modifiable directement), donc ici que le verrou s'accroche.
        col3.innerHTML = '<div class="ctr-ed fiche-fenetre" data-fiche="contract:' + String(Contracts._editing || '') + '">'
            + '<div class="contracts-header ctr-editor-header">'
            + '<input id="ctr-title" class="ctr-title-input" placeholder="Titre du contrat (optionnel)" data-tooltip="Titre du contrat (optionnel)" value="'+Contracts._escapeAttr(ct.title || '')+'">'
            + '<select id="ctr-status" class="ctr-status-sel"><option value="draft">Brouillon</option><option value="to_sign">À signer</option><option value="signed">Signé</option><option value="archived">Archivé</option></select>'
            + '<button class="chub-sort-btn" onclick="app.Contracts.resolveFields(document.getElementById(\'ctr-doc\'))">↻ Champs</button>'
            + '<button class="chub-sort-btn" onclick="app.Contracts.renumberArticles()" title="Renuméroter les articles dans l\u2019ordre du document">№ Articles</button>'
            + '<button class="chub-sort-btn active" onclick="app.Contracts.saveEditor()">💾 Enregistrer</button>'
            + '<button class="chub-sort-btn" onclick="app.Contracts.exportPDF()">📄 PDF</button>'
            + '<button class="chub-sort-btn" onclick="app.Contracts.saveAsTemplate()" title="Enregistrer comme modèle réutilisable">⭐ Modèle</button>'
            + '<button class="history-close-btn" onclick="app.Contracts.closeEditor()">✕</button>'
            + '</div>'
            + '<div class="ctr-editor-body"><div class="ctr-palette">'+paletteHTML+'</div><div id="ctr-doc" class="ctr-doc" contenteditable="true"></div></div>'
            + '</div>';
        const doc = document.getElementById('ctr-doc');
        if(doc) {
            doc.innerHTML = Contracts._sanitizeBody(ct.body);
            const frozen = (ct.status === 'signed' || ct.status === 'archived');
            if(!frozen) { Contracts.refreshSnippets(doc, ct); Contracts.resolveFields(doc); }
            Contracts._stampSnippets(doc);
        }
        const st = document.getElementById('ctr-status'); if(st) { st.value = ct.status || 'draft'; st.addEventListener('change', Contracts.refreshLiveBadges); }
        const ti = document.getElementById('ctr-title');
        if(ti) ti.addEventListener('input', () => { clearTimeout(Contracts._liveT); Contracts._liveT = setTimeout(Contracts.refreshLiveBadges, 400); });
    },

    insertHTMLAtCaret: (html) => {
        const ed = document.getElementById('ctr-doc'); if(!ed) return;
        ed.focus();
        const sel = window.getSelection();
        let range;
        if(sel && sel.rangeCount && ed.contains(sel.anchorNode)) range = sel.getRangeAt(0);
        else { range = document.createRange(); range.selectNodeContents(ed); range.collapse(false); }
        range.deleteContents();
        const tpl = document.createElement('template'); tpl.innerHTML = html;
        const frag = tpl.content; const last = frag.lastChild;
        range.insertNode(frag);
        if(last && sel) { range.setStartAfter(last); range.collapse(true); sel.removeAllRanges(); sel.addRange(range); }
    },
    insertField: (id) => {
        const f = Contracts.fields[id]; if(!f) return;
        const val = Utils.escape((Contracts._ctx ? f.resolve(Contracts._ctx) : '') || '___________');
        Contracts.insertHTMLAtCaret('<span class="ctr-field" contenteditable="false" data-field="'+id+'">'+val+'</span>&nbsp;');
    },
    insertSnippet: (key) => {
        const html = (Contracts._snippetBuilders && Contracts._snippetBuilders[key]) ? Contracts._snippetBuilders[key]() : Contracts._snippets[key];
        if(!html) return;
        Contracts.insertHTMLAtCaret(html + ' ');
        Contracts._stampSnippets(document.getElementById('ctr-doc'));
        if(key === 'clauses') Contracts.renumberArticles();
    },
    resolveFields: (root) => {
        if(!root || !root.querySelectorAll) return;
        root.querySelectorAll('[data-field]').forEach(el => {
            const f = Contracts.fields[el.getAttribute('data-field')];
            if(f && Contracts._ctx) el.textContent = (f.resolve(Contracts._ctx) || '___________');
        });
    },
    renumberArticles: () => {
        const ed = document.getElementById('ctr-doc'); if(!ed) return;
        let n = 0;
        ed.querySelectorAll('h2').forEach(h => {
            const nodes = h.childNodes;
            for(let i = 0; i < nodes.length; i++) {
                const node = nodes[i];
                if(node.nodeType === 3 && /ARTICLE\s+\d+/i.test(node.data)) {
                    n++;
                    node.data = node.data.replace(/ARTICLE\s+\d+/i, 'ARTICLE ' + n);
                    break;
                }
            }
        });
    },
    // Empreinte simple (djb2) pour détecter les blocs-instantanés modifiés à la main
    _hash: (s) => { let h = 5381; for(let i = 0; i < s.length; i++) { h = ((h << 5) + h + s.charCodeAt(i)) | 0; } return String(h); },
    // Estampille les blocs data-snippet fraîchement insérés (après normalisation du navigateur)
    _stampSnippets: (root) => {
        if(!root || !root.querySelectorAll) return;
        root.querySelectorAll('[data-snippet]:not([data-hash])').forEach(el => el.setAttribute('data-hash', Contracts._hash(el.innerHTML)));
    },
    // Reconstruit depuis le Planning courant les tableaux jours INTACTS (hash inchangé).
    // Un bloc ajusté à la main (heures sup...) garde la version de l'utilisateur.
    refreshSnippets: (root, ct) => {
        if(!root || !ct || !root.querySelectorAll) return;
        const party = (ct.partyId && ct.partyType !== 'org') ? { id: ct.partyId } : null;
        root.querySelectorAll('[data-snippet="callsheet"]').forEach(el => {
            const stored = el.getAttribute('data-hash');
            if(!stored) return;
            if(Contracts._hash(el.innerHTML) !== stored) return;
            const tpl = document.createElement('template');
            tpl.innerHTML = Contracts._snippetBuilders.callsheet(party);
            const fresh = tpl.content.firstChild;
            if(fresh) { el.innerHTML = fresh.innerHTML; el.setAttribute('data-hash', Contracts._hash(el.innerHTML)); }
        });
    },
    _liveT: null,
    refreshLiveBadges: () => {
        if(!Contracts._editing) return;
        const ct = Contracts.store.get(Contracts._editing); if(!ct) return;
        const sSel = document.getElementById('ctr-status');
        const tInp = document.getElementById('ctr-title');
        const liveStatus = (sSel && sSel.value) || ct.status || 'draft';
        const liveTitle = tInp ? tInp.value : (ct.title || '');
        const row = document.querySelector('.ccol-ctr-open');
        if(row) {
            const tl = row.querySelector('.ccol-ctr-title');
            if(tl) tl.textContent = liveTitle || (Contracts._typeLabel[ct.type] || ct.type);
            const b = row.querySelector('.ctr-badge');
            if(b) { b.className = 'ctr-badge ctr-badge-' + liveStatus; b.textContent = Contracts._statusLabel[liveStatus] || liveStatus; }
        }
        const dots = document.querySelector('.ccol-item-sel .ccol-dots');
        if(dots && Contracts._sel) {
            const cs = Contracts.store.forParty(Contracts._sel.partyType, Contracts._sel.partyId) || [];
            const counts = {};
            cs.forEach(c => { const s = (c.id === ct.id) ? liveStatus : (c.status || 'draft'); counts[s] = (counts[s] || 0) + 1; });
            const order = ['draft', 'to_sign', 'signed', 'archived'];
            dots.innerHTML = cs.length
                ? order.filter(s => counts[s]).map(s => '<span class="ccol-dot ccol-dot-' + s + '" title="' + (Contracts._statusLabel[s] || s) + ' : ' + counts[s] + '">' + counts[s] + '</span>').join('')
                : '<span class="ccol-dot ccol-dot-none" title="Aucun contrat">0</span>';
        }
    },
    _persist: () => {
        const ct = Contracts.store.get(Contracts._editing); if(!ct) return;
        const doc = document.getElementById('ctr-doc'); if(doc) { Contracts.renumberArticles(); ct.body = Contracts._sanitizeBody(doc.innerHTML); }
        const t = document.getElementById('ctr-title'); if(t) ct.title = t.value;
        const s = document.getElementById('ctr-status'); if(s) ct.status = s.value;
        Contracts.store.upsert(ct);
    },
    saveEditor: () => {
        if(!Contracts._editing) return;
        Contracts._persist();
        Utils.toast('Contrat enregistré', 'success');
        Contracts.renderHub();
    },
    closeEditor: () => {
        if(Contracts._editing) Contracts._persist();
        Contracts._editing = null; Contracts._ctx = null;
        if(document.getElementById('contracts-hub')) Contracts.renderHub();
    },

    // ===================== LISTE « MES CONTRATS » + EXPORT (Lot 3) =====================
    _typeLabel: { image: '📸 Droit à l\u2019image', cddu: '📋 CDDU', prestation: '📄 Prestation', benevole: '❤️ Bénévole' },
    _statusLabel: { draft: 'Brouillon', to_sign: 'À signer', signed: 'Signé', archived: 'Archivé' },

    // La fenetre « Mes contrats » (modale #ctr-list) est retiree le 25 aout :
    // son contenu est devenu le sous-onglet « Mes contrats », rendu par
    // Contracts.renderList. Une fenetre pour lire une liste que l'on consulte a
    // chaque passage etait un obstacle, pas une protection.

    // Ouvrir un contrat depuis la liste : on bascule sur le sous-onglet des
    // trois colonnes, c'est la que vit l'editeur.
    openFromList: (id) => {
        Contracts._view = 'hub';
        Contracts.openExisting(id);
    },

    openExisting: (id) => {
        const ct = Contracts.store.get(id); if(!ct) return;
        const list = ct.partyType === 'actor' ? (state.data.actors||[]) : (ct.partyType === 'org' ? (state.data.orgs||[]) : (state.data.crew||[]));
        let obj = ct.partyId ? list.find(x => x.id === ct.partyId) : null;
        if(!obj) obj = list.find(x => { const fc = (ct.partyType==='org' && typeof Orgs !== 'undefined' && Orgs._fiche) ? Orgs._fiche(x) : x; return ((fc && fc.name) || x.name) === ct.partyName; });
        obj = obj || { name: ct.partyName || '' };
        Contracts._ctx = Contracts.buildContext(obj, ct.partyType);
        Contracts._editing = ct.id;
        // renderTab et non renderHub : ouvert depuis le sous-onglet « Mes
        // contrats », le hub etait bien reconstruit mais restait masque — on
        // cliquait une fiche et il ne se passait rien a l'ecran.
        Contracts.renderTab();
    },
    duplicate: (id) => {
        const ct = Contracts.store.get(id); if(!ct) return;
        const copy = Contracts.store.create({ partyType: ct.partyType, partyId: ct.partyId, partyName: ct.partyName, type: ct.type, status: 'draft', title: (ct.title || '') + ' (copie)' });
        copy.body = ct.body; Contracts.store.upsert(copy);
        Contracts.openList();
    },
    removeContract: async (id) => {
        if(!(await ConfirmModal.confirmDelete('Ce contrat sera définitivement supprimé.', 'Supprimer ce contrat ?'))) return;
        if(Contracts._editing === id) Contracts._editing = null;
        Contracts.store.remove(id);
        // Rafraichit le sous-onglet affiche, quel qu'il soit : la carte doit
        // disparaitre de la liste comme de la colonne du milieu.
        Contracts.renderTab();
    },
    exportPDF: async (id) => {
        const ct = id ? Contracts.store.get(id) : Contracts.store.get(Contracts._editing);
        if(!ct) return;
        let body = ct.body || '';
        if(ct.id === Contracts._editing) { const live = document.getElementById('ctr-doc'); if(live) body = live.innerHTML; }
        body = Contracts._sanitizeBody(body);
        if(typeof html2canvas === 'undefined' || !window.jspdf) { Utils.toast('Librairie PDF indisponible', 'error'); return; }
        Utils.toast('Génération du PDF…', 'info');
        const tempDiv = document.createElement('div');
        tempDiv.style.cssText = 'position:fixed; top:0; left:-10000px; width:794px; background:#fff; color:#111; padding:40px 48px; box-sizing:border-box; font-family: Georgia, "Times New Roman", serif; font-size:14px; line-height:1.55;';
        tempDiv.innerHTML = '<style>'
            + '#ctr-pdf-wrap .ctr-field{background:none !important;color:#111 !important;padding:0 !important;}'
            + '#ctr-pdf-wrap .ctr-blank{color:#333 !important;}'
            + '#ctr-pdf-wrap h1{font-size:22px;text-align:center;margin:0 0 14px;}'
            + '#ctr-pdf-wrap h2{font-size:16px;border-bottom:1px solid #999;padding-bottom:3px;margin:16px 0 6px;}'
            + '#ctr-pdf-wrap table{width:100%;border-collapse:collapse;margin:8px 0;}'
            + '#ctr-pdf-wrap td,#ctr-pdf-wrap th{border:1px solid #999;padding:5px 7px;text-align:left;}'
            + '#ctr-pdf-wrap .ctr-legal{font-size:11px;color:#444;font-style:italic;border-top:1px solid #999;padding-top:8px;margin-top:18px;}'
            + '</style><div id="ctr-pdf-wrap">' + body + '</div>';
        document.body.appendChild(tempDiv);
        try {
            const canvas = await html2canvas(tempDiv, { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false });
            await LazyLib.load('pdfexport'); const { jsPDF } = window.jspdf;
            const doc = new jsPDF('p', 'mm', 'a4');
            const pageH = 297, imgW = 210;
            const imgH = canvas.height * imgW / canvas.width;
            const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
            let position = 0, heightLeft = imgH;
            doc.addImage(dataUrl, 'JPEG', 0, position, imgW, imgH);
            heightLeft -= pageH;
            while(heightLeft > 0) { position -= pageH; doc.addPage(); doc.addImage(dataUrl, 'JPEG', 0, position, imgW, imgH); heightLeft -= pageH; }
            const ctrSection = 'Contrat' + (ct.type ? ' - ' + ct.type : '') + (ct.partyName ? ' - ' + ct.partyName : '');
            doc.save((typeof PdfTheme !== 'undefined' && PdfTheme.filename) ? PdfTheme.filename(ctrSection) : `${state.data.title || 'Projet'} - ${ctrSection} - moteur.studio.pdf`);
            Utils.toast('PDF généré', 'success');
        } catch(err) {
            console.warn('[Contrat PDF] échec', err);
            Utils.toast('Échec de la génération PDF', 'error');
        } finally {
            if(tempDiv.parentNode) tempDiv.parentNode.removeChild(tempDiv);
        }
    }

    // Ancienne modale de generation de contrat (openModal + sa chaine de
    // 10 fonctions) et ses modeles ContractsTemplates : SUPPRIMES en v569.
    // Integralement remplacee par le Hub de contrats (newContract /
    // openExisting / openEditor / defaultBody / exportPDF), qui a ses propres
    // textes et sa propre generation PDF.
};


// ========== NOTIFICATIONS ==========

const Notifications = {
    // ===================== ÉTAT & INIT =====================
    unreadCount: 0,
    items: [],
    listenerAttached: false,
    
    // Initialiser l'écoute des notifications
    init: async () => {
        if(!state.currentUser || Notifications.listenerAttached) return;
        
        const email = state.currentUser.email.toLowerCase();
        
        // Charger les notifications initiales
        const loadNotifications = async () => {
            const { data, error } = await supabase
                .from('notifications')
                .select('*')
                .eq('user_email', email)
                .order('created_at', { ascending: false })
                .limit(50);
            
            if(!error && data) {
                Notifications.items = data.map(n => ({
                    id: n.id,
                    type: n.type,
                    title: n.title,
                    message: n.message,
                    link: n.link,
                    read: n.read,
                    timestamp: new Date(n.created_at).getTime()
                }));
                
                Notifications.unreadCount = Notifications.items.filter(n => !n.read).length;
                Notifications.updateBadge();
                Notifications.renderList();
                Notifications._announce();
            }
        };
        
        await loadNotifications();
        
        // Écouter les nouvelles notifications en temps réel
        if(Notifications._channel) { try { await supabase.removeChannel(Notifications._channel); } catch(e) {} }
        const notifChannel = supabase.channel('notifications_' + email);
        notifChannel.on('postgres_changes', 
                { event: '*', schema: 'public', table: 'notifications', filter: 'user_email=eq.' + email },
                () => loadNotifications()
            )
            .subscribe();
        Notifications._channel = notifChannel;
        
        Notifications.listenerAttached = true;
    },
    
    // ——— Suivi des notifications connues (toasts live chat/messagerie retirés) ———
    _known: null,
    _announce: () => {
        if(!Notifications._known) Notifications._known = new Set();
        Notifications.items.forEach(n => Notifications._known.add(n.id));
    },

    // Mettre à jour le badge
    updateBadge: () => {
        const badge = document.getElementById('notif-badge');
        if(!badge) return;
        
        if(Notifications.unreadCount > 0) {
            badge.textContent = Notifications.unreadCount > 99 ? '99+' : Notifications.unreadCount;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    },
    
    // Afficher/masquer le panneau
    togglePanel: () => {
        const panel = document.getElementById('notif-panel');
        if(panel) {
            panel.classList.toggle('visible');
        }
    },
    
    // Fermer le panneau
    closePanel: () => {
        const panel = document.getElementById('notif-panel');
        if(panel) {
            panel.classList.remove('visible');
        }
    },
    
    // Rendre la liste
    // ===================== LISTE & RENDU =====================
    renderList: () => {
        const list = document.getElementById('notif-list');
        if(!list) return;
        
        if(Notifications.items.length === 0) {
            list.innerHTML = '<div class="notif-empty">🔕 Aucune notification</div>';
            return;
        }
        
        list.innerHTML = Notifications.items.map(n => {
            const date = new Date(n.timestamp);
            const timeAgo = Notifications.getTimeAgo(date);
            const icon = Notifications.getIcon(n.type);
            const unreadClass = n.read ? '' : 'unread';
            
            return `
                <div class="notif-item ${unreadClass}" onclick="app.Notifications.handleClick('${n.id}', '${n.type}', '${n.projectId || ''}')">
                    <span class="notif-icon">${icon}</span>
                    <div class="notif-content">
                        <div class="notif-text">${Utils.escape(Notifications._displayText(n))}</div>
                        <div class="notif-time">${timeAgo}</div>
                    </div>
                </div>
            `;
        }).join('');
    },

    // Texte lisible d'une notification. Les commentaires invites (script_comments)
    // sont stockes en JSON par l'Edge Function ; on le traduit en une phrase.
    _displayText: (n) => {
        if(n.type === 'script_comments') {
            try {
                const d = JSON.parse(n.message);
                const who = (d.from || d.email || 'Un relecteur');
                const c = d.count || 0;
                return who + ' a déposé ' + c + ' commentaire' + (c > 1 ? 's' : '') + ' sur un partage.';
            } catch(e) { return 'Nouveaux commentaires sur un partage.'; }
        }
        return n.message || '';
    },
    
    // Obtenir l'icône selon le type
    getIcon: (type) => {
        const icons = {
            'invite': '📨',
            'message': '💬',
            'script_comments': '💬',
            'modification': '✏️',
            'share': '👥'
        };
        return icons[type] || '🔔';
    },
    
    // Calculer "il y a X temps"
    getTimeAgo: (date) => {
        const seconds = Math.floor((new Date() - date) / 1000);
        
        if(seconds < 60) return "À l'instant";
        if(seconds < 3600) return `Il y a ${Math.floor(seconds / 60)} min`;
        if(seconds < 86400) return `Il y a ${Math.floor(seconds / 3600)}h`;
        if(seconds < 604800) return `Il y a ${Math.floor(seconds / 86400)}j`;
        return date.toLocaleDateString('fr-FR');
    },
    
    // Gérer le clic sur une notification
    handleClick: async (notifId, type, projectId) => {
        // Marquer comme lu
        await Notifications.markAsRead(notifId);
        
        // Action selon le type
        if(type === 'invite' && projectId) {
            Notifications.closePanel();
            Store.loadProject(projectId);
        }
        if(type === 'script_comments') {
            const it = Notifications.items.find(n => String(n.id) === String(notifId));
            const pid = (it && it.link) ? it.link : projectId;
            if(pid) { Notifications.closePanel(); Store.loadProject(pid); }
        }
    },
    
    // Marquer une notification comme lue
    markAsRead: async (notifId) => {
        if(!state.currentUser) return;
        
        try {
            const {error: mrErr} = await supabase.from('notifications').update({ read: true }).eq('id', notifId);
            if(mrErr) throw mrErr;
        } catch(e) {
            console.error('Erreur markAsRead:', e);
        }
    },

    // Effacer toutes les notifications
    clearAll: async () => {
        if(!state.currentUser) return;
        if(Notifications.items.length === 0) { Utils.toast('Aucune notification à effacer', 'info'); return; }
        const ok = await ConfirmModal.confirm('Effacer toutes vos notifications ? Cette action est définitive.', 'Effacer les notifications', true);
        if(!ok) return;
        const email = state.currentUser.email.toLowerCase();
        try {
            const { error } = await supabase.from('notifications').delete().eq('user_email', email);
            if(error) throw error;
            Notifications.items = [];
            Notifications.unreadCount = 0;
            Notifications.updateBadge();
            Notifications.renderList();
            Utils.toast('Notifications effacées', 'success');
        } catch(e) {
            console.error('Erreur clearAll:', e);
            Utils.toast("Impossible d'effacer les notifications.", 'error');
        }
    },

    // Envoyer une notification à un utilisateur
    // ===================== ENVOI & RÔLES =====================
    send: async (toEmail, type, message, projectId = null) => {
        const notif = {
            user_email: toEmail.toLowerCase(),
            type: type,
            title: type === 'invite' ? '📨 Invitation' : '🔔 Notification',
            message: message,
            link: projectId,
            read: false
        };
        
        try {
            const {error: notifErr2} = await supabase.from('notifications').insert(notif);
            if(notifErr2) throw notifErr2;
        } catch(e) {
            console.error('Erreur envoi notification:', e);
        }
    },
    
    // v593 : toggle() retiré — doublon jamais appelé de togglePanel() ci-dessus,
    // qui est la seule fonction réellement câblée sur le bouton du header.
    
    // 1er septembre — updateRoleBadge RETIREE (67 lignes). Elle calculait un
    // libelle de role (proprietaire, responsable de budget, responsable de
    // departement, poste dans l'equipe) pour un element #user-role-badge qui
    // n'existe NULLE PART : ni dans le HTML, ni dans une chaine de gabarit, et
    // sans la moindre regle CSS .user-role-badge. Elle sortait donc sur son
    // premier if a chaque appel, depuis on ne sait quelle refonte d'en-tete.
    // Si le badge revient un jour, c'est une fonction a reecrire, pas a
    // deterrer : la table des roles a change deux fois depuis (etape 7b).
};

const History = {
    // Cap global d'entrées dans le journal (partagé tous users)
    MAX_ENTRIES: 50,
    
    // Types d'actions
    TYPES: {
        ADD: { icon: '➕', label: 'Ajout', class: 'add' },
        EDIT: { icon: '✏️', label: 'Modification', class: 'edit' },
        DELETE: { icon: '🗑️', label: 'Suppression', class: 'delete' },
        SHARE: { icon: '👥', label: 'Partage', class: 'share' },
        EXPORT: { icon: '📤', label: 'Export', class: 'export' },
        REORDER: { icon: '🔀', label: 'Réorganisation', class: 'reorder' },
        PERMISSIONS: { icon: '🔐', label: 'Permissions', class: 'permissions' },
        MERGE: { icon: '🔗', label: 'Fusion', class: 'merge' }
    },
    
    // === Helper : extrait tous les champs scalaires d'un item (auto-extensible) ===
    // Exclut id et les champs passés dans excludeKeys (typiquement les médias gérés séparément)
    // Capture aussi les arrays courts d'éléments simples (ex: availabilityDates) en JSON
    _extractScalars: (item, excludeKeys = []) => {
        if(!item || typeof item !== 'object') return {};
        const result = {};
        const skip = new Set(['id', ...(excludeKeys || [])]);
        for(const [k, v] of Object.entries(item)) {
            if(skip.has(k)) continue;
            if(v === null || v === undefined || v === '') continue;
            if(typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
                result[k] = v;
            } else if(Array.isArray(v) && v.length > 0 && v.every(x => typeof x === 'string' || typeof x === 'number')) {
                result[k] = v;
            }
            // Objets et tableaux complexes ignorés (évite de capturer breakdown, drawings, etc.)
        }
        return result;
    },
    
    // === Helper D1 : capturer le contenu récupérable AVANT suppression ===
    // Retourne un objet "recoverable" prêt à être inclus dans une entrée d'historique
    // kind : 'scene', 'actor', 'character', 'location', 'resource', 'crew', 'shot', 'expense', 'episode', 'season'
    // Le tableau "media" contient des URLs (déjà en Storage). Si l'item a des base64, ils sont uploadés vers history/
    captureRecoverable: async (item, kind, logId) => {
        if(!item) return null;
        const recoverable = { text: null, media: [], metadata: {} };
        
        // Helper local : upload un base64 vers history/ Storage
        const uploadToHistory = async (dataUrl, label) => {
            if(!dataUrl || !state.currentProjectId) return null;
            // Si déjà une URL (Storage), on garde tel quel (pas besoin de re-uploader)
            if(typeof dataUrl === 'string' && dataUrl.startsWith('http')) return dataUrl;
            // Sinon c'est du base64, on uploade
            if(typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return null;
            try {
                const blob = await (await fetch(dataUrl)).blob();
                const ext = blob.type === 'image/png' ? 'png' : (blob.type === 'image/svg+xml' ? 'svg' : 'jpg');
                const filename = `${logId}_${Date.now()}_${Math.random().toString(36).slice(2,7)}.${ext}`;
                const filePath = `${state.currentProjectId}/history/${filename}`;
                const { error } = await supabase.storage.from('projects').upload(filePath, blob, { contentType: blob.type, upsert: false });
                if(error) { console.warn('Upload history media failed:', error.message); return null; }
                const { data: urlData } = supabase.storage.from('projects').getPublicUrl(filePath);
                return urlData?.publicUrl || null;
            } catch(e) {
                console.warn('Exception upload history media:', e);
                return null;
            }
        };
        
        try {
            // Spécialisation par type d'item
            if(kind === 'scene') {
                recoverable.text = {
                    label: 'Contenu de la scène',
                    preview: (item.scriptContent || '').replace(/<[^>]+>/g, '').substring(0, 200),
                    content: item.scriptContent || ''
                };
                recoverable.metadata = {
                    title: item.title || '',
                    seasonId: item.seasonId, episodeId: item.episodeId,
                    breakdown: item.breakdown || {}
                };
            } else if(kind === 'actor') {
                const photoUrl = item.photo ? await uploadToHistory(item.photo, 'photo') : null;
                if(photoUrl) recoverable.media.push({ kind: 'photo', label: 'Photo principale', url: photoUrl });
                if(Array.isArray(item.galleryPhotos)) {
                    for(let i = 0; i < item.galleryPhotos.length; i++) {
                        const url = await uploadToHistory(item.galleryPhotos[i], 'gallery');
                        if(url) recoverable.media.push({ kind: 'gallery', label: `Photo galerie ${i+1}`, url });
                    }
                }
                // Capture exhaustive de tous les champs scalaires (auto-extensible)
                recoverable.metadata = History._extractScalars(item, ['photo', 'galleryPhotos', 'availabilityDates']);
                if(item.bio) recoverable.text = { label: 'Bio', preview: item.bio.substring(0, 200), content: item.bio };
            } else if(kind === 'character') {
                recoverable.metadata = History._extractScalars(item, []);
                if(item.bio) recoverable.text = { label: 'Bio', preview: item.bio.substring(0, 200), content: item.bio };
            } else if(kind === 'location') {
                if(Array.isArray(item.galleryPhotos)) {
                    for(let i = 0; i < item.galleryPhotos.length; i++) {
                        const url = await uploadToHistory(item.galleryPhotos[i], 'gallery');
                        if(url) recoverable.media.push({ kind: 'gallery', label: `Photo ${i+1}`, url });
                    }
                }
                recoverable.metadata = History._extractScalars(item, ['galleryPhotos']);
                if(item.desc) recoverable.text = { label: 'Description', preview: item.desc.substring(0, 200), content: item.desc };
            } else if(kind === 'resource') {
                const photoUrl = item.photo ? await uploadToHistory(item.photo, 'photo') : null;
                if(photoUrl) recoverable.media.push({ kind: 'photo', label: 'Photo', url: photoUrl });
                recoverable.metadata = History._extractScalars(item, ['photo']);
                if(item.description) recoverable.text = { label: 'Description', preview: item.description.substring(0, 200), content: item.description };
            } else if(kind === 'crew') {
                const photoUrl = item.photo ? await uploadToHistory(item.photo, 'photo') : null;
                if(photoUrl) recoverable.media.push({ kind: 'photo', label: 'Photo principale', url: photoUrl });
                if(Array.isArray(item.galleryPhotos)) {
                    for(let i = 0; i < item.galleryPhotos.length; i++) {
                        const url = await uploadToHistory(item.galleryPhotos[i], 'gallery');
                        if(url) recoverable.media.push({ kind: 'gallery', label: `Photo galerie ${i+1}`, url });
                    }
                }
                recoverable.metadata = History._extractScalars(item, ['photo', 'galleryPhotos', 'availabilityDates']);
            } else if(kind === 'shot') {
                if(item.imageUrl) {
                    const url = await uploadToHistory(item.imageUrl, 'main');
                    if(url) recoverable.media.push({ kind: 'main', label: 'Image principale du plan', url });
                }
                // Calques + objets vectoriels par zone
                if(item.drawings) {
                    for(const zoneKind of ['original', 'lighting', 'camera', 'actors']) {
                        const zone = item.drawings[zoneKind];
                        if(!zone) continue;
                        if(Array.isArray(zone.objects)) {
                            for(let i = 0; i < zone.objects.length; i++) {
                                const obj = zone.objects[i];
                                if(obj.type === 'image' && obj.imageData) {
                                    const url = await uploadToHistory(obj.imageData, `${zoneKind}_obj`);
                                    if(url) recoverable.media.push({ kind: `${zoneKind}_obj`, label: `Image insérée (${zoneKind})`, url });
                                }
                            }
                        }
                        if(zone.drawingData && Array.isArray(zone.drawingData.layers)) {
                            for(let i = 0; i < zone.drawingData.layers.length; i++) {
                                const layer = zone.drawingData.layers[i];
                                if(layer.imageData) {
                                    const url = await uploadToHistory(layer.imageData, `${zoneKind}_layer`);
                                    if(url) recoverable.media.push({ kind: `${zoneKind}_layer`, label: `Calque ${zoneKind} : ${layer.name || i+1}`, url });
                                }
                            }
                        }
                    }
                }
                recoverable.metadata = { sceneId: item.sceneId, name: item.name, description: item.description, shotType: item.shotType, cameraMove: item.cameraMove };
                if(item.description) recoverable.text = { label: 'Description du plan', preview: item.description.substring(0, 200), content: item.description };
            } else if(kind === 'expense') {
                recoverable.metadata = { title: item.title, amount: item.amountTTC || item.amount, category: item.category, date: item.date, note: item.note };
            } else if(kind === 'episode' || kind === 'season') {
                recoverable.metadata = { number: item.number, title: item.title, description: item.description || item.synopsis };
                if(item.synopsis) recoverable.text = { label: 'Synopsis', preview: item.synopsis.substring(0, 200), content: item.synopsis };
            } else {
                // Type non spécialisé : on stocke un dump basique
                recoverable.metadata = Object.fromEntries(
                    Object.entries(item).filter(([k, v]) => 
                        typeof v !== 'object' && typeof v !== 'function' && k !== 'id'
                    ).slice(0, 10)
                );
            }
        } catch(e) {
            console.warn('captureRecoverable error:', e);
        }
        
        return recoverable;
    },
    
    // === Helper D1 : nettoyer les médias Storage d'une entrée de log expirée ===
    // Appelée quand une entrée sort du cap (50 entrées) pour libérer le Storage
    cleanupExpiredEntry: async (entry) => {
        if(!entry || !entry.recoverable || !Array.isArray(entry.recoverable.media)) return;
        for(const media of entry.recoverable.media) {
            if(media.url && typeof Utils !== 'undefined' && Utils.deleteProjectFile) {
                Utils.deleteProjectFile(media.url);
            }
        }
    },
    
    // === Enregistrer une action dans l'historique (signature v2 Phase D) ===
    // Signature moderne (recommandée) :
    //   History.log(type, description, { link, recoverable, target, details })
    // Signature legacy (encore supportée pour compatibilité) :
    //   History.log(type, description, details, level)
    //   → le 3e arg est un objet "détails" libre, le 4e level est ignoré
    //
    // type : ADD | EDIT | DELETE | SHARE | EXPORT | REORDER | PERMISSIONS | MERGE
    // options :
    //   - link : { tab, id }  → bouton "Aller à" dans la modale Journal
    //   - recoverable : { text, media, metadata }  → contenu récupérable après suppression
    //   - target : { kind, id, label }  → l'objet visé
    //   - details : objet libre pour compat
    log: async (type, description, options = {}) => {
        if(!state.currentProjectId || !state.currentUser) return;
        
        // Compatibilité backward : si options ressemble à un ancien "details" (n'a pas link/recoverable/target),
        // on le considère comme details. Sinon c'est la nouvelle signature.
        const isLegacy = options && typeof options === 'object' 
                         && !('link' in options) 
                         && !('recoverable' in options) 
                         && !('target' in options) 
                         && !('details' in options);
        const normalized = isLegacy 
            ? { details: options, link: null, recoverable: null, target: null }
            : {
                link: options.link || null,
                recoverable: options.recoverable || null,
                target: options.target || null,
                details: options.details || {}
            };
        
        const entry = {
            id: 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
            type: type,
            description: description,
            user: {
                email: state.currentUser.email,
                name: state.currentUser.displayName || state.currentUser.email.split('@')[0]
            },
            timestamp: Date.now(),
            // Nouveaux champs v2
            link: normalized.link,
            recoverable: normalized.recoverable,
            target: normalized.target,
            // Champ legacy conservé
            details: normalized.details
        };
        
        try {
            // Stocker l'historique dans les données du projet
            if(!state.data.history) state.data.history = [];
            state.data.history.unshift(entry);
            
            // Cap à MAX_ENTRIES (50) avec cleanup Storage pour les entrées qui sortent
            if(state.data.history.length > History.MAX_ENTRIES) {
                const expired = state.data.history.slice(History.MAX_ENTRIES);
                state.data.history = state.data.history.slice(0, History.MAX_ENTRIES);
                // Nettoyer les médias Storage des entrées expirées (async, sans bloquer)
                for(const exp of expired) {
                    History.cleanupExpiredEntry(exp).catch(() => {});
                }
            }
            // Ne pas appeler Store.save() ici pour éviter les boucles
        } catch(e) {
            console.error('Erreur historique:', e);
        }
    },
    
    // Charger l'historique
    load: async () => {
        if(!state.currentProjectId) return [];
        
        try {
            return state.data.history || [];
        } catch(e) {
            console.error('Erreur chargement historique:', e);
            return [];
        }
    },
    
    // Ouvrir la modale [Phase D - refonte]
    openModal: async () => {
        if(!state.currentProjectId) {
            Utils.toast('Ouvrez un projet d\'abord', 'warning');
            return;
        }
        
        const entries = await History.load();
        const users = [...new Set(entries.map(e => e.user?.email).filter(Boolean))];
        
        const modal = document.createElement('div');
        modal.className = 'history-modal';
        modal.id = 'history-modal';
        modal.onclick = (e) => { if(e.target === modal) History.closeModal(); };
        
        // Par défaut : afficher "Mes actions" si l'utilisateur a au moins une action, sinon "Toutes"
        const myEmail = state.currentUser?.email || '';
        const hasMyActions = entries.some(e => e.user?.email === myEmail);
        const defaultTab = hasMyActions ? 'mine' : 'all';
        
        modal.innerHTML = `
            <div class="history-box">
                <div class="history-header">
                    <h3>📜 Journal des modifications</h3>
                    <button class="history-close-btn" onclick="app.History.closeModal()">✕</button>
                </div>
                <div class="history-tabs" style="display:flex; gap:8px; padding:0 16px; border-bottom:1px solid var(--border);">
                    <button id="history-tab-mine" onclick="app.History.switchTab('mine')" class="history-tab ${defaultTab === 'mine' ? 'active' : ''}" style="padding:10px 18px; background:none; border:none; border-bottom:3px solid ${defaultTab === 'mine' ? 'var(--primary)' : 'transparent'}; cursor:pointer; color:var(--text-main); font-weight:${defaultTab === 'mine' ? '600' : '400'};">
                        👤 Mes actions
                    </button>
                    <button id="history-tab-all" onclick="app.History.switchTab('all')" class="history-tab ${defaultTab === 'all' ? 'active' : ''}" style="padding:10px 18px; background:none; border:none; border-bottom:3px solid ${defaultTab === 'all' ? 'var(--primary)' : 'transparent'}; cursor:pointer; color:var(--text-main); font-weight:${defaultTab === 'all' ? '600' : '400'};">
                        🌐 Tout le projet
                    </button>
                </div>
                <div class="history-filters" style="padding:12px 16px; display:flex; gap:8px;">
                    <select id="history-filter-type" onchange="app.History.applyFilters()" style="padding:6px 10px; border-radius:6px; border:1px solid var(--border); background:var(--input-bg);">
                        <option value="">Tous les types</option>
                        <option value="ADD">➕ Ajouts</option>
                        <option value="EDIT">✏️ Modifications</option>
                        <option value="DELETE">🗑️ Suppressions</option>
                        <option value="MERGE">🔗 Fusions</option>
                        <option value="REORDER">🔀 Réorganisations</option>
                        <option value="PERMISSIONS">🔐 Permissions</option>
                        <option value="SHARE">👥 Partages</option>
                        <option value="EXPORT">📤 Exports</option>
                    </select>
                    <select id="history-filter-user" onchange="app.History.applyFilters()" style="padding:6px 10px; border-radius:6px; border:1px solid var(--border); background:var(--input-bg);">
                        <option value="">Tous les utilisateurs</option>
                        ${users.map(u => `<option value="${Utils.escape(u)}">${Utils.escape(u)}</option>`).join('')}
                    </select>
                </div>
                <div class="history-list" id="history-list">
                    ${History.renderEntries(History.filterByTab(entries, defaultTab))}
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        state.historyEntries = entries;
        state.historyCurrentTab = defaultTab;
    },
    
    // Basculer entre les onglets "Mes actions" / "Tout"
    switchTab: (tab) => {
        if(tab !== 'mine' && tab !== 'all') return;
        state.historyCurrentTab = tab;
        // Mettre à jour le style des onglets
        ['mine', 'all'].forEach(t => {
            const btn = document.getElementById('history-tab-' + t);
            if(btn) {
                const isActive = t === tab;
                btn.style.borderBottomColor = isActive ? 'var(--primary)' : 'transparent';
                btn.style.fontWeight = isActive ? '600' : '400';
            }
        });
        History.applyFilters();
    },
    
    // Filtrer selon l'onglet courant (mine = mes actions, all = toutes)
    filterByTab: (entries, tab) => {
        if(tab === 'all') return entries;
        const myEmail = state.currentUser?.email || '';
        return (entries || []).filter(e => e.user?.email === myEmail);
    },
    
    // Fermer la modale
    closeModal: () => {
        const modal = document.getElementById('history-modal');
        if(modal) modal.remove();
    },
    
    // Appliquer les filtres
    applyFilters: () => {
        const typeFilter = document.getElementById('history-filter-type')?.value || '';
        const userFilter = document.getElementById('history-filter-user')?.value || '';
        const currentTab = state.historyCurrentTab || 'all';
        
        let filtered = History.filterByTab(state.historyEntries || [], currentTab);
        
        if(typeFilter) {
            filtered = filtered.filter(e => e.type === typeFilter);
        }
        if(userFilter) {
            filtered = filtered.filter(e => e.user?.email === userFilter);
        }
        
        const listEl = document.getElementById('history-list');
        if(listEl) {
            listEl.innerHTML = History.renderEntries(filtered);
        }
    },
    
    // Rendre les entrées HTML [Phase D - enrichi]
    renderEntries: (entries) => {
        if(!entries || entries.length === 0) {
            return '<div class="history-empty">📭 Aucune modification enregistrée</div>';
        }
        
        return entries.map(entry => {
            const typeInfo = History.TYPES[entry.type] || History.TYPES.EDIT;
            const date = new Date(entry.timestamp);
            const dateStr = date.toLocaleDateString('fr-FR');
            const timeStr = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
            const entryId = entry.id || ('legacy_' + entry.timestamp);
            
            // Boutons d'action selon le type
            let actionButtons = '';
            if(entry.type === 'DELETE' && entry.recoverable) {
                const hasContent = (entry.recoverable.text?.content) 
                                 || (Array.isArray(entry.recoverable.media) && entry.recoverable.media.length > 0)
                                 || (entry.recoverable.metadata && Object.keys(entry.recoverable.metadata).length > 0);
                if(hasContent) {
                    actionButtons = `<button onclick="app.History.toggleDetails('${entryId}')" class="history-action-btn" style="margin-top:6px; padding:4px 10px; background:var(--bg); border:1px solid var(--border); border-radius:4px; cursor:pointer; font-size:0.85rem;">📋 Voir les conséquences</button>`;
                }
            } else if(entry.link && (entry.link.kind || entry.link.tab)) {
                // [Phase A] Le link peut être { kind, id, ... } ou legacy { tab, id }
                actionButtons = `<button onclick="app.History.goToLink('${entryId}')" class="history-action-btn" style="margin-top:6px; padding:4px 10px; background:var(--bg); border:1px solid var(--border); border-radius:4px; cursor:pointer; font-size:0.85rem;">🔗 Aller à la fiche</button>`;
            }
            
            // Section détails (accordéon) cachée par défaut, contient le contenu recoverable
            let detailsHtml = '';
            if(entry.type === 'DELETE' && entry.recoverable) {
                detailsHtml = `<div id="history-details-${entryId}" class="history-details" style="display:none; margin-top:10px; padding:12px; background:var(--bg); border:1px solid var(--border); border-radius:6px;">${History.renderRecoverable(entry.recoverable, entryId)}</div>`;
            }
            
            return `
                <div class="history-item" data-entry-id="${entryId}">
                    <div class="history-icon ${typeInfo.class}">${typeInfo.icon}</div>
                    <div class="history-content">
                        <div class="history-action">${Utils.escape(entry.description)}</div>
                        <div class="history-meta">
                            <span>👤 ${Utils.escape(entry.user?.name || 'Inconnu')}</span>
                            <span>📅 ${dateStr} à ${timeStr}</span>
                        </div>
                        ${actionButtons}
                        ${detailsHtml}
                    </div>
                </div>
            `;
        }).join('');
    },
    
    // Rendre le contenu récupérable d'une entrée DELETE
    renderRecoverable: (recoverable, entryId) => {
        if(!recoverable) return '<em style="color:var(--text-sec);">Aucun contenu récupérable.</em>';
        
        let html = '';
        
        // Métadonnées (infos contextuelles)
        if(recoverable.metadata && Object.keys(recoverable.metadata).length > 0) {
            const metaItems = Object.entries(recoverable.metadata)
                .filter(([k, v]) => v !== null && v !== undefined && v !== '')
                .map(([k, v]) => {
                    let displayVal = v;
                    if(Array.isArray(v)) {
                        if(v.length === 0) return null;
                        displayVal = v.length > 5 ? v.slice(0, 5).join(', ') + ` ... (+${v.length-5})` : v.join(', ');
                    } else if(typeof v === 'object') {
                        displayVal = JSON.stringify(v);
                    }
                    return `<div style="margin:4px 0;"><strong style="color:var(--text-sec); font-size:0.85rem;">${Utils.escape(k)} :</strong> <span style="font-size:0.9rem;">${Utils.escape(String(displayVal))}</span></div>`;
                })
                .filter(Boolean);
            if(metaItems.length > 0) {
                html += `<div style="margin-bottom:12px;"><div style="font-weight:600; margin-bottom:6px; color:var(--text-main);">📋 Informations</div>${metaItems.join('')}</div>`;
            }
        }
        
        // Texte récupérable
        if(recoverable.text && recoverable.text.content) {
            const safeContent = Utils.escape(recoverable.text.content);
            html += `
                <div style="margin-bottom:12px;">
                    <div style="font-weight:600; margin-bottom:6px; color:var(--text-main); display:flex; justify-content:space-between; align-items:center;">
                        <span>📝 ${Utils.escape(recoverable.text.label || 'Texte')}</span>
                        <button onclick="app.History.copyText('${entryId}_text')" style="padding:3px 8px; background:var(--primary); color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:0.8rem;">📋 Copier</button>
                    </div>
                    <textarea id="history-text-${entryId}_text" readonly style="width:100%; min-height:80px; max-height:200px; padding:8px; border:1px solid var(--border); border-radius:4px; background:var(--input-bg); color:var(--text-main); font-family:inherit; font-size:0.85rem; resize:vertical;">${safeContent}</textarea>
                </div>
            `;
        }
        
        // Médias (images)
        if(Array.isArray(recoverable.media) && recoverable.media.length > 0) {
            const mediaItems = recoverable.media.map((m, i) => {
                if(!m.url) return '';
                const safeUrl = Utils.escape(m.url);
                const safeLabel = Utils.escape(m.label || `Média ${i+1}`);
                return `
                    <div style="display:flex; align-items:center; gap:10px; padding:6px; background:var(--input-bg); border-radius:4px; margin-bottom:6px;">
                        <img src="${safeUrl}" style="width:60px; height:60px; object-fit:cover; border-radius:4px; flex-shrink:0;" alt="${safeLabel}" onerror="this.style.display='none'">
                        <div style="flex:1; min-width:0;">
                            <div style="font-size:0.9rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${safeLabel}</div>
                        </div>
                        <button onclick="app.History.viewImage('${safeUrl}', '${safeLabel.replace(/'/g, '&#39;')}')" style="padding:4px 10px; background:var(--bg); border:1px solid var(--border); border-radius:4px; cursor:pointer; font-size:0.8rem; flex-shrink:0;">👁️ Voir</button>
                        <button onclick="app.History.downloadImage('${safeUrl}', '${safeLabel.replace(/'/g, '&#39;')}')" style="padding:4px 10px; background:var(--primary); color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:0.8rem; flex-shrink:0;">⬇️ Télécharger</button>
                    </div>
                `;
            }).filter(Boolean).join('');
            if(mediaItems) {
                html += `<div style="margin-bottom:12px;"><div style="font-weight:600; margin-bottom:6px; color:var(--text-main);">🖼️ Images récupérables (${recoverable.media.length})</div>${mediaItems}</div>`;
            }
        }
        
        return html || '<em style="color:var(--text-sec);">Aucun contenu récupérable.</em>';
    },
    
    // Basculer l'affichage de l'accordéon des détails
    toggleDetails: (entryId) => {
        const el = document.getElementById('history-details-' + entryId);
        if(!el) return;
        const isOpen = el.style.display !== 'none';
        el.style.display = isOpen ? 'none' : 'block';
    },
    
    // Copier le texte d'une entrée dans le presse-papier
    copyText: (textKey) => {
        const ta = document.getElementById('history-text-' + textKey);
        if(!ta) return;
        ta.select();
        try {
            navigator.clipboard.writeText(ta.value).then(() => {
                Utils.toast('Texte copié dans le presse-papier', 'success', 2000);
            }).catch(() => {
                // Fallback : execCommand (deprecated mais marche encore)
                document.execCommand('copy');
                Utils.toast('Texte copié', 'success', 2000);
            });
        } catch(e) {
            Utils.toast('Erreur copie', 'error');
        }
    },
    
    // Ouvrir une image en grand dans une lightbox
    viewImage: (url, label) => {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); display:flex; justify-content:center; align-items:center; z-index: var(--z-modal); cursor:pointer; padding:20px;';
        overlay.onclick = () => overlay.remove();
        overlay.innerHTML = `
            <div style="max-width:90%; max-height:90%; display:flex; flex-direction:column; align-items:center;">
                <img src="${url}" alt="Image agrandie" style="max-width:100%; max-height:80vh; object-fit:contain; border-radius:8px; box-shadow:0 8px 30px rgba(0,0,0,0.5);">
                <div style="margin-top:12px; color:#fff; font-size:0.9rem; text-align:center;">${label}</div>
                <div style="margin-top:10px; color:#aaa; font-size:0.8rem;">(cliquer pour fermer)</div>
            </div>
        `;
        document.body.appendChild(overlay);
    },
    
    // Téléchargement réel d'une image (fetch + blob pour bypass le bug cross-origin de <a download>)
    downloadImage: async (url, label) => {
        try {
            Utils.toast('Téléchargement...', 'info', 1500);
            const response = await fetch(Utils.signedUrlFor(url), { mode: 'cors' });
            if(!response.ok) throw new Error('HTTP ' + response.status);
            const blob = await response.blob();
            // Déterminer l'extension
            const ext = blob.type === 'image/png' ? 'png' : (blob.type === 'image/svg+xml' ? 'svg' : (blob.type === 'image/gif' ? 'gif' : 'jpg'));
            // Construire un nom de fichier propre
            const cleanLabel = (label || 'image').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 60);
            const filename = `${cleanLabel}.${ext}`;
            // Trigger download
            const blobUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
            Utils.toast(`Téléchargé : ${filename}`, 'success');
        } catch(e) {
            console.error('Download error:', e);
            Utils.toast('Erreur téléchargement. Essayez clic-droit sur "Voir" → Enregistrer', 'error', 4000);
        }
    },
    
    // Naviguer vers la fiche/zone concernée par une action (ADD/EDIT) [Phase A enrichie]
    // link peut être :
    //   { kind: 'actor'|'character'|'location', id: 'xxx' }      → ouvre CardModal
    //   { kind: 'crew', id: 'xxx' }                              → ouvre CardModal.openCrew
    //   { kind: 'resource', id: 'xxx' }                          → Resources.edit
    //   { kind: 'scene', id: 'xxx' }                             → tab script + scroll
    //   { kind: 'shot', id: 'xxx', sceneId: 'xxx' }              → tab storyboard + sélection
    //   { kind: 'shootingDay', id: 'xxx' }                       → Planning.editShootDay
    //   { kind: 'expense'|'season'|'episode', id: 'xxx' }        → tab + scroll
    //   { tab: 'xxx' }                                            → simple switch tab
    goToLink: (entryId) => {
        const entry = (state.historyEntries || []).find(e => (e.id || ('legacy_' + e.timestamp)) === entryId);
        if(!entry || !entry.link) {
            Utils.toast('Lien non disponible pour cette entrée', 'warning');
            return;
        }
        const link = entry.link;
        const kind = link.kind;
        const targetId = link.id;
        
        // Fermer la modale du journal
        History.closeModal();
        
        // Helper : scroller vers un élément + highlight
        const scrollAndHighlight = (selector, delay = 300) => {
            setTimeout(() => {
                const targetEl = document.querySelector(selector);
                if(targetEl) {
                    targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    targetEl.style.transition = 'box-shadow 0.3s';
                    targetEl.style.boxShadow = '0 0 0 3px var(--primary)';
                    setTimeout(() => { targetEl.style.boxShadow = ''; }, 2000);
                } else {
                    Utils.toast('Élément introuvable (peut-être supprimé depuis)', 'info');
                }
            }, delay);
        };
        
        // ALIGNEMENT SUR LA PORTE UNIQUE (26 aout). L'historique avait son
        // propre aiguillage : il ouvrait bien les fiches personne, decor et
        // ressource, mais pour une SCENE, une DEPENSE ou un PLAN il se contentait
        // de faire defiler la page jusqu'a l'element — trois familles qui
        // s'ouvrent partout ailleurs et pas depuis l'historique. Il change
        // toujours d'onglet (c'est un journal : on veut voir le contexte), puis
        // laisse UI.openFiche decider de la fenetre ET des droits.
        // NB : les onglets s'appellent 'chars' et 'locs', PAS 'characters' /
        // 'locations' (noms des collections). L'ancien aiguillage de
        // l'historique faisait deja cette confusion : switchTab sortait en
        // silence sur sa garde « onglet inconnu » et la fiche s'ouvrait sans
        // changement d'onglet — bug latent jamais vu parce que muet.
        const ONGLET = { actor: 'actors', character: 'chars', location: 'locs',
                         crew: 'crew', resource: 'resources', scene: 'board', shot: 'storyboard',
                         shootingDay: 'planning', expense: 'expenses', org: 'orgs', vehicle: 'crew' };
        const FAMILLE = { shootingDay: 'day' };
        if(ONGLET[kind]) {
            const tab = ONGLET[kind];
            const famille = FAMILLE[kind] || kind;
            if(typeof Permissions !== 'undefined' && Permissions.canOpenFiche && !Permissions.canOpenFiche(famille)) {
                Utils.toast("Vous n'avez pas accès à cette section.", 'error');
                return;
            }
            UI.switchTab(tab);
            // Le delai laisse a l'onglet le temps de se rendre : la fenetre de
            // plan a besoin de sa scene, celle du jour de son calendrier.
            setTimeout(() => {
                if(kind === 'shot' && link.sceneId && typeof Storyboard !== 'undefined' && Storyboard.selectScene) {
                    try { Storyboard.selectScene(link.sceneId); } catch(e) {}
                }
                UI.openFiche(famille, targetId);
            }, 200);
            return;
        }
        
        // Switch selon le type
        switch(kind) {
            case 'season': {
                UI.switchTab('seasons');
                scrollAndHighlight(`[data-season-id="${targetId}"], [data-id="${targetId}"]`);
                break;
            }
            case 'episode': {
                UI.switchTab('episodes');
                scrollAndHighlight(`[data-episode-id="${targetId}"], [data-id="${targetId}"]`);
                break;
            }
            default: {
                // Fallback : simple switch tab si fourni
                if(link.tab && typeof UI !== 'undefined' && UI.switchTab) {
                    UI.switchTab(link.tab);
                    if(targetId) scrollAndHighlight(`[data-id="${targetId}"], #${CSS.escape(targetId)}`);
                } else {
                    Utils.toast('Type de lien inconnu', 'warning');
                }
            }
        }
    }
};

// ========== MODE PRÉSENTATION PLEIN ÉCRAN ==========
const PresentMode = {
    isActive: false,
    currentTabIndex: 0,
    tabs: [],
    
    start: () => {
        if(!state.currentProjectId) {
            Utils.toast('Ouvrez un projet d\'abord', 'warning');
            return;
        }
        
        // Collecter les onglets visibles
        PresentMode.tabs = [];
        document.querySelectorAll('#tabsNav .tab-btn').forEach((btn, idx) => {
            if(btn.style.display !== 'none') {
                PresentMode.tabs.push({
                    id: btn.dataset.tab,
                    name: btn.textContent.trim()
                });
            }
        });
        
        if(PresentMode.tabs.length === 0) {
            Utils.toast('Aucun onglet disponible', 'warning');
            return;
        }
        
        // Trouver l'onglet actuellement actif
        const activeTab = document.querySelector('#tabsNav .tab-btn.active');
        if(activeTab) {
            const activeId = activeTab.dataset.tab;
            const idx = PresentMode.tabs.findIndex(t => t.id === activeId);
            if(idx >= 0) PresentMode.currentTabIndex = idx;
        } else {
            PresentMode.currentTabIndex = 0;
        }
        
        // Activer le mode
        document.body.classList.add('presentation-mode');
        PresentMode.isActive = true;
        PresentMode.updateTabName();
        
        // Plein écran si supporté
        if(document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen().catch(() => {});
        }
        
        Utils.toast('Mode Présentation activé - Échap pour quitter', 'info');
    },
    
    exit: () => {
        document.body.classList.remove('presentation-mode');
        PresentMode.isActive = false;
        
        // Quitter le plein écran
        if(document.fullscreenElement && document.exitFullscreen) {
            document.exitFullscreen().catch(() => {});
        }
        
        Utils.toast('Mode Présentation désactivé', 'info');
    },
    
    nextTab: () => {
        if(PresentMode.tabs.length === 0) return;
        PresentMode.currentTabIndex = (PresentMode.currentTabIndex + 1) % PresentMode.tabs.length;
        PresentMode.goToCurrentTab();
    },
    
    prevTab: () => {
        if(PresentMode.tabs.length === 0) return;
        PresentMode.currentTabIndex = (PresentMode.currentTabIndex - 1 + PresentMode.tabs.length) % PresentMode.tabs.length;
        PresentMode.goToCurrentTab();
    },
    
    goToCurrentTab: () => {
        const tab = PresentMode.tabs[PresentMode.currentTabIndex];
        if(tab) {
            // Activer l'onglet
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            
            const content = document.getElementById('tab-' + tab.id);
            const btn = document.querySelector(`.tab-btn[data-tab="${tab.id}"]`);
            if(content) content.classList.add('active');
            if(btn) btn.classList.add('active');
            
            PresentMode.updateTabName();
        }
    },
    
    updateTabName: () => {
        const nameEl = document.getElementById('presTabName');
        const tab = PresentMode.tabs[PresentMode.currentTabIndex];
        if(nameEl && tab) {
            nameEl.textContent = `${PresentMode.currentTabIndex + 1}/${PresentMode.tabs.length} - ${tab.name}`;
        }
    }
};

// --- MODULE PRESENTATION V93 ---
const Presentation = {
    init: () => {
        Presentation.load();
        Presentation.renderCrewNeeds();
        Presentation.renderActorNeeds();
        Presentation.renderPartners();
    },
    
    load: () => {
        const p = state.data.presentation || {};
        // Marque le formulaire comme peuple POUR CE PROJET : save() reconstruit
        // l'objet entier depuis le DOM et n'a de sens qu'apres ce remplissage.
        Presentation._loadedFor = state.currentProjectId;
        
        const imgInput = document.getElementById('project-image-input');
        const imgPreview = document.getElementById('project-image-preview');
        const imgPlaceholder = document.getElementById('project-image-placeholder');
        if(imgInput) imgInput.value = p.image || '';
        if(p.image) {
            if(imgPreview) { imgPreview.src = Utils.signedUrlFor(p.image); imgPreview.style.display = 'block'; }
            if(imgPlaceholder) imgPlaceholder.style.display = 'none';
        }
        
        const titleDisplay = document.getElementById('project-title-display');
        if(titleDisplay) titleDisplay.textContent = state.data.title || 'Sans titre';
        
        if(document.getElementById('project-type')) document.getElementById('project-type').value = p.type || '';
        if(document.getElementById('project-genre')) document.getElementById('project-genre').value = p.genre || '';
        
        if(document.getElementById('project-date-preprod-start')) document.getElementById('project-date-preprod-start').value = p.datePreprodStart || '';
        if(document.getElementById('project-date-preprod-end')) document.getElementById('project-date-preprod-end').value = p.datePreprodEnd || '';
        if(document.getElementById('project-date-shooting-start')) document.getElementById('project-date-shooting-start').value = p.dateShootingStart || '';
        if(document.getElementById('project-date-shooting-end')) document.getElementById('project-date-shooting-end').value = p.dateShootingEnd || '';
        if(document.getElementById('project-date-postprod-start')) document.getElementById('project-date-postprod-start').value = p.datePostprodStart || '';
        if(document.getElementById('project-date-postprod-end')) document.getElementById('project-date-postprod-end').value = p.datePostprodEnd || '';
        if(document.getElementById('project-date-release')) document.getElementById('project-date-release').value = p.dateRelease || '';
        if(document.getElementById('project-date-distribution-end')) document.getElementById('project-date-distribution-end').value = p.dateDistributionEnd || '';
        
        if(document.getElementById('project-city')) document.getElementById('project-city').value = p.city || '';
        if(document.getElementById('project-region')) document.getElementById('project-region').value = p.region || '';
        if(document.getElementById('project-country')) document.getElementById('project-country').value = p.country || 'France';
        
        if(document.getElementById('project-producer')) document.getElementById('project-producer').value = p.producer || '';
        if(document.getElementById('project-director')) document.getElementById('project-director').value = p.director || '';
        // project-writer / project-prod-manager : champs absents du formulaire
        // (retires lors d'une refonte anterieure). Lectures retirees le 1er
        // septembre, voir le commentaire cote enregistrement.
        if(document.getElementById('project-budget')) document.getElementById('project-budget').value = p.budget || '';
        
        // Informations légales employeur (contrats)
        if(document.getElementById('project-siret')) document.getElementById('project-siret').value = p.siret || '';
        if(document.getElementById('project-ape')) document.getElementById('project-ape').value = p.ape || '';
        if(document.getElementById('project-licence')) document.getElementById('project-licence').value = p.licence || '';
        if(document.getElementById('project-urssaf')) document.getElementById('project-urssaf').value = p.urssaf || '';
        if(document.getElementById('project-conges-spectacles')) document.getElementById('project-conges-spectacles').value = p.congesSpectacles || '';
        if(document.getElementById('project-email-legal')) document.getElementById('project-email-legal').value = p.emailLegal || '';
        if(document.getElementById('project-address-legal')) document.getElementById('project-address-legal').value = p.addressLegal || '';
        if(document.getElementById('project-director-title')) document.getElementById('project-director-title').value = p.directorTitle || '';
        if(document.getElementById('project-phone-legal')) document.getElementById('project-phone-legal').value = p.phoneLegal || '';
        Presentation.showLogo(p.logo || '');
        
        if(document.getElementById('project-description')) document.getElementById('project-description').value = p.description || '';
        if(document.getElementById('project-public')) document.getElementById('project-public').checked = p.isPublic || false;
        
        // Mettre à jour les boutons de visibilité
        Presentation.updateVisibilityButtons();
        
        // Type de production
        Presentation.updateProductionTypeUI(p.productionType || '');
        
        // Équipe actuelle
        Presentation.renderTeamList();
    },
    
    setProductionType: (type) => {
        if(!state.data.presentation) state.data.presentation = {};
        state.data.presentation.productionType = type;
        Presentation.updateProductionTypeUI(type);
        Store.save();
    },
    
    updateProductionTypeUI: (type) => {
        document.querySelectorAll('.project-type-card').forEach(card => {
            card.classList.toggle('selected', card.dataset.type === type);
        });
    },
    
    // === ÉQUIPE ACTUELLE ===
    selectedTeamMember: null,
    
    renderTeamList: () => {
        const container = document.getElementById('project-team-list');
        if(!container) return;
        
        const team = state.data.presentation?.team || [];
        
        if(team.length === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--text-sec); font-style: italic;">Aucun membre ajouté</div>';
            return;
        }
        
        container.innerHTML = team.map((member, idx) => `
            <div style="display: flex; align-items: center; gap: 15px; padding: 12px 15px; background: var(--bg); border: 1px solid var(--border); border-radius: 8px;">
                <div style="width: 45px; height: 45px; border-radius: 50%; background: var(--primary); color: white; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 1.1rem;">
                    ${member.name ? member.name.charAt(0).toUpperCase() : '?'}
                </div>
                <div class="flex-1">
                    <div style="font-weight: 600; color: var(--text-main);">${Utils.escape(member.name || 'Sans nom')}</div>
                    <div style="font-size: 0.85rem; color: var(--primary);">${Utils.escape(member.role || 'Rôle non défini')}</div>
                    ${member.email ? `<div class="text-sec-sm">${Utils.escape(member.email)}</div>` : ''}
                </div>
                <button onclick="app.Presentation.removeTeamMember(${idx})" style="background: none; border: none; color: var(--danger); cursor: pointer; font-size: 1.2rem; padding: 5px;" title="Retirer">✕</button>
            </div>
        `).join('');
    },
    
    // Peuple le select des rôles depuis le référentiel des départements (CONFIG.crewGroups / crewRoles)
    fillTeamRoleSelect: () => {
        const sel = document.getElementById('team-member-role');
        if(!sel || sel.dataset.filled) return;
        let html = '<option value="">-- Sélectionner un rôle --</option>';
        CONFIG.crewGroups.forEach(g => {
            if(g.id === 'gc17') return;
            const roles = (CONFIG.crewRoles[g.id] || []).filter(r => r !== 'Autre');
            if(!roles.length) return;
            html += '<optgroup label="' + Utils.escape(g.name) + '">';
            roles.forEach(r => { html += '<option value="' + Utils.escape(r) + '">' + Utils.escape(r) + '</option>'; });
            html += '</optgroup>';
        });
        html += '<optgroup label="Autres"><option value="Autre">Autre (préciser)</option></optgroup>';
        sel.innerHTML = html;
        sel.dataset.filled = '1';
    },

    openTeamMemberModal: () => {
        Presentation.selectedTeamMember = null;
        Presentation.fillTeamRoleSelect();
        document.getElementById('team-member-role').value = '';
        document.getElementById('team-member-custom-role-div').style.display = 'none';
        document.getElementById('team-member-custom-role').value = '';
        document.getElementById('team-member-search').value = '';
        document.getElementById('team-member-search-results').innerHTML = '';
        document.getElementById('team-member-new-name').value = '';
        document.getElementById('team-member-new-email').value = '';
        document.getElementById('team-member-modal').style.display = 'flex';
        
        // Gérer le champ rôle personnalisé
        document.getElementById('team-member-role').onchange = function() {
            document.getElementById('team-member-custom-role-div').style.display = this.value === 'Autre' ? 'block' : 'none';
        };
    },
    
    closeTeamMemberModal: () => {
        document.getElementById('team-member-modal').style.display = 'none';
    },
    
    searchTeamMember: async (query) => {
        const resultsDiv = document.getElementById('team-member-search-results');
        if(!query || query.length < 2) {
            resultsDiv.innerHTML = '';
            return;
        }
        
        const q = query.toLowerCase();
        const results = [];
        
        // Chercher dans les techniciens du projet
        (state.data.crew || []).forEach(member => {
            if(member.name?.toLowerCase().includes(q) || member.email?.toLowerCase().includes(q)) {
                results.push({ type: 'crew', id: member.id, name: member.name, email: member.email, photo: member.photo });
            }
        });
        
        // Chercher dans les comédiens du projet
        (state.data.actors || []).forEach(actor => {
            if(actor.name?.toLowerCase().includes(q) || actor.email?.toLowerCase().includes(q)) {
                results.push({ type: 'actor', id: actor.id, name: actor.name, email: actor.email, photo: actor.photo });
            }
        });
        
        // Chercher dans l'Univers (profils publics Supabase)
        try {
            const { data: profiles, error: errSearchU } = await supabase
                .from('user_profiles')
                .select('id, name, email, photo, profile_type')
                .eq('is_public', true)
                .or(`name.ilike.%${Utils.pgSafe(q)}%,email.ilike.%${Utils.pgSafe(q)}%`)
                .limit(50);
            if(errSearchU) console.warn('[GlobalSearch] Univers:', errSearchU);
            
            (profiles || []).forEach(profile => {
                if(!results.find(r => r.email === profile.email)) {
                    results.push({ type: 'universe', id: profile.id, name: profile.name, email: profile.email, photo: profile.photo });
                }
            });
        } catch(e) { console.warn('Erreur recherche Univers:', e); }
        
        if(results.length === 0) {
            resultsDiv.innerHTML = '<div style="padding: 10px; color: var(--text-sec); font-style: italic;">Aucun résultat</div>';
            return;
        }
        
        resultsDiv.innerHTML = results.slice(0, 10).map(r => `
            <div onclick="app.Presentation.selectTeamMember('${r.type}', '${r.id}', '${Utils.escape(r.name || '')}', '${Utils.escape(r.email || '')}')" 
                 style="display: flex; align-items: center; gap: 10px; padding: 8px 10px; cursor: pointer; border-radius: 6px; transition: background 0.2s;"
                 onmouseover="this.style.background='var(--primary-light, rgba(43,110,246,0.12))'" onmouseout="this.style.background='transparent'">
                <div style="width: 35px; height: 35px; border-radius: 50%; background: var(--border); display: flex; align-items: center; justify-content: center; overflow: hidden;">
                    ${r.photo ? `<img src="${Utils.safeMediaUrl(r.photo)}" alt="Photo du membre" class="img-cover">` : r.name?.charAt(0).toUpperCase() || '?'}
                </div>
                <div>
                    <div style="font-weight: 500;">${Utils.escape(r.name || 'Sans nom')}</div>
                    <div class="text-sec-sm">${Utils.escape(r.email || '')}</div>
                </div>
            </div>
        `).join('');
    },
    
    selectTeamMember: (type, id, name, email) => {
        Presentation.selectedTeamMember = { type, id, name, email };
        document.getElementById('team-member-search').value = name;
        document.getElementById('team-member-search-results').innerHTML = `
            <div style="padding: 10px; background: var(--success); color: white; border-radius: 6px; text-align: center;">
                ✓ ${Utils.escape(name)} sélectionné
            </div>
        `;
        document.getElementById('team-member-new-name').value = '';
        document.getElementById('team-member-new-email').value = '';
    },
    
    addTeamMember: () => {
        const role = document.getElementById('team-member-role').value;
        const customRole = document.getElementById('team-member-custom-role').value;
        const finalRole = role === 'Autre' ? customRole : role;
        
        if(!finalRole) {
            Utils.toast('Veuillez sélectionner un rôle', 'warning');
            return;
        }
        
        let memberData = null;
        
        if(Presentation.selectedTeamMember) {
            memberData = {
                id: Presentation.selectedTeamMember.id,
                type: Presentation.selectedTeamMember.type,
                name: Presentation.selectedTeamMember.name,
                email: Presentation.selectedTeamMember.email,
                role: finalRole
            };
        } else {
            const newName = document.getElementById('team-member-new-name').value.trim();
            if(!newName) {
                Utils.toast('Veuillez sélectionner ou créer une personne', 'warning');
                return;
            }
            memberData = {
                id: 'new_' + Utils.generateUniqueId(),
                type: 'new',
                name: newName,
                email: document.getElementById('team-member-new-email').value.trim(),
                role: finalRole
            };
        }
        
        if(!state.data.presentation) state.data.presentation = {};
        if(!state.data.presentation.team) state.data.presentation.team = [];
        
        // Vérifier si déjà présent
        const exists = state.data.presentation.team.find(m => m.name === memberData.name && m.role === memberData.role);
        if(exists) {
            Utils.toast('Cette personne a déjà ce rôle dans l\'équipe', 'warning');
            return;
        }
        
        // Liaison Présentation -> onglet Équipe : créer ou lier la fiche technicien (R13)
        if(memberData.type === 'new' || memberData.type === 'universe') {
            const alreadyCrew = (state.data.crew || []).find(m => (memberData.email && m.email && m.email === memberData.email) || (m.name && m.name === memberData.name));
            if(alreadyCrew) {
                memberData.id = alreadyCrew.id;
                memberData.type = 'crew';
            } else {
                let crewGroupId = 'gc17';
                Object.keys(CONFIG.crewRoles || {}).forEach(gid => { if((CONFIG.crewRoles[gid] || []).includes(finalRole)) crewGroupId = gid; });
                const crewCard = { id: Utils.generateUniqueId(), name: memberData.name, gender: '', role: finalRole, email: memberData.email || '', phone: '', address: '', city: '', photo: '', hasVehicle: false, vehicleType: '', vehiclePlate: '', vehicleSeats: '', vehicleTrunk: false, vehicleNotes: '', availabilityText: '', availabilityDates: [], salaryGross: '', salaryNet: '', salaryBudget: '', dailyRate: '', rateCurrency: '€', rateType: 'Jour', notes: '', group_id: crewGroupId, demoreel: '', galleryPhotos: [] };
                state.data.crew.push(crewCard);
                memberData.id = crewCard.id;
                memberData.type = 'crew';
                UI.renderCrewTab();
                Utils.toast('Fiche technicien créée dans l\'onglet Équipe', 'info');
            }
        }
        
        state.data.presentation.team.push(memberData);
        Store.save();
        Presentation.renderTeamList();
        Presentation.closeTeamMemberModal();
        Utils.toast(`${memberData.name} ajouté comme ${memberData.role}`, 'success');
    },
    
    removeTeamMember: async (idx) => {
        if(!await ConfirmModal.confirmDelete("Ce membre sera retiré de l'équipe.")) return;
        
        if(state.data.presentation?.team) {
            const member = state.data.presentation.team[idx];
            state.data.presentation.team.splice(idx, 1);
            Store.save();
            Presentation.renderTeamList();
            Utils.toast(`${member?.name || 'Membre'} retiré de l'équipe`, 'success');
        }
    },
    
    toggleSectionVisibility: (section) => {
        const btn = document.getElementById(`project-vis-btn-${section}`);
        if(!btn) return;
        
        const isHidden = btn.classList.toggle('hidden-section');
        Presentation.save();
        
        Utils.toast(isHidden ? `Section masquée dans l'Univers` : `Section visible dans l'Univers`, 'info');
    },
    
    updateVisibilityButtons: () => {
        const p = state.data.presentation || {};
        const vis = p.visibility || {};
        
        const sections = ['dates', 'location', 'team', 'legal', 'productionType', 'partners', 'crew', 'casting', 'description'];
        sections.forEach(section => {
            const btn = document.getElementById(`project-vis-btn-${section}`);
            if(btn) {
                // Par défaut visible sauf legal
                const defaultVisible = section !== 'legal';
                const isVisible = vis[section] !== undefined ? vis[section] : defaultVisible;
                btn.classList.toggle('hidden-section', !isVisible);
            }
        });
    },
    
    save: () => {
        // GARDE : cette fonction reconstruit la presentation ENTIERE a partir du
        // formulaire de l'onglet. Appelee avant que Presentation.load() ne l'ait
        // rempli — ou apres un changement de projet —, elle ecrirait des champs
        // vides ou ceux du projet precedent par-dessus les donnees reelles
        // (budget, dates, partenaires, infos legales). Pour ecrire un champ
        // isole depuis ailleurs, passer par une ecriture ciblee du type
        // Presentation.setLogo / saveLegalModal.
        if(Presentation._loadedFor !== state.currentProjectId) {
            console.warn('[Presentation] save() ignoré : formulaire non chargé pour ce projet.');
            return;
        }
        if(!state.data.presentation) state.data.presentation = {};
        const p = state.data.presentation;
        
        p.image = document.getElementById('project-image-input')?.value || '';
        p.type = document.getElementById('project-type')?.value || '';
        p.genre = document.getElementById('project-genre')?.value || '';
        
        p.datePreprodStart = document.getElementById('project-date-preprod-start')?.value || '';
        p.datePreprodEnd = document.getElementById('project-date-preprod-end')?.value || '';
        p.dateShootingStart = document.getElementById('project-date-shooting-start')?.value || '';
        p.dateShootingEnd = document.getElementById('project-date-shooting-end')?.value || '';
        p.datePostprodStart = document.getElementById('project-date-postprod-start')?.value || '';
        p.datePostprodEnd = document.getElementById('project-date-postprod-end')?.value || '';
        p.dateRelease = document.getElementById('project-date-release')?.value || '';
        p.dateDistributionEnd = document.getElementById('project-date-distribution-end')?.value || '';
        
        p.city = document.getElementById('project-city')?.value || '';
        p.region = document.getElementById('project-region')?.value || '';
        p.country = document.getElementById('project-country')?.value || 'France';
        
        p.producer = document.getElementById('project-producer')?.value || '';
        p.director = document.getElementById('project-director')?.value || '';
        // 1er septembre — DEUX ECRITURES QUI NE POUVAIENT QU'EFFACER. Les
        // champs #project-writer et #project-prod-manager n'existent dans
        // AUCUN formulaire ; le ?. renvoyait undefined, le || '' le
        // transformait en chaine vide, et chaque enregistrement de la
        // presentation ecrasait p.writer et p.prodManager par du vide. C'est
        // le piege que l'en-tete signale depuis l'etape 6 : une sauvegarde qui
        // relit le DOM efface ce que le DOM ne contient pas. Les deux lignes
        // sont retirees — la donnee est desormais preservee telle quelle.
        // TRANCHE LE 1er SEPTEMBRE : on ne remet pas les champs. Le scenariste
        // et le directeur de production se saisissent comme tout membre de
        // l'equipe dans « Equipe Actuelle » (p.team). writer a ete retire de
        // la publication vers l'Univers dans la foulee. Ne pas rouvrir.
        p.budget = document.getElementById('project-budget')?.value || '';
        
        // Informations légales employeur (contrats)
        p.siret = document.getElementById('project-siret')?.value || '';
        p.ape = document.getElementById('project-ape')?.value || '';
        p.licence = document.getElementById('project-licence')?.value || '';
        p.urssaf = document.getElementById('project-urssaf')?.value || '';
        p.congesSpectacles = document.getElementById('project-conges-spectacles')?.value || '';
        p.emailLegal = document.getElementById('project-email-legal')?.value || '';
        p.addressLegal = document.getElementById('project-address-legal')?.value || '';
        p.directorTitle = document.getElementById('project-director-title')?.value || '';
        // Identité du film sur la feuille de service (modèle AFAR)
        p.phoneLegal = document.getElementById('project-phone-legal')?.value || '';
        // Le logo n'est PAS relu ici : il s'écrit par Presentation.setLogo, et
        // peut être posé depuis la feuille de service alors que ce formulaire
        // n'a jamais été peuplé — le relire le viderait.
        
        // Synchroniser avec le module Dépenses
        if(!state.data.budget) state.data.budget = { total: 0, currency: '€', manager: '', envelopes: {} };
        state.data.budget.total = parseFloat(p.budget) || 0;
        
        // Mettre à jour le champ dans les dépenses si visible
        const expensesBudgetInput = document.getElementById('expenses-budget-total');
        if(expensesBudgetInput) expensesBudgetInput.value = state.data.budget.total || '';
        
        p.description = document.getElementById('project-description')?.value || '';
        
        const wasPublic = p.isPublic || false;
        p.isPublic = document.getElementById('project-public')?.checked || false;
        
        // Options de visibilité par section (lire depuis les boutons)
        const getVis = (section, defaultVal = true) => {
            const btn = document.getElementById(`project-vis-btn-${section}`);
            return btn ? !btn.classList.contains('hidden-section') : defaultVal;
        };
        p.visibility = {
            dates: getVis('dates'),
            location: getVis('location'),
            team: getVis('team'),
            legal: getVis('legal', false),
            productionType: getVis('productionType'),
            partners: getVis('partners'),
            crew: getVis('crew'),
            casting: getVis('casting'),
            description: getVis('description')
        };
        
        p.updatedAt = new Date().toISOString();
        
        Store.save();
        
        if(p.isPublic) {
            Presentation.publishToUniverse();
        } else if(wasPublic && !p.isPublic) {
            Presentation.unpublishFromUniverse();
        }
    },
    
    publishToUniverse: async () => {
        if(!state.currentProjectId || !state.currentUser) return;
        
        const p = state.data.presentation || {};
        const projectTitle = document.getElementById('projectTitle')?.value || p.title || 'Sans titre';
        
        const vis = p.visibility || {};
        const publicData = {
            title: projectTitle,
            projectType: p.type || '',
            genre: p.genre || '',
            image: p.image || '',
            // Localisation
            city: vis.location !== false ? (p.city || '') : '',
            region: vis.location !== false ? (p.region || '') : '',
            country: vis.location !== false ? (p.country || 'France') : '',
            // Équipe
            director: vis.team !== false ? (p.director || '') : '',
            producer: vis.team !== false ? (p.producer || '') : '',
            // writer retire de la publication le 1er septembre (decision de
            // Guillaume). Le scenariste s'ecrit desormais comme tout le reste
            // de l'equipe, membre par membre, dans « Equipe Actuelle » —
            // c'est p.team juste en dessous, qui est publie ET affiche. Le
            // champ writer venait d'un formulaire anterieur : il etait encore
            // envoye a l'Univers alors qu'il ne pouvait plus etre rempli et
            // que rien ne l'affichait. Meme sort pour prodManager, qui
            // n'etait meme pas publie.
            budget: vis.team !== false ? (p.budget || '') : '',
            team: vis.team !== false ? (p.team || []) : [],
            // Dates
            datePreprodStart: vis.dates !== false ? (p.datePreprodStart || '') : '',
            datePreprodEnd: vis.dates !== false ? (p.datePreprodEnd || '') : '',
            dateShootingStart: vis.dates !== false ? (p.dateShootingStart || '') : '',
            dateShootingEnd: vis.dates !== false ? (p.dateShootingEnd || '') : '',
            datePostprodStart: vis.dates !== false ? (p.datePostprodStart || '') : '',
            datePostprodEnd: vis.dates !== false ? (p.datePostprodEnd || '') : '',
            dateRelease: vis.dates !== false ? (p.dateRelease || '') : '',
            // Infos légales
            siret: vis.legal !== false ? (p.siret || '') : '',
            ape: vis.legal !== false ? (p.ape || '') : '',
            licence: vis.legal !== false ? (p.licence || '') : '',
            urssaf: vis.legal !== false ? (p.urssaf || '') : '',
            // Type de production
            productionType: vis.productionType !== false ? (p.productionType || '') : '',
            // Partenaires
            associations: vis.partners !== false ? (p.associations || []) : [],
            enterprises: vis.partners !== false ? (p.enterprises || []) : [],
            // Description
            description: vis.description !== false ? (p.description || '') : '',
            // Besoins
            actorNeeds: vis.casting !== false ? (p.actorNeeds || []) : [],
            crewNeeds: vis.crew !== false ? (p.crewNeeds || {}) : {},
            customCrewNeeds: vis.crew !== false ? (p.customCrewNeeds || []) : [],
            // Meta
            visibility: vis,
            isPublic: true,
            ownerEmail: state.currentUser.email,
            ownerId: state.currentUser.uid,
            projectId: state.currentProjectId,
            updatedAt: new Date().toISOString()
        };
        
        try {
            // Stocker les données publiques dans le projet
            state.data.publicProjectData = publicData;
            state.data.isPublicProject = true;
            await Store.save();
            
            // Mettre à jour la carte de l'Univers si elle est chargée
            if(Universe.allProjects) {
                const existingIdx = Universe.allProjects.findIndex(p => p.projectId === state.currentProjectId || p.id === state.currentProjectId);
                const projectEntry = {
                    ...publicData,
                    id: state.currentProjectId,
                    type: 'project',
                    location: publicData.city,
                    projectId: state.currentProjectId
                };
                if(existingIdx >= 0) {
                    Universe.allProjects[existingIdx] = projectEntry;
                } else {
                    Universe.allProjects.push(projectEntry);
                }
            }
        } catch(e) {
            console.error('Erreur publication projet:', e);
        }
    },
    
    unpublishFromUniverse: async () => {
        if(!state.currentProjectId) return;
        
        try {
            state.data.isPublicProject = false;
            delete state.data.publicProjectData;
            await Store.save();
            
            // Retirer de la carte de l'Univers si elle est chargée
            if(Universe.allProjects) {
                Universe.allProjects = Universe.allProjects.filter(p => p.projectId !== state.currentProjectId && p.id !== state.currentProjectId);
            }
        } catch(e) {
            console.error('Erreur suppression projet public:', e);
        }
    },
    
    crewPositions: [
        { id: 'realisateur', name: 'Réalisateur·rice', dept: 'Réalisation' },
        { id: 'assistant_real', name: '1er Assistant Réalisateur', dept: 'Réalisation' },
        { id: 'scripte', name: 'Scripte', dept: 'Réalisation' },
        { id: 'dop', name: 'Chef Opérateur / DOP', dept: 'Image' },
        { id: 'cadreur', name: 'Cadreur', dept: 'Image' },
        { id: 'assistant_cam', name: 'Assistant Caméra', dept: 'Image' },
        { id: 'chef_elec', name: 'Chef Électricien', dept: 'Lumière' },
        { id: 'electricien', name: 'Électricien', dept: 'Lumière' },
        { id: 'chef_machino', name: 'Chef Machiniste', dept: 'Machinerie' },
        { id: 'machiniste', name: 'Machiniste', dept: 'Machinerie' },
        { id: 'ingeson', name: 'Ingénieur du Son', dept: 'Son' },
        { id: 'perchman', name: 'Perchman', dept: 'Son' },
        { id: 'chef_deco', name: 'Chef Décorateur', dept: 'Décoration' },
        { id: 'accessoiriste', name: 'Accessoiriste', dept: 'Décoration' },
        { id: 'chef_costumes', name: 'Chef Costumier', dept: 'Costumes' },
        { id: 'habilleur', name: 'Habilleur·se', dept: 'Costumes' },
        { id: 'chef_maquillage', name: 'Chef Maquilleur', dept: 'Maquillage' },
        { id: 'maquilleur', name: 'Maquilleur·se', dept: 'Maquillage' },
        { id: 'coiffeur', name: 'Coiffeur·se', dept: 'Maquillage' },
        { id: 'dir_prod', name: 'Directeur de Production', dept: 'Production' },
        { id: 'regisseur', name: 'Régisseur Général', dept: 'Régie' },
        { id: 'assistant_regie', name: 'Assistant Régie', dept: 'Régie' },
        { id: 'dir_casting', name: 'Directeur de Casting', dept: 'Casting' },
        { id: 'photographe', name: 'Photographe Plateau', dept: 'Autre' },
        { id: 'monteur', name: 'Monteur', dept: 'Post-production' },
        { id: 'etalonneur', name: 'Étalonneur', dept: 'Post-production' },
        { id: 'mixeur', name: 'Mixeur Son', dept: 'Post-production' }
    ],
    
    renderCrewNeeds: () => {
        const container = document.getElementById('needs-crew-list');
        if(!container) return;
        
        if(!state.data.presentation) state.data.presentation = {};
        if(!state.data.presentation.crewNeeds) state.data.presentation.crewNeeds = {};
        
        const needs = state.data.presentation.crewNeeds;
        
        let html = '';
        Presentation.crewPositions.forEach(pos => {
            const need = needs[pos.id] || { needed: false, count: 1 };
            html += `<div style="display: flex; align-items: center; gap: 10px; padding: 8px; background: var(--bg); border-radius: 6px;">
                <input type="checkbox" id="need-crew-${pos.id}" ${need.needed ? 'checked' : ''} onchange="app.Presentation.toggleCrewNeed('${pos.id}')" style="width: 18px; height: 18px;">
                <label for="need-crew-${pos.id}" style="flex: 1; cursor: pointer;">${pos.name}</label>
                <input type="number" id="need-crew-count-${pos.id}" value="${need.count}" min="1" max="20" class="n8-input-4" onchange="app.Presentation.updateCrewNeedCount('${pos.id}', this.value)" ${need.needed ? '' : 'disabled'}>
            </div>`;
        });
        
        const customNeeds = state.data.presentation.customCrewNeeds || [];
        customNeeds.forEach((custom, idx) => {
            html += `<div style="display: flex; align-items: center; gap: 10px; padding: 8px; background: var(--highlight); border-radius: 6px;">
                <input type="checkbox" checked disabled style="width: 18px; height: 18px;">
                <input type="text" value="${Utils.escape(custom.name)}" style="flex: 1; padding: 5px; border: 1px solid var(--border); border-radius: 4px; background: var(--input-bg); color: var(--text-main);" onchange="app.Presentation.updateCustomCrewNeed(${idx}, 'name', this.value)">
                <input type="number" value="${custom.count}" min="1" max="20" class="n8-input-4" onchange="app.Presentation.updateCustomCrewNeed(${idx}, 'count', this.value)">
                <button onclick="app.Presentation.removeCustomCrewNeed(${idx})" style="background: var(--danger); color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer;">✕</button>
            </div>`;
        });
        
        container.innerHTML = html;
    },
    
    toggleCrewNeed: (posId) => {
        if(!state.data.presentation.crewNeeds) state.data.presentation.crewNeeds = {};
        const checkbox = document.getElementById(`need-crew-${posId}`);
        const countInput = document.getElementById(`need-crew-count-${posId}`);
        
        if(!state.data.presentation.crewNeeds[posId]) {
            state.data.presentation.crewNeeds[posId] = { needed: false, count: 1 };
        }
        
        state.data.presentation.crewNeeds[posId].needed = checkbox.checked;
        countInput.disabled = !checkbox.checked;
        
        Store.save();
    },
    
    updateCrewNeedCount: (posId, count) => {
        if(!state.data.presentation.crewNeeds) state.data.presentation.crewNeeds = {};
        if(!state.data.presentation.crewNeeds[posId]) {
            state.data.presentation.crewNeeds[posId] = { needed: true, count: 1 };
        }
        state.data.presentation.crewNeeds[posId].count = parseInt(count) || 1;
        Store.save();
    },
    
    addCustomCrewNeed: async () => {
        const name = await ConfirmModal.prompt("Entrez le nom du poste.", "Nouveau poste", "Ex: Assistant réalisateur...");
        if(!name || !name.trim()) return;
        
        if(!state.data.presentation.customCrewNeeds) state.data.presentation.customCrewNeeds = [];
        state.data.presentation.customCrewNeeds.push({ name: name.trim(), count: 1 });
        Store.save();
        Presentation.renderCrewNeeds();
    },
    
    updateCustomCrewNeed: (idx, field, value) => {
        if(!state.data.presentation.customCrewNeeds) return;
        if(field === 'name') {
            state.data.presentation.customCrewNeeds[idx].name = value;
        } else if(field === 'count') {
            state.data.presentation.customCrewNeeds[idx].count = parseInt(value) || 1;
        }
        Store.save();
    },
    
    removeCustomCrewNeed: (idx) => {
        if(!state.data.presentation.customCrewNeeds) return;
        state.data.presentation.customCrewNeeds.splice(idx, 1);
        Store.save();
        Presentation.renderCrewNeeds();
    },
    
    renderActorNeeds: () => {
        const container = document.getElementById('needs-actors-list');
        if(!container) return;
        
        if(!state.data.presentation) state.data.presentation = {};
        if(!state.data.presentation.actorNeeds) state.data.presentation.actorNeeds = [];
        
        const needs = state.data.presentation.actorNeeds;
        
        if(needs.length === 0) {
            container.innerHTML = '<div style="color: var(--text-sec); text-align: center; padding: 20px; background: var(--bg); border-radius: 8px;">Aucun rôle défini. Cliquez sur "Ajouter un rôle" pour commencer.</div>';
            return;
        }
        
        let html = '';
        needs.forEach((need, idx) => {
            html += `<div style="background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 15px; margin-bottom: 10px;">
                <div class="section-header-10">
                    <input type="text" value="${Utils.escape(need.roleName || '')}" placeholder="Nom du rôle (ex: Marie, Inspecteur...)" data-tooltip="Nom du rôle (ex: Marie, Inspecteur...)" style="flex: 1; padding: 8px; font-weight: bold; border: 1px solid var(--border); border-radius: 4px; background: var(--input-bg); color: var(--text-main);" onchange="app.Presentation.updateActorNeed(${idx}, 'roleName', this.value)">
                    <button onclick="app.Presentation.removeActorNeed(${idx})" style="margin-left: 10px; background: var(--danger); color: white; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer;">🗑️</button>
                </div>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px;">
                    <div>
                        <label class="text-sec-sm">Type</label>
                        <select class="form-input-r4" onchange="app.Presentation.updateActorNeed(${idx}, 'type', this.value)">
                            <option value="principal" ${need.type === 'principal' ? 'selected' : ''}>Rôle principal</option>
                            <option value="secondaire" ${need.type === 'secondaire' ? 'selected' : ''}>Rôle secondaire</option>
                            <option value="figurant" ${need.type === 'figurant' ? 'selected' : ''}>Figurant</option>
                            <option value="silhouette" ${need.type === 'silhouette' ? 'selected' : ''}>Silhouette</option>
                        </select>
                    </div>
                    <div>
                        <label class="text-sec-sm">Sexe</label>
                        <select class="form-input-r4" onchange="app.Presentation.updateActorNeed(${idx}, 'gender', this.value)">
                            <option value="" ${!need.gender ? 'selected' : ''}>Peu importe</option>
                            <option value="homme" ${need.gender === 'homme' ? 'selected' : ''}>Homme</option>
                            <option value="femme" ${need.gender === 'femme' ? 'selected' : ''}>Femme</option>
                            <option value="non-binaire" ${need.gender === 'non-binaire' ? 'selected' : ''}>Non-binaire</option>
                        </select>
                    </div>
                    <div>
                        <label class="text-sec-sm">Âge min</label>
                        <input type="number" value="${need.ageMin || ''}" placeholder="18" data-tooltip="18" min="1" max="100" class="form-input-r4" onchange="app.Presentation.updateActorNeed(${idx}, 'ageMin', this.value)">
                    </div>
                    <div>
                        <label class="text-sec-sm">Âge max</label>
                        <input type="number" value="${need.ageMax || ''}" placeholder="30" data-tooltip="30" min="1" max="100" class="form-input-r4" onchange="app.Presentation.updateActorNeed(${idx}, 'ageMax', this.value)">
                    </div>
                    <div>
                        <label class="text-sec-sm">Origine</label>
                        <select class="form-input-r4" onchange="app.Presentation.updateActorNeed(${idx}, 'ethnicity', this.value)">
                            <option value="" ${!need.ethnicity ? 'selected' : ''}>Peu importe</option>
                            <option value="caucasien" ${need.ethnicity === 'caucasien' ? 'selected' : ''}>Caucasien</option>
                            <option value="africain" ${need.ethnicity === 'africain' ? 'selected' : ''}>Africain</option>
                            <option value="asiatique" ${need.ethnicity === 'asiatique' ? 'selected' : ''}>Asiatique</option>
                            <option value="latino" ${need.ethnicity === 'latino' ? 'selected' : ''}>Latino</option>
                            <option value="maghrebin" ${need.ethnicity === 'maghrebin' ? 'selected' : ''}>Maghrébin</option>
                            <option value="metis" ${need.ethnicity === 'metis' ? 'selected' : ''}>Métis</option>
                        </select>
                    </div>
                    <div>
                        <label class="text-sec-sm">Cheveux</label>
                        <select class="form-input-r4" onchange="app.Presentation.updateActorNeed(${idx}, 'hairColor', this.value)">
                            <option value="" ${!need.hairColor ? 'selected' : ''}>Peu importe</option>
                            <option value="noir" ${need.hairColor === 'noir' ? 'selected' : ''}>Noir</option>
                            <option value="brun" ${need.hairColor === 'brun' ? 'selected' : ''}>Brun</option>
                            <option value="chatain" ${need.hairColor === 'chatain' ? 'selected' : ''}>Châtain</option>
                            <option value="blond" ${need.hairColor === 'blond' ? 'selected' : ''}>Blond</option>
                            <option value="roux" ${need.hairColor === 'roux' ? 'selected' : ''}>Roux</option>
                            <option value="gris" ${need.hairColor === 'gris' ? 'selected' : ''}>Gris/Blanc</option>
                            <option value="chauve" ${need.hairColor === 'chauve' ? 'selected' : ''}>Chauve</option>
                        </select>
                    </div>
                    <div>
                        <label class="text-sec-sm">Nombre recherché</label>
                        <input type="number" value="${need.count || 1}" min="1" max="100" class="form-input-r4" onchange="app.Presentation.updateActorNeed(${idx}, 'count', this.value)">
                    </div>
                </div>
                <div class="mt-10">
                    <label class="text-sec-sm">Description du rôle</label>
                    <textarea placeholder="Décrivez le personnage, ses caractéristiques, le contexte..." data-tooltip="Décrivez le personnage, ses caractéristiques, le contexte..." style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 4px; background: var(--input-bg); color: var(--text-main); min-height: 60px; resize: vertical;" onchange="app.Presentation.updateActorNeed(${idx}, 'description', this.value)">${Utils.escape(need.description || '')}</textarea>
                </div>
            </div>`;
        });
        
        container.innerHTML = html;
    },
    
    addActorNeed: () => {
        if(!state.data.presentation.actorNeeds) state.data.presentation.actorNeeds = [];
        state.data.presentation.actorNeeds.push({
            roleName: '',
            type: 'principal',
            gender: '',
            ageMin: '',
            ageMax: '',
            ethnicity: '',
            hairColor: '',
            count: 1,
            description: ''
        });
        Store.save();
        Presentation.renderActorNeeds();
    },
    
    updateActorNeed: (idx, field, value) => {
        if(!state.data.presentation.actorNeeds || !state.data.presentation.actorNeeds[idx]) return;
        state.data.presentation.actorNeeds[idx][field] = value;
        Store.save();
    },
    
    removeActorNeed: async (idx) => {
        if(!await ConfirmModal.confirmDelete("Ce rôle sera supprimé.")) return;
        if(!state.data.presentation.actorNeeds) return;
        state.data.presentation.actorNeeds.splice(idx, 1);
        Store.save();
        Presentation.renderActorNeeds();
    },

    // ===== LOGO DE LA PRODUCTION =====
    // Volontairement distinct de l'affiche du projet : l'un identifie le FILM,
    // l'autre la SOCIETE, et le modele AFAR les fait figurer cote a cote en
    // tete de feuille. Meme bucket et meme mecanique que uploadImage, ancien
    // fichier supprime avant depot du nouveau pour ne pas accumuler d'orphelins.
    // Le logo s'affiche a DEUX endroits : la section de l'onglet Presentation et
    // la fenetre ouverte depuis la feuille de service. Les deux apercus sont
    // mis a jour ensemble, sinon celui qui n'est pas visible reste perime.
    showLogo: (url) => {
        [['project-logo-preview', 'project-logo-input', 'project-logo-clear'],
         ['pl-logo-preview', null, 'pl-logo-clear']].forEach(([imgId, inputId, clearId]) => {
            const img = document.getElementById(imgId);
            const input = inputId ? document.getElementById(inputId) : null;
            const clear = document.getElementById(clearId);
            if(input) input.value = url || '';
            if(img) {
                if(url) { img.src = Utils.signedUrlFor(url); img.style.display = 'block'; }
                else { img.removeAttribute('src'); img.style.display = 'none'; }
            }
            if(clear) clear.style.display = url ? '' : 'none';
        });
    },
    removeLogo: async () => {
        if(state.currentRole === 'viewer') return;
        const url = (state.data.presentation && state.data.presentation.logo) || '';
        // _projPathFrom encaisse les trois formes stockees : URL publique, URL
        // signee, et path brut apres migrateProjPathsInData.
        const oldPath = url ? Utils._projPathFrom(url) : '';
        if(oldPath) {
            const { error } = await supabase.storage.from('projects').remove([oldPath]);
            if(error) console.error('Erreur suppression logo production:', error);
        }
        Presentation.setLogo('');
    },
    // Aplatit le logo sur un fond BLANC avant compression. La compression
    // partagee (PublicProfile.compressImageToBlob) sort du JPEG sans peindre de
    // fond : un logo PNG detoure — c'est le cas courant — y perdrait sa
    // transparence en NOIR. La feuille de service s'imprime sur du papier
    // blanc, c'est donc le fond a poser.
    _logoBlob: (file, maxSize) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    let w = img.width, h = img.height;
                    if(w > maxSize || h > maxSize) {
                        const ratio = Math.min(maxSize / w, maxSize / h);
                        w = Math.round(w * ratio); h = Math.round(h * ratio);
                    }
                    const canvas = document.createElement('canvas');
                    canvas.width = w; canvas.height = h;
                    const ctx = canvas.getContext('2d');
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, w, h);
                    ctx.drawImage(img, 0, 0, w, h);
                    canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob a échoué')), 'image/jpeg', 0.92);
                };
                img.onerror = reject;
                img.src = e.target.result;
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    },
    // Ecriture CIBLEE du logo. Surtout pas Presentation.save(), qui relit TOUS
    // les champs du formulaire de l'onglet : celui-ci n'est peuple que par
    // Presentation.init(), a l'ouverture de l'onglet. Depuis la feuille de
    // service, sans etre passe par cet onglet, save() reecrirait toute la
    // presentation a vide (budget, dates, infos legales comprises).
    // ===== FENETRE « INFORMATIONS LEGALES » =====
    // Ouvrable depuis la feuille de service : c'est le « Changer l'info source »
    // de l'identite de la production, qui n'avait pas de fiche. La regle des
    // sources ne s'applique pas telle quelle ici — un logo ou un SIRET propre a
    // un jour de tournage n'aurait aucun sens — mais l'esprit reste : on ne
    // modifie pas une donnee globale en douce depuis la feuille, on ouvre
    // l'endroit qui en est la source et on voit ce qu'on change.
    LEGAL_FIELDS: [
        ['pl-producer', 'producer'], ['pl-director', 'director'],
        ['pl-address', 'addressLegal'], ['pl-phone', 'phoneLegal'],
        ['pl-email', 'emailLegal'], ['pl-director-title', 'directorTitle'],
        ['pl-siret', 'siret'], ['pl-ape', 'ape'],
        ['pl-licence', 'licence'], ['pl-urssaf', 'urssaf'],
        ['pl-conges', 'congesSpectacles']
    ],
    openLegalModal: () => {
        const modal = document.getElementById('prod-legal-modal');
        if(!modal) return;
        const p = state.data.presentation || {};
        Presentation.LEGAL_FIELDS.forEach(([id, key]) => {
            const el = document.getElementById(id);
            if(el) el.value = p[key] || '';
        });
        Presentation.showLogo(p.logo || '');
        const ro = state.currentRole === 'viewer';
        Presentation.LEGAL_FIELDS.forEach(([id]) => {
            const el = document.getElementById(id);
            if(el) el.disabled = ro;
        });
        modal.style.display = 'flex';
    },
    closeLegalModal: () => {
        const modal = document.getElementById('prod-legal-modal');
        if(modal) modal.style.display = 'none';
    },
    saveLegalModal: () => {
        if(state.currentRole === 'viewer') { Presentation.closeLegalModal(); return; }
        if(!state.data.presentation) state.data.presentation = {};
        const p = state.data.presentation;
        // Ecriture CHAMP PAR CHAMP. Surtout pas Presentation.save(), qui relit
        // tout le formulaire de l'onglet : celui-ci n'est peuple qu'a
        // l'ouverture de l'onglet, et le relire depuis ici viderait le reste de
        // la presentation (budget, dates, partenaires).
        Presentation.LEGAL_FIELDS.forEach(([id, key]) => {
            const el = document.getElementById(id);
            if(el) p[key] = el.value || '';
        });
        Store.save();
        // Remet le formulaire de l'onglet d'aplomb : sans cela, une sauvegarde
        // ulterieure declenchee depuis l'onglet reecrirait les anciennes
        // valeurs par-dessus celles saisies ici.
        Presentation.load();
        Presentation.closeLegalModal();
        if(document.getElementById('fds-pane-live')) FDSLive.render();
        Utils.toast('Informations de production enregistrées', 'success');
    },
    setLogo: (url) => {
        if(!state.data.presentation) state.data.presentation = {};
        state.data.presentation.logo = url || '';
        Presentation.showLogo(url || '');
        Store.save();
        if(document.getElementById('fds-pane-live')) FDSLive.render();
    },
    uploadLogo: async (event) => {
        const file = event.target.files[0];
        if(!file) return;
        if(state.currentRole === 'viewer') return;
        // Le meme uploader sert la section de l'onglet et la fenetre : le
        // message d'etat va a celui qui a declenche le choix, et l'ancienne URL
        // se lit dans les donnees plutot que dans un champ cache qui n'existe
        // pas dans la fenetre.
        const fromModal = event.target.id === 'pl-logo-file';
        const statusEl = document.getElementById(fromModal ? 'pl-logo-status' : 'project-logo-status');
        const oldUrl = (state.data.presentation && state.data.presentation.logo) || '';
        if(!file.type.startsWith('image/')) {
            if(statusEl) { statusEl.textContent = 'Fichier non valide'; statusEl.style.color = '#e74c3c'; }
            return;
        }
        if(file.size > 5 * 1024 * 1024) {
            if(statusEl) { statusEl.textContent = 'Max 5 Mo'; statusEl.style.color = '#e74c3c'; }
            return;
        }
        if(statusEl) { statusEl.textContent = 'Upload...'; statusEl.style.color = 'var(--text-sec)'; }
        try {
            const blob = await Presentation._logoBlob(file, 600);
            const projectId = state.currentProjectId;
            const filePath = `${projectId}/logo_${Date.now()}.jpg`;
            if(oldUrl) {
                const oldPath = Utils._projPathFrom(oldUrl);
                if(oldPath) {
                    const { error: rmErr } = await supabase.storage.from('projects').remove([oldPath]);
                    if(rmErr) console.error('Erreur suppression ancien logo:', rmErr);
                }
            }
            const { error } = await supabase.storage.from('projects')
                .upload(filePath, blob, { contentType: 'image/jpeg', upsert: true });
            if(error) throw error;
            const { data: urlData } = supabase.storage.from('projects').getPublicUrl(filePath);
            // Le bucket « projects » est PRIVE : sans signature mise en cache,
            // l'URL publique ne repond pas et l'apercu reste vide jusqu'au
            // prochain chargement du projet.
            await Utils._cacheNewPath(filePath);
            Presentation.setLogo(urlData.publicUrl);
            if(statusEl) { statusEl.textContent = 'Logo enregistré'; statusEl.style.color = '#27ae60'; }
        } catch(err) {
            console.error('Erreur upload logo production:', err);
            if(statusEl) { statusEl.textContent = 'Erreur upload'; statusEl.style.color = '#e74c3c'; }
        }
    },
    uploadImage: async (event) => {
        const file = event.target.files[0];
        if (!file) return;
        
        const statusEl = document.getElementById('project-image-status');
        const preview = document.getElementById('project-image-preview');
        const placeholder = document.getElementById('project-image-placeholder');
        const input = document.getElementById('project-image-input');
        
        if (!file.type.startsWith('image/')) {
            if(statusEl) { statusEl.textContent = '❌ Fichier non valide'; statusEl.style.color = '#e74c3c'; }
            return;
        }
        
        if (file.size > 5 * 1024 * 1024) {
            if(statusEl) { statusEl.textContent = '❌ Max 5 Mo'; statusEl.style.color = '#e74c3c'; }
            return;
        }
        
        if(statusEl) { statusEl.textContent = '⏳ Upload...'; statusEl.style.color = 'var(--text-sec)'; }
        if(placeholder) placeholder.innerHTML = '⏳';
        
        try {
            const compressedBlob = await PublicProfile.compressImageToBlob(file, 1200, 0.85);
            const projectId = state.currentProjectId;
            const fileName = `poster_${Date.now()}.jpg`;
            const filePath = `${projectId}/${fileName}`;
            
            // Supprimer l'ancienne image si elle existe
            const oldUrl = input.value;
            if (oldUrl && oldUrl.includes('supabase')) {
                const oldPath = oldUrl.split('/projects/')[1];
                if (oldPath) {
                    const {error: rmProjErr} = await supabase.storage.from('projects').remove([oldPath]);
                    if(rmProjErr) console.error('Erreur suppression fichier projet:', rmProjErr);
                }
            }
            
            const { data, error } = await supabase.storage
                .from('projects')
                .upload(filePath, compressedBlob, {
                    contentType: 'image/jpeg',
                    upsert: true
                });
            
            if (error) throw error;
            
            const { data: urlData } = supabase.storage
                .from('projects')
                .getPublicUrl(filePath);
            
            const publicUrl = urlData.publicUrl;
            // Bucket « projects » PRIVE : signer + mettre en cache le chemin
            // fraichement uploade, sinon l'apercu reste vide jusqu'au rechargement.
            await Utils._cacheNewPath(filePath);
            
            input.value = publicUrl;
            if(preview) {
                preview.src = Utils.signedUrlFor(publicUrl);
                preview.style.display = 'block';
            }
            if(placeholder) { placeholder.style.display = 'none'; placeholder.innerHTML = '🎬'; }
            if(statusEl) { statusEl.textContent = '✅ Image uploadée'; statusEl.style.color = '#27ae60'; }
            
            Presentation.save();
        } catch (err) {
            console.error('Erreur upload image projet:', err);
            if(placeholder) placeholder.innerHTML = '🎬';
            if(statusEl) { statusEl.textContent = '❌ Erreur upload'; statusEl.style.color = '#e74c3c'; }
        }
    },
    
    // ========== PARTENAIRES (Associations & Entreprises) ==========
    
    // Ouvre le modal de recherche de partenaires
    openPartnerSearch: (type) => {
        // Selecteur dans les structures du POLE (Production > Asso / Entreprises), qui est le registre maitre.
        const isAssociation = type === 'association';
        const t = isAssociation ? 'asso' : 'ent';
        const title = isAssociation ? '🏛️ Ajouter une Association' : '🏢 Ajouter une Entreprise';
        const pres = state.data.presentation || {};
        const partnerIds = {};
        ((pres.associations || []).concat(pres.enterprises || [])).forEach(p => { if(p && p.id) partnerIds[p.id] = true; });
        const orgsList = (typeof Orgs !== 'undefined') ? Orgs._list().filter(o => o.type === t && o.name && !partnerIds[o.id]) : [];

        const modal = document.createElement('div');
        modal.id = 'partner-search-modal';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); display: flex; justify-content: center; align-items: center; z-index: var(--z-modal);';
        modal.onclick = (e) => { if(e.target === modal) modal.remove(); };

        let listHtml = '';
        if(orgsList.length === 0) {
            listHtml = `<div style="text-align: center; padding: 30px; color: var(--text-sec);">
                <div class="fs-2-mb10">${isAssociation ? '🏛️' : '🏢'}</div>
                <p>Aucune ${isAssociation ? 'association' : 'entreprise'} disponible.</p>
                <p style="font-size:0.85rem;">Ajoute d'abord des structures dans <strong>Production > Asso / Entreprises</strong> (le pôle des structures du projet).</p>
            </div>`;
        } else {
            listHtml = orgsList.map(o => {
                const fn = [o.department, o.role].filter(Boolean).join(' — ');
                return `<div onclick="app.Presentation.addPartner('${type}', '${Utils.escape(o.id)}', '${Utils.escape(o.name)}', '')"
                    style="display: flex; align-items: center; gap: 12px; padding: 12px; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; cursor: pointer; transition: all 0.2s;"
                    onmouseover="this.style.borderColor='var(--primary)'" onmouseout="this.style.borderColor='var(--border)'">
                    <div style="font-size:1.4rem;">${isAssociation ? '🏛️' : '🏢'}</div>
                    <div>
                        <div style="font-weight: 600; color: var(--text-main);">${Utils.escape(o.name)}</div>
                        ${fn ? `<div class="text-sec-sm">${Utils.escape(fn)}</div>` : ''}
                    </div>
                </div>`;
            }).join('');
        }

        modal.innerHTML = `
            <div style="background: var(--panel-bg); border-radius: 12px; width: 90%; max-width: 500px; max-height: 80vh; display: flex; flex-direction: column;">
                <div class="n8-flex-5">
                    <h3 class="m-0">${title}</h3>
                    <button onclick="document.getElementById('partner-search-modal').remove()" class="icon-btn-sec">✖</button>
                </div>
                <div style="padding: 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 10px;">
                    ${listHtml}
                    <button onclick="app.Presentation.createPartnerOrg('${type}')" style="margin-top: 5px; padding: 10px; background: var(--primary); color: #fff; border: none; border-radius: 6px; cursor: pointer;">➕ Créer une nouvelle ${isAssociation ? 'association' : 'entreprise'}</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
    },
    
    // Cree une nouvelle structure dans le registre maitre (Production > Asso / Entreprises) puis l'ajoute aux partenaires
    createPartnerOrg: async (type) => {
        document.getElementById('partner-search-modal')?.remove();
        const isAsso = type === 'association';
        const name = await ConfirmModal.prompt(isAsso ? "Entrez le nom de l'association." : "Entrez le nom de l'entreprise.", 'Nouvelle structure', 'Nom...');
        if(!name) return;
        const org = { id: Utils.generateUniqueId(), type: isAsso ? 'asso' : 'ent', name: name, address: '', phone: '', site: '', desc: '', department: '', role: '', contact: '', notes: '', srcId: null };
        if(typeof Orgs !== 'undefined') Orgs._list().push(org);
        Presentation.addPartner(type, org.id, name, '');
        if(typeof Orgs !== 'undefined') {
            Orgs.render();
            const orgIdx = Orgs._list().indexOf(org);
            if(orgIdx > -1) Orgs.edit(orgIdx);
        }
    },

    // Ajoute un partenaire au projet
    addPartner: (type, id, name, photo) => {
        if(!state.data.presentation) state.data.presentation = {};
        
        const key = type === 'association' ? 'associations' : 'enterprises';
        if(!state.data.presentation[key]) state.data.presentation[key] = [];
        
        // Vérifier si déjà ajouté
        if(state.data.presentation[key].find(p => p.id === id)) {
            Utils.toast('Ce partenaire est déjà ajouté.', 'warning');
            return;
        }
        
        state.data.presentation[key].push({ id, name, photo });
        Store.save();
        
        Presentation.renderPartners();
        document.getElementById('partner-search-modal')?.remove();
        Utils.toast('Partenaire ajouté !', 'success');
    },
    
    // Supprime un partenaire
    removePartner: (type, id, idx) => {
        if(!state.data.presentation) return;
        
        const key = type === 'association' ? 'associations' : 'enterprises';
        const arr = state.data.presentation[key];
        if(!arr) return;
        
        // Suppression par index (fiable meme si un vieux partenaire n'a pas d'id), repli par id
        if(typeof idx === 'number' && arr[idx]) arr.splice(idx, 1);
        else state.data.presentation[key] = arr.filter(p => !p || p.id !== id);
        Store.save();
        Presentation.renderPartners();
    },
    
    // Affiche les partenaires
    renderPartners: () => {
        const p = state.data.presentation || {};
        
        // Associations
        const assoList = document.getElementById('project-associations-list');
        if(assoList) {
            const associations = p.associations || [];
            if(associations.length === 0) {
                assoList.innerHTML = '<span class="text-sec-sm2">Aucune association ajoutée</span>';
            } else {
                assoList.innerHTML = associations.map((a, i) => `
                    <div class="n8-flex-3">
                        <div class="n8-avatar-2">
                            ${a.photo ? `<img src="${Utils.safeMediaUrl(a.photo)}" alt="Logo de l'association" class="img-cover">` : '🏛️'}
                        </div>
                        <span class="fs-09">${Utils.escape(a.name)}</span>
                        <button onclick="app.Presentation.removePartner('association', '${a.id}', ${i})" style="background: none; border: none; cursor: pointer; color: var(--danger); font-size: 0.8rem;">✖</button>
                    </div>
                `).join('');
            }
        }
        
        // Entreprises
        const entList = document.getElementById('project-enterprises-list');
        if(entList) {
            const enterprises = p.enterprises || [];
            if(enterprises.length === 0) {
                entList.innerHTML = '<span class="text-sec-sm2">Aucune entreprise ajoutée</span>';
            } else {
                entList.innerHTML = enterprises.map((e, i) => `
                    <div class="n8-flex-3">
                        <div class="n8-avatar-2">
                            ${e.photo ? `<img src="${Utils.safeMediaUrl(e.photo)}" alt="Logo de l'entreprise" class="img-cover">` : '🏢'}
                        </div>
                        <span class="fs-09">${Utils.escape(e.name)}</span>
                        <button onclick="app.Presentation.removePartner('enterprise', '${e.id}', ${i})" style="background: none; border: none; cursor: pointer; color: var(--danger); font-size: 0.8rem;">✖</button>
                    </div>
                `).join('');
            }
        }
    },
    
    // ========== AUTOCOMPLÉTION ÉQUIPE : code retiré (v569, jamais appelé) ==========
    // 1er septembre — closeAutocompletes retiree a son tour, avec l'ecouteur
    // de clic global qui l'appelait. Elle balayait '.autocomplete-dropdown',
    // classe que plus rien ne posait depuis v569 : un ecouteur pose sur le
    // DOCUMENT ENTIER tournait donc a chaque clic de l'application pour
    // masquer des elements inexistants.
    
    // [Phase C.5.3] Export PDF de la présentation projet
    exportPDF: async (opts = {}) => {
        await LazyLib.load('pdfexport'); const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 15;
        
        const p = state.data.presentation || {};
        
        // Page de garde (optionnelle)
        let y;
        if(opts.includeCover !== false) {
            PdfTheme.coverPage(doc, { sectionName: 'Présentation' });
            doc.addPage();
        }
        y = margin;
        
        // Helper section
        const section = (title) => {
            if(y > pageHeight - 30) { doc.addPage(); y = margin; }
            y = PdfTheme.sectionBand(doc, { x: margin, y, width: pageWidth - margin * 2,
                                            title, accent: PdfTheme.accentFor('Présentation') });
        };
        const COL_VAL = 50;   // mm : abscisse de la colonne des valeurs
        const keyVal = (key, val) => {
            if(!val) return;
            if(y > pageHeight - 15) { doc.addPage(); y = margin; }
            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...PdfTheme.COLORS.TEXT_MUTED);
            const libelle = key + ' :';
            doc.text(libelle, margin, y);
            // LIBELLE TROP LONG : IL MORDAIT SUR LA VALEUR (v601). La colonne des
            // valeurs est a 50 mm fixes ; « Touristes / villageois / hommes de
            // main : » la depasse et s'imprimait PAR-DESSUS « 40 role(s) », deux
            // textes superposes et illisibles. Quand le libelle deborde, la valeur
            // passe a la ligne SOUS lui, sur toute la largeur.
            const deborde = doc.getTextWidth(libelle) > COL_VAL - 4;
            const xVal = deborde ? margin : margin + COL_VAL;
            if(deborde) { y += 4.5; if(y > pageHeight - 15) { doc.addPage(); y = margin; } }
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...PdfTheme.COLORS.TEXT_PRIMARY);
            const valStr = PdfTheme.cleanText(String(val));
            const lines = doc.splitTextToSize(valStr, pageWidth - margin - xVal - 5);
            lines.forEach((l, i) => {
                if(i > 0 && y > pageHeight - 15) { doc.addPage(); y = margin; }
                doc.text(l, xVal, y);
                if(i < lines.length - 1) y += 5;
            });
            y += 6.5;
        };

        // BESOINS EQUIPE EN DEUX COLONNES (v601). Ici la valeur est un simple
        // NOMBRE : une ligne pleine largeur par poste laissait les trois quarts
        // de la page en blanc. Deux paires poste / effectif par ligne.
        const keyValDeuxCol = (paires) => {
            const gouttiere = 10;
            const colL = (pageWidth - margin * 2 - gouttiere) / 2;
            doc.setFontSize(9);
            for(let i = 0; i < paires.length; i += 2) {
                if(y > pageHeight - 15) { doc.addPage(); y = margin; }
                for(let c = 0; c < 2; c++) {
                    const paire = paires[i + c];
                    if(!paire) break;
                    const x = margin + c * (colL + gouttiere);
                    const compte = PdfTheme.cleanText(String(paire[1]));
                    doc.setFont('helvetica', 'normal');
                    doc.setTextColor(...PdfTheme.COLORS.TEXT_PRIMARY);
                    const largeurCompte = doc.getTextWidth(compte);
                    doc.setFont('helvetica', 'bold');
                    doc.setTextColor(...PdfTheme.COLORS.TEXT_MUTED);
                    // Meme garde que ci-dessus : on tronque sur la COLONNE, sinon
                    // un poste au nom long passerait sous l'effectif d'a cote.
                    let lbl = PdfTheme.cleanText(String(paire[0]));
                    const place = colL - largeurCompte - 6;
                    // Un caractere a la fois, suite et deux-points COMPRIS dans la
                    // mesure : retirer n caracteres pour en rajouter autant tourne
                    // en rond (cf. la meme faute au recapitulatif global).
                    if(doc.getTextWidth(lbl + ' :') > place) {
                        while(lbl.length > 2 && doc.getTextWidth(lbl + '… :') > place) lbl = lbl.slice(0, -1);
                        lbl += '…';
                    }
                    lbl += ' :';
                    doc.text(lbl, x, y);
                    doc.setFont('helvetica', 'normal');
                    doc.setTextColor(...PdfTheme.COLORS.TEXT_PRIMARY);
                    doc.text(compte, x + colL - 3, y, { align: 'right' });
                }
                y += 5.5;
            }
            y += 3;
        };
        
        // === IDENTITÉ DU PROJET ===
        section('IDENTITÉ DU PROJET');
        keyVal('Titre', state.data.title);
        keyVal('Type', p.type);
        keyVal('Genre', p.genre);
        keyVal('Durée estimée', p.duration);
        keyVal('Format', p.format);
        
        // === PLANNING GLOBAL ===
        if(p.datePreprodStart || p.dateShootingStart || p.datePostprodStart || p.dateRelease) {
            y += 4;
            section('PLANNING GLOBAL');
            const fmtDate = (d) => { try { return new Date(d).toLocaleDateString('fr-FR'); } catch(e) { return d; } };
            if(p.datePreprodStart || p.datePreprodEnd) 
                keyVal('Pré-production', `${p.datePreprodStart ? fmtDate(p.datePreprodStart) : '?'} → ${p.datePreprodEnd ? fmtDate(p.datePreprodEnd) : '?'}`);
            if(p.dateShootingStart || p.dateShootingEnd)
                keyVal('Tournage', `${p.dateShootingStart ? fmtDate(p.dateShootingStart) : '?'} → ${p.dateShootingEnd ? fmtDate(p.dateShootingEnd) : '?'}`);
            if(p.datePostprodStart || p.datePostprodEnd)
                keyVal('Post-production', `${p.datePostprodStart ? fmtDate(p.datePostprodStart) : '?'} → ${p.datePostprodEnd ? fmtDate(p.datePostprodEnd) : '?'}`);
            if(p.dateRelease)
                keyVal('Sortie prévue', fmtDate(p.dateRelease));
        }
        
        // === SYNOPSIS ===
        if(state.data.synopsisShort || state.data.synopsis) {
            y += 4;
            section('SYNOPSIS');
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_PRIMARY);
            const synopRawHtml = state.data.synopsisShort || state.data.synopsis || '';
            const synopStripDiv = document.createElement('div');
            synopStripDiv.innerHTML = synopRawHtml;
            const synop = PdfTheme.cleanText(synopStripDiv.innerText || synopStripDiv.textContent || '');
            const lines = doc.splitTextToSize(synop, pageWidth - margin * 2);
            lines.forEach(l => {
                if(y > pageHeight - 15) { doc.addPage(); y = margin; }
                doc.text(l, margin, y);
                y += 5;
            });
            y += 4;
        }
        
        // === BESOINS ÉQUIPE ===
        // 1er septembre — DEUX SECTIONS QUI NE S'IMPRIMAIENT JAMAIS. L'export
        // lisait p.needsCrew et p.needsActors ; l'ecran ecrit p.crewNeeds et
        // p.actorNeeds. Les deux noms se ressemblent au point qu'on ne voit
        // rien en relisant, et les deux clefs vides existent bel et bien dans
        // les donnees (elles viennent de Store.getEmpty, jamais renommees) :
        // le if sortait donc proprement, sans erreur, et le PDF perdait en
        // silence les besoins equipe ET le casting recherche. Meme famille de
        // faute que les trois graphiques de l'export Statistiques, corriges le
        // meme jour. Les libelles passent par crewPositions, sinon le PDF
        // afficherait des identifiants techniques (dop, chef_elec...).
        const besoinsEquipe = p.crewNeeds || {};
        const posesRetenues = Object.entries(besoinsEquipe).filter(([, n]) => n && n.needed);
        const besoinsPerso = p.customCrewNeeds || [];
        if(posesRetenues.length > 0 || besoinsPerso.length > 0) {
            y += 4;
            section('BESOINS ÉQUIPE');
            const pairesEquipe = [];
            posesRetenues.forEach(([posId, n]) => {
                const pos = Presentation.crewPositions.find(x => x.id === posId);
                pairesEquipe.push([pos ? pos.name : posId, String(n.count || 1)]);
            });
            besoinsPerso.forEach(cn => {
                if(cn.name) pairesEquipe.push([cn.name, String(cn.count || 1)]);
            });
            keyValDeuxCol(pairesEquipe);
        }
        
        // === BESOINS COMÉDIENS ===
        if(p.actorNeeds && p.actorNeeds.length > 0) {
            y += 4;
            section('BESOINS COMÉDIENS');
            p.actorNeeds.forEach(need => {
                if(typeof need === 'string') { keyVal('-', PdfTheme.cleanText(need)); return; }
                const nom = need.roleName || need.character || need.name || '';
                const bouts = [];
                if(need.count && need.count > 1) bouts.push(need.count + ' role(s)');
                if(need.gender) bouts.push(need.gender);
                if(need.ageMin || need.ageMax) bouts.push((need.ageMin || '?') + '-' + (need.ageMax || '?') + ' ans');
                if(need.description) bouts.push(need.description);
                keyVal(PdfTheme.cleanText(nom || '-'), PdfTheme.cleanText(bouts.join(', ')));
            });
        }
        
        // === PARTENAIRES ===
        if((p.associations && p.associations.length > 0) || (p.enterprises && p.enterprises.length > 0)) {
            y += 4;
            section('PARTENAIRES');
            (p.associations || []).forEach(a => {
                keyVal('Association', PdfTheme.cleanText(a.name || ''));
            });
            (p.enterprises || []).forEach(e => {
                keyVal('Entreprise', PdfTheme.cleanText(e.name || ''));
            });
        }
        
        // Footers + filename
        PdfTheme.applyFooters(doc, { forDossier: !!opts.returnBlob });
        if(opts.returnBlob) return doc.output('blob');
        doc.save(PdfTheme.filename('Présentation'));
        Utils.toast('Présentation PDF exportée !', 'success');
        History.log('EXPORT', 'Présentation PDF générée');
    }
};

const ExpensesExport = {
    // Modal d'options du bouton d'onglet — aligné sur le modal Export global
    // (mode Simple par défaut + toggle page de garde)
    openExportModal: () => {
        Actions.openExportModal('budget');
        document.querySelectorAll('#export-modal .exp-section-chk').forEach(cb => {
            cb.checked = (cb.dataset.section === 'budget');
        });
    },
    
    // Export PDF du budget [Phase C.2.2 refondu + Phase D : opts.simple / opts.includeCover]
    // opts = { includeCover, returnBlob, simple }
    // - simple : page de garde + résumé global + totaux par catégorie CNC (saute le tableau détaillé des dépenses)
    // - sinon : tout (par défaut = détaillé)
    exportPDF: async (opts = {}) => {
        await LazyLib.load('pdfexport'); const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 15;
        const currency = state.data.budget?.currency || '€';
        const vatMode = state.data.budget?.vatMode || 'HT';
        const projectTitle = state.data.title || 'Projet sans titre';
        const previsionnel = state.data.budget?.previsionnel || {};
        
        // Helper de formatage des montants (évite le bug "38 /260" de toLocaleString avec espace insécable)
        const fmt = (n) => {
            const num = parseFloat(n) || 0;
            // Format français : séparateur de milliers = espace normal, pas d'insécable
            return num.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
        };
        
        // Calculer le budget total depuis le prévisionnel
        let budgetTotal = 0;
        Object.values(previsionnel).forEach(p => {
            budgetTotal += vatMode === 'HT' ? (p.budgetHT || 0) : (p.budgetTTC || 0);
        });
        if(budgetTotal === 0) budgetTotal = state.data.budget?.total || 0;
        
        // Calcul des totaux par catégorie CNC
        let totalApproved = 0, totalPending = 0, totalRejected = 0;
        const catTotals = {};
        
        Expenses.CNC_CATEGORIES.forEach(cat => {
            const prev = previsionnel[cat.id] || {};
            catTotals[cat.id] = { 
                approved: 0, 
                pending: 0, 
                budget: vatMode === 'HT' ? (prev.budgetHT || 0) : (prev.budgetTTC || 0)
            };
        });
        
        (state.data.expenses || []).forEach(exp => {
            const catId = exp.category || exp.department;
            const amount = vatMode === 'HT' ? (parseFloat(exp.amountHT) || parseFloat(exp.amount) || 0) : (parseFloat(exp.amountTTC) || parseFloat(exp.amount) || 0);
            
            if(exp.status === 'approved' || exp.status === 'done') totalApproved += amount;
            else if(exp.status === 'pending' || exp.status === 'escalated') totalPending += amount;
            else if(exp.status === 'rejected') totalRejected += amount;
            
            const mappedCat = Expenses.MIGRATION_MAP[catId] || catId;
            if(!catTotals[mappedCat]) catTotals[mappedCat] = { approved: 0, pending: 0, budget: 0 };
            
            if(exp.status === 'approved' || exp.status === 'done') catTotals[mappedCat].approved += amount;
            else if(exp.status === 'pending') catTotals[mappedCat].pending += amount;
        });
        
        // Meme precaution que dans la synthese a l'ecran : on n'ajoute que les
        // salaires PAS encore generes en depense validee, sinon le PDF annonce un
        // poste salaires double.
        const salariesTotal = Expenses.calculateSalariesTotal(true);
        totalApproved += salariesTotal;
        
        // ===== HELPER : en-têtes tableau dépenses =====
        const drawExpenseHeaders = (yPos) => {
            doc.setFillColor(...PdfTheme.COLORS.BANNER_DARK);
            doc.rect(margin, yPos, pageWidth - margin * 2, 7, 'F');
            doc.setTextColor(...PdfTheme.COLORS.WHITE);
            doc.setFontSize(7.5);
            doc.setFont('helvetica', 'bold');
            doc.text('Date', margin + 2, yPos + 5);
            doc.text('Titre', margin + 22, yPos + 5);
            doc.text('Catégorie', margin + 75, yPos + 5);
            doc.text('HT', margin + 112, yPos + 5);
            doc.text('TVA', margin + 132, yPos + 5);
            doc.text('TTC', margin + 148, yPos + 5);
            doc.text('Statut', margin + 167, yPos + 5);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_PRIMARY);
            doc.setFont('helvetica', 'normal');
            return yPos + 9;
        };
        
        // ===== PAGE DE GARDE (Phase C.1) — optionnelle =====
        if(opts.includeCover !== false) {
            PdfTheme.coverPage(doc, { sectionName: 'Budget' });
            doc.addPage();
        }
        let y = margin;
        
        // Mention du mode HT/TTC
        doc.setFontSize(10);
        doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
        doc.setFont('helvetica', 'italic');
        doc.text('Mode ' + vatMode, pageWidth / 2, y + 4, { align: 'center' });
        y += 12;
        
        // ===== RÉSUMÉ GLOBAL =====
        const reste = budgetTotal - totalApproved;
        const pct = budgetTotal > 0 ? Math.round(totalApproved / budgetTotal * 100) : 0;
        
        doc.setFillColor(...PdfTheme.COLORS.BG_LIGHTER);
        doc.roundedRect(margin, y, pageWidth - margin * 2, 38, 3, 3, 'F');
        doc.setDrawColor(...PdfTheme.COLORS.BANNER_BLUE);
        doc.setLineWidth(0.5);
        doc.roundedRect(margin, y, pageWidth - margin * 2, 38, 3, 3, 'S');
        doc.setLineWidth(0.2);
        
        // Titre résumé
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...PdfTheme.COLORS.BANNER_BLUE);
        doc.text('RÉSUMÉ GLOBAL', margin + 5, y + 8);
        
        // Barre de progression
        const barX = margin + 5;
        const barW = pageWidth - margin * 2 - 10;
        const barY = y + 12;
        doc.setFillColor(...PdfTheme.COLORS.BORDER_LIGHT);
        doc.roundedRect(barX, barY, barW, 4, 2, 2, 'F');
        if(pct > 0) {
            const clampedPct = Math.min(pct, 100);
            doc.setFillColor(pct > 100 ? 220 : 76, pct > 100 ? 53 : 175, pct > 100 ? 69 : 80);
            doc.roundedRect(barX, barY, barW * clampedPct / 100, 4, 2, 2, 'F');
        }
        doc.setFontSize(7);
        doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
        doc.text(pct + '% consommé', barX + barW / 2, barY + 3, { align: 'center' });
        
        // Chiffres
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...PdfTheme.COLORS.TEXT_MUTED);
        doc.text('Prévisionnel ' + vatMode, margin + 5, y + 25);
        doc.text('Dépensé (validé)', margin + 65, y + 25);
        doc.text('En attente', margin + 120, y + 25);
        doc.text('Reste', margin + 158, y + 25);
        
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...PdfTheme.COLORS.TEXT_PRIMARY);
        doc.text(fmt(budgetTotal) + ' ' + currency, margin + 5, y + 33);
        doc.setTextColor(...PdfTheme.COLORS.STAT_GREEN);
        doc.text(fmt(totalApproved) + ' ' + currency, margin + 65, y + 33);
        doc.setTextColor(...PdfTheme.COLORS.WARNING);
        doc.text(fmt(totalPending) + ' ' + currency, margin + 120, y + 33);
        doc.setTextColor(reste < 0 ? 220 : 43, reste < 0 ? 53 : 110, reste < 0 ? 69 : 246);
        doc.text(fmt(reste) + ' ' + currency, margin + 158, y + 33);
        
        y += 48;
        
        // ===== TABLEAU CATÉGORIES CNC =====
        y = PdfTheme.sectionBand(doc, { x: margin, y, width: pageWidth - margin * 2,
                                        title: 'Répartition par catégorie CNC', size: 10,
                                        accent: PdfTheme.accentFor('Budget') });
        
        // En-têtes
        doc.setFillColor(...PdfTheme.COLORS.BG_LIGHTER);
        doc.rect(margin, y, pageWidth - margin * 2, 7, 'F');
        doc.setTextColor(...PdfTheme.COLORS.TEXT_SECONDARY);
        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'bold');
        doc.text('Catégorie', margin + 3, y + 5);
        doc.text('Prévisionnel', margin + 75, y + 5);
        doc.text('Dépensé', margin + 108, y + 5);
        doc.text('En attente', margin + 137, y + 5);
        doc.text('Écart', margin + 167, y + 5);
        y += 9;
        
        let rowIndex = 0;
        Expenses.CNC_CATEGORIES.forEach(cat => {
            const data = catTotals[cat.id];
            if(!data || (data.approved === 0 && data.pending === 0 && data.budget === 0)) return;
            
            if(y > pageHeight - 20) { doc.addPage(); y = margin; }
            
            if(rowIndex % 2 === 0) {
                doc.setFillColor(...PdfTheme.COLORS.BG_LIGHTER);
                doc.rect(margin, y - 3.5, pageWidth - margin * 2, 7, 'F');
            }
            
            const ecart = data.budget - data.approved;
            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...PdfTheme.COLORS.TEXT_PRIMARY);
            doc.text(PdfTheme.cleanText(`${cat.code}. ${cat.name}`).substring(0, 38), margin + 3, y);
            doc.text(data.budget > 0 ? fmt(data.budget) + ' ' + currency : '-', margin + 75, y);
            doc.text(fmt(data.approved) + ' ' + currency, margin + 108, y);
            doc.text(data.pending > 0 ? fmt(data.pending) + ' ' + currency : '-', margin + 137, y);
            if(data.budget > 0) {
                doc.setTextColor(ecart < 0 ? 220 : 76, ecart < 0 ? 53 : 175, ecart < 0 ? 69 : 80);
                doc.text(fmt(ecart) + ' ' + currency, margin + 167, y);
                doc.setTextColor(...PdfTheme.COLORS.TEXT_PRIMARY);
            } else {
                doc.text('-', margin + 167, y);
            }
            y += 7;
            rowIndex++;
        });
        
        // Ligne total catégories
        y += 2;
        doc.setFillColor(...PdfTheme.COLORS.BANNER_DARK);
        doc.rect(margin, y - 3.5, pageWidth - margin * 2, 8, 'F');
        doc.setTextColor(...PdfTheme.COLORS.WHITE);
        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'bold');
        doc.text('TOTAL', margin + 3, y + 1);
        doc.text(fmt(budgetTotal) + ' ' + currency, margin + 75, y + 1);
        doc.text(fmt(totalApproved) + ' ' + currency, margin + 108, y + 1);
        doc.text(fmt(totalPending) + ' ' + currency, margin + 137, y + 1);
        doc.setTextColor(...PdfTheme.COLORS.TEXT_PRIMARY);
        y += 15;
        
        // ===== LISTE DES DÉPENSES (sautée si opts.simple) =====
        const statusColors = { pending: [255, 152, 0], approved: [76, 175, 80], rejected: [220, 53, 69], done: [43, 110, 246], escalated: [156, 39, 176], returned: [96, 125, 139] };
        const expenses = [...(state.data.expenses || [])].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        if(!opts.simple && expenses.length > 0) {
            if(y > pageHeight - 50) { doc.addPage(); y = margin; }
            
            y = PdfTheme.sectionBand(doc, { x: margin, y, width: pageWidth - margin * 2,
                                            title: 'Liste des dépenses', size: 10,
                                            right: String(expenses.length),
                                            accent: PdfTheme.accentFor('Budget') });
            
            y = drawExpenseHeaders(y);
            
            expenses.forEach((exp, idx) => {
                if(y > pageHeight - 15) { 
                    doc.addPage(); 
                    y = margin;
                    y = drawExpenseHeaders(y);
                }
                
                if(idx % 2 === 0) {
                    doc.setFillColor(...PdfTheme.COLORS.BG_LIGHTER);
                    doc.rect(margin, y - 3.5, pageWidth - margin * 2, 6.5, 'F');
                }
                
                const cat = Expenses.getCategory(exp.category || exp.department);
                const catLabel = cat ? `${cat.code}. ${cat.name}` : (exp.category || exp.department || '-');
                const amountHT = exp.amountHT || exp.amount || 0;
                const vatRate = exp.vatRate || 0;
                const amountTTC = exp.amountTTC || exp.amount || 0;
                
                doc.setFontSize(7.5);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(...PdfTheme.COLORS.TEXT_PRIMARY);
                doc.text(exp.date ? new Date(exp.date).toLocaleDateString('fr-FR') : '-', margin + 2, y);
                doc.text(PdfTheme.cleanText(exp.title || 'Sans titre').substring(0, 26), margin + 22, y);
                doc.text(PdfTheme.cleanText(catLabel).substring(0, 20), margin + 75, y);
                doc.text(fmt(amountHT), margin + 112, y);
                doc.text(vatRate > 0 ? vatRate + '%' : '-', margin + 132, y);
                doc.text(fmt(amountTTC), margin + 148, y);
                const sc = statusColors[exp.status] || [100, 100, 100];
                doc.setTextColor(sc[0], sc[1], sc[2]);
                doc.setFont('helvetica', 'bold');
                doc.text(EXPENSE_STATUS_LABELS[exp.status] || exp.status || '-', margin + 167, y);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(...PdfTheme.COLORS.TEXT_PRIMARY);
                
                y += 6;
            });
            
            // Ligne total dépenses
            y += 3;
            doc.setFillColor(...PdfTheme.COLORS.BANNER_DARK);
            doc.rect(margin, y - 3.5, pageWidth - margin * 2, 8, 'F');
            doc.setTextColor(...PdfTheme.COLORS.WHITE);
            doc.setFontSize(8);
            doc.setFont('helvetica', 'bold');
            let totalHT = 0, totalTTC = 0;
            expenses.filter(e => e.status === 'approved' || e.status === 'done').forEach(e => {
                totalHT += parseFloat(e.amountHT) || parseFloat(e.amount) || 0;
                totalTTC += parseFloat(e.amountTTC) || parseFloat(e.amount) || 0;
            });
            doc.text('TOTAL (validé/payé)', margin + 3, y + 1);
            doc.text(fmt(totalHT) + ' ' + currency, margin + 112, y + 1);
            doc.text(fmt(totalTTC) + ' ' + currency, margin + 148, y + 1);
        }
        
        // ===== FOOTERS UNIFIÉS (Phase C.1) =====
        PdfTheme.applyFooters(doc, { forDossier: !!opts.returnBlob });
        
        // ===== TÉLÉCHARGEMENT (nom unifié) =====
        if(opts.returnBlob) return doc.output('blob');
        doc.save(PdfTheme.filename('Budget'));
        Utils.toast('Budget PDF exporté !', 'success');
        History.log('EXPORT', 'Budget PDF généré');
    },
    
    // Export Excel du budget (format CNC avec TVA)
    exportExcel: () => {
        const currency = state.data.budget?.currency || '€';
        const vatMode = state.data.budget?.vatMode || 'HT';
        const projectTitle = state.data.title || 'Projet sans titre';
        const previsionnel = state.data.budget?.previsionnel || {};
        
        // Calculer le budget total
        let budgetTotal = 0;
        Object.values(previsionnel).forEach(p => {
            budgetTotal += vatMode === 'HT' ? (p.budgetHT || 0) : (p.budgetTTC || 0);
        });
        if(budgetTotal === 0) budgetTotal = state.data.budget?.total || 0;
        
        
        // Construire le CSV avec BOM UTF-8
        let csv = '\uFEFF';
        
        // En-tête projet
        csv += `BUDGET - ${projectTitle}\n`;
        csv += `Généré le;${new Date().toLocaleDateString('fr-FR')}\n`;
        csv += `Mode;${vatMode}\n`;
        csv += `Budget total ${vatMode};${budgetTotal} ${currency}\n\n`;
        
        // Résumé par catégorie CNC
        csv += 'RÉPARTITION PAR CATÉGORIE CNC\n';
        csv += 'Code;Catégorie;Prévisionnel HT;Prévisionnel TTC;Dépensé HT;Dépensé TTC;En attente;Écart\n';
        
        // Calculer les totaux par catégorie
        const catTotals = {};
        Expenses.CNC_CATEGORIES.forEach(cat => {
            const prev = previsionnel[cat.id] || {};
            catTotals[cat.id] = { 
                approvedHT: 0, 
                approvedTTC: 0,
                pendingHT: 0,
                budgetHT: prev.budgetHT || 0,
                budgetTTC: prev.budgetTTC || 0
            };
        });
        
        (state.data.expenses || []).forEach(exp => {
            const catId = exp.category || exp.department;
            const mappedCat = Expenses.MIGRATION_MAP[catId] || catId;
            
            if(!catTotals[mappedCat]) catTotals[mappedCat] = { approvedHT: 0, approvedTTC: 0, pendingHT: 0, budgetHT: 0, budgetTTC: 0 };
            
            const amountHT = parseFloat(exp.amountHT) || parseFloat(exp.amount) || 0;
            const amountTTC = parseFloat(exp.amountTTC) || parseFloat(exp.amount) || 0;
            
            if(exp.status === 'approved' || exp.status === 'done') {
                catTotals[mappedCat].approvedHT += amountHT;
                catTotals[mappedCat].approvedTTC += amountTTC;
            } else if(exp.status === 'pending' || exp.status === 'escalated') {
                catTotals[mappedCat].pendingHT += amountHT;
            }
        });
        
        // Écrire les lignes par catégorie CNC
        let totalBudgetHT = 0, totalBudgetTTC = 0, totalApprovedHT = 0, totalApprovedTTC = 0, totalPending = 0;
        
        Expenses.CNC_CATEGORIES.forEach(cat => {
            const data = catTotals[cat.id];
            if(!data || (data.approvedHT === 0 && data.pendingHT === 0 && data.budgetHT === 0)) return;
            
            const ecart = data.budgetHT - data.approvedHT;
            csv += `${cat.code};${cat.name};${data.budgetHT};${data.budgetTTC};${data.approvedHT};${data.approvedTTC};${data.pendingHT};${ecart}\n`;
            
            totalBudgetHT += data.budgetHT;
            totalBudgetTTC += data.budgetTTC;
            totalApprovedHT += data.approvedHT;
            totalApprovedTTC += data.approvedTTC;
            totalPending += data.pendingHT;
        });
        
        // Ligne total
        csv += `;TOTAL;${totalBudgetHT};${totalBudgetTTC};${totalApprovedHT};${totalApprovedTTC};${totalPending};${totalBudgetHT - totalApprovedHT}\n`;
        
        csv += '\n';
        
        // Liste des dépenses détaillée
        csv += 'LISTE DES DÉPENSES\n';
        csv += 'Date;Titre;Catégorie CNC;Sous-catégorie;Montant HT;TVA %;Montant TTC;Statut;Description;Créé par;Validé par;Payé par\n';
        
        const expenses = [...(state.data.expenses || [])].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        expenses.forEach(exp => {
            const date = exp.date ? new Date(exp.date).toLocaleDateString('fr-FR') : '';
            const title = (exp.title || '').replace(/;/g, ',').replace(/\n/g, ' ');
            const desc = (exp.description || '').replace(/;/g, ',').replace(/\n/g, ' ');
            const createdBy = (exp.createdByName || exp.createdBy || '').replace(/;/g, ',');
            const validatedBy = (exp.validatedByName || '').replace(/;/g, ',');
            const paidBy = (exp.paidByName || '').replace(/;/g, ',');
            
            // Catégorie CNC
            const cat = Expenses.getCategory(exp.category || exp.department);
            const catLabel = cat ? `${cat.code}. ${cat.name}` : (exp.category || exp.department || '');
            
            // Sous-catégorie
            let subcatLabel = '';
            if(exp.subcategory && cat) {
                const subcat = cat.subcats?.find(s => s.id === exp.subcategory);
                if(subcat) subcatLabel = subcat.name;
            }
            
            // Montants
            const amountHT = exp.amountHT || exp.amount || 0;
            const vatRate = exp.vatRate || 0;
            const amountTTC = exp.amountTTC || exp.amount || 0;
            
            csv += `${date};${title};${catLabel};${subcatLabel};${amountHT};${vatRate};${amountTTC};${EXPENSE_STATUS_LABELS[exp.status] || exp.status};${desc};${createdBy};${validatedBy};${paidBy}\n`;
        });
        
        // Télécharger
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = (projectTitle.replace(/[^a-z0-9]/gi, '_') || 'budget') + '_budget_CNC.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        Utils.toast('Export Excel (CSV) généré !', 'success');
    },
};

const ExpensesSalaries = {
    // ===================== SALAIRES (refonte 8e, 25 aout) =====================
    // Le calcul « qui a travaille combien de jours, a quel tarif » etait ecrit
    // TROIS fois dans ce module (total, tableau, generation), avec des variantes :
    // la moindre correction devait etre reportee a trois endroits sous peine de
    // faire diverger l'estimation et la depense generee. Une seule source
    // desormais : ExpensesSalaries.rows().
    // Un salaire est une FICHE PAR PERSONNE (demande de Guillaume) : la grande
    // section de generation en masse disparait au profit d'une grille de cartes,
    // chacune portant sa propre generation. Generer pour tout le monde d'un bloc
    // obligeait a tout supprimer pour corriger une seule ligne.
    
    // Jours et heures travailles par personne, lus dans les feuilles de service.
    _daysByPerson: () => {
        const out = {};
        (state.data.shootingDays || []).forEach(day => {
            if(!day || !day.callSheet || !day.callSheet.length) return;
            day.callSheet.forEach(call => {
                if(!call || !call.personId) return;
                const key = call.type + '_' + call.personId;
                if(!out[key]) out[key] = { type: call.type, personId: call.personId, days: 0, hours: 0 };
                out[key].days++;
                if(call.callTime && day.estimatedWrap) {
                    const st = String(call.callTime).split(':').map(Number);
                    const en = String(day.estimatedWrap).split(':').map(Number);
                    const h = (en[0] + en[1] / 60) - (st[0] + st[1] / 60);
                    if(h > 0) out[key].hours += h;
                }
            });
        });
        return out;
    },
    
    // UNE ligne par personne convoquee, tarif connu ou non. C'est la source
    // unique : le total, les cartes et la generation en descendent tous.
    rows: () => {
        const currency = state.data.budget?.currency || '€';
        const dbp = ExpensesSalaries._daysByPerson();
        const expenses = state.data.expenses || [];
        const list = [];
        const push = (person, type, icon) => {
            if(!person || !person.name) return;
            const d = dbp[type + '_' + person.id];
            if(!d || !d.days) return;
            const rate = Pay.cost(person);
            const hasRate = rate > 0;
            const rateType = person.rateType || 'Jour';
            let amount = 0, detail = '';
            if(hasRate && rateType === 'Heure' && d.hours > 0) {
                amount = rate * d.hours;
                detail = d.hours.toFixed(1) + 'h × ' + rate + ' ' + currency + '/h';
            } else if(hasRate) {
                amount = rate * d.days;
                detail = d.days + ' jour' + (d.days > 1 ? 's' : '') + ' × ' + rate + ' ' + currency;
            } else {
                detail = d.days + ' jour' + (d.days > 1 ? 's' : '') + ' — tarif à définir';
            }
            const expense = expenses.find(e => e && e.salaryPersonId === person.id && e.salaryPersonType === type) || null;
            list.push({ person, type, icon, days: d.days, hours: d.hours, rate, hasRate, amount, detail, expense });
        };
        (state.data.actors || []).forEach(a => push(a, 'actor', '🎭'));
        (state.data.crew || []).forEach(c => push(c, 'crew', '🎬'));
        return list;
    },
    
    // Total des salaires estimes. skipAlreadyBilled ignore les personnes dont la
    // depense est deja generee ET validee : sans cela l'estimation du planning
    // s'ajoutait a la depense generee et le poste comptait double.
    calculateSalariesTotal: (skipAlreadyBilled) => {
        return ExpensesSalaries.rows().reduce((sum, r) => {
            if(!r.hasRate) return sum;
            if(skipAlreadyBilled && r.expense && (r.expense.status === 'approved' || r.expense.status === 'done')) return sum;
            return sum + r.amount;
        }, 0);
    },
    
    _sort: 'alpha',
    setSort: (mode) => { ExpensesSalaries._sort = mode; ExpensesSalaries.renderSalaries(); },
    
    // Grille de fiches, une par personne convoquee. Meme format compact que les
    // depenses et les autres onglets. Clic : la depense generee si elle existe
    // (pour la corriger), sinon la fiche de la personne (pour y poser le tarif
    // qui manque) — dans les deux cas, l'endroit ou l'on peut agir.
    renderSalaries: () => {
        const container = document.getElementById('expenses-salaries-list');
        const totalEl = document.getElementById('expenses-salaries-total');
        if(!container) return;
        const currency = state.data.budget?.currency || '€';
        let rows = ExpensesSalaries.rows();
        const total = rows.reduce((s, r) => s + (r.hasRate ? r.amount : 0), 0);
        if(totalEl) totalEl.textContent = total.toLocaleString() + ' ' + currency;
        
        if(!rows.length) {
            container.innerHTML = '<div style="color: var(--text-sec); text-align: center; padding: 14px;">Aucun salaire à calculer : personne n’est encore convoqué sur un jour de tournage.</div>';
            return;
        }
        
        const mode = ExpensesSalaries._sort || 'alpha';
        const byName = (a, b) => String(a.person.name || '').localeCompare(String(b.person.name || ''), 'fr');
        if(mode === 'montant') rows = rows.slice().sort((a, b) => (b.amount - a.amount) || byName(a, b));
        else if(mode === 'jours') rows = rows.slice().sort((a, b) => (b.days - a.days) || byName(a, b));
        else rows = rows.slice().sort(byName);
        
        const nMissing = rows.filter(r => !r.hasRate).length;
        const nToGen = rows.filter(r => !r.expense).length;
        const toolbar = '<div class="chub-toolbar"><span class="chub-toolbar-label">Classer :</span>'
            + '<button class="chub-sort-btn ' + (mode === 'alpha' ? 'active' : '') + '" onclick="app.Expenses.setSalarySort(\'alpha\')">A → Z</button>'
            + '<button class="chub-sort-btn ' + (mode === 'metier' ? 'active' : '') + '" onclick="app.Expenses.setSalarySort(\'metier\')">Par métier</button>'
            + '<button class="chub-sort-btn ' + (mode === 'montant' ? 'active' : '') + '" onclick="app.Expenses.setSalarySort(\'montant\')">Par montant</button>'
            + '<button class="chub-sort-btn ' + (mode === 'jours' ? 'active' : '') + '" onclick="app.Expenses.setSalarySort(\'jours\')">Par jours</button>'
            + '<span class="chub-toolbar-label" style="margin-left:auto;">' + rows.length + ' personne' + (rows.length > 1 ? 's' : '')
            + (nToGen ? ' • ' + nToGen + ' à générer' : '')
            + (nMissing ? ' • ⚠️ ' + nMissing + ' sans tarif' : '') + '</span></div>';
        
        let body;
        if(mode === 'metier') {
            // Les groupes d'equipe sont crees par l'utilisateur : sections
            // alphabetiques, comediens d'abord puisqu'ils ne portent pas de groupe.
            const groups = {};
            rows.forEach(r => {
                let cat;
                if(r.type === 'actor') cat = 'Comédien·nes';
                else {
                    const g = (state.data.groups || []).find(x => x.id === r.person.department);
                    cat = g ? g.name : 'Équipe technique';
                }
                (groups[cat] = groups[cat] || []).push(r);
            });
            const cats = Object.keys(groups).sort((a, b) => {
                if(a.indexOf('Comédien') === 0) return -1;
                if(b.indexOf('Comédien') === 0) return 1;
                return a.localeCompare(b, 'fr');
            });
            body = cats.map(c => '<div class="group-section"><div class="group-header">' + Utils.escape(c)
                + '<span class="ccol-group-count">' + groups[c].length + '</span></div>'
                + '<div class="compact-cards-grid">' + groups[c].sort(byName).map(ExpensesSalaries._cardHTML).join('') + '</div></div>').join('');
        } else {
            body = '<div class="compact-cards-grid">' + rows.map(ExpensesSalaries._cardHTML).join('') + '</div>';
        }
        container.innerHTML = toolbar + body;
    },
    
    _cardHTML: (r) => {
        const currency = state.data.budget?.currency || '€';
        const p = r.person;
        const photo = p.photo ? '<img src="' + p.photo + '" alt="Photo">' : r.icon;
        // Trois etats lisibles d'un coup d'oeil : tarif manquant (rouge), depense
        // deja generee (badge de son statut), rien encore genere.
        const stEmoji = { pending: '⏳', approved: '✅', rejected: '❌', done: '💰', escalated: '⬆️', returned: '↩️' };
        const edge = !r.hasRate ? 'border-left:3px solid var(--danger);' : (r.expense ? '' : 'border-left:3px solid var(--border);');
        const badge = r.expense
            ? '<div class="compact-card-badge" title="Dépense générée">' + (stEmoji[r.expense.status] || '•') + '</div>'
            : '';
        const open = r.expense
            ? "app.Expenses.editExpense('" + r.expense.id + "')"
            : "app.UI.openFiche('" + (r.type === 'actor' ? 'actor' : 'crew') + "', '" + p.id + "')";
        const actions = '<div class="compact-card-actions">'
            + '<button class="edit-btn" title="' + (r.expense ? 'Regénérer la dépense depuis le planning' : 'Générer la dépense') + '" onclick="event.stopPropagation(); app.Expenses.generateSalaryFor(\'' + r.type + '\',\'' + p.id + '\')">↻</button>'
            + (r.expense ? '<button class="delete-btn" title="Supprimer la dépense générée" onclick="event.stopPropagation(); app.Expenses.removeSalaryFor(\'' + r.type + '\',\'' + p.id + '\')">🗑️</button>' : '')
            + '</div>';
        return '<div class="compact-card" style="' + edge + '" onclick="' + open + '" title="' + Utils.escape(p.name || '') + '">'
            + actions + badge
            + '<div class="compact-card-photo">' + photo + '</div>'
            + '<div class="compact-card-name">' + Utils.escape(p.name || 'Sans nom') + '</div>'
            + '<div class="compact-card-role" style="font-weight:700; color:' + (r.hasRate ? 'var(--primary)' : 'var(--danger)') + ';">'
            + (r.hasRate ? (Math.round(r.amount).toLocaleString() + ' ' + currency) : '⚠️ Tarif manquant') + '</div>'
            + '<div class="compact-card-role" style="font-size:0.72rem;">' + Utils.escape(r.detail) + '</div>'
            + '<div class="compact-card-role" style="font-size:0.72rem;">' + (r.expense ? 'Dépense générée' : 'Pas encore générée') + '</div>'
            + '</div>';
    },
    
    // Genere OU met a jour la depense salaire d'UNE personne. Regenerer ecrase
    // le montant, la description et le nombre de jours, mais conserve
    // l'identifiant, le statut, les pieces jointes et l'historique de validation :
    // regenerer apres l'ajout d'un jour de tournage ne doit pas faire repasser la
    // depense en attente ni perdre son justificatif.
    generateSalaryFor: (type, personId) => {
        if(!Expenses.isBudgetManager()) { Utils.toast('Seul le responsable budget peut générer les salaires', 'error'); return; }
        const r = ExpensesSalaries.rows().find(x => x.type === type && String(x.person.id) === String(personId));
        if(!r) { Utils.toast('Cette personne n’est convoquée sur aucun jour de tournage.', 'info'); return; }
        if(!state.data.expenses) state.data.expenses = [];
        const isActor = type === 'actor';
        if(r.expense) {
            const e = r.expense;
            e.title = 'Salaire - ' + r.person.name;
            e.amountHT = r.amount; e.amountTTC = r.amount; e.amount = r.amount; e.vatRate = 0;
            e.description = r.detail;
            e.salaryMissingRate = !r.hasRate;
            e.updatedAt = new Date().toISOString();
            Store.save();
            Expenses.render();
            Utils.toast('Salaire de ' + r.person.name + ' recalculé', 'success');
            return;
        }
        state.data.expenses.push({
            id: Utils.generateUniqueId(),
            title: 'Salaire - ' + r.person.name,
            amountHT: r.amount, vatRate: 0, amountTTC: r.amount, amount: r.amount,
            category: isActor ? 'interpretation' : 'personnel',
            subcategory: isActor ? 'interpretation_principaux' : 'personnel_technique',
            department: isActor ? 'interpretation' : 'personnel',
            description: r.detail,
            status: 'pending',
            date: new Date().toISOString().split('T')[0],
            createdAt: new Date().toISOString(),
            createdBy: state.currentUser?.email,
            createdByName: state.userProfile?.displayName || state.currentUser?.email?.split('@')[0],
            salaryPersonId: r.person.id,
            salaryPersonType: type,
            salaryMissingRate: !r.hasRate
        });
        Store.save();
        Expenses.render();
        Utils.toast('Salaire de ' + r.person.name + ' généré' + (r.hasRate ? '' : ' (tarif à compléter)'), r.hasRate ? 'success' : 'info');
    },
    
    // Supprime la depense salaire d'UNE personne. L'ancienne suppression en masse
    // effacait les depenses salaires de tout le projet d'un seul bouton, sans
    // moyen de n'en corriger qu'une.
    removeSalaryFor: async (type, personId) => {
        if(!Expenses.isBudgetManager()) { Utils.toast('Seul le responsable budget peut supprimer les dépenses salaires', 'error'); return; }
        const list = state.data.expenses || [];
        const i = list.findIndex(e => e && e.salaryPersonType === type && String(e.salaryPersonId) === String(personId));
        if(i < 0) return;
        if(!await ConfirmModal.confirmDelete('La dépense salaire de cette personne sera supprimée. Le calcul, lui, reste disponible.', 'Supprimer cette dépense salaire ?')) return;
        list.splice(i, 1);
        Store.save();
        Expenses.render();
        Utils.toast('Dépense salaire supprimée', 'success');
    }
};

const ExpensesBudget = {
    // Charge le budget
    loadBudget: () => {
        // Synchroniser depuis la présentation si le budget n'est pas défini
        if(state.data.presentation?.budget && !state.data.budget?.total) {
            if(!state.data.budget) state.data.budget = { total: 0, currency: '€', manager: '', envelopes: {}, previsionnel: {}, vatMode: 'HT', defaultVatRate: 20 };
            state.data.budget.total = parseFloat(state.data.presentation.budget) || 0;
        }
        
        const budget = state.data.budget || { total: 0, currency: '€', vatMode: 'HT', defaultVatRate: 20 };
        const vatMode = budget.vatMode || 'HT';
        
        // Calculer le total depuis le prévisionnel
        let totalHT = 0, totalTTC = 0;
        Object.values(budget.previsionnel || {}).forEach(p => {
            totalHT += p.budgetHT || 0;
            totalTTC += p.budgetTTC || 0;
        });
        
        const displayTotal = vatMode === 'HT' ? totalHT : totalTTC;
        const budgetInput = document.getElementById('expenses-budget-total');
        if(budgetInput) budgetInput.value = displayTotal || budget.total || '';
        
        const currencySelect = document.getElementById('expenses-currency');
        if(currencySelect) currencySelect.value = budget.currency || '€';
        
        const managerSelect = document.getElementById('expenses-manager');
        if(managerSelect && budget.manager) managerSelect.value = budget.manager;
        
        // Mode HT/TTC
        const btnHT = document.getElementById('vat-mode-ht');
        const btnTTC = document.getElementById('vat-mode-ttc');
        if(btnHT) {
            btnHT.style.background = vatMode === 'HT' ? 'var(--primary)' : 'var(--bg)';
            btnHT.style.color = vatMode === 'HT' ? 'white' : 'var(--text-main)';
            btnHT.style.borderColor = vatMode === 'HT' ? 'var(--primary)' : 'var(--border)';
        }
        if(btnTTC) {
            btnTTC.style.background = vatMode === 'TTC' ? 'var(--primary)' : 'var(--bg)';
            btnTTC.style.color = vatMode === 'TTC' ? 'white' : 'var(--text-main)';
            btnTTC.style.borderColor = vatMode === 'TTC' ? 'var(--primary)' : 'var(--border)';
        }
        
        // TVA par défaut
        const vatSelect = document.getElementById('expenses-default-vat');
        if(vatSelect) vatSelect.value = budget.defaultVatRate || 20;
        
        // Seuils d'alerte
        const thresholds = budget.alertThresholds || { warning: 80, danger: 100 };
        const warnInput = document.getElementById('alert-threshold-warning');
        const dangerInput = document.getElementById('alert-threshold-danger');
        if(warnInput) warnInput.value = thresholds.warning;
        if(dangerInput) dangerInput.value = thresholds.danger;
    },
    
    // Sauvegarde le budget
    saveBudget: () => {
        if(!state.data.budget) state.data.budget = {};
        const oldTotal = state.data.budget.total || 0;
        const oldCurrency = state.data.budget.currency || '€';
        const newTotal = parseFloat(document.getElementById('expenses-budget-total').value) || 0;
        const newCurrency = document.getElementById('expenses-currency').value;
        state.data.budget.total = newTotal;
        state.data.budget.currency = newCurrency;
        
        // Synchroniser avec la présentation
        if(!state.data.presentation) state.data.presentation = {};
        state.data.presentation.budget = state.data.budget.total;
        
        // Mettre à jour le champ dans la présentation si visible
        const projectBudgetInput = document.getElementById('project-budget');
        if(projectBudgetInput) projectBudgetInput.value = state.data.budget.total || '';
        
        // Tracer le changement (en major si total changé, en minor si juste devise)
        if(oldTotal !== newTotal) {
            History.log('EDIT', `Budget total : ${oldTotal} ${oldCurrency} → ${newTotal} ${newCurrency}`);
        } else if(oldCurrency !== newCurrency) {
            History.log('EDIT', `Devise budget : ${oldCurrency} → ${newCurrency}`, {}, 'minor');
        }
        
        Store.save();
        Expenses.updateSummary();
    },
    
    // Changer le mode HT/TTC
    setVatMode: (mode) => {
        if(!state.data.budget) state.data.budget = {};
        state.data.budget.vatMode = mode;
        
        // Mettre à jour les boutons
        const btnHT = document.getElementById('vat-mode-ht');
        const btnTTC = document.getElementById('vat-mode-ttc');
        if(btnHT) {
            btnHT.style.background = mode === 'HT' ? 'var(--primary)' : 'var(--bg)';
            btnHT.style.color = mode === 'HT' ? 'white' : 'var(--text-main)';
            btnHT.style.borderColor = mode === 'HT' ? 'var(--primary)' : 'var(--border)';
        }
        if(btnTTC) {
            btnTTC.style.background = mode === 'TTC' ? 'var(--primary)' : 'var(--bg)';
            btnTTC.style.color = mode === 'TTC' ? 'white' : 'var(--text-main)';
            btnTTC.style.borderColor = mode === 'TTC' ? 'var(--primary)' : 'var(--border)';
        }
        
        Store.save();
        ExpensesBudget.loadBudget();
        Expenses.populateCategories();
        Expenses.updateSummary();
    },
    
    // Sauvegarder la TVA par défaut
    saveDefaultVat: () => {
        if(!state.data.budget) state.data.budget = {};
        state.data.budget.defaultVatRate = parseFloat(document.getElementById('expenses-default-vat').value) || 20;
        Store.save();
    },
    
    // Sauvegarder les seuils d'alerte
    saveAlertThresholds: () => {
        // Relit les champs de la fenetre de reglages : sans elle, on ne touche a rien.
        if(!document.getElementById('alert-threshold-warning')) return;
        if(typeof Permissions !== 'undefined' && Permissions.canEdit && !Permissions.canEdit('depenses')) return;
        if(!state.data.budget) state.data.budget = {};
        if(!state.data.budget.alertThresholds) state.data.budget.alertThresholds = {};
        state.data.budget.alertThresholds.warning = parseFloat(document.getElementById('alert-threshold-warning').value) || 80;
        state.data.budget.alertThresholds.danger = parseFloat(document.getElementById('alert-threshold-danger').value) || 100;
        Store.save();
        Expenses.populateCategories();
    },
    
    // Sauvegarde le manager
    saveManager: () => {
        if(!document.getElementById('expenses-manager')) return;
        if(typeof Permissions !== 'undefined' && Permissions.canEdit && !Permissions.canEdit('depenses')) return;
        if(!state.data.budget) state.data.budget = {};
        state.data.budget.manager = document.getElementById('expenses-manager').value;
        Store.save();
    },
    
    // Sauvegarde la préférence email du manager global
    saveManagerEmailPref: () => {
        if(!document.getElementById('manager-email-notif')) return;
        if(typeof Permissions !== 'undefined' && Permissions.canEdit && !Permissions.canEdit('depenses')) return;
        if(!state.data.budget) state.data.budget = {};
        state.data.budget.managerEmailNotif = document.getElementById('manager-email-notif').checked;
        Store.save();
    },
    
    // ===== FENETRE DE REGLAGES DU BUDGET (31 aout) =====
    // Recueille les quatre blocs sortis de la colonne : seuils d'alerte,
    // responsable global, responsables par categorie CNC et parametres
    // financiers. Les identifiants des champs sont RIGOUREUSEMENT LES MEMES
    // qu'avant : toutes les fonctions de chargement et de sauvegarde existantes
    // continuent de fonctionner sans etre touchees, elles trouvent simplement
    // leurs champs ici au lieu de la colonne.
    // #dept-managers-list retrouve au passage un conteneur : la liste des
    // responsables par categorie rendait dans le vide depuis la refonte
    // precedente (constat de l'audit v575).
    openSettings: () => {
        const ro = (typeof Permissions !== 'undefined' && Permissions.canEdit) ? !Permissions.canEdit('depenses') : false;
        const html = `
            ${ro ? '<div class="perm-ro-banner">\u{1F441} Lecture seule — vous n\'avez pas les droits de modification sur les dépenses.</div>' : ''}
            <div class="expense-section-title" style="margin-top:0;">⚠️ Seuils d'alerte</div>
            <div style="display:flex; align-items:center; gap:8px; font-size:0.85rem; color:var(--text-sec); margin-bottom:6px;">
                <span>Prévenir à</span>
                <input type="number" id="alert-threshold-warning" value="80" class="n8-input-3" onchange="app.Expenses.saveAlertThresholds()">
                <span>% et alerter à</span>
                <input type="number" id="alert-threshold-danger" value="100" class="n8-input-3" onchange="app.Expenses.saveAlertThresholds()">
                <span>% de l'enveloppe</span>
            </div>
            <div style="font-size:0.72rem; color:var(--text-sec); margin-bottom:18px;">S'applique à chaque catégorie CNC, pas au budget total.</div>
            
            <div class="expense-section-title">👤 Responsable du budget</div>
            <select id="expenses-manager" class="profile-input w-full" onchange="app.Expenses.saveManager()">
                <option value="">-- Choisir --</option>
            </select>
            <label style="display:flex; align-items:center; gap:8px; margin-top:8px; font-size:0.85rem; color:var(--text-sec); cursor:pointer;">
                <input type="checkbox" id="manager-email-notif" onchange="app.Expenses.saveManagerEmailPref()" checked>
                📧 Recevoir les emails de demande de dépense
            </label>
            <div style="font-size:0.72rem; color:var(--text-sec); margin:6px 0 18px 0;">Seul le responsable peut définir les budgets prévisionnels par catégorie.</div>
            
            <div class="expense-section-title">👥 Responsables par catégorie</div>
            <div style="font-size:0.72rem; color:var(--text-sec); margin-bottom:8px;">Se définissent depuis le ⚙️ de chaque catégorie CNC, dans la colonne de gauche.</div>
            <div id="dept-managers-list" style="margin-bottom:18px;"></div>
            
            <div class="expense-section-title">⚙️ Paramètres financiers</div>
            <div class="finance-params">
                <div class="finance-param-row">
                    <label>🚗 Indemnité km</label>
                    <div class="finance-param-input">
                        <input type="number" id="param-km-rate" step="0.01" placeholder="0.55" data-tooltip="0.55" onchange="app.Expenses.saveFinanceParams()">
                        <span class="param-unit">€/km</span>
                    </div>
                </div>
                <div class="finance-param-row">
                    <label>🍽️ Per diem repas</label>
                    <div class="finance-param-input">
                        <input type="number" id="param-perdiem-meal" placeholder="19" data-tooltip="19" onchange="app.Expenses.saveFinanceParams()">
                        <span class="param-unit">€/jour</span>
                    </div>
                </div>
                <div class="finance-param-row">
                    <label>🏨 Per diem hébergement</label>
                    <div class="finance-param-input">
                        <input type="number" id="param-perdiem-hotel" placeholder="80" data-tooltip="80" onchange="app.Expenses.saveFinanceParams()">
                        <span class="param-unit">€/nuit</span>
                    </div>
                </div>
                <div class="finance-param-row">
                    <label>⏰ Seuil heures sup</label>
                    <div class="finance-param-input">
                        <input type="number" id="param-overtime-threshold" placeholder="8" data-tooltip="8" onchange="app.Expenses.saveFinanceParams()">
                        <span class="param-unit">heures</span>
                    </div>
                </div>
                <div class="finance-param-row">
                    <label>📈 Majorations heures sup</label>
                    <div class="finance-param-rates">
                        <input type="number" id="param-overtime-1" placeholder="25" title="Première tranche" onchange="app.Expenses.saveFinanceParams()"><span>%</span>
                        <input type="number" id="param-overtime-2" placeholder="50" title="Deuxième tranche" onchange="app.Expenses.saveFinanceParams()"><span>%</span>
                        <input type="number" id="param-overtime-3" placeholder="100" title="Troisième tranche" onchange="app.Expenses.saveFinanceParams()"><span>%</span>
                    </div>
                </div>
            </div>`;
        
        const overlay = UI.showModal({
            title: ro ? '\u{1F441} Réglages du budget (lecture seule)' : '⚙️ Réglages du budget',
            html: ro ? '<div class="perm-ro-scope is-perm-readonly">' + html + '</div>' : html,
            cancelText: 'Fermer',
            confirmText: 'Fermer'
        });
        // Chaque champ s'enregistre tout seul en sortant : pas de bouton
        // Enregistrer a proposer, il n'aurait rien a faire.
        if(overlay) { const ok = overlay.querySelector('#um-ok'); if(ok) ok.remove(); }
        
        // Les champs viennent d'etre crees : c'est MAINTENANT qu'on les remplit.
        // On passe par la facade Expenses, seule a porter populateManager.
        Expenses.populateManager();
        Expenses.loadBudget();
        Expenses.loadFinanceParams();
        Expenses.loadManagerEmailPref();
        Expenses.renderCategoryManagers();
    },
    
    // Charge la préférence email du manager global
    loadManagerEmailPref: () => {
        const checkbox = document.getElementById('manager-email-notif');
        if(checkbox) {
            checkbox.checked = state.data.budget?.managerEmailNotif !== false; // true par défaut
        }
    },
    
    // Affiche la liste des responsables par catégorie CNC
    renderCategoryManagers: () => {
        const container = document.getElementById('dept-managers-list');
        if(!container) return;
        
        const deptManagers = state.data.budget?.deptManagers || {};
        
        if(Object.keys(deptManagers).length === 0) {
            container.innerHTML = '<div style="color: var(--text-sec); font-size: 0.85rem; padding: 10px; text-align: center;">Aucun responsable assigné</div>';
            return;
        }
        
        let html = '';
        Object.entries(deptManagers).forEach(([catId, manager]) => {
            const cat = Expenses.getCategory(catId);
            if(!cat || !manager.email) return;
            
            const person = ExpensesBudget.findPersonByEmail(manager.email);
            const name = person?.name || manager.email.split('@')[0];
            
            html += `<div class="dept-manager-item">
                <div class="dept-manager-info">
                    <span class="dept-manager-dept">${cat.icon} ${cat.name}</span>
                    <span class="dept-manager-name">${Utils.escape(name)}</span>
                </div>
                <div class="dept-manager-actions">
                    <label title="Recevoir les emails" style="cursor: pointer;">
                        <input type="checkbox" ${manager.emailNotif !== false ? 'checked' : ''} onchange="app.ExpensesBudget.toggleDeptManagerEmail('${catId}', this.checked)">
                        📧
                    </label>
                    <button onclick="app.ExpensesBudget.removeDeptManager('${catId}')" title="Retirer" style="background: none; border: none; cursor: pointer; color: var(--danger);">✕</button>
                </div>
            </div>`;
        });
        
        container.innerHTML = html;
    },
    
    // Alias pour rétrocompatibilité
    renderDeptManagers: () => {
        ExpensesBudget.renderCategoryManagers();
    },
    
    // Trouve une personne par email
    findPersonByEmail: (email) => {
        const actors = state.data.actors || [];
        const crew = state.data.crew || [];
        const allPeople = [...actors, ...crew];
        return allPeople.find(p => p.email === email);
    },
    
    // Supprime un responsable département
    removeDeptManager: async (deptId) => {
        // 31 aout — BUG LATENT REVELE PAR LA REMISE EN SERVICE DE LA LISTE :
        // Expenses.departments n'existe plus depuis le passage aux categories
        // CNC, ce bouton plantait donc au premier clic. Invisible jusqu'ici
        // parce que la liste elle-meme rendait dans le vide.
        const dept = Expenses.getCategory(deptId);
        if(!await ConfirmModal.confirmDelete(`Le responsable de ${dept?.name || 'cette catégorie'} sera retiré.`)) return;
        
        if(state.data.budget?.deptManagers) {
            delete state.data.budget.deptManagers[deptId];
            Store.save();
            ExpensesBudget.renderDeptManagers();
            Utils.toast('Responsable retiré', 'success');
        }
    },
    
    // Toggle email notification pour un responsable département
    toggleDeptManagerEmail: (deptId, enabled) => {
        if(state.data.budget?.deptManagers?.[deptId]) {
            state.data.budget.deptManagers[deptId].emailNotif = enabled;
            Store.save();
        }
    },
    
    // Vérifie si l'utilisateur est responsable d'un département
    isDeptManager: (deptId) => {
        const manager = state.data.budget?.deptManagers?.[deptId];
        return manager && manager.email === state.currentUser?.email;
    },
    
    // Sauvegarde les paramètres financiers
    saveFinanceParams: () => {
        // Cette sauvegarde RELIT LES CHAMPS de la fenetre de reglages : ne
        // l'appeler que depuis cette fenetre (regle de l'etape 6). Si elle
        // n'est pas ouverte, on ne touche a rien plutot que d'ecraser les
        // valeurs par des zeros.
        if(!document.getElementById('param-km-rate')) return;
        if(typeof Permissions !== 'undefined' && Permissions.canEdit && !Permissions.canEdit('depenses')) return;
        if(!state.data.budget) state.data.budget = {};
        
        state.data.budget.kmRate = parseFloat(document.getElementById('param-km-rate').value) || 0.55;
        state.data.budget.perDiemMeal = parseFloat(document.getElementById('param-perdiem-meal').value) || 19;
        state.data.budget.perDiemHotel = parseFloat(document.getElementById('param-perdiem-hotel').value) || 80;
        state.data.budget.overtimeThreshold = parseFloat(document.getElementById('param-overtime-threshold').value) || 8;
        state.data.budget.overtimeRates = {
            first: parseFloat(document.getElementById('param-overtime-1').value) || 25,
            second: parseFloat(document.getElementById('param-overtime-2').value) || 50,
            third: parseFloat(document.getElementById('param-overtime-3').value) || 100
        };
        
        Store.save();
        Utils.toast('Paramètres financiers enregistrés', 'success');
    },
    
    // Charge les paramètres financiers
    // 31 aout : les champs vivent desormais dans la fenetre de reglages, qui
    // n'existe pas tant qu'on ne l'a pas ouverte. Chaque lecture est donc
    // protegee — sans quoi l'ouverture de l'onglet plantait.
    loadFinanceParams: () => {
        const budget = state.data.budget || {};
        const put = (id, val) => { const el = document.getElementById(id); if(el) el.value = val; };
        
        put('param-km-rate', budget.kmRate ?? 0.55);
        put('param-perdiem-meal', budget.perDiemMeal ?? 19);
        put('param-perdiem-hotel', budget.perDiemHotel ?? 80);
        put('param-overtime-threshold', budget.overtimeThreshold ?? 8);
        
        const rates = budget.overtimeRates || { first: 25, second: 50, third: 100 };
        put('param-overtime-1', rates.first ?? 25);
        put('param-overtime-2', rates.second ?? 50);
        put('param-overtime-3', rates.third ?? 100);
    },
    
    // Éditer le budget prévisionnel d'une catégorie CNC
    editCategoryBudget: (catId) => {
        const cat = Expenses.getCategory(catId);
        if(!cat) return;
        
        // Seul le responsable budget peut modifier
        if(!ExpensesBudget.isBudgetManager()) {
            Utils.toast('Seul le responsable budget peut modifier les prévisionnels', 'error');
            return;
        }
        
        const currency = state.data.budget?.currency || '€';
        const vatMode = state.data.budget?.vatMode || 'HT';
        const current = state.data.budget?.previsionnel?.[catId] || { budgetHT: 0, budgetTTC: 0 };
        const currentManager = state.data.budget?.deptManagers?.[catId] || {};
        
        // Liste des personnes pour le responsable
        const actors = state.data.actors || [];
        const crew = state.data.crew || [];
        const allPeople = [...actors, ...crew].filter(p => p.email);
        
        let peopleOptions = '<option value="">-- Aucun responsable --</option>';
        allPeople.forEach(p => {
            const selected = currentManager.email === p.email ? 'selected' : '';
            peopleOptions += `<option value="${Utils.escape(p.email)}" ${selected}>${Utils.escape(p.name)} (${Utils.escape(p.email)})</option>`;
        });
        
        // Sous-catégories
        let subcatHtml = '<div style="margin-top:15px; padding-top:15px; border-top:1px solid var(--border);"><label style="font-size:0.85rem; color:var(--text-sec); display:block; margin-bottom:8px;">📂 Sous-catégories</label>';
        cat.subcats.forEach(sub => {
            subcatHtml += `<div style="font-size:0.85rem; color:var(--text-main); padding:4px 0;">• ${Utils.escape(sub.name)}</div>`;
        });
        subcatHtml += '</div>';
        
        const modal = document.createElement('div');
        modal.id = 'category-budget-modal';
        modal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); display:flex; justify-content:center; align-items:center; z-index: var(--z-modal);';
        modal.onclick = (e) => { if(e.target === modal) modal.remove(); };
        
        modal.innerHTML = `
            <div style="background:var(--panel-bg); border-radius:12px; padding:25px; width:450px; max-width:90%; max-height:90vh; overflow-y:auto;">
                <h3 style="margin:0 0 20px; color:var(--text-main);">${cat.icon} ${cat.code}. ${cat.name}</h3>
                
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px; margin-bottom:20px;">
                    <div>
                        <label class="form-label-alt">💰 Budget HT (${currency})</label>
                        <input type="number" id="cat-budget-ht" value="${current.budgetHT || ''}" placeholder="0" data-tooltip="0" class="n8-input-11" oninput="document.getElementById('cat-budget-ttc').value = Math.round(this.value * 1.2 * 100) / 100">
                    </div>
                    <div>
                        <label class="form-label-alt">💰 Budget TTC (${currency})</label>
                        <input type="number" id="cat-budget-ttc" value="${current.budgetTTC || ''}" placeholder="0" data-tooltip="0" class="n8-input-11" oninput="document.getElementById('cat-budget-ht').value = Math.round(this.value / 1.2 * 100) / 100">
                    </div>
                </div>
                
                <div class="mb-15">
                    <label class="form-label-alt">👤 Responsable de la catégorie</label>
                    <select id="cat-manager" class="n8-input-12">
                        ${peopleOptions}
                    </select>
                </div>
                
                <label style="display:flex; align-items:center; gap:8px; margin-bottom:15px; font-size:0.9rem; cursor:pointer; color:var(--text-main);">
                    <input type="checkbox" id="cat-manager-email" ${currentManager.emailNotif !== false ? 'checked' : ''}>
                    📧 Notifier par email
                </label>
                
                ${subcatHtml}
                
                <div class="flex-end-mt20">
                    <button onclick="document.getElementById('category-budget-modal').remove()" class="btn btn--outline">Annuler</button>
                    <button onclick="app.ExpensesBudget.saveCategoryBudget('${catId}')" class="btn btn--success">💾 Enregistrer</button>
                </div>
            </div>
        `;
        
        // Marque la modale comme ouverte POUR CE PROJET ET CETTE CATEGORIE :
        // saveCategoryBudget relit ses quatre champs et n'a de sens que sur la
        // modale reellement affichee. Voir la garde en tete de cette fonction.
        ExpensesBudget._budgetModalFor = (state.currentProjectId || '') + '|' + catId;
        
        document.body.appendChild(modal);
        document.getElementById('cat-budget-ht').focus();
    },
    
    // Sauvegarder le budget d'une catégorie
    saveCategoryBudget: (catId) => {
        // GARDE : cette fonction relit les champs d'une modale creee a la volee
        // par editCategoryBudget. Appelee sans elle (ou apres un changement de
        // projet, ou sur une autre categorie que celle ouverte), elle plantait
        // sur un champ absent ou ecrivait le budget du projet precedent dans le
        // suivant. Pour ecrire un previsionnel depuis ailleurs : ecriture
        // ciblee sur state.data.budget.previsionnel, puis Store.save().
        if(ExpensesBudget._budgetModalFor !== (state.currentProjectId || '') + '|' + catId
           || !document.getElementById('cat-budget-ht')) {
            console.warn('[ExpensesBudget] saveCategoryBudget() ignoré : modale non ouverte pour ce projet/cette catégorie.');
            return;
        }
        
        const budgetHT = parseFloat(document.getElementById('cat-budget-ht').value) || 0;
        const budgetTTC = parseFloat(document.getElementById('cat-budget-ttc').value) || 0;
        const managerEmail = document.getElementById('cat-manager').value;
        const managerEmailNotif = document.getElementById('cat-manager-email').checked;
        
        if(!state.data.budget) state.data.budget = {};
        if(!state.data.budget.previsionnel) state.data.budget.previsionnel = {};
        if(!state.data.budget.deptManagers) state.data.budget.deptManagers = {};
        
        // Sauvegarder le prévisionnel
        state.data.budget.previsionnel[catId] = { budgetHT, budgetTTC };
        
        // Sauvegarder le responsable
        if(managerEmail) {
            state.data.budget.deptManagers[catId] = {
                email: managerEmail,
                emailNotif: managerEmailNotif,
                assignedAt: state.data.budget.deptManagers[catId]?.assignedAt || new Date().toISOString(),
                assignedBy: state.data.budget.deptManagers[catId]?.assignedBy || state.currentUser?.email
            };
        } else {
            delete state.data.budget.deptManagers[catId];
        }
        
        // Recalculer le budget total
        let totalHT = 0;
        Object.values(state.data.budget.previsionnel).forEach(p => {
            totalHT += p.budgetHT || 0;
        });
        state.data.budget.total = totalHT;
        
        Store.save();
        
        document.getElementById('category-budget-modal').remove();
        Expenses.populateCategories();
        Expenses.updateSummary();
        ExpensesBudget.loadBudget();
        Utils.toast('Budget de la catégorie mis à jour !', 'success');
    },
    
    isBudgetManager: () => {
        // Le propriétaire du projet a toujours accès
        if(state.currentRole === 'owner') return true;
        
        // Vérifier si l'utilisateur est le responsable budget
        const managerEmail = state.data.budget?.manager;
        if(!managerEmail || !state.currentUser) return false;
        
        return state.currentUser.email === managerEmail;
    },
};

const ExpensesCRUD = {
    // Stockage temporaire des pièces jointes en cours d'édition
    tempAttachments: [],
    
    // Ouvre le modal d'ajout
    openAddModal: () => {
        document.getElementById('expense-modal-title').textContent = '➕ Nouvelle Dépense';
        document.getElementById('expense-edit-id').value = '';
        document.getElementById('expense-title').value = '';
        document.getElementById('expense-amount-ht').value = '';
        document.getElementById('expense-amount-ttc').value = '';
        document.getElementById('expense-vat-rate').value = state.data.budget?.defaultVatRate || 20;
        document.getElementById('expense-category').value = '';
        document.getElementById('expense-subcategory').innerHTML = '<option value="">-- Sous-catégorie --</option>';
        document.getElementById('expense-description').value = '';
        document.getElementById('expense-status').value = 'pending';
        document.getElementById('expense-date').value = new Date().toISOString().split('T')[0];
        ExpensesCRUD.tempAttachments = [];
        ExpensesCRUD.renderAttachmentsList();
        Expenses.populatePaidBySelect();
        Expenses.populateCategories();
        Expenses.populateLinkSelect(null);
        document.getElementById('expense-paid-by').value = '';
        // Une depense qui n'existe pas encore n'a ni circuit de validation ni
        // trace : le bandeau est vide. Sans ce vidage il garderait celui de la
        // depense consultee juste avant.
        const wf = document.getElementById('expense-workflow-bar');
        if(wf) wf.innerHTML = '';
        const em = document.getElementById('expense-modal');
        em.classList.toggle('modal-stacked', !!document.querySelector('#planning-modal.active') || !!document.querySelector('#card-edit-modal.visible'));
        em.style.display = 'flex';
    },
    
    // Change de catégorie → met à jour les sous-catégories
    onCategoryChange: () => {
        const catId = document.getElementById('expense-category').value;
        const subcatSelect = document.getElementById('expense-subcategory');
        subcatSelect.innerHTML = '<option value="">-- Sous-catégorie --</option>';
        
        if(catId) {
            const cat = Expenses.getCategory(catId);
            if(cat && cat.subcats) {
                cat.subcats.forEach(sub => {
                    const opt = document.createElement('option');
                    opt.value = sub.id;
                    opt.textContent = sub.name;
                    subcatSelect.appendChild(opt);
                });
            }
        }
    },
    
    // Calcul TTC depuis HT
    calculateTTCFromHT: () => {
        const ht = parseFloat(document.getElementById('expense-amount-ht').value) || 0;
        const vatRate = parseFloat(document.getElementById('expense-vat-rate').value) || 0;
        const ttc = Expenses.calculateTTC(ht, vatRate);
        document.getElementById('expense-amount-ttc').value = ttc || '';
    },
    
    // Calcul HT depuis TTC
    calculateHTFromTTC: () => {
        const ttc = parseFloat(document.getElementById('expense-amount-ttc').value) || 0;
        const vatRate = parseFloat(document.getElementById('expense-vat-rate').value) || 0;
        const ht = Expenses.calculateHT(ttc, vatRate);
        document.getElementById('expense-amount-ht').value = ht || '';
    },
    
    // Gérer l'upload de fichier
    handleFileUpload: async (input) => {
        const file = input.files[0];
        if(!file) return;
        
        const isImage = file.type.startsWith('image/');
        let dataUrl;
        let finalSize;
        
        if(isImage) {
            // Compression automatique pour les images : 1600px max + JPEG 0.85, max 600 Ko
            // (un peu plus tolérant que les autres car justificatif comptable, qualité utile)
            dataUrl = await Utils.compressImage(file, { maxDimension: 1600, maxKb: 600 });
            if(!dataUrl) { input.value = ''; return; } // erreur ou refus → toast déjà affiché
            finalSize = Math.round(dataUrl.length * 0.75);
        } else {
            // PDF/document : pas de compression, mais garder la limite de 5 Mo
            if(file.size > 5 * 1024 * 1024) {
                Utils.toast('Fichier trop volumineux (max 5 Mo)', 'error');
                input.value = '';
                return;
            }
            dataUrl = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target.result);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
            finalSize = file.size;
        }
        
        const attachment = {
            id: 'att_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            name: file.name,
            data: dataUrl,
            type: isImage ? 'photo' : 'document',
            size: finalSize
        };
        ExpensesCRUD.tempAttachments.push(attachment);
        ExpensesCRUD.renderAttachmentsList();
        Utils.toast('Fichier ajouté', 'success');
        input.value = '';
    },
    
    // Supprimer une pièce jointe
    removeAttachment: (attId) => {
        ExpensesCRUD.tempAttachments = ExpensesCRUD.tempAttachments.filter(a => a.id !== attId);
        ExpensesCRUD.renderAttachmentsList();
    },
    
    // Afficher la liste des pièces jointes
    renderAttachmentsList: () => {
        const container = document.getElementById('expense-attachments-list');
        if(!container) return;
        
        if(ExpensesCRUD.tempAttachments.length === 0) {
            container.innerHTML = '';
            return;
        }
        
        let html = '';
        ExpensesCRUD.tempAttachments.forEach(att => {
            const isImage = att.type === 'photo' || (att.data && att.data.startsWith('data:image'));
            const src = att.data || att.url;
            
            html += `<div style="position: relative; display: inline-block;">
                ${isImage ? `<img src="${src}" alt="Pièce jointe" style="width: 80px; height: 80px; object-fit: cover; border-radius: 6px; border: 1px solid var(--border);">` : 
                `<div style="width: 80px; height: 80px; background: var(--bg); border-radius: 6px; border: 1px solid var(--border); display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: 0.7rem; color: var(--text-sec); padding: 5px; text-align: center;">
                    📄<br>${Utils.escape(att.name.substring(0, 12))}${att.name.length > 12 ? '...' : ''}
                </div>`}
                <button onclick="app.ExpensesCRUD.removeAttachment('${att.id}')" style="position: absolute; top: -5px; right: -5px; width: 20px; height: 20px; border-radius: 50%; background: var(--danger); color: white; border: none; cursor: pointer; font-size: 0.7rem; line-height: 1;">✕</button>
            </div>`;
        });
        
        container.innerHTML = html;
    },
    
    // Édite une dépense
    // ===== BANDEAU DE VALIDATION DE LA FICHE (8e, 25 aout) =====
    // Valider / Remonter / Renvoyer vivaient au pied de chaque grande fiche de
    // la liste. En passant les depenses en cartes compactes, ces trois actions
    // remontent ICI, en tete de la fiche : on se prononce apres avoir vu le
    // montant, le justificatif et le motif d'un eventuel renvoi, pas avant.
    // Les memes droits qu'avant, au mot pres : un responsable de poste peut
    // valider ou remonter ce qui est en attente, le responsable global tranche
    // aussi ce qui lui a ete remonte.
    workflowBarHtml: (exp) => {
        if(!exp) return '';
        const me = state.currentUser?.email;
        const isGlobal = state.data.budget?.manager === me || state.currentRole === 'owner';
        const isDept = Expenses.isDeptManager(exp.category || exp.department);
        const canValidate = (isGlobal && (exp.status === 'pending' || exp.status === 'escalated'))
                         || (isDept && exp.status === 'pending');
        const canEscalate = isDept && exp.status === 'pending' && !isGlobal;
        const canReturn = (isDept || isGlobal) && (exp.status === 'pending' || exp.status === 'escalated');
        const motif = (exp.status === 'returned' && exp.returnedReason)
            ? `<div style="background: rgba(245,158,11,0.1); border-left: 3px solid #f59e0b; padding: 8px 12px; margin-bottom: 10px; font-size: 0.85rem;"><strong>↩️ Renvoyé par ${Utils.escape(exp.returnedByName || 'un responsable')}</strong><br>${Utils.escape(exp.returnedReason)}</div>`
            : '';
        const trace = [];
        if(exp.createdByName || exp.createdBy) trace.push('👤 ' + Utils.escape(exp.createdByName || exp.createdBy));
        if(exp.validatedBy) trace.push('✓ Validé par ' + Utils.escape(exp.validatedByName || exp.validatedBy));
        if(exp.status === 'escalated') trace.push('⬆️ Remonté au responsable global');
        if(exp.salaryMissingRate) trace.push('⚠️ Tarif manquant');
        const traceHtml = trace.length ? `<div style="font-size: 0.78rem; color: var(--text-sec); margin-bottom: 8px;">${trace.join(' • ')}</div>` : '';
        const btns = [];
        if(canValidate) btns.push(`<button class="expense-btn-approve" onclick="app.Expenses.validateExpense('${exp.id}')">✅ Valider</button>`);
        if(canEscalate) btns.push(`<button class="expense-btn-escalate" onclick="app.Expenses.escalateExpense('${exp.id}')">⬆️ Remonter</button>`);
        if(canReturn) btns.push(`<button class="expense-btn-return" onclick="app.Expenses.openReturnModal('${exp.id}')">↩️ Renvoyer</button>`);
        if(!motif && !traceHtml && !btns.length) return '';
        return motif + traceHtml + (btns.length ? `<div class="expense-card-actions" style="margin: 0 0 12px 0;">${btns.join('')}</div>` : '');
    },

    editExpense: (id) => {
        const expense = state.data.expenses?.find(e => e.id === id);
        if(!expense) return;
        
        document.getElementById('expense-modal-title').textContent = '✏️ Modifier la Dépense';
        document.getElementById('expense-edit-id').value = id;
        document.getElementById('expense-title').value = expense.title || '';
        
        // Montants
        document.getElementById('expense-amount-ht').value = expense.amountHT || expense.amount || '';
        document.getElementById('expense-vat-rate').value = expense.vatRate || 0;
        document.getElementById('expense-amount-ttc').value = expense.amountTTC || expense.amount || '';
        
        // Catégorie
        Expenses.populateCategories();
        document.getElementById('expense-category').value = expense.category || expense.department || '';
        ExpensesCRUD.onCategoryChange();
        if(expense.subcategory) {
            document.getElementById('expense-subcategory').value = expense.subcategory;
        }
        
        document.getElementById('expense-description').value = expense.description || '';
        document.getElementById('expense-status').value = expense.status || 'pending';
        document.getElementById('expense-date').value = expense.date || '';
        
        // Pièces jointes
        ExpensesCRUD.tempAttachments = expense.attachments ? [...expense.attachments] : [];
        if(expense.photo && ExpensesCRUD.tempAttachments.length === 0) {
            ExpensesCRUD.tempAttachments = [{
                id: 'att_migrated',
                name: 'justificatif.jpg',
                url: expense.photo,
                type: 'photo'
            }];
        }
        ExpensesCRUD.renderAttachmentsList();
        
        Expenses.populatePaidBySelect();
        document.getElementById('expense-paid-by').value = expense.paidBy || '';
        Expenses.populateLinkSelect(expense.link || null);
        
        const wf = document.getElementById('expense-workflow-bar');
        if(wf) wf.innerHTML = ExpensesCRUD.workflowBarHtml(expense);
        
        // 8c : la depense s'ouvre desormais depuis une fiche, elle-meme parfois
        // posee sur la feuille de service. Le palier n'est pris que si une de ces
        // deux fenetres est effectivement a l'ecran, et RETIRE sinon : sans ce
        // retrait la classe survivrait a la premiere ouverture empilee et la
        // fenetre resterait au-dessus de tout pour le reste de la session.
        const em = document.getElementById('expense-modal');
        const fdsOpen = !!document.querySelector('#planning-modal.active');
        const ficheOpen = !!document.querySelector('#card-edit-modal.visible');
        em.classList.toggle('modal-stacked', fdsOpen || ficheOpen);
        em.style.display = 'flex';
    },
    
    // Sauvegarde une dépense
    saveExpense: () => {
        const title = document.getElementById('expense-title').value.trim();
        const amountHT = parseFloat(document.getElementById('expense-amount-ht').value) || 0;
        const category = document.getElementById('expense-category').value;
        
        if(!title || !amountHT || !category) {
            Utils.toast('Veuillez remplir les champs obligatoires (Titre, Montant HT, Catégorie)', 'warning');
            return;
        }
        
        const editId = document.getElementById('expense-edit-id').value;
        
        if(!state.data.expenses) state.data.expenses = [];
        
        const paidByValue = document.getElementById('expense-paid-by').value;
        const paidBySelect = document.getElementById('expense-paid-by');
        const paidByName = paidByValue ? paidBySelect.options[paidBySelect.selectedIndex].text : '';
        
        const vatRate = parseFloat(document.getElementById('expense-vat-rate').value) || 0;
        const amountTTC = parseFloat(document.getElementById('expense-amount-ttc').value) || Expenses.calculateTTC(amountHT, vatRate);
        
        const expenseData = {
            title: title,
            // Nouveaux champs TVA
            amountHT: amountHT,
            vatRate: vatRate,
            amountTTC: amountTTC,
            // Rétrocompatibilité
            amount: amountHT,
            // Catégories CNC
            category: category,
            subcategory: document.getElementById('expense-subcategory').value || '',
            department: category, // Alias pour rétrocompatibilité
            // Autres champs
            description: document.getElementById('expense-description').value.trim(),
            status: document.getElementById('expense-status').value,
            date: document.getElementById('expense-date').value,
            // Pièces jointes
            attachments: [...ExpensesCRUD.tempAttachments],
            photo: ExpensesCRUD.tempAttachments.length > 0 ? (ExpensesCRUD.tempAttachments[0].url || ExpensesCRUD.tempAttachments[0].data || '') : '',
            paidBy: paidByValue,
            paidByName: paidByName,
            // Lien facultatif vers UN element du film (etape 7d). null = aucun.
            link: Expenses.parseLink(document.getElementById('expense-link')?.value || ''),
            updatedAt: new Date().toISOString()
        };
        
        const currency = state.data.budget?.currency || '€';
        const amountStr = `${amountTTC.toFixed(2)} ${currency}`;
        if(editId) {
            // Modification
            const idx = state.data.expenses.findIndex(e => e.id === editId);
            if(idx > -1) {
                state.data.expenses[idx] = { ...state.data.expenses[idx], ...expenseData };
            }
            History.log('EDIT', `Modification dépense : ${title} (${amountStr})`, { target: { kind: 'expense', id: editId, label: title }, link: { kind: 'expense', id: editId } });
        } else {
            // Création
            expenseData.id = 'exp_' + Utils.generateUniqueId();
            expenseData.createdAt = new Date().toISOString();
            expenseData.createdBy = state.currentUser?.email;
            expenseData.createdByName = state.userProfile?.displayName || state.currentUser?.email?.split('@')[0];
            state.data.expenses.push(expenseData);
            History.log('ADD', `Ajout dépense : ${title} (${amountStr})`, { target: { kind: 'expense', id: expenseData.id, label: title }, link: { kind: 'expense', id: expenseData.id } });
            
            // Notifier le responsable concerné
            ExpensesCRUD.notifyExpenseUpdate(expenseData, 'new');
        }
        
        Store.save();
        document.getElementById('expense-modal').style.display = 'none';
        Expenses.render();
        Notifications.updateBadge();
        
        // Vérifier les alertes de dépassement
        ExpensesCRUD.checkBudgetAlerts(category);
    },
    
    // Vérifier les alertes de dépassement après ajout/modif
    checkBudgetAlerts: (catId) => {
        const cat = Expenses.getCategory(catId);
        if(!cat) return;
        
        const budget = state.data.budget?.previsionnel?.[catId];
        if(!budget || !budget.budgetHT) return;
        
        const vatMode = state.data.budget?.vatMode || 'HT';
        const budgetAmount = vatMode === 'HT' ? budget.budgetHT : budget.budgetTTC;
        
        const expenses = state.data.expenses || [];
        const spent = expenses
            .filter(e => (e.category === catId || e.department === catId) && (e.status === 'approved' || e.status === 'done'))
            .reduce((sum, e) => sum + (vatMode === 'HT' ? (e.amountHT || e.amount || 0) : (e.amountTTC || e.amount || 0)), 0);
        
        const percent = Math.round((spent / budgetAmount) * 100);
        const thresholds = state.data.budget?.alertThresholds || { warning: 80, danger: 100 };
        
        if(percent >= thresholds.danger) {
            Utils.toast(`🔴 Attention ! Le budget "${cat.name}" est dépassé (${percent}%)`, 'error');
        } else if(percent >= thresholds.warning) {
            Utils.toast(`⚠️ Le budget "${cat.name}" atteint ${percent}%`, 'warning');
        }
    },
    
    // Supprime une dépense
    deleteExpense: async (id) => {
        if(!await ConfirmModal.confirmDelete("Cette dépense sera supprimée.")) return;
        
        const expense = state.data.expenses?.find(e => e.id === id);
        const expenseTitle = expense?.title || 'sans titre';
        const currency = state.data.budget?.currency || '€';
        const amountStr = expense ? `${(expense.amountTTC || expense.amount || 0).toFixed(2)} ${currency}` : '?';
        
        // [Phase D] Capturer le recoverable AVANT suppression
        const expenseLogId = 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        const expenseRecoverable = expense ? await History.captureRecoverable(expense, 'expense', expenseLogId) : null;
        
        state.data.expenses = state.data.expenses.filter(e => e.id !== id);
        History.log('DELETE', `Suppression dépense : ${expenseTitle} (${amountStr})`, {
            target: { kind: 'expense', id: id, label: expenseTitle },
            recoverable: expenseRecoverable
        });
        Store.save();
        Expenses.render();
    },
    
    // Valide directement une dépense
    // ===== PASTILLE DE STATUT CLIQUABLE (8e, 25 aout) =====
    // La pastille d'angle de la carte n'etait qu'un temoin. Elle fait maintenant
    // tourner le statut sur le cycle courant d'une facture :
    //   ⏳ En attente  ->  ✅ Validé  ->  💰 Payé  ->  ⏳ En attente
    // Les trois autres etats (⬆️ remonté, ↩️ renvoyé, ❌ refusé) appartiennent au
    // circuit de validation et ne sont PAS produits ici : un clic dessus ramene
    // simplement la depense en attente, c'est-a-dire la reprend en main. Les
    // memes droits que les boutons de la fiche s'appliquent — sans cela la
    // pastille serait une porte derobee pour se valider ses propres depenses.
    cycleStatus: (id) => {
        const exp = state.data.expenses?.find(e => e.id === id);
        if(!exp) return;
        const me = state.currentUser?.email;
        const isGlobal = state.data.budget?.manager === me || state.currentRole === 'owner';
        const isDept = Expenses.isDeptManager(exp.category || exp.department);
        if(!isGlobal && !isDept) { Utils.toast('Seul un responsable de budget peut changer le statut.', 'error'); return; }
        const next = { pending: 'approved', approved: 'done', done: 'pending' };
        const target = next[exp.status] || 'pending';
        if(target === 'approved') { ExpensesCRUD.validateExpense(id); return; }
        exp.status = target;
        if(target === 'done') { exp.paidAt = new Date().toISOString(); }
        if(target === 'pending') {
            // Reprise en main : on efface la trace de validation, sinon la
            // depense afficherait « validée par » tout en etant en attente.
            delete exp.validatedAt; delete exp.validatedBy; delete exp.validatedByName;
        }
        Store.save();
        Expenses.render();
        Utils.toast(target === 'done' ? 'Dépense marquée payée' : 'Dépense remise en attente', 'success');
    },

    validateExpense: (id) => {
        const expense = state.data.expenses?.find(e => e.id === id);
        if(!expense) return;
        
        expense.status = 'approved';
        expense.validatedAt = new Date().toISOString();
        expense.validatedBy = state.currentUser?.email;
        expense.validatedByName = state.userProfile?.displayName || state.currentUser?.email?.split('@')[0];
        
        Store.save();
        Expenses.render();
        Utils.toast('Dépense validée !', 'success');
        
        // Notifier le créateur
        ExpensesCRUD.notifyExpenseUpdate(expense, 'approved');
    },
    
    // Remonte une dépense au responsable budget global
    escalateExpense: (id) => {
        const expense = state.data.expenses?.find(e => e.id === id);
        if(!expense) return;
        
        expense.status = 'escalated';
        expense.escalatedAt = new Date().toISOString();
        expense.escalatedBy = state.currentUser?.email;
        expense.escalatedByName = state.userProfile?.displayName || state.currentUser?.email?.split('@')[0];
        
        Store.save();
        Expenses.render();
        Utils.toast('Dépense remontée au responsable budget global', 'info');
        
        // Notifier le responsable budget global
        ExpensesCRUD.notifyExpenseUpdate(expense, 'escalated');
    },
    
    // Ouvre le modal de renvoi
    openReturnModal: (id) => {
        const expense = state.data.expenses?.find(e => e.id === id);
        if(!expense) return;
        
        const currency = state.data.budget?.currency || '€';
        
        const modal = document.createElement('div');
        modal.id = 'return-expense-modal';
        modal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); display:flex; justify-content:center; align-items:center; z-index: var(--z-modal);';
        modal.onclick = (e) => { if(e.target === modal) modal.remove(); };
        
        modal.innerHTML = `
            <div class="modal-panel-450">
                <h3 style="margin:0 0 20px; color:var(--text-main);">↩️ Renvoyer la dépense</h3>
                
                <div style="background: var(--bg); padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                    <div style="font-weight: bold; margin-bottom: 5px;">${Utils.escape(expense.title)}</div>
                    <div style="font-size: 1.2rem; color: var(--primary); font-weight: bold;">${parseFloat(expense.amount).toLocaleString()} ${currency}</div>
                    <div style="font-size: 0.85rem; color: var(--text-sec); margin-top: 5px;">Par : ${Utils.escape(expense.createdByName || expense.createdBy)}</div>
                </div>
                
                <label class="form-label-alt">Raison du renvoi *</label>
                <textarea id="return-reason" placeholder="Expliquez pourquoi cette dépense est renvoyée (trop chère, mauvais choix, informations manquantes...)" data-tooltip="Expliquez pourquoi cette dépense est renvoyée (trop chère, mauvais choix, informations manquantes...)" style="width:100%; padding:12px; border:1px solid var(--border); border-radius:6px; background:var(--input-bg); color:var(--text-main); min-height:100px; resize:vertical; margin-bottom:20px;"></textarea>
                
                <div class="flex-end">
                    <button onclick="document.getElementById('return-expense-modal').remove()" class="btn btn--outline">Annuler</button>
                    <button onclick="app.ExpensesCRUD.returnExpense('${id}')" style="padding:10px 20px; background:#f59e0b; color:white; border:none; border-radius:6px; cursor:pointer; font-weight:bold;">↩️ Renvoyer</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        document.getElementById('return-reason').focus();
    },
    
    // Renvoie une dépense au créateur
    returnExpense: (id) => {
        const reason = document.getElementById('return-reason').value.trim();
        if(!reason) {
            Utils.toast('Veuillez indiquer la raison du renvoi', 'warning');
            return;
        }
        
        const expense = state.data.expenses?.find(e => e.id === id);
        if(!expense) return;
        
        expense.status = 'returned';
        expense.returnedAt = new Date().toISOString();
        expense.returnedBy = state.currentUser?.email;
        expense.returnedByName = state.userProfile?.displayName || state.currentUser?.email?.split('@')[0];
        expense.returnedReason = reason;
        
        Store.save();
        document.getElementById('return-expense-modal').remove();
        Expenses.render();
        Utils.toast('Dépense renvoyée au demandeur', 'info');
        
        // Notifier le créateur
        ExpensesCRUD.notifyExpenseUpdate(expense, 'returned');
    },
    
    // Notifie les personnes concernées lors d'une mise à jour de dépense
    notifyExpenseUpdate: async (expense, action) => {
        const projectName = state.data.title || 'Projet';
        const currency = state.data.budget?.currency || '€';
        
        let recipientEmail = null;
        let recipientName = null;
        let subject = '';
        let content = '';
        
        if(action === 'approved') {
            // Notifier le créateur que sa dépense est validée
            recipientEmail = expense.createdBy;
            recipientName = expense.createdByName;
            subject = `✅ Dépense validée - ${projectName}`;
            content = `Votre dépense "${expense.title}" de ${expense.amount} ${currency} a été validée par ${expense.validatedByName || 'le responsable budget'}.`;
        } else if(action === 'returned') {
            // Notifier le créateur que sa dépense est renvoyée
            recipientEmail = expense.createdBy;
            recipientName = expense.createdByName;
            subject = `↩️ Dépense renvoyée - ${projectName}`;
            content = `Votre dépense "${expense.title}" de ${expense.amount} ${currency} a été renvoyée par ${expense.returnedByName || 'le responsable'}.\n\nRaison : ${expense.returnedReason}`;
        } else if(action === 'escalated') {
            // Notifier le responsable budget global
            recipientEmail = state.data.budget?.manager;
            const managerPerson = Expenses.findPersonByEmail(recipientEmail);
            recipientName = managerPerson?.name;
            subject = `⬆️ Dépense remontée - ${projectName}`;
            content = `Une dépense a été remontée pour validation :\n\n"${expense.title}" - ${expense.amount} ${currency}\nDemandée par : ${expense.createdByName}\nRemontée par : ${expense.escalatedByName}`;
        } else if(action === 'new') {
            // Notifier le responsable concerné (département ou global)
            const deptManager = state.data.budget?.deptManagers?.[expense.department];
            if(deptManager && expense.department !== 'divers') {
                recipientEmail = deptManager.email;
                if(!deptManager.emailNotif) recipientEmail = null; // Pas de mail si désactivé
            } else {
                recipientEmail = state.data.budget?.manager;
                if(state.data.budget?.managerEmailNotif === false) recipientEmail = null;
            }
            const recipientPerson = Expenses.findPersonByEmail(recipientEmail);
            recipientName = recipientPerson?.name;
            subject = `💰 Nouvelle dépense à valider - ${projectName}`;
            content = `Une nouvelle dépense attend votre validation :\n\n"${expense.title}" - ${expense.amount} ${currency}\nDemandée par : ${expense.createdByName}`;
        }
        
        // Envoyer la notification interne (messagerie du site)
        if(recipientEmail) {
            ExpensesCRUD.sendInternalNotification(recipientEmail, subject, content, expense.id);
        }
        
        // Envoyer l'email si activé
        // Note: L'envoi d'email dépend de la configuration Supabase
    },
    
    // Envoie une notification interne via le système de messagerie
    sendInternalNotification: (recipientEmail, subject, content, expenseId) => {
        // Utiliser le système de notifications existant ou créer un nouveau
        if(!state.data.notifications) state.data.notifications = [];
        
        state.data.notifications.push({
            id: 'notif_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
            type: 'expense',
            recipientEmail: recipientEmail,
            subject: subject,
            content: content,
            expenseId: expenseId,
            read: false,
            createdAt: new Date().toISOString(),
            createdBy: state.currentUser?.email
        });
        
        Store.save();
    },
    
    // Dupliquer une dépense
    duplicateExpense: (id) => {
        const expense = state.data.expenses?.find(e => e.id === id);
        if(!expense) return;
        
        const newExpense = {
            ...expense,
            id: 'exp_' + Utils.generateUniqueId(),
            title: expense.title + ' (copie)',
            status: 'pending',
            date: new Date().toISOString().split('T')[0],
            createdAt: new Date().toISOString(),
            createdBy: state.currentUser?.email,
            createdByName: state.userProfile?.displayName || state.currentUser?.email?.split('@')[0],
            validatedAt: null,
            validatedBy: null,
            validatedByName: null,
            validationComment: null,
            returnedReason: null,
            returnedBy: null,
            returnedByName: null,
            escalatedAt: null,
            escalatedBy: null,
            escalatedByName: null
        };
        
        // Retirer les références aux salaires si c'était une dépense auto
        delete newExpense.salaryPersonId;
        delete newExpense.salaryPersonType;
        delete newExpense.salaryMissingRate;
        
        if(!state.data.expenses) state.data.expenses = [];
        state.data.expenses.push(newExpense);
        
        Store.save();
        Expenses.render();
        // La copie garde les justificatifs ET le lien de l'originale : c'est ce qui
        // permet de ventiler UNE facture couvrant plusieurs produits en plusieurs
        // lignes sans re-televerser la photo a chaque fois. On enchaine donc
        // directement sur la modification, sinon il faudrait retrouver la carte
        // « (copie) » dans la liste pour corriger titre, montant et lien.
        setTimeout(() => {
            ExpensesCRUD.editExpense(newExpense.id);
            const t = document.getElementById('expense-title');
            if(t) { t.focus(); t.select(); }
        }, 150);
        Utils.toast('Copie créée : ajuste le titre, le montant et le lien', 'success');
    }
};

const Expenses = {
    // ===================== ÉTAT & CONFIG =====================
    expenses: [],
    filterDept: '',
    filterStatus: '',
    filterSearch: '',
    mode: 'simple', // 'simple' ou 'advanced'
    
    // ===================== CATÉGORIES CNC, TVA & MIGRATION =====================
    // Catégories CNC officielles (nomenclature devis de production)
    CNC_CATEGORIES: [
        { 
            id: 'droits', code: '1', name: 'Droits artistiques', icon: '📜',
            subcats: [
                { id: 'droits_scenario', name: 'Scénario / Adaptation' },
                { id: 'droits_musique', name: 'Droits musicaux' },
                { id: 'droits_autres', name: 'Autres droits' }
            ]
        },
        { 
            id: 'personnel', code: '2', name: 'Personnel', icon: '👥',
            subcats: [
                { id: 'personnel_realisation', name: 'Réalisation' },
                { id: 'personnel_technique', name: 'Équipe technique' },
                { id: 'personnel_production', name: 'Production' }
            ]
        },
        { 
            id: 'interpretation', code: '3', name: 'Interprétation', icon: '🎭',
            subcats: [
                { id: 'interpretation_principaux', name: 'Rôles principaux' },
                { id: 'interpretation_secondaires', name: 'Rôles secondaires' },
                { id: 'interpretation_figuration', name: 'Figuration' }
            ]
        },
        { 
            id: 'charges', code: '4', name: 'Charges sociales', icon: '📊',
            subcats: [
                { id: 'charges_artistiques', name: 'Charges artistes' },
                { id: 'charges_techniques', name: 'Charges techniciens' }
            ]
        },
        { 
            id: 'decors', code: '5', name: 'Décors & Costumes', icon: '🎨',
            subcats: [
                { id: 'decors_construction', name: 'Construction décors' },
                { id: 'decors_naturels', name: 'Décors naturels' },
                { id: 'costumes', name: 'Costumes' },
                { id: 'maquillage', name: 'Maquillage / Coiffure' }
            ]
        },
        { 
            id: 'transport', code: '6', name: 'Transports & Régie', icon: '🚗',
            subcats: [
                { id: 'transport_voyages', name: 'Voyages' },
                { id: 'transport_vehicules', name: 'Véhicules' },
                { id: 'regie_defraiements', name: 'Défraiements' },
                { id: 'regie_catering', name: 'Régie / Catering' }
            ]
        },
        { 
            id: 'moyens_tech', code: '7', name: 'Moyens techniques', icon: '🎥',
            subcats: [
                { id: 'tech_camera', name: 'Matériel caméra' },
                { id: 'tech_lumiere', name: 'Lumière' },
                { id: 'tech_son', name: 'Son' },
                { id: 'tech_machinerie', name: 'Machinerie' },
                { id: 'tech_effets', name: 'Effets spéciaux plateau' }
            ]
        },
        { 
            id: 'postprod', code: '8', name: 'Post-production', icon: '🎞️',
            subcats: [
                { id: 'postprod_montage', name: 'Montage' },
                { id: 'postprod_son', name: 'Post-prod son / Mixage' },
                { id: 'postprod_image', name: 'Étalonnage' },
                { id: 'postprod_vfx', name: 'Effets visuels' }
            ]
        },
        { 
            id: 'assurances', code: '9', name: 'Assurances & Divers', icon: '📋',
            subcats: [
                { id: 'assurances_prod', name: 'Assurances' },
                { id: 'frais_generaux', name: 'Frais généraux' },
                { id: 'imprevus', name: 'Imprévus' }
            ]
        }
    ],
    
    // 31 aout — POSTES QUI RELEVENT DU TOURNAGE. Sert au seul calcul du cout
    // moyen par jour de tournage : diviser le budget ENTIER par le nombre de
    // jours de plateau melangeait les droits d'auteur, la post-production et
    // les assurances a une moyenne censee dire ce que coute UNE journee de
    // tournage. Sont donc ecartes les postes 1 (droits artistiques),
    // 8 (post-production) et 9 (assurances et divers) — les seuls qui ne
    // dependent pas du nombre de jours passes sur le plateau.
    SHOOT_CATEGORIES: ['personnel', 'interpretation', 'charges', 'decors', 'transport', 'moyens_tech'],
    
    // Mapping anciennes catégories → nouvelles CNC
    MIGRATION_MAP: {
        'production': 'personnel',
        'technique': 'moyens_tech',
        'artistique': 'decors',
        'logistique': 'transport',
        'salaires': 'personnel', // Les salaires acteurs seront remappés vers 'interpretation'
        'divers': 'assurances',
        // Anciens départements détaillés
        'image': 'moyens_tech',
        'lumiere': 'moyens_tech',
        'son': 'moyens_tech',
        'realisation': 'personnel',
        'decoration': 'decors',
        'costumes': 'decors',
        'maquillage': 'decors',
        'regie': 'transport',
        'transport': 'transport',
        'catering': 'transport',
        'postprod': 'postprod',
        'location': 'decors',
        'assurance': 'assurances'
    },
    
    // Taux de TVA courants
    // v593 : VAT_RATES retiré (liste de taux de TVA jamais lue ailleurs).
    
    // Migration des données existantes vers le nouveau format
    migrateData: () => {
        let migrated = false;
        
        // Migrer le budget
        if(!state.data.budget) state.data.budget = {};
        if(!state.data.budget.vatMode) {
            state.data.budget.vatMode = 'HT';
            state.data.budget.defaultVatRate = 20;
            migrated = true;
        }
        if(!state.data.budget.previsionnel) {
            state.data.budget.previsionnel = {};
            // Migrer les anciennes enveloppes vers le prévisionnel
            if(state.data.budget.envelopes) {
                Object.entries(state.data.budget.envelopes).forEach(([oldCat, amount]) => {
                    const newCat = Expenses.MIGRATION_MAP[oldCat] || 'assurances';
                    if(!state.data.budget.previsionnel[newCat]) {
                        state.data.budget.previsionnel[newCat] = { budgetHT: 0, budgetTTC: 0 };
                    }
                    state.data.budget.previsionnel[newCat].budgetHT += amount;
                    state.data.budget.previsionnel[newCat].budgetTTC += amount * 1.2;
                });
                migrated = true;
            }
        }
        if(!state.data.budget.alertThresholds) {
            state.data.budget.alertThresholds = { warning: 80, danger: 100 };
        }
        
        // Migrer les dépenses
        (state.data.expenses || []).forEach(exp => {
            // Migrer la catégorie
            if(exp.department && !exp.category) {
                // Cas spécial : salaires acteurs → interprétation
                if(exp.department === 'salaires' && exp.salaryPersonType === 'actor') {
                    exp.category = 'interpretation';
                    exp.subcategory = 'interpretation_principaux';
                } else if(exp.department === 'salaires' && exp.salaryPersonType === 'crew') {
                    exp.category = 'personnel';
                    exp.subcategory = 'personnel_technique';
                } else {
                    exp.category = Expenses.MIGRATION_MAP[exp.department] || 'assurances';
                }
                migrated = true;
            }
            
            // Migrer les montants HT/TTC
            if(exp.amount !== undefined && exp.amountHT === undefined) {
                exp.amountHT = exp.amount;
                exp.vatRate = 0; // Par défaut, pas de TVA sur les anciennes
                exp.amountTTC = exp.amount;
                migrated = true;
            }
            
            // Migrer photo vers attachments
            if(exp.photo && (!exp.attachments || exp.attachments.length === 0)) {
                exp.attachments = [{
                    id: 'att_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                    name: 'justificatif.jpg',
                    url: exp.photo,
                    type: 'photo'
                }];
                migrated = true;
            }
        });
        
        if(migrated) {
            // Migration budget/dépenses effectuée
            Store.save();
        }
        
        return migrated;
    },
    
    // ===================== HELPERS (catégorie, calculs TVA) =====================
    // Obtenir une catégorie par ID
    getCategory: (catId) => {
        return Expenses.CNC_CATEGORIES.find(c => c.id === catId);
    },
    
    // Calculer le montant TTC à partir du HT
    calculateTTC: (amountHT, vatRate) => {
        return Math.round(amountHT * (1 + vatRate / 100) * 100) / 100;
    },
    
    // Calculer le montant HT à partir du TTC
    calculateHT: (amountTTC, vatRate) => {
        return Math.round(amountTTC / (1 + vatRate / 100) * 100) / 100;
    },
    
    // ===================== INIT, MODE & RENDU =====================
    // Initialise le module
    init: () => {
        if(!state.data.expenses) state.data.expenses = [];
        if(!state.data.budget) state.data.budget = { total: 0, currency: '€', manager: '', envelopes: {}, deptManagers: {}, previsionnel: {}, vatMode: 'HT', defaultVatRate: 20 };
        if(!state.data.budget.envelopes) state.data.budget.envelopes = {};
        if(!state.data.budget.deptManagers) state.data.budget.deptManagers = {};
        if(!state.data.budget.previsionnel) state.data.budget.previsionnel = {};
        
        // Migration des anciennes données
        Expenses.migrateData();
        
        Expenses.expenses = state.data.expenses;
        
        // Le mode de budget appartient au PROJET (state.data.budget.mode) et non au
        // navigateur : deux collaborateurs doivent voir le meme budget, et un petit
        // projet ne doit pas heriter du mode choisi sur un gros. L'ancienne cle
        // localStorage n'est plus lue (elle ne portait meme pas l'id du projet).
        // Valeur absente = choix jamais fait : on demande a l'ouverture (askMode).
        const savedMode = state.data.budget?.mode;
        Expenses.mode = (savedMode === 'advanced' || savedMode === 'simple') ? savedMode : 'simple';
        
        Expenses.populateCategories();
        Expenses.populateManager();
        Expenses.loadBudget();
        Expenses.loadFinanceParams();
        Expenses.loadManagerEmailPref();
        Expenses.renderCategoryManagers();
        Expenses.applyMode();
        Expenses.render();
        Expenses.askModeIfNeeded();
    },
    
    // Premiere arrivee sur l'onglet d'un projet dont le mode n'a jamais ete choisi :
    // on pose la question une fois. Silencieux pour qui ne peut pas ecrire (un
    // lecteur n'a pas a trancher un reglage du projet, et sa reponse ne serait pas
    // enregistree).
    askModeIfNeeded: () => {
        const already = state.data.budget?.mode;
        if(already === 'simple' || already === 'advanced') return;
        if(typeof Permissions !== 'undefined' && Permissions.tabWritable && !Permissions.tabWritable('expenses')) return;
        setTimeout(() => Expenses.openModeChooser(true), 300);
    },
    
    // Changer de mode Simple/Avancé
    setMode: (mode) => {
        Expenses.mode = mode;
        if(!state.data.budget) state.data.budget = {};
        state.data.budget.mode = mode;
        Store.save();
        Expenses.applyMode();
        Expenses.render();
    },
    
    // ===== DEUX VUES DE L'ONGLET (8e, 25 aout) =====
    // « Dépenses » porte le budget, les filtres, le tri et les fiches ;
    // « Coût par jour » ne porte que la lecture par journée de tournage. Le
    // reglage n'appartient pas au projet mais au moment de travail : il n'est
    // donc pas persiste, chaque arrivee sur l'onglet repart des depenses.
    _view: 'list',
    setView: (v) => {
        Expenses._view = (v === 'days') ? 'days' : 'list';
        Expenses.applyView();
    },
    applyView: () => {
        const isDays = Expenses._view === 'days';
        const bl = document.getElementById('exp-viewbtn-list');
        const bd = document.getElementById('exp-viewbtn-days');
        if(bl) bl.classList.toggle('fds-tabbtn-active', !isDays);
        if(bd) bd.classList.toggle('fds-tabbtn-active', isDays);
        const pl = document.getElementById('expenses-pane-list');
        const pd = document.getElementById('expenses-pane-days');
        if(pl) pl.style.display = isDays ? 'none' : 'block';
        if(pd) pd.style.display = isDays ? 'block' : 'none';
    },
    
    // Fenetre de generation des salaires. Une depense de salaire est une depense
    // COMME UNE AUTRE (decision de Guillaume) : elle vit dans la meme grille que
    // les autres, se trie et se filtre comme elles. Ce qui restait a lui donner,
    // c'est un endroit pour la FABRIQUER a partir du planning et des tarifs —
    // d'ou cette fenetre, qui est un outil et non une seconde liste.
    openSalariesModal: () => {
        const old = document.getElementById('salaries-modal');
        if(old) old.remove();
        const wrap = document.createElement('div');
        wrap.id = 'salaries-modal';
        wrap.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.55); z-index:var(--z-modal); display:block; overflow-y:auto; padding:40px 16px;';
        wrap.onclick = (e) => { if(e.target === wrap) wrap.remove(); };
        const box = document.createElement('div');
        box.style.cssText = 'display:block; box-sizing:border-box; width:100%; max-width:900px; margin:0 auto; background:var(--panel-bg); color:var(--text-main); border-radius:12px; padding:20px; box-shadow:0 10px 40px rgba(0,0,0,0.4);';
        box.innerHTML = '<div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; margin-bottom:12px;">'
            + '<div><h3 style="margin:0 0 4px 0;">💼 Salaires</h3>'
            + '<div style="font-size:0.85rem; color:var(--text-sec);">Une fiche par personne convoquée, calculée depuis le planning et son tarif. Le rond ↻ génère ou recalcule sa dépense, qui rejoint ensuite la liste des dépenses.</div></div>'
            + '<div style="display:flex; gap:8px; flex-shrink:0;">'
            + '<button onclick="app.Expenses.checkMissingInfo()" style="padding:8px 14px; background:var(--warning, #FF9800); color:#fff; border:none; border-radius:6px; cursor:pointer; font-weight:500; font-size:0.85rem;">🔍 Vérifier infos</button>'
            + '<button onclick="document.getElementById(\'salaries-modal\').remove()" style="padding:8px 14px; border:1px solid var(--border); border-radius:6px; background:var(--bg); color:var(--text-main); cursor:pointer; font-weight:600;">Fermer</button>'
            + '</div></div>'
            + '<div id="expenses-salaries-list"></div>'
            + '<div style="text-align:right; margin-top:10px; font-weight:bold;">Total estimé : <span id="expenses-salaries-total">0 €</span></div>';
        wrap.appendChild(box);
        document.body.appendChild(wrap);
        ExpensesSalaries.renderSalaries();
    },
    
    // Depenses rattachees a une cible donnee. Aucune deduction, aucun partage :
    // seules comptent les depenses qui pointent EXPLICITEMENT vers cette cible.
    linkedExpenses: (kind, id) => {
        if(!kind || !id) return [];
        return (state.data.expenses || []).filter(e => e && e.link && e.link.k === kind && e.link.id === id);
    },
    // Total des depenses rattachees, dans le mode TVA du projet (HT ou TTC),
    // le meme que celui de l'onglet Depenses : deux ecrans qui annonceraient
    // deux totaux differents pour la meme fiche seraient pires que pas de total.
    linkedTotal: (kind, id) => {
        const ttc = (state.data.budget?.vatMode || 'HT') === 'TTC';
        return Expenses.linkedExpenses(kind, id).reduce((sum, e) => {
            const v = ttc ? (e.amountTTC != null ? e.amountTTC : e.amount)
                          : (e.amountHT  != null ? e.amountHT  : e.amount);
            return sum + (parseFloat(v) || 0);
        }, 0);
    },
    
    // ===== D'UNE SCENE VERS SON JOUR (25 aout) =====
    // Premier jour DATE ou cette scene est programmee, ou chaine vide si elle
    // ne l'est pas encore. « Premier » et non « tous » : une scene etalee sur
    // deux jours ferait sinon apparaitre la meme depense sur les deux, et le
    // total du projet compterait deux fois le meme achat — exactement ce que la
    // regle « une cible, jamais de division » interdit depuis juillet.
    firstDayOfScene: (sceneId) => {
        if(!sceneId) return '';
        const hits = (state.data.shootingDays || []).filter(d => {
            if(!d || !(d.date || d.startDate)) return false;
            return (d.scenes || []).some(sc => (typeof sc === 'string' ? sc : (sc && sc.sceneId)) === sceneId);
        });
        if(!hits.length) return '';
        hits.sort((a, b) => String(a.date || a.startDate).localeCompare(String(b.date || b.startDate)));
        return hits[0].id;
    },
    // Nombre de jours DATES sur lesquels une scene est programmee. Sert a
    // prevenir sur la fiche quand une depense n'est comptee que sur le premier.
    dayCountOfScene: (sceneId) => {
        if(!sceneId) return 0;
        return (state.data.shootingDays || []).filter(d => {
            if(!d || !(d.date || d.startDate)) return false;
            return (d.scenes || []).some(sc => (typeof sc === 'string' ? sc : (sc && sc.sceneId)) === sceneId);
        }).length;
    },
    // Tout ce qui pese sur un jour : ce qui le vise directement, plus les
    // depenses de ses scenes. Une depense de scene non encore programmee ne pese
    // sur aucun jour — elle attend sa date, et reste lisible sur sa fiche.
    dayExpenses: (dayId) => {
        if(!dayId) return [];
        const direct = Expenses.linkedExpenses('day', dayId);
        const viaScene = (state.data.expenses || []).filter(e =>
            e && e.link && e.link.k === 'scene' && Expenses.firstDayOfScene(e.link.id) === dayId);
        return direct.concat(viaScene);
    },
    dayTotal: (dayId) => {
        const ttc = (state.data.budget?.vatMode || 'HT') === 'TTC';
        return Expenses.dayExpenses(dayId).reduce((sum, e) => {
            const v = ttc ? (e.amountTTC != null ? e.amountTTC : e.amount)
                          : (e.amountHT  != null ? e.amountHT  : e.amount);
            return sum + (parseFloat(v) || 0);
        }, 0);
    },
    
    // ===================== LIEN VERS UN ELEMENT DU FILM (etape 7d) =====================
    // Une depense porte au plus UN lien : { k: type, id: identifiant }. Les types
    // de fiche sont ceux de UI.FICHE_TAB (v572), plus 'day' pour un jour de
    // tournage — les repas, l'essence ou la location d'un camion ne visent aucune
    // fiche mais bien une date.
    // REGLE FERME : on ne divise JAMAIS un montant. Une valise a 40 euros presente
    // dans douze scenes reste une valise a 40 euros. Tout ecran de synthese compte
    // chaque depense une fois, sur sa cible, et rien d'autre.
    linkValue: (link) => (link && link.k && link.id) ? (link.k + '|' + link.id) : '',
    parseLink: (value) => {
        if(!value || value.indexOf('|') < 0) return null;
        const parts = value.split('|');
        return (parts[0] && parts[1]) ? { k: parts[0], id: parts[1] } : null;
    },
    // Libelle affichable d'un lien, ou chaine vide si la cible n'existe plus
    // (fiche supprimee depuis : on ne veut ni planter ni afficher un identifiant).
    // 8a : le nom et l'icone d'une cible sont rendus par le socle. Ces deux
    // fonctions etaient la SEULE table de correspondance famille -> nom du
    // fichier ; la laisser ici obligeait tout autre ecran a la recopier.
    linkLabel: (link) => (link && link.k && link.id) ? Links.label(link.k, link.id) : '',
    linkIcon: (link) => (link && link.k) ? Links.icon(link.k) : '🔗',
    // Remplit le menu deroulant. Groupe par famille pour rester lisible meme sur
    // un projet charge. Une fiche sans identifiant n'est jamais proposee : on
    // ecrirait un lien vide (piege corrige en v572).
    populateLinkSelect: (link) => {
        const sel = document.getElementById('expense-link');
        if(!sel) return;
        sel.innerHTML = '<option value="">-- Rien de particulier --</option>';
        
        const addGroup = (label, items, kind) => {
            const list = (items || []).filter(x => x && x.id && x.name);
            if(list.length === 0) return;
            const g = document.createElement('optgroup');
            g.label = label;
            list.forEach(x => {
                const o = document.createElement('option');
                o.value = kind + '|' + x.id;
                o.textContent = x.name;
                g.appendChild(o);
            });
            sel.appendChild(g);
        };
        
        const res = state.data.resources || [];
        addGroup('🎭 Accessoires', res.filter(r => r.category === 'accessoire'), 'resource');
        addGroup('👔 Costumes',    res.filter(r => r.category === 'costume'),    'resource');
        addGroup('🚗 Véhicules',   res.filter(r => r.category === 'vehicule'),   'resource');
        addGroup('📍 Décors / Lieux', state.data.locations, 'location');
        addGroup('👤 Personnages',    state.data.characters, 'character');
        addGroup('🎭 Comédiens',      state.data.actors, 'actor');
        addGroup('🎬 Équipe',         state.data.crew, 'crew');
        
        // 🏛️ STRUCTURES ET 🚐 VEHICULES (25 aout). La structure est le
        // PRESTATAIRE — l'hotel, le loueur, l'association coproductrice : c'est
        // elle qui emet la facture, et rien ne permettait de l'y rattacher. Le
        // vehicule de production porte carburant, peages et location.
        // Le nom d'une structure vit dans sa fiche normalisee (Orgs._fiche) et
        // pas toujours dans o.name : on passe par la meme lecture que le reste
        // du module, sans quoi la moitie des structures s'afficheraient vides et
        // seraient donc ecartees par le filtre de addGroup.
        const orgs = (state.data.orgs || []).map(o => {
            const fc = (typeof Orgs !== 'undefined' && Orgs._fiche) ? Orgs._fiche(o) : (o.fiche || o);
            return { id: o.id, name: (fc && fc.name) || o.name || '' };
        });
        addGroup('🏛️ Structures', orgs, 'org');
        addGroup('🚐 Véhicules de production', state.data.vehicles, 'vehicle');
        
        // 🎞️ SCENES (25 aout). Une depense de scene remonte au JOUR ou cette
        // scene se tourne (voir Expenses.firstDayOfScene) : c'est la facon
        // naturelle de saisir « la casse du vase de la scene 12 » sans avoir a
        // savoir quel jour elle est programmee — ni a corriger la depense si le
        // planning bouge.
        const scenes = (state.data.scenes || []).map((s, i) => ({
            id: s.id,
            name: '#' + (i + 1) + (s.title ? ' — ' + String(s.title).slice(0, 50) : '')
        }));
        addGroup('🎞️ Scènes', scenes, 'scene');
        
        const days = (state.data.shootingDays || []).map((d, i) => {
            if(!d) return { id: null, name: '' };
            // Le champ porte le nom 'date' (et non startDate) : voir Planning.
            const dt = d.date || d.startDate || '';
            return {
                id: d.id,
                name: Planning.dayLabel(d) + (dt ? ' — ' + dt : '')
            };
        });
        addGroup('📅 Jours de tournage', days, 'day');
        
        const value = Expenses.linkValue(link);
        // Cible disparue : on la signale au lieu de vider le champ en silence,
        // sinon une simple reouverture de la fiche effacerait le lien.
        if(value && !sel.querySelector('option[value="' + value + '"]')) {
            const o = document.createElement('option');
            o.value = value;
            o.textContent = '⚠️ Élément supprimé depuis';
            sel.appendChild(o);
        }
        sel.value = value;
        Expenses.onLinkChange();
    },
    onLinkChange: () => {
        const sel = document.getElementById('expense-link');
        const btn = document.getElementById('expense-link-open');
        if(!btn) return;
        const link = Expenses.parseLink(sel ? sel.value : '');
        // 8b : le jour de tournage a desormais une porte (sa feuille de service),
        // le bouton n'a donc plus a l'exclure. Il reste eteint pour une cible
        // supprimee depuis, dont linkLabel renvoie une chaine vide.
        btn.style.display = (link && Expenses.linkLabel(link)) ? 'inline-block' : 'none';
        btn.title = (link && link.k === 'day') ? 'Ouvrir la feuille de service de ce jour' : 'Ouvrir la fiche liée';
    },
    openLinkedFiche: () => {
        const sel = document.getElementById('expense-link');
        const link = Expenses.parseLink(sel ? sel.value : '');
        if(!link) return;
        if(typeof UI !== 'undefined' && UI.openFiche) UI.openFiche(link.k, link.id);
    },
    
    // Fenetre de choix du mode de budget. firstTime = question posee a l'arrivee
    // sur un projet qui n'a jamais choisi ; sinon c'est un changement volontaire.
    // PIEGE CONNU (v572) : dans une fenetre construite a la volee, ne dependre ni
    // de classes ni de flex -- les proprietes d'affichage sont posees directement
    // sur chaque element, une regle globale ne peut alors pas les contredire.
    openModeChooser: (firstTime) => {
        const old = document.getElementById('expenses-mode-modal');
        if(old) old.remove();
        const current = Expenses.mode === 'advanced' ? 'advanced' : 'simple';
        const chosen = state.data.budget?.mode;
        
        const wrap = document.createElement('div');
        wrap.id = 'expenses-mode-modal';
        wrap.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.55); z-index:10000; display:block; overflow-y:auto; padding:40px 16px;';
        
        const box = document.createElement('div');
        box.style.cssText = 'display:block; box-sizing:border-box; width:100%; max-width:560px; margin:0 auto; background:var(--panel-bg); color:var(--text-main); border-radius:12px; padding:24px; box-shadow:0 10px 40px rgba(0,0,0,0.4);';
        
        const h = document.createElement('h3');
        h.style.cssText = 'display:block; margin:0 0 8px 0; font-size:1.15rem;';
        h.textContent = firstTime ? 'Comment suivre le budget de ce projet ?' : 'Mode de budget du projet';
        box.appendChild(h);
        
        const intro = document.createElement('p');
        intro.style.cssText = 'display:block; margin:0 0 18px 0; font-size:0.9rem; line-height:1.5; color:var(--text-sec);';
        intro.textContent = firstTime
            ? 'Ce reglage appartient au projet : tous les collaborateurs verront la meme chose. Il reste modifiable a tout moment.'
            : 'Changer de mode ne convertit et n\'efface rien : les depenses sont les memes dans les deux vues. Le mode Simple masque les enveloppes, les responsables et les salaires, il ne les supprime pas -- revenir au Detaille les retrouve.';
        box.appendChild(intro);
        
        const mk = (mode, titre, texte) => {
            const b = document.createElement('div');
            const active = (mode === current && chosen);
            b.style.cssText = 'display:block; box-sizing:border-box; width:100%; text-align:left; margin:0 0 12px 0; padding:14px 16px; border:2px solid ' + (active ? 'var(--primary)' : 'var(--border)') + '; border-radius:10px; cursor:pointer; background:var(--bg);';
            const t = document.createElement('div');
            t.style.cssText = 'display:block; font-weight:700; font-size:0.98rem; margin:0 0 4px 0;';
            t.textContent = titre + (active ? '   (mode actuel)' : '');
            const d = document.createElement('div');
            d.style.cssText = 'display:block; font-size:0.85rem; line-height:1.45; color:var(--text-sec);';
            d.textContent = texte;
            b.appendChild(t);
            b.appendChild(d);
            b.onclick = () => {
                wrap.remove();
                Expenses.setMode(mode);
                Utils.toast(mode === 'simple' ? 'Budget en mode Simple' : 'Budget en mode Detaille', 'success');
            };
            return b;
        };
        
        box.appendChild(mk('simple', '📋 Simple',
            'Un budget global et une liste de depenses a payer / payees. Pour un court-metrage, un projet etudiant ou associatif.'));
        box.appendChild(mk('advanced', '⚙️ Detaille',
            'En plus : enveloppes prevues par poste CNC, responsable par poste, TVA, salaires et synthese. Pour une production qui doit justifier ses comptes.'));
        
        const foot = document.createElement('div');
        foot.style.cssText = 'display:block; text-align:right; margin-top:6px;';
        const cancel = document.createElement('button');
        cancel.style.cssText = 'padding:8px 18px; border:1px solid var(--border); border-radius:6px; cursor:pointer; background:var(--bg); color:var(--text-main); font-weight:600;';
        cancel.textContent = firstTime ? 'Plus tard' : 'Annuler';
        cancel.onclick = () => wrap.remove();
        foot.appendChild(cancel);
        box.appendChild(foot);
        
        wrap.appendChild(box);
        wrap.onclick = (e) => { if(e.target === wrap) wrap.remove(); };
        document.body.appendChild(wrap);
    },
    
    // Appliquer le mode visuel
    applyMode: () => {
        const isSimple = Expenses.mode === 'simple';
        
        // Bouton unique de mode (libelle seulement : le choix se fait dans la fenetre)
        const btnMode = document.getElementById('expenses-mode-btn');
        if(btnMode) btnMode.textContent = isSimple ? '⚙️ Mode : Simple' : '⚙️ Mode : Détaillé';
        
        // Sidebar (avancé uniquement)
        const sidebar = document.getElementById('expenses-sidebar-advanced');
        if(sidebar) sidebar.style.display = isSimple ? 'none' : 'block';
        
        // Header simple
        const simpleHeader = document.getElementById('expenses-simple-header');
        if(simpleHeader) simpleHeader.style.display = isSimple ? 'block' : 'none';
        
        // Summary avancé
        const advancedSummary = document.getElementById('expenses-summary-advanced');
        if(advancedSummary) advancedSummary.style.display = isSimple ? 'none' : 'flex';
        
        // Filtres
        const advancedFilters = document.getElementById('expenses-filters-advanced');
        const simpleFilters = document.getElementById('expenses-filters-simple');
        if(advancedFilters) advancedFilters.style.display = isSimple ? 'none' : 'flex';
        if(simpleFilters) simpleFilters.style.display = isSimple ? 'block' : 'none';
        
        // Ajuster la grille container
        const container = document.querySelector('.expenses-container');
        if(container) {
            container.style.gridTemplateColumns = isSimple ? '1fr' : '280px 1fr';
        }
        
        // Synchroniser le budget simple
        const budgetSimple = document.getElementById('expenses-budget-simple');
        if(budgetSimple) {
            budgetSimple.value = state.data.budget?.total || '';
        }
    },
    
    saveBudgetSimple: () => {
        const value = parseFloat(document.getElementById('expenses-budget-simple')?.value) || 0;
        if(!state.data.budget) state.data.budget = {};
        state.data.budget.total = value;
        
        // Synchroniser avec le champ avancé
        const advancedInput = document.getElementById('expenses-budget-total');
        if(advancedInput) advancedInput.value = value;
        
        Store.save();
        Expenses.updateSummary();
    },
    
    // Remplit les selects avec les catégories CNC
    populateCategories: () => {
        const categories = Expenses.CNC_CATEGORIES;
        
        // Remplir les selects de catégorie
        const selects = ['expense-category', 'expenses-filter-dept'];
        selects.forEach(id => {
            const select = document.getElementById(id);
            if(!select) return;
            
            const firstOption = select.querySelector('option');
            select.innerHTML = '';
            if(firstOption) select.appendChild(firstOption);
            
            categories.forEach(cat => {
                const opt = document.createElement('option');
                opt.value = cat.id;
                opt.textContent = `${cat.icon} ${cat.code}. ${cat.name}`;
                select.appendChild(opt);
            });
        });
        
        // Liste des catégories CNC dans la sidebar
        const catList = document.getElementById('expenses-dept-list');
        if(catList) {
            catList.innerHTML = '';
            const currency = state.data.budget?.currency || '€';
            const expenses = state.data.expenses || [];
            const previsionnel = state.data.budget?.previsionnel || {};
            const vatMode = state.data.budget?.vatMode || 'HT';
            const thresholds = state.data.budget?.alertThresholds || { warning: 80, danger: 100 };
            
            categories.forEach(cat => {
                const budget = previsionnel[cat.id]?.[vatMode === 'HT' ? 'budgetHT' : 'budgetTTC'] || 0;
                const catManager = state.data.budget?.deptManagers?.[cat.id];
                
                // Trouver le nom du responsable
                let managerName = '';
                if(catManager?.email) {
                    const person = Expenses.findPersonByEmail(catManager.email);
                    managerName = person?.name || catManager.email.split('@')[0];
                }
                
                // Calculer les dépenses pour cette catégorie
                const catExpenses = expenses.filter(e => e.category === cat.id || e.department === cat.id);
                const spent = catExpenses
                    .filter(e => e.status === 'approved' || e.status === 'done')
                    .reduce((sum, e) => sum + (vatMode === 'HT' ? (e.amountHT || e.amount || 0) : (e.amountTTC || e.amount || 0)), 0);
                
                const countPending = catExpenses.filter(e => e.status === 'pending').length;
                const countApproved = catExpenses.filter(e => e.status === 'approved' || e.status === 'done').length;
                const countMissingRate = catExpenses.filter(e => e.salaryMissingRate).length;
                
                // Calculer le pourcentage et l'état d'alerte
                const percent = budget > 0 ? Math.round((spent / budget) * 100) : 0;
                const alertState = percent >= thresholds.danger ? 'danger' : percent >= thresholds.warning ? 'warning' : 'ok';
                
                // Badges
                let badges = '';
                if(countMissingRate > 0) badges += `<span class="dept-badge red" title="Tarif manquant">${countMissingRate}</span>`;
                if(countPending > 0) badges += `<span class="dept-badge yellow" title="En attente">${countPending}</span>`;
                if(alertState === 'danger') badges += `<span class="dept-badge red" title="Budget dépassé !">🔴</span>`;
                else if(alertState === 'warning') badges += `<span class="dept-badge orange" title="Attention budget">⚠️</span>`;
                
                // Barre de progression
                const progressColor = alertState === 'danger' ? 'var(--danger)' : alertState === 'warning' ? '#f59e0b' : 'var(--success)';
                const progressBar = budget > 0 ? `
                    <div style="height:4px; background:var(--border); border-radius:2px; margin-top:4px; overflow:hidden;">
                        <div style="height:100%; width:${Math.min(percent, 100)}%; background:${progressColor}; transition:width 0.3s;"></div>
                    </div>
                ` : '';
                
                const div = document.createElement('div');
                div.className = 'expense-dept-item' + (Expenses.filterDept === cat.id ? ' active' : '');
                div.innerHTML = `
                    <div class="flex-1">
                        <div style="display:flex; align-items:center; gap:6px;">
                            <span class="dept-name">${cat.icon} ${cat.code}. ${cat.name}</span>
                            <div class="dept-badges">${badges}</div>
                        </div>
                        ${budget > 0 ? `
                            <div style="font-size:0.7rem; color:var(--text-sec);">
                                Prévu: ${budget.toLocaleString()} ${currency} ${vatMode}
                                ${percent > 0 ? `<span style="color:${progressColor}; font-weight:600;">(${percent}%)</span>` : ''}
                            </div>
                            ${progressBar}
                        ` : ''}
                        ${managerName ? `<div style="font-size:0.7rem; color:var(--primary); margin-top:2px;">👤 ${Utils.escape(managerName)}</div>` : ''}
                    </div>
                    <div style="text-align:right;">
                        <span class="dept-amount" id="cat-total-${cat.id}" style="color:${alertState === 'danger' ? 'var(--danger)' : 'var(--text-main)'}">${spent.toLocaleString()} ${currency}</span>
                        <button onclick="event.stopPropagation(); app.Expenses.editCategoryBudget('${cat.id}')" style="background:none; border:none; cursor:pointer; font-size:0.8rem; padding:2px 5px; margin-left:5px;" title="Paramètres de la catégorie">⚙️</button>
                    </div>
                `;
                div.onclick = (e) => {
                    if(e.target.tagName === 'BUTTON') return;
                    Expenses.filterDept = Expenses.filterDept === cat.id ? '' : cat.id;
                    const filterSelect = document.getElementById('expenses-filter-dept');
                    if(filterSelect) filterSelect.value = Expenses.filterDept;
                    Expenses.applyFilters();
                    Expenses.populateCategories();
                };
                catList.appendChild(div);
            });
        }
    },
    
    // Alias pour rétrocompatibilité
    populateDepartments: () => {
        Expenses.populateCategories();
    },
    
    // Remplit le select du responsable budget
    populateManager: () => {
        const select = document.getElementById('expenses-manager');
        if(!select) return;
        
        select.innerHTML = '<option value="">-- Choisir --</option>';
        
        // Ajouter les membres de l'équipe
        if(state.data.crew) {
            state.data.crew.forEach(member => {
                if(member.email) {
                    const opt = document.createElement('option');
                    opt.value = member.email;
                    opt.textContent = member.name + ' (' + (member.role || 'Équipe') + ')';
                    select.appendChild(opt);
                }
            });
        }
        
        // Sélectionner le manager actuel
        if(state.data.budget?.manager) {
            select.value = state.data.budget.manager;
        }
    },
    
    // Budget, TVA, managers & paramètres financiers — délégué à ExpensesBudget
    loadBudget: (...a) => ExpensesBudget.loadBudget(...a),
    saveBudget: (...a) => ExpensesBudget.saveBudget(...a),
    setVatMode: (...a) => ExpensesBudget.setVatMode(...a),
    saveDefaultVat: (...a) => ExpensesBudget.saveDefaultVat(...a),
    saveAlertThresholds: (...a) => ExpensesBudget.saveAlertThresholds(...a),
    saveManager: (...a) => ExpensesBudget.saveManager(...a),
    saveManagerEmailPref: (...a) => ExpensesBudget.saveManagerEmailPref(...a),
    loadManagerEmailPref: (...a) => ExpensesBudget.loadManagerEmailPref(...a),
    renderCategoryManagers: (...a) => ExpensesBudget.renderCategoryManagers(...a),
    findPersonByEmail: (...a) => ExpensesBudget.findPersonByEmail(...a),
    isDeptManager: (...a) => ExpensesBudget.isDeptManager(...a),
    saveFinanceParams: (...a) => ExpensesBudget.saveFinanceParams(...a),
    loadFinanceParams: (...a) => ExpensesBudget.loadFinanceParams(...a),
    editCategoryBudget: (...a) => ExpensesBudget.editCategoryBudget(...a),
    isBudgetManager: (...a) => ExpensesBudget.isBudgetManager(...a),
    openBudgetSettings: (...a) => ExpensesBudget.openSettings(...a),
    // Rendu principal
    render: () => {
        Expenses.updateSummary();
        Expenses.updateDeptTotals();
        Expenses.populateDepartments();
        Expenses.renderExpensesList();
        // renderSalaries ne fait rien si la fenetre des salaires n'est pas
        // ouverte (son conteneur n'existe pas), mais elle doit etre rejouee
        // quand elle l'est : generer un salaire redessine la liste dessous.
        Expenses.renderSalaries();
        Expenses.renderCostPerDay();
        Expenses.applyView();
    },
    
    // Recapitulatif par jour de tournage. Ne remonte QUE les depenses portant un
    // lien 'day' : repas, essence, location a la journee. Les elements depouilles
    // ce jour-la (une chemise, un vehicule) ne sont volontairement PAS reventiles
    // ici : ils appartiennent a leur fiche, et les compter par jour reviendrait a
    // additionner plusieurs fois le meme achat.
    // Section entierement masquee si aucune depense n'est rattachee a un jour :
    // un tableau vide n'apprend rien et occupe l'ecran.
    renderCostPerDay: () => {
        const list = document.getElementById('expenses-per-day-list');
        if(!list) return;
        
        const cur = state.data.budget?.currency || '€';
        const mode = state.data.budget?.vatMode || 'HT';
        const fmt = (n) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + cur;
        const days = state.data.shootingDays || [];
        
        // TOUS les jours de tournage ont leur fiche, y compris ceux qui n'ont
        // encore rien coute : un jour a zero euro est une information (rien n'a
        // ete rattache), pas une ligne a cacher. Les jours sans depense sont
        // simplement repousses en fin de grille.
        // UN JOUR SANS DATE N'EST PAS UN JOUR (decision du 25 aout). Il
        // n'apparaît dans aucun agenda, aucune feuille ne lui est attachee : lui
        // fabriquer une fiche de cout revenait a donner corps a un fantome. Les
        // jours orphelins des anciens projets sont donc simplement absents d'ici.
        // Ils restent atteignables et supprimables depuis l'onglet Planning.
        const rows = days.map((d, i) => {
            if(!d || !d.id) return null;
            const iso = d.date || d.startDate || '';
            if(!iso) return null;
            const linked = Expenses.dayExpenses(d.id);
            // TITRE = LA DATE, seul repere qui ne mente pas.
            // Deux titres ont ete essayes et ecartes le 25 aout :
            //  - le nom du jour : fabrique a partir des scenes quand il n'est pas
            //    saisi (« Sc.1 »), il fait croire a une fiche de scene et surtout
            //    il n'indique aucun rang — la scene 1 peut se tourner au 4e jour ;
            //  - « Jour N » (dayNumber) : ce compteur vaut « nombre de jours
            //    existants + 1 » a la creation, c'est donc un ordre de SAISIE.
            //    Creer le 20 fevrier avant le 1er donne Jour 1 = 20 fevrier.
            // On n'invente pas non plus un rang chronologique recalcule ici : il
            // divergerait de celui qu'affichent la feuille de service et les
            // exports, et deux ecrans annoncant deux numeros pour le meme jour
            // seraient pires que pas de numero du tout. (Le calcul de dayNumber
            // est un chantier a part, note dans le plan.)
            const type = (typeof Planning !== 'undefined' && Planning.dayTypes) ? Planning.dayTypes[d.dayType || 'tournage'] : null;
            const dt = new Date(iso + 'T12:00:00');
            const human = isNaN(dt.getTime()) ? iso : dt.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
            return {
                id: d.id,
                label: human,
                sub: d.name || '',
                icon: (type && type.icon) || '📅',
                typeLabel: (type && type.label) || 'Tournage',
                date: iso,
                count: linked.length,
                total: Expenses.dayTotal(d.id)
            };
        }).filter(Boolean);
        
        if(!rows.length) {
            list.innerHTML = '<div class="ccol-empty" style="padding:40px 20px;">Aucun jour daté sur ce projet. Un coût par jour suppose une journée posée dans l\u2019agenda : place tes jours de tournage dans l\u2019onglet Planning, ils apparaîtront ici.</div>';
            return;
        }
        
        const sort = Expenses._daySort || 'date';
        const byDate = (a, b) => String(a.date || '').localeCompare(String(b.date || '')) || a.label.localeCompare(b.label, 'fr');
        let sorted = rows.slice();
        if(sort === 'cout') sorted.sort((a, b) => (b.total - a.total) || byDate(a, b));
        // « A → Z » trie sur le NOM du jour (« Sc.1 », « Cabinet d'avocat »), pas
        // sur son titre : celui-ci est desormais une date, deja couverte par le
        // classement « Par date ».
        else if(sort === 'alpha') sorted.sort((a, b) => String(a.sub || a.label).localeCompare(String(b.sub || b.label), 'fr'));
        else if(sort === 'type') sorted.sort((a, b) => String(a.typeLabel).localeCompare(String(b.typeLabel), 'fr') || byDate(a, b));
        else sorted.sort((a, b) => (b.count > 0) - (a.count > 0) || byDate(a, b));
        
        const grand = rows.reduce((s, r) => s + r.total, 0);
        const nb = rows.filter(r => r.count).length;
        const toolbar = '<div class="chub-toolbar"><span class="chub-toolbar-label">Classer :</span>'
            + '<button class="chub-sort-btn ' + (sort === 'date' ? 'active' : '') + '" onclick="app.Expenses.setDaySort(\'date\')">Par date</button>'
            + '<button class="chub-sort-btn ' + (sort === 'cout' ? 'active' : '') + '" onclick="app.Expenses.setDaySort(\'cout\')">Par coût</button>'
            + '<button class="chub-sort-btn ' + (sort === 'alpha' ? 'active' : '') + '" onclick="app.Expenses.setDaySort(\'alpha\')">A → Z</button>'
            + '<button class="chub-sort-btn ' + (sort === 'type' ? 'active' : '') + '" onclick="app.Expenses.setDaySort(\'type\')">Par type de journée</button>'
            + '<span class="chub-toolbar-label" style="margin-left:auto;">' + nb + ' jour' + (nb > 1 ? 's' : '') + ' avec dépense • Total ' + fmt(grand) + ' ' + mode + '</span></div>';
        
        const cardOf = (r) => {
            const vide = r.count === 0;
            // Sous la ligne du montant : le type de journee puis le nom du jour.
            // Le nom redevient ce qu'il est — ce qu'on y tourne — au lieu de tenir
            // lieu de reperage dans le temps.
            const meta = [r.typeLabel, r.sub].filter(Boolean).join(' · ');
            return '<div class="compact-card" style="' + (vide ? 'opacity:0.6;' : '') + '" onclick="app.UI.openFiche(\'day\', \'' + Utils.escape(String(r.id)) + '\')" title="' + r.typeLabel + ' — ouvrir la feuille de service">'
                + '<div class="compact-card-badge" title="Nombre de dépenses rattachées">' + r.count + '</div>'
                + '<div class="compact-card-photo">' + r.icon + '</div>'
                + '<div class="compact-card-name">' + Utils.escape(r.label) + '</div>'
                + '<div class="compact-card-role" style="font-weight:700; color:' + (vide ? 'var(--text-sec)' : 'var(--primary)') + ';">' + fmt(r.total) + '</div>'
                + '<div class="compact-card-role" style="font-size:0.72rem; opacity:0.75;">' + Utils.escape(meta) + '</div>'
                + '</div>';
        };
        const cards = sorted.map(cardOf).join('');
        
        // « Par type de journée » regroupe : un repérage, un essai costume et un
        // jour de plateau ne se comparent pas, les melanger dans une grille
        // continue oblige a lire chaque icone une par une.
        if(sort === 'type') {
            const secs = [];
            sorted.forEach((r, i) => {
                const html = cardOf(r);
                const last = secs[secs.length - 1];
                if(last && last.label === r.typeLabel) last.items.push(html);
                else secs.push({ label: r.typeLabel, items: [html] });
            });
            list.innerHTML = toolbar + secs.map(s => '<div class="group-section"><div class="group-header">' + Utils.escape(s.label)
                + '<span class="ccol-group-count">' + s.items.length + '</span></div>'
                + '<div class="compact-cards-grid">' + s.items.join('') + '</div></div>').join('');
            return;
        }
        
        list.innerHTML = toolbar + '<div class="compact-cards-grid">' + cards + '</div>';
    },
    _daySort: 'date',
    setDaySort: (mode) => { Expenses._daySort = mode; Expenses.renderCostPerDay(); },
    
    // Met à jour les totaux
    updateSummary: () => {
        const currency = state.data.budget?.currency || '€';
        const vatMode = state.data.budget?.vatMode || 'HT';
        const previsionnel = state.data.budget?.previsionnel || {};
        
        // BUDGET TOTAL = ce que la production A, c'est-a-dire le montant SAISI.
        // Les enveloppes par poste n'en sont que la REPARTITION : les additionner
        // pour en faire le budget revenait a dire qu'une production qui n'a rien
        // reparti n'a pas de budget, et faisait tomber un total de 5000 saisi en
        // mode Simple a 300 des qu'une seule enveloppe etait posee en Detaille.
        // Repli sur la somme des enveloppes UNIQUEMENT si aucun total n'a jamais
        // ete saisi : sans cela les projets anterieurs perdraient leur budget.
        let allocated = 0;
        Object.values(previsionnel).forEach(p => {
            allocated += vatMode === 'HT' ? (p.budgetHT || 0) : (p.budgetTTC || 0);
        });
        let budgetTotal = state.data.budget?.total || 0;
        if(budgetTotal === 0) budgetTotal = allocated;
        
        // Calculer le total dépensé (selon mode HT/TTC)
        // On distingue le VALIDE (approuve ou paye) de l'EN ATTENTE : une depense
        // demandee mais pas encore validee est deja engagee dans les faits, et ne
        // la montrer nulle part laissait croire a un restant plus confortable
        // qu'il ne l'est. Elle n'entre pas dans le total, elle est annoncee a cote.
        let totalSpent = 0;
        let totalPending = 0;
        // shootSpent : la part du depense qui releve du plateau (voir
        // Expenses.SHOOT_CATEGORIES). Sert uniquement au cout moyen par jour.
        let shootSpent = 0;
        state.data.expenses?.forEach(exp => {
            const amount = vatMode === 'HT'
                ? (parseFloat(exp.amountHT) || parseFloat(exp.amount) || 0)
                : (parseFloat(exp.amountTTC) || parseFloat(exp.amount) || 0);
            if(exp.status === 'approved' || exp.status === 'done') {
                totalSpent += amount;
                if(Expenses.SHOOT_CATEGORIES.includes(exp.category)) shootSpent += amount;
            } else if(exp.status === 'pending' || exp.status === 'escalated') {
                totalPending += amount;
            }
        });
        
        // Ajouter les salaires estimes (mode detaille uniquement), en EXCLUANT
        // ceux qui ont deja ete generes en depense validee : ils sont alors deja
        // dans totalSpent ci-dessus, les recompter gonflerait le poste du double.
        if(Expenses.mode === 'advanced') {
            const salariesTotal = Expenses.calculateSalariesTotal(true);
            totalSpent += salariesTotal;
        }
        
        const remaining = budgetTotal - totalSpent;
        const percentUsed = budgetTotal > 0 ? Math.round((totalSpent / budgetTotal) * 100) : 0;
        
        // Mode avancé
        const budgetEl = document.getElementById('expenses-total-budget');
        const spentEl = document.getElementById('expenses-total-spent');
        const remainingEl = document.getElementById('expenses-total-remaining');
        
        if(budgetEl) budgetEl.textContent = budgetTotal.toLocaleString() + ' ' + currency + ' ' + vatMode;
        if(spentEl) spentEl.innerHTML = totalSpent.toLocaleString() + ' ' + currency + ` <span style="font-size:0.75rem; opacity:0.8;">(${percentUsed}%)</span>`;
        if(remainingEl) remainingEl.textContent = remaining.toLocaleString() + ' ' + currency;
        
        // Notes d'engagement : ce qui est demande mais pas encore valide.
        const fmtCur = (n) => n.toLocaleString('fr-FR') + ' ' + currency;
        const pendingNote = document.getElementById('expenses-pending-note');
        const remainingNote = document.getElementById('expenses-remaining-note');
        if(pendingNote) pendingNote.textContent = totalPending > 0 ? ('+ ' + fmtCur(totalPending) + ' en attente') : '';
        if(remainingNote) remainingNote.textContent = totalPending > 0 ? (fmtCur(remaining - totalPending) + ' une fois tout validé') : '';
        
        // Cout moyen / jour de tournage = depenses VALIDEES des postes de plateau
        // divisees par le nombre de jours. Les salaires ESTIMES du mode Detaille
        // n'y entrent pas : ce sont des previsions, pas des depenses constatees,
        // et les melanger ferait bouger la moyenne sans qu'un euro soit sorti.
        const nbShootDays = (state.data.shootingDays || []).length;
        const cpdEl = document.getElementById('expenses-cost-per-day');
        if(cpdEl) cpdEl.innerHTML = nbShootDays > 0
            ? Math.round(shootSpent / nbShootDays).toLocaleString() + ' ' + currency + ` <span style="font-size:0.75rem; opacity:0.7;">/ jour · ${nbShootDays} j</span>`
            : '—';
        
        // Changer la couleur si dépassement (mode avancé)
        const remainingCard = remainingEl?.parentElement;
        if(remainingCard) {
            if(remaining < 0) {
                remainingCard.classList.remove('success');
                remainingCard.classList.add('danger');
            } else {
                remainingCard.classList.remove('danger');
                remainingCard.classList.add('success');
            }
        }
        
        // Mode simple
        const spentSimple = document.getElementById('expenses-spent-simple');
        const remainingSimple = document.getElementById('expenses-remaining-simple');
        const remainingSimpleCard = document.getElementById('expenses-remaining-simple-card');
        
        if(spentSimple) spentSimple.textContent = totalSpent.toLocaleString() + ' ' + currency;
        if(remainingSimple) remainingSimple.textContent = remaining.toLocaleString() + ' ' + currency;
        if(remainingSimpleCard) {
            remainingSimpleCard.style.background = remaining < 0 ? 'var(--danger)' : 'var(--success)';
        }
        
        // Meme information qu'en mode Detaille : ce qui reste a payer compte, meme
        // sur un petit projet. Le vocabulaire suit celui du mode Simple, ou le
        // filtre parle de « a payer » et non de validation.
        const pendingNoteSimple = document.getElementById('expenses-pending-note-simple');
        const remainingNoteSimple = document.getElementById('expenses-remaining-note-simple');
        if(pendingNoteSimple) pendingNoteSimple.textContent = totalPending > 0 ? ('+ ' + fmtCur(totalPending) + ' à payer') : '';
        if(remainingNoteSimple) remainingNoteSimple.textContent = totalPending > 0 ? (fmtCur(remaining - totalPending) + ' une fois tout payé') : '';
        
        // Mettre à jour le champ budget total
        const budgetInput = document.getElementById('expenses-budget-total');
        if(budgetInput) budgetInput.value = budgetTotal || '';
        
        // Indicateur de repartition (mode Detaille) : combien des enveloppes sont
        // posees, et ce qu'il reste a repartir. Muet tant qu'aucune enveloppe
        // n'existe : une production qui ne repartit pas n'a pas a etre sermonnee.
        const hint = document.getElementById('expenses-envelopes-hint');
        if(hint) {
            if(allocated <= 0) {
                hint.textContent = '';
            } else {
                const left = budgetTotal - allocated;
                const f = (n) => n.toLocaleString('fr-FR') + ' ' + currency;
                if(left < 0) {
                    hint.innerHTML = `<span style="color: var(--danger); font-weight: 600;">⚠️ ${f(allocated)} répartis pour un budget de ${f(budgetTotal)} : ${f(-left)} de trop.</span>`;
                } else {
                    hint.textContent = `${f(allocated)} répartis sur ${f(budgetTotal)} — reste ${f(left)} à répartir.`;
                }
            }
        }
    },
    
    // Met à jour les totaux par catégorie (maintenant géré par populateCategories)
    updateDeptTotals: () => {
        // Cette fonction est maintenant gérée par populateCategories()
        // On la garde pour rétrocompatibilité mais elle appelle simplement populateCategories
        Expenses.populateCategories();
    },
    
    // Applique les filtres
    applyFilters: () => {
        // Mode simple ou avancé
        if(Expenses.mode === 'simple') {
            const statusFilter = document.getElementById('expenses-filter-status-simple')?.value || '';
            const searchFilter = document.getElementById('expenses-filter-search-simple')?.value?.toLowerCase() || '';
            
            // Convertir les statuts simples
            if(statusFilter === 'paid') {
                Expenses.filterStatus = 'done';
            } else if(statusFilter === 'unpaid') {
                Expenses.filterStatus = 'pending';
            } else {
                Expenses.filterStatus = '';
            }
            
            Expenses.filterDept = '';
            Expenses.filterSearch = searchFilter;
        } else {
            Expenses.filterDept = document.getElementById('expenses-filter-dept')?.value || '';
            Expenses.filterStatus = document.getElementById('expenses-filter-status')?.value || '';
            Expenses.filterSearch = document.getElementById('expenses-filter-search')?.value?.toLowerCase() || '';
        }
        
        Expenses.renderExpensesList();
        Expenses.populateDepartments();
    },
    
    // updateSalariesVisibility retiree le 25 aout : la section salaires n'existe
    // plus dans la page. Les depenses de salaire sont des depenses comme les
    // autres et se filtrent comme elles ; la generation vit dans sa fenetre.
    
    // ===================== RAPPELS & INFOS MANQUANTES =====================
    // Vérifier les informations manquantes pour les contrats/salaires
    checkMissingInfo: () => {
        const actors = state.data.actors || [];
        const crew = state.data.crew || [];
        const missing = [];
        
        // Vérifier les acteurs
        actors.forEach(actor => {
            if(!actor.name) return;
            const issues = [];
            
            if(!actor.email) issues.push('Email');
            if(!actor.address) issues.push('Adresse');
            if(!(actor.salaryGross || actor.dailyRate)) issues.push('Salaire brut');
            
            if(actor.professionalStatus === 'intermittent') {
                if(!actor.numSecu) issues.push('N° Sécurité Sociale');
                if(!actor.numCongesSpectacles) issues.push('N° Congés Spectacles');
            } else if(actor.professionalStatus === 'micro-entrepreneur') {
                if(!actor.siret) issues.push('N° SIRET');
            } else if(!actor.professionalStatus) {
                issues.push('Statut professionnel');
            }
            
            if(issues.length > 0) {
                missing.push({ type: 'actor', person: actor, issues: issues });
            }
        });
        
        // Vérifier les techniciens
        crew.forEach(member => {
            if(!member.name) return;
            const issues = [];
            
            if(!member.email) issues.push('Email');
            if(!member.address) issues.push('Adresse');
            if(!(member.salaryGross || member.dailyRate)) issues.push('Salaire brut');
            
            if(member.professionalStatus === 'intermittent') {
                if(!member.numSecu) issues.push('N° Sécurité Sociale');
                if(!member.numCongesSpectacles) issues.push('N° Congés Spectacles');
            } else if(member.professionalStatus === 'micro-entrepreneur') {
                if(!member.siret) issues.push('N° SIRET');
            } else if(!member.professionalStatus) {
                issues.push('Statut professionnel');
            }
            
            if(issues.length > 0) {
                missing.push({ type: 'crew', person: member, issues: issues });
            }
        });
        
        Expenses.showMissingInfoModal(missing);
    },
    
    // Afficher la modale des infos manquantes
    showMissingInfoModal: (missing) => {
        const modal = document.createElement('div');
        modal.id = 'missing-info-modal';
        modal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); display:flex; justify-content:center; align-items:center; z-index: var(--z-modal);';
        modal.onclick = (e) => { if(e.target === modal) modal.remove(); };
        
        let content = '';
        
        if(missing.length === 0) {
            content = `
                <div style="text-align:center; padding:40px;">
                    <div style="font-size:4rem; margin-bottom:20px;">✅</div>
                    <h3 style="margin:0 0 10px; color:var(--success);">Tout est complet !</h3>
                    <p class="text-sec">Toutes les fiches ont les informations nécessaires.</p>
                </div>
            `;
        } else {
            content = `
                <div class="mb-20">
                    <div style="background:#FF9800; color:white; padding:15px; border-radius:8px; margin-bottom:15px;">
                        <strong>⚠️ ${missing.length} fiche${missing.length > 1 ? 's' : ''} avec des informations manquantes</strong>
                    </div>
                    <div style="max-height:400px; overflow-y:auto;">
                        ${missing.map(m => `
                            <div style="background:var(--bg); border-radius:8px; padding:15px; margin-bottom:10px; border-left:4px solid #FF9800;">
                                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                                    <strong>${m.type === 'actor' ? '🎭' : '🎬'} ${Utils.escape(m.person.name)}</strong>
                                    ${m.person.email ? `<button onclick="app.Expenses.sendReminderEmail('${m.type}', '${m.person.id}')" style="padding:6px 12px; background:var(--primary); color:white; border:none; border-radius:6px; cursor:pointer; font-size:0.85rem;">📧 Envoyer rappel</button>` : ''}
                                </div>
                                <div style="display:flex; flex-wrap:wrap; gap:6px;">
                                    ${m.issues.map(issue => `<span style="background:var(--danger); color:white; padding:3px 8px; border-radius:4px; font-size:0.8rem;">❌ ${issue}</span>`).join('')}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
                <div class="flex-end">
                    <button onclick="app.Expenses.sendAllReminderEmails()" class="btn btn--primary">📧 Envoyer rappel à tous</button>
                </div>
            `;
        }
        
        modal.innerHTML = `
            <div style="background:var(--panel-bg); border-radius:12px; padding:25px; width:600px; max-width:90%; max-height:80vh; overflow:hidden;">
                <div class="section-header-20">
                    <h3 class="m-0">🔍 Vérification des informations</h3>
                    <button onclick="document.getElementById('missing-info-modal').remove()" class="icon-btn">✕</button>
                </div>
                ${content}
            </div>
        `;
        
        document.body.appendChild(modal);
    },
    
    // Envoyer un email de rappel
    sendReminderEmail: async (type, personId) => {
        const list = type === 'actor' ? state.data.actors : state.data.crew;
        const person = list?.find(p => p.id === personId);
        
        if(!person || !person.email) {
            Utils.toast('Aucun email disponible', 'error');
            return;
        }
        
        const issues = [];
        if(!person.address) issues.push('ton adresse');
        if(!(person.salaryGross || person.dailyRate)) issues.push('ton salaire brut');
        if(!person.professionalStatus) issues.push('ton statut professionnel');
        if(person.professionalStatus === 'intermittent') {
            if(!person.numSecu) issues.push('ton numéro de Sécurité Sociale');
            if(!person.numCongesSpectacles) issues.push('ton numéro Congés Spectacles');
        }
        if(person.professionalStatus === 'micro-entrepreneur' && !person.siret) {
            issues.push('ton numéro SIRET');
        }
        
        const projectTitle = state.data.title || 'Sans titre';
        
        try {
await supabase.functions.invoke('super-action', { body: {
                to: person.email,
                toName: person.name,
                type: 'generic',
                data: {
                    subject: `🎬 ${projectTitle} - Informations manquantes sur ton profil`,
                    title: 'Informations manquantes sur ton profil',
                    message: `Salut ${Utils.escape(person.name)} ! 👋\n\nLe projet "${projectTitle}" a besoin de quelques informations pour compléter ta fiche et préparer les contrats/salaires.\n\nIl manque : ${issues.join(', ')}\n\nPeux-tu mettre à jour ton profil sur moteur.studio quand tu as 2 minutes ?\n\nMerci ! 🎬`
                }
            } });
            
            Utils.toast(`📧 Email envoyé à ${person.name}`, 'success');
        } catch(e) {
            console.error('Erreur envoi email:', e);
            Utils.toast('Erreur lors de l\'envoi', 'error');
        }
    },
    
    // Envoyer rappel à tous
    sendAllReminderEmails: async () => {
        const actors = state.data.actors || [];
        const crew = state.data.crew || [];
        let sent = 0;
        
        const check = async (person, type) => {
            if(!person.email) return;
            let hasMissing = !person.address || !(person.salaryGross || person.dailyRate) || !person.professionalStatus;
            if(person.professionalStatus === 'intermittent' && (!person.numSecu || !person.numCongesSpectacles)) hasMissing = true;
            if(person.professionalStatus === 'micro-entrepreneur' && !person.siret) hasMissing = true;
            
            if(hasMissing) {
                await Expenses.sendReminderEmail(type, person.id);
                sent++;
            }
        };
        
        for(const actor of actors) { await check(actor, 'actor'); }
        for(const member of crew) { await check(member, 'crew'); }
        
        Utils.toast(sent > 0 ? `📧 ${sent} email${sent > 1 ? 's' : ''} envoyé${sent > 1 ? 's' : ''}` : 'Aucun email à envoyer', sent > 0 ? 'success' : 'info');
        document.getElementById('missing-info-modal')?.remove();
    },
    
    // Remplit le select "Payé par" avec les membres du projet
    populatePaidBySelect: () => {
        const select = document.getElementById('expense-paid-by');
        if(!select) return;
        
        select.innerHTML = '<option value="">-- Production / Non remboursable --</option>';
        
        // Ajouter les comédiens
        (state.data.actors || []).forEach(actor => {
            if(actor.name) {
                const opt = document.createElement('option');
                opt.value = 'actor_' + actor.id;
                opt.textContent = '🎭 ' + actor.name;
                select.appendChild(opt);
            }
        });
        
        // Ajouter les techniciens
        (state.data.crew || []).forEach(member => {
            if(member.name) {
                const opt = document.createElement('option');
                opt.value = 'crew_' + member.id;
                opt.textContent = '🎬 ' + member.name;
                select.appendChild(opt);
            }
        });
    },
    
    // Affiche la liste des dépenses
    renderExpensesList: () => {
        const container = document.getElementById('expenses-list');
        if(!container) return;
        
        let expenses = [...(state.data.expenses || [])];
        
        // Appliquer les filtres (supporte category OU department pour rétrocompatibilité)
        if(Expenses.filterDept) {
            expenses = expenses.filter(e => e.category === Expenses.filterDept || e.department === Expenses.filterDept);
        }
        if(Expenses.filterStatus) {
            expenses = expenses.filter(e => e.status === Expenses.filterStatus);
        }
        if(Expenses.filterSearch) {
            expenses = expenses.filter(e => 
                e.title?.toLowerCase().includes(Expenses.filterSearch) ||
                e.description?.toLowerCase().includes(Expenses.filterSearch)
            );
        }
        
        // currency et vatMode remontent ici : le tri par montant en a besoin, et
        // une const declaree plus bas serait lue avant son initialisation.
        const currency = state.data.budget?.currency || '€';
        const vatMode = state.data.budget?.vatMode || 'HT';
        
        // CLASSEMENTS (8e, 25 aout). Le seul ordre possible etait « le plus
        // recemment saisi en premier », pratique pour retrouver ce qu'on vient
        // d'ecrire, inutilisable pour verifier un poste ou reperer les gros
        // montants. Le tri ne remplace pas les filtres au-dessus : il ordonne
        // ce qu'ils ont laisse passer.
        const sortMode = Expenses._sort || 'recent';
        const amountOf = (e) => parseFloat((vatMode === 'HT' ? (e.amountHT != null ? e.amountHT : e.amount) : (e.amountTTC != null ? e.amountTTC : e.amount))) || 0;
        const byTitle = (a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'fr');
        if(sortMode === 'alpha') expenses.sort(byTitle);
        else if(sortMode === 'montant') expenses.sort((a, b) => (amountOf(b) - amountOf(a)) || byTitle(a, b));
        else if(sortMode === 'categorie') {
            // Ordre du plan comptable CNC (le code), et non l'ordre alphabetique
            // de l'identifiant interne : « 2. Personnel » doit venir avant
            // « 10. Transport », ce que le tri texte ne fait pas.
            const codeOf = (e) => {
                const c = Expenses.getCategory(e.category || e.department);
                return c ? (parseFloat(c.code) || 999) : 999;
            };
            expenses.sort((a, b) => (codeOf(a) - codeOf(b)) || byTitle(a, b));
        }
        else if(sortMode === 'statut') {
            const order = ['pending', 'escalated', 'returned', 'approved', 'done', 'rejected'];
            expenses.sort((a, b) => (order.indexOf(a.status) - order.indexOf(b.status)) || byTitle(a, b));
        }
        else expenses.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        if(expenses.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">💰</div>
                    <div class="empty-state-title">Aucune dépense</div>
                    <div class="empty-state-desc">Suivez le budget de votre production en enregistrant les dépenses. Chaque dépense peut être validée par un responsable.</div>
                    <button class="empty-state-btn" onclick="app.Expenses.openAddModal()">+ Ajouter une dépense</button>
                    <div class="empty-state-tips">💡 <strong>Astuce :</strong> Définissez le budget prévisionnel par catégorie CNC.</div>
                </div>
            `;
            return;
        }
        
        const currentUserEmail = state.currentUser?.email;
        const isGlobalManager = state.data.budget?.manager === currentUserEmail || state.currentRole === 'owner';
        
        // Chaque carte est collectee avec la SECTION a laquelle elle appartient,
        // pour que les tris qui regroupent (categorie, statut) puissent poser un
        // titre et un filet entre les paquets. Les tris qui ordonnent sans
        // regrouper (A-Z, montant, recentes) ignorent simplement cette section.
        const cards = [];
        expenses.forEach(exp => {
            const statusLabels = {
                pending: '⏳ En attente',
                approved: '✅ Validé',
                rejected: '❌ Refusé',
                done: '💰 Payé',
                escalated: '⬆️ Remonté',
                returned: '↩️ Renvoyé'
            };
            
            // Obtenir le label de la catégorie CNC, sous-catégorie comprise :
            // sur une carte compacte il n'y a qu'une ligne pour les deux.
            const cat = Expenses.getCategory(exp.category || exp.department);
            let catLabel = cat ? `${cat.icon} ${cat.code}. ${cat.name}` : (exp.category || exp.department || 'Non classé');
            if(exp.subcategory && cat) {
                const subcat = cat.subcats?.find(s => s.id === exp.subcategory);
                if(subcat) catLabel += ' › ' + subcat.name;
            }
            
            const date = exp.date ? new Date(exp.date).toLocaleDateString('fr-FR') : '';
            const isDeptManager = Expenses.isDeptManager(exp.category || exp.department);
            const isCreator = exp.createdBy === currentUserEmail;
            
            // Droits : la carte ne porte plus que Dupliquer / Modifier /
            // Supprimer. Valider, Remonter et Renvoyer sont calcules dans la
            // fiche (Expenses.workflowBarHtml), au moment de se prononcer.
            const canEdit = isCreator || isGlobalManager;
            const canDelete = isCreator || isGlobalManager || isDeptManager;
            
            // Montants HT/TTC
            const amountHT = exp.amountHT || exp.amount || 0;
            const amountTTC = exp.amountTTC || exp.amount || 0;
            const displayAmount = vatMode === 'HT' ? amountHT : amountTTC;
            
            const attachments = exp.attachments || [];
            
            // Etiquette du lien vers un element du film. Muette si le lien
            // n'existe pas, ou si sa cible a ete supprimee depuis : mieux vaut
            // ne rien montrer qu'un renvoi qui n'ouvre rien. Le clic ouvre la
            // cible sans ouvrir la depense (d'ou le stopPropagation).
            let lien = '';
            const lbl = Expenses.linkLabel(exp.link);
            if(lbl) {
                lien = `<span onclick="event.stopPropagation(); app.UI.openFiche('${exp.link.k}', '${exp.link.id}')" title="Ouvrir : ${Utils.escape(lbl)}" style="cursor:pointer; text-decoration:underline dotted; text-underline-offset:2px;">${Expenses.linkIcon(exp.link)} ${Utils.escape(lbl)}</span>`;
            }
            
            // ===== CARTE COMPACTE (8e, 25 aout) =====
            // Les fiches de depense s'etiraient sur toute la largeur, une par
            // ligne : sur un projet de trente depenses on faisait defiler un
            // rouleau au lieu de balayer une grille. Meme format que Comediens /
            // Techniciens / Ressources / Contrats. Ce qui detaille la depense
            // (description, justificatifs, motif de renvoi, historique de
            // validation) vit maintenant dans SA FICHE, qu'un clic ouvre.
            // Le circuit de validation N'EST PAS PERDU : Valider / Remonter /
            // Renvoyer sont rejoues en tete de la fiche, la ou l'on voit enfin
            // le detail sur lequel on se prononce.
            const stEmoji = { pending: '⏳', approved: '✅', rejected: '❌', done: '💰', escalated: '⬆️', returned: '↩️' };
            const att0 = (attachments && attachments.length) ? (attachments[0].data || attachments[0].url) : (exp.photo || '');
            const isImg = att0 && (String(att0).startsWith('data:image') || /\.(png|jpe?g|webp|gif)(\?|$)/i.test(String(att0)));
            const photo = isImg
                ? `<img src="${att0}" alt="Justificatif" onerror="this.style.display='none'">`
                : (cat && cat.icon ? cat.icon : '💶');
            // Un liesere rappelle les deux etats qui demandent une action, sans
            // quoi ils se perdraient dans la grille.
            const edge = exp.status === 'returned' ? 'border-left:3px solid #f59e0b;'
                       : (exp.salaryMissingRate ? 'border-left:3px solid var(--danger);' : '');
            const actions = `<div class="compact-card-actions">
                        <button class="merge-btn" title="Dupliquer" onclick="event.stopPropagation(); app.Expenses.duplicateExpense('${exp.id}')">📋</button>
                        ${canEdit ? `<button class="edit-btn" title="Modifier" onclick="event.stopPropagation(); app.Expenses.editExpense('${exp.id}')">✏️</button>` : ''}
                        ${canDelete ? `<button class="delete-btn" title="Supprimer" onclick="event.stopPropagation(); app.Expenses.deleteExpense('${exp.id}')">🗑️</button>` : ''}
                    </div>`;
            const secLabel = sortMode === 'statut'
                ? (statusLabels[exp.status] || exp.status)
                : (cat ? (cat.icon + ' ' + cat.code + '. ' + cat.name) : 'Non classé');
            cards.push({ sec: secLabel, html: `
                <div class="compact-card" style="${edge}" onclick="app.Expenses.editExpense('${exp.id}')" title="${Utils.escape(exp.title || '')}">
                    ${actions}
                    <div class="compact-card-badge" onclick="event.stopPropagation(); app.Expenses.cycleStatus('${exp.id}')" title="${statusLabels[exp.status] || exp.status} — cliquer pour changer" style="cursor:pointer;">${stEmoji[exp.status] || '•'}</div>
                    <div class="compact-card-photo">${photo}</div>
                    <div class="compact-card-name">${Utils.escape(exp.title)}</div>
                    <div class="compact-card-role" style="font-weight:700; color:var(--primary);">${parseFloat(displayAmount).toLocaleString()} ${currency} ${vatMode}</div>
                    <div class="compact-card-role" style="font-size:0.72rem;">${Utils.escape(catLabel)}${date ? ' • ' + date : ''}</div>
                    ${lien ? `<div class="compact-card-role" style="font-size:0.72rem;">${lien}</div>` : ''}
                </div>
            ` });
        });
        
        const toolbar = '<div class="chub-toolbar"><span class="chub-toolbar-label">Classer :</span>'
            + '<button class="chub-sort-btn ' + (sortMode === 'recent' ? 'active' : '') + '" onclick="app.Expenses.setSort(\'recent\')">Récentes</button>'
            + '<button class="chub-sort-btn ' + (sortMode === 'alpha' ? 'active' : '') + '" onclick="app.Expenses.setSort(\'alpha\')">A → Z</button>'
            + '<button class="chub-sort-btn ' + (sortMode === 'categorie' ? 'active' : '') + '" onclick="app.Expenses.setSort(\'categorie\')">Par catégorie</button>'
            + '<button class="chub-sort-btn ' + (sortMode === 'montant' ? 'active' : '') + '" onclick="app.Expenses.setSort(\'montant\')">Par montant</button>'
            + '<button class="chub-sort-btn ' + (sortMode === 'statut' ? 'active' : '') + '" onclick="app.Expenses.setSort(\'statut\')">Par statut</button>'
            + '<span class="chub-toolbar-label" style="margin-left:auto;">' + expenses.length + ' dépense' + (expenses.length > 1 ? 's' : '') + '</span></div>';
        // Les tris qui regroupent posent un titre de section et son filet ;
        // l'ordre des paquets suit celui du tri, deja applique plus haut, on ne
        // retrie donc pas les sections.
        let body;
        if(sortMode === 'categorie' || sortMode === 'statut') {
            const secs = [];
            cards.forEach(c => {
                const last = secs[secs.length - 1];
                if(last && last.label === c.sec) last.items.push(c.html);
                else secs.push({ label: c.sec, items: [c.html] });
            });
            body = secs.map(s => '<div class="group-section"><div class="group-header">' + Utils.escape(s.label)
                + '<span class="ccol-group-count">' + s.items.length + '</span></div>'
                + '<div class="compact-cards-grid">' + s.items.join('') + '</div></div>').join('');
        } else {
            body = '<div class="compact-cards-grid">' + cards.map(c => c.html).join('') + '</div>';
        }
        container.innerHTML = toolbar + body;
    },
    _sort: 'recent',
    setSort: (mode) => { Expenses._sort = mode; Expenses.renderExpensesList(); },
    
// Salaires (basés sur jours de tournage) — délégué à ExpensesSalaries
    calculateSalariesTotal: (...a) => ExpensesSalaries.calculateSalariesTotal(...a),
    renderSalaries: (...a) => ExpensesSalaries.renderSalaries(...a),
    generateSalaryFor: (...a) => ExpensesSalaries.generateSalaryFor(...a),
    removeSalaryFor: (...a) => ExpensesSalaries.removeSalaryFor(...a),
    setSalarySort: (...a) => ExpensesSalaries.setSort(...a),
// CRUD dépenses, modale & pièces jointes — délégué à ExpensesCRUD
    openAddModal: (...a) => ExpensesCRUD.openAddModal(...a),
    onCategoryChange: (...a) => ExpensesCRUD.onCategoryChange(...a),
    calculateTTCFromHT: (...a) => ExpensesCRUD.calculateTTCFromHT(...a),
    calculateHTFromTTC: (...a) => ExpensesCRUD.calculateHTFromTTC(...a),
    handleFileUpload: (...a) => ExpensesCRUD.handleFileUpload(...a),
    editExpense: (...a) => ExpensesCRUD.editExpense(...a),
    saveExpense: (...a) => ExpensesCRUD.saveExpense(...a),
    deleteExpense: (...a) => ExpensesCRUD.deleteExpense(...a),
    validateExpense: (...a) => ExpensesCRUD.validateExpense(...a),
    cycleStatus: (...a) => ExpensesCRUD.cycleStatus(...a),
    escalateExpense: (...a) => ExpensesCRUD.escalateExpense(...a),
    openReturnModal: (...a) => ExpensesCRUD.openReturnModal(...a),
    duplicateExpense: (...a) => ExpensesCRUD.duplicateExpense(...a),
    // Export PDF & Excel — délégué à ExpensesExport
    openExportModal: (...a) => ExpensesExport.openExportModal(...a),
    exportPDF: (...a) => ExpensesExport.exportPDF(...a),
    exportExcel: (...a) => ExpensesExport.exportExcel(...a)
};

// --- MODULE MATCHING ENGINE ---
const MatchingEngine = {
    // ===================== ÉTAT & POIDS =====================
    // Poids des critères (sur 100 points total)
    weights: {
        gender: 20,
        age: 15,
        location: 15,
        collabType: 12,
        availability: 12,
        corpulence: 6,
        height: 5,
        hairColor: 4,
        hairLength: 3,
        eyeColor: 3,
        ethnicity: 5,
        languages: 8,
        sports: 5,
        bonnet: 4,
        vehicle: 3
    },
    
    // Profil sélectionné pour le matching
    selectedProfile: null,
    matchedProjects: [],
    
    // ===================== SÉLECTION & RECHERCHE =====================
	    // Initialiser le sélecteur de profils
    initProfileSelector: () => {
        const select = document.getElementById('universe-my-profile');
        if(!select) return;
        
        select.innerHTML = '<option value="">-- Sélectionner mon profil --</option>';
        
        // Récupérer mes profils depuis Universe
        const myProfiles = Universe.myProfiles || [];
        
        if(myProfiles.length === 0) {
            select.innerHTML += '<option value="" disabled>Aucun profil créé</option>';
            return;
        }
        
        myProfiles.forEach((profile, idx) => {
            const typeEmoji = profile.type === 'actor' ? '🎭' : (profile.type === 'crew' ? '🎥' : '👤');
            const opt = document.createElement('option');
            opt.value = idx;
            opt.textContent = `${typeEmoji} ${profile.name || profile.actorName || 'Profil ' + (idx + 1)}`;
            select.appendChild(opt);
        });
    },
    
    // Trouver des projets pour mon profil
    findProjectsForMe: () => {
        const select = document.getElementById('universe-my-profile');
        if(!select || select.value === '') {
            Utils.toast('Veuillez sélectionner un profil', 'warning');
            return;
        }
        
        const profileIdx = parseInt(select.value);
        const profile = Universe.myProfiles[profileIdx];
        if(!profile) {
            Utils.toast('Profil introuvable', 'error');
            return;
        }
        
        MatchingEngine.selectedProfile = profile;
        
        // Récupérer tous les projets
        const projects = Universe.allProjects || [];
        if(projects.length === 0) {
            Utils.toast('Aucun projet disponible', 'info');
            return;
        }
        
        // Calculer le score pour chaque projet
        const scoredProjects = projects.map(project => {
            const score = MatchingEngine.calculateScore(profile, project);
            return { ...project, matchScore: score.total, matchDetails: score.details };
        });
        
        // Trier par score décroissant
        scoredProjects.sort((a, b) => b.matchScore - a.matchScore);
        
        // Filtrer les projets avec un score minimum de 10%
        MatchingEngine.matchedProjects = scoredProjects.filter(p => p.matchScore >= 10);
        
        // Afficher les résultats
        MatchingEngine.displayResults();
        
        const countDiv = document.getElementById('matching-results-count');
        if(countDiv) {
            countDiv.style.display = 'block';
            countDiv.innerHTML = `<strong>${MatchingEngine.matchedProjects.length}</strong> projet(s) compatible(s)`;
        }
        
        Utils.toast(`${MatchingEngine.matchedProjects.length} projets trouvés !`, 'success');
    },
    
    // ===================== SÉLECTION & RECHERCHE =====================
	    // Calculer le score de compatibilité
    calculateScore: (profile, project) => {
        let totalScore = 0;
        let maxPossible = 0;
        const details = {};
        const profileType = profile.type; // 'actor' ou 'crew'
        
        // VÉRIFICATION PRÉALABLE : Le projet recherche-t-il ce type de profil ?
        if(profileType === 'actor') {
            // Vérifier si le projet recherche des comédiens
            const hasActorNeeds = project.actorNeeds && project.actorNeeds.length > 0;
            if(!hasActorNeeds) {
                return { total: 0, details: { noMatch: { score: 0, label: 'Ne recherche pas de comédiens' } }, maxPossible: 100, totalScore: 0 };
            }
            // Chercher le meilleur rôle correspondant
            const bestRole = MatchingEngine.findBestActorRole(profile, project.actorNeeds);
            if(bestRole) {
                // Rôle correspondant trouvé
                details.roleMatch = { score: 100, label: `Rôle : ${bestRole.roleName || 'Non spécifié'}` };
                totalScore += 25;
                maxPossible += 25;
            } else {
                // Pas de rôle exact mais le projet cherche des comédiens
                details.roleMatch = { score: 20, label: 'Recherche comédiens (autre profil)' };
                totalScore += 5;
                maxPossible += 25;
            }
        } else if(profileType === 'crew') {
            // Vérifier si le projet recherche des techniciens
            const hasCrewNeeds = (project.crewNeeds && Object.values(project.crewNeeds).some(n => n.needed)) || 
                                 (project.customCrewNeeds && project.customCrewNeeds.length > 0);
            if(!hasCrewNeeds) {
                return { total: 0, details: { noMatch: { score: 0, label: 'Ne recherche pas de techniciens' } }, maxPossible: 100, totalScore: 0 };
            }
            // Vérifier si le métier du profil correspond aux besoins
            const profileRole = (profile.role || profile.crewRole || '').toLowerCase();
            const profileDept = profile.department || profile.group_id || '';
            const matchingNeed = MatchingEngine.findMatchingCrewNeed(profileRole, profileDept, project);
            if(matchingNeed) {
                // Poste correspondant trouvé
                details.roleMatch = { score: 100, label: `Poste : ${matchingNeed}` };
                totalScore += 25;
                maxPossible += 25;
            } else {
                // Pas de poste exact mais le projet cherche des techniciens
                details.roleMatch = { score: 20, label: 'Recherche techniciens (autre poste)' };
                totalScore += 5;
                maxPossible += 25;
            }
        }
        
        // 1. GENRE (pour comédiens)
        if(profileType === 'actor' && (project.searchGender || project.castingGender || project.actorNeeds)) {
            maxPossible += MatchingEngine.weights.gender;
            const projectGender = (project.searchGender || project.castingGender || '').toLowerCase();
            const profileGender = (profile.gender || '').toLowerCase();
            if(projectGender && profileGender) {
                if(projectGender === profileGender || projectGender === 'tous' || projectGender === '') {
                    totalScore += MatchingEngine.weights.gender;
                    details.gender = { score: 100, label: 'Genre compatible' };
                } else {
                    details.gender = { score: 0, label: 'Genre différent' };
                }
            }
        }
        
        // 2. ÂGE
        if(project.searchAgeMin || project.searchAgeMax || project.castingAgeMin || project.castingAgeMax) {
            maxPossible += MatchingEngine.weights.age;
            const profileAge = parseInt(profile.age) || 0;
            const minAge = parseInt(project.searchAgeMin || project.castingAgeMin) || 0;
            const maxAge = parseInt(project.searchAgeMax || project.castingAgeMax) || 999;
            
            if(profileAge > 0) {
                if(profileAge >= minAge && profileAge <= maxAge) {
                    totalScore += MatchingEngine.weights.age;
                    details.age = { score: 100, label: 'Âge parfait' };
                } else {
                    // Score partiel si proche
                    const diff = profileAge < minAge ? minAge - profileAge : profileAge - maxAge;
                    if(diff <= 5) {
                        totalScore += MatchingEngine.weights.age * 0.5;
                        details.age = { score: 50, label: 'Âge proche (±5 ans)' };
                    } else if(diff <= 10) {
                        totalScore += MatchingEngine.weights.age * 0.25;
                        details.age = { score: 25, label: 'Âge éloigné (±10 ans)' };
                    } else {
                        details.age = { score: 0, label: 'Âge incompatible' };
                    }
                }
            }
        }
        
        // 3. LOCALISATION (distance)
        if(project.location || project.city) {
            maxPossible += MatchingEngine.weights.location;
            const projectCity = (project.location || project.city || '').toLowerCase();
            const profileCity = (profile.city || '').toLowerCase();
            
            if(projectCity && profileCity) {
                if(profileCity.includes(projectCity) || projectCity.includes(profileCity)) {
                    totalScore += MatchingEngine.weights.location;
                    details.location = { score: 100, label: 'Même ville' };
                } else {
                    // Bonus partiel si même région/département
                    const profileDept = MatchingEngine.extractDepartment(profileCity);
                    const projectDept = MatchingEngine.extractDepartment(projectCity);
                    if(profileDept && projectDept && profileDept === projectDept) {
                        totalScore += MatchingEngine.weights.location * 0.7;
                        details.location = { score: 70, label: 'Même région' };
                    } else {
                        totalScore += MatchingEngine.weights.location * 0.3;
                        details.location = { score: 30, label: 'Lieu différent' };
                    }
                }
            }
        }
        
        // 4. TYPE DE COLLABORATION (pro/bénévole)
        if(project.collabType || project.budget) {
            maxPossible += MatchingEngine.weights.collabType;
            const projectCollab = (project.collabType || '').toLowerCase();
            const profileCollab = (profile.collabType || '').toLowerCase();
            
            if(projectCollab && profileCollab) {
                if(projectCollab === profileCollab) {
                    totalScore += MatchingEngine.weights.collabType;
                    details.collabType = { score: 100, label: 'Type collab identique' };
                } else if(profileCollab === 'tous' || profileCollab.includes('flexible')) {
                    totalScore += MatchingEngine.weights.collabType * 0.8;
                    details.collabType = { score: 80, label: 'Flexible' };
                } else {
                    totalScore += MatchingEngine.weights.collabType * 0.3;
                    details.collabType = { score: 30, label: 'Type collab différent' };
                }
            }
        }
        
        // 5. DISPONIBILITÉS
        if(project.shootingDates || project.startDate) {
            maxPossible += MatchingEngine.weights.availability;
            const profileDates = profile.availabilityDates || [];
            const projectStart = project.startDate || project.shootingDates;
            
            if(profileDates.length > 0 && projectStart) {
                // Vérifier si au moins une date correspond
                const hasMatch = profileDates.some(d => {
                    const pDate = new Date(d);
                    const projDate = new Date(projectStart);
                    return Math.abs(pDate - projDate) < 30 * 24 * 60 * 60 * 1000; // 30 jours
                });
                if(hasMatch) {
                    totalScore += MatchingEngine.weights.availability;
                    details.availability = { score: 100, label: 'Disponible' };
                } else {
                    details.availability = { score: 0, label: 'Non disponible' };
                }
            } else {
                // Pas d'info = neutre
                totalScore += MatchingEngine.weights.availability * 0.5;
                details.availability = { score: 50, label: 'Disponibilité inconnue' };
            }
        }
        
        // 6. CORPULENCE
        if(project.searchCorpulence || project.castingCorpulence) {
            maxPossible += MatchingEngine.weights.corpulence;
            const projectCorp = (project.searchCorpulence || project.castingCorpulence || '').toLowerCase();
            const profileCorp = (profile.corpulence || '').toLowerCase();
            
            if(projectCorp && profileCorp && projectCorp === profileCorp) {
                totalScore += MatchingEngine.weights.corpulence;
                details.corpulence = { score: 100, label: 'Corpulence OK' };
            }
        }
        
        // 7. TAILLE
        if(project.searchHeightMin || project.searchHeightMax) {
            maxPossible += MatchingEngine.weights.height;
            const profileHeight = parseInt(profile.height) || 0;
            const minH = parseInt(project.searchHeightMin) || 0;
            const maxH = parseInt(project.searchHeightMax) || 999;
            
            if(profileHeight > 0 && profileHeight >= minH && profileHeight <= maxH) {
                totalScore += MatchingEngine.weights.height;
                details.height = { score: 100, label: 'Taille OK' };
            }
        }
        
        // 8. COULEUR CHEVEUX
        if(project.searchHairColor || project.castingHairColor) {
            maxPossible += MatchingEngine.weights.hairColor;
            const projectHair = (project.searchHairColor || project.castingHairColor || '').toLowerCase();
            const profileHair = (profile.hairColor || '').toLowerCase();
            
            if(projectHair && profileHair && projectHair === profileHair) {
                totalScore += MatchingEngine.weights.hairColor;
                details.hairColor = { score: 100, label: 'Cheveux OK' };
            }
        }
        
        // 9. LONGUEUR CHEVEUX
        if(project.searchHairLength) {
            maxPossible += MatchingEngine.weights.hairLength;
            const projectLen = (project.searchHairLength || '').toLowerCase();
            const profileLen = (profile.hairLength || '').toLowerCase();
            
            if(projectLen && profileLen && projectLen === profileLen) {
                totalScore += MatchingEngine.weights.hairLength;
                details.hairLength = { score: 100, label: 'Longueur cheveux OK' };
            }
        }
        
        // 10. COULEUR YEUX
        if(project.searchEyeColor || project.castingEyeColor) {
            maxPossible += MatchingEngine.weights.eyeColor;
            const projectEyes = (project.searchEyeColor || project.castingEyeColor || '').toLowerCase();
            const profileEyes = (profile.eyeColor || '').toLowerCase();
            
            if(projectEyes && profileEyes && projectEyes === profileEyes) {
                totalScore += MatchingEngine.weights.eyeColor;
                details.eyeColor = { score: 100, label: 'Yeux OK' };
            }
        }
        
        // 11. ETHNICITÉ
        if(project.searchEthnicity || project.castingEthnicity) {
            maxPossible += MatchingEngine.weights.ethnicity;
            const projectEth = (project.searchEthnicity || project.castingEthnicity || '').toLowerCase();
            const profileEth = (profile.ethnicity || '').toLowerCase();
            
            if(projectEth && profileEth && (projectEth === profileEth || projectEth === 'tous')) {
                totalScore += MatchingEngine.weights.ethnicity;
                details.ethnicity = { score: 100, label: 'Ethnicité OK' };
            }
        }
        
        // 12. LANGUES
        if(project.searchLanguages || project.languages) {
            maxPossible += MatchingEngine.weights.languages;
            const projectLangs = (project.searchLanguages || project.languages || '').toLowerCase().split(/[,;]/);
            const profileLangs = (profile.languages || '').toLowerCase().split(/[,;]/);
            
            const commonLangs = projectLangs.filter(l => 
                profileLangs.some(pl => pl.trim().includes(l.trim()) || l.trim().includes(pl.trim()))
            );
            
            if(commonLangs.length > 0) {
                const ratio = commonLangs.length / projectLangs.length;
                totalScore += MatchingEngine.weights.languages * ratio;
                details.languages = { score: Math.round(ratio * 100), label: `${commonLangs.length} langue(s) commune(s)` };
            }
        }
        
        // 13. SPORTS / COMPÉTENCES
        if(project.searchSports || project.skills) {
            maxPossible += MatchingEngine.weights.sports;
            const projectSports = (project.searchSports || project.skills || '').toLowerCase().split(/[,;]/);
            const profileSports = (profile.sports || '').toLowerCase().split(/[,;]/);
            
            const commonSports = projectSports.filter(s => 
                profileSports.some(ps => ps.trim().includes(s.trim()) || s.trim().includes(ps.trim()))
            );
            
            if(commonSports.length > 0) {
                const ratio = Math.min(1, commonSports.length / projectSports.length);
                totalScore += MatchingEngine.weights.sports * ratio;
                details.sports = { score: Math.round(ratio * 100), label: `${commonSports.length} compétence(s)` };
            }
        }
        
        // 14. BONNET (si applicable)
        if(project.searchBonnet && profile.gender?.toLowerCase() === 'femme') {
            maxPossible += MatchingEngine.weights.bonnet;
            const projectBonnet = (project.searchBonnet || '').toUpperCase();
            const profileBonnet = (profile.bonnet || '').toUpperCase();
            
            if(projectBonnet && profileBonnet) {
                const bonnetOrder = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
                const projIdx = bonnetOrder.indexOf(projectBonnet);
                const profIdx = bonnetOrder.indexOf(profileBonnet);
                
                if(projIdx === profIdx) {
                    totalScore += MatchingEngine.weights.bonnet;
                    details.bonnet = { score: 100, label: 'Bonnet exact' };
                } else if(Math.abs(projIdx - profIdx) === 1) {
                    totalScore += MatchingEngine.weights.bonnet * 0.7;
                    details.bonnet = { score: 70, label: 'Bonnet proche' };
                }
            }
        }
        
        // 15. VÉHICULE
        if(project.needsVehicle || project.requiresVehicle) {
            maxPossible += MatchingEngine.weights.vehicle;
            if(profile.hasVehicle) {
                totalScore += MatchingEngine.weights.vehicle;
                details.vehicle = { score: 100, label: 'Véhicule disponible' };
            } else {
                details.vehicle = { score: 0, label: 'Pas de véhicule' };
            }
        }
        
        // Calcul du pourcentage final
        const finalScore = maxPossible > 0 ? Math.round((totalScore / maxPossible) * 100) : 50;
        
        return {
            total: finalScore,
            details: details,
            maxPossible: maxPossible,
            totalScore: totalScore
        };
    },
    
    // Extraire le département d'une ville
    extractDepartment: (city) => {
        if(!city) return null;
        const match = city.match(/\b(\d{2})\b/);
        return match ? match[1] : null;
    },
    
    // Trouver le meilleur rôle correspondant pour un comédien
    findBestActorRole: (profile, actorNeeds) => {
        if(!actorNeeds || actorNeeds.length === 0) return null;
        
        const profileGender = (profile.gender || '').toLowerCase();
        const profileAge = parseInt(profile.age) || 0;
        
        let bestMatch = null;
        let bestScore = -1;
        
        actorNeeds.forEach(need => {
            let score = 0;
            
            // Match genre
            const needGender = (need.gender || '').toLowerCase();
            if(!needGender || needGender === 'tous' || needGender === profileGender) {
                score += 50;
            } else {
                return; // Genre incompatible, passer au suivant
            }
            
            // Match âge
            const minAge = parseInt(need.ageMin) || 0;
            const maxAge = parseInt(need.ageMax) || 999;
            if(profileAge >= minAge && profileAge <= maxAge) {
                score += 50;
            } else if(profileAge > 0) {
                const diff = profileAge < minAge ? minAge - profileAge : profileAge - maxAge;
                if(diff <= 10) score += 25;
            }
            
            if(score > bestScore) {
                bestScore = score;
                bestMatch = need;
            }
        });
        
        return bestMatch;
    },
    
    // Trouver si le métier du technicien correspond aux besoins du projet
    findMatchingCrewNeed: (profileRole, profileDept, project) => {
        const profileRoleLower = profileRole.toLowerCase();
        
        // Vérifier dans crewNeeds (postes standards)
        if(project.crewNeeds) {
            for(const [posId, need] of Object.entries(project.crewNeeds)) {
                if(need.needed) {
                    const pos = Presentation?.crewPositions?.find(p => p.id === posId);
                    if(pos) {
                        const posName = pos.name.toLowerCase();
                        if(posName.includes(profileRoleLower) || profileRoleLower.includes(posName.split(' ')[0])) {
                            return pos.name;
                        }
                    }
                }
            }
        }
        
        // Vérifier dans customCrewNeeds (postes personnalisés)
        if(project.customCrewNeeds) {
            for(const custom of project.customCrewNeeds) {
                const customName = (custom.name || '').toLowerCase();
                if(customName.includes(profileRoleLower) || profileRoleLower.includes(customName.split(' ')[0])) {
                    return custom.name;
                }
            }
        }
        
        // Vérifier par département si pas de match exact
        if(profileDept && project.crewNeeds) {
            const deptMapping = {
                'gc1': ['image', 'cadreur', 'chef op', 'directeur photo'],
                'gc3': ['réalisation', 'réalisateur', 'assistant réal'],
                'gc4': ['son', 'ingénieur son', 'perchman', 'mixeur'],
                'gc5': ['lumière', 'électro', 'chef électro', 'gaffer'],
                'gc6': ['décor', 'chef décor', 'accessoiriste'],
                'gc7': ['costume', 'costumier', 'habilleur'],
                'gc8': ['maquillage', 'maquilleur', 'coiffeur'],
                'gc9': ['production', 'directeur prod', 'régisseur'],
                'gc10': ['post-prod', 'monteur', 'étalonnage', 'vfx'],
                'gc11': ['scripte', 'script']
            };
            
            const deptKeywords = deptMapping[profileDept] || [];
            for(const [posId, need] of Object.entries(project.crewNeeds)) {
                if(need.needed) {
                    const pos = Presentation?.crewPositions?.find(p => p.id === posId);
                    if(pos && deptKeywords.some(kw => pos.name.toLowerCase().includes(kw))) {
                        return pos.name + ' (département)';
                    }
                }
            }
        }
        
        return null;
    },

    // ===================== AFFICHAGE & OUVERTURE =====================
	    // Afficher les résultats sur la carte
    displayResults: async () => {
        if(!Universe.map) return;
        
        // Supprimer l'ancien layer de matching s'il existe
        if(MatchingEngine.matchingLayer) {
            Universe.map.removeLayer(MatchingEngine.matchingLayer);
        }
        
        // Créer un nouveau layer SANS clustering pour les résultats de matching
        MatchingEngine.matchingLayer = L.layerGroup();
        
        // Compteur pour décaler les marqueurs à la même position
        const positionOffsets = {};
        
        // Ajouter les projets matchés comme marqueurs
        for(const project of MatchingEngine.matchedProjects) {
            const city = project.location || project.city || '';
            if(!city) continue;
            
            const coords = await Universe.geocodeCity(city);
            if(!coords) continue;
            
            // Décalage pour éviter superposition
            const key = `${coords.lat.toFixed(3)},${coords.lng.toFixed(3)}`;
            if(!positionOffsets[key]) positionOffsets[key] = 0;
            const offset = positionOffsets[key] * 0.002;
            positionOffsets[key]++;
            
            const finalLat = coords.lat + offset;
            const finalLng = coords.lng + offset;
            
            // Couleur selon le score
            const scoreColor = project.matchScore >= 70 ? '#22c55e' : 
                              project.matchScore >= 40 ? '#f59e0b' : '#ef4444';
            
            // Créer le marqueur avec l'affiche du projet
            const hasImage = project.image && project.image.length > 5;
            const icon = L.divIcon({
                className: 'match-marker-card',
                html: `
                    <div style="position: relative; cursor: pointer;" onclick="app.MatchingEngine.openMatchedProject('${project.id}')">
                        <div style="width: 70px; height: 95px; border-radius: 6px; overflow: hidden; border: 3px solid ${scoreColor}; box-shadow: 0 4px 12px rgba(0,0,0,0.4); background: #1a1a2e;">
                            ${hasImage 
                                ? `<img src="${Utils.safeMediaUrl(project.image)}" alt="Affiche du projet" class="img-cover">` 
                                : `<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 2rem;">🎬</div>`
                            }
                        </div>
                        <div style="position: absolute; top: -8px; right: -8px; background: ${scoreColor}; color: white; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 10px; border: 2px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3);">${project.matchScore}%</div>
                    </div>
                `,
                iconSize: [70, 95],
                iconAnchor: [35, 95]
            });
            
            const marker = L.marker([finalLat, finalLng], { icon });
            MatchingEngine.matchingLayer.addLayer(marker);
        }
        
        Universe.map.addLayer(MatchingEngine.matchingLayer);
        
        // Ajuster la vue pour montrer tous les marqueurs
        if(MatchingEngine.matchedProjects.length > 0) {
            setTimeout(() => {
                try {
                    const bounds = MatchingEngine.matchingLayer.getBounds();
                    if(bounds && bounds.isValid()) {
                        Universe.map.fitBounds(bounds, { padding: [50, 50] });
                    }
                } catch(e) {
                    console.warn('Impossible d\'ajuster la vue:', e);
                }
            }, 500);
        }
    },
    
    // Layer pour les résultats de matching (sans clustering)
    matchingLayer: null,
    
    // Ouvrir un projet matché
    openMatchedProject: (projectId) => {
        const project = MatchingEngine.matchedProjects.find(p => p.id === projectId);
        if(project) {
            Universe.openProjectModal(project);
        } else {
            Utils.toast('Projet introuvable', 'error');
        }
    }
};

// --- MODULE ADMIN ---
const Admin = {
    // ===================== ÉTAT & INITIALISATION =====================
    allUsers: [],
    allReports: [],
    allErrors: [],
    allFeedback: [],

    // ===================== RETOURS UTILISATEURS (v600) =====================
    // Ce que les gens ECRIVENT depuis « Vos remarques ». Le mail quotidien
    // reste la notification ; cette table est le PLAN DE TRAVAIL : on y trie
    // par urgence, on marque ce qui est traite, et on croise avec les erreurs
    // de l'onglet voisin. L'adresse de la personne n'y figure pas (choix du
    // 19 septembre) — elle reste dans le mail, ce qui suffit pour repondre.
    URGENCES: { 1: '🔴 Urgent', 2: '🟠 Normal', 3: '🔵 Plus tard' },

    loadFeedback: async () => {
        if(!Admin.isAdmin()) return;
        const bac = document.getElementById('admin-feedback-list');
        if(bac) bac.innerHTML = '<p class="text-sec-sm2">Chargement…</p>';
        try {
            const { data, error } = await supabase
                .from('client_feedback')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(500);
            if(error) throw error;
            Admin.allFeedback = data || [];
            Admin.renderFeedback();
        } catch(e) {
            console.error('[Admin] Retours:', e);
            if(bac) bac.innerHTML = '<p class="text-sec-sm2">Impossible de charger les retours : ' + Utils.escape(e.message || 'erreur inconnue') + '</p>';
        }
    },

    _feedbackFiltres: () => {
        const type = document.getElementById('admin-feedback-type')?.value || '';
        const montrerTraites = document.getElementById('admin-feedback-show-done')?.checked;
        return Admin.allFeedback
            .filter(f => (!type || f.type === type) && (montrerTraites || !f.traite))
            // Les urgents d'abord, puis les non classes, puis par date.
            .sort((a, b) => (a.urgence || 9) - (b.urgence || 9) || (a.created_at < b.created_at ? 1 : -1));
    },

    renderFeedback: () => {
        const bac = document.getElementById('admin-feedback-list');
        if(!bac) return;
        const liste = Admin._feedbackFiltres();
        const enAttente = Admin.allFeedback.filter(f => !f.traite).length;
        const badge = document.getElementById('admin-feedback-badge');
        if(badge) { badge.textContent = enAttente; badge.style.display = enAttente ? 'inline-block' : 'none'; }
        if(liste.length === 0) { bac.innerHTML = '<p class="text-sec-sm2">✅ Aucun retour à traiter.</p>'; return; }
        const TYPES = { bug: '🐞 Un problème', idee: '💡 Une idée', autre: '💬 Autre' };
        bac.innerHTML = liste.map(f => {
            const date = new Date(f.created_at).toLocaleString('fr-FR');
            const urg = Object.keys(Admin.URGENCES).map(n =>
                '<option value="' + n + '"' + (String(f.urgence) === n ? ' selected' : '') + '>' + Admin.URGENCES[n] + '</option>').join('');
            return '<div style="border:1px solid var(--border); border-left:4px solid ' + (f.urgence === 1 ? 'var(--danger)' : f.urgence === 2 ? '#f59e0b' : 'var(--border)') + '; border-radius:8px; padding:12px 14px; margin-bottom:10px; background:var(--panel-bg);' + (f.traite ? ' opacity:.55;' : '') + '">'
                + '<div style="display:flex; gap:10px; align-items:baseline; flex-wrap:wrap; margin-bottom:6px;">'
                +   '<strong>' + (TYPES[f.type] || Utils.escape(f.type || '')) + '</strong>'
                +   '<span class="text-sec-sm2">' + Utils.escape(date) + (f.version ? ' · ' + Utils.escape(f.version) : '') + '</span>'
                + '</div>'
                + '<div style="white-space:pre-wrap; margin-bottom:8px;">' + Utils.escape(f.texte || '') + '</div>'
                + (f.contexte ? '<div class="text-sec-sm2" style="margin-bottom:8px;">' + Utils.escape(f.contexte) + '</div>' : '')
                + '<div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">'
                +   '<select class="form-input-sm" onchange="app.Admin.setFeedbackUrgence(' + f.id + ', this.value)"><option value="">— Urgence —</option>' + urg + '</select>'
                +   '<button class="btn btn--sm" onclick="app.Admin.markFeedbackDone(' + f.id + ', ' + (f.traite ? 'false' : 'true') + ')">' + (f.traite ? '↩️ À retraiter' : '✔️ Traité') + '</button>'
                + '</div>'
            + '</div>';
        }).join('');
    },

    setFeedbackUrgence: async (id, valeur) => {
        const urgence = valeur ? parseInt(valeur, 10) : null;
        try {
            const { error } = await supabase.from('client_feedback').update({ urgence: urgence }).eq('id', id);
            if(error) throw error;
            const f = Admin.allFeedback.find(x => x.id === id);
            if(f) f.urgence = urgence;
            Admin.renderFeedback();
        } catch(e) { console.error('[Admin] setFeedbackUrgence:', e); Utils.toast('Impossible d\'enregistrer l\'urgence.', 'error'); }
    },

    markFeedbackDone: async (id, traite) => {
        try {
            const { error } = await supabase.from('client_feedback').update({ traite: traite }).eq('id', id);
            if(error) throw error;
            const f = Admin.allFeedback.find(x => x.id === id);
            if(f) f.traite = traite;
            Admin.renderFeedback();
        } catch(e) { console.error('[Admin] markFeedbackDone:', e); Utils.toast('Impossible de marquer ce retour.', 'error'); }
    },

    // SEANCE DE TRI : un seul bloc de texte réunissant les retours ET les
    // erreurs en attente, prêt à coller dans une conversation pour les classer
    // et les réparer. C'est le point de tout ce dispositif.
    copyTriage: async () => {
        if(Admin.allFeedback.length === 0) await Admin.loadFeedback();
        if(Admin.allErrors.length === 0) await Admin.loadErrors();
        const retours = Admin.allFeedback.filter(f => !f.traite);
        const groupes = Admin._groupesErreurs().filter(g => !g.traite);
        const lignes = [];
        lignes.push('=== RETOURS UTILISATEURS EN ATTENTE (' + retours.length + ') ===');
        retours.forEach(f => {
            lignes.push('');
            lignes.push('[' + (f.type || 'autre') + '] ' + new Date(f.created_at).toLocaleString('fr-FR')
                + (f.version ? ' — ' + f.version : '') + (f.urgence ? ' — urgence ' + f.urgence : ''));
            lignes.push(f.texte || '');
            if(f.contexte) lignes.push('(' + f.contexte + ')');
        });
        lignes.push('');
        lignes.push('=== ERREURS EN ATTENTE (' + groupes.length + ' distinctes) ===');
        groupes.forEach(g => {
            const e = g.modele;
            lignes.push('');
            lignes.push(g.nb + '× [' + e.type + '] ' + e.message);
            lignes.push('   ' + (e.source || '?') + ':' + (e.ligne || 0) + ' — page ' + (e.page || '?')
                + ' — ' + (e.version || '?') + ' — ' + (e.navigateur || '?'));
        });
        const texte = lignes.join('\n');
        try { await navigator.clipboard.writeText(texte); Utils.toast('Tout est copié — colle-le dans la conversation.', 'success', 5000); }
        catch(err) { console.log(texte); Utils.toast('Copie impossible — le texte est dans la console.', 'warning'); }
    },

    // ===================== ERREURS REMONTEES (v600) =====================
    // Les plantages survenus chez les utilisateurs, deposes par ErrorLogger
    // dans la table client_errors (voir sql/remontee_erreurs.sql). Aucun
    // identifiant de compte ni de projet n'y figure : c'est voulu.
    // REGROUPEMENT PAR EMPREINTE : une meme erreur qui arrive cent fois est
    // UNE ligne « 100 fois », pas cent lignes. Sans ca la liste serait
    // illisible des le premier bug un peu bavard.
    loadErrors: async () => {
        if(!Admin.isAdmin()) return;
        const bac = document.getElementById('admin-errors-list');
        if(bac) bac.innerHTML = '<p class="text-sec-sm2">Chargement…</p>';
        try {
            const { data, error } = await supabase
                .from('client_errors')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(500);
            if(error) throw error;
            Admin.allErrors = data || [];
            Admin.renderErrors();
        } catch(e) {
            console.error('[Admin] Erreurs remontées:', e);
            if(bac) bac.innerHTML = '<p class="text-sec-sm2">Impossible de charger les erreurs : ' + Utils.escape(e.message || 'erreur inconnue') + '</p>';
        }
    },

    // Regroupe par empreinte : la plus recente porte le detail, les autres
    // ne servent qu'a compter.
    _groupesErreurs: () => {
        const groupes = {};
        Admin.allErrors.forEach(e => {
            const g = groupes[e.empreinte];
            if(!g) { groupes[e.empreinte] = { modele: e, nb: 1, premier: e.created_at, traite: !!e.traite, ids: [e.id] }; return; }
            g.nb++;
            g.ids.push(e.id);
            if(e.created_at < g.premier) g.premier = e.created_at;
            if(!e.traite) g.traite = false;
        });
        return Object.values(groupes).sort((a, b) => (a.traite === b.traite)
            ? (b.modele.created_at < a.modele.created_at ? -1 : 1)
            : (a.traite ? 1 : -1));
    },

    renderErrors: () => {
        const bac = document.getElementById('admin-errors-list');
        if(!bac) return;
        const montrerTraitees = document.getElementById('admin-errors-show-done')?.checked;
        const groupes = Admin._groupesErreurs().filter(g => montrerTraitees || !g.traite);
        const enAttente = Admin._groupesErreurs().filter(g => !g.traite).length;
        const badge = document.getElementById('admin-errors-badge');
        if(badge) { badge.textContent = enAttente; badge.style.display = enAttente ? 'inline-block' : 'none'; }
        if(groupes.length === 0) {
            bac.innerHTML = '<p class="text-sec-sm2">✅ Aucune erreur' + (montrerTraitees ? '' : ' à traiter') + '.</p>';
            return;
        }
        bac.innerHTML = groupes.map(g => {
            const e = g.modele;
            const date = new Date(e.created_at).toLocaleString('fr-FR');
            const lieu = [e.source ? String(e.source).split('/').pop() : '', e.ligne ? ('ligne ' + e.ligne) : ''].filter(Boolean).join(' — ');
            return '<details style="border:1px solid var(--border); border-radius:8px; margin-bottom:10px; background:var(--panel-bg);' + (g.traite ? ' opacity:.55;' : '') + '">'
                + '<summary style="padding:10px 14px; cursor:pointer; display:flex; gap:10px; align-items:baseline; flex-wrap:wrap;">'
                +   '<span style="background:' + (g.traite ? 'var(--border)' : 'var(--danger)') + '; color:' + (g.traite ? 'var(--text-sec)' : '#fff') + '; border-radius:10px; padding:1px 8px; font-size:0.75rem; font-weight:bold;">' + g.nb + '×</span>'
                +   '<strong style="flex:1; min-width:200px;">' + Utils.escape(e.message || '') + '</strong>'
                +   '<span class="text-sec-sm2">' + Utils.escape(date) + '</span>'
                + '</summary>'
                + '<div style="padding:0 14px 14px;">'
                +   '<div class="text-sec-sm2" style="margin-bottom:8px;">'
                +     Utils.escape(e.type || '') + (lieu ? ' · ' + Utils.escape(lieu) : '')
                +     (e.page ? ' · page ' + Utils.escape(e.page) : '')
                +     (e.version ? ' · ' + Utils.escape(e.version) : '')
                +     (e.navigateur ? ' · ' + Utils.escape(e.navigateur) : '')
                +   '</div>'
                +   (e.pile ? '<pre style="background:var(--bg); border:1px solid var(--border); border-radius:6px; padding:10px; overflow:auto; font-size:0.75rem; max-height:260px;">' + Utils.escape(e.pile) + '</pre>' : '')
                +   '<div style="display:flex; gap:8px; margin-top:10px; flex-wrap:wrap;">'
                +     '<button class="btn btn--sm" onclick="app.Admin.copyError(\'' + Utils.escape(e.empreinte) + '\')">📋 Copier</button>'
                +     '<button class="btn btn--sm" onclick="app.Admin.markErrorDone(\'' + Utils.escape(e.empreinte) + '\', ' + (g.traite ? 'false' : 'true') + ')">' + (g.traite ? '↩️ À retraiter' : '✔️ Traitée') + '</button>'
                +   '</div>'
                + '</div>'
            + '</details>';
        }).join('');
    },

    // Copie le detail au presse-papier, pret a coller dans une conversation.
    copyError: async (empreinte) => {
        const g = Admin._groupesErreurs().find(x => x.modele.empreinte === empreinte);
        if(!g) return;
        const e = g.modele;
        const texte = [
            '[' + e.type + '] ' + e.message,
            'Vu ' + g.nb + ' fois — dernière : ' + new Date(e.created_at).toLocaleString('fr-FR'),
            'Endroit : ' + (e.source || '?') + ':' + (e.ligne || 0) + ':' + (e.colonne || 0),
            'Page : ' + (e.page || '?') + ' — ' + (e.version || '?') + ' — ' + (e.navigateur || '?'),
            e.pile ? '\nPile :\n' + e.pile : ''
        ].join('\n');
        try { await navigator.clipboard.writeText(texte); Utils.toast('Erreur copiée.', 'success'); }
        catch(err) { console.log(texte); Utils.toast('Copie impossible — le détail est dans la console.', 'warning'); }
    },

    // Marque toutes les lignes d'une meme erreur comme traitees (ou l'inverse).
    markErrorDone: async (empreinte, traite) => {
        try {
            const { error } = await supabase.from('client_errors').update({ traite: traite }).eq('empreinte', empreinte);
            if(error) throw error;
            Admin.allErrors.forEach(e => { if(e.empreinte === empreinte) e.traite = traite; });
            Admin.renderErrors();
        } catch(e) {
            console.error('[Admin] markErrorDone:', e);
            Utils.toast('Impossible de marquer cette erreur.', 'error');
        }
    },
    
    isAdmin: () => {
        return state.currentUser && CONFIG.adminEmails.includes(state.currentUser.email.toLowerCase());
    },
    
    // J2: filtre pour exclure les profils démo des stats
    excludeDemoProfiles: false,
    toggleExcludeDemo: () => {
        Admin.excludeDemoProfiles = document.getElementById('admin-exclude-demo')?.checked || false;
        Admin.loadStats(); // Recharger les stats avec le nouveau filtre
    },
    
    init: () => {
        // Afficher le bouton admin si l'utilisateur est admin
        const btn = document.getElementById('admin-btn');
        if(btn) {
            btn.style.display = Admin.isAdmin() ? 'inline-block' : 'none';
        }
        // Rafraîchir la pastille de signalements en attente
        if(Admin.isAdmin()) {
            Admin.refreshPendingBadge();
            // Rafraîchir périodiquement toutes les 2 minutes
            if(Admin._pendingInterval) clearInterval(Admin._pendingInterval);
            Admin._pendingInterval = setInterval(() => Admin.refreshPendingBadge(), 120000);
        }
    },
    
    // Met a jour la pastille rouge du bouton « 🛡️ Admin » ET celles des onglets.
    // v600 : elle ne comptait que les signalements. Elle compte desormais TOUT
    // ce qui attend : signalements + erreurs remontees + retours utilisateurs.
    // POURQUOI ICI : une pastille ne sert a rien si elle n'apparait qu'une fois
    // l'onglet ouvert — c'est justement ce qu'elle est censee t'epargner. Elle
    // est donc posee au chargement du tableau de bord, puis toutes les deux
    // minutes, sans attendre que tu cliques quoi que ce soit.
    refreshPendingBadge: async () => {
        if(!Admin.isAdmin()) return;
        const poser = (id, n) => {
            const el = document.getElementById(id);
            if(!el) return;
            el.textContent = n > 99 ? '99+' : String(n);
            el.style.display = n > 0 ? 'inline-block' : 'none';
        };
        let signalements = 0, erreurs = 0, retours = 0;
        try {
            const { count, error } = await supabase
                .from('reports')
                .select('id', { count: 'exact', head: true })
                .eq('status', 'pending');
            if(!error && count) signalements = count;
        } catch(e) { console.warn('[Admin] pastille signalements:', e); }
        try {
            // On compte les erreurs DISTINCTES, comme l'onglet les affiche :
            // une pastille a « 200 » pour un seul bug qui boucle ne dirait rien
            // d'utile. Une seule colonne suffit pour ca.
            const { data, error } = await supabase
                .from('client_errors')
                .select('empreinte')
                .eq('traite', false)
                .limit(1000);
            if(!error && data) erreurs = new Set(data.map(x => x.empreinte)).size;
        } catch(e) { console.warn('[Admin] pastille erreurs:', e); }
        try {
            const { count, error } = await supabase
                .from('client_feedback')
                .select('id', { count: 'exact', head: true })
                .eq('traite', false);
            if(!error && count) retours = count;
        } catch(e) { console.warn('[Admin] pastille retours:', e); }
        poser('admin-errors-badge', erreurs);
        poser('admin-feedback-badge', retours);
        poser('admin-pending-badge', signalements + erreurs + retours);
    },
    
    // B5 : re-clic sur le bouton Admin = retour à l'accueil
    toggle: () => {
        const v = document.getElementById('admin-view');
        if(v && v.style.display === 'flex') Admin.close();
        else Admin.show();
    },

    show: async () => {
        if(!Admin.isAdmin()) {
            Utils.toast('Accès non autorisé', 'error');
            return;
        }
        
        // Admin est dans dashboard-view, donc on cache juste le hub
        document.getElementById('hub-content').style.display = 'none';
        document.getElementById('universe-view').style.display = 'none';
        document.getElementById('admin-view').style.display = 'flex';
        Router.sync();
        
        await Admin.loadStats();
        await Admin.loadReports();
    },
    
    close: () => {
        UI.hideAllViews();
        document.getElementById('hub-content').style.display = '';
        document.getElementById('dashboard-view').style.display = 'flex';
        // Scroller en haut de la page
        window.scrollTo(0, 0);
    },
    
    // ===================== STATISTIQUES & GRAPHIQUES =====================
    statsData: {
        profiles: [],
        projects: [],
        actors: [],
        connections: [],
        reports: [],
        // Métiers tech
        crew_gc1: [], crew_gc2: [], crew_gc3: [], crew_gc4: [], crew_gc5: [],
        crew_gc6: [], crew_gc7: [], crew_gc8: [], crew_gc9: [], crew_gc10: [],
        crew_gc11: [], crew_gc12: [], crew_gc13: [], crew_gc14: [], crew_gc15: [],
        crew_gc16: [], crew_gc17: [],
        // Associations
        asso_video: [], asso_comediens: [], asso_realisateurs: [], asso_techniciens: [],
        asso_scenaristes: [], asso_producteurs: [], asso_figurants: [], asso_court_metrage: [],
        asso_documentaire: [], asso_animation: [], asso_musique: [], asso_theatre: [],
        asso_formation: [], asso_autre: [],
        // Entreprises
        ent_production: [], ent_postprod: [], ent_montage: [], ent_vfx: [],
        ent_doublage: [], ent_son: [], ent_musique: [], ent_location: [],
        ent_vente: [], ent_studio: [], ent_casting: [], ent_distribution: [],
        ent_technique: [], ent_formation: [], ent_autre: []
    },
    
    activeStatCategory: null,
    
    loadStats: async () => {
        try {
            // Charger les profils (filtré si exclusion démo active)
            let query = supabase.from('user_profiles').select('*');
            if(Admin.excludeDemoProfiles) {
                query = query.eq('is_demo', false);
            }
            const { data: profiles } = await query;
            Admin.statsData.profiles = profiles || [];
            
            // Réinitialiser les compteurs détaillés
            Object.keys(Admin.statsData).forEach(k => {
                if(k.startsWith('crew_') || k.startsWith('asso_') || k.startsWith('ent_')) {
                    Admin.statsData[k] = [];
                }
            });
            
            // Mapping des rôles vers départements
            const roleToDept = {
                'Réalisateur-rice': 'gc3', '1er assistant réalisateur': 'gc3', '2ème assistant réalisateur': 'gc3', 'Scripte': 'gc3',
                'Directeur-rice de la photo': 'gc1', 'Cadreur-se': 'gc1', '1er assistant caméra': 'gc1', '2ème assistant caméra': 'gc1', 'Steadicamer': 'gc1', 'Chef opérateur drone': 'gc1',
                'Chef électro': 'gc2', 'Electricien-ne': 'gc2', 'Chef machino': 'gc18', 'Machiniste': 'gc18',
                'Chef opérateur son': 'gc4', 'Perchiste': 'gc4', 'Ingénieur du son': 'gc4',
                'Chef décorateur': 'gc5', 'Ensemblier': 'gc5', 'Accessoiriste': 'gc5', 'Régisseur plateau': 'gc5',
                'Chef costumier': 'gc6', 'Costumier-ère': 'gc6', 'Habilleur-se': 'gc6',
                'Chef maquilleur': 'gc7', 'Maquilleur-se': 'gc7', 'Coiffeur-se': 'gc7',
                'Script/Continuité': 'gc8',
                'Régisseur général': 'gc9', 'Régisseur adjoint': 'gc9',
                'Directeur de production': 'gc10', 'Directeur de post-production': 'gc10', 'Producteur-rice': 'gc10',
                'Chef cuisinier': 'gc11', 'Intendant': 'gc11',
                'Chauffeur': 'gc12', 'Régisseur transport': 'gc12',
                'Monteur-se': 'gc13', 'Etalonneur-se': 'gc13', 'Infographiste': 'gc13',
                'Scénariste': 'gc14', 'Dialoguiste': 'gc14',
                'Compositeur-rice': 'gc15', 'Musicien-ne': 'gc15',
                'Cascadeur-se': 'gc16', 'Coordinateur cascades': 'gc16'
            };
            
            // Compter les types de profils
            let actorCount = 0;
            profiles?.forEach(p => {
                const profileType = p.profile_type;
                const data = p.data || {};
                const created = p.created_at || p.updated_at || new Date().toISOString();
                
                if(profileType === 'actor') actorCount++;
                if(profileType === 'crew') {
                    let dept = data.department;
                    if(!dept && data.role) {
                        dept = roleToDept[data.role] || 'gc17';
                    }
                    if(dept) {
                        const key = 'crew_' + dept;
                        if(Admin.statsData[key] !== undefined) {
                            Admin.statsData[key].push(created);
                        }
                    }
                }
                if(profileType === 'association' && data.assoType) {
                    if(Admin.statsData[data.assoType] !== undefined) {
                        Admin.statsData[data.assoType].push(created);
                    }
                }
                if(profileType === 'enterprise' && data.entType) {
                    if(Admin.statsData[data.entType] !== undefined) {
                        Admin.statsData[data.entType].push(created);
                    }
                }
            });
            Admin.statsData.actors = new Array(actorCount);
            
            // Charger les projets avec dates
            const { data: projects, error: projStatsErr } = await supabase.from('projects').select('created_at').is('deleted_at', null);
            if(projStatsErr) console.error('Erreur stats projets:', projStatsErr);
            Admin.statsData.projects = projects?.map(p => p.created_at) || [];
            
            // Charger les connexions
            const { data: connections, error: connStatsErr } = await supabase.from('user_logins').select('logged_at, user_email');
            if(connStatsErr) console.error('Erreur stats connexions:', connStatsErr);
            const _connExt = (connections || []).filter(c => !CONFIG.internalEmails.includes((c.user_email || '').toLowerCase()));
            Admin._internalLogins = (connections || []).length - _connExt.length;
            Admin.statsData.connections = _connExt.map(c => c.logged_at);
            
            // Charger les signalements
            const { data: reports, error: repStatsErr } = await supabase.from('reports').select('created_at');
            if(repStatsErr) console.error('Erreur stats signalements:', repStatsErr);
            Admin.statsData.reports = reports?.map(r => r.created_at) || [];
            
            // Mettre à jour les totaux
            document.getElementById('stat-profiles-total').textContent = Admin.statsData.profiles.length;
            document.getElementById('stat-projects-total').textContent = Admin.statsData.projects.length;
            document.getElementById('stat-actors-total').textContent = Admin.statsData.actors.length;
            document.getElementById('stat-connections-total').textContent = Admin.statsData.connections.length + (Admin._internalLogins ? ' (+' + Admin._internalLogins + ' int.)' : '');
            document.getElementById('stat-reports-total').textContent = Admin.statsData.reports.length;
            
            // Config
            const { data: authCount, error: errAuthCount } = await supabase.rpc('get_auth_users_count');
            if(errAuthCount) console.error('[Admin] get_auth_users_count:', errAuthCount);
            document.getElementById('config-current-users').textContent = authCount || 0;
            
            // Dessiner le graphique
            Admin.updateStatsChart();
            
        } catch(e) {
            console.error('Erreur chargement stats:', e);
        }
    },
    
    toggleStatCategory: (category) => {
        const container = document.getElementById('stats-detail-toggles');
        const btn = document.getElementById('stat-cat-' + category);
        
        // Toggle le bouton actif
        document.querySelectorAll('.stat-cat-btn').forEach(b => {
            b.style.background = 'var(--bg)';
            b.style.color = 'var(--text-main)';
        });
        
        if(Admin.activeStatCategory === category) {
            Admin.activeStatCategory = null;
            container.innerHTML = '';
            return;
        }
        
        Admin.activeStatCategory = category;
        btn.style.background = 'var(--primary)';
        btn.style.color = 'white';
        
        // Générer les toggles pour cette catégorie
        let items = [];
        const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#14b8a6', '#a855f7', '#eab308', '#22c55e', '#0ea5e9', '#d946ef', '#64748b', '#fb7185'];
        
        if(category === 'crew') {
            items = CONFIG.crewGroups.map((g, i) => ({
                id: 'crew_' + g.id,
                name: g.name,
                color: colors[i % colors.length],
                count: Admin.statsData['crew_' + g.id]?.length || 0
            }));
        } else if(category === 'asso') {
            items = CONFIG.associationTypes.map((t, i) => ({
                id: t.id,
                name: t.name,
                color: colors[i % colors.length],
                count: Admin.statsData[t.id]?.length || 0
            }));
        } else if(category === 'ent') {
            items = CONFIG.enterpriseTypes.map((t, i) => ({
                id: t.id,
                name: t.name,
                color: colors[i % colors.length],
                count: Admin.statsData[t.id]?.length || 0
            }));
        }
        
        container.innerHTML = items.map(item => `
            <label style="display: flex; align-items: center; gap: 4px; cursor: pointer; padding: 4px 8px; background: var(--bg); border-radius: 4px; font-size: 0.75rem;">
                <input type="checkbox" data-stat="${item.id}" onchange="app.Admin.updateStatsChart()" style="accent-color: ${item.color}; width: 12px; height: 12px;">
                <span style="color: ${item.color};">${item.name}</span>
                <strong style="color: ${item.color};">${item.count}</strong>
            </label>
        `).join('');
    },
    updateStatsChart: () => {
        const canvas = document.getElementById('admin-stats-chart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        
        const days = parseInt(document.getElementById('stats-period').value) || 30;
        const now = new Date();
        
        // Générer les labels (dates)
        const labels = [];
        for (let i = days - 1; i >= 0; i--) {
            const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
            labels.push(d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }));
        }
        
        // Fonction pour compter les éléments cumulés par jour
        const getCumulativeData = (dates) => {
            const counts = [];
            for (let i = days - 1; i >= 0; i--) {
                const dayEnd = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
                dayEnd.setHours(23, 59, 59, 999);
                const count = (dates || []).filter(d => new Date(d) <= dayEnd).length;
                counts.push(count);
            }
            return counts;
        };
        
        // Fonction pour compter par jour (non cumulé - pour connexions)
        const getDailyData = (dates) => {
            const counts = [];
            for (let i = days - 1; i >= 0; i--) {
                const dayStart = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
                dayStart.setHours(0, 0, 0, 0);
                const dayEnd = new Date(dayStart);
                dayEnd.setHours(23, 59, 59, 999);
                const count = (dates || []).filter(d => {
                    const date = new Date(d);
                    return date >= dayStart && date <= dayEnd;
                }).length;
                counts.push(count);
            }
            return counts;
        };
        
        // Collecter les datasets actifs
        const datasets = [];
        const baseColors = {
            profiles: '#3b82f6',
            projects: '#10b981',
            actors: '#8b5cf6',
            connections: '#06b6d4',
            reports: '#ef4444'
        };
        
        const detailColors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#14b8a6', '#a855f7', '#eab308', '#22c55e', '#0ea5e9', '#d946ef', '#64748b', '#fb7185'];
        
        // Stats principales
        document.querySelectorAll('#stats-toggles input[type="checkbox"]').forEach(cb => {
            if (cb.checked) {
                const stat = cb.dataset.stat;
                if (Admin.statsData[stat]) {
                    const data = stat === 'connections' 
                        ? getDailyData(Admin.statsData[stat])
                        : getCumulativeData(Admin.statsData[stat]);
                    datasets.push({ name: stat, data, color: baseColors[stat] || '#888' });
                }
            }
        });
        
        // Stats détaillées (métiers, asso, entreprises)
        let colorIndex = 0;
        document.querySelectorAll('#stats-detail-toggles input[type="checkbox"]').forEach(cb => {
            if (cb.checked) {
                const stat = cb.dataset.stat;
                if (Admin.statsData[stat]) {
                    const data = getCumulativeData(Admin.statsData[stat]);
                    const color = detailColors[colorIndex % detailColors.length];
                    datasets.push({ name: stat, data, color });
                    colorIndex++;
                }
            }
        });
        
        // Dessiner le graphique
        Admin.drawLineChart(ctx, canvas, labels, datasets);
    },
    
    drawLineChart: (ctx, canvas, labels, datasets) => {
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * 2;
        canvas.height = rect.height * 2;
        ctx.scale(2, 2);
        
        const width = rect.width;
        const height = rect.height;
        const padding = { top: 20, right: 20, bottom: 40, left: 50 };
        const chartWidth = width - padding.left - padding.right;
        const chartHeight = height - padding.top - padding.bottom;
        
        ctx.clearRect(0, 0, width, height);
        
        let maxVal = 1;
        datasets.forEach(ds => {
            const dsMax = Math.max(...ds.data);
            if (dsMax > maxVal) maxVal = dsMax;
        });
        maxVal = Math.ceil(maxVal * 1.1);
        
        const textColor = getComputedStyle(document.documentElement).getPropertyValue('--text-sec').trim() || '#666';
        
        // Grille
        ctx.strokeStyle = 'rgba(128,128,128,0.2)';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 5; i++) {
            const y = padding.top + (chartHeight / 5) * i;
            ctx.beginPath();
            ctx.moveTo(padding.left, y);
            ctx.lineTo(width - padding.right, y);
            ctx.stroke();
            
            ctx.fillStyle = textColor;
            ctx.font = '10px Arial';
            ctx.textAlign = 'right';
            ctx.fillText(Math.round(maxVal - (maxVal / 5) * i), padding.left - 8, y + 3);
        }
        
        // Labels X
        ctx.textAlign = 'center';
        const step = Math.ceil(labels.length / 10);
        labels.forEach((label, i) => {
            if (i % step === 0 || i === labels.length - 1) {
                const x = padding.left + (i / (labels.length - 1)) * chartWidth;
                ctx.fillStyle = textColor;
                ctx.font = '9px Arial';
                ctx.fillText(label, x, height - 10);
            }
        });
        
        // Lignes
        datasets.forEach(ds => {
            ctx.strokeStyle = ds.color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            
            ds.data.forEach((val, i) => {
                const x = padding.left + (i / (ds.data.length - 1)) * chartWidth;
                const y = padding.top + chartHeight - (val / maxVal) * chartHeight;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            ctx.stroke();
            
            ctx.fillStyle = ds.color;
            ds.data.forEach((val, i) => {
                const x = padding.left + (i / (ds.data.length - 1)) * chartWidth;
                const y = padding.top + chartHeight - (val / maxVal) * chartHeight;
                ctx.beginPath();
                ctx.arc(x, y, 3, 0, Math.PI * 2);
                ctx.fill();
            });
        });
    },
    
    // ===================== SIGNALEMENTS & BADGES =====================
    loadReports: async () => {
        const container = document.getElementById('admin-reports-list');
        container.innerHTML = '<div style="text-align: center; color: var(--text-sec); padding: 20px;">Chargement...</div>';
        
        try {
            const { data: reports, error } = await supabase
                .from('reports')
                .select('*')
                .order('created_at', { ascending: false });
            
            if(error) throw error;
            
            Admin.allReports = reports || [];
            
            if(!reports || reports.length === 0) {
                container.innerHTML = '<div class="empty-state">✅ Aucun signalement</div>';
                return;
            }
            
            // Charger les badges actuels des profils signalés (pour affichage)
            const reportedEmails = [...new Set(reports.map(r => (r.reported_email || '').toLowerCase()).filter(e => e))];
            const badgeByEmail = {};
            if(reportedEmails.length > 0) {
                const { data: profiles, error: errBadges } = await supabase
                    .from('user_profiles')
                    .select('email, moderation_badge, badge_reason')
                    .in('email', reportedEmails);
                if(errBadges) console.error('[Admin] badges signalements:', errBadges);
                (profiles || []).forEach(p => { badgeByEmail[p.email] = { badge: p.moderation_badge, reason: p.badge_reason }; });
            }
            
            const reasonLabels = {
                'fake': '👤 Faux profil',
                'inappropriate': '🚫 Inapproprié',
                'spam': '📧 Spam',
                'harassment': '⚠️ Harcèlement',
                'scam': '💰 Arnaque',
                'other': '❓ Autre'
            };
            
            const statusLabels = {
                'pending': { label: '⏳ En attente', color: '#f59e0b' },
                'reviewed': { label: '👁️ Examiné', color: '#3b82f6' },
                'resolved': { label: '✅ Résolu', color: '#10b981' },
                'dismissed': { label: '❌ Rejeté', color: '#6b7280' }
            };
            
            const badgeDotLabels = { yellow: '🟡 Jaune', red: '🔴 Rouge', black: '⚫ Noir' };
            
            container.innerHTML = reports.map(r => {
                const emailKey = (r.reported_email || '').toLowerCase();
                const currentBadge = badgeByEmail[emailKey];
                const hasBadge = currentBadge && currentBadge.badge;
                
                return `
                <div style="background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 15px; display: flex; justify-content: space-between; align-items: flex-start; gap: 15px;">
                    <div class="flex-1">
                        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px; flex-wrap: wrap;">
                            <span style="background: ${statusLabels[r.status]?.color || '#6b7280'}; color: white; padding: 3px 8px; border-radius: 4px; font-size: 0.75rem;">${statusLabels[r.status]?.label || r.status}</span>
                            <span class="fw-bold">${reasonLabels[r.reason] || Utils.escape(r.reason)}</span>
                            <span class="text-sec-sm2">• ${r.reported_type === 'forum_thread' ? 'Sujet forum' : r.reported_type === 'forum_reply' ? 'Réponse forum' : r.reported_type === 'profile' ? 'Profil' : r.reported_type}</span>
                            ${hasBadge ? `<span style="background:${currentBadge.badge === 'yellow' ? '#f59e0b' : currentBadge.badge === 'red' ? '#dc2626' : '#1f2937'}; color:white; padding:3px 8px; border-radius:4px; font-size:0.75rem;">Badge ${badgeDotLabels[currentBadge.badge]}</span>` : ''}
                        </div>
                        <div style="margin-bottom: 5px;"><strong>Signalé :</strong> ${Utils.escape(r.reported_name || 'Inconnu')} ${r.reported_email ? `(${Utils.escape(r.reported_email)})` : ''}</div>
                        <div style="margin-bottom: 5px; color: var(--text-sec); font-size: 0.85rem;"><strong>Par :</strong> ${Utils.escape(r.reporter_email)}</div>
                        ${r.details ? `<div style="margin-top: 8px; padding: 10px; background: var(--panel-bg); border-radius: 6px; font-size: 0.9rem;">${Utils.escape(r.details)}</div>` : ''}
                        ${hasBadge && currentBadge.reason ? `<div style="margin-top: 8px; padding: 10px; background: var(--panel-bg); border-left: 3px solid ${currentBadge.badge === 'yellow' ? '#f59e0b' : currentBadge.badge === 'red' ? '#dc2626' : '#1f2937'}; border-radius: 4px; font-size: 0.85rem;"><strong>Raison du badge :</strong> ${Utils.escape(currentBadge.reason)}</div>` : ''}
                        <div style="margin-top: 8px; color: var(--text-sec); font-size: 0.8rem;">📅 ${new Date(r.created_at).toLocaleDateString('fr-FR')} à ${new Date(r.created_at).toLocaleTimeString('fr-FR', {hour: '2-digit', minute: '2-digit'})}</div>
                        
                        ${r.reported_email ? `
                        <div style="margin-top: 12px; padding-top: 12px; border-top: 1px dashed var(--border);">
                            <div style="font-size: 0.75rem; color: var(--text-sec); margin-bottom: 6px; font-weight: bold;">MODÉRATION DU PROFIL</div>
                            <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                                <button onclick="app.Admin.applyBadgeFromReport('${r.id}', 'yellow')" style="padding: 5px 10px; background: #f59e0b; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.75rem; font-weight: bold;" ${currentBadge?.badge === 'yellow' ? 'disabled style="padding:5px 10px; background:#f59e0b99; color:white; border:none; border-radius:4px; font-size:0.75rem; font-weight:bold; cursor:not-allowed;"' : ''}>🟡 Jaune</button>
                                <button onclick="app.Admin.applyBadgeFromReport('${r.id}', 'red')" style="padding: 5px 10px; background: #dc2626; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.75rem; font-weight: bold;" ${currentBadge?.badge === 'red' ? 'disabled style="padding:5px 10px; background:#dc262699; color:white; border:none; border-radius:4px; font-size:0.75rem; font-weight:bold; cursor:not-allowed;"' : ''}>🔴 Rouge</button>
                                <button onclick="app.Admin.applyBadgeFromReport('${r.id}', 'black')" style="padding: 5px 10px; background: #1f2937; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.75rem; font-weight: bold;" ${currentBadge?.badge === 'black' ? 'disabled style="padding:5px 10px; background:#1f293799; color:white; border:none; border-radius:4px; font-size:0.75rem; font-weight:bold; cursor:not-allowed;"' : ''}>⚫ Noir</button>
                                ${hasBadge ? `<button onclick="app.Admin.removeBadgeFromReport('${r.id}')" style="padding: 5px 10px; background: var(--border); color: var(--text-main); border: none; border-radius: 4px; cursor: pointer; font-size: 0.75rem;">⚪ Retirer le badge</button>` : ''}
                            </div>
                        </div>
                        ` : ''}
                    </div>
                    <div class="flex-col-gap5">
                        ${r.status === 'pending' ? `
                            <button onclick="app.Admin.updateReportStatus('${r.id}', 'resolved')" style="padding: 6px 12px; background: var(--success); color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.8rem;">✅ Résolu</button>
                            <button onclick="app.Admin.updateReportStatus('${r.id}', 'dismissed')" style="padding: 6px 12px; background: var(--border); color: var(--text-main); border: none; border-radius: 4px; cursor: pointer; font-size: 0.8rem;">❌ Rejeter</button>
                        ` : ''}
                        ${(r.reported_type === 'forum_thread' || r.reported_type === 'forum_reply') ? `<button onclick="app.Admin.deleteForumPost('${r.reported_type}', '${r.reported_id}', '${r.id}')" style="padding: 6px 12px; background: #b45309; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.8rem;">🗑️ Supprimer le post</button>` : ''}
                        <button onclick="app.Admin.deleteReport('${r.id}')" style="padding: 6px 12px; background: var(--danger); color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.8rem;">🗑️</button>
                    </div>
                </div>`;
            }).join('');
            
        } catch(e) {
            console.error('Erreur chargement signalements:', e);
            container.innerHTML = '<div style="text-align: center; color: var(--danger); padding: 40px;">Erreur de chargement</div>';
        }
    },
    
    // Applique un badge de modération sur le profil signalé
    // badge : 'yellow' | 'red' | 'black' | null (null = retirer le badge)
    setProfileBadge: async (reportedEmail, badge, reason = '') => {
        if(!Admin.isAdmin()) {
            Utils.toast('Accès non autorisé', 'error');
            return false;
        }
        if(!reportedEmail) {
            Utils.toast('Email du profil signalé manquant', 'error');
            return false;
        }
        
        try {
            const badgeFilter = `email.eq.${Utils.pgSafe(reportedEmail.toLowerCase())},owner_email.eq.${Utils.pgSafe(reportedEmail.toLowerCase())}`;
            const { data, error } = await supabase
                .from('user_profiles')
                .update({
                    moderation_badge: badge,
                    badge_reason: badge ? reason : null,
                    badge_set_at: badge ? new Date().toISOString() : null,
                    badge_set_by: badge ? state.currentUser.email.toLowerCase() : null
                })
                .or(badgeFilter)
                .select('id');
            
            if(error) throw error;
            if(!data || data.length === 0) {
                Utils.toast('Badge non enregistré : profil introuvable ou écriture bloquée (RLS user_profiles ?)', 'error');
                console.warn('[Admin] setProfileBadge : 0 ligne touchée pour', reportedEmail, '— email/owner_email absent ou policy RLS UPDATE manquante');
                return false;
            }
            
            // G5b: invalider le cache de modération
            Moderation.invalidateCache(reportedEmail);
            
            const labels = { yellow: '🟡 Jaune', red: '🔴 Rouge', black: '⚫ Noir' };
            if(badge) {
                Utils.toast(`Badge ${labels[badge]} appliqué à ${reportedEmail}`, 'success');
            } else {
                Utils.toast(`Badge retiré de ${reportedEmail}`, 'success');
            }
            return true;
        } catch(e) {
            console.error('Erreur setProfileBadge:', e);
            Utils.toast('Erreur lors de l\'application du badge', 'error');
            return false;
        }
    },
    
    // Demande confirmation + raison, puis applique le badge
    applyBadgeFromReport: async (reportId, badge) => {
        const r = (Admin.allReports || []).find(x => String(x.id) === String(reportId));
        if(!r) return;
        const reportedEmail = r.reported_email;
        const reportedName = r.reported_name;
        if(!reportedEmail) {
            Utils.toast('Ce profil n\'a pas d\'email enregistré, impossible d\'appliquer un badge', 'warning');
            return;
        }
        
        const labels = { yellow: '🟡 Jaune (avertissement léger)', red: '🔴 Rouge (cas grave)', black: '⚫ Noir (restrictions de contact)' };
        const colors = { yellow: '#f59e0b', red: '#dc2626', black: '#1f2937' };
        
        const confirmed = await ConfirmModal.show({
            title: `Attribuer le badge ${labels[badge]} ?`,
            message: `
                <p class="mb-15">Badge à appliquer sur : <strong>${Utils.escape(reportedName || reportedEmail)}</strong> (${Utils.escape(reportedEmail)})</p>
                <label class="label-bold-block-5">Raison (visible publiquement sur le profil) :</label>
                <textarea id="badge-reason-input" style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 6px; min-height: 80px;" placeholder="Ex : plusieurs signalements pour contenu inapproprié..." data-tooltip="Ex : plusieurs signalements pour contenu inapproprié..."></textarea>
                <div style="margin-top: 12px; padding: 10px; background: ${colors[badge]}22; border-left: 3px solid ${colors[badge]}; border-radius: 4px; font-size: 0.85rem;">
                    ${badge === 'black' ? '⚠️ Le badge noir restreint les communications : le profil ne pourra plus envoyer/recevoir de messages ni d\'invitations auprès de nouvelles personnes. Ses contacts et projets existants restent accessibles.' : badge === 'red' ? 'Avertissement public fort. Le profil reste fonctionnel.' : 'Avertissement public modéré. Le profil reste fonctionnel.'}
                </div>
            `,
            confirmText: 'Appliquer le badge',
            icon: '🏷️'
        });
        
        if(!confirmed) return;
        
        const reason = document.getElementById('badge-reason-input')?.value?.trim() || '';
        const ok = await Admin.setProfileBadge(reportedEmail, badge, reason);
        if(ok) {
            await Admin.loadReports();
        }
    },
    
    // Retire le badge d'un profil
    removeBadgeFromReport: async (reportId) => {
        const r = (Admin.allReports || []).find(x => String(x.id) === String(reportId));
        if(!r) return;
        const reportedEmail = r.reported_email;
        const reportedName = r.reported_name;
        if(!reportedEmail) return;
        const confirmed = await ConfirmModal.show({
            title: 'Retirer le badge ?',
            message: `<p>Retirer le badge de modération du profil <strong>${Utils.escape(reportedName || reportedEmail)}</strong> ?</p><p class="text-sec-sm2 mt-10">Le profil retrouvera son état normal.</p>`,
            confirmText: 'Retirer',
            icon: '⚪'
        });
        if(!confirmed) return;
        
        const ok = await Admin.setProfileBadge(reportedEmail, null);
        if(ok) {
            await Admin.loadReports();
        }
    },
    
    updateReportStatus: async (reportId, status) => {
        try {
            const { data, error } = await supabase
                .from('reports')
                .update({ 
                    status: status, 
                    reviewed_at: new Date().toISOString(),
                    reviewed_by: state.currentUser.email
                })
                .eq('id', reportId)
                .select();
            
            if(error) throw error;
            if(!data || data.length === 0) { Utils.toast('Mise a jour bloquee : droits RLS sur reports ?', 'error'); console.warn('[Admin] update reports : 0 ligne touchee (policy RLS UPDATE manquante ?) id=', reportId); return; }
            
            Utils.toast('Statut mis à jour', 'success');
            await Admin.loadReports();
            await Admin.loadStats();
            Admin.refreshPendingBadge();
        } catch(e) {
            console.error('Erreur mise à jour:', e);
            Utils.toast('Erreur', 'error');
        }
    },
    
    // Supprimer un post forum signalé (sujet -> cascade réponses + votes ; réponse -> seule)
    deleteForumPost: async (kind, postId, reportId) => {
        const isThread = kind === 'forum_thread';
        if(!await ConfirmModal.show({ title: 'Supprimer le post ?', message: isThread ? 'Supprimer définitivement ce sujet ET toutes ses réponses ?' : 'Supprimer définitivement cette réponse ?', icon: '🗑️', confirmText: 'Supprimer' })) return;
        try {
            if(isThread) {
                try { await supabase.from('forum_votes').delete().eq('thread_id', postId); } catch(_) {}
                await supabase.from('forum_replies').delete().eq('thread_id', postId);
                const { data, error } = await supabase.from('forum_threads').delete().eq('id', postId).select();
                if(error) throw error;
                if(!data || data.length === 0) { Utils.toast('Suppression bloquée : aucune ligne supprimée (vérifie la policy RLS DELETE sur forum_threads).', 'error', 7000); return; }
            } else {
                const { data, error } = await supabase.from('forum_replies').delete().eq('id', postId).select();
                if(error) throw error;
                if(!data || data.length === 0) { Utils.toast('Suppression bloquée : aucune ligne supprimée (vérifie la policy RLS DELETE sur forum_replies).', 'error', 7000); return; }
            }
            try { await supabase.from('reports').update({ status: 'resolved', reviewed_at: new Date().toISOString(), reviewed_by: state.currentUser.email }).eq('id', reportId); } catch(_) {}
            Utils.toast('Post supprimé', 'success');
            await Admin.loadReports();
            await Admin.loadStats();
            Admin.refreshPendingBadge();
        } catch(e) {
            console.error('Erreur suppression post forum:', e);
            Utils.toast('Erreur lors de la suppression du post', 'error');
        }
    },
    
    deleteReport: async (reportId) => {
        if(!await ConfirmModal.show({ title: 'Supprimer ?', message: 'Supprimer définitivement ce signalement ?', icon: '🗑️', confirmText: 'Supprimer' })) return;
        
        try {
            const { data, error } = await supabase.from('reports').delete().eq('id', reportId).select();
            if(error) throw error;
            if(!data || data.length === 0) { Utils.toast('Suppression bloquee : droits RLS sur reports ?', 'error'); console.warn('[Admin] delete reports : 0 ligne supprimee (policy RLS DELETE manquante ?) id=', reportId); return; }
            
            Utils.toast('Signalement supprimé', 'success');
            await Admin.loadReports();
            await Admin.loadStats();
            Admin.refreshPendingBadge();
        } catch(e) {
            console.error('Erreur suppression:', e);
            Utils.toast('Erreur', 'error');
        }
    },
    
    // ===================== UTILISATEURS =====================
    loadUsers: async () => {
        const container = document.getElementById('admin-users-list');
        container.innerHTML = '<div style="text-align: center; color: var(--text-sec); padding: 20px;">Chargement...</div>';
        
        try {
            // Charger les profils
            const { data: users, error } = await supabase
                .from('user_profiles')
                .select('*')
                .order('created_at', { ascending: false });
            
            if(error) throw error;
            
            // Charger tous les projets
            // v578 (cloisonnement) : on chargeait le JSON de TOUS les projets de la
            // plateforme pour n'en afficher que le poids. La fonction serveur rend
            // le poids sans le contenu.
            const { data: rawProjects, error: errSizes } = await supabase.rpc('admin_project_sizes');
            if(errSizes) console.error('[Admin] admin_project_sizes:', errSizes);
            // Corbeille : si la fonction serveur renvoie deleted_at, on écarte les projets supprimés
            const projects = (rawProjects || []).filter(p => !p.deleted_at);
            
            // Associer les projets aux utilisateurs
            Admin.allProjects = projects;
            Admin.allUsers = (users || []).map(u => {
                const userProjects = projects?.filter(p => p.owner_email === u.email) || [];
                return { ...u, projects: userProjects };
            });
            
            Admin.renderUsers(Admin.allUsers);
            
        } catch(e) {
            console.error('Erreur chargement utilisateurs:', e);
            container.innerHTML = '<div style="text-align: center; color: var(--danger); padding: 40px;">Erreur de chargement</div>';
        }
    },
    
    renderUsers: (users) => {
        const container = document.getElementById('admin-users-list');
        
        if(!users || users.length === 0) {
            container.innerHTML = '<div class="empty-state">Aucun utilisateur</div>';
            return;
        }
        
        container.innerHTML = `
            <div style="overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse; min-width: 800px;">
                <thead>
                    <tr style="border-bottom: 2px solid var(--border); background: var(--bg);">
                        <th class="td-padded">Email</th>
                        <th class="td-padded">Nom du profil</th>
                        <th style="padding: 12px 10px; text-align: center; font-size: 0.85rem;">Types</th>
                        <th class="td-padded">Inscription</th>
                        <th style="padding: 12px 10px; text-align: center; font-size: 0.85rem;">CGU</th>
                        <th class="td-padded">Projets</th>
                    </tr>
                </thead>
                <tbody>
                    ${users.map(u => {
                        const facets = PublicProfile._normalizeFacets((u.data || {}).facets || u.facets, u);
                        const profileTypes = [];
                        if(facets.actor.enabled) profileTypes.push('<span title="Comédien">🎭</span>');
                        if(PublicProfile.crewAnyEnabled(facets)) profileTypes.push('<span title="Technicien">🎥</span>');
                        if(facets.asso.enabled) profileTypes.push('<span title="Association">🏛️</span>');
                        if(facets.ent.enabled) profileTypes.push('<span title="Entreprise">🏢</span>');
                        
                        // Projets de l'utilisateur
                        const projectsHtml = u.projects && u.projects.length > 0 
                            ? u.projects.map(p => `<div style="font-size: 0.8rem; margin-bottom: 3px;">
                                <span style="color: var(--text-main);">${Utils.escape(p.title || 'Sans titre')}</span>
                                <span style="color: var(--text-sec); font-size: 0.75rem;">(${new Date(p.created_at).toLocaleDateString('fr-FR')})</span>
                                <span style="color: var(--text-sec); font-size: 0.75rem;"> — 💾 ${Utils.formatWeight(p.weight_bytes || 0)}</span>
                            </div>`).join('')
                            : '<span style="color: var(--text-sec); font-size: 0.8rem;">-</span>';
                        
                        return `
                            <tr style="border-bottom: 1px solid var(--border);" onmouseover="this.style.background='var(--highlight)'" onmouseout="this.style.background=''">
                                <td style="padding: 10px; font-size: 0.85rem;">
                                    <a href="mailto:${Utils.escape(u.email)}" style="color: var(--primary); text-decoration: none;">${Utils.escape(u.email || '-')}</a>
                                </td>
                                <td class="p-10">
                                    <strong>${Utils.escape(u.name || '-')}</strong>
                                </td>
                                <td style="padding: 10px; text-align: center; font-size: 1.1rem;">
                                    ${profileTypes.join(' ') || '<span class="text-sec">-</span>'}
                                </td>
                                <td style="padding: 10px; color: var(--text-sec); font-size: 0.85rem;">
                                    ${u.created_at ? new Date(u.created_at).toLocaleDateString('fr-FR') : '-'}
                                </td>
                                <td style="padding: 10px; text-align: center; font-size: 0.85rem;" title="${u.terms_accepted && u.terms_accepted_at ? 'Accepté le ' + new Date(u.terms_accepted_at).toLocaleString('fr-FR') : 'Pas encore accepté'}">
                                    ${u.terms_accepted ? '✅' : '❌'}
                                </td>
                                <td class="p-10">
                                    ${projectsHtml}
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
            </div>
        `;
    },
    
    filterUsers: (search) => {
        const filtered = Admin.allUsers.filter(u => {
            const s = search.toLowerCase();
            return (u.email && u.email.toLowerCase().includes(s)) || 
                   (u.name && u.name.toLowerCase().includes(s));
        });
        Admin.renderUsers(filtered);
    },
    
    // ===== STATISTIQUES CONNEXIONS =====
    connectionStats: null,
    
    loadConnectionStats: async () => {
        try {
            const { data: allLogins, error } = await supabase
                .from('user_logins')
                .select('logged_at, user_email')
                .order('logged_at', { ascending: false });
            
            if (error) throw error;
            
            // B4 : on ne compte que les connexions externes (hors CONFIG.internalEmails)
            const logins = (allLogins || []).filter(l => !CONFIG.internalEmails.includes((l.user_email || '').toLowerCase()));
            const _intCount = (allLogins || []).length - logins.length;
            Admin.connectionStats = logins;
            
            const now = new Date();
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
            const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
            
            // Compteurs
            let todayCount = 0, weekCount = 0, monthCount = 0;
            logins.forEach(l => {
                const d = new Date(l.logged_at);
                if (d >= today) todayCount++;
                if (d >= weekAgo) weekCount++;
                if (d >= monthAgo) monthCount++;
            });
            
            document.getElementById('stat-today').textContent = todayCount;
            document.getElementById('stat-week').textContent = weekCount;
            document.getElementById('stat-month').textContent = monthCount;
            document.getElementById('stat-total-logins').textContent = logins.length + (_intCount ? ' (+' + _intCount + ' int.)' : '');
            
            // Graphiques
            Admin.drawDailyChart(logins);
            Admin.drawWeeklyChart(logins);
            Admin.drawMonthlyChart(logins);
            
        } catch(e) {
            console.error('Erreur chargement stats connexions:', e);
        }
    },
    
    drawDailyChart: (logins) => {
        const canvas = document.getElementById('chart-daily');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        
        // Préparer les données des 7 derniers jours
        const days = [];
        const counts = [];
        const now = new Date();
        
        for (let i = 6; i >= 0; i--) {
            const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
            const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
            const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
            
            days.push(d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' }));
            counts.push(logins.filter(l => {
                const ld = new Date(l.logged_at);
                return ld >= dayStart && ld < dayEnd;
            }).length);
        }
        
        Admin.drawBarChart(ctx, canvas, days, counts, '#3b82f6');
    },
    
    drawWeeklyChart: (logins) => {
        const canvas = document.getElementById('chart-weekly');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        
        const weeks = [];
        const counts = [];
        const now = new Date();
        
        for (let i = 3; i >= 0; i--) {
            const weekEnd = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);
            const weekStart = new Date(weekEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
            
            weeks.push(`Sem. ${weekEnd.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`);
            counts.push(logins.filter(l => {
                const ld = new Date(l.logged_at);
                return ld >= weekStart && ld < weekEnd;
            }).length);
        }
        
        Admin.drawBarChart(ctx, canvas, weeks, counts, '#8b5cf6');
    },
    
    drawMonthlyChart: (logins) => {
        const canvas = document.getElementById('chart-monthly');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        
        const months = [];
        const counts = [];
        const now = new Date();
        
        for (let i = 11; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const monthStart = new Date(d.getFullYear(), d.getMonth(), 1);
            const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 1);
            
            months.push(d.toLocaleDateString('fr-FR', { month: 'short' }));
            counts.push(logins.filter(l => {
                const ld = new Date(l.logged_at);
                return ld >= monthStart && ld < monthEnd;
            }).length);
        }
        
        Admin.drawBarChart(ctx, canvas, months, counts, '#10b981');
    },
    
    drawBarChart: (ctx, canvas, labels, data, color) => {
        // Ajuster la résolution du canvas
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * 2;
        canvas.height = rect.height * 2;
        ctx.scale(2, 2);
        
        const width = rect.width;
        const height = rect.height;
        const padding = 40;
        const barWidth = (width - padding * 2) / labels.length * 0.7;
        const gap = (width - padding * 2) / labels.length * 0.3;
        const maxVal = Math.max(...data, 1);
        
        // Effacer
        ctx.clearRect(0, 0, width, height);
        
        // Style texte
        const textColor = getComputedStyle(document.documentElement).getPropertyValue('--text-sec').trim() || '#666';
        ctx.fillStyle = textColor;
        ctx.font = '11px Arial';
        ctx.textAlign = 'center';
        
        // Dessiner les barres
        labels.forEach((label, i) => {
            const x = padding + i * (barWidth + gap) + gap / 2;
            const barHeight = (data[i] / maxVal) * (height - padding * 2);
            const y = height - padding - barHeight;
            
            // Barre
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.roundRect(x, y, barWidth, barHeight, 4);
            ctx.fill();
            
            // Valeur au-dessus
            ctx.fillStyle = textColor;
            ctx.fillText(data[i], x + barWidth / 2, y - 5);
            
            // Label en bas
            ctx.fillText(label, x + barWidth / 2, height - 10);
        });
        
        // Ligne de base
        ctx.strokeStyle = textColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padding, height - padding);
        ctx.lineTo(width - padding / 2, height - padding);
        ctx.stroke();
    },
    
    // ===================== NAVIGATION =====================
    switchTab: (tabName) => {
        // Cacher tous les contenus
        document.querySelectorAll('.admin-tab-content').forEach(el => el.style.display = 'none');
        // Désactiver tous les onglets
        document.querySelectorAll('.admin-tab').forEach(el => {
            el.style.background = 'var(--panel-bg)';
            el.style.color = 'var(--text-main)';
            el.classList.remove('active');
        });
        
        // Afficher le contenu sélectionné
        document.getElementById('admin-tab-' + tabName).style.display = 'block';
        // Activer l'onglet
        const activeTab = document.querySelector(`.admin-tab[data-tab="${tabName}"]`);
        if(activeTab) {
            activeTab.style.background = 'var(--primary)';
            activeTab.style.color = 'white';
            activeTab.classList.add('active');
        }
        
        // Charger les données si nécessaire
        if(tabName === 'users' && Admin.allUsers.length === 0) {
            Admin.loadUsers();
        }
        if(tabName === 'errors' && Admin.allErrors.length === 0) {
            Admin.loadErrors();
        }
        if(tabName === 'feedback' && Admin.allFeedback.length === 0) {
            Admin.loadFeedback();
        }
        if(tabName === 'analytics') {
            Admin.loadConnectionStats();
        }
        if(tabName === 'config') {
            Admin.loadPrealphaConfig();
        }
    },
    
    // ===== MESSAGE PRÉ-ALPHA =====
    loadPrealphaConfig: async () => {
        try {
            const { data, error } = await supabase
                .from('app_config')
                .select('key, value')
                .in('key', ['prealpha_title', 'prealpha_message']);
            
            if (data) {
                data.forEach(item => {
                    if (item.key === 'prealpha_title') {
                        const el = document.getElementById('prealpha-title');
                        if (el) el.textContent = item.value;
                        const input = document.getElementById('config-prealpha-title');
                        if (input) input.value = item.value;
                    }
                    if (item.key === 'prealpha_message') {
                        const el = document.getElementById('prealpha-message');
                        if (el) el.textContent = item.value;
                        const textarea = document.getElementById('config-prealpha-message');
                        if (textarea) textarea.value = item.value;
                    }
                });
            }
        } catch(e) {
            console.error('Erreur chargement config prealpha:', e);
        }
    },
    
    savePrealphaMessage: async () => {
        const title = document.getElementById('config-prealpha-title').value.trim();
        const message = document.getElementById('config-prealpha-message').value.trim();
        
        if (!title || !message) {
            Utils.toast('Veuillez remplir tous les champs', 'error');
            return;
        }
        
        try {
            // Upsert title
            const {error: cfgErr1} = await supabase.from('app_config').upsert({ 
                key: 'prealpha_title', 
                value: title,
                updated_at: new Date().toISOString()
            });
            if(cfgErr1) throw cfgErr1;
            
            // Upsert message
            const {error: cfgErr2} = await supabase.from('app_config').upsert({ 
                key: 'prealpha_message', 
                value: message,
                updated_at: new Date().toISOString()
            });
            if(cfgErr2) throw cfgErr2;
            
            // Mettre à jour l'affichage
            document.getElementById('prealpha-title').textContent = title;
            document.getElementById('prealpha-message').textContent = message;
            
            Utils.toast('Message pré-alpha mis à jour !', 'success');
        } catch(e) {
            console.error('Erreur sauvegarde message prealpha:', e);
            Utils.toast('Erreur de sauvegarde', 'error');
        }
    },
    
    previewPrealphaMessage: () => {
        const title = document.getElementById('config-prealpha-title').value;
        const message = document.getElementById('config-prealpha-message').value;
        
        document.getElementById('prealpha-title').textContent = title;
        document.getElementById('prealpha-message').textContent = message;
        
        Utils.toast('Prévisualisation appliquée (non sauvegardée)', 'info');
    },
    
    // ===== EMAILING =====
    emailRecipients: [],
    
    updateEmailFilter: (...a) => AdminEmail.updateEmailFilter(...a),
    showRecipientsList: (...a) => AdminEmail.showRecipientsList(...a),
    loadEmailTemplate: (...a) => AdminEmail.loadEmailTemplate(...a),
    previewEmail: (...a) => AdminEmail.previewEmail(...a),
    sendEmails: (...a) => AdminEmail.sendEmails(...a),
};

const AdminEmail = {
    updateEmailFilter: async () => {
        if(Admin.allUsers.length === 0) {
            await Admin.loadUsers();
        }
        
        const filters = {
            testOnly: document.getElementById('filter-test-only')?.checked,
            allUsers: document.getElementById('filter-all-users')?.checked,
            incompleteProfile: document.getElementById('filter-incomplete-profile')?.checked,
            noPublicProfile: document.getElementById('filter-no-public-profile')?.checked,
            noProject: document.getElementById('filter-no-project')?.checked,
            inactiveProject: document.getElementById('filter-inactive-project')?.checked,
            newUsers: document.getElementById('filter-new-users')?.checked,
            inactiveUsers: document.getElementById('filter-inactive-users')?.checked,
            typeActor: document.getElementById('filter-type-actor')?.checked,
            typeCrew: document.getElementById('filter-type-crew')?.checked,
            typeAssociation: document.getElementById('filter-type-association')?.checked,
            typeEnterprise: document.getElementById('filter-type-enterprise')?.checked
        };
        
        const now = new Date();
        const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
        const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
        
        // Charger les projets pour les filtres liés aux projets
        let userProjects = {};
        if(filters.noProject || filters.inactiveProject) {
            try {
                const { data: projects, error: errFiltProj } = await supabase.from('projects').select('owner_email, updated_at').is('deleted_at', null);
                if(errFiltProj) console.error('[Admin] emailing projets:', errFiltProj);
                projects?.forEach(p => {
                    if(!userProjects[p.owner_email]) userProjects[p.owner_email] = [];
                    userProjects[p.owner_email].push(p);
                });
            } catch(e) { console.error(e); }
        }
        
        Admin.emailRecipients = Admin.allUsers.filter(user => {
            // 🧪 Mode test : uniquement le compte de test, ignore tout le reste
            if(filters.testOnly) {
                return (user.email || '').toLowerCase() === 'ga.dmy@ikmail.com';
            }
            // 📣 Tous les utilisateurs : ignore les autres filtres (comptes internes exclus)
            if(filters.allUsers) {
                return !CONFIG.internalEmails.includes((user.email || '').toLowerCase());
            }
            // Vraies casquettes (facettes) — l'ancien champ profile_data n'existe pas sur user_profiles
            const pdata = user.data || {};
            const facets = PublicProfile._normalizeFacets(pdata.facets || user.facets, user);
            const email = user.email?.toLowerCase();
            const createdAt = new Date(user.created_at);
            const updatedAt = new Date(user.updated_at || user.created_at);
            
            // Complétion du profil : champs remplis du JSON de profil
            const filledFields = Object.values(pdata).filter(v => v && v !== '' && v !== false);
            const profileCompletion = Math.min(100, filledFields.length * 10);
            // Public si au moins une casquette activée ET visible
            const hasPublicProfile = PublicProfile.FACET_KEYS.some(k => k === 'crew' ? PublicProfile.crewArr(facets).some(f => f && f.enabled && f.visible !== false) : (facets[k].enabled && facets[k].visible !== false));
            
            // Appliquer les filtres
            let matches = true;
            
            if(filters.incompleteProfile && profileCompletion >= 50) matches = false;
            if(filters.noPublicProfile && hasPublicProfile) matches = false;
            if(filters.noProject && userProjects[email]?.length > 0) matches = false;
            if(filters.inactiveProject) {
                const projects = userProjects[email] || [];
                const hasInactive = projects.some(p => new Date(p.updated_at) < thirtyDaysAgo);
                if(!hasInactive) matches = false;
            }
            if(filters.newUsers && createdAt < sevenDaysAgo) matches = false;
            if(filters.inactiveUsers && updatedAt > thirtyDaysAgo) matches = false;
            
            // Filtres par type de profil
            const typeFiltersActive = filters.typeActor || filters.typeCrew || filters.typeAssociation || filters.typeEnterprise;
            if(typeFiltersActive) {
                let typeMatch = false;
                if(filters.typeActor && facets.actor.enabled) typeMatch = true;
                if(filters.typeCrew && PublicProfile.crewAnyEnabled(facets)) typeMatch = true;
                if(filters.typeAssociation && facets.asso.enabled) typeMatch = true;
                if(filters.typeEnterprise && facets.ent.enabled) typeMatch = true;
                if(!typeMatch) matches = false;
            }
            
            // Si aucun filtre actif, ne sélectionner personne
            const anyFilterActive = Object.values(filters).some(v => v);
            if(!anyFilterActive) return false;
            
            return matches;
        });
        
        document.getElementById('email-recipients-count').textContent = Admin.emailRecipients.length;
    },
    
    showRecipientsList: () => {
        if(Admin.emailRecipients.length === 0) {
            Utils.toast('Aucun destinataire sélectionné', 'warning');
            return;
        }
        
        const listHtml = Admin.emailRecipients.map(u => `
            <div style="padding: 8px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between;">
                <span>${Utils.escape(u.name || 'Sans nom')}</span>
                <span class="text-sec">${Utils.escape(u.email)}</span>
            </div>
        `).join('');
        
        ConfirmModal.show({
            title: `📧 ${Admin.emailRecipients.length} destinataires`,
            message: `<div style="max-height: 400px; overflow-y: auto; background: var(--bg); border-radius: 8px;">${listHtml}</div>`,
            confirmText: 'Fermer',
            icon: '👥'
        });
    },
    
    loadEmailTemplate: (template) => {
        const templates = {
            'welcome': {
                subject: '👋 Bienvenue sur Moteur !',
                body: `Bonjour {nom},

Bienvenue sur Moteur, la plateforme de gestion de production audiovisuelle !

Nous sommes ravis de vous compter parmi nos utilisateurs. N'hésitez pas à explorer toutes les fonctionnalités :
- Créez votre profil public pour être visible dans l'Univers
- Lancez votre premier projet
- Connectez-vous avec d'autres professionnels

Si vous avez des questions, n'hésitez pas à nous contacter.

À très vite sur Moteur !
L'équipe Moteur 🎬`
            },
            'complete-profile': {
                subject: '👤 Complétez votre profil Moteur',
                body: `Bonjour {nom},

Nous avons remarqué que votre profil sur Moteur n'est pas encore complet.

Un profil complet vous permet :
- D'être visible dans l'Univers par les autres professionnels
- De recevoir des propositions de projets adaptées
- De gagner en crédibilité auprès de la communauté

Prenez 5 minutes pour compléter votre profil et maximisez vos opportunités !

👉 Connectez-vous sur moteur.studio

L'équipe Moteur 🎬`
            },
            'reactivation': {
                subject: '🔄 Moteur vous manque !',
                body: `Bonjour {nom},

Cela fait un moment que nous ne vous avons pas vu sur Moteur !

Depuis votre dernière visite, nous avons ajouté de nouvelles fonctionnalités :
- L'Univers pour découvrir des profils et projets
- Le système de matching intelligent
- De nouveaux outils de gestion de projet

Revenez découvrir tout ça !

👉 Connectez-vous sur moteur.studio

L'équipe Moteur 🎬`
            },
            'new-feature': {
                subject: '🆕 Nouvelle fonctionnalité sur Moteur !',
                body: `Bonjour {nom},

Nous avons le plaisir de vous annoncer une nouvelle fonctionnalité sur Moteur !

[Décrivez la fonctionnalité ici]

Connectez-vous pour la découvrir !

👉 moteur.studio

L'équipe Moteur 🎬`
            },
            'feedback': {
                subject: '💬 Votre avis compte !',
                body: `Bonjour {nom},

Vous utilisez Moteur depuis votre inscription le {date_inscription}, et nous aimerions avoir votre retour.

Quelques questions rapides :
- Qu'est-ce qui vous plaît sur Moteur ?
- Qu'est-ce qui pourrait être amélioré ?
- Quelle fonctionnalité aimeriez-vous voir ajoutée ?

Répondez simplement à cet email, nous lisons tous les retours !

Merci pour votre aide précieuse.

L'équipe Moteur 🎬`
            }
        };
        
        if(templates[template]) {
            document.getElementById('email-subject').value = templates[template].subject;
            document.getElementById('email-body').value = templates[template].body;
        }
    },
    
    previewEmail: () => {
        const subject = document.getElementById('email-subject').value;
        const body = document.getElementById('email-body').value;
        
        if(!subject || !body) {
            Utils.toast('Remplissez l\'objet et le message', 'warning');
            return;
        }
        
        // Exemple avec le premier destinataire ou des valeurs par défaut
        const example = Admin.emailRecipients[0] || { name: 'Jean Dupont', email: 'exemple@email.com', created_at: new Date().toISOString() };
        
        const previewBody = body
            .replace(/\{nom\}/g, example.name || 'Utilisateur')
            .replace(/\{email\}/g, example.email || '')
            .replace(/\{date_inscription\}/g, new Date(example.created_at).toLocaleDateString('fr-FR'));
        
        ConfirmModal.show({
            title: '👁️ Prévisualisation',
            message: `
                <div style="background: var(--bg); border-radius: 8px; padding: 15px;">
                    <div style="font-weight: bold; margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid var(--border);">
                        📧 ${Utils.escape(subject)}
                    </div>
                    <div style="white-space: pre-wrap; font-family: inherit; line-height: 1.6;">
${Utils.escape(previewBody)}
                    </div>
                </div>
            `,
            confirmText: 'Fermer',
            icon: '📧'
        });
    },
    
    sendEmails: async () => {
        const subject = document.getElementById('email-subject').value;
        const body = document.getElementById('email-body').value;
        
        if(!subject || !body) {
            Utils.toast('Remplissez l\'objet et le message', 'warning');
            return;
        }
        
        if(Admin.emailRecipients.length === 0) {
            Utils.toast('Aucun destinataire sélectionné', 'warning');
            return;
        }
        
        const confirmed = await ConfirmModal.show({
            title: '📤 Confirmer l\'envoi',
            message: `Vous êtes sur le point d'envoyer cet email à <strong>${Admin.emailRecipients.length} destinataires</strong>.<br><br>Cette action est irréversible.`,
            confirmText: 'Envoyer',
            icon: '📧'
        });
        
        if(!confirmed) return;
        
        Utils.toast('Envoi en cours...', 'info');
        
        let sent = 0;
        let errors = 0;
        
        for(const recipient of Admin.emailRecipients) {
            try {
                const personalizedBody = body
                    .replace(/\{nom\}/g, recipient.name || 'Utilisateur')
                    .replace(/\{email\}/g, recipient.email || '')
                    .replace(/\{date_inscription\}/g, new Date(recipient.created_at).toLocaleDateString('fr-FR'));
                
                await supabase.functions.invoke('super-action', { body: {
                    to: recipient.email,
                    toName: recipient.name || 'Utilisateur',
                    type: 'generic',
                    data: { subject: subject, title: subject, message: personalizedBody }
                } });
                
                sent++;
                
                // Pause pour éviter le rate limiting
                await new Promise(resolve => setTimeout(resolve, 500));
                
            } catch(e) {
                console.error('Erreur envoi email à', recipient.email, e);
                errors++;
            }
        }
        
        if(errors === 0) {
            Utils.toast(`✅ ${sent} emails envoyés avec succès !`, 'success');
        } else {
            Utils.toast(`📧 ${sent} envoyés, ${errors} erreurs`, 'warning');
        }
    }
};

// --- MODULE UNIVERSE V86 ---
// ===== V2.1.6 — HUB CENTRAL =====

const UniverseFan = {
    // Boucle d'animation
    animate: () => {
        if(!Universe.animationRunning) return;
        
        const scene = document.getElementById('universe-scene');
        if(!scene) return;
        
        const rect = scene.getBoundingClientRect();
        const width = rect.width;
        const height = rect.height;
        const cardWidth = 170;
        const cardHeight = 130;
        
        // Mettre à jour chaque carte
        Universe.cards.forEach(card => {
            // Mouvement
            card.x += card.vx;
            card.y += card.vy;
            card.rotation += card.rotationSpeed;
            
            // Limiter la rotation
            if(card.rotation > 8) { card.rotation = 8; card.rotationSpeed *= -0.5; }
            if(card.rotation < -8) { card.rotation = -8; card.rotationSpeed *= -0.5; }
            
            // Rebond sur les bords
            if(card.x <= 5) { card.x = 5; card.vx *= -0.8; card.rotationSpeed += (Math.random() - 0.5) * 0.1; }
            if(card.x >= width - cardWidth - 5) { card.x = width - cardWidth - 5; card.vx *= -0.8; card.rotationSpeed += (Math.random() - 0.5) * 0.1; }
            if(card.y <= 5) { card.y = 5; card.vy *= -0.8; card.rotationSpeed += (Math.random() - 0.5) * 0.1; }
            if(card.y >= height - cardHeight - 5) { card.y = height - cardHeight - 5; card.vy *= -0.8; card.rotationSpeed += (Math.random() - 0.5) * 0.1; }
            
            // Appliquer la position
            card.el.style.left = card.x + 'px';
            card.el.style.top = card.y + 'px';
            card.el.style.transform = `rotate(${card.rotation}deg)`;
        });
        
        // Collision entre cartes nettes (search-result et main)
        const netCards = Universe.cards.filter(c => !c.isBlurred);
        for(let i = 0; i < netCards.length; i++) {
            for(let j = i + 1; j < netCards.length; j++) {
                UniverseFan.handleCollision(netCards[i], netCards[j]);
            }
        }
        
        // Légère friction pour ralentir progressivement
        Universe.cards.forEach(card => {
            card.vx *= 0.999;
            card.vy *= 0.999;
            
            // Ajouter un peu de mouvement aléatoire pour garder les cartes en mouvement
            if(Math.random() < 0.01) {
                card.vx += (Math.random() - 0.5) * 0.1;
                card.vy += (Math.random() - 0.5) * 0.1;
            }
            
            // Vitesse max (réduite pour mouvement plus calme)
            const maxSpeed = card.isMain ? 0.5 : 0.8;
            const speed = Math.sqrt(card.vx * card.vx + card.vy * card.vy);
            if(speed > maxSpeed) {
                card.vx = (card.vx / speed) * maxSpeed;
                card.vy = (card.vy / speed) * maxSpeed;
            }
            
            // Vitesse min pour éviter l'arrêt complet
            if(speed < 0.05) {
                card.vx += (Math.random() - 0.5) * 0.1;
                card.vy += (Math.random() - 0.5) * 0.1;
            }
        });
        
        requestAnimationFrame(UniverseFan.animate);
    },
    
    // Gestion des collisions entre cartes
    handleCollision: (card1, card2) => {
        const dx = card2.x - card1.x;
        const dy = card2.y - card1.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = 160;
        
        if(dist < minDist && dist > 0) {
            // Repousser les cartes
            const overlap = minDist - dist;
            const nx = dx / dist;
            const ny = dy / dist;
            
            const pushForce = overlap * 0.15;
            
            if(!card1.isMain) {
                card1.x -= nx * pushForce;
                card1.y -= ny * pushForce;
                card1.vx -= nx * 0.2;
                card1.vy -= ny * 0.2;
            }
            
            if(!card2.isMain) {
                card2.x += nx * pushForce;
                card2.y += ny * pushForce;
                card2.vx += nx * 0.2;
                card2.vy += ny * 0.2;
            }
            
            // Petite rotation lors de la collision
            card1.rotationSpeed += (Math.random() - 0.5) * 0.05;
       card2.rotationSpeed += (Math.random() - 0.5) * 0.2;
        }
    },
    
    // Rendu en mode Éventail
    renderFanView: (scene) => {
        scene.innerHTML = '';
        scene.style.overflow = 'auto';
        
        const container = document.createElement('div');
        container.className = 'universe-fan-container';
        
        const myEmail = state.currentUser?.email;
        const myEmailKey = myEmail ? Utils.sanitizeEmail(myEmail) : null;
        
        // Dédupliquer les profils par email
        const uniqueProfiles = [];
        const seenEmails = new Set();
        Universe.allProfiles.forEach(p => {
            const key = p.email || p.id;
            if(!seenEmails.has(key)) {
                seenEmails.add(key);
                uniqueProfiles.push(p);
            }
        });
        
        // Dédupliquer les projets par ID
        const uniqueProjects = [];
        const seenProjectIds = new Set();
        Universe.allProjects.forEach(p => {
            const key = p.id || p.projectId;
            if(key && !seenProjectIds.has(key)) {
                seenProjectIds.add(key);
                uniqueProjects.push(p);
            }
        });
        
// Catégoriser les profils
        const actors = uniqueProfiles.filter(p => p.type === 'actor');
        const crew = uniqueProfiles.filter(p => p.type === 'crew');
        const associations = uniqueProfiles.filter(p => p.type === 'association');
        const enterprises = uniqueProfiles.filter(p => p.type === 'enterprise');
        const projects = uniqueProjects;
        
        // Trouver mon profil
        const myProfile = Universe.allProfiles.find(p => p.id === myEmailKey);
        
        // Ma carte en premier (catégorie spéciale)
        if(myProfile) {
            const myCategory = UniverseFan.createFanCategory('👤 Mon Profil', [myProfile], true);
            container.appendChild(myCategory);
        }
        
        // Catégorie Comédiens - plafond d'affichage géré dans createFanCategory (20 + "+X autres")
        if(actors.length > 0) {
            const actorCategory = UniverseFan.createFanCategory('🎭 Comédiens', actors, false);
            container.appendChild(actorCategory);
        }
        
        // Catégorie Techniciens
        if(crew.length > 0) {
            const crewCategory = UniverseFan.createFanCategory('🎥 Techniciens', crew, false);
            container.appendChild(crewCategory);
        }
        
        // Catégorie Associations
        if(associations.length > 0) {
            const assoCategory = UniverseFan.createFanCategory('🤝 Associations', associations, false);
            container.appendChild(assoCategory);
        }
        
        // Catégorie Entreprises
        if(enterprises.length > 0) {
            const entCategory = UniverseFan.createFanCategory('🏢 Entreprises', enterprises, false);
            container.appendChild(entCategory);
        }
        
        // Catégorie Projets
        if(projects.length > 0) {
            const projectCategory = UniverseFan.createFanCategory('🎬 Projets', projects, false);
            container.appendChild(projectCategory);
        }
        
        scene.appendChild(container);
    },
    
    // Crée une catégorie avec grille de cartes
    createFanCategory: (label, items, isMyProfile) => {
        const category = document.createElement('div');
        category.className = 'fan-category';
        
        // Header avec label et compteur
        const header = document.createElement('div');
        header.className = 'fan-category-header';
        const labelEl = document.createElement('span');
        labelEl.className = 'fan-category-label';
        labelEl.innerHTML = label;
        header.appendChild(labelEl);
        
        if(items.length > 0) {
            const countEl = document.createElement('span');
            countEl.className = 'fan-category-count';
            countEl.textContent = `${items.length} résultat${items.length > 1 ? 's' : ''}`;
            header.appendChild(countEl);
        }
        category.appendChild(header);
        
        if(items.length === 0) {
            const emptyMsg = document.createElement('div');
            emptyMsg.style.cssText = 'text-align: center; color: var(--text-sec); padding: 40px;';
            emptyMsg.textContent = 'Aucun résultat';
            category.appendChild(emptyMsg);
            return category;
        }
        
        // Grille de cartes
        const grid = document.createElement('div');
        grid.className = 'fan-grid';
        
        // Afficher toutes les cartes (max 20)
        const maxCards = Math.min(items.length, 20);
        
        items.slice(0, maxCards).forEach((item) => {
            const card = UniverseFan.createFanCard(item, isMyProfile);
            grid.appendChild(card);
        });
        
        // Message si plus de résultats
        if(items.length > maxCards) {
            const moreMsg = document.createElement('div');
            moreMsg.style.cssText = 'text-align: center; color: var(--text-sec); padding: 15px; width: 100%;';
            moreMsg.textContent = `+ ${items.length - maxCards} autres résultats. Affinez votre recherche.`;
            grid.appendChild(moreMsg);
        }
        
        category.appendChild(grid);
        
        return category;
    },
    
    // Crée une carte pour la vue éventail
    createFanCard: (item, isMain) => {
        const card = document.createElement('div');
        const isProject = item.type === 'project';
        
        card.className = 'fan-card' + (isProject ? ' project-card' : '') + (isMain ? ' main-card' : '');
        card.dataset.profileId = item.id;
        
        if(isProject) {
            const photoHtml = item.image 
                ? `<img src="${Utils.safeMediaUrl(item.image)}" alt="${Utils.escape(item.title)}" onerror="this.parentElement.innerHTML='🎬'">`
                : '🎬';
            
            card.innerHTML = `
                <div class="card-photo project-photo">${photoHtml}</div>
                <div class="card-name">${Utils.escape(item.title)}</div>
                <div class="card-role project-type">${item.projectType || 'Projet'}</div>
                ${item.city ? `<div class="card-city">📍 ${Utils.escape(item.city)}</div>` : ''}
            `;
            card.onclick = () => Universe.openProjectModal(item);
        } else {
            // Icône selon le type
            const defaultIcon = item.type === 'actor' ? '🎭' : 
                               item.type === 'crew' ? '🎥' : 
                               item.type === 'association' ? '🏛️' : 
                               item.type === 'enterprise' ? '🏢' : '👤';
            
            const photoHtml = item.photo 
                ? `<img src="${Utils.safeMediaUrl(item.photo)}" alt="${Utils.escape(item.name)}" onerror="this.parentElement.innerHTML='${defaultIcon}'">`
                : defaultIcon;
            
            // Rôle/description selon le type
            let role = '';
            if(item.type === 'actor') {
                role = item.gender === 'homme' ? 'Comédien' : item.gender === 'femme' ? 'Comédienne' : 'Comédien·ne';
            } else if(item.type === 'crew') {
                role = item.role || item.department || 'Technicien·ne';
            } else if(item.type === 'association') {
                const assoType = CONFIG.associationTypes.find(t => t.id === item.assoType);
                role = assoType ? assoType.name : 'Association';
            } else if(item.type === 'enterprise') {
                const entType = CONFIG.enterpriseTypes.find(t => t.id === item.entType);
                role = entType ? entType.name : 'Entreprise';
            }
            
            // Message si adresse approximative
            const approxMsg = item._hasApproximateLocation ? 
                `<div class="card-approx-location" style="font-size: 0.7rem; color: var(--text-sec); background: var(--bg); padding: 4px 6px; border-radius: 4px; margin-top: 4px;">📍 Position approximative</div>` : '';
            
            card.innerHTML = `
                <div class="card-photo">${photoHtml}</div>
                <div class="card-name">${Utils.escape(item.name)}</div>
                <div class="card-role">${Utils.escape(role)}</div>
                ${item.city ? `<div class="card-city">📍 ${Utils.escape(item.city)}</div>` : ''}
                ${approxMsg}
            `;
            card.onclick = () => Universe.openProfileModal(item);
            card.setAttribute('role', 'button'); card.setAttribute('tabindex', '0');
            card.oncontextmenu = (e) => { e.preventDefault(); UniverseFan.showCardMenu(e, item); };
        }
        
        return card;
    },

    // ----- Menu clic droit d'une carte de profil (eventail) -----
    // « Ajouter a l'idee » (planche du personnage d'ou part le casting) et
    // « Ajouter au projet » (invitation, comme le bouton de la fiche profil).
    hideCardMenu: () => { const m = document.getElementById('fan-card-menu'); if(m) m.remove(); },
    showCardMenu: (ev, item) => {
        UniverseFan.hideCardMenu();
        const castingId = (typeof GlobalSearch !== 'undefined') ? GlobalSearch._castingCharId : null;
        const menu = document.createElement('div');
        menu.id = 'fan-card-menu';
        let left = ev.clientX, top = ev.clientY;
        if(left + 230 > window.innerWidth) left = window.innerWidth - 240;
        if(top + 130 > window.innerHeight) top = window.innerHeight - 140;
        if(left < 10) left = 10;
        if(top < 10) top = 10;
        menu.style.cssText = 'position:fixed; top:' + top + 'px; left:' + left + 'px; background:var(--panel-bg); border:1px solid var(--border); border-radius:8px; box-shadow:0 4px 20px rgba(0,0,0,0.3); z-index:var(--z-tooltip); min-width:210px; overflow:hidden;';
        let html = '<div style="padding:10px 15px; border-bottom:1px solid var(--border); font-weight:600; color:var(--text-sec); font-size:0.85rem;">' + Utils.escape(String(item.name || item.title || 'Profil').substring(0, 26)) + '</div>';
        if(castingId) html += '<div class="context-menu-item" data-act="idea" style="padding:12px 15px; cursor:pointer; display:flex; align-items:center; gap:10px;"><span>💡</span> Ajouter à l\'idée</div>';
        html += '<div class="context-menu-item" data-act="project" style="padding:12px 15px; cursor:pointer; display:flex; align-items:center; gap:10px;"><span>➕</span> Ajouter au projet</div>';
        menu.innerHTML = html;
        menu.querySelectorAll('.context-menu-item').forEach(el => {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                const act = el.dataset.act;
                UniverseFan.hideCardMenu();
                if(act === 'idea' && castingId && typeof Board !== 'undefined') {
                    Board.addProfileIdea(castingId, item);
                } else if(act === 'project') {
                    Universe.currentProfile = item;
                    if(typeof UniverseProfileModal !== 'undefined' && UniverseProfileModal.addToProject) UniverseProfileModal.addToProject();
                }
            });
        });
        document.body.appendChild(menu);
        setTimeout(() => { document.addEventListener('click', UniverseFan.hideCardMenu, { once: true }); }, 10);
    },

    // Crée une carte flottante (profil ou projet)
    // UniverseFan.createCard (item, isMain) retirée v569 : orpheline en
    // cascade depuis le retrait de sa façade Universe (étape 3). Le rendu
    // réel des cartes du système solaire passe ailleurs, ce doublon n'était
    // plus branché.
};

const UniverseSearch = {
    // ---- Autocompletion de lieu (ville / adresse / pays) via Nominatim ----
    // Choisir une suggestion fixe des coordonnees CERTAINES (amorcees dans le
    // cache), qui servent ensuite de centre au filtre par rayon.
    _locTimer: null,
    _locSuggest: [],
    onLocationInput: (value) => {
        const box = document.getElementById('universe-city-suggest');
        const q = (value || '').trim();
        if(UniverseSearch._locTimer) clearTimeout(UniverseSearch._locTimer);
        if(q.length < 3) { if(box) { box.style.display = 'none'; box.innerHTML = ''; } return; }
        UniverseSearch._locTimer = setTimeout(async () => {
            try {
                const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=6&addressdetails=0&q=${encodeURIComponent(q)}`, { headers: { 'Accept': 'application/json' } });
                if(!r.ok) return;
                const data = await r.json();
                UniverseSearch._locSuggest = (data || []).map(d => ({
                    label: ((d.display_name || '').split(',')[0].trim()) || (d.display_name || ''),
                    full: d.display_name || '',
                    lat: parseFloat(d.lat), lng: parseFloat(d.lon)
                })).filter(s => s.label && !isNaN(s.lat) && !isNaN(s.lng));
                UniverseSearch._renderLocSuggest();
            } catch(_) {}
        }, 450);
    },
    _renderLocSuggest: () => {
        const box = document.getElementById('universe-city-suggest');
        if(!box) return;
        const list = UniverseSearch._locSuggest || [];
        if(!list.length) { box.style.display = 'none'; box.innerHTML = ''; return; }
        const esc = Utils.escape;
        box.innerHTML = list.map((s, i) =>
            `<div onmousedown="event.preventDefault(); app.Universe.pickLocation(${i})" onmouseover="this.style.background='var(--highlight)'" onmouseout="this.style.background='transparent'" style="padding:8px 10px; cursor:pointer; border-bottom:1px solid var(--border);"><span style="font-weight:600;">${esc(s.label)}</span><span style="display:block; font-size:0.75rem; color:var(--text-sec); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(s.full)}</span></div>`
        ).join('');
        box.style.display = 'block';
    },
    pickLocation: (idx) => {
        const s = (UniverseSearch._locSuggest || [])[idx];
        if(!s) return;
        const input = document.getElementById('universe-city');
        if(input) input.value = s.label;
        // Coordonnees certaines : amorcer le cache (memoire + localStorage) pour
        // que geocodeCity renvoie CE point exact au filtre par rayon.
        const key = s.label.toLowerCase().trim();
        Universe.geoCache[key] = { lat: s.lat, lng: s.lng };
        try {
            const cached = localStorage.getItem('fmp_geocache');
            const cacheData = cached ? JSON.parse(cached) : {};
            cacheData[key] = { lat: s.lat, lng: s.lng };
            localStorage.setItem('fmp_geocache', JSON.stringify(cacheData));
        } catch(_) {}
        UniverseSearch.hideLocationSuggest(true);
    },
    hideLocationSuggest: (now) => {
        const hide = () => { const box = document.getElementById('universe-city-suggest'); if(box) box.style.display = 'none'; };
        if(now) hide(); else setTimeout(hide, 200);
    },
    onLocationKey: (e) => {
        if(e.key === 'Escape') { UniverseSearch.hideLocationSuggest(true); return; }
        if(e.key === 'Enter') {
            const box = document.getElementById('universe-city-suggest');
            const open = box && box.style.display !== 'none' && (UniverseSearch._locSuggest || []).length;
            if(open) { e.preventDefault(); UniverseSearch.pickLocation(0); }
            else Universe.search();
        }
    },
    // Distance a vol d'oiseau entre deux points {lat,lng}, en km (haversine).
    _distanceKm: (a, b) => {
        const R = 6371, toRad = (d) => d * Math.PI / 180;
        const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
        const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
        return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
    },
    // Filtre une liste (profils ou projets) autour de la ville CENTRE, dans le
    // rayon donne (km). Quand le rayon est actif, la ville sert de centre et non
    // de filtre texte. Coordonnees : lat/lng du profil si presentes, sinon
    // geocodage de sa ville (cache memoire/localStorage/DB/Nominatim).
    _applyRadius: async (list, cityCenter, radiusStr) => {
        const radius = parseInt(radiusStr, 10);
        if(!cityCenter || isNaN(radius) || radius <= 0 || radius >= 500) return list;
        const center = await Universe.geocodeCity(cityCenter);
        if(!center) { Utils.toast('Ville introuvable — filtre distance ignoré', 'warning'); return list; }
        const out = [];
        for(const item of list) {
            let coords = null;
            if(item.latitude != null && item.longitude != null) coords = { lat: item.latitude, lng: item.longitude };
            else { const c = item.city || item.location || ''; if(c) coords = await Universe.geocodeCity(c); }
            if(coords && UniverseSearch._distanceKm(center, coords) <= radius) out.push(item);
        }
        return out;
    },
    // Recherche
    search: async () => {
        const type = document.getElementById('universe-type').value;
        const city = document.getElementById('universe-city').value.trim().toLowerCase();
        // Rayon (km) autour de la ville. 500 = ∞ (pas de limite). Quand il est
        // actif, la ville devient le CENTRE et non un filtre texte.
        const distEl = document.getElementById('universe-distance');
        const radiusStr = distEl ? distEl.value : '';
        const radiusKm = parseInt(radiusStr, 10);
        const radiusActive = !!city && !isNaN(radiusKm) && radiusKm > 0 && radiusKm < 500;
        Universe.searchActive = true;
        
        // Si on cherche des projets
        if(type === 'project') {
            let results = [...Universe.allProjects];
            
            const projectType = document.getElementById('universe-project-type')?.value;
            const projectGenre = document.getElementById('universe-project-genre')?.value;
            const hasActorNeeds = document.getElementById('universe-project-has-actor-needs')?.checked;
            const hasCrewNeeds = document.getElementById('universe-project-has-crew-needs')?.checked;
            
            if(projectType) {
                results = results.filter(p => p.projectType === projectType);
            }
            if(projectGenre) {
                results = results.filter(p => p.genre === projectGenre);
            }
            if(hasActorNeeds) {
                results = results.filter(p => p.actorNeeds && p.actorNeeds.length > 0);
            }
            if(hasCrewNeeds) {
                results = results.filter(p => {
                    const crewCount = Object.values(p.crewNeeds || {}).filter(n => n.needed).length;
                    const customCount = (p.customCrewNeeds || []).length;
                    return crewCount + customCount > 0;
                });
            }
            if(city && !radiusActive) {
                results = results.filter(p => p.city && p.city.toLowerCase().includes(city));
            }
            
            // Filtre type de production
            const productionType = document.getElementById('universe-production-type')?.value;
            if(productionType) {
                results = results.filter(p => p.productionType === productionType);
            }
            
            if(radiusActive) results = await UniverseSearch._applyRadius(results, city, radiusStr);
            Universe.filteredProjects = results;
            Universe.filteredProfiles = [];
            UniverseSearch.renderSearchResults();
            
            // Toast de résultats projets
            const count = results.length;
            if(count === 0) {
                Utils.toast('Aucun projet trouvé', 'warning');
            } else {
                Utils.toast(`${count} projet${count > 1 ? 's' : ''} trouvé${count > 1 ? 's' : ''}`, 'success');
            }
            return;
        }
        
        // Sinon on cherche des profils (comédiens ou techniciens)
        let results = [...Universe.allProfiles];
        
        // Filtrer par type
        if(type) {
            results = results.filter(p => (p.visibleFacets || []).some(k => PublicProfile._facetKind(k) === PublicProfile._typeToFacet(type)) || p.type === type || p.accountType === type);
        }
        
        // Filtrer par ville
        if(city && !radiusActive) {
            results = results.filter(p => p.city && p.city.toLowerCase().includes(city));
        }
        
        // Filtre véhicule (commun)
        const hasVehicle = document.getElementById('universe-has-vehicle')?.checked;
        if(hasVehicle) {
            results = results.filter(p => p.hasVehicle === true);
        }
        
        // Filtre type de collaboration (commun acteurs/techniciens)
        const collabType = document.getElementById('universe-collab-type')?.value;
        if(collabType) {
            results = results.filter(p => {
                // collabTypes est un tableau (ex: ['pro', 'semi-pro', 'benevole'])
                if(Array.isArray(p.collabTypes)) {
                    return p.collabTypes.includes(collabType);
                }
                // Compatibilité ancienne structure (collabType string)
                return p.collabType === collabType;
            });
        }
        
        // Filtre statut professionnel (commun acteurs/techniciens)
        const statusType = document.getElementById('universe-status-type')?.value;
        if(statusType) {
            results = results.filter(p => p.professionalStatus === statusType);
        }
        
        // Filtres techniciens
        if(type === 'crew') {
            const dept = document.getElementById('universe-department')?.value;
            const role = document.getElementById('universe-crew-role')?.value;
            
            // v600 : on interroge TOUTES les fiches technicien de la personne, pas
            // seulement les champs plats. Depuis v597 un compte peut en porter
            // plusieurs (cadreur ET electro) ; les champs plats n'en decrivent
            // qu'une, la deuxieme etait donc introuvable par departement ou par
            // fonction. Les champs plats restent testes : ils sont les seuls
            // remplis sur les profils d'avant les casquettes.
            if(dept) {
                results = results.filter(p => p.department === dept
                    || Universe._fichesCrew(p).some(f => (f.department || f.group_id) === dept));
            }
            if(role) {
                results = results.filter(p => (p.role && p.role.toLowerCase().includes(role))
                    || Universe._fichesCrew(p).some(f => f.role && f.role.toLowerCase().includes(role)));
            }
        }
        
        // Filtres comédiens
        if(type === 'actor') {
            const gender = document.getElementById('universe-actor-gender')?.value;
            const ageMin = document.getElementById('universe-actor-age-min')?.value;
            const ageMax = document.getElementById('universe-actor-age-max')?.value;
            const heightMin = document.getElementById('universe-actor-height-min')?.value;
            const heightMax = document.getElementById('universe-actor-height-max')?.value;
            const weightMin = document.getElementById('universe-actor-weight-min')?.value;
            const weightMax = document.getElementById('universe-actor-weight-max')?.value;
            const eyes = document.getElementById('universe-actor-eyes')?.value;
            const hair = document.getElementById('universe-actor-hair')?.value;
            const hairLength = document.getElementById('universe-actor-hair-length')?.value;
            const ethnicity = document.getElementById('universe-actor-ethnicity')?.value;
            const corpulence = document.getElementById('universe-actor-corpulence')?.value;
            const sports = document.getElementById('universe-actor-sports')?.value.trim().toLowerCase();
            const languages = document.getElementById('universe-actor-languages')?.value.trim().toLowerCase();
            
            if(gender) results = results.filter(p => p.gender === gender);
            if(ageMin) results = results.filter(p => p.age && parseInt(p.age) >= parseInt(ageMin));
            if(ageMax) results = results.filter(p => p.age && parseInt(p.age) <= parseInt(ageMax));
            if(heightMin) results = results.filter(p => p.height && parseInt(p.height) >= parseInt(heightMin));
            if(heightMax) results = results.filter(p => p.height && parseInt(p.height) <= parseInt(heightMax));
            if(weightMin) results = results.filter(p => p.weight && parseInt(p.weight) >= parseInt(weightMin));
            if(weightMax) results = results.filter(p => p.weight && parseInt(p.weight) <= parseInt(weightMax));
            if(eyes) results = results.filter(p => p.eyeColor === eyes);
            if(hair) results = results.filter(p => p.hairColor === hair);
            if(hairLength) results = results.filter(p => p.hairLength === hairLength);
            if(ethnicity) results = results.filter(p => p.ethnicity === ethnicity);
            if(corpulence) results = results.filter(p => p.corpulence === corpulence);
            if(sports) results = results.filter(p => p.sports && p.sports.toLowerCase().includes(sports));
            if(languages) results = results.filter(p => p.languages && p.languages.toLowerCase().includes(languages));
            
            const bonnet = document.getElementById('universe-actor-bonnet')?.value;
            const bustType = document.getElementById('universe-actor-bust-type')?.value;
            
            if(bonnet) results = results.filter(p => p.bonnet === bonnet);
            if(bustType) results = results.filter(p => p.bustType === bustType);
        }
        
        // Filtres associations
        if(type === 'association') {
            const assoType = document.getElementById('universe-association-type')?.value;
            if(assoType) {
                results = results.filter(p => p.assoType === assoType);
            }
        }
        
        // Filtres entreprises
        if(type === 'enterprise') {
            const entType = document.getElementById('universe-enterprise-type')?.value;
            if(entType) {
                results = results.filter(p => p.entType === entType);
            }
        }
        
        if(radiusActive) results = await UniverseSearch._applyRadius(results, city, radiusStr);
        Universe.filteredProfiles = results;
        Universe.filteredProjects = [];
        UniverseSearch.renderSearchResults();
        
        // Toast de résultats
        const count = results.length;
        if(count === 0) {
            Utils.toast('Aucun résultat trouvé', 'warning');
        } else {
            Utils.toast(`${count} profil${count > 1 ? 's' : ''} trouvé${count > 1 ? 's' : ''}`, 'success');
        }
    },
    
    // Affiche les résultats de recherche
    renderSearchResults: async () => {
        const scene = document.getElementById('universe-scene');
        if(!scene) return;
        
        // Arrêter l'animation précédente
        Universe.animationRunning = false;
        Universe.cards = [];
        
        // Si mode carte, mettre à jour les marqueurs filtrés
        if(Universe.viewMode === 'map') {
            await UniverseSearch.loadFilteredMapMarkers();
            return;
        }
        
        // Sinon afficher en mode éventail
        scene.innerHTML = '';
        UniverseSearch.renderSearchResultsFan(scene);
    },
    
    // Charger les marqueurs filtrés sur la carte
    loadFilteredMapMarkers: async () => {
        if(!Universe.map || !Universe.markersLayer) return;
        
        Universe.markersLayer.clearLayers();
        Universe.cityPositionCounters = {}; // Reset des compteurs
        
        // Utiliser les résultats filtrés
        const items = [...Universe.filteredProfiles, ...Universe.filteredProjects];
        
        if(items.length === 0) {
            Utils.toast('Aucun résultat à afficher sur la carte', 'info');
            return;
        }
        
        for(let i = 0; i < items.length; i += 10) {
            const batch = items.slice(i, i + 10);
            
            await Promise.all(batch.map(async (item) => {
                const city = item.city || item.location || '';
                
                // Priorité 1 : coordonnées précises stockées directement sur le profil
                let coords = null;
                if(item.latitude != null && item.longitude != null) {
                    coords = { lat: item.latitude, lng: item.longitude };
                }
                
                // Priorité 2 : géocodage via la ville (DB → cache → Nominatim)
                if(!coords && city) {
                    coords = await Universe.geocodeCity(city);
                }
                
                if(!city && !coords) return;
                if(coords) {
                    // Décalage déterministe basé sur l'ID du profil (fixe, pas aléatoire)
                    const shouldHide = Universe.shouldHideAddress(item);
                    let finalCoords;
                    if(shouldHide) {
                        finalCoords = Universe.getDeterministicOffset(item.id, coords.lat, coords.lng);
                        item._hasApproximateLocation = true;
                    } else {
                        finalCoords = { lat: coords.lat, lng: coords.lng };
                        item._hasApproximateLocation = false;
                    }
                    
                    const marker = Universe.createMapMarker(item, finalCoords);
                    Universe.markersLayer.addLayer(marker);
                }
            }));
            
            if(i + 10 < items.length) {
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        }
        
        // Zoomer sur les résultats
        if(Universe.markersLayer.getLayers().length > 0) {
            Universe.map.fitBounds(Universe.markersLayer.getBounds(), { padding: [50, 50] });
        }
    },
    
    // Rendu des résultats de recherche en mode Éventail
    renderSearchResultsFan: (scene) => {
        scene.innerHTML = '';
        scene.style.overflow = 'auto';
        
        const container = document.createElement('div');
        container.className = 'universe-fan-container';
        
        // Séparer profils et projets des résultats
        const actors = Universe.filteredProfiles.filter(p => p.type === 'actor');
        const crew = Universe.filteredProfiles.filter(p => p.type === 'crew');
        const associations = Universe.filteredProfiles.filter(p => p.type === 'association');
        const enterprises = Universe.filteredProfiles.filter(p => p.type === 'enterprise');
        const projects = Universe.filteredProjects;
        
        // Message si aucun résultat
        if(actors.length === 0 && crew.length === 0 && associations.length === 0 && enterprises.length === 0 && projects.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 60px; color: var(--text-sec);">
                    <div style="font-size: 3rem; margin-bottom: 15px;">🔍</div>
                    <h3>Aucun résultat</h3>
                    <p>Essayez avec d'autres critères de recherche.</p>
                </div>
            `;
            scene.appendChild(container);
            return;
        }
        
        // Catégorie Comédiens trouvés
        if(actors.length > 0) {
            const actorCategory = Universe.createFanCategory(`🎭 Comédiens trouvés`, actors.slice(0, 20), false);
            container.appendChild(actorCategory);
        }
        
        // Catégorie Techniciens trouvés
        if(crew.length > 0) {
            const crewCategory = Universe.createFanCategory(`🎥 Techniciens trouvés`, crew.slice(0, 20), false);
            container.appendChild(crewCategory);
        }
        
        // Catégorie Associations trouvées
        if(associations.length > 0) {
            const assoCategory = Universe.createFanCategory(`🏛️ Associations trouvées`, associations.slice(0, 20), false);
            container.appendChild(assoCategory);
        }
        
        // Catégorie Entreprises trouvées
        if(enterprises.length > 0) {
            const entCategory = Universe.createFanCategory(`🏢 Entreprises trouvées`, enterprises.slice(0, 20), false);
            container.appendChild(entCategory);
        }
        
        // Catégorie Projets trouvés
        if(projects.length > 0) {
            const projectCategory = Universe.createFanCategory(`🎬 Projets trouvés`, projects.slice(0, 15), false);
            container.appendChild(projectCategory);
        }
        
        scene.appendChild(container);
    },
    
    // Reset la recherche
    reset: () => {
        document.getElementById('universe-type').value = '';
        document.getElementById('universe-department').value = '';
        document.getElementById('universe-city').value = '';
        document.getElementById('universe-distance').value = '500';
        document.getElementById('universe-distance-label').textContent = '∞';
        
        // Reset filtres comédiens
        if(document.getElementById('universe-actor-gender')) document.getElementById('universe-actor-gender').value = '';
        if(document.getElementById('universe-actor-age-min')) document.getElementById('universe-actor-age-min').value = '';
        if(document.getElementById('universe-actor-age-max')) document.getElementById('universe-actor-age-max').value = '';
        if(document.getElementById('universe-actor-height-min')) document.getElementById('universe-actor-height-min').value = '';
        if(document.getElementById('universe-actor-height-max')) document.getElementById('universe-actor-height-max').value = '';
        if(document.getElementById('universe-actor-weight-min')) document.getElementById('universe-actor-weight-min').value = '';
        if(document.getElementById('universe-actor-weight-max')) document.getElementById('universe-actor-weight-max').value = '';
        if(document.getElementById('universe-actor-eyes')) document.getElementById('universe-actor-eyes').value = '';
        if(document.getElementById('universe-actor-hair')) document.getElementById('universe-actor-hair').value = '';
        if(document.getElementById('universe-actor-hair-length')) document.getElementById('universe-actor-hair-length').value = '';
        if(document.getElementById('universe-actor-ethnicity')) document.getElementById('universe-actor-ethnicity').value = '';
        if(document.getElementById('universe-actor-corpulence')) document.getElementById('universe-actor-corpulence').value = '';
        if(document.getElementById('universe-actor-sports')) document.getElementById('universe-actor-sports').value = '';
        if(document.getElementById('universe-actor-languages')) document.getElementById('universe-actor-languages').value = '';
        if(document.getElementById('universe-actor-bonnet')) document.getElementById('universe-actor-bonnet').value = '';
        if(document.getElementById('universe-actor-bust-type')) document.getElementById('universe-actor-bust-type').value = '';
        
        // Reset filtres techniciens
        if(document.getElementById('universe-crew-role')) document.getElementById('universe-crew-role').value = '';
        
        // Reset filtres projets
        if(document.getElementById('universe-project-type')) document.getElementById('universe-project-type').value = '';
        if(document.getElementById('universe-project-genre')) document.getElementById('universe-project-genre').value = '';
        if(document.getElementById('universe-project-has-actor-needs')) document.getElementById('universe-project-has-actor-needs').checked = false;
        if(document.getElementById('universe-project-has-crew-needs')) document.getElementById('universe-project-has-crew-needs').checked = false;
        
        // Reset filtres associations
        if(document.getElementById('universe-association-type')) document.getElementById('universe-association-type').value = '';
        
        // Reset filtres entreprises
        if(document.getElementById('universe-enterprise-type')) document.getElementById('universe-enterprise-type').value = '';
        
        // Masquer les filtres spécifiques
        document.getElementById('universe-filters-crew').style.display = 'none';
        document.getElementById('universe-filters-actor').style.display = 'none';
        document.getElementById('universe-filters-project').style.display = 'none';
        document.getElementById('universe-filters-association').style.display = 'none';
        document.getElementById('universe-filters-enterprise').style.display = 'none';
        
        Universe.searchActive = false;
        Universe.filteredProfiles = [];
        Universe.filteredProjects = [];
        Universe.render();
    },
};

const UniverseProfileModal = {
    // Vérifie si une section est visible selon le contexte (public ou projet)
    isSectionVisible: (profile, section, context = 'public') => {
        // Un seul interrupteur de visibilité par carte (👁 par casquette) : les masquages par section sont retirés
        return true;
    },
    
    // Pager de casquettes : feuilleter les facettes d'un même profil dans la modale
    _pagerProfile: null,
    _pagerFacet: null,
    _tmpHqMarker: null,
    _clearHqMarker: () => {
        if(UniverseProfileModal._tmpHqMarker && Universe.map) {
            try { Universe.map.removeLayer(UniverseProfileModal._tmpHqMarker); } catch(e) {}
        }
        UniverseProfileModal._tmpHqMarker = null;
    },
    switchFacet: (dir) => {
        const p = UniverseProfileModal._pagerProfile;
        if(!p) return;
        const vf = p.visibleFacets || [];
        if(vf.length < 2) return;
        const i = Math.max(0, vf.indexOf(UniverseProfileModal._pagerFacet));
        const next = vf[(i + dir + vf.length) % vf.length];
        UniverseProfileModal.openProfileModal(p, next);
    },

    // 3b — Rend un profil comedien/technicien dans le MEME moteur que la fiche
    // de projet (lecture seule), et retire l'onglet « Dans le projet » (sans
    // objet pour un profil public). asso / entreprise / projet gardent l'affichage
    // classique (sections fixes du modal).
    _renderFicheInModal: (fullProfile, cur) => {
        const host = document.getElementById('pm-fiche');
        const body = host ? host.parentElement : null;
        if(!host || !body) return false;
        const curKind = PublicProfile._facetKind(cur);
        if(curKind !== 'actor' && curKind !== 'crew') { host.innerHTML = ''; body.classList.remove('pm-mode-fiche'); return false; }
        host.innerHTML = '';
        PublicProfile._publicView = true;
        let card = null;
        try {
            if(curKind === 'actor') {
                const temp = document.createElement('div');
                UI.renderDataCards([fullProfile], 'actors', temp, [], true);
                card = temp.firstElementChild;
            } else {
                card = UI.createCrewCard(fullProfile, -1, [], true);
            }
        } catch(e) { console.warn('Fiche Univers:', e); }
        PublicProfile._publicView = false;
        if(!card) { body.classList.remove('pm-mode-fiche'); return false; }
        const tabs = card.querySelector('.fid-tabs');
        if(tabs) {
            const pB = tabs.querySelector(':scope > .fid-tabbar > .fid-tab[data-tab="projet"]');
            const pP = tabs.querySelector(':scope > .fid-tabpanel[data-tab="projet"]');
            if(pB) pB.remove();
            if(pP) pP.remove();
            tabs.querySelectorAll(':scope > .fid-tabbar > .fid-tab.is-active, :scope > .fid-tabpanel.is-active').forEach(el => el.classList.remove('is-active'));
            const fB = tabs.querySelector(':scope > .fid-tabbar > .fid-tab');
            if(fB) {
                fB.classList.add('is-active');
                const fP = tabs.querySelector(':scope > .fid-tabpanel[data-tab="' + fB.dataset.tab + '"]');
                if(fP) fP.classList.add('is-active');
            }
        }
        host.appendChild(card);
        body.classList.add('pm-mode-fiche');
        return true;
    },

    openProfileModal: async (profile, facetView) => {
        // Casquette affichée : celle demandée par le pager, sinon la première visible
        const vf = profile.visibleFacets || (PublicProfile._typeToFacet(profile.type) ? [PublicProfile._typeToFacet(profile.type)] : []);
        const cur = (facetView && vf.includes(facetView)) ? facetView : (vf[0] || null);
        UniverseProfileModal._pagerProfile = profile;
        UniverseProfileModal._pagerFacet = cur;
        const curKind = PublicProfile._facetKind(cur);
        const isProject = profile.type === 'project';
        const isActor = curKind === 'actor';
        const isCrew = curKind === 'crew';
        const isAssociation = curKind === 'asso';
        const isEnterprise = curKind === 'ent';
        // Charger les données complètes depuis Supabase si nécessaire
        let fullProfile = profile;
        if(!isProject) {
            try {
                const { data: profileData, error: errPd2 } = await supabase
                    .from('user_profiles')
                    .select('*')
                    .eq('id', profile.id)
                    .maybeSingle();
                if(errPd2) { console.warn('[PublicProfile] chargement profil:', errPd2); Utils.toast('Certaines informations du profil n\u2019ont pas pu être chargées.', 'warning'); }
                
                if(profileData) {
                    // Extraire les données du champ JSONB
                    const extraData = profileData.data || {};
                    fullProfile = { 
                        ...profileData, 
                        ...extraData,
                        id: profile.id, 
                        type: profileData.profile_type || profile.type,
                        hasVehicle: profileData.vehicle || false,
                        availabilityText: profileData.availability || ''
                    };
                }
            } catch(e) { console.warn('Erreur chargement profil:', e); }
        }
        
        // Fiche affichée : ses champs priment sur les anciens champs plats
        if(!isProject && (curKind === 'actor' || curKind === 'crew')) {
            const fAll = PublicProfile._normalizeFacets((fullProfile.data || {}).facets || fullProfile.facets, fullProfile);
            const ff = PublicProfile.facetByKey(fAll, cur);
            PublicProfile.FACET_SWAP_KEYS.forEach(k => { if(ff[k] !== undefined && ff[k] !== null) fullProfile[k] = ff[k]; });
            if(ff.collabType !== undefined && ff.collabType !== null) fullProfile.collabType = ff.collabType; // mode de collaboration : visible sur le profil public
            fullProfile.facets = fAll;
        }
        
        Universe.currentProfile = fullProfile;
        UniverseProfileModal._renderFicheInModal(fullProfile, cur);
        
        // Photo
        const photoEl = document.getElementById('pm-photo');
        const photo = fullProfile.photo || fullProfile.photoURL || fullProfile.mainPhoto || fullProfile.poster || null;
        let defaultIcon = '👤';
        if(isProject) defaultIcon = '🎬';
        else if(isActor) defaultIcon = '🎭';
        else if(isCrew) defaultIcon = '🎥';
        else if(isAssociation) defaultIcon = '🏛️';
        else if(isEnterprise) defaultIcon = '🏢';
        
        // Logo de la structure (asso / entreprise) : prioritaire sur l'icône
        const extraD = fullProfile.data || {};
        const structLogo = isAssociation ? (fullProfile.assoLogo || extraD.assoLogo || '')
                          : (isEnterprise ? (fullProfile.entLogo || extraD.entLogo || '') : '');
        if(structLogo) {
            photoEl.innerHTML = `<img src="${Utils.safeMediaUrl(structLogo)}" alt="Logo" onerror="this.parentElement.innerHTML='${defaultIcon}'">`;
        } else if(photo && !isAssociation && !isEnterprise) {
            photoEl.innerHTML = `<img src="${Utils.safeMediaUrl(photo)}" alt="${Utils.escape(fullProfile.name || fullProfile.title || '')}" onerror="this.parentElement.innerHTML='${defaultIcon}'">`;
        } else {
            photoEl.innerHTML = defaultIcon; // casquette asso/entreprise : logo si fourni, sinon icône de la structure
        }
        
        // Nom
        // Identité par casquette : l'asso/entreprise porte sa propre identité
        let name = fullProfile.name || fullProfile.displayName || fullProfile.title || 'Sans nom';
        if(isAssociation) name = fullProfile.assoName || name;
        if(isEnterprise) name = fullProfile.entName || name;
        document.getElementById('pm-name').textContent = name;
        
        // Rôle / Type - chercher dans data si pas trouvé directement
        const extraData = fullProfile.data || {};
        let roleText = '';
        if(isProject) roleText = fullProfile.projectType || 'Projet';
        else if(isActor) roleText = fullProfile.role || extraData.role || 'Comédien·ne';
        else if(isCrew) roleText = fullProfile.role || extraData.role || extraData.department || 'Technicien·ne';
        else if(isAssociation) roleText = fullProfile.assoType || extraData.assoType || 'Association';
        else if(isEnterprise) roleText = fullProfile.entType || extraData.entType || 'Entreprise';
        document.getElementById('pm-role').textContent = roleText;
        
        // Pager ‹ › entre les casquettes du profil
        let pager = document.getElementById('pm-facet-pager');
        if(!pager) {
            pager = document.createElement('div');
            pager.id = 'pm-facet-pager';
            const roleEl = document.getElementById('pm-role');
            if(roleEl && roleEl.parentElement) roleEl.parentElement.insertBefore(pager, roleEl.nextSibling);
        }
        if(!isProject && vf.length > 1) {
            const FACET_ICONS = { actor: '🎭', crew: '🎥', asso: '🏛️', ent: '🏢' };
            pager.innerHTML = '';
            pager.style.display = 'flex';
            const mkArrow = (txt, dir) => {
                const b = document.createElement('button');
                b.type = 'button'; b.className = 'pm-facet-arrow'; b.textContent = txt;
                b.onclick = () => UniverseProfileModal.switchFacet(dir);
                return b;
            };
            const lab = document.createElement('span');
            lab.style.cssText = 'font-size:12px;opacity:.8;';
            lab.textContent = (FACET_ICONS[curKind] || '') + ' ' + (vf.indexOf(cur) + 1) + '/' + vf.length;
            pager.appendChild(mkArrow('‹', -1));
            pager.appendChild(lab);
            pager.appendChild(mkArrow('›', 1));
        } else {
            pager.style.display = 'none';
        }
        
        // Téléportation : au changement de casquette via le pager, voler vers l'adresse de la facette
        if(facetView && Universe.map) {
            try {
                UniverseProfileModal._clearHqMarker();
                let dest = null;
                let isHq = false;
                const fc = PublicProfile.facetByKey(profile.facets, cur);
                if((curKind === 'asso' || curKind === 'ent') && fc && fc.hqLatitude != null && fc.hqLongitude != null) {
                    dest = [fc.hqLatitude, fc.hqLongitude]; // siège de l'asso / entreprise
                    isHq = true;
                } else if(profile.latitude != null && profile.longitude != null) {
                    dest = [profile.latitude, profile.longitude]; // adresse de la personne
                }
                if(dest) {
                    // Marqueur temporaire « 📍 Siège » tant qu'on regarde la casquette asso/entreprise
                    if(isHq) {
                        const hqName = (curKind === 'asso' ? (profile.assoName || 'Siège') : (profile.entName || 'Siège'));
                        const hqIcon = L.divIcon({
                            className: '',
                            html: '<div class="tmp-hq-marker">📍 <span>' + Utils.escape(hqName) + '</span></div>',
                            iconSize: [10, 10],
                            iconAnchor: [5, 10]
                        });
                        UniverseProfileModal._tmpHqMarker = L.marker(dest, { icon: hqIcon, interactive: false, zIndexOffset: 2000 }).addTo(Universe.map);
                    }
                    const center = Universe.map.getCenter();
                    const moved = Math.abs(center.lat - dest[0]) > 0.0005 || Math.abs(center.lng - dest[1]) > 0.0005;
                    if(moved) Universe.map.flyTo(dest, Math.max(Universe.map.getZoom(), 12));
                }
            } catch(e) {}
        }
        
        // Ville : siège pour asso/entreprise, ville de la personne sinon
        let city = fullProfile.city || fullProfile.location || '';
        const curFacetData = (fullProfile.facets || profile.facets || {})[cur];
        if((isAssociation || isEnterprise) && curFacetData && curFacetData.hqAddress) city = curFacetData.hqAddress;
        document.getElementById('pm-city').textContent = city ? '📍 ' + city : '';
        
        // Badge de modération (visible par tous)
        const badgeEl = document.getElementById('pm-moderation-badge');
        if(badgeEl) {
            const badge = fullProfile.moderation_badge;
            if(badge) {
                const badgeConfigs = {
                    yellow: { icon: '🟡', label: 'Profil signalé', color: '#f59e0b', bg: '#fef3c7', textColor: '#78350f' },
                    red: { icon: '🔴', label: 'Profil signalé — attention', color: '#dc2626', bg: '#fee2e2', textColor: '#7f1d1d' },
                    black: { icon: '⚫', label: 'Profil en cours de vérification', color: '#1f2937', bg: '#d1d5db', textColor: '#111827' }
                };
                const cfg = badgeConfigs[badge] || badgeConfigs.yellow;
                const reason = fullProfile.badge_reason;
                badgeEl.style.display = 'block';
                badgeEl.style.background = cfg.bg;
                badgeEl.style.borderLeft = '4px solid ' + cfg.color;
                badgeEl.style.color = cfg.textColor;
                badgeEl.innerHTML = `
                    <div style="font-weight:bold; margin-bottom:${reason ? '6px' : '0'};">${cfg.icon} ${cfg.label}</div>
                    ${reason ? `<div style="font-size:0.8rem; opacity:0.85;">${Utils.escape(reason)}</div>` : ''}
                `;
            } else {
                badgeEl.style.display = 'none';
            }
        }
        
        // Galerie photos (vérifier visibilité)
        let galleryHtml = '';
        const gallerySection = fullProfile.type === 'crew' ? 'crew-gallery' : 'gallery';
        const photos = fullProfile.galleryPhotos || fullProfile.crewGalleryPhotos || fullProfile.gallery || fullProfile.photos || [];
        if(photos.length > 0 && UniverseProfileModal.isSectionVisible(fullProfile, gallerySection, 'public')) {
            galleryHtml = '<div style="display: flex; gap: 10px; margin-bottom: 20px; justify-content: center; flex-wrap: wrap;">';
            photos.slice(0, 5).forEach(url => {
                if(url) {
                    galleryHtml += `<div style="width: 100px; height: 100px; border-radius: 8px; overflow: hidden; border: 1px solid var(--border);">
                        <img src="${Utils.safeMediaUrl(url)}" alt="Photo de la galerie" style="width: 100%; height: 100%; object-fit: cover; cursor: pointer;" onclick="window.open('${Utils.safeMediaUrl(url)}', '_blank')" onerror="this.parentElement.style.display='none'">
                    </div>`;
                }
            });
            galleryHtml += '</div>';
        }
        
        // Bio / Description
        const bioSection = document.getElementById('pm-bio-section');
        const bioEl = document.getElementById('pm-bio');
        const bioText = fullProfile.bio || fullProfile.description || fullProfile.synopsis || '';
        if(bioText || galleryHtml) {
            bioSection.style.display = 'block';
            bioEl.innerHTML = galleryHtml + (bioText ? '<p>' + Utils.escape(bioText) + '</p>' : '');
        } else {
            bioSection.style.display = 'none';
        }
        
        // Infos selon le type
        const infoEl = document.getElementById('pm-info');
        let infoHtml = '';
        
        if(isActor) {
            // Section Identité (toujours visible sauf si cachée)
            if(fullProfile.gender && UniverseProfileModal.isSectionVisible(fullProfile, 'identity', 'public')) infoHtml += `<div class="profile-modal-info-item"><label>Genre</label><span>${Utils.escape(fullProfile.gender)}</span></div>`;
            
            // Section Description Physique
            if(UniverseProfileModal.isSectionVisible(fullProfile, 'physical', 'public')) {
                if(fullProfile.age) infoHtml += `<div class="profile-modal-info-item"><label>Âge</label><span>${Utils.escape(fullProfile.age)} ans</span></div>`;
                if(fullProfile.height) infoHtml += `<div class="profile-modal-info-item"><label>Taille</label><span>${Utils.escape(fullProfile.height)} cm</span></div>`;
                if(fullProfile.weight) infoHtml += `<div class="profile-modal-info-item"><label>Poids</label><span>${Utils.escape(fullProfile.weight)} kg</span></div>`;
                if(fullProfile.eyeColor) infoHtml += `<div class="profile-modal-info-item"><label>Yeux</label><span>${Utils.escape(fullProfile.eyeColor)}</span></div>`;
                if(fullProfile.hairColor) infoHtml += `<div class="profile-modal-info-item"><label>Cheveux</label><span>${Utils.escape(fullProfile.hairColor)}${fullProfile.hairLength ? ' (' + Utils.escape(fullProfile.hairLength) + ')' : ''}</span></div>`;
                if(fullProfile.corpulence) infoHtml += `<div class="profile-modal-info-item"><label>Corpulence</label><span>${Utils.escape(fullProfile.corpulence)}</span></div>`;
                if(fullProfile.bonnet || fullProfile.bustSize) infoHtml += `<div class="profile-modal-info-item"><label>Poitrine</label><span>${fullProfile.bonnet ? 'Bonnet ' + Utils.escape(fullProfile.bonnet) : ''}${fullProfile.bustSize ? ' (' + Utils.escape(fullProfile.bustSize) + ' cm)' : ''}${fullProfile.bustType ? ' - ' + Utils.escape(fullProfile.bustType) : ''}</span></div>`;
                if(fullProfile.ethnicity) infoHtml += `<div class="profile-modal-info-item"><label>Origine</label><span>${Utils.escape(fullProfile.ethnicity)}</span></div>`;
            }
            if(fullProfile.languages) infoHtml += `<div class="profile-modal-info-item"><label>Langues</label><span>${Utils.escape(fullProfile.languages)}</span></div>`;
            if(fullProfile.sports) infoHtml += `<div class="profile-modal-info-item"><label>Sports</label><span>${Utils.escape(fullProfile.sports)}</span></div>`;
            
            // Section Tarif
            if(UniverseProfileModal.isSectionVisible(fullProfile, 'tarif', 'public')) {
                if(fullProfile.dailyRate) infoHtml += `<div class="profile-modal-info-item"><label>Tarif</label><span>${Utils.escape(fullProfile.dailyRate)} ${Utils.escape(fullProfile.rateCurrency || '€')}/${Utils.escape(fullProfile.rateType || 'Jour')}</span></div>`;
            }
            
            // Section Véhicule
            if(UniverseProfileModal.isSectionVisible(fullProfile, 'vehicle', 'public')) {
                if(fullProfile.hasVehicle) infoHtml += `<div class="profile-modal-info-item"><label>Véhicule</label><span>🚗 ${Utils.escape(fullProfile.vehicleType || 'Oui')}${fullProfile.vehicleSeats ? ' (' + Utils.escape(fullProfile.vehicleSeats) + ' places)' : ''}</span></div>`;
            }
        } else if(isCrew) {
            // Section Identité
            if(UniverseProfileModal.isSectionVisible(fullProfile, 'identity', 'public')) {
                if(fullProfile.gender) infoHtml += `<div class="profile-modal-info-item"><label>Genre</label><span>${Utils.escape(fullProfile.gender)}</span></div>`;
            }
            
            // Section Métier & Compétences
            if(UniverseProfileModal.isSectionVisible(fullProfile, 'skills', 'public')) {
                if(fullProfile.department) {
                    const deptName = CONFIG.crewGroups.find(g => g.id === fullProfile.department)?.name || fullProfile.department;
                    infoHtml += `<div class="profile-modal-info-item"><label>Département</label><span>${Utils.escape(deptName)}</span></div>`;
                }
                if(fullProfile.experience) infoHtml += `<div class="profile-modal-info-item"><label>Expérience</label><span>${Utils.escape(fullProfile.experience)}</span></div>`;
                if(fullProfile.languages) infoHtml += `<div class="profile-modal-info-item"><label>Langues</label><span>${Utils.escape(fullProfile.languages)}</span></div>`;
            }
            
            // Section Tarif
            if(UniverseProfileModal.isSectionVisible(fullProfile, 'tarif', 'public')) {
                if(fullProfile.dailyRate) infoHtml += `<div class="profile-modal-info-item"><label>Tarif</label><span>${Utils.escape(fullProfile.dailyRate)} ${Utils.escape(fullProfile.rateCurrency || '€')}/${Utils.escape(fullProfile.rateType || 'Jour')}</span></div>`;
            }
            
            // Section Véhicule
            if(UniverseProfileModal.isSectionVisible(fullProfile, 'vehicle', 'public')) {
                if(fullProfile.hasVehicle) infoHtml += `<div class="profile-modal-info-item"><label>Véhicule</label><span>🚗 ${Utils.escape(fullProfile.vehicleType || 'Oui')}${fullProfile.vehicleSeats ? ' (' + Utils.escape(fullProfile.vehicleSeats) + ' places)' : ''}</span></div>`;
            }
        } else if(isProject) {
            if(fullProfile.genre) infoHtml += `<div class="profile-modal-info-item"><label>Genre</label><span>${Utils.escape(fullProfile.genre)}</span></div>`;
            if(fullProfile.director) infoHtml += `<div class="profile-modal-info-item"><label>Réalisateur</label><span>${Utils.escape(fullProfile.director)}</span></div>`;
            if(fullProfile.producer) infoHtml += `<div class="profile-modal-info-item"><label>Producteur</label><span>${Utils.escape(fullProfile.producer)}</span></div>`;
            if(fullProfile.status) infoHtml += `<div class="profile-modal-info-item"><label>Statut</label><span>${Utils.escape(fullProfile.status)}</span></div>`;
        } else if(isAssociation || isEnterprise) {
            if(fullProfile.siret) infoHtml += `<div class="profile-modal-info-item"><label>SIRET</label><span>${Utils.escape(fullProfile.siret)}</span></div>`;
            if(fullProfile.services) infoHtml += `<div class="profile-modal-info-item col-span-2"><label>Services</label><span>${Utils.escape(fullProfile.services)}</span></div>`;
        }
        
        if(fullProfile.availabilityText) infoHtml += `<div class="profile-modal-info-item col-span-2"><label>Disponibilité</label><span>${Utils.escape(fullProfile.availabilityText)}</span></div>`;
        
        infoEl.innerHTML = infoHtml || '<p class="text-sec">Pas d\'informations supplémentaires</p>';
        
        // Contact (vérifier visibilité de la section identité)
        const contactEl = document.getElementById('pm-contact');
        let contactHtml = '';
        if(UniverseProfileModal.isSectionVisible(fullProfile, 'identity', 'public')) {
            const email = fullProfile.email || fullProfile.ownerEmail || '';
            const phone = fullProfile.phone || '';
            const website = fullProfile.website || '';
            if(email) contactHtml += `<div class="profile-modal-info-item"><label>Email</label><span>${Utils.escape(email)}</span></div>`;
            if(phone) contactHtml += `<div class="profile-modal-info-item"><label>${fullProfile.phone_is_agent ? 'Téléphone (agent)' : 'Téléphone'}</label><span>${Utils.escape(phone)}</span></div>`;
            if(website) contactHtml += `<div class="profile-modal-info-item col-span-2"><label>Site web</label><span><a href="${Utils.safeUrl(website)}" target="_blank" rel="noopener">${Utils.escape(website)}</a></span></div>`;
        }
        contactEl.innerHTML = contactHtml || '<p class="text-sec">Pas de contact public</p>';
        
        // Dates de tournage prévues
        const shootingSection = document.getElementById('pm-shooting-section');
        const shootingEl = document.getElementById('pm-shooting-dates');
        const shootingDates = fullProfile.shootingDates || [];
        
        // Filtrer les dates futures uniquement
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const futureDates = shootingDates.filter(sd => new Date(sd.date) >= today).sort((a, b) => new Date(a.date) - new Date(b.date));
        
        if(futureDates.length > 0) {
            shootingSection.style.display = 'block';
            let shootingHtml = '<div style="display: flex; flex-direction: column; gap: 8px;">';
            futureDates.slice(0, 5).forEach(sd => {
                const dateObj = new Date(sd.date);
                const dateStr = dateObj.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
                shootingHtml += `<div style="display: flex; align-items: center; gap: 10px; padding: 8px 12px; background: linear-gradient(135deg, #ff6b35, #f7931e); color: white; border-radius: 6px;">
                    <span style="font-size: 1.2rem;">🎬</span>
                    <div class="flex-1">
                        <div class="fw-bold">${dateStr}</div>
                        <div style="font-size: 0.85rem; opacity: 0.9;">${Utils.escape(sd.projectName || 'Projet')}${sd.location ? ' - ' + Utils.escape(sd.location) : ''}</div>
                    </div>
                    ${sd.callTime ? `<div class="fs-085">⏰ ${sd.callTime}</div>` : ''}
                </div>`;
            });
            if(futureDates.length > 5) {
                shootingHtml += `<div style="text-align: center; color: var(--text-sec); font-size: 0.85rem;">+ ${futureDates.length - 5} autre(s) date(s)...</div>`;
            }
            shootingHtml += '</div>';
            shootingEl.innerHTML = shootingHtml;
        } else {
            shootingSection.style.display = 'none';
            shootingEl.innerHTML = '';
        }
        
        // Bande Démo (vérifier visibilité)
        const demoreelSection = document.getElementById('pm-demoreel-section');
        const demoreelEl = document.getElementById('pm-demoreel');
        const demoreelSectionKey = fullProfile.type === 'crew' ? 'crew-demoreel' : 'demoreel';
        if(fullProfile.demoreel && UniverseProfileModal.isSectionVisible(fullProfile, demoreelSectionKey, 'public')) {
            demoreelSection.style.display = 'block';
            const embedUrl = ProfileRenderer.getEmbedUrl(fullProfile.demoreel);
            demoreelEl.innerHTML = `<iframe src="${embedUrl}" width="100%" height="250" frameborder="0" allowfullscreen class="br-8"></iframe>`;
        } else {
            demoreelSection.style.display = 'none';
            demoreelEl.innerHTML = '';
        }
        
        // Actualité du profil (filtrée sur le profil précis, H3)
        const actualiteSection = document.getElementById('pm-actualite-section');
        const actualiteEl = document.getElementById('pm-actualite');
        try {
            const { data: actualites, error: errActu } = await supabase
                .from('profile_actualites')
                .select('*')
                .eq('profile_id', fullProfile.id)
                .order('created_at', { ascending: false })
                .limit(5);
            if(errActu) console.warn('[PublicProfile] actualités:', errActu);
            
            if(actualites && actualites.length > 0) {
                actualiteSection.style.display = 'block';
                actualiteEl.innerHTML = actualites.map(a => `
                    <div style="display: inline-block; min-width: 250px; max-width: 300px; padding: 15px; margin-right: 10px; background: var(--bg); border-radius: 10px; border: 1px solid var(--border); white-space: normal; vertical-align: top;">
                        <div style="font-size: 0.8rem; color: var(--text-sec); margin-bottom: 8px;">${Utils.timeAgo(a.created_at)}</div>
                        <div style="font-size: 0.95rem;">${Utils.escape(a.content)}</div>
                        ${a.image ? `<img src="${Utils.safeMediaUrl(a.image)}" alt="Image de l'actualité" style="width: 100%; border-radius: 6px; margin-top: 10px;">` : ''}
                    </div>
                `).join('');
            } else {
                actualiteSection.style.display = 'none';
            }
        } catch(e) {
            actualiteSection.style.display = 'none';
        }
        
        const _ideaBtn = document.getElementById('pm-idea-btn');
        if(_ideaBtn) _ideaBtn.style.display = (typeof GlobalSearch !== 'undefined' && GlobalSearch._castingCharId) ? '' : 'none';
        document.getElementById('profile-modal-overlay').style.display = 'flex';
        UniverseProfileModal.updateFavoriteButton();
    },
    
    // Ferme le modal
    closeProfileModal: () => {
        UniverseProfileModal._clearHqMarker();
        document.getElementById('profile-modal-overlay').style.display = 'none';
        Universe.currentProfile = null;
    },
    
    // Export PDF du profil
    exportProfilePDF: async () => {
        const profile = Universe.currentProfile;
        if(!profile) return;
        
        Utils.toast('Génération du PDF en cours...', 'info');
        
        await LazyLib.load('pdfexport'); const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 15;
        let y = 0;
        
        const isActor = profile.type === 'actor';
        const isCrew = profile.type === 'crew';
        const isAssociation = profile.type === 'association';
        const isEnterprise = profile.type === 'enterprise';
        
        const name = profile.name || profile.displayName || profile.assoName || profile.entName || 'Sans nom';
        const extraData = profile.data || {};
        let roleText = '';
        if(isActor) roleText = profile.role || extraData.role || 'Comédien·ne';
        else if(isCrew) roleText = profile.role || extraData.role || extraData.department || 'Technicien·ne';
        else if(isAssociation) roleText = profile.assoType || extraData.assoType || 'Association';
        else if(isEnterprise) roleText = profile.entType || extraData.entType || 'Entreprise';
        const city = profile.city || profile.location || '';
        const photoUrl = profile.photo || profile.photoURL || profile.mainPhoto || null;
        
        // ===== HELPER : Charger image en base64 =====
        const loadImg = (url) => new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                try {
                    const c = document.createElement('canvas');
                    c.width = img.naturalWidth; c.height = img.naturalHeight;
                    c.getContext('2d').drawImage(img, 0, 0);
                    resolve(c.toDataURL('image/jpeg', 0.85));
                } catch(e) { resolve(null); }
            };
            img.onerror = () => resolve(null);
            setTimeout(() => resolve(null), 5000);
            img.src = Utils.signedUrlFor(url);
        });
        
        // ===== HELPER : Section colorée =====
        const addSection = (title, rgb) => {
            if(y > pageHeight - 30) { doc.addPage(); y = margin; }
            doc.setFillColor(rgb[0], rgb[1], rgb[2]);
            doc.roundedRect(margin, y, pageWidth - margin * 2, 9, 1.5, 1.5, 'F');
            doc.setTextColor(...PdfTheme.COLORS.WHITE);
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.text(title, margin + 5, y + 6.5);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_PRIMARY);
            doc.setFont('helvetica', 'normal');
            y += 14;
        };
        
        // ===== HELPER : Ligne label/valeur =====
        const addInfo = (label, value, opts) => {
            if(!value) return;
            if(y > pageHeight - 15) { doc.addPage(); y = margin; }
            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...PdfTheme.COLORS.TEXT_LIGHT);
            doc.text(label, margin + 3, y);
            doc.setFont('helvetica', 'normal');
            if(opts && opts.color) doc.setTextColor(opts.color[0], opts.color[1], opts.color[2]);
            else doc.setTextColor(...PdfTheme.COLORS.TEXT_PRIMARY);
            const val = String(value);
            if(val.length > 55) {
                const lines = doc.splitTextToSize(val, pageWidth - margin - 50);
                doc.text(lines, margin + 45, y);
                y += lines.length * 4.5 + 2;
            } else {
                doc.text(val, margin + 45, y);
                y += 6;
            }
        };
        
        // ===== HEADER BLEU =====
        doc.setFillColor(...PdfTheme.COLORS.BANNER_BLUE);
        doc.rect(0, 0, pageWidth, 55, 'F');
        doc.setFillColor(...PdfTheme.COLORS.BANNER_BLUE);
        doc.rect(0, 50, pageWidth, 5, 'F');
        
        // Photo de profil
        let photoLoaded = false;
        if(photoUrl) {
            try {
                const imgData = await loadImg(photoUrl);
                if(imgData) {
                    doc.setFillColor(...PdfTheme.COLORS.WHITE);
                    doc.roundedRect(margin + 1, 9, 32, 37, 3, 3, 'F');
                    doc.addImage(imgData, 'JPEG', margin + 2, 10, 30, 35);
                    photoLoaded = true;
                }
            } catch(e) {}
        }
        
        const textX = photoLoaded ? margin + 40 : pageWidth / 2;
        const textAlign = photoLoaded ? { align: 'left' } : { align: 'center' };
        
        doc.setTextColor(...PdfTheme.COLORS.WHITE);
        doc.setFontSize(20);
        doc.setFont('helvetica', 'bold');
        doc.text(name.length > 30 ? name.substring(0, 30) + '...' : name, textX, 24, textAlign);
        
        doc.setFontSize(12);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...PdfTheme.COLORS.WHITE);
        doc.text(roleText, textX, 33, textAlign);
        
        if(city) {
            doc.setFontSize(10);
            doc.setTextColor(...PdfTheme.COLORS.WHITE);
            doc.text(city, textX, 42, textAlign);
        }
        
        y = 65;
        
        // ===== BIO / DESCRIPTION =====
        const bio = profile.bio || profile.description || profile.assoMission || profile.entDescription || '';
        if(bio) {
            addSection(isAssociation ? 'MISSION' : isEnterprise ? 'DESCRIPTION' : 'BIOGRAPHIE', [43, 110, 246]);
            doc.setFontSize(9.5);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_BODY);
            const bioLines = doc.splitTextToSize(bio, pageWidth - margin * 2 - 6);
            bioLines.forEach(line => {
                if(y > pageHeight - 15) { doc.addPage(); y = margin; }
                doc.text(line, margin + 3, y);
                y += 4.8;
            });
            y += 6;
        }
        
        // ===== INFOS COMÉDIEN =====
        if(isActor) {
            const hasPhysical = profile.gender || profile.age || profile.height || profile.weight || profile.eyeColor || profile.hairColor || profile.corpulence || profile.ethnicity;
            if(hasPhysical) {
                addSection('DESCRIPTION PHYSIQUE', [76, 175, 80]);
                addInfo('Genre', profile.gender);
                addInfo('Âge', profile.age ? profile.age + ' ans' : '');
                addInfo('Taille', profile.height ? profile.height + ' cm' : '');
                addInfo('Poids', profile.weight ? profile.weight + ' kg' : '');
                addInfo('Yeux', profile.eyeColor);
                addInfo('Cheveux', profile.hairColor ? profile.hairColor + (profile.hairLength ? ' (' + profile.hairLength + ')' : '') : '');
                addInfo('Corpulence', profile.corpulence);
                addInfo('Origine', profile.ethnicity);
                y += 4;
            }
            if(profile.languages || profile.sports) {
                addSection('COMPÉTENCES', [156, 39, 176]);
                addInfo('Langues', profile.languages);
                addInfo('Sports', profile.sports);
                y += 4;
            }
        }
        
        // ===== INFOS TECHNICIEN =====
        if(isCrew) {
            addSection('COMPÉTENCES & MÉTIER', [76, 175, 80]);
            if(profile.department) {
                const deptName = CONFIG.crewGroups.find(g => g.id === profile.department)?.name || profile.department;
                addInfo('Département', deptName);
            }
            addInfo('Expérience', profile.experience);
            // v601 : « equipment » n'a jamais existe sur un profil — la ligne ne
            // s'est donc jamais affichee. Les vrais champs sont cameras et lenses.
            if(profile.cameras && profile.cameras.length > 0) addInfo('Caméras', profile.cameras.join(', '));
            if(profile.lenses && profile.lenses.length > 0) addInfo('Objectifs', profile.lenses.join(', '));
            y += 4;
        }
        
        // ===== INFOS ASSOCIATION =====
        if(isAssociation) {
            addSection('INFORMATIONS', [76, 175, 80]);
            addInfo('Type', profile.assoType);
            addInfo('SIRET', profile.siret);
            addInfo('Services', profile.services);
            y += 4;
        }
        
        // ===== INFOS ENTREPRISE =====
        if(isEnterprise) {
            addSection('INFORMATIONS', [76, 175, 80]);
            addInfo('Type', profile.entType);
            addInfo('SIRET', profile.siret);
            addInfo('Services', profile.services);
            y += 4;
        }
        
        // ===== TARIF & DISPONIBILITÉ =====
        if(profile.dailyRate || profile.availabilityText || profile.hasVehicle) {
            addSection('TARIF & DISPONIBILITÉ', [255, 152, 0]);
            addInfo('Tarif', profile.dailyRate ? profile.dailyRate + ' ' + (profile.rateCurrency || '€') + ' / ' + (profile.rateType || 'Jour') : '');
            addInfo('Disponibilité', profile.availabilityText);
            if(profile.hasVehicle) addInfo('Véhicule', (profile.vehicleType || 'Oui') + (profile.vehicleSeats ? ' (' + profile.vehicleSeats + ' places)' : ''));
            y += 4;
        }
        
        // ===== CONTACT =====
        const email = profile.email || profile.ownerEmail || '';
        const phone = profile.phone || '';
        const website = profile.website || '';
        const demoreel = profile.demoreel || '';
        if(email || phone || website || demoreel) {
            addSection('CONTACT', [96, 125, 139]);
            addInfo('Email', email, { color: [43, 110, 246] });
            addInfo(profile.phone_is_agent ? 'Téléphone (agent)' : 'Téléphone', phone);
            addInfo('Site web', website, { color: [43, 110, 246] });
            addInfo('Bande démo', demoreel, { color: [43, 110, 246] });
            y += 4;
        }
        
        // ===== GALERIE PHOTOS =====
        const galleryPhotos = profile.galleryPhotos || profile.crewGalleryPhotos || [];
        if(galleryPhotos.length > 0) {
            addSection('GALERIE', [233, 30, 99]);
            let photoX = margin + 3;
            for(const url of galleryPhotos.slice(0, 3)) {
                if(!url) continue;
                try {
                    const imgData = await loadImg(url);
                    if(imgData) {
                        if(y + 52 > pageHeight - 15) { doc.addPage(); y = margin; }
                        doc.setDrawColor(...PdfTheme.COLORS.BORDER_LIGHT);
                        doc.roundedRect(photoX - 0.5, y - 0.5, 51, 51, 2, 2, 'S');
                        doc.addImage(imgData, 'JPEG', photoX, y, 50, 50);
                        photoX += 55;
                    }
                } catch(e) {}
            }
            if(photoX > margin + 3) y += 58;
        }
        
        // ===== FOOTER sur toutes les pages =====
        const totalPages = doc.internal.getNumberOfPages();
        for(let i = 1; i <= totalPages; i++) {
            doc.setPage(i);
            doc.setDrawColor(...PdfTheme.COLORS.BORDER);
            doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);
            doc.setFontSize(7.5);
            doc.setTextColor(...PdfTheme.COLORS.TEXT_FAINT);
            doc.text('Généré par Moteur — moteur.studio', margin, pageHeight - 7);
            doc.text(new Date().toLocaleDateString('fr-FR'), pageWidth / 2, pageHeight - 7, { align: 'center' });
            doc.text('Page ' + i + '/' + totalPages, pageWidth - margin, pageHeight - 7, { align: 'right' });
        }
        
        // Télécharger
        const safeProfileName = name.replace(/[\\/:*?"<>|]/g, '_').trim();
        doc.save(`${safeProfileName} - Profil - moteur.studio.pdf`);
        Utils.toast('PDF profil exporté !', 'success');
    },
    
    // Favoris (utilise maintenant state.contacts via Contacts.loadAndRender)
    isFavorite: (profileId, profileType) => {
        if(!state.contacts) return false;
        const typeMap = {
            actor: 'actors',
            crew: 'crew',
            project: 'projects',
            association: 'associations',
            enterprise: 'enterprises'
        };
        const contactType = typeMap[profileType] || 'actors';
        if(!state.contacts[contactType]) return false;
        return state.contacts[contactType].some(c => c.publicProfileId === profileId || c.contact_email === profileId);
    },
    
    toggleFavorite: async () => {
        const profile = Universe.currentProfile;
        if(!profile || !state.currentUser) return;
        
        const btn = document.getElementById('pm-favorite-btn');
        const emailKey = Utils.sanitizeEmail(state.currentUser.email);
        
        // Déterminer le type de contact
        const typeMap = {
            actor: 'actors',
            crew: 'crew',
            project: 'projects',
            association: 'associations',
            enterprise: 'enterprises'
        };
        const contactType = typeMap[profile.type] || 'actors';
        
        // S'assurer que state.contacts existe
        if(!state.contacts) state.contacts = { actors: [], crew: [], projects: [], associations: [], enterprises: [] };
        if(!state.contacts[contactType]) state.contacts[contactType] = [];
        
        // Vérifier si déjà en favoris
        const profileId = profile.id || profile.projectId;
        const existingIndex = state.contacts[contactType].findIndex(c => c.publicProfileId === profileId || c.contact_email === profileId || c.publicProfileId === profile.projectId);
        
        if(existingIndex >= 0) {
            // Retirer des favoris
            const contactToRemove = state.contacts[contactType][existingIndex];
            state.contacts[contactType].splice(existingIndex, 1);
            const {error: delFavErr2} = await supabase.from('contacts').delete().eq('id', contactToRemove.id);
            if(delFavErr2) { console.error('Erreur suppression favori:', delFavErr2); Toast.show('Erreur suppression favori', 'error'); return; }
            btn.textContent = '☆';
            btn.classList.remove('active');
            Utils.toast('Retiré des favoris', 'info');
        } else {
            // Ajouter aux favoris
            // Convertir le type pluriel en singulier pour la base de données
            const dbTypeMap = { actors: 'actor', crew: 'crew', projects: 'project', associations: 'association', enterprises: 'enterprise' };
            const dbContactType = dbTypeMap[contactType] || profile.type || 'actor';
            
            const contactData = {
                owner_email: state.currentUser.email.toLowerCase(),
                contact_email: profile.email || profile.id || '',
                contact_type: dbContactType,
                name: profile.name || profile.title || profile.assoName || profile.entName || '',
                notes: JSON.stringify({ ...profile, publicProfileId: profile.id }),
                created_at: new Date().toISOString()
            };
            
            const { data: newContact, error } = await supabase
                .from('contacts')
                .upsert(contactData, { onConflict: 'owner_email,contact_email' })
                .select()
                .single();
            
            if(error) {
                if(error.code === '23505') {
                    btn.textContent = '★';
                    btn.classList.add('active');
                    Utils.toast('Déjà dans vos favoris !', 'info');
                    return;
                }
                console.error('Erreur ajout favori:', error);
                Utils.toast('Erreur lors de l\'ajout', 'error');
                return;
            }
            
            if(newContact) {
                state.contacts[contactType].push({ ...profile, id: newContact.id, publicProfileId: profile.id });
            }
            btn.textContent = '★';
            btn.classList.add('active');
            Utils.toast('Ajouté aux favoris !', 'success');
        }
    },
    
    updateFavoriteButton: () => {
        const profile = Universe.currentProfile;
        const btn = document.getElementById('pm-favorite-btn');
        if(!profile || !btn) return;
        
        if(UniverseProfileModal.isFavorite(profile.id, profile.type)) {
            btn.textContent = '★';
            btn.classList.add('active');
        } else {
            btn.textContent = '☆';
            btn.classList.remove('active');
        }
    },
    
    
    
    // Contacter un profil : on affiche l'email de contact PUBLIC de la fiche (jamais l'email du compte)
    contactProfile: async () => {
        if(!Universe.currentProfile) return;
        const profile = Universe.currentProfile;
        const profileName = profile.name || profile.assoName || profile.entName || 'ce profil';
        const isAsso = profile.type === 'association';
        const isEnt = profile.type === 'enterprise';
        const publicEmail = ((isAsso ? profile.assoEmail : isEnt ? profile.entEmail : profile.contactEmail) || '').trim();
        const publicPhone = ((isAsso ? profile.assoPhone : isEnt ? profile.entPhone : profile.phone) || '').trim();

        const modal = document.createElement('div');
        modal.id = 'contact-profile-modal';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); display: flex; justify-content: center; align-items: center; z-index: var(--z-modal);';

        const row = (label, value, id, href, hrefLabel) => `
            <p style="color: var(--text-sec); margin: 0 0 6px;">${label} :</p>
            <div style="display:flex; gap:8px; align-items:center; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; margin-bottom: 6px;">
                <code id="${id}" style="flex:1; font-size: 0.95rem; word-break: break-all;">${Utils.escape(value)}</code>
                <button onclick="app.UniverseProfileModal.copyContactValue('${id}')" class="btn btn--primary" style="white-space: nowrap;">📋 Copier</button>
            </div>
            <a href="${href}" style="color: var(--primary); display:inline-block; margin-bottom:16px;">${hrefLabel}</a>`;

        let inner = '';
        if(publicEmail) inner += row('Adresse de contact', publicEmail, 'contact-public-email', 'mailto:' + Utils.escape(publicEmail), '✉️ Écrire un email');
        if(publicPhone) inner += row(profile.phone_is_agent ? 'Téléphone (agent)' : 'Téléphone', publicPhone, 'contact-public-phone', 'tel:' + Utils.escape(publicPhone.replace(/\s/g, '')), '📞 Appeler');
        if(!inner) inner = `<p style="color: var(--text-sec); margin: 0;">${Utils.escape(profileName)} n'a pas indiqué de contact public sur cette fiche.</p>`;

        modal.innerHTML = `
            <div style="background: var(--panel-bg); border-radius: 12px; width: 90%; max-width: 460px; padding: 20px;">
                <div class="section-header-20">
                    <h3 class="m-0">📧 Contacter ${Utils.escape(profileName)}</h3>
                    <button onclick="document.getElementById('contact-profile-modal').remove()" class="icon-btn-sec">✖</button>
                </div>
                <div class="mb-15">${inner}</div>
            </div>
        `;
        document.body.appendChild(modal);
    },

    copyContactValue: (elId) => {
        const el = document.getElementById(elId);
        if(!el) return;
        const val = el.textContent;
        const done = () => Utils.toast('Copié !', 'success');
        if(navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(val).then(done).catch(() => Utils.toast('Copie impossible, sélectionnez manuellement.', 'warning'));
        } else {
            Utils.toast('Copie impossible, sélectionnez manuellement.', 'warning');
        }
    },

    // Ajouter à un projet
    addToProject: async () => {
        if(!Universe.currentProfile) return;
        
        // Charger mes projets où je suis owner
        const { data: memberData, error } = await supabase
            .from('project_members')
            .select('project_id, role, projects(id, title)')
            .eq('user_id', state.currentUser.id)
            .eq('role', 'owner');
        
        if(error) {
            console.error('Erreur chargement projets:', error);
            return;
        }
        
        const myProjects = (memberData || [])
            .filter(m => m.projects)
            .map(m => ({ id: m.project_id, title: m.projects.title }));
        
        if(myProjects.length === 0) {
            Utils.toast('Vous n\'avez pas encore de projet. Créez-en un d\'abord !', 'warning');
            return;
        }
        
        // Afficher la liste des projets
        const listEl = document.getElementById('select-project-list');
        listEl.innerHTML = '';
        
        myProjects.forEach(p => {
            const btn = document.createElement('button');
            btn.style.cssText = 'width: 100%; padding: 12px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; cursor: pointer; text-align: left; font-size: 0.95rem;';
            btn.innerHTML = `📁 ${Utils.escape(p.title)}`;
            btn.onmouseover = () => btn.style.borderColor = 'var(--primary)';
            btn.onmouseout = () => btn.style.borderColor = 'var(--border)';
            btn.onclick = () => UniverseProfileModal.sendProjectRequest(p);
            listEl.appendChild(btn);
        });
        
        document.getElementById('select-project-modal').style.display = 'flex';
    },
    
    // Envoyer une demande de participation
    sendProjectRequest: async (project) => {
        const profile = Universe.currentProfile;
        if(!profile) return;
        
        try {
    // Cloche in-app + email externe direct (plus de message interne)
            const requesterName = state.userProfile?.displayName || state.currentUser.email.split('@')[0];
            await Notifications.send(profile.email, 'invite', `${requesterName} souhaite vous ajouter au projet \"${project.title}\"`, project.id);
            
            await Messages.sendEmailPing(profile.email, profile.name, 'invitation', {
                senderName: state.userProfile?.displayName || state.currentUser.email.split('@')[0],
                projectTitle: project.title,
                role: 'collaborateur'
            });
            
            document.getElementById('select-project-modal').style.display = 'none';
            UniverseProfileModal.closeProfileModal();
            
            Utils.toast(`Demande envoyée à ${profile.name} !`, 'success');
            
        } catch(e) {
            console.error('Erreur envoi demande:', e);
            Utils.toast('Erreur lors de l\'envoi de la demande', 'error');
        }
    },
    
};

const UniverseMap = {
    // Initialiser la carte
    initMap: async () => {
        await LazyLib.load('leaflet');
        if(Universe.map) return; // Déjà initialisée
        
        const mapContainer = document.getElementById('universe-map');
        if(!mapContainer) return;
        
        // Créer la carte centrée sur la France
        Universe.map = L.map('universe-map', {
            center: [46.603354, 1.888334],
            zoom: 5,
            minZoom: 2,
            maxZoom: 18,
            zoomControl: true
        });
        
        // Tuiles selon le thème
        UniverseMap.updateMapTheme();
        
        // Groupe de marqueurs avec clustering
        Universe.markersLayer = L.markerClusterGroup({
            maxClusterRadius: 50,
            spiderfyOnMaxZoom: true,
            showCoverageOnHover: false,
            zoomToBoundsOnClick: true,
            disableClusteringAtZoom: 14,
            spiderfyDistanceMultiplier: 1.5,
            iconCreateFunction: (cluster) => {
                const count = cluster.getChildCount();
                let size = 'small';
                if(count > 10) size = 'medium';
                if(count > 50) size = 'large';
                return L.divIcon({
                    html: `<div>${count}</div>`,
                    className: `marker-cluster marker-cluster-${size}`,
                    iconSize: [40, 40]
                });
            }
        });
        
        Universe.map.addLayer(Universe.markersLayer);
        
        // Événement hover sur cluster
        Universe.markersLayer.on('clustermouseover', (e) => {
            const cluster = e.layer;
            const markers = cluster.getAllChildMarkers();
            if(markers.length > 0) {
                const randomMarker = markers[Math.floor(Math.random() * markers.length)];
                UniverseMap.showHoverCard(randomMarker.options.profileData, e.originalEvent);
            }
        });
        
        Universe.markersLayer.on('clustermouseout', () => {
            UniverseMap.hideHoverCard();
        });
        
        // NOTE: On ne recharge plus les marqueurs au déplacement/zoom
        // car les positions sont maintenant fixes (déterministes)
    },
    
    // Ajoute un léger décalage aléatoire pour éviter la superposition
    addCoordOffset: (lat, lng) => {
        const offset = 0.002; // ~200m de décalage max
        const randomLat = lat + (Math.random() - 0.5) * offset;
        const randomLng = lng + (Math.random() - 0.5) * offset;
        return { lat: randomLat, lng: randomLng };
    },
    
    // Génère un décalage déterministe basé sur l'ID du profil (toujours le même pour un même profil)
    getDeterministicOffset: (profileId, lat, lng) => {
        // Hash simple basé sur l'ID pour générer un nombre pseudo-aléatoire reproductible
        let hash = 0;
        const str = String(profileId);
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        
        // Utiliser le hash pour générer un décalage entre -0.003 et +0.003 (~300m)
        const offsetRange = 0.003;
        const latOffset = ((hash % 1000) / 1000 - 0.5) * offsetRange * 2;
        const lngOffset = (((hash >> 10) % 1000) / 1000 - 0.5) * offsetRange * 2;
        
        return {
            lat: lat + latOffset,
            lng: lng + lngOffset
        };
    },
    
    // Détermine si l'adresse doit être masquée pour ce profil
    shouldHideAddress: (profile) => {
        // Comédiens et techniciens : toujours masqué dans l'Univers
        if (profile.type === 'actor' || profile.type === 'crew') {
            return true;
        }
        // Associations et entreprises : selon leur choix
        if (profile.type === 'association' || profile.type === 'enterprise') {
            return profile.hideAddress === true;
        }
        // Projets : hérite du porteur de projet
        if (profile.type === 'project') {
            return true; // On masque par défaut pour les projets
        }
        return false;
    },
    
    // Géocoder une ville : DB > cache mémoire > localStorage > Nominatim (throttlé)
    geocodeCity: async (city) => {
        if(!city) return null;
        
        const cityKey = city.toLowerCase().trim();
        
        // 1) Cache mémoire (le plus rapide)
        if(Universe.geoCache[cityKey]) {
            return Universe.geoCache[cityKey];
        }
        
        // 2) localStorage (persistant entre sessions)
        try {
            const cached = localStorage.getItem('fmp_geocache');
            if(cached) {
                const cacheData = JSON.parse(cached);
                if(cacheData[cityKey]) {
                    Universe.geoCache[cityKey] = cacheData[cityKey];
                    return cacheData[cityKey];
                }
            }
        } catch(e) {}
        
        // 3) Base Supabase — coordonnées pré-calculées côté serveur
        //    (colonnes latitude/longitude ajoutées via patch_C1 + remplies via patch_C2)
        try {
            const { data: dbRow, error: dbErr } = await supabase
                .from('user_profiles')
                .select('latitude, longitude')
                .ilike('city', city.trim())
                .not('latitude', 'is', null)
                .not('longitude', 'is', null)
                .limit(1)
                .maybeSingle();
            
            if(!dbErr && dbRow && dbRow.latitude != null && dbRow.longitude != null) {
                const result = { lat: dbRow.latitude, lng: dbRow.longitude };
                Universe.geoCache[cityKey] = result;
                // Persister dans localStorage pour accélérer la prochaine fois
                try {
                    const cached = localStorage.getItem('fmp_geocache');
                    const cacheData = cached ? JSON.parse(cached) : {};
                    cacheData[cityKey] = result;
                    localStorage.setItem('fmp_geocache', JSON.stringify(cacheData));
                } catch(e) {}
                return result;
            }
        } catch(e) {
            console.warn('DB geocoding lookup failed:', e);
        }
        
        // 4) Fallback Nominatim avec throttle 1.1s (respect usage policy OSM)
        //    File d'attente globale pour ne jamais dépasser 1 requête/seconde
        if(!Universe._nominatimQueue) Universe._nominatimQueue = Promise.resolve();
        
        const task = Universe._nominatimQueue.then(async () => {
            try {
                const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(city)}&limit=1`, {
                    headers: { 'Accept': 'application/json' }
                });
                if(!response.ok) {
                    console.warn(`Nominatim HTTP ${response.status} pour "${city}"`);
                    return null;
                }
                const data = await response.json();
                
                if(data && data.length > 0) {
                    const result = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
                    Universe.geoCache[cityKey] = result;
                    try {
                        const cached = localStorage.getItem('fmp_geocache');
                        const cacheData = cached ? JSON.parse(cached) : {};
                        cacheData[cityKey] = result;
                        localStorage.setItem('fmp_geocache', JSON.stringify(cacheData));
                    } catch(e) {}
                    return result;
                }
            } catch(e) {
                console.warn('Geocoding error:', e);
            }
            return null;
        });
        
        // Délai de 1100ms avant de libérer la file pour la prochaine requête
        Universe._nominatimQueue = task.then(() => new Promise(r => setTimeout(r, 1100)));
        
        return task;
    },
    
    // Créer un marqueur pour un profil
    createMapMarker: (profile, coords) => {
        const vf = profile.visibleFacets || (PublicProfile._typeToFacet(profile.type) ? [PublicProfile._typeToFacet(profile.type)] : []);
        const isProject = profile.type === 'project';
        const isActor = vf.includes('actor');
        const isCrew = vf.includes('crew');
        const isAssociation = vf.includes('asso');
        const isEnterprise = vf.includes('ent');
        
        let markerClass = 'map-profile-marker';
        if(isProject) markerClass += ' project-marker';
        else if(isActor) markerClass += ' actor-marker';
        else if(isCrew) markerClass += ' crew-marker';
        else if(isAssociation) markerClass += ' association-marker';
        else if(isEnterprise) markerClass += ' enterprise-marker';
        
        const photoUrl = profile.photo || profile.photoURL || profile.mainPhoto || '';
        const FACET_ICONS = { actor: '🎭', crew: '🎥', asso: '🏛️', ent: '🏢' };
        const defaultIcon = isProject ? '🎬' : (FACET_ICONS[vf[0]] || '🎥');
        const name = profile.displayName || profile.title || profile.name || 'Sans nom';
        const facetBadges = (!isProject && vf.length > 1) ? `<div class="marker-facet-badges">${vf.map(k => FACET_ICONS[k]).join('')}</div>` : '';
        
        const iconHtml = `
            <div class="${markerClass}">
                ${facetBadges}
                ${photoUrl ? `<img src="${Utils.safeMediaUrl(photoUrl)}" alt="${Utils.escape(name)}" onerror="this.parentElement.innerHTML='<div style=\\'width:100%;height:40px;display:flex;align-items:center;justify-content:center;background:var(--panel-bg);border-radius:6px;font-size:20px;\\'>${defaultIcon}</div>'">` : `<div style="width:100%;height:40px;display:flex;align-items:center;justify-content:center;background:var(--panel-bg);border-radius:6px;border:2px solid var(--primary);font-size:20px;">${defaultIcon}</div>`}
                <div class="marker-label">${Utils.escape(name)}</div>
            </div>
        `;
        
        const icon = L.divIcon({
            html: iconHtml,
            className: 'map-marker-container',
            iconSize: [40, 50],
            iconAnchor: [20, 50]
        });
        
        // Ajouter un léger décalage pour éviter la superposition
        const offsetCoords = UniverseMap.addCoordOffset(coords.lat, coords.lng);
        // I6: mémoriser la position réelle du marker dans un dict indexé par id (pour tracer les lignes frères)
        if(profile.id) {
            Universe.markerPositions[profile.id] = { lat: offsetCoords.lat, lng: offsetCoords.lng };
        }
        const marker = L.marker([offsetCoords.lat, offsetCoords.lng], { 
            icon: icon,
            profileData: profile
        });
        
        // Événements hover
        marker.on('mouseover', (e) => {
            UniverseMap.showHoverCard(profile, e.originalEvent);
            // I6: au survol, tracer des lignes vers les profils frères (si ce n'est pas un projet)
        });
        
        marker.on('mouseout', () => {
            UniverseMap.hideHoverCard();
        });
        
        // Clic pour ouvrir le profil ou projet
        marker.on('click', () => {
            UniverseMap.hideHoverCard();
            if(isProject) {
                Universe.openProjectModal(profile);
            } else {
                Universe.openProfileModal(profile);
            }
        });
        
        return marker;
    },
    
    // Afficher la modale de profil (pour tous les profils)
    // UniverseMap.showProfileModal retirée v569 : orpheline en cascade
    // depuis le retrait de sa façade Universe (étape 3). openProfileModal
    // (UniverseFan) est le chemin réel utilisé pour ouvrir un profil.


    // Afficher la carte de survol
    showHoverCard: (profile, event) => {
        const hoverDiv = document.getElementById('map-hover-card');
        if(!hoverDiv) return;
        
        const card = Universe.createFanCard(profile, false);
        hoverDiv.innerHTML = '';
        hoverDiv.appendChild(card);
        
        // Positionner près de la souris
        const x = event.clientX + 15;
        const y = event.clientY - 100;
        
        hoverDiv.style.left = Math.min(x, window.innerWidth - 220) + 'px';
        hoverDiv.style.top = Math.max(y, 10) + 'px';
        hoverDiv.style.display = 'block';
    },
    
    // Masquer la carte de survol
    hideHoverCard: () => {
        const hoverDiv = document.getElementById('map-hover-card');
        if(hoverDiv) hoverDiv.style.display = 'none';
    },
    
    // Charger les marqueurs sur la carte
    loadMapMarkers: async () => {
        // Si des filtres sont actifs, utiliser les résultats filtrés
        if(Universe.searchActive) {
            await Universe.loadFilteredMapMarkers();
        } else {
            await UniverseMap.loadMapMarkersInView();
        }
    },
    
    // Charge max 100 profils visibles dans la zone de la carte
    loadMapMarkersInView: async () => {
        if(!Universe.map || !Universe.markersLayer) return;
        
        Universe.markersLayer.clearLayers();
        Universe.cityPositionCounters = {}; // Reset des compteurs
        
        // Récupérer le type sélectionné pour filtrer même sans recherche
        const selectedType = document.getElementById('universe-type')?.value;
        
        let profiles = [...Universe.allProfiles];
        let projects = [...Universe.allProjects];
        
        // Filtrer par type si sélectionné
        if(selectedType) {
            if(selectedType === 'project') {
                profiles = [];
            } else {
                profiles = profiles.filter(p => (p.visibleFacets || []).some(k => PublicProfile._facetKind(k) === PublicProfile._typeToFacet(selectedType)) || p.type === selectedType);
                projects = [];
            }
        }
        
        // Combiner les résultats filtrés
        const allItems = [...profiles, ...projects];
        
        // Mélanger aléatoirement
        const shuffled = Universe.shuffleArray(allItems);
        
        // Limiter à 500 profils max
        const maxProfiles = 500;
        const limitedItems = shuffled.slice(0, maxProfiles);
        
        // Obtenir les bounds actuels de la carte
        const bounds = Universe.map.getBounds();
        
        // Charger les marqueurs par batch
        // Batch plus grand car coords désormais pré-calculées (DB + profil.latitude/longitude)
        const batchSize = 50;
        
        for(let i = 0; i < limitedItems.length; i += batchSize) {
            const batch = limitedItems.slice(i, i + batchSize);
            
            await Promise.all(batch.map(async (item) => {
                const city = item.city || item.location || '';
                
                // Priorité 1 : coordonnées précises stockées directement sur le profil
                let coords = null;
                if(item.latitude != null && item.longitude != null) {
                    coords = { lat: item.latitude, lng: item.longitude };
                }
                
                // Priorité 2 : géocodage via la ville (DB → cache → Nominatim)
                if(!coords && city) {
                    coords = await UniverseMap.geocodeCity(city);
                }
                
                if(coords) {
                    // Décalage déterministe basé sur l'ID du profil (fixe, pas aléatoire)
                    const shouldHide = UniverseMap.shouldHideAddress(item);
                    let finalCoords;
                    if(shouldHide) {
                        finalCoords = UniverseMap.getDeterministicOffset(item.id, coords.lat, coords.lng);
                        item._hasApproximateLocation = true;
                    } else {
                        finalCoords = { lat: coords.lat, lng: coords.lng };
                        item._hasApproximateLocation = false;
                    }
                    
                    const marker = UniverseMap.createMapMarker(item, finalCoords);
                    Universe.markersLayer.addLayer(marker);
                }
            }));
            
            // Pas de délai entre batches : coords déjà pré-calculées, plus besoin de ménager Nominatim
            // Le throttle reste actif dans geocodeCity pour les rares villes inconnues (fallback)
        }
    },
    
    // Mettre à jour le thème de la carte
    updateMapTheme: () => {
        if(!Universe.map) return;
        
        const isDark = document.body.classList.contains('dark-mode');
        
        // Supprimer l'ancien layer
        if(Universe.tileLayer) {
            Universe.map.removeLayer(Universe.tileLayer);
        }
        
        // TUILES — OpenStreetMap standard, sans cle.
        // Jusqu'ici : CARTO (dark_all / light_all). Fin aout 2026, CARTO s'est
        // mis a tatouer « API KEY REQUIRED » sur toute tuile demandee sans cle,
        // et annonce le retrait de son service raster. Une cle gratuite existe
        // mais elle est reservee a un usage NON COMMERCIAL : inadaptee ici.
        // On passe donc au fond OSM, deja utilise par l'autre carte du site.
        //
        // CARTO offrait deux fonds, clair et sombre. OSM n'en a qu'un : le mode
        // sombre est obtenu par un filtre CSS pose sur la seule couche des
        // tuiles (.leaflet-tile-pane), donc SANS toucher aux marqueurs, qui
        // vivent dans une autre couche et gardent leurs couleurs.
        Universe.tileLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap',
            maxZoom: 19
        });
        
        Universe.tileLayer.addTo(Universe.map);
        
        // Mettre à jour le fond du conteneur
        const mapContainer = document.getElementById('universe-map');
        if(mapContainer) {
            mapContainer.style.background = isDark ? '#1a1a2e' : '#f4f6f8';
            mapContainer.classList.toggle('map-tiles-dark', isDark);
        }
    },

    // Changer le mode de vue
    setViewMode: async (mode) => {
        Universe.viewMode = mode;
        
        const mapBtn = document.getElementById('view-mode-map');
        const fanBtn = document.getElementById('view-mode-fan');
        let mapContainer = document.getElementById('universe-map');
        const scene = document.getElementById('universe-scene');
        
        if(mode === 'map') {
            mapBtn.style.background = 'var(--primary)';
            mapBtn.style.color = 'white';
            mapBtn.style.border = 'none';
            fanBtn.style.background = 'var(--bg)';
            fanBtn.style.color = 'var(--text-main)';
            fanBtn.style.border = '1px solid var(--border)';
            
            // Retirer le contenu fan s'il existe
            const fanContainer = scene.querySelector('.universe-fan-container');
            if(fanContainer) fanContainer.remove();
            
            // Recréer le conteneur de carte s'il n'existe plus
            if(!mapContainer) {
                mapContainer = document.createElement('div');
                mapContainer.id = 'universe-map';
                scene.insertBefore(mapContainer, scene.firstChild);
                
                // Réinitialiser la carte
                Universe.map = null;
                Universe.markersLayer = null;
            }
            
            mapContainer.style.display = 'block';
            
            // Init si besoin (attendre le lazy-load Leaflet) PUIS charger les marqueurs.
            // #universe-map existe en dur dans le HTML : sans cet await, le 1er affichage
            // tombait sur Universe.map encore null (Leaflet pas pret en 100 ms) -> carte vide.
            if(!Universe.map) await UniverseMap.initMap();
            if(Universe.map) {
                Universe.map.invalidateSize();
                await UniverseMap.loadMapMarkers();
            }
        } else {
            fanBtn.style.background = 'var(--primary)';
            fanBtn.style.color = 'white';
            fanBtn.style.border = 'none';
            mapBtn.style.background = 'var(--bg)';
            mapBtn.style.color = 'var(--text-main)';
            mapBtn.style.border = '1px solid var(--border)';
            
            mapContainer.style.display = 'none';
            if(Universe.searchActive) UniverseSearch.renderSearchResultsFan(scene);
            else Universe.renderFanView(scene);
        }
    },
};

const Universe = {
    // ===================== ÉTAT & CONFIG =====================
    filteredProfiles: [],
    searchActive: false, // recherche en cours : carte ET liste affichent le meme filtre
    allProjects: [],
    filteredProjects: [],
    currentProfile: null,
    cards: [],
    animationRunning: false,
    // v593 : sceneRect retiré (jamais lu).
    myProfiles: [], // Profils de l'utilisateur
    // v593 : myProjects retiré (jamais lu ; myProfiles ci-dessus reste, lui utilisé).
    
    // Carte Leaflet
    map: null,
    markersLayer: null,
    tileLayer: null,
    viewMode: 'map', // 'map' ou 'fan'
    geoCache: {}, // Cache des géolocalisations
hoverCard: null,
    
    // Positions réelles des markers (écrites par UniverseMap)
    markerPositions: {}, // { "profile_id": {lat, lng} }
       
// Compteur de positions par ville pour la spirale (partagé : écrit par UniverseMap & UniverseSearch)
    cityPositionCounters: {},
    
    // Carte Leaflet — délégué à UniverseMap
    getDeterministicOffset: (...a) => UniverseMap.getDeterministicOffset(...a),
    shouldHideAddress: (...a) => UniverseMap.shouldHideAddress(...a),
    geocodeCity: (...a) => UniverseMap.geocodeCity(...a),
    createMapMarker: (...a) => UniverseMap.createMapMarker(...a),
    loadMapMarkers: (...a) => UniverseMap.loadMapMarkers(...a),
    loadMapMarkersInView: (...a) => UniverseMap.loadMapMarkersInView(...a),
    updateMapTheme: (...a) => UniverseMap.updateMapTheme(...a),
    setViewMode: (...a) => UniverseMap.setViewMode(...a),
	
	// ===================== FORMULAIRE & DROPDOWNS =====================
	// Données des rôles par département
    // Affiche/masque les filtres selon le type sélectionné
    onTypeChange: () => {
        const type = document.getElementById('universe-type').value;
        
        document.getElementById('universe-filters-crew').style.display = 'none';
        document.getElementById('universe-filters-actor').style.display = 'none';
        document.getElementById('universe-filters-project').style.display = 'none';
        document.getElementById('universe-filters-collab').style.display = 'none';
        document.getElementById('universe-filters-production-type').style.display = 'none';
        document.getElementById('universe-filters-association').style.display = 'none';
        document.getElementById('universe-filters-enterprise').style.display = 'none';
        
        // Réinitialiser les filtres pour forcer le rechargement par type
        Universe.searchActive = false;
        Universe.filteredProfiles = [];
        Universe.filteredProjects = [];
        
        // Mettre à jour l'affichage selon le type sélectionné
        if(Universe.viewMode === 'map') {
            Universe.loadMapMarkersInView();
        } else {
            Universe.render();
        }
        
        if(type === 'crew') {
            document.getElementById('universe-filters-crew').style.display = 'flex';
            document.getElementById('universe-filters-collab').style.display = 'flex';
            Universe.populateCrewRoles();
        } else if(type === 'actor') {
            document.getElementById('universe-filters-actor').style.display = 'flex';
            document.getElementById('universe-filters-collab').style.display = 'flex';
        } else if(type === 'project') {
            document.getElementById('universe-filters-project').style.display = 'flex';
            document.getElementById('universe-filters-production-type').style.display = 'flex';
        } else if(type === 'association') {
            document.getElementById('universe-filters-association').style.display = 'flex';
            Universe.populateAssociationTypes();
        } else if(type === 'enterprise') {
            document.getElementById('universe-filters-enterprise').style.display = 'flex';
            Universe.populateEnterpriseTypes();
        }
    },

    // Les fiches technicien VISIBLES d'un profil (une personne peut en avoir
    // plusieurs depuis v597). Rend un tableau vide pour un profil sans casquettes.
    _fichesCrew: (p) => {
        if(!p || !p.facets) return [];
        return PublicProfile.crewArr(p.facets).filter(f => f && f.enabled && f.visible !== false);
    },

    // Remplit la liste des fonctions techniciens selon le département.
    // v600 — LE MEME REFERENTIEL QUE PARTOUT AILLEURS (CONFIG.crewRoles).
    // Cette liste avait sa PROPRE table (crewRolesByDept), avec ses propres
    // identifiants de departement ('image', 'lumiere'…) et ses propres
    // orthographes ('Cadreur', 'Perchman'). Or le selecteur Departement, lui,
    // est rempli depuis CONFIG.crewGroups ('gc1', 'gc2'…) : choisir un
    // departement ne trouvait donc AUCUNE fonction, et sans departement la
    // liste proposait des libelles ('Cadreur') que pas un profil ne porte
    // ('Cadreur·euse'). La recherche par fonction ne pouvait pas aboutir.
    populateCrewRoles: (dept) => {
        const select = document.getElementById('universe-crew-role');
        if(!select) return;
        
        select.innerHTML = '<option value="">-- Fonction --</option>';
        
        const table = (typeof CONFIG !== 'undefined' && CONFIG.crewRoles) ? CONFIG.crewRoles : {};
        let roles = [];
        if(dept && table[dept]) {
            roles = table[dept].slice();
        } else {
            Object.values(table).forEach(r => { roles = roles.concat(r); });
        }
        // « Autre » n'est pas une fonction : c'est la porte de sortie du
        // formulaire de saisie, elle n'a rien a faire dans un filtre.
        roles = [...new Set(roles)].filter(r => r && r !== 'Autre');
        
        roles.sort((a, b) => a.localeCompare(b, 'fr')).forEach(role => {
            const opt = document.createElement('option');
            opt.value = role.toLowerCase();
            opt.textContent = role;
            select.appendChild(opt);
        });
    },

    // Quand on change le département
    onDepartmentChange: () => {
        const dept = document.getElementById('universe-department').value;
        Universe.populateCrewRoles(dept);
    },
    
    // Remplit la liste des types d'associations
    populateAssociationTypes: () => {
        const select = document.getElementById('universe-association-type');
        if(!select) return;
        
        select.innerHTML = '<option value="">-- Type d\'association --</option>';
        CONFIG.associationTypes.forEach(type => {
            const opt = document.createElement('option');
            opt.value = type.id;
            opt.textContent = type.name;
            select.appendChild(opt);
        });
    },
    
    // Remplit la liste des types d'entreprises
    populateEnterpriseTypes: () => {
        const select = document.getElementById('universe-enterprise-type');
        if(!select) return;
        
        select.innerHTML = '<option value="">-- Type d\'entreprise --</option>';
        CONFIG.enterpriseTypes.forEach(type => {
            const opt = document.createElement('option');
            opt.value = type.id;
            opt.textContent = type.name;
            select.appendChild(opt);
        });
    },
	
    // ===================== INIT & CHARGEMENT DONNÉES =====================
    // Initialise l'univers
    init: async () => {
        await Universe.loadAllProfiles();
        Universe.populateDepartments();
        
        // Réinitialiser le type à "Tous"
        const typeSelect = document.getElementById('universe-type');
        if(typeSelect) typeSelect.value = '';
        
        // Masquer tous les filtres spécifiques
        if(document.getElementById('universe-filters-crew')) document.getElementById('universe-filters-crew').style.display = 'none';
        if(document.getElementById('universe-filters-actor')) document.getElementById('universe-filters-actor').style.display = 'none';
        if(document.getElementById('universe-filters-association')) document.getElementById('universe-filters-association').style.display = 'none';
        if(document.getElementById('universe-filters-enterprise')) document.getElementById('universe-filters-enterprise').style.display = 'none';
        if(document.getElementById('universe-filters-project')) document.getElementById('universe-filters-project').style.display = 'none';
        
Universe.setViewMode('map');
    },
    
    // Charge tous les profils publics et projets
    loadAllProfiles: async () => {
        Universe.allProfiles = [];
        Universe.allProjects = [];
        
        try {
            // Charger tous les profils publics depuis Supabase
            // v578 (audit) : select('*') envoyait le telephone de chaque profil a tout
            // inscrit, affiche ou non. La fonction serveur rend les memes lignes avec
            // la regle du telephone deja appliquee (agent en priorite, ou masque).
            const { data: profiles, error } = await supabase.rpc('public_profiles_for_me', { p_type: null });
            if(error) { console.error('[Univers] public_profiles_for_me:', error); Utils.toast('Impossible de charger les profils de l\u2019Univers. Vérifie ta connexion et réessaie.', 'error', 6000); }

            if(!error && profiles) {
                profiles.forEach(p => {
                    if(p.name) {
                        const extraData = p.data || {};
                        // Facettes : normalisation (filet pour les profils jamais resauvegardés)
                        const facets = PublicProfile._normalizeFacets(extraData.facets, p);
                        // v598 : une entrée par fiche technicien active (clé composite 'crew', 'crew:1'...)
                        const visibleFacets = [];
                        PublicProfile.FACET_KEYS.forEach(k => {
                            if(k === 'crew') {
                                PublicProfile.crewArr(facets).forEach((cf, i) => { if(cf && cf.enabled && cf.visible !== false) visibleFacets.push(PublicProfile._facetKey('crew', i)); });
                            } else if(facets[k].enabled && facets[k].visible !== false) {
                                visibleFacets.push(k);
                            }
                        });
                        if(visibleFacets.length === 0) return; // aucune casquette visible : absent de l'Univers
                        const item = { 
                            ...p, 
                            ...extraData,
                            facets: facets,
                            visibleFacets: visibleFacets,
                            type: PublicProfile._facetToType(PublicProfile._facetKind(visibleFacets[0])) || p.profile_type || 'crew',
                            hasVehicle: p.vehicle || false,
                            availabilityText: p.availability || '',
                            profileComplete: true 
                        };
                        // Le marqueur porte les infos de la première casquette visible
                        const ff0 = PublicProfile.facetByKey(facets, visibleFacets[0]);
                        ['name', 'photo', 'city', 'latitude', 'longitude'].forEach(k => {
                            if(ff0[k] !== undefined && ff0[k] !== null) item[k] = ff0[k];
                        });
                        // Profil uniquement « moral » (asso/entreprise) avec siège géocodé : marqueur au siège
                        if(!visibleFacets.some(k => PublicProfile._facetKind(k) === 'actor' || PublicProfile._facetKind(k) === 'crew')) {
                            const hq = PublicProfile.facetByKey(facets, visibleFacets[0]);
                            if(hq && hq.hqLatitude != null && hq.hqLongitude != null) {
                                item.latitude = hq.hqLatitude;
                                item.longitude = hq.hqLongitude;
                            }
                        }
                        Universe.allProfiles.push(item);
                    }
                });
            }
            
            // Charger les projets publics depuis la table projects
            try {
                const { data: projects, error: projError } = await supabase
                    .rpc('get_public_projects');
                
                if(!projError && projects) {
                    projects.forEach(proj => {
                        const pubData = proj.public_data;
                        if(pubData) {
                            // v616 : projets factices de démo (recherches d'acteur pour
                            // présentation), réservés à un compte précis via un
                            // marqueur demoOnlyFor. get_public_projects() n'a pas cette
                            // notion côté serveur (pas d'équivalent du is_demo des
                            // profils) — filtré ici, côté client, avant affichage.
                            if(pubData.demoOnlyFor && (!state.currentUser || state.currentUser.email !== pubData.demoOnlyFor)) return;
                            Universe.allProjects.push({
                                ...pubData,
                                id: proj.id,
                                type: 'project',
                                title: pubData.title || proj.title || 'Sans titre',
                                location: pubData.city || '',
                                ownerEmail: pubData.ownerEmail || proj.owner_email,
                                projectId: proj.id
                            });
                        }
                    });
                    // Projets publics chargés
                }
            } catch(e) {
                console.error('Erreur chargement projets publics:', e);
            }
            
            // Stocker mes profils pour le matching
            const myEmail = state.currentUser?.email;
            const myEmailKey = myEmail ? Utils.sanitizeEmail(myEmail) : null;
            const myEmailLower = myEmail ? myEmail.toLowerCase() : null;
            Universe.myProfiles = Universe.allProfiles.filter(p => 
                p.ownerEmail === myEmail || 
                p.ownerEmail === myEmailLower ||
                p.email === myEmail ||
                p.email === myEmailLower ||
                p.id === myEmailKey ||
                (p.id && myEmailKey && p.id.toLowerCase() === myEmailKey.toLowerCase())
            );
            // Profils chargés
            
            // Initialiser le sélecteur de profils pour le matching
            MatchingEngine.initProfileSelector();
            
        } catch(e) {
            console.error('Erreur chargement profils:', e);
            Utils.toast('Impossible de charger l\u2019Univers pour le moment.', 'error', 6000);
        }
        
        },
    populateDepartments: () => {
        const select = document.getElementById('universe-department');
        if(!select) return;
        
        select.innerHTML = '<option value="">-- Département --</option>';
        CONFIG.crewGroups.forEach(grp => {
            const opt = document.createElement('option');
            opt.value = grp.id;
            opt.textContent = grp.name;
            select.appendChild(opt);
        });
    },
    
  // Rendu principal
    render: () => {
        const scene = document.getElementById('universe-scene');
        if(!scene) return;
        
        // Si mode carte, mettre à jour les marqueurs
        if(Universe.viewMode === 'map') {
            Universe.loadMapMarkers();
            return;
        }
        
        // Mode fan/liste
        Universe.renderFanView(scene);
    },
    
    // Vue éventail animée — délégué à UniverseFan
    renderFanView: (...a) => UniverseFan.renderFanView(...a),
    createFanCategory: (...a) => UniverseFan.createFanCategory(...a),
    createFanCard: (...a) => UniverseFan.createFanCard(...a),
// Recherche & filtres — délégué à UniverseSearch
    search: (...a) => UniverseSearch.search(...a),
    loadFilteredMapMarkers: (...a) => UniverseSearch.loadFilteredMapMarkers(...a),
    reset: (...a) => UniverseSearch.reset(...a),
    onLocationInput: (...a) => UniverseSearch.onLocationInput(...a),
    onLocationKey: (...a) => UniverseSearch.onLocationKey(...a),
    pickLocation: (...a) => UniverseSearch.pickLocation(...a),
    hideLocationSuggest: (...a) => UniverseSearch.hideLocationSuggest(...a),
    // Ouvre le modal de profil
	// Ouvre le modal d'un projet
	
	
	
    // ===================== MODALE PROJET =====================
    openProjectModal: (project) => {
        const typeLabels = {
            'court-metrage': 'Court-métrage',
            'long-metrage': 'Long-métrage',
            'serie': 'Série',
            'documentaire': 'Documentaire',
            'clip': 'Clip',
            'pub': 'Publicité',
            'corporate': 'Corporate'
        };
        const genreLabels = {
            'drame': 'Drame', 'comedie': 'Comédie', 'thriller': 'Thriller',
            'horreur': 'Horreur', 'sf': 'Science-Fiction', 'fantastique': 'Fantastique',
            'action': 'Action', 'romance': 'Romance', 'animation': 'Animation',
            'experimental': 'Expérimental'
        };
        const productionTypeLabels = {
            'pro': '🎬 Production Professionnelle',
            'semi-pro': '⚡ Production Semi-pro',
            'benevole': '❤️ Production Bénévole'
        };
        
        const typeText = typeLabels[project.projectType] || project.projectType || '';
        const genreText = genreLabels[project.genre] || project.genre || '';
        
        // Options de visibilité (par défaut tout visible sauf legal)
        const vis = project.visibility || { description: true, team: true, dates: true, casting: true, crew: true, location: true, productionType: true, partners: true, legal: false };
        
        // Localisation
        let locationHtml = '';
        if(vis.location !== false && project.city) {
            locationHtml = `<div class="mb-15-bg">
                <strong>📍 Localisation :</strong> ${Utils.escape(project.city)}${project.region ? ', ' + Utils.escape(project.region) : ''}${project.country && project.country !== 'France' ? ' (' + Utils.escape(project.country) + ')' : ''}
            </div>`;
        }
        
        // Dates
        let datesHtml = '';
        if(vis.dates !== false && (project.datePreprodStart || project.dateShootingStart || project.dateRelease)) {
            datesHtml = '<div class="mb-15-bg"><strong>📅 Calendrier :</strong><div style="margin-top: 8px; display: grid; gap: 5px;">';
            if(project.datePreprodStart) datesHtml += `<div>• Pré-prod : ${project.datePreprodStart}${project.datePreprodEnd ? ' → ' + project.datePreprodEnd : ''}</div>`;
            if(project.dateShootingStart) datesHtml += `<div>• Tournage : ${project.dateShootingStart}${project.dateShootingEnd ? ' → ' + project.dateShootingEnd : ''}</div>`;
            if(project.datePostprodStart) datesHtml += `<div>• Post-prod : ${project.datePostprodStart}${project.datePostprodEnd ? ' → ' + project.datePostprodEnd : ''}</div>`;
            if(project.dateRelease) datesHtml += `<div>• Sortie prévue : ${project.dateRelease}</div>`;
            datesHtml += '</div></div>';
        }
        
        // Équipe
        let teamHtml = '';
        if(vis.team !== false && (project.director || project.producer || project.budget || (project.team && project.team.length > 0))) {
            teamHtml = '<div class="mb-15-bg"><strong>👥 Équipe :</strong><div style="margin-top: 8px; display: grid; gap: 5px;">';
            if(project.director) teamHtml += `<div>• Réalisateur : ${Utils.escape(project.director)}</div>`;
            if(project.producer) teamHtml += `<div>• Producteur : ${Utils.escape(project.producer)}</div>`;
            if(project.team && project.team.length > 0) {
                project.team.forEach(member => {
                    teamHtml += `<div>• ${Utils.escape(member.role || 'Membre')} : ${Utils.escape(member.name || '')}</div>`;
                });
            }
            if(project.budget) teamHtml += `<div style="margin-top: 8px; font-weight: 600;">💰 Budget : ${Number(project.budget).toLocaleString('fr-FR')} €</div>`;
            teamHtml += '</div></div>';
        }
        
        // Type de production
        let productionTypeHtml = '';
        if(vis.productionType !== false && project.productionType) {
            productionTypeHtml = `<div class="mb-15-bg">
                <strong>Type de production :</strong> ${productionTypeLabels[project.productionType] || project.productionType}
            </div>`;
        }
        
        // Partenaires
        let partnersHtml = '';
        if(vis.partners !== false && ((project.associations && project.associations.length > 0) || (project.enterprises && project.enterprises.length > 0))) {
            partnersHtml = '<div class="mb-15-bg"><strong>🤝 Partenaires :</strong><div class="mt-8">';
            if(project.associations && project.associations.length > 0) {
                partnersHtml += '<div style="margin-bottom: 5px;"><em>Associations :</em> ' + project.associations.map(a => Utils.escape(a.name || a)).join(', ') + '</div>';
            }
            if(project.enterprises && project.enterprises.length > 0) {
                partnersHtml += '<div><em>Entreprises :</em> ' + project.enterprises.map(e => Utils.escape(e.name || e)).join(', ') + '</div>';
            }
            partnersHtml += '</div></div>';
        }
        
        // Description
        let descriptionHtml = '';
        if(vis.description !== false && project.description) {
            descriptionHtml = `<div class="mb-15-bg">
                <strong>📝 Note d'intention :</strong>
                <div style="margin-top: 8px; color: var(--text-sec); line-height: 1.6; white-space: pre-wrap;">${Utils.escape(project.description)}</div>
            </div>`;
        }
        
        // Besoins comédiens
        let actorNeedsHtml = '';
        if(vis.casting !== false && project.actorNeeds && project.actorNeeds.length > 0) {
            actorNeedsHtml = '<div class="mt-15"><strong>🎭 Rôles recherchés :</strong><div class="mt-10">';
            project.actorNeeds.forEach(need => {
                const ageRange = (need.ageMin || need.ageMax) ? ` • ${need.ageMin || '?'}-${need.ageMax || '?'} ans` : '';
                actorNeedsHtml += `<div style="background: var(--bg); padding: 10px; border-radius: 6px; margin-bottom: 8px;">
                    <strong>${Utils.escape(need.roleName || 'Rôle')}</strong> (${need.type || 'principal'})
                    ${need.gender ? ' • ' + need.gender : ''}${ageRange}
                    ${need.description ? `<div style="font-size: 0.85rem; color: var(--text-sec); margin-top: 5px;">${Utils.escape(need.description)}</div>` : ''}
                </div>`;
            });
            actorNeedsHtml += '</div></div>';
        }
        
        // Besoins techniciens
        let crewNeedsHtml = '';
        const crewNeeded = [];
        if(vis.crew !== false && project.crewNeeds) {
            Object.entries(project.crewNeeds).forEach(([id, need]) => {
                if(need.needed) {
                    const pos = Presentation.crewPositions.find(p => p.id === id);
                    crewNeeded.push(pos ? pos.name : id);
                }
            });
        }
        if(project.customCrewNeeds) {
            project.customCrewNeeds.forEach(c => crewNeeded.push(c.name));
        }
        if(crewNeeded.length > 0) {
            crewNeedsHtml = `<div class="mt-15"><strong>🎬 Postes recherchés :</strong><div style="margin-top: 10px; display: flex; flex-wrap: wrap; gap: 8px;">
                ${crewNeeded.map(n => `<span style="background: var(--primary); color: white; padding: 5px 12px; border-radius: 20px; font-size: 0.85rem;">${Utils.escape(n)}</span>`).join('')}
            </div></div>`;
        }
        
        // Stocker le projet courant pour les favoris
        Universe.currentProfile = { ...project, type: 'project', id: project.id || project.projectId };
        const isFav = Universe.isFavorite(project.id || project.projectId, 'project');
        
        const modalHtml = `
            <div class="profile-modal-overlay" onclick="if(event.target === this) this.remove();">
                <div class="profile-modal-box">
                    <div class="profile-modal-header" style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); color: white; position: relative;">
                        <button class="favorite-btn ${isFav ? 'active' : ''}" id="project-favorite-btn" onclick="app.Universe.toggleProjectFavorite()" style="position: absolute; top: 15px; left: 15px; background: rgba(255,255,255,0.2); border: none; font-size: 1.5rem; cursor: pointer; padding: 5px 10px; border-radius: 8px; color: ${isFav ? '#f59e0b' : 'white'};" title="Ajouter aux favoris">${isFav ? '★' : '☆'}</button>
                        <button class="report-btn" onclick="app.Universe.reportProject('${project.id || project.projectId}')" style="position: absolute; top: 15px; left: 60px; background: rgba(255,255,255,0.2); border: none; font-size: 1.2rem; cursor: pointer; padding: 5px 10px; border-radius: 8px; color: white; opacity: 0.7;" title="Signaler ce projet">🚩</button>
                        <button class="profile-modal-close" onclick="this.closest('.profile-modal-overlay').remove()" style="color: white;">✕</button>
                        ${project.image ? `<img src="${Utils.safeMediaUrl(project.image)}" alt="Affiche du projet" style="width: 150px; height: 200px; object-fit: cover; border-radius: 8px; margin-bottom: 15px; border: 2px solid #e94560;">` : '<div style="font-size: 4rem; margin-bottom: 15px;">🎬</div>'}
                        <div class="profile-modal-name">${Utils.escape(project.title || 'Sans titre')}</div>
                        <div style="color: #e94560; font-weight: bold;">${Utils.escape(typeText)}${genreText ? ' • ' + genreText : ''}</div>
                        ${project.city ? `<div style="margin-top: 5px; opacity: 0.8;">📍 ${Utils.escape(project.city)}${project.region ? ', ' + project.region : ''}</div>` : ''}
                    </div>
                    <div class="profile-modal-body" style="padding: 20px; max-height: 60vh; overflow-y: auto;">
                        ${locationHtml}
                        ${datesHtml}
                        ${teamHtml}
                        ${productionTypeHtml}
                        ${partnersHtml}
                        ${descriptionHtml}
                        ${actorNeedsHtml}
                        ${crewNeedsHtml}
                        
                        <div class="profile-modal-actions mt-20">
                            <button onclick="app.Universe.contactProject('${project.projectId}', '${Utils.escape(project.title)}', '${Utils.escape(project.ownerEmail)}')" style="flex: 1; padding: 12px; background: #e94560; color: white; border: none; border-radius: 6px; font-weight: bold; cursor: pointer;">📧 Contacter le projet</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    },
    
    // Contacter un projet
    contactProject: async (projectId, projectTitle, ownerEmail) => {
        const oe = String(ownerEmail || '').toLowerCase();
        const owner = (Universe.allProfiles || []).find(p =>
            (p.email && String(p.email).toLowerCase() === oe) ||
            (p.owner_email && String(p.owner_email).toLowerCase() === oe));

        let email = '', phone = '';
        if(owner) {
            const f = owner.facets || {};
            const keys = (owner.visibleFacets && owner.visibleFacets.length) ? owner.visibleFacets : ['actor', 'crew', 'association', 'enterprise'];
            for(const k of keys) {
                const ff = f[k] || {};
                const e = (ff.contactEmail || ff.assoEmail || ff.entEmail || '').trim();
                const ph = (ff.phone || ff.assoPhone || ff.entPhone || '').trim();
                if(e || ph) { email = e; phone = ph; break; }
            }
            if(!email && !phone) {
                email = String(owner.contactEmail || owner.assoEmail || owner.entEmail || '').trim();
                phone = String(owner.phone || owner.assoPhone || owner.entPhone || '').trim();
            }
        }

        const modal = document.createElement('div');
        modal.id = 'contact-profile-modal';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); display: flex; justify-content: center; align-items: center; z-index: var(--z-modal);';

        const row = (label, value, id, href, hrefLabel) => `
            <p style="color: var(--text-sec); margin: 0 0 6px;">${label} :</p>
            <div style="display:flex; gap:8px; align-items:center; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; margin-bottom: 6px;">
                <code id="${id}" style="flex:1; font-size: 0.95rem; word-break: break-all;">${Utils.escape(value)}</code>
                <button onclick="app.UniverseProfileModal.copyContactValue('${id}')" class="btn btn--primary" style="white-space: nowrap;">📋 Copier</button>
            </div>
            <a href="${href}" style="color: var(--primary); display:inline-block; margin-bottom:16px;">${hrefLabel}</a>`;

        let inner = '';
        if(email) inner += row('Adresse de contact du porteur', email, 'contact-public-email', 'mailto:' + Utils.escape(email), '✉️ Écrire un email');
        if(phone) inner += row('Téléphone', phone, 'contact-public-phone', 'tel:' + Utils.escape(phone.replace(/\s/g, '')), '📞 Appeler');
        if(!inner) inner = `<p style="color: var(--text-sec); margin: 0;">Le porteur de ce projet n'a pas indiqué de contact public.</p>`;

        modal.innerHTML = `
            <div style="background: var(--panel-bg); border-radius: 12px; width: 90%; max-width: 460px; padding: 20px;">
                <div class="section-header-20">
                    <h3 class="m-0">📧 Contacter le projet « ${Utils.escape(projectTitle)} »</h3>
                    <button onclick="document.getElementById('contact-profile-modal').remove()" class="icon-btn-sec">✖</button>
                </div>
                <div class="mb-15">${inner}</div>
            </div>
        `;
        document.body.appendChild(modal);
    },
    
    // Toggle favori pour les projets
    toggleProjectFavorite: async () => {
        const project = Universe.currentProfile;
        if(!project || !state.currentUser) return;
        
        const btn = document.getElementById('project-favorite-btn');
        if(!btn) return;
        
        // S'assurer que state.contacts existe
        if(!state.contacts) state.contacts = { actors: [], crew: [], projects: [], associations: [], enterprises: [] };
        if(!state.contacts.projects) state.contacts.projects = [];
        
        const projectId = project.id || project.projectId;
        const ownerEmail = project.ownerEmail || '';
        
        // Vérifier si déjà en favoris (vérifier toutes les possibilités)
        const existingIndex = state.contacts.projects.findIndex(c => {
            // Vérifier par publicProfileId
            if(c.publicProfileId === projectId) return true;
            // Vérifier par contact_email (peut être ownerEmail ou projectId)
            if(c.contact_email === projectId || c.contact_email === ownerEmail) return true;
            // Vérifier dans les notes parsées
            try {
                const notes = typeof c.notes === 'string' ? JSON.parse(c.notes) : c.notes;
                if(notes && (notes.projectId === projectId || notes.publicProfileId === projectId)) return true;
            } catch(e) {}
            return false;
        });
        
        if(existingIndex >= 0) {
            // Retirer des favoris
            const contactToRemove = state.contacts.projects[existingIndex];
            state.contacts.projects.splice(existingIndex, 1);
            await supabase.from('contacts').delete().eq('id', contactToRemove.id);
            btn.textContent = '☆';
            btn.style.color = 'white';
            btn.classList.remove('active');
            Utils.toast('Projet retiré des favoris', 'info');
        } else {
            // Ajouter aux favoris (utiliser projectId comme contact_email pour garantir l'unicité)
            const contactData = {
                owner_email: state.currentUser.email.toLowerCase(),
                contact_email: projectId || '',
                contact_type: 'project',
                name: project.title || 'Sans titre',
                notes: JSON.stringify({ 
                    publicProfileId: projectId,
                    projectId: projectId,
                    title: project.title,
                    type: 'project',
                    city: project.city,
                    projectType: project.projectType,
                    genre: project.genre,
                    ownerEmail: project.ownerEmail
                }),
                created_at: new Date().toISOString()
            };
            // Utiliser upsert pour éviter les doublons (basé sur owner_email + contact_email)
            const { data: newContact, error } = await supabase
                .from('contacts')
                .upsert(contactData, { onConflict: 'owner_email,contact_email' })
                .select()
                .single();
            if(error) {
                console.error('Erreur ajout favori:', error);
                // Si erreur de conflit, le favori existe déjà - on le considère comme ajouté
                if(error.code === '23505') {
                    btn.textContent = '★';
                    btn.style.color = '#f59e0b';
                    btn.classList.add('active');
                    Utils.toast('Projet déjà dans vos favoris !', 'info');
                    return;
                }
                Utils.toast('Erreur lors de l\'ajout aux favoris', 'error');
                return;
            }
            if(newContact) {
                state.contacts.projects.push({ 
                    ...project, 
                    id: newContact.id, 
                    publicProfileId: projectId,
                    type: 'project'
                });
            }
            btn.textContent = '★';
            btn.style.color = '#f59e0b';
            btn.classList.add('active');
            Utils.toast('Projet ajouté aux favoris !', 'success');
        }
    },
    
    // ===================== SIGNALEMENT =====================
    reportProfile: async () => {
        const profile = Universe.currentProfile;
        if(!profile || !state.currentUser) {
            Utils.toast('Vous devez être connecté pour signaler', 'warning');
            return;
        }
        
        const reasons = [
            { id: 'fake', label: '👤 Faux profil / Usurpation d\'identité' },
            { id: 'inappropriate', label: '🚫 Contenu inapproprié' },
            { id: 'spam', label: '📧 Spam / Publicité' },
            { id: 'harassment', label: '⚠️ Harcèlement' },
            { id: 'other', label: '❓ Autre raison' }
        ];
        
        const reasonHtml = reasons.map(r => `<option value="${r.id}">${r.label}</option>`).join('');
        
        const result = await ConfirmModal.show({
            title: '🚩 Signaler ce profil',
            message: `
                <p class="mb-15">Vous êtes sur le point de signaler le profil <strong>${Utils.escape(profile.name || 'Sans nom')}</strong>.</p>
                <label class="label-bold-block-5">Motif du signalement :</label>
                <select id="report-profile-reason" style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 6px; margin-bottom: 10px;">
                    ${reasonHtml}
                </select>
                <label class="label-bold-block-5">Détails (optionnel) :</label>
                <textarea id="report-profile-details" style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 6px; min-height: 80px;" placeholder="Décrivez le problème..." data-tooltip="Décrivez le problème..."></textarea>
            `,
            confirmText: 'Envoyer le signalement',
            icon: '🚩'
        });
        
        if(result) {
            const reason = document.getElementById('report-profile-reason')?.value || 'other';
            const details = document.getElementById('report-profile-details')?.value || '';
            const reporterEmail = state.currentUser.email.toLowerCase();
            
            // 1) Vérifier le quota : max 5 signalements / 7 jours glissants
            try {
                const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
                const { count: recentCount, error: countErr } = await supabase
                    .from('reports')
                    .select('id', { count: 'exact', head: true })
                    .eq('reporter_email', reporterEmail)
                    .gte('created_at', sevenDaysAgo);
                
                if(!countErr && recentCount !== null && recentCount >= 5) {
                    await ConfirmModal.show({
                        title: '⚠️ Quota atteint',
                        message: `
                            <p>Vous avez atteint la limite de <strong>5 signalements par semaine</strong>.</p>
                            <p class="mt-15">Veuillez réessayer plus tard. En cas d'urgence, contactez l'administrateur du site.</p>
                        `,
                        confirmText: 'OK',
                        icon: '⏳',
                        hideCancel: true
                    });
                    return;
                }
            } catch(e) {
                console.warn('Impossible de vérifier le quota de signalements:', e);
                // On continue quand même, la DB gardera la trace
            }
            
            // 2) Insérer le signalement
            const { error } = await supabase.from('reports').insert({
                reporter_email: reporterEmail,
                reported_type: profile.type || 'profile',
                reported_id: profile.id || profile.publicProfileId,
                reported_name: profile.name || 'Sans nom',
                reported_email: profile.email || '',
                reason: reason,
                details: details,
                status: 'pending',
                created_at: new Date().toISOString()
            });
            
            if(error) {
                // Code 23505 = violation de contrainte UNIQUE (= déjà signalé)
                if(error.code === '23505') {
                    await ConfirmModal.show({
                        title: 'Déjà signalé',
                        message: `<p>Vous avez déjà signalé ce profil. Votre signalement précédent est en cours de traitement par l'administrateur.</p>`,
                        confirmText: 'OK',
                        icon: '👁️',
                        hideCancel: true
                    });
                } else {
                    console.error('Erreur signalement:', error);
                    Utils.toast('Erreur lors du signalement', 'error');
                }
            } else {
                Utils.toast('Signalement envoyé. Merci !', 'success');
            }
        }
    },
    
    reportProject: async (projectId) => {
        const project = Universe.currentProfile;
        if(!state.currentUser) {
            Utils.toast('Vous devez être connecté pour signaler', 'warning');
            return;
        }
        
        const reasons = [
            { id: 'fake', label: '🎬 Faux projet / Arnaque' },
            { id: 'inappropriate', label: '🚫 Contenu inapproprié' },
            { id: 'spam', label: '📧 Spam / Publicité' },
            { id: 'scam', label: '💰 Tentative d\'escroquerie' },
            { id: 'other', label: '❓ Autre raison' }
        ];
        
        const reasonHtml = reasons.map(r => `<option value="${r.id}">${r.label}</option>`).join('');
        
        const result = await ConfirmModal.show({
            title: '🚩 Signaler ce projet',
            message: `
                <p class="mb-15">Vous êtes sur le point de signaler le projet <strong>${Utils.escape(project?.title || 'Sans titre')}</strong>.</p>
                <label class="label-bold-block-5">Motif du signalement :</label>
                <select id="report-project-reason" style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 6px; margin-bottom: 10px;">
                    ${reasonHtml}
                </select>
                <label class="label-bold-block-5">Détails (optionnel) :</label>
                <textarea id="report-project-details" style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 6px; min-height: 80px;" placeholder="Décrivez le problème..." data-tooltip="Décrivez le problème..."></textarea>
            `,
            confirmText: 'Envoyer le signalement',
            icon: '🚩'
        });
        
        if(result) {
            const reason = document.getElementById('report-project-reason')?.value || 'other';
            const details = document.getElementById('report-project-details')?.value || '';
            
            const { error } = await supabase.from('reports').insert({
                reporter_email: state.currentUser.email.toLowerCase(),
                reported_type: 'project',
                reported_id: projectId || project?.projectId || project?.id,
                reported_name: project?.title || 'Sans titre',
                reported_email: project?.ownerEmail || '',
                reason: reason,
                details: details,
                status: 'pending',
                created_at: new Date().toISOString()
            });
            
            if(error) {
                console.error('Erreur signalement:', error);
                Utils.toast('Erreur lors du signalement', 'error');
            } else {
                Utils.toast('Signalement envoyé. Merci !', 'success');
            }
        }
    },
	
// Modale profil, favoris & contact — délégué à UniverseProfileModal
    openProfileModal: (...a) => UniverseProfileModal.openProfileModal(...a),
    closeProfileModal: (...a) => UniverseProfileModal.closeProfileModal(...a),
    exportProfilePDF: (...a) => UniverseProfileModal.exportProfilePDF(...a),
    isFavorite: (...a) => UniverseProfileModal.isFavorite(...a),
    toggleFavorite: (...a) => UniverseProfileModal.toggleFavorite(...a),
    contactProfile: (...a) => UniverseProfileModal.contactProfile(...a),
    addToProject: (...a) => UniverseProfileModal.addToProject(...a),
    // Ajoute le profil ouvert aux idees de casting du personnage d'ou part la
    // recherche. Sans contexte de casting, on l'indique simplement.
    addCurrentProfileToIdea: () => {
        const cid = (typeof GlobalSearch !== 'undefined') ? GlobalSearch._castingCharId : null;
        if(!cid) { Utils.toast('Lance un casting depuis un personnage pour ajouter une idée.', 'info'); return; }
        if(Universe.currentProfile && typeof Board !== 'undefined') Board.addProfileIdea(cid, Universe.currentProfile);
    },
	
    // ===================== NAVIGATION & UTILITAIRES =====================
    // V2.1.6 : Ouvrir l'univers depuis le menu Communauté
    openFromMenu: async () => {
        UI.hideAllViews();
        document.getElementById('universe-view').style.display = 'flex';
        const _ub = document.getElementById('univers-welcome-banner');
        if(_ub) _ub.style.display = localStorage.getItem('moteur_univers_banner') ? 'none' : '';
        if(!Universe._initialized) {
            await Universe.init();
            Universe._initialized = true;
        } else {
            Universe.render();
            setTimeout(() => { if(Universe.map) Universe.map.invalidateSize(); }, 100);
        }
    },

    // V2.1.6 : Fermer l'univers → retour hub
    closeToHub: () => {
        UI.hideAllViews();
        document.getElementById('dashboard-view').style.display = 'flex';
    },

    // Universe.closeProjects retirée v569, jamais appelée : alias mort de
    // showProjects laissé par le passage à l'accueil "Projets d'abord" (B3 P1).

    // Universe.showProjects retirée v569 : orpheline en cascade depuis le
    // retrait de closeProjects (étape 2), son seul appelant.
    
    // Utilitaire : mélanger un tableau
    shuffleArray: (array) => {
        const arr = [...array];
        for(let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }
};

// --- MODULE MESSAGES V85 ---
const Messages = {
    // Messagerie interne retirée — ne restent que les helpers d'envoi d'email (Brevo).// ===================== EMAIL & COMPOSITION =====================
    // Nettoie une string pour l'email (supprime caractères problématiques)
    sanitizeForEmail: (str) => {
        if(str === null || str === undefined) return '';
        return String(str)
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Supprime accents
            .replace(/[\n\r\t]/g, ' ')
            .replace(/[""''«»]/g, "'")
            .replace(/[àâä]/g, 'a').replace(/[éèêë]/g, 'e').replace(/[ïî]/g, 'i')
            .replace(/[ôö]/g, 'o').replace(/[ùûü]/g, 'u').replace(/[ç]/g, 'c')
            .replace(/[ÀÂÄÁ]/g, 'A').replace(/[ÉÈÊË]/g, 'E').replace(/[ÏÎ]/g, 'I')
            .replace(/[ÔÖ]/g, 'O').replace(/[ÙÛÜÚ]/g, 'U').replace(/[Ç]/g, 'C')
            .replace(/[^\x20-\x7E]/g, '') // Garde uniquement ASCII imprimable
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 500) || 'N/A';
    },
    
    // Templates d'email selon le type
    emailTemplates: {
        'claim': (data) => ({
            title: 'Votre profil vous attend sur moteur.studio',
            message: `${data.senderName} a cree votre profil ${data.typeLabel} dans le projet "${data.projectTitle}" sur moteur.studio. Voulez-vous le revendiquer ? Connectez-vous sur https://moteur.studio pour recuperer ce profil, le completer et apparaitre dans l'Univers.`
        }),
        'invitation': (data) => ({
            title: 'Invitation a rejoindre un projet sur moteur.studio',
            message: `${data.senderName} vous invite a rejoindre le projet "${data.projectTitle}" en tant que ${data.role} sur moteur.studio. Connectez-vous sur https://moteur.studio : l'invitation vous attend sur votre tableau de bord, a vous d'accepter ou de refuser. Si vous acceptez, vous pourrez quitter le projet a tout moment.`
        }),
        'contact': (data) => ({
            title: 'Nouveau message',
            message: `${data.senderName} vous a contacte. Connectez-vous a Moteur pour lire le message et repondre.`
        }),
        'project_contact': (data) => ({
            title: 'Message pour votre projet',
            message: `${data.senderName} vous a contacte concernant votre projet "${data.projectTitle}". Sujet: ${data.subject}. Connectez-vous a Moteur pour lire le message.`
        }),
        'reply': (data) => ({
            title: 'Reponse recue',
            message: `${data.senderName} vous a repondu. Connectez-vous a Moteur pour lire la reponse.`
        }),
        'callsheet': (data) => ({
            title: 'Convocation tournage',
            message: `Vous etes convoque pour le tournage de "${data.projectName}" le ${data.shootDate}. Lieu: ${data.location}. Heure de convocation: ${data.callTime}. Voir et imprimer votre feuille de service: ${data.publicLink || 'https://moteur.studio'}`
        }),
        'default': (data) => ({
            title: 'Notification',
            message: data.customMessage || 'Vous avez recu une notification sur Moteur. Connectez-vous pour en savoir plus.'
        })
    },
    
    // Envoie une notification par email (ping simple)
    sendEmailPing: async (toEmail, toName, emailType = 'default', data = {}) => {
        const sanitize = Messages.sanitizeForEmail;
        const safeToEmail = sanitize(toEmail);
        if(!safeToEmail) { console.warn('Email invalide - ping ignoré'); return; }
        const safeToName = sanitize(toName) || safeToEmail.split('@')[0] || 'Utilisateur';

        // Types gérés nativement par l'Edge Function (beaux gabarits + bouton)
        const nativeTypes = ['invitation', 'claim', 'added', 'request', 'callsheet'];
        let body;
        if(nativeTypes.includes(emailType)) {
            body = {
                to: safeToEmail,
                toName: safeToName,
                type: emailType,
                data: {
                    senderName: sanitize(data.senderName) || 'Un utilisateur',
                    projectTitle: sanitize(data.projectTitle) || 'votre projet',
                    typeLabel: sanitize(data.typeLabel) || 'membre',
                    role: sanitize(data.role) || 'collaborateur',
                    projectName: sanitize(data.projectName) || sanitize(data.projectTitle) || 'le projet',
                    shootDate: sanitize(data.shootDate) || '',
                    location: sanitize(data.location) || '',
                    callTime: sanitize(data.callTime) || '',
                    publicLink: data.publicLink || 'https://moteur.studio'
                }
            };
        } else {
            const templateFn = Messages.emailTemplates[emailType] || Messages.emailTemplates['default'];
            const t = templateFn({
                senderName: sanitize(data.senderName) || 'Un utilisateur',
                projectTitle: sanitize(data.projectTitle) || 'Projet',
                typeLabel: sanitize(data.typeLabel) || 'membre',
                role: sanitize(data.role) || 'collaborateur',
                subject: sanitize(data.subject) || 'Sans sujet',
                customMessage: sanitize(data.customMessage) || '',
                projectName: sanitize(data.projectName) || sanitize(data.projectTitle) || 'le projet',
                shootDate: sanitize(data.shootDate) || '',
                location: sanitize(data.location) || '',
                callTime: sanitize(data.callTime) || '',
                publicLink: data.publicLink || 'https://moteur.studio'
            });
            body = { to: safeToEmail, toName: safeToName, type: 'generic', data: { subject: t.title, title: t.title, message: t.message } };
        }

        try {
            const { error } = await supabase.functions.invoke('super-action', { body });
            if(error) console.warn('Erreur ping email:', error);
        } catch(e) {
            console.error('Erreur ping email:', e);
        }
    },
};

// --- MODULE INVITATIONS V84 ---
const Invitations = {
    // ===================== VÉRIFICATION & PROFILS =====================
    // Vérifie si l'email existe déjà dans Supabase
    checkEmail: async (email) => {
        const statusEl = document.getElementById('share-email-status');
        const messageSection = document.getElementById('share-message-section');
        if(!statusEl || !messageSection) return;

        const saisi = (email || '').trim().toLowerCase();
        if(!saisi || !saisi.includes('@')) {
            statusEl.style.display = 'none';
            messageSection.style.display = 'none';
            return;
        }

        // v570 — CORRECTION : cette fonction interrogeait la base avec l'adresse de
        // L'UTILISATEUR COURANT au lieu de celle qu'on saisit, puis appelait
        // profileSnap.exists(), methode inexistante heritee de l'epoque Firebase.
        // Elle levait donc une exception a tous les coups et le bandeau ne
        // s'affichait jamais. On interroge owner_email, seule cle fiable d'un compte.
        try {
            const { data: profils, error } = await supabase
                .from('user_profiles')
                .select('id')
                .eq('owner_email', saisi)
                .limit(1);
            if(error) throw error;

            const compteExiste = !!(profils && profils.length > 0);
            statusEl.style.display = 'block';
            if(compteExiste) {
                statusEl.innerHTML = '✅ <strong>Utilisateur existant</strong> — l\'invitation l\'attendra sur son tableau de bord';
                statusEl.style.background = 'rgba(40,167,69,0.1)';
                statusEl.style.color = 'var(--success)';
            } else {
                statusEl.innerHTML = '📧 <strong>Nouvel utilisateur</strong> — un e-mail l\'invitera à créer son compte';
                statusEl.style.background = 'rgba(43,110,246,0.1)';
                statusEl.style.color = 'var(--primary)';
            }
            // Le message personnalise part dans l'e-mail : utile dans les deux cas.
            messageSection.style.display = 'block';
        } catch(e) {
            console.warn('[Invitations] checkEmail:', e && e.message);
            statusEl.style.display = 'none';
            messageSection.style.display = 'block';
        }
    },
    
    // Envoie l'invitation
    // I5f: charge dynamiquement les profils publics de l'email saisi
    loadTargetProfiles: async (emailInput) => {
        const email = (emailInput || '').trim().toLowerCase();
        const section = document.getElementById('share-target-profile-section');
        const select = document.getElementById('share-target-profile');
        if(!section || !select) return;
        
        // Si email invalide ou vide, on masque la section
        if(!email || !email.includes('@') || email.length < 5) {
            section.style.display = 'none';
            select.innerHTML = '<option value="">-- Choisir un profil --</option>';
            return;
        }
        
        // Charger les profils publics liés à cet email
        try {
            const { data: profiles, error } = await supabase
                .from('user_profiles')
                .select('id, name, profile_type')
                .eq('owner_email', email);
            
            if(error || !profiles || profiles.length === 0) {
                // Aucun profil trouvé : on masque, l'invitation partira sans to_profile_id
                section.style.display = 'none';
                select.innerHTML = '<option value="">-- Aucun profil public pour cet email --</option>';
                return;
            }
            
            // Remplir le select avec les profils trouvés
            let html = '';
            if(profiles.length > 1) {
                html += '<option value="">-- Choisir un profil --</option>';
            }
            profiles.forEach(p => {
                const icon = p.profile_type === 'actor' ? '🎭' 
                           : p.profile_type === 'crew' ? '🎥' 
                           : p.profile_type === 'association' ? '🏛️' 
                           : p.profile_type === 'enterprise' ? '🏢' 
                           : '👤';
                const displayName = p.name || '(sans nom)';
                html += `<option value="${p.id}">${icon} ${Utils.escape(displayName)}</option>`;
            });
            select.innerHTML = html;
            
            // Si un seul profil, pré-sélectionné automatiquement
            if(profiles.length === 1) {
                select.value = profiles[0].id;
            }
            
            section.style.display = 'block';
        } catch(e) {
            console.warn('Erreur chargement profils destinataires:', e);
            section.style.display = 'none';
        }
    },
    
    // ===================== ENVOI D'INVITATION =====================
    sendInvitation: async () => {
        // Vérifier si l'email est dans la whitelist
        const email = document.getElementById('share-email')?.value?.trim()?.toLowerCase();
        
        if(!email || !email.includes('@')) {
            Utils.toast('Veuillez entrer un email valide.', 'warning');
            return;
        }
        
        // G5b: Vérifier le blocage badge noir
        if(state.currentUser?.email) {
            const check = await Moderation.canCommunicate(state.currentUser.email, email);
            if(!check.allowed) {
                Utils.toast(check.reason, 'warning', 6000);
                return;
            }
        }
        
        const role = document.getElementById('share-role').value;
        const message = document.getElementById('share-message')?.value?.trim() || '';
        
        // I5f: profil destinataire sélectionné (peut être vide si user sans profil public)
        const targetProfileId = document.getElementById('share-target-profile')?.value || null;
        
        // I5f: si plusieurs profils disponibles mais aucun choisi, bloquer
        const profileSection = document.getElementById('share-target-profile-section');
        const profileSelect = document.getElementById('share-target-profile');
        if(profileSection && profileSection.style.display === 'block' && profileSelect && profileSelect.options.length > 1 && !targetProfileId) {
            Utils.toast('Veuillez choisir quel profil de cette personne inviter.', 'warning');
            return;
        }
        
        if(!state.currentProjectId) return;
        
        const btn = document.getElementById('share-confirm-btn');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span>Envoi...';
        btn.classList.add('btn-loading');
        
        // v570 : emailKey / fromProfileId / inviterEmail retirees — elles n'alimentaient
        // que l'insertion en double dans « messages », supprimee avec l'acceptation.
        const pid = state.currentProjectId;
        const projectTitle = state.data.title || 'Sans titre';
        const inviterName = state.currentUser.email.split('@')[0];
        
        try {
            // T10 fix : un user peut avoir plusieurs profils publics, chacun avec owner_email = son email.
            // On vérifie l'existence du compte via owner_email (et non la colonne email, devenue ambiguë).
            const { data: existingProfiles, error: errExProf } = await supabase
                .from('user_profiles')
                .select('id, owner_email')
                .eq('owner_email', email.toLowerCase());
            if(errExProf) throw errExProf;
            
            const userExists = !!(existingProfiles && existingProfiles.length > 0);
            
            // Ajouter le membre par email + profil cible (même clé de lecture que getProjectsList).
            // On ne dépend pas d'une contrainte unique DB : on regarde d'abord si le membership existe,
            // puis on insère ou on met à jour.
            const { data: existingMember, error: errExMemb } = await supabase
                .from('project_members')
                .select('id')
                .eq('project_id', pid)
                .eq('email', email)
                .maybeSingle();
            if(errExMemb) throw errExMemb;
            
            if(existingMember) {
                // v570 : seul le proprietaire peut modifier une ligne existante (policy UPDATE).
                // Un delegue qui reinvite quelqu'un de deja present echouerait en silence.
                if(state.currentRole !== 'owner') {
                    Utils.toast('Cette personne fait déjà partie du projet ou a déjà été invitée. Seul le propriétaire peut changer son rôle.', 'warning', 6000);
                    return;
                }
                await supabase
                    .from('project_members')
                    .update({ role: role, profile_id: targetProfileId })
                    .eq('id', existingMember.id);
            } else {
                await supabase
                    .from('project_members')
                    .insert({
                        project_id: pid,
                        email: email, // clé de filtrage utilisée par getProjectsList
                        profile_id: targetProfileId, // I5f : profil cible (peut être null)
                        role: role,
                        status: 'pending', // v570 : consentement — la personne doit accepter
                        invited_by: state.currentUser.id,
                        invited_at: new Date().toISOString()
                    });
            }
            
            // v570 : plus de doublon dans « messages ». L'invitation en attente EST la ligne
            // project_members au statut 'pending' ; le tableau de bord la propose a l'acceptation.
            
            // Cloche in-app + email externe direct (plus de message interne)
            const roleLabel = role === 'editor' ? 'Éditeur' : 'Lecteur';
            try {
                if(userExists) await Notifications.send(email, 'invite', `${inviterName} vous a invité(e) au projet \"${projectTitle}\" en tant que ${roleLabel}`, pid);
            } catch(e) { console.warn('Notification invitation:', e); }
            
            // Envoyer un ping email
            if(!userExists) {
                await Invitations.sendEmail(email, projectTitle, role, inviterName, message);
            } else {
                await Messages.sendEmailPing(email, email.split('@')[0], 'invitation', {
                    senderName: inviterName,
                    projectTitle: projectTitle,
                    role: roleLabel
                });
            }
            
            const roleForLog = role === 'editor' ? 'Éditeur' : 'Lecteur';
            History.log('SHARE', `Invitation envoyée à ${email} (${roleForLog})`);
            Utils.toast(`Invitation envoyée à ${email} — en attente de sa réponse.`, 'success', 5000);
            
            document.getElementById('share-modal').style.display = 'none';
            document.getElementById('share-email').value = '';
            document.getElementById('share-message').value = '';
            document.getElementById('share-email-status').style.display = 'none';
            document.getElementById('share-message-section').style.display = 'none';
            // I5f: reset du sélecteur profil cible
            const tps = document.getElementById('share-target-profile-section');
            if(tps) tps.style.display = 'none';
            const tp = document.getElementById('share-target-profile');
            if(tp) tp.innerHTML = '<option value="">-- Choisir un profil --</option>';
            
        } catch(e) {
            Utils.toast('Erreur: ' + e.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '📧 Inviter';
            btn.classList.remove('btn-loading');
        }
    },
    
    // Envoie l'email d'invitation via l'Edge Function (super-action)
    sendEmail: async (toEmail, projectTitle, role, inviterName, message) => {
        const safeToEmail = String(toEmail || '').trim();
        if(!safeToEmail) { console.warn('Email invalide - envoi ignoré'); return; }
        const safeRole = role === 'editor' ? 'Éditeur' : 'Lecteur';
        const safeProjectTitle = String(projectTitle || 'Projet').trim();
        const safeInviterName = String(inviterName || 'Un utilisateur').trim();

        try {
            const { error } = await supabase.functions.invoke('super-action', { body: {
                to: safeToEmail,
                toName: safeToEmail.split('@')[0] || 'Utilisateur',
                type: 'invitation',
                data: { senderName: safeInviterName, projectTitle: safeProjectTitle, role: safeRole }
            } });
            if(error) {
                console.error('Erreur envoi invitation:', error);
                Invitations.openMailto(toEmail, projectTitle, role, inviterName, message);
            }
        } catch(e) {
            console.error('Erreur envoi invitation:', e);
            Invitations.openMailto(toEmail, projectTitle, role, inviterName, message);
        }
    },
    
    // Ouvre le client mail en fallback
    openMailto: (toEmail, projectTitle, role, inviterName, message) => {
        const roleLabel = role === 'editor' ? 'Éditeur' : 'Lecteur';
        const subject = encodeURIComponent(`Invitation à collaborer sur "${projectTitle}" - Moteur`);
        const body = encodeURIComponent(
`Bonjour,

${inviterName} vous invite à collaborer sur le projet "${projectTitle}" en tant que ${roleLabel}.

${message ? 'Message: ' + message + '\n\n' : ''}Pour acceder au projet, creez votre compte gratuit sur Moteur :
${window.location.origin}${window.location.pathname}

À bientôt !`
        );
        window.open(`mailto:${toEmail}?subject=${subject}&body=${body}`, '_blank');
    },

    // ===================== INVITATIONS EN ATTENTE (v570) =====================
    // Une invitation en attente EST une ligne project_members au statut 'pending'.
    // Elle ne donne AUCUN acces : can_view_project / can_edit_project l'ignorent.
    // La personne invitee l'accepte (fonction serveur invitation_accept) ou la
    // refuse (suppression de sa propre ligne, deja autorisee par la policy DELETE).
    // La carte grisee apparait DANS la grille des projets, a la racine.
    _pending: [],

    // Charge mes invitations en attente (appelee par UIDashboard.renderProjectList).
    loadPending: async () => {
        if(!state.currentUser) { Invitations._pending = []; return []; }
        try {
            const { data, error } = await supabase.rpc('my_pending_invitations');
            if(error) throw error;
            Invitations._pending = data || [];
        } catch(e) {
            console.warn('[Invitations] Lecture des invitations en attente impossible:', e && e.message);
            Invitations._pending = [];
        }
        return Invitations._pending;
    },

    _roleLabel: (r) => (r === 'editor' ? 'Éditeur' : (r === 'owner' ? 'Propriétaire' : 'Lecteur')),

    // Construit la carte grisee d'une invitation (meme gabarit qu'une carte projet).
    buildCard: (inv) => {
        const card = document.createElement('div');
        card.className = 'project-card pinv-card';
        card.dataset.pinv = inv.project_id;
        const who = (inv.inviter_email || '').split('@')[0] || 'Quelqu\'un';
        const seriesBadge = (inv.project_type === 'series')
            ? `<div class="p-series-line"><span class="p-series-badge" title="Projet série">📺 ${inv.episode_count || 0} épisode${(inv.episode_count || 0) > 1 ? 's' : ''}</span></div>`
            : '';
        card.innerHTML = `<span class="p-role-badge pinv-badge">INVITATION</span>`
            + `<div><div class="p-title">${Utils.escape(inv.project_title || 'Projet sans titre')}</div>`
            + seriesBadge
            + `<div class="p-meta">${Utils.escape(who)} vous invite en tant que ${Invitations._roleLabel(inv.role)}</div>`
            + `<div class="pinv-hint">Survolez la carte pour découvrir le projet</div></div>`
            + `<div class="pinv-actions">`
            + `<button class="btn btn--primary btn--sm">Accepter</button>`
            + `<button class="select-outline">Refuser</button>`
            + `</div>`;
        const btns = card.querySelectorAll('.pinv-actions button');
        btns[0].onclick = (e) => { e.stopPropagation(); Invitations.hidePreview(); Invitations.accept(inv.project_id); };
        btns[1].onclick = (e) => { e.stopPropagation(); Invitations.hidePreview(); Invitations.refuse(inv.project_id); };
        // Survol (bureau) ET clic (tactile) : meme panneau d'apercu.
        card.addEventListener('mouseenter', () => Invitations.showPreview(card, inv));
        card.addEventListener('mouseleave', () => Invitations.hidePreview());
        card.addEventListener('click', (e) => {
            if(e.target.closest('.pinv-actions')) return;
            if(Invitations._previewFor === inv.project_id) Invitations.hidePreview();
            else Invitations.showPreview(card, inv);
        });
        return card;
    },

    // ——— Apercu de la fiche de presentation ———
    // Seule la fiche Presentation est exposee cote serveur (my_pending_invitations) :
    // ni casting, ni planning, ni budget, ni scenario. L'affiche n'est pas montree,
    // le stockage des images etant ferme aux non-membres.
    _previewEl: null,
    _previewFor: null,

    showPreview: (card, inv) => {
        Invitations.hidePreview();
        const p = inv.presentation || {};
        const tags = ['genre', 'format', 'duration', 'productionType']
            .map(k => (p[k] || '').trim()).filter(Boolean);
        const pitch = (p.description || '').trim();
        const synopsis = (p.synopsisShort || '').trim();
        let body = '';
        if(tags.length) body += `<div class="pinv-pv-tags">${tags.map(t => `<span class="pinv-pv-tag">${Utils.escape(t)}</span>`).join('')}</div>`;
        if(pitch) body += `<div class="pinv-pv-label">Présentation</div><div class="pinv-pv-block">${Utils.escape(pitch)}</div>`;
        if(synopsis) body += `<div class="pinv-pv-label">Synopsis</div><div class="pinv-pv-block">${Utils.escape(synopsis)}</div>`;
        if(!body) body = `<div class="pinv-pv-empty">La fiche de présentation de ce projet n'est pas encore remplie.</div>`;
        const el = document.createElement('div');
        el.className = 'pinv-preview';
        el.innerHTML = `<h4>${Utils.escape(inv.project_title || 'Projet sans titre')}</h4>`
            + `<div class="pinv-pv-sub">Invitation de ${Utils.escape((inv.inviter_email || '').split('@')[0] || 'quelqu\'un')}</div>`
            + body;
        el.addEventListener('mouseenter', () => clearTimeout(Invitations._hideT));
        el.addEventListener('mouseleave', () => Invitations.hidePreview());
        document.body.appendChild(el);
        // Positionnement : a droite de la carte si la place existe, sinon a gauche, sinon dessous.
        const r = card.getBoundingClientRect();
        const w = el.offsetWidth, h = el.offsetHeight;
        let left = r.right + 12;
        if(left + w > window.innerWidth - 12) left = r.left - w - 12;
        if(left < 12) left = Math.max(12, Math.min(r.left, window.innerWidth - w - 12));
        let top = r.top;
        if(top + h > window.innerHeight - 12) top = Math.max(12, window.innerHeight - h - 12);
        el.style.left = left + 'px';
        el.style.top = top + 'px';
        Invitations._previewEl = el;
        Invitations._previewFor = inv.project_id;
    },

    _hideT: null,
    hidePreview: () => {
        clearTimeout(Invitations._hideT);
        if(Invitations._previewEl) { Invitations._previewEl.remove(); Invitations._previewEl = null; }
        Invitations._previewFor = null;
    },

    // Accepte : bascule ma ligne en 'accepted' cote serveur, puis rafraichit la grille.
    accept: async (projectId) => {
        if(!projectId || !state.currentUser) return;
        const inv = (Invitations._pending || []).find(i => i.project_id === projectId);
        try {
            const { error } = await supabase.rpc('invitation_accept', { p_project: projectId });
            if(error) throw error;
            Utils.toast('Invitation acceptée' + (inv && inv.project_title ? ' : ' + inv.project_title : '') + ' !', 'success');
        } catch(e) {
            Utils.toast('Impossible d\'accepter l\'invitation pour le moment.', 'error');
            console.warn('[Invitations] accept:', e && e.message);
            return;
        }
        try { if(typeof UIDashboard !== 'undefined') await UIDashboard.renderProjectList(); } catch(e) {}
    },

    // Refuse : supprime ma propre ligne (policy DELETE « owner or self »).
    refuse: async (projectId) => {
        if(!projectId || !state.currentUser) return;
        const inv = (Invitations._pending || []).find(i => i.project_id === projectId);
        const titre = (inv && inv.project_title) || 'ce projet';
        const ok = await ConfirmModal.show({
            title: 'Refuser l\'invitation ?',
            message: 'Vous n\'aurez pas accès à « ' + Utils.escape(titre) + ' ». La personne qui vous a invité pourra vous réinviter plus tard.',
            icon: '📭',
            confirmText: 'Refuser',
            dangerous: true
        });
        if(!ok) return;
        try {
            const { error } = await supabase
                .from('project_members')
                .delete()
                .eq('project_id', projectId)
                .eq('email', state.currentUser.email.toLowerCase());
            if(error) throw error;
            Utils.toast('Invitation refusée.', 'info');
        } catch(e) {
            Utils.toast('Impossible de refuser l\'invitation pour le moment.', 'error');
            console.warn('[Invitations] refuse:', e && e.message);
            return;
        }
        try { if(typeof UIDashboard !== 'undefined') await UIDashboard.renderProjectList(); } catch(e) {}
    }
};

  // === MODULE TUTORIEL & AIDE CONTEXTUELLE ===
  // ===================== VISITE GUIDEE (TOUR / ONBOARDING) =====================
  // Moteur generique de visites guidees multi-chapitres (spotlight + infobulle,
  // pilote par l'utilisateur). Chapitres dans Tour.chapters. API : start/next/prev/stop/goTo.
  // ============================================================
  // MODULE FEEDBACK — bulle « retour utilisateur »
  // ------------------------------------------------------------
  // Posee en bas a gauche, au-dessus du mini-chat quand celui-ci
  // est monte (classe body.has-minichat). Contrairement au mini-chat,
  // elle vit AUSSI sur le hub : un retour doit pouvoir partir de
  // n'importe ou, y compris quand aucun projet n'est ouvert.
  //
  // ENVOI DIFFERE — les remarques ne partent PAS a chaque clic.
  // Elles s'accumulent dans le navigateur, restent modifiables et
  // supprimables, et sont envoyees en UN SEUL message au premier
  // passage de minuit. Sans cela, dix utilisateurs actifs
  // produiraient des centaines de mails isoles et illisibles.
  //
  // CONSEQUENCE ASSUMEE : une remarque ecrite puis jamais suivie
  // d'une reouverture de l'application apres minuit ne part pas.
  // C'est le prix du stockage local, qui evite une table Supabase
  // et une migration.
  // ============================================================