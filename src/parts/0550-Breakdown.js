
  const Breakdown = {
      // Classement de la colonne des fiches. Reglage de MOMENT DE TRAVAIL et non
      // du projet : on trie par categorie pour depouiller, par etat de liaison
      // pour rattraper les oublis. Il ne se persiste donc pas.
      sort: 'cat',
      setSort: (v) => {
          Breakdown.sort = ['cat', 'fam', 'link', 'az'].indexOf(v) >= 0 ? v : 'cat';
          const sc = state.data.scenes.find(s => s.id === state.activeBdSceneId);
          if(sc) Breakdown.renderFiches(sc);
      },
      
      init: () => {
          Breakdown.renderScenes();
          if(state.data.scenes.length === 0) {
              els.bdScriptContent.innerHTML = '<div style="color:var(--text-sec);text-align:center;margin-top:20px">Aucune scène.</div>';
              els.bdRightContent.innerHTML = '';
              Breakdown.refreshAuditBadge();
              return;
          }
          const scene = state.data.scenes.find(s => s.id === state.activeBdSceneId);
          if(scene) { Breakdown.renderLeft(scene); Breakdown.renderFiches(scene); }
          else {
              els.bdScriptContent.innerHTML = '<div style="color:var(--text-sec);text-align:center;margin-top:20px">Sélectionnez une scène à gauche.</div>';
              els.bdRightContent.innerHTML = '<div style="padding:15px; color:var(--text-sec); font-size:0.85rem;">Sélectionnez une scène pour voir et compléter son dépouillement.</div>';
          }
          Breakdown.refreshAuditBadge();
      },
      
      selectScene: (id) => {
          state.activeBdSceneId = (state.activeBdSceneId === id) ? null : id;
          Breakdown.init();
      },
      
      // ===== COLONNE 1 : LES SCENES =====
      renderScenes: () => {
          const col = document.getElementById('bdScenesContent');
          if(!col) return;
          const esc = Utils.escape;
          const labels = { 'not-verified': '🔴', 'to-work': '🟡', 'verified': '🟢' };
          col.innerHTML = (state.data.scenes || []).map((s, idx) => {
              const isFinal = s.isFinal === true;
              if(isFinal) Breakdown.autoFill(s);
              let n = 0;
              CONFIG.bdCategories.forEach(cat => { n += ((s.breakdown && s.breakdown[cat]) || []).length; });
              const actif = (s.id === state.activeBdSceneId) ? ' active' : '';
              const st = labels[s.status || 'not-verified'];
              return `<div class="bd-scene-row${actif}" data-scene-id="${esc(String(s.id))}" onclick="app.Breakdown.selectScene('${s.id}')" title="${esc(s.title || '')}">
                          <span class="bd-scene-row-num">#${idx + 1}</span>
                          <span class="bd-scene-row-title">${esc(s.title || 'Sans titre')}</span>
                          <span class="bd-scene-row-count" title="${isFinal ? n + ' élément(s) dépouillé(s)' : 'Scène en brouillon'}">${isFinal ? (n || '·') : '📝'}</span>
                          <span class="scene-status-badge ${s.status || 'not-verified'}" onclick="event.stopPropagation(); app.UI.toggleSceneStatus('${s.id}', event)">${st}</span>
                      </div>`;
          }).join('') || '<div style="padding:12px; color:var(--text-sec); font-size:0.8rem;">Aucune scène.</div>';
      },
      
      // ===== COLONNE 3 : LES FICHES =====
      // Ce n'est plus une liste de mots mais des FICHES : vignette, nom,
      // categorie et descripteur. Un nom seul ne dit pas si « VALISE » est la
      // valise en cuir de la scene 3 ou une autre.
      ficheCard: (scene, cat, item, i, canEdit) => {
          const esc = Utils.escape;
          const txt = Utils.bdText(item);
          const link = Breakdown.lookup(item, cat);
          const kind = Utils.bdKindOf(cat);
          let extraAttr = '';
          // COMEDIENS : on retient le personnage joue, le trace de liaison vers
          // le scenario s'en sert pour retrouver la replique.
          if(cat === 'COMEDIENS') {
              const actor = (link && link.kind === 'actor') ? link.rec : (state.data.actors || []).find(a => a.name === txt);
              if(actor) {
                  const ch = (state.data.characters || []).find(c => c.actor_id === actor.id);
                  if(ch && ch.name) extraAttr = ` data-linked-char="${esc(ch.name.toLowerCase())}"`;
              }
          }
          const rec = link ? link.rec : null;
          const k = link ? link.kind : kind;
          const photo = rec ? (rec.photo || (Array.isArray(rec.photos) && rec.photos[0]) || '') : '';
          const vignette = photo
              ? `<img src="${esc(photo)}" alt="">`
              : (k ? Links.icon(k) : '📝');
          let onclick = '';
          let titre = txt;
          if(k && rec) { onclick = ` onclick="app.UI.openFiche('${k}', ${Utils.jsArg(String(rec.id))})"`; titre = 'Ouvrir la fiche de ' + txt; }
          else if(link && link.masque) { titre = txt + ' — fiche rattachée, mais vous n\'avez pas accès à cette section.'; }
          else if(kind && canEdit) { onclick = ` onclick="app.Breakdown.resolveItem('${scene.id}', ${Utils.jsArg(cat)}, ${i})"`; titre = 'Aucune fiche — cliquez pour en créer une ou rattacher l\u2019élément'; }
          // La carte GARDE la classe .bd-tag : c'est elle que lit le trace de
          // liaison vers le scenario. v594 : simplifiee en ligne (photo + nom
          // seulement, la categorie est deja portee par le groupe).
          const etat = kind ? (link ? ' is-linked' : ' is-unlinked') : '';
          return `<div class="bd-fiche-row bd-tag${etat}" data-term="${esc(txt.toLowerCase())}"${extraAttr}${onclick} title="${esc(titre)}">
                      ${canEdit ? `<div class="compact-card-actions">
                          <button class="delete-btn" onclick="event.stopPropagation(); app.Breakdown.removeItem('${scene.id}', ${Utils.jsArg(cat)}, ${i}, event)" title="Retirer de cette scène">×</button>
                      </div>` : ''}
                      ${kind ? `<div class="bd-fiche-state ${link ? 'ok' : 'missing'}" title="${link ? 'Rattaché à une fiche' : 'Aucune fiche'}"></div>` : ''}
                      <div class="bd-fiche-row-photo">${vignette}</div>
                      <div class="bd-fiche-row-name">${esc(txt)}</div>
                  </div>`;
      },

      // Groupes replies (v594) : memorises par appareil, cle = titre du groupe.
      _collapsedGroups: null,
      _loadCollapsedGroups: () => {
          if(Breakdown._collapsedGroups) return Breakdown._collapsedGroups;
          let arr = [];
          try { arr = JSON.parse(localStorage.getItem('moteur_bd_groups_collapse') || '[]'); } catch(e) {}
          Breakdown._collapsedGroups = new Set(Array.isArray(arr) ? arr : []);
          return Breakdown._collapsedGroups;
      },
      toggleGroup: (titre) => {
          const set = Breakdown._loadCollapsedGroups();
          if(set.has(titre)) set.delete(titre); else set.add(titre);
          try { localStorage.setItem('moteur_bd_groups_collapse', JSON.stringify(Array.from(set))); } catch(e) {}
          const scene = (state.data.scenes || []).find(s => s.id === state.activeBdSceneId);
          if(scene) Breakdown.renderFiches(scene);
      },

      // v601 — LES DEUX PANNEAUX DISENT DE QUELLE SCENE ILS PARLENT. Sans cet
      // attribut, le verrou par scene ne voyait rien ici : il cherche un
      // conteneur qui PORTE l'identifiant, et le depouillement passait le sien
      // par un onclick. On pouvait donc depouiller a deux la meme scene sans
      // que personne ne soit prevenu.
      _marquerPanneaux: (scene) => {
          const id = (scene && scene.id != null) ? String(scene.id) : '';
          [els.bdScriptContent, els.bdRightContent].forEach(el => {
              if(!el) return;
              if(id) el.dataset.sceneId = id; else delete el.dataset.sceneId;
          });
          try { if(typeof VerrouFin !== 'undefined') VerrouFin.marquerTout(); } catch(e) {}
      },

      renderFiches: (scene) => {
          if(!els.bdRightContent) return;
          Breakdown._marquerPanneaux(scene);
          if(!scene) { els.bdRightContent.innerHTML = ''; return; }
          if(scene.isFinal !== true) {
              els.bdRightContent.innerHTML = `
                  <div style="padding: 15px; text-align: center; background: #fff8e1; border-radius: 8px; margin: 12px;">
                      <div style="font-size: 1.5rem; margin-bottom: 8px;">📝</div>
                      <div style="font-weight: 600; color: #ef6c00; margin-bottom: 5px;">Scène en brouillon</div>
                      <div style="font-size: 0.85rem; color: #666; margin-bottom: 10px;">Finalisez cette scène pour pouvoir la dépouiller.</div>
                      <button onclick="app.Actions.finalizeScene('${scene.id}')" class="finalize-btn">✅ Finaliser cette scène</button>
                  </div>`;
              return;
          }
          const canEdit = state.currentRole === 'owner' || Permissions.canEdit('depouillement');
          // Toutes les entrees a plat : le classement demande ensuite ou chacune va.
          const tout = [];
          CONFIG.bdCategories.forEach(cat => {
              ((scene.breakdown && scene.breakdown[cat]) || []).forEach((item, i) => {
                  tout.push({ cat, item, i, texte: Utils.bdText(item), lien: Breakdown.lookup(item, cat), kind: Utils.bdKindOf(cat) });
              });
          });
          if(!tout.length) {
              els.bdRightContent.innerHTML = `<div style="padding:15px; font-size:0.82rem; color:var(--text-sec); font-style:italic;">
                  Rien pour l'instant. Sélectionnez du texte dans le scénario et faites un clic droit, ou utilisez le ➕ ci-dessus pour ce qui n'est pas écrit.</div>`;
              Breakdown.setupLinkHovers();
              return;
          }
          
          const groupes = [];   // { titre, entrees }
          if(Breakdown.sort === 'cat') {
              CONFIG.bdCategories.forEach(cat => {
                  const e = tout.filter(x => x.cat === cat);
                  if(e.length) groupes.push({ titre: Utils.catLabel(cat), entrees: e });
              });
          } else if(Breakdown.sort === 'fam') {
              const fam = {};
              tout.forEach(x => { const k = x.kind || '_'; (fam[k] = fam[k] || []).push(x); });
              Object.keys(fam).forEach(k => {
                  groupes.push({
                      titre: k === '_' ? 'Sans fiche possible' : (Links.icon(k) + ' ' + Links.kindLabel(k)),
                      entrees: fam[k]
                  });
              });
          } else if(Breakdown.sort === 'link') {
              // Les manques d'abord : c'est le classement qu'on choisit quand on
              // cherche precisement ce qui n'est pas rattache.
              const sans = tout.filter(x => x.kind && !x.lien);
              const avec = tout.filter(x => x.kind && x.lien);
              const hors = tout.filter(x => !x.kind);
              if(sans.length) groupes.push({ titre: '⚠️ Sans fiche (' + sans.length + ')', entrees: sans });
              if(avec.length) groupes.push({ titre: '✅ Rattachés (' + avec.length + ')', entrees: avec });
              if(hors.length) groupes.push({ titre: 'Sans fiche possible (' + hors.length + ')', entrees: hors });
          } else {
              const tri = tout.slice().sort((a, b) => a.texte.localeCompare(b.texte, 'fr', { sensitivity: 'base' }));
              groupes.push({ titre: '', entrees: tri });
          }
          
          els.bdRightContent.innerHTML = groupes.map(g => {
              const collapsed = g.titre && Breakdown._loadCollapsedGroups().has(g.titre);
              return `
              <div class="bd-fiches-group${collapsed ? ' is-collapsed' : ''}">
                  ${g.titre ? `<div class="bd-cat-name" onclick="app.Breakdown.toggleGroup(${Utils.jsArg(g.titre)})"><span class="bd-cat-name-arrow">▾</span> ${Utils.escape(g.titre)} <span class="bd-cat-name-count">${g.entrees.length}</span></div>` : ''}
                  <div class="bd-fiches-list">
                      ${g.entrees.map(x => Breakdown.ficheCard(scene, x.cat, x.item, x.i, canEdit)).join('')}
                  </div>
              </div>`;
          }).join('');
          Breakdown.setupLinkHovers();
      },
      
      // Compteur porte par le bouton : le nombre d'elements sans fiche doit se
      // voir sans avoir a ouvrir la fenetre, sinon personne ne pense a la lire.
      // v601 — LES FAMILLES HORS DE MA PORTEE, EN CLAIR. Le controle les ignore
      // (voir scanLinks) ; il faut le DIRE, sinon « tout est rattaché » ferait
      // croire a une verification complete alors qu'elle est partielle.
      famillesMasquees: () => {
          const out = [];
          try {
              Object.keys(Breakdown.FICHE_COLL).forEach(k => {
                  if(Links.masquee(k)) out.push(Links.kindLabel(k));
              });
          } catch(e) {}
          return out;
      },

      refreshAuditBadge: () => {
          const btn = document.getElementById('bd-audit-btn');
          if(!btn) return;
          let n = 0;
          try {
              const s = Breakdown.scanLinks();
              n = s.evident.length + s.ambigu.length + s.absent.length;
          } catch(e) { return; }
          const masquees = Breakdown.famillesMasquees();
          btn.title = masquees.length
              ? 'Contrôle partiel : ' + masquees.join(', ') + ' — vous n\'avez pas accès à ces sections.'
              : 'Contrôle des liens entre le dépouillement et les fiches.';
          btn.textContent = n ? `🔗 ${n} sans fiche` : (masquees.length ? '🔗 Tout est rattaché (partiel)' : '🔗 Tout est rattaché');
          btn.style.borderColor = n ? '#ef6c00' : 'var(--border)';
          btn.style.color = n ? '#ef6c00' : 'var(--text-sec)';
      },
      autoFill: (scene) => {
          if(!scene.breakdown) scene.breakdown = {};
          const locMatch = scene.title.match(/^(?:INT\.|EXT\.|I\/E)\s*([^\-]+)/i);
          if(locMatch && locMatch[1]) { const loc = locMatch[1].trim().toUpperCase(); if(!scene.breakdown["DECORS-LIEUX"]) scene.breakdown["DECORS-LIEUX"] = []; if(!scene.breakdown["DECORS-LIEUX"].some(it => Utils.bdSameText(it, loc))) scene.breakdown["DECORS-LIEUX"].push(Utils.bdItem(loc, "DECORS-LIEUX", Breakdown.linkFor(loc, "DECORS-LIEUX"))); }
          // v580 : le depouillement herite des personnages PAR IDENTIFIANT.
          { const persos = FicheLinks.charsOfScene(scene); if(persos.length) { if(!scene.breakdown["PERSONNAGES"]) scene.breakdown["PERSONNAGES"] = []; persos.forEach(ch => { if(!scene.breakdown["PERSONNAGES"].some(it => Utils.bdId(it) === ch.id || Utils.bdSameText(it, ch.name))) scene.breakdown["PERSONNAGES"].push(Utils.bdItem(ch.name, "PERSONNAGES", ch.id)); }); } }
      },
      renderLeft: (scene) => {
          const isFinal = scene.isFinal === true;
          let html = scene.scriptContent || "<p><em>(Vide)</em></p>";
          let titleHtml = scene.title;
          
          if(!isFinal) {
              // Scène en brouillon - afficher le texte avec un overlay d'avertissement
              const finalBadge = `<span class="scene-status-badge draft ml-10">📝 Brouillon</span>`;
              els.bdScriptContent.innerHTML = `
                  <div class="bd-script-text pos-relative">
                      <h3 style="text-decoration:underline;margin-top:0">${titleHtml}${finalBadge}</h3>
                      ${html}
                      <div style="position:absolute; top:0; left:0; right:0; bottom:0; background:rgba(255,152,0,0.05); pointer-events:none;"></div>
                  </div>
                  <div style="margin-top:15px; padding:15px; background:#fff8e1; border:2px dashed #ff9800; border-radius:8px; text-align:center;">
                      <p style="margin:0 0 10px 0; color:#e65100; font-weight:600;">⚠️ Cette scène est en brouillon</p>
                      <p style="margin:0 0 15px 0; color:#666; font-size:0.9rem;">Le dépouillement sera possible une fois la scène finalisée.</p>
                      <button onclick="app.Actions.finalizeScene('${scene.id}')" class="finalize-btn">✅ Finaliser cette scène</button>
                  </div>
              `;
              return;
          }
          
          // Scène finalisée - afficher normalement avec les marquages
          const finalBadge = `<span class="scene-status-badge final ml-10">✅ Finale</span>`;
          if(scene.breakdown) {
              const allItems = []; Object.values(scene.breakdown).forEach(arr => (arr || []).forEach(it => allItems.push(Utils.bdText(it))));
              allItems.sort((a, b) => b.length - a.length);
              // BUG CORRIGE LE 26 AOUT : le remplacement s'appliquait au HTML
              // ENTIER, marques deja posees comprises. Un terme court retrouvait
              // donc son propre nom a l'interieur de l'attribut data-term d'une
              // marque plus longue et coupait la balise en deux — le titre
              // affichait « INT. cabinet d'avocats lala">CABINET D'AVOCATS... ».
              // Deux precautions : on ne remplace que HORS des balises, et une
              // marque posee est mise de cote sous forme de jeton, pour qu'un
              // terme plus court ne vienne pas se loger a l'interieur (« CABINET
              // D'AVOCATS » dans « CABINET D'AVOCATS LALA », deja marque).
              const jetons = [];
              const marquer = (src, regex, tag) => String(src).split(/(<[^>]*>)/).map(
                  (seg, i) => (i % 2 === 1) ? seg : seg.replace(regex, (m) => {
                      jetons.push(`<span class="bd-marked" data-term="${tag}">${m}</span>`);
                      return '\u0001' + (jetons.length - 1) + '\u0001';
                  })
              ).join('');
              allItems.forEach(term => { 
                  if(!term) return; 
                  const safeTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); 
                  const regex = new RegExp(`(?<![\\w-])${safeTerm}(?![\\w-])`, 'gi'); 
                  const tag = term.toLowerCase().replace(/"/g, '&quot;');
                  html = marquer(html, regex, tag);
                  // Aussi marquer dans le titre (pour les décors-lieux)
                  titleHtml = marquer(titleHtml, regex, tag);
              });
              const rendre = (s) => String(s).replace(/\u0001(\d+)\u0001/g, (m, n) => jetons[+n] || '');
              html = rendre(html);
              titleHtml = rendre(titleHtml);
          }
          els.bdScriptContent.innerHTML = `<div class="bd-script-text"><h3 class="bd-scene-title" style="text-decoration:underline;margin-top:0">${titleHtml}${finalBadge}</h3>${html}</div>`;
          // Ajouter les listeners de hover pour la liaison visuelle
          Breakdown.setupLinkHovers();
      },
      setupLinkHovers: () => {
          const svg = document.getElementById('bd-link-svg');
          if(!svg) return;
          svg.innerHTML = '';
          const layout = document.querySelector('.breakdown-layout');
          if(!layout) return;
          
          const highlightPair = (term, charTerm) => {
              // Surligner le tag et sa marque dans le script
              document.querySelectorAll(`.bd-marked[data-term="${term}"], .bd-tag[data-term="${term}"]`).forEach(el => el.classList.add('bd-highlight'));
              // Si un charTerm (personnage lié) est fourni, surligner aussi cette marque
              // Match "flou" : on teste le nom complet, le prénom (1er mot), et toute marque qui commence par le prénom
              if(charTerm) {
                  const firstName = charTerm.split(' ')[0];
                  document.querySelectorAll('.bd-marked[data-term]').forEach(el => {
                      const t = el.dataset.term || '';
                      if(t === charTerm || t === firstName || t.startsWith(firstName + ' ') || firstName.startsWith(t)) {
                          el.classList.add('bd-highlight');
                      }
                  });
              }
              // Recalculer layoutRect à chaque hover pour éviter les décalages
              const currentLayoutRect = layout.getBoundingClientRect();
              drawLink(term, currentLayoutRect, svg, charTerm);
          };
          const unhighlightAll = () => {
              document.querySelectorAll('.bd-highlight').forEach(el => el.classList.remove('bd-highlight'));
              svg.innerHTML = '';
          };
          
          document.querySelectorAll('.bd-marked[data-term]').forEach(el => {
              el.addEventListener('mouseenter', () => highlightPair(el.dataset.term));
              el.addEventListener('mouseleave', unhighlightAll);
          });
          document.querySelectorAll('.bd-tag[data-term]').forEach(el => {
              el.addEventListener('mouseenter', () => highlightPair(el.dataset.term, el.dataset.linkedChar || null));
              el.addEventListener('mouseleave', unhighlightAll);
          });
          
          function drawLink(term, layoutRect, svg, charTerm) {
              svg.innerHTML = '';
              // Toutes les marques de ce terme dans le texte — un trait par
              // occurrence, pas seulement la premiere trouvee.
              let markedList = Array.from(document.querySelectorAll(`.bd-marked[data-term="${term}"]`));
              if(!markedList.length && charTerm) {
                  const firstName = charTerm.split(' ')[0];
                  const allMarked = Array.from(document.querySelectorAll('.bd-marked[data-term]'));
                  markedList = allMarked.filter(el => el.dataset.term === charTerm);
                  if(!markedList.length) markedList = allMarked.filter(el => el.dataset.term === firstName);
                  if(!markedList.length) markedList = allMarked.filter(el => (el.dataset.term || '').startsWith(firstName + ' '));
                  if(!markedList.length) markedList = allMarked.filter(el => firstName.startsWith(el.dataset.term || 'xxx'));
              }
              const tag = document.querySelector(`.bd-tag[data-term="${term}"]`);
              if(!markedList.length || !tag) return;
              const r2 = tag.getBoundingClientRect();
              if(r2.width === 0) return;
              const scrollLeft = layout.scrollLeft || 0;
              const scrollTop = layout.scrollTop || 0;
              const x2 = r2.left - layoutRect.left + scrollLeft;
              const y2 = r2.top + r2.height/2 - layoutRect.top + scrollTop;
              let drawn = 0;
              markedList.forEach(marked => {
                  const r1 = marked.getBoundingClientRect();
                  if(r1.width === 0) return;
                  const x1 = r1.right - layoutRect.left + scrollLeft;
                  const y1 = r1.top + r1.height/2 - layoutRect.top + scrollTop;
                  const cx1 = x1 + (x2 - x1) * 0.3;
                  const cx2 = x1 + (x2 - x1) * 0.7;
                  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                  path.setAttribute('d', `M${x1},${y1} C${cx1},${y1} ${cx2},${y2} ${x2},${y2}`);
                  svg.appendChild(path);
                  drawn++;
              });
              if(!drawn) return;
              const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
              arrow.setAttribute('points', `${x2},${y2} ${x2-8},${y2-4} ${x2-8},${y2+4}`);
              arrow.setAttribute('fill', '#ffd700');
              svg.appendChild(arrow);
          }
      },
      // Decor contenu dans le titre d'une scene. Meme lecture que autoFill :
      // "EXT. PISTE EN FORET - MATIN" donne "PISTE EN FORET". Le moment (apres
      // le tiret) et l'effet (INT./EXT.) ne sont pas des lieux.
      decorFromTitle: (title) => {
          const m = String(title || '').match(/^(?:INT\.|EXT\.|I\/E)\s*([^\-]+)/i);
          return (m && m[1]) ? m[1].trim().toUpperCase() : '';
      },
      // ===================== MENUS CONTEXTUELS (clic droit) =====================
      handleRightClick: (e) => { 
          if(state.currentRole === 'viewer' || !Permissions.canEdit('depouillement')) return; 
          if(!state.activeBdSceneId) return; 
          
          // Vérifier si la scène est finalisée
          const scene = state.data.scenes.find(s => s.id === state.activeBdSceneId);
          if(!scene || scene.isFinal !== true) {
              e.preventDefault();
              Utils.toast('Finalisez cette scène avant de pouvoir la dépouiller', 'warning');
              return;
          }
          
          const sel = window.getSelection(); 
          const text = sel.toString().trim(); 
          
          e.preventDefault(); 
          
          // Clic droit SUR LE TITRE, sans selection : le titre d'une scene decrit
          // l'effet, le decor et le moment (EXT. PISTE EN FORET - MATIN). Ce qu'on
          // y depouille est un LIEU, jamais un technicien — proposer l'equipe ici
          // n'avait aucun rapport avec ce qu'on a sous le curseur.
          const onTitle = !!(e.target && e.target.closest && e.target.closest('.bd-scene-title'));
          if(onTitle && text.length < 1) {
              const decor = Breakdown.decorFromTitle(scene.title);
              els.bdCtxMenu.innerHTML = `<div class="ctx-title">Titre de la scène :</div>`;
              if(decor) {
                  const already = (scene.breakdown && scene.breakdown['DECORS-LIEUX'] || []).some(it => Utils.bdSameText(it, decor));
                  const d = document.createElement('div');
                  d.innerText = already ? `✓ "${decor}" déjà en Décors / Lieux` : `🏠 Ajouter "${decor}" aux Décors / Lieux`;
                  if(already) { d.style.color = 'var(--text-sec)'; }
                  else {
                      d.style.fontWeight = 'bold';
                      d.onclick = () => {
                          Breakdown.addItem(state.activeBdSceneId, 'DECORS-LIEUX', decor);
                          els.bdCtxMenu.style.display = 'none';
                      };
                  }
                  els.bdCtxMenu.appendChild(d);
              }
              const hint = document.createElement('div');
              hint.innerText = 'Sélectionnez un mot du titre pour le dépouiller';
              hint.style.color = 'var(--text-sec)';
              hint.style.fontSize = '0.8rem';
              els.bdCtxMenu.appendChild(hint);
              els.bdCtxMenu.style.display = 'block';
              let topT = e.clientY, leftT = e.clientX;
              if(leftT + 200 > window.innerWidth) leftT = window.innerWidth - 210;
              if(topT + 150 > window.innerHeight) topT = window.innerHeight - 160;
              if(leftT < 10) leftT = 10; if(topT < 10) topT = 10;
              els.bdCtxMenu.style.top = topT + 'px';
              els.bdCtxMenu.style.left = leftT + 'px';
              return;
          }
          
          // Rien de selectionne : on propose TOUTES les categories, et pour
          // chacune les fiches existantes ou une saisie libre. L'ancien menu ne
          // proposait que les techniciens — une seule des seize categories,
          // sans rapport avec ce qu'on a sous le curseur.
          if(text.length < 1) {
              Breakdown.showAddCategories(state.activeBdSceneId);
              Breakdown._menuAt(e.clientX, e.clientY);
              return;
          }
          
          els.bdCtxMenu.innerHTML = `<div class="ctx-title">Ajouter à :</div>`; 
          
          CONFIG.bdCategories.forEach(cat => { 
              const div = document.createElement('div'); 
              div.innerText = Utils.catLabel(cat); 
              
              if(cat === 'TECHNICIENS' || cat === 'COMEDIENS') {
                  // Clic pour afficher la liste des personnes
                  div.innerHTML = `${Utils.escape(Utils.catLabel(cat))} ▶`;
                  div.style.cursor = 'pointer';
                  div.style.fontWeight = 'bold';
                  
                  const isCrew = cat === 'TECHNICIENS';
                  const dataList = isCrew ? state.data.crew : state.data.actors;
                  const itemLabel = isCrew ? 'technicien' : 'comédien';
                  
                  div.onclick = (ev) => {
                      ev.stopPropagation();
                      Breakdown.showPersonMenu(cat, text, sel, dataList, itemLabel);
                  };
              } else {
                  div.onclick = () => { 
                      Breakdown.addItem(state.activeBdSceneId, cat, text); 
                      els.bdCtxMenu.style.display = 'none'; 
                      sel.removeAllRanges(); 
                  };
              }
              
              els.bdCtxMenu.appendChild(div); 
          }); 
          
          els.bdCtxMenu.style.display = 'block';
          let top2 = e.clientY; let left2 = e.clientX;
          if(left2 + 200 > window.innerWidth) left2 = window.innerWidth - 210;
          if(top2 + 350 > window.innerHeight) top2 = window.innerHeight - 360;
          if(left2 < 10) left2 = 10; if(top2 < 10) top2 = 10;
          els.bdCtxMenu.style.top = top2 + 'px'; 
          els.bdCtxMenu.style.left = left2 + 'px'; 
      },
      
      // Variante de handleRightClick pour usage depuis l'onglet Scénario.
      // Différences vs handleRightClick :
      // - sceneId passé en paramètre (pas state.activeBdSceneId)
      // - pas de check finalisation (l'utilisateur peut dépouiller pendant qu'il écrit)
      // - si scriptBdEnabled === false : return sans preventDefault → clic droit standard du navigateur
      // - pas de Breakdown.init() à la fin (l'onglet Dépouillement n'est pas affiché)
      handleRightClickFromScript: (e, sceneId) => {
          if(e.shiftKey) return; // Shift + clic droit : menu navigateur natif (correction orthographique, copier/coller)
          if(!state.scriptBdEnabled) return; // toggle OFF : laisser le clic droit standard
          if(state.currentRole === 'viewer' || !Permissions.canEdit('depouillement')) return;
          if(!sceneId) return;
          const sel = window.getSelection();
          const text = sel.toString().trim();
          e.preventDefault();
          // Rien de selectionne : meme menu complet que dans l'onglet
          // Depouillement. On aligne temporairement la scene active, dont
          // depend le menu, puis on la restaure a la fermeture.
          if(text.length < 1) {
              const prev = state.activeBdSceneId;
              state.activeBdSceneId = sceneId;
              Breakdown.showAddCategories(sceneId);
              Breakdown._menuAt(e.clientX, e.clientY);
              const rendre = () => { state.activeBdSceneId = prev; document.removeEventListener('click', rendre); };
              setTimeout(() => document.addEventListener('click', rendre), 0);
              return;
          }
          // Texte sélectionné : menu catégories
          els.bdCtxMenu.innerHTML = `<div class="ctx-title">Ajouter à :</div>`;
          CONFIG.bdCategories.forEach(cat => {
              const div = document.createElement('div');
              div.innerText = Utils.catLabel(cat);
              if(cat === 'TECHNICIENS' || cat === 'COMEDIENS') {
                  div.innerHTML = `${Utils.escape(Utils.catLabel(cat))} ▶`;
                  div.style.cursor = 'pointer';
                  div.style.fontWeight = 'bold';
                  const isCrew = cat === 'TECHNICIENS';
                  const dataList = isCrew ? state.data.crew : state.data.actors;
                  const itemLabel = isCrew ? 'technicien' : 'comédien';
                  div.onclick = (ev) => {
                      ev.stopPropagation();
                      // showPersonMenu utilise state.activeBdSceneId en interne ; on le set temporairement
                      state.activeBdSceneId = sceneId;
                      Breakdown.showPersonMenu(cat, text, sel, dataList, itemLabel);
                      // Le set est valable pour la durée de l'interaction de showPersonMenu, on le restaure pas
                      // car les addItem internes utiliseront state.activeBdSceneId. On le restaure quand le menu se ferme.
                      // En pratique, addItem fonctionnera correctement tant que activeBdSceneId pointe sur sceneId.
                  };
              } else {
                  div.onclick = () => {
                      Breakdown.addItemFromScript(sceneId, cat, text);
                      els.bdCtxMenu.style.display = 'none';
                      sel.removeAllRanges();
                  };
              }
              els.bdCtxMenu.appendChild(div);
          });
          els.bdCtxMenu.style.display = 'block';
          let top2 = e.clientY; let left2 = e.clientX;
          if(left2 + 200 > window.innerWidth) left2 = window.innerWidth - 210;
          if(top2 + 350 > window.innerHeight) top2 = window.innerHeight - 360;
          if(left2 < 10) left2 = 10; if(top2 < 10) top2 = 10;
          els.bdCtxMenu.style.top = top2 + 'px';
          els.bdCtxMenu.style.left = left2 + 'px';
      },
      
      // ===================== AJOUT / SUPPRESSION D'ITEMS =====================
      // Variante de addItem qui ne réinitialise PAS l'onglet Dépouillement (pas affiché depuis le scénario)
      addItemFromScript: (sceneId, cat, text) => {
          if(state.currentRole === 'viewer' || !Permissions.canEdit('depouillement')) return;
          const scene = state.data.scenes.find(s => s.id === sceneId);
          if(!scene) return;
          if(!scene.breakdown) scene.breakdown = {};
          if(!scene.breakdown[cat]) scene.breakdown[cat] = [];
          if(scene.breakdown[cat].some(it => Utils.bdSameText(it, text))) {
              Utils.toast(`"${text}" déjà dans ${Utils.catLabel(cat)}`, 'info');
              return;
          }
          scene.breakdown[cat].push(Utils.bdItem(text, cat, Breakdown.linkFor(text, cat)));
          if(cat === 'PERSONNAGES') ScriptEditor.syncCharMeta(text, sceneId);
          if(cat !== 'TECHNICIENS' && cat !== 'PERSONNAGES' && cat !== 'DECORS-LIEUX') {
              Breakdown.autoAddResponsibleCrew(sceneId, cat);
          }
          Store.save();
          Utils.toast(`✓ "${text}" ajouté à ${cat}`, 'success');
      },
      
      // ===== AJOUTER UN ELEMENT SANS PASSER PAR LE SCENARIO (26 aout) =====
      // Tout ce qui est A L'IMAGE n'est pas forcement ECRIT : la voiture garee
      // en arriere-plan, le chien du voisin, la pluie. Le depouillement partait
      // du principe inverse — il fallait selectionner un mot du scenario pour
      // ajouter quoi que ce soit. Deux portes desormais : le ➕ de la colonne
      // des fiches, et le clic droit dans le scenario sans rien selectionner.
      // Ce menu remplace l'ancienne liste « ajouter technicien(s) », qui etait
      // le seul choix offert et ne proposait qu'une des seize categories.
      _menuAt: (x, y) => {
          const m = els.bdCtxMenu;
          m.style.display = 'block';
          let l = x, t = y;
          const h = m.offsetHeight || 320, w = m.offsetWidth || 220;
          if(l + w > window.innerWidth) l = window.innerWidth - w - 10;
          if(t + h > window.innerHeight) t = window.innerHeight - h - 10;
          m.style.left = Math.max(10, l) + 'px';
          m.style.top = Math.max(10, t) + 'px';
      },
      openAddMenu: (ev) => {
          if(ev) ev.stopPropagation();
          if(state.currentRole === 'viewer' || !Permissions.canEdit('depouillement')) return;
          const scene = state.data.scenes.find(s => s.id === state.activeBdSceneId);
          if(!scene) { Utils.toast('Sélectionnez d\u2019abord une scène.', 'info'); return; }
          if(scene.isFinal !== true) { Utils.toast('Finalisez cette scène avant de la dépouiller', 'warning'); return; }
          Breakdown.showAddCategories(scene.id);
          const r = ev && ev.currentTarget && ev.currentTarget.getBoundingClientRect
              ? ev.currentTarget.getBoundingClientRect() : null;
          Breakdown._menuAt(r ? r.left - 180 : 200, r ? r.bottom + 4 : 200);
      },
      showAddCategories: (sceneId) => {
          const m = els.bdCtxMenu;
          m.innerHTML = '<div class="ctx-title">Ajouter à cette scène :</div>';
          CONFIG.bdCategories.forEach(cat => {
              const d = document.createElement('div');
              const kind = Utils.bdKindOf(cat);
              d.innerHTML = `${Utils.escape(Utils.catLabel(cat))} ${kind ? '▶' : '✏️'}`;
              d.onclick = (ev) => { ev.stopPropagation(); Breakdown.showAddChoices(sceneId, cat); };
              m.appendChild(d);
          });
      },
      // Deuxieme etage : les fiches existantes de la famille visee, plus une
      // saisie libre. Les fiches DEJA presentes dans la scene ne sont pas
      // reproposees — les reproposer ferait croire a un ajout qui n'aura pas lieu.
      showAddChoices: (sceneId, cat) => {
          const m = els.bdCtxMenu;
          const esc = Utils.escape;
          const kind = Utils.bdKindOf(cat);
          const scene = state.data.scenes.find(s => s.id === sceneId);
          m.innerHTML = '';
          const back = document.createElement('div');
          back.className = 'ctx-title';
          back.style.cursor = 'pointer';
          back.innerHTML = `◀ ${esc(Utils.catLabel(cat))}`;
          back.onclick = (ev) => { ev.stopPropagation(); Breakdown.showAddCategories(sceneId); };
          m.appendChild(back);
          
          const kinds = Utils.bdKindsFor(cat);
          if(kinds.length) {
              const deja = ((scene && scene.breakdown && scene.breakdown[cat]) || []);
              kinds.forEach(kind => {
                  const coll = Links.COLL[kind];
                  const liste = (state.data[coll] || []).filter(r => r && r.id && Links.label(kind, r.id)
                      && !deja.some(it => String(Utils.bdId(it)) === String(r.id)));
                  // Un intitule de famille n'apparait que si la categorie en
                  // accepte plusieurs : sur COMEDIENS il ne dirait rien.
                  if(kinds.length > 1) {
                      const t = document.createElement('div');
                      t.className = 'ctx-title';
                      t.innerHTML = `${Links.icon(kind)} ${esc(Links.kindLabel(kind))}`;
                      m.appendChild(t);
                  }
                  if((kind === 'crew' || kind === 'actor') && liste.length) {
                      const tous = document.createElement('div');
                      tous.innerText = `⚡ TOUS (${liste.length})`;
                      tous.style.fontWeight = 'bold';
                      tous.style.borderBottom = '2px solid var(--border)';
                      tous.onclick = () => {
                          liste.forEach(r => Breakdown.addItemFiche(sceneId, cat, kind, r.id, true));
                          Store.save();
                          Breakdown.init();
                          Utils.toast(`${liste.length} élément(s) ajouté(s)`, 'success');
                          m.style.display = 'none';
                      };
                      m.appendChild(tous);
                  }
                  liste.slice(0, 60).forEach(r => {
                      const d = document.createElement('div');
                      const hint = Breakdown.ficheHint(r, kind);
                      d.innerHTML = `${esc(Links.label(kind, r.id))}${hint ? ` <small style="color:var(--text-sec)">— ${esc(hint)}</small>` : ''}`;
                      d.onclick = () => {
                          Breakdown.addItemFiche(sceneId, cat, kind, r.id);
                          m.style.display = 'none';
                      };
                      m.appendChild(d);
                  });
                  if(!liste.length) {
                      const v = document.createElement('div');
                      v.innerText = deja.length ? '(déjà toutes dans la scène)' : '(aucune fiche)';
                      v.style.color = 'var(--text-sec)';
                      m.appendChild(v);
                  }
              });
          }
          
          // Saisie libre, toujours disponible : une categorie sans fiche cible
          // (Animaux, Lumiere...) n'a que ce chemin, et une famille qui en a une
          // doit quand meme accepter un element qui n'existe pas encore.
          const zone = document.createElement('div');
          zone.style.cssText = 'padding:6px 8px; border-top:2px solid var(--border); display:flex; gap:6px;';
          zone.onclick = (ev) => ev.stopPropagation();
          zone.innerHTML = `<input type="text" id="bd-add-free" placeholder="${kind ? 'Autre…' : 'Nom'}" data-tooltip="${kind ? 'Autre…' : 'Nom'}" style="flex:1; padding:5px 7px; font-size:0.8rem;">
                            <button style="padding:5px 9px; border:1px solid var(--border); border-radius:5px; background:var(--panel-bg); color:var(--text-main); cursor:pointer;">+</button>`;
          m.appendChild(zone);
          const inp = zone.querySelector('input');
          const valider = () => {
              const t = (inp.value || '').trim();
              if(!t) return;
              Breakdown.addItem(sceneId, cat, t);
              m.style.display = 'none';
          };
          zone.querySelector('button').onclick = valider;
          inp.onkeydown = (ev) => { if(ev.key === 'Enter') { ev.preventDefault(); valider(); } };
          setTimeout(() => { try { inp.focus(); } catch(e) {} }, 30);
      },
      // Ajout par IDENTIFIANT et non par nom : choisir « VALISE » dans la liste
      // doit viser CETTE fiche, pas en rechercher une du meme nom — c'est tout
      // le principe pose en v572.
      addItemFiche: (sceneId, cat, kind, id, silencieux) => {
          if(state.currentRole === 'viewer' || !Permissions.canEdit('depouillement')) return;
          const scene = state.data.scenes.find(s => s.id === sceneId);
          const rec = Links.record(kind, id);
          if(!scene || !rec) return;
          // Le NOM passe par le socle : celui d'une structure ne vit pas
          // toujours dans rec.name mais dans sa fiche normalisee (piege du
          // 25 aout, qui avait deja fait disparaitre la moitie des structures
          // d'un menu deroulant).
          const nom = Links.label(kind, id) || rec.name || '';
          if(!scene.breakdown) scene.breakdown = {};
          if(!scene.breakdown[cat]) scene.breakdown[cat] = [];
          if(scene.breakdown[cat].some(it => String(Utils.bdId(it)) === String(id))) return;
          scene.breakdown[cat].push({ t: nom, k: kind, id: id });
          if(cat === 'PERSONNAGES') ScriptEditor.syncCharMeta(nom, sceneId);
          if(cat !== 'TECHNICIENS' && cat !== 'PERSONNAGES' && cat !== 'DECORS-LIEUX') {
              Breakdown.autoAddResponsibleCrew(sceneId, cat);
          }
          if(silencieux) return;
          Store.save();
          Breakdown.init();
      },
      
      addItem: (sceneId, cat, text) => { 
          if(state.currentRole === 'viewer' || !Permissions.canEdit('depouillement')) return; 
          const scene = state.data.scenes.find(s => s.id === sceneId); 
          if(!scene) return; 
          if(!scene.breakdown) scene.breakdown = {}; 
          if(!scene.breakdown[cat]) scene.breakdown[cat] = []; 
          
          if(!scene.breakdown[cat].some(it => Utils.bdSameText(it, text))) { 
              // Le lien est resolu AVANT l'ajout : linkFor cree la fiche
              // ressource si le nom est inedit et rend son identifiant.
              scene.breakdown[cat].push(Utils.bdItem(text, cat, Breakdown.linkFor(text, cat))); 
              if(cat === "PERSONNAGES") ScriptEditor.syncCharMeta(text, sceneId); 
              
              // Auto-ajouter les techniciens responsables de cette catégorie
              if(cat !== 'TECHNICIENS' && cat !== 'PERSONNAGES' && cat !== 'DECORS-LIEUX') {
                  Breakdown.autoAddResponsibleCrew(sceneId, cat);
              }
              
              Store.save(); 
              Breakdown.init(); 
          } 
      },
      
      // Ajouter un élément sans sauvegarder (pour ajout en masse)
      showMainContextMenu: (text, sel) => {
          els.bdCtxMenu.innerHTML = `<div class="ctx-title">Ajouter à :</div>`; 
          
          CONFIG.bdCategories.forEach(cat => { 
              const div = document.createElement('div'); 
              div.innerText = Utils.catLabel(cat); 
              
              if(cat === 'TECHNICIENS' || cat === 'COMEDIENS') {
                  div.innerHTML = `${Utils.escape(Utils.catLabel(cat))} ▶`;
                  div.style.cursor = 'pointer';
                  div.style.fontWeight = 'bold';
                  
                  const isCrew = cat === 'TECHNICIENS';
                  const dataList = isCrew ? state.data.crew : state.data.actors;
                  const itemLabel = isCrew ? 'technicien' : 'comédien';
                  
                  div.onclick = (ev) => {
                      ev.stopPropagation();
                      Breakdown.showPersonMenu(cat, text, sel, dataList, itemLabel);
                  };
              } else {
                  div.onclick = () => { 
                      Breakdown.addItem(state.activeBdSceneId, cat, text); 
                      els.bdCtxMenu.style.display = 'none'; 
                      if(sel) sel.removeAllRanges(); 
                  };
              }
              
              els.bdCtxMenu.appendChild(div); 
          });
      },
      
      showPersonMenu: (cat, text, sel, dataList, itemLabel) => {
          els.bdCtxMenu.innerHTML = '';
          
          // Créer le titre avec bouton retour (tout cliquable)
          const titleDiv = document.createElement('div');
          titleDiv.className = 'ctx-title';
          titleDiv.style.cssText = 'display:flex; align-items:center; gap:10px; cursor:pointer;';
          titleDiv.innerHTML = `◀ Ajouter ${itemLabel} :`;
          titleDiv.onclick = (ev) => {
              ev.stopPropagation();
              Breakdown.showMainContextMenu(text, sel);
          };
          els.bdCtxMenu.appendChild(titleDiv);
          
          // Option ajouter tous
          const addAllDiv = document.createElement('div');
          addAllDiv.innerText = `⚡ TOUS les ${itemLabel}s`;
          addAllDiv.style.fontWeight = 'bold';
          addAllDiv.style.borderBottom = '2px solid var(--border)';
          addAllDiv.onclick = () => { 
              if(dataList && dataList.length > 0) {
                  dataList.forEach(person => {
                      Breakdown.addItemSilent(state.activeBdSceneId, cat, person.name);
                  });
                  Store.save();
                  Breakdown.init();
              }
              els.bdCtxMenu.style.display = 'none';
          };
          els.bdCtxMenu.appendChild(addAllDiv);
          
          // Liste des personnes
          if(dataList && dataList.length > 0) {
              dataList.forEach(person => {
                  const personDiv = document.createElement('div');
                  personDiv.innerText = `${person.name}${person.role ? ' (' + person.role + ')' : ''}`;
                  personDiv.onclick = () => { 
                      Breakdown.addItem(state.activeBdSceneId, cat, person.name); 
                      els.bdCtxMenu.style.display = 'none';
                  };
                  els.bdCtxMenu.appendChild(personDiv);
              });
          } else {
              const emptyDiv = document.createElement('div');
              emptyDiv.innerText = `(Aucun ${itemLabel})`;
              emptyDiv.style.color = 'var(--text-sec)';
              els.bdCtxMenu.appendChild(emptyDiv);
          }
      },
      
      addItemSilent: (sceneId, cat, text) => {
          const scene = state.data.scenes.find(s => s.id === sceneId);
          if(!scene) return;
          if(!scene.breakdown) scene.breakdown = {};
          if(!scene.breakdown[cat]) scene.breakdown[cat] = [];
          if(!scene.breakdown[cat].some(it => Utils.bdSameText(it, text))) {
              scene.breakdown[cat].push(Utils.bdItem(text, cat, Breakdown.linkFor(text, cat)));
          }
      },
      
      // Auto-ajouter les techniciens responsables d'une catégorie
      autoAddResponsibleCrew: (sceneId, category) => {
          const scene = state.data.scenes.find(s => s.id === sceneId);
          if(!scene) return;
          
          if(!scene.breakdown) scene.breakdown = {};
          if(!scene.breakdown['TECHNICIENS']) scene.breakdown['TECHNICIENS'] = [];
          
          // Trouver les groupes responsables de cette catégorie
          Object.keys(CONFIG.crewToBreakdownMap).forEach(groupId => {
              if(CONFIG.crewToBreakdownMap[groupId].includes(category)) {
                  // Trouver les techniciens de ce groupe
                  const members = state.data.crew.filter(c => c.group_id === groupId);
                  members.forEach(member => {
                      // Ici la fiche est CONNUE (on tient l'objet member) : on
                      // pose son id sans repasser par une recherche par nom.
                      if(!scene.breakdown['TECHNICIENS'].some(it => Utils.bdId(it) === member.id || Utils.bdSameText(it, member.name))) {
                          scene.breakdown['TECHNICIENS'].push(Utils.bdItem(member.name, 'TECHNICIENS', member.id));
                      }
                  });
              }
          });
      },
      
      // ===================== AUDIT DES LIENS (7d) =====================
      // Parcourt tout le depouillement et classe les elements non rattaches en
      // trois cas, parce qu'ils n'appellent pas la meme reponse :
      //   evident  une seule fiche porte ce nom -> rattachable sans rien demander
      //   ambigu   plusieurs fiches portent ce nom -> SEUL l'utilisateur peut
      //            trancher (la valise de la scene 2 ou une autre ?), on n'y
      //            touche pas et on le laisse en orange
      //   absent   aucune fiche -> il faut en creer une
      // Rien n'est modifie ici : c'est un etat des lieux, applique ensuite.
      scanLinks: () => {
          const out = { evident: [], ambigu: [], absent: [], total: 0, lies: 0 };
          (state.data.scenes || []).forEach(sc => {
              if(!sc || !sc.breakdown) return;
              Object.keys(sc.breakdown).forEach(cat => {
                  const kind = Utils.bdKindOf(cat);
                  if(!kind) return; // categorie sans fiche cible : rien a rattacher
                  // v601 : famille hors de ma portee — je ne peux RIEN conclure
                  // sur ses fiches. Ni qu'elles manquent, ni qu'elles sont en
                  // double. On passe : un etat des lieux sur des donnees qu'on
                  // n'a pas est pire que pas d'etat des lieux du tout.
                  if(Links.masquee(kind)) return;
                  const arr = sc.breakdown[cat];
                  if(!Array.isArray(arr)) return;
                  arr.forEach((it, i) => {
                      out.total++;
                      if(Breakdown.lookup(it, cat)) { out.lies++; return; }
                      const text = Utils.bdText(it).trim();
                      if(!text) return;
                      const t = text.toLowerCase();
                      const coll = Breakdown.FICHE_COLL[kind];
                      let cands = (state.data[coll] || []).filter(r => {
                          // Une fiche sans identifiant ne peut pas etre visee :
                          // l'ecarter ici evite d'ecrire un lien vide qui ferait
                          // reapparaitre l'element a chaque controle.
                          if(!r || !r.id) return false;
                          const nameHit = String(r.name || '').trim().toLowerCase() === t
                              || (r.aliases || []).some(a => String(a || '').trim().toLowerCase() === t);
                          if(!nameHit) return false;
                          if(kind === 'resource') {
                              const rc = BD_TO_RESOURCE_CAT[cat];
                              if(rc && r.category !== rc) return false;
                          }
                          return true;
                      });
                      const ref = { sceneId: sc.id, cat, idx: i, kind, text };
                      if(cands.length === 1) { ref.targetId = cands[0].id; out.evident.push(ref); }
                      else if(cands.length > 1) { out.ambigu.push(ref); }
                      else { out.absent.push(ref); }
                  });
              });
          });
          return out;
      },
      
      // Regroupe les ambigus par NOM plutot que par occurrence. Un technicien
      // en double dans l'equipe rend ambigu son nom dans TOUTES les scenes ou il
      // figure : demander cinquante-sept fois la meme chose serait absurde. On
      // demande une fois par nom, la reponse vaut pour toutes ses occurrences.
      groupAmbiguous: (refs) => {
          const groups = new Map();
          (refs || []).forEach(r => {
              const k = r.kind + '|' + (r.kind === 'resource' ? (BD_TO_RESOURCE_CAT[r.cat] || '') + '|' : '') + r.text.toLowerCase();
              if(!groups.has(k)) groups.set(k, { kind: r.kind, cat: r.cat, text: r.text, refs: [] });
              groups.get(k).refs.push(r);
          });
          return Array.from(groups.values());
      },
      
      // Descripteur court d'une fiche, pour que deux homonymes soient
      // distinguables dans la liste : sans lui, choisir entre deux lignes
      // identiques est un tirage au sort.
      ficheHint: (rec, kind) => {
          if(!rec) return '';
          const bits = [];
          if(kind === 'crew' || kind === 'actor') { if(rec.role) bits.push(rec.role); if(rec.email) bits.push(rec.email); }
          if(kind === 'resource') { if(rec.category) bits.push(rec.category); if(rec.owner && rec.owner.name) bits.push(rec.owner.name); }
          if(kind === 'location') { if(rec.realName) bits.push(rec.realName); if(rec.address) bits.push(String(rec.address).slice(0, 30)); }
          if(kind === 'character') { if(rec.gender) bits.push(rec.gender); }
          let n = 0;
          try { n = UI.scenesForFiche(kind, rec.id).length; } catch(e) {}
          bits.push(n ? `déjà sur ${n} scène${n > 1 ? 's' : ''}` : 'sur aucune scène');
          return bits.join(' — ');
      },
      
      reviewAmbiguous: async () => {
          if(state.currentRole === 'viewer' || !Permissions.canEdit('depouillement')) return;
          const groups = Breakdown.groupAmbiguous(Breakdown.scanLinks().ambigu);
          if(!groups.length) { Utils.toast('Plus aucun élément ambigu', 'success'); return; }
          let done = 0, skipped = 0;
          for(let g = 0; g < groups.length; g++) {
              const grp = groups[g];
              const t = grp.text.trim().toLowerCase();
              const coll = Breakdown.FICHE_COLL[grp.kind];
              const cands = (state.data[coll] || []).filter(r => {
                  if(!r || !r.id) return false;
                  const hit = String(r.name || '').trim().toLowerCase() === t
                      || (r.aliases || []).some(a => String(a || '').trim().toLowerCase() === t);
                  if(!hit) return false;
                  if(grp.kind === 'resource') { const rc = BD_TO_RESOURCE_CAT[grp.cat]; if(rc && r.category !== rc) return false; }
                  return true;
              });
              if(cands.length < 2) continue; // resolu entre-temps
              const opts = cands.map(r => `<option value="${Utils.escape(r.id)}">${Utils.escape(r.name || '')} — ${Utils.escape(Breakdown.ficheHint(r, grp.kind))}</option>`).join('');
              const choice = await new Promise(resolve => {
                  const ov = UI.showModal({
                      title: `🔗 ${Utils.escape(grp.text)}  (${g + 1}/${groups.length})`,
                      html: `
                          <div style="text-align:left; font-size:0.88rem; color:var(--text-sec); line-height:1.45; margin-bottom:14px;">
                              <strong style="color:var(--text-main);">${cands.length} fiches ${Utils.escape(Breakdown.FICHE_LABEL[grp.kind] || '')}</strong> portent ce nom : impossible de deviner laquelle est la bonne.
                              Votre choix s'appliquera aux <strong style="color:var(--text-main);">${grp.refs.length} occurrence${grp.refs.length > 1 ? 's' : ''}</strong> de « ${Utils.escape(grp.text)} » dans le dépouillement.
                          </div>
                          <div style="display:block; text-align:left; margin-bottom:6px; font-size:0.85rem; color:var(--text-main); font-weight:600;">Rattacher à :</div>
                          <select id="bdr-pick" style="display:block; box-sizing:border-box; width:100%; padding:8px 9px; border:1px solid var(--border); border-radius:6px; background:var(--bg); color:var(--text-main); font-size:0.88rem;">${opts}</select>
                          <div style="display:block; text-align:left; font-size:0.8rem; color:var(--text-sec); margin-top:10px; line-height:1.4;">
                              Si ces fiches font double emploi, annulez et fusionnez-les d'abord dans leur onglet.
                          </div>
                      `,
                      confirmText: 'Rattacher',
                      cancelText: 'Passer',
                      onConfirm: () => {
                          const sel = document.getElementById('bdr-pick');
                          resolve(sel ? sel.value : null);
                          return true;
                      }
                  });
                  // Fermer sans valider = passer ce nom, sans interrompre la revue.
                  if(ov) {
                      const cancel = ov.querySelector('#um-cancel');
                      if(cancel) cancel.addEventListener('click', () => resolve(null));
                      ov.addEventListener('click', (e) => { if(e.target === ov) resolve(null); });
                  }
              });
              if(!choice) { skipped++; continue; }
              grp.refs.forEach(ref => {
                  const sc = (state.data.scenes || []).find(x => x.id === ref.sceneId);
                  if(!sc || !sc.breakdown || !sc.breakdown[ref.cat]) return;
                  const cur = sc.breakdown[ref.cat][ref.idx];
                  if(!cur || Utils.bdText(cur).trim() !== ref.text) return;
                  sc.breakdown[ref.cat][ref.idx] = { t: Utils.bdText(cur), k: ref.kind, id: choice };
                  done++;
              });
          }
          Store.save();
          Breakdown.init();
          Utils.toast(`${done} rattaché${done > 1 ? 's' : ''}${skipped ? `, ${skipped} nom${skipped > 1 ? 's' : ''} passé${skipped > 1 ? 's' : ''}` : ''}`, 'success');
      },
      
      auditLinks: async () => {
          if(state.currentRole === 'viewer' || !Permissions.canEdit('depouillement')) return;
          const s = Breakdown.scanLinks();
          const nonLies = s.evident.length + s.ambigu.length + s.absent.length;
          if(nonLies === 0) {
              Utils.toast(`Tout est rattaché (${s.lies} élément${s.lies > 1 ? 's' : ''})`, 'success');
              return;
          }
          // Fiches a creer : un nom peut revenir dans plusieurs scenes, on ne
          // fabrique qu'UNE fiche par nom et par famille.
          const uniques = new Map();
          s.absent.forEach(r => {
              const k = r.kind + '|' + (r.kind === 'resource' ? (BD_TO_RESOURCE_CAT[r.cat] || '') + '|' : '') + r.text.toLowerCase();
              if(!uniques.has(k)) uniques.set(k, r);
          });
          const ligne = (n, txt, couleur) => n ? `<div style="display:block; text-align:left; margin-bottom:8px; font-size:0.9rem; color:var(--text-main);"><strong style="color:${couleur};">${n}</strong> ${txt}</div>` : '';
          // Noms distincts a l'origine des ambiguites, avec un apercu : savoir
          // que 57 elements sont ambigus n'aide pas ; savoir que c'est "Sami
          // Touré" en double dans l'equipe permet d'aller corriger la cause.
          const ambGroupes = Breakdown.groupAmbiguous(s.ambigu);
          const ambNoms = ambGroupes.length;
          const ambApercu = ambGroupes.slice(0, 3).map(g => g.text).join(', ') + (ambGroupes.length > 3 ? '…' : '');
          
          const res = await UI.showModal({
              title: '🔗 Éléments sans fiche',
              html: `
                  <div style="text-align:left; font-size:0.88rem; color:var(--text-sec); line-height:1.45; margin-bottom:14px;">
                      Sur ${s.total} éléments dépouillés, ${s.lies} sont rattachés à une fiche.
                  </div>
                  ${Breakdown.famillesMasquees().length ? `<div style="text-align:left; font-size:0.85rem; line-height:1.45; margin-bottom:14px; padding:8px 10px; border-radius:6px; border:1px solid rgba(59,130,246,.45); background:rgba(59,130,246,.10);">
                      Contrôle <strong>partiel</strong> : ${Utils.escape(Breakdown.famillesMasquees().join(', '))} ${Breakdown.famillesMasquees().length > 1 ? 'ne sont pas vérifiés' : 'n\'est pas vérifié'}, vous n'avez pas accès à ${Breakdown.famillesMasquees().length > 1 ? 'ces sections' : 'cette section'} du projet.
                  </div>` : ''}
                  ${ligne(s.evident.length, 'correspondent exactement à une fiche existante.', 'var(--success)')}
                  ${ligne(uniques.size, `noms n'ont aucune fiche (${s.absent.length} occurrence${s.absent.length > 1 ? 's' : ''}).`, '#ef6c00')}
                  ${s.ambigu.length ? `<div style="display:block; text-align:left; margin-bottom:8px; font-size:0.9rem; color:var(--text-main);">
                      <strong style="color:var(--text-sec);">${s.ambigu.length}</strong> sont ambigus : plusieurs fiches portent le même nom.
                      Cela vient de <strong>fiches en double</strong> — ${ambNoms} nom${ambNoms > 1 ? 's' : ''} concerné${ambNoms > 1 ? 's' : ''}${ambApercu ? ` (${Utils.escape(ambApercu)})` : ''}.
                  </div>` : ''}
                  <div style="display:block; text-align:left; margin-top:16px;">
                      ${s.evident.length ? `<div class="bda-opt" data-act="link" style="display:block; text-align:left; padding:11px 13px; border:2px solid var(--primary); border-radius:8px; margin-bottom:9px; cursor:pointer;">
                          <input type="checkbox" id="bda-link" checked style="display:inline-block; width:15px; height:15px; margin:0 8px 0 0; vertical-align:middle;">
                          <span style="display:inline; vertical-align:middle; font-size:0.9rem; color:var(--text-main);">Rattacher les ${s.evident.length} évidents</span>
                      </div>` : ''}
                      ${uniques.size ? `<div class="bda-opt" data-act="create" style="display:block; text-align:left; padding:11px 13px; border:2px solid var(--border); border-radius:8px; margin-bottom:9px; cursor:pointer;">
                          <input type="checkbox" id="bda-create" style="display:inline-block; width:15px; height:15px; margin:0 8px 0 0; vertical-align:middle;">
                          <span style="display:inline; vertical-align:middle; font-size:0.9rem; color:var(--text-main);">Créer les ${uniques.size} fiches manquantes</span>
                      </div>` : ''}
                      ${ambNoms ? `<div class="bda-opt" data-act="review" style="display:block; text-align:left; padding:11px 13px; border:2px solid var(--border); border-radius:8px; cursor:pointer;">
                          <input type="checkbox" id="bda-review" style="display:inline-block; width:15px; height:15px; margin:0 8px 0 0; vertical-align:middle;">
                          <span style="display:inline; vertical-align:middle; font-size:0.9rem; color:var(--text-main);">Passer en revue les ${ambNoms} nom${ambNoms > 1 ? 's' : ''} ambigu${ambNoms > 1 ? 's' : ''}, un par un</span>
                      </div>` : ''}
                  </div>
              `,
              confirmText: 'Appliquer',
              onConfirm: () => {
                  const doLink = document.getElementById('bda-link');
                  const doCreate = document.getElementById('bda-create');
                  const doReview = document.getElementById('bda-review');
                  const wantLink = !!(doLink && doLink.checked);
                  const wantCreate = !!(doCreate && doCreate.checked);
                  const wantReview = !!(doReview && doReview.checked);
                  if(!wantLink && !wantCreate && !wantReview) { Utils.toast('Rien de sélectionné', 'warning'); return false; }
                  let nLink = 0, nNew = 0;
                  const write = (ref, id) => {
                      const sc = (state.data.scenes || []).find(x => x.id === ref.sceneId);
                      if(!sc || !sc.breakdown || !sc.breakdown[ref.cat]) return false;
                      const cur = sc.breakdown[ref.cat][ref.idx];
                      if(!cur || Utils.bdText(cur).trim() !== ref.text) return false; // decale depuis le scan
                      sc.breakdown[ref.cat][ref.idx] = { t: Utils.bdText(cur), k: ref.kind, id };
                      return true;
                  };
                  if(wantLink) s.evident.forEach(r => { if(write(r, r.targetId)) nLink++; });
                  if(wantCreate) {
                      // Une fiche par nom, puis toutes les occurrences de ce nom
                      // pointent vers elle : c'est bien le meme objet.
                      const made = new Map();
                      uniques.forEach((r, k) => {
                          const id = Breakdown.createFiche(r.kind, r.text, r.cat);
                          if(id) { made.set(k, id); nNew++; }
                      });
                      s.absent.forEach(r => {
                          const k = r.kind + '|' + (r.kind === 'resource' ? (BD_TO_RESOURCE_CAT[r.cat] || '') + '|' : '') + r.text.toLowerCase();
                          const id = made.get(k);
                          if(id) write(r, id);
                      });
                  }
                  Store.save();
                  Breakdown.init();
                  if(nLink || nNew) Utils.toast(`${nLink} rattaché${nLink > 1 ? 's' : ''}, ${nNew} fiche${nNew > 1 ? 's' : ''} créée${nNew > 1 ? 's' : ''}`, 'success');
                  // La revue s'ouvre APRES fermeture de cette fenetre, sinon les
                  // deux modales se superposent.
                  if(wantReview) setTimeout(() => Breakdown.reviewAmbiguous(), 250);
                  return true;
              }
          });
          if(res && res.querySelectorAll) {
              res.querySelectorAll('.bda-opt').forEach(b => {
                  const i = b.querySelector('input[type="checkbox"]');
                  const sync = () => { b.style.borderColor = (i && i.checked) ? 'var(--primary)' : 'var(--border)'; };
                  b.addEventListener('click', (ev) => {
                      if(ev.target !== i && i) i.checked = !i.checked;
                      sync();
                  });
                  sync();
              });
          }
          return res;
      },
      
      // ===================== ELEMENT NON LIE : LIER OU CREER (7d) =====================
      // Ouvert par un clic sur un element a pastille orange. Deux issues : le
      // rattacher a une fiche qui existe deja, ou lui en fabriquer une. Le meme
      // ecran sert aux deux cas de figure du chantier : rattraper un
      // depouillement ancien, et lever l'ambiguite quand plusieurs fiches
      // portent le meme nom (la valise de la scene 2 ou une autre valise ?).
      FICHE_COLL: { resource: 'resources', character: 'characters', actor: 'actors', crew: 'crew', location: 'locations' },
      FICHE_LABEL: { resource: 'ressource', character: 'personnage', actor: 'comédien·ne', crew: 'technicien·ne', location: 'décor' },
      resolveItem: async (sceneId, cat, idx) => {
          if(state.currentRole === 'viewer' || !Permissions.canEdit('depouillement')) return;
          const scene = (state.data.scenes || []).find(s => s.id === sceneId);
          if(!scene || !scene.breakdown || !scene.breakdown[cat]) return;
          const item = scene.breakdown[cat][idx];
          if(!item) return;
          const kind = Utils.bdKind(item) || Utils.bdKindOf(cat);
          if(!kind) return;
          // v601 : on ne rattache ni ne cree dans une famille qu'on n'a pas le
          // droit de lire — on ne verrait pas les fiches existantes, donc on en
          // fabriquerait forcement des doublons.
          if(Links.masquee(kind)) {
              Utils.toast('Vous n\'avez pas accès à cette section du projet : demandez à la personne qui gère les accès.', 'info', 7000);
              return;
          }
          const text = Utils.bdText(item);
          const coll = Breakdown.FICHE_COLL[kind];
          const famille = Breakdown.FICHE_LABEL[kind];
          
          // Candidats proposes : meme famille, en remontant en tete ceux qui
          // portent deja ce nom — ce sont les plus probables.
          const t = text.trim().toLowerCase();
          let list = (state.data[coll] || []).slice();
          if(kind === 'resource') {
              const resCat = BD_TO_RESOURCE_CAT[cat];
              if(resCat) list = list.filter(r => r.category === resCat);
          }
          list.sort((a, b) => {
              const sa = String(a.name || '').trim().toLowerCase() === t ? 0 : 1;
              const sb = String(b.name || '').trim().toLowerCase() === t ? 0 : 1;
              return sa - sb || String(a.name || '').localeCompare(String(b.name || ''));
          });
          
          const opts = list.map(r => {
              const same = String(r.name || '').trim().toLowerCase() === t;
              return `<option value="${Utils.escape(r.id)}">${Utils.escape(r.name || 'Sans nom')}${same ? '  (même nom)' : ''}</option>`;
          }).join('');
          
          const res = await UI.showModal({
              title: `🔗 ${Utils.escape(text)}`,
              html: `
                  <div style="text-align:left; font-size:0.88rem; color:var(--text-sec); line-height:1.45; margin-bottom:14px;">
                      Cet élément n'est rattaché à aucune fiche ${Utils.escape(famille)}.
                  </div>
                  ${list.length ? `
                  <div class="bdl-opt" data-mode="link" style="display:block; text-align:left; padding:12px 14px; border:2px solid var(--primary); border-radius:8px; background:var(--panel-bg); cursor:pointer; margin-bottom:10px;">
                      <div style="display:block; text-align:left; white-space:nowrap;">
                          <input type="radio" name="bdl-mode" value="link" checked style="display:inline-block; width:15px; height:15px; margin:0 8px 0 0; vertical-align:middle;">
                          <span style="display:inline; font-weight:600; font-size:0.94rem; color:var(--text-main); vertical-align:middle; white-space:normal;">Rattacher à une fiche existante</span>
                      </div>
                      <select id="bd-link-target" style="display:block; box-sizing:border-box; width:100%; margin-top:9px; padding:7px 9px; border:1px solid var(--border); border-radius:6px; background:var(--bg); color:var(--text-main); font-size:0.88rem;">${opts}</select>
                  </div>` : ''}
                  <div class="bdl-opt" data-mode="new" style="display:block; text-align:left; padding:12px 14px; border:2px solid ${list.length ? 'var(--border)' : 'var(--primary)'}; border-radius:8px; background:var(--panel-bg); cursor:pointer;">
                      <div style="display:block; text-align:left; white-space:nowrap;">
                          <input type="radio" name="bdl-mode" value="new" ${list.length ? '' : 'checked'} style="display:inline-block; width:15px; height:15px; margin:0 8px 0 0; vertical-align:middle;">
                          <span style="display:inline; font-weight:600; font-size:0.94rem; color:var(--text-main); vertical-align:middle; white-space:normal;">Créer une nouvelle fiche</span>
                      </div>
                      <div style="display:block; text-align:left; font-size:0.8rem; color:var(--text-sec); margin:6px 0 0 23px; white-space:normal;">Fiche ${Utils.escape(famille)} vierge nommée « ${Utils.escape(text)} »</div>
                  </div>
              `,
              confirmText: 'Valider',
              onConfirm: () => {
                  const mode = document.querySelector('input[name="bdl-mode"]:checked');
                  const wantCreate = !mode || mode.value === 'new';
                  const sel = document.getElementById('bd-link-target');
                  const targetId = (!wantCreate && sel) ? sel.value : '';
                  if(!wantCreate && !targetId) { Utils.toast('Choisissez une fiche', 'warning'); return false; }
                  const newId = wantCreate ? Breakdown.createFiche(kind, text, cat) : targetId;
                  if(!newId) { Utils.toast('Création impossible', 'error'); return false; }
                  // Ecriture ciblee sur l'element, sans toucher au reste du
                  // depouillement ni au texte affiche.
                  const cur = scene.breakdown[cat][idx];
                  scene.breakdown[cat][idx] = { t: Utils.bdText(cur), k: kind, id: newId };
                  Store.save();
                  Breakdown.init();
                  Utils.toast(wantCreate ? 'Fiche créée et rattachée' : 'Élément rattaché', 'success');
                  return true;
              }
          });
          // Un bloc de code pose par innerHTML n'est jamais execute par le
          // navigateur : on branche donc ici le comportement des deux cadres,
          // qui se selectionnent au clic n'importe ou dans leur surface.
          if(res && res.querySelectorAll) {
              const boxes = res.querySelectorAll('.bdl-opt');
              const sync = () => boxes.forEach(b => {
                  const i = b.querySelector('input[name="bdl-mode"]');
                  b.style.borderColor = (i && i.checked) ? 'var(--primary)' : 'var(--border)';
              });
              boxes.forEach(b => {
                  b.addEventListener('click', (ev) => {
                      // Cliquer DANS le menu deroulant ne doit pas etre avale par
                      // le cadre, sinon le menu ne s'ouvre jamais.
                      if(ev.target && ev.target.tagName === 'SELECT') return;
                      const i = b.querySelector('input[name="bdl-mode"]');
                      if(i) { i.checked = true; sync(); }
                  });
              });
              const selEl = res.querySelector('#bd-link-target');
              if(selEl) selEl.addEventListener('focus', () => {
                  const r = res.querySelector('input[name="bdl-mode"][value="link"]');
                  if(r) { r.checked = true; sync(); }
              });
              sync();
          }
          return res;
      },
      
      // Fabrique une fiche vierge portant ce nom et rend son identifiant.
      // Les structures sont reprises telles quelles des createurs de chaque
      // onglet : une fiche creee ici doit etre indiscernable d'une fiche creee
      // a la main, sous peine de champs manquants a l'affichage.
      //
      // 31 aout — DEUX BUGS CORRIGES ICI, A L'ORIGINE DES DOUBLONS CONSTATES
      // dans « Rencontre sous les Caraibes » :
      //   1. l'identifiant valait 'act_' + Date.now(). Depouiller plusieurs
      //      noms d'un coup fabriquait donc plusieurs fiches DANS LA MEME
      //      MILLISECONDE, et toutes recevaient le MEME identifiant. Sept
      //      comediens partageaient ainsi act_1787582855026 : l'application ne
      //      pouvait plus les distinguer, et toute liaison vers l'un d'eux
      //      pointait sur les sept. Utils.generateUniqueId ajoute un suffixe
      //      aleatoire et existait deja ; autoCreateResource, juste en dessous,
      //      s'en servait correctement. Seul ce bloc l'ignorait.
      //   2. aucune recherche prealable : depouiller « ALIX BERGER » creait un
      //      SECOND personnage alors que char_alix existait. La aussi,
      //      autoCreateResource faisait deja le bon geste (chercher, puis
      //      creer seulement si rien ne correspond). On l'applique aux quatre
      //      autres familles, en comparant les noms sans casse ni espaces
      //      superflus.
      createFiche: (kind, name, cat) => {
          const nm = String(name || '').trim();
          if(!nm) return null;
          if(kind === 'resource') return Breakdown.autoCreateResource(nm, cat);
          
          // Fiche portant deja ce nom ? On rend la sienne plutot que d'en
          // fabriquer une seconde.
          const COLL = { character: 'characters', location: 'locations', actor: 'actors', crew: 'crew' };
          const coll = COLL[kind];
          if(!coll) return null;
          const cible = nm.toLowerCase();
          const deja = (state.data[coll] || []).find(x => x && String(x.name || '').trim().toLowerCase() === cible);
          if(deja) return deja.id;
          
          if(kind === 'character') {
              const c = { id: 'char_' + Utils.generateUniqueId(), name: nm, bio: '', group_id: '', gender: '' };
              (state.data.characters = state.data.characters || []).push(c);
              History.log('ADD', `Ajout personnage : ${nm}`, { target: { kind: 'character', id: c.id, label: nm }, link: { kind: 'character', id: c.id } });
              return c.id;
          }
          if(kind === 'location') {
              const up = nm.toUpperCase();
              const l = { id: 'loc_' + Utils.generateUniqueId(), name: up, desc: '', group_id: '', realName: '', address: '', contactName: '', contactPhone: '', accessNotes: '', galleryPhotos: [] };
              (state.data.locations = state.data.locations || []).push(l);
              History.log('ADD', `Ajout décor : ${up}`, { target: { kind: 'location', id: l.id, label: up }, link: { kind: 'location', id: l.id } });
              return l.id;
          }
          if(kind === 'actor') {
              const a = { id: 'act_' + Utils.generateUniqueId(), name: nm, gender: '', bio: '', email: '', phone: '', address: '', city: '', website: '', photo: '', group_id: '', hasVehicle: false, vehicleType: '', vehiclePlate: '', vehicleSeats: '', vehicleTrunk: false, vehicleNotes: '', salaryGross: '', salaryNet: '', salaryBudget: '', dailyRate: '', rateCurrency: '€', rateType: 'Jour', availabilityText: '', availabilityDates: [], color: '', height: '', weight: '', age: '', eyeColor: '', hairColor: '', hairLength: '', ethnicity: '', corpulence: '', sports: '', languages: '', demoreel: '', galleryPhotos: [] };
              (state.data.actors = state.data.actors || []).push(a);
              History.log('ADD', `Ajout comédien : ${nm}`, { target: { kind: 'actor', id: a.id, label: nm }, link: { kind: 'actor', id: a.id } });
              return a.id;
          }
          if(kind === 'crew') {
              const m = { id: 'crew_' + Utils.generateUniqueId(), name: nm, gender: '', role: '', email: '', phone: '', address: '', city: '', photo: '', hasVehicle: false, vehicleType: '', vehiclePlate: '', vehicleSeats: '', vehicleTrunk: false, vehicleNotes: '', availabilityText: '', availabilityDates: [], salaryGross: '', salaryNet: '', salaryBudget: '', dailyRate: '', rateCurrency: '€', rateType: 'Jour', notes: '', group_id: '', demoreel: '', galleryPhotos: [] };
              (state.data.crew = state.data.crew || []).push(m);
              History.log('ADD', `Ajout technicien : ${nm}`, { target: { kind: 'crew', id: m.id, label: nm }, link: { kind: 'crew', id: m.id } });
              return m.id;
          }
          return null;
      },
      
      // Auto-créer une fiche Ressource depuis le dépouillement.
      // RETOURNE l'id de la fiche (creee ou deja existante) : c'est lui que
      // l'element dépouillé memorise. Sans cette valeur de retour, le lien
      // devrait etre retrouve par comparaison de nom — exactement ce que ce
      // chantier supprime.
      autoCreateResource: (text, bdCategory) => {
          if(!state.data.resources) state.data.resources = [];
          
          // Mapper la catégorie du dépouillement vers la catégorie ressource
          const resCategory = BD_TO_RESOURCE_CAT[bdCategory];
          if(!resCategory) return null;
          
          const t = String(text == null ? '' : text).trim().toLowerCase();
          if(!t) return null;
          
          // Fiche portant deja ce nom (ou cet alias) DANS LA MEME CATEGORIE :
          // une "valise" accessoire et une "valise" costume sont deux fiches.
          const found = state.data.resources.find(r => 
              r.category === resCategory && (
                  String(r.name || '').toLowerCase() === t ||
                  (r.aliases || []).some(a => String(a || '').toLowerCase() === t)
              )
          );
          if(found) return found.id;
          
          const nid = 'res_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
          state.data.resources.push({
              id: nid,
              name: text,
              category: resCategory,
              photo: '',
              description: '',
              note: '',
              owner: null,
              aliases: [],
              autoCreated: true
          });
          return nid;
      },
      
      // Fiche reellement visee par un element depouille, ou null.
      // Retourne { kind, rec } — rec est l'objet de state.data, jamais une copie.
      // Un element porteur d'un id dont la fiche a disparu revient null : il
      // s'affichera comme non lie, ce qui est la verite.
      lookup: (item, cat) => {
          const kind = Utils.bdKind(item) || Utils.bdKindOf(cat);
          if(!kind) return null;
          const id = Utils.bdId(item);
          if(!id) return null;
          // Le socle connait les onze familles : s'y adosser evite d'oublier
          // une collection ici (c'est ce qui laissait les vehicules de regie
          // et les structures hors du depouillement).
          const rec = Links.record(kind, id);
          if(rec) return { kind, rec };
          // v601 : la fiche est peut-etre la, simplement hors de ma portee.
          // L'element PORTE un identifiant : le lien existe, je ne peux pas le
          // suivre. Le dire « non rattache » serait faux et pousserait a creer
          // un doublon de ce qui existe deja.
          if(Links.masquee(kind)) return { kind, rec: null, masque: true };
          return null;
      },
      
      // Identifiant de fiche a rattacher a un element qu'on vient de depouiller.
      // Les RESSOURCES sont creees a la volee si le nom est inedit (choix
      // produit : dépouiller un accessoire suffit a le faire exister dans
      // l'inventaire). Les cinq autres familles ne creent JAMAIS de fiche —
      // ecrire "MARIE" dans une scene ne doit pas fabriquer un personnage, un
      // comedien ou un technicien a l'insu de l'utilisateur : on se contente de
      // rattacher si la fiche existe deja, sinon l'element reste libre et
      // s'affichera comme non lie.
      linkFor: (text, cat) => {
          const kind = Utils.bdKindOf(cat);
          if(!kind) return null;
          const t = String(text == null ? '' : text).trim().toLowerCase();
          if(!t) return null;
          if(kind === 'resource') return Breakdown.autoCreateResource(text, cat);
          const byName = (arr) => {
              const f = (arr || []).find(x => String(x && x.name || '').trim().toLowerCase() === t);
              return f ? f.id : null;
          };
          if(kind === 'character') return byName(state.data.characters);
          if(kind === 'actor')     return byName(state.data.actors);
          if(kind === 'crew')      return byName(state.data.crew);
          if(kind === 'location')  return byName(state.data.locations);
          return null;
      },
      
      removeItem: async (sceneId, cat, idx, e) => { 
          if(e) e.stopPropagation(); 
          if(state.currentRole === 'viewer' || !Permissions.canEdit('depouillement')) return; 
          const scene = state.data.scenes.find(s => s.id === sceneId); 
          if(!scene || !scene.breakdown || !scene.breakdown[cat]) return;
          
          const removed = scene.breakdown[cat][idx];
          const itemName = Utils.bdText(removed);
          const removedId = Utils.bdId(removed);
          
          // Vérifier si c'est une ressource (ACCESSOIRES, COSTUMES, VEHICULES)
          if(cat === 'ACCESSOIRES' || cat === 'COSTUMES' || cat === 'VEHICULES') {
              const resCat = BD_TO_RESOURCE_CAT[cat];
              const resource = removedId
                  ? (state.data.resources || []).find(r => r.id === removedId)
                  : (state.data.resources || []).find(r => 
                        r.category === resCat && (r.name.toLowerCase() === itemName.toLowerCase() || (r.aliases || []).some(a => a.toLowerCase() === itemName.toLowerCase()))
                    );
              
              if(resource) {
                  // Derniere occurrence ? On compte les occurrences de LA FICHE,
                  // pas du mot : une autre valise portant le meme nom mais liee a
                  // une autre fiche ne doit pas empecher la proposition.
                  let count = 0;
                  state.data.scenes.forEach(s => {
                      if(s.breakdown && s.breakdown[cat]) {
                          s.breakdown[cat].forEach(item => {
                              const id = Utils.bdId(item);
                              const same = id ? (id === resource.id)
                                              : (!removedId && Utils.bdText(item).toLowerCase() === itemName.toLowerCase());
                              if(same) count++;
                          });
                      }
                  });
                  
                  if(count <= 1) {
                      // v602 (audit) : UI.confirmModal n'existait pas — l'appel levait
                      // une erreur et l'element ne se retirait JAMAIS de la scene.
                      const deleteResource = await ConfirmModal.show({
                          title: '🗑️ Supprimer aussi la fiche Ressource ?',
                          message: `"${Utils.escape(itemName)}" n'apparaît plus dans aucune scène. Voulez-vous aussi supprimer la fiche Ressource associée ?`,
                          confirmText: 'Supprimer la fiche',
                          cancelText: 'Garder la fiche',
                          type: 'warning'
                      });
                      
                      if(deleteResource) {
                          state.data.resources = state.data.resources.filter(r => r.id !== resource.id);
                      }
                  }
              }
          }
          
          scene.breakdown[cat].splice(idx, 1); 
          Store.save(); 
          Breakdown.init(); 
      },
      
      // ========== EXPORT PDF DÉPOUILLEMENT ==========
      exportPDF: (opts = {}) => BreakdownExport.exportPDF(opts)
  };
